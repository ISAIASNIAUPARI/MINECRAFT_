import { createStalkerBrain } from '../ai';
import type { CreatureDefinition, ModelPart, Rgb } from '../types';

/**
 * The Stagwraith — a towering antlered revenant that stalks the night forest.
 *
 * Silhouette is the whole design: enormous + emaciated + deer skull + branching
 * antlers + arms that hang to the knees. It must be identifiable as a black
 * shape through fog, before any detail reads.
 *
 * Model units are 1/16 block. The origin is between its feet, +Y is up and
 * -Z is forward.
 *
 * Box budget: 36, over the ~20 the standard says to justify. The overage is
 * entirely silhouette: 8 go to the branching antlers and 6 to the long claws,
 * and those two features *are* the creature. Everything else is at minimum —
 * the torso is four boxes, each limb is three. 19 distinct sizes and 7 colours,
 * so a group still shares almost everything.
 */

// Palette: bone, aged antler, charred body, with red only on the eyes.
const BONE: Rgb = [216, 205, 180];
const BONE_SHADE: Rgb = [168, 155, 130];
const ANTLER: Rgb = [94, 64, 44];
const ANTLER_TIP: Rgb = [88, 36, 30];
const CHAR: Rgb = [44, 39, 37];
const CHAR_DARK: Rgb = [27, 24, 23];
const VOID: Rgb = [8, 7, 7];
const EYE: Rgb = [255, 42, 28];

/**
 * One antler: a beam that sweeps up and out through two segments, with tines
 * branching off it. Six boxes a side is the most expensive thing on this
 * creature and it is the right place to spend them — the rack is what makes
 * the silhouette unmistakable at distance, which the brief asks for by name.
 * Tips reach roughly +-1.5 blocks, so the rack spans about three blocks against
 * shoulders that are barely two thirds of one.
 */
function antler(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  return {
    name: `antler${tag}`,
    size: [2.5, 16, 2.5],
    pivot: [s * 4.5, 8, 0],
    origin: [-1.25, 0, -1.25],
    color: ANTLER,
    rotation: [0.16, 0, s * 0.5],
    children: [
      // Lower tine, raking forward over the brow.
      {
        name: `antler${tag}_t1`,
        size: [1.5, 9, 1.5],
        pivot: [0, 5, 0],
        origin: [-0.75, 0, -0.75],
        color: ANTLER,
        rotation: [-0.55, 0, s * 0.3],
      },
      // Upper tine, kicking back.
      {
        name: `antler${tag}_t2`,
        size: [1.5, 8, 1.5],
        pivot: [0, 11, 0],
        origin: [-0.75, 0, -0.75],
        color: ANTLER,
        rotation: [0.34, 0, s * 0.32],
      },
      // The beam continues, widening the rack.
      {
        name: `antler${tag}_mid`,
        size: [2, 13, 2],
        pivot: [0, 16, 0],
        origin: [-1, 0, -1],
        color: ANTLER,
        rotation: [-0.14, 0, s * 0.28],
        children: [
          {
            name: `antler${tag}_t3`,
            size: [1.5, 8, 1.5],
            pivot: [0, 4, 0],
            origin: [-0.75, 0, -0.75],
            color: ANTLER,
            rotation: [-0.44, 0, s * 0.14],
          },
          {
            name: `antler${tag}_tip`,
            size: [1.5, 10, 1.5],
            pivot: [0, 13, 0],
            origin: [-0.75, 0, -0.75],
            color: ANTLER_TIP,
            rotation: [0.06, 0, s * 0.16],
          },
        ],
      },
    ],
  };
}

