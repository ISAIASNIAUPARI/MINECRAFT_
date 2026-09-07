import { useEffect, useRef, useState } from 'react';
import { GAME_NAME } from '../core/constants';
import type { GameBridge } from '../game/types';
import { useGameSnapshot } from './useGameSnapshot';
import { MainMenu } from './screens/MainMenu';
import { CreateWorld } from './screens/CreateWorld';
import { PauseMenu } from './screens/PauseMenu';
import { InventoryScreen } from './screens/InventoryScreen';
import { Hud } from './hud/Hud';
import { DebugOverlay } from './hud/DebugOverlay';

type MenuScreen = 'menu' | 'create';

/**
 * SKELETON UI. Phase 1 (Agent: UI) expands screens (settings, controls remap,
 * world list), the inventory drag/drop model, and visual polish. The engine
 * boundary — {@link GameBridge} — is frozen.
 */
export function App({ bridge }: { bridge: GameBridge }): JSX.Element {
  const snap = useGameSnapshot(bridge);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('menu');

  useEffect(() => {
    if (canvasRef.current) bridge.attachCanvas(canvasRef.current);
  }, [bridge]);

  const inGame = snap.phase === 'playing' || snap.phase === 'paused' || snap.phase === 'loading';

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" hidden={!inGame} />

      {snap.phase === 'menu' && menuScreen === 'menu' && (
        <MainMenu gameName={GAME_NAME} onPlay={() => setMenuScreen('create')} />
      )}
      {snap.phase === 'menu' && menuScreen === 'create' && (
        <CreateWorld
          onCancel={() => setMenuScreen('menu')}
          onCreate={(opts) => {
            setMenuScreen('menu');
            void bridge.startNewWorld(opts);
          }}
        />
      )}

      {snap.phase === 'loading' && (
        <div className="overlay center">
          <div className="panel">
            <h2>{snap.loading?.label ?? 'Loading'}</h2>
            <progress value={snap.loading?.progress ?? 0} max={1} />
          </div>
        </div>
      )}

      {snap.phase === 'error' && (
        <div className="overlay center">
          <div className="panel">
            <h2>Something went wrong</h2>
            <pre className="error">{snap.error}</pre>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      )}

      {snap.phase === 'playing' && !snap.inventoryOpen && <Hud snapshot={snap} />}
      {snap.showDebug && snap.debug && <DebugOverlay debug={snap.debug} />}

      {snap.inventoryOpen && <InventoryScreen bridge={bridge} onClose={() => bridge.toggleInventory()} />}

      {snap.phase === 'paused' && !snap.inventoryOpen && (
        <PauseMenu onResume={() => bridge.resume()} onExit={() => void bridge.exitToMenu()} />
      )}
    </div>
  );
}
