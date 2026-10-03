import type { Rng } from '../core/rng';
import type { Vec3 } from '../core/types';
import type { Brain, BrainSenses, IEntity, Intent, PlayerSense } from './types';

/**
 * Reusable brain parts. A creature's behaviour file composes these rather than
 * reimplementing steering, so new creatures differ in their *rules*, not in
 * their plumbing.
 */

/** A do-nothing intent. Mutate and return it to avoid per-tick allocation. */
export function idleIntent(): Intent {
  return { moveX: 0, moveZ: 0, throttle: 0, jump: false, lookAt: null, attack: 0 };
}

export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Point `intent` at `target`, at `throttle` speed. */
export function steerTowards(intent: Intent, from: Vec3, target: Vec3, throttle: number): void {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) {
    intent.moveX = 0;
    intent.moveZ = 0;
    intent.throttle = 0;
    return;
  }
  intent.moveX = dx / len;
  intent.moveZ = dz / len;
  intent.throttle = throttle;
}

/** Steer directly away from `threat`. */
export function steerAway(intent: Intent, from: Vec3, threat: Vec3, throttle: number): void {
  steerTowards(intent, from, threat, throttle);
  intent.moveX = -intent.moveX;
  intent.moveZ = -intent.moveZ;
}

/**
 * Jump when something solid blocks the way at foot height but the space above it
 * is clear — a one-block ledge the creature can hop. This is what keeps a mob
 * from grinding against terrain forever without needing a full path search.
 */
export function shouldHopObstacle(self: IEntity, senses: BrainSenses, intent: Intent): boolean {
  if (!self.onGround || intent.throttle <= 0) return false;
  const reach = self.definition.width * 0.5 + 0.35;
  const ax = self.position.x + intent.moveX * reach;
  const az = self.position.z + intent.moveZ * reach;
  const feetY = Math.floor(self.position.y + 0.1);
  const blocked = senses.voxels.isSolid(Math.floor(ax), feetY, Math.floor(az));
  if (!blocked) return false;
  // Only hop when there is actually room to land.
  const headroom = !senses.voxels.isSolid(Math.floor(ax), feetY + 1, Math.floor(az));
  const clearance = !senses.voxels.isSolid(Math.floor(ax), feetY + 2, Math.floor(az));
  return headroom && clearance;
}

/** True when `self` can see `target` from its eyes. */
export function hasLineOfSight(self: IEntity, senses: BrainSenses, target: Vec3, range: number): boolean {
  const eye = {
    x: self.position.x,
    y: self.position.y + (self.definition.eyeHeight ?? self.definition.height * 0.85),
    z: self.position.z,
  };
  // Aim at the target's upper body, not its feet, so a step does not break sight.
  const aim = { x: target.x, y: target.y + 1.4, z: target.z };
  return senses.canSee(eye, aim, range);
}

/** Config for {@link createStalkerBrain}. */
export interface StalkerConfig {
  /** Distance at which it notices the player, in blocks. */
  sightRange: number;
  /** Once aggroed, it keeps chasing until the player is this far away. */
  loseRange: number;
  /** Gap it tries to hold while stalking. 0 = charges straight in. */
  standoffRange: number;
  /** Chase throttle, 0..1. */
  chaseThrottle: number;
  /** Wander throttle, 0..1. */
  wanderThrottle: number;
  /** Seconds it keeps hunting the last known position after losing sight. */
  memorySeconds: number;
  /**
   * When true, it freezes while the player is looking near it and only closes
   * the gap when unobserved — the classic "it moved when I blinked" beat.
   */
  freezeWhenWatched?: boolean;
  /** Only hunts when sky light at its feet is at or below this. 15 = always. */
  huntsInLightUpTo?: number;
}

export const DEFAULT_STALKER: StalkerConfig = {
  sightRange: 24,
  loseRange: 34,
  standoffRange: 0,
  chaseThrottle: 1,
  wanderThrottle: 0.35,
  memorySeconds: 6,
  freezeWhenWatched: false,
  huntsInLightUpTo: 15,
};

/**
 * The core horror brain: wanders, notices the player, closes in, attacks, and
 * keeps hunting the last place it saw them after losing sight.
 *
 * `freezeWhenWatched` flips it into a stalker that only advances unobserved.
 */
