// Leyndell: golden royal city, towers, dragon statues, braziers, Erdtree roots arching over the road.
import * as THREE from 'three';
import { instanced, propMaterial, addSway, scatter, roadside, part, mergeParts } from './common.js';
import {
  oakGeo,
  houseGeo,
  towerGeo,
  wallSegGeo,
  dragonStatueGeo,
  flameBowlGeo,
  pillarGeo,
  rootGeo,
} from './props.js';
import { graceSites, mistPuffs, ambient, lampGlows } from './kit.js';
import { KERB } from '../Centerline.js';

const tint = (rng, base = 1, spread = 0.2) => {
  const v = base + (rng() - 0.5) * spread;
  return new THREE.Color(v, v * 0.97, v * 0.9).getHex();
};

export function buildLeyndell(ctx) {
  const { core, rng, uTime } = ctx;
  const hw = core.layout.halfWidth;

  // city: houses ringing the road
  const houseA = houseGeo({ wall: 0xc7b38a, roof: 0x7a3f2c });
  const houseB = houseGeo({ wall: 0xd6c69e, roof: 0x8a6a34, w: 10, d: 7, h: 9 });
  const winMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffc060).multiplyScalar(2.2),
    toneMapped: false,
  });
  const winG = new THREE.PlaneGeometry(1.1, 1.6);
  const spots = scatter(core, rng, { count: 900, min: 14, max: 260, tries: 60, radius: 12 });
  const ha = [];
  const hb = [];
  const wins = [];
  spots.forEach((p, k) => {
    const s = 0.9 + rng() * 1.5;
    const ry = Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.1;
    const item = {
      x: p.x,
      y: p.y - 0.4,
      z: p.z,
      ry,
      s: [s, s * (0.8 + rng() * 1.6), s],
      color: tint(rng),
    };
    (k % 3 ? ha : hb).push(item);
    if (k % 2 === 0) {
      for (let w = 0; w < 3; w++) {
        const a = ry + (w / 3) * Math.PI * 2;
        wins.push({
          x: p.x + Math.sin(a) * 4.1 * s,
          y: p.y + 3.2 * s * (item.s[1] / s),
          z: p.z + Math.cos(a) * 4.1 * s,
          ry: a,
          s,
        });
      }
    }
  });
  ctx.add(instanced(houseA, propMaterial(), ha));
  ctx.add(instanced(houseB, propMaterial(), hb));
  ctx.add(
    instanced(
      winG,
      winMat,
      wins.map((w) => ({ ...w, s: w.s }))
    )
  );
  ctx.own(houseA, houseB, winG);

  // towers on the outskirts
  const tower = towerGeo({ stone: 0xcbb68a, roof: 0xb8862e, h: 40, r: 7 });
  const towerSpots = scatter(core, rng, { count: 40, min: 40, max: 200, radius: 9 }).map((p) => ({
    x: p.x,
    y: p.y - 1,
    z: p.z,
    ry: 0,
    s: 0.8 + rng() * 1.1,
  }));
  ctx.add(instanced(tower, propMaterial(), towerSpots));
  ctx.own(tower);
  lampGlows(
    ctx,
    towerSpots.map((t) => ({ x: t.x, y: t.y + 46 * t.s, z: t.z })),
    { size: 6, color: 0xffc060, alpha: 0.5 }
  );

  // grand walls flanking the road at distance
  const wall = wallSegGeo({ stone: 0xd0bc90, len: 30, h: 18, th: 6 });
  const wallItems = [];
  for (let i = 0; i < core.N; i += 22) {
    const side = (i / 22) % 2 ? 1 : -1;
    const off = hw + KERB + 24 + ((i / 22) % 3) * 6;
    const x = core.px[i] + core.rx[i] * side * off;
    const z = core.pz[i] + core.rz[i] * side * off;
    const r = core.distToRoad(x, z);
    if (r.d < 18) continue;
    wallItems.push({
      x,
      y: core.groundAt(x, z) - 0.5,
      z,
      ry: Math.atan2(core.tx[i], core.tz[i]) + Math.PI / 2,
      s: 1,
    });
  }
  ctx.add(instanced(wall, propMaterial(), wallItems));
  ctx.own(wall);

  // dragon statues
  const dragon = dragonStatueGeo({});
  const dItems = [];
  for (let k = 0; k < 22; k++) {
    const t = (k + 0.5) / 22;
    const side = k % 2 ? 1 : -1;
    const q = roadside(core, t, side * (hw + KERB + 9));
    dItems.push({
      x: q.x,
      y: q.y - 0.3,
      z: q.z,
      ry: q.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rng() - 0.5) * 0.3,
      s: 0.85 + rng() * 0.3,
    });
  }
  ctx.add(instanced(dragon, propMaterial({ emissive: 0x2a1c06 }), dItems));
  ctx.own(dragon);

  // braziers
  const bowl = flameBowlGeo({});
  const bItems = [];
  const flames = [];
  for (let i = 8; i < core.N; i += 26) {
    const side = (i / 26) % 2 ? 1 : -1;
    const off = hw + KERB + 3.6;
    const x = core.px[i] + core.rx[i] * side * off;
    const z = core.pz[i] + core.rz[i] * side * off;
    bItems.push({ x, y: core.py[i] - 0.6, z, ry: 0, s: 1 });
    flames.push({ x, y: core.py[i] + 3.6, z });
  }
  ctx.add(instanced(bowl, propMaterial(), bItems));
  ctx.own(bowl);
  lampGlows(ctx, flames, { size: 4.2, color: 0xffa030, alpha: 0.75 });

  // banner poles with golden cloth
  const poleG = mergeParts([
    part(new THREE.CylinderGeometry(0.22, 0.28, 13, 6), 0x6a5028, { pos: [0, 6.5, 0] }),
    part(new THREE.BoxGeometry(0.15, 7, 2.6), 0xe0b040, { pos: [0, 8.6, 1.4], shade: 0.1 }),
  ]);
  const pItems = [];
  for (let i = 3; i < core.N; i += 38) {
    const side = (i / 38) % 2 ? 1 : -1;
    const off = hw + KERB + 7;
    pItems.push({
      x: core.px[i] + core.rx[i] * side * off,
      y: core.py[i] - 0.4,
      z: core.pz[i] + core.rz[i] * side * off,
      ry: Math.atan2(core.rx[i], core.rz[i]) * 1,
      s: 1,
    });
  }
  ctx.add(instanced(poleG, propMaterial({ emissive: 0x2a1a04, side: THREE.DoubleSide }), pItems));
  ctx.own(poleG);

  // golden trees
  const tree = oakGeo({ trunk: 0x4a3420, leaf: 0xd8a83a, leaf2: 0xf0c85a });
  const treeMat = addSway(propMaterial({ emissive: 0x2a1804 }), uTime, 0.4, 11);
  const trees = scatter(core, rng, { count: 140, min: 6, max: 60, radius: 4 }).map((p) => ({
    x: p.x,
    y: p.y - 0.2,
    z: p.z,
    ry: rng() * 6.28,
    s: 0.8 + rng() * 0.7,
    color: tint(rng, 1, 0.3),
  }));
  ctx.add(instanced(tree, treeMat, trees));
  ctx.own(tree);

  // pillars / arches around the plazas
  const pil = pillarGeo({ stone: 0xd9c9a0, height: 12 });
  const pils = [];
  [0.05, 0.19, 0.36, 0.55, 0.7, 0.84, 0.95].forEach((t) => {
    for (const s of [-1, 1]) {
      const q = roadside(core, t, s * (hw + KERB + 6));
      pils.push({ x: q.x, y: q.y - 0.2, z: q.z, ry: 0, s: 0.9 });
    }
  });
  ctx.add(instanced(pil, propMaterial(), pils));
  ctx.own(pil);

  // Erdtree roots arching over the road
  const rootParts = [];
  [0.04, 0.15, 0.3, 0.46, 0.62, 0.78, 0.9].forEach((t) => {
    const p = core.getPoint(t);
    const y0 = p.pos.y;
    const R = (l, up, ahead = 0) => [
      p.pos.x + p.right.x * l + p.tangent.x * ahead,
      y0 + up,
      p.pos.z + p.right.z * l + p.tangent.z * ahead,
    ];
    const span = hw + 18;
    rootParts.push(
      rootGeo(
        [
          R(-span, -3, -6),
          R(-span * 0.85, 10, -3),
          R(-span * 0.4, 26, 0),
          R(span * 0.4, 28, 3),
          R(span * 0.85, 12, 6),
          R(span, -3, 8),
        ],
        3.2,
        0x6a4a26,
        44
      ),
      rootGeo(
        [
          R(-span - 6, -3, 4),
          R(-span * 0.7, 15, 3),
          R(0, 31, 0),
          R(span * 0.6, 17, -3),
          R(span + 5, -3, -5),
        ],
        1.8,
        0x7a5630,
        40
      )
    );
  });
  const roots = mergeParts(rootParts);
  ctx.add(new THREE.Mesh(roots, propMaterial({ emissive: 0x2a1804, side: THREE.DoubleSide })));
  ctx.own(roots);

  graceSites(ctx, [0.02, 0.24, 0.5, 0.68, 0.86], { color: 0xffd36a });

  mistPuffs(ctx, { count: 40, color: 0xffd8a0, alpha: 0.12, size: 40, yMin: 3, yMax: 10 });
  ambient(ctx, {
    count: 1300,
    colorA: 0xffd070,
    colorB: 0xffa030,
    size: 0.26,
    rise: 1.5,
    range: 40,
    sway: 2.0,
    spread: 90,
    alpha: 0.95,
  });
  ambient(ctx, {
    count: 260,
    colorA: 0xffe6a0,
    colorB: 0xf0b850,
    size: 0.55,
    rise: -1.0,
    range: 30,
    sway: 4,
    spread: 80,
    kind: 'petal',
    spin: 1.4,
    additive: false,
    alpha: 0.9,
  });
}
