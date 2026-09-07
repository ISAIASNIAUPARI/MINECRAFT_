import type { IItemRegistry, ItemStack } from '../items/types';
import type { createItemStackOps } from '../items/ItemStack';
import type { IInventory, InventoryChange } from './types';

type Ops = ReturnType<typeof createItemStackOps>;

/** A fixed-size array of slots with merge-aware add/remove. */
export class Inventory implements IInventory {
  protected slots: (ItemStack | null)[];
  private listeners = new Set<(c: InventoryChange) => void>();

  constructor(
    readonly size: number,
    protected readonly items: IItemRegistry,
    protected readonly ops: Ops,
  ) {
    this.slots = new Array(size).fill(null);
  }

  get(slot: number): ItemStack | null {
    return this.slots[slot] ?? null;
  }

  set(slot: number, stack: ItemStack | null): ItemStack | null {
    const previous = this.slots[slot] ?? null;
    this.slots[slot] = stack && stack.count > 0 ? stack : null;
    this.emit({ slot, previous, current: this.slots[slot] });
    return previous;
  }

  add(stack: ItemStack): ItemStack | null {
    if (this.ops.isEmpty(stack)) return null;
    let remaining: ItemStack | null = this.ops.clone(stack);
    const max = this.items.get(stack.item).maxStackSize;

    // Pass 1: merge into existing compatible stacks.
    for (let i = 0; i < this.size && remaining; i++) {
      const cur = this.slots[i];
      if (!cur || !this.ops.canMerge(cur, remaining)) continue;
      const { merged, leftover } = this.ops.merge(cur, remaining, max);
      this.slots[i] = merged;
      this.emit({ slot: i, previous: cur, current: merged });
      remaining = leftover;
    }
    // Pass 2: drop into empty slots.
    for (let i = 0; i < this.size && remaining; i++) {
      if (this.slots[i]) continue;
      const put: ItemStack = { ...remaining, count: Math.min(remaining.count, max) };
      this.slots[i] = put;
      this.emit({ slot: i, previous: null, current: put });
      remaining = remaining.count - put.count > 0 ? { ...remaining, count: remaining.count - put.count } : null;
    }
    return remaining;
  }

  remove(itemName: string, count: number): number {
    const def = this.items.byName(itemName);
    if (!def) return 0;
    let left = count;
    for (let i = 0; i < this.size && left > 0; i++) {
      const cur = this.slots[i];
      if (!cur || cur.item !== def.numericId) continue;
      const take = Math.min(cur.count, left);
      left -= take;
      const next = cur.count - take > 0 ? { ...cur, count: cur.count - take } : null;
      this.slots[i] = next;
      this.emit({ slot: i, previous: cur, current: next });
    }
    return count - left;
  }

  count(itemName: string): number {
    const def = this.items.byName(itemName);
    if (!def) return 0;
    let total = 0;
    for (const s of this.slots) if (s && s.item === def.numericId) total += s.count;
    return total;
  }

  has(itemName: string, count = 1): boolean {
    return this.count(itemName) >= count;
  }

  firstEmpty(): number {
    return this.slots.findIndex((s) => s === null);
  }

  isEmpty(): boolean {
    return this.slots.every((s) => s === null);
  }

  clear(): void {
    for (let i = 0; i < this.size; i++) {
      if (this.slots[i]) {
        const prev = this.slots[i];
        this.slots[i] = null;
        this.emit({ slot: i, previous: prev, current: null });
      }
    }
  }

  onChange(listener: (change: InventoryChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  serialize(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? this.ops.clone(s) : null));
  }

  restore(slots: (ItemStack | null)[]): void {
    this.slots = new Array(this.size).fill(null);
    for (let i = 0; i < Math.min(this.size, slots.length); i++) {
      this.slots[i] = slots[i] ? this.ops.clone(slots[i]!) : null;
    }
    for (let i = 0; i < this.size; i++) this.emit({ slot: i, previous: null, current: this.slots[i] });
  }

  protected emit(change: InventoryChange): void {
    for (const l of this.listeners) l(change);
  }
}
