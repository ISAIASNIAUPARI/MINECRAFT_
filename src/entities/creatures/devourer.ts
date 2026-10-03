import { createStalkerBrain } from '../ai';
import type { CreatureDefinition, ModelPart, Rgb } from '../types';

/**
 * The Devourer — a colossal obsidian humanoid being eaten from the inside by a
 * dimensional rift in its own chest.
 *
 * Built to the supplied reference. What carries it:
 *
 *  1. **The core.** A bright violet tear in the sternum, with the torso plates
 *     around it visibly coming apart. It is the one bright thing on an
 *     otherwise black creature, so it reads at any distance and in any light.
 *  2. **Arms that fall past the knees** into huge hands with four long curling
 *     fingers, hanging almost to the floor at rest.
 *  3. **A blank cubic head**, tall and featureless but for a thin violet
 *     fracture where a face should be. No eyes.
 *  4. **Corruption shards** orbiting the chest, fading in and out.
 *
 * Model units are 1/16 block. The origin is between its feet, +Y is up and
 * -Z is forward.
 *
 * Box budget: 61. The fingers are 16 of them and the core and its shards are
 * 14; both are named in the brief as the identity of the creature. Reuse keeps
 * it to 25 geometries and 12 colours.
 *
 * Deliberately NOT built, per the brief's own "do not build a system the game
 * does not need yet": the ranged core discharge (no projectile system exists)
 * and the audio cues (no audio system exists). The shards are fixed model parts
 * animated by visibility rather than a particle system — bounded by
 * construction, so there is nothing to pool.
 */

const OBSIDIAN: Rgb = [22, 19, 30];
const OBSIDIAN_LIT: Rgb = [40, 33, 54];
const CHAR: Rgb = [30, 27, 36];
const VOID: Rgb = [48, 24, 72];
const CORRUPT: Rgb = [92, 40, 140];
const CORE: Rgb = [198, 92, 255];
const CORE_HOT: Rgb = [240, 186, 255];

/**
 * One arm: upper, forearm (slightly the longer of the two, as the brief asks),
 * a broad palm, and four curling fingers of two segments each.
 */
function arm(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  const finger = (i: number, dx: number, len: number, curl: number): ModelPart => ({
    name: `finger${tag}${i}`,
    size: [2, len, 2],
    pivot: [dx, -4, -1.5],
    color: OBSIDIAN,
    texture: 'devourer_obsidian',
    rotation: [curl, 0, 0],
    children: [
      {
        name: `finger${tag}${i}b`,
        size: [1.75, len - 2, 1.75],
        pivot: [0, -len, 0],
        color: OBSIDIAN,
        texture: 'devourer_obsidian',
        // Hooks further forward, so the hand reads as a claw at rest.
        rotation: [curl * 1.4, 0, 0],
      },
    ],
  });
  return {
    name: `arm${tag}`,
    size: [6.5, 24, 6],
    pivot: [s * 9, 4, 0],
    // Lighter than the trunk on purpose. Without a rim light, an obsidian arm
    // on an obsidian torso is invisible, and these arms are half the silhouette.
    color: OBSIDIAN_LIT,
    texture: 'devourer_obsidian_lit',
    children: [
      // A seam of corruption running the length of the upper arm.
      {
        name: `armSeam${tag}`,
        size: [1.2, 19, 6.2],
        pivot: [s * 2.8, -2.5, 0],
        // Runs DOWN the arm. With origin y at 0 the box grows upward instead
        // and the seams stand off the shoulders like antennae.
        origin: [-0.6, -19, -3.1],
        color: VOID,
        emissive: true,
      },
      {
        name: `forearm${tag}`,
        size: [5.5, 27, 5],
        pivot: [0, -24, 0],
        color: CHAR,
        texture: 'devourer_char',
        children: [
          // A seam of corruption at the elbow.
          {
            name: `elbowGlow${tag}`,
            size: [5.7, 2, 5.2],
            pivot: [0, -1, 0],
            origin: [-2.85, -2, -2.6],
            color: CORRUPT,
            emissive: true,
          },
          {
            name: `hand${tag}`,
            size: [8, 8, 5],
            pivot: [0, -27, 0],
            color: OBSIDIAN_LIT,
            texture: 'devourer_obsidian_lit',
            children: [
              finger(1, -2.4, 13, 0.26),
              finger(2, -0.8, 15, 0.16),
              finger(3, 0.8, 14, 0.12),
              finger(4, 2.4, 11, 0.3),
            ],
          },
        ],
      },
    ],
  };
}

