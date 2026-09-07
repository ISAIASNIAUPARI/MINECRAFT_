import { describe, expect, it } from 'vitest';
import { createGameContent } from '../src/content';
import { PlayerInventory } from '../src/inventory/PlayerInventory';

describe('content pack', () => {
  const content = createGameContent();

  it('registers air as block 0', () => {
    expect(content.blocks.byName('voxelia:air')?.numericId).toBe(0);
  });

  it('gives every non-air block a placeable item', () => {
    for (const block of content.blocks.all) {
      if (block.name === 'voxelia:air') continue;
      const item = content.items.byName(block.name);
      expect(item, block.name).toBeDefined();
      expect(item?.placesBlock).toBe(block.numericId);
    }
  });

  it('resolves the planks-from-log shapeless recipe', () => {
    const log = content.items.byName('voxelia:oak_log')!;
    const grid = [{ item: log.numericId, count: 1 }, null, null, null];
    const match = content.crafting.match('inventory', grid, 2, 2);
    expect(match).not.toBeNull();
    expect(content.items.get(match!.result.item).name).toBe('voxelia:oak_planks');
    expect(match!.result.count).toBe(4);
  });

  it('resolves the shaped pickaxe recipe on a 3x3 table', () => {
    const planks = content.items.byName('voxelia:oak_planks')!.numericId;
    const stick = content.items.byName('voxelia:stick')!.numericId;
    const P = { item: planks, count: 1 };
    const S = { item: stick, count: 1 };
    const grid = [P, P, P, null, S, null, null, S, null];
    const match = content.crafting.match('crafting_table', grid, 3, 3);
    expect(match).not.toBeNull();
    expect(content.items.get(match!.result.item).name).toBe('voxelia:wood_pickaxe');
  });
});

describe('player inventory', () => {
  const content = createGameContent();

  it('merges stacks on add and reports leftovers', () => {
    const inv = new PlayerInventory(content.items, content.stackOps);
    const stone = content.items.byName('voxelia:stone')!.numericId;
    expect(inv.add({ item: stone, count: 40 })).toBeNull();
    expect(inv.add({ item: stone, count: 40 })).toBeNull();
    expect(inv.count('voxelia:stone')).toBe(80);
  });

  it('removes across slots', () => {
    const inv = new PlayerInventory(content.items, content.stackOps);
    const dirt = content.items.byName('voxelia:dirt')!.numericId;
    inv.add({ item: dirt, count: 100 });
    expect(inv.remove('voxelia:dirt', 70)).toBe(70);
    expect(inv.count('voxelia:dirt')).toBe(30);
  });
});
