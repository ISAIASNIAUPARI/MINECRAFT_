import type { BlockSoundGroup, IBlockRegistry, ToolCategory, ToolTier } from './types';

/**
 * Voxelia's core block set — original names under the `voxelia:` namespace.
 * Nothing here is copied from another game's block list; the palette, the
 * material identity (amberwood / pinewood / silverbark timber, gloomstone deep
 * rock, sunstone·palestone·ashstone igneous family, gleam crystal) and every
 * texture key are invented for this project.
 *
 * `air` (id 0) is registered by {@link BlockRegistry} itself; everything else is
 * assigned ids in registration order.
 */

// --- sound groups ---------------------------------------------------------

/** Build a {@link BlockSoundGroup} from a family key the audio agent maps to clips. */
function snd(group: string): BlockSoundGroup {
  return {
    break: `block.${group}.break`,
    place: `block.${group}.place`,
    step: `block.${group}.step`,
    hit: `block.${group}.hit`,
  };
}

const SOUND = {
  stone: snd('stone'),
  gravel: snd('gravel'),
  sand: snd('sand'),
  dirt: snd('soil'),
  grass: snd('foliage'),
  wood: snd('timber'),
  leaves: snd('leaves'),
  glass: snd('glass'),
  wool: snd('woven'),
  metal: snd('metal'),
  crystal: snd('crystal'),
  snow: snd('snow'),
  ice: snd('ice'),
  mud: snd('sludge'),
  plant: snd('plant'),
  liquid: snd('liquid'),
  bricks: snd('masonry'),
  nether: snd('scorched'),
} as const;

// --- shared colour palette ----------------------------------------------

/** Voxelia's eight base pigments (original names). Drives coloured glass + wool. */
export const DYE_COLORS = [
  'bone',
  'crimson',
  'amber',
  'verdant',
  'azure',
  'violet',
  'rose',
  'slate',
] as const;
export type DyeColor = (typeof DYE_COLORS)[number];

export const DYE_DISPLAY: Record<DyeColor, string> = {
  bone: 'Bone',
  crimson: 'Crimson',
  amber: 'Amber',
  verdant: 'Verdant',
  azure: 'Azure',
  violet: 'Violet',
  rose: 'Rose',
  slate: 'Slate',
};

// --- family helpers ----------------------------------------------------

interface StoneOpts {
  hardness?: number;
  resistance?: number;
  tier?: ToolTier;
  drop?: string;
  requiresCorrectTool?: boolean;
  sound?: BlockSoundGroup;
  tags?: string[];
}

function stone(reg: IBlockRegistry, name: string, display: string, texture: string, o: StoneOpts = {}): void {
  const full = `voxelia:${name}`;
  reg.register({
    name: full,
    displayName: display,
    textures: texture,
    renderType: 'opaque',
    hardness: o.hardness ?? 1.5,
    resistance: o.resistance ?? 6,
    preferredTool: 'pickaxe',
    minToolTier: o.tier ?? 'wood',
    requiresCorrectTool: o.requiresCorrectTool ?? true,
    drops: o.drop === null ? [] : [{ item: `voxelia:${o.drop ?? name}`, min: 1, max: 1, chance: 1 }],
    sounds: o.sound ?? SOUND.stone,
    tags: ['voxelia:stone', 'voxelia:pickaxe_mineable', ...(o.tags ?? [])],
  });
}

/** A slab + stairs pair backed by the same texture as `source`. */
function slabStairs(
  reg: IBlockRegistry,
  base: string,
  display: string,
  texture: string,
  tool: ToolCategory,
  tier: ToolTier,
  opts: { flammable?: boolean; sound?: BlockSoundGroup; requiresCorrectTool?: boolean; hardness?: number } = {},
): void {
  const sound = opts.sound ?? (tool === 'axe' ? SOUND.wood : SOUND.stone);
  const mineable = tool === 'axe' ? 'voxelia:axe_mineable' : 'voxelia:pickaxe_mineable';
  const common = {
    textures: texture,
    renderType: 'opaque' as const,
    opaque: false,
    hardness: opts.hardness ?? 2,
    resistance: tool === 'axe' ? 3 : 6,
    preferredTool: tool,
    minToolTier: tier,
    requiresCorrectTool: opts.requiresCorrectTool ?? tool === 'pickaxe',
    flammable: opts.flammable ?? false,
    sounds: sound,
  };
  reg.register({
    ...common,
    name: `voxelia:${base}_slab`,
    displayName: `${display} Slab`,
    shape: 'slab_bottom',
    tags: [mineable, 'voxelia:slabs'],
  });
  reg.register({
    ...common,
    name: `voxelia:${base}_stairs`,
    displayName: `${display} Stairs`,
    shape: 'stairs',
    tags: [mineable, 'voxelia:stairs'],
  });
}

interface WoodSet {
  id: string;
  display: string;
  /** cool-climate timber gets a bluer leaf; keep it in the foliage tint slot. */
  leafTexture?: string;
}

