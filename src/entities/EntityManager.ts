import { GRAVITY, TERMINAL_VELOCITY, WORLD_BORDER } from '../core/constants';
import { createRng, hashInts, type Rng } from '../core/rng';
import type { AABB, Vec3 } from '../core/types';
import { aabbOverlap } from '../physics/aabb';
import { CollisionResolver } from '../physics/collision';
import { Entity } from './Entity';
import { CORPSE_SECONDS } from './types';
import type {
  EntityTickContext,
  IEntity,
  IEntityManager,
  IEntityRegistry,
} from './types';

/** How fast an entity turns to face where it is going / looking, radians/second. */
const TURN_RATE = 9;
/** Horizontal acceleration toward the desired velocity, blocks/s². */
const ACCELERATION = 36;
/** Ground friction applied when not trying to move. */
const FRICTION = 12;


export interface EntityManagerOptions {
  registry: IEntityRegistry;
  seed: number;
  /** Called when an entity dies, so the game can drop its items. */
  onDeath?: (entity: IEntity) => void;
  /** Called when an entity lands a melee hit on the player. */
  onAttackPlayer?: (entity: IEntity, damage: number) => void;
}

/**
 * Owns every live creature: ticks their brains, moves them against the voxel
 * world, resolves their attacks, and reaps the dead.
 *
 * Creature definitions never see this class — they describe themselves and
 * return an intent, and everything physical happens here.
 */
export class EntityManager implements IEntityManager {
  private readonly entities: Entity[] = [];
  private readonly collision = new CollisionResolver();
  private readonly rng: Rng;
  private nextId = 1;
  /** Dead entities awaiting removal, id -> seconds left. */
  private readonly reaping = new Map<number, number>();

  constructor(private readonly opts: EntityManagerOptions) {
    this.rng = createRng(hashInts(opts.seed, 0xe47));
  }

  get all(): readonly IEntity[] {
    return this.entities;
  }

  spawn(name: string, at: Vec3): IEntity | null {
    const def = this.opts.registry.get(name);
    if (!def) return null;
    const id = this.nextId++;
    const brain = def.brain(this.rng.fork(id));
    const entity = new Entity(id, def, brain, at, this.rng.next());
    this.entities.push(entity);
    return entity;
  }

  despawn(id: number): void {
    const i = this.entities.findIndex((e) => e.id === id);
    if (i >= 0) this.entities.splice(i, 1);
    this.reaping.delete(id);
  }

  clear(): void {
    this.entities.length = 0;
    this.reaping.clear();
  }

  query(box: AABB): readonly IEntity[] {
    return this.entities.filter((e) => !e.dead && aabbOverlap(e.aabb, box));
  }

