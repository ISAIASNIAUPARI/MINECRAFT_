import * as THREE from 'three';
import { CHUNK_SIZE, DEFAULT_RENDER_DISTANCE } from '../core/constants';
import { chunkKey } from '../core/math';
import { createLogger } from '../core/Logger';
import type { IBlockRegistry } from '../blocks/types';
import type {
  CameraState,
  ChunkMeshResult,
  IRenderer,
  ITextureAtlas,
  MeshGeometry,
  RenderStats,
} from './types';

const logrender = createLogger('rendering');

/**
 * SKELETON renderer — Three.js scene, one mesh per chunk, flat sky colour, a
 * hemisphere + directional light, distance fog and a block-highlight box.
 * Phase 1 (Agent: rendering) adds the animated sky (sun/moon/stars/clouds),
 * ambient occlusion shading, frustum culling stats, water animation and a
 * day/night lighting rig. {@link IRenderer} is the frozen contract.
 */
export class Renderer implements IRenderer {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly chunkGroup = new THREE.Group();
  private readonly meshes = new Map<string, { opaque?: THREE.Mesh; transparent?: THREE.Mesh }>();

  private readonly opaqueMaterial: THREE.MeshLambertMaterial;
  private readonly transparentMaterial: THREE.MeshLambertMaterial;
  private readonly highlight: THREE.LineSegments;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;

  private _stats: RenderStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, chunkMeshes: 0 };
  private lastFrameTime = performance.now();

  constructor(canvas: HTMLCanvasElement, atlas: ITextureAtlas, _blocks: IBlockRegistry) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x8bb7ef, 1);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 1200);

    const texture = new THREE.CanvasTexture(atlas.image as HTMLCanvasElement);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    this.opaqueMaterial = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true });
    this.transparentMaterial = new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x54492f, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
    this.sun.position.set(0.5, 1, 0.3);
    this.scene.add(this.sun);

    const fogDist = DEFAULT_RENDER_DISTANCE * CHUNK_SIZE;
    this.scene.fog = new THREE.Fog(0xc6dbff, fogDist * 0.5, fogDist);

    this.scene.add(this.chunkGroup);

    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.resize(canvas.clientWidth || 1, canvas.clientHeight || 1);
    logrender.info('renderer ready');
  }

  setChunkMesh(result: ChunkMeshResult): void {
    const key = chunkKey(result.cx, result.cy, result.cz);
    this.removeChunkMesh(result.cx, result.cy, result.cz);
    const entry: { opaque?: THREE.Mesh; transparent?: THREE.Mesh } = {};
    const origin = new THREE.Vector3(result.cx * CHUNK_SIZE, result.cy * CHUNK_SIZE, result.cz * CHUNK_SIZE);

    if (result.opaque) {
      const mesh = new THREE.Mesh(toBufferGeometry(result.opaque), this.opaqueMaterial);
      mesh.position.copy(origin);
      mesh.frustumCulled = true;
      this.chunkGroup.add(mesh);
      entry.opaque = mesh;
    }
    if (result.transparent) {
      const mesh = new THREE.Mesh(toBufferGeometry(result.transparent), this.transparentMaterial);
      mesh.position.copy(origin);
      mesh.renderOrder = 1;
      this.chunkGroup.add(mesh);
      entry.transparent = mesh;
    }
    this.meshes.set(key, entry);
  }

  removeChunkMesh(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    const entry = this.meshes.get(key);
    if (!entry) return;
    for (const mesh of [entry.opaque, entry.transparent]) {
      if (!mesh) continue;
      this.chunkGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  setCamera(state: CameraState): void {
    this.camera.position.set(state.x, state.y, state.z);
    this.camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
    if (this.camera.fov !== state.fovDegrees) {
      this.camera.fov = state.fovDegrees;
      this.camera.updateProjectionMatrix();
    }
  }

  setTimeOfDay(t: number): void {
    // 0 = midnight, 0.5 = noon.
    const daylight = Math.max(0.05, Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
    const sky = new THREE.Color(0x0a1030).lerp(new THREE.Color(0x8bb7ef), daylight);
    this.renderer.setClearColor(sky, 1);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.sun.intensity = 0.3 + daylight * 1.3;
    this.hemi.intensity = 0.3 + daylight * 0.9;
  }

  setBlockHighlight(target: { x: number; y: number; z: number } | null): void {
    if (!target) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  }

  /**
   * The live Three.js scene, so sibling renderers (entities, particles) can add
   * their own object graphs instead of this class growing to know about them.
   */
  get threeScene(): THREE.Scene {
    return this.scene;
  }

  render(_alpha: number): void {
    const now = performance.now();
    this._stats.frameMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.renderer.render(this.scene, this.camera);

    const info = this.renderer.info;
    this._stats.drawCalls = info.render.calls;
    this._stats.triangles = info.render.triangles;
    this._stats.chunkMeshes = this.meshes.size;
    this._stats.fps = this._stats.frameMs > 0 ? 1000 / this._stats.frameMs : 0;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  get stats(): RenderStats {
    return this._stats;
  }

  dispose(): void {
    for (const [key] of this.meshes) {
      const [cx, cy, cz] = key.split(',').map(Number);
      this.removeChunkMesh(cx, cy, cz);
    }
    this.opaqueMaterial.dispose();
    this.transparentMaterial.dispose();
    this.renderer.dispose();
  }
}

function toBufferGeometry(g: MeshGeometry): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(g.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}
