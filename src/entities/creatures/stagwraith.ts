import { createStalkerBrain } from '../ai';
import type { CreatureDefinition, ModelPart, Rgb } from '../types';

/**
 * The Stagwraith — a towering antlered revenant that stalks the night forest.
 *
 * Built to the supplied reference. Three things carry the likeness and each one
 * is worth boxes:
 *
 *  1. **Pale bone flesh with dark red weeping, not a black body.** The reference
 *     creature is a pallid tan thing streaked with old blood. Flat uniform
 *     colour is what makes voxel models read as a pile of cubes, so every large
 *     mass is segmented into two or three slabs of shifting tone, and the gore
 *     runs down the chest and arms as its own thin plates.
 *  2. **Heavy arms, not sticks.** They hang nearly to the ground, thick at the
 *     shoulder, ending in broad hands with four long tapering claws.
 *  3. **A recessed face.** Deep dark sockets with the eyes burning inside them,
 *     and a long black gash down the muzzle — not eyes pasted onto a cube.
 *
 * Model units are 1/16 block. The origin is between its feet, +Y is up and
 * -Z is forward.
 *
 * Box budget: 56, far past the ~20 the standard asks you to justify. The
 * justification is that this is a rare solitary set-piece (maxNearby 1), that
 * every box is silhouette or tonal break rather than detail nobody sees, and
 * that heavy size and colour reuse keeps it to 24 geometries and 11 colours —
 * so it costs the shared caches almost nothing even though it is elaborate.
 */

// --- palette, read off the reference ---------------------------------------
// Pallid flesh up top, darkening down the legs, with old blood as the accent.
const FLESH: Rgb = [206, 184, 150];
const FLESH_MID: Rgb = [176, 152, 120];
const FLESH_LOW: Rgb = [138, 115, 90];
const BONE: Rgb = [224, 212, 188];
const BONE_MID: Rgb = [186, 172, 146];
const ANTLER_AGED: Rgb = [150, 126, 98];
const GORE: Rgb = [104, 38, 32];
const GORE_DEEP: Rgb = [66, 24, 22];
const LIMB_DARK: Rgb = [58, 44, 38];
const LIMB_DARKER: Rgb = [34, 26, 23];
const VOID: Rgb = [9, 7, 7];
const EYE: Rgb = [255, 52, 34];

/**
 * One antler. Bone-pale at the base, darkening to blood at the tips, with six
 * segments a side so the rack reads as branched rather than as a fork.
 */
function antler(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  return {
    name: `antler${tag}`,
    size: [2.5, 15, 2.5],
    pivot: [s * 3.2, 12, 1],
    origin: [-1.25, 0, -1.25],
    color: BONE_MID,
    texture: 'wraith_bone_shade',
    rotation: [0.1, 0, s * 0.34],
    children: [
      // Low tine, raking forward over the brow.
      {
        name: `antler${tag}_t1`,
        size: [1.75, 9, 1.75],
        pivot: [0, 4.5, 0],
        origin: [-0.875, 0, -0.875],
        color: BONE_MID,
        texture: 'wraith_bone_shade',
        rotation: [-0.58, 0, s * 0.28],
      },
      // Mid tine, kicking back.
      {
        name: `antler${tag}_t2`,
        size: [1.5, 8, 1.5],
        pivot: [0, 10, 0],
        origin: [-0.75, 0, -0.75],
        color: ANTLER_AGED,
        texture: 'wraith_antler',
        rotation: [0.36, 0, s * 0.3],
      },
      {
        name: `antler${tag}_mid`,
        size: [2, 13, 2],
        pivot: [0, 15, 0],
        origin: [-1, 0, -1],
        color: ANTLER_AGED,
        texture: 'wraith_antler',
        rotation: [-0.14, 0, s * 0.26],
        children: [
          {
            name: `antler${tag}_t3`,
            size: [1.5, 8, 1.5],
            pivot: [0, 4, 0],
            origin: [-0.75, 0, -0.75],
            color: ANTLER_AGED,
            texture: 'wraith_antler',
            rotation: [-0.46, 0, s * 0.14],
          },
          {
            name: `antler${tag}_t4`,
            size: [1.5, 7, 1.5],
            pivot: [0, 9, 0],
            origin: [-0.75, 0, -0.75],
            color: GORE_DEEP,
            texture: 'wraith_gore_deep',
            rotation: [0.42, 0, s * 0.34],
          },
          {
            name: `antler${tag}_tip`,
            size: [1.5, 10, 1.5],
            pivot: [0, 13, 0],
            origin: [-0.75, 0, -0.75],
            color: GORE_DEEP,
            texture: 'wraith_gore_deep',
            rotation: [0.04, 0, s * 0.14],
          },
        ],
      },
    ],
  };
}

