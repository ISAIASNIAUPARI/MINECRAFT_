import {
  GRAVITY,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_REACH,
  PLAYER_WIDTH,
  TERMINAL_VELOCITY,
} from '../core/constants';
import { clamp } from '../core/math';
import { GameMode, type Vec3 } from '../core/types';
import type { CameraState } from '../rendering/types';
import type { IWorld } from '../engine/types';
import type { IBlockRegistry } from '../blocks/types';
import type { IInputManager } from '../input/types';
import { CollisionResolver } from '../physics/collision';
import { raycastVoxel } from '../physics/raycast';
import { aabbFromFeet } from '../physics/aabb';
import type { VoxelView } from '../physics/types';
import type {
  IPlayerController,
  PlayerSpawnOptions,
  PlayerState,
  PlayerTarget,
} from './types';

const WALK_SPEED = 4.6;
const SPRINT_SPEED = 6.2;
const SNEAK_SPEED = 1.6;
const FLY_SPEED = 11;
const JUMP_VELOCITY = 9.2;
/** Seconds of immunity after taking a hit, so contact damage cannot drain at tick rate. */
const HURT_INVULNERABILITY = 0.5;

const MOUSE_SENSITIVITY = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.01;

/**
 * SKELETON player controller — walking, sprinting, sneaking, jumping, gravity,
 * creative fly, mouse-look, and block break/place via raycast. Phase 1
 * (Agent: player/physics) adds fall damage, view-bob, hardness-based mining
 * timing, block-outline feedback, fluid physics and step-up.
 */
export class PlayerController implements IPlayerController {
  readonly state: PlayerState;
  readonly target: PlayerTarget = { hit: null };

  private readonly collider = new CollisionResolver();
  private readonly voxelView: VoxelView;
  /** Seconds of damage immunity remaining. */
  private invulnerable = 0;
  private breakCooldown = 0;
  private placeCooldown = 0;

  constructor(
    private readonly world: IWorld,
    private readonly input: IInputManager,
    private readonly blocks: IBlockRegistry,
    spawn: PlayerSpawnOptions,
    private readonly onBlockChange?: (x: number, y: number, z: number) => void,
    private readonly getHeldBlockId?: () => number | null,
    private readonly onBlockBroken?: (x: number, y: number, z: number, id: number) => void,
  ) {
    this.state = {
      position: { ...spawn.position },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: spawn.yaw ?? 0,
      pitch: spawn.pitch ?? 0,
      onGround: false,
      inFluid: false,
      sprinting: false,
      sneaking: false,
      flying: spawn.gameMode === GameMode.Creative,
      gameMode: spawn.gameMode ?? GameMode.Survival,
      stats: {
        health: 20,
        maxHealth: 20,
        hunger: 20,
        saturation: 5,
        fallDistance: 0,
        xpLevel: 0,
        xpProgress: 0,
      },
      selectedSlot: 0,
    };

    this.voxelView = {
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      isSolid: (x, y, z) => this.blocks.isSolid(this.world.getBlock(x, y, z)),
    };
  }

  getCameraState(): CameraState {
    return {
      x: this.state.position.x,
      y: this.state.position.y + PLAYER_EYE_HEIGHT,
      z: this.state.position.z,
      yaw: this.state.yaw,
      pitch: this.state.pitch,
      fovDegrees: this.state.sprinting ? 74 : 70,
    };
  }

