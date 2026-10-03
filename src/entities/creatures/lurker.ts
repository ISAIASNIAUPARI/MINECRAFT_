import { createStalkerBrain } from '../ai';
import type { CreatureDefinition, ModelPart, Rgb } from '../types';

/**
 * The Lurker — a vast cave spider that waits in the dark and blocks a tunnel.
 *
 * Built to the supplied reference. What carries the likeness:
 *
 *  1. **Legs that arch far above the body.** The knees sit higher than the
 *     abdomen, which is what reads as "spider" from any angle and in any light.
 *     Three segments a leg, eight legs, thick at the body and tapering to a
 *     point.
 *  2. **A cluster of unequal red eyes**, not two big ones. Eight of them in
 *     three rows across the face, the middle pair largest, all emissive.
 *  3. **Pale fangs under a black face.** The chelicerae are the only light
 *     thing on the creature apart from the eyes, so they read as teeth.
 *
 * Model units are 1/16 block. The origin is on the ground between its legs,
 * +Y is up and -Z is forward.
 *
 * Box budget: 52. Twenty-four of those are the legs, which are the silhouette
 * the brief asks to be readable in darkness, and they collapse to three shared
 * geometries because every leg is the same three boxes. The body is nine.
 */

const CHITIN: Rgb = [42, 38, 38];
const CHITIN_DARK: Rgb = [24, 21, 21];
const ABDOMEN: Rgb = [33, 29, 30];
const ASH: Rgb = [96, 90, 88];
const RUST: Rgb = [78, 30, 26];
const FANG: Rgb = [176, 168, 154];
const EYE: Rgb = [255, 30, 24];

/**
 * One leg: femur rising steeply out of the body, tibia dropping back down past
 * vertical, and a short tarsus tip on the floor. `spread` yaws the whole leg
 * fore or aft — positive points it forward — so four a side fan out properly
 * instead of stacking in a row.
 */
function leg(side: -1 | 1, index: 1 | 2 | 3 | 4, z: number, spread: number): ModelPart {
  const s = side;
  const tag = `${s < 0 ? 'L' : 'R'}${index}`;
  return {
    name: `femur${tag}`,
    size: [4.5, 23, 4.5],
    pivot: [s * 7, 14, z],
    // Rising out of the body: the box extends UP from its pivot, not down.
    origin: [-2.25, 0, -2.25],
    color: CHITIN,
    texture: 'spider_chitin',
    rotation: [0, s * spread, -s * 0.92],
    children: [
      {
        name: `tibia${tag}`,
        size: [3.5, 26, 3.5],
        pivot: [0, 23, 0],
        color: CHITIN_DARK,
        texture: 'spider_chitin_dark',
        // Swings back down past vertical, carrying the foot out beyond the knee.
        rotation: [0, 0, s * 1.74],
        children: [
          {
            name: `tarsus${tag}`,
            size: [2.25, 11, 2.25],
            pivot: [0, -26, 0],
            color: CHITIN_DARK,
            texture: 'spider_chitin_dark',
            rotation: [0, 0, -s * 0.5],
          },
        ],
      },
    ],
  };
}

/** One eye. Square, emissive, deliberately unequal in size. */
function eye(name: string, x: number, y: number, size: number): ModelPart {
  return {
    name,
    size: [size, size, 1],
    pivot: [x, y, -3.05],
    origin: [-size / 2, -size / 2, -1],
    color: EYE,
    emissive: true,
  };
}

