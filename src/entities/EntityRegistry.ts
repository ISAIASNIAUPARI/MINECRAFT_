import { createLogger } from '../core/Logger';
import type { CreatureDefinition, IEntityRegistry } from './types';

const log = createLogger('entities');

/**
 * Data-driven creature table. Mirrors {@link BlockRegistry}: register during
 * content assembly, {@link finalize} freezes it, mods extend it in Phase 4.
 */
export class EntityRegistry implements IEntityRegistry {
  private readonly byName = new Map<string, CreatureDefinition>();
  private readonly list: CreatureDefinition[] = [];
  private frozen = false;

  register(def: CreatureDefinition): void {
    if (this.frozen) throw new Error(`entity registry is finalized; cannot add ${def.name}`);
    if (this.byName.has(def.name)) throw new Error(`duplicate creature ${def.name}`);
    if (def.width <= 0 || def.height <= 0) {
      throw new Error(`creature ${def.name} needs a positive width and height`);
    }
    if (def.maxHealth <= 0) throw new Error(`creature ${def.name} needs positive maxHealth`);
    this.byName.set(def.name, def);
    this.list.push(def);
  }

  get(name: string): CreatureDefinition | undefined {
    return this.byName.get(name);
  }

  get all(): readonly CreatureDefinition[] {
    return this.list;
  }

  finalize(): void {
    this.frozen = true;
    log.info(`finalized with ${this.list.length} creatures`);
  }
}
