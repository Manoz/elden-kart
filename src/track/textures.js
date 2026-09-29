// Procedural canvas textures (browser only).
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const rgba = (hex, a = 1) => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};

const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
};

// u = across the road (0..1), v = along (one repeat every ~24 m)
export function makeRoadTexture(cfg, seed = 1) {
  const rng = mulberry32(seed * 977);
  const W = 512;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = cfg.base;
  g.fillRect(0, 0, W, H);
  // tonal blotches (wrapped vertically)
  for (let i = 0; i < 70; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 30 + rng() * 90;
    const light = rng() < 0.5;
    for (const oy of [-H, 0, H]) {
      const gr = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
      gr.addColorStop(0, light ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.13)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y + oy - r, r * 2, r * 2);
    }
  }
  const pat = cfg.pattern || 'dirt';
  if (pat === 'cobble') {
    const rowH = 20;
    for (let row = 0; row < H / rowH; row++) {
      const off = (row % 2) * 15;
      for (let x = -30 + off; x < W + 30; x += 30) {
        const w = 26 + rng() * 3;
        const sh = 0.78 + rng() * 0.4;
        g.fillStyle = shade(cfg.base, sh);
        g.beginPath();
        g.roundRect(x + 2, row * rowH + 2, w, rowH - 4, 5);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        g.stroke();
      }
    }
  } else if (pat === 'tiles') {
    const T = 128;
    g.strokeStyle = cfg.inlay ? cfg.inlay : 'rgba(0,0,0,0.4)';
    g.lineWidth = 3;
    for (let x = 0; x <= W; x += T) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 0; y <= H; y += T) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      let x = rng() * W;
      let y = rng() * H;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rng() - 0.5) * 80;
        y += (rng() - 0.2) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    if (cfg.inlay) {
      g.strokeStyle = cfg.inlay;
      g.lineWidth = 2;
      for (let x = 0; x < W; x += T) {
        for (let y = 0; y < H; y += T) {
          g.strokeRect(x + 14, y + 14, T - 28, T - 28);
          g.beginPath();
          g.arc(x + T / 2, y + T / 2, 12, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
  } else if (pat === 'cracks') {
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      let x = rng() * W;
      let y = rng() * H;
      g.beginPath();
      g.moveTo(x, y);
      const n = 5 + Math.floor(rng() * 6);
      for (let k = 0; k < n; k++) {
        x += (rng() - 0.5) * 70;
        y += (rng() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(15,4,2,0.75)';
      g.lineWidth = 2 + rng() * 2;
      g.stroke();
      if (cfg.inlay && rng() < 0.4) {
        g.strokeStyle = cfg.inlay;
        g.lineWidth = 1;
        g.stroke();
      }
    }
  } else {
    // dirt: wheel ruts
    for (const cx of [0.32, 0.68]) {
      const gr = g.createLinearGradient((cx - 0.09) * W, 0, (cx + 0.09) * W, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.16)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect((cx - 0.09) * W, 0, 0.18 * W, H);
    }
    for (let i = 0; i < 260; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const r = 3 + rng() * 9;
      g.fillStyle = shade(cfg.base, 0.7 + rng() * 0.6);
      g.beginPath();
      g.ellipse(x, y, r, r * 0.7, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // speckle
  const spk = cfg.speck || ['#000', '#fff'];
  for (let i = 0; i < 7000; i++) {
    g.fillStyle = rgba(spk[Math.floor(rng() * spk.length)], 0.05 + rng() * 0.18);
    const s = 1 + rng() * 2.2;
    g.fillRect(rng() * W, rng() * H, s, s);
  }
  // petals / decoration
  if (cfg.scatter) {
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rgba(cfg.scatter, 0.35 + rng() * 0.5);
      g.beginPath();
      g.ellipse(rng() * W, rng() * H, 3 + rng() * 3, 1.5 + rng() * 2, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // edge lines and centre dashes
  const lw = 9;
  g.fillStyle = rgba(cfg.line || '#ffffff', cfg.lineAlpha ?? 0.85);
  g.fillRect(W * 0.03, 0, lw, H);
  g.fillRect(W * 0.97 - lw, 0, lw, H);
  if (cfg.centre) {
    g.fillStyle = rgba(cfg.line || '#ffffff', (cfg.lineAlpha ?? 0.85) * 0.7);
    for (let y = 0; y < H; y += 128) g.fillRect(W * 0.5 - 4, y + 8, 8, 64);
  }
  // wear near the edges
  const ew = g.createLinearGradient(0, 0, W, 0);
  ew.addColorStop(0, 'rgba(0,0,0,0.28)');
  ew.addColorStop(0.1, 'rgba(0,0,0,0)');
  ew.addColorStop(0.9, 'rgba(0,0,0,0)');
  ew.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = ew;
  g.fillRect(0, 0, W, H);
  return finish(c, { repeat: false });
}

export function makeKerbTexture(a, b) {
  const [c, g] = canvas(64, 128);
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = b;
  g.fillRect(0, 64, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(0, 0, 4, 128);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(60, 0, 4, 128);
  return finish(c, { repeat: false });
}

// Tileable noisy ground detail (greyscale-ish multiplier)
export function makeGroundTexture(seed = 1, contrast = 0.35) {
  const rng = mulberry32(seed * 131 + 7);
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#d2d2d2';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 6 + rng() * 26;
    const l = rng() < 0.5;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(
          0,
          l ? `rgba(255,255,255,${contrast * 0.5})` : `rgba(0,0,0,${contrast * 0.6})`
        );
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.2)';
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  return finish(c);
}

export function makeWallTexture(color, seed = 1) {
  const rng = mulberry32(seed * 53 + 3);
  const [c, g] = canvas(256, 64);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 64);
  for (let row = 0; row < 2; row++) {
    for (let x = -32 + row * 32; x < 256; x += 64) {
      g.fillStyle = shade(color, 0.85 + rng() * 0.3);
      g.fillRect(x + 1, row * 32 + 1, 62, 30);
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 2;
      g.strokeRect(x + 1, row * 32 + 1, 62, 30);
    }
  }
  for (let i = 0; i < 800; i++) {
    g.fillStyle = `rgba(0,0,0,${rng() * 0.15})`;
    g.fillRect(rng() * 256, rng() * 64, 2, 2);
  }
  return finish(c);
}

export function makeChevronTexture(color = '#ffcf4a') {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, rgba(color, 0));
  gr.addColorStop(0.5, rgba(color, 1));
  gr.addColorStop(1, rgba(color, 0.2));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(10, 100);
  g.lineTo(64, 30);
  g.lineTo(118, 100);
  g.lineTo(118, 78);
  g.lineTo(64, 8);
  g.lineTo(10, 78);
  g.closePath();
  g.fill();
  return finish(c, { repeat: false });
}

export function makeCheckerTexture(a = '#f4f0e0', b = '#141414') {
  const [c, g] = canvas(256, 64);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return finish(c, { repeat: false });
}

export function makeBannerTexture(text, { bg = '#1a1208', fg = '#f1cf72', trim = '#c9a227' } = {}) {
  const [c, g] = canvas(1024, 160);
  const gr = g.createLinearGradient(0, 0, 0, 160);
  gr.addColorStop(0, shade(bg, 1.4));
  gr.addColorStop(1, bg);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = trim;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 1008, 144);
  g.lineWidth = 2;
  g.strokeRect(20, 20, 984, 120);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#f4f0e0' : '#111';
    g.fillRect(30 + i * 20, 28, 20, 14);
    g.fillRect(30 + i * 20 + (i % 2 ? -20 : 20), 42, 20, 14);
    g.fillStyle = i % 2 ? '#111' : '#f4f0e0';
    g.fillRect(1024 - 30 - (i + 1) * 20, 28, 20, 14);
  }
  g.font = 'bold 84px Georgia, "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = trim;
  g.shadowBlur = 18;
  g.fillStyle = fg;
  g.fillText(text, 512, 92);
  return finish(c, { repeat: false });
}

export function makeGlowTexture(inner = 1, size = 128) {
  const [c, g] = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const st = [
    [0, 1],
    [0.1, 0.62],
    [0.25, 0.32],
    [0.45, 0.12],
    [0.7, 0.03],
    [1, 0],
  ];
  for (const [o, a] of st) gr.addColorStop(o, `rgba(255,255,255,${inner * a})`);
  // Opaque black backdrop: the red channel carries the falloff regardless of alpha premultiplication.
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return finish(c, { repeat: false, srgb: false });
}

// Soft cloud noise; equirect-ish strip sampled by the sky shader (wraps horizontally).
export function makeCloudTexture(seed = 1) {
  const rng = mulberry32(seed * 7919);
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const x = rng() * W;
    const y = H * 0.15 + rng() * H * 0.7;
    const rx = 30 + rng() * 120;
    const ry = rx * (0.2 + rng() * 0.25);
    for (const ox of [-W, 0, W]) {
      const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
      gr.addColorStop(0, `rgba(255,255,255,${0.1 + rng() * 0.14})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.save();
      g.translate(0, y);
      g.scale(1, ry / rx);
      g.translate(0, -y);
      g.fillStyle = gr;
      g.fillRect(x + ox - rx, y - rx, rx * 2, rx * 2);
      g.restore();
    }
  }
  const t = finish(c, { srgb: false });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Recursive golden tree (Erdtree / Haligtree) drawn as a big billboard image.
export function makeTreeTexture(variant = 'gold', seed = 1) {
  const rng = mulberry32(seed * 313 + 5);
  const S = 1024;
  const [c, g] = canvas(S, S);
  const P =
    {
      gold: {
        glow: [255, 200, 90],
        trunk: ['#8a5a1a', '#ffd67a'],
        leaf: ['#ffd36a', '#ffb43a', '#fff0b0'],
      },
      red: {
        glow: [255, 90, 40],
        trunk: ['#4a1408', '#ff8a4a'],
        leaf: ['#ff6a3a', '#c8341a', '#ffb070'],
      },
      pink: {
        glow: [255, 190, 230],
        trunk: ['#8a6a7a', '#ffeaf6'],
        leaf: ['#ffd0ea', '#ffb0d8', '#ffffff'],
      },
    }[variant] || null;
  const cx = S / 2;
  const gr = g.createRadialGradient(cx, S * 0.4, 0, cx, S * 0.4, S * 0.55);
  gr.addColorStop(0, `rgba(${P.glow},0.55)`);
  gr.addColorStop(0.5, `rgba(${P.glow},0.18)`);
  gr.addColorStop(1, `rgba(${P.glow},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // trunk
  const tg = g.createLinearGradient(cx - 60, 0, cx + 60, 0);
  tg.addColorStop(0, P.trunk[0]);
  tg.addColorStop(0.55, P.trunk[1]);
  tg.addColorStop(1, P.trunk[0]);
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(cx - 190, S);
  g.bezierCurveTo(cx - 90, S * 0.93, cx - 46, S * 0.8, cx - 34, S * 0.5);
  g.lineTo(cx + 34, S * 0.5);
  g.bezierCurveTo(cx + 46, S * 0.8, cx + 90, S * 0.93, cx + 190, S);
  g.closePath();
  g.fill();
  // branches
  g.lineCap = 'round';
  const branch = (x, y, ang, len, w, d) => {
    if (d > 6 || len < 8) return;
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    g.strokeStyle = d < 2 ? P.trunk[1] : P.leaf[0];
    g.globalAlpha = d < 3 ? 0.95 : 0.6;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    g.globalAlpha = 1;
    const n = d < 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * (0.6 + rng() * 0.3) + (rng() - 0.5) * 0.25;
      branch(x2, y2, a, len * (0.68 + rng() * 0.12), w * 0.66, d + 1);
    }
  };
  for (const a of [-1.15, -0.65, -0.2, 0.2, 0.65, 1.15])
    branch(cx, S * 0.56, a, 150 + rng() * 30, 26, 0);
  // canopy of leaves
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4200; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng());
    const x = cx + Math.cos(a) * r * S * 0.47;
    const y = S * 0.32 + Math.sin(a) * r * S * 0.2 - Math.abs(Math.cos(a)) * 0;
    if (y > S * 0.55) continue;
    const s = 3 + rng() * 9;
    g.fillStyle = rgba(P.leaf[Math.floor(rng() * 3)], 0.12 + rng() * 0.28);
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  // falling leaf streaks
  for (let i = 0; i < 90; i++) {
    const x = cx + (rng() - 0.5) * S * 0.8;
    const y = S * 0.4 + rng() * S * 0.3;
    g.strokeStyle = rgba(P.leaf[0], 0.15 + rng() * 0.2);
    g.lineWidth = 1 + rng() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 8, y + 10 + rng() * 40);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return finish(c, { repeat: false });
}
