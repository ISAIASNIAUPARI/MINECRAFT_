import type { GameMode, Difficulty } from '../core/types';

/**
 * CONTRACT — the boundary between the React UI and the engine. The UI ONLY talks
 * to {@link GameBridge}: it reads immutable snapshots and calls commands. It never
 * imports engine/rendering/world code directly.
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
