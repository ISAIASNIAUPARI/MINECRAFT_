import { createRng, hashInts } from '../core/rng';
import type { FractalOptions, NoiseSampler2D, NoiseSampler3D } from './types';

/**
 * Seeded, deterministic noise toolkit for world generation.
 *
 * Everything here is a pure function of the seed it was constructed with: the
 * same seed and coordinates always yield the same value, on any thread, in any
 * order. That is the backbone of world-gen determinism.
 *
 * Contents:
 *  - {@link ValueNoise2D}/{@link ValueNoise3D}   — cheap lattice value noise.
 *  - {@link PerlinNoise2D}/{@link PerlinNoise3D} — classic gradient noise.
 *  - {@link SimplexNoise2D}/{@link SimplexNoise3D} — simplex gradient noise
 *    (fewer directional artifacts; the workhorse for terrain / climate).
 *  - {@link WorleyNoise2D}/{@link WorleyNoise3D} — cellular / Worley noise
 *    (F1 / F2 / F2-F1), used to shape cave chambers.
 *  - {@link fbm2}/{@link fbm3}, {@link ridged2}/{@link ridged3},
 *    {@link billow2}/{@link billow3} — fractal accumulation helpers.
 *  - {@link FractalNoise2D}/{@link FractalNoise3D} — a base sampler + fractal
 *    config wrapped as a single {@link NoiseSampler2D}/{@link NoiseSampler3D}.
 *  - {@link warp2}/{@link warp3} — domain-warp helpers.
 *
 * All samplers return roughly `[-1, 1]`. "Roughly" because gradient noise rarely
 * touches the extremes and Worley normalization is approximate; callers that
 * need a hard range must clamp.
 */

const SQRT3 = Math.sqrt(3);
const UINT32 = 4294967296;

/** Quintic fade curve `6t^5 - 15t^4 + 10t^3`. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/** Hash coords to a float in `[0, 1)`. */
function hashUnit(seed: number, ...coords: number[]): number {
  return hashInts(seed, ...coords) / UINT32;
}

/**
 * 12 gradient directions (the midpoints of a cube's edges). Shared by gradient
 * and simplex noise — the canonical Perlin "improved noise" gradient set.
 */
const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

export interface Permutation {
  /** Length 512 — a 0..255 permutation, doubled to avoid index wrapping. */
  readonly perm: Uint8Array;
  /** `perm[i] % 12` — precomputed gradient index. */
  readonly permMod12: Uint8Array;
}

/** Build a permutation table deterministically from a seed (Fisher–Yates via {@link createRng}). */
export function buildPermutation(seed: number): Permutation {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  const rng = createRng(hashInts(seed >>> 0, 0x9e3779b9));
  for (let i = 255; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = base[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

// ---------------------------------------------------------------------------
// Value noise
// ---------------------------------------------------------------------------

export class ValueNoise2D implements NoiseSampler2D {
  private readonly seed: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }
  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const s = this.seed;
    const v00 = hashUnit(s, x0, y0) * 2 - 1;
    const v10 = hashUnit(s, x0 + 1, y0) * 2 - 1;
    const v01 = hashUnit(s, x0, y0 + 1) * 2 - 1;
    const v11 = hashUnit(s, x0 + 1, y0 + 1) * 2 - 1;
    return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
  }
}

export class ValueNoise3D implements NoiseSampler3D {
  private readonly seed: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }
  sample(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const fz = fade(z - z0);
    const s = this.seed;
    const c = (i: number, j: number, k: number): number =>
      hashUnit(s, x0 + i, y0 + j, z0 + k) * 2 - 1;
    const y00 = lerp(c(0, 0, 0), c(1, 0, 0), fx);
    const y10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
    const y01 = lerp(c(0, 0, 1), c(1, 0, 1), fx);
    const y11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
    return lerp(lerp(y00, y10, fy), lerp(y01, y11, fy), fz);
  }
}

// ---------------------------------------------------------------------------
// Gradient (Perlin) noise
// ---------------------------------------------------------------------------

export class PerlinNoise2D implements NoiseSampler2D {
  private readonly perm: Uint8Array;
  constructor(seed: number) {
    this.perm = buildPermutation(seed).perm;
  }
  sample(x: number, y: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const xi = fx & 255;
    const yi = fy & 255;
    const dx = x - fx;
    const dy = y - fy;
    const u = fade(dx);
    const v = fade(dy);
    const p = this.perm;
    const aa = p[p[xi] + yi];
    const ab = p[p[xi] + yi + 1];
    const ba = p[p[xi + 1] + yi];
    const bb = p[p[xi + 1] + yi + 1];
    const x1 = lerp(grad2(aa, dx, dy), grad2(ba, dx - 1, dy), u);
    const x2 = lerp(grad2(ab, dx, dy - 1), grad2(bb, dx - 1, dy - 1), u);
    return lerp(x1, x2, v) * 1.41;
  }
}

