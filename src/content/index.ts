import { BlockRegistry, registerCoreBlocks, type IBlockRegistry } from '../blocks';
import {
  ItemRegistry,
  createItemStackOps,
  registerCoreItems,
  type IItemRegistry,
  type ItemStackOps,
} from '../items';
import {
  CraftingResolver,
  RecipeRegistry,
  CORE_RECIPES,
  type ICraftingResolver,
  type IRecipeRegistry,
} from '../crafting';
import { BiomeRegistry, registerCoreBiomes, type IBiomeRegistry } from '../world';

/**
 * The assembled Phase 1 content pack. Phase 4 lets mods contribute to each
 * registry before {@link finalize} is called.
 */
export interface GameContent {
  blocks: IBlockRegistry;
  items: IItemRegistry;
  recipes: IRecipeRegistry;
  biomes: IBiomeRegistry;
  stackOps: ItemStackOps;
  crafting: ICraftingResolver;
}

/**
 * Extra tag memberships that are not already carried by an item definition.
 * Block items inherit their block's tags, so this stays empty in the core pack;
 * Phase 4 mods use it to add their items to existing tags.
 */
const TAG_MEMBERS: Record<string, string[]> = {};

export function createGameContent(): GameContent {
  const blocks = new BlockRegistry();
  const items = new ItemRegistry();
  const recipes = new RecipeRegistry();
  const biomes = new BiomeRegistry();

  registerCoreBlocks(blocks);
  blocks.finalize();

  const stackOps = createItemStackOps(items);
  registerCoreItems(items, blocks);
  items.finalize();

  registerCoreBiomes(biomes);
  biomes.finalize();

  recipes.registerAll(CORE_RECIPES);
  recipes.finalize();

  const crafting = new CraftingResolver(
    recipes,
    items,
    stackOps,
    (tag) => TAG_MEMBERS[tag] ?? [],
  );

  return { blocks, items, recipes, biomes, stackOps, crafting };
}
