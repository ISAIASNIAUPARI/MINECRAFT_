import { AIR, WORLD_MAX_Y, WORLD_MIN_Y } from '../core/constants';
import { worldToChunk, worldToLocal } from '../core/math';
import type { BlockId, ChunkPos } from '../core/types';
import { ChunkManager } from './ChunkManager';
import type { ChunkGenerator, IChunkManager, IWorld } from './types';

export interface WorldOptions {
  seed: number;
  generator: ChunkGenerator;
  renderDistance?: number;
  simulationDistance?: number;
  onChunkReady?: (chunk: import('./types').IChunk) => void;
  onChunkUnload?: (chunk: import('./types').IChunk) => void;
}

/**
 * Facade over the chunk grid. Coordinate math lives here so gameplay code never
 * touches chunk indices directly.
 */
export class World implements IWorld {
  readonly seed: number;
  readonly chunks: IChunkManager;
  private readonly manager: ChunkManager;

  constructor(opts: WorldOptions) {
    this.seed = opts.seed;
    this.manager = new ChunkManager(opts.generator, {
      renderDistance: opts.renderDistance ?? 8,
      simulationDistance: opts.simulationDistance ?? 6,
      ...(opts.onChunkReady ? { onChunkReady: opts.onChunkReady } : {}),
      ...(opts.onChunkUnload ? { onChunkUnload: opts.onChunkUnload } : {}),
    });
    this.chunks = this.manager;
  }

  /** Force a radius of chunks resident right now (used for the initial spawn area). */
  ensureSpawnArea(center: ChunkPos, radius: number): void {
    this.manager.ensureImmediate(center, radius);
  }

  getBlock(x: number, y: number, z: number): BlockId {
    if (y < WORLD_MIN_Y || y >= WORLD_MAX_Y) return AIR;
    const chunk = this.chunks.get(worldToChunk(x), worldToChunk(y), worldToChunk(z));
    if (!chunk) return AIR;
    return chunk.getBlock(worldToLocal(x), worldToLocal(y), worldToLocal(z));
  }

  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (y < WORLD_MIN_Y || y >= WORLD_MAX_Y) return false;
    const cx = worldToChunk(x);
    const cy = worldToChunk(y);
    const cz = worldToChunk(z);
    const chunk = this.chunks.get(cx, cy, cz);
    if (!chunk) return false;
    const lx = worldToLocal(x);
    const ly = worldToLocal(y);
    const lz = worldToLocal(z);
    const changed = chunk.setBlock(lx, ly, lz, id);
    if (changed) {
      // Mark neighbour chunks dirty when the edit is on a border so their meshes reculled.
      if (lx === 0) this.markDirty(cx - 1, cy, cz);
      else if (lx === 15) this.markDirty(cx + 1, cy, cz);
      if (ly === 0) this.markDirty(cx, cy - 1, cz);
      else if (ly === 15) this.markDirty(cx, cy + 1, cz);
      if (lz === 0) this.markDirty(cx, cy, cz - 1);
      else if (lz === 15) this.markDirty(cx, cy, cz + 1);
    }
    return changed;
  }

  isLoaded(x: number, y: number, z: number): boolean {
    return this.chunks.has(worldToChunk(x), worldToChunk(y), worldToChunk(z));
  }

  getSurfaceY(x: number, z: number): number {
    for (let y = WORLD_MAX_Y - 1; y >= WORLD_MIN_Y; y--) {
      if (this.getBlock(x, y, z) !== AIR) return y;
    }
    return WORLD_MIN_Y - 1;
  }

  update(center: ChunkPos): void {
    this.chunks.update(center);
  }

  tick(_dt: number): void {
    // Phase 2: fluid ticks, random block ticks, scheduled updates.
  }

  dispose(): void {
    this.chunks.dispose();
  }

  private markDirty(cx: number, cy: number, cz: number): void {
    const c = this.chunks.get(cx, cy, cz);
    if (c) c.meshDirty = true;
  }
}
