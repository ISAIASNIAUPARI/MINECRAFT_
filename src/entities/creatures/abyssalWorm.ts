import { createLeviathanBrain, type LeviathanBrain } from '../leviathan';
import type { CreatureDefinition, ModelPart, Rgb } from '../types';

/**
 * The Abyssal Worm — a colossal segmented leviathan that flies the treeline,
 * crosses the sky, and comes down through the ground.
 *
 * Built to the supplied reference. What carries it:
 *
 *  1. **Scale.** ~34 blocks nose to tail: head alone is bigger than any other
 *     creature in the game. The body is meant to leave frame — the tail is
 *     still behind the trees while the head is overhead.
 *  2. **Follow-the-leader motion.** The segments are a nested chain, each one
 *     sampling the turn a little later than the one ahead of it, so the whole
 *     body ripples instead of pivoting as a rigid stick.
 *  3. **A circular maw.** Eight inward-curving fangs on a ring, a black throat,
 *     and a red core down it. One tooth geometry, used eight times.
 *
 * Model units are 1/16 block; the origin is the head's centre, and because this
 * creature flies, that sits in the air rather than at any feet.
 *
 * Box budget: 74 — by far the largest in the game, and the one place it is
 * clearly justified: 16 segments of body, 8 teeth, and a layered maw. The
 * segments reuse three sizes and the teeth one, so the whole worm costs about
 * ten geometries.
 */

const ROCK: Rgb = [34, 29, 27];
const ROCK_DARK: Rgb = [21, 18, 17];
const ROCK_LIT: Rgb = [54, 45, 41];
const BURNT: Rgb = [62, 38, 30];
const EMBER: Rgb = [168, 38, 24];
const EMBER_HOT: Rgb = [255, 96, 44];
const THROAT: Rgb = [8, 5, 5];
const FANG: Rgb = [206, 196, 180];

/** Teeth ringing the maw. One geometry, eight placements. */
function fang(i: number, total: number, ringRadius: number): ModelPart {
  const a = (i / total) * Math.PI * 2;
  return {
    name: `fang${i}`,
    size: [3.5, 13, 3.5],
    pivot: [Math.cos(a) * ringRadius, Math.sin(a) * ringRadius, -5],
    origin: [-1.75, -13, -1.75],
    color: FANG,
    // Each tooth leans toward the centre of the ring, so the mouth reads as a
    // closing iris rather than a circle of spikes.
    rotation: [Math.PI / 2 + 0.3, 0, -a - Math.PI / 2],
  };
}

/**
 * The body, built inward: each segment is a child of the one ahead, so a
 * rotation at the head propagates down the whole chain. `index` 0 is the
 * segment right behind the head.
 */
function segment(index: number, count: number): ModelPart {
  // Taper toward the tail.
  const t = index / count;
  const w = Math.round((22 - t * 15) * 2) / 2;
  const len = 16;
  const child = index + 1 < count ? [segment(index + 1, count)] : [];
  return {
    name: `seg${index}`,
    size: [w, w, len],
    pivot: [0, 0, len - 1],
    origin: [-w / 2, -w / 2, 0],
    // Alternating tone down the body, so a 16-segment chain does not read as
    // one extruded tube.
    color: index % 3 === 0 ? ROCK_LIT : index % 3 === 1 ? ROCK : ROCK_DARK,
    texture: index % 3 === 0 ? 'worm_rock_lit' : index % 3 === 1 ? 'worm_rock' : 'worm_rock_dark',
    children: [
      // A glowing seam between plates. Thin, so the body stays mostly dark.
      {
        name: `segGlow${index}`,
        size: [w * 0.5, w + 0.6, 1.5],
        pivot: [0, 0, 1],
        origin: [-w * 0.25, -(w + 0.6) / 2, 0],
        color: index % 2 === 0 ? EMBER : EMBER_HOT,
        emissive: true,
      },
      ...child,
    ],
  };
}

const SEGMENT_COUNT = 16;
/** Precomputed names so `animate` never allocates. */
const SEGMENTS = Array.from({ length: SEGMENT_COUNT }, (_, i) => `seg${i}`);
const FANGS = Array.from({ length: 8 }, (_, i) => `fang${i}`);

