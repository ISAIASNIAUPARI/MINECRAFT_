import { clamp } from '../core/math';
import type { IItemRegistry, ItemStack } from '../items/types';
import type { createItemStackOps } from '../items/ItemStack';
import { Inventory } from './Inventory';
import type { IPlayerInventory } from './types';

type Ops = ReturnType<typeof createItemStackOps>;

/**
 * Layout (41 slots):
 *   0..8    hotbar
 *   9..35   main
 *   36..39  armor (feet, legs, chest, head)
 *   40      offhand
 */
export class PlayerInventory extends Inventory implements IPlayerInventory {
  readonly HOTBAR_SIZE = 9 as const;
  readonly MAIN_SIZE = 27 as const;
  private _selectedSlot = 0;

  static readonly ARMOR_START = 36;
  static readonly OFFHAND = 40;

  constructor(items: IItemRegistry, ops: Ops) {
    super(41, items, ops);
  }

  get selectedSlot(): number {
    return this._selectedSlot;
  }

  set selectedSlot(value: number) {
    this._selectedSlot = clamp(Math.round(value), 0, 8);
  }

  selectedStack(): ItemStack | null {
    return this.get(this._selectedSlot);
  }

  hotbar(slot: number): ItemStack | null {
    return this.get(clamp(slot, 0, 8));
  }

  armor(slot: number): ItemStack | null {
    return this.get(PlayerInventory.ARMOR_START + clamp(slot, 0, 3));
  }

  offhand(): ItemStack | null {
    return this.get(PlayerInventory.OFFHAND);
  }

  /** Scroll the hotbar selection by wheel ticks (positive = right). */
  scrollHotbar(direction: number): void {
    this.selectedSlot = ((this._selectedSlot - direction) % 9 + 9) % 9;
  }
}
