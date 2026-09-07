import { describe, expect, it } from 'vitest';
import { raycastVoxel } from '../src/physics/raycast';
import { CollisionResolver } from '../src/physics/collision';
import type { VoxelView } from '../src/physics/types';

/** A single solid block at (0,0,0). */
const oneBlock: VoxelView = {
  getBlock: (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0),
  isSolid: (x, y, z) => x === 0 && y === 0 && z === 0,
};

describe('voxel raycast', () => {
  it('hits a block straight ahead and reports the entry face', () => {
    const hit = raycastVoxel(oneBlock, { x: -3, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 10);
    expect(hit).not.toBeNull();
    expect(hit!.block).toEqual({ x: 0, y: 0, z: 0 });
    expect(hit!.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(hit!.placement).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('misses when the ray points away', () => {
    const hit = raycastVoxel(oneBlock, { x: -3, y: 0.5, z: 0.5 }, { x: -1, y: 0, z: 0 }, 10);
    expect(hit).toBeNull();
  });

  it('respects maxDistance', () => {
    const hit = raycastVoxel(oneBlock, { x: -30, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 5);
    expect(hit).toBeNull();
  });
});

describe('collision resolver', () => {
  it('stops a downward-moving body on top of a floor', () => {
    const floor: VoxelView = {
      getBlock: (_x, y) => (y < 0 ? 1 : 0),
      isSolid: (_x, y) => y < 0,
    };
    const resolver = new CollisionResolver();
    const res = resolver.move(floor, {
      aabb: { minX: -0.3, minY: 2, minZ: -0.3, maxX: 0.3, maxY: 3.8, maxZ: 0.3 },
      velocity: { x: 0, y: -20, z: 0 },
      dt: 0.5,
    });
    expect(res.onGround).toBe(true);
    expect(res.position.y).toBeGreaterThanOrEqual(-0.01);
    expect(res.position.y).toBeLessThan(0.1);
    expect(res.velocity.y).toBe(0);
  });
});
