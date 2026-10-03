import * as THREE from 'three';
import { BoxModelFactory, type BoxModelInstance } from '../model/BoxModel';
import type { ITextureAtlas } from '../rendering/types';
import type { Entity } from './Entity';
import { CORPSE_SECONDS, type AnimationContext, type IEntity, type Rgb } from './types';

/**
 * Renders and animates creatures, on top of the shared {@link BoxModelFactory}.
 *
 * This class owns what is specific to a *creature*: which entities have views,
 * where they stand, the damage flash, and the fallback death tip-over. All the
 * box-building, resource sharing and posing is the factory's job, which is the
 * same code the first-person weapon uses.
 */

/** How red a creature goes at the peak of a damage flash. */
const FLASH_EMISSIVE: Rgb = [150, 10, 10];

export class EntityRenderer {
  private readonly views = new Map<number, BoxModelInstance>();
  private readonly container = new THREE.Group();
  private readonly factory: BoxModelFactory;

  constructor(scene: THREE.Scene, atlas?: ITextureAtlas) {
    this.container.name = 'entities';
    scene.add(this.container);
    this.factory = new BoxModelFactory(atlas, FLASH_EMISSIVE);
  }

  /** Create or update views so they match `entities` exactly. */
  sync(entities: readonly IEntity[]): void {
    const seen = new Set<number>();
    for (const e of entities) {
      seen.add(e.id);
      if (!this.views.has(e.id)) {
        const view = this.factory.build(e.definition.model, `entity:${e.definition.name}:${e.id}`);
        this.container.add(view.root);
        this.views.set(e.id, view);
      }
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
        const ctx: AnimationContext = {
          age: e.age,
          speed: Math.hypot(e.velocity.x, e.velocity.z),
          distance: e.distanceWalked,
          headYaw: e.headYaw,
          headPitch: e.headPitch,
          airborne: !e.onGround,
          attack: ent.attackAnim ?? 0,
          hurt: ent.hurtTime > 0 ? ent.hurtTime / 0.35 : 0,
          dead: e.dead,
          deathProgress: e.dead ? Math.min(1, ent.deathTime / CORPSE_SECONDS) : 0,
          phase: ent.phase ?? 0,
        };

        this.factory.resetPose(view);
        def.animate(this.factory.poseGetter(view), ctx);
        this.factory.applyPose(view);
      }

      // A creature with no death animation of its own still tips over, so a
      // kill always reads. One that animates its own death opts out.
      if (e.dead && !def.animatesDeath) {
        view.root.rotation.z = -Math.PI / 2.2;
        view.root.position.y += 0.1;
      }

      this.factory.setAltSkin(view, ent.hurtTime > 0);
    }
  }

  /** Live counts, for the debug HUD and for the performance tests. */
  get stats(): { views: number; geometries: number; materials: number } {
    return { views: this.views.size, ...this.factory.stats };
  }

  dispose(): void {
    for (const view of this.views.values()) this.container.remove(view.root);
    this.views.clear();
    this.factory.dispose();
    this.container.parent?.remove(this.container);
  }
}
