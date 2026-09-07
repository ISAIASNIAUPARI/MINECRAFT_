import { createLogger } from '../core/Logger';
import type { ItemId } from '../core/types';
import type { ItemDefinition, ItemDefinitionInput, IItemRegistry } from './types';

const logi = createLogger('items');

export class ItemRegistry implements IItemRegistry {
  private readonly defs: ItemDefinition[] = [];
  private readonly byId = new Map<ItemId, ItemDefinition>();
  private readonly byNameMap = new Map<string, ItemDefinition>();
  private nextId = 1;
  private frozen = false;

  register(input: ItemDefinitionInput): ItemDefinition {
    if (this.frozen) throw new Error(`ItemRegistry finalized; cannot register ${input.name}`);
    if (this.byNameMap.has(input.name)) throw new Error(`Item "${input.name}" already registered`);

    const id = input.numericId ?? this.nextId++;
    this.nextId = Math.max(this.nextId, id + 1);

    const def: ItemDefinition = {
      numericId: id,
      name: input.name,
      displayName: input.displayName ?? titleCase(input.name),
      category: input.category ?? 'misc',
      texture: input.texture ?? (input.name.split(':').pop() ?? input.name),
      maxStackSize: input.maxStackSize ?? 64,
      durability: input.durability ?? 0,
      placesBlock: input.placesBlock ?? null,
      tool: input.tool ?? null,
      food: input.food ?? null,
      armor: input.armor ?? null,
      tags: input.tags ?? [],
    };
    this.defs.push(def);
    this.byId.set(id, def);
    this.byNameMap.set(def.name, def);
    return def;
  }

  get(id: ItemId): ItemDefinition {
    const def = this.byId.get(id);
    if (!def) throw new Error(`Unknown item id ${id}`);
    return def;
  }

  byName(name: string): ItemDefinition | undefined {
    return this.byNameMap.get(name);
  }

  get all(): readonly ItemDefinition[] {
    return this.defs;
  }

  get size(): number {
    return this.defs.length;
  }

  finalize(): void {
    this.frozen = true;
    logi.info(`finalized with ${this.defs.length} items`);
  }
}

function titleCase(name: string): string {
  return (name.split(':').pop() ?? name)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
