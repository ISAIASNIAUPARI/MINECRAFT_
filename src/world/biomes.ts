import type { IBiomeRegistry } from './types';

/**
 * SKELETON biome set. Phase 1 (Agent: worldgen) expands to the full list from
 * the design (plains, forest, desert, taiga, savanna, tundra, swamp, mountains,
 * ocean, beach, badlands, mushroom, volcanic, magical...) with per-biome
 * decorators, mobs (Phase 2) and structures.
 */
export function registerCoreBiomes(reg: IBiomeRegistry): void {
  reg.register({
    name: 'voxelia:plains',
    displayName: 'Plains',
    temperature: 0.3,
    humidity: 0.3,
    baseHeight: 68,
    heightVariation: 4,
    surfaceBlock: 'voxelia:grass_block',
    subsurfaceBlock: 'voxelia:dirt',
    underwaterBlock: 'voxelia:dirt',
    grassColor: '#7cbd5b',
    foliageColor: '#6fae3d',
    skyColor: '#88bbff',
    fogColor: '#c6dbff',
    waterColor: '#3a6fd8',
    decorators: [
      { type: 'grass_patch', attemptsPerChunk: 12 },
      { type: 'tree', attemptsPerChunk: 1, params: { kind: 'amberwood' } },
    ],
    tags: ['overworld'],
  });

  reg.register({
    name: 'voxelia:forest',
    displayName: 'Forest',
    temperature: 0.2,
    humidity: 0.6,
    baseHeight: 70,
    heightVariation: 7,
    surfaceBlock: 'voxelia:grass_block',
    subsurfaceBlock: 'voxelia:dirt',
    underwaterBlock: 'voxelia:dirt',
    grassColor: '#5fae4e',
    foliageColor: '#4f9e35',
    skyColor: '#83b6f5',
    fogColor: '#bcd4f0',
    waterColor: '#356bce',
    decorators: [
      { type: 'tree', attemptsPerChunk: 8, params: { kind: 'amberwood' } },
      { type: 'grass_patch', attemptsPerChunk: 8 },
    ],
    tags: ['overworld'],
  });

  reg.register({
    name: 'voxelia:desert',
    displayName: 'Desert',
    temperature: 0.9,
    humidity: 0.05,
    baseHeight: 66,
    heightVariation: 5,
    surfaceBlock: 'voxelia:sand',
    subsurfaceBlock: 'voxelia:sand',
    underwaterBlock: 'voxelia:sand',
    grassColor: '#bfb755',
    foliageColor: '#aea63f',
    skyColor: '#9cc4ff',
    fogColor: '#e8dcb0',
    waterColor: '#3f7fd0',
    decorators: [{ type: 'ore', attemptsPerChunk: 0 }],
    tags: ['overworld', 'dry'],
  });

  reg.register({
    name: 'voxelia:taiga',
    displayName: 'Snowy Taiga',
    temperature: -0.5,
    humidity: 0.4,
    baseHeight: 74,
    heightVariation: 10,
    surfaceBlock: 'voxelia:grass_block',
    subsurfaceBlock: 'voxelia:dirt',
    underwaterBlock: 'voxelia:gravel',
    grassColor: '#6aae74',
    foliageColor: '#5c9e6a',
    skyColor: '#a9c6e8',
    fogColor: '#d5e2ef',
    waterColor: '#3660b8',
    decorators: [{ type: 'tree', attemptsPerChunk: 5, params: { kind: 'pinewood' } }],
    tags: ['overworld', 'cold'],
  });

  reg.register({
    name: 'voxelia:ocean',
    displayName: 'Ocean',
    temperature: 0.2,
    humidity: 0.9,
    baseHeight: 45,
    heightVariation: 3,
    surfaceBlock: 'voxelia:gravel',
    subsurfaceBlock: 'voxelia:dirt',
    underwaterBlock: 'voxelia:sand',
    grassColor: '#5fae4e',
    foliageColor: '#4f9e35',
    skyColor: '#88bbff',
    fogColor: '#b8d0f0',
    waterColor: '#2b56b0',
    decorators: [],
    tags: ['overworld', 'ocean'],
  });
}