/**
 * One arm. Thick at the shoulder, tapering through the forearm to a broad hand
 * with four long claws, and hanging nearly to the ground. A gore plate runs
 * down the upper arm so it is not one flat slab of colour.
 */
function arm(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  const claw = (i: number, dx: number, len: number, rotZ: number): ModelPart => ({
    name: `finger${tag}${i}`,
    size: [2.25, len, 2.25],
    pivot: [dx, -7, -1],
    color: LIMB_DARKER,
    texture: 'wraith_limb_dark',
    rotation: [0.14, 0, rotZ],
  });
  return {
    name: `arm${tag}`,
    size: [6, 24, 5.5],
    pivot: [s * 9, 5, 0.5],
    color: FLESH_MID,
    texture: 'wraith_flesh_mid',
    children: [
      // Old blood weeping down the outside of the upper arm.
      {
        name: `armGore${tag}`,
        size: [1.5, 15, 5.9],
        pivot: [s * 2.4, -3, 0],
        origin: [-0.75, 0, -3.2],
        color: GORE_DEEP,
        texture: 'wraith_gore_deep',
      },
      {
        name: `forearm${tag}`,
        size: [5, 23, 4.5],
        pivot: [0, -24, 0],
        color: FLESH_LOW,
        texture: 'wraith_flesh_low',
        children: [
          {
            name: `forearmGore${tag}`,
            size: [1.25, 11, 4.7],
            pivot: [s * 2, -4, 0],
            origin: [-0.625, 0, -2.6],
            color: GORE_DEEP,
            texture: 'wraith_gore_deep',
          },
          {
            name: `hand${tag}`,
            size: [7, 7, 5],
            pivot: [0, -23, 0],
            color: LIMB_DARK,
            texture: 'wraith_limb',
            children: [
              claw(1, s * -2.4, 13, 0.3 * s),
              claw(2, s * -0.8, 15, 0.1 * s),
              claw(3, s * 0.8, 14, -0.08 * s),
              claw(4, s * 2.4, 11, -0.26 * s),
            ],
          },
        ],
      },
    ],
  };
}

/** One leg: dark, heavy-footed, the least lit part of the creature. */
function leg(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  return {
    name: `thigh${tag}`,
    size: [5.5, 16, 5.5],
    pivot: [s * 3.5, 40, 0],
    color: LIMB_DARK,
    texture: 'wraith_limb',
    children: [
      {
        name: `shin${tag}`,
        size: [4.5, 21, 4.5],
        pivot: [0, -16, 0],
        color: LIMB_DARKER,
        texture: 'wraith_limb_dark',
        children: [
          {
            name: `foot${tag}`,
            size: [6.5, 3.5, 11],
            pivot: [0, -21, 0],
            origin: [-3.25, -3.5, -8],
            color: LIMB_DARKER,
            texture: 'wraith_limb_dark',
          },
        ],
      },
    ],
  };
}

