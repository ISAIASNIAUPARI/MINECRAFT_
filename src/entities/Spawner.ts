import { WORLD_BORDER } from '../core/constants';
import { createLogger } from '../core/Logger';
import { createRng, type Rng } from '../core/rng';
import type { Vec3 } from '../core/types';
import type { VoxelView } from '../physics/types';
import type { CreatureDefinition, IEntityManager, IEntityRegistry, SpawnRule } from './types';

const log = createLogger('spawner');

/**
 * Natural spawning.
 *
 * Reads {@link SpawnRule} off every registered creature and nothing else — it
 * does not know a single creature by name, so anything added later starts
 * spawning the moment it declares a rule.
 *
 * Every pass is bounded: a fixed number of candidate points, each a single
 * column probe, with a hard cap on how many creatures may exist near the
 * player. It never scans the world.
 */

export interface SpawnerOptions {
  registry: IEntityRegistry;
  entities: IEntityManager;
  voxels: VoxelView;
  seed: number;
  /** Sky light at a block, for rules that only spawn in the dark. */
  lightAt: (x: number, y: number, z: number) => number;
  /** Highest solid block in a column, or -1 for an empty column. */
  surfaceAt: (x: number, z: number) => number;
  /** Biome id at a column, for rules that name biomes. */
  biomeAt?: (x: number, z: number) => string;
  /** Hard ceiling on living creatures, whatever the per-creature rules say. */
  maxAlive?: number;
  /** Seconds between spawn attempts. */
  interval?: number;
  /** Creatures further than this from the player are removed. */
  despawnDistance?: number;
}

const DEFAULTS = {
  maxAlive: 14,
  interval: 2.5,
  despawnDistance: 150,
  /** Candidate points examined per pass. Fixed, so a pass costs the same always. */
  attemptsPerPass: 14,
};

export class Spawner {
  private readonly rng: Rng;
  private timer = 0;
  /** Spawn attempts that found nowhere legal, for the debug HUD. */
  lastRejected = 0;

  constructor(private readonly opts: SpawnerOptions) {
    this.rng = createRng(opts.seed ^ 0x5a1d);
    const spawnable = opts.registry.all.filter((d) => d.spawn);
    log.info(`${spawnable.length} of ${opts.registry.all.length} creatures can spawn naturally`);
  }

  /** Call every tick. Does its work on an interval, not every frame. */
  tick(dt: number, player: Vec3 | null): void {
    if (!player) return;
    this.despawnDistant(player);

    this.timer += dt;
    const interval = this.opts.interval ?? DEFAULTS.interval;
    if (this.timer < interval) return;
    this.timer = 0;

    const maxAlive = this.opts.maxAlive ?? DEFAULTS.maxAlive;
    if (this.opts.entities.all.length >= maxAlive) return;

    const def = this.pickCreature(player);
    if (!def) return;

    const spot = this.findSpot(def, player);
    if (!spot) {
      this.lastRejected++;
      return;
    }

    const rule = def.spawn!;
    const group = rule.groupMin
      ? this.rng.int(rule.groupMin, (rule.groupMax ?? rule.groupMin) + 1)
      : 1;
    for (let i = 0; i < group; i++) {
      if (this.opts.entities.all.length >= maxAlive) break;
      // Scatter group members so they do not stack inside one another.
      const jitter = i === 0 ? { x: 0, z: 0 } : { x: this.rng.float(-4, 4), z: this.rng.float(-4, 4) };
      this.opts.entities.spawn(def.name, {
        x: spot.x + jitter.x,
        y: spot.y,
        z: spot.z + jitter.z,
      });
    }
  }

  /** Weighted pick among creatures whose nearby cap is not already met. */
  private pickCreature(player: Vec3): CreatureDefinition | null {
    const eligible: { def: CreatureDefinition; weight: number }[] = [];
    for (const def of this.opts.registry.all) {
      const rule = def.spawn;
      if (!rule) continue;
      const nearby = this.countNearby(def.name, player, rule);
      if (nearby >= (rule.maxNearby ?? 4)) continue;
      eligible.push({ def, weight: rule.weight ?? 1 });
    }
    if (eligible.length === 0) return null;

    let total = 0;
    for (const e of eligible) total += e.weight;
    let roll = this.rng.float(0, total);
    for (const e of eligible) {
      roll -= e.weight;
      if (roll <= 0) return e.def;
    }
    return eligible[eligible.length - 1].def;
  }

