import { createLogger } from '../core/Logger';
import type { BiomeDefinition, BiomeId, IBiomeRegistry } from './types';

const logbi = createLogger('world:biomes');

export class BiomeRegistry implements IBiomeRegistry {
  private readonly defs: BiomeDefinition[] = [];
  private readonly byId = new Map<BiomeId, BiomeDefinition>();
  private readonly byNameMap = new Map<string, BiomeDefinition>();
  private nextId = 0;
  private frozen = false;

  register(def: Omit<BiomeDefinition, 'id'> & { id?: BiomeId }): BiomeDefinition {
    if (this.frozen) throw new Error(`BiomeRegistry finalized; cannot register ${def.name}`);
    const id = def.id ?? this.nextId++;
    this.nextId = Math.max(this.nextId, id + 1);
    const full: BiomeDefinition = { ...def, id };
    this.defs.push(full);
    this.byId.set(id, full);
    this.byNameMap.set(full.name, full);
    return full;
  }

  get(id: BiomeId): BiomeDefinition {
    return this.byId.get(id) ?? this.defs[0];
  }

  byName(name: string): BiomeDefinition | undefined {
    return this.byNameMap.get(name);
  }

  get all(): readonly BiomeDefinition[] {
    return this.defs;
  }

  /**
   * SKELETON selection: nearest-neighbour in (temperature, humidity) space.
   * Phase 1 (Agent: worldgen) implements a proper Whittaker-style / multi-noise
   * biome picker with `weirdness` and transitions.
   */
  select(temperature: number, humidity: number, _weirdness: number): BiomeDefinition {
    let best = this.defs[0];
    let bestDist = Infinity;
    for (const b of this.defs) {
      const dt = b.temperature - temperature;
      const dh = b.humidity - humidity;
      const d = dt * dt + dh * dh;
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  finalize(): void {
    this.frozen = true;
    logbi.info(`finalized with ${this.defs.length} biomes`);
  }
}
