import { GAME_VERSION } from '../../core/constants';

export function MainMenu({
  gameName,
  onPlay,
}: {
  gameName: string;
  onPlay: () => void;
}): JSX.Element {
  return (
    <div className="overlay center menu">
      <div className="menu-brand">
        <h1>{gameName}</h1>
        <p className="tagline">An original voxel sandbox</p>
      </div>
      <div className="menu-buttons">
        <button className="primary" onClick={onPlay}>
          Play
        </button>
        <button disabled title="Phase 4">
          Mods
        </button>
        <button disabled title="Phase 1 · Agent UI">
          Settings
        </button>
      </div>
      <footer className="menu-footer">
        v{GAME_VERSION} · not affiliated with Minecraft · MIT
      </footer>
    </div>
  );
}