export class PerlinNoise3D implements NoiseSampler3D {
  private readonly perm: Uint8Array;
  constructor(seed: number) {
    this.perm = buildPermutation(seed).perm;
  }
  sample(x: number, y: number, z: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const xi = fx & 255;
    const yi = fy & 255;
    const zi = fz & 255;
    const dx = x - fx;
    const dy = y - fy;
    const dz = z - fz;
    const u = fade(dx);
    const v = fade(dy);
    const w = fade(dz);
    const p = this.perm;
    const a = p[xi] + yi;
    const aa = p[a] + zi;
    const ab = p[a + 1] + zi;
    const b = p[xi + 1] + yi;
    const ba = p[b] + zi;
    const bb = p[b + 1] + zi;
    const x1 = lerp(grad3(p[aa], dx, dy, dz), grad3(p[ba], dx - 1, dy, dz), u);
    const x2 = lerp(grad3(p[ab], dx, dy - 1, dz), grad3(p[bb], dx - 1, dy - 1, dz), u);
    const y1 = lerp(x1, x2, v);
    const x3 = lerp(grad3(p[aa + 1], dx, dy, dz - 1), grad3(p[ba + 1], dx - 1, dy, dz - 1), u);
    const x4 = lerp(grad3(p[ab + 1], dx, dy - 1, dz - 1), grad3(p[bb + 1], dx - 1, dy - 1, dz - 1), u);
    const y2 = lerp(x3, x4, v);
    return lerp(y1, y2, w) * 1.16;
  }
}

function grad2(hash: number, x: number, y: number): number {
  const g = GRAD3[hash % 12];
  return g[0] * x + g[1] * y;
}
function grad3(hash: number, x: number, y: number, z: number): number {
  const g = GRAD3[hash % 12];
  return g[0] * x + g[1] * y + g[2] * z;
}

// ---------------------------------------------------------------------------
// Simplex noise
// ---------------------------------------------------------------------------

const F2 = 0.5 * (SQRT3 - 1);
const G2 = (3 - SQRT3) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

export class SimplexNoise2D implements NoiseSampler2D {
  private readonly perm: Uint8Array;
  private readonly permMod12: Uint8Array;
  constructor(seed: number) {
    const table = buildPermutation(seed);
    this.perm = table.perm;
    this.permMod12 = table.permMod12;
  }
  sample(xin: number, yin: number): number {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = permMod12[ii + perm[jj]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1]];
    const gi2 = permMod12[ii + 1 + perm[jj + 1]];
    return 70 * (corner2(x0, y0, gi0) + corner2(x1, y1, gi1) + corner2(x2, y2, gi2));
  }
}

function corner2(x: number, y: number, gi: number): number {
  let t = 0.5 - x * x - y * y;
  if (t < 0) return 0;
  t *= t;
  const g = GRAD3[gi];
  return t * t * (g[0] * x + g[1] * y);
}

export class SimplexNoise3D implements NoiseSampler3D {
  private readonly perm: Uint8Array;
  private readonly permMod12: Uint8Array;
  constructor(seed: number) {
    const table = buildPermutation(seed);
    this.perm = table.perm;
    this.permMod12 = table.permMod12;
  }
  sample(xin: number, yin: number, zin: number): number {
    const perm = this.perm;
    const permMod12 = this.permMod12;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1: number;
    let j1: number;
    let k1: number;
    let i2: number;
    let j2: number;
    let k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 0;
        j2 = 1;
        k2 = 1;
      } else if (x0 < z0) {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 0;
        j2 = 1;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = permMod12[ii + perm[jj + perm[kk]]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
    const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
    const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];

    return (
      32 *
      (corner3(x0, y0, z0, gi0) +
        corner3(x1, y1, z1, gi1) +
        corner3(x2, y2, z2, gi2) +
        corner3(x3, y3, z3, gi3))
    );
  }
}

function corner3(x: number, y: number, z: number, gi: number): number {
  let t = 0.6 - x * x - y * y - z * z;
  if (t < 0) return 0;
  t *= t;
  const g = GRAD3[gi];
  return t * t * (g[0] * x + g[1] * y + g[2] * z);
}

// ---------------------------------------------------------------------------
// Worley / cellular noise
// ---------------------------------------------------------------------------

export type WorleyMetric = 'euclidean' | 'manhattan' | 'chebyshev';
export type WorleyResult = 'f1' | 'f2' | 'f2f1';

