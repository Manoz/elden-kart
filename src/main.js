import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');

try {
  const game = new Game(canvas, uiRoot);
  window.__game = game;
  game.run().catch((err) => console.error('[elden-kart] fatal', err));
} catch (err) {
  console.error('[elden-kart] failed to start', err);
  uiRoot.textContent = 'Elden Kart failed to start. See the console for details.';
  uiRoot.style.cssText +=
    ';color:#e8c766;font:20px serif;display:flex;align-items:center;justify-content:center;text-align:center';
}
