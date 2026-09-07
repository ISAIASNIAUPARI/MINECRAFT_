import type { ItemStack } from '../items/types';
import type { IInventory } from '../inventory/types';

/**
 * CONTRACT — data-driven crafting. Recipes are registered through this API
 * (mods will do the same in Phase 4). Consumed by UI (recipe book, grid result)
 * and player (furnace/table interaction).
 */

export type CraftingStationType =
  | 'inventory' // 2x2 built into the player inventory
  | 'crafting_table' // 3x3
  | 'furnace' // smelting
  | 'campfire'
  | string; // mods add their own

/** An ingredient: an exact item name, a tag (`#voxelia:planks`), or a list (any of). */
export type Ingredient = string | { tag: string } | { anyOf: string[] };

export interface ShapedRecipe {
  type: 'shaped';
  id: string;
  station: CraftingStationType;
  /** Rows of the pattern; ` ` = empty. Width/height inferred. */
  pattern: string[];
  /** Map from pattern char to ingredient. */
  key: Record<string, Ingredient>;
  result: { item: string; count: number };
}

export interface ShapelessRecipe {
  type: 'shapeless';
  id: string;
  station: CraftingStationType;
  ingredients: Ingredient[];
  result: { item: string; count: number };
}

export interface SmeltingRecipe {
  type: 'smelting';
  id: string;
  station: CraftingStationType;
  input: Ingredient;
  result: { item: string; count: number };
  /** Ticks to complete. */
  time: number;
  experience: number;
}

export type Recipe = ShapedRecipe | ShapelessRecipe | SmeltingRecipe;

export interface CraftMatch {
  recipe: Recipe;
  result: ItemStack;
  /** For each input slot index, how many items to consume. */
  consumption: number[];
}

export interface IRecipeRegistry {
  register(recipe: Recipe): void;
  registerAll(recipes: readonly Recipe[]): void;
  get(id: string): Recipe | undefined;
  readonly all: readonly Recipe[];
  byStation(station: CraftingStationType): readonly Recipe[];
  finalize(): void;
}

/**
 * Resolves a grid of input stacks to a result. `grid` is row-major, `width` wide.
 * Empty slots are `null`.
 */
export interface ICraftingResolver {
  match(
    station: CraftingStationType,
    grid: (ItemStack | null)[],
    width: number,
    height: number,
  ): CraftMatch | null;
  /** Apply a match: consume inputs from `gridInventory`, return the crafted stack. */
  craft(match: CraftMatch, gridInventory: IInventory): ItemStack;
}