function woodSet(reg: IBlockRegistry, w: WoodSet): void {
  const { id, display } = w;
  const logTags = ['voxelia:logs', 'voxelia:axe_mineable', `voxelia:${id}_logs`];
  reg.register({
    name: `voxelia:${id}_log`,
    displayName: `${display} Log`,
    textures: { top: `${id}_log_top`, bottom: `${id}_log_top`, side: `${id}_log` },
    hardness: 2,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: logTags,
  });
  reg.register({
    name: `voxelia:${id}_wood`,
    displayName: `${display} Wood`,
    textures: `${id}_log`,
    hardness: 2,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: logTags,
  });
  reg.register({
    name: `voxelia:stripped_${id}_log`,
    displayName: `Stripped ${display} Log`,
    textures: { top: `stripped_${id}_log_top`, bottom: `stripped_${id}_log_top`, side: `stripped_${id}_log` },
    hardness: 2,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable', 'voxelia:stripped_logs'],
  });
  reg.register({
    name: `voxelia:stripped_${id}_wood`,
    displayName: `Stripped ${display} Wood`,
    textures: `stripped_${id}_log`,
    hardness: 2,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable', 'voxelia:stripped_logs'],
  });
  reg.register({
    name: `voxelia:${id}_planks`,
    displayName: `${display} Planks`,
    textures: `${id}_planks`,
    hardness: 2,
    resistance: 3,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:planks', 'voxelia:axe_mineable'],
  });
  reg.register({
    name: `voxelia:${id}_leaves`,
    displayName: `${display} Leaves`,
    textures: w.leafTexture ?? `${id}_leaves`,
    renderType: 'cutout',
    opaque: false,
    shape: 'full',
    hardness: 0.2,
    resistance: 0.2,
    preferredTool: 'shears',
    tintIndex: 1,
    lightAbsorption: 1,
    flammable: true,
    sounds: SOUND.leaves,
    drops: [
      { item: `voxelia:${id}_sapling`, min: 1, max: 1, chance: 0.05 },
      { item: 'voxelia:stick', min: 1, max: 2, chance: 0.02 },
    ],
    tags: ['voxelia:leaves', 'voxelia:hoe_mineable'],
  });
  reg.register({
    name: `voxelia:${id}_sapling`,
    displayName: `${display} Sapling`,
    textures: `${id}_sapling`,
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    sounds: SOUND.plant,
    tags: ['voxelia:saplings'],
  });
  // Doors / trapdoors / fences per wood.
  reg.register({
    name: `voxelia:${id}_door`,
    displayName: `${display} Door`,
    textures: { top: `${id}_door_top`, bottom: `${id}_door_bottom`, all: `${id}_door_bottom` },
    renderType: 'cutout',
    opaque: false,
    shape: 'door',
    hardness: 3,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:wooden_doors', 'voxelia:axe_mineable'],
  });
  reg.register({
    name: `voxelia:${id}_trapdoor`,
    displayName: `${display} Trapdoor`,
    textures: `${id}_trapdoor`,
    renderType: 'cutout',
    opaque: false,
    shape: 'trapdoor',
    hardness: 3,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:wooden_trapdoors', 'voxelia:axe_mineable'],
  });
  reg.register({
    name: `voxelia:${id}_fence`,
    displayName: `${display} Fence`,
    textures: `${id}_planks`,
    renderType: 'cutout',
    opaque: false,
    shape: 'fence',
    hardness: 2,
    resistance: 3,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:fences', 'voxelia:wooden_fences', 'voxelia:axe_mineable'],
  });
  reg.register({
    name: `voxelia:${id}_fence_gate`,
    displayName: `${display} Fence Gate`,
    textures: `${id}_planks`,
    renderType: 'cutout',
    opaque: false,
    shape: 'fence_gate',
    hardness: 2,
    resistance: 3,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:fence_gates', 'voxelia:axe_mineable'],
  });
  slabStairs(reg, `${id}`, `${display}`, `${id}_planks`, 'axe', 'none', { flammable: true, sound: SOUND.wood, requiresCorrectTool: false });
}

function flower(reg: IBlockRegistry, name: string, display: string): void {
  reg.register({
    name: `voxelia:${name}`,
    displayName: display,
    textures: name,
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    replaceable: false,
    flammable: true,
    sounds: SOUND.plant,
    tags: ['voxelia:flowers', 'voxelia:small_flowers'],
  });
}

function coloredCube(
  reg: IBlockRegistry,
  suffix: string,
  displaySuffix: string,
  base: {
    renderType: 'transparent' | 'opaque';
    hardness: number;
    sound: BlockSoundGroup;
    preferredTool?: ToolCategory;
    flammable?: boolean;
    dropsNothing?: boolean;
    lightAbsorption?: number;
    tag: string;
  },
): void {
  for (const color of DYE_COLORS) {
    reg.register({
      name: `voxelia:${color}_${suffix}`,
      displayName: `${DYE_DISPLAY[color]} ${displaySuffix}`,
      textures: `${color}_${suffix}`,
      renderType: base.renderType,
      opaque: base.renderType === 'opaque',
      hardness: base.hardness,
      resistance: base.hardness,
      preferredTool: base.preferredTool ?? 'none',
      flammable: base.flammable ?? false,
      lightAbsorption: base.renderType === 'transparent' ? (base.lightAbsorption ?? 0) : 15,
      sounds: base.sound,
      drops: base.dropsNothing ? [] : [{ item: `voxelia:${color}_${suffix}`, min: 1, max: 1, chance: 1 }],
      tags: [base.tag, `voxelia:${suffix}`],
    });
  }
}