/** One arm: upper, forearm, hand, three long claws. */
function arm(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  const claw = (i: number, dx: number, rotZ: number): ModelPart => ({
    name: `finger${tag}${i}`,
    size: [1.5, 11, 1.5],
    pivot: [dx, -6, -0.5],
    color: CHAR_DARK,
    rotation: [0.12, 0, rotZ],
  });
  return {
    name: `arm${tag}`,
    size: [4, 22, 4],
    pivot: [s * 7, 7, 0],
    color: CHAR,
    children: [
      {
        name: `forearm${tag}`,
        size: [3.5, 20, 3.5],
        pivot: [0, -22, 0],
        color: CHAR,
        children: [
          {
            name: `hand${tag}`,
            size: [5, 6, 3.5],
            pivot: [0, -20, 0],
            color: CHAR_DARK,
            children: [claw(1, s * -1.5, 0.18 * s), claw(2, 0, 0), claw(3, s * 1.5, -0.14 * s)],
          },
        ],
      },
    ],
  };
}

/** One leg: thigh, shin, foot. */
function leg(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  return {
    name: `thigh${tag}`,
    size: [5, 16, 5],
    pivot: [s * 3.5, 40, 0],
    color: CHAR,
    children: [
      {
        name: `shin${tag}`,
        size: [4, 21, 4],
        pivot: [0, -16, 0],
        color: CHAR,
        children: [
          {
            name: `foot${tag}`,
            size: [6, 3, 10],
            pivot: [0, -21, 0],
            // Splayed forward, so it reads as a hoof-foot rather than a human one.
            origin: [-3, -3, -7],
            color: CHAR_DARK,
          },
        ],
      },
    ],
  };
}

