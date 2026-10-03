import { createStalkerBrain } from '../ai';
import type { CreatureDefinition } from '../types';

/**
 * The Hollow — the reference creature.
 *
 * It exists to prove the pipeline end to end (model -> animation -> brain ->
 * physics -> render) and to serve as the template every other creature copies.
 * A new creature is this file with different numbers: there is no engine work
 * left to do.
 *
 * Model units are 1/16 of a block. The origin is between its feet.
 */

const ASH = [58, 56, 62] as const;
const ASH_DARK = [42, 40, 46] as const;
const EYE = [210, 70, 55] as const;

export const HOLLOW: CreatureDefinition = {
  name: 'voxelia:hollow',
  displayName: 'Hollow',

  width: 0.6,
  height: 1.9,
  eyeHeight: 1.72,

  maxHealth: 20,
  moveSpeed: 3.4,
  jumpSpeed: 8.2,
  stepHeight: 0.6,

  attackDamage: 3,
  attackCooldown: 1.1,
  attackRange: 1.1,

  model: [
    {
      name: 'body',
      size: [8, 14, 4],
      pivot: [0, 10, 0],
      origin: [-4, 0, -2],
      color: ASH,
      children: [
        {
          name: 'head',
          size: [8, 8, 8],
          pivot: [0, 14, 0],
          origin: [-4, 0, -4],
          color: ASH,
          children: [
            // Set slightly proud of the face so they never z-fight with it.
            { name: 'eyeL', size: [2, 1, 1], pivot: [-2, 4, -4.1], origin: [-1, 0, -1], color: EYE, emissive: true },
            { name: 'eyeR', size: [2, 1, 1], pivot: [2, 4, -4.1], origin: [-1, 0, -1], color: EYE, emissive: true },
          ],
        },
        { name: 'armL', size: [3, 14, 3], pivot: [-5.5, 13, 0], color: ASH_DARK },
        { name: 'armR', size: [3, 14, 3], pivot: [5.5, 13, 0], color: ASH_DARK },
      ],
    },
    { name: 'legL', size: [3.5, 10, 3.5], pivot: [-2, 10, 0], color: ASH_DARK },
    { name: 'legR', size: [3.5, 10, 3.5], pivot: [2, 10, 0], color: ASH_DARK },
  ],

  animate: (pose, ctx) => {
    // Gait is driven by distance walked, so it stays in step at any speed.
    const swing = Math.sin(ctx.distance * 2.1) * Math.min(ctx.speed / 3.4, 1);
    pose('legL').rotX = swing * 0.9;
    pose('legR').rotX = -swing * 0.9;

    // Idle sway and breathing, offset per instance so a group looks alive.
    const t = ctx.age + ctx.phase * 10;
    pose('body').rotZ = Math.sin(t * 0.9) * 0.02;
    pose('head').rotX = ctx.headPitch * 0.6 + Math.sin(t * 0.7) * 0.03;
    pose('head').rotY = ctx.headYaw;

    // Arms hang and counter-swing, then reach out to attack.
    const reach = ctx.attack;
    const hang = -swing * 0.55 * (1 - reach);
    pose('armL').rotX = hang - reach * 1.5;
    pose('armR').rotX = -hang - reach * 1.5;
    pose('armL').rotZ = 0.06 + reach * 0.15;
    pose('armR').rotZ = -0.06 - reach * 0.15;
  },

  brain: (rng) =>
    createStalkerBrain(rng, {
      sightRange: 22,
      loseRange: 30,
      chaseThrottle: 1,
      wanderThrottle: 0.3,
      memorySeconds: 7,
    }),

  spawn: {
    maxLight: 7,
    minPlayerDistance: 18,
    maxPlayerDistance: 44,
    weight: 10,
    maxNearby: 6,
    groupMin: 1,
    groupMax: 2,
  },

  drops: [{ item: 'voxelia:flint', min: 0, max: 2, chance: 0.5 }],
};
