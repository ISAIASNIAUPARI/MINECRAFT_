import * as THREE from 'three';
import { BoxModelFactory, type BoxModelInstance } from '../model/BoxModel';
import type { CameraState } from '../rendering/types';
import type { ViewmodelContext, WeaponDefinition } from './types';

/**
 * Draws the held weapon in its own overlay pass.
 *
 * A viewmodel cannot live in the world scene: it would clip into walls the
 * moment the player stood near one, and the world's fog would grey it out. So
 * it gets its own scene, its own camera and a cleared depth buffer, which is
 * the standard way every first-person game does this. It costs one extra draw
 * pass over a handful of boxes.
 *
 * Box building and resource sharing come from {@link BoxModelFactory}, the same
 * code the creatures use.
 */

/** Spent cases live in a fixed ring and are reused — nothing is allocated per shot. */
/** How much smaller the viewmodel is drawn than its world-scale dimensions. */
const VIEWMODEL_SCALE = 0.3;

const CASING_POOL = 12;
const CASING_SECONDS = 0.9;

interface Casing {
  mesh: THREE.Mesh;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

export class ViewmodelRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly factory: BoxModelFactory;
  private readonly root = new THREE.Group();
  private instance: BoxModelInstance | null = null;
  private definition: WeaponDefinition | null = null;

  private readonly casings: Casing[] = [];
  private casingCursor = 0;

  constructor() {
    // A narrow field of view keeps the weapon from looking fish-eyed up close,
    // independent of whatever the world camera is doing.
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.01, 12);
    // A weapon authored at world scale would be three blocks long a half block
    // from the eye, which fills the screen. Viewmodels are always drawn smaller
    // and nearer than the object they represent; this is that factor.
    this.root.scale.setScalar(VIEWMODEL_SCALE);
    this.scene.add(this.root);

    // Its own lights: the world's sun is somewhere else entirely, and the
    // weapon should read the same at midnight as at noon.
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-0.4, 1, 0.6);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xaab6c8, 0x202024, 1.15));

    this.factory = new BoxModelFactory();

    const casingGeo = new THREE.BoxGeometry(0.009, 0.009, 0.022);
    const casingMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.72, 0.56, 0.22) });
    for (let i = 0; i < CASING_POOL; i++) {
      const mesh = new THREE.Mesh(casingGeo, casingMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.casings.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0, spin: 0 });
    }
  }

  /** Swap the held weapon. Passing `null` empties the hands. */
  setWeapon(def: WeaponDefinition | null): void {
    if (this.definition === def) return;
    if (this.instance) this.root.remove(this.instance.root);
    this.instance = null;
    this.definition = def;
    if (def) {
      this.instance = this.factory.build(def.model, `viewmodel:${def.name}`);
      this.root.add(this.instance.root);
    }
  }

  /** Eject a spent case. Reuses the oldest slot; never allocates. */
  ejectCasing(): void {
    if (!this.definition) return;
    const port = this.definition.parts?.ejectPort ?? [2.5, -1, -4];
    const c = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casings.length;

    c.mesh.position.set(
      (port[0] / 16) * VIEWMODEL_SCALE,
      (port[1] / 16) * VIEWMODEL_SCALE,
      (port[2] / 16) * VIEWMODEL_SCALE,
    );
    c.mesh.visible = true;
    c.life = CASING_SECONDS;
    c.vx = 1.1 + Math.random() * 0.5;
    c.vy = 0.9 + Math.random() * 0.4;
    c.vz = 0.3 + Math.random() * 0.3;
    c.spin = 10 + Math.random() * 8;
  }

  /**
   * Pose and draw. `flash` is seconds of muzzle flash left, `reloadProgress`
   * 0..1, both owned by the weapon system.
   */
  update(ctx: ViewmodelContext, flash: number, dt: number): void {
    if (this.instance && this.definition) {
      this.factory.resetPose(this.instance);
      this.definition.animate?.(this.factory.poseGetter(this.instance), ctx);

      // The system owns flash and magazine visibility, after the animator, so a
      // weapon file cannot accidentally leave the flash stuck on.
      const flashPart = this.definition.parts?.muzzleFlash;
      if (flashPart) this.factory.poseGetter(this.instance)(flashPart).visible = flash > 0;

      this.factory.applyPose(this.instance);
    }

    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        continue;
      }
      c.vy -= 9 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.spin * dt;
      c.mesh.rotation.z += c.spin * 0.6 * dt;
    }
  }

  /** Match the world camera's aspect so the weapon never stretches. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  /** Apply the world camera's field of view, scaled by aim. */
  syncFov(world: CameraState, adsScale: number): void {
    const fov = world.fovDegrees * adsScale;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Draw over the world, with depth cleared so nothing can clip into it. */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.instance) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.instance) this.root.remove(this.instance.root);
    this.instance = null;
    this.factory.dispose();
    for (const c of this.casings) {
      c.mesh.geometry.dispose();
      (c.mesh.material as THREE.Material).dispose();
      this.scene.remove(c.mesh);
    }
    this.casings.length = 0;
  }
}
