// Standalone driver for the UI and audio modules (see ui-viewer.html).
import { CHARACTERS, TRACKS, ITEMS } from '../core/data.js';
import { UI } from './UI.js';
import { AudioSystem, SFX_NAMES, MUSIC_IDS } from '../audio/Audio.js';
import { bus } from '../core/bus.js';

const ui = new UI(document.getElementById('ui'));
const audio = new AudioSystem();
window.ui = ui;
window.audio = audio;
window.AudioSystem = AudioSystem;
const ctl = document.getElementById('ctl');
const logEl = document.getElementById('log');
const log = (m) => {
  logEl.textContent = `${m}\n${logEl.textContent}`.slice(0, 2000);
};

const row = (label, buttons) => {
  const d = document.createElement('div');
  d.append(`${label}: `);
  for (const [t, fn] of buttons) {
    const b = document.createElement('button');
    b.textContent = t;
    b.onclick = () => {
      audio.init();
      fn();
    };
    d.appendChild(b);
  }
  ctl.appendChild(d);
};

// fake race data
let hudTimer = 0;
function startFakeHUD() {
  ui.showHUD();
  const t0 = performance.now();
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([Math.cos(a) * 200 + Math.cos(a * 3) * 40, Math.sin(a) * 120 + Math.sin(a * 2) * 30]);
  }
  const bounds = { minX: -240, maxX: 240, minZ: -150, maxZ: 150 };
  const items = Object.values(ITEMS);
  let item = null,
    rolling = false;
  clearInterval(hudTimer);
  hudTimer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const phase = Math.floor(t / 6) % 3;
    if (Math.floor(t) % 6 === 0 && !rolling && !item) {
      rolling = true;
      setTimeout(() => {
        rolling = false;
        item = items[Math.floor(Math.random() * items.length)];
        setTimeout(() => {
          item = null;
        }, 3500);
      }, 1200);
    }
    const karts = CHARACTERS.map((c, i) => {
      const a = t * 0.3 - i * 0.18;
      return {
        x: Math.cos(a) * 200 + Math.cos(a * 3) * 40,
        z: Math.sin(a) * 120 + Math.sin(a * 2) * 30,
        color: c.color,
        isPlayer: i === 0,
      };
    });
    ui.updateHUD({
      position: 1 + (Math.floor(t / 5) % 8),
      racers: 8,
      lap: 2,
      laps: 3,
      item,
      itemRolling: rolling,
      speed: 20 + 22 * Math.abs(Math.sin(t * 0.5)) + (phase === 2 ? 15 : 0),
      lapTime: t % 90,
      totalTime: 65 + t,
      boost: phase === 2,
      driftLevel: phase === 1 ? Math.floor(t % 6) % 4 : 0,
      minimap: { points: pts, bounds, karts },
      message: Math.floor(t) % 10 === 3 ? 'Item acquired' : '',
    });
    audio.setEngine(Math.abs(Math.sin(t * 0.5)) * 0.8, phase === 2);
  }, 16);
}

const rows = (playerPlace) =>
  CHARACTERS.map((c, i) => ({
    place: i + 1,
    name: c.name,
    color: c.color,
    time: 80 + i * 2.37,
    isPlayer: i + 1 === playerPlace,
  }));

async function flow() {
  ui.showLoading(0.3);
  await new Promise((r) => setTimeout(r, 300));
  ui.showLoading(1);
  await ui.showTitle();
  audio.init();
  audio.playMusic('menu');
  const sel = await ui.showSelect({ characters: CHARACTERS, tracks: TRACKS });
  log(`selected ${JSON.stringify(sel)}`);
  audio.playMusic(TRACKS.find((t) => t.id === sel.trackId).music);
  await ui.countdown();
  startFakeHUD();
  ui.banner('Final Lap', 'The Erdtree watches');
}
window.flow = flow;

row('flow', [
  ['start flow', flow],
  ['title', () => ui.showTitle().then(() => log('title done'))],
  [
    'select',
    () =>
      ui.showSelect({ characters: CHARACTERS, tracks: TRACKS }).then((r) => log(JSON.stringify(r))),
  ],
  ['HUD on', startFakeHUD],
  [
    'HUD off',
    () => {
      clearInterval(hudTimer);
      ui.hideHUD();
      audio.stopEngine();
    },
  ],
  ['countdown', () => ui.countdown().then(() => log('GO'))],
  ['pause', () => ui.showPause().then((r) => log(`pause: ${r}`))],
  ['results 1st', () => ui.showResults(rows(1)).then((r) => log(`results: ${r}`))],
  ['results 3rd', () => ui.showResults(rows(3)).then((r) => log(`results: ${r}`))],
  ['results 7th', () => ui.showResults(rows(7)).then((r) => log(`results: ${r}`))],
]);
row('banner', [
  ['FINAL LAP', () => ui.banner('Final Lap', 'One more circuit')],
  ['GREAT RUNE', () => ui.banner('Great Rune Restored', 'Item alert')],
  ['SPUN OUT', () => ui.banner('Spun Out', 'You have been struck', 2000)],
]);
row('music', [
  ...MUSIC_IDS.map((id) => [id, () => audio.playMusic(id)]),
  ['stop', () => audio.stopMusic()],
]);
row(
  'sfx',
  SFX_NAMES.map((n) => [n, () => audio.sfx(n, { level: 2 })])
);
row('audio', [
  ['muffle on', () => audio.setListenerMuffle(true)],
  ['muffle off', () => audio.setListenerMuffle(false)],
  ['mute', () => audio.mute(true)],
  ['unmute', () => audio.mute(false)],
]);
row('bus events', [
  ['kart:hit', () => bus.emit('kart:hit', { kart: { isPlayer: true }, kind: 'spin' })],
  ['item:got', () => bus.emit('item:got', { kart: { isPlayer: true }, item: 'x' })],
  ['race:lap', () => bus.emit('race:lap', { kart: { isPlayer: true }, lap: 2 })],
]);
row('measure', [
  [
    'levels (all)',
    async () => {
      for (const id of MUSIC_IDS)
        log(`music ${id}: ${JSON.stringify(await AudioSystem.measure('music', id, 12))}`);
      for (const n of SFX_NAMES)
        log(`sfx ${n}: ${JSON.stringify(await AudioSystem.measure('sfx', n, 3, { level: 3 }))}`);
    },
  ],
]);
