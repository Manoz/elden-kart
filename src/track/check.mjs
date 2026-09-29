// Numeric sanity checks for the track layouts (node src/track/check.mjs [id] [--plot]).
import { Vector3 } from 'three';
import { TrackCore } from './Centerline.js';
import { LAYOUTS } from './layouts/index.js';

const args = process.argv.slice(2);
const plot = args.includes('--plot');
const ids = args.filter((a) => !a.startsWith('--'));
let failed = false;
const fail = (m) => {
  failed = true;
  console.log('  FAIL', m);
};

for (const id of Object.keys(LAYOUTS)) {
  if (ids.length && !ids.includes(id)) continue;
  const layout = LAYOUTS[id];
  const core = new TrackCore(layout);
  console.log(
    `== ${id}: length ${core.length.toFixed(0)} m, N=${core.N}, lap@42 = ${(core.length / 42).toFixed(0)}s`
  );
  if (plot) {
    const fs = await import('node:fs');
    fs.writeFileSync(
      `${process.env.DUMP_DIR || '.'}/${id}.json`,
      JSON.stringify({
        px: Array.from(core.px),
        pz: Array.from(core.pz),
        py: Array.from(core.py),
        curv: Array.from(core.curv),
        hw: Array.from(core.hw),
        pts: layout.points,
        pools: layout.pools || [],
      })
    );
  }
  // curvature
  let minR = Infinity;
  let minRi = 0;
  let corners = 0;
  let prevSign = 0;
  for (let i = 0; i < core.N; i++) {
    const k = Math.abs(core.curv[i]);
    const R = 1 / Math.max(k, 1e-6);
    if (R < minR) {
      minR = R;
      minRi = i;
    }
    const sg = Math.abs(core.curv[i]) > 1 / 120 ? Math.sign(core.curv[i]) : 0;
    if (sg !== 0 && sg !== prevSign) {
      corners++;
      prevSign = sg;
    }
  }
  console.log(
    `  min radius ${minR.toFixed(1)} at t=${(minRi / core.N).toFixed(3)}, direction changes/corners ~ ${corners}`
  );
  // radius list of tight corners (R < 40)
  const tight = [];
  let cur = null;
  for (let i = 0; i < core.N; i++) {
    const R = 1 / Math.max(Math.abs(core.curv[i]), 1e-6);
    if (R < 40) {
      if (!cur) cur = { t: i / core.N, R };
      cur.R = Math.min(cur.R, R);
    } else if (cur) {
      tight.push(cur);
      cur = null;
    }
  }
  console.log(
    '  tight (<40m):',
    tight.map((c) => `t=${c.t.toFixed(2)} R=${c.R.toFixed(0)}`).join(', ')
  );
  if (minR < 17) fail(`min radius ${minR.toFixed(1)} < 17`);
  const nHair = tight.filter((c) => c.R < 24.5).length;
  console.log(`  corners tighter than 24.5 m: ${nHair}`);
  // slope
  let maxSlope = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < core.N; i++) {
    maxSlope = Math.max(maxSlope, Math.abs(core.slope[i]));
    minY = Math.min(minY, core.py[i]);
    maxY = Math.max(maxY, core.py[i]);
  }
  console.log(
    `  max grade ${(maxSlope * 100).toFixed(1)}%, y range ${minY.toFixed(1)}..${maxY.toFixed(1)}`
  );
  if (maxSlope > 0.2) fail('grade too steep');
  // self proximity
  let worst = Infinity;
  let worstPair = null;
  for (let i = 0; i < core.N; i++) {
    for (let j = i + 1; j < core.N; j++) {
      const arc = Math.min(j - i, core.N - (j - i)) * core.ds;
      if (arc < 110) continue;
      const d = Math.sqrt((core.px[i] - core.px[j]) ** 2 + (core.pz[i] - core.pz[j]) ** 2);
      const need = core.hw[i] + core.hw[j] + 2 * (core.kerbWidth + 1.2) + 4;
      const gap = d - need;
      if (gap < worst) {
        worst = gap;
        worstPair = [i / core.N, j / core.N, d];
      }
    }
  }
  console.log(
    `  min clearance beyond walls between distant road parts: ${worst.toFixed(1)} m at t=${worstPair[0].toFixed(3)}/${worstPair[1].toFixed(3)} (d=${worstPair[2].toFixed(1)})`
  );
  if (worst < 6) fail('road sections too close / intersecting');
  // widths
  let minHw = Infinity;
  let maxHw = 0;
  for (let i = 0; i < core.N; i++) {
    minHw = Math.min(minHw, core.hw[i]);
    maxHw = Math.max(maxHw, core.hw[i]);
  }
  console.log(`  half width ${minHw.toFixed(1)}..${maxHw.toFixed(1)}`);
  // continuity by driving with hint
  let maxDt = 0;
  let maxDh = 0;
  let nan = 0;
  let badLat = 0;
  for (const lat of [0, 6, -6, 12]) {
    let hint = 0;
    let prevT = 0;
    let prevH = null;
    for (let s = 0; s < core.length; s += 0.7) {
      const p = core.getPoint(s / core.length);
      const pos = p.pos.clone().addScaledVector(p.right, lat);
      const r = core.sample(pos, hint);
      if (
        !Number.isFinite(r.t) ||
        !Number.isFinite(r.height) ||
        !Number.isFinite(r.lateral) ||
        !Number.isFinite(r.normal.x)
      )
        nan++;
      let dt = Math.abs(r.t - prevT);
      if (dt > 0.5) dt = 1 - dt;
      if (s > 0) maxDt = Math.max(maxDt, dt * core.length);
      const rampy = r.jump !== undefined;
      if (prevH !== null && !rampy) maxDh = Math.max(maxDh, Math.abs(r.height - prevH));
      if (Math.abs(r.lateral - lat) > 1.2 && Math.abs(lat) < core.hw[0]) badLat++;
      prevT = r.t;
      hint = r.t;
      prevH = rampy ? null : r.height;
    }
  }
  console.log(
    `  sample: max t jump ${maxDt.toFixed(2)} m per 0.7 m step, max height jump ${maxDh.toFixed(2)}, NaN ${nan}, lateral mismatches ${badLat}`
  );
  if (nan) fail('NaN in sample');
  if (maxDt > 3) fail('t discontinuity');
  if (maxDh > 0.6) fail('height discontinuity');
  if (badLat > 50) fail('lateral mismatch');
  // start grid
  for (let g = 0; g < 8; g++) {
    const { pos, yaw } = core.startGrid(g);
    const r = core.sample(pos);
    const fwd = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const p = core.getPoint(r.t);
    const dot = fwd.dot(new Vector3(p.tangent.x, 0, p.tangent.z).normalize());
    const behind = (1 - r.t) * core.length;
    if (
      r.surface !== 'road' ||
      Math.abs(r.lateral) > r.halfWidth * 0.6 ||
      dot < 0.98 ||
      Math.abs(pos.y - r.height) > 0.05 ||
      behind > 40 ||
      behind < 3
    )
      fail(
        `grid ${g}: ${r.surface} lat ${r.lateral.toFixed(1)} dot ${dot.toFixed(3)} behind ${behind.toFixed(1)}`
      );
  }
  // fuzz
  let fz = 0;
  const surfaces = {};
  const b = core.bounds;
  const m = 500;
  for (let n = 0; n < 4000; n++) {
    const pos = new Vector3(
      b.minX - m + Math.random() * (b.maxX - b.minX + 2 * m),
      Math.random() * 60 - 20,
      b.minZ - m + Math.random() * (b.maxZ - b.minZ + 2 * m)
    );
    const r = core.sample(pos, Math.random() < 0.5 ? Math.random() : undefined);
    surfaces[r.surface] = (surfaces[r.surface] || 0) + 1;
    if (![r.t, r.lateral, r.height, r.normal.x, r.normal.y, r.normal.z].every(Number.isFinite))
      fz++;
    const c = core.constrain(pos, 1.2);
    if (c && ![c.push.x, c.push.z, c.normal.x].every(Number.isFinite)) fz++;
  }
  console.log('  fuzz surfaces', JSON.stringify(surfaces), 'nonfinite', fz);
  if (fz) fail('fuzz NaN');
  // terrain stays below the road (bilinear approximation of the terrain mesh)
  {
    const size = core.worldSize;
    const seg = core.terrainCfg.seg;
    const cell = size / seg;
    const x0 = core.worldCx - size / 2;
    const z0 = core.worldCz - size / 2;
    const cache = new Map();
    const node = (ix, iz) => {
      const k = ix * 100000 + iz;
      let v = cache.get(k);
      if (v === undefined) {
        v = core.groundAt(x0 + ix * cell, z0 + iz * cell);
        cache.set(k, v);
      }
      return v;
    };
    let worstMargin = Infinity;
    let at = 0;
    for (let i = 0; i < core.N; i += 2) {
      for (let f = -1; f <= 1.0001; f += 0.25) {
        const lat = f * (core.hw[i] + core.kerbWidth + 0.5);
        const x = core.px[i] + core.rx[i] * lat;
        const z = core.pz[i] + core.rz[i] * lat;
        const gx = (x - x0) / cell;
        const gz = (z - z0) / cell;
        const ix = Math.floor(gx);
        const iz = Math.floor(gz);
        const fx = gx - ix;
        const fz = gz - iz;
        const h =
          node(ix, iz) * (1 - fx) * (1 - fz) +
          node(ix + 1, iz) * fx * (1 - fz) +
          node(ix, iz + 1) * (1 - fx) * fz +
          node(ix + 1, iz + 1) * fx * fz;
        const m = core.py[i] - h;
        if (m < worstMargin) {
          worstMargin = m;
          at = i / core.N;
        }
      }
    }
    console.log(
      `  terrain below road: worst margin ${worstMargin.toFixed(2)} m at t=${at.toFixed(3)}`
    );
    if (worstMargin < 0.25) fail('terrain pokes through the road');
  }
  // wall constrain sanity
  let wallHits = 0;
  for (let i = 0; i < core.N; i += 5) {
    const p = core.getPoint(i / core.N);
    const pos = p.pos.clone().addScaledVector(p.right, p.halfWidth + core.kerbWidth + 1.5);
    if (core.constrain(pos, 1.2)) wallHits++;
  }
  console.log(`  wall constrain hits along ${Math.floor(core.N / 5)} probes: ${wallHits}`);
  console.log(
    `  boosts ${core.boosts.length}, ramps ${core.ramps.length}, itemBoxes ${core.itemBoxes.length}, pools ${core.pools.length}`
  );
}
console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK');
process.exit(failed ? 1 : 0);
