import { AIR, MAX_BLOCK_ID } from '../core/constants';
import { createLogger } from '../core/Logger';
import type { BlockId } from '../core/types';
import type {
  BlockDefinition,
  BlockDefinitionInput,
  BlockFaceKey,
  BlockRenderType,
  IBlockRegistry,
} from './types';

const logb = createLogger('blocks');

const DEFAULT_SOUNDS = { break: 'block.generic.break', place: 'block.generic.place', step: 'block.generic.step', hit: 'block.generic.hit' };

function normalizeTextures(
  textures: string | Partial<Record<BlockFaceKey, string>> | undefined,
  name: string,
): Partial<Record<BlockFaceKey, string>> {
  if (!textures) return { all: name };
  if (typeof textures === 'string') return { all: textures };
  return textures;
}

export class BlockRegistry implements IBlockRegistry {
  private readonly defs: BlockDefinition[] = [];
  private readonly byId = new Map<BlockId, BlockDefinition>();
  private readonly byNameMap = new Map<string, BlockDefinition>();
  private nextId = 1;
  private frozen = false;

  // Flat hot-path lookup tables, sized lazily on finalize().
  private opaqueTable = new Uint8Array(0);
  private solidTable = new Uint8Array(0);
  private lightEmitTable = new Uint8Array(0);
  private lightAbsorbTable = new Uint8Array(0);
  private renderTypeTable: BlockRenderType[] = [];

  constructor() {
    // Air is always id 0.
    this.register({
      name: 'voxelia:air',
      displayName: 'Air',
      numericId: AIR,
      renderType: 'invisible',
      opaque: false,
      solid: false,
      lightAbsorption: 0,
      hardness: Infinity,
      replaceable: true,
      textures: { all: 'air' },
    });
  }

  register(input: BlockDefinitionInput): BlockDefinition {
    if (this.frozen) throw new Error(`BlockRegistry is finalized; cannot register ${input.name}`);
    if (this.byNameMap.has(input.name)) {
      throw new Error(`Block "${input.name}" already registered`);
    }
    let id = input.numericId;
    if (id === undefined) {
      id = this.nextId++;
    } else {
      this.nextId = Math.max(this.nextId, id + 1);
    }
    if (id < 0 || id > MAX_BLOCK_ID) throw new Error(`Block id ${id} out of range`);

    const renderType: BlockRenderType = input.renderType ?? 'opaque';
    const opaque = input.opaque ?? renderType === 'opaque';
    const def: BlockDefinition = {
      numericId: id,
      name: input.name,
      displayName: input.displayName ?? titleCase(input.name),
      textures: normalizeTextures(input.textures, input.name.split(':').pop() ?? input.name),
      renderType,
      tintIndex: input.tintIndex ?? null,
      opaque,
      solid: input.solid ?? (renderType !== 'invisible' && renderType !== 'cross'),
      fluidBlocking: input.fluidBlocking ?? opaque,
      lightEmission: clampByte(input.lightEmission ?? 0, 15),
      lightAbsorption: clampByte(input.lightAbsorption ?? (opaque ? 15 : 0), 15),
      hardness: input.hardness ?? 1,
      resistance: input.resistance ?? input.hardness ?? 1,
      preferredTool: input.preferredTool ?? 'none',
      minToolTier: input.minToolTier ?? 'none',
      requiresCorrectTool: input.requiresCorrectTool ?? false,
      drops: input.drops ?? [{ item: input.name, min: 1, max: 1, chance: 1 }],
      sounds: { ...DEFAULT_SOUNDS, ...input.sounds },
      flammable: input.flammable ?? false,
      replaceable: input.replaceable ?? false,
      tags: input.tags ?? [],
    };

    this.defs.push(def);
    this.byId.set(id, def);
    this.byNameMap.set(def.name, def);
    return def;
  }

  get(id: BlockId): BlockDefinition {
    return this.byId.get(id) ?? this.byId.get(AIR)!;
  }

  byName(name: string): BlockDefinition | undefined {
    return this.byNameMap.get(name);
  }

  get all(): readonly BlockDefinition[] {
    return this.defs;
  }

  get size(): number {
    return this.defs.length;
  }

  isOpaque(id: BlockId): boolean {
    return (this.opaqueTable[id] ?? (this.get(id).opaque ? 1 : 0)) === 1;
  }

  isSolid(id: BlockId): boolean {
    return (this.solidTable[id] ?? (this.get(id).solid ? 1 : 0)) === 1;
  }

  renderType(id: BlockId): BlockRenderType {
    return this.renderTypeTable[id] ?? this.get(id).renderType;
  }

  lightEmission(id: BlockId): number {
    return this.lightEmitTable[id] ?? this.get(id).lightEmission;
  }

  lightAbsorption(id: BlockId): number {
    return this.lightAbsorbTable[id] ?? this.get(id).lightAbsorption;
  }

  finalize(): void {
    if (this.frozen) return;
    const max = this.nextId;
    this.opaqueTable = new Uint8Array(max);
    this.solidTable = new Uint8Array(max);
    this.lightEmitTable = new Uint8Array(max);
    this.lightAbsorbTable = new Uint8Array(max);
    this.renderTypeTable = new Array(max).fill('opaque');
    for (const def of this.defs) {
      this.opaqueTable[def.numericId] = def.opaque ? 1 : 0;
      this.solidTable[def.numericId] = def.solid ? 1 : 0;
      this.lightEmitTable[def.numericId] = def.lightEmission;
      this.lightAbsorbTable[def.numericId] = def.lightAbsorption;
      this.renderTypeTable[def.numericId] = def.renderType;
    }
    this.frozen = true;
    logb.info(`finalized with ${this.defs.length} blocks`);
  }
}

function clampByte(v: number, max: number): number {
  return v < 0 ? 0 : v > max ? max : Math.floor(v);
}

function titleCase(name: string): string {
  return (name.split(':').pop() ?? name)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
