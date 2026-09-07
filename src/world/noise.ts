import { hashInts } from '../core/rng';
import type { FractalOptions, NoiseSampler2D, NoiseSampler3D } from './types';

/**
 * SKELETON — a compact gradient-noise implementation (Perlin-style) seeded
 * deterministically. Phase 1 (Agent: worldgen) may replace this with OpenSimplex
 * / domain-warped noise; keep the {@link NoiseSampler2D}/{@link NoiseSampler3D}
 * shape so the generator code is unaffected.
 */

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/** Deterministic gradient from an integer lattice point + seed. */
function grad2(seed: number, ix: number, iy: number, dx: number, dy: number): number {
  const h = hashInts(seed, ix, iy);
  const angle = (h / 0xffffffff) * Math.PI * 2;
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
}
function grad3(seed: number, ix: number, iy: number, iz: number, dx: number, dy: number, dz: number): number {
  const h = hashInts(seed, ix, iy, iz);
  const u = (h & 0xffff) / 0xffff - 0.5;
  const v = ((h >>> 16) & 0xffff) / 0xffff - 0.5;
  const w = ((h >>> 8) & 0xffff) / 0xffff - 0.5;
  const len = Math.hypot(u, v, w) || 1;
  return (u / len) * dx + (v / len) * dy + (w / len) * dz;
}

export class PerlinNoise2D implements NoiseSampler2D {
  constructor(private readonly seed: number) {}
  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = fade(x - x0);
    const sy = fade(y - y0);
    const n00 = grad2(this.seed, x0, y0, x - x0, y - y0);
    const n10 = grad2(this.seed, x1, y0, x - x1, y - y0);
    const n01 = grad2(this.seed, x0, y1, x - x0, y - y1);
    const n11 = grad2(this.seed, x1, y1, x - x1, y - y1);
    return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy) * 1.4;
  }
}

export class PerlinNoise3D implements NoiseSampler3D {
  constructor(private readonly seed: number) {}
  sample(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const sx = fade(x - x0);
    const sy = fade(y - y0);
    const sz = fade(z - z0);
    const c = (i: number, j: number, k: number) =>
      grad3(this.seed, x0 + i, y0 + j, z0 + k, x - (x0 + i), y - (y0 + j), z - (z0 + k));
    const n0 = lerp(lerp(c(0, 0, 0), c(1, 0, 0), sx), lerp(c(0, 1, 0), c(1, 1, 0), sx), sy);
    const n1 = lerp(lerp(c(0, 0, 1), c(1, 0, 1), sx), lerp(c(0, 1, 1), c(1, 1, 1), sx), sy);
    return lerp(n0, n1, sz) * 1.6;
  }
}

export const DEFAULT_FRACTAL: FractalOptions = {
  octaves: 4,
  frequency: 1,
  amplitude: 1,
  lacunarity: 2,
  persistence: 0.5,
};

/** Fractional Brownian motion over a 2D sampler. Output roughly in [-1, 1]. */
export function fbm2(sampler: NoiseSampler2D, x: number, y: number, opts: Partial<FractalOptions> = {}): number {
  const o = { ...DEFAULT_FRACTAL, ...opts };
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

export function fbm3(sampler: NoiseSampler3D, x: number, y: number, z: number, opts: Partial<FractalOptions> = {}): number {
  const o = { ...DEFAULT_FRACTAL, ...opts };
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