  updateLook(_dt: number): void {
    const { dx, dy } = this.input.readPointerDelta();
    if (dx === 0 && dy === 0) return;
    this.state.yaw -= dx * MOUSE_SENSITIVITY;
    this.state.pitch = clamp(this.state.pitch - dy * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
  }

  tick(dt: number): void {
    this.breakCooldown = Math.max(0, this.breakCooldown - dt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    if (this.input.consumePressed('jump') && this.state.gameMode === GameMode.Creative) {
      // double-tap-ish: toggle fly when airborne jump pressed
      if (!this.state.onGround) this.state.flying = !this.state.flying;
    }

    this.applyMovement(dt);
    this.updateTarget();
    this.handleInteraction();
  }

  private applyMovement(dt: number): void {
    const s = this.state;
    s.sneaking = this.input.isDown('sneak');
    s.sprinting = this.input.isDown('sprint') && this.input.isDown('move_forward') && !s.sneaking;

    const forward = (this.input.isDown('move_forward') ? 1 : 0) - (this.input.isDown('move_back') ? 1 : 0);
    const strafe = (this.input.isDown('move_right') ? 1 : 0) - (this.input.isDown('move_left') ? 1 : 0);

    const sin = Math.sin(s.yaw);
    const cos = Math.cos(s.yaw);
    // yaw 0 = looking -Z
    let wishX = -sin * forward + cos * strafe;
    let wishZ = -cos * forward - sin * strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) {
      wishX /= len;
      wishZ /= len;
    }

    const flying = s.flying && s.gameMode === GameMode.Creative;
    const speed = flying
      ? FLY_SPEED
      : s.sneaking
        ? SNEAK_SPEED
        : s.sprinting
          ? SPRINT_SPEED
          : WALK_SPEED;

    if (flying) {
      s.velocity.x = wishX * speed;
      s.velocity.z = wishZ * speed;
      const vertical = (this.input.isDown('jump') ? 1 : 0) - (this.input.isDown('sneak') ? 1 : 0);
      s.velocity.y = vertical * speed;
    } else {
      // Ground/air acceleration toward wish velocity.
      const accel = s.onGround ? 14 : 4;
      s.velocity.x += (wishX * speed - s.velocity.x) * Math.min(1, accel * dt);
      s.velocity.z += (wishZ * speed - s.velocity.z) * Math.min(1, accel * dt);
      s.velocity.y -= GRAVITY * dt;
      if (s.velocity.y < -TERMINAL_VELOCITY) s.velocity.y = -TERMINAL_VELOCITY;

      if (this.input.isDown('jump') && s.onGround) {
        s.velocity.y = JUMP_VELOCITY;
        s.onGround = false;
      }
    }

    const box = aabbFromFeet(s.position, PLAYER_WIDTH, PLAYER_HEIGHT);
    const move = this.collider.move(this.voxelView, {
      aabb: box,
      velocity: s.velocity,
      dt,
      stepHeight: 0.5,
    });
    s.position = move.position;
    s.velocity = move.velocity;

    if (!flying) {
      if (move.onGround && !s.onGround && s.stats.fallDistance > 3) {
        // fall damage placeholder — Phase 1 player agent implements properly
        s.stats.health = Math.max(0, s.stats.health - Math.floor(s.stats.fallDistance - 3));
      }
      if (move.onGround) s.stats.fallDistance = 0;
      else if (s.velocity.y < 0) s.stats.fallDistance += -s.velocity.y * dt;
      s.onGround = move.onGround;
    } else {
      s.onGround = false;
    }
  }

  private updateTarget(): void {
    const cam = this.getCameraState();
    const dir: Vec3 = {
      x: -Math.sin(cam.yaw) * Math.cos(cam.pitch),
      y: Math.sin(cam.pitch),
      z: -Math.cos(cam.yaw) * Math.cos(cam.pitch),
    };
    this.target.hit = raycastVoxel(
      this.voxelView,
      { x: cam.x, y: cam.y, z: cam.z },
      dir,
      PLAYER_REACH,
      (id) => id !== 0 && this.blocks.get(id).name !== 'voxelia:water',
    );
  }

  private handleInteraction(): void {
    const hit = this.target.hit;
    if (!hit) return;

    if (this.input.isDown('attack') && this.breakCooldown <= 0) {
      const def = this.blocks.get(hit.blockId);
      if (Number.isFinite(def.hardness)) {
        this.world.setBlock(hit.block.x, hit.block.y, hit.block.z, 0);
        this.onBlockChange?.(hit.block.x, hit.block.y, hit.block.z);
        this.onBlockBroken?.(hit.block.x, hit.block.y, hit.block.z, hit.blockId);
        this.breakCooldown = this.state.gameMode === GameMode.Creative ? 0.18 : 0.32;
      }
    }

    if (this.input.consumePressed('use') && this.placeCooldown <= 0) {
      const placeId = this.getHeldBlockId?.() ?? null;
      if (placeId && placeId > 0) {
        const p = hit.placement;
        // Don't place inside the player.
        const box = aabbFromFeet(this.state.position, PLAYER_WIDTH, PLAYER_HEIGHT);
        const insidePlayer =
          p.x + 1 > box.minX && p.x < box.maxX && p.y + 1 > box.minY && p.y < box.maxY && p.z + 1 > box.minZ && p.z < box.maxZ;
        if (!insidePlayer && this.world.getBlock(p.x, p.y, p.z) === 0) {
          this.world.setBlock(p.x, p.y, p.z, placeId);
          this.onBlockChange?.(p.x, p.y, p.z);
          this.placeCooldown = 0.2;
        }
      }
    }
  }

  setGameMode(mode: GameMode): void {
    this.state.gameMode = mode;
    if (mode !== GameMode.Creative) this.state.flying = false;
  }

  teleport(position: Vec3, yaw?: number, pitch?: number): void {
    this.state.position = { ...position };
    this.state.velocity = { x: 0, y: 0, z: 0 };
    if (yaw !== undefined) this.state.yaw = yaw;
    if (pitch !== undefined) this.state.pitch = pitch;
  }

  /**
   * Apply damage, honouring invulnerability frames so a creature standing in
   * contact cannot drain the player at tick rate. Creative players are immune.
   * Returns true when the hit actually landed.
   */
  hurt(amount: number): boolean {
    const s = this.state;
    if (amount <= 0 || s.gameMode === GameMode.Creative) return false;
    if (this.invulnerable > 0 || s.stats.health <= 0) return false;
    this.invulnerable = HURT_INVULNERABILITY;
    s.stats.health = Math.max(0, s.stats.health - amount);
    return true;
  }

  respawn(): void {
    this.invulnerable = 0;
    this.state.stats.health = this.state.stats.maxHealth;
    this.state.stats.hunger = 20;
    this.state.stats.fallDistance = 0;
  }

  serialize(): PlayerState {
    return structuredClone(this.state);
  }

  restore(state: PlayerState): void {
    Object.assign(this.state, structuredClone(state));
  }
}
