import type { Recipe } from './types';

/**
 * SKELETON recipe set. Phase 1 (Agent: content) adds the full tool/armor tiers,
 * furnace smelting recipes, and the recipe book data.
 */
export const CORE_RECIPES: Recipe[] = [
  {
    type: 'shapeless',
    id: 'voxelia:planks_from_log',
    station: 'inventory',
    ingredients: ['voxelia:oak_log'],
    result: { item: 'voxelia:oak_planks', count: 4 },
  },
  {
    type: 'shapeless',
    id: 'voxelia:sticks',
    station: 'inventory',
    ingredients: ['voxelia:oak_planks', 'voxelia:oak_planks'],
    result: { item: 'voxelia:stick', count: 4 },
  },
  {
    type: 'shaped',
    id: 'voxelia:crafting_table',
    station: 'inventory',
    pattern: ['##', '##'],
    key: { '#': 'voxelia:oak_planks' },
    result: { item: 'voxelia:crafting_table', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_pickaxe',
    station: 'crafting_table',
    pattern: ['###', ' | ', ' | '],
    key: { '#': 'voxelia:oak_planks', '|': 'voxelia:stick' },
    result: { item: 'voxelia:wood_pickaxe', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_axe',
    station: 'crafting_table',
    pattern: ['##', '#|', ' |'],
    key: { '#': 'voxelia:oak_planks', '|': 'voxelia:stick' },
    result: { item: 'voxelia:wood_axe', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_shovel',
    station: 'crafting_table',
    pattern: ['#', '|', '|'],
    key: { '#': 'voxelia:oak_planks', '|': 'voxelia:stick' },
    result: { item: 'voxelia:wood_shovel', count: 1 },
  },
  {
    type: 'shaped',
    id: 'voxelia:wood_sword',
    station: 'crafting_table',
    pattern: ['#', '#', '|'],
    key: { '#': 'voxelia:oak_planks', '|': 'voxelia:stick' },
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
    key: { c: 'voxelia:coal', '|': 'voxelia:stick' },
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
