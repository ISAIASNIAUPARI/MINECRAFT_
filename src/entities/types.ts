import type { AABB, Vec3 } from '../core/types';
import type { Rng } from '../core/rng';
import type { VoxelView } from '../physics/types';

/**
 * CONTRACT — living things in the world: their model, their stats, their brain.
 *
 * A creature is declared, never hand-wired: a {@link CreatureDefinition} gives
 * the engine a box model, a stat block and a behaviour factory, and everything
 * else (spawning, physics, animation, rendering, damage, despawn) is handled by
 * {@link IEntityManager}. Adding a creature means adding one definition file.
 */

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * Model space is 1/16 of a block per unit, the same scale a voxel texture tile
 * uses, so a 16-unit cube is exactly one block. Y is up; the origin sits at the
 * entity's feet, centred on X/Z.
 */
export const MODEL_UNIT = 1 / 16;

/** How long a corpse lingers before it is reaped. Death animations run over this. */
export const CORPSE_SECONDS = 1.1;

/** RGB in 0..255. */
export type Rgb = readonly [number, number, number];

/**
 * One box in a creature's model, positioned relative to its parent's pivot.
 *
 * `pivot` is where the part rotates around; `origin` is where the box's
 * near-bottom-left corner sits relative to that pivot. Keeping the two separate
 * is what lets a head swivel around the neck rather than around its own corner.
 */
export interface ModelPart {
  /** Unique within the model — animations address parts by this name. */
  name: string;
  /** Box dimensions in model units `[x, y, z]`. */
  size: readonly [number, number, number];
  /** Rotation origin, relative to the parent's pivot (or the feet for a root). */
  pivot: readonly [number, number, number];
  /** Box corner relative to this part's pivot. Defaults to centring on X/Z at the pivot. */
  origin?: readonly [number, number, number];
  /** Flat colour for the box. Used when `texture` is absent. */
  color?: Rgb;
  /** Atlas texture key. Falls back to `color` when the atlas has no such key. */
  texture?: string;
  /** Rendered semi-transparent (wisps, ghosts). 1 = opaque. */
  opacity?: number;
  /** Emits its own light — unaffected by scene lighting. For glowing eyes. */
  emissive?: boolean;
  /** Resting rotation in radians, applied before any animation. */
  rotation?: readonly [number, number, number];
  children?: readonly ModelPart[];
}

/** Inputs an animation gets each frame. */
export interface AnimationContext {
  /** Seconds since the entity spawned. Drives idle/ambient motion. */
  age: number;
  /** Horizontal speed in blocks/second. Drives gait. */
  speed: number;
  /**
   * Distance walked in blocks, accumulated. Use this (not `age`) to drive limb
   * swing so the gait stays in step when the creature speeds up or stops.
   */
  distance: number;
  /** Head aim relative to the body, radians. */
  headYaw: number;
  headPitch: number;
  /** True while the entity is off the ground. */
  airborne: boolean;
  /** 0 while idle, ramping to 1 over an attack's wind-up and swing. */
  attack: number;
  /** 1 at the instant of a hit, decaying to 0. Drives a flinch. */
  hurt: number;
  /** True once killed — drive a death pose from here. */
  dead: boolean;
  /**
   * 0 at the moment of death, reaching 1 as the corpse is reaped. A boolean
   * cannot drive a collapse, so this is what a death animation keys off.
   */
  deathProgress: number;
  /** Per-entity constant in 0..1, so clones of one creature don't move in lockstep. */
  phase: number;
}

/**
 * A mutable pose for one part. Animations write into these.
 *
 * **Rotation convention.** -Z is forward. For a part that hangs *below* its
 * pivot (an arm, a leg), **positive `rotX` swings it forward** and negative
 * swings it back. For a part that rises *above* its pivot (torso, head), it is
 * the other way round: **negative `rotX` leans it forward**. Reaching for the
 * player is therefore `+rotX` on an arm and `-rotX` on the hips. Getting this
 * backwards makes a creature claw at the sky instead of at the player, and it
 * looks plausible in code, so check a pose in-game before trusting it.
 */
export interface PartPose {
  rotX: number;
  rotY: number;
  rotZ: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  visible: boolean;
}

/** Writes the pose for a frame. Addressed parts are reset before each call. */
export type Animator = (pose: (part: string) => PartPose, ctx: AnimationContext) => void;

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

/** What an entity wants to do this tick. The manager turns this into motion. */
export interface Intent {
  /** Desired horizontal direction, unit-ish. Zero = stand still. */
  moveX: number;
  moveZ: number;
  /** Fraction of `moveSpeed` to use, 0..1. */
  throttle: number;
  /** Request a jump this tick (honoured only when on the ground). */
  jump: boolean;
  /** Where to look. `null` keeps the current facing. */
  lookAt: Vec3 | null;
  /** Set while winding up or swinging an attack, 0..1. Drives the attack animation. */
  attack: number;
}

/**
 * The player as a brain perceives them: where they stand and where they face.
 * Facing matters because some creatures only move while unobserved.
 */
