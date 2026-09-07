import type { IBlockRegistry } from './types';

/**
 * SKELETON content — a starter block set so the game renders and plays.
 * Phase 1 (Agent: content) expands this to 30+ blocks with correct drops,
 * tool tiers, sounds and original texture keys.
 */
export function registerCoreBlocks(reg: IBlockRegistry): void {
  reg.register({ name: 'voxelia:bedrock', hardness: Infinity, resistance: Infinity, textures: 'bedrock', tags: ['unbreakable'] });
  reg.register({ name: 'voxelia:stone', hardness: 1.5, resistance: 6, preferredTool: 'pickaxe', minToolTier: 'wood', requiresCorrectTool: true, textures: 'stone', drops: [{ item: 'voxelia:cobblestone', min: 1, max: 1, chance: 1 }] });
  reg.register({ name: 'voxelia:cobblestone', hardness: 2, resistance: 6, preferredTool: 'pickaxe', minToolTier: 'wood', requiresCorrectTool: true, textures: 'cobblestone' });
  reg.register({ name: 'voxelia:dirt', hardness: 0.5, preferredTool: 'shovel', textures: 'dirt' });
  reg.register({
    name: 'voxelia:grass_block',
    hardness: 0.6,
    preferredTool: 'shovel',
    tintIndex: 0,
    textures: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
    drops: [{ item: 'voxelia:dirt', min: 1, max: 1, chance: 1 }],
  });
  reg.register({ name: 'voxelia:sand', hardness: 0.5, preferredTool: 'shovel', textures: 'sand', tags: ['gravity'] });
  reg.register({ name: 'voxelia:gravel', hardness: 0.6, preferredTool: 'shovel', textures: 'gravel', tags: ['gravity'] });
  reg.register({ name: 'voxelia:oak_log', hardness: 2, preferredTool: 'axe', flammable: true, textures: { top: 'log_top', bottom: 'log_top', side: 'log_side' }, tags: ['log'] });
  reg.register({ name: 'voxelia:oak_planks', hardness: 2, resistance: 3, preferredTool: 'axe', flammable: true, textures: 'planks', tags: ['planks'] });
  reg.register({
    name: 'voxelia:oak_leaves',
    hardness: 0.2,
    renderType: 'cutout',
    opaque: false,
    preferredTool: 'shears',
    flammable: true,
    tintIndex: 1,
    lightAbsorption: 1,
    textures: 'leaves',
    drops: [{ item: 'voxelia:oak_sapling', min: 0, max: 1, chance: 0.05 }],
  });
  reg.register({ name: 'voxelia:oak_sapling', renderType: 'cross', opaque: false, solid: false, hardness: 0, textures: 'sapling' });
  reg.register({ name: 'voxelia:glass', hardness: 0.3, renderType: 'transparent', opaque: false, lightAbsorption: 0, textures: 'glass', drops: [] });
  reg.register({
    name: 'voxelia:water',
    renderType: 'liquid',
    opaque: false,
    solid: false,
    fluidBlocking: false,
    hardness: Infinity,
    lightAbsorption: 2,
    tintIndex: 2,
    replaceable: true,
    textures: 'water',
    drops: [],
    tags: ['fluid'],
  });
  reg.register({ name: 'voxelia:coal_ore', hardness: 3, resistance: 6, preferredTool: 'pickaxe', minToolTier: 'wood', requiresCorrectTool: true, textures: 'coal_ore', drops: [{ item: 'voxelia:coal', min: 1, max: 1, chance: 1 }] });
  reg.register({ name: 'voxelia:iron_ore', hardness: 3, resistance: 6, preferredTool: 'pickaxe', minToolTier: 'stone', requiresCorrectTool: true, textures: 'iron_ore', drops: [{ item: 'voxelia:raw_iron', min: 1, max: 1, chance: 1 }] });
  reg.register({ name: 'voxelia:crafting_table', hardness: 2.5, preferredTool: 'axe', flammable: true, textures: { top: 'crafting_top', side: 'crafting_side', bottom: 'planks' }, tags: ['station'] });
  reg.register({ name: 'voxelia:furnace', hardness: 3.5, preferredTool: 'pickaxe', minToolTier: 'wood', requiresCorrectTool: true, textures: { side: 'furnace_side', top: 'furnace_top', bottom: 'furnace_top' }, tags: ['station'] });
  reg.register({ name: 'voxelia:torch', renderType: 'cross', opaque: false, solid: false, hardness: 0, lightEmission: 14, textures: 'torch' });
}
