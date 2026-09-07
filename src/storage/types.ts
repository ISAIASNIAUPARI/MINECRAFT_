import type { ChunkPos, GameMode, Difficulty } from '../core/types';
import type { PlayerState } from '../player/types';

/**
 * CONTRACT — persistence. Phase 1 ships an in-memory implementation plus this
 * interface; Phase 2 adds the IndexedDB-backed one behind the same API.
 */

export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  seedInput: string;
  gameMode: GameMode;
  difficulty: Difficulty;
  createdAt: number;
  lastPlayed: number;
  saveFormat: number;
  /** ms of play time. */
  playTime: number;
  /** Game version that last wrote the save. */
  version: string;
  /** Enabled mod ids (Phase 4). */
  mods: string[];
}

export interface SavedChunk {
  cx: number;
  cy: number;
  cz: number;
  /** Palette-compressed or raw; the storage impl owns the encoding. */
  blocks: Uint16Array;
  revision: number;
}

export interface SavedWorldState {
  /** Total elapsed world ticks. */
  time: number;
  /** 0..1 weather intensity (Phase 2). */
  weather: number;
  spawn: { x: number; y: number; z: number };
}

export interface IWorldStorage {
  readonly worldId: string;
  loadMeta(): Promise<WorldMeta | null>;
  saveMeta(meta: WorldMeta): Promise<void>;

  loadChunk(pos: ChunkPos): Promise<SavedChunk | null>;
  saveChunk(chunk: SavedChunk): Promise<void>;
  saveChunks(chunks: readonly SavedChunk[]): Promise<void>;

  loadPlayer(): Promise<PlayerState | null>;
  savePlayer(state: PlayerState): Promise<void>;

  loadWorldState(): Promise<SavedWorldState | null>;
  saveWorldState(state: SavedWorldState): Promise<void>;

  /** Flush any write buffers. */
  flush(): Promise<void>;
  close(): void;
}

export interface IWorldManager {
  list(): Promise<WorldMeta[]>;
  create(input: {
    name: string;
    seed: string;
    gameMode: GameMode;
    difficulty: Difficulty;
  }): Promise<WorldMeta>;
  delete(id: string): Promise<void>;
  duplicate(id: string, newName: string): Promise<WorldMeta>;
  openStorage(id: string): IWorldStorage;
}
