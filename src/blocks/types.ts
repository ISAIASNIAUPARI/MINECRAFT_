import type { BlockId } from '../core/types';

/**
 * CONTRACT — consumed by rendering (culling + atlas UVs), physics (collision),
 * world-gen (block placement), player (break/place rules) and UI.
 *
 * Fields may be *added* freely. Renaming or changing the meaning of an existing
 * field is a cross-module break — coordinate before doing it.
 */

export type BlockRenderType =
  | 'opaque' // full cube, occludes neighbours (stone, dirt)
  | 'cutout' // full cube, alpha-tested, does NOT occlude (leaves)
  | 'transparent' // full cube, alpha-blended, does NOT occlude (glass)
  | 'liquid' // special liquid rendering (water, lava)
  | 'cross' // 2 crossed quads (saplings, flowers, tall grass)
  | 'invisible'; // air, structural markers

/**
 * Non-full-cube shape hint for physics (collision box) and meshing (geometry).
 * ADDED in Phase 1 (content) — purely additive; consumers that don't understand
 * a shape may treat anything `solid` as a full box. The registry derives a
 * sensible default from `renderType` when `shape` is omitted.
 */
export type BlockShape =
  | 'full' // standard 1×1×1
  | 'slab_bottom' // lower half
  | 'slab_top' // upper half
  | 'stairs' // L-profile (orientation is placement state, not registry data)
  | 'fence' // central post + connecting arms, full height
  | 'fence_gate'
  | 'wall' // like fence, slightly wider
  | 'pane' // thin cross (glass pane / bars)
  | 'door'
  | 'trapdoor'
  | 'ladder' // thin panel on one face
  | 'carpet' // 1/16 tall
  | 'layer' // stackable layers (snow)
  | 'cross' // decoration, no collision
  | 'liquid'
  | 'empty'; // no collision at all

export type ToolCategory = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'shears' | 'none';
export type ToolTier = 'none' | 'wood' | 'stone' | 'copper' | 'iron' | 'gold' | 'diamond' | 'netherite';

export type BlockFaceKey = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west' | 'side' | 'all';

export interface BlockDrop {
  /** Item registry name, e.g. `voxelia:cobblestone`. */
  item: string;
  min: number;
  max: number;
  /** 0..1 probability per attempt. */
  chance: number;
}

export interface BlockSoundGroup {
  break: string;
  place: string;
  step: string;
  hit: string;
}

export interface BlockDefinition {
  readonly numericId: BlockId;
  /** Namespaced id, e.g. `voxelia:stone`. */
  readonly name: string;
  readonly displayName: string;

  /** A single key = all faces. Otherwise per-face; `side` covers N/S/E/W, `all` is the fallback. */
  readonly textures: Partial<Record<BlockFaceKey, string>>;
  readonly renderType: BlockRenderType;
  /** Tint applied to the texture (e.g. biome grass/foliage). `null` = no tint. */
  readonly tintIndex: number | null;

  /** Fully occludes adjacent faces — drives mesher face-culling. */
  readonly opaque: boolean;
  /** Has a collision box. See {@link shape} for the box profile. */
  readonly solid: boolean;
  /** Collision / geometry profile. `full` for a standard block. */
  readonly shape: BlockShape;
  /** Blocks movement of fluids/light entirely. */
  readonly fluidBlocking: boolean;
  /** 0..15 light level emitted. */
  readonly lightEmission: number;
  /** 0..15 light removed when light passes through. Opaque blocks are 15. */
  readonly lightAbsorption: number;

  /** Seconds to break by hand. `Infinity` = unbreakable (bedrock). */
  readonly hardness: number;
  readonly resistance: number;
  readonly preferredTool: ToolCategory;
  readonly minToolTier: ToolTier;
  /** If true, breaking without `minToolTier` yields no drops. */
  readonly requiresCorrectTool: boolean;
  readonly drops: readonly BlockDrop[];

  readonly sounds: BlockSoundGroup;
  readonly flammable: boolean;
  /** Can be overwritten directly by block placement (air, tall grass, water). */
  readonly replaceable: boolean;
  readonly tags: readonly string[];
}

/** Everything optional except `name`; the registry fills defaults. */
export interface BlockDefinitionInput {
  name: string;
  displayName?: string;
  textures?: string | Partial<Record<BlockFaceKey, string>>;
  renderType?: BlockRenderType;
  shape?: BlockShape;
  tintIndex?: number | null;
  opaque?: boolean;
  solid?: boolean;
  fluidBlocking?: boolean;
  lightEmission?: number;
  lightAbsorption?: number;
  hardness?: number;
  resistance?: number;
  preferredTool?: ToolCategory;
  minToolTier?: ToolTier;
  requiresCorrectTool?: boolean;
  drops?: readonly BlockDrop[];
  sounds?: Partial<BlockSoundGroup>;
  flammable?: boolean;
  replaceable?: boolean;
  tags?: readonly string[];
  /** Explicit numeric id. Omit to auto-assign. `air` must be 0. */
  numericId?: BlockId;
}

export interface IBlockRegistry {
  register(def: BlockDefinitionInput): BlockDefinition;
  /** Never throws for a valid `Uint16` — unknown ids resolve to air so a corrupt save can't crash meshing. */
  get(id: BlockId): BlockDefinition;
  byName(name: string): BlockDefinition | undefined;
  /** Every block carrying the given tag (namespaced, `#` prefix optional). */
  byTag(tag: string): readonly BlockDefinition[];
  readonly all: readonly BlockDefinition[];
  readonly size: number;
  /** Hot-path helpers backed by flat typed arrays; safe to call per-voxel in the mesher. */
  isOpaque(id: BlockId): boolean;
  isSolid(id: BlockId): boolean;
  renderType(id: BlockId): BlockRenderType;
  lightEmission(id: BlockId): number;
  lightAbsorption(id: BlockId): number;
  /** Freeze the registry after content load; further `register` calls throw. */
  finalize(): void;
}
