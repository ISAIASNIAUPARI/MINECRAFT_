import { createLogger } from '../core/Logger';
import { createRng, type Rng } from '../core/rng';
import type { Vec3 } from '../core/types';
import type { IEntityManager } from '../entities/types';
import { raycastVoxel } from '../physics/raycast';
import type { VoxelView } from '../physics/types';
import type {
  IWeaponSystem,
  ShotResult,
  WeaponDefinition,
  WeaponInput,
  WeaponState,
} from './types';

const log = createLogger('weapons');

/** How fast camera recoil decays back to centre, per second. */
const RECOIL_RECOVERY = 7.5;
/** Seconds the muzzle flash stays visible. Deliberately brief. */
export const MUZZLE_FLASH_SECONDS = 0.045;

export interface WeaponSystemOptions {
  /** The weapon catalogue. */
  weapons: readonly WeaponDefinition[];
  /** Voxels to trace against. */
  voxels: VoxelView;
  /** Creatures a bullet can hit. */
  entities: IEntityManager;
  seed: number;
  /** Called for every shot, after the trace resolves. */
  onShot?: (result: ShotResult, def: WeaponDefinition) => void;
}

/**
 * Owns a held weapon: its ammunition, its reload, its aim, its recoil, and the
 * hitscan each shot performs.
 *
 * It never touches the viewmodel. Rendering reads {@link state} and the
 * animation channels, which keeps firing logic testable without a canvas.
 */
export class WeaponSystem implements IWeaponSystem {
  private readonly byName = new Map<string, WeaponDefinition>();
  private readonly rng: Rng;

  private def: WeaponDefinition | null = null;
  private ammo = 0;
  private reloadLeft = 0;
  private cooldown = 0;
  private adsValue = 0;
  private recoilP = 0;
  private recoilY = 0;
  /** Prevents a held trigger from auto-firing a semi-automatic weapon. */
  private triggerWasDown = false;

  /** Seconds left of muzzle flash, read by the viewmodel. */
  flashLeft = 0;
  /** 1 at the instant of a shot, decaying — drives the viewmodel kick. */
  fireKick = 0;
  /** Seconds the weapon has been equipped. */
  age = 0;
  /** Set for one tick when a case should be ejected. */
  ejectedThisTick = false;

  constructor(private readonly opts: WeaponSystemOptions) {
    for (const w of opts.weapons) this.byName.set(w.name, w);
    this.rng = createRng(opts.seed ^ 0x5eed);
    log.info(`loaded ${this.byName.size} weapons`);
  }

  get state(): WeaponState | null {
    if (!this.def) return null;
    return {
      definition: this.def,
      ammo: this.ammo,
      reloading: this.reloadLeft > 0,
      ads: this.adsValue,
      recoilPitch: this.recoilP,
      recoilYaw: this.recoilY,
    };
  }

  equip(name: string): boolean {
    const def = this.byName.get(name);
    if (!def) return false;
    this.def = def;
    this.ammo = def.magazineSize;
    this.reloadLeft = 0;
    this.cooldown = 0;
    this.age = 0;
    this.adsValue = 0;
    return true;
  }

  reload(): void {
    if (!this.def || this.reloadLeft > 0) return;
    if (this.ammo >= this.def.magazineSize) return;
    this.reloadLeft = this.def.reloadSeconds;
  }

  /** 0..1 through the current reload, 0 when not reloading. */
  get reloadProgress(): number {
    if (!this.def || this.reloadLeft <= 0) return 0;
    return 1 - this.reloadLeft / this.def.reloadSeconds;
  }

  tick(input: WeaponInput, dt: number): void {
    const def = this.def;
    this.ejectedThisTick = false;
    if (!def) return;

    this.age += dt;
    // The cooldown is allowed to go negative and the remainder is carried into
    // the next shot. Clamping it at zero quantises the fire rate to the tick
    // rate — a 9 rounds/second weapon fired at 6.7 on a 20 Hz tick, because a
    // 0.111 s interval always cost three 0.05 s ticks. The floor of one whole
    // interval stops a long pause from banking a burst.
    const interval = 1 / Math.max(def.fireRate, 1e-3);
    this.cooldown = Math.max(-interval, this.cooldown - dt);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.fireKick = Math.max(0, this.fireKick - dt * 6);

    // --- aim ------------------------------------------------------------
    // Aiming is cancelled by a reload: you cannot sight down a weapon you are
    // feeding, and it keeps the two animations from fighting over the pose.
    const wantAds = input.aiming && this.reloadLeft <= 0;
    const adsStep = dt / Math.max(def.adsSeconds, 1e-3);
    this.adsValue = clamp01(this.adsValue + (wantAds ? adsStep : -adsStep));

    // --- reload -----------------------------------------------------------
    if (input.reloadPressed) this.reload();
    if (this.reloadLeft > 0) {
      this.reloadLeft = Math.max(0, this.reloadLeft - dt);
      if (this.reloadLeft === 0) this.ammo = def.magazineSize;
    }

    // --- recoil recovery --------------------------------------------------
    const recover = Math.exp(-RECOIL_RECOVERY * dt);
    this.recoilP *= recover;
    this.recoilY *= recover;

    // --- trigger ----------------------------------------------------------
    const pull = input.firing && (!def.semiAuto || !this.triggerWasDown);
    this.triggerWasDown = input.firing;

    if (pull && this.reloadLeft <= 0 && this.cooldown <= 0) {
      if (this.ammo <= 0) {
        // Dry: start a reload rather than doing nothing, and rate-limit it so
        // holding the trigger on empty does not spam.
        this.cooldown = 0.25;
        this.reload();
      } else {
        this.fire(def, input);
      }
    }
  }

