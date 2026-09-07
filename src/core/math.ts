import { CHUNK_SIZE_BITS, CHUNK_SIZE_MASK } from './constants';
import type { ChunkPos } from './types';

/** Euclidean floor division: always rounds toward -Infinity. */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Euclidean modulo: result has the sign of `b` (always non-negative for positive `b`). */
export function euclideanMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * World block coord -> chunk coord along one axis.
 * Uses an arithmetic shift, which floors toward -Infinity for our power-of-two chunk size.
 */
export function worldToChunk(w: number): number {
  return w >> CHUNK_SIZE_BITS;
}

/** World block coord -> local coord within its chunk (0..CHUNK_SIZE-1), correct for negatives. */
export function worldToLocal(w: number): number {
  return w & CHUNK_SIZE_MASK;
}

/** Chunk coord -> world coord of the chunk's minimum corner. */
export function chunkToWorldOrigin(c: number): number {
  return c << CHUNK_SIZE_BITS;
}

/**
 * Flatten a local block coordinate to an array index.
 * Layout: X is fastest-varying, then Z, then Y (`y*256 + z*16 + x`).
 * Iterate as `for y { for z { for x } }` for cache-friendly traversal.
 */
export function localBlockIndex(lx: number, ly: number, lz: number): number {
  return (ly << 8) | (lz << 4) | lx;
}

/** Inverse of {@link localBlockIndex}. */
export function indexToLocal(index: number): { x: number; y: number; z: number } {
  return { x: index & 15, z: (index >> 4) & 15, y: (index >> 8) & 15 };
}

const CHUNK_KEY_SEP = ',';

/** Stable string key for a chunk position, for use in `Map`s. */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx}${CHUNK_KEY_SEP}${cy}${CHUNK_KEY_SEP}${cz}`;
}

export function chunkKeyOf(pos: ChunkPos): string {
  return chunkKey(pos.cx, pos.cy, pos.cz);
}

export function parseChunkKey(key: string): ChunkPos {
  const parts = key.split(CHUNK_KEY_SEP);
  return { cx: Number(parts[0]), cy: Number(parts[1]), cz: Number(parts[2]) };
}

/** Chunk key directly from a world block position. */
export function chunkKeyFromWorld(x: number, y: number, z: number): string {
  return chunkKey(worldToChunk(x), worldToChunk(y), worldToChunk(z));
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp: where does `value` sit between `a` and `b`? */
export function invLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return lerp(outMin, outMax, invLerp(inMin, inMax, value));
}

/** Smooth Hermite interpolation between 0 and 1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function manhattan(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz);
}

export function chebyshev(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/** Squared distance — cheaper than `distance` when you only need to compare. */
export function distanceSq(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

export function distance(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.sqrt(distanceSq(ax, ay, az, bx, by, bz));
}

/** Wrap `value` into `[0, max)`. */
export function wrap(value: number, max: number): number {
  return euclideanMod(value, max);
}

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const TAU = Math.PI * 2;
