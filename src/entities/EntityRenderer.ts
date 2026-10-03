import * as THREE from 'three';
import type { Entity } from './Entity';
import { MODEL_UNIT, type AnimationContext, type IEntity, type ModelPart, type PartPose } from './types';

/**
 * Builds and animates creature models in the Three.js scene.
 *
 * A model is a tree of boxes. Each part becomes a `THREE.Group` at its pivot
 * with a box mesh offset inside it, so animating a part is just writing a
 * rotation on its group — exactly what an {@link Animator} does.
 */

interface PartNode {
  group: THREE.Group;
  mesh: THREE.Mesh | null;
  /** Resting rotation, re-applied before each animated frame. */
  rest: readonly [number, number, number];
  pose: PartPose;
  basePosition: THREE.Vector3;
}

interface EntityView {
  root: THREE.Group;
  parts: Map<string, PartNode>;
  materials: THREE.MeshLambertMaterial[];
}

function freshPose(): PartPose {
  return { rotX: 0, rotY: 0, rotZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, visible: true };
}

export class EntityRenderer {
  private readonly views = new Map<number, EntityView>();
  private readonly container = new THREE.Group();
  /** Scratch pose handed to animators; reset per part, per frame. */
  private readonly scratch = freshPose();

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
      this.container.remove(view.root);
      disposeView(view);
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

      // A dying creature tips over rather than vanishing.
      if (e.dead) {
        view.root.rotation.z = -Math.PI / 2.2;
        view.root.position.y += 0.1;
      }

      const def = e.definition;
      if (!def.animate) continue;

      const speed = Math.hypot(e.velocity.x, e.velocity.z);
      const ctx: AnimationContext = {
        age: e.age,
        speed,
        distance: e.distanceWalked,
        headYaw: e.headYaw,
        headPitch: e.headPitch,
        airborne: !e.onGround,
        attack: ent.attackAnim ?? 0,
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

      def.animate((name) => {
        const node = view.parts.get(name);
        return node ? node.pose : this.scratch;
      }, ctx);

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

      // Flash red on damage.
      const hurt = ent.hurtTime ?? 0;
      if (hurt > 0) {
        for (const m of view.materials) m.emissive.setRGB(0.6 * (hurt / 0.35), 0, 0);
      } else {
        for (const m of view.materials) {
          if (!m.userData.emissiveBase) m.emissive.setRGB(0, 0, 0);
        }
      }
    }
  }

  dispose(): void {
    for (const view of this.views.values()) {
      this.container.remove(view.root);
      disposeView(view);
    }
    this.views.clear();
    this.container.parent?.remove(this.container);
  }

  // --- building ----------------------------------------------------------

  private build(entity: IEntity): EntityView {
    const root = new THREE.Group();
    root.name = `entity:${entity.definition.name}:${entity.id}`;
    const parts = new Map<string, PartNode>();
    const materials: THREE.MeshLambertMaterial[] = [];

    for (const part of entity.definition.model) {
      root.add(this.buildPart(part, parts, materials));
    }

    this.container.add(root);
    return { root, parts, materials };
  }

  private buildPart(
    part: ModelPart,
    parts: Map<string, PartNode>,
    materials: THREE.MeshLambertMaterial[],
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = part.name;
    const [px, py, pz] = part.pivot;
    group.position.set(px * MODEL_UNIT, py * MODEL_UNIT, pz * MODEL_UNIT);

    const rest = part.rotation ?? ([0, 0, 0] as const);
    group.rotation.set(rest[0], rest[1], rest[2]);

    const [sx, sy, sz] = part.size;
    let mesh: THREE.Mesh | null = null;
    if (sx > 0 && sy > 0 && sz > 0) {
      const geometry = new THREE.BoxGeometry(sx * MODEL_UNIT, sy * MODEL_UNIT, sz * MODEL_UNIT);
      const [r, g, b] = part.color ?? [170, 170, 170];
      const material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        transparent: (part.opacity ?? 1) < 1,
        opacity: part.opacity ?? 1,
      });
      if (part.emissive) {
        material.emissive = new THREE.Color(r / 255, g / 255, b / 255);
        material.userData.emissiveBase = true;
      }
      materials.push(material);
      mesh = new THREE.Mesh(geometry, material);

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

    parts.set(part.name, {
      group,
      mesh,
      rest,
      pose: freshPose(),
      basePosition: group.position.clone(),
    });

    for (const child of part.children ?? []) {
      group.add(this.buildPart(child, parts, materials));
    }
    return group;
  }
}

function disposeView(view: EntityView): void {
  view.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}
