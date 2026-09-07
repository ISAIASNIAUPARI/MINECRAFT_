import type { GameBridge } from '../../game/types';
import { useGameSnapshot } from '../useGameSnapshot';

/**
 * SKELETON — shows the hotbar contents read-only. Phase 1 (Agent: UI) builds the
 * full grid: 27 main slots, 4 armor, offhand, a 2x2 crafting area with a live
 * result, and the drag / split / shift-click interaction model.
 */
export function InventoryScreen({
  bridge,
  onClose,
}: {
  bridge: GameBridge;
  onClose: () => void;
}): JSX.Element {
  const snap = useGameSnapshot(bridge);
  const hotbar = snap.hud?.hotbar ?? [];

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel inventory" onClick={(e) => e.stopPropagation()}>
        <h2>Inventory</h2>
        <p className="hint">Full grid + crafting arrives with the UI agent. Press E or Esc to close.</p>
        <div className="slot-grid">
          {hotbar.map((slot, i) => (
            <div className={`slot${snap.hud?.selectedSlot === i ? ' selected' : ''}`} key={i}>
              {slot && (
                <>
                  <span className="slot-name">{slot.displayName}</span>
                  {slot.count > 1 && <span className="slot-count">{slot.count}</span>}
                </>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
