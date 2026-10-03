import * as THREE from 'three';
import type { Entity } from './Entity';
import { MODEL_UNIT, type AnimationContext, type IEntity, type ModelPart, type PartPose, type Rgb } from './types';

/**
 * Builds and animates creature models in the Three.js scene.
 *
 * A model is a tree of boxes. Each part becomes a `THREE.Group` at its pivot
 * with a box mesh offset inside it, so animating a part is just writing a
 * rotation on its group — exactly what an {@link Animator} does.
 *
 * Geometry and materials are shared across every instance and every creature
 * that happens to use the same box size or the same colour, so a horde costs
 * one geometry per distinct size rather than one per limb per creature.
 */

interface PartNode {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  /** Resting rotation, re-applied before each animated frame. */
  rest: readonly [number, number, number];
  pose: PartPose;
  basePosition: THREE.Vector3;
}

interface EntityView {
  root: THREE.Group;
  parts: Map<string, PartNode>;
  /** Every mesh, with the pair of shared materials it swaps between. */
  skins: { mesh: THREE.Mesh; base: THREE.Material; hurt: THREE.Material }[];
  /** Whether the hurt skin is currently applied, so we only swap on change. */
  flashing: boolean;
}

function freshPose(): PartPose {
  return { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
}

/** How red a creature goes at the peak of a damage flash. */
const FLASH_EMISSIVE: Rgb = [150, 10, 10];

export class EntityRenderer {
  private readonly views = new Map<number, EntityView>();
  private readonly container = new THREE.Group();
  /** Scratch pose handed to animators for parts a model does not declare. */
  private readonly scratch = freshPose();

  // Shared across every entity — never disposed per instance.
  private readonly geometries = new Map<string, THREE.BoxGeometry>();
  private readonly materials = new Map<string, THREE.MeshLambertMaterial>();

  constructor(scene: THREE.Scene) {
    this.container.name = 'entities';
    scene.add(this.container);
  }

  /** Create or update views so they match `entities` exactly. */
  sync(entities: readonly IEntity[]): void {
    const seen = new Set<number>();
    for (const e of entities) {
      seen.add(e.id);
      if (!this.views.has(e.id)) this.views.set(e.id, this.build(e));
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      // Only the group goes; geometry and materials are shared and stay cached.
      this.container.remove(view.root);
      this.views.delete(id);
    }
  }

  /** Pose every view for this frame. */
  update(entities: readonly IEntity[]): void {
    for (const e of entities) {
      const view = this.views.get(e.id);
      if (!view) continue;
      const ent = e as Entity;

      view.root.position.set(e.position.x, e.position.y, e.position.z);
      view.root.rotation.y = e.yaw;
      view.root.rotation.z = 0;

      const def = e.definition;
      if (def.animate) {
        const speed = Math.hypot(e.velocity.x, e.velocity.z);
        const ctx: AnimationContext = {
          age: e.age,
          speed,
          distance: e.distanceWalked,
          headYaw: e.headYaw,
          headPitch: e.headPitch,
          airborne: !e.onGround,
          attack: ent.attackAnim ?? 0,
          hurt: ent.hurtTime > 0 ? ent.hurtTime / 0.35 : 0,
          dead: e.dead,
          phase: ent.phase ?? 0,
        };

        // Reset every part to rest, then let the animator write on top.
        for (const node of view.parts.values()) {
          node.pose.rotX = 0;
          node.pose.rotY = 0;
          node.pose.rotZ = 0;
          node.pose.offsetX = 0;
          node.pose.offsetY = 0;
          node.pose.offsetZ = 0;
          node.pose.visible = true;
        }

        def.animate((name) => view.parts.get(name)?.pose ?? this.scratch, ctx);

        for (const node of view.parts.values()) {
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

      // A creature with no death animation of its own still tips over, so a
      // kill always reads. One that animates its own death opts out.
      if (e.dead && !def.animatesDeath) {
        view.root.rotation.z = -Math.PI / 2.2;
        view.root.position.y += 0.1;
      }

      // Damage flash swaps to a shared red variant. Mutating the material would
      // flash every creature sharing it.
      const flash = ent.hurtTime > 0;
      if (flash !== view.flashing) {
        view.flashing = flash;
        for (const skin of view.skins) skin.mesh.material = flash ? skin.hurt : skin.base;
      }
    }
  }

  /** Live counts, for the debug HUD and for the performance tests. */
  get stats(): { views: number; geometries: number; materials: number } {
    return { views: this.views.size, geometries: this.geometries.size, materials: this.materials.size };
  }

  dispose(): void {
    for (const view of this.views.values()) this.container.remove(view.root);
    this.views.clear();
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.container.parent?.remove(this.container);
  }

  // --- shared resources --------------------------------------------------

  private geometryFor(sx: number, sy: number, sz: number): THREE.BoxGeometry {
    const key = `${sx}x${sy}x${sz}`;
    let g = this.geometries.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(sx * MODEL_UNIT, sy * MODEL_UNIT, sz * MODEL_UNIT);
      this.geometries.set(key, g);
    }
    return g;
  }

  private materialFor(
    color: Rgb,
    opacity: number,
    emissive: Rgb | null,
  ): THREE.MeshLambertMaterial {
    const key = `${color.join(',')}|${opacity}|${emissive ? emissive.join(',') : '-'}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({
        color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
        transparent: opacity < 1,
        opacity,
      });
      if (emissive) m.emissive = new THREE.Color(emissive[0] / 255, emissive[1] / 255, emissive[2] / 255);
      this.materials.set(key, m);
    }
    return m;
  }

  // --- building ----------------------------------------------------------

  private build(entity: IEntity): EntityView {
    const root = new THREE.Group();
    root.name = `entity:${entity.definition.name}:${entity.id}`;
    const view: EntityView = { root, parts: new Map(), skins: [], flashing: false };

    for (const part of entity.definition.model) {
      root.add(this.buildPart(part, view));
    }

    this.container.add(root);
    return view;
  }

  private buildPart(part: ModelPart, view: EntityView): THREE.Group {
    const group = new THREE.Group();
    group.name = part.name;
    const [px, py, pz] = part.pivot;
    group.position.set(px * MODEL_UNIT, py * MODEL_UNIT, pz * MODEL_UNIT);

    const rest = part.rotation ?? ([0, 0, 0] as const);
    group.rotation.set(rest[0], rest[1], rest[2]);

    const [sx, sy, sz] = part.size;
    const meshes: THREE.Mesh[] = [];
    if (sx > 0 && sy > 0 && sz > 0) {
      const color = part.color ?? ([170, 170, 170] as const);
      const opacity = part.opacity ?? 1;
      const base = this.materialFor(color, opacity, part.emissive ? color : null);
      // An emissive part keeps glowing its own colour while flashing, so eyes
      // do not turn into dull red squares exactly when they matter most.
      const hurt = this.materialFor(color, opacity, part.emissive ? color : FLASH_EMISSIVE);

      const mesh = new THREE.Mesh(this.geometryFor(sx, sy, sz), base);
      view.skins.push({ mesh, base, hurt });

      // `origin` is the box's corner relative to the pivot; default centres it
      // on X/Z and hangs it below the pivot, which is what a limb wants.
      const origin = part.origin ?? ([-sx / 2, -sy, -sz / 2] as const);
      mesh.position.set(
        (origin[0] + sx / 2) * MODEL_UNIT,
        (origin[1] + sy / 2) * MODEL_UNIT,
        (origin[2] + sz / 2) * MODEL_UNIT,
      );
      group.add(mesh);
      meshes.push(mesh);
    }

    view.parts.set(part.name, {
      group,
      meshes,
      rest,
      pose: freshPose(),
      basePosition: group.position.clone(),
    });

    for (const child of part.children ?? []) {
      group.add(this.buildPart(child, view));
    }
    return group;
  }
}
