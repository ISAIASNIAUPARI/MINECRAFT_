/**
 * Deterministic pseudo-random number generation.
 *
 * The whole world is a pure function of its seed, so *every* random decision in
 * generation must come from an {@link Rng} derived from that seed — never
 * `Math.random()`. Use {@link Rng.fork} to get an independent, reproducible
 * sub-stream keyed by coordinates or a purpose tag.
 */

/** mulberry32 — fast, good-enough-quality 32-bit generator. Returns floats in `[0, 1)`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** xmur3 string hash — turns a string into a well-mixed 32-bit seed generator. */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** Mix an arbitrary list of integers into one 32-bit hash (order matters). */
export function hashInts(...values: number[]): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < values.length; i++) {
    h ^= values[i] | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Normalize a user-supplied seed (string from a text field, or a number) into a
 * uint32. Numeric strings are parsed as numbers so "12345" and 12345 match.
 */
export function normalizeSeed(seed: string | number): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.floor(seed) >>> 0;
  }
  const str = String(seed).trim();
  if (str === '') return 0;
  if (/^-?\d+$/.test(str)) {
    const n = Number(str);
    if (Number.isSafeInteger(n)) return n >>> 0;
  }
  return xmur3(str)();
}

export interface Rng {
  /** The uint32 seed this stream was created from. */
  readonly seed: number;
  /** Next float in `[0, 1)`. */
  next(): number;
  /** Integer in `[minInclusive, maxExclusive)`. */
  int(minInclusive: number, maxExclusive: number): number;
  /** Float in `[min, max)`. */
  float(min: number, max: number): number;
  /** `true` with the given probability (default 0.5). */
  chance(probability?: number): boolean;
  /** Uniformly pick an element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(items: T[]): T[];
  /** Approx. standard-normal sample (Box–Muller). */
  gaussian(mean?: number, stdDev?: number): number;
  /**
   * A new independent stream deterministically derived from this seed plus the
   * given salts. `rng.fork(cx, cz)` is the canonical way to get a per-chunk stream.
   */
  fork(...salts: number[]): Rng;
}

export function createRng(seed: string | number): Rng {
  const seed32 = normalizeSeed(seed);
  const gen = mulberry32(seed32);
  let spare: number | null = null;

  const rng: Rng = {
    seed: seed32,
    next: gen,
    int(minInclusive, maxExclusive) {
      if (maxExclusive <= minInclusive) return minInclusive;
      return minInclusive + Math.floor(gen() * (maxExclusive - minInclusive));
    },
    float(min, max) {
      return min + gen() * (max - min);
    },
    chance(probability = 0.5) {
      return gen() < probability;
    },
    pick(items) {
      if (items.length === 0) throw new Error('Rng.pick: empty array');
      return items[Math.floor(gen() * items.length)];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(gen() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      return items;
    },
    gaussian(mean = 0, stdDev = 1) {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return mean + stdDev * value;
      }
      let u = 0;
      let v = 0;
      let s = 0;
      do {
        u = gen() * 2 - 1;
        v = gen() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const mul = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * mul;
      return mean + stdDev * (u * mul);
    },
    fork(...salts) {
      return createRng(hashInts(seed32, salts.length, ...salts));
    },
  };
  return rng;
}