  nearest(point: Vec3, radius: number): IEntity | null {
    let best: Entity | null = null;
    let bestDist = radius * radius;
    for (const e of this.entities) {
      if (e.dead) continue;
      const dx = e.position.x - point.x;
      const dy = e.position.y - point.y;
      const dz = e.position.z - point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  tick(ctx: EntityTickContext): void {
    const { dt, senses } = ctx;

    for (const e of this.entities) {
      e.age += dt;
      if (e.hurtTime > 0) e.hurtTime = Math.max(0, e.hurtTime - dt);
      if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      if (e.dead) {
        this.tickCorpse(e, dt);
        continue;
      }

      const intent = e.brain.think(e, senses, dt);
      const def = e.definition;

      // --- aim ---------------------------------------------------------
      if (intent.lookAt) {
        const dx = intent.lookAt.x - e.position.x;
        const dz = intent.lookAt.z - e.position.z;
        const desired = Math.atan2(-dx, -dz);
        e.yaw = turnToward(e.yaw, desired, TURN_RATE * dt);
        const dy = intent.lookAt.y + 1.4 - (e.position.y + (def.eyeHeight ?? def.height * 0.85));
        const flat = Math.hypot(dx, dz);
        e.headPitch = Math.atan2(dy, Math.max(flat, 1e-3));
      } else if (intent.throttle > 0) {
        const desired = Math.atan2(-intent.moveX, -intent.moveZ);
        e.yaw = turnToward(e.yaw, desired, TURN_RATE * dt);
      }
      e.headYaw = 0;
      e.attackAnim = intent.attack;

      // --- horizontal motion -------------------------------------------
      const targetSpeed = def.moveSpeed * clamp01(intent.throttle);
      const wantX = intent.moveX * targetSpeed;
      const wantZ = intent.moveZ * targetSpeed;
      if (intent.throttle > 0) {
        e.velocity.x = approach(e.velocity.x, wantX, ACCELERATION * dt);
        e.velocity.z = approach(e.velocity.z, wantZ, ACCELERATION * dt);
      } else if (e.onGround) {
        e.velocity.x = approach(e.velocity.x, 0, FRICTION * dt);
        e.velocity.z = approach(e.velocity.z, 0, FRICTION * dt);
      }

      // --- vertical motion ---------------------------------------------
      if (def.gravity === false) {
        // A flier steers vertically the same way it steers horizontally, and
        // bleeds off vertical speed when it stops asking for any.
        const wantY = intent.moveY * targetSpeed;
        if (intent.throttle > 0 && intent.moveY !== 0) {
          e.velocity.y = approach(e.velocity.y, wantY, ACCELERATION * dt);
        } else {
          e.velocity.y = approach(e.velocity.y, 0, FRICTION * 0.5 * dt);
        }
      } else {
        if (intent.jump && e.onGround) {
          e.velocity.y = def.jumpSpeed ?? 8.2;
          e.onGround = false;
        }
        e.velocity.y = Math.max(e.velocity.y - GRAVITY * dt, -TERMINAL_VELOCITY);
      }

      // --- resolve against the world ------------------------------------
      const before = { x: e.position.x, z: e.position.z };
      if (def.collides === false) {
        // Passes through terrain: integrate directly. Used by anything that
        // burrows, which cannot be blocked by the ground it is carving.
        e.position.x += e.velocity.x * dt;
        e.position.y += e.velocity.y * dt;
        e.position.z += e.velocity.z * dt;
        e.onGround = false;
        this.clampToBorder(e);
        e.distanceWalked += Math.hypot(e.position.x - before.x, e.position.z - before.z);
        this.resolveMelee(e, def, intent, senses);
        if (e.health <= 0) e.kill();
        if (e.dead) this.reaping.set(e.id, CORPSE_SECONDS);
        continue;
      }
      const result = this.collision.move(senses.voxels, {
        aabb: e.aabb,
        velocity: e.velocity,
        dt,
        stepHeight: def.stepHeight ?? 0.6,
      });
      e.position.x = result.position.x;
      e.position.y = result.position.y;
      e.position.z = result.position.z;
      e.velocity.x = result.velocity.x;
      e.velocity.y = result.velocity.y;
      e.velocity.z = result.velocity.z;
      e.onGround = result.onGround;
      this.clampToBorder(e);
      e.distanceWalked += Math.hypot(e.position.x - before.x, e.position.z - before.z);

      this.resolveMelee(e, def, intent, senses);

      if (e.health <= 0) e.kill();
      if (e.dead) this.reaping.set(e.id, CORPSE_SECONDS);
    }

    this.reap();
  }

  /**
   * Keep a creature inside the world border.
   *
   * Applies to everything, including fliers that pass through terrain: without
   * it a leviathan cruising on a long heading simply leaves the arena and sits
   * outside it where the player can never reach it. Reversing the velocity
   * rather than zeroing it turns the edge into a wall it bounces off, so it
   * keeps patrolling instead of grinding against the boundary.
   */
  private clampToBorder(e: Entity): void {
    if (!Number.isFinite(WORLD_BORDER)) return;
    const limit = WORLD_BORDER - e.definition.width * 0.5;
    if (e.position.x > limit) { e.position.x = limit; e.velocity.x = -Math.abs(e.velocity.x); }
    if (e.position.x < -limit) { e.position.x = -limit; e.velocity.x = Math.abs(e.velocity.x); }
    if (e.position.z > limit) { e.position.z = limit; e.velocity.z = -Math.abs(e.velocity.z); }
    if (e.position.z < -limit) { e.position.z = -limit; e.velocity.z = Math.abs(e.velocity.z); }
  }

  /** Land a contact hit on the player when one is in reach and off cooldown. */
  private resolveMelee(
    e: Entity,
    def: Entity['definition'],
    intent: { attack: number },
    senses: EntityTickContext['senses'],
  ): void {
    if (intent.attack <= 0 || e.attackCooldown > 0) return;
    const damage = def.attackDamage ?? 0;
    const player = senses.playerPosition;
    if (damage <= 0 || !player) return;
    const reach = (def.attackRange ?? 1.2) + def.width * 0.5;
    const gap = Math.hypot(player.x - e.position.x, player.z - e.position.z);
    const vertical = Math.abs(player.y - e.position.y);
    if (gap <= reach && vertical <= def.height + 0.5) {
      e.attackCooldown = def.attackCooldown ?? 1;
      this.opts.onAttackPlayer?.(e, damage);
    }
  }

  private tickCorpse(e: Entity, dt: number): void {
    e.deathTime += dt;
    // An entity can die from outside the tick (a player hit, a script). Start
    // its countdown here rather than only where the tick kills it, or such a
    // corpse would never be reaped.
    if (!this.reaping.has(e.id)) this.reaping.set(e.id, CORPSE_SECONDS);

    // Corpses still fall, so nothing dies mid-air and hangs there.
    if (e.definition.gravity !== false) {
      e.velocity.y = Math.max(e.velocity.y - GRAVITY * dt, -TERMINAL_VELOCITY);
      e.velocity.x = approach(e.velocity.x, 0, FRICTION * dt);
      e.velocity.z = approach(e.velocity.z, 0, FRICTION * dt);
    }
    const left = this.reaping.get(e.id);
    if (left !== undefined) this.reaping.set(e.id, left - dt);
  }

  private reap(): void {
    if (this.reaping.size === 0) return;
    for (const [id, left] of this.reaping) {
      if (left > 0) continue;
      const i = this.entities.findIndex((e) => e.id === id);
      if (i >= 0) {
        this.opts.onDeath?.(this.entities[i]);
        this.entities.splice(i, 1);
      }
      this.reaping.delete(id);
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

/** Rotate `from` toward `to` by at most `maxStep`, taking the short way round. */
function turnToward(from: number, to: number, maxStep: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}
