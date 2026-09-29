// Procedural canvas art: character emblems, track previews, item icons, ember particles.
import { ITEMS } from '../core/data.js';

export const GOLD = '#c9a94f';

export function cssColor(c, alpha = 1) {
  if (typeof c === 'string') return c;
  const r = (c >> 16) & 255,
    g = (c >> 8) & 255,
    b = c & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function mix(c, target, amt) {
  const r = (c >> 16) & 255,
    g = (c >> 8) & 255,
    b = c & 255;
  const tr = (target >> 16) & 255,
    tg = (target >> 8) & 255,
    tb = target & 255;
  return `rgb(${Math.round(r + (tr - r) * amt)},${Math.round(g + (tg - g) * amt)},${Math.round(b + (tb - b) * amt)})`;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poly(c, pts) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

// ------------------------------------------------------------------------------------ emblems

export function drawEmblem(cv, ch) {
  const c = cv.getContext('2d');
  const S = cv.width;
  c.clearRect(0, 0, S, S);
  c.save();
  c.translate(S / 2, S / 2);
  const u = S / 100;
  c.scale(u, u);

  const bg = c.createRadialGradient(0, -8, 4, 0, 0, 52);
  bg.addColorStop(0, mix(ch.color, 0x000000, 0.35));
  bg.addColorStop(0.7, mix(ch.color, 0x000000, 0.82));
  bg.addColorStop(1, '#070605');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(0, 0, 47, 0, Math.PI * 2);
  c.fill();

  // engraved rings + ticks
  c.strokeStyle = GOLD;
  c.lineWidth = 1.4;
  c.beginPath();
  c.arc(0, 0, 47, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 0.6;
  c.globalAlpha = 0.7;
  c.beginPath();
  c.arc(0, 0, 43.5, 0, Math.PI * 2);
  c.stroke();
  c.globalAlpha = 0.55;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r0 = 43.5,
      r1 = i % 3 === 0 ? 40 : 41.8;
    c.beginPath();
    c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    c.stroke();
  }
  c.globalAlpha = 1;

  const col = cssColor(ch.color);
  const acc = cssColor(ch.accent);
  const light = mix(ch.color, 0xffffff, 0.45);
  const glow = c.createLinearGradient(0, -30, 0, 30);
  glow.addColorStop(0, '#f5e3a6');
  glow.addColorStop(1, GOLD);
  c.shadowColor = col;
  c.shadowBlur = 10;
  (SYMBOLS[ch.id] || SYMBOLS.tarnished)(c, { col, acc, light, glow });
  c.restore();
}

const SYMBOLS = {
  tarnished(c, { glow, acc }) {
    c.fillStyle = glow;
    poly(c, [
      [0, -34],
      [4, -24],
      [4, 12],
      [0, 20],
      [-4, 12],
      [-4, -24],
    ]);
    c.fill();
    c.fillRect(-14, 10, 28, 4);
    c.fillRect(-2.2, 14, 4.4, 14);
    c.beginPath();
    c.arc(0, 31, 3.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = glow;
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(0, 0, 30, Math.PI * 0.62, Math.PI * 2.38);
    c.stroke();
    c.fillStyle = acc;
    c.globalAlpha = 0.5;
    poly(c, [
      [0, -26],
      [1.6, -20],
      [1.6, 8],
      [0, 12],
    ]);
    c.fill();
    c.globalAlpha = 1;
  },
  ranni(c, { light, glow }) {
    c.fillStyle = light;
    c.beginPath();
    c.arc(-3, 0, 27, 0, Math.PI * 2);
    c.arc(7, -3, 23, 0, Math.PI * 2, true);
    c.fill('evenodd');
    c.fillStyle = glow;
    const star = (x, y, r) => {
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.3 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
    };
    star(15, -6, 10);
    star(-18, -22, 4);
    star(22, 18, 3.5);
    star(-25, 14, 3);
  },
  malenia(c, { glow, acc, col }) {
    c.fillStyle = glow;
    for (const s of [-1, 1]) {
      poly(c, [
        [s * 4, -6],
        [s * 18, -22],
        [s * 36, -18],
        [s * 28, -8],
        [s * 38, -2],
        [s * 26, 2],
        [s * 32, 12],
        [s * 18, 10],
        [s * 4, 6],
      ]);
      c.fill();
    }
    poly(c, [
      [0, -36],
      [3.5, -8],
      [3.5, 26],
      [0, 34],
      [-3.5, 26],
      [-3.5, -8],
    ]);
    c.fillStyle = acc;
    c.fill();
    c.fillStyle = col;
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i / 8) * Math.PI * 2);
      c.beginPath();
      c.ellipse(0, -8, 3.4, 7, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#f5e3a6';
    c.beginPath();
    c.arc(0, 0, 3.4, 0, Math.PI * 2);
    c.fill();
  },
  radahn(c, { acc, glow }) {
    c.fillStyle = acc;
    c.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? 20 : 36;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.fillStyle = '#1a0e05';
    c.beginPath();
    c.arc(0, 0, 16, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = glow;
    c.lineWidth = 2.6;
    c.beginPath();
    c.arc(0, 0, 11, Math.PI * 0.2, Math.PI * 1.8);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 5, Math.PI * 1.2, Math.PI * 2.7);
    c.stroke();
  },
  melina(c, { acc, glow }) {
    const flame = (sc, fill) => {
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(0, -36 * sc);
      c.bezierCurveTo(16 * sc, -14 * sc, 24 * sc, 4 * sc, 12 * sc, 22 * sc);
      c.bezierCurveTo(6 * sc, 32 * sc, -6 * sc, 32 * sc, -12 * sc, 22 * sc);
      c.bezierCurveTo(-24 * sc, 4 * sc, -12 * sc, -8 * sc, 0, -36 * sc);
      c.fill();
    };
    flame(1, glow);
    flame(0.62, '#f08a2a');
    flame(0.3, '#fff0b0');
    c.strokeStyle = acc;
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(0, 30, 22, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
  },
  blaidd(c, { light, acc }) {
    c.fillStyle = light;
    poly(c, [
      [-26, -30],
      [-12, -14],
      [12, -14],
      [26, -30],
      [30, 2],
      [14, 24],
      [5, 34],
      [-5, 34],
      [-14, 24],
      [-30, 2],
    ]);
    c.fill();
    c.fillStyle = '#10141a';
    poly(c, [
      [-18, -2],
      [-6, 2],
      [-8, 6],
      [-19, 3],
    ]);
    c.fill();
    poly(c, [
      [18, -2],
      [6, 2],
      [8, 6],
      [19, 3],
    ]);
    c.fill();
    poly(c, [
      [-4, 22],
      [4, 22],
      [0, 30],
    ]);
    c.fill();
    c.strokeStyle = acc;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, -12);
    c.lineTo(0, 14);
    c.stroke();
    c.fillStyle = acc;
    c.globalAlpha = 0.6;
    poly(c, [
      [-22, -24],
      [-14, -14],
      [-24, -6],
    ]);
    c.fill();
    poly(c, [
      [22, -24],
      [14, -14],
      [24, -6],
    ]);
    c.fill();
    c.globalAlpha = 1;
  },
  patches(c, { light, acc, glow }) {
    c.fillStyle = light;
    c.beginPath();
    c.moveTo(-10, -20);
    c.bezierCurveTo(-34, -6, -32, 26, -12, 30);
    c.lineTo(12, 30);
    c.bezierCurveTo(32, 26, 34, -6, 10, -20);
    c.closePath();
    c.fill();
    c.fillStyle = acc;
    c.fillRect(-13, -26, 26, 7);
    c.fillStyle = '#101508';
    c.beginPath();
    c.arc(-8, -2, 3, 0, Math.PI * 2);
    c.arc(8, -2, 3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#101508';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 6, 10, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
    c.fillStyle = glow;
    c.beginPath();
    c.arc(24, 24, 5, 0, Math.PI * 2);
    c.fill();
  },
  godrick(c, { acc, glow, light }) {
    c.fillStyle = glow;
    poly(c, [
      [-26, 12],
      [-30, -18],
      [-14, -4],
      [0, -26],
      [14, -4],
      [30, -18],
      [26, 12],
    ]);
    c.fill();
    c.fillStyle = acc;
    c.fillRect(-27, 12, 54, 7);
    c.fillStyle = light;
    for (const [x, y] of [
      [-30, -21],
      [0, -30],
      [30, -21],
    ]) {
      c.beginPath();
      c.arc(x, y, 3.6, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = glow;
    c.lineWidth = 2.4;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 10, 24);
      c.quadraticCurveTo(s * 30, 24, s * 34, 36);
      c.stroke();
    }
  },
};

// ------------------------------------------------------------------------------------ tracks

const PALETTES = {
  limgrave: {
    sky: ['#243d5c', '#6d8fa6', '#f1d58e'],
    glow: '#ffd977',
    far: '#4f6a4a',
    mid: '#2f4a2b',
    near: '#1b2c19',
    road: '#5a5147',
    edge: '#e8d7a0',
    fog: 'rgba(255,224,150,.22)',
  },
  caelid: {
    sky: ['#1c0506', '#7a1c12', '#e2682a'],
    glow: '#ff8a3a',
    far: '#4a1410',
    mid: '#2b0d0b',
    near: '#140605',
    road: '#3a2a26',
    edge: '#d9603a',
    fog: 'rgba(255,90,40,.25)',
  },
  leyndell: {
    sky: ['#120d1e', '#5b4326', '#f4d27a'],
    glow: '#ffe08a',
    far: '#4a3a22',
    mid: '#2b2113',
    near: '#120d07',
    road: '#6b5a3a',
    edge: '#f5dc8a',
    fog: 'rgba(255,215,120,.25)',
  },
  haligtree: {
    trunk: 'rgba(196,170,214,.92)',
    sky: ['#9fb0d6', '#e2d2ec', '#fbe3ec'],
    glow: '#ffd3e6',
    far: '#b7b9d8',
    mid: '#8d8fbd',
    near: '#5e6390',
    road: '#c9c4dc',
    edge: '#ffffff',
    fog: 'rgba(255,255,255,.3)',
  },
};

function erdtree(c, x, baseY, h, pal, alpha = 1) {
  const g = c.createRadialGradient(x, baseY - h * 0.75, 4, x, baseY - h * 0.75, h * 0.9);
  g.addColorStop(0, pal.glow);
  g.addColorStop(0.35, pal.glow.replace('#', '#') + '99');
  g.addColorStop(1, 'rgba(255,200,100,0)');
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = g;
  c.fillRect(x - h, baseY - h * 1.8, h * 2, h * 2);
  // canopy
  const r = seeded(7);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r());
    const cx = x + Math.cos(a) * d * h * 0.9;
    const cy = baseY - h * 0.74 + Math.sin(a) * d * h * 0.26;
    const rad = h * (0.1 + r() * 0.12);
    const cg = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    cg.addColorStop(0, '#fff2c0');
    cg.addColorStop(0.5, pal.glow);
    cg.addColorStop(1, 'rgba(255,190,80,0)');
    c.fillStyle = cg;
    c.beginPath();
    c.arc(cx, cy, rad, 0, Math.PI * 2);
    c.fill();
  }
  // trunk
  c.fillStyle = pal.trunk || 'rgba(40,24,8,.85)';
  c.beginPath();
  c.moveTo(x - h * 0.09, baseY - h * 0.66);
  c.quadraticCurveTo(x - h * 0.05, baseY - h * 0.2, x - h * 0.24, baseY);
  c.lineTo(x + h * 0.24, baseY);
  c.quadraticCurveTo(x + h * 0.05, baseY - h * 0.2, x + h * 0.09, baseY - h * 0.66);
  c.fill();
  c.restore();
}

function ridge(c, W, y, amp, color, seed, freq = 1) {
  const r = seeded(seed);
  const ph = [r() * 6, r() * 6, r() * 6];
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, c.canvas.height);
  for (let x = 0; x <= W; x += 4) {
    const t = x / W;
    const yy =
      y +
      Math.sin(t * 6 * freq + ph[0]) * amp +
      Math.sin(t * 13 * freq + ph[1]) * amp * 0.5 +
      Math.sin(t * 29 * freq + ph[2]) * amp * 0.2;
    c.lineTo(x, yy);
  }
  c.lineTo(W, c.canvas.height);
  c.closePath();
  c.fill();
}

