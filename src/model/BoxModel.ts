import * as THREE from 'three';
import type { ITextureAtlas } from '../rendering/types';
import { MODEL_UNIT, type ModelPart, type PartPose, type Rgb } from './types';

/**
 * Builds and poses box models, sharing geometry and materials across every
 * instance of every model that happens to use the same box size or skin.
 *
 * Creatures and the first-person weapon are the same thing to this class: a
 * tree of boxes with a pivot each. Keeping one factory means a viewmodel gets
 * the atlas skins, the UV flip and the resource sharing for free, rather than a
 * second copy of all of it that drifts.
 */

/** One built part: its group, the meshes inside it, and its working pose. */
export interface BoxPartNode {
  group: THREE.Group;
  /** Resting rotation, re-applied before each posed frame. */
  rest: readonly [number, number, number];
  pose: PartPose;
  basePosition: THREE.Vector3;
}

/** A built model: the root to add to a scene, plus everything needed to pose it. */
export interface BoxModelInstance {
  root: THREE.Group;
  parts: Map<string, BoxPartNode>;
  /** Every mesh with the pair of shared materials it swaps between. */
  skins: { mesh: THREE.Mesh; base: THREE.Material; alt: THREE.Material }[];
  /** Whether the alternate (flash) skin is applied, so we only swap on change. */
  usingAlt: boolean;
}

