import type { Rng } from '../core/rng';
import type { Vec3 } from '../core/types';
import { distanceXZ } from './ai';
import type { Brain, BrainSenses, IEntity, Intent } from './types';

/**
 * The flying-leviathan brain: a creature too big to walk anywhere.
 *
 * It runs the state machine the design asks for —
 * `FLYING → OBSERVING → TARGETING → DIVING → IMPACT → BURROWED → RISING` —
 * and is kept separate from the ground stalker in `ai.ts` because almost
 * nothing is shared: this thing never pathfinds, never hops an obstacle, and
 * steers in three dimensions.
 *
 * It is deliberately NOT a chase brain. Most of the time it crosses the sky on
 * a long heading and ignores the player entirely; the dread is meant to come
 * from watching it pass, not from being pursued.
 */

export type LeviathanState =
  | 'flying'
  | 'observing'
  | 'targeting'
  | 'diving'
  | 'impact'
  | 'burrowed'
  | 'rising';

export interface LeviathanConfig {
  /** Height above the local treetops it prefers to cruise at, in blocks. */
  cruiseHeight: number;
  /** How far it can notice the player. */
  sightRange: number;
  /** It only commits to a dive from inside this range. */
  diveRange: number;
  /** Seconds it circles and watches before committing. */
  observeSeconds: number;
  /** Seconds it lines up, slowing, mouth opening. */
  targetSeconds: number;
  /** Seconds it stays under the ground before coming back up. */
  burrowSeconds: number;
  /** Minimum seconds between dives, so it cannot chain them. */
  diveCooldown: number;
  /** Throttle while cruising / while diving. */
  cruiseThrottle: number;
  diveThrottle: number;
}

export const DEFAULT_LEVIATHAN: LeviathanConfig = {
  cruiseHeight: 16,
  sightRange: 120,
  diveRange: 70,
  observeSeconds: 4.5,
  targetSeconds: 1.8,
  burrowSeconds: 2.6,
  diveCooldown: 22,
  cruiseThrottle: 0.45,
  diveThrottle: 1,
};

/** What the creature's animation and the game need to know beyond `state`. */
export interface LeviathanBrain extends Brain {
  readonly state: LeviathanState;
  /** 0..1 how wide the maw is. */
  readonly gape: number;
  /** Set for exactly one tick when the head first strikes the ground. */
  readonly struckThisTick: boolean;
  /** Set for exactly one tick when it bursts back out. */
  readonly emergedThisTick: boolean;
  /** Where it is heading, for the model to lean into. */
  readonly heading: Vec3;
}

/** The sky height it wants, given the ground beneath it. */
function cruiseTarget(senses: BrainSenses, x: number, z: number, height: number): number {
  // Sample the column rather than searching: one probe downward from well above.
  let ground = 0;
  for (let y = 120; y > 0; y--) {
    if (senses.voxels.isSolid(Math.floor(x), y, Math.floor(z))) {
      ground = y;
      break;
    }
  }
  return ground + height;
}

