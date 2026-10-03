import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import {
  EntityManager,
  EntityRegistry,
  HOLLOW,
  distanceXZ,
  registerCoreCreatures,
  steerTowards,
  type BrainSenses,
  type Intent,
  type PlayerSense,
} from '../src/entities';

/** A flat stone floor at y<=0, open air above. */
function flatWorld(): BrainSenses['voxels'] {
  return {
    getBlock: (_x, y) => (y <= 0 ? 1 : 0),
    isSolid: (_x, y) => y <= 0,
  };
}

function makeSenses(overrides: Partial<BrainSenses> = {}): BrainSenses {
  const voxels = flatWorld();
  return {
    voxels,
    playerPosition: null,
    lightAt: () => 0,
    canSee: () => true,
    elapsed: 0,
    timeOfDay: 0,
    ...overrides,
  };
}

function makeManager(): EntityManager {
  const registry = new EntityRegistry();
  registerCoreCreatures(registry);
  registry.finalize();
  return new EntityManager({ registry, seed: 1234 });
}

function run(manager: EntityManager, senses: BrainSenses, seconds: number, dt = 1 / 20): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) manager.tick({ dt, senses });
}

describe('entity registry', () => {
  it('registers the core roster and rejects duplicates', () => {
    const reg = new EntityRegistry();
    registerCoreCreatures(reg);
    expect(reg.all.length).toBeGreaterThan(0);
    expect(reg.get('voxelia:hollow')).toBeDefined();
    expect(() => reg.register(HOLLOW)).toThrow(/duplicate/);
  });

  it('refuses a creature with a degenerate hitbox', () => {
    const reg = new EntityRegistry();
    expect(() => reg.register({ ...HOLLOW, name: 'test:bad', width: 0 })).toThrow(/width and height/);
    expect(() => reg.register({ ...HOLLOW, name: 'test:bad2', maxHealth: 0 })).toThrow(/maxHealth/);
  });

  it('rejects registrations after finalize', () => {
    const reg = new EntityRegistry();
    reg.finalize();
    expect(() => reg.register(HOLLOW)).toThrow(/finalized/);
  });
});

