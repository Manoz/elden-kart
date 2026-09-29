// Pure track logic (no rendering): centreline table, sampling, walls, terrain height field.
import { CatmullRomCurve3, Vector3 } from 'three';
import { clamp, lerp, smoothstep, makeNoise } from './util.js';

export const KERB = 1.6;
const CELL = 24;
const SHOULDER = 9;

export class TrackCore {
  constructor(layout) {
    this.layout = layout;
    this.id = layout.id;
    this.name = layout.name;
    this.laps = layout.laps ?? 3;
    this.kerbWidth = KERB;
    this.shoulderWidth = SHOULDER;
    this.checkpoints = layout.checkpoints ?? 16;
    this.terrainCfg = Object.assign(
      { level: 0, amp: 10, freq: 0.006, mtn: 60, margin: 420, seg: 260, rimGain: 1.5 },
      layout.terrain || {}
    );
    this.noise = makeNoise(layout.seed ?? 1);
    this._buildCenterline();
    this._buildGrid();
    this._buildFeatures();
    this._buildWorld();
    this._q = { a: 0, b: 1, s: 0, d2: 0 };
  }

  // ---------------------------------------------------------------- centreline
  _buildCenterline() {
    const L = this.layout;
    const defHw = L.halfWidth ?? 15;
    const pts = L.points.map((p) => new Vector3(p[0], p[2] ?? 0, p[1]));
    const curve = new CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = 8000;
    const total = curve.getLength();
    const N = Math.max(64, Math.round(total / 2));
    const sp = curve.getSpacedPoints(N);
    this.N = N;
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.pz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.px[i] = sp[i].x;
      this.py[i] = sp[i].y;
      this.pz[i] = sp[i].z;
    }
    let len = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      len += Math.hypot(this.px[j] - this.px[i], this.py[j] - this.py[i], this.pz[j] - this.pz[i]);
    }
    this.length = len;
    this.ds = len / N;

    this.tx = new Float32Array(N);
    this.ty = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.rx = new Float32Array(N);
    this.rz = new Float32Array(N);
    this.slope = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      let dx = this.px[b] - this.px[a];
      let dy = this.py[b] - this.py[a];
      let dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      this.tx[i] = dx;
      this.ty[i] = dy;
      this.tz[i] = dz;
      const fl = Math.hypot(dx, dz) || 1;
      this.rx[i] = -dz / fl;
      this.rz[i] = dx / fl;
      this.slope[i] = dy / fl;
    }
    // signed curvature, positive = turning right
    this.curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      const fa = Math.hypot(this.tx[a], this.tz[a]) || 1;
      const fb = Math.hypot(this.tx[b], this.tz[b]) || 1;
      const dtx = this.tx[b] / fb - this.tx[a] / fa;
      const dtz = this.tz[b] / fb - this.tz[a] / fa;
      this.curv[i] = (dtx * this.rx[i] + dtz * this.rz[i]) / (2 * this.ds);
    }

    // half width: smooth interpolation between control points
    const cps = L.points.map((p, k) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < N; i++) {
        const d = (this.px[i] - pts[k].x) ** 2 + (this.pz[i] - pts[k].z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return { idx: best, hw: (p[3] ?? 1) * defHw };
    });
    this.hw = new Float32Array(N);
    const K = cps.length;
    for (let k = 0; k < K; k++) {
      const c0 = cps[k];
      const c1 = cps[(k + 1) % K];
      const span = (c1.idx - c0.idx + N) % N || N;
      for (let n = 0; n < span; n++) {
        const u = n / span;
        const e = u * u * (3 - 2 * u);
        this.hw[(c0.idx + n) % N] = lerp(c0.hw, c1.hw, e);
      }
    }
  }

  _buildGrid() {
    this.grid = new Map();
    for (let i = 0; i < this.N; i++) {
      const k = this._key(Math.floor(this.px[i] / CELL), Math.floor(this.pz[i] / CELL));
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(i);
    }
  }

  _key(cx, cz) {
    return (cx + 2048) * 4096 + (cz + 2048);
  }

  _buildFeatures() {
    const L = this.layout;
    const N = this.N;
    this.wallL = new Uint8Array(N);
    this.wallR = new Uint8Array(N);
    this.abyssL = new Float32Array(N);
    this.abyssR = new Float32Array(N);
    const mark = (ranges, cb) => {
      for (const [t0, t1, side = 'both'] of ranges || []) {
        const i0 = Math.round(t0 * N);
        let n = Math.round((t1 - t0 + (t1 < t0 ? 1 : 0)) * N);
        for (let k = 0; k <= n; k++) cb((i0 + k) % N, side);
      }
    };
    mark(L.walls, (i, side) => {
      if (side !== 'right') this.wallL[i] = 1;
      if (side !== 'left') this.wallR[i] = 1;
    });
    mark(L.abyss, (i, side) => {
      if (side !== 'right') this.abyssL[i] = 1;
      if (side !== 'left') this.abyssR[i] = 1;
    });
    // soften abyss transitions
    for (const arr of [this.abyssL, this.abyssR]) {
      for (let pass = 0; pass < 2; pass++) {
        const src = arr.slice();
        for (let i = 0; i < N; i++) {
          let s = 0;
          for (let k = -10; k <= 10; k++) s += src[(i + k + N) % N];
          arr[i] = s / 21;
        }
      }
    }
    const snap = (v) => Math.round(v / this.ds) * this.ds;
    this.boosts = (L.boosts || []).map((b) => ({
      s0: snap(b.t * this.length),
      len: snap(b.len ?? 14),
      lat: b.lat ?? 0,
      w: b.w ?? 11,
    }));
    this.ramps = (L.ramps || []).map((r) => ({
      s0: snap(r.t * this.length),
      len: snap(r.len ?? 10),
      lat: r.lat ?? 0,
      w: r.w ?? 12,
      h: r.h ?? 1.5,
    }));
    this.pools = (L.pools || []).map((p) => ({
      x: p.x,
      z: p.z,
      r: p.r,
      type: p.type ?? 'rot',
      depth: p.depth ?? ((p.type ?? 'rot') === 'rot' ? 0.4 : 2.6),
      y: 0,
      level: 0,
    }));
  }

  _buildWorld() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < this.N; i++) {
      minX = Math.min(minX, this.px[i]);
      maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]);
      maxZ = Math.max(maxZ, this.pz[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
    const T = this.terrainCfg;
    this.worldCx = (minX + maxX) / 2;
    this.worldCz = (minZ + maxZ) / 2;
    this.worldSize = Math.max(maxX - minX, maxZ - minZ) + 2 * T.margin;
    // pool levels from surrounding terrain (before flattening)
    for (const p of this.pools) {
      const q = this._nearestGlobal(p.x, p.z, {});
      const info = this._info(q, p.x, p.z);
      const h = this._groundNoPools(p.x, p.z, info.d, info.roadY, info.edge, 0);
      p.y = h;
      p.level = h - p.depth;
    }
    // minimap
    const pts = [];
    const step = Math.max(1, Math.round(10 / this.ds));
    for (let i = 0; i < this.N; i += step) pts.push([this.px[i], this.pz[i]]);
    const pad = 30;
    this.miniMap = {
      points: pts,
      bounds: { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad },
    };
    // item boxes
    this.itemBoxes = [];
    for (const t of this.layout.itemRows || []) {
      const p = this.getPoint(t);
      const count = 4;
      for (let k = 0; k < count; k++) {
        const f = ((k + 0.5) / count) * 2 - 1;
        this.itemBoxes.push(
          p.pos
            .clone()
            .addScaledVector(p.right, f * p.halfWidth * 0.68)
            .add(new Vector3(0, 1.0, 0))
        );
      }
    }
  }

  // ------------------------------------------------------------------ queries
  _d2(i, x, z) {
    const dx = this.px[i] - x;
    const dz = this.pz[i] - z;
    return dx * dx + dz * dz;
  }

  _nearestIndexGlobal(x, z) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = -1;
    let bd = Infinity;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const arr = this.grid.get(this._key(cx + ox, cz + oz));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const d = this._d2(arr[k], x, z);
          if (d < bd) {
            bd = d;
            best = arr[k];
          }
        }
      }
    }
    if (best >= 0 && bd <= CELL * CELL) return best;
    best = 0;
    bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const d = this._d2(i, x, z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  _nearestIndexLocal(i0, x, z) {
    const N = this.N;
    let i = i0;
    let d = this._d2(i, x, z);
    for (let n = 0; n < 200; n++) {
      const k = (i + 1) % N;
      const dk = this._d2(k, x, z);
      if (dk < d) {
        i = k;
        d = dk;
      } else break;
    }
    for (let n = 0; n < 200; n++) {
      const k = (i - 1 + N) % N;
      const dk = this._d2(k, x, z);
      if (dk < d) {
        i = k;
        d = dk;
      } else break;
    }
    return i;
  }

  _refine(i, x, z, q) {
    const N = this.N;
    let bestD = Infinity;
    for (let k = -1; k <= 0; k++) {
      const a = (i + k + N) % N;
      const b = (a + 1) % N;
      const ax = this.px[a];
      const az = this.pz[a];
      const dx = this.px[b] - ax;
      const dz = this.pz[b] - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      const s = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const ex = x - (ax + dx * s);
      const ez = z - (az + dz * s);
      const d2 = ex * ex + ez * ez;
      if (d2 < bestD) {
        bestD = d2;
        q.a = a;
        q.b = b;
        q.s = s;
      }
    }
    q.d2 = bestD;
    return q;
  }

  _nearestGlobal(x, z, q) {
    return this._refine(this._nearestIndexGlobal(x, z), x, z, q);
  }

  // Derived quantities for a refined query.
  _info(q, x, z) {
    const { a, b, s } = q;
    const cx = lerp(this.px[a], this.px[b], s);
    const cz = lerp(this.pz[a], this.pz[b], s);
    let rx = lerp(this.rx[a], this.rx[b], s);
    let rz = lerp(this.rz[a], this.rz[b], s);
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const lateral = (x - cx) * rx + (z - cz) * rz;
    const roadY = lerp(this.py[a], this.py[b], s);
    const hw = lerp(this.hw[a], this.hw[b], s);
    return { lateral, roadY, hw, edge: hw + KERB, d: Math.sqrt(q.d2), rx, rz, cx, cz };
  }

  _rampAt(sArc, lateral) {
    const L = this.length;
    for (const r of this.ramps) {
      const u = (((sArc - r.s0) % L) + L) % L;
      if (u < r.len && Math.abs(lateral - r.lat) < r.w / 2)
        return { h: (r.h * u) / r.len, slope: r.h / r.len };
    }
    return null;
  }

  _boostAt(sArc, lateral) {
    const L = this.length;
    for (const p of this.boosts) {
      const u = (((sArc - p.s0) % L) + L) % L;
      if (u < p.len && Math.abs(lateral - p.lat) < p.w / 2) return true;
    }
    return false;
  }

  _poolAdjust(x, z, h) {
    for (const p of this.pools) {
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd > p.r * 1.05) continue;
      const w = 1 - smoothstep(p.r * 0.75, p.r * 1.05, dd);
      h = lerp(h, p.level, w);
    }
    return h;
  }

  _base(x, z, d) {
    const T = this.terrainCfg;
    const n = this.noise;
    let h = (n.fbm(x * T.freq, z * T.freq, 4) * 2 - 1) * T.amp;
    const m = n.fbm(x * T.freq * 0.35 + 91, z * T.freq * 0.35 - 17, 3);
    h += m * m * T.mtn * (1 + T.rimGain * smoothstep(150, 520, d)) * smoothstep(90, 330, d);
    return T.level + h;
  }

  _groundNoPools(x, z, d, roadY, edge, abyss) {
    const flatD = edge + SHOULDER;
    const roadBase = roadY - 1.3;
    const w = smoothstep(flatD, flatD + 60, d);
    let far = this._base(x, z, d);
    far += (roadBase - this.terrainCfg.level) * 0.85 * Math.exp(-Math.max(d - flatD, 0) / 180);
    let h = lerp(roadBase, far, w);
    if (abyss > 0) h -= abyss * 70 * smoothstep(edge + 5, edge + 16, d);
    return h;
  }

  // Terrain height for an arbitrary world position (global nearest search; used by scenery/terrain build).
  groundAt(x, z) {
    const q = this._nearestGlobal(x, z, {});
    const inf = this._info(q, x, z);
    const ab = inf.lateral < 0 ? this.abyssL[q.a] : this.abyssR[q.a];
    return this._poolAdjust(x, z, this._groundNoPools(x, z, inf.d, inf.roadY, inf.edge, ab));
  }

  // Terrain height plus the data needed to colour it.
  groundInfo(x, z, out = {}) {
    const q = this._nearestGlobal(x, z, {});
    const inf = this._info(q, x, z);
    const ab = inf.lateral < 0 ? this.abyssL[q.a] : this.abyssR[q.a];
    out.h = this._poolAdjust(x, z, this._groundNoPools(x, z, inf.d, inf.roadY, inf.edge, ab));
    out.d = inf.d - inf.edge;
    out.roadY = inf.roadY;
    out.abyss = ab;
    return out;
  }

  // Distance to the road edge (metres, >0 off the road) and road height at nearest point.
  distToRoad(x, z) {
    const q = this._nearestGlobal(x, z, {});
    const inf = this._info(q, x, z);
    return { d: inf.d - inf.hw, roadY: inf.roadY, lateral: inf.lateral, i: q.a, s: q.s };
  }

  // ---------------------------------------------------------------- public API
  getPoint(t) {
    const N = this.N;
    let f = (((t % 1) + 1) % 1) * N;
    if (!Number.isFinite(f)) f = 0;
    const a = Math.floor(f) % N;
    const b = (a + 1) % N;
    const s = f - Math.floor(f);
    const pos = new Vector3(
      lerp(this.px[a], this.px[b], s),
      lerp(this.py[a], this.py[b], s),
      lerp(this.pz[a], this.pz[b], s)
    );
    const tangent = new Vector3(
      lerp(this.tx[a], this.tx[b], s),
      lerp(this.ty[a], this.ty[b], s),
      lerp(this.tz[a], this.tz[b], s)
    ).normalize();
    const right = new Vector3(-tangent.z, 0, tangent.x).normalize();
    const up = new Vector3().crossVectors(right, tangent).normalize();
    return { pos, tangent, right, up, halfWidth: lerp(this.hw[a], this.hw[b], s) };
  }

  sample(pos, hintT) {
    const x = pos.x;
    const y = pos.y;
    const z = pos.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      const p = this.getPoint(0);
      return {
        t: 0,
        lateral: 0,
        halfWidth: p.halfWidth,
        height: p.pos.y,
        normal: new Vector3(0, 1, 0),
        surface: 'road',
      };
    }
    const q = this._q;
    let i;
    if (Number.isFinite(hintT)) {
      i = this._nearestIndexLocal(Math.round((((hintT % 1) + 1) % 1) * this.N) % this.N, x, z);
      if (this._d2(i, x, z) > 3600) {
        const g = this._nearestIndexGlobal(x, z);
        if (this._d2(g, x, z) < this._d2(i, x, z)) i = g;
      }
    } else {
      i = this._nearestIndexGlobal(x, z);
    }
    this._refine(i, x, z, q);
    const inf = this._info(q, x, z);
    const { a, b, s } = q;
    const tIdx = a + s;
    const t = (((tIdx / this.N) % 1) + 1) % 1;
    const sArc = tIdx * this.ds;
    const lat = inf.lateral;
    const absLat = Math.abs(lat);
    const slope = lerp(this.slope[a], this.slope[b], s);
    let height = inf.roadY;
    let surface;
    let normalSlope = slope;
    let jump = 0;
    if (absLat <= inf.edge) {
      const ramp = this._rampAt(sArc, lat);
      if (ramp) {
        height += ramp.h;
        normalSlope += ramp.slope;
        jump = ramp.slope * 42;
      }
      surface = absLat <= inf.hw && this._boostAt(sArc, lat) ? 'boost' : 'road';
    } else {
      const ab = lat < 0 ? this.abyssL[a] : this.abyssR[a];
      height = this._poolAdjust(x, z, this._groundNoPools(x, z, inf.d, inf.roadY, inf.edge, ab));
      surface = 'offroad';
      for (const p of this.pools) {
        if (p.type === 'rot' && Math.hypot(x - p.x, z - p.z) < p.r * 0.95) {
          surface = 'rot';
          break;
        }
      }
      const half = this.worldSize / 2;
      if (
        (ab > 0.5 && absLat > inf.edge + 12) ||
        y < height - 40 ||
        Math.abs(x - this.worldCx) > half ||
        Math.abs(z - this.worldCz) > half
      ) {
        surface = 'void';
      }
      normalSlope = 0;
    }
    const tfx = lerp(this.tx[a], this.tx[b], s);
    const tfz = lerp(this.tz[a], this.tz[b], s);
    const tl = Math.hypot(tfx, tfz) || 1;
    const normal = new Vector3(-normalSlope * (tfx / tl), 1, -normalSlope * (tfz / tl)).normalize();
    const out = {
      t,
      lateral: lat,
      halfWidth: inf.hw,
      height: Number.isFinite(height) ? height : 0,
      normal,
      surface,
    };
    if (jump > 0) out.jump = jump;
    return out;
  }

  constrain(pos, radius = 1) {
    const x = pos.x;
    const z = pos.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const q = this._nearestGlobal(x, z, {});
    const inf = this._info(q, x, z);
    const lat = inf.lateral;
    const side = lat < 0 ? -1 : 1;
    const wall = side < 0 ? this.wallL : this.wallR;
    if (!wall[q.a] && !wall[q.b]) return null;
    const wallLat = inf.edge + 1.2;
    const reach = Math.abs(lat) + radius - wallLat;
    if (reach <= 0 || Math.abs(lat) > wallLat + 6) return null;
    const nx = -side * inf.rx;
    const nz = -side * inf.rz;
    return { push: new Vector3(nx * reach, 0, nz * reach), normal: new Vector3(nx, 0, nz) };
  }

  startGrid(i) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const back = 9 + row * 7.5 + (col ? 3.5 : 0);
    const t = 1 - back / this.length;
    const p = this.getPoint(t);
    const lat = (col ? 1 : -1) * p.halfWidth * 0.36;
    const pos = p.pos.clone().addScaledVector(p.right, lat);
    const yaw = Math.atan2(-p.tangent.x, -p.tangent.z);
    return { pos, yaw };
  }

  // Lateral offset limit on the inner side of a bend so that offset strips never fold over.
  innerLimit(i, side) {
    const k = this.curv[i];
    if (side > 0 && k > 1e-4) return 0.9 / k;
    if (side < 0 && k < -1e-4) return 0.9 / -k;
    return Infinity;
  }
}