export function createLeviathanBrain(
  rng: Rng,
  config: Partial<LeviathanConfig> = {},
): LeviathanBrain {
  const cfg = { ...DEFAULT_LEVIATHAN, ...config };
  const intent: Intent = {
    moveX: 0,
    moveY: 0,
    moveZ: 0,
    throttle: 0,
    jump: false,
    lookAt: null,
    attack: 0,
  };

  let state: LeviathanState = 'flying';
  let stateTime = 0;
  let cooldown = cfg.diveCooldown * 0.4; // not immediately on spawn
  let gape = 0;
  let struck = false;
  let emerged = false;

  // A long heading it keeps for a while, so it crosses the sky instead of
  // milling about. Re-rolled occasionally and on leaving a dive.
  let headingAngle = rng.float(0, Math.PI * 2);
  let headingLeft = rng.float(14, 26);
  const heading: Vec3 = { x: Math.cos(headingAngle), y: 0, z: Math.sin(headingAngle) };

  /** Target it committed to at the start of a dive; it does not re-aim midway. */
  let diveTarget: Vec3 | null = null;

  const setState = (next: LeviathanState): void => {
    state = next;
    stateTime = 0;
  };

  const newHeading = (): void => {
    headingAngle += rng.float(-1.1, 1.1);
    headingLeft = rng.float(14, 26);
    heading.x = Math.cos(headingAngle);
    heading.z = Math.sin(headingAngle);
  };

  return {
    get state() {
      return state;
    },
    get gape() {
      return gape;
    },
    get struckThisTick() {
      return struck;
    },
    get emergedThisTick() {
      return emerged;
    },
    get heading() {
      return heading;
    },

    think(self: IEntity, senses: BrainSenses, dt: number): Intent {
      stateTime += dt;
      cooldown = Math.max(0, cooldown - dt);
      struck = false;
      emerged = false;

      intent.moveX = 0;
      intent.moveY = 0;
      intent.moveZ = 0;
      intent.throttle = 0;
      intent.jump = false;
      intent.lookAt = null;
      intent.attack = 0;

      const player = senses.playerPosition;
      const pos = self.position;

      switch (state) {
        // --- crossing the sky on a long heading --------------------------
        case 'flying': {
          gape = approach(gape, 0, dt * 1.5);
          headingLeft -= dt;
          if (headingLeft <= 0) newHeading();

          intent.moveX = heading.x;
          intent.moveZ = heading.z;
          intent.throttle = cfg.cruiseThrottle;

          // Hold treetop height: climb or sink toward the target, never snap.
          const want = cruiseTarget(senses, pos.x, pos.z, cfg.cruiseHeight);
          intent.moveY = clamp((want - pos.y) * 0.25, -1, 1);

          if (
            player &&
            cooldown <= 0 &&
            distanceXZ(pos, player) <= cfg.sightRange
          ) {
            setState('observing');
          }
          break;
        }

        // --- it has noticed; it circles and watches -----------------------
        case 'observing': {
          if (!player) {
            setState('flying');
            break;
          }
          // Bank around the player rather than at them.
          const dx = player.x - pos.x;
          const dz = player.z - pos.z;
          const len = Math.hypot(dx, dz) || 1;
          // Tangent, so it orbits.
          intent.moveX = -dz / len;
          intent.moveZ = dx / len;
          intent.throttle = cfg.cruiseThrottle * 0.8;
          intent.lookAt = player;

          const want = cruiseTarget(senses, pos.x, pos.z, cfg.cruiseHeight);
          intent.moveY = clamp((want - pos.y) * 0.25, -1, 1);

          if (stateTime >= cfg.observeSeconds) {
            if (distanceXZ(pos, player) <= cfg.diveRange) setState('targeting');
            else setState('flying');
          }
          break;
        }

        // --- lining up: slowing, mouth opening ----------------------------
        case 'targeting': {
          if (!player) {
            setState('flying');
            break;
          }
          gape = approach(gape, 1, dt * 1.4);
          intent.lookAt = player;
          // Almost stops, which is what makes the drop read as a decision.
          intent.throttle = cfg.cruiseThrottle * 0.18;
          const dx = player.x - pos.x;
          const dz = player.z - pos.z;
          const len = Math.hypot(dx, dz) || 1;
          intent.moveX = dx / len;
          intent.moveZ = dz / len;
          intent.moveY = 0.1; // rears up slightly before the plunge

          if (stateTime >= cfg.targetSeconds) {
            // Commit to where they are NOW. It does not steer mid-dive, which
            // is what makes the attack dodgeable instead of a homing missile.
            diveTarget = { x: player.x, y: player.y, z: player.z };
            setState('diving');
          }
          break;
        }

        // --- the plunge ----------------------------------------------------
        case 'diving': {
          gape = 1;
          if (!diveTarget) {
            setState('flying');
            break;
          }
          const dx = diveTarget.x - pos.x;
          const dy = diveTarget.y - pos.y;
          const dz = diveTarget.z - pos.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          intent.moveX = dx / len;
          intent.moveY = dy / len;
          intent.moveZ = dz / len;
          intent.throttle = cfg.diveThrottle;
          intent.lookAt = diveTarget;
          intent.attack = 1;

          // It has arrived when it is at or below the committed point.
          if (pos.y <= diveTarget.y + 1.5) {
            struck = true;
            setState('impact');
          }
          // Safety: never dive forever if the ground moved out from under it.
          if (stateTime > 6) setState('rising');
          break;
        }

        // --- the hit, then straight into the ground ------------------------
        case 'impact': {
          gape = 1;
          intent.moveY = -1;
          intent.throttle = cfg.diveThrottle * 0.8;
          intent.attack = 1;
          if (stateTime > 0.45) setState('burrowed');
          break;
        }

        // --- under the ground ----------------------------------------------
        case 'burrowed': {
          gape = approach(gape, 0.3, dt);
          // Keeps boring downward and forward, slowly.
          intent.moveX = heading.x * 0.3;
          intent.moveZ = heading.z * 0.3;
          intent.moveY = -0.25;
          intent.throttle = 0.3;
          if (stateTime >= cfg.burrowSeconds) {
            emerged = true;
            newHeading();
            setState('rising');
          }
          break;
        }

        // --- bursting back into the sky -------------------------------------
        case 'rising': {
          gape = approach(gape, 0, dt);
          intent.moveX = heading.x * 0.5;
          intent.moveZ = heading.z * 0.5;
          intent.moveY = 1;
          intent.throttle = cfg.diveThrottle * 0.9;

          const want = cruiseTarget(senses, pos.x, pos.z, cfg.cruiseHeight);
          if (pos.y >= want - 2) {
            cooldown = cfg.diveCooldown;
            diveTarget = null;
            setState('flying');
          }
          if (stateTime > 10) setState('flying'); // never get stuck underground
          break;
        }
      }

      return intent;
    },
  };
}

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
