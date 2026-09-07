import { CHUNK_SIZE, SEA_LEVEL, WORLD_MIN_Y } from '../core/constants';
import { chunkToWorldOrigin } from '../core/math';
import { createRng, hashInts, type Rng } from '../core/rng';
import type { BlockId, ChunkPos } from '../core/types';
import type { IBlockRegistry } from '../blocks/types';
import type { IChunkData } from '../engine/types';
import { fbm2, fbm3, PerlinNoise2D, PerlinNoise3D } from './noise';
import type {
  BiomeDefinition,
  ColumnSample,
  DecorationEditor,
  IBiomeRegistry,
  IWorldGenerator,
} from './types';

/**
 * SKELETON generator: multi-noise heightmap + biome blend, water to sea level,
 * a 3D cave carve, a light ore scatter and a simple tree decorator.
 *
 * Phase 1 (Agent: worldgen) rebuilds this off-thread with real cave systems,
 * ravines, rivers/lakes, ore distribution curves and per-biome decorators.
 * {@link IWorldGenerator} is the frozen contract.
 */
export class WorldGenerator implements IWorldGenerator {
  readonly seed: number;

  private readonly continent: PerlinNoise2D;
  private readonly hills: PerlinNoise2D;
  private readonly temperature: PerlinNoise2D;
  private readonly humidity: PerlinNoise2D;
  private readonly caves: PerlinNoise3D;
  private readonly ids: Record<string, BlockId>;

  constructor(
    seed: number,
    private readonly blocks: IBlockRegistry,
    private readonly biomes: IBiomeRegistry,
  ) {
    this.seed = seed;
    this.continent = new PerlinNoise2D(hashInts(seed, 1));
    this.hills = new PerlinNoise2D(hashInts(seed, 2));
    this.temperature = new PerlinNoise2D(hashInts(seed, 3));
    this.humidity = new PerlinNoise2D(hashInts(seed, 4));
    this.caves = new PerlinNoise3D(hashInts(seed, 5));
    const id = (name: string) => this.blocks.byName(name)?.numericId ?? 0;
    this.ids = {
      air: 0,
      bedrock: id('voxelia:bedrock'),
      stone: id('voxelia:stone'),
      dirt: id('voxelia:dirt'),
      grass: id('voxelia:grass_block'),
      sand: id('voxelia:sand'),
      water: id('voxelia:water'),
      log: id('voxelia:oak_log'),
      leaves: id('voxelia:oak_leaves'),
      coal: id('voxelia:coal_ore'),
      iron: id('voxelia:iron_ore'),
    };
  }

  private climate(worldX: number, worldZ: number): { t: number; h: number } {
    return {
      t: fbm2(this.temperature, worldX / 512, worldZ / 512, { octaves: 3 }),
      h: fbm2(this.humidity, worldX / 512, worldZ / 512, { octaves: 3 }),
    };
  }

  biomeAt(worldX: number, worldZ: number): BiomeDefinition {
    const { t, h } = this.climate(worldX, worldZ);
    return this.biomes.select(t, h, 0);
  }

  private heightAt(worldX: number, worldZ: number, biome: BiomeDefinition): number {
    const base = fbm2(this.continent, worldX / 800, worldZ / 800, { octaves: 4 });
    const detail = fbm2(this.hills, worldX / 120, worldZ / 120, { octaves: 4, persistence: 0.45 });
    const h = biome.baseHeight + base * 22 + detail * biome.heightVariation;
    return Math.max(WORLD_MIN_Y + 1, Math.round(h));
  }

  sampleColumn(worldX: number, worldZ: number): ColumnSample {
    const biome = this.biomeAt(worldX, worldZ);
    const surfaceY = this.heightAt(worldX, worldZ, biome);
    const { t, h } = this.climate(worldX, worldZ);
    return { surfaceY, biome: biome.id, temperature: t, humidity: h };
  }

  generateTerrain(data: IChunkData, pos: ChunkPos): void {
    const ox = chunkToWorldOrigin(pos.cx);
    const oy = chunkToWorldOrigin(pos.cy);
    const oz = chunkToWorldOrigin(pos.cz);
    const { air, bedrock, stone, dirt, grass, sand, water } = this.ids;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const biome = this.biomeAt(wx, wz);
        const surface = this.heightAt(wx, wz, biome);
        const beach = surface <= SEA_LEVEL + 1;
        const surfaceId = beach && biome.tags.includes('overworld') ? sand : this.blocks.byName(biome.surfaceBlock)?.numericId ?? grass;
        const subId = this.blocks.byName(biome.subsurfaceBlock)?.numericId ?? dirt;

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = oy + ly;
          let block: BlockId = air;
          if (wy <= 0) {
            block = bedrock;
          } else if (wy < surface - 4) {
            block = stone;
          } else if (wy < surface) {
            block = subId;
          } else if (wy === surface) {
            block = surfaceId;
          } else if (wy <= SEA_LEVEL) {
            block = water;
          }

          // Carve caves (not into water column, not near bedrock).
          if (block === stone && wy > 4 && wy < surface - 2) {
            const c = fbm3(this.caves, wx / 40, wy / 28, wz / 40, { octaves: 3 });
            if (c > 0.62) block = air;
          }

          if (block !== air) data.set(lx, ly, lz, block);
        }

        // Ores in the stone band.
        const oreRng = createRng(hashInts(this.seed, wx, wz, 7));
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = oy + ly;
          if (data.get(lx, ly, lz) !== stone) continue;
          if (wy < 64 && oreRng.chance(0.012)) data.set(lx, ly, lz, this.ids.coal);
          else if (wy < 40 && oreRng.chance(0.008)) data.set(lx, ly, lz, this.ids.iron);
        }
      }
    }
  }

  decorate(pos: ChunkPos, edit: DecorationEditor): void {
    const ox = chunkToWorldOrigin(pos.cx);
    const oz = chunkToWorldOrigin(pos.cz);
    const rng: Rng = edit.rng;
    const { log, leaves } = this.ids;

    const biome = this.biomeAt(ox + 8, oz + 8);
    const treeConfig = biome.decorators.find((d) => d.type === 'tree');
    if (!treeConfig) return;

    const attempts = treeConfig.attemptsPerChunk;
    for (let i = 0; i < attempts; i++) {
      const lx = rng.int(2, CHUNK_SIZE - 2);
      const lz = rng.int(2, CHUNK_SIZE - 2);
      const wx = ox + lx;
      const wz = oz + lz;
      // Find ground.
      let gy = -1;
      for (let y = 120; y > 2; y--) {
        const b = edit.get(wx, y, wz);
        if (b !== 0) {
          gy = y;
          break;
        }
      }
      if (gy < SEA_LEVEL || gy < 0) continue;
      if (edit.get(wx, gy, wz) !== this.ids.grass) continue;

      const trunk = rng.int(4, 6);
      for (let y = 1; y <= trunk; y++) edit.setIfAir(wx, gy + y, wz, log);
      const topY = gy + trunk;
      for (let dy = -2; dy <= 1; dy++) {
        const radius = dy <= 0 ? 2 : 1;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            if (Math.abs(dx) === radius && Math.abs(dz) === radius && rng.chance(0.5)) continue;
            edit.setIfAir(wx + dx, topY + dy, wz + dz, leaves);
          }
        }
      }
    }
  }
}
