import type { HudSnapshot } from '../../game/types';

/**
 * A top-down minimap showing where the creatures are.
 *
 * It draws the whole world when the world is finite, so nothing can be off the
 * edge of the map — in a bounded arena a radar that scrolls would be worse than
 * one that simply shows everything. With an endless world it falls back to a
 * fixed radius around the player.
 *
 * Pure presentation: it is handed world coordinates and does the projection
 * itself, so the game never needs to know how big the map is on screen.
 */

/** Size of the map in CSS pixels. */
const SIZE = 150;
/** Radius shown around the player when the world has no border, in blocks. */
const FALLBACK_RADIUS = 60;

export function Minimap({ hud }: { hud: HudSnapshot }): JSX.Element | null {
  const map = hud.map;
  if (!map) return null;

  // Half-extent in blocks that the map covers.
  const half = map.border ?? FALLBACK_RADIUS;
  // Centred on the world for a bounded world, on the player for an endless one.
  const centreX = map.border !== null ? 0 : map.playerX;
  const centreZ = map.border !== null ? 0 : map.playerZ;

  const project = (x: number, z: number): { left: number; top: number } => ({
    // +X is right; +Z is *south*, which is down on a top-down map.
    left: ((x - centreX) / half) * (SIZE / 2) + SIZE / 2,
    top: ((z - centreZ) / half) * (SIZE / 2) + SIZE / 2,
  });

  const player = project(map.playerX, map.playerZ);

  return (
    <div className="minimap" style={{ width: SIZE, height: SIZE }}>
      {map.border !== null && <div className="minimap-border" />}

      {map.blips.map((b, i) => {
        const p = project(b.x, b.z);
        // Clamp to the edge so something just outside still reads as a
        // direction rather than vanishing.
        const left = Math.max(3, Math.min(SIZE - 3, p.left));
        const top = Math.max(3, Math.min(SIZE - 3, p.top));
        const cls = `minimap-blip${b.big ? ' big' : ''}${b.hostile ? ' hostile' : ''}`;
        return <span key={i} className={cls} style={{ left, top }} />;
      })}

      <span
        className="minimap-player"
        style={{
          left: player.left,
          top: player.top,
          // Yaw 0 looks -Z, which is up on the map; the wedge points that way.
          transform: `translate(-50%, -50%) rotate(${-map.yaw}rad)`,
        }}
      />

      <span className="minimap-count">{map.blips.length}</span>
    </div>
  );
}