export function drawTrackArt(cv, id) {
  const pal = PALETTES[id] || PALETTES.limgrave;
  const c = cv.getContext('2d');
  const W = cv.width,
    H = cv.height;
  const hz = H * 0.58;
  const r = seeded(id.length * 977 + id.charCodeAt(0));

  const sky = c.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, pal.sky[0]);
  sky.addColorStop(0.55, pal.sky[1]);
  sky.addColorStop(1, pal.sky[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  if (id !== 'haligtree') {
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(255,240,210,${r() * 0.6})`;
      c.fillRect(r() * W, r() * hz * 0.55, 1.2, 1.2);
    }
  }
  // cloud streaks
  for (let i = 0; i < 6; i++) {
    c.fillStyle = id === 'haligtree' ? 'rgba(255,255,255,.35)' : 'rgba(255,220,160,.07)';
    c.beginPath();
    c.ellipse(
      r() * W,
      hz * (0.25 + r() * 0.45),
      W * (0.12 + r() * 0.12),
      5 + r() * 7,
      0,
      0,
      Math.PI * 2
    );
    c.fill();
  }

  const treeX =
    id === 'leyndell'
      ? W * 0.5
      : id === 'limgrave'
        ? W * 0.68
        : id === 'caelid'
          ? W * 0.22
          : W * 0.5;
  const treeH = id === 'leyndell' ? H * 0.95 : id === 'haligtree' ? H * 0.85 : H * 0.7;
  if (id === 'caelid') {
    // blood moon behind the tree
    const mg = c.createRadialGradient(W * 0.72, hz * 0.4, 2, W * 0.72, hz * 0.4, 46);
    mg.addColorStop(0, '#ffb070');
    mg.addColorStop(0.3, '#e04a20');
    mg.addColorStop(1, 'rgba(200,30,10,0)');
    c.fillStyle = mg;
    c.beginPath();
    c.arc(W * 0.72, hz * 0.4, 46, 0, Math.PI * 2);
    c.fill();
  }
  ridge(c, W, hz - 18, 9, pal.far, 11, 0.8);
  erdtree(c, treeX, hz - 8, treeH, pal, id === 'caelid' ? 0.6 : 1);
  ridge(c, W, hz - 4, 7, pal.mid, 23, 1.1);

  // track specific silhouettes
  c.fillStyle = pal.near;
  if (id === 'limgrave') {
    // church of Elleh + pines
    c.fillRect(W * 0.12, hz - 26, 22, 26);
    poly(c, [
      [W * 0.12 - 3, hz - 26],
      [W * 0.12 + 11, hz - 44],
      [W * 0.12 + 25, hz - 26],
    ]);
    c.fill();
    for (let i = 0; i < 14; i++) {
      const x = r() * W,
        h = 14 + r() * 22;
      poly(c, [
        [x - 6, hz + 2],
        [x, hz - h],
        [x + 6, hz + 2],
      ]);
      c.fill();
    }
  } else if (id === 'caelid') {
    // rib cage of Radahn + dead trees
    c.strokeStyle = '#2a0c08';
    c.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      c.beginPath();
      c.arc(W * 0.6 + i * 12, hz + 10, 34 - i * 2, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
    }
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x = r() * W;
      c.beginPath();
      c.moveTo(x, hz + 2);
      c.lineTo(x + (r() - 0.5) * 6, hz - 20 - r() * 14);
      c.stroke();
    }
  } else if (id === 'leyndell') {
    // golden city walls + towers
    c.fillRect(0, hz - 20, W, 26);
    for (let i = 0; i < 14; i++) {
      const x = i * (W / 13) + r() * 8,
        h = 22 + r() * 30;
      c.fillRect(x, hz - h, 14, h);
      poly(c, [
        [x - 2, hz - h],
        [x + 7, hz - h - 14],
        [x + 16, hz - h],
      ]);
      c.fill();
      c.fillStyle = 'rgba(255,210,120,.8)';
      c.fillRect(x + 5, hz - h + 8, 3, 6);
      c.fillStyle = pal.near;
    }
  } else {
    // haligtree roots + drifting petals
    c.strokeStyle = 'rgba(94,99,144,.85)';
    c.lineWidth = 6;
    for (let i = 0; i < 6; i++) {
      const x = r() * W;
      c.beginPath();
      c.moveTo(x, hz + 6);
      c.bezierCurveTo(x + 20, hz - 30, x - 30, hz - 50, x + 10, hz - 70 - r() * 30);
      c.stroke();
    }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(255,${(190 + r() * 50) | 0},${(215 + r() * 30) | 0},${0.5 + r() * 0.5})`;
      c.beginPath();
      c.ellipse(r() * W, r() * H * 0.9, 3, 1.6, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ground + perspective road
  const gg = c.createLinearGradient(0, hz, 0, H);
  gg.addColorStop(0, pal.mid);
  gg.addColorStop(1, pal.near);
  c.fillStyle = gg;
  c.fillRect(0, hz, W, H - hz);
  const cx = W * 0.5;
  const bendTop = W * (id === 'caelid' ? 0.44 : id === 'haligtree' ? 0.55 : 0.5);
  const rg = c.createLinearGradient(0, hz, 0, H);
  rg.addColorStop(0, pal.road);
  rg.addColorStop(1, pal.near);
  c.fillStyle = rg;
  poly(c, [
    [bendTop - 5, hz],
    [bendTop + 5, hz],
    [cx + W * 0.42, H],
    [cx - W * 0.42, H],
  ]);
  c.fill();
  c.strokeStyle = pal.edge;
  c.lineWidth = 2;
  c.globalAlpha = 0.8;
  c.beginPath();
  c.moveTo(bendTop - 5, hz);
  c.lineTo(cx - W * 0.42, H);
  c.moveTo(bendTop + 5, hz);
  c.lineTo(cx + W * 0.42, H);
  c.stroke();
  c.setLineDash([10, 14]);
  c.globalAlpha = 0.45;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(bendTop, hz);
  c.lineTo(cx, H);
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;

  // horizon haze + vignette
  const hg = c.createLinearGradient(0, hz - 30, 0, hz + 40);
  hg.addColorStop(0, 'rgba(0,0,0,0)');
  hg.addColorStop(0.5, pal.fog);
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = hg;
  c.fillRect(0, hz - 30, W, 70);
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.65)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------------------------ items

export function drawItemIcon(cv, id) {
  const c = cv.getContext('2d');
  const S = cv.width;
  c.clearRect(0, 0, S, S);
  c.save();
  c.translate(S / 2, S / 2);
  c.scale(S / 64, S / 64);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const glowFn = ITEM_ART[id] || ITEM_ART[ITEMS.GOLDEN_RUNE];
  glowFn(c);
  c.restore();
}

const flame = (c, x, y, s, a = '#ff9a2a', b = '#fff0a0') => {
  for (const [sc, col] of [
    [1, a],
    [0.55, b],
  ]) {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y - 14 * s * sc);
    c.bezierCurveTo(
      x + 9 * s * sc,
      y - 4 * s * sc,
      x + 10 * s * sc,
      y + 6 * s * sc,
      x,
      y + 10 * s * sc
    );
    c.bezierCurveTo(
      x - 10 * s * sc,
      y + 6 * s * sc,
      x - 9 * s * sc,
      y - 4 * s * sc,
      x,
      y - 14 * s * sc
    );
    c.fill();
  }
};

const pot = (c, body, rim) => {
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(-9, -12);
  c.bezierCurveTo(-24, -4, -20, 22, -8, 24);
  c.lineTo(8, 24);
  c.bezierCurveTo(20, 22, 24, -4, 9, -12);
  c.closePath();
  c.fill();
  c.fillStyle = rim;
  c.fillRect(-11, -17, 22, 6);
  c.fillStyle = 'rgba(255,255,255,.18)';
  c.beginPath();
  c.ellipse(-8, 2, 3, 9, 0.3, 0, Math.PI * 2);
  c.fill();
};

const ITEM_ART = {
  [ITEMS.CRIMSON_FLASK](c) {
    c.fillStyle = '#7a1414';
    c.beginPath();
    c.moveTo(-5, -20);
    c.lineTo(5, -20);
    c.lineTo(5, -8);
    c.bezierCurveTo(22, -2, 20, 24, 0, 24);
    c.bezierCurveTo(-20, 24, -22, -2, -5, -8);
    c.closePath();
    c.fill();
    const g = c.createLinearGradient(0, -6, 0, 24);
    g.addColorStop(0, '#ff5a4a');
    g.addColorStop(1, '#a01818');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-15, 4);
    c.bezierCurveTo(-8, 0, 8, 8, 15, 3);
    c.bezierCurveTo(16, 20, 8, 22, 0, 22);
    c.bezierCurveTo(-10, 22, -17, 18, -15, 4);
    c.fill();
    c.fillStyle = '#c9a94f';
    c.fillRect(-6, -24, 12, 5);
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath();
    c.ellipse(-9, 10, 2, 6, 0.2, 0, Math.PI * 2);
    c.fill();
  },
  [ITEMS.GOLDEN_RUNE](c) {
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 24);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(0.5, '#e6b93c');
    g.addColorStop(1, 'rgba(230,185,60,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 26, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff2b0';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -20);
    c.lineTo(0, 20);
    c.moveTo(-9, -6);
    c.lineTo(0, 0);
    c.lineTo(9, -6);
    c.moveTo(-9, 8);
    c.lineTo(9, 8);
    c.stroke();
  },
  [ITEMS.ROT_POT](c) {
    pot(c, '#5b3a22', '#3a2414');
    c.fillStyle = '#c4581c';
    c.beginPath();
    c.arc(-4, -19, 5, 0, Math.PI * 2);
    c.arc(5, -20, 4, 0, Math.PI * 2);
    c.arc(0, -23, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7fb34a';
    c.beginPath();
    c.arc(-3, 8, 4, 0, Math.PI * 2);
    c.arc(6, 13, 2.5, 0, Math.PI * 2);
    c.fill();
  },
  [ITEMS.FIRE_POT](c) {
    pot(c, '#8b4a24', '#5a2a12');
    flame(c, 0, -22, 1.1);
    c.strokeStyle = '#ffb04a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-8, 8);
    c.lineTo(8, 14);
    c.stroke();
  },
  [ITEMS.GLINTSTONE_MISSILE](c) {
    const g = c.createLinearGradient(-20, 18, 16, -16);
    g.addColorStop(0, 'rgba(90,140,255,0)');
    g.addColorStop(1, '#bfe3ff');
    c.strokeStyle = g;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(-22, 20);
    c.lineTo(8, -10);
    c.stroke();
    c.fillStyle = '#e8f6ff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2,
        r = i % 2 ? 4 : 13;
      c.lineTo(12 + Math.cos(a) * r, -12 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  },
  [ITEMS.BLACK_KNIFE](c) {
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 28);
    g.addColorStop(0, 'rgba(150,80,220,.55)');
    g.addColorStop(1, 'rgba(150,80,220,0)');
    c.fillStyle = g;
    c.fillRect(-30, -30, 60, 60);
    c.save();
    c.rotate(Math.PI / 4);
    c.fillStyle = '#20202a';
    poly(c, [
      [0, -26],
      [5, -8],
      [3, 10],
      [-3, 10],
      [-5, -8],
    ]);
    c.fill();
    c.strokeStyle = '#b48cff';
    c.lineWidth = 1.4;
    c.stroke();
    c.fillStyle = '#c9a94f';
    c.fillRect(-9, 10, 18, 3.5);
    c.fillStyle = '#3a2a1a';
    c.fillRect(-2.5, 13, 5, 11);
    c.restore();
  },
  [ITEMS.ERDTREE_BLESSING](c) {
    const g = c.createRadialGradient(0, -6, 2, 0, -6, 26);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(1, 'rgba(255,190,70,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, -6, 28, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f4c542';
    for (const [x, y, r] of [
      [0, -14, 9],
      [-10, -8, 8],
      [10, -8, 8],
      [-4, -4, 7],
      [5, -3, 7],
    ]) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#7a5a20';
    poly(c, [
      [-2, -2],
      [2, -2],
      [5, 22],
      [-5, 22],
    ]);
    c.fill();
    c.strokeStyle = '#7a5a20';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-3, 22);
    c.lineTo(-13, 24);
    c.moveTo(3, 22);
    c.lineTo(13, 24);
    c.stroke();
  },
  [ITEMS.BLOODHOUND_STEP](c) {
    c.strokeStyle = '#ff5a4a';
    c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = 0.35 + i * 0.3;
      c.beginPath();
      c.moveTo(-24 + i * 4, -12 + i * 12);
      c.lineTo(-6, -12 + i * 12);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = '#e8d6c0';
    c.beginPath();
    c.ellipse(8, 8, 9, 7, 0, 0, Math.PI * 2);
    c.fill();
    for (const [x, y] of [
      [-1, -6],
      [7, -10],
      [15, -6],
      [19, 2],
    ]) {
      c.beginPath();
      c.ellipse(x, y, 3.2, 4.4, 0, 0, Math.PI * 2);
      c.fill();
    }
  },
  [ITEMS.STONESWORD_KEY](c) {
    c.strokeStyle = '#b9bcc4';
    c.fillStyle = '#b9bcc4';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, -14, 8, 0, Math.PI * 2);
    c.stroke();
    c.fillRect(-2, -6, 4, 28);
    c.fillRect(0, 12, 9, 3.5);
    c.fillRect(0, 18, 6, 3.5);
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillRect(-1.5, -4, 1.5, 24);
  },
  [ITEMS.TORRENT_CALL](c) {
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 28);
    g.addColorStop(0, 'rgba(160,210,255,.6)');
    g.addColorStop(1, 'rgba(160,210,255,0)');
    c.fillStyle = g;
    c.fillRect(-30, -30, 60, 60);
    c.fillStyle = '#d8ecff';
    c.beginPath();
    c.moveTo(-14, 22);
    c.lineTo(-10, -2);
    c.lineTo(-4, -18);
    c.lineTo(2, -24);
    c.lineTo(4, -14);
    c.lineTo(16, -6);
    c.lineTo(20, 4);
    c.lineTo(10, 8);
    c.lineTo(6, 22);
    c.closePath();
    c.fill();
    c.fillStyle = '#20406a';
    c.beginPath();
    c.arc(6, -6, 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffe9a0';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-2, -22);
    c.lineTo(-6, -30);
    c.stroke();
  },
};

