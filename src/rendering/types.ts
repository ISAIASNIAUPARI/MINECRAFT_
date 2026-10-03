import type { BlockId } from '../core/types';
import type { IBlockRegistry } from '../blocks/types';

/**
 * CONTRACT — meshing output + renderer facade. The mesher runs in a worker; the
 * geometry format below is what crosses that boundary and what the renderer
 * uploads to the GPU.
 */

/** One draw's worth of geometry. All arrays are transferable. */
export interface MeshGeometry {
  /** xyz per vertex, world-local to the chunk origin. */
  positions: Float32Array;
  /** xyz per vertex. */
  normals: Float32Array;
  /**
   * uv per vertex. For the naive mesher these are final atlas coordinates. For
   * the greedy mesher they are *tile-space* coordinates (0..width, 0..height in
   * tile units, half-texel inset) and {@link MeshGeometry.tileUV} carries the
   * atlas rectangle the shader tiles within. A renderer that ignores `tileUV`
   * still gets a usable (if stretched) result.
   */
  uvs: Float32Array;
  /** rgb per vertex — biome tint * ambient occlusion (* a small constant face-shade) baked in (1,1,1 = untinted, unoccluded). */
  colors: Float32Array;
  indices: Uint32Array;
  /** Number of triangles, for stats. */
  triangleCount: number;
  /**
   * ADDITIVE (optional). Per vertex `[atlasU0, atlasV0, atlasSpanU, atlasSpanV]`
   * — the atlas rectangle for this vertex's texture, so a shader can tile it
   * across a greedily-merged quad (`atlasUV = tileUV.xy + fract(uv) * tileUV.zw`).
   * Absent ⇒ `uvs` are already final atlas coordinates.
   */
  tileUV?: Float32Array;
  /**
   * ADDITIVE (optional). One byte per vertex, `1` where the vertex belongs to an
   * animated liquid surface, `0` otherwise. Lets the renderer drive a water wave
   * without a second draw call. Absent ⇒ treat as all-zero (no liquid verts).
   */
  liquid?: Uint8Array;
}

export interface ChunkMeshResult {
  cx: number;
  cy: number;
  cz: number;
  /** Solid + cutout geometry, rendered first. `null` when empty. */
  opaque: MeshGeometry | null;
  /** Alpha-blended geometry (glass, water), rendered after, back-to-front per chunk. `null` when empty. */
  transparent: MeshGeometry | null;
  /** Revision of the source chunk this mesh was built from (stale-drop check). */
  revision: number;
}

/**
 * Read-only voxel access for the mesher, covering the chunk plus a 1-block skirt
 * into every neighbour so border faces cull correctly. Local coords range
 * -1..CHUNK_SIZE.
 */
export interface ChunkMeshView {
  cx: number;
  cy: number;
  cz: number;
  revision: number;
  get(lx: number, ly: number, lz: number): BlockId;
}

/** The slice of {@link ITextureAtlas} the mesher needs — serializable, so it can be sent to a worker. */
export interface AtlasUVResolver {
  readonly tileSize: number;
  getUV(textureKey: string): readonly [number, number, number, number];
}

export interface IChunkMesher {
  /** Pure function: same inputs -> same geometry. Safe to run on a worker. */
  build(view: ChunkMeshView, blocks: IBlockRegistry, atlas: AtlasUVResolver): ChunkMeshResult;
}

export interface CameraState {
  /** Eye position in world space. */
  x: number;
  y: number;
  z: number;
  /** Radians. yaw around +Y (0 = looking -Z), pitch around local X (clamped +-~89deg). */
  yaw: number;
  pitch: number;
  fovDegrees: number;
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  chunkMeshes: number;
}

export interface IRenderer {
  readonly canvas: HTMLCanvasElement;
  /** Push/replace a chunk's mesh. Called from the main thread after the worker returns. */
  setChunkMesh(result: ChunkMeshResult): void;
  removeChunkMesh(cx: number, cy: number, cz: number): void;
  setCamera(state: CameraState): void;
  /** Time-of-day 0..1 (0 = midnight) — drives sky/sun/fog. Phase 1 may hardcode day. */
  setTimeOfDay(t: number): void;
  /** Render one frame. `alpha` is the 0..1 interpolation factor between sim ticks. */
  render(alpha: number): void;
  resize(width: number, height: number): void;
  readonly stats: RenderStats;
  /** Highlight the targeted block face (from the raycast). `null` clears it. */
  setBlockHighlight(target: { x: number; y: number; z: number } | null): void;
  dispose(): void;
}

export interface ITextureAtlas {
  /** Atlas image, ready to become a GPU texture. */
  readonly image: HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  readonly tileSize: number;
  readonly columns: number;
  /** [u0, v0, u1, v1] for a texture key. Unknown keys resolve to a magenta placeholder tile. */
  getUV(textureKey: string): readonly [number, number, number, number];
  has(textureKey: string): boolean;
}
