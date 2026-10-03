import type { ModelPart, Rgb } from '../../model/types';
import type { WeaponDefinition } from '../types';

/**
 * The Service Rifle — the first-person weapon, built to the supplied reference.
 *
 * Viewmodel space: model units are 1/16 block, as everywhere else. The origin
 * is the holder's eye. -Z is forward, +X right, +Y up, so the weapon sits to
 * the lower right and the barrel runs away from the camera down -Z.
 *
 * The reference is a *voxel* rifle — a stepped Picatinny rail of individual
 * cubes, a boxy reflex sight with a single red pixel, blocky arms in a striped
 * sleeve. It is built that way on purpose: it matches the image, and the
 * renderer has no PBR path to make a smooth one look like anything better.
 *
 * Box budget: 49. Most of it is silhouette — the rail teeth and the sight are
 * what make it read as a modern rifle rather than a plank, and the rail teeth
 * are nine copies of one geometry.
 */

const STEEL: Rgb = [58, 60, 64];
const STEEL_DARK: Rgb = [38, 39, 43];
const POLYMER: Rgb = [30, 31, 34];
const POLYMER_LIT: Rgb = [48, 50, 54];
const RUBBER: Rgb = [24, 24, 26];
const WEAR: Rgb = [92, 94, 98];
const SKIN: Rgb = [214, 169, 128];
const SLEEVE: Rgb = [34, 34, 38];
const SLEEVE_BAND: Rgb = [206, 164, 122];
const DOT: Rgb = [255, 44, 36];
const FLASH: Rgb = [255, 226, 150];

/** One tooth of the Picatinny rail. Nine of these, one shared geometry. */
function railTooth(i: number): ModelPart {
  return {
    name: `railTooth${i}`,
    size: [3, 1.2, 1.4],
    pivot: [0, 1.6, -3 - i * 2.4],
    origin: [-1.5, 0, -0.7],
    color: STEEL_DARK,
  };
}