export function createStalkerBrain(rng: Rng, config: Partial<StalkerConfig> = {}): Brain {
  const cfg = { ...DEFAULT_STALKER, ...config };
  const intent = idleIntent();

  let state: 'idle' | 'wander' | 'hunt' | 'search' | 'attack' | 'frozen' = 'idle';
  let stateTime = 0;
  let wanderTarget: Vec3 | null = null;
  let lastSeen: Vec3 | null = null;
  let memory = 0;

  const reset = (): void => {
    intent.moveX = 0;
    intent.moveZ = 0;
    intent.throttle = 0;
    intent.jump = false;
    intent.lookAt = null;
    intent.attack = 0;
  };

  return {
    get state() {
      return state;
    },

    onHurt(self, _amount, source) {
      // Being hit always reveals the attacker, even in pitch darkness.
      if (source) {
        lastSeen = { x: source.x, y: source.y, z: source.z };
        memory = cfg.memorySeconds;
        state = 'hunt';
        stateTime = 0;
      }
      void self;
    },

    think(self, senses, dt): Intent {
      reset();
      stateTime += dt;
      if (memory > 0) memory = Math.max(0, memory - dt);

      const player = senses.playerPosition;
      const light = senses.lightAt(
        Math.floor(self.position.x),
        Math.floor(self.position.y),
        Math.floor(self.position.z),
      );
      const mayHunt = light <= (cfg.huntsInLightUpTo ?? 15);

      // --- acquire -------------------------------------------------------
      let visible = false;
      if (player && mayHunt) {
        const d = distance3(self.position, player);
        const range = state === 'hunt' || state === 'attack' ? cfg.loseRange : cfg.sightRange;
        visible = d <= range && hasLineOfSight(self, senses, player, range);
        if (visible) {
          lastSeen = { x: player.x, y: player.y, z: player.z };
          memory = cfg.memorySeconds;
        }
      }

      // --- state selection ----------------------------------------------
      if (visible && player) {
        const gap = distanceXZ(self.position, player);
        const reach =
          (self.definition.attackRange ?? 1.2) + self.definition.width * 0.5;

        if (cfg.freezeWhenWatched && isWatchedBy(self, player, senses)) {
          state = 'frozen';
        } else if (gap <= reach) {
          state = 'attack';
        } else {
          state = 'hunt';
        }
      } else if (memory > 0 && lastSeen) {
        state = 'search';
      } else if (state !== 'wander' || stateTime > 4 || !wanderTarget) {
        state = 'wander';
        stateTime = 0;
        const angle = rng.float(0, Math.PI * 2);
        const dist = rng.float(4, 11);
        wanderTarget = {
          x: self.position.x + Math.cos(angle) * dist,
          y: self.position.y,
          z: self.position.z + Math.sin(angle) * dist,
        };
      }

      // --- act -----------------------------------------------------------
      switch (state) {
        case 'frozen':
          // Hold absolutely still, but keep facing the player. Nothing is worse.
          intent.lookAt = player;
          break;

        case 'attack': {
          intent.lookAt = player;
          intent.attack = 1;
          if (!player) break;
          // Hold at arm's length. Creeping in unconditionally walks the creature
          // into the player and through the camera, which looks broken and hides
          // the model. Only close a gap that is still open.
          const reach = (self.definition.attackRange ?? 1.2) + self.definition.width * 0.5;
          const gap = distanceXZ(self.position, player);
          if (gap > reach * 0.85) steerTowards(intent, self.position, player, 0.25);
          else if (gap < reach * 0.55) steerAway(intent, self.position, player, 0.2);
          break;
        }

        case 'hunt': {
          if (!player) break;
          intent.lookAt = player;
          const gap = distanceXZ(self.position, player);
          if (cfg.standoffRange > 0 && gap < cfg.standoffRange) {
            steerAway(intent, self.position, player, cfg.chaseThrottle * 0.6);
          } else {
            steerTowards(intent, self.position, player, cfg.chaseThrottle);
          }
          break;
        }

        case 'search':
          if (lastSeen) {
            intent.lookAt = lastSeen;
            if (distanceXZ(self.position, lastSeen) > 1.2) {
              steerTowards(intent, self.position, lastSeen, cfg.chaseThrottle * 0.75);
            } else {
              memory = 0; // reached it, nothing there
            }
          }
          break;

        // 'idle' is only the seed value; the selection above always leaves a
        // concrete state, so it needs no case of its own.
        case 'wander':
          if (wanderTarget) {
            if (distanceXZ(self.position, wanderTarget) > 1) {
              steerTowards(intent, self.position, wanderTarget, cfg.wanderThrottle);
              intent.lookAt = wanderTarget;
            } else {
              wanderTarget = null;
            }
          }
          break;
      }

      if (shouldHopObstacle(self, senses, intent)) intent.jump = true;
      return intent;
    },
  };
}

/**
 * Is the player's view pointed at this entity? Used by freeze-when-watched
 * creatures. Deliberately generous (a wide cone) so it feels like being seen,
 * not like a precise crosshair test.
 */
function isWatchedBy(self: IEntity, player: PlayerSense, senses: BrainSenses): boolean {
  const yaw = player.yaw;
  // The player's forward vector, matching the camera convention (yaw 0 = -Z).
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const dx = self.position.x - player.x;
  const dz = self.position.z - player.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return true;
  const dot = (dx / len) * fx + (dz / len) * fz;
  // ~50 degrees to either side.
  if (dot < 0.64) return false;
  return hasLineOfSight(self, senses, player, 64);
}
