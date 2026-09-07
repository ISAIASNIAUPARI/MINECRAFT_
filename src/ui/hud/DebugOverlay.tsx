import { GAME_NAME, GAME_VERSION } from '../../core/constants';
import type { DebugSnapshot } from '../../game/types';

export function DebugOverlay({ debug }: { debug: DebugSnapshot }): JSX.Element {
  const rows: [string, string | number][] = [
    [`${GAME_NAME} ${GAME_VERSION}`, `${debug.fps} fps (${debug.frameMs} ms)`],
    ['XYZ', `${debug.x} / ${debug.y} / ${debug.z}`],
    ['Facing', debug.facing],
    ['Biome', debug.biome],
    ['Seed', debug.seed],
    ['Chunks', `${debug.chunksRendered} rendered / ${debug.chunksLoaded} loaded`],
    ['Geometry', `${debug.triangles.toLocaleString()} tris · ${debug.drawCalls} draws`],
    ['Entities', debug.entities],
    ['World time', `${debug.worldTime} ticks`],
    ['Memory', debug.memoryMB !== null ? `${debug.memoryMB} MB` : 'n/a'],
    ['Target', debug.targetBlock ?? '—'],
  ];
  return (
    <div className="debug-overlay">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}
