import { describe, expect, it } from 'vitest';
import {
  EntityManager,
  EntityRegistry,
  Spawner,
  registerCoreCreatures,
  type BrainSenses,
} from '../src/entities';
import type { VoxelView } from '../src/physics/types';

/** Flat ground at y<=64, open sky above. */
const flat: VoxelView = {
  getBlock: (_x, y) => (y <= 64 ? 2 : 0),
  isSolid: (_x, y) => y <= 64,
};

/** Solid to the sky: nothing can legally stand anywhere. */
const solid: VoxelView = { getBlock: () => 2, isSolid: () => true };

const senses = (): BrainSenses => ({
  voxels: flat,
  playerPosition: null,
  lightAt: () => 0,
  canSee: () => true,
  elapsed: 0,
  timeOfDay: 0,
});

function setup(over: Partial<Parameters<typeof makeSpawner>[0]> = {}) {
  return makeSpawner(over);
}

function makeSpawner(over: {
  voxels?: VoxelView;
  light?: number;
  maxAlive?: number;
  surface?: number;
  biome?: string;
} = {}) {
  const registry = new EntityRegistry();
  registerCoreCreatures(registry);
  registry.finalize();
  const entities = new EntityManager({ registry, seed: 5 });
  const spawner = new Spawner({
    registry,
    entities,
    voxels: over.voxels ?? flat,
    seed: 31,
    lightAt: () => over.light ?? 0,
    surfaceAt: () => over.surface ?? 64,
    biomeAt: () => over.biome ?? 'voxelia:forest',
    maxAlive: over.maxAlive ?? 14,
    interval: 0.1,
  });
  return { registry, entities, spawner };
}

/** Run the spawner for `seconds` of simulated time. */
function run(spawner: Spawner, player: { x: number; y: number; z: number }, seconds: number): void {
  const dt = 1 / 20;
  for (let i = 0; i < Math.round(seconds / dt); i++) spawner.tick(dt, player);
}

const PLAYER = { x: 0, y: 65, z: 0 };

