import * as THREE from 'three';
import { BoxModelFactory, type BoxModelInstance } from '../model/BoxModel';
import { MODEL_UNIT, type ModelPart, type Rgb } from '../model/types';
import type { WeaponDefinition } from '../weapons/types';

/**
 * The player's body, seen in third person.
 *
 * Built once and hidden in first person rather than created and destroyed on
 * every toggle — flipping the camera must never allocate, and must never leave
 * a second body behind.
 *
 * The weapon is a **child of the right arm**, not a separate object posed to
 * look nearby: when the arm swings, recoils or the body turns, the weapon goes
 * with it because it is attached to it.
 */

const SKIN: Rgb = [214, 169, 128];
const UNIFORM: Rgb = [38, 40, 46];
const UNIFORM_DARK: Rgb = [26, 27, 32];
const BAND: Rgb = [206, 164, 122];

/** The body, in model units (1/16 block). Origin between the feet. */
const BODY: readonly ModelPart[] = [
  {
    name: 'legL',
    size: [4, 12, 4],
    pivot: [-2, 12, 0],
    color: UNIFORM_DARK,
  },
  {
    name: 'legR',
    size: [4, 12, 4],
    pivot: [2, 12, 0],
    color: UNIFORM_DARK,
  },
  {
    name: 'torso',
    size: [8, 12, 4],
    pivot: [0, 12, 0],
    origin: [-4, 0, -2],
    color: UNIFORM,
    children: [
      {
        name: 'head',
        size: [8, 8, 8],
        pivot: [0, 12, 0],
        origin: [-4, 0, -4],
        color: SKIN,
      },
      // Left arm hangs; the right one holds the weapon.
      {
        name: 'armL',
        size: [4, 12, 4],
        pivot: [-6, 11, 0],
        color: UNIFORM,
        children: [
          { name: 'sleeveL', size: [4.2, 3, 4.2], pivot: [0, -8, 0], origin: [-2.1, 0, -2.1], color: BAND },
          { name: 'handL', size: [3.6, 3, 3.6], pivot: [0, -12, 0], color: SKIN },
        ],
      },
      {
        name: 'armR',
        size: [4, 12, 4],
        pivot: [6, 11, 0],
        color: UNIFORM,
        // Raised and brought across, so it reads as shouldering a weapon.
        rotation: [-1.35, 0, -0.18],
        children: [
          { name: 'sleeveR', size: [4.2, 3, 4.2], pivot: [0, -8, 0], origin: [-2.1, 0, -2.1], color: BAND },
          { name: 'handR', size: [3.6, 3, 3.6], pivot: [0, -12, 0], color: SKIN },
          // Where the weapon is mounted. Empty on its own.
          { name: 'weaponMount', size: [0, 0, 0], pivot: [0, -11, -1] },
        ],
      },
    ],
  },
];

export class PlayerAvatar {
  private readonly factory: BoxModelFactory;
  private readonly root = new THREE.Group();
  private readonly body: BoxModelInstance;
  private weapon: BoxModelInstance | null = null;
  private weaponDef: WeaponDefinition | null = null;

  constructor(scene: THREE.Scene) {
    this.root.name = 'player-avatar';
    this.root.visible = false;
    scene.add(this.root);
    this.factory = new BoxModelFactory();
    this.body = this.factory.build(BODY, 'player-body');
    this.root.add(this.body.root);
  }

  /** Shown in third person, hidden in first. Never rebuilds anything. */
  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /**
   * Attach a weapon to the right hand, or `null` to empty it.
   *
   * Idempotent: setting the same weapon twice is a no-op, so toggling the
   * camera or re-equipping cannot stack copies in the hand.
   */
  setWeapon(def: WeaponDefinition | null): void {
    if (this.weaponDef === def) return;
    const mount = this.body.parts.get('weaponMount');
    if (this.weapon && mount) mount.group.remove(this.weapon.root);
    this.weapon = null;
    this.weaponDef = def;
    if (!def || !mount) return;

    this.weapon = this.factory.build(def.model, `avatar-weapon:${def.name}`);
    // The viewmodel is authored around the holder's eye and drawn small; in the
    // hand it needs to be world-scaled and turned to point the way the body
    // faces.
    const SCALE = 0.55;
    this.weapon.root.scale.setScalar(SCALE);
    // The viewmodel's root part is offset to sit at the lower right of a
    // screen; cancel that offset so the GRIP lands in the hand rather than the
    // whole weapon hanging away from it.
    const gripOffset = def.model[0]?.pivot ?? [0, 0, 0];
    this.weapon.root.position.set(
      -gripOffset[0] * MODEL_UNIT * SCALE,
      -gripOffset[1] * MODEL_UNIT * SCALE,
      -gripOffset[2] * MODEL_UNIT * SCALE,
    );
    // Cancels the arm's resting rotation, so the barrel points where the body
    // faces rather than wherever the arm happens to hang.
    this.weapon.root.rotation.set(1.35, 0, 0);
    mount.group.add(this.weapon.root);
  }

  /**
   * Place and pose the body for this frame.
   *
   * `yaw` turns the whole body; `pitch` only tips the arms and head, so the
   * legs stay upright while the weapon tracks where the player is aiming.
   */
  update(
    position: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    speed: number,
    distanceWalked: number,
    recoil: number,
  ): void {
    if (!this.root.visible) return;

    this.root.position.set(position.x, position.y, position.z);
    this.root.rotation.y = yaw;

    this.factory.resetPose(this.body);
    const pose = this.factory.poseGetter(this.body);

    // Walk cycle, driven by distance so it stays in step at any speed.
    const moving = Math.min(speed / 4.6, 1);
    const gait = Math.sin(distanceWalked * 2.1);
    pose('legL').rotX = gait * 0.75 * moving;
    pose('legR').rotX = -gait * 0.75 * moving;
    pose('armL').rotX = -gait * 0.45 * moving;

    // The weapon arm follows the aim and takes the recoil.
    pose('armR').rotX = -pitch * 0.9 - recoil * 0.45;
    pose('head').rotX = -pitch * 0.6;

    this.factory.applyPose(this.body);
  }

  dispose(): void {
    this.factory.dispose();
    this.root.parent?.remove(this.root);
  }
}
