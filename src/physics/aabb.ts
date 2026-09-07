import type { AABB, Vec3 } from '../core/types';

export function makeAABB(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Box centered on X/Z at `pos`, sitting on `pos.y` (feet), with the given footprint + height. */
export function aabbFromFeet(pos: Vec3, width: number, height: number): AABB {
  const half = width / 2;
  return {
    minX: pos.x - half,
    minY: pos.y,
    minZ: pos.z - half,
    maxX: pos.x + half,
    maxY: pos.y + height,
    maxZ: pos.z + half,
  };
}

export function translateAABB(box: AABB, dx: number, dy: number, dz: number): AABB {
  return {
    minX: box.minX + dx,
    minY: box.minY + dy,
    minZ: box.minZ + dz,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
    maxZ: box.maxZ + dz,
  };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/** The unit-cube AABB for a block position. */
export function blockAABB(x: number, y: number, z: number): AABB {
  return { minX: x, minY: y, minZ: z, maxX: x + 1, maxY: y + 1, maxZ: z + 1 };
}
