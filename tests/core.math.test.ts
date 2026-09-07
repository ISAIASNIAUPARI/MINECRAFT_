import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, CHUNK_VOLUME } from '../src/core/constants';
import {
  chunkKey,
  indexToLocal,
  localBlockIndex,
  parseChunkKey,
  worldToChunk,
  worldToLocal,
} from '../src/core/math';

describe('coordinate math', () => {
  it('worldToChunk floors toward -Infinity', () => {
    expect(worldToChunk(0)).toBe(0);
    expect(worldToChunk(15)).toBe(0);
    expect(worldToChunk(16)).toBe(1);
    expect(worldToChunk(-1)).toBe(-1);
    expect(worldToChunk(-16)).toBe(-1);
    expect(worldToChunk(-17)).toBe(-2);
  });

  it('worldToLocal wraps correctly for negatives', () => {
    expect(worldToLocal(0)).toBe(0);
    expect(worldToLocal(15)).toBe(15);
    expect(worldToLocal(16)).toBe(0);
    expect(worldToLocal(-1)).toBe(15);
    expect(worldToLocal(-16)).toBe(0);
  });

  it('localBlockIndex and indexToLocal round-trip over the whole chunk', () => {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const idx = localBlockIndex(x, y, z);
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(CHUNK_VOLUME);
          expect(indexToLocal(idx)).toEqual({ x, y, z });
        }
      }
    }
  });

  it('chunkKey round-trips', () => {
    expect(parseChunkKey(chunkKey(-3, 4, 12))).toEqual({ cx: -3, cy: 4, cz: 12 });
  });
});
