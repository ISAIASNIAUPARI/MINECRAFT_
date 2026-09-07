import type { IInputManager } from '../input/types';
import type { GameBridge, GameSnapshot, NewWorldOptions } from './types';

const EMPTY_SNAPSHOT: GameSnapshot = {
  phase: 'menu',
  worldName: null,
  hud: null,
  debug: null,
  loading: null,
  showDebug: false,
  inventoryOpen: false,
  error: null,
};

export interface GameCommands {
  startNewWorld(options: NewWorldOptions): Promise<void>;
  resumeWorld(worldId: string): Promise<void>;
  pause(): void;
  resume(): void;
  exitToMenu(): Promise<void>;
  toggleDebug(): void;
  toggleInventory(): void;
  saveNow(): Promise<void>;
  attachCanvas(canvas: HTMLCanvasElement): void;
}

/**
 * The single object the React tree talks to. Holds the current immutable
 * {@link GameSnapshot} and notifies subscribers (via `useSyncExternalStore`).
 * The engine calls {@link setSnapshot}; nothing in `src/ui` imports engine code.
 */
export class GameBridgeImpl implements GameBridge {
  private snapshot: GameSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly commands: GameCommands,
    readonly input: IInputManager,
  ) {}

  getSnapshot(): GameSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSnapshot(patch: Partial<GameSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.commands.attachCanvas(canvas);
  }
  startNewWorld(options: NewWorldOptions): Promise<void> {
    return this.commands.startNewWorld(options);
  }
  resumeWorld(worldId: string): Promise<void> {
    return this.commands.resumeWorld(worldId);
  }
  pause(): void {
    this.commands.pause();
  }
  resume(): void {
    this.commands.resume();
  }
  exitToMenu(): Promise<void> {
    return this.commands.exitToMenu();
  }
  toggleDebug(): void {
    this.commands.toggleDebug();
  }
  toggleInventory(): void {
    this.commands.toggleInventory();
  }
  saveNow(): Promise<void> {
    return this.commands.saveNow();
  }
}
