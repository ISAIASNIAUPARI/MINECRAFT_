import { createLogger } from '../core/Logger';
import { chunkKey } from '../core/math';
import type { ChunkPos } from '../core/types';
import { Chunk } from './Chunk';
import {
  ChunkStage,
  type ChunkGenerator,
  type ChunkManagerOptions,
  type IChunk,
  type IChunkManager,
} from './types';

const logv = createLogger('engine:chunks');

/**
 * SKELETON — radius-based streaming with a per-frame generation budget so a big
 * render distance never freezes the first frame. Generation is still synchronous
 * on the main thread. Phase 1 (Agent: engine) moves generation to a Worker pool,
 * adds save/restore, and a real priority queue. {@link IChunkManager} is frozen.
 */
export class ChunkManager implements IChunkManager {
  private readonly map = new Map<string, Chunk>();
  private readonly opts: ChunkManagerOptions;

  /** Vertical chunk band actually streamed (terrain never reaches the rest in Phase 1). */
  private readonly minCY = 0;
  private readonly maxCY = 7;
  /** Max chunks generated per `update()` call. */
  private readonly genBudget = 24;
  private pending: ChunkPos[] = [];
  private pendingKey = '';

  constructor(
    private readonly generator: ChunkGenerator,
    options: Partial<ChunkManagerOptions> = {},
  ) {
    this.opts = {
      renderDistance: options.renderDistance ?? 8,
      simulationDistance: options.simulationDistance ?? 6,
      ...(options.onChunkReady ? { onChunkReady: options.onChunkReady } : {}),
      ...(options.onChunkUnload ? { onChunkUnload: options.onChunkUnload } : {}),
    };
  }

  get loaded(): Iterable<IChunk> {
    return this.map.values();
  }

  get count(): number {
    return this.map.size;
  }

  get(cx: number, cy: number, cz: number): IChunk | undefined {
    return this.map.get(chunkKey(cx, cy, cz));
  }

  getByKey(key: string): IChunk | undefined {
    return this.map.get(key);
  }

  has(cx: number, cy: number, cz: number): boolean {
    return this.map.has(chunkKey(cx, cy, cz));
  }

  ensure(cx: number, cy: number, cz: number): IChunk {
    const key = chunkKey(cx, cy, cz);
    let chunk = this.map.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cy, cz);
      this.map.set(key, chunk);
      this.generate(chunk);
    }
    return chunk;
  }

  update(center: ChunkPos): void {
    const centerKey = chunkKey(center.cx, 0, center.cz);
    if (centerKey !== this.pendingKey) {
      this.pendingKey = centerKey;
      this.rebuildQueue(center);
      this.unloadFar(center);
    }
    // Generate a bounded slice of the queue this frame.
    let made = 0;
    while (this.pending.length > 0 && made < this.genBudget) {
      const pos = this.pending.shift()!;
      if (!this.map.has(chunkKey(pos.cx, pos.cy, pos.cz))) {
        this.ensure(pos.cx, pos.cy, pos.cz);
        made++;
      }
    }
  }

  ensureImmediate(center: ChunkPos, radius: number): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        for (let cy = this.minCY; cy <= this.maxCY; cy++) {
          this.ensure(center.cx + dx, cy, center.cz + dz);
        }
      }
    }
  }

  unloadAll(): void {
    for (const chunk of this.map.values()) this.opts.onChunkUnload?.(chunk);
    this.map.clear();
    this.pending = [];
    this.pendingKey = '';
  }

  dispose(): void {
    this.unloadAll();
  }

  private rebuildQueue(center: ChunkPos): void {
    const r = this.opts.renderDistance;
    const queue: ChunkPos[] = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        for (let cy = this.minCY; cy <= this.maxCY; cy++) {
          const pos = { cx: center.cx + dx, cy, cz: center.cz + dz };
          if (!this.map.has(chunkKey(pos.cx, pos.cy, pos.cz))) queue.push(pos);
        }
      }
    }
    queue.sort(
      (a, b) =>
        (a.cx - center.cx) ** 2 + (a.cz - center.cz) ** 2 - ((b.cx - center.cx) ** 2 + (b.cz - center.cz) ** 2),
    );
    this.pending = queue;
  }

  private unloadFar(center: ChunkPos): void {
    const unloadR = this.opts.renderDistance + 2;
    for (const [key, chunk] of this.map) {
      const ddx = chunk.pos.cx - center.cx;
      const ddz = chunk.pos.cz - center.cz;
      if (ddx * ddx + ddz * ddz > unloadR * unloadR) {
        chunk.stage = ChunkStage.Unloading;
        this.opts.onChunkUnload?.(chunk);
        this.map.delete(key);
      }
    }
  }

  private generate(chunk: Chunk): void {
    try {
      chunk.stage = ChunkStage.Generating;
      this.generator.generateChunk(chunk.data, chunk.pos);
      chunk.stage = ChunkStage.Ready;
      chunk.meshDirty = true;
      this.opts.onChunkReady?.(chunk);
    } catch (err) {
      logv.error(`generation failed for ${chunk.key}`, err);
      chunk.stage = ChunkStage.Ready;
    }
  }
}
