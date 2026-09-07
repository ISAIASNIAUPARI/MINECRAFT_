import type { IItemRegistry, ItemStack } from '../items/types';
import type { createItemStackOps } from '../items/ItemStack';
import type { IInventory } from '../inventory/types';
import type {
  CraftingStationType,
  CraftMatch,
  ICraftingResolver,
  Ingredient,
  IRecipeRegistry,
  Recipe,
  ShapedRecipe,
  ShapelessRecipe,
} from './types';

type Ops = ReturnType<typeof createItemStackOps>;

/**
 * SKELETON — supports shaped + shapeless matching against exact item names.
 * Tags (`#voxelia:planks`) and `anyOf` are recognised but resolved by name-list
 * lookups the content module provides. Phase 1 (Agent: content) fleshes out tag
 * resolution and the recipe book.
 */
export class CraftingResolver implements ICraftingResolver {
  constructor(
    private readonly recipes: IRecipeRegistry,
    private readonly items: IItemRegistry,
    private readonly ops: Ops,
    private readonly tagMembers: (tag: string) => string[] = () => [],
  ) {}

  match(
    station: CraftingStationType,
    grid: (ItemStack | null)[],
    width: number,
    height: number,
  ): CraftMatch | null {
    const candidates = [
      ...this.recipes.byStation(station),
      ...(station !== 'inventory' ? this.recipes.byStation('inventory') : []),
    ];
    for (const recipe of candidates) {
      if (recipe.type === 'shaped') {
        const m = this.matchShaped(recipe, grid, width, height);
        if (m) return m;
      } else if (recipe.type === 'shapeless') {
        const m = this.matchShapeless(recipe, grid);
        if (m) return m;
      }
    }
    return null;
  }

  craft(match: CraftMatch, gridInventory: IInventory): ItemStack {
    for (let i = 0; i < match.consumption.length; i++) {
      const take = match.consumption[i];
      if (take <= 0) continue;
      const cur = gridInventory.get(i);
      if (!cur) continue;
      const next = cur.count - take > 0 ? { ...cur, count: cur.count - take } : null;
      gridInventory.set(i, next);
    }
    return this.ops.clone(match.result);
  }

  // --- shaped --------------------------------------------------------------

  private matchShaped(
    recipe: ShapedRecipe,
    grid: (ItemStack | null)[],
    width: number,
    height: number,
  ): CraftMatch | null {
    const pat = recipe.pattern;
    const ph = pat.length;
    const pw = Math.max(...pat.map((r) => r.length));
    if (pw > width || ph > height) return null;

    for (let offY = 0; offY <= height - ph; offY++) {
      for (let offX = 0; offX <= width - pw; offX++) {
        const consumption = new Array(grid.length).fill(0);
        if (this.tryPlaceShaped(recipe, grid, width, height, offX, offY, pw, ph, consumption)) {
          return { recipe, result: this.resultStack(recipe), consumption };
        }
      }
    }
    return null;
  }

  private tryPlaceShaped(
    recipe: ShapedRecipe,
    grid: (ItemStack | null)[],
    width: number,
    height: number,
    offX: number,
    offY: number,
    pw: number,
    ph: number,
    consumption: number[],
  ): boolean {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const inside = x >= offX && x < offX + pw && y >= offY && y < offY + ph;
        const cell = grid[idx];
        if (!inside) {
          if (cell) return false;
          continue;
        }
        const ch = recipe.pattern[y - offY]?.[x - offX] ?? ' ';
        if (ch === ' ') {
          if (cell) return false;
          continue;
        }
        const ing = recipe.key[ch];
        if (!ing || !cell || !this.matchIngredient(ing, cell)) return false;
        consumption[idx] = 1;
      }
    }
    return true;
  }

  // --- shapeless ----------------------------------------------------------

  private matchShapeless(recipe: ShapelessRecipe, grid: (ItemStack | null)[]): CraftMatch | null {
    const present: { idx: number; stack: ItemStack }[] = [];
    grid.forEach((s, idx) => {
      if (s) present.push({ idx, stack: s });
    });
    if (present.length !== recipe.ingredients.length) return null;

    const remaining = [...recipe.ingredients];
    const consumption = new Array(grid.length).fill(0);
    for (const { idx, stack } of present) {
      const matchAt = remaining.findIndex((ing) => this.matchIngredient(ing, stack));
      if (matchAt === -1) return null;
      remaining.splice(matchAt, 1);
      consumption[idx] = 1;
    }
    return { recipe, result: this.resultStack(recipe), consumption };
  }

  // --- helpers ----------------------------------------------------------

  private matchIngredient(ing: Ingredient, stack: ItemStack): boolean {
    const def = this.items.get(stack.item);
    if (typeof ing === 'string') return def.name === ing;
    if ('tag' in ing) return this.tagMembers(ing.tag).includes(def.name) || def.tags.includes(ing.tag);
    if ('anyOf' in ing) return ing.anyOf.includes(def.name);
    return false;
  }

  private resultStack(recipe: Recipe): ItemStack {
    const def = this.items.byName(recipe.result.item);
    if (!def) throw new Error(`Recipe ${recipe.id}: unknown result item ${recipe.result.item}`);
    return { item: def.numericId, count: recipe.result.count };
  }
}
