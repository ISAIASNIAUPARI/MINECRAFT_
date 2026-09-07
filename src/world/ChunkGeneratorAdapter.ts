import { CHUNK_SIZE } from '../core/constants';
import { chunkToWorldOrigin, worldToLocal } from '../core/math';
import { createRng, hashInts } from '../core/rng';
import type { BlockId, ChunkPos } from '../core/types';
import type { ChunkGenerator, IChunkData } from '../engine/types';
import type { DecorationEditor, IWorldGenerator } from './types';

/**
 * SKELETON bridge from {@link IWorldGenerator} (terrain + decorate passes) to the
 * engine's synchronous {@link ChunkGenerator}. Decoration writes that fall
 * outside this chunk are dropped here — Phase 1 (Agents: engine + worldgen) move
 * this to a two-phase, neighbour-aware, off-thread pipeline.
 */
export class ChunkGeneratorAdapter implements ChunkGenerator {
  constructor(private readonly gen: IWorldGenerator) {}

  generateChunk(data: IChunkData, pos: ChunkPos): void {
    this.gen.generateTerrain(data, pos);

    const ox = chunkToWorldOrigin(pos.cx);
    const oy = chunkToWorldOrigin(pos.cy);
    const oz = chunkToWorldOrigin(pos.cz);

    const inBounds = (x: number, y: number, z: number) =>
      x >= ox && x < ox + CHUNK_SIZE && y >= oy && y < oy + CHUNK_SIZE && z >= oz && z < oz + CHUNK_SIZE;

    const editor: DecorationEditor = {
      get: (x, y, z) =>
        inBounds(x, y, z) ? data.get(worldToLocal(x), worldToLocal(y), worldToLocal(z)) : 0,
      set: (x, y, z, id) => {
        if (inBounds(x, y, z)) data.set(worldToLocal(x), worldToLocal(y), worldToLocal(z), id);
      },
      setIfAir: (x, y, z, id) => {
        if (inBounds(x, y, z) && data.get(worldToLocal(x), worldToLocal(y), worldToLocal(z)) === 0) {
          data.set(worldToLocal(x), worldToLocal(y), worldToLocal(z), id as BlockId);
        }
      },
      rng: createRng(hashInts(this.gen.seed, pos.cx, pos.cy, pos.cz, 99)),
    };
    this.gen.decorate(pos, editor);
  }
}
