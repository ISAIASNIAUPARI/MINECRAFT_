import type { BlockId } from './types';

/**
 * Global engine constants. Anything here is a hard invariant that other modules
 * may rely on at compile time (e.g. array sizing, bit shifts).
 */

/** Edge length of a cubic chunk, in blocks. Must stay a power of two. */
export const CHUNK_SIZE = 16;
/** `log2(CHUNK_SIZE)` — used to convert world <-> chunk coords with `>>` / `<<`. */
export const CHUNK_SIZE_BITS = 4;
/** `CHUNK_SIZE - 1` — used to extract local coords with `& CHUNK_SIZE_MASK`. */
export const CHUNK_SIZE_MASK = CHUNK_SIZE - 1;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/** Vertical world bounds in blocks: valid Y is `[WORLD_MIN_Y, WORLD_MAX_Y)`. */
export const WORLD_MIN_Y = 0;
export const WORLD_MAX_Y = 256;
export const WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y;
/** Number of stacked chunks in a world column. */
export const WORLD_COLUMN_CHUNKS = WORLD_HEIGHT / CHUNK_SIZE;
export const WORLD_MIN_CHUNK_Y = WORLD_MIN_Y >> CHUNK_SIZE_BITS;
export const WORLD_MAX_CHUNK_Y = (WORLD_MAX_Y >> CHUNK_SIZE_BITS) - 1;

/** Default ocean surface height. */
export const SEA_LEVEL = 62;

/** Block id `0` is always air and is never rendered or collided with. */
export const AIR: BlockId = 0;
export const MAX_BLOCK_ID = 0xffff;

/** Fixed simulation rate. Gameplay logic runs at this rate regardless of frame rate. */
export const TICKS_PER_SECOND = 20;
export const TICK_DURATION_MS = 1000 / TICKS_PER_SECOND;
export const TICK_DURATION_S = 1 / TICKS_PER_SECOND;
/** Longest frame delta we integrate; anything larger (tab switch, GC stall) is clamped. */
export const MAX_FRAME_MS = 250;
/** Ceiling on catch-up ticks per frame to avoid the "spiral of death". */
export const MAX_TICKS_PER_FRAME = 5;

/** Chunk radius defaults; overridable through world/user settings. */
export const DEFAULT_RENDER_DISTANCE = 8;
export const DEFAULT_SIMULATION_DISTANCE = 6;
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 24;

/** Player physics defaults (blocks, blocks/s, blocks/s^2). Tunable by the player module. */
export const GRAVITY = 28;
export const TERMINAL_VELOCITY = 78;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_WIDTH = 0.6;
export const PLAYER_REACH = 5;

/** Identifier surfaced in UI, docs, and window title. Placeholder codename — safe to rename. */
export const GAME_NAME = 'Voxelia';
export const GAME_VERSION = '0.1.0';
/** Bumped whenever the persisted save format changes (used by the storage module). */
export const SAVE_FORMAT_VERSION = 1;
