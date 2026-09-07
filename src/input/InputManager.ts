import { createLogger } from '../core/Logger';
import { BINDINGS_STORAGE_KEY, DEFAULT_BINDINGS } from './keybindings';
import type {
  BindingCode,
  IInputManager,
  InputAction,
  KeyBindings,
  PointerDelta,
} from './types';

const logk = createLogger('input');

/**
 * Real implementation — keyboard + mouse + pointer lock + remappable bindings
 * persisted to localStorage. Phase 1 (Agent: player/physics) only wires the
 * remap UI to {@link setBinding}; the core here is complete.
 */
export class InputManager implements IInputManager {
  private target: HTMLElement | null = null;
  private bindings: KeyBindings = structuredCloneBindings(DEFAULT_BINDINGS);
  private codeToActions = new Map<BindingCode, InputAction[]>();

  private readonly down = new Set<BindingCode>();
  private readonly pressedThisFrame = new Set<InputAction>();
  private pointer: PointerDelta = { dx: 0, dy: 0 };
  private wheel = 0;

  private _pointerLocked = false;
  private enabled = true;

  constructor() {
    this.rebuildLookup();
  }

  get pointerLocked(): boolean {
    return this._pointerLocked;
  }

  attach(target: HTMLElement): void {
    this.detach();
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', this.onContextMenu);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('click', this.onClickToLock);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.target) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('click', this.onClickToLock);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    this.target = null;
  }

  isDown(action: InputAction): boolean {
    if (!this.enabled) return false;
    for (const code of this.bindings[action]) if (this.down.has(code)) return true;
    return false;
  }

  consumePressed(action: InputAction): boolean {
    if (!this.pressedThisFrame.has(action)) return false;
    this.pressedThisFrame.delete(action);
    return true;
  }

  readPointerDelta(): PointerDelta {
    const d = this.pointer;
    this.pointer = { dx: 0, dy: 0 };
    return d;
  }

  readWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.down.clear();
      this.pressedThisFrame.clear();
      this.pointer = { dx: 0, dy: 0 };
    }
  }

  getBindings(): KeyBindings {
    return structuredCloneBindings(this.bindings);
  }

  setBinding(action: InputAction, codes: BindingCode[]): void {
    this.bindings[action] = [...codes];
    this.rebuildLookup();
    this.save();
  }

  resetBindings(): void {
    this.bindings = structuredCloneBindings(DEFAULT_BINDINGS);
    this.rebuildLookup();
    this.save();
  }

  save(): void {
    try {
      localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(this.bindings));
    } catch (err) {
      logk.warn('could not persist bindings', err);
    }
  }

  load(): void {
    try {
      const raw = localStorage.getItem(BINDINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<KeyBindings>;
      this.bindings = { ...structuredCloneBindings(DEFAULT_BINDINGS), ...parsed };
      this.rebuildLookup();
    } catch (err) {
      logk.warn('could not load bindings', err);
    }
  }

  requestPointerLock(): void {
    try {
      const result = this.target?.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* pointer lock unavailable (e.g. embedded preview) — ignore */
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Call at the end of each frame after game systems have read input. */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }

  // --- listeners -------------------------------------------------------------

  private rebuildLookup(): void {
    this.codeToActions.clear();
    for (const action of Object.keys(this.bindings) as InputAction[]) {
      for (const code of this.bindings[action]) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }
  }

  private press(code: BindingCode): void {
    if (!this.enabled) return;
    if (!this.down.has(code)) {
      this.down.add(code);
      for (const action of this.codeToActions.get(code) ?? []) this.pressedThisFrame.add(action);
    }
  }

  private release(code: BindingCode): void {
    this.down.delete(code);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (this.enabled && this.codeToActions.has(e.code)) e.preventDefault();
    this.press(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.release(e.code);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.press(`Mouse${e.button}`);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.release(`Mouse${e.button}`);
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.wheel += e.deltaY > 0 ? -1 : 1;
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this._pointerLocked || !this.enabled) return;
    this.pointer.dx += e.movementX;
    this.pointer.dy += e.movementY;
  };

  private readonly onClickToLock = (): void => {
    if (this.enabled && !this._pointerLocked) this.requestPointerLock();
  };

  private readonly onPointerLockChange = (): void => {
    this._pointerLocked = document.pointerLockElement === this.target;
  };

  private readonly onBlur = (): void => {
    this.down.clear();
    this.pressedThisFrame.clear();
  };
}

function structuredCloneBindings(b: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const key of Object.keys(b) as InputAction[]) out[key] = [...b[key]];
  return out;
}