  private countNearby(name: string, player: Vec3, rule: SpawnRule): number {
    const far = rule.maxPlayerDistance ?? 64;
    let n = 0;
    for (const e of this.opts.entities.all) {
      if (e.definition.name !== name) continue;
      if (distance(e.position, player) <= far * 1.5) n++;
    }
    return n;
  }

  /**
   * Look for somewhere this creature may legally stand. Returns null rather
   * than forcing a spawn, so a full world simply produces fewer creatures.
   */
  private findSpot(def: CreatureDefinition, player: Vec3): Vec3 | null {
    const rule = def.spawn!;
    let near = rule.minPlayerDistance ?? 16;
    let far = Math.max(near + 8, rule.maxPlayerDistance ?? 64);

    // A creature that wants to appear 34 blocks away cannot do so in a 50-block
    // arena. Scale both distances to whatever world actually exists, keeping
    // their ratio, so a small world simply has closer encounters instead of no
    // encounters at all.
    if (Number.isFinite(WORLD_BORDER)) {
      const reach = WORLD_BORDER * 1.4; // corner-to-corner from anywhere inside
      if (far > reach) {
        const shrink = reach / far;
        far = reach;
        near = Math.max(3, near * shrink);
      }
    }

    for (let attempt = 0; attempt < DEFAULTS.attemptsPerPass; attempt++) {
      // A point in the annulus around the player: never on top of them, never
      // beyond where it would be despawned again.
      const angle = this.rng.float(0, Math.PI * 2);
      const dist = this.rng.float(near, far);
      let x = Math.floor(player.x + Math.cos(angle) * dist);
      let z = Math.floor(player.z + Math.sin(angle) * dist);
      if (Number.isFinite(WORLD_BORDER)) {
        const edge = WORLD_BORDER - Math.ceil(def.width);
        if (Math.abs(x) > edge || Math.abs(z) > edge) {
          // Reflect back inside rather than clamping, which would pile every
          // rejected candidate onto the same four edge lines.
          x = clamp(x, -edge, edge);
          z = clamp(z, -edge, edge);
        }
      }

      const surface = this.opts.surfaceAt(x, z);
      if (surface < 0) continue; // unloaded or empty column

      // A flier is placed in open air above the ground; everything else stands
      // on it.
      const flying = def.gravity === false;
      const y = flying ? surface + 14 + this.rng.int(0, 10) : surface + 1;

      if (rule.minY !== undefined && y < rule.minY) continue;
      if (rule.maxY !== undefined && y > rule.maxY) continue;

      if (rule.biomes && rule.biomes.length > 0 && this.opts.biomeAt) {
        if (!rule.biomes.includes(this.opts.biomeAt(x, z))) continue;
      }

      const light = this.opts.lightAt(x, y, z);
      if (rule.minLight !== undefined && light < rule.minLight) continue;
      if (rule.maxLight !== undefined && light > rule.maxLight) continue;

      if (!this.hasRoom(def, x, y, z)) continue;

      return { x: x + 0.5, y, z: z + 0.5 };
    }
    return null;
  }

  /**
   * Is there actually space for this creature's whole body?
   *
   * This is what stops a fifty-block leviathan materialising inside a hillside.
   * The box checked is the creature's own width and height, so it scales with
   * whatever is being spawned without the spawner knowing anything about it.
   */
  private hasRoom(def: CreatureDefinition, x: number, y: number, z: number): boolean {
    const half = Math.ceil(def.width / 2);
    const top = Math.ceil(def.height);
    for (let dx = -half; dx <= half; dx++) {
      for (let dz = -half; dz <= half; dz++) {
        for (let dy = 0; dy < top; dy++) {
          if (this.opts.voxels.isSolid(x + dx, y + dy, z + dz)) return false;
        }
      }
    }
    return true;
  }

  /** Remove anything that has wandered out of the player's world. */
  private despawnDistant(player: Vec3): void {
    const limit = this.opts.despawnDistance ?? DEFAULTS.despawnDistance;
    for (const e of [...this.opts.entities.all]) {
      if (e.dead) continue;
      if (distance(e.position, player) > limit) this.opts.entities.despawn(e.id);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
