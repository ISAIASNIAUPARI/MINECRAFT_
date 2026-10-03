import { describe, expect, it } from 'vitest';
import { EntityManager, EntityRegistry, registerCoreCreatures } from '../src/entities';
import type { VoxelView } from '../src/physics/types';
import { CORE_WEAPONS, SERVICE_RIFLE, WeaponSystem, type ShotResult, type WeaponInput } from '../src/weapons';

/** Empty world: nothing to stop a bullet. */
const emptyVoxels: VoxelView = { getBlock: () => 0, isSolid: () => false };
/** A wall of stone at z <= -10. */
const walledVoxels: VoxelView = {
  getBlock: (_x, _y, z) => (z <= -10 ? 1 : 0),
  isSolid: (_x, _y, z) => z <= -10,
};

function makeEntities(): EntityManager {
  const reg = new EntityRegistry();
  registerCoreCreatures(reg);
  reg.finalize();
  return new EntityManager({ registry: reg, seed: 11 });
}

function makeSystem(voxels: VoxelView = emptyVoxels, onShot?: (r: ShotResult) => void) {
  const entities = makeEntities();
  const sys = new WeaponSystem({
    weapons: CORE_WEAPONS,
    voxels,
    entities,
    seed: 4242,
    onShot: onShot ? (r) => onShot(r) : undefined,
  });
  sys.equip(SERVICE_RIFLE.name);
  return { sys, entities };
}

const input = (over: Partial<WeaponInput> = {}): WeaponInput => ({
  firing: false,
  aiming: false,
  reloadPressed: false,
  origin: { x: 0, y: 2, z: 0 },
  // Straight down -Z, which is "forward" everywhere in this engine.
  direction: { x: 0, y: 0, z: -1 },
  speed: 0,
  distance: 0,
  airborne: false,
  turnX: 0,
  turnY: 0,
  ...over,
});

/** Run `seconds` of ticks at the simulation rate. */
function run(sys: WeaponSystem, over: Partial<WeaponInput>, seconds: number): void {
  const dt = 1 / 20;
  for (let i = 0; i < Math.round(seconds / dt); i++) sys.tick(input(over), dt);
}