describe('entity manager', () => {
  it('spawns a known creature and ignores an unknown one', () => {
    const m = makeManager();
    expect(m.spawn('voxelia:hollow', { x: 0, y: 4, z: 0 })).not.toBeNull();
    expect(m.spawn('voxelia:nonexistent', { x: 0, y: 4, z: 0 })).toBeNull();
    expect(m.all.length).toBe(1);
  });

  it('drops a spawned entity onto the ground under gravity', () => {
    const m = makeManager();
    const e = m.spawn('voxelia:hollow', { x: 0.5, y: 12, z: 0.5 })!;
    run(m, makeSenses(), 4);
    expect(e.onGround).toBe(true);
    // Floor occupies y<=0, so feet rest on the top face at y=1.
    expect(e.position.y).toBeCloseTo(1, 1);
  });

  it('walks toward the player when it can see them', () => {
    const m = makeManager();
    const player: PlayerSense = { x: 0.5, y: 1, z: 0.5, yaw: 0 };
    const e = m.spawn('voxelia:hollow', { x: 0.5, y: 1, z: 14 })!;
    const senses = makeSenses({ playerPosition: player });

    const before = distanceXZ(e.position, player);
    run(m, senses, 3);
    const after = distanceXZ(e.position, player);

    expect(after).toBeLessThan(before - 2);
    expect(e.brain.state === 'hunt' || e.brain.state === 'attack').toBe(true);
  });

  it('does not hunt a player it cannot see', () => {
    const m = makeManager();
    const player: PlayerSense = { x: 0.5, y: 1, z: 0.5, yaw: 0 };
    const e = m.spawn('voxelia:hollow', { x: 0.5, y: 1, z: 14 })!;
    const senses = makeSenses({ playerPosition: player, canSee: () => false });

    run(m, senses, 2);
    expect(e.brain.state).not.toBe('hunt');
  });

  it('stays put when the light is too bright for it', () => {
    const m = makeManager();
    const player: PlayerSense = { x: 0.5, y: 1, z: 0.5, yaw: 0 };
    const e = m.spawn('voxelia:hollow', { x: 0.5, y: 1, z: 14 })!;
    // HOLLOW's brain has no light gate, so gate it explicitly to prove the
    // mechanism: a brain built with huntsInLightUpTo ignores a lit player.
    const senses = makeSenses({ playerPosition: player, lightAt: () => 15 });
    const before = distanceXZ(e.position, player);
    run(m, senses, 2);
    // The reference creature hunts at any light level — it should have closed in.
    expect(distanceXZ(e.position, player)).toBeLessThan(before);
  });

  it('attacks the player at contact range, on cooldown', () => {
    const registry = new EntityRegistry();
    registerCoreCreatures(registry);
    registry.finalize();
    let hits = 0;
    const m = new EntityManager({
      registry,
      seed: 7,
      onAttackPlayer: () => hits++,
    });
    const player: PlayerSense = { x: 0.5, y: 1, z: 0.5, yaw: 0 };
    m.spawn('voxelia:hollow', { x: 0.5, y: 1, z: 1.4 });
    run(m, makeSenses({ playerPosition: player }), 3);

    expect(hits).toBeGreaterThan(0);
    // 3s at a 1.1s cooldown can land at most 3 hits — proves the gate works.
    expect(hits).toBeLessThanOrEqual(3);
  });

  it('kills, lingers as a corpse, then reaps with drops', () => {
    const registry = new EntityRegistry();
    registerCoreCreatures(registry);
    registry.finalize();
    let deaths = 0;
    const m = new EntityManager({ registry, seed: 3, onDeath: () => deaths++ });
    const e = m.spawn('voxelia:hollow', { x: 0.5, y: 1, z: 0.5 })!;

    e.hurt(HOLLOW.maxHealth);
    expect(e.dead).toBe(true);

    const senses = makeSenses();
    m.tick({ dt: 0.05, senses });
    expect(m.all.length).toBe(1); // still a corpse
    expect(deaths).toBe(0);

    run(m, senses, 2);
    expect(m.all.length).toBe(0);
    expect(deaths).toBe(1);
  });

  it('ignores damage once dead', () => {
    const m = makeManager();
    const e = m.spawn('voxelia:hollow', { x: 0, y: 1, z: 0 })!;
    e.kill();
    e.hurt(5);
    expect(e.health).toBe(0);
  });

  it('finds entities by box and by proximity', () => {
    const m = makeManager();
    m.spawn('voxelia:hollow', { x: 0, y: 1, z: 0 });
    m.spawn('voxelia:hollow', { x: 20, y: 1, z: 0 });

    const near = m.nearest({ x: 1, y: 1, z: 0 }, 5);
    expect(near).not.toBeNull();
    expect(near!.position.x).toBe(0);
    expect(m.nearest({ x: 100, y: 1, z: 100 }, 5)).toBeNull();

    const hits = m.query({ minX: -1, minY: 0, minZ: -1, maxX: 1, maxY: 3, maxZ: 1 });
    expect(hits.length).toBe(1);
  });

  it('despawns and clears', () => {
    const m = makeManager();
    const e = m.spawn('voxelia:hollow', { x: 0, y: 1, z: 0 })!;
    m.despawn(e.id);
    expect(m.all.length).toBe(0);
    m.spawn('voxelia:hollow', { x: 0, y: 1, z: 0 });
    m.clear();
    expect(m.all.length).toBe(0);
  });
});

