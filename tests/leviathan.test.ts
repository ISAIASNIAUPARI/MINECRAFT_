import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { createGameContent } from '../src/content';
import {
  EntityManager,
  EntityRegistry,
  registerCoreCreatures,
  createLeviathanBrain,
  type BrainSenses,
  type PlayerSense,
} from '../src/entities';
import { Excavator, MAX_BLOCK_BUDGET } from '../src/world';
import type { BlockId } from '../src/core/types';
import type { IWorld } from '../src/engine/types';

/** Ground at y<=64, open sky above. */
const groundVoxels = {
  getBlock: (_x: number, y: number) => (y <= 64 ? 1 : 0),
  isSolid: (_x: number, y: number) => y <= 64,
};

function makeSenses(player: PlayerSense | null): BrainSenses {
  return {
    voxels: groundVoxels,
    playerPosition: player,
    lightAt: () => 15,
    canSee: () => true,
    elapsed: 0,
    timeOfDay: 0.32,
  };
}

function makeManager(): EntityManager {
  const reg = new EntityRegistry();
  registerCoreCreatures(reg);
  reg.finalize();
  return new EntityManager({ registry: reg, seed: 77 });
}

/**
 * A world that stores edits in a map, so a carve is observable.
 *
 * `solid` must be a block the excavator is allowed to remove — numeric id 1 is
 * bedrock, which it protects, so filling the world with it tests nothing.
 */
interface FakeWorld {
  edits: Map<string, BlockId>;
  getBlock(x: number, y: number, z: number): BlockId;
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
}

function fakeWorld(solid: BlockId): FakeWorld {
  const edits = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const world: FakeWorld = {
    edits,
    getBlock(x, y, z) {
      const e = edits.get(key(x, y, z));
      if (e !== undefined) return e;
      return y <= 64 ? solid : 0;
    },
    setBlock(x, y, z, id) {
      if (world.getBlock(x, y, z) === id) return false;
      edits.set(key(x, y, z), id);
      return true;
    },
  };
  return world;
}

/** The excavator only needs get/set, so a stub satisfies it. */
const asWorld = (w: FakeWorld): IWorld => w as unknown as IWorld;

describe('leviathan brain', () => {
  it('cruises on a heading and holds treetop height', () => {
    const brain = createLeviathanBrain(createRng(1));
    const self = { position: { x: 0, y: 40, z: 0 }, definition: {} } as never;
    const senses = makeSenses(null);

    // Starting well below its cruise height, it must ask to climb.
    const intent = brain.think(self, senses, 1 / 20);
    expect(brain.state).toBe('flying');
    expect(intent.moveY).toBeGreaterThan(0);
    expect(intent.throttle).toBeGreaterThan(0);
  });

  it('descends when it is above its cruise height', () => {
    const brain = createLeviathanBrain(createRng(2));
    const self = { position: { x: 0, y: 110, z: 0 }, definition: {} } as never;
    const intent = brain.think(self, makeSenses(null), 1 / 20);
    expect(intent.moveY).toBeLessThan(0);
  });

  it('runs the whole attack sequence in order and ends back in flight', () => {
    const brain = createLeviathanBrain(createRng(3), {
      observeSeconds: 0.4,
      targetSeconds: 0.3,
      burrowSeconds: 0.4,
      diveCooldown: 0,
    });
    const player: PlayerSense = { x: 0, y: 65, z: 0, yaw: 0 };
    const senses = makeSenses(player);
    const self = { position: { x: 10, y: 80, z: 0 }, definition: {} };

    const seen: string[] = [];
    let struck = 0;
    let emerged = 0;
    const dt = 1 / 20;
    for (let i = 0; i < 600; i++) {
      const intent = brain.think(self as never, senses, dt);
      if (seen[seen.length - 1] !== brain.state) seen.push(brain.state);
      if (brain.struckThisTick) struck++;
      if (brain.emergedThisTick) emerged++;
      // Integrate crudely so the state machine can actually reach the ground.
      self.position.x += intent.moveX * intent.throttle * 17 * dt;
      self.position.y += intent.moveY * intent.throttle * 17 * dt;
      self.position.z += intent.moveZ * intent.throttle * 17 * dt;
    }

    expect(seen).toContain('observing');
    expect(seen).toContain('targeting');
    expect(seen).toContain('diving');
    expect(seen).toContain('impact');
    expect(seen).toContain('burrowed');
    expect(seen).toContain('rising');
    // Each strike and each emergence fires exactly once per cycle, never on a
    // run of ticks — the terrain carve hangs off these.
    expect(struck).toBeGreaterThan(0);
    expect(emerged).toBeGreaterThan(0);
    expect(struck).toBeLessThanOrEqual(seen.filter((s) => s === 'impact').length + 1);
  });

  it('opens the maw only once it commits', () => {
    const brain = createLeviathanBrain(createRng(4), {
      observeSeconds: 0.2,
      targetSeconds: 0.5,
      diveCooldown: 0, // it starts on cooldown; a short test never gets past it
    });
    const player: PlayerSense = { x: 0, y: 65, z: 0, yaw: 0 };
    const self = { position: { x: 5, y: 80, z: 0 }, definition: {} } as never;
    expect(brain.gape).toBe(0);
    for (let i = 0; i < 30; i++) brain.think(self, makeSenses(player), 1 / 20);
    // By now it is targeting or diving, and the mouth has started to open.
    expect(brain.gape).toBeGreaterThan(0);
  });

  it('ignores the player entirely with none present', () => {
    const brain = createLeviathanBrain(createRng(5));
    const self = { position: { x: 0, y: 80, z: 0 }, definition: {} } as never;
    for (let i = 0; i < 200; i++) brain.think(self, makeSenses(null), 1 / 20);
    expect(brain.state).toBe('flying');
  });
});

