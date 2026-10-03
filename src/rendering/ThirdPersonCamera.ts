import type { CameraState } from './types';
import type { VoxelView } from '../physics/types';

/**
 * Third-person camera placement.
 *
 * Takes the first-person camera state and walks backwards along the view
 * direction, stopping short of the first solid block it meets, so the camera
 * can never end up inside terrain or see through a wall. The look direction is
 * untouched: the player still aims exactly where the crosshair points, which is
 * what keeps shooting identical in both modes.
 *
 * It does not own a camera. It returns a modified {@link CameraState}, so the
 * renderer, the weapon and the HUD all keep reading one source of truth.
 */

export interface ThirdPersonOptions {
  /** How far behind the eye to sit, in blocks, when nothing is in the way. */
  distance: number;
  /** Lift above the eye line. */
  height: number;
  /** Offset to the right, so the body does not cover the crosshair. */
  shoulder: number;
  /** Stop this far short of a wall, so the near plane never clips through it. */
  padding: number;
}

export const DEFAULT_THIRD_PERSON: ThirdPersonOptions = {
  distance: 4.2,
  height: 0.45,
  shoulder: 0.85,
  padding: 0.35,
};

/**
 * Place the camera behind the player, pulled in to avoid terrain.
 *
 * `eye` is the first-person state. The returned state has the same yaw, pitch
 * and field of view — only the position moves.
 */
export function thirdPersonCamera(
  eye: CameraState,
  voxels: VoxelView,
  opts: ThirdPersonOptions = DEFAULT_THIRD_PERSON,
): CameraState {
  const cosPitch = Math.cos(eye.pitch);
  // Forward, matching the engine's convention: yaw 0 looks down -Z.
  const fx = -Math.sin(eye.yaw) * cosPitch;
  const fy = Math.sin(eye.pitch);
  const fz = -Math.cos(eye.yaw) * cosPitch;
  // Right-hand vector on the horizontal plane: forward x up, so the camera
  // sits over the RIGHT shoulder and the body falls to the left of the
  // crosshair instead of covering it.
  const rx = Math.cos(eye.yaw);
  const rz = -Math.sin(eye.yaw);

  const originX = eye.x + rx * opts.shoulder;
  const originY = eye.y + opts.height;
  const originZ = eye.z + rz * opts.shoulder;

  // March backwards in small steps and stop at the first solid block. A step
  // smaller than a block cannot skip through a one-block wall.
  const step = 0.25;
  let travelled = 0;
  for (let d = step; d <= opts.distance; d += step) {
    const x = originX - fx * d;
    const y = originY - fy * d;
    const z = originZ - fz * d;
    if (voxels.isSolid(Math.floor(x), Math.floor(y), Math.floor(z))) break;
    travelled = d;
  }
  const back = Math.max(0, travelled - opts.padding);

  return {
    ...eye,
    x: originX - fx * back,
    y: originY - fy * back,
    z: originZ - fz * back,
  };
}