export interface PlayerSense extends Vec3 {
  /** Camera yaw in radians, same convention as the camera (0 = looking -Z). */
  yaw: number;
}

/** Read-only view of the world a brain is allowed to consult. */
export interface BrainSenses {
  readonly voxels: VoxelView;
  /** The player, or `null` when there is no player. */
  readonly playerPosition: PlayerSense | null;
  /** Sky light at a position, 0..15. Darkness is what horror creatures key off. */
  lightAt(x: number, y: number, z: number): number;
  /** Straight-line sight test between two points, blocked by solid voxels. */
  canSee(from: Vec3, to: Vec3, maxDistance: number): boolean;
  /** Seconds of world time elapsed, and time-of-day in 0..1. */
  readonly elapsed: number;
  readonly timeOfDay: number;
}

/**
 * A creature's brain. Called once per tick; returns what it wants to do.
 * Implementations are plain objects, so they can hold whatever state they like.
 */
export interface Brain {
  /** Human-readable current state, surfaced in the debug HUD. */
  readonly state: string;
  think(self: IEntity, senses: BrainSenses, dt: number): Intent;
  /** Reacts to being hurt. Optional. */
  onHurt?(self: IEntity, amount: number, source: Vec3 | null): void;
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

/** Where a creature is allowed to appear. */
export interface SpawnRule {
  /** Biome ids it may spawn in. Empty = any. */
  biomes?: readonly string[];
  /** Inclusive sky-light range, 0..15. Horror mobs want the dark end. */
  minLight?: number;
  maxLight?: number;
  /** Inclusive world-Y band. */
  minY?: number;
  maxY?: number;
  /** Never spawn closer to the player than this (blocks). */
  minPlayerDistance?: number;
  /** Never spawn further than this — beyond it, nothing is simulated anyway. */
  maxPlayerDistance?: number;
  /** Relative weight against other eligible creatures. */
  weight?: number;
  /** How many may exist near the player at once. */
  maxNearby?: number;
  /** Members per spawn attempt. */
  groupMin?: number;
  groupMax?: number;
}

export interface CreatureDefinition {
  /** Namespaced id, e.g. `voxelia:hollow`. */
  name: string;
  displayName: string;
  /** Collision box, in blocks. */
  width: number;
  height: number;
  /** Eye height above the feet, in blocks — where sight rays start. */
  eyeHeight?: number;
  maxHealth: number;
  /** Blocks per second at full throttle. */
  moveSpeed: number;
  /** Initial upward velocity for a jump, blocks/second. */
  jumpSpeed?: number;
  /** Ledge height it can walk up without jumping, in blocks. */
  stepHeight?: number;
  /** Contact damage per hit, and seconds between hits. */
  attackDamage?: number;
  attackCooldown?: number;
  /** Reach for a melee hit, in blocks, measured between box edges. */
  attackRange?: number;
  /** Falls under gravity. Set false for anything that floats. */
  gravity?: boolean;
  /** Model root parts, in model units. */
  model: readonly ModelPart[];
  /** Per-frame pose. Omitted = a static model. */
  animate?: Animator;
  /**
   * Set when {@link animate} poses its own death from `ctx.dead`. Otherwise the
   * renderer tips the corpse over, so a kill always reads even for a creature
   * that has no death animation.
   */
  animatesDeath?: boolean;
  /** Builds a fresh brain per spawned instance. */
  brain: (rng: Rng) => Brain;
  spawn?: SpawnRule;
  /** Items dropped on death: item name -> count range. */
  drops?: readonly { item: string; min: number; max: number; chance: number }[];
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface IEntity {
  readonly id: number;
  readonly definition: CreatureDefinition;
  /** Feet position, centred on X/Z. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Body facing and head aim, radians. */
  yaw: number;
  headYaw: number;
  headPitch: number;
  health: number;
  readonly onGround: boolean;
  /** Seconds alive. */
  readonly age: number;
  /** Blocks walked, for gait timing. */
  readonly distanceWalked: number;
  readonly dead: boolean;
  readonly brain: Brain;
  readonly aabb: AABB;
  /** Apply damage. `source` is the attacker's position, for knockback and aggro. */
  hurt(amount: number, source?: Vec3 | null): void;
  kill(): void;
}

export interface IEntityRegistry {
  register(def: CreatureDefinition): void;
  get(name: string): CreatureDefinition | undefined;
  readonly all: readonly CreatureDefinition[];
  finalize(): void;
}

export interface EntityTickContext {
  dt: number;
  senses: BrainSenses;
}

export interface IEntityManager {
  readonly all: readonly IEntity[];
  /** Spawn by definition name. Returns `null` when the name is unknown. */
  spawn(name: string, at: Vec3): IEntity | null;
  despawn(id: number): void;
  tick(ctx: EntityTickContext): void;
  /** Entities whose box overlaps `box`. */
  query(box: AABB): readonly IEntity[];
  /** Nearest entity to a point within `radius`, or `null`. */
  nearest(point: Vec3, radius: number): IEntity | null;
  clear(): void;
}
