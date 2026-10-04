import type { GameMode, Difficulty } from '../core/types';

/**
 * CONTRACT — the boundary between the React UI and the engine. The UI ONLY talks
 * to {@link GameBridge}: it reads immutable snapshots and calls commands. It never
 * imports engine/rendering/world code directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDITIONS POLICY: fields/members may be ADDED (never renamed or removed).
 * Everything the Phase-1 UI agent added below is OPTIONAL (`?:`) so the existing
 * engine (`Game.ts`, `GameBridgeImpl.ts`) still satisfies the interface with no
 * change. Each block is tagged `WIRING NOTE:` — that is what the integrator must
 * populate / handle on the engine side in `src/game/`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type GamePhase =
  | 'menu' // main menu, no world
  | 'creating' // world being created
  | 'loading' // world loading / initial chunks
  | 'playing' // pointer locked, simulation running
  | 'paused' // pause menu / inventory open, simulation frozen
  | 'error';

export interface NewWorldOptions {
  name: string;
  seed: string;
  gameMode: GameMode;
  difficulty: Difficulty;
}

export interface HotbarSlotView {
  itemName: string;
  displayName: string;
  count: number;
  texture: string;
  /** 0..1 remaining, or null if not damageable. */
  durability: number | null;
}

/** Crack overlay + progress on the block currently being mined. */
export interface MiningProgressView {
  /** 0..1 break progress of the targeted block. */
  progress: number;
  /** 0..9 discrete crack stage (drives which overlay sprite/opacity to show). */
  stage: number;
  /** World coords of the block being mined, for aligning the overlay. */
  block: { x: number; y: number; z: number };
}

/** One armour slot's display data. */
export interface ArmorSlotView {
  itemName: string;
  displayName: string;
  texture: string;
  /** 0..1 remaining, or null if not damageable. */
  durability: number | null;
  /** Armour points this piece contributes (half-shields). */
  defense: number;
}

/** A single "you picked up N x item" entry for the stacked pickup toast. */
export interface PickupToastView {
  /** Monotonic id — the UI keys its animation off this. */
  id: number;
  itemName: string;
  displayName: string;
  texture: string;
  /** Running total collected in this toast's lifetime. */
  count: number;
}

export interface HudSnapshot {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  xpLevel: number;
  xpProgress: number; // 0..1
  gameMode: GameMode;
  hotbar: (HotbarSlotView | null)[]; // length 9
  selectedSlot: number; // 0..8
  /** Short-lived pickup / status toast text. */
  toast: string | null;
  /**
   * ADDITIVE (optional). The held weapon's ammunition. Absent when nothing is
   * held, so a UI that ignores it still renders correctly.
   */
  weapon?: { name: string; slot: number; ammo: number; magazine: number; reloading: boolean } | null;
  /**
   * ADDITIVE (optional). Everything the minimap needs: where the player is and
   * what is around them. Positions are world coordinates; the UI does the
   * projection, so the game never has to know the map's size on screen.
   */
  map?: {
    playerX: number;
    playerZ: number;
    /** Facing in radians, for the heading wedge. */
    yaw: number;
    /** Half-extent of the world in blocks, or null when it is endless. */
    border: number | null;
    /** One entry per living creature. `big` marks the ones worth seeing early. */
    blips: { x: number; z: number; big: boolean; hostile: boolean }[];
  } | null;

  // ── Phase-1 UI additions ─────────────────────────────────────────────
  // WIRING NOTE (src/game/Game.ts → pushHud): populate these from
  // PlayerController.state / PlayerInventory. All optional; the HUD renders
  // sensible fallbacks (hidden armour/air rows, no crack overlay) when absent.

  /** Total armour points 0..20 (half-shields). Omit/0 hides the armour row. */
  armor?: number;
  maxArmor?: number;
  /** The 4 armour slots (head, chest, legs, feet order). */
  armorSlots?: (ArmorSlotView | null)[];
  /** Breath 0..maxAir. Only shown while under a fluid (air < maxAir). */
  air?: number;
  maxAir?: number;
  /** Yellow "absorption" hearts stacked on top of health. */
  absorption?: number;
  /** Registry name of the just-selected item — drives the item-name popup. */
  heldItemName?: string | null;
  /** Non-null while the player is breaking a block. */
  mining?: MiningProgressView | null;
  /** Stacked pickup toasts, newest last. Replaces the single `toast` string when present. */
  pickups?: PickupToastView[];
}

export interface DebugSnapshot {
  fps: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  biome: string;
  facing: string;
  chunksLoaded: number;
  chunksRendered: number;
  triangles: number;
  drawCalls: number;
  entities: number;
  seed: number;
  worldTime: number;
  memoryMB: number | null;
  targetBlock: string | null;
}

export interface LoadingSnapshot {
  label: string;
  progress: number; // 0..1
}

/** One immutable object React subscribes to. Replaced wholesale on change. */
export interface GameSnapshot {
  phase: GamePhase;
  worldName: string | null;
  hud: HudSnapshot | null;
  debug: DebugSnapshot | null;
  loading: LoadingSnapshot | null;
  showDebug: boolean;
  inventoryOpen: boolean;
  error: string | null;
}

export interface GameBridge {
  /** Current snapshot (for `useSyncExternalStore`). */
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;

  /** Attach the WebGL canvas once React has mounted it. */
  attachCanvas(canvas: HTMLCanvasElement): void;

  // commands ---------------------------------------------------------------
  startNewWorld(options: NewWorldOptions): Promise<void>;
  resumeWorld(worldId: string): Promise<void>;
  pause(): void;
  resume(): void;
  exitToMenu(): Promise<void>;
  toggleDebug(): void;
  toggleInventory(): void;
  saveNow(): Promise<void>;

  /** Keybindings surface for the controls screen. */
  readonly input: import('../input/types').IInputManager;
}