export interface WorleyOptions {
  metric?: WorleyMetric;
  result?: WorleyResult;
  /** Feature-point jitter inside each cell, `0..1` (1 = fill the cell). */
  jitter?: number;
}

function worleyDistance(metric: WorleyMetric, dx: number, dy: number, dz: number): number {
  if (metric === 'manhattan') return Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  if (metric === 'chebyshev') return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function worleyMap(result: WorleyResult, f1: number, f2: number): number {
  const raw = result === 'f1' ? f1 : result === 'f2' ? f2 : f2 - f1;
  const v = raw * 2 - 1;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

export class WorleyNoise2D implements NoiseSampler2D {
  private readonly seed: number;
  private readonly metric: WorleyMetric;
  private readonly result: WorleyResult;
  private readonly jitter: number;
  constructor(seed: number, opts: WorleyOptions = {}) {
    this.seed = seed >>> 0;
    this.metric = opts.metric ?? 'euclidean';
    this.result = opts.result ?? 'f1';
    this.jitter = opts.jitter ?? 1;
  }
  sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = Infinity;
    let f2 = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const ox = hashUnit(this.seed, cx, cy, 1) * this.jitter;
        const oy = hashUnit(this.seed, cx, cy, 2) * this.jitter;
        const d = worleyDistance(this.metric, cx + ox - x, cy + oy - y, 0);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return worleyMap(this.result, f1, f2);
  }
}

export class WorleyNoise3D implements NoiseSampler3D {
  private readonly seed: number;
  private readonly metric: WorleyMetric;
  private readonly result: WorleyResult;
  private readonly jitter: number;
  constructor(seed: number, opts: WorleyOptions = {}) {
    this.seed = seed >>> 0;
    this.metric = opts.metric ?? 'euclidean';
    this.result = opts.result ?? 'f1';
    this.jitter = opts.jitter ?? 1;
  }
  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    let f1 = Infinity;
    let f2 = Infinity;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = xi + dx;
          const cy = yi + dy;
          const cz = zi + dz;
          const ox = hashUnit(this.seed, cx, cy, cz, 1) * this.jitter;
          const oy = hashUnit(this.seed, cx, cy, cz, 2) * this.jitter;
          const oz = hashUnit(this.seed, cx, cy, cz, 3) * this.jitter;
          const d = worleyDistance(this.metric, cx + ox - x, cy + oy - y, cz + oz - z);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
    }
    return worleyMap(this.result, f1, f2);
  }
}

// ---------------------------------------------------------------------------
// Fractal accumulation
// ---------------------------------------------------------------------------

export const DEFAULT_FRACTAL: FractalOptions = {
  octaves: 4,
  frequency: 1,
  amplitude: 1,
  lacunarity: 2,
  persistence: 0.5,
};

function resolveFractal(opts: Partial<FractalOptions>): FractalOptions {
  return { ...DEFAULT_FRACTAL, ...opts };
}

/** Fractional Brownian motion over a 2D sampler. Output roughly `[-1, 1]`, centered near 0. */
export function fbm2(
  sampler: NoiseSampler2D,
  x: number,
  y: number,
  opts: Partial<FractalOptions> = {},
): number {
  const o = resolveFractal(opts);
  let freq = o.frequency;
  let amp = o.amplitude;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < o.octaves; i++) {
    sum += sampler.sample(x * freq, y * freq) * amp;
    norm += amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return norm > 0 ? sum / norm : 0;
}

