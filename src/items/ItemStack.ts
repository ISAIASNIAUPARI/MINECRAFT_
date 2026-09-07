import type { ItemId } from '../core/types';
import type { IItemRegistry, ItemStack } from './types';

/** Stateless helpers for {@link ItemStack}. Bind to a registry via {@link createItemStackOps}. */
export function createItemStackOps(registry: IItemRegistry) {
  function resolve(name: string | ItemId): ItemId {
    if (typeof name === 'number') return name;
    const def = registry.byName(name);
    if (!def) throw new Error(`Unknown item "${name}"`);
    return def.numericId;
  }

  const ops = {
    create(name: string | ItemId, count = 1): ItemStack {
      return { item: resolve(name), count };
    },
    isEmpty(stack: ItemStack | null | undefined): boolean {
      return !stack || stack.count <= 0;
    },
    maxStack(stack: ItemStack): number {
      return registry.get(stack.item).maxStackSize;
    },
    canMerge(a: ItemStack, b: ItemStack): boolean {
      return a.item === b.item && (a.damage ?? 0) === (b.damage ?? 0) && sameMeta(a.meta, b.meta);
    },
    merge(target: ItemStack, source: ItemStack, maxStackSize: number) {
      if (!ops.canMerge(target, source)) return { merged: target, leftover: source };
      const space = maxStackSize - target.count;
      const moved = Math.min(space, source.count);
      const merged: ItemStack = { ...target, count: target.count + moved };
      const leftover = source.count - moved > 0 ? { ...source, count: source.count - moved } : null;
      return { merged, leftover };
    },
    equal(a: ItemStack | null, b: ItemStack | null): boolean {
      if (a === b) return true;
      if (!a || !b) return false;
      return a.item === b.item && a.count === b.count && (a.damage ?? 0) === (b.damage ?? 0);
    },
    clone(stack: ItemStack): ItemStack {
      return { ...stack, ...(stack.meta ? { meta: { ...stack.meta } } : {}) };
    },
  };
  return ops;
}

export type ItemStackOps = ReturnType<typeof createItemStackOps>;

function sameMeta(a?: Record<string, unknown>, b?: Record<string, unknown>): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}
