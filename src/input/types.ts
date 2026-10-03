/**
 * CONTRACT — input abstraction. The player module reads intents; the UI reads
 * bindings for the controls screen. Nothing else touches raw DOM events.
 */

/** Logical actions the game understands. Bindings map physical keys/buttons to these. */
export type InputAction =
  | 'move_forward'
  | 'move_back'
  | 'move_left'
  | 'move_right'
  | 'jump'
  | 'sneak'
  | 'sprint'
  | 'attack' // left mouse — break block / hit
  | 'use' // right mouse — place block / interact
  | 'pick_block' // middle mouse
  | 'drop_item'
  | 'open_inventory'
  | 'toggle_perspective'
  | 'toggle_debug'
  | 'debug_spawn' // dev: drop the test creature in front of the player
  | 'reload'
  | 'chat_or_command'
  | 'pause'
  | 'hotbar_1'
  | 'hotbar_2'
  | 'hotbar_3'
  | 'hotbar_4'
  | 'hotbar_5'
  | 'hotbar_6'
  | 'hotbar_7'
  | 'hotbar_8'
  | 'hotbar_9';

/** A physical binding. `code` is a `KeyboardEvent.code` or one of the mouse tokens. */
export type BindingCode = string; // 'KeyW', 'Space', 'ShiftLeft', 'Mouse0', 'Mouse1', 'Mouse2', 'WheelUp'...

export type KeyBindings = Record<InputAction, BindingCode[]>;

export interface PointerDelta {
  dx: number;
  dy: number;
}

export interface IInputManager {
  /** Begin listening on the given element; requests pointer lock on click. */
  attach(target: HTMLElement): void;
  detach(): void;

  /** Held this frame. */
  isDown(action: InputAction): boolean;
  /** True only on the frame the action went down; consumed so it fires once. */
  consumePressed(action: InputAction): boolean;

  /** Accumulated mouse movement since last call (pointer-locked), then reset. */
  readPointerDelta(): PointerDelta;
  /** Accumulated wheel ticks since last call (+1 per notch up), then reset. */
  readWheel(): number;

  /** Whether the pointer is currently locked (i.e. we're in "gameplay" input mode). */
  readonly pointerLocked: boolean;
  /** Suspend gameplay input while a menu/inventory is open (still tracks nothing). */
  setEnabled(enabled: boolean): void;

  getBindings(): KeyBindings;
  setBinding(action: InputAction, codes: BindingCode[]): void;
  resetBindings(): void;

  /** Persist / restore bindings (localStorage under the hood). */
  save(): void;
  load(): void;
}
