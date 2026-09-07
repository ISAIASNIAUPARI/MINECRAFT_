import type { BlockId, ItemId } from '../core/types';
import type { ToolCategory, ToolTier } from '../blocks/types';

/**
 * CONTRACT — consumed by inventory, crafting, player (usage), UI (icons/tooltips).
 */

export type ItemCategory =
  | 'block'
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'food'
  | 'material'
  | 'misc';

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';

export interface ToolProperties {
  category: ToolCategory;
  tier: ToolTier;
  /** Multiplier applied to break speed for the tool's preferred blocks. */
  miningSpeed: number;
  /** Melee damage in half-hearts. */
  attackDamage: number;
}

export interface FoodProperties {
  /** Hunger points restored (half-drumsticks). */
  nutrition: number;
  /** Saturation modifier. */
  saturation: number;
  /** Can be eaten even at full hunger. */
  alwaysEdible: boolean;
}

export interface ArmorProperties {
  slot: ArmorSlot;
  /** Armor points (half-shields). */
  defense: number;
  toughness: number;
}

export interface ItemDefinition {
  readonly numericId: ItemId;
  readonly name: string; // e.g. `voxelia:stone_pickaxe`
  readonly displayName: string;
  readonly category: ItemCategory;
  /** Texture key resolved against the item atlas. */
  readonly texture: string;
  readonly maxStackSize: number;
  /** Total durability, or 0 for items that don't take damage. */
  readonly durability: number;

  /** Set for `category: 'block'` — the block this item places. */
  readonly placesBlock: BlockId | null;
  readonly tool: ToolProperties | null;
  readonly food: FoodProperties | null;
  readonly armor: ArmorProperties | null;
  readonly tags: readonly string[];
}

export interface ItemDefinitionInput {
  name: string;
  displayName?: string;
  category?: ItemCategory;
  texture?: string;
  maxStackSize?: number;
  durability?: number;
  placesBlock?: BlockId | null;
  tool?: ToolProperties | null;
  food?: FoodProperties | null;
  armor?: ArmorProperties | null;
  tags?: readonly string[];
  numericId?: ItemId;
}

/** A quantity of an item, optionally damaged. The unit of currency for inventories and recipes. */
export interface ItemStack {
  item: ItemId;
  count: number;
  /** Damage taken, 0..durability. Absent for non-damageable items. */
  damage?: number;
  /** Free-form NBT-ish metadata for later phases (enchantments, custom name). */
  meta?: Record<string, unknown>;
}

export interface IItemRegistry {
  register(def: ItemDefinitionInput): ItemDefinition;
  get(id: ItemId): ItemDefinition;
  byName(name: string): ItemDefinition | undefined;
  readonly all: readonly ItemDefinition[];
  readonly size: number;
  finalize(): void;
}

/** Helpers implemented in `items/ItemStack.ts` — listed here so other modules can rely on them. */
export interface ItemStackOps {
  create(name: string | ItemId, count?: number): ItemStack;
  isEmpty(stack: ItemStack | null | undefined): boolean;
  canMerge(a: ItemStack, b: ItemStack): boolean;
  /** Returns leftover that didn't fit. */
  merge(target: ItemStack, source: ItemStack, maxStackSize: number): { merged: ItemStack; leftover: ItemStack | null };
  equal(a: ItemStack | null, b: ItemStack | null): boolean;
  clone(stack: ItemStack): ItemStack;
}