describe('abyssal worm', () => {
  it('is registered, flies, and phases through terrain', () => {
    const reg = new EntityRegistry();
    registerCoreCreatures(reg);
    const def = reg.get('voxelia:abyssal_worm');
    expect(def).toBeDefined();
    expect(def!.gravity).toBe(false);
    expect(def!.collides).toBe(false);
  });

  it('does not fall out of the sky', () => {
    const m = makeManager();
    const e = m.spawn('voxelia:abyssal_worm', { x: 0, y: 90, z: 0 })!;
    const start = e.position.y;
    for (let i = 0; i < 60; i++) m.tick({ dt: 1 / 20, senses: makeSenses(null) });
    // A gravity-bound creature would have dropped ~44 blocks in three seconds.
    expect(e.position.y).toBeGreaterThan(start - 10);
  });

  it('is one entity, not a swarm of segments', () => {
    const m = makeManager();
    m.spawn('voxelia:abyssal_worm', { x: 0, y: 90, z: 0 });
    expect(m.all.length).toBe(1);
  });

  it('animates its whole body without throwing', () => {
    const content = createGameContent();
    const def = content.creatures.get('voxelia:abyssal_worm')!;
    const poses = new Map<string, Record<string, number | boolean>>();
    const get = (name: string) => {
      let p = poses.get(name);
      if (!p) {
        p = { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
        poses.set(name, p);
      }
      return p;
    };
    for (const [attack, dead, deathProgress] of [[0, false, 0], [1, false, 0], [0, true, 0.5], [0, true, 1]] as const) {
      expect(() =>
        def.animate?.(get as never, {
          age: 4, speed: 12, distance: 40, headYaw: 0, headPitch: 0,
          airborne: true, attack, hurt: 0, dead, deathProgress, phase: 0.2,
        }),
      ).not.toThrow();
    }
  });

  it('ripples: no two segments bend identically', () => {
    const content = createGameContent();
    const def = content.creatures.get('voxelia:abyssal_worm')!;
    const poses = new Map<string, Record<string, number | boolean>>();
    const get = (name: string) => {
      let p = poses.get(name);
      if (!p) {
        p = { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
        poses.set(name, p);
      }
      return p;
    };
    def.animate?.(get as never, {
      age: 2.3, speed: 12, distance: 30, headYaw: 0, headPitch: 0,
      airborne: true, attack: 0, hurt: 0, dead: false, deathProgress: 0, phase: 0,
    });
    const bends = [0, 1, 2, 3, 4].map((i) => get(`seg${i}`).rotY as number);
    const unique = new Set(bends.map((b) => b.toFixed(4)));
    // A rigid stick would give one value for all of them.
    expect(unique.size).toBe(bends.length);
  });
});

describe('excavator', () => {
  it('removes a bounded volume and reports the count', () => {
    const content = createGameContent();
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    const ex = new Excavator(asWorld(world), content.blocks);
    const r = ex.carve({ at: { x: 0, y: 60, z: 0 }, radius: 4 });
    expect(r.removed).toBeGreaterThan(0);
    expect(r.removed).toBeLessThanOrEqual(MAX_BLOCK_BUDGET);
  });

  it('never exceeds the budget it is given', () => {
    const content = createGameContent();
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    const ex = new Excavator(asWorld(world), content.blocks);
    const r = ex.carve({ at: { x: 0, y: 60, z: 0 }, radius: 20, budget: 50 });
    expect(r.removed).toBeLessThanOrEqual(50);
    expect(r.truncated).toBe(true);
  });

  it('never exceeds the hard cap however large the request', () => {
    const content = createGameContent();
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    const ex = new Excavator(asWorld(world), content.blocks);
    const r = ex.carve({ at: { x: 0, y: 50, z: 0 }, radius: 999, budget: 1e9 });
    expect(r.removed).toBeLessThanOrEqual(MAX_BLOCK_BUDGET);
  });

  it('refuses to remove bedrock', () => {
    const content = createGameContent();
    const bedrock = content.blocks.byName('voxelia:bedrock')!.numericId;
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    // Make the whole carve volume bedrock.
    const original = world.getBlock.bind(world);
    world.getBlock = (): BlockId => bedrock;
    const ex = new Excavator(asWorld(world), content.blocks);
    const r = ex.carve({ at: { x: 0, y: 10, z: 0 }, radius: 5 });
    expect(r.removed).toBe(0);
    world.getBlock = original;
  });

  it('does nothing in open air', () => {
    const content = createGameContent();
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    const ex = new Excavator(asWorld(world), content.blocks);
    // Well above the ground plane, so every block is already air.
    const r = ex.carve({ at: { x: 0, y: 100, z: 0 }, radius: 5 });
    expect(r.removed).toBe(0);
  });

  it('digs a longer hole along its axis than across it', () => {
    const content = createGameContent();
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    const ex = new Excavator(asWorld(world), content.blocks);
    ex.carve({
      at: { x: 0, y: 62, z: 0 },
      radius: 5,
      along: { x: 0, y: -1, z: 0 },
      elongation: 3,
      seed: 1,
    });
    const cleared = [...world.edits.entries()].filter(([, v]) => v === 0).map(([k]) => k.split(',').map(Number));
    const spanY = Math.max(...cleared.map((c) => c[1])) - Math.min(...cleared.map((c) => c[1]));
    const spanX = Math.max(...cleared.map((c) => c[0])) - Math.min(...cleared.map((c) => c[0]));
    expect(spanY).toBeGreaterThan(spanX);
  });

  it('leaves a ragged rim rather than a machined sphere', () => {
    const content = createGameContent();
    const world = fakeWorld(content.blocks.byName('voxelia:stone')!.numericId);
    const ex = new Excavator(asWorld(world), content.blocks);
    ex.carve({ at: { x: 0, y: 60, z: 0 }, radius: 6, seed: 9 });
    const cleared = new Set([...world.edits.entries()].filter(([, v]) => v === 0).map(([k]) => k));
    // Count how many cells at the nominal radius survived. A perfect sphere
    // would clear all of them.
    let survivors = 0;
    for (let a = 0; a < 360; a += 15) {
      const x = Math.round(Math.cos((a * Math.PI) / 180) * 5.6);
      const z = Math.round(Math.sin((a * Math.PI) / 180) * 5.6);
      if (!cleared.has(`${x},60,${z}`)) survivors++;
    }
    expect(survivors).toBeGreaterThan(0);
  });
});
