export function PauseMenu({
  onResume,
  onExit,
}: {
  onResume: () => void;
  onExit: () => void;
}): JSX.Element {
  return (
    <div className="overlay center menu dim">
      <div className="menu-buttons">
        <h2>Paused</h2>
        <button className="primary" onClick={onResume}>
          Resume
        </button>
        <button onClick={onExit}>Save &amp; Quit to Menu</button>
      </div>
    </div>
  );
}
