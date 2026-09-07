import { describe, expect, it } from 'vitest';
import { BlockRegistry, registerCoreBlocks } from '../src/blocks';
import { BiomeRegistry, registerCoreBiomes } from '../src/world';
import { WorldGenerator } from '../src/world/WorldGenerator';
import { ChunkData } from '../src/engine/ChunkData';

function makeGen(seed: number) {
  const blocks = new BlockRegistry();
  registerCoreBlocks(blocks);
  blocks.finalize();
  const biomes = new BiomeRegistry();
  registerCoreBiomes(biomes);
  biomes.finalize();
  return new WorldGenerator(seed, blocks, biomes);
}

describe('world generation determinism', () => {
  it('same seed + chunk -> identical block data', () => {
    const g1 = makeGen(9001);
    const g2 = makeGen(9001);
    const a = new ChunkData();
    const b = new ChunkData();
    g1.generateTerrain(a, { cx: 2, cy: 3, cz: -1 });
    g2.generateTerrain(b, { cx: 2, cy: 3, cz: -1 });
    expect(Array.from(a.array)).toEqual(Array.from(b.array));
  });

  it('different seeds -> different terrain', () => {
    const a = new ChunkData();
    const b = new ChunkData();
    makeGen(1).generateTerrain(a, { cx: 0, cy: 4, cz: 0 });
    makeGen(2).generateTerrain(b, { cx: 0, cy: 4, cz: 0 });
    expect(Array.from(a.array)).not.toEqual(Array.from(b.array));
  });

  it('produces a plausible surface height at the origin', () => {
    const col = makeGen(123).sampleColumn(0, 0);
    expect(col.surfaceY).toBeGreaterThan(20);
    expect(col.surfaceY).toBeLessThan(160);
  });
});