export const ABYSSAL_WORM: CreatureDefinition = {
  name: 'voxelia:abyssal_worm',
  displayName: 'Abyssal Worm',

  // Authored at readable proportions and then drawn three times over, which
  // puts it at roughly 50 blocks nose to tail — about 28x the player, inside
  // the 15-30x the design asks for.
  modelScale: 3,

  // The hitbox is the HEAD only. The body is visual: one entity, not sixteen,
  // exactly as the design demands — a per-segment collider would be a swarm.
  width: 5.6,
  height: 5.6,
  eyeHeight: 2.8,

  maxHealth: 400,
  moveSpeed: 17, // it crosses the map; nothing outruns it
  stepHeight: 0,
  gravity: false, // it flies
  collides: false, // and bores through the ground it is carving

  attackDamage: 22,
  attackCooldown: 2.4,
  attackRange: 5,

  model: [
    {
      name: 'head',
      size: [30, 30, 34],
      pivot: [0, 0, 0],
      origin: [-15, -15, -17],
      color: ROCK,
      texture: 'worm_rock',
      children: [
        // Burnt crown plates, so the skull is not one slab.
        {
          name: 'crownA',
          size: [22, 5, 20],
          pivot: [0, 15, -2],
          origin: [-11, 0, -10],
          color: BURNT,
          texture: 'worm_burnt',
        },
        {
          name: 'crownB',
          size: [12, 4, 12],
          pivot: [0, 20, -5],
          origin: [-6, 0, -6],
          color: ROCK_DARK,
          texture: 'worm_rock_dark',
        },
        // Seams of heat along the jaw.
        {
          name: 'jawGlowL',
          size: [2, 16, 22],
          pivot: [-15.2, -2, -4],
          origin: [-2, -8, -11],
          color: EMBER,
          emissive: true,
        },
        {
          name: 'jawGlowR',
          size: [2, 16, 22],
          pivot: [15.2, -2, -4],
          origin: [0, -8, -11],
          color: EMBER,
          emissive: true,
        },

        // --- the maw ------------------------------------------------------
        {
          name: 'maw',
          size: [26, 26, 2],
          pivot: [0, 0, -17.1],
          origin: [-13, -13, -2],
          color: THROAT,
          children: [
            {
              name: 'throat',
              size: [17, 17, 14],
              pivot: [0, 0, 2],
              origin: [-8.5, -8.5, 0],
              color: THROAT,
            },
            // The core down the gullet — the one bright thing on the creature.
            {
              name: 'core',
              size: [9, 9, 3],
              pivot: [0, 0, 13],
              origin: [-4.5, -4.5, 0],
              color: EMBER_HOT,
              emissive: true,
            },
            {
              name: 'coreHalo',
              size: [15, 15, 1],
              pivot: [0, 0, 10],
              origin: [-7.5, -7.5, 0],
              color: EMBER,
              emissive: true,
            },
          ],
        },
        fang(0, 8, 12),
        fang(1, 8, 12),
        fang(2, 8, 12),
        fang(3, 8, 12),
        fang(4, 8, 12),
        fang(5, 8, 12),
        fang(6, 8, 12),
        fang(7, 8, 12),

        // --- the body, chained behind the head ------------------------------
        segment(0, SEGMENT_COUNT),
      ],
    },
  ],

  animatesDeath: true,

  animate: (pose, ctx) => {
    const t = ctx.age;

    // --- DEATH: it comes apart from the tail forward ----------------------
    if (ctx.dead) {
      const d = ctx.deathProgress;
      for (let i = 0; i < SEGMENT_COUNT; i++) {
        // The tail lets go first and the break runs toward the head.
        const when = 1 - i / SEGMENT_COUNT;
        const gone = d > when * 0.85;
        pose(SEGMENTS[i]).visible = !gone;
        pose(SEGMENTS[i]).rotX = Math.sin(i * 1.7) * d * 0.8;
        pose(SEGMENTS[i]).rotY = Math.cos(i * 2.1) * d * 0.9;
        pose(`segGlow${i}`).visible = !gone && d < 0.7;
      }
      pose('core').visible = d < 0.6;
      pose('coreHalo').visible = d < 0.45;
      for (let i = 0; i < 8; i++) pose(FANGS[i]).rotX = Math.PI / 2 + 0.3 + d * 0.9;
      return;
    }

    // --- THE RIPPLE: each segment lags the one ahead of it ----------------
    // This is what separates a flying worm from a floating stick. A fixed
    // phase step per segment means the bend travels down the body rather than
    // every joint turning at once.
    const diving = ctx.attack;
    const amp = 0.09 * (1 - diving * 0.75); // it straightens out to dive
    const rate = 1.9 + diving * 1.4;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const phase = t * rate - i * 0.55;
      const taper = 0.5 + (i / SEGMENT_COUNT) * 0.9; // the tail whips wider
      pose(SEGMENTS[i]).rotY = Math.sin(phase) * amp * taper;
      pose(SEGMENTS[i]).rotX = Math.cos(phase * 0.8) * amp * 0.55 * taper;
    }

    // --- THE MAW ----------------------------------------------------------
    // `ctx.attack` is set through targeting, the dive and the impact, so the
    // mouth is open for exactly the window the brain is committed.
    const gape = diving;
    for (let i = 0; i < 8; i++) {
      // Teeth swing outward as it opens, like an iris.
      pose(FANGS[i]).rotX = Math.PI / 2 + 0.3 - gape * 0.5;
    }
    pose('throat').offsetZ = gape * 4;
    pose('core').offsetZ = -gape * 5;
    // The core flares with the gape, done by visibility because the emissive
    // material is shared across every instance.
    pose('coreHalo').visible = gape > 0.25 || Math.sin(t * 0.8) > 0.3;

    // --- head sway, cut right down while committed ------------------------
    const idle = 1 - diving;
    pose('crownA').rotX = Math.sin(t * 0.5) * 0.02 * idle;
    pose('jawGlowL').visible = gape > 0.1 || Math.sin(t * 0.6) > -0.2;
    pose('jawGlowR').visible = pose('jawGlowL').visible;

    // --- HURT: the seams gutter -------------------------------------------
    if (ctx.hurt > 0) {
      pose('coreHalo').visible = false;
      for (let i = 0; i < SEGMENT_COUNT; i += 2) pose(`segGlow${i}`).visible = false;
    }
  },

  brain: (rng) => createLeviathanBrain(rng) as unknown as LeviathanBrain,

  spawn: {
    minY: 60,
    minPlayerDistance: 90,
    maxPlayerDistance: 220,
    weight: 1,
    maxNearby: 1,
    groupMin: 1,
    groupMax: 1,
  },

  drops: [{ item: 'voxelia:raw_gleam', min: 3, max: 8, chance: 1 }],
};
