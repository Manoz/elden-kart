// Haligtree: racing through the misty boughs of Miquella's tree. Giant dark trunks vanish into the
// blue-grey haze, colossal branches arch over the road, salmon shelf fungi and hanging lichen cling to
// the bark, rust-red foliage, pale Elphael stonework and drifting scarlet rot spores.
import * as THREE from 'three';
import { instanced, propMaterial, scatter, roadside, part, mergeParts, addSway } from './common.js';
import { rockGeo, archGeo, rootGeo, pillarGeo, deadTreeGeo } from './props.js';
import { graceSites, mistPuffs, ambient, lampGlows } from './kit.js';
import { plantTrees, grassField, leafTexture } from './flora.js';
import { KERB } from '../Centerline.js';

const BARK = 0x5a5046;

const tint = (rng, base = 1, spread = 0.25) => {
  const v = base + (rng() - 0.5) * spread;
  return new THREE.Color(v, v * 0.97, v * 0.95).getHex();
};

// A cluster of three bracket fungi growing out of a surface; the shelf sticks out along +Z.
function fungusGeo() {
  const shelf = (r, y, z, rot) =>
    part(new THREE.SphereGeometry(r, 12, 5, 0, Math.PI, 0, Math.PI / 2), 0xd4907e, {
      pos: [0, y, z],
      rot: [0, rot, 0],
      scale: [1, 0.28, 1],
      shade: 0.5,
      jitter: 0.08,
    });
  return mergeParts([
    shelf(0.9, 0, 0, 0),
    shelf(0.65, 0.55, -0.05, 0.3),
    shelf(0.5, -0.45, 0.02, -0.4),
  ]);
}

// Pale lichen strand hanging down from a branch (origin at the top).
function lichenGeo() {
  return mergeParts([
    part(new THREE.ConeGeometry(0.22, 2.6, 5), 0xa7b2a2, {
      pos: [0, -1.3, 0],
      rot: [Math.PI, 0, 0],
      shade: 0.4,
      jitter: 0.1,
    }),
    part(new THREE.ConeGeometry(0.12, 1.6, 4), 0x8e9a8a, {
      pos: [0.25, -0.8, 0.1],
      rot: [Math.PI, 0, 0.2],
      shade: 0.4,
    }),
  ]);
}