export const SERVICE_RIFLE: WeaponDefinition = {
  name: 'voxelia:service_rifle',
  displayName: 'Service Rifle',

  damage: 7,
  fireRate: 9,
  magazineSize: 30,
  reloadSeconds: 2.1,
  range: 90,
  // Hip fire is genuinely inaccurate; aiming is what makes the weapon precise.
  spreadHip: 0.055,
  spreadAds: 0.004,
  recoilPitch: 0.022,
  recoilYaw: 0.009,
  adsSeconds: 0.18,
  adsFovScale: 0.72,

  parts: {
    muzzleFlash: 'muzzleFlash',
    magazine: 'magazine',
    ejectPort: [2.5, -1, -4],
  },

  model: [
    {
      // Everything hangs off one root so the whole weapon can be swayed,
      // kicked and pulled to the sights as a unit.
      name: 'weapon',
      size: [0, 0, 0],
      pivot: [11, -12, -20],
      color: STEEL,
      children: [
        // --- receiver -----------------------------------------------------
        {
          name: 'receiver',
          size: [4.5, 4.5, 13],
          pivot: [0, 0, 0],
          origin: [-2.25, -2.25, -6.5],
          color: POLYMER,
          children: [
            {
              name: 'receiverTop',
              size: [4, 1.2, 12],
              pivot: [0, 2.25, 0],
              origin: [-2, 0, -6],
              color: STEEL_DARK,
            },
            {
              name: 'ejectPort',
              size: [0.6, 2, 3.5],
              pivot: [2.3, 0.6, -1],
              origin: [0, -1, -1.75],
              color: STEEL,
            },
            {
              name: 'chargingHandle',
              size: [1.2, 1.2, 2.5],
              pivot: [-2.5, 1.4, 4],
              origin: [-1.2, -0.6, -1.25],
              color: WEAR,
            },
          ],
        },

        // --- handguard and barrel ------------------------------------------
        {
          name: 'handguard',
          size: [4, 4, 16],
          pivot: [0, 0, -13],
          origin: [-2, -2, -14],
          color: POLYMER_LIT,
          children: [
            {
              name: 'handguardVentA',
              size: [4.2, 1, 1.6],
              pivot: [0, -0.4, -6],
              origin: [-2.1, -0.5, -0.8],
              color: POLYMER,
            },
            {
              name: 'handguardVentB',
              size: [4.2, 1, 1.6],
              pivot: [0, -0.4, -10],
              origin: [-2.1, -0.5, -0.8],
              color: POLYMER,
            },
          ],
        },
        {
          name: 'barrel',
          size: [1.8, 1.8, 9],
          pivot: [0, 0.4, -27],
          origin: [-0.9, -0.9, -9],
          color: STEEL_DARK,
          children: [
            {
              name: 'muzzleBrake',
              size: [2.6, 2.6, 3],
              pivot: [0, 0, -9],
              origin: [-1.3, -1.3, -3],
              color: STEEL,
            },
            {
              // Toggled on for ~45 ms per shot. Emissive rather than a dynamic
              // light: a real light per shot is the expensive way to do this.
              name: 'muzzleFlash',
              size: [5, 5, 5],
              pivot: [0, 0, -12],
              origin: [-2.5, -2.5, -5],
              color: FLASH,
              emissive: true,
              opacity: 0.85,
            },
          ],
        },
        {
          name: 'gasBlock',
          size: [2.6, 3.2, 2.4],
          pivot: [0, 1.4, -24],
          origin: [-1.3, 0, -1.2],
          color: STEEL,
        },
        // Front sight, folded up on the rail.
        {
          name: 'frontSight',
          size: [1.6, 3.4, 1],
          pivot: [0, 2.6, -25],
          origin: [-0.8, 0, -0.5],
          color: STEEL_DARK,
        },

        // --- rail ----------------------------------------------------------
        railTooth(0),
        railTooth(1),
        railTooth(2),
        railTooth(3),
        railTooth(4),
        railTooth(5),
        railTooth(6),
        railTooth(7),
        railTooth(8),

        // --- reflex sight ---------------------------------------------------
        {
          name: 'sightBase',
          size: [3.6, 2, 5],
          pivot: [0, 2.8, 2],
          origin: [-1.8, 0, -2.5],
          color: STEEL_DARK,
          children: [
            { name: 'sightPostL', size: [0.9, 4, 4.6], pivot: [-1.5, 2, 0], origin: [-0.45, 0, -2.3], color: POLYMER },
            { name: 'sightPostR', size: [0.9, 4, 4.6], pivot: [1.5, 2, 0], origin: [-0.45, 0, -2.3], color: POLYMER },
            { name: 'sightHood', size: [3.9, 1, 4.6], pivot: [0, 6, 0], origin: [-1.95, 0, -2.3], color: POLYMER },
            // The red dot, floating in the window.
            {
              name: 'sightDot',
              size: [0.7, 0.7, 0.3],
              pivot: [0, 3.8, -1],
              origin: [-0.35, -0.35, -0.3],
              color: DOT,
              emissive: true,
            },
          ],
        },

        // --- magazine, grip, stock ------------------------------------------
        {
          name: 'magazine',
          size: [3, 9, 4],
          pivot: [0, -2.3, -3],
          origin: [-1.5, -9, -2],
          color: POLYMER,
          rotation: [0.16, 0, 0],
          children: [
            { name: 'magFloor', size: [3.4, 1.2, 4.4], pivot: [0, -9, 0], origin: [-1.7, -1.2, -2.2], color: STEEL_DARK },
          ],
        },
        {
          name: 'grip',
          size: [3, 8, 4],
          pivot: [0, -2.3, 3.5],
          origin: [-1.5, -8, -2],
          color: RUBBER,
          rotation: [-0.34, 0, 0],
        },
        {
          name: 'stock',
          size: [3.6, 4.4, 11],
          pivot: [0, 0.2, 6.5],
          origin: [-1.8, -2.2, 0],
          color: POLYMER_LIT,
          children: [
            { name: 'cheekRest', size: [3.8, 1.2, 8], pivot: [0, 2.2, 1.5], origin: [-1.9, 0, 0], color: RUBBER },
            { name: 'buttPad', size: [4, 5.5, 1.4], pivot: [0, 0, 11], origin: [-2, -2.75, 0], color: RUBBER },
          ],
        },

        // --- hands ----------------------------------------------------------
        // Blocky, like the reference: the world's inhabitant holding the thing.
        {
          name: 'handFront',
          size: [3.4, 3.4, 4],
          pivot: [0, -3.4, -16],
          origin: [-1.7, -3.4, -2],
          color: SKIN,
          rotation: [0.25, 0, 0],
          children: [
            {
              name: 'armFront',
              size: [3.6, 3.6, 12],
              pivot: [1.4, -1.2, 1.5],
              origin: [-1.8, -1.8, 0],
              color: SLEEVE,
              rotation: [-0.5, 0.42, 0],
              children: [
                { name: 'sleeveBandF', size: [3.8, 3.8, 2.2], pivot: [0, 0, 5], origin: [-1.9, -1.9, 0], color: SLEEVE_BAND },
              ],
            },
          ],
        },
        {
          name: 'handRear',
          size: [3.4, 3.6, 4],
          pivot: [0, -5.4, 3.5],
          origin: [-1.7, -3.6, -2],
          color: SKIN,
          rotation: [-0.2, 0, 0],
          children: [
            {
              name: 'armRear',
              size: [3.6, 3.6, 12],
              pivot: [1.6, -0.6, 2],
              origin: [-1.8, -1.8, 0],
              color: SLEEVE,
              rotation: [-0.22, 0.3, 0],
              children: [
                { name: 'sleeveBandR', size: [3.8, 3.8, 2.2], pivot: [0, 0, 6], origin: [-1.9, -1.9, 0], color: SLEEVE_BAND },
              ],
            },
          ],
        },
      ],
    },
  ],

  animate: (pose, ctx) => {
    const w = pose('weapon');

    // --- AIM: put the red dot ON the crosshair ---------------------------
    // Not an eyeballed nudge: the weapon root sits at (11, -12) model units and
    // the dot sits at (0, +6.6) within it, so cancelling both lands the dot on
    // the camera axis. Aiming has to actually align the sight or it is theatre.
    const a = ctx.ads;
    w.offsetX = -11 * a;
    w.offsetY = (12 - 6.6) * a;
    // Push the weapon AWAY on aim, not toward the face. Pulling it in puts the
    // sight almost on the near plane and the hood swallows the screen.
    w.offsetZ = -16 * a;

    // --- IDLE: a slow drift, cut right down while aiming -------------------
    const idle = (1 - a * 0.85) * (1 - Math.min(ctx.speed / 4, 1) * 0.5);
    w.offsetX += Math.sin(ctx.age * 0.7) * 0.28 * idle;
    w.offsetY += Math.sin(ctx.age * 0.95 + 1.1) * 0.22 * idle;
    w.rotZ = Math.sin(ctx.age * 0.6) * 0.012 * idle;

    // --- BOB: driven by distance walked, so it stays in step at any speed ---
    const moving = Math.min(ctx.speed / 5.5, 1) * (1 - a * 0.8);
    w.offsetX += Math.sin(ctx.distance * 2.1) * 0.9 * moving;
    w.offsetY += Math.abs(Math.cos(ctx.distance * 2.1)) * -0.8 * moving;
    w.rotZ += Math.sin(ctx.distance * 2.1) * 0.03 * moving;

    // Airborne: the weapon lags downward.
    if (ctx.airborne) w.offsetY -= 0.9;

    // --- SWAY: the weapon lags behind a fast look ---------------------------
    const lag = 1 - a * 0.7;
    w.offsetX += clamp(-ctx.turnX * 26, -2.2, 2.2) * lag;
    w.offsetY += clamp(ctx.turnY * 22, -1.8, 1.8) * lag;
    w.rotZ += clamp(-ctx.turnX * 1.6, -0.08, 0.08) * lag;

    // --- RECOIL: kicks back and up, then settles ---------------------------
    const kick = ctx.fire;
    w.offsetZ += kick * 2.4;
    w.offsetY += kick * 0.7;
    w.rotX = -kick * 0.16;
    // The charging handle rides back with the bolt.
    pose('chargingHandle').offsetZ = kick * 2.2;

    // --- RELOAD ------------------------------------------------------------
    if (ctx.reload > 0) {
      const r = ctx.reload;
      // Tip the weapon over to the left and drop it out of the sight line.
      const tilt = Math.sin(Math.PI * r); // 0 -> 1 -> 0 across the reload
      w.rotZ += tilt * 0.55;
      w.rotX += tilt * 0.3;
      w.offsetY -= tilt * 3.2;
      w.offsetX += tilt * 1.4;

      // The magazine drops out, is gone, then a fresh one goes up.
      const mag = pose('magazine');
      if (r < 0.3) {
        mag.offsetY = -(r / 0.3) * 14;
      } else if (r < 0.62) {
        mag.visible = false;
      } else {
        mag.offsetY = -(1 - (r - 0.62) / 0.38) * 14;
      }

      // The bolt is released at the end.
      if (r > 0.86) pose('chargingHandle').offsetZ = (1 - (r - 0.86) / 0.14) * 2.6;

      // The support hand follows the magazine down and back.
      pose('handFront').offsetY = -tilt * 5;
      pose('handFront').offsetZ = tilt * 7;
    }

    // The flash is owned by the system, which has the real shot timing; the
    // animator only guarantees it starts hidden each frame.
    pose('muzzleFlash').visible = false;
  },
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