/** Leg part names, precomputed so `animate` never allocates. */
const LEGS = ['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4'] as const;
const FEMURS = LEGS.map((t) => `femur${t}`);
const TIBIAS = LEGS.map((t) => `tibia${t}`);
/** Alternating tetrapod gait: these four swing while the other four plant. */
const PHASE_A = [0, 3, 5, 6];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const LURKER: CreatureDefinition = {
  name: 'voxelia:lurker',
  displayName: 'Lurker',

  // Wide enough to plug a tunnel; body carried at the player's chest.
  width: 2.6,
  height: 1.7,
  eyeHeight: 1.3,

  maxHealth: 34,
  moveSpeed: 6.2, // it scuttles — faster than a sprinting player
  jumpSpeed: 7,
  // Those legs span a block comfortably. Below 1.0 it cannot clear a single
  // ledge at all and ends up hopping in place against ordinary terrain.
  stepHeight: 1.15,

  attackDamage: 5,
  attackCooldown: 1.0,
  attackRange: 2.0,

  model: [
    leg(-1, 1, -7, 0.62),
    leg(-1, 2, -2, 0.22),
    leg(-1, 3, 3, -0.2),
    leg(-1, 4, 8, -0.58),
    leg(1, 1, -7, 0.62),
    leg(1, 2, -2, 0.22),
    leg(1, 3, 3, -0.2),
    leg(1, 4, 8, -0.58),
    {
      name: 'core',
      size: [0, 0, 0], // pivot only — the body hangs off it
      pivot: [0, 15, 0],
      color: CHITIN,
      children: [
        // Heavy bulbous abdomen at the back.
        {
          name: 'abdomen',
          size: [19, 15, 21],
          pivot: [0, 0, 11],
          origin: [-9.5, -7.5, -10.5],
          color: ABDOMEN,
          texture: 'spider_abdomen',
          children: [
            // Mottled plates, so the biggest mass is not one flat slab.
            {
              name: 'abdomenPlate',
              size: [13, 9, 1],
              pivot: [0, 3.5, -10.6],
              origin: [-6.5, -4.5, -1],
              color: ASH,
              texture: 'spider_ash',
            },
            {
              name: 'abdomenScar',
              size: [4, 11, 1],
              pivot: [0, 1, 10.6],
              origin: [-2, -5.5, 0],
              color: RUST,
              texture: 'spider_rust',
            },
          ],
        },
        // Smaller cephalothorax in front.
        {
          name: 'thorax',
          size: [14, 11, 14],
          pivot: [0, -0.5, -4],
          origin: [-7, -5.5, -7],
          color: CHITIN,
          texture: 'spider_chitin',
          children: [
            {
              name: 'thoraxPlate',
              size: [9, 1, 10],
              pivot: [0, 5.6, 0],
              origin: [-4.5, 0, -5],
              color: ASH,
              texture: 'spider_ash',
            },
            // The face: a flat black plate carrying the eye cluster.
            {
              name: 'face',
              size: [13, 10, 3],
              pivot: [0, -0.5, -7],
              origin: [-6.5, -5, -3],
              color: CHITIN_DARK,
              texture: 'spider_chitin_dark',
              children: [
                // Three rows, unequal: the middle pair dominate.
                eye('eye1', -2.3, 2.6, 3.2),
                eye('eye2', 2.3, 2.6, 3.2),
                eye('eye3', -5.4, 1.4, 2.2),
                eye('eye4', 5.4, 1.4, 2.2),
                eye('eye5', -2.6, -1.1, 2.4),
                eye('eye6', 2.6, -1.1, 2.4),
                eye('eye7', -5.6, -2.2, 1.6),
                eye('eye8', 5.6, -2.2, 1.6),

                // Chelicerae: dark angular jaws with pale fangs beneath, the
                // only light thing on the creature besides the eyes.
                {
                  name: 'jawL',
                  size: [4.5, 7, 4],
                  pivot: [-3, -4.5, -2.6],
                  color: CHITIN,
                  texture: 'spider_chitin',
                  rotation: [0.2, 0, 0.12],
                  children: [
                    {
                      name: 'fangL',
                      size: [2, 7, 2],
                      pivot: [0, -7, -0.5],
                      color: FANG,
                      texture: 'spider_fang',
                      rotation: [0.3, 0, 0.18],
                    },
                    {
                      name: 'fangL2',
                      size: [1.5, 5, 1.5],
                      pivot: [-1.6, -6.5, 0.5],
                      color: FANG,
                      texture: 'spider_fang',
                      rotation: [0.1, 0, 0.3],
                    },
                  ],
                },
                {
                  name: 'jawR',
                  size: [4.5, 7, 4],
                  pivot: [3, -4.5, -2.6],
                  color: CHITIN,
                  texture: 'spider_chitin',
                  rotation: [0.2, 0, -0.12],
                  children: [
                    {
                      name: 'fangR',
                      size: [2, 7, 2],
                      pivot: [0, -7, -0.5],
                      color: FANG,
                      texture: 'spider_fang',
                      rotation: [0.3, 0, -0.18],
                    },
                    {
                      name: 'fangR2',
                      size: [1.5, 5, 1.5],
                      pivot: [1.6, -6.5, 0.5],
                      color: FANG,
                      texture: 'spider_fang',
                      rotation: [0.1, 0, -0.3],
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
    const t = ctx.age + ctx.phase * 17;

    // --- DEATH: the body drops and the legs curl in over it ---------------
    if (ctx.dead) {
      const d = ctx.deathProgress;
      const curl = d * d;
      pose('core').offsetY = -curl * 11; // the body settles onto the floor
      for (let i = 0; i < 8; i++) {
        const s = i < 4 ? -1 : 1;
        // Femurs fold inward and tibias clench under them — the curled husk
        // a dead spider leaves behind.
        pose(FEMURS[i]).rotZ = s * curl * 0.75;
        pose(TIBIAS[i]).rotZ = -s * curl * 1.5;
        pose(FEMURS[i]).rotX = Math.sin(i * 1.7) * curl * 0.2;
      }
      pose('jawL').rotX = curl * 0.5;
      pose('jawR').rotX = curl * 0.5;
      return;
    }

    const moving = Math.min(ctx.speed / 6.2, 1);
    const running = Math.min(Math.max(ctx.speed - 2.5, 0) / 3.7, 1);

    // --- GAIT: alternating tetrapod, driven by distance -------------------
    // Four legs swing while four stay planted, then they trade. Half a cycle
    // apart is what makes eight legs look coordinated rather than random.
    const step = ctx.distance * 1.45;
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1;
      const groupA = PHASE_A.includes(i);
      const swing = Math.sin(step + (groupA ? 0 : Math.PI));
      const lift = Math.max(0, swing);

      // Reach fore and aft, and pick the foot up on the forward half only.
      pose(FEMURS[i]).rotY = swing * 0.3 * moving;
      pose(FEMURS[i]).rotZ = -s * lift * 0.26 * moving;
      pose(TIBIAS[i]).rotZ = s * lift * 0.34 * moving;

      // Idle: a slow twitch per leg, each offset, so a waiting spider is never
      // quite still. This is the tension the brief asks for.
      const twitch = Math.sin(t * 0.8 + i * 2.1);
      pose(FEMURS[i]).rotX += twitch * 0.035 * (1 - moving);
      pose(TIBIAS[i]).rotX += Math.sin(t * 1.1 + i * 1.3) * 0.03 * (1 - moving);
    }

    // --- BODY: low and bobbing, rearing up to strike ----------------------
    const a = ctx.attack;
    pose('core').offsetY = Math.sin(t * 1.2) * 0.5 * (1 - moving) + a * 5;
    pose('core').rotX = lerp(Math.sin(t * 0.9) * 0.012, -0.42, a); // rears up
    pose('core').rotZ = Math.sin(t * 0.7) * 0.02 * (1 - moving);
    pose('abdomen').rotX = -running * 0.1;
    pose('thorax').rotX = ctx.headPitch * 0.2 + a * 0.2;

    // Front legs leave the floor and strike with the rear-up.
    for (const i of [0, 4]) {
      const s = i < 4 ? -1 : 1;
      pose(FEMURS[i]).rotZ += -s * a * 0.55;
      pose(FEMURS[i]).rotX -= a * 0.8;
      pose(TIBIAS[i]).rotX -= a * 0.6;
    }

    // --- BITE: the chelicerae gape ----------------------------------------
    const gape = a * 0.75 + Math.max(0, Math.sin(t * 0.6) - 0.85) * 0.6;
    pose('jawL').rotZ = gape * 0.5;
    pose('jawR').rotZ = -gape * 0.5;
    pose('jawL').rotX = -gape * 0.35;
    pose('jawR').rotX = -gape * 0.35;

    // --- HURT: a sharp recoil, legs flinching inward ----------------------
    if (ctx.hurt > 0) {
      const h = ctx.hurt;
      pose('core').offsetZ = h * 3;
      pose('core').rotX += h * 0.25;
      for (let i = 0; i < 8; i++) {
        const s = i < 4 ? -1 : 1;
        pose(FEMURS[i]).rotZ += s * h * 0.2;
      }
    }
  },

  brain: (rng) =>
    createStalkerBrain(rng, {
      // Cave sightlines are short; it does not need to see far to own a tunnel.
      sightRange: 20,
      loseRange: 28,
      chaseThrottle: 1,
      wanderThrottle: 0.14, // mostly it waits
      memorySeconds: 10,
      // It will not follow you into the light. Carrying a torch is the counter.
      huntsInLightUpTo: 7,
    }),

  spawn: {
    maxLight: 3,
    maxY: 48, // underground
    minPlayerDistance: 12,
    maxPlayerDistance: 40,
    weight: 8,
    maxNearby: 3,
    groupMin: 1,
    groupMax: 2,
  },

  drops: [
    { item: 'voxelia:silkweb', min: 0, max: 2, chance: 0.6 },
    { item: 'voxelia:flint', min: 0, max: 1, chance: 0.3 },
  ],
};
