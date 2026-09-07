import type { AABB, BlockPos, Vec3, Direction } from '../core/types';
import type { BlockId } from '../core/types';

/**
 * CONTRACT — collision + raycasting against the voxel world. Consumed by player
 * (movement, block targeting) and Phase 2 entities.
 */

/** Minimal read model the physics code needs from the world. */
export interface VoxelView {
  getBlock(x: number, y: number, z: number): BlockId;
  /** Full-cube solid check for collision. */
  isSolid(x: number, y: number, z: number): boolean;
}

export interface MoveResult {
  /** Corrected position after resolving collisions. */
  position: Vec3;
  /** Corrected velocity (components zeroed on contact). */
  velocity: Vec3;
  collidedX: boolean;
  collidedY: boolean;
  collidedZ: boolean;
  /** True when the entity is resting on the ground this step. */
  onGround: boolean;
}

export interface PhysicsBodyInput {
  aabb: AABB; // current world-space box
  velocity: Vec3; // blocks/second
  /** Seconds for this step. */
  dt: number;
  /** Step up onto 0.5-block ledges without jumping (player QoL). */
  stepHeight?: number;
}

/** Swept-AABB voxel collision resolver. */
export interface ICollisionResolver {
  move(world: VoxelView, body: PhysicsBodyInput): MoveResult;
  /** Any solid voxel overlapping the box? */
  intersectsSolid(world: VoxelView, box: AABB): boolean;
}

export interface VoxelRaycastHit {
  /** Block that was hit. */
  block: BlockPos;
  blockId: BlockId;
  /** Face of that block the ray entered through. */
  face: Direction;
  /** Unit normal of that face. */
  normal: Vec3;
  /** Exact world-space contact point. */
  point: Vec3;
  /** Distance from ray origin. */
  distance: number;
  /** The empty cell adjacent to `face` — where a placed block would go. */
  placement: BlockPos;
}

/**
 * DDA voxel raycast (Amanatides & Woo). Returns the first block for which
 * `predicate` is true (default: any non-air), or `null` within `maxDistance`.
 */
export type VoxelRaycast = (
  world: VoxelView,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  predicate?: (id: BlockId, x: number, y: number, z: number) => boolean,
) => VoxelRaycastHit | null;
