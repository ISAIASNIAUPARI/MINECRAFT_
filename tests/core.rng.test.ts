import { describe, expect, it } from 'vitest';
import { createRng, normalizeSeed } from '../src/core/rng';

describe('deterministic RNG', () => {
  it('same seed produces the same sequence', () => {
    const a = createRng('voxelia');
    const b = createRng('voxelia');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-b');
    expect(a.next()).not.toBe(b.next());
  });

  it('numeric strings normalize to the same seed as the number', () => {
    expect(normalizeSeed('12345')).toBe(normalizeSeed(12345));
  });

  it('fork is deterministic and independent of draw order', () => {
    const root1 = createRng(42);
    const root2 = createRng(42);
    root2.next();
    root2.next();
    expect(root1.fork(10, 20).next()).toBe(root2.fork(10, 20).next());
  });

  it('int stays within bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
});
