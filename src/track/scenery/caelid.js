// Caelid: scarlet wastes, dead trees, glowing rot fungi, Radahn's giant skeleton, swamp spores.
import * as THREE from 'three';
import { instanced, propMaterial, scatter, roadside, part, mergeParts } from './common.js';
import {
  deadTreeGeo,
  rockGeo,
  mushroomGeo,
  giantSkeletonGeo,
  towerGeo,
  wallSegGeo,
  pillarGeo,
} from './props.js';
import { grassField } from './flora.js';
import { graceSites, mistPuffs, ambient, lampGlows } from './kit.js';
import { createBillboards } from '../fx.js';
import { KERB } from '../Centerline.js';

const tint = (rng, base = 1, spread = 0.3) => {
  const v = base + (rng() - 0.5) * spread;
  return new THREE.Color(v * 1.05, v, v * 0.95).getHex();
};

const SKEL = { x: 215, z: 5, scale: 1.4 };
const clear = (p, r) => Math.hypot(p.x - SKEL.x, p.z - SKEL.z) > r;

export function buildCaelid(ctx) {
  const { core, rng, noise } = ctx;

  // dead trees
  const dead = deadTreeGeo({ bark: 0x3a221c });
  const deadTrees = scatter(core, rng, {
    count: 420,
    min: 6,
    max: 200,
    radius: 3.5,
    filter: (p) => clear(p, 70) && noise.fbm(p.x * 0.01, p.z * 0.01, 3) > 0.42,
  }).map((p) => ({
    x: p.x,
    y: p.y - 0.2,
    z: p.z,
    ry: rng() * 6.28,
    rx: (rng() - 0.5) * 0.15,
    s: 0.8 + rng() * 1.1,
    color: tint(rng, 1, 0.5),
  }));
  ctx.add(instanced(dead, propMaterial(), deadTrees));
  ctx.own(dead);

  // withered red grass and scarlet rot flowers along the verges
  grassField(ctx, {
    count: 9000,
    reach: 34,
    variants: [
      { base: 0x3a1410, tip: 0xc0502a, height: 0.7 },
      { base: 0x4a1c12, tip: 0xd8804a, height: 0.9 },
    ],
    flowers: { petal: 0xe8281a, heart: 0xffb040, stem: 0x3a1a10 },
  });

  // rocks and mesas
  const rockG = rockGeo(0x6a3c30, 1, 0x9a5a3a);
  const rockMat = propMaterial();
  const rocks = [
    ...scatter(core, rng, {
      count: 300,
      min: 4,
      max: 110,
      radius: 5,
      filter: (p) => clear(p, 90),
    }).map((p) => ({
      x: p.x,
      y: p.y - 0.3,
      z: p.z,
      ry: rng() * 6.28,
      s: [1 + rng() * 3, 0.8 + rng() * 2.4, 1 + rng() * 3],
      color: tint(rng, 1, 0.4),
    })),
    ...scatter(core, rng, {
      count: 90,
      min: 40,
      max: 380,
      radius: 30,
      filter: (p) => clear(p, 160),
    }).map((p) => ({
      x: p.x,
      y: p.y - 3,
      z: p.z,
      ry: rng() * 6.28,
      s: [10 + rng() * 28, 8 + rng() * 30, 10 + rng() * 28],
      color: tint(rng, 0.9, 0.3),
    })),
  ];
  ctx.add(instanced(rockG, rockMat, rocks));
  const mesaG = mergeParts([
    part(new THREE.CylinderGeometry(0.75, 1, 1, 9), 0x8a4a34, {
      pos: [0, 0.5, 0],
      shade: 0.5,
      jitter: 0.12,
    }),
  ]);
  const mesas = scatter(core, rng, {
    count: 26,
    min: 60,
    max: 420,
    radius: 50,
    filter: (p) => clear(p, 200),
  }).map((p) => ({
    x: p.x,
    y: p.y - 4,
    z: p.z,
    ry: rng() * 6.28,
    s: [24 + rng() * 40, 30 + rng() * 45, 24 + rng() * 40],
    color: tint(rng, 0.95, 0.2),
  }));
  ctx.add(instanced(mesaG, propMaterial({ flatShading: true }), mesas));
  ctx.own(rockG, mesaG);

  // glowing scarlet-rot fungi
  const mush = mushroomGeo({ stem: 0xd8b48a, cap: 0xf0562a, r: 1.8 });
  const mushMat = propMaterial({ emissive: 0x5a1a08 });
  const mushrooms = scatter(core, rng, {
    count: 520,
    min: 3,
    max: 120,
    radius: 3,
    allowPool: true,
    poolMargin: -30,
    filter: (p) => clear(p, 70),
  }).map((p) => ({
    x: p.x,
    y: p.y - 0.1,
    z: p.z,
    ry: rng() * 6.28,
    s: 0.5 + rng() * 1.8,
    color: tint(rng, 1, 0.5),
  }));
  ctx.add(instanced(mush, mushMat, mushrooms));
  ctx.own(mush);
  const glowSpots = mushrooms
    .filter((_, i) => i % 6 === 0)
    .map((m) => ({
      x: m.x,
      y: m.y + 2 * m.s,
      z: m.z,
      size: 2.6 * m.s,
      color: 0xff6a2a,
      alpha: 0.45,
      phase: Math.random(),
    }));
  ctx.register(createBillboards(glowSpots, { flicker: 0.4 }));

  // Radahn's skeleton
  const skel = giantSkeletonGeo(0xd9c8aa, 0x1a0806);
  const sp = SKEL;
  const sy = core.groundAt(sp.x, sp.z);
  const skelMat = propMaterial({ emissive: 0x1e0704 });
  ctx.add(instanced(skel, skelMat, [{ x: sp.x, y: sy - 2, z: sp.z, ry: 0.15, s: SKEL.scale }]));
  ctx.own(skel);
  lampGlows(
    ctx,
    [
      { x: sp.x - 70, y: sy + 12, z: sp.z },
      { x: sp.x, y: sy + 18, z: sp.z },
    ],
    { size: 30, color: 0xff5a2a, alpha: 0.22 }
  );

  // Redmane silhouette: ruined castle far off
  const angle = 0.8;
  const cx = core.worldCx + Math.sin(angle) * core.worldSize * 0.34;
  const cz = core.worldCz - Math.cos(angle) * core.worldSize * 0.34;
  const cy = core.groundAt(cx, cz);
  const tower = towerGeo({ stone: 0x5a2c26, roof: 0x2a1210, h: 34, r: 6 });
  const wall = wallSegGeo({ stone: 0x5a2c26, len: 34, h: 15, th: 5 });
  const towers = [];
  const walls = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    towers.push({
      x: cx + Math.cos(a) * 50,
      y: cy - 2,
      z: cz + Math.sin(a) * 50,
      ry: 0,
      s: 0.9 + (k % 3) * 0.2,
    });
    const a2 = a + Math.PI / 8;
    walls.push({
      x: cx + Math.cos(a2) * 48,
      y: cy - 2,
      z: cz + Math.sin(a2) * 48,
      ry: -a2 + Math.PI / 2,
      s: 1,
    });
  }
  ctx.add(instanced(tower, propMaterial(), towers));
  ctx.add(instanced(wall, propMaterial(), walls));
  ctx.own(tower, wall);

  // broken pillars along the road
  const pil = pillarGeo({ stone: 0x8a5a48, height: 10, broken: true });
  const pils = [];
  [0.1, 0.24, 0.38, 0.5, 0.66, 0.8, 0.92].forEach((t, k) => {
    for (let n = 0; n < 3; n++) {
      const q = roadside(
        core,
        t + n * 0.005,
        (k % 2 ? 1 : -1) * (core.layout.halfWidth + KERB + 10 + rng() * 12)
      );
      pils.push({ x: q.x, y: q.y - 0.2, z: q.z, ry: rng() * 6.28, s: 0.9 + rng() * 0.5 });
    }
  });
  ctx.add(instanced(pil, propMaterial({ flatShading: true }), pils));
  ctx.own(pil);

  // road-side ember braziers
  const braz = [];
  for (let t = 0.01; t < 1; t += 0.03) {
    const side = Math.floor(t * 100) % 2 ? 1 : -1;
    const q = roadside(core, t, side * (core.layout.halfWidth + KERB + 4));
    braz.push({ x: q.x, y: q.y + 1.8, z: q.z });
  }
  lampGlows(ctx, braz, { color: 0xff6a2a, size: 3.2, alpha: 0.6 });

  graceSites(ctx, [0.03, 0.27, 0.5, 0.7, 0.9], { color: 0xff9a4a, motes: 0xffc080 });

  mistPuffs(ctx, { count: 80, color: 0xd0503a, alpha: 0.2, size: 38, yMin: 2, yMax: 9 });
  ambient(ctx, {
    count: 1400,
    colorA: 0xff7a30,
    colorB: 0xffc060,
    size: 0.28,
    rise: 2.0,
    range: 34,
    sway: 2.2,
    spread: 90,
    alpha: 0.95,
  });
  ambient(ctx, {
    count: 500,
    colorA: 0xff4020,
    colorB: 0xff8040,
    size: 0.9,
    rise: 0.8,
    range: 16,
    sway: 3.5,
    spread: 70,
    alpha: 0.28,
  });
  ambient(ctx, {
    count: 500,
    colorA: 0x3a2a26,
    colorB: 0x6a4a40,
    size: 0.22,
    rise: -1.4,
    range: 26,
    sway: 2.5,
    spread: 90,
    kind: 'petal',
    spin: 1.5,
    additive: false,
    alpha: 0.7,
  });
}
