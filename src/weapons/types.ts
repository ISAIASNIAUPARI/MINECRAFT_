import type { Vec3 } from '../core/types';
import type { ModelPart, PartPose } from '../model/types';

/**
 * CONTRACT — first-person weapons.
 *
 * A weapon is declared the same way a creature is: a box model, a stat block
 * and a per-frame pose function. Everything physical — firing, spread, recoil,
 * ammunition, reloading, aiming, the hitscan and what it damages — belongs to
 * {@link IWeaponSystem}, so adding a second weapon is one more definition file
 * and nothing else.
 */

/** What the viewmodel animator gets each frame. */
export interface ViewmodelContext {
  /** Seconds since the weapon was equipped. Drives idle sway. */
  age: number;
  /** Horizontal speed of the holder, blocks/second. Drives bob. */
  speed: number;
  /** Distance the holder has walked, in blocks. Drives the bob cycle. */
  distance: number;
  /** 0 hip-fired, 1 fully aimed down sights. */
  ads: number;
  /** 1 at the instant of a shot, decaying to 0. Drives the kick. */
  fire: number;
  /** 0..1 through a reload, 0 when not reloading. */
  reload: number;
  /** True while the magazine is empty. */
  empty: boolean;
  /** True while the holder is off the ground. */
  airborne: boolean;
  /** Mouse movement this frame, radians — drives the weapon lagging behind the look. */
  turnX: number;
  turnY: number;
}

export type ViewmodelAnimator = (pose: (part: string) => PartPose, ctx: ViewmodelContext) => void;

export interface WeaponDefinition {
  /** Namespaced id, e.g. `voxelia:service_rifle`. */
  name: string;
  displayName: string;

  /** Damage per bullet that connects. */
  damage: number;
  /** Shots per second while the trigger is held. */
  fireRate: number;
  /** True for one shot per click. */
  semiAuto?: boolean;
  /** Rounds per magazine. */
  magazineSize: number;
  /** Seconds to reload. */
  reloadSeconds: number;
  /** Maximum useful range in blocks. */
  range: number;
  /**
   * Cone half-angle in radians at the hip, and when fully aimed. Aiming is
   * worth taking only because this shrinks.
   */
  spreadHip: number;
  spreadAds: number;
  /** Camera kick per shot, radians (pitch up) and sideways jitter. */
  recoilPitch: number;
  recoilYaw: number;
  /** Seconds to go from hip to fully aimed. */
  adsSeconds: number;
  /** Field of view multiplier while aimed; below 1 zooms in. */
  adsFovScale: number;

  /** Viewmodel root parts, in model units (1/16 block). */
  model: readonly ModelPart[];
  /** Per-frame pose. */
  animate?: ViewmodelAnimator;

  /**
   * Parts the system drives directly, by name. Kept here rather than hardcoded
   * so a second weapon can name its own.
   */
  parts?: {
    /** Toggled visible for a few frames after a shot. */
    muzzleFlash?: string;
    /** Hidden while reloading, to read as the magazine being out. */
    magazine?: string;
    /** Where a spent case leaves the weapon, in model units. */
    ejectPort?: readonly [number, number, number];
  };
}

/** Where a shot landed. */
export interface ShotResult {
  /** The block hit, or `null` when the shot found a creature or nothing. */
  block: Vec3 | null;
  /** Id of the entity hit, or `null`. */
  entityId: number | null;
  /** Impact point in world space, or `null` when the shot hit nothing. */
  point: Vec3 | null;
}

export interface WeaponState {
  readonly definition: WeaponDefinition;
  /** Rounds left in the magazine. */
  readonly ammo: number;
  readonly reloading: boolean;
  /** 0..1 aim progress. */
  readonly ads: number;
  /** Current camera recoil offset, radians, applied on top of the player's aim. */
  readonly recoilPitch: number;
  readonly recoilYaw: number;
}

export interface IWeaponSystem {
  readonly state: WeaponState | null;
  equip(name: string): boolean;
  /** Called every tick with what the holder is doing. */
  tick(input: WeaponInput, dt: number): void;
  /** Begin a reload, if one is possible. */
  reload(): void;
}

export interface WeaponInput {
  /** Trigger held this tick. */
  firing: boolean;
  /** Aim held this tick. */
  aiming: boolean;
  /** Reload requested this tick. */
  reloadPressed: boolean;
  /** Eye position and look direction to fire from. */
  origin: Vec3;
  direction: Vec3;
  /** Holder speed, for bob. */
  speed: number;
  distance: number;
  airborne: boolean;
  /** Mouse delta this tick, radians. */
  turnX: number;
  turnY: number;
}
