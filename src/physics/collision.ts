import type { AABB, Vec3 } from '../core/types';
import { aabbOverlap, blockAABB } from './aabb';
import type { ICollisionResolver, MoveResult, PhysicsBodyInput, VoxelView } from './types';

const EPS = 1e-3;

/**
 * SKELETON — axis-separated swept AABB against solid voxels. Move one axis,
 * snap to the contact face on collision, repeat. Sub-stepped so fast bodies
 * cannot tunnel. Phase 1 (Agent: player/physics) adds step-up, crouch-edge
 * protection, fluid drag and a proper contact manifold.
 */
export class CollisionResolver implements ICollisionResolver {
  move(world: VoxelView, body: PhysicsBodyInput): MoveResult {
    const box: AABB = { ...body.aabb };
    const vel: Vec3 = { ...body.velocity };
    let dx = vel.x * body.dt;
    let dy = vel.y * body.dt;
    let dz = vel.z * body.dt;

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.25));
    dx /= steps;
    dy /= steps;
    dz /= steps;

    const result: MoveResult = {
      position: { x: 0, y: 0, z: 0 },
      velocity: vel,
      collidedX: false,
      collidedY: false,
      collidedZ: false,
      onGround: false,
    };

    for (let s = 0; s < steps; s++) {
      // Y
      box.minY += dy;
      box.maxY += dy;
      for (const b of solidCells(world, box)) {
        if (!aabbOverlap(box, b)) continue;
        if (dy > 0) {
          const shift = b.minY - box.maxY - EPS;
          box.minY += shift;
          box.maxY += shift;
        } else if (dy < 0) {
          const shift = b.maxY - box.minY + EPS;
          box.minY += shift;
          box.maxY += shift;
          result.onGround = true;
        }
        vel.y = 0;
        dy = 0;
        result.collidedY = true;
      }
      // X
      box.minX += dx;
      box.maxX += dx;
      for (const b of solidCells(world, box)) {
        if (!aabbOverlap(box, b)) continue;
        if (dx > 0) {
          const shift = b.minX - box.maxX - EPS;
          box.minX += shift;
          box.maxX += shift;
        } else if (dx < 0) {
          const shift = b.maxX - box.minX + EPS;
          box.minX += shift;
          box.maxX += shift;
        }
        vel.x = 0;
        dx = 0;
        result.collidedX = true;
      }
      // Z
      box.minZ += dz;
      box.maxZ += dz;
      for (const b of solidCells(world, box)) {
        if (!aabbOverlap(box, b)) continue;
        if (dz > 0) {
          const shift = b.minZ - box.maxZ - EPS;
          box.minZ += shift;
          box.maxZ += shift;
        } else if (dz < 0) {
          const shift = b.maxZ - box.minZ + EPS;
          box.minZ += shift;
          box.maxZ += shift;
        }
        vel.z = 0;
        dz = 0;
        result.collidedZ = true;
      }
    }

    if (!result.onGround) {
      const probe: AABB = { ...box, minY: box.minY - 0.06, maxY: box.minY };
      if ([...solidCells(world, probe)].some((b) => aabbOverlap(probe, b))) result.onGround = true;
    }

    const width = box.maxX - box.minX;
    result.position = { x: box.minX + width / 2, y: box.minY, z: box.minZ + width / 2 };
    return result;
  }

  intersectsSolid(world: VoxelView, box: AABB): boolean {
    for (const b of solidCells(world, box)) if (aabbOverlap(box, b)) return true;
    return false;
  }
}

function* solidCells(world: VoxelView, box: AABB): Generator<AABB> {
  const minX = Math.floor(box.minX - 1);
  const maxX = Math.floor(box.maxX + 1);
  const minY = Math.floor(box.minY - 1);
  const maxY = Math.floor(box.maxY + 1);
  const minZ = Math.floor(box.minZ - 1);
  const maxZ = Math.floor(box.maxZ + 1);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (world.isSolid(x, y, z)) yield blockAABB(x, y, z);
      }
    }
  }
}