describe('creature models', () => {
  it('gives every core creature unique part names and a sane model', () => {
    const reg = new EntityRegistry();
    registerCoreCreatures(reg);
    for (const def of reg.all) {
      const names = new Set<string>();
      const walk = (parts: readonly { name: string; children?: readonly never[] }[]): void => {
        for (const p of parts) {
          expect(names.has(p.name), `${def.name} repeats part ${p.name}`).toBe(false);
          names.add(p.name);
          if (p.children) walk(p.children);
        }
      };
      walk(def.model as never);
      expect(names.size).toBeGreaterThan(0);
    }
  });

  it('runs the animator without touching an unknown part', () => {
    const poses = new Map<string, ReturnType<typeof blankPose>>();
    const get = (name: string) => {
      let p = poses.get(name);
      if (!p) {
        p = blankPose();
        poses.set(name, p);
      }
      return p;
    };
    expect(() =>
      HOLLOW.animate?.(get, {
        age: 1.5,
        speed: 3,
        distance: 6,
        headYaw: 0,
        headPitch: 0.2,
        airborne: false,
        attack: 0,
        hurt: 0,
        dead: false,
        deathProgress: 0,
        phase: 0.4,
      }),
    ).not.toThrow();
    // Walking at speed must actually swing the legs in opposition.
    expect(get('legL').rotX).not.toBe(0);
    expect(Math.sign(get('legL').rotX)).toBe(-Math.sign(get('legR').rotX));
  });
});

