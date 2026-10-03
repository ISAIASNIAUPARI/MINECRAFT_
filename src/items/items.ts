import type { IBlockRegistry } from '../blocks/types';
import type { IItemRegistry } from './types';
import type { ToolTier } from '../blocks/types';

/**
 * SKELETON content. Phase 1 (Agent: content) fills in the full tool/armor tiers,
 * food, and materials, plus correct textures and stats.
 */
export function registerCoreItems(items: IItemRegistry, blocks: IBlockRegistry): void {
  // Auto block-items for every placeable block.
  for (const block of blocks.all) {
    if (block.name === 'voxelia:air') continue;
    if (items.byName(block.name)) continue;
    items.register({
      name: block.name,
      displayName: block.displayName,
      category: 'block',
      texture: `block/${block.name.split(':').pop()}`,
      placesBlock: block.numericId,
      maxStackSize: 64,
      // Block items inherit the block's tags so tag-driven recipes
      // (`voxelia:planks`, `voxelia:logs`, ...) match any species.
      tags: block.tags,
    });
  }

  // Raw materials.
  for (const mat of ['coal', 'raw_iron', 'iron_ingot', 'stick', 'flint']) {
    items.register({ name: `voxelia:${mat}`, category: 'material', texture: `item/${mat}` });
  }

  // Starter tools: wood + stone tiers.
  const toolTiers: { tier: ToolTier; speed: number; dmg: number; dura: number }[] = [
    { tier: 'wood', speed: 2, dmg: 1, dura: 59 },
    { tier: 'stone', speed: 4, dmg: 2, dura: 131 },
  ];
  for (const t of toolTiers) {
    items.register({ name: `voxelia:${t.tier}_pickaxe`, category: 'tool', durability: t.dura, texture: `item/${t.tier}_pickaxe`, tool: { category: 'pickaxe', tier: t.tier, miningSpeed: t.speed, attackDamage: t.dmg } });
    items.register({ name: `voxelia:${t.tier}_axe`, category: 'tool', durability: t.dura, texture: `item/${t.tier}_axe`, tool: { category: 'axe', tier: t.tier, miningSpeed: t.speed, attackDamage: t.dmg + 2 } });
    items.register({ name: `voxelia:${t.tier}_shovel`, category: 'tool', durability: t.dura, texture: `item/${t.tier}_shovel`, tool: { category: 'shovel', tier: t.tier, miningSpeed: t.speed, attackDamage: t.dmg } });
    items.register({ name: `voxelia:${t.tier}_sword`, category: 'weapon', durability: t.dura, texture: `item/${t.tier}_sword`, tool: { category: 'sword', tier: t.tier, miningSpeed: 1, attackDamage: t.dmg + 3 } });
  }

  // A starter food.
  items.register({ name: 'voxelia:bread', category: 'food', texture: 'item/bread', maxStackSize: 16, food: { nutrition: 5, saturation: 6, alwaysEdible: false } });
}