describe('weapon system', () => {
  it('equips a known weapon and refuses an unknown one', () => {
    const { sys } = makeSystem();
    expect(sys.state?.definition.name).toBe(SERVICE_RIFLE.name);
    expect(sys.equip('voxelia:nonexistent')).toBe(false);
    // The refusal must not disarm the player.
    expect(sys.state?.definition.name).toBe(SERVICE_RIFLE.name);
  });

  it('starts with a full magazine', () => {
    const { sys } = makeSystem();
    expect(sys.state?.ammo).toBe(SERVICE_RIFLE.magazineSize);
  });

  it('spends a round per shot and respects the fire rate', () => {
    const { sys } = makeSystem();
    run(sys, { firing: true }, 1);
    const spent = SERVICE_RIFLE.magazineSize - sys.state!.ammo;
    // 9 rounds/second, sampled at 20 Hz — allow one either way for tick phase.
    expect(spent).toBeGreaterThanOrEqual(8);
    expect(spent).toBeLessThanOrEqual(10);
  });

  it('never fires past empty', () => {
    const { sys } = makeSystem();
    run(sys, { firing: true }, 10);
    expect(sys.state!.ammo).toBeGreaterThanOrEqual(0);
    expect(sys.state!.ammo).toBeLessThanOrEqual(SERVICE_RIFLE.magazineSize);
  });

  it('auto-reloads on a dry trigger and refills the magazine', () => {
    const { sys } = makeSystem();
    run(sys, { firing: true }, 5); // empties the magazine, then dry-fires
    expect(sys.state!.reloading).toBe(true);
    run(sys, {}, SERVICE_RIFLE.reloadSeconds + 0.2);
    expect(sys.state!.reloading).toBe(false);
    expect(sys.state!.ammo).toBe(SERVICE_RIFLE.magazineSize);
  });

  it('will not reload a full magazine', () => {
    const { sys } = makeSystem();
    sys.reload();
    expect(sys.state!.reloading).toBe(false);
  });

  it('cannot fire while reloading', () => {
    const { sys } = makeSystem();
    run(sys, { firing: true }, 0.3); // spend a few
    const before = sys.state!.ammo;
    sys.reload();
    run(sys, { firing: true }, 1); // held trigger, mid-reload
    expect(sys.state!.ammo).toBe(before);
  });

  it('aims in and back out over the configured time', () => {
    const { sys } = makeSystem();
    expect(sys.state!.ads).toBe(0);
    run(sys, { aiming: true }, SERVICE_RIFLE.adsSeconds + 0.1);
    expect(sys.state!.ads).toBe(1);
    run(sys, { aiming: false }, SERVICE_RIFLE.adsSeconds + 0.1);
    expect(sys.state!.ads).toBe(0);
  });

  it('kicks the camera up and settles back', () => {
    const { sys } = makeSystem();
    sys.tick(input({ firing: true }), 1 / 20);
    const kicked = sys.state!.recoilPitch;
    expect(kicked).toBeGreaterThan(0); // always up, never down
    run(sys, {}, 2);
    expect(Math.abs(sys.state!.recoilPitch)).toBeLessThan(kicked * 0.05);
  });

  it('flashes the muzzle only briefly', () => {
    const { sys } = makeSystem();
    sys.tick(input({ firing: true }), 1 / 20);
    expect(sys.flashLeft).toBeGreaterThan(0);
    // Shorter than a single tick at 20 Hz — it must not linger.
    expect(sys.flashLeft).toBeLessThan(1 / 20);
  });

  it('signals a casing on the tick it fires, and only then', () => {
    const { sys } = makeSystem();
    sys.tick(input({ firing: true }), 1 / 20);
    expect(sys.ejectedThisTick).toBe(true);
    sys.tick(input({ firing: false }), 1 / 20);
    expect(sys.ejectedThisTick).toBe(false);
  });
});

describe('weapon hitscan', () => {
  it('reports the block it hits', () => {
    const shots: ShotResult[] = [];
    const { sys } = makeSystem(walledVoxels, (r) => shots.push(r));
    sys.tick(input({ firing: true, aiming: true }), 1 / 20);
    expect(shots.length).toBe(1);
    expect(shots[0].block).not.toBeNull();
    expect(shots[0].entityId).toBeNull();
  });

  it('reports a miss when nothing is in the way', () => {
    const shots: ShotResult[] = [];
    const { sys } = makeSystem(emptyVoxels, (r) => shots.push(r));
    sys.tick(input({ firing: true }), 1 / 20);
    expect(shots[0].block).toBeNull();
    expect(shots[0].point).toBeNull();
  });

  it('damages a creature in the line of fire', () => {
    const shots: ShotResult[] = [];
    const { sys, entities } = makeSystem(emptyVoxels, (r) => shots.push(r));
    const target = entities.spawn('voxelia:hollow', { x: 0, y: 1, z: -6 })!;
    const before = target.health;

    // Aimed, so spread is negligible and the shot is deterministic enough.
    run(sys, { firing: true, aiming: true }, SERVICE_RIFLE.adsSeconds + 0.4);

    expect(target.health).toBeLessThan(before);
    expect(shots.some((s) => s.entityId === target.id)).toBe(true);
  });

  it('stops at a creature instead of passing through to the wall', () => {
    const shots: ShotResult[] = [];
    const { sys, entities } = makeSystem(walledVoxels, (r) => shots.push(r));
    entities.spawn('voxelia:hollow', { x: 0, y: 1, z: -4 });
    run(sys, { firing: true, aiming: true }, SERVICE_RIFLE.adsSeconds + 0.3);

    const hitEntity = shots.filter((s) => s.entityId !== null).length;
    expect(hitEntity).toBeGreaterThan(0);
    // Every shot that found the creature must report no block.
    for (const s of shots) {
      if (s.entityId !== null) expect(s.block).toBeNull();
    }
  });

  it('is tighter aimed than from the hip', () => {
    // Fire a fixed number of rounds each way at a distant creature and compare
    // how many connect. Aiming has to be worth the cost or it is decoration.
    const landed = (aiming: boolean): number => {
      const { sys, entities } = makeSystem(emptyVoxels);
      const target = entities.spawn('voxelia:hollow', { x: 0, y: 1, z: -30 })!;
      const start = target.health;
      target.health = 100000; // survive the volley so every hit counts
      run(sys, { aiming }, aiming ? SERVICE_RIFLE.adsSeconds + 0.05 : 0.05);
      run(sys, { firing: true, aiming }, 2.5);
      void start;
      return 100000 - target.health;
    };

    expect(landed(true)).toBeGreaterThan(landed(false));
  });
});