export function fbm3(
  sampler: NoiseSampler3D,
  x: number,
  y: number,
  z: number,
  opts: Partial<FractalOptions> = {},
): number {
  const o = resolveFractal(opts);
  let freq = o.frequency;
  let amp = o.amplitude;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < o.octaves; i++) {
    sum += sampler.sample(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Ridged multifractal: `(1 - |n|)^2` per octave with amplitude feedback. Output
 * roughly `[-1, 1]` but strongly skewed toward `+1` along sharp ridge lines —
 * good for mountain crests and cave tunnels.
 */
export function ridged2(
  sampler: NoiseSampler2D,
  x: number,
  y: number,
  opts: Partial<FractalOptions> = {},
): number {
  const o = resolveFractal(opts);
  let freq = o.frequency;
  let amp = o.amplitude;
  let sum = 0;
  let norm = 0;
  let prev = 1;
  for (let i = 0; i < o.octaves; i++) {
    let n = 1 - Math.abs(sampler.sample(x * freq, y * freq));
    n *= n;
    n *= prev;
    prev = n;
    sum += n * amp;
    norm += amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return norm > 0 ? (sum / norm) * 2 - 1 : -1;
}

export function ridged3(
  sampler: NoiseSampler3D,
  x: number,
  y: number,
  z: number,
  opts: Partial<FractalOptions> = {},
): number {
  const o = resolveFractal(opts);
  let freq = o.frequency;
  let amp = o.amplitude;
  let sum = 0;
  let norm = 0;
  let prev = 1;
  for (let i = 0; i < o.octaves; i++) {
    let n = 1 - Math.abs(sampler.sample(x * freq, y * freq, z * freq));
    n *= n;
    n *= prev;
    prev = n;
    sum += n * amp;
    norm += amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return norm > 0 ? (sum / norm) * 2 - 1 : -1;
}

/** Billow fractal: `|n|` per octave. Output roughly `[-1, 1]`, skewed toward `-1`, bulbous. */
export function billow2(
  sampler: NoiseSampler2D,
  x: number,
  y: number,
  opts: Partial<FractalOptions> = {},
): number {
  const o = resolveFractal(opts);
  let freq = o.frequency;
  let amp = o.amplitude;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < o.octaves; i++) {
    sum += (Math.abs(sampler.sample(x * freq, y * freq)) * 2 - 1) * amp;
    norm += amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return norm > 0 ? sum / norm : 0;
}

export function billow3(
  sampler: NoiseSampler3D,
  x: number,
  y: number,
  z: number,
  opts: Partial<FractalOptions> = {},
): number {
  const o = resolveFractal(opts);
  let freq = o.frequency;
  let amp = o.amplitude;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < o.octaves; i++) {
    sum += (Math.abs(sampler.sample(x * freq, y * freq, z * freq)) * 2 - 1) * amp;
    norm += amp;
    freq *= o.lacunarity;
    amp *= o.persistence;
  }
  return norm > 0 ? sum / norm : 0;
}

export type FractalMode = 'fbm' | 'ridged' | 'billow';

export interface FractalConfig extends Partial<FractalOptions> {
  mode?: FractalMode;
}

/** A base sampler + fractal accumulation, exposed as one {@link NoiseSampler2D}. */
export class FractalNoise2D implements NoiseSampler2D {
  private readonly base: NoiseSampler2D;
  private readonly mode: FractalMode;
  private readonly opts: Partial<FractalOptions>;
  constructor(base: NoiseSampler2D, config: FractalConfig = {}) {
    this.base = base;
    const { mode = 'fbm', ...opts } = config;
    this.mode = mode;
    this.opts = opts;
  }
  sample(x: number, y: number): number {
    if (this.mode === 'ridged') return ridged2(this.base, x, y, this.opts);
    if (this.mode === 'billow') return billow2(this.base, x, y, this.opts);
    return fbm2(this.base, x, y, this.opts);
  }
}

/** A base sampler + fractal accumulation, exposed as one {@link NoiseSampler3D}. */
export class FractalNoise3D implements NoiseSampler3D {
  private readonly base: NoiseSampler3D;
  private readonly mode: FractalMode;
  private readonly opts: Partial<FractalOptions>;
  constructor(base: NoiseSampler3D, config: FractalConfig = {}) {
    this.base = base;
    const { mode = 'fbm', ...opts } = config;
    this.mode = mode;
    this.opts = opts;
  }
  sample(x: number, y: number, z: number): number {
    if (this.mode === 'ridged') return ridged3(this.base, x, y, z, this.opts);
    if (this.mode === 'billow') return billow3(this.base, x, y, z, this.opts);
    return fbm3(this.base, x, y, z, this.opts);
  }
}

// ---------------------------------------------------------------------------
// Domain warping
// ---------------------------------------------------------------------------

/**
 * Offset `(x, y)` by two noise fields sampled at `frequency`, scaled by
 * `amplitude`. Feeding the result back into another sampler bends its features
 * into organic, non-grid-aligned shapes.
 */
export function warp2(
  fieldX: NoiseSampler2D,
  fieldY: NoiseSampler2D,
  x: number,
  y: number,
  amplitude: number,
  frequency = 1,
): readonly [number, number] {
  const wx = fieldX.sample(x * frequency, y * frequency);
  const wy = fieldY.sample(x * frequency, y * frequency);
  return [x + wx * amplitude, y + wy * amplitude];
}

export function warp3(
  fieldX: NoiseSampler3D,
  fieldY: NoiseSampler3D,
  fieldZ: NoiseSampler3D,
  x: number,
  y: number,
  z: number,
  amplitude: number,
  frequency = 1,
): readonly [number, number, number] {
  const wx = fieldX.sample(x * frequency, y * frequency, z * frequency);
  const wy = fieldY.sample(x * frequency, y * frequency, z * frequency);
  const wz = fieldZ.sample(x * frequency, y * frequency, z * frequency);
  return [x + wx * amplitude, y + wy * amplitude, z + wz * amplitude];
}
