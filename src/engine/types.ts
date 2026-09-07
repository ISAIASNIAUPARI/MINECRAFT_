import type { BlockId, ChunkPos, Vec3 } from '../core/types';

/**
 * CONTRACT — the voxel data model. Consumed by rendering (meshing reads chunk
 * data + neighbours), world-gen (writes chunk data), physics/player (block
 * queries), storage (serialization).
 */

/** Compact per-chunk block storage. Backed by a `Uint16Array` of length {@link CHUNK_VOLUME}. */
export interface IChunkData {
  /** Local coords 0..CHUNK_SIZE-1. No bounds checking on the hot path — callers must stay in range. */
  get(lx: number, ly: number, lz: number): BlockId;
  set(lx: number, ly: number, lz: number, id: BlockId): void;
  getByIndex(index: number): BlockId;
  setByIndex(index: number, id: BlockId): void;
  fill(id: BlockId): void;
  /** True when every voxel is air — lets the manager skip meshing/saving. */
  isUniform(): boolean;
  uniformValue(): BlockId | null;
  /** The raw array, for transfer to workers and serialization. Length = CHUNK_VOLUME. */
  readonly array: Uint16Array;
  clone(): IChunkData;
}

export enum ChunkStage {
  /** Allocated, no data yet. */
  Empty = 0,
  /** Queued or running terrain generation. */
  Generating = 1,
  /** Terrain done, awaiting decoration (trees/ores that may cross chunk borders). */
  Terrain = 2,
  /** Fully generated. */
  Ready = 3,
  /** Being removed. */
  Unloading = 4,
}

export interface IChunk {
  readonly pos: ChunkPos;
  readonly key: string;
  /** World coordinate of the chunk's minimum corner. */
  readonly origin: Readonly<Vec3>;
  readonly data: IChunkData;
  stage: ChunkStage;
  /** Set when block data changed and the render mesh is stale. */
  meshDirty: boolean;
  /** Set when block data changed since last save. */
  needsSave: boolean;
  /** Monotonic counter bumped on every block edit — cheap change detection for the renderer. */
  readonly revision: number;

  getBlock(lx: number, ly: number, lz: number): BlockId;
  /** @returns true if the value actually changed. Bumps `revision`, sets `meshDirty` + `needsSave`. */
  setBlock(lx: number, ly: number, lz: number, id: BlockId): boolean;
}

/** Fills a freshly-allocated chunk with terrain. Provided by the world module, called by the manager (usually in a worker). */
export interface ChunkGenerator {
  generateChunk(data: IChunkData, pos: ChunkPos): void;
}

export interface ChunkManagerOptions {
  renderDistance: number;
  simulationDistance: number;
  /** Called after a chunk finishes generating or is edited, so the renderer can (re)mesh. */
  onChunkReady?(chunk: IChunk): void;
  onChunkUnload?(chunk: IChunk): void;
}

export interface IChunkManager {
  get(cx: number, cy: number, cz: number): IChunk | undefined;
  getByKey(key: string): IChunk | undefined;
  has(cx: number, cy: number, cz: number): boolean;
  /** Iterate currently-resident chunks. */
  readonly loaded: Iterable<IChunk>;
  readonly count: number;
  /** Drive load/unload around a center (usually the player's chunk). Called every frame; cheap when nothing changed. */
  update(center: ChunkPos): void;
  /** Force a chunk resident now (used by tests and teleports). */
  ensure(cx: number, cy: number, cz: number): IChunk;
  unloadAll(): void;
  dispose(): void;
}

/** The top-level world facade every gameplay system talks to. */
export interface IWorld {
  readonly seed: number;
  readonly chunks: IChunkManager;

  /** Out-of-range or unloaded -> air (id 0). */
  getBlock(x: number, y: number, z: number): BlockId;
  /** @returns true if the block changed. Triggers remeshing of the owning chunk and neighbours on borders. */
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  isLoaded(x: number, y: number, z: number): boolean;
  /** Highest non-air Y in the column, or `WORLD_MIN_Y - 1` when the column is empty/unloaded. */
  getSurfaceY(x: number, z: number): number;

  /** Advance world simulation by one fixed tick. */
  tick(dt: number): void;
  dispose(): void;
}
