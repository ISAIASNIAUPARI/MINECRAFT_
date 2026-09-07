import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Game } from './game';
import { App } from './ui/App';
import { log } from './core/Logger';
import './ui/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root element missing from index.html');

const game = new Game();

createRoot(container).render(
  <StrictMode>
    <App bridge={game.getBridge()} />
  </StrictMode>,
);

log.info('Voxelia bootstrapped');

// Expose for debugging in the browser console (dev only).
if (import.meta.env.DEV) {
  (window as unknown as { __voxelia: Game }).__voxelia = game;
}
