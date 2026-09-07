import { createLogger } from '../core/Logger';
import type { CraftingStationType, IRecipeRegistry, Recipe } from './types';

const logr = createLogger('crafting');

export class RecipeRegistry implements IRecipeRegistry {
  private readonly map = new Map<string, Recipe>();
  private readonly byStationMap = new Map<CraftingStationType, Recipe[]>();
  private frozen = false;

  register(recipe: Recipe): void {
    if (this.frozen) throw new Error(`RecipeRegistry finalized; cannot register ${recipe.id}`);
    if (this.map.has(recipe.id)) throw new Error(`Recipe "${recipe.id}" already registered`);
    this.map.set(recipe.id, recipe);
    const list = this.byStationMap.get(recipe.station) ?? [];
    list.push(recipe);
    this.byStationMap.set(recipe.station, list);
  }

  registerAll(recipes: readonly Recipe[]): void {
    for (const r of recipes) this.register(r);
  }

  get(id: string): Recipe | undefined {
    return this.map.get(id);
  }

  get all(): readonly Recipe[] {
    return [...this.map.values()];
  }

  byStation(station: CraftingStationType): readonly Recipe[] {
    return this.byStationMap.get(station) ?? [];
  }

  finalize(): void {
    this.frozen = true;
    logr.info(`finalized with ${this.map.size} recipes`);
  }
}