describe('weapon catalogue', () => {
  it('gives every weapon sane stats', () => {
    for (const w of CORE_WEAPONS) {
      expect(w.magazineSize, `${w.name} magazine`).toBeGreaterThan(0);
      expect(w.fireRate, `${w.name} fire rate`).toBeGreaterThan(0);
      expect(w.damage, `${w.name} damage`).toBeGreaterThan(0);
      expect(w.reloadSeconds, `${w.name} reload`).toBeGreaterThan(0);
      // Aiming must actually tighten the cone, or there is no reason to aim.
      expect(w.spreadAds, `${w.name} ads spread`).toBeLessThan(w.spreadHip);
      expect(w.adsFovScale, `${w.name} ads fov`).toBeLessThanOrEqual(1);
    }
  });

  it('declares unique part names in every viewmodel', () => {
    for (const w of CORE_WEAPONS) {
      const seen = new Set<string>();
      const walk = (parts: readonly { name: string; children?: readonly never[] }[]): void => {
        for (const p of parts) {
          expect(seen.has(p.name), `${w.name} repeats part ${p.name}`).toBe(false);
          seen.add(p.name);
          if (p.children) walk(p.children);
        }
      };
      walk(w.model as never);
      // The parts the system drives by name must exist.
      if (w.parts?.muzzleFlash) expect(seen.has(w.parts.muzzleFlash)).toBe(true);
      if (w.parts?.magazine) expect(seen.has(w.parts.magazine)).toBe(true);
    }
  });

  it('runs the viewmodel animator without throwing', () => {
    const poses = new Map<string, Record<string, number | boolean>>();
    const get = (name: string) => {
      let p = poses.get(name);
      if (!p) {
        p = { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
        poses.set(name, p);
      }
      return p;
    };
    for (const ads of [0, 0.5, 1]) {
      for (const reload of [0, 0.2, 0.5, 0.9]) {
        expect(() =>
          SERVICE_RIFLE.animate?.(get as never, {
            age: 3, speed: 4, distance: 9, ads, fire: 0.4, reload,
            empty: false, airborne: false, turnX: 0.01, turnY: -0.01,
          }),
        ).not.toThrow();
      }
    }
    // Aiming must pull the weapon toward the centre of the screen.
    SERVICE_RIFLE.animate?.(get as never, {
      age: 0, speed: 0, distance: 0, ads: 0, fire: 0, reload: 0,
      empty: false, airborne: false, turnX: 0, turnY: 0,
    });
    const hip = get('weapon').offsetX as number;
    SERVICE_RIFLE.animate?.(get as never, {
      age: 0, speed: 0, distance: 0, ads: 1, fire: 0, reload: 0,
      empty: false, airborne: false, turnX: 0, turnY: 0,
    });
    expect(get('weapon').offsetX as number).toBeLessThan(hip);
  });
});
