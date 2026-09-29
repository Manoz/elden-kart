// Geometry helpers that sweep cross-section edges along the centreline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const val = (f, i, k) => (typeof f === 'function' ? f(i, k) : f);

// idx: sample indices along the track (may wrap). a/b: [lateral, dy] or fn(i,k) => [lateral, dy].
// u range: uA..uB across the strip, v = arc length / vScale.
export function buildStrip(core, { idx, a, b, uA = 0, uB = 1, vScale = 8, v0 = 0 }) {
  const n = idx.length;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    const rx = core.rx[i];
    const rz = core.rz[i];
    const v = v0 + (k * core.ds) / vScale;
    for (let e = 0; e < 2; e++) {
      const [lat0, dy] = val(e === 0 ? a : b, i, k);
      const s = lat0 < 0 ? -1 : 1;
      const lat = s * Math.min(Math.abs(lat0), core.innerLimit(i, s));
      const o = k * 6 + e * 3;
      pos[o] = core.px[i] + rx * lat;
      pos[o + 1] = core.py[i] + dy;
      pos[o + 2] = core.pz[i] + rz * lat;
      uv[k * 4 + e * 2] = e === 0 ? uA : uB;
      uv[k * 4 + e * 2 + 1] = v;
    }
  }
  const index = [];
  for (let k = 0; k < n - 1; k++) {
    const a0 = k * 2;
    const b0 = k * 2 + 1;
    const a1 = (k + 1) * 2;
    const b1 = (k + 1) * 2 + 1;
    index.push(a0, b0, a1, b0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function loopIndices(N) {
  const out = new Array(N + 1);
  for (let i = 0; i <= N; i++) out[i] = i % N;
  return out;
}

// Contiguous runs of flagged samples (wrapping) as index arrays.
export function runsOf(flags, N) {
  let start = -1;
  for (let i = 0; i < N; i++) {
    if (!flags[i] && flags[(i + 1) % N]) {
      start = (i + 1) % N;
      break;
    }
  }
  if (start < 0) return flags[0] ? [loopIndices(N)] : [];
  const runs = [];
  let cur = null;
  for (let n = 0; n < N; n++) {
    const i = (start + n) % N;
    if (flags[i]) {
      if (!cur) cur = [];
      cur.push(i);
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.length > 3);
}

export function indexRange(core, s0, len) {
  const N = core.N;
  const i0 = Math.round(s0 / core.ds);
  const n = Math.round(len / core.ds);
  const out = [];
  for (let k = 0; k <= n; k++) out.push((((i0 + k) % N) + N) % N);
  return out;
}

export function merge(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  return ok.length === 1 ? ok[0] : mergeGeometries(ok, false);
}
