import { describe, expect, it } from 'vitest';
import { ChunkData } from '../src/engine/ChunkData';
import { Chunk } from '../src/engine/Chunk';
import { World } from '../src/engine/World';
import type { ChunkGenerator, IChunkData } from '../src/engine/types';
import type { ChunkPos } from '../src/core/types';

describe('ChunkData', () => {
  it('stores and retrieves block ids', () => {
    const data = new ChunkData();
    data.set(1, 2, 3, 42);
    expect(data.get(1, 2, 3)).toBe(42);
    expect(data.get(0, 0, 0)).toBe(0);
  });

  it('tracks uniformity for empty chunks', () => {
    const data = new ChunkData();
    expect(data.isUniform()).toBe(true);
    expect(data.uniformValue()).toBe(0);
    data.set(5, 5, 5, 1);
    expect(data.isUniform()).toBe(false);
  });
});

describe('Chunk', () => {
  it('bumps revision and marks dirty on change', () => {
    const chunk = new Chunk(0, 0, 0);
    expect(chunk.revision).toBe(0);
    const changed = chunk.setBlock(0, 0, 0, 3);
    expect(changed).toBe(true);
    expect(chunk.revision).toBe(1);
    expect(chunk.meshDirty).toBe(true);
    expect(chunk.setBlock(0, 0, 0, 3)).toBe(false);
  });
});

const flatGen: ChunkGenerator = {
  generateChunk(data: IChunkData, pos: ChunkPos) {
    if (pos.cy !== 0) return;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) data.set(x, 0, z, 1);
  },
};

describe('World', () => {
  it('converts world coords to the right chunk + local block', () => {
    const world = new World({ seed: 1, generator: flatGen, renderDistance: 1 });
    world.update({ cx: 0, cy: 0, cz: 0 });
    expect(world.getBlock(5, 0, 5)).toBe(1);
    expect(world.getBlock(5, 1, 5)).toBe(0);
  });

  it('setBlock round-trips and reports change', () => {
    const world = new World({ seed: 1, generator: flatGen, renderDistance: 1 });
    world.update({ cx: 0, cy: 0, cz: 0 });
    expect(world.setBlock(3, 5, 3, 7)).toBe(true);
    expect(world.getBlock(3, 5, 3)).toBe(7);
    expect(world.setBlock(3, 5, 3, 7)).toBe(false);
  });

  it('out-of-range Y reads as air', () => {
    const world = new World({ seed: 1, generator: flatGen });
    expect(world.getBlock(0, -1, 0)).toBe(0);
    expect(world.getBlock(0, 10_000, 0)).toBe(0);
  });
});
