import type { AABB, Vec3 } from '../core/types';
import { aabbFromFeet } from '../physics/aabb';
import type { Brain, CreatureDefinition, IEntity } from './types';

/**
 * A spawned creature. Holds only state — all motion, animation and rendering is
 * driven from the outside, so a creature definition never has to touch physics.
 */
export class Entity implements IEntity {
  readonly position: Vec3;
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  headYaw = 0;
  headPitch = 0;
  health: number;
  onGround = false;
  age = 0;
  distanceWalked = 0;
  dead = false;

  /** Seconds remaining before this entity may attack again. */
  attackCooldown = 0;
  /** 0..1 attack animation drive, written by the manager from the brain's intent. */
  attackAnim = 0;
  /** Seconds of red damage flash remaining. */
  hurtTime = 0;
  /** Per-instance constant so clones don't animate in lockstep. */
  readonly phase: number;

  constructor(
    readonly id: number,
    readonly definition: CreatureDefinition,
    readonly brain: Brain,
    spawnAt: Vec3,
    phase: number,
  ) {
    this.position = { x: spawnAt.x, y: spawnAt.y, z: spawnAt.z };
    this.health = definition.maxHealth;
    this.phase = phase;
  }

  get aabb(): AABB {
    return aabbFromFeet(this.position, this.definition.width, this.definition.height);
  }

  /** Eye position — where sight rays start. */
  get eyePosition(): Vec3 {
    const eye = this.definition.eyeHeight ?? this.definition.height * 0.85;
    return { x: this.position.x, y: this.position.y + eye, z: this.position.z };
  }

  hurt(amount: number, source: Vec3 | null = null): void {
    if (this.dead || amount <= 0) return;
    this.health -= amount;
    this.hurtTime = 0.35;
    this.brain.onHurt?.(this, amount, source);

    if (source) {
      // Knock back away from the source, with a small upward kick.
      const dx = this.position.x - source.x;
      const dz = this.position.z - source.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        const push = 4.5;
        this.velocity.x += (dx / len) * push;
        this.velocity.z += (dz / len) * push;
        this.velocity.y = Math.max(this.velocity.y, 4);
      }
    }

    if (this.health <= 0) this.kill();
  }

  kill(): void {
    this.health = 0;
    this.dead = true;
  }
}
