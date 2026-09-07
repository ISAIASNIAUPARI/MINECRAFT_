import { CHUNK_SIZE } from '../core/constants';
import type { BlockId } from '../core/types';
import type { IBlockRegistry, BlockDefinition, BlockFaceKey } from '../blocks/types';
import type {
  AtlasUVResolver,
  ChunkMeshResult,
  ChunkMeshView,
  IChunkMesher,
  MeshGeometry,
} from './types';

/**
 * SKELETON — culled per-face mesher. Emits one quad per exposed block face.
 * Correct and simple; NOT optimized. Phase 1 (Agent: rendering) replaces this
 * with greedy meshing + ambient occlusion running in a Web Worker, keeping the
 * {@link IChunkMesher} contract and {@link MeshGeometry} output format.
 */

// face: [normal, 4 corner offsets (ccw), faceKey]
interface Face {
  n: [number, number, number];
  c: [number, number, number][];
  key: BlockFaceKey;
  shade: number;
}

const FACES: Face[] = [
  { n: [0, 1, 0], key: 'top', shade: 1.0, c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], key: 'bottom', shade: 0.5, c: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { n: [0, 0, -1], key: 'north', shade: 0.8, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { n: [0, 0, 1], key: 'south', shade: 0.8, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [-1, 0, 0], key: 'west', shade: 0.65, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [1, 0, 0], key: 'east', shade: 0.65, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
];

function faceTexture(def: BlockDefinition, key: BlockFaceKey): string {
  const t = def.textures;
  if (key === 'top') return t.top ?? t.all ?? t.side ?? 'stone';
  if (key === 'bottom') return t.bottom ?? t.all ?? t.side ?? 'stone';
  return t[key] ?? t.side ?? t.all ?? 'stone';
}

function tint(def: BlockDefinition): [number, number, number] {
  switch (def.tintIndex) {
    case 0:
      return [0.49, 0.74, 0.36]; // grass
    case 1:
      return [0.31, 0.62, 0.21]; // foliage
    case 2:
      return [0.23, 0.43, 0.78]; // water
    default:
      return [1, 1, 1];
  }
}

class GeometryBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  private vertexCount = 0;

  quad(
    corners: [number, number, number][],
    n: [number, number, number],
    uv: readonly [number, number, number, number],
    color: [number, number, number],
  ): void {
    const [u0, v0, u1, v1] = uv;
    const uvCorners = [
      [u0, v1],
      [u1, v1],
      [u1, v0],
      [u0, v0],
    ];
    for (let i = 0; i < 4; i++) {
      this.positions.push(corners[i][0], corners[i][1], corners[i][2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(uvCorners[i][0], uvCorners[i][1]);
      this.colors.push(color[0], color[1], color[2]);
    }
    const b = this.vertexCount;
    this.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.vertexCount += 4;
  }

  build(): MeshGeometry | null {
    if (this.indices.length === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
      triangleCount: this.indices.length / 3,
    };
  }
}

export class NaiveMesher implements IChunkMesher {
  build(view: ChunkMeshView, blocks: IBlockRegistry, atlas: AtlasUVResolver): ChunkMeshResult {
    const opaque = new GeometryBuilder();
    const transparent = new GeometryBuilder();

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = view.get(x, y, z) as BlockId;
          if (id === 0) continue;
          const def = blocks.get(id);
          if (def.renderType === 'invisible') continue;
          const isTransparent = def.renderType === 'transparent' || def.renderType === 'liquid';
          const builder = isTransparent ? transparent : opaque;
          const col = tint(def);

          for (const face of FACES) {
            const nx = x + face.n[0];
            const ny = y + face.n[1];
            const nz = z + face.n[2];
            const neighbor = view.get(nx, ny, nz) as BlockId;
            if (neighbor !== 0) {
              const nd = blocks.get(neighbor);
              if (nd.opaque) continue;
              // Same-material transparent blocks don't draw internal faces (glass, water).
              if (isTransparent && neighbor === id) continue;
            }
            const uv = atlas.getUV(faceTexture(def, face.key));
            const corners = face.c.map(
              (c) => [x + c[0], y + c[1], z + c[2]] as [number, number, number],
            );
            const shaded: [number, number, number] = [
              col[0] * face.shade,
              col[1] * face.shade,
              col[2] * face.shade,
            ];
            builder.quad(corners, face.n, uv, shaded);
          }
        }
      }
    }

    return {
      cx: view.cx,
      cy: view.cy,
      cz: view.cz,
      opaque: opaque.build(),
      transparent: transparent.build(),
      revision: view.revision,
    };
  }
}
