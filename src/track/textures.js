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