describe('spawner', () => {
  it('spawns creatures over time in the dark', () => {
    const { entities, spawner } = setup();
    expect(entities.all.length).toBe(0);
    run(spawner, PLAYER, 10);
    expect(entities.all.length).toBeGreaterThan(0);
  });

  it('never exceeds the global cap however long it runs', () => {
    const { entities, spawner } = setup({ maxAlive: 5 });
    run(spawner, PLAYER, 60);
    expect(entities.all.length).toBeLessThanOrEqual(5);
  });

  it('never spawns on top of the player', () => {
    const { entities, spawner } = setup();
    run(spawner, PLAYER, 30);
    expect(entities.all.length).toBeGreaterThan(0);
    for (const e of entities.all) {
      const rule = e.definition.spawn!;
      const d = Math.hypot(e.position.x - PLAYER.x, e.position.z - PLAYER.z);
      // Each creature's own minimum is respected, with a little slack for the
      // group scatter.
      expect(d, `${e.definition.name} spawned ${d.toFixed(1)} away`).toBeGreaterThan(
        (rule.minPlayerDistance ?? 16) - 5,
      );
    }
  });

  it('respects a light ceiling: nothing dark-only spawns in daylight', () => {
    const { entities, spawner } = setup({ light: 15 });
    run(spawner, PLAYER, 30);
    for (const e of entities.all) {
      const max = e.definition.spawn?.maxLight;
      expect(max === undefined || max >= 15, `${e.definition.name} ignored its light rule`).toBe(true);
    }
  });

  it('spawns nothing at all when there is no room', () => {
    const { entities, spawner } = setup({ voxels: solid });
    run(spawner, PLAYER, 30);
    expect(entities.all.length).toBe(0);
  });

  it('gives a giant creature room for its whole body', () => {
    // A ceiling three blocks above the ground: fine for a small creature,
    // impossible for anything tall.
    const lowRoof: VoxelView = {
      getBlock: (_x, y) => (y <= 64 || y >= 68 ? 2 : 0),
      isSolid: (_x, y) => y <= 64 || y >= 68,
    };
    const { entities, spawner } = setup({ voxels: lowRoof });
    run(spawner, PLAYER, 40);
    for (const e of entities.all) {
      expect(e.definition.height, `${e.definition.name} does not fit under the roof`).toBeLessThan(3.1);
    }
  });

  it('honours a biome rule', () => {
    const { entities, spawner } = setup({ biome: 'voxelia:desert' });
    run(spawner, PLAYER, 30);
    for (const e of entities.all) {
      const biomes = e.definition.spawn?.biomes;
      if (biomes && biomes.length > 0) {
        expect(biomes, `${e.definition.name} spawned outside its biomes`).toContain('voxelia:desert');
      }
    }
  });

  it('despawns creatures the player has walked away from', () => {
    const { entities, spawner } = setup();
    run(spawner, PLAYER, 20);
    const before = entities.all.length;
    expect(before).toBeGreaterThan(0);
    // Walk a long way off.
    run(spawner, { x: 5000, y: 65, z: 5000 }, 1);
    expect(entities.all.length).toBeLessThan(before);
  });

  it('is generic: it reads rules, not names', () => {
    // Register a creature the spawner has never heard of and confirm it appears.
    const registry = new EntityRegistry();
    registerCoreCreatures(registry);
    const base = registry.all[0];
    registry.register({
      ...base,
      name: 'test:newcomer',
      displayName: 'Newcomer',
      spawn: { weight: 9999, minPlayerDistance: 10, maxPlayerDistance: 30, maxNearby: 20 },
    });
    registry.finalize();
    const entities = new EntityManager({ registry, seed: 2 });
    const spawner = new Spawner({
      registry,
      entities,
      voxels: flat,
      seed: 7,
      lightAt: () => 0,
      surfaceAt: () => 64,
      interval: 0.1,
    });
    run(spawner, PLAYER, 20);
    expect(entities.all.some((e) => e.definition.name === 'test:newcomer')).toBe(true);
  });

  it('does nothing without a player', () => {
    const { entities, spawner } = setup();
    for (let i = 0; i < 400; i++) spawner.tick(1 / 20, null);
    expect(entities.all.length).toBe(0);
  });
});

describe('weapon damage is creature-agnostic', () => {
  it('hurts every registered creature through the same call', async () => {
    const { WeaponSystem, CORE_WEAPONS, SERVICE_RIFLE } = await import('../src/weapons');
    const registry = new EntityRegistry();
    registerCoreCreatures(registry);
    registry.finalize();
    const entities = new EntityManager({ registry, seed: 9 });

    const sys = new WeaponSystem({
      weapons: CORE_WEAPONS,
      voxels: { getBlock: () => 0, isSolid: () => false },
      entities,
      seed: 3,
    });
    sys.equip(SERVICE_RIFLE.name);

    // One of every creature, lined up and shot in turn.
    for (const def of registry.all) {
      entities.clear();
      const target = entities.spawn(def.name, { x: 0, y: 1, z: -6 })!;
      const before = target.health;
      for (let i = 0; i < 40; i++) {
        sys.tick(
          {
            firing: true, aiming: true, reloadPressed: false,
            origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: 0, z: -1 },
            speed: 0, distance: 0, airborne: false, turnX: 0, turnY: 0,
          },
          1 / 20,
        );
      }
      expect(target.health, `${def.name} took no damage`).toBeLessThan(before);
    }
  });

  it('kills any creature given enough rounds, through the shared death path', () => {
    const registry = new EntityRegistry();
    registerCoreCreatures(registry);
    registry.finalize();
    const entities = new EntityManager({ registry, seed: 4 });
    for (const def of registry.all) {
      entities.clear();
      const e = entities.spawn(def.name, { x: 0, y: 1, z: 0 })!;
      e.hurt(def.maxHealth);
      expect(e.dead, `${def.name} survived lethal damage`).toBe(true);
      expect(e.health).toBe(0);
      // And the shared reaper removes it, with no per-creature death path.
      for (let i = 0; i < 60; i++) entities.tick({ dt: 1 / 20, senses: senses() });
      expect(entities.all.length, `${def.name} was never reaped`).toBe(0);
    }
  });
});
