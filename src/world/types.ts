import type { BlockId, ChunkPos } from '../core/types';
import type { IChunkData } from '../engine/types';
import type { Rng } from '../core/rng';

/**
 * CONTRACT — procedural generation. The engine calls {@link IWorldGenerator}; the
 * rest is internal to the world module but the biome shape is shared with UI
 * (debug overlay) and Phase 2 (mob spawning, structure placement).
 */

export interface NoiseSampler2D {
  sample(x: number, y: number): number; // range [-1, 1]
}
export interface NoiseSampler3D {
  sample(x: number, y: number, z: number): number; // range [-1, 1]
}

export interface FractalOptions {
  octaves: number;
  frequency: number;
  amplitude: number;
  lacunarity: number;
  persistence: number;
}

export type BiomeId = number;

export interface BiomeDefinition {
  readonly id: BiomeId;
  readonly name: string; // `voxelia:plains`
  readonly displayName: string;
  /** Climate coordinates used by the biome picker, each roughly [-1, 1]. */
  readonly temperature: number;
  readonly humidity: number;
  /** Base terrain shaping. */
  readonly baseHeight: number;
  readonly heightVariation: number;
  /** Surface column blocks. */
  readonly surfaceBlock: string;
  readonly subsurfaceBlock: string;
  readonly underwaterBlock: string;
  /** Foliage / sky tint as `#rrggbb`. */
  readonly grassColor: string;
  readonly foliageColor: string;
  readonly skyColor: string;
  readonly fogColor: string;
  readonly waterColor: string;
  /** Decorator weights (trees per chunk, etc.) — consumed by the decoration pass. */
  readonly decorators: readonly BiomeDecoratorConfig[];
  readonly tags: readonly string[];
}

export interface BiomeDecoratorConfig {
  type: string; // 'tree' | 'grass_patch' | 'ore' | 'flower' | ...
  attemptsPerChunk: number;
  params?: Record<string, number | string>;
}

export interface IBiomeRegistry {
  register(def: Omit<BiomeDefinition, 'id'> & { id?: BiomeId }): BiomeDefinition;
  get(id: BiomeId): BiomeDefinition;
  byName(name: string): BiomeDefinition | undefined;
  readonly all: readonly BiomeDefinition[];
  /** Pick a biome from climate values. */
  select(temperature: number, humidity: number, weirdness: number): BiomeDefinition;
  finalize(): void;
}

/** Per-column info produced during generation; cached and exposed for gameplay + UI. */
export interface ColumnSample {
  surfaceY: number;
  biome: BiomeId;
  temperature: number;
  humidity: number;
}

export interface IWorldGenerator {
  readonly seed: number;
  /** Fill terrain (stone/dirt/water/air) for one chunk. Must be deterministic and pure w.r.t. (seed, pos). */
  generateTerrain(data: IChunkData, pos: ChunkPos): void;
  /**
   * Second pass: trees, ores, features. May read/write a small neighbourhood via `edit`.
   * Runs after all 3x3 neighbouring chunks have terrain.
   */
  decorate(pos: ChunkPos, edit: DecorationEditor): void;
  /** Cheap column query used by spawn finding, UI, and structure placement. */
  sampleColumn(worldX: number, worldZ: number): ColumnSample;
  biomeAt(worldX: number, worldZ: number): BiomeDefinition;
}

/** Bounded editing surface handed to decorators — may cross into neighbour chunks. */
export interface DecorationEditor {
  get(x: number, y: number, z: number): BlockId;
  set(x: number, y: number, z: number, id: BlockId): void;
  /** Only overwrite air / replaceable blocks. */
  setIfAir(x: number, y: number, z: number, id: BlockId): void;
  readonly rng: Rng;
}

/** Worker message protocol (main <-> worldgen.worker). Kept here so both sides agree. */
export interface WorldGenRequest {
  type: 'generate';
  jobId: number;
  cx: number;
  cy: number;
  cz: number;
}
export interface WorldGenResponse {
  type: 'generated';
  jobId: number;
  cx: number;
  cy: number;
  cz: number;
  /** Transferable — length CHUNK_VOLUME. */
  blocks: Uint16Array;
}
