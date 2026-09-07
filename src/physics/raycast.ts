import { Direction } from '../core/types';
import type { Vec3 } from '../core/types';
import type { VoxelRaycast, VoxelRaycastHit, VoxelView } from './types';

/**
 * Amanatides & Woo voxel traversal. Steps cell-to-cell along the ray and returns
 * the first cell matching `predicate` (default: any non-air block).
 * http://www.cse.yorku.ca/~amana/research/grid.pdf
 */
export const raycastVoxel: VoxelRaycast = (
  world: VoxelView,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  predicate?: (id: number, x: number, y: number, z: number) => boolean,
): VoxelRaycastHit | null => {
  const test = predicate ?? ((id: number) => id !== 0);

  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (len === 0) return null;
  const dx = direction.x / len;
  const dy = direction.y / len;
  const dz = direction.z / len;

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  const distToBoundary = (o: number, s: number) => (s > 0 ? Math.ceil(o) - o : o - Math.floor(o));
  let tMaxX = dx !== 0 ? distToBoundary(origin.x, stepX) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? distToBoundary(origin.y, stepY) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? distToBoundary(origin.z, stepZ) * tDeltaZ : Infinity;

  let face: Direction = Direction.Up;
  let t = 0;

  // Check the starting cell.
  {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && test(id, x, y, z)) {
      return buildHit(x, y, z, id, Direction.Up, origin, dx, dy, dz, 0);
    }
  }

  while (t <= maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      face = stepX > 0 ? Direction.West : Direction.East;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      face = stepY > 0 ? Direction.Down : Direction.Up;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      face = stepZ > 0 ? Direction.North : Direction.South;
    }
    if (t > maxDistance) break;

    const id = world.getBlock(x, y, z);
    if (id !== 0 && test(id, x, y, z)) {
      return buildHit(x, y, z, id, face, origin, dx, dy, dz, t);
    }
  }
  return null;
};

const FACE_NORMALS: Record<Direction, Vec3> = {
  [Direction.Down]: { x: 0, y: -1, z: 0 },
  [Direction.Up]: { x: 0, y: 1, z: 0 },
  [Direction.North]: { x: 0, y: 0, z: -1 },
  [Direction.South]: { x: 0, y: 0, z: 1 },
  [Direction.West]: { x: -1, y: 0, z: 0 },
  [Direction.East]: { x: 1, y: 0, z: 0 },
};

function buildHit(
  x: number,
  y: number,
  z: number,
  id: number,
  face: Direction,
  origin: Vec3,
  dx: number,
  dy: number,
  dz: number,
  t: number,
): VoxelRaycastHit {
  const normal = FACE_NORMALS[face];
  return {
    block: { x, y, z },
    blockId: id,
    face,
    normal: { ...normal },
    point: { x: origin.x + dx * t, y: origin.y + dy * t, z: origin.z + dz * t },
    distance: t,
    placement: { x: x + normal.x, y: y + normal.y, z: z + normal.z },
  };
}