/** One leg: long, stiff, deliberately plain — the brief asks for no detail here. */
function leg(side: -1 | 1): ModelPart {
  const s = side;
  const tag = s < 0 ? 'L' : 'R';
  return {
    name: `thigh${tag}`,
    size: [5, 16, 5],
    pivot: [s * 3.5, 42, 0],
    color: OBSIDIAN,
    texture: 'devourer_obsidian',
    children: [
      {
        name: `shin${tag}`,
        size: [4, 23, 4],
        pivot: [0, -16, 0],
        color: OBSIDIAN,
        texture: 'devourer_obsidian',
        children: [
          {
            name: `foot${tag}`,
            size: [5.5, 3, 9],
            pivot: [0, -23, 0],
            origin: [-2.75, -3, -6.5],
            color: CHAR,
            texture: 'devourer_char',
          },
        ],
      },
    ],
  };
}

/** A corruption shard orbiting the chest. */
function shard(i: number, x: number, y: number, z: number, size: number): ModelPart {
  return {
    name: `shard${i}`,
    size: [size, size, size],
    pivot: [x, y, z],
    origin: [-size / 2, -size / 2, -size / 2],
    color: i % 2 === 0 ? CORRUPT : CORE,
    emissive: true,
  };
}

/** Precomputed names so `animate` never allocates. */
const FINGERS_L = ['fingerL1', 'fingerL2', 'fingerL3', 'fingerL4'] as const;
const FINGERS_R = ['fingerR1', 'fingerR2', 'fingerR3', 'fingerR4'] as const;
const SHARDS = ['shard0', 'shard1', 'shard2', 'shard3', 'shard4', 'shard5'] as const;
/** Torso plates that drift apart around the rift, and fly off on death. */
const PLATES = ['plateTL', 'plateTR', 'plateBL', 'plateBR'] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const DEVOURER: CreatureDefinition = {
  name: 'voxelia:devourer',
  displayName: 'Devourer',

  width: 1.1,
  height: 5.6, // ~3x the player
  eyeHeight: 5.2,

  maxHealth: 90,
  moveSpeed: 3.6, // it never hurries; it simply does not stop
  jumpSpeed: 8.5,
  stepHeight: 1.25,

  attackDamage: 9,
  attackCooldown: 1.9,
  attackRange: 3.2, // those arms reach far past its hitbox

  model: [
    leg(-1),
    leg(1),
    {
      name: 'hips',
      size: [9, 6, 6],
      pivot: [0, 47, 0],
      origin: [-4.5, 0, -3],
      color: OBSIDIAN,
      texture: 'devourer_obsidian',
      rotation: [-0.12, 0, 0], // the slight permanent forward lean
      children: [
        {
          name: 'torso',
          size: [10, 16, 6],
          pivot: [0, 6, 0],
          origin: [-5, 0, -3],
          color: OBSIDIAN,
          texture: 'devourer_obsidian',
          children: [
            // --- the rift -------------------------------------------------
            // Layered: a hot centre inside a violet tear inside a dim halo, so
            // the glow has depth instead of being one flat square.
            {
              name: 'rift',
              size: [7, 9, 1],
              pivot: [0, 9, -3.05],
              origin: [-3.5, -4.5, -1],
              color: VOID,
              emissive: true,
              children: [
                {
                  name: 'riftInner',
                  size: [4.5, 6, 0.8],
                  pivot: [0, 0, -0.9],
                  origin: [-2.25, -3, -0.8],
                  color: CORE,
                  emissive: true,
                },
                {
                  name: 'riftHot',
                  size: [2.2, 3.2, 0.6],
                  pivot: [0, 0.4, -1.5],
                  origin: [-1.1, -1.6, -0.6],
                  color: CORE_HOT,
                  emissive: true,
                },
                // Flares the animator toggles, so the core pulses without
                // mutating a shared material.
                {
                  name: 'riftFlareA',
                  size: [9.5, 3, 0.5],
                  pivot: [0, 0, -1.8],
                  origin: [-4.75, -1.5, -0.5],
                  color: CORRUPT,
                  emissive: true,
                },
                {
                  name: 'riftFlareB',
                  size: [3, 12, 0.5],
                  pivot: [0, 0, -1.8],
                  origin: [-1.5, -6, -0.5],
                  color: CORRUPT,
                  emissive: true,
                },
              ],
            },
            // Torso plates lifting away from the rift.
            {
              name: 'plateTL',
              size: [4, 6, 1.5],
              pivot: [-5, 12, -3],
              origin: [-4, -3, -1.5],
              color: OBSIDIAN_LIT,
              texture: 'devourer_obsidian_lit',
            },
            {
              name: 'plateTR',
              size: [4, 6, 1.5],
              pivot: [5, 12, -3],
              origin: [0, -3, -1.5],
              color: OBSIDIAN_LIT,
              texture: 'devourer_obsidian_lit',
            },
            {
              name: 'plateBL',
              size: [3.5, 5, 1.5],
              pivot: [-4.5, 5, -3],
              origin: [-3.5, -2.5, -1.5],
              color: CHAR,
              texture: 'devourer_char',
            },
            {
              name: 'plateBR',
              size: [3.5, 5, 1.5],
              pivot: [4.5, 5, -3],
              origin: [0, -2.5, -1.5],
              color: CHAR,
              texture: 'devourer_char',
            },
            // Shards orbiting the chest.
            shard(0, -8, 14, -4, 1.8),
            shard(1, 8, 11, -4.5, 1.4),
            shard(2, -7, 5, -5, 1.2),
            shard(3, 7, 17, -3.5, 1.6),
            shard(4, 0, 20, -5.5, 1.3),
            shard(5, -5, 19, -4, 1.1),

            {
              name: 'chest',
              size: [14, 9, 7],
              pivot: [0, 16, 0],
              origin: [-7, 0, -3.5],
              color: OBSIDIAN,
              texture: 'devourer_obsidian',
              children: [
                arm(-1),
                arm(1),
                {
                  name: 'neck',
                  size: [4, 3, 4],
                  pivot: [0, 9, 0],
                  origin: [-2, 0, -2],
                  color: CHAR,
                  texture: 'devourer_char',
                  children: [
                    {
                      name: 'head',
                      size: [10, 13, 9.5], // tall, cubic, blank
                      pivot: [0, 3, 0],
                      origin: [-5, 0, -5],
                      color: OBSIDIAN,
                      texture: 'devourer_obsidian',
                      children: [
                        // The only thing where a face would be: a thin fracture.
                        {
                          name: 'faceCrack',
                          size: [1.4, 9, 0.6],
                          pivot: [0, 4, -5.05],
                          origin: [-0.7, 0, -0.6],
                          color: CORE,
                          emissive: true,
                        },
                        {
                          name: 'headCrackA',
                          size: [3.5, 0.9, 0.5],
                          pivot: [-2.6, 11.5, -5.05],
                          origin: [-1.75, 0, -0.5],
                          color: CORRUPT,
                          emissive: true,
                        },
                        {
                          name: 'headCrackB',
                          size: [0.9, 4, 0.5],
                          pivot: [4.2, 6, -5.05],
                          origin: [-0.45, 0, -0.5],
                          color: CORRUPT,
                          emissive: true,
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
    const t = ctx.age + ctx.phase * 23;

    // --- DEATH: the core floods, the body comes apart, then it all goes ----
    if (ctx.dead) {
      const d = ctx.deathProgress;
      const burst = Math.min(1, d * 2.2); // core floods first
      const fly = d * d; // then the body lets go

      // Everything that glows swells, then cuts out at the very end.
      const gone = d > 0.88;
      pose('riftFlareA').visible = !gone;
      pose('riftFlareB').visible = !gone;
      pose('riftHot').visible = !gone;
      pose('riftInner').visible = !gone;
      pose('rift').visible = !gone;
      pose('faceCrack').visible = !gone;
      pose('riftFlareA').offsetX = burst * 2;
      pose('riftFlareB').offsetY = burst * 3;

      // Plates and shards blow outward and wink out one by one.
      PLATES.forEach((name, i) => {
        const dir = i % 2 === 0 ? -1 : 1;
        pose(name).offsetX = dir * fly * 16;
        pose(name).offsetY = (i < 2 ? 1 : -1) * fly * 10;
        pose(name).offsetZ = -fly * 12;
        pose(name).visible = d < 0.6 + i * 0.1;
      });
      SHARDS.forEach((name, i) => {
        const a = i * 1.05;
        pose(name).offsetX = Math.cos(a) * fly * 30;
        pose(name).offsetY = Math.sin(a) * fly * 22;
        pose(name).offsetZ = -fly * 14;
        pose(name).visible = d < 0.5 + i * 0.08;
      });

      // The frame folds under itself.
      pose('hips').rotX = -fly * 1.2;
      pose('torso').rotX = -fly * 0.4;
      pose('head').rotX = fly * 0.7;
      pose('thighL').rotX = fly * 1.0;
      pose('thighR').rotX = fly * 0.8;
      pose('shinL').rotX = -fly * 1.5;
      pose('shinR').rotX = -fly * 1.3;
      pose('armL').rotZ = fly * 0.6;
      pose('armR').rotZ = -fly * 0.6;
      return;
    }

    const moving = Math.min(ctx.speed / 3.6, 1);
    const chasing = Math.min(Math.max(ctx.speed - 1.2, 0) / 2.4, 1);

    // --- CORE: a slow pulse, brighter as it closes in ---------------------
    // Emissive colour lives on a shared material, so the pulse is done with
    // visibility and offsets rather than by mutating it.
    const pulse = Math.sin(t * 1.15) * 0.5 + 0.5;
    const charge = Math.min(1, pulse * 0.6 + chasing * 0.5 + ctx.attack * 0.6);
    pose('riftFlareA').visible = charge > 0.45;
    pose('riftFlareB').visible = charge > 0.68;
    pose('riftHot').offsetZ = -charge * 0.5;
    pose('riftInner').offsetZ = -charge * 0.3;
    pose('faceCrack').visible = charge > 0.25;

    // Plates breathe away from the rift as it brightens.
    PLATES.forEach((name, i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      pose(name).offsetX = dir * (0.6 + charge * 1.6);
      pose(name).offsetZ = -charge * 0.9;
      pose(name).rotZ = dir * charge * 0.1;
    });

    // --- SHARDS: drift in slow orbits, fading in and out ------------------
    for (let i = 0; i < 6; i++) {
      const a = t * (0.35 + i * 0.07) + i * 1.9;
      pose(SHARDS[i]).offsetX = Math.cos(a) * (1.6 + i * 0.3);
      pose(SHARDS[i]).offsetY = Math.sin(a * 1.3) * (1.8 + i * 0.25);
      pose(SHARDS[i]).offsetZ = Math.sin(a * 0.8) * 1.2;
      // Controlled appearance rather than a particle system: each shard has its
      // own slow duty cycle, so the cloud shifts without anything spawning.
      pose(SHARDS[i]).visible = Math.sin(t * 0.55 + i * 1.4) > -0.35;
    }

    // --- GAIT: slow, heavy and stiff --------------------------------------
    const gait = Math.sin(ctx.distance * 0.95);
    pose('thighL').rotX = gait * 0.38 * moving;
    pose('thighR').rotX = -gait * 0.38 * moving;
    // Knees barely bend. The brief asks for unnaturally rigid.
    pose('shinL').rotX = -Math.max(0, -gait) * 0.3 * moving;
    pose('shinR').rotX = -Math.max(0, gait) * 0.3 * moving;

    // --- IDLE: almost nothing ---------------------------------------------
    pose('hips').rotZ = Math.sin(t * 0.33) * 0.012;
    pose('torso').rotX = Math.sin(t * 0.27) * 0.015 - chasing * 0.12;
    pose('head').rotZ = 0.07 + Math.sin(t * 0.21) * 0.02; // permanently tilted
    pose('head').rotX = ctx.headPitch * 0.3;
    pose('head').rotY = Math.sin(t * 0.19) * 0.1 * (1 - moving);

    // --- ARMS: hang; one sweeps on the attack -----------------------------
    // `ctx.attack` is a flag, not a ramp, so the swing cycles off `age` while
    // it is set. That reads as repeated strikes rather than a frozen reach.
    const a = ctx.attack;
    const strike = a * (Math.sin(ctx.age * 3.4) * 0.5 + 0.5);
    const swing = -gait * 0.16 * moving; // barely swings while walking

    // +rotX reaches forward on a hanging limb; see PartPose for the convention.
    pose('armL').rotX = lerp(swing, 0.55, a * 0.4);
    pose('armR').rotX = lerp(-swing, 2.1, strike); // the striking arm
    // On a hanging limb, +rotZ swings the far end toward +X. The left arm
    // therefore splays outward on NEGATIVE rotZ; positive tucks it into the
    // body and the arm stops reading as a separate mass entirely.
    pose('armL').rotZ = -(0.17 + chasing * 0.12);
    pose('armR').rotZ = lerp(0.17 + chasing * 0.12, -0.85, strike); // wide sweep
    pose('forearmL').rotX = -0.12;
    pose('forearmR').rotX = lerp(-0.12, 0.5, strike);
    pose('hips').rotX = -strike * 0.18;

    // Fingers curl idly and splay on the strike.
    for (let i = 0; i < 4; i++) {
      const twitch = Math.sin(t * 0.9 + i * 1.3) * 0.05;
      pose(FINGERS_L[i]).rotX = twitch;
      pose(FINGERS_R[i]).rotX = twitch - strike * 0.5;
      pose(FINGERS_R[i]).rotZ = (i - 1.5) * strike * 0.3;
    }

    // --- HURT: the glow gutters and the plates jolt -----------------------
    if (ctx.hurt > 0) {
      const h = ctx.hurt;
      pose('riftFlareA').visible = false;
      pose('riftFlareB').visible = false;
      pose('riftHot').visible = h < 0.5;
      pose('faceCrack').visible = h < 0.4;
      pose('hips').rotX += h * 0.22;
      pose('head').rotX -= h * 0.3;
      PLATES.forEach((name, i) => {
        pose(name).offsetX += (i % 2 === 0 ? -1 : 1) * h * 3;
      });
    }
  },

  brain: (rng) =>
    createStalkerBrain(rng, {
      sightRange: 34,
      loseRange: 44,
      // It never runs. It walks, and it does not stop.
      chaseThrottle: 0.95,
      wanderThrottle: 0.08, // all but motionless until it sees you
      memorySeconds: 18,
      // Sees you, stops, looks. Then it starts walking.
      stareSeconds: 2.2,
    }),

  spawn: {
    maxLight: 6,
    minY: 0,
    maxY: 40, // deep places
    minPlayerDistance: 30,
    maxPlayerDistance: 70,
    weight: 1, // the rarest thing in the game
    maxNearby: 1,
    groupMin: 1,
    groupMax: 1,
  },

  drops: [{ item: 'voxelia:gleam_cluster', min: 1, max: 2, chance: 0.8 }],
};
