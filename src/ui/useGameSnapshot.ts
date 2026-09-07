import { useSyncExternalStore } from 'react';
import type { GameBridge, GameSnapshot } from '../game/types';

/** Subscribe a component to the engine's immutable snapshot stream. */
export function useGameSnapshot(bridge: GameBridge): GameSnapshot {
  return useSyncExternalStore(
    (cb) => bridge.subscribe(cb),
    () => bridge.getSnapshot(),
    () => bridge.getSnapshot(),
  );
}