function ore(
  reg: IBlockRegistry,
  name: string,
  display: string,
  texture: string,
  o: { drop: string; dropMin?: number; dropMax?: number; tier: ToolTier; hardness?: number; deep?: boolean; xp?: [number, number] },
): void {
  reg.register({
    name: `voxelia:${name}`,
    displayName: display,
    textures: texture,
    hardness: o.hardness ?? (o.deep ? 4.5 : 3),
    resistance: 3,
    preferredTool: 'pickaxe',
    minToolTier: o.tier,
    requiresCorrectTool: true,
    drops: [{ item: `voxelia:${o.drop}`, min: o.dropMin ?? 1, max: o.dropMax ?? 1, chance: 1 }],
    sounds: SOUND.stone,
    tags: ['voxelia:ores', 'voxelia:pickaxe_mineable', ...(o.deep ? ['voxelia:gloomstone_ores'] : [])],
  });
}

function storageBlock(
  reg: IBlockRegistry,
  name: string,
  display: string,
  o: { tier: ToolTier; metal?: boolean; hardness?: number; flammable?: boolean },
): void {
  reg.register({
    name: `voxelia:${name}`,
    displayName: display,
    textures: name,
    hardness: o.hardness ?? 5,
    resistance: 6,
    preferredTool: 'pickaxe',
    minToolTier: o.tier,
    requiresCorrectTool: true,
    flammable: o.flammable ?? false,
    sounds: o.metal ? SOUND.metal : SOUND.stone,
    tags: ['voxelia:pickaxe_mineable', 'voxelia:storage_blocks'],
  });
}

// --- the set ----------------------------------------------------------

