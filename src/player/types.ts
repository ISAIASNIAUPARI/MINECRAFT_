import type { GameMode, Vec3 } from '../core/types';
import type { CameraState } from '../rendering/types';
import type { VoxelRaycastHit } from '../physics/types';

/**
 * CONTRACT — the player avatar. The game loop ticks it; rendering reads its
 * camera; UI reads its stats and hotbar selection.
 */

export interface PlayerStats {
  /** Half-hearts, 0..maxHealth. */
  health: number;
  maxHealth: number;
  /** Half-drumsticks, 0..20. Hunger drain arrives in Phase 2 but the field exists now. */
  hunger: number;
  saturation: number;
  /** Fall-damage accumulator (blocks fallen since last on-ground). */
  fallDistance: number;
  /** Experience — Phase 3, zeroed for now. */
  xpLevel: number;
  xpProgress: number;
}

export interface PlayerState {
  position: Vec3; // feet position
  velocity: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  inFluid: boolean;
  sprinting: boolean;
  sneaking: boolean;
  flying: boolean;
  gameMode: GameMode;
  stats: PlayerStats;
  /** 0..8 selected hotbar slot. */
  selectedSlot: number;
}

export interface PlayerSpawnOptions {
  position: Vec3;
  yaw?: number;
  pitch?: number;
  gameMode?: GameMode;
}

/** What the player is currently looking at, recomputed each frame. */
export interface PlayerTarget {
  hit: VoxelRaycastHit | null;
}

export interface IPlayerController {
  readonly state: Readonly<PlayerState>;
  /** Current camera, derived from eye position + look angles + view bob. */
  getCameraState(): CameraState;
  /** The block/entity under the crosshair this frame. */
  readonly target: PlayerTarget;

  /** Fixed-step physics + intent processing. */
  tick(dt: number): void;
  /** Per-frame: mouse look, camera smoothing. `alpha` = interpolation factor. */
  updateLook(dt: number): void;

  setGameMode(mode: GameMode): void;
  teleport(position: Vec3, yaw?: number, pitch?: number): void;
  respawn(): void;

  /** Serialize / restore for saves. */
  serialize(): PlayerState;
  restore(state: PlayerState): void;
}