/** Claws are posed by name; precomputed so `animate` never allocates. */
const CLAWS_L = ['fingerL1', 'fingerL2', 'fingerL3', 'fingerL4'] as const;
const CLAWS_R = ['fingerR1', 'fingerR2', 'fingerR3', 'fingerR4'] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const STAGWRAITH: CreatureDefinition = {
  name: 'voxelia:stagwraith',
  displayName: 'Stagwraith',

  width: 1.1,
  height: 5.0,
  eyeHeight: 4.7,

  maxHealth: 60,
  moveSpeed: 5.4,
  jumpSpeed: 9,
  stepHeight: 1.2,

  attackDamage: 7,
  attackCooldown: 1.6,
  attackRange: 2.8,

  model: [
    leg(-1),
    leg(1),
    {
      name: 'hips',
      size: [9, 6, 6.5],
      pivot: [0, 45, 0],
      origin: [-4.5, 0, -3.25],
      color: FLESH_LOW,
      texture: 'wraith_flesh_low',
      // The permanent stoop. Everything above the hips inherits it.
      rotation: [-0.2, 0, 0],
      children: [
        // Torso in two slabs: a lower waist and an upper ribcage, each a
        // different tone. One tall box of one colour is what reads as a crate.
        {
          name: 'torso',
          size: [7, 9, 5],
          pivot: [0, 6, 0],
          origin: [-3.5, 0, -2.5],
          color: FLESH_MID,
          texture: 'wraith_flesh_mid',
          children: [
            {
              name: 'ribs',
              size: [9, 10, 5.5],
              pivot: [0, 9, 0],
              origin: [-4.5, 0, -2.75],
              color: FLESH,
              texture: 'wraith_flesh',
              children: [
                // Blood weeping down the sternum.
                {
                  name: 'sternumGore',
                  size: [4.5, 16, 1],
                  pivot: [0, -6, -2.8],
                  origin: [-2.25, 0, -1],
                  color: GORE,
                  texture: 'wraith_gore',
                },
                {
                  name: 'chest',
                  size: [11, 8, 6],
                  pivot: [0, 10, 0],
                  origin: [-5.5, 0, -3],
                  color: FLESH,
                  texture: 'wraith_flesh',
                  children: [
                    // Hunched shoulder mass — the cowl of the reference.
                    {
                      name: 'shoulders',
                      size: [13.5, 5, 6.5],
                      pivot: [0, 8, 0.5],
                      origin: [-6.75, 0, -3.25],
                      color: FLESH_LOW,
                      texture: 'wraith_flesh_low',
                      rotation: [0.16, 0, 0],
                    },
                    arm(-1),
                    arm(1),
                    {
                      name: 'neck',
                      size: [5, 6, 5],
                      pivot: [0, 7.5, -2],
                      origin: [-2.25, 0, -2.25],
                      color: BONE_MID,
                      texture: 'wraith_bone_shade',
                      // Juts forward, so the head hangs ahead of the shoulders.
                      rotation: [0.42, 0, 0],
                      children: [
                        {
                          name: 'skull',
                          size: [12, 12, 11],
                          pivot: [0, 6, 0],
                          origin: [-6, 0, -5.5],
                          color: BONE,
                          texture: 'wraith_bone',
                          children: [
                            // Brow ridge, shading the sockets beneath it.
                            {
                              name: 'brow',
                              size: [12.5, 3, 2],
                              pivot: [0, 8, -5.5],
                              origin: [-6.25, 0, -2],
                              color: BONE_MID,
                              texture: 'wraith_bone_shade',
                            },
                            // Deep sockets. The eyes sit INSIDE these, which is
                            // what makes the face read as a skull.
                            {
                              name: 'socketL',
                              size: [3.5, 4, 2],
                              pivot: [-4.3, 5, -5.3],
                              origin: [-1.75, 0, -2],
                              color: VOID,
                              children: [
                                {
                                  name: 'eyeL',
                                  size: [2, 2, 0.9],
                                  pivot: [0, 1, -1.9],
                                  origin: [-1, 0, -0.9],
                                  color: EYE,
                                  emissive: true,
                                },
                              ],
                            },
                            {
                              name: 'socketR',
                              size: [3.5, 4, 2],
                              pivot: [4.3, 5, -5.3],
                              origin: [-1.75, 0, -2],
                              color: VOID,
                              children: [
                                {
                                  name: 'eyeR',
                                  size: [2, 2, 0.9],
                                  pivot: [0, 1, -1.9],
                                  origin: [-1, 0, -0.9],
                                  color: EYE,
                                  emissive: true,
                                },
                              ],
                            },
                            // Long muzzle in two tones.
                            {
                              name: 'snout',
                              size: [6, 7, 14],
                              pivot: [0, 1.5, -5.5],
                              origin: [-3, 0, -14],
                              color: BONE,
                              texture: 'wraith_bone',
                              children: [
                                // The black gash running down the face — the
                                // reference's defining feature after the rack.
                                {
                                  name: 'gash',
                                  size: [2.5, 5.5, 12],
                                  pivot: [0, 1.2, -1],
                                  origin: [-1.25, 0, -12],
                                  color: VOID,
                                },
                              ],
                            },
                            {
                              name: 'jaw',
                              size: [6.5, 3.5, 14],
                              pivot: [0, 1.5, -5.5],
                              origin: [-3.25, -3.5, -14],
                              color: BONE_MID,
                              texture: 'wraith_bone_shade',
                            },
                            antler(-1),
                            antler(1),
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],

  animatesDeath: true,

  animate: (pose, ctx) => {
    const t = ctx.age + ctx.phase * 13;

    // --- DEATH: folds at the hips and buckles, feet planted ---------------
    if (ctx.dead) {
      const d = ctx.deathProgress;
      const fall = d * d; // accelerating, so it drops rather than settles
      pose('hips').rotX = -fall * 1.45;
      pose('torso').rotX = -fall * 0.3;
      pose('neck').rotX = -fall * 0.5;
      pose('skull').rotX = fall * 0.9; // head lolls as the body goes down
      pose('thighL').rotX = fall * 1.15;
      pose('thighR').rotX = fall * 0.95; // asymmetric: a collapse, not a bow
      pose('shinL').rotX = -fall * 1.7;
      pose('shinR').rotX = -fall * 1.5;
      pose('armL').rotX = -fall * 0.7;
      pose('armR').rotX = -fall * 0.9;
      pose('armL').rotZ = fall * 0.55;
      pose('armR').rotZ = -fall * 0.55;
      return;
    }

    // --- GAIT: driven by distance, so it stays in step at any speed -------
    // Deliberately slow against its stride length, which is what makes the
    // walk read as wrong rather than merely slow.
    const gait = Math.sin(ctx.distance * 1.15);
    const moving = Math.min(ctx.speed / 5.4, 1);
    const running = Math.min(Math.max(ctx.speed - 2.6, 0) / 2.8, 1);

    pose('thighL').rotX = gait * (0.42 + running * 0.3) * moving;
    pose('thighR').rotX = -gait * (0.42 + running * 0.3) * moving;
    // Knees fold only on the backswing — a digitigrade hitch, not a human step.
    pose('shinL').rotX = -Math.max(0, -gait) * (0.75 + running * 0.5) * moving;
    pose('shinR').rotX = -Math.max(0, gait) * (0.75 + running * 0.5) * moving;

    // --- IDLE: slow sway, and a head that hangs and scans ------------------
    const breath = Math.sin(t * 0.55);
    pose('hips').rotZ = breath * 0.022;
    pose('torso').rotX = Math.sin(t * 0.43) * 0.028 - running * 0.2;
    pose('ribs').rotY = Math.sin(t * 0.37) * 0.04;
    pose('neck').rotX = -running * 0.22 + breath * 0.03;
    pose('skull').rotY = Math.sin(t * 0.29) * 0.14 * (1 - moving);
    pose('skull').rotX = ctx.headPitch * 0.4 + breath * 0.02;
    pose('jaw').rotX = -0.06 - Math.max(0, breath) * 0.12 - ctx.attack * 0.5; // maw gapes

    // --- ARMS: hang heavy, counter-swing, then thrust ---------------------
    const a = ctx.attack;
    const swing = -gait * (0.28 + running * 0.3) * moving;
    // +rotX reaches forward on a hanging limb; see PartPose for the convention.
    pose('armL').rotX = lerp(swing, 1.85, a);
    pose('armR').rotX = lerp(-swing, 1.85, a);
    pose('armL').rotZ = lerp(0.1, 0.32, a);
    pose('armR').rotZ = lerp(-0.1, -0.32, a);
    pose('forearmL').rotX = lerp(-0.2, 0.34, a);
    pose('forearmR').rotX = lerp(-0.2, 0.34, a);
    pose('hips').rotX = -a * 0.22; // leans into the swing

    // Claws curl idly and splay wide on the strike.
    for (let i = 0; i < 4; i++) {
      const twitch = Math.sin(t * 1.6 + i * 1.1) * 0.07;
      const spread = a * 0.4;
      pose(CLAWS_L[i]).rotX = twitch + a * 0.3;
      pose(CLAWS_R[i]).rotX = -twitch + a * 0.3;
      pose(CLAWS_L[i]).rotZ = (i - 1.5) * spread;
      pose(CLAWS_R[i]).rotZ = (i - 1.5) * -spread;
    }

    // --- HURT: a short recoil --------------------------------------------
    if (ctx.hurt > 0) {
      const h = ctx.hurt;
      pose('hips').rotX += h * 0.3;
      pose('neck').rotX += h * 0.3;
      pose('skull').rotX -= h * 0.45;
      pose('armL').rotX -= h * 0.5;
      pose('armR').rotX -= h * 0.5;
    }
  },

  brain: (rng) =>
    createStalkerBrain(rng, {
      // It towers over the canopy, so it sees far — and keeps coming.
      sightRange: 40,
      loseRange: 56,
      chaseThrottle: 1,
      wanderThrottle: 0.22,
      memorySeconds: 14,
    }),

  spawn: {
    biomes: ['voxelia:forest', 'voxelia:taiga'],
    maxLight: 4,
    minY: 40,
    minPlayerDistance: 34,
    maxPlayerDistance: 80,
    weight: 2, // rare — it is an event, not a population
    maxNearby: 1,
    groupMin: 1,
    groupMax: 1,
  },

  drops: [
    { item: 'voxelia:flint', min: 1, max: 3, chance: 0.9 },
    { item: 'voxelia:stick', min: 2, max: 5, chance: 0.7 },
  ],
};
