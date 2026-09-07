import { useState } from 'react';
import { Difficulty, GameMode } from '../../core/types';
import type { NewWorldOptions } from '../../game/types';

export function CreateWorld({
  onCreate,
  onCancel,
}: {
  onCreate: (options: NewWorldOptions) => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('New World');
  const [seed, setSeed] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.Survival);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Normal);

  return (
    <div className="overlay center menu">
      <div className="panel">
        <h2>Create World</h2>
        <label>
          World name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} />
        </label>
        <label>
          Seed <span className="hint">(blank = random)</span>
          <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. voxelia-42" />
        </label>
        <label>
          Game mode
          <select value={gameMode} onChange={(e) => setGameMode(e.target.value as GameMode)}>
            <option value={GameMode.Survival}>Survival</option>
            <option value={GameMode.Creative}>Creative</option>
          </select>
        </label>
        <label>
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {Object.values(Difficulty).map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button onClick={onCancel}>Back</button>
          <button
            className="primary"
            onClick={() => onCreate({ name: name.trim() || 'New World', seed: seed.trim(), gameMode, difficulty })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
