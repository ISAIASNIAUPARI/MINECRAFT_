/**
 * CONTRACT — the box-model primitives.
 *
 * Shared by creatures and by the first-person weapon, because they are the same
 * thing: a tree of boxes with a pivot each, posed per frame. Anything that is
 * about a *creature* (stats, brains, spawning) stays in `entities/types.ts`.
 */

/**
 * Model space is 1/16 of a block per unit, the same scale a voxel texture tile
 * uses, so a 16-unit cube is exactly one block. Y is up; the origin sits at the
 * entity's feet, centred on X/Z.
 */
export const MODEL_UNIT = 1 / 16;

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
