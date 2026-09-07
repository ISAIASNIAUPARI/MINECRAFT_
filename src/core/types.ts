/**
 * Core primitive types shared by every subsystem.
 *
 * These are intentionally plain aliases (not branded types) so that code written
 * independently by different modules composes without friction.
 */

/** Index into the block registry. Stored in a `Uint16Array` (0..65535). `0` is always air. */
export type BlockId = number;

/** Index into the item registry. */
export type ItemId = number;

/** A mutable 3D vector / point in world space. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type ReadonlyVec3 = Readonly<Vec3>;

/** Integer block position in world space. */
export interface BlockPos {
  x: number;
  y: number;
  z: number;
}

/** Integer chunk position in the chunk grid. */
export interface ChunkPos {
  cx: number;
  cy: number;
  cz: number;
}

/** Axis-aligned bounding box in world space. */
export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** The six axis-aligned face directions. Values are stable and index `DIRECTIONS`/`DIRECTION_VECTORS`. */
export enum Direction {
  Down = 0,
  Up = 1,
  North = 2,
  South = 3,
  West = 4,
  East = 5,
}

export const DIRECTIONS: readonly Direction[] = [
  Direction.Down,
  Direction.Up,
  Direction.North,
  Direction.South,
  Direction.West,
  Direction.East,
];

/** Unit offset for each {@link Direction}. North is -Z, South is +Z, West is -X, East is +X. */
export const DIRECTION_VECTORS: readonly ReadonlyVec3[] = [
  { x: 0, y: -1, z: 0 }, // Down
  { x: 0, y: 1, z: 0 }, // Up
  { x: 0, y: 0, z: -1 }, // North
  { x: 0, y: 0, z: 1 }, // South
  { x: -1, y: 0, z: 0 }, // West
  { x: 1, y: 0, z: 0 }, // East
];

export const OPPOSITE_DIRECTION: readonly Direction[] = [
  Direction.Up,
  Direction.Down,
  Direction.South,
  Direction.North,
  Direction.East,
  Direction.West,
];

/** Game modes. Survival is the default; the rest arrive in later phases but the enum is fixed now. */
export enum GameMode {
  Survival = 'survival',
  Creative = 'creative',
  Adventure = 'adventure',
  Spectator = 'spectator',
}

export enum Difficulty {
  Peaceful = 'peaceful',
  Easy = 'easy',
  Normal = 'normal',
  Hard = 'hard',
}

/** A disposable resource. */
export interface Disposable {
  dispose(): void;
}

/** Anything driven by the fixed-timestep simulation clock. */
export interface Tickable {
  /** @param dt seconds elapsed for this tick (constant: {@link TICK_DURATION_MS} / 1000) */
  tick(dt: number): void;
}