export function registerCoreBlocks(reg: IBlockRegistry): void {
  // ---- bedrock & liquids ----
  reg.register({
    name: 'voxelia:bedrock',
    displayName: 'Bedrock',
    textures: 'bedrock',
    hardness: Infinity,
    resistance: Infinity,
    drops: [],
    sounds: SOUND.stone,
    tags: ['voxelia:unbreakable'],
  });
  reg.register({
    name: 'voxelia:water',
    displayName: 'Water',
    textures: 'water',
    renderType: 'liquid',
    opaque: false,
    solid: false,
    fluidBlocking: false,
    shape: 'liquid',
    hardness: Infinity,
    resistance: 100,
    lightAbsorption: 2,
    tintIndex: 2,
    replaceable: true,
    drops: [],
    sounds: SOUND.liquid,
    tags: ['voxelia:fluid', 'voxelia:water'],
  });
  reg.register({
    name: 'voxelia:lava',
    displayName: 'Lava',
    textures: 'lava',
    renderType: 'liquid',
    opaque: false,
    solid: false,
    fluidBlocking: false,
    shape: 'liquid',
    hardness: Infinity,
    resistance: 100,
    lightEmission: 15,
    lightAbsorption: 0,
    replaceable: true,
    drops: [],
    sounds: SOUND.liquid,
    tags: ['voxelia:fluid', 'voxelia:lava', 'voxelia:hot'],
  });

  // ---- stone family ----
  stone(reg, 'stone', 'Stone', 'stone', { drop: 'cobblestone' });
  stone(reg, 'cobblestone', 'Cobblestone', 'cobblestone', { hardness: 2 });
  stone(reg, 'mossy_cobblestone', 'Mossy Cobblestone', 'mossy_cobblestone', { hardness: 2 });
  stone(reg, 'smooth_stone', 'Smooth Stone', 'smooth_stone');
  stone(reg, 'gloomstone', 'Gloomstone', 'gloomstone', { hardness: 3, drop: 'cobbled_gloomstone' });
  stone(reg, 'cobbled_gloomstone', 'Cobbled Gloomstone', 'cobbled_gloomstone', { hardness: 3.5 });
  stone(reg, 'polished_gloomstone', 'Polished Gloomstone', 'polished_gloomstone', { hardness: 3.5 });
  stone(reg, 'sunstone', 'Sunstone', 'sunstone', { drop: 'sunstone' });
  stone(reg, 'polished_sunstone', 'Polished Sunstone', 'polished_sunstone');
  stone(reg, 'palestone', 'Palestone', 'palestone', { drop: 'palestone' });
  stone(reg, 'polished_palestone', 'Polished Palestone', 'polished_palestone');
  stone(reg, 'ashstone', 'Ashstone', 'ashstone', { drop: 'ashstone' });
  stone(reg, 'polished_ashstone', 'Polished Ashstone', 'polished_ashstone');
  stone(reg, 'voidglass', 'Voidglass', 'voidglass', {
    hardness: 45,
    resistance: 1200,
    tier: 'diamond',
    tags: ['voxelia:blast_resistant'],
  });

  // ---- masonry / building ----
  stone(reg, 'stone_bricks', 'Stone Bricks', 'stone_bricks', { hardness: 2, sound: SOUND.bricks, drop: 'stone_bricks' });
  stone(reg, 'cracked_stone_bricks', 'Cracked Stone Bricks', 'cracked_stone_bricks', { hardness: 2, sound: SOUND.bricks });
  stone(reg, 'mossy_stone_bricks', 'Mossy Stone Bricks', 'mossy_stone_bricks', { hardness: 2, sound: SOUND.bricks });
  stone(reg, 'chiseled_stone_bricks', 'Chiseled Stone Bricks', 'chiseled_stone_bricks', { hardness: 2, sound: SOUND.bricks });
  stone(reg, 'gloomstone_bricks', 'Gloomstone Bricks', 'gloomstone_bricks', { hardness: 3, sound: SOUND.bricks, drop: 'gloomstone_bricks' });
  stone(reg, 'cracked_gloomstone_bricks', 'Cracked Gloomstone Bricks', 'cracked_gloomstone_bricks', { hardness: 3, sound: SOUND.bricks });
  stone(reg, 'gloomstone_tiles', 'Gloomstone Tiles', 'gloomstone_tiles', { hardness: 3, sound: SOUND.bricks, drop: 'gloomstone_tiles' });
  stone(reg, 'chiseled_gloomstone', 'Chiseled Gloomstone', 'chiseled_gloomstone', { hardness: 3, sound: SOUND.bricks });
  stone(reg, 'bricks', 'Bricks', 'bricks', { hardness: 2, sound: SOUND.bricks, drop: 'bricks' });
  stone(reg, 'sunstone_bricks', 'Sunstone Bricks', 'sunstone_bricks', { hardness: 1.5, sound: SOUND.bricks, drop: 'sunstone_bricks' });

  // ---- soils ----
  reg.register({
    name: 'voxelia:dirt',
    displayName: 'Dirt',
    textures: 'dirt',
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'shovel',
    sounds: SOUND.dirt,
    tags: ['voxelia:dirt', 'voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:coarse_dirt',
    displayName: 'Coarse Dirt',
    textures: 'coarse_dirt',
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'shovel',
    sounds: SOUND.dirt,
    tags: ['voxelia:dirt', 'voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:grass_block',
    displayName: 'Grass Block',
    textures: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
    hardness: 0.6,
    resistance: 0.6,
    preferredTool: 'shovel',
    tintIndex: 0,
    sounds: SOUND.grass,
    drops: [{ item: 'voxelia:dirt', min: 1, max: 1, chance: 1 }],
    tags: ['voxelia:dirt', 'voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:rootsoil',
    displayName: 'Rootsoil',
    textures: { top: 'rootsoil_top', bottom: 'dirt', side: 'rootsoil_side' },
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'shovel',
    sounds: SOUND.dirt,
    drops: [{ item: 'voxelia:rootsoil', min: 1, max: 1, chance: 1 }],
    tags: ['voxelia:dirt', 'voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:tilled_soil',
    displayName: 'Tilled Soil',
    textures: { top: 'tilled_soil_top', bottom: 'dirt', side: 'dirt' },
    hardness: 0.6,
    resistance: 0.6,
    preferredTool: 'shovel',
    sounds: SOUND.dirt,
    drops: [{ item: 'voxelia:dirt', min: 1, max: 1, chance: 1 }],
    tags: ['voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:mud',
    displayName: 'Mud',
    textures: 'mud',
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'shovel',
    sounds: SOUND.mud,
    tags: ['voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:packed_mud',
    displayName: 'Packed Mud',
    textures: 'packed_mud',
    hardness: 1,
    resistance: 3,
    preferredTool: 'pickaxe',
    sounds: SOUND.dirt,
    tags: ['voxelia:pickaxe_mineable'],
  });
  stone(reg, 'mud_bricks', 'Mud Bricks', 'mud_bricks', { hardness: 1.5, requiresCorrectTool: false, sound: SOUND.bricks, drop: 'mud_bricks' });
  reg.register({
    name: 'voxelia:clay',
    displayName: 'Clay',
    textures: 'clay',
    hardness: 0.6,
    resistance: 0.6,
    preferredTool: 'shovel',
    sounds: SOUND.mud,
    drops: [{ item: 'voxelia:clay_lump', min: 4, max: 4, chance: 1 }],
    tags: ['voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:gravel',
    displayName: 'Gravel',
    textures: 'gravel',
    hardness: 0.6,
    resistance: 0.6,
    preferredTool: 'shovel',
    sounds: SOUND.gravel,
    drops: [
      { item: 'voxelia:flint', min: 1, max: 1, chance: 0.1 },
      { item: 'voxelia:gravel', min: 1, max: 1, chance: 1 },
    ],
    tags: ['voxelia:gravity', 'voxelia:shovel_mineable'],
  });

  // ---- sand & sandstone ----
  reg.register({
    name: 'voxelia:sand',
    displayName: 'Sand',
    textures: 'sand',
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'shovel',
    sounds: SOUND.sand,
    tags: ['voxelia:sand', 'voxelia:gravity', 'voxelia:shovel_mineable'],
  });
  reg.register({
    name: 'voxelia:crimson_sand',
    displayName: 'Crimson Sand',
    textures: 'crimson_sand',
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'shovel',
    sounds: SOUND.sand,
    tags: ['voxelia:sand', 'voxelia:gravity', 'voxelia:shovel_mineable'],
  });
  stone(reg, 'sandstone', 'Sandstone', 'sandstone', { hardness: 0.8, requiresCorrectTool: false, sound: SOUND.stone, drop: 'sandstone' });
  stone(reg, 'cut_sandstone', 'Cut Sandstone', 'cut_sandstone', { hardness: 0.8, requiresCorrectTool: false, drop: 'cut_sandstone' });
  stone(reg, 'smooth_sandstone', 'Smooth Sandstone', 'smooth_sandstone', { hardness: 0.8, requiresCorrectTool: false, drop: 'smooth_sandstone' });
  stone(reg, 'crimson_sandstone', 'Crimson Sandstone', 'crimson_sandstone', { hardness: 0.8, requiresCorrectTool: false, drop: 'crimson_sandstone' });
  stone(reg, 'cut_crimson_sandstone', 'Cut Crimson Sandstone', 'cut_crimson_sandstone', { hardness: 0.8, requiresCorrectTool: false, drop: 'cut_crimson_sandstone' });

  // ---- snow & ice ----
  reg.register({
    name: 'voxelia:snow_block',
    displayName: 'Snow Block',
    textures: 'snow',
    hardness: 0.2,
    resistance: 0.2,
    preferredTool: 'shovel',
    minToolTier: 'wood',
    requiresCorrectTool: true,
    sounds: SOUND.snow,
    drops: [{ item: 'voxelia:snowball', min: 4, max: 4, chance: 1 }],
    tags: ['voxelia:shovel_mineable', 'voxelia:snow'],
  });
  reg.register({
    name: 'voxelia:snow_layer',
    displayName: 'Snow',
    textures: 'snow',
    renderType: 'cutout',
    opaque: false,
    solid: false,
    shape: 'layer',
    hardness: 0.1,
    resistance: 0.1,
    preferredTool: 'shovel',
    replaceable: true,
    sounds: SOUND.snow,
    drops: [{ item: 'voxelia:snowball', min: 1, max: 1, chance: 1 }],
    tags: ['voxelia:shovel_mineable', 'voxelia:snow'],
  });
  reg.register({
    name: 'voxelia:ice',
    displayName: 'Ice',
    textures: 'ice',
    renderType: 'transparent',
    opaque: false,
    lightAbsorption: 1,
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'pickaxe',
    sounds: SOUND.ice,
    drops: [],
    tags: ['voxelia:pickaxe_mineable', 'voxelia:slippery', 'voxelia:ice'],
  });
  reg.register({
    name: 'voxelia:packed_ice',
    displayName: 'Packed Ice',
    textures: 'packed_ice',
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'pickaxe',
    sounds: SOUND.ice,
    drops: [],
    tags: ['voxelia:pickaxe_mineable', 'voxelia:slippery', 'voxelia:ice'],
  });
  reg.register({
    name: 'voxelia:glacial_ice',
    displayName: 'Glacial Ice',
    textures: 'glacial_ice',
    hardness: 0.8,
    resistance: 0.8,
    preferredTool: 'pickaxe',
    sounds: SOUND.ice,
    drops: [],
    tags: ['voxelia:pickaxe_mineable', 'voxelia:slippery', 'voxelia:ice'],
  });

  // ---- ores ----
  ore(reg, 'coal_ore', 'Coal Deposit', 'coal_ore', { drop: 'coal', tier: 'wood', xp: [0, 2] });
  ore(reg, 'gloomstone_coal_ore', 'Deep Coal Deposit', 'gloomstone_coal_ore', { drop: 'coal', tier: 'wood', deep: true, xp: [0, 2] });
  ore(reg, 'copper_ore', 'Copper Deposit', 'copper_ore', { drop: 'raw_copper', dropMin: 2, dropMax: 4, tier: 'stone', xp: [0, 1] });
  ore(reg, 'gloomstone_copper_ore', 'Deep Copper Deposit', 'gloomstone_copper_ore', { drop: 'raw_copper', dropMin: 2, dropMax: 5, tier: 'stone', deep: true });
  ore(reg, 'iron_ore', 'Iron Deposit', 'iron_ore', { drop: 'raw_iron', tier: 'stone', xp: [0, 1] });
  ore(reg, 'gloomstone_iron_ore', 'Deep Iron Deposit', 'gloomstone_iron_ore', { drop: 'raw_iron', tier: 'stone', deep: true });
  ore(reg, 'gold_ore', 'Gold Deposit', 'gold_ore', { drop: 'raw_gold', tier: 'iron', xp: [0, 1] });
  ore(reg, 'gloomstone_gold_ore', 'Deep Gold Deposit', 'gloomstone_gold_ore', { drop: 'raw_gold', tier: 'iron', deep: true });
  ore(reg, 'gleam_ore', 'Gleam Deposit', 'gleam_ore', { drop: 'raw_gleam', tier: 'iron', xp: [3, 7] });
  ore(reg, 'gloomstone_gleam_ore', 'Deep Gleam Deposit', 'gloomstone_gleam_ore', { drop: 'raw_gleam', tier: 'iron', deep: true, xp: [3, 7] });

  // ---- mineral / storage blocks ----
  storageBlock(reg, 'coal_block', 'Block of Coal', { tier: 'wood', flammable: false });
  storageBlock(reg, 'raw_copper_block', 'Block of Raw Copper', { tier: 'stone', metal: true });
  storageBlock(reg, 'raw_iron_block', 'Block of Raw Iron', { tier: 'stone', metal: true });
  storageBlock(reg, 'raw_gold_block', 'Block of Raw Gold', { tier: 'iron', metal: true });
  storageBlock(reg, 'copper_block', 'Block of Copper', { tier: 'stone', metal: true });
  storageBlock(reg, 'iron_block', 'Block of Iron', { tier: 'stone', metal: true });
  storageBlock(reg, 'gold_block', 'Block of Gold', { tier: 'iron', metal: true });
  reg.register({
    name: 'voxelia:gleam_block',
    displayName: 'Block of Gleam',
    textures: 'gleam_block',
    renderType: 'opaque',
    hardness: 5,
    resistance: 8,
    lightEmission: 4,
    preferredTool: 'pickaxe',
    minToolTier: 'iron',
    requiresCorrectTool: true,
    sounds: SOUND.crystal,
    tags: ['voxelia:pickaxe_mineable', 'voxelia:storage_blocks'],
  });

  // ---- wood sets ----
  woodSet(reg, { id: 'amberwood', display: 'Amberwood' });
  woodSet(reg, { id: 'pinewood', display: 'Pinewood' });
  woodSet(reg, { id: 'silverbark', display: 'Silverbark' });

  // ---- stone slabs & stairs ----
  slabStairs(reg, 'stone', 'Stone', 'stone', 'pickaxe', 'wood');
  slabStairs(reg, 'cobblestone', 'Cobblestone', 'cobblestone', 'pickaxe', 'wood');
  slabStairs(reg, 'stone_brick', 'Stone Brick', 'stone_bricks', 'pickaxe', 'wood', { sound: SOUND.bricks });
  slabStairs(reg, 'gloomstone_brick', 'Gloomstone Brick', 'gloomstone_bricks', 'pickaxe', 'wood', { hardness: 3, sound: SOUND.bricks });
  slabStairs(reg, 'sunstone', 'Sunstone', 'sunstone', 'pickaxe', 'wood');
  slabStairs(reg, 'sandstone', 'Sandstone', 'sandstone', 'pickaxe', 'wood', { requiresCorrectTool: false, hardness: 0.8 });
  slabStairs(reg, 'brick', 'Brick', 'bricks', 'pickaxe', 'wood', { sound: SOUND.bricks });
  slabStairs(reg, 'mud_brick', 'Mud Brick', 'mud_bricks', 'pickaxe', 'wood', { requiresCorrectTool: false, hardness: 1.5, sound: SOUND.bricks });

  // ---- walls ----
  for (const [id, display, tex] of [
    ['cobblestone_wall', 'Cobblestone Wall', 'cobblestone'],
    ['stone_brick_wall', 'Stone Brick Wall', 'stone_bricks'],
    ['gloomstone_brick_wall', 'Gloomstone Brick Wall', 'gloomstone_bricks'],
    ['sandstone_wall', 'Sandstone Wall', 'sandstone'],
  ] as const) {
    reg.register({
      name: `voxelia:${id}`,
      displayName: display,
      textures: tex,
      renderType: 'cutout',
      opaque: false,
      shape: 'wall',
      hardness: 2,
      resistance: 6,
      preferredTool: 'pickaxe',
      minToolTier: 'wood',
      requiresCorrectTool: true,
      sounds: SOUND.stone,
      tags: ['voxelia:walls', 'voxelia:pickaxe_mineable'],
    });
  }

  // ---- glass ----
  reg.register({
    name: 'voxelia:glass',
    displayName: 'Glass',
    textures: 'glass',
    renderType: 'transparent',
    opaque: false,
    lightAbsorption: 0,
    hardness: 0.3,
    resistance: 0.3,
    sounds: SOUND.glass,
    drops: [],
    tags: ['voxelia:glass'],
  });
  coloredCube(reg, 'glass', 'Glass', {
    renderType: 'transparent',
    hardness: 0.3,
    sound: SOUND.glass,
    dropsNothing: true,
    tag: 'voxelia:stained_glass',
  });

  // ---- wool ----
  coloredCube(reg, 'wool', 'Wool', {
    renderType: 'opaque',
    hardness: 0.8,
    sound: SOUND.wool,
    preferredTool: 'shears',
    flammable: true,
    tag: 'voxelia:wool',
  });

  // ---- utility / stations ----
  reg.register({
    name: 'voxelia:crafting_table',
    displayName: 'Workbench',
    textures: { top: 'crafting_table_top', bottom: 'amberwood_planks', north: 'crafting_table_front', south: 'crafting_table_front', east: 'crafting_table_side', west: 'crafting_table_side' },
    hardness: 2.5,
    resistance: 2.5,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable', 'voxelia:crafting_stations'],
  });
  reg.register({
    name: 'voxelia:sawbench',
    displayName: 'Sawbench',
    textures: { top: 'sawbench_top', bottom: 'amberwood_planks', side: 'sawbench_side' },
    hardness: 2.5,
    resistance: 2.5,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable', 'voxelia:crafting_stations'],
  });
  reg.register({
    name: 'voxelia:stonecarver',
    displayName: 'Stonecarver',
    textures: { top: 'stonecarver_top', side: 'stonecarver_side', bottom: 'stone' },
    hardness: 3.5,
    resistance: 3.5,
    preferredTool: 'pickaxe',
    minToolTier: 'wood',
    requiresCorrectTool: true,
    sounds: SOUND.stone,
    tags: ['voxelia:pickaxe_mineable', 'voxelia:crafting_stations'],
  });
  for (const [id, display] of [
    ['furnace', 'Furnace'],
    ['kiln', 'Kiln'],
    ['hearth', 'Hearth'],
  ] as const) {
    reg.register({
      name: `voxelia:${id}`,
      displayName: display,
      textures: { top: `${id}_top`, bottom: `${id}_top`, north: `${id}_front`, south: `${id}_side`, east: `${id}_side`, west: `${id}_side` },
      hardness: 3.5,
      resistance: 3.5,
      preferredTool: 'pickaxe',
      minToolTier: 'wood',
      requiresCorrectTool: true,
      sounds: SOUND.stone,
      tags: ['voxelia:pickaxe_mineable', 'voxelia:crafting_stations', 'voxelia:smelters'],
    });
  }
  reg.register({
    name: 'voxelia:chest',
    displayName: 'Chest',
    textures: { top: 'chest_top', bottom: 'chest_top', north: 'chest_front', south: 'chest_side', east: 'chest_side', west: 'chest_side' },
    renderType: 'cutout',
    opaque: false,
    hardness: 2.5,
    resistance: 2.5,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable', 'voxelia:containers'],
  });
  reg.register({
    name: 'voxelia:tome_shelf',
    displayName: 'Tome Shelf',
    textures: { top: 'amberwood_planks', bottom: 'amberwood_planks', side: 'tome_shelf' },
    hardness: 1.5,
    resistance: 1.5,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    drops: [{ item: 'voxelia:tome', min: 3, max: 3, chance: 1 }],
    tags: ['voxelia:axe_mineable', 'voxelia:enchant_power'],
  });

  // ---- light sources ----
  reg.register({
    name: 'voxelia:torch',
    displayName: 'Torch',
    textures: 'torch',
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    lightEmission: 14,
    sounds: SOUND.wood,
    tags: ['voxelia:light_sources'],
  });
  reg.register({
    name: 'voxelia:lantern',
    displayName: 'Lantern',
    textures: 'lantern',
    renderType: 'cutout',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 3.5,
    resistance: 3.5,
    preferredTool: 'pickaxe',
    lightEmission: 15,
    sounds: SOUND.metal,
    tags: ['voxelia:light_sources', 'voxelia:pickaxe_mineable'],
  });
  reg.register({
    name: 'voxelia:sunlamp',
    displayName: 'Sunlamp',
    textures: 'sunlamp',
    hardness: 0.3,
    resistance: 0.3,
    lightEmission: 15,
    sounds: SOUND.glass,
    tags: ['voxelia:light_sources'],
  });
  reg.register({
    name: 'voxelia:gleam_cluster',
    displayName: 'Gleam Cluster',
    textures: 'gleam_cluster',
    renderType: 'cutout',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 1.5,
    resistance: 1.5,
    preferredTool: 'pickaxe',
    lightEmission: 7,
    sounds: SOUND.crystal,
    drops: [{ item: 'voxelia:raw_gleam', min: 2, max: 4, chance: 1 }],
    tags: ['voxelia:pickaxe_mineable'],
  });

  // ---- climbable / access ----
  reg.register({
    name: 'voxelia:ladder',
    displayName: 'Ladder',
    textures: 'ladder',
    renderType: 'cutout',
    opaque: false,
    solid: false,
    shape: 'ladder',
    hardness: 0.4,
    resistance: 0.4,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:climbable', 'voxelia:axe_mineable'],
  });
  reg.register({
    name: 'voxelia:iron_door',
    displayName: 'Iron Door',
    textures: { top: 'iron_door_top', bottom: 'iron_door_bottom', all: 'iron_door_bottom' },
    renderType: 'cutout',
    opaque: false,
    shape: 'door',
    hardness: 5,
    resistance: 5,
    preferredTool: 'pickaxe',
    minToolTier: 'stone',
    requiresCorrectTool: true,
    sounds: SOUND.metal,
    tags: ['voxelia:doors', 'voxelia:pickaxe_mineable'],
  });
  reg.register({
    name: 'voxelia:iron_trapdoor',
    displayName: 'Iron Trapdoor',
    textures: 'iron_trapdoor',
    renderType: 'cutout',
    opaque: false,
    shape: 'trapdoor',
    hardness: 5,
    resistance: 5,
    preferredTool: 'pickaxe',
    minToolTier: 'stone',
    requiresCorrectTool: true,
    sounds: SOUND.metal,
    tags: ['voxelia:trapdoors', 'voxelia:pickaxe_mineable'],
  });

  // ---- decorative natural ----
  reg.register({
    name: 'voxelia:wild_grass',
    displayName: 'Wild Grass',
    textures: 'wild_grass',
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    replaceable: true,
    flammable: true,
    tintIndex: 0,
    sounds: SOUND.plant,
    drops: [
      { item: 'voxelia:plant_fiber', min: 1, max: 2, chance: 0.6 },
      { item: 'voxelia:grain_seeds', min: 1, max: 1, chance: 0.125 },
    ],
    tags: ['voxelia:replaceable_plants', 'voxelia:hoe_mineable'],
  });
  reg.register({
    name: 'voxelia:tall_fern',
    displayName: 'Tall Fern',
    textures: 'tall_fern',
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    replaceable: true,
    flammable: true,
    tintIndex: 1,
    sounds: SOUND.plant,
    drops: [{ item: 'voxelia:plant_fiber', min: 1, max: 2, chance: 0.5 }],
    tags: ['voxelia:replaceable_plants', 'voxelia:hoe_mineable'],
  });
  reg.register({
    name: 'voxelia:parched_shrub',
    displayName: 'Parched Shrub',
    textures: 'parched_shrub',
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    replaceable: true,
    flammable: true,
    sounds: SOUND.plant,
    drops: [{ item: 'voxelia:stick', min: 0, max: 2, chance: 0.5 }],
    tags: ['voxelia:replaceable_plants'],
  });
  flower(reg, 'emberpetal', 'Emberpetal');
  flower(reg, 'sunbloom', 'Sunbloom');
  flower(reg, 'meadowlace', 'Meadowlace');
  flower(reg, 'frostbell', 'Frostbell');
  flower(reg, 'duskbloom', 'Duskbloom');
  flower(reg, 'pinkcup', 'Pinkcup');
  flower(reg, 'mosswort', 'Mosswort');
  flower(reg, 'cindercup', 'Cindercup');
  reg.register({
    name: 'voxelia:glowcap',
    displayName: 'Glowcap',
    textures: 'glowcap',
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    lightEmission: 7,
    sounds: SOUND.plant,
    tags: ['voxelia:mushrooms', 'voxelia:light_sources'],
  });
  reg.register({
    name: 'voxelia:duskcap',
    displayName: 'Duskcap',
    textures: 'duskcap',
    renderType: 'cross',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 0,
    resistance: 0,
    sounds: SOUND.plant,
    tags: ['voxelia:mushrooms'],
  });

  // ---- farm / food blocks ----
  reg.register({
    name: 'voxelia:grain_bale',
    displayName: 'Grain Bale',
    textures: { top: 'grain_bale_top', bottom: 'grain_bale_top', side: 'grain_bale_side' },
    hardness: 0.5,
    resistance: 0.5,
    preferredTool: 'hoe',
    flammable: true,
    sounds: SOUND.grass,
    tags: ['voxelia:hoe_mineable'],
  });
  reg.register({
    name: 'voxelia:gourd',
    displayName: 'Gourd',
    textures: { top: 'gourd_top', bottom: 'gourd_top', side: 'gourd_side' },
    hardness: 1,
    resistance: 1,
    preferredTool: 'axe',
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable'],
  });
  reg.register({
    name: 'voxelia:gourd_lantern',
    displayName: 'Gourd Lantern',
    textures: { top: 'gourd_top', bottom: 'gourd_top', north: 'gourd_lantern_front', south: 'gourd_side', east: 'gourd_side', west: 'gourd_side' },
    hardness: 1,
    resistance: 1,
    preferredTool: 'axe',
    lightEmission: 15,
    sounds: SOUND.wood,
    tags: ['voxelia:axe_mineable', 'voxelia:light_sources'],
  });

  // ---- special ----
  reg.register({
    name: 'voxelia:silkweb',
    displayName: 'Silkweb',
    textures: 'silkweb',
    renderType: 'cutout',
    opaque: false,
    solid: false,
    shape: 'cross',
    hardness: 4,
    resistance: 4,
    preferredTool: 'sword',
    sounds: SOUND.plant,
    drops: [{ item: 'voxelia:fiber_thread', min: 1, max: 1, chance: 1 }],
    tags: ['voxelia:sticky'],
  });
  reg.register({
    name: 'voxelia:bloomsponge',
    displayName: 'Bloomsponge',
    textures: 'bloomsponge',
    hardness: 0.6,
    resistance: 0.6,
    preferredTool: 'hoe',
    sounds: SOUND.grass,
    tags: ['voxelia:hoe_mineable'],
  });
  reg.register({
    name: 'voxelia:scaffold',
    displayName: 'Scaffold',
    textures: 'scaffold',
    renderType: 'cutout',
    opaque: false,
    shape: 'fence',
    hardness: 0,
    resistance: 0,
    preferredTool: 'axe',
    flammable: true,
    sounds: SOUND.wood,
    tags: ['voxelia:climbable', 'voxelia:axe_mineable'],
  });
}
