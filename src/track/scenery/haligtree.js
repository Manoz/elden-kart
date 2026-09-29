// Haligtree: moonlit blossom forest, giant glowing roots, falling petals, ice-blue crystals.
import * as THREE from 'three';
import { instanced, propMaterial, addSway, scatter, roadside, part, mergeParts } from './common.js';
import { blob, rockGeo, archGeo, rootGeo, pillarGeo } from './props.js';
import { graceSites, mistPuffs, ambient, lampGlows } from './kit.js';
import { createBillboards } from '../fx.js';
import { KERB } from '../Centerline.js';

const tint = (rng, base = 1, spread = 0.25) => {
  const v = base + (rng() - 0.5) * spread;
  return new THREE.Color(v, v * 0.95, v).getHex();
};

function blossomGeo() {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.4, 0.75, 6, 6), 0xd8d0dc, {
      pos: [0, 3, 0],
      rot: [0.03, 0, 0.06],
      shade: 0.4,
    }),
    part(blob(3.6, 1, 0.8, 3, 0.2), 0xf6b8d6, { pos: [0, 7.2, 0], shade: 0.4, jitter: 0.1 }),
    part(blob(2.6, 1, 0.8, 5, 0.2), 0xffd6ea, { pos: [2.3, 6.0, 0.8], shade: 0.4, jitter: 0.1 }),
    part(blob(2.4, 1, 0.8, 8, 0.2), 0xf0a8cc, { pos: [-2.0, 6.3, -1.0], shade: 0.4, jitter: 0.1 }),
    part(blob(1.8, 1, 0.8, 9, 0.2), 0xffe6f2, { pos: [0.3, 9.3, 0.4], shade: 0.4, jitter: 0.1 }),
  ]);
}

function crystalGeo() {
  return mergeParts([
    part(new THREE.OctahedronGeometry(1, 0), 0x9fe0ff, {
      pos: [0, 1.8, 0],
      scale: [0.7, 1.9, 0.7],
      shade: 0.1,
    }),
    part(new THREE.OctahedronGeometry(1, 0), 0xc0f0ff, {
      pos: [1, 1.0, 0.4],
      rot: [0.2, 0, -0.4],
      scale: [0.45, 1.1, 0.45],
      shade: 0.1,
    }),
    part(new THREE.OctahedronGeometry(1, 0), 0x88ccff, {
      pos: [-0.9, 0.8, -0.3],
      rot: [-0.2, 0, 0.4],
      scale: [0.4, 0.9, 0.4],
      shade: 0.1,
    }),
  ]);
}