export function freshPose(): PartPose {
  return { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
}

export class BoxModelFactory {
  private readonly geometries = new Map<string, THREE.BoxGeometry>();
  private readonly materials = new Map<string, THREE.MeshLambertMaterial>();
  private readonly atlasMap: THREE.CanvasTexture | null;
  /** Handed to animators for parts a model does not declare. */
  private readonly scratch = freshPose();

  /**
   * @param altEmissive Emissive colour for the alternate skin of every
   *   non-emissive part — the damage flash for creatures. Omit for models that
   *   never flash.
   */
  constructor(
    private readonly atlas?: ITextureAtlas,
    private readonly altEmissive: Rgb | null = null,
  ) {
    if (atlas) {
      const map = new THREE.CanvasTexture(atlas.image as HTMLCanvasElement);
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestMipmapNearestFilter;
      map.generateMipmaps = true;
      map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      this.atlasMap = map;
    } else {
      this.atlasMap = null;
    }
  }

  get stats(): { geometries: number; materials: number } {
    return { geometries: this.geometries.size, materials: this.materials.size };
  }

  /** Build a model tree. The caller owns adding `root` to a scene. */
  build(parts: readonly ModelPart[], name: string): BoxModelInstance {
    const root = new THREE.Group();
    root.name = name;
    const instance: BoxModelInstance = { root, parts: new Map(), skins: [], usingAlt: false };
    for (const part of parts) root.add(this.buildPart(part, instance));
    return instance;
  }

  /** Reset every part to rest, ready for an animator to write on top. */
  resetPose(instance: BoxModelInstance): void {
    for (const node of instance.parts.values()) {
      node.pose.rotX = 0;
      node.pose.rotY = 0;
      node.pose.rotZ = 0;
      node.pose.offsetX = 0;
      node.pose.offsetY = 0;
      node.pose.offsetZ = 0;
      node.pose.visible = true;
    }
  }

  /** The accessor an animator is handed. Unknown names get a scratch pose. */
  poseGetter(instance: BoxModelInstance): (part: string) => PartPose {
    return (name) => instance.parts.get(name)?.pose ?? this.scratch;
  }

  /** Push every working pose onto the Three.js objects. */
  applyPose(instance: BoxModelInstance): void {
    for (const node of instance.parts.values()) {
      node.group.rotation.set(
        node.rest[0] + node.pose.rotX,
        node.rest[1] + node.pose.rotY,
        node.rest[2] + node.pose.rotZ,
      );
      node.group.position.set(
        node.basePosition.x + node.pose.offsetX * MODEL_UNIT,
        node.basePosition.y + node.pose.offsetY * MODEL_UNIT,
        node.basePosition.z + node.pose.offsetZ * MODEL_UNIT,
      );
      node.group.visible = node.pose.visible;
    }
  }

  /** Swap to (or back from) the alternate skin. Cheap; only swaps on change. */
  setAltSkin(instance: BoxModelInstance, on: boolean): void {
    if (instance.usingAlt === on) return;
    instance.usingAlt = on;
    for (const skin of instance.skins) skin.mesh.material = on ? skin.alt : skin.base;
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.atlasMap?.dispose();
  }

  // --- shared resources --------------------------------------------------

  /**
   * A box of this size, with its UVs remapped into `rect` when the part is
   * textured. Keyed by both, so two parts sharing a size and a skin share one
   * geometry while a differently-skinned box of the same size gets its own.
   */
  private geometryFor(
    sx: number,
    sy: number,
    sz: number,
    rect: readonly [number, number, number, number] | null,
  ): THREE.BoxGeometry {
    const key = rect ? `${sx}x${sy}x${sz}@${rect.join(',')}` : `${sx}x${sy}x${sz}`;
    let g = this.geometries.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(sx * MODEL_UNIT, sy * MODEL_UNIT, sz * MODEL_UNIT);
      if (rect) {
        // BoxGeometry UVs run 0..1 on every face; squeeze them into the tile.
        //
        // The atlas reports its rect in image space, top-down, while a
        // CanvasTexture uploads with flipY, so a tile covering image rows
        // [v0, v1] lands at UV rows [1 - v1, 1 - v0]. Skipping that flip
        // samples a completely different tile, not a mirrored one.
        const [u0, v0, u1, v1] = rect;
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), 1 - v1 + uv.getY(i) * (v1 - v0));
        }
        uv.needsUpdate = true;
      }
      this.geometries.set(key, g);
    }
    return g;
  }

  private materialFor(
    color: Rgb,
    opacity: number,
    emissive: Rgb | null,
    textured: boolean,
  ): THREE.MeshLambertMaterial {
    const key = `${color.join(',')}|${opacity}|${emissive ? emissive.join(',') : '-'}|${textured ? 'tex' : 'flat'}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({
        // A textured part tints white, so the atlas pixels show through as
        // painted rather than being multiplied down by a second colour.
        color: textured
          ? new THREE.Color(1, 1, 1)
          : new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
        map: textured ? this.atlasMap : null,
        transparent: opacity < 1,
        opacity,
      });
      if (emissive) m.emissive = new THREE.Color(emissive[0] / 255, emissive[1] / 255, emissive[2] / 255);
      this.materials.set(key, m);
    }
    return m;
  }

  private buildPart(part: ModelPart, instance: BoxModelInstance): THREE.Group {
    const group = new THREE.Group();
    group.name = part.name;
    const [px, py, pz] = part.pivot;
    group.position.set(px * MODEL_UNIT, py * MODEL_UNIT, pz * MODEL_UNIT);

    const rest = part.rotation ?? ([0, 0, 0] as const);
    group.rotation.set(rest[0], rest[1], rest[2]);

    const [sx, sy, sz] = part.size;
    if (sx > 0 && sy > 0 && sz > 0) {
      const color = part.color ?? ([170, 170, 170] as const);
      const opacity = part.opacity ?? 1;
      // Fall back to the flat colour when the atlas has no such skin, so a
      // missing texture key degrades instead of painting magenta.
      const textured = !!(part.texture && this.atlas?.has(part.texture) && this.atlasMap);
      const rect = textured ? this.atlas!.getUV(part.texture!) : null;

      const base = this.materialFor(color, opacity, part.emissive ? color : null, textured);
      // An emissive part keeps glowing its own colour on the alternate skin, so
      // eyes do not turn into dull squares exactly when they matter most.
      const alt = this.altEmissive
        ? this.materialFor(color, opacity, part.emissive ? color : this.altEmissive, textured)
        : base;

      const mesh = new THREE.Mesh(this.geometryFor(sx, sy, sz, rect), base);
      instance.skins.push({ mesh, base, alt });

      // `origin` is the box's corner relative to the pivot; default centres it
      // on X/Z and hangs it below the pivot, which is what a limb wants.
      const origin = part.origin ?? ([-sx / 2, -sy, -sz / 2] as const);
      mesh.position.set(
        (origin[0] + sx / 2) * MODEL_UNIT,
        (origin[1] + sy / 2) * MODEL_UNIT,
        (origin[2] + sz / 2) * MODEL_UNIT,
      );
      group.add(mesh);
    }

    instance.parts.set(part.name, {
      group,
      rest,
      pose: freshPose(),
      basePosition: group.position.clone(),
    });

    for (const child of part.children ?? []) group.add(this.buildPart(child, instance));
    return group;
  }
}