// ------------------------------------------------------------------------------------ embers

export class Embers {
  constructor(canvas, count = 70) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.count = count;
    this.p = [];
    this.raf = 0;
    this.last = 0;
    this._loop = this._loop.bind(this);
    this.resize();
    for (let i = 0; i < count; i++) this.p.push(this._spawn(true));
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || window.innerWidth;
    const h = this.cv.clientHeight || window.innerHeight;
    this.cv.width = Math.floor(w * dpr);
    this.cv.height = Math.floor(h * dpr);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
  }

  _spawn(anywhere) {
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 10,
      vy: 14 + Math.random() * 34,
      vx: (Math.random() - 0.3) * 14,
      r: 0.6 + Math.random() * 2.2,
      ph: Math.random() * 6.28,
      hue: 30 + Math.random() * 20,
    };
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.c;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'lighter';
    for (const p of this.p) {
      p.y -= p.vy * dt;
      p.ph += dt * 2.4;
      p.x += (p.vx + Math.sin(p.ph) * 10) * dt;
      if (p.y < -10 || p.x < -20 || p.x > this.w + 20) Object.assign(p, this._spawn(false));
      const life = Math.max(0, Math.min(1, p.y / this.h));
      const a = life * (0.55 + 0.45 * Math.sin(p.ph * 2.1));
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `hsla(${p.hue},100%,70%,${a})`);
      g.addColorStop(0.4, `hsla(${p.hue - 10},100%,50%,${a * 0.35})`);
      g.addColorStop(1, 'hsla(20,100%,40%,0)');
      c.fillStyle = g;
      c.fillRect(p.x - p.r * 4, p.y - p.r * 4, p.r * 8, p.r * 8);
    }
    c.globalCompositeOperation = 'source-over';
    this.raf = requestAnimationFrame(this._loop);
  }
}