export function buildHaligtree(ctx) {
  const { core, rng, uTime, noise } = ctx;
  const hw = core.layout.halfWidth;

  // blossom trees
  const bl = blossomGeo();
  const blMat = addSway(propMaterial(), uTime, 0.45, 10);
  const trees = scatter(core, rng, {
    count: 520,
    min: 5,
    max: 150,
    radius: 4,
    filter: (p) => noise.fbm(p.x * 0.012, p.z * 0.012, 3) > 0.4 && core.groundAt(p.x, p.z) > -5,
  }).map((p) => ({
    x: p.x,
    y: p.y - 0.2,
    z: p.z,
    ry: rng() * 6.28,
    s: 0.8 + rng() * 1.3,
    color: tint(rng, 1, 0.3),
  }));
  ctx.add(instanced(bl, blMat, trees));
  ctx.own(bl);

  // frosted rocks
  const rockG = rockGeo(0x9a92b8);
  const rocks = [
    ...scatter(core, rng, { count: 200, min: 4, max: 100, radius: 4.6 }).map((p) => ({
      x: p.x,
      y: p.y - 0.3,
      z: p.z,
      ry: rng() * 6.28,
      s: [1 + rng() * 3, 0.8 + rng() * 2.4, 1 + rng() * 3],
      color: tint(rng, 1, 0.3),
    })),
    ...scatter(core, rng, { count: 60, min: 40, max: 340, radius: 26 }).map((p) => ({
      x: p.x,
      y: p.y - 3,
      z: p.z,
      ry: rng() * 6.28,
      s: [10 + rng() * 26, 10 + rng() * 32, 10 + rng() * 26],
      color: tint(rng, 0.9, 0.2),
    })),
  ];
  ctx.add(instanced(rockG, propMaterial({ flatShading: true }), rocks));
  ctx.own(rockG);

  // ice-blue crystals
  const cr = crystalGeo();
  const crItems = scatter(core, rng, { count: 240, min: 4, max: 90, radius: 2.5 }).map((p) => ({
    x: p.x,
    y: p.y - 0.2,
    z: p.z,
    ry: rng() * 6.28,
    s: 0.7 + rng() * 2,
    color: tint(rng, 1.1, 0.3),
  }));
  ctx.add(
    instanced(cr, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), crItems)
  );
  ctx.own(cr);
  ctx.register(
    createBillboards(
      crItems
        .filter((_, i) => i % 3 === 0)
        .map((c) => ({
          x: c.x,
          y: c.y + 1.5 * c.s,
          z: c.z,
          size: 3.2 * c.s,
          color: 0x88ccff,
          alpha: 0.5,
          phase: Math.random(),
        })),
      { flicker: 0.5 }
    )
  );

  // giant roots arching over the road and along the ridge
  const rootParts = [];
  [0.03, 0.14, 0.27, 0.4, 0.55, 0.66, 0.8, 0.92].forEach((t, k) => {
    const p = core.getPoint(t);
    const y0 = p.pos.y;
    const R = (l, up, ahead = 0) => [
      p.pos.x + p.right.x * l + p.tangent.x * ahead,
      y0 + up,
      p.pos.z + p.right.z * l + p.tangent.z * ahead,
    ];
    const span = hw + 22;
    const flip = k % 2 ? 1 : -1;
    rootParts.push(
      rootGeo(
        [
          R(-span * flip, -6, -8),
          R(-span * 0.9 * flip, 14, -4),
          R(-span * 0.4 * flip, 30, 0),
          R(span * 0.4 * flip, 33, 4),
          R(span * 0.9 * flip, 14, 8),
          R(span * flip, -6, 10),
        ],
        3.6,
        0xb8a8b8,
        48
      ),
      rootGeo(
        [
          R(-span * flip - 8, -6, 8),
          R(-span * 0.7 * flip, 18, 3),
          R(0, 36, 0),
          R(span * 0.6 * flip, 20, -4),
          R(span * flip + 6, -6, -8),
        ],
        2.0,
        0xd8c8d8,
        40
      )
    );
  });
  const roots = mergeParts(rootParts);
  ctx.add(new THREE.Mesh(roots, propMaterial({ emissive: 0x281a3a, side: THREE.DoubleSide })));
  ctx.own(roots);

  // stone arches with a cold glow
  const arch = archGeo({ stone: 0xd4cce6, span: hw * 2 + 12, height: 12 });
  const aItems = [];
  [0.12, 0.34, 0.6, 0.84].forEach((t) => {
    const q = roadside(core, t, 0);
    aItems.push({ x: q.x, y: q.roadY - 0.3, z: q.z, ry: q.yaw + Math.PI, s: 1 });
  });
  ctx.add(instanced(arch, propMaterial({ emissive: 0x141028 }), aItems));
  ctx.own(arch);
  lampGlows(
    ctx,
    aItems.map((a) => ({ x: a.x, y: a.y + 12, z: a.z })),
    { size: 7, color: 0xa8e0ff, alpha: 0.22 }
  );

  const pil = pillarGeo({ stone: 0xd8d0ea, height: 9, broken: true });
  const pils = [];
  [0.08, 0.22, 0.45, 0.58, 0.72, 0.9].forEach((t, k) => {
    for (let n = 0; n < 3; n++) {
      const q = roadside(core, t + n * 0.005, (k % 2 ? 1 : -1) * (hw + KERB + 9 + rng() * 10));
      pils.push({ x: q.x, y: q.y - 0.2, z: q.z, ry: rng() * 6.28, s: 0.9 + rng() * 0.4 });
    }
  });
  ctx.add(instanced(pil, propMaterial({ flatShading: true }), pils));
  ctx.own(pil);

  graceSites(ctx, [0.04, 0.26, 0.5, 0.72, 0.9], { color: 0xbfe6ff, motes: 0xffe0f0 });

  mistPuffs(ctx, { count: 90, color: 0xb8a0e0, alpha: 0.22, size: 40, yMin: 2, yMax: 9 });
  // falling petals + drifting light motes
  ambient(ctx, {
    count: 2600,
    colorA: 0xffd0e8,
    colorB: 0xffffff,
    size: 0.34,
    rise: -1.3,
    range: 34,
    sway: 3.0,
    spread: 90,
    kind: 'petal',
    spin: 1.6,
    additive: false,
    alpha: 0.95,
  });
  ambient(ctx, {
    count: 700,
    colorA: 0xa0e0ff,
    colorB: 0xffc8f0,
    size: 0.24,
    rise: 0.8,
    range: 26,
    sway: 2.0,
    spread: 90,
    alpha: 0.9,
  });
}