/** Fingers are posed by name; precomputed so `animate` never allocates. */
const CLAWS_L = ['fingerL1', 'fingerL2', 'fingerL3'] as const;
const CLAWS_R = ['fingerR1', 'fingerR2', 'fingerR3'] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const STAGWRAITH: CreatureDefinition = {
  name: 'voxelia:stagwraith',
  displayName: 'Stagwraith',

  // ~5 blocks to the crown of the skull, antlers above that: 2.8x the player.
  width: 1.0,
  height: 5.0,
  eyeHeight: 4.7,

  maxHealth: 60,
  moveSpeed: 5.4, // long legs — it runs down a sprinting player
  jumpSpeed: 9,
  stepHeight: 1.2, // strides over terrain a smaller creature would hop

  attackDamage: 7,
  attackCooldown: 1.6,
  attackRange: 2.6, // those arms reach much further than its hitbox suggests

  model: [
    leg(-1),
    leg(1),
    {
      name: 'hips',
      size: [8, 5, 6],
      pivot: [0, 45, 0],
      origin: [-4, 0, -3],
      color: CHAR,
      // The permanent stoop. Everything above the hips inherits it.
      rotation: [-0.16, 0, 0],
      children: [
        {
          name: 'torso',
          size: [6, 15, 4.5],
          pivot: [0, 5, 0],
          origin: [-3, 0, -2.25],
          color: CHAR,
          children: [
            {
              name: 'chest',
              size: [11, 10, 6],
              pivot: [0, 15, 0],
              origin: [-5.5, 0, -3],
              color: CHAR,
              children: [
                arm(-1),
                arm(1),
                {
                  name: 'neck',
                  size: [4, 4, 4],
                  pivot: [0, 10, -0.5],
                  origin: [-2, 0, -2],
                  color: BONE_SHADE,
                  children: [
                    {
                      name: 'skull',
                      size: [10, 10, 9],
                      pivot: [0, 4, 0],
                      origin: [-5, 0, -4.5],
                      color: BONE,
                      children: [
                        // Elongated muzzle — the deer read.
                        {
                          name: 'snout',
                          size: [6, 6, 12],
                          pivot: [0, 1.5, -4.5],
                          origin: [-3, 0, -12],
                          color: BONE,
                        },
                        {
                          name: 'jaw',
                          size: [5, 3, 12],
                          pivot: [0, 1.5, -4.5],
                          origin: [-2.5, -3, -12],
                          color: BONE_SHADE,
                        },
                        // The void where a mouth should be.
                        {
                          name: 'maw',
                          size: [5, 5, 1],
                          pivot: [0, 1.6, -4.6],
                          origin: [-2.5, 0, -1],
                          color: VOID,
                        },
                        // Sunk into the sockets, proud of the face so they never z-fight.
                        {
                          name: 'eyeL',
                          size: [1.75, 1.75, 1],
                          pivot: [-2.8, 6, -4.65],
                          origin: [-0.875, 0, -1],
                          color: EYE,
                          emissive: true,
                        },
                        {
                          name: 'eyeR',
                          size: [1.75, 1.75, 1],
                          pivot: [2.8, 6, -4.65],
                          origin: [-0.875, 0, -1],
                          color: EYE,
                          emissive: true,
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

  animatesDeath: true,

  animate: (pose, ctx) => {
    const t = ctx.age + ctx.phase * 13;

    // --- DEATH: folds at the hips and buckles, feet planted ---------------
    if (ctx.dead) {
      const d = ctx.deathProgress;
      const fall = d * d; // accelerating, so it drops rather than settles
      pose('hips').rotX = -fall * 1.45;
      pose('torso').rotX = -fall * 0.35;
      pose('skull').rotX = fall * 0.8; // head lolls back as the body goes down
      pose('thighL').rotX = fall * 1.15;
      pose('thighR').rotX = fall * 0.95; // asymmetric: a collapse, not a bow
      pose('shinL').rotX = -fall * 1.7;
      pose('shinR').rotX = -fall * 1.5;
      pose('armL').rotX = fall * 0.9;
      pose('armR').rotX = fall * 1.1;
      pose('armL').rotZ = fall * 0.5;
      pose('armR').rotZ = -fall * 0.5;
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

    // --- IDLE: slow sway and a head that scans ----------------------------
    const breath = Math.sin(t * 0.55);
    pose('hips').rotZ = breath * 0.022;
    pose('torso').rotX = Math.sin(t * 0.43) * 0.028 - running * 0.22; // deeper stoop at a run
    pose('chest').rotY = Math.sin(t * 0.37) * 0.05;
    pose('skull').rotY = Math.sin(t * 0.29) * 0.14 * (1 - moving);
    pose('skull').rotX = ctx.headPitch * 0.45 + breath * 0.02;

    // --- ARMS: hang, counter-swing, then thrust ---------------------------
    const a = ctx.attack;
    const swing = -gait * (0.3 + running * 0.35) * moving;
    // Both arms drive forward together — the lunge in the reference.
    // +rotX on a hanging limb reaches forward; negative would throw them skyward.
    pose('armL').rotX = lerp(swing, 1.85, a);
    pose('armR').rotX = lerp(-swing, 1.85, a);
    pose('armL').rotZ = lerp(0.07, 0.3, a);
    pose('armR').rotZ = lerp(-0.07, -0.3, a);
    pose('forearmL').rotX = lerp(-0.16, 0.34, a);
    pose('forearmR').rotX = lerp(-0.16, 0.34, a);
    pose('hips').rotX = -a * 0.22; // leans into the swing

    // Claws curl idly and splay wide on the strike.
    for (let i = 0; i < 3; i++) {
      const twitch = Math.sin(t * 1.6 + i * 1.1) * 0.07;
      const spread = a * 0.42;
      pose(CLAWS_L[i]).rotX = twitch + a * 0.25;
      pose(CLAWS_R[i]).rotX = -twitch + a * 0.25;
      pose(CLAWS_L[i]).rotZ = (i - 1) * spread;
      pose(CLAWS_R[i]).rotZ = (i - 1) * -spread;
    }

    // --- HURT: a short recoil --------------------------------------------
    if (ctx.hurt > 0) {
      const h = ctx.hurt;
      pose('hips').rotX += h * 0.3;
      pose('skull').rotX -= h * 0.45;
      pose('armL').rotX += h * 0.5;
      pose('armR').rotX += h * 0.5;
    }
  },

  brain: (rng) =>
    createStalkerBrain(rng, {
      // It towers over the canopy, so it sees far — and keeps coming.
      sightRange: 40,
      loseRange: 56,
      chaseThrottle: 1,
      wanderThrottle: 0.22, // drifts slowly when it has not found you
      memorySeconds: 14, // a very long memory: it hunts where you were
    }),

  spawn: {
    biomes: ['voxelia:forest', 'voxelia:taiga'],
    maxLight: 4,
    minY: 40,
    minPlayerDistance: 34, // never materialises in view
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
