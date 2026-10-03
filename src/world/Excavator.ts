import { createRng, hashInts } from '../core/rng';
import type { BlockId, Vec3 } from '../core/types';
import type { IBlockRegistry } from '../blocks/types';
import type { IWorld } from '../engine/types';

/**
 * Bounded terrain destruction.
 *
 * Every carve is capped three ways — radius, a hard block budget, and a list of
 * block ids it refuses to touch — because the obvious implementation of "a
 * creature destroys the ground" is an unbounded flood fill that stalls the
 * frame and eats bedrock. Nothing here ever searches outside the volume it was
 * given, and the caller cannot ask for more than {@link MAX_BLOCK_BUDGET}.
 *
 * It is a thin wrapper over the existing `world.setBlock`, not a second block
 * system: the chunks it touches are marked dirty and remesh through the normal
 * path.
 */

/** No single carve may ever remove more than this, whatever it is asked for. */
export const MAX_BLOCK_BUDGET = 1400;

export interface CarveOptions {
  /** Centre of the sphere, in world coordinates. */
  at: Vec3;
  /** Sphere radius in blocks. Clamped to something sane. */
  radius: number;
  /**
   * Stretch along this direction, so a diving creature leaves an elongated
   * shaft rather than a perfect ball. Omit for a sphere.
   */
  along?: Vec3;
  /** How much longer the volume is along `along`. 1 = sphere. */
  elongation?: number;
  /** Hard cap for this carve, further clamped by {@link MAX_BLOCK_BUDGET}. */
  budget?: number;
  /** Seed, so the ragged edge is deterministic for a given impact. */
  seed?: number;
}

export interface CarveResult {
  /** How many blocks were actually removed. */
  removed: number;
  /** True when the budget ran out before the volume was finished. */
  truncated: boolean;
}

export class Excavator {
  /** Blocks that are never removed, by numeric id. */
  private readonly protectedIds = new Set<BlockId>();

  constructor(
    private readonly world: IWorld,
    blocks: IBlockRegistry,
    /** Names of blocks a carve must never touch. */
    protectedNames: readonly string[] = ['voxelia:bedrock'],
  ) {
    for (const name of protectedNames) {
      const id = blocks.byName(name)?.numericId;
      if (id !== undefined) this.protectedIds.add(id);
    }
  }

  /**
   * Remove a roughly spherical volume, ragged at the edge so it reads as
   * something tore through rather than a modelled cylinder.
   */
  carve(opts: CarveOptions): CarveResult {
    const radius = Math.max(0, Math.min(opts.radius, 24));
    if (radius <= 0) return { removed: 0, truncated: false };

    const budget = Math.min(opts.budget ?? MAX_BLOCK_BUDGET, MAX_BLOCK_BUDGET);
    const elong = Math.max(1, opts.elongation ?? 1);
    const cx = Math.floor(opts.at.x);
    const cy = Math.floor(opts.at.y);
    const cz = Math.floor(opts.at.z);

    // Normalise the stretch axis once; a zero vector degrades to a sphere.
    let ax = 0;
    let ay = 0;
    let az = 0;
    if (opts.along) {
      const len = Math.hypot(opts.along.x, opts.along.y, opts.along.z);
      if (len > 1e-4) {
        ax = opts.along.x / len;
        ay = opts.along.y / len;
        az = opts.along.z / len;
      }
    }
    const stretched = ax !== 0 || ay !== 0 || az !== 0;

    // The bounding box is the only thing ever iterated. It is derived from the
    // radius, so the cost of a carve is fixed by its arguments, never by the
    // world.
    const reach = Math.ceil(radius * elong) + 1;
    const rng = createRng(hashInts(opts.seed ?? 0, cx, cy, cz));

    let removed = 0;
    let truncated = false;

    for (let x = cx - reach; x <= cx + reach; x++) {
      for (let y = cy - reach; y <= cy + reach; y++) {
        for (let z = cz - reach; z <= cz + reach; z++) {
          if (removed >= budget) {
            truncated = true;
            break;
          }
          const dx = x - opts.at.x;
          const dy = y - opts.at.y;
          const dz = z - opts.at.z;

          // Squash the offset perpendicular to the axis so the volume becomes a
          // capsule pointing the way the creature was travelling.
          let d2: number;
          if (stretched) {
            const along = dx * ax + dy * ay + dz * az;
            const px = dx - along * ax;
            const py = dy - along * ay;
            const pz = dz - along * az;
            d2 = (along / elong) ** 2 + px * px + py * py + pz * pz;
          } else {
            d2 = dx * dx + dy * dy + dz * dz;
          }

          // A ragged rim: blocks near the surface survive at random, so the
          // hole never looks machined.
          const edge = Math.sqrt(d2) / radius;
          if (edge > 1) continue;
          if (edge > 0.72 && rng.chance(edge - 0.52)) continue;

          const id = this.world.getBlock(x, y, z);
          if (id === 0 || this.protectedIds.has(id)) continue;
          if (this.world.setBlock(x, y, z, 0)) removed++;
        }
        if (removed >= budget) break;
      }
      if (removed >= budget) break;
    }

    return { removed, truncated };
  }
}
