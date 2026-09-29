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

// Value noise that tiles along y with an integer lattice period, and along x too when periodX is set.
function tiledNoise(seed) {
  const n = (x, y, period, periodX) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const y0 = ((iy % period) + period) % period;
    const y1 = (y0 + 1) % period;
    const x0 = periodX ? ((ix % periodX) + periodX) % periodX : ix;
    const x1 = periodX ? (x0 + 1) % periodX : ix + 1;
    const a = hashCell(x0, y0, seed);
    const b = hashCell(x1, y0, seed);
    const c = hashCell(x0, y1, seed);
    const d = hashCell(x1, y1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  // fbm over `oct` octaves; `period` and `periodX` are the lattice periods of the first octave.
  return (x, y, period, oct = 3, periodX = 0) => {
    let s = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      s += n(x * f, y * f, period * f, periodX * f) * amp;
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
const mulC = (out, k) => {
  out[0] *= k;
  out[1] *= k;
  out[2] *= k;
};
const srgb = (hex) => {
  const c = col(hex);
  return [c.r, c.g, c.b];
};

// Tangent-space normal map canvas from a height field; wraps along y, and along x when wrapX.
function normalCanvas(height, W, H, strength, wrapX) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const nd = img.data;
  for (let y = 0; y < H; y++) {
    const yu = (y + H - 1) % H;
    const yd = (y + 1) % H;
    for (let x = 0; x < W; x++) {
      const xl = wrapX ? (x + W - 1) % W : Math.max(0, x - 1);
      const xr = wrapX ? (x + 1) % W : Math.min(W - 1, x + 1);
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
  g.putImageData(img, 0, 0);
  return cv;
}

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

// cfg: { style: 'flagstone'|'slab'|'cracked', stone, stone2?, dirt, grout, moss?, lichen?, cell,
//        coverage?, snow?, inlay?, glow?, petals? } — colours as '#rrggbb'.
export function makeRoadMaps(cfg, widthM, lengthM, seed = 1) {
  const W = 1024;
  const H = 1024;
  const style = cfg.style || 'flagstone';
  const flag = style === 'flagstone';
  const cell = cfg.cell ?? 1;
  const rows = Math.max(2, Math.round(lengthM / cell));
  const cellY = lengthM / rows;
  const cellX = cell;
  const cols = Math.ceil(widthM / cellX) + 1;
  const noise = tiledNoise(seed * 31 + 7);
  const rng = mulberry32(seed * 977 + 3);

  // jittered sites, one per cell; some flagstone sites are dropped so neighbours grow into larger
  // stones, and every stone or plate gets a slight tilt
  const siteX = new Float32Array(cols * rows);
  const siteY = new Float32Array(cols * rows);
  const siteOn = new Uint8Array(cols * rows);
  const tiltX = new Float32Array(cols * rows);
  const tiltY = new Float32Array(cols * rows);
  for (let k = 0; k < cols * rows; k++) {
    const c = k % cols;
    const r = (k - c) / cols;
    siteX[k] = (c + 0.05 + rng() * 0.9) * cellX;
    siteY[k] = (r + 0.05 + rng() * 0.9) * cellY;
    siteOn[k] = !flag || rng() > 0.18 ? 1 : 0;
    tiltX[k] = (rng() - 0.5) * 1.6;
    tiltY[k] = (rng() - 0.5) * 1.6;
  }
  const reach = flag ? 2 : 1;
  const warpAmp = cell * (flag ? 0.65 : 0.45);

  const stone = srgb(cfg.stone);
  const stone2 = srgb(cfg.stone2 ?? cfg.stone);
  const dirt = srgb(cfg.dirt);
  const grout = srgb(cfg.grout);
  const moss = srgb(cfg.moss ?? cfg.dirt);
  const lichen = cfg.lichen ? srgb(cfg.lichen) : stone.map((v) => Math.min(1, v * 1.35));
  const petals = cfg.petals ? srgb(cfg.petals) : null;
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
  // noise scales snapped so that lengthM spans a whole number of lattice periods (the texture tiles)
  const lattice = (size) => {
    const p = Math.max(1, Math.round(lengthM / size));
    return [lengthM / p, p];
  };
  const [sBig, pBig] = lattice(6);
  const [sMid, pMid] = lattice(1.5);
  const [sFine, pFine] = lattice(0.25);
  const [sSpot, pSpot] = lattice(0.4);
  const [sWarp, pWarp] = lattice(cell * 1.3);
  // finer jittered grid that splits cracked plates into smaller pieces
  const subRows = Math.max(2, Math.round(lengthM / (cell * 0.45)));
  const subY = lengthM / subRows;
  const subX = cell * 0.45;
  const subEdge = (qx, qy) => {
    const cx = Math.floor(qx / subX);
    const cy = Math.floor(qy / subY);
    let f1 = 1e9;
    let f2 = 1e9;
    for (let dy = -1; dy <= 1; dy++) {
      const ry = cy + dy;
      const row = ((ry % subRows) + subRows) % subRows;
      for (let dx = -1; dx <= 1; dx++) {
        const c = cx + dx;
        const ddx = (c + 0.1 + hashCell(c, row, seed + 41) * 0.8) * subX - qx;
        const ddy = (ry + 0.1 + hashCell(c, row, seed + 42) * 0.8) * subY - qy;
        const d = ddx * ddx + ddy * ddy;
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
    }
    return (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5;
  };

  for (let y = 0; y < H; y++) {
    const Y = ((y + 0.5) / H) * lengthM;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const X = u * widthM;
      const big = noise(X / sBig, Y / sBig, pBig, 3);
      const mid = noise(X / sMid + 11, Y / sMid, pMid, 3);
      const fine = noise(X / sFine + 5, Y / sFine, pFine, 2);

      let edge;
      let id;
      let tilt = 0;
      let qx = X;
      let qy = Y;
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
        // cells are looked up through a warp, so joints and cracks wander instead of running straight
        qx += (noise(X / sWarp + 31, Y / sWarp, pWarp, 2) - 0.5) * warpAmp;
        qy += (noise(X / sWarp + 57, Y / sWarp, pWarp, 2) - 0.5) * warpAmp;
        const cx = Math.floor(qx / cellX);
        const cy = Math.floor(qy / cellY);
        let f1 = 1e9;
        let f2 = 1e9;
        let near = 0;
        let nearY = 0;
        id = 0;
        for (let dy = -reach; dy <= reach; dy++) {
          const ry = cy + dy;
          const row = ((ry % rows) + rows) % rows;
          const shiftY = (ry - row) * cellY;
          for (let dx = -reach; dx <= reach; dx++) {
            const c = cx + dx;
            if (c < 0 || c >= cols) continue;
            const k = row * cols + c;
            if (!siteOn[k]) continue;
            const ddx = siteX[k] - qx;
            const ddy = siteY[k] + shiftY - qy;
            const d = ddx * ddx + ddy * ddy;
            if (d < f1) {
              f2 = f1;
              f1 = d;
              near = k;
              nearY = siteY[k] + shiftY;
              id = hashCell(c, row, seed);
            } else if (d < f2) f2 = d;
          }
        }
        edge = (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5;
        tilt = tiltX[near] * (qx - siteX[near]) + tiltY[near] * (qy - nearY);
      }

      // how worn the centre of the road is (tyres polish it, moss and dirt stay on the sides)
      const centre = Math.exp(-((u - 0.5) * (u - 0.5)) / 0.06);
      const sideDist = Math.min(u, 1 - u);
      let h;
      if (style === 'cracked') {
        // jagged cracks of varying width between plates whose edges are worn round
        const e = edge + (fine - 0.5) * 0.06;
        const crackW = 0.03 + mid * 0.06;
        const crack = 1 - smoothstep(crackW * 0.4, crackW, e);
        const sh = smoothstep(crackW * 0.4, crackW + 0.12, e);
        const top = sh * (2 - sh);
        const spot = noise(X / sSpot + 17, Y / sSpot, pSpot, 3);
        // most plates are split again by thinner, more crooked cracks
        const split = hashCell(Math.floor(id * 9973), 5, seed + 3) > 0.3 ? 1 : 0;
        const sub = subEdge(qx + (spot - 0.5) * 0.3, qy + (fine - 0.5) * 0.25);
        const hair = split * top * (1 - smoothstep(0.008, 0.022, sub + (fine - 0.5) * 0.03));
        h = top * (0.55 + id * 0.2 + tilt + (spot - 0.5) * 0.15 + (fine - 0.5) * 0.1) - hair * 0.1;
        mixC(px, dirt, stone, clamp(0.35 + id * 0.5 + (big - 0.5) * 0.8, 0, 1));
        mulC(
          px,
          (0.84 + fine * 0.28) *
            (0.8 + spot * 0.4) *
            (0.92 + hashCell(x, y, seed + 9) * 0.16) *
            (0.78 + 0.22 * top)
        );
        mixC(px, px, grout, Math.max(crack, hair * 0.7));
        if (glowData) {
          const glow =
            Math.max(crack, hair * 0.5) * smoothstep(0.55, 0.75, mid) * smoothstep(0.35, 0.6, big);
          const gi = (y * W + x) * 4;
          glowData[gi] = glowData[gi + 1] = glowData[gi + 2] = Math.min(255, glow * 255);
          glowData[gi + 3] = 255;
        }
      } else {
        let stoneMask;
        let hStone;
        let jointMix;
        if (style === 'slab') {
          stoneMask = smoothstep(0.018, 0.038, edge);
          mixC(px, stone, stone2, id);
          mulC(px, (0.84 + id * 0.3) * (0.86 + fine * 0.26) * (0.92 + mid * 0.16));
          // pale marble veining
          const vein = Math.abs(Math.sin((X * 1.7 + Y * 0.6 + mid * 6) * 2.2));
          const v = smoothstep(0.08, 0.0, vein) * 0.18;
          px[0] -= v;
          px[1] -= v;
          px[2] -= v * 0.8;
          hStone = stoneMask * (0.65 + id * 0.12 + fine * 0.12);
          jointMix = 0.35 + mid * 0.4;
        } else {
          // joints vary in width, edges are chipped and shoulders worn round
          const e = edge - (0.012 + mid * 0.03) + (fine - 0.5) * 0.04;
          stoneMask = smoothstep(0, 0.02, e);
          const sh = smoothstep(0, 0.08 + id * 0.1, e);
          const top = sh * (2 - sh);
          const spot = noise(X / sSpot + 17, Y / sSpot, pSpot, 3);
          // every stone gets its own shade and hue, mottled at the scale of a hand, with a fine grain
          const id2 = hashCell(Math.floor(id * 9973), 7, seed + 3);
          mixC(px, stone, stone2, id2);
          const warm = (id2 - 0.5) * 0.06;
          px[0] *= 1 + warm;
          px[2] *= 1 - warm;
          mulC(
            px,
            (0.86 + id * 0.24) *
              (0.86 + big * 0.28) *
              (0.8 + spot * 0.4) *
              (0.92 + hashCell(x, y, seed + 9) * 0.16) *
              (0.84 + 0.16 * top)
          );
          // pale lichen rosettes on the stone tops
          if (top > 0) {
            const l = smoothstep(0.7, 0.78, noise(X / sFine + 71, Y / sFine, pFine, 2));
            mixC(px, px, lichen, l * top * 0.4);
          }
          // dust settles in the hollows and towards the verges
          const dust = smoothstep(
            0.35,
            0.85,
            (1 - top) * 0.5 + (1 - centre) * 0.35 + (0.5 - spot) * 0.6 + (0.5 - big) * 0.4
          );
          mixC(px, px, dirt, dust * 0.45);
          hStone = top * (0.5 + tilt + (spot - 0.5) * 0.12 + (fine - 0.5) * 0.08);
          jointMix = 0.6 + mid * 0.35;
        }
        // missing stones reveal packed dirt, more often on the sides and near the edges
        const keep =
          id <
          coverage +
            (centre - 0.4) * 0.25 -
            (big - 0.5) * 0.6 -
            smoothstep(0.08, 0.0, sideDist) * 0.8;
        const present = keep ? 1 : 0;
        h = present * hStone + (1 - present) * (0.18 + mid * 0.12);
        // joints are packed with earth rather than drawn as dark lines
        mixC(tmp, grout, dirt, jointMix);
        mixC(px, tmp, px, stoneMask * present);
        if (!present) {
          mixC(px, dirt, grout, (1 - mid) * 0.35);
          mulC(px, 0.85 + fine * 0.3);
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
      if (petals) {
        // scattered fallen petals, one at most per 25 cm square
        const pcx = Math.floor(X * 4);
        const pcy = Math.floor(Y * 4);
        if (hashCell(pcx, pcy, seed + 5) > 0.9) {
          const ox = (pcx + 0.25 + hashCell(pcx, pcy, seed + 6) * 0.5) / 4 - X;
          const oy = (pcy + 0.25 + hashCell(pcx, pcy, seed + 7) * 0.5) / 4 - Y;
          const d = Math.sqrt(ox * ox + oy * oy);
          const rad = 0.035 + hashCell(pcx, pcy, seed + 8) * 0.03;
          mixC(px, px, petals, (1 - smoothstep(rad * 0.6, rad, d)) * 0.8);
        }
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

  const normalMap = toTexture(normalCanvas(height, W, H, cfg.relief ?? 5, false), {
    srgbSpace: false,
  });
  const out = { map: toTexture(cv), normalMap };
  if (gcv) {
    gcv.getContext('2d').putImageData(glowImg, 0, 0);
    out.glowMap = toTexture(gcv);
  }
  return out;
}

// Fine stone grain (mottling, grit and small pits) that tiles in both directions, laid over the road
// maps so the surface keeps some texture up close. The colour map is linear and centred on mid grey.
export function makeRoadDetail(seed = 1) {
  const S = 256;
  const noise = tiledNoise(seed * 53 + 11);
  const height = new Float32Array(S * S);
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const data = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = noise((x / S) * 8, (y / S) * 8, 8, 4, 8);
      const grit = hashCell(x, y, seed + 21);
      // sparse pits, at most one per 8 px square
      const cx = x >> 3;
      const cy = y >> 3;
      let pit = 0;
      if (hashCell(cx, cy, seed + 22) > 0.75) {
        const ox = cx * 8 + 2 + hashCell(cx, cy, seed + 23) * 4 - x;
        const oy = cy * 8 + 2 + hashCell(cx, cy, seed + 24) * 4 - y;
        pit = 1 - smoothstep(0.8, 2.2, Math.sqrt(ox * ox + oy * oy));
      }
      height[y * S + x] = n * 0.8 + grit * 0.15 - pit * 0.35;
      const c = 0.5 * (1 + (n - 0.5) * 0.5 + (grit - 0.5) * 0.14 - pit * 0.22);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = clamp(c, 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = (canvas) => {
    const t = toTexture(canvas, { srgbSpace: false });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  return { map: tex(cv), normalMap: tex(normalCanvas(height, S, S, 2.5, true)) };
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
