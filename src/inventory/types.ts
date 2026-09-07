import type { ItemStack } from '../items/types';

/**
 * CONTRACT — item containers. Consumed by player (hotbar, pick-up), crafting
 * (grid + result), UI (all container screens), storage (save/load).
 */

export type SlotFilter = (stack: ItemStack) => boolean;

export interface InventoryChange {
  slot: number;
  previous: ItemStack | null;
  current: ItemStack | null;
}

export interface IInventory {
  readonly size: number;
  get(slot: number): ItemStack | null;
  /** Replace a slot outright. Returns the previous contents. */
  set(slot: number, stack: ItemStack | null): ItemStack | null;

  /** Add anywhere it fits (merges into existing stacks first). Returns leftover that didn't fit. */
  add(stack: ItemStack): ItemStack | null;
  /** Remove up to `count` of an item by id. Returns how many were actually removed. */
  remove(itemName: string, count: number): number;
  /** Total count of an item across all slots. */
  count(itemName: string): number;
  has(itemName: string, count?: number): boolean;
  firstEmpty(): number;
  isEmpty(): boolean;
  clear(): void;

  /** Fired after any mutation. */
  onChange(listener: (change: InventoryChange) => void): () => void;

  serialize(): (ItemStack | null)[];
  restore(slots: (ItemStack | null)[]): void;
}

/** The player's full inventory: 9 hotbar + 27 main + 4 armor + 1 offhand. */
export interface IPlayerInventory extends IInventory {
  readonly HOTBAR_SIZE: 9;
  readonly MAIN_SIZE: 27;
  selectedSlot: number;
  selectedStack(): ItemStack | null;
  hotbar(slot: number): ItemStack | null;
  armor(slot: number): ItemStack | null;
  offhand(): ItemStack | null;
}

/** Drag-and-drop interaction model used by the UI layer against any open container. */
export interface ContainerInteraction {
  /** Pick up / put down the whole stack under the cursor. */
  leftClick(slot: number): void;
  /** Pick up half / place one. */
  rightClick(slot: number): void;
  /** Move stack between the container and the player inventory. */
  shiftClick(slot: number): void;
  /** The stack currently "held" by the cursor, or null. */
  readonly held: ItemStack | null;
}