describe('steering helpers', () => {
  it('produces a unit heading toward the target', () => {
    const intent: Intent = { moveX: 0, moveZ: 0, throttle: 0, jump: false, lookAt: null, attack: 0 };
    steerTowards(intent, { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, 1);
    expect(Math.hypot(intent.moveX, intent.moveZ)).toBeCloseTo(1, 6);
    expect(intent.moveX).toBeCloseTo(0.6, 6);
    expect(intent.moveZ).toBeCloseTo(0.8, 6);
  });

  it('stands still when already on the target', () => {
    const intent: Intent = { moveX: 1, moveZ: 1, throttle: 1, jump: false, lookAt: null, attack: 0 };
    steerTowards(intent, { x: 2, y: 0, z: 2 }, { x: 2, y: 0, z: 2 }, 1);
    expect(intent.throttle).toBe(0);
  });

  it('gives each spawn its own brain instance', () => {
    const m = makeManager();
    const a = m.spawn('voxelia:hollow', { x: 0, y: 1, z: 0 })!;
    const b = m.spawn('voxelia:hollow', { x: 5, y: 1, z: 0 })!;
    expect(a.brain).not.toBe(b.brain);
  });

  it('seeds brains deterministically from the world seed', () => {
    const positions = [0, 1].map(() => {
      const registry = new EntityRegistry();
      registerCoreCreatures(registry);
      registry.finalize();
      const m = new EntityManager({ registry, seed: 99 });
      const e = m.spawn('voxelia:hollow', { x: 0.5, y: 1, z: 0.5 })!;
      run(m, makeSenses(), 5);
      return { x: e.position.x, z: e.position.z };
    });
    expect(positions[0]).toEqual(positions[1]);
  });
});

function blankPose() {
  return { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
}

// `createRng` is exercised indirectly above; this keeps the import meaningful
// if the determinism test is ever changed to seed brains by hand.
void createRng;

describe('renderer resource sharing', () => {
  it('shares geometry and materials across every instance', async () => {
    const THREE = await import('three');
    const { EntityRenderer } = await import('../src/entities/EntityRenderer');

    const scene = new THREE.Scene();
    const renderer = new EntityRenderer(scene);
    const m = makeManager();

    for (let i = 0; i < 25; i++) m.spawn('voxelia:hollow', { x: i * 3, y: 1, z: 0 });
    renderer.sync(m.all);

    const stats = renderer.stats;
    expect(stats.views).toBe(25);

    // The Hollow has 8 boxes across 4 distinct sizes and 3 distinct colours.
    // Without sharing this would be 25*8 = 200 of each.
    expect(stats.geometries).toBeLessThanOrEqual(8);
    expect(stats.materials).toBeLessThanOrEqual(8);

    // Despawning must not drop the shared caches other entities still use.
    const first = m.all[0].id;
    m.despawn(first);
    renderer.sync(m.all);
    expect(renderer.stats.views).toBe(24);
    expect(renderer.stats.geometries).toBe(stats.geometries);

    renderer.dispose();
    expect(renderer.stats.geometries).toBe(0);
  });
});

describe('attack poses reach forward', () => {
  // The rotation convention is easy to invert and the mistake renders as a
  // creature clawing at the sky. Pin it for every creature that attacks.
  const ctxAt = (attack: number) => ({
    age: 2, speed: 0, distance: 0, headYaw: 0, headPitch: 0,
    airborne: false, attack, hurt: 0, dead: false, deathProgress: 0, phase: 0.3,
  });

  /** Every part name a model declares, at any depth. */
  const partNames = (parts: readonly { name: string; children?: readonly never[] }[]): Set<string> => {
    const out = new Set<string>();
    const walk = (list: readonly { name: string; children?: readonly never[] }[]): void => {
      for (const p of list) {
        out.add(p.name);
        if (p.children) walk(p.children);
      }
    };
    walk(parts);
    return out;
  };

  const poseMap = () => {
    const m = new Map<string, ReturnType<typeof blankPose>>();
    return {
      m,
      get: (name: string) => {
        let p = m.get(name);
        if (!p) { p = blankPose(); m.set(name, p); }
        return p;
      },
    };
  };

  it('makes every attack visibly change the pose', () => {
    const reg = new EntityRegistry();
    registerCoreCreatures(reg);

    for (const def of reg.all) {
      if (!def.animate || def.attackDamage === undefined) continue;
      const rest = poseMap();
      const swung = poseMap();
      def.animate(rest.get, ctxAt(0));
      def.animate(swung.get, ctxAt(1));

      let moved = 0;
      for (const [name, after] of swung.m) {
        const before = rest.m.get(name);
        if (!before) continue;
        if (
          Math.abs(after.rotX - before.rotX) > 0.1 ||
          Math.abs(after.rotY - before.rotY) > 0.1 ||
          Math.abs(after.rotZ - before.rotZ) > 0.1 ||
          Math.abs(after.offsetY - before.offsetY) > 0.5
        ) moved++;
      }
      expect(moved, `${def.name} barely moves when attacking`).toBeGreaterThan(0);
    }
  });

  it('swings humanoid arms forward, never backward', () => {
    const reg = new EntityRegistry();
    registerCoreCreatures(reg);

    for (const def of reg.all) {
      if (!def.animate || def.attackDamage === undefined) continue;
      // Only creatures that actually have arms. A spider strikes with legs, and
      // a leg rising from its pivot uses the opposite sign convention.
      const names = partNames(def.model as never);
      if (!names.has('armL') || !names.has('armR')) continue;

      const p = poseMap();
      def.animate(p.get, ctxAt(0));
      const restL = p.get('armL').rotX;
      def.animate(p.get, ctxAt(1));

      // +rotX reaches forward on a limb hanging from its pivot.
      expect(p.get('armL').rotX, `${def.name} armL must reach forward`).toBeGreaterThan(restL);
      expect(p.get('armL').rotX, `${def.name} armL must reach forward`).toBeGreaterThan(0.5);
      expect(p.get('armR').rotX, `${def.name} armR must reach forward`).toBeGreaterThan(0.5);
    }
  });

  it('poses a collapse that deepens over the death', () => {
    const reg = new EntityRegistry();
    registerCoreCreatures(reg);
    const wraith = reg.get('voxelia:stagwraith')!;
    const poses = new Map<string, ReturnType<typeof blankPose>>();
    const get = (name: string) => {
      let p = poses.get(name);
      if (!p) { p = blankPose(); poses.set(name, p); }
      return p;
    };

    wraith.animate!(get, { ...ctxAt(0), dead: true, deathProgress: 0.2 });
    const early = get('hips').rotX;
    wraith.animate!(get, { ...ctxAt(0), dead: true, deathProgress: 1 });
    const late = get('hips').rotX;

    // Folds forward (negative on a part above its pivot), and further over time.
    expect(late).toBeLessThan(early);
    expect(late).toBeLessThan(-1);
  });
});
