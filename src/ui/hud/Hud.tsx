import { GameMode } from '../../core/types';
import type { GameSnapshot } from '../../game/types';

export function Hud({ snapshot }: { snapshot: GameSnapshot }): JSX.Element | null {
  const hud = snapshot.hud;
  if (!hud) return null;
  const survival = hud.gameMode === GameMode.Survival;

  return (
    <div className="hud">
      <div className="crosshair" />

      {survival && (
        <div className="hud-bars">
          <Bar className="health" value={hud.health} max={hud.maxHealth} />
          <Bar className="hunger" value={hud.hunger} max={hud.maxHunger} align="right" />
        </div>
      )}

      <div className="hotbar">
        {hud.hotbar.map((slot, i) => (
          <div className={`hotbar-slot${hud.selectedSlot === i ? ' selected' : ''}`} key={i}>
            {slot && (
              <>
                <span className="hotbar-item" title={slot.displayName}>
                  {abbr(slot.displayName)}
                </span>
                {slot.count > 1 && <span className="hotbar-count">{slot.count}</span>}
                {slot.durability !== null && slot.durability < 1 && (
                  <span className="durability" style={{ width: `${slot.durability * 100}%` }} />
                )}
              </>
            )}
            <span className="hotbar-index">{i + 1}</span>
          </div>
        ))}
      </div>

      {snapshot.debug && <div className="hud-coords">{snapshot.debug.x} / {snapshot.debug.y} / {snapshot.debug.z}</div>}
    </div>
  );
}

function Bar({
  className,
  value,
  max,
  align = 'left',
}: {
  className: string;
  value: number;
  max: number;
  align?: 'left' | 'right';
}): JSX.Element {
  const pips = Math.round(max / 2);
  const filled = value / 2;
  return (
    <div className={`bar ${className} ${align}`}>
      {Array.from({ length: pips }, (_, i) => (
        <span key={i} className={`pip ${i < Math.floor(filled) ? 'full' : i < filled ? 'half' : 'empty'}`} />
      ))}
    </div>
  );
}

function abbr(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}
