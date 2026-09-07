import { chunkKeyOf } from '../core/math';
import type { ChunkPos } from '../core/types';
import type { PlayerState } from '../player/types';
import type {
  IWorldStorage,
  SavedChunk,
  SavedWorldState,
  WorldMeta,
} from './types';

/**
 * In-memory storage — keeps a session's edits so exiting to the menu and
 * resuming works within one page load. Phase 2 (Agent: engine/storage) adds the
 * IndexedDB-backed implementation behind the same {@link IWorldStorage} contract
 * for true persistence across reloads.
 */
export class MemoryStorage implements IWorldStorage {
  private meta: WorldMeta | null = null;
  private readonly chunks = new Map<string, SavedChunk>();
  private player: PlayerState | null = null;
  private worldState: SavedWorldState | null = null;

  constructor(readonly worldId: string) {}

  async loadMeta(): Promise<WorldMeta | null> {
    return this.meta;
  }
  async saveMeta(meta: WorldMeta): Promise<void> {
    this.meta = { ...meta };
  }

  async loadChunk(pos: ChunkPos): Promise<SavedChunk | null> {
    const saved = this.chunks.get(chunkKeyOf(pos));
    return saved ? { ...saved, blocks: saved.blocks.slice() } : null;
  }
  async saveChunk(chunk: SavedChunk): Promise<void> {
    this.chunks.set(chunkKeyOf({ cx: chunk.cx, cy: chunk.cy, cz: chunk.cz }), {
      ...chunk,
      blocks: chunk.blocks.slice(),
    });
  }
  async saveChunks(chunks: readonly SavedChunk[]): Promise<void> {
    for (const c of chunks) await this.saveChunk(c);
  }

  async loadPlayer(): Promise<PlayerState | null> {
    return this.player ? structuredClone(this.player) : null;
  }
  async savePlayer(state: PlayerState): Promise<void> {
    this.player = structuredClone(state);
  }

  async loadWorldState(): Promise<SavedWorldState | null> {
    return this.worldState ? { ...this.worldState } : null;
  }
  async saveWorldState(state: SavedWorldState): Promise<void> {
    this.worldState = { ...state };
  }

  async flush(): Promise<void> {}
  close(): void {}
}
