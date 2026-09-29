// Per-pixel procedural road surfaces (colour, normal and optional glow maps) and stone kerbs.
// The road texture covers the full road width (u) and `lengthM` metres along it (v, tiling).
import * as THREE from 'three';
import { mulberry32, smoothstep, clamp } from './util.js';

function hashCell(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Value noise that tiles along y with an integer lattice period.
function tiledNoise(seed) {
  const n = (x, y, period) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const y0 = ((iy % period) + period) % period;
    const y1 = (y0 + 1) % period;
    const a = hashCell(ix, y0, seed);
    const b = hashCell(ix + 1, y0, seed);
    const c = hashCell(ix, y1, seed);
    const d = hashCell(ix + 1, y1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  // fbm over `oct` octaves; `period` is the lattice period of the first octave along y.
  return (x, y, period, oct = 3) => {
    let s = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      s += n(x * f, y * f, period * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / norm;
  };
}

const col = (hex) => new THREE.Color(hex);
const mixC = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};
const srgb = (hex) => {
  const c = col(hex);
  return [c.r, c.g, c.b];
};

function toTexture(canvas, { srgbSpace = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgbSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// cfg: { style: 'flagstone'|'slab'|'cracked', stone, dirt, grout, moss?, cell, coverage?, snow?, inlay?,
//        glow?, petals? } — colours as '#rrggbb'.
export function makeRoadMaps(cfg, widthM, lengthM, seed = 1) {
  const W = 1024;
  const H = 1024;
  const style = cfg.style || 'flagstone';
  const cell = cfg.cell ?? 1;
  const rows = Math.max(2, Math.round(lengthM / cell));
  const cellY = lengthM / rows;
  const cellX = cell;
  const cols = Math.ceil(widthM / cellX) + 1;
  const noise = tiledNoise(seed * 31 + 7);
  const rng = mulberry32(seed * 977 + 3);

  // jittered sites, one per cell
  const siteX = new Float32Array(cols * rows);
  const siteY = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      siteX[r * cols + c] = (c + 0.05 + rng() * 0.9) * cellX;
      siteY[r * cols + c] = (r + 0.05 + rng() * 0.9) * cellY;
    }
  }

  const stone = srgb(cfg.stone);
  const stone2 = srgb(cfg.stone2 ?? cfg.stone);
  const dirt = srgb(cfg.dirt);
  const grout = srgb(cfg.grout);
  const moss = srgb(cfg.moss ?? cfg.dirt);
  const snowC = [0.93, 0.95, 1.0];
  const inlay = cfg.inlay ? srgb(cfg.inlay) : null;
  const coverage = cfg.coverage ?? 1;
  const snow = cfg.snow ?? 0;

  const height = new Float32Array(W * H);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const data = img.data;
  let glowImg = null;
  let glowData = null;
  let gcv = null;
  if (cfg.glow) {
    gcv = document.createElement('canvas');
    gcv.width = W;
    gcv.height = H;
    glowImg = gcv.getContext('2d').createImageData(W, H);
    glowData = glowImg.data;
  }
  const px = [0, 0, 0];
  const tmp = [0, 0, 0];
  // noise lattice periods along y (integers so the texture tiles)
  const pBig = Math.max(1, Math.round(lengthM / 6));
  const pMid = Math.max(1, Math.round(lengthM / 1.5));
  const pFine = Math.max(1, Math.round(lengthM / 0.25));

  for (let y = 0; y < H; y++) {
    const Y = ((y + 0.5) / H) * lengthM;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const X = u * widthM;
      const big = noise(X / 6, Y / 6, pBig, 3);
      const mid = noise(X / 1.5 + 11, Y / 1.5, pMid, 3);
      const fine = noise(X / 0.25 + 5, Y / 0.25, pFine, 2);

      let edge;
      let id;
      if (style === 'slab') {
        const slabW = cell * 1.6;
        const r = Math.floor(Y / cellY);
        const off = (r % 2) * slabW * 0.5;
        const cI = Math.floor((X + off) / slabW);
        const lx = X + off - cI * slabW;
        const ly = Y - r * cellY;
        edge = Math.min(lx, slabW - lx, ly, cellY - ly);
        id = hashCell(cI, r, seed);
      } else {
        const cx = Math.floor(X / cellX);
        const cy = Math.floor(Y / cellY);
        let f1 = 1e9;
        let f2 = 1e9;
        id = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ry = cy + dy;
          const row = ((ry % rows) + rows) % rows;
          const shiftY = (ry - row) * cellY;
          for (let dx = -1; dx <= 1; dx++) {
            const c = cx + dx;
            if (c < 0 || c >= cols) continue;
            const k = row * cols + c;
            const ddx = siteX[k] - X;
            const ddy = siteY[k] + shiftY - Y;
            const d = Math.sqrt(ddx * ddx + ddy * ddy);
            if (d < f1) {
              f2 = f1;
              f1 = d;
              id = hashCell(c, row, seed);
            } else if (d < f2) f2 = d;
          }
        }
        edge = (f2 - f1) * 0.5;
      }

      // how worn the centre of the road is (tyres polish it, moss and dirt stay on the sides)
      const centre = Math.exp(-((u - 0.5) * (u - 0.5)) / 0.06);
      const sideDist = Math.min(u, 1 - u);
      let h;
      if (style === 'cracked') {
        const crackW = 0.05 + mid * 0.07;
        const crack = 1 - smoothstep(crackW * 0.4, crackW, edge);
        const plate = 0.55 + id * 0.25 + (fine - 0.5) * 0.25;
        h = plate * (1 - crack * 0.9);
        mixC(px, dirt, stone, clamp(0.35 + id * 0.5 + (big - 0.5) * 0.8, 0, 1));
        const k = 0.8 + fine * 0.35;
        px[0] *= k;
        px[1] *= k;
        px[2] *= k;
        mixC(px, px, grout, crack);
        if (glowData) {
          const glow = crack * smoothstep(0.55, 0.75, mid) * smoothstep(0.35, 0.6, big);
          const gi = (y * W + x) * 4;
          glowData[gi] = glowData[gi + 1] = glowData[gi + 2] = Math.min(255, glow * 255);
          glowData[gi + 3] = 255;
        }
      } else {
        const groutW = style === 'slab' ? 0.018 : 0.035;
        const stoneMask = smoothstep(groutW, groutW + (style === 'slab' ? 0.02 : 0.06), edge);
        // missing stones reveal packed dirt, more often on the sides and near the edges
        const keep =
          id <
          coverage +
            (centre - 0.4) * 0.25 -
            (big - 0.5) * 0.6 -
            smoothstep(0.08, 0.0, sideDist) * 0.8;
        const present = keep ? 1 : 0;
        const tone = 0.84 + id * 0.3;
        mixC(px, stone, stone2, id);
        const k = tone * (0.86 + fine * 0.26) * (0.92 + mid * 0.16);
        px[0] *= k;
        px[1] *= k;
        px[2] *= k;
        if (style === 'slab') {
          // pale marble veining
          const vein = Math.abs(Math.sin((X * 1.7 + Y * 0.6 + mid * 6) * 2.2));
          const v = smoothstep(0.08, 0.0, vein) * 0.18;
          px[0] -= v;
          px[1] -= v;
          px[2] -= v * 0.8;
        }
        h =
          present * stoneMask * (0.65 + id * 0.12 + fine * 0.12) +
          (1 - present) * (0.18 + mid * 0.12);
        mixC(tmp, grout, dirt, 0.35 + mid * 0.4);
        mixC(px, tmp, px, stoneMask * present);
        if (!present) {
          mixC(px, dirt, grout, (1 - mid) * 0.35);
          const d = 0.85 + fine * 0.3;
          px[0] *= d;
          px[1] *= d;
          px[2] *= d;
        }
        // moss creeping in from the joints and the road sides
        const mossAmt =
          smoothstep(0.52, 0.72, big + (1 - stoneMask) * 0.25 + (0.5 - centre) * 0.3) *
          (cfg.moss ? 0.55 : 0);
        mixC(px, px, moss, mossAmt * (0.6 + fine * 0.4));
        if (inlay && style === 'slab') {
          const r = Math.floor(Y / cellY);
          if (r % 4 === 0) {
            const line = 1 - smoothstep(0.03, 0.05, Math.abs(Y - r * cellY - cellY * 0.5));
            mixC(px, px, inlay, line * 0.85);
          }
        }
      }
      if (snow > 0) {
        const s = smoothstep(1 - snow, 1.2 - snow, big * 0.7 + fine * 0.3 + (0.5 - centre) * 0.35);
        mixC(px, px, snowC, s * 0.85);
        h += s * 0.08;
      }
      if (cfg.petals) {
        const p = hashCell(
          Math.floor(X * 9),
          Math.floor(Y * 9) % Math.round(lengthM * 9),
          seed + 5
        );
        if (p > 0.996) mixC(px, px, srgb(cfg.petals), 0.75);
      }
      // subtle darkening where the road meets the verge
      const e = 0.72 + 0.28 * smoothstep(0.0, 0.06, sideDist);
      const i = (y * W + x) * 4;
      data[i] = Math.min(255, Math.pow(Math.max(px[0] * e, 0), 1 / 2.2) * 255);
      data[i + 1] = Math.min(255, Math.pow(Math.max(px[1] * e, 0), 1 / 2.2) * 255);
      data[i + 2] = Math.min(255, Math.pow(Math.max(px[2] * e, 0), 1 / 2.2) * 255);
      data[i + 3] = 255;
      height[y * W + x] = h;
    }
  }
  g.putImageData(img, 0, 0);

  // normal map from the height field (wraps along v)
  const ncv = document.createElement('canvas');
  ncv.width = W;
  ncv.height = H;
  const ng = ncv.getContext('2d');
  const nimg = ng.createImageData(W, H);
  const nd = nimg.data;
  const strength = cfg.relief ?? 5;
  for (let y = 0; y < H; y++) {
    const yu = (y + H - 1) % H;
    const yd = (y + 1) % H;
    for (let x = 0; x < W; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(W - 1, x + 1);
      const dx = (height[y * W + xr] - height[y * W + xl]) * strength;
      const dy = (height[yd * W + x] - height[yu * W + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * W + x) * 4;
      nd[i] = (-dx * inv * 0.5 + 0.5) * 255;
      nd[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      nd[i + 2] = (inv * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }
  ng.putImageData(nimg, 0, 0);

  const out = { map: toTexture(cv), normalMap: toTexture(ncv, { srgbSpace: false }) };
  if (gcv) {
    gcv.getContext('2d').putImageData(glowImg, 0, 0);
    out.glowMap = toTexture(gcv);
  }
  return out;
}

// Dressed stone kerb blocks (two alternating tones) with mortar joints.
export function makeStoneKerbTexture(a, b, seed = 1) {
  const rng = mulberry32(seed * 131 + 9);
  const W = 64;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const blocks = 4;
  for (let k = 0; k < blocks; k++) {
    const y0 = (k * H) / blocks;
    const c = col(k % 2 ? a : b).multiplyScalar(0.9 + rng() * 0.2);
    g.fillStyle = '#' + c.getHexString();
    g.fillRect(0, y0, W, H / blocks);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rng() * 0.08})`;
      g.fillRect(rng() * W, y0 + rng() * (H / blocks), 1 + rng() * 3, 1 + rng() * 3);
    }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, y0, W, 3);
  }
  const shade = g.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.3)');
  shade.addColorStop(0.25, 'rgba(255,255,255,0.08)');
  shade.addColorStop(1, 'rgba(0,0,0,0.15)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  const t = toTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
