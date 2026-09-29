// Limgrave: rolling golden-green hills, oak groves, ruins, Church of Elleh, Stormveil on the horizon.
import * as THREE from 'three';
import { instanced, propMaterial, addSway, scatter, roadside } from './common.js';
import { plantTrees, grassField } from './flora.js';
import { pineGeo, rockGeo, pillarGeo, archGeo, churchGeo, towerGeo, wallSegGeo } from './props.js';
import { graceSites, mistPuffs, ambient, lampGlows } from './kit.js';
import { KERB } from '../Centerline.js';

const tint = (rng, base = 1, spread = 0.25, warm = 0) => {
  const v = base + (rng() - 0.5) * spread;
  return new THREE.Color(v + warm * 0.1, v, v - warm * 0.12).getHex();
};

export function buildLimgrave(ctx) {
  const { core, rng, uTime, noise } = ctx;
  const grove = (p) => noise.fbm(p.x * 0.012, p.z * 0.012, 3) > 0.47;

  // broadleaf groves: mostly green oaks, some golden-leaved trees like those near the Erdtree
  const oakSpots = scatter(core, rng, {
    count: 420,
    min: 6,
    max: 190,
    radius: 4,
    filter: grove,
  }).map((p) => ({
    x: p.x,
    y: p.y - 0.2,
    z: p.z,
    ry: rng() * 6.28,
    s: 0.8 + rng() * 0.8,
    color: tint(rng, 1, 0.3, 1),
  }));
  const golden = oakSpots.filter((_, k) => k % 10 < 3);
  plantTrees(
    ctx,
    {
      height: 6.5,
      spread: 4.6,
      bark: 0x4f3a28,
      leaves: [0x6f8f3a, 0x8aa844, 0xa6aa4a],
      cards: 80,
      seed: 3,
    },
    oakSpots.filter((_, k) => k % 10 >= 3)
  );
  plantTrees(
    ctx,
    {
      height: 7,
      spread: 5,
      bark: 0x5a4028,
      leaves: [0xd9b042, 0xe8c85a, 0xc89a30],
      cards: 80,
      seed: 7,
    },
    golden
  );

  // pines on the higher ground
  const pineG = pineGeo();
  const pineMat = addSway(propMaterial(), uTime, 0.3, 10);
  const pines = scatter(core, rng, {
    count: 300,
    min: 8,
    max: 240,
    radius: 3.5,
    filter: (p) => p.y > 2 && !grove(p),
  }).map((p) => ({
    x: p.x,
    y: p.y - 0.2,
    z: p.z,
    ry: rng() * 6.28,
    s: 0.9 + rng() * 1.1,
    color: tint(rng, 1, 0.3),
  }));
  ctx.add(instanced(pineG, pineMat, pines));
  ctx.own(pineG);

  // rocks + cliffs
  const rockG = rockGeo(0x8d8576, 1, 0x6a7a40);
  const rockMat = propMaterial();
  const rocks = [
    ...scatter(core, rng, { count: 240, min: 4, max: 90, radius: 4.6 }).map((p) => ({
      x: p.x,
      y: p.y - 0.3,
      z: p.z,
      ry: rng() * 6.28,
      s: [1 + rng() * 2.6, 0.8 + rng() * 2, 1 + rng() * 2.6],
      color: tint(rng, 1, 0.3),
    })),
    ...scatter(core, rng, { count: 70, min: 40, max: 320, radius: 26 }).map((p) => ({
      x: p.x,
      y: p.y - 2,
      z: p.z,
      ry: rng() * 6.28,
      s: [8 + rng() * 22, 6 + rng() * 22, 8 + rng() * 22],
      color: tint(rng, 0.95, 0.2),
    })),
  ];
  ctx.add(instanced(rockG, rockMat, rocks));
  ctx.own(rockG);

  // grass verges with pale flowers
  grassField(ctx, {
    count: 14000,
    reach: 38,
    variants: [
      { base: 0x2f4a1c, tip: 0x9fb04a, height: 0.8 },
      { base: 0x3a5220, tip: 0xd6c060, height: 1.0 },
      { base: 0x2a4418, tip: 0x7a9a3a, height: 0.6 },
    ],
    flowers: { petal: 0xf2ecd8, heart: 0xe8c040 },
  });

  // ruins: broken pillars, arches and wall stumps beside the road
  const ruinMat = propMaterial({ flatShading: true });
  const pillarA = pillarGeo({ stone: 0xa39880, height: 9 });
  const pillarB = pillarGeo({ stone: 0x998f78, height: 6, broken: true });
  const archG = archGeo({ stone: 0xa39880, span: 14, height: 10 });
  const pillars = [];
  const brokenPillars = [];
  const arches = [];
  [0.08, 0.22, 0.34, 0.47, 0.56, 0.74, 0.83, 0.95].forEach((t, k) => {
    const side = k % 2 ? 1 : -1;
    const p = roadside(core, t, side * (core.layout.halfWidth + KERB + 14 + rng() * 10));
    for (let n = 0; n < 4; n++) {
      const q = roadside(
        core,
        t + n * 0.004,
        side * (core.layout.halfWidth + KERB + 12 + rng() * 14)
      );
      (n % 2 ? brokenPillars : pillars).push({
        x: q.x,
        y: q.y - 0.2,
        z: q.z,
        ry: rng() * 6.28,
        s: 0.9 + rng() * 0.3,
      });
    }
    if (k % 3 === 0)
      arches.push({
        x: p.x,
        y: p.y - 0.2,
        z: p.z,
        ry: p.yaw + Math.PI / 2 + (rng() - 0.5) * 0.3,
        s: 1,
      });
  });
  ctx.add(instanced(pillarA, ruinMat, pillars));
  ctx.add(instanced(pillarB, ruinMat, brokenPillars));
  ctx.add(instanced(archG, ruinMat, arches));
  ctx.own(pillarA, pillarB, archG);

  // Church of Elleh
  const church = churchGeo();
  const cp = roadside(core, 0.13, -(core.layout.halfWidth + KERB + 40));
  const churchMesh = instanced(church, propMaterial(), [
    { x: cp.x, y: cp.y - 0.3, z: cp.z, ry: cp.yaw + 0.4, s: 1.3 },
  ]);
  ctx.add(churchMesh);
  ctx.own(church);
  const wg = new THREE.PlaneGeometry(1.4, 3);
  const winMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffc860).multiplyScalar(2),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const wins = [];
  for (const s of [-1, 1])
    for (const z of [-5, 0, 5])
      wins.push({
        x: cp.x + Math.cos(cp.yaw + 0.4) * s * 6.6 * 1.3 + Math.sin(cp.yaw + 0.4) * z * 1.3,
        y: cp.y + 4.6,
        z: cp.z - Math.sin(cp.yaw + 0.4) * s * 6.6 * 1.3 + Math.cos(cp.yaw + 0.4) * z * 1.3,
        ry: cp.yaw + 0.4 + Math.PI / 2,
        s: 1.3,
      });
  ctx.add(instanced(wg, winMat, wins));
  ctx.own(wg);
  lampGlows(ctx, [{ x: cp.x, y: cp.y + 5, z: cp.z }], { size: 16, alpha: 0.28, color: 0xffc070 });

  // Stormveil silhouette far away on a raised hill
  const stormAngle = 2.6;
  const sx = core.worldCx + Math.sin(stormAngle) * core.worldSize * 0.36;
  const sz = core.worldCz - Math.cos(stormAngle) * core.worldSize * 0.36;
  const sy = core.groundAt(sx, sz);
  const stone = 0x7d7f8c;
  const tower = towerGeo({ stone, roof: 0x3c3f55, h: 30, r: 6 });
  const wall = wallSegGeo({ stone, len: 30, h: 14, th: 5 });
  const towers = [];
  const walls = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const R = 46;
    towers.push({
      x: sx + Math.cos(a) * R,
      y: sy - 2,
      z: sz + Math.sin(a) * R,
      ry: 0,
      s: 1 + (k % 3) * 0.15,
    });
    const a2 = a + Math.PI / 9;
    walls.push({
      x: sx + Math.cos(a2) * R * 0.98,
      y: sy - 2,
      z: sz + Math.sin(a2) * R * 0.98,
      ry: -a2 + Math.PI / 2,
      s: 1,
    });
  }
  towers.push(
    { x: sx, y: sy - 2, z: sz, ry: 0, s: 2.2 },
    { x: sx + 18, y: sy - 2, z: sz - 10, ry: 0, s: 1.6 }
  );
  ctx.add(instanced(tower, propMaterial(), towers));
  ctx.add(instanced(wall, propMaterial(), walls));
  ctx.own(tower, wall);
  const hill = new THREE.Mesh(
    new THREE.CylinderGeometry(70, 110, 30, 16),
    new THREE.MeshLambertMaterial({ color: 0x5c6a3e })
  );
  hill.position.set(sx, sy - 14, sz);
  ctx.add(hill);

  // sites of grace
  graceSites(ctx, [0.04, 0.3, 0.52, 0.7, 0.9], { color: 0xffd36a });

  // atmosphere
  mistPuffs(ctx, { count: 70, color: 0xfff0d0, alpha: 0.13, size: 34, yMin: 2, yMax: 9 });
  ambient(ctx, {
    count: 900,
    colorA: 0xffe9a0,
    colorB: 0xffc85a,
    size: 0.22,
    rise: 0.9,
    range: 22,
    sway: 1.6,
    spread: 90,
    alpha: 0.9,
  });
  ambient(ctx, {
    count: 160,
    colorA: 0xfff6d8,
    colorB: 0xffe6a0,
    size: 0.36,
    rise: -0.7,
    range: 18,
    sway: 3.2,
    spread: 80,
    kind: 'petal',
    spin: 1.2,
    additive: false,
    alpha: 0.85,
  });
}
