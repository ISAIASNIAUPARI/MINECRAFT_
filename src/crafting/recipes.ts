import type { Recipe } from './types';

/**
 * Core recipe set. Wood-bearing recipes are tag-driven (`voxelia:planks`) so
 * every timber species works in them; only the log -> planks conversion is
 * per-species, because its result has to name a concrete plank.
 */

/** Timber species that ship in the core content pack. */
export const CORE_WOODS = ['amberwood', 'pinewood', 'silverbark'] as const;

const PLANKS = { tag: 'voxelia:planks' } as const;
const STICK = 'voxelia:stick';

/** One shapeless `log -> 4 planks` recipe per species. */
const PLANK_RECIPES: Recipe[] = CORE_WOODS.map((wood) => ({
  type: 'shapeless',
  id: `voxelia:${wood}_planks_from_log`,
  station: 'inventory',
  ingredients: [{ tag: `voxelia:${wood}_logs` }],
  result: { item: `voxelia:${wood}_planks`, count: 4 },
}));

export const CORE_RECIPES: Recipe[] = [
  ...PLANK_RECIPES,
  {
    type: 'shapeless',
    id: 'voxelia:sticks',
    station: 'inventory',
    ingredients: [PLANKS, PLANKS],
    result: { item: STICK, count: 4 },
  },
  {
    type: 'shaped',
    id: 'voxelia:crafting_table',
    station: 'inventory',
    pattern: ['##', '##'],
    key: { '#': PLANKS },
    result: { item: 'voxelia:crafting_table', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_pickaxe',
    station: 'crafting_table',
    pattern: ['###', ' | ', ' | '],
    key: { '#': PLANKS, '|': STICK },
    result: { item: 'voxelia:wood_pickaxe', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_axe',
    station: 'crafting_table',
    pattern: ['##', '#|', ' |'],
    key: { '#': PLANKS, '|': STICK },
    result: { item: 'voxelia:wood_axe', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_shovel',
    station: 'crafting_table',
    pattern: ['#', '|', '|'],
    key: { '#': PLANKS, '|': STICK },
    result: { item: 'voxelia:wood_shovel', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_sword',
    station: 'crafting_table',
    pattern: ['#', '#', '|'],
    key: { '#': PLANKS, '|': STICK },
    result: { item: 'voxelia:wood_sword', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:furnace',
    station: 'crafting_table',
    pattern: ['###', '# #', '###'],
    key: { '#': 'voxelia:cobblestone' },
    result: { item: 'voxelia:furnace', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:torch',
    station: 'inventory',
    pattern: ['c', '|'],
    key: { c: 'voxelia:coal', '|': STICK },
    result: { item: 'voxelia:torch', count: 4 },
  },
  {
    type: 'smelting',
    id: 'voxelia:iron_ingot',
    station: 'furnace',
    input: 'voxelia:raw_iron',
    result: { item: 'voxelia:iron_ingot', count: 1 },
    time: 200,
    experience: 0.7,
  },
];
