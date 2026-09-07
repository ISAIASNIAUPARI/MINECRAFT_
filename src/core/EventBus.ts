/**
 * A tiny typed publish/subscribe bus.
 *
 * Phase 1 uses it sparingly (engine <-> game wiring). Phase 4 layers the full
 * modding event catalogue (`onBlockBreak`, `onEntitySpawn`, ...) on top of this
 * same primitive, so keep the surface minimal and allocation-free on `emit`.
 */

export type EventMap = Record<string, unknown>;

export type Listener<T> = (payload: T) => void;

export interface Unsubscribe {
  (): void;
}

export class EventBus<TEvents extends EventMap> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<unknown>>>();

  on<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(type, listener);
  }

  once<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): Unsubscribe {
    const wrapped: Listener<TEvents[K]> = (payload) => {
      this.off(type, wrapped);
      listener(payload);
    };
    return this.on(type, wrapped);
  }

  off<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): void {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(listener as Listener<unknown>);
    if (set.size === 0) this.listeners.delete(type);
  }

  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // Iterate a copy so listeners may unsubscribe (or subscribe) during dispatch.
    for (const listener of [...set]) {
      try {
        (listener as Listener<TEvents[K]>)(payload);
      } catch (err) {
        console.error(`EventBus: listener for "${String(type)}" threw`, err);
      }
    }
  }

  listenerCount(type: keyof TEvents): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