export function buildHaligtree(ctx) {
  const { core, rng, noise } = ctx;
  const hw = core.layout.halfWidth;

  // rust-red foliage of Malenia's tree
  plantTrees(
    ctx,
    {
      height: 7.5,
      spread: 4.6,
      bark: BARK,
      leaves: [0x7a2e2a, 0x9a4a40, 0xb0685a, 0x5e2424],
      cards: 90,
      seed: 21,
    },
    scatter(core, rng, {
      count: 380,
      min: 5,
      max: 150,
      radius: 4,
      filter: (p) => noise.fbm(p.x * 0.012, p.z * 0.012, 3) > 0.4 && core.groundAt(p.x, p.z) > -5,
    }).map((p) => ({
      x: p.x,
      y: p.y - 0.2,
      z: p.z,
      ry: rng() * 6.28,
      s: 0.8 + rng() * 1.1,
      color: tint(rng, 1, 0.3),
    }))
  );
  // bare, lichen-grey trees in between
  const dead = deadTreeGeo({ bark: 0x4a4640 });
  ctx.add(
    instanced(
      dead,
      propMaterial(),
      scatter(core, rng, { count: 140, min: 6, max: 140, radius: 3 }).map((p) => ({
        x: p.x,
        y: p.y - 0.2,
        z: p.z,
        ry: rng() * 6.28,
        s: 0.9 + rng() * 1.2,
        color: tint(rng, 1, 0.3),
      }))
    )
  );
  ctx.own(dead);

  // dark ferns and moss with a few rust-red plants
  grassField(ctx, {
    count: 9000,
    reach: 32,
    variants: [
      { base: 0x1c241e, tip: 0x4a5a48, height: 0.7 },
      { base: 0x221c1a, tip: 0x7a3a32, height: 0.5 },
      { base: 0x1e2620, tip: 0x5e6a58, height: 0.9 },
    ],
  });

  // mossy boulders
  const rockG = rockGeo(0x55534c, 1, 0x5f6e52);
  ctx.add(
    instanced(
      rockG,
      propMaterial(),
      scatter(core, rng, { count: 180, min: 4, max: 100, radius: 4.6 }).map((p) => ({
        x: p.x,
        y: p.y - 0.3,
        z: p.z,
        ry: rng() * 6.28,
        s: [1 + rng() * 3, 0.8 + rng() * 2.4, 1 + rng() * 3],
        color: tint(rng, 1, 0.3),
      }))
    )
  );
  ctx.own(rockG);

  // Where fungi and lichen grow: points sampled on the giant bark.
  const fungi = [];
  const lichen = [];
  const barkParts = [];

  // giant trunks rising out of sight into the haze
  for (let k = 0; k < 16; k++) {
    const t = (k + rng() * 0.6) / 16;
    const side = k % 2 ? 1 : -1;
    const q = roadside(core, t, side * (hw + KERB + 30 + rng() * 50));
    const r = 6 + rng() * 6;
    const lx = (rng() - 0.5) * 30;
    const lz = (rng() - 0.5) * 30;
    const pts = [
      [q.x, q.y - 12, q.z],
      [q.x + lx * 0.2, q.y + 40, q.z + lz * 0.2],
      [q.x + lx * 0.6, q.y + 110, q.z + lz * 0.6],
      [q.x + lx, q.y + 190, q.z + lz],
    ];
    barkParts.push(rootGeo(pts, r, BARK, 30));
    for (let n = 0; n < 10; n++) {
      const a = rng() * Math.PI * 2;
      const h = 2 + rng() * 34;
      const rr = r * (1 - (h / 190) * 0.55) * 0.95;
      fungi.push({
        x: q.x + Math.cos(a) * rr + lx * (h / 190),
        y: q.y + h,
        z: q.z + Math.sin(a) * rr + lz * (h / 190),
        ry: Math.atan2(Math.cos(a), Math.sin(a)),
        s: 2 + rng() * 2.5,
        color: tint(rng, 1, 0.25),
      });
    }
  }

  // colossal branches arching over the road
  [0.03, 0.12, 0.22, 0.31, 0.4, 0.5, 0.58, 0.67, 0.76, 0.85, 0.94].forEach((t, k) => {
    const p = core.getPoint(t);
    const y0 = p.pos.y;
    const R = (l, up, ahead = 0) => [
      p.pos.x + p.right.x * l + p.tangent.x * ahead,
      y0 + up,
      p.pos.z + p.right.z * l + p.tangent.z * ahead,
    ];
    const span = hw + 26;
    const flip = k % 2 ? 1 : -1;
    const arc = [
      R(-span * flip, -8, -10),
      R(-span * 0.85 * flip, 16, -5),
      R(-span * 0.35 * flip, 34, 0),
      R(span * 0.4 * flip, 38, 5),
      R(span * 0.9 * flip, 18, 10),
      R(span * flip, -8, 14),
    ];
    barkParts.push(rootGeo(arc, 4.6, BARK, 48));
    barkParts.push(
      rootGeo(
        [
          R(-span * flip - 10, -8, 10),
          R(-span * 0.6 * flip, 22, 4),
          R(0, 44, 0),
          R(span * 0.6 * flip, 26, -5),
          R(span * flip + 8, -8, -10),
        ],
        2.6,
        0x62584c,
        40
      )
    );
    // lichen hangs from the underside of the arch, fungi sit on its flanks
    const curve = new THREE.CatmullRomCurve3(arc.map((a) => new THREE.Vector3(...a)));
    const pt = new THREE.Vector3();
    for (let n = 0; n < 14; n++) {
      curve.getPoint(0.15 + rng() * 0.7, pt);
      lichen.push({
        x: pt.x + (rng() - 0.5) * 3,
        y: pt.y - 3.6,
        z: pt.z + (rng() - 0.5) * 3,
        ry: rng() * 6.28,
        s: 0.8 + rng() * 1.2,
      });
    }
    for (let n = 0; n < 8; n++) {
      curve.getPoint(rng() < 0.5 ? 0.03 + rng() * 0.15 : 0.82 + rng() * 0.15, pt);
      const a = rng() * Math.PI * 2;
      fungi.push({
        x: pt.x + Math.cos(a) * 4.2,
        y: pt.y + (rng() - 0.5) * 2,
        z: pt.z + Math.sin(a) * 4.2,
        ry: Math.atan2(Math.cos(a), Math.sin(a)),
        s: 1.4 + rng() * 1.6,
        color: tint(rng, 1, 0.25),
      });
    }
  });
  // high boughs crossing the corridor to carry the canopy
  for (let k = 0; k < 22; k++) {
    const p = core.getPoint((k + rng()) / 22);
    const y = p.pos.y + 46 + rng() * 18;
    const span = 60 + rng() * 40;
    const skew = (rng() - 0.5) * 50;
    const B = (l, up, ahead) => [
      p.pos.x + p.right.x * l + p.tangent.x * ahead,
      y + up,
      p.pos.z + p.right.z * l + p.tangent.z * ahead,
    ];
    barkParts.push(
      rootGeo(
        [
          B(-span, -6, -skew),
          B(-span * 0.3, 4, -skew * 0.3),
          B(span * 0.3, 3, skew * 0.3),
          B(span, -4, skew),
        ],
        2.4,
        BARK,
        30
      )
    );
  }
  const bark = mergeParts(barkParts);
  ctx.add(new THREE.Mesh(bark, propMaterial({ side: THREE.DoubleSide })));
  ctx.own(bark);

  const fg = fungusGeo();
  ctx.add(instanced(fg, propMaterial({ emissive: 0x1a0c08 }), fungi));
  const lg = lichenGeo();
  ctx.add(instanced(lg, propMaterial(), lichen));
  ctx.own(fg, lg);

  // pale Elphael stonework: arches over the road and broken pillars
  const arch = archGeo({ stone: 0xb8b2a6, span: hw * 2 + 12, height: 12 });
  const aItems = [];
  [0.12, 0.34, 0.6, 0.84].forEach((t) => {
    const q = roadside(core, t, 0);
    aItems.push({ x: q.x, y: q.roadY - 0.3, z: q.z, ry: q.yaw + Math.PI, s: 1 });
  });
  ctx.add(instanced(arch, propMaterial(), aItems));
  ctx.own(arch);
  lampGlows(
    ctx,
    aItems.map((a) => ({ x: a.x, y: a.y + 12, z: a.z })),
    { size: 7, color: 0xffd79a, alpha: 0.2 }
  );
  const pil = pillarGeo({ stone: 0xb0aa9e, height: 9, broken: true });
  const pils = [];
  [0.08, 0.22, 0.45, 0.58, 0.72, 0.9].forEach((t, k) => {
    for (let n = 0; n < 3; n++) {
      const q = roadside(core, t + n * 0.005, (k % 2 ? 1 : -1) * (hw + KERB + 9 + rng() * 10));
      pils.push({ x: q.x, y: q.y - 0.2, z: q.z, ry: rng() * 6.28, s: 0.9 + rng() * 0.4 });
    }
  });
  ctx.add(instanced(pil, propMaterial(), pils));
  ctx.own(pil);

  graceSites(ctx, [0.04, 0.26, 0.5, 0.72, 0.9], { color: 0xffd36a, motes: 0xfff0c0 });

  // canopy: a ceiling of dark rust foliage that closes the sky, with gaps for the grey light
  const canopyGeo = new THREE.PlaneGeometry(1, 1);
  const canopyMat = addSway(
    new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide }),
    ctx.uTime,
    0.03,
    1
  );
  canopyMat.alphaToCoverage = true;
  const canopyTones = [0x4a2a26, 0x5a3430, 0x3a2e2a, 0x6a3a32, 0x44382e];
  const canopy = [];
  for (let n = 0; n < 2400; n++) {
    const i = Math.floor(rng() * core.N);
    const off = (rng() * 2 - 1) * 70;
    canopy.push({
      x: core.px[i] + core.rx[i] * off,
      y: core.py[i] + 42 + rng() * 30,
      z: core.pz[i] + core.rz[i] * off,
      rx: -Math.PI / 2 + (rng() - 0.5) * 0.8,
      ry: rng() * 6.28,
      rz: (rng() - 0.5) * 0.8,
      s: 10 + rng() * 10,
      color: canopyTones[Math.floor(rng() * canopyTones.length)],
    });
  }
  ctx.add(instanced(canopyGeo, canopyMat, canopy)).name = 'canopy';
  ctx.own(canopyGeo, canopyMat);

  mistPuffs(ctx, { count: 260, color: 0x8a9ca8, alpha: 0.34, size: 52, yMin: 2, yMax: 22 });
  // drifting scarlet rot spores
  ambient(ctx, {
    count: 2600,
    colorA: 0xff2a1a,
    colorB: 0xff6040,
    size: 0.28,
    rise: 0.25,
    range: 30,
    sway: 1.2,
    spread: 90,
    alpha: 1,
  });
  // falling rust-red and golden leaves
  ambient(ctx, {
    count: 500,
    colorA: 0xa84438,
    colorB: 0xd8a040,
    size: 0.3,
    rise: -0.9,
    range: 28,
    sway: 3,
    spread: 80,
    kind: 'petal',
    spin: 1.4,
    additive: false,
    alpha: 0.9,
  });
}