  private fire(def: WeaponDefinition, input: WeaponInput): void {
    this.ammo--;
    // Add rather than assign, so the overshoot from this tick is not lost.
    this.cooldown += 1 / Math.max(def.fireRate, 1e-3);
    this.flashLeft = MUZZLE_FLASH_SECONDS;
    this.fireKick = 1;
    this.ejectedThisTick = true;

    // Camera kick: always up, sideways either way, and lighter while aimed.
    const aimed = 1 - this.adsValue * 0.45;
    this.recoilP += def.recoilPitch * aimed;
    this.recoilY += this.rng.float(-def.recoilYaw, def.recoilYaw) * aimed;

    // Spread narrows as the sights come up — the whole reason to aim.
    const spread = lerp(def.spreadHip, def.spreadAds, this.adsValue);
    const dir = this.scatter(input.direction, spread);

    const result = this.trace(input.origin, dir, def);
    this.opts.onShot?.(result, def);
  }

  /** Jitter a direction inside a cone of `spread` radians. */
  private scatter(dir: Vec3, spread: number): Vec3 {
    if (spread <= 0) return dir;
    // Build any two axes perpendicular to the aim, then offset within them.
    const up: Vec3 = Math.abs(dir.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const rx = dir.y * up.z - dir.z * up.y;
    const ry = dir.z * up.x - dir.x * up.z;
    const rz = dir.x * up.y - dir.y * up.x;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const ux = (ry * dir.z - rz * dir.y) / rl;
    const uy = (rz * dir.x - rx * dir.z) / rl;
    const uz = (rx * dir.y - ry * dir.x) / rl;

    const angle = this.rng.float(0, Math.PI * 2);
    // sqrt keeps the scatter uniform across the cone instead of clumping centre.
    const radius = Math.sqrt(this.rng.next()) * spread;
    const ca = Math.cos(angle) * radius;
    const sa = Math.sin(angle) * radius;

    const x = dir.x + (rx / rl) * ca + ux * sa;
    const y = dir.y + (ry / rl) * ca + uy * sa;
    const z = dir.z + (rz / rl) * ca + uz * sa;
    const len = Math.hypot(x, y, z) || 1;
    return { x: x / len, y: y / len, z: z / len };
  }

  /**
   * Hitscan. Creatures are checked first along the ray so a bullet cannot pass
   * through one to hit the wall behind it.
   */
  private trace(origin: Vec3, dir: Vec3, def: WeaponDefinition): ShotResult {
    const blockHit = raycastVoxel(this.opts.voxels, origin, dir, def.range, (id) => id !== 0);
    const blockDist = blockHit ? blockHit.distance : Infinity;

    // Step the ray and test entity boxes. Coarse on purpose: a creature is at
    // least half a block wide, so half-block steps cannot tunnel through one.
    let best: { id: number; dist: number } | null = null;
    const step = 0.5;
    const limit = Math.min(def.range, blockDist);
    for (let d = 0.5; d <= limit; d += step) {
      const px = origin.x + dir.x * d;
      const py = origin.y + dir.y * d;
      const pz = origin.z + dir.z * d;
      const box = { minX: px, minY: py, minZ: pz, maxX: px, maxY: py, maxZ: pz };
      const hits = this.opts.entities.query(box);
      if (hits.length > 0) {
        best = { id: hits[0].id, dist: d };
        break;
      }
    }

    if (best) {
      const target = this.opts.entities.all.find((e) => e.id === best!.id);
      target?.hurt(def.damage, origin);
      return {
        block: null,
        entityId: best.id,
        point: {
          x: origin.x + dir.x * best.dist,
          y: origin.y + dir.y * best.dist,
          z: origin.z + dir.z * best.dist,
        },
      };
    }

    if (blockHit) {
      return { block: { ...blockHit.block }, entityId: null, point: { ...blockHit.point } };
    }
    return { block: null, entityId: null, point: null };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
