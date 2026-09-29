// Vegetation: broadleaf trees (bark + alpha-tested leaf cards with canopy-spherical normals) and
// instanced grass clumps. Everything is vertex coloured so instances can be tinted per track.
import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { KERB } from '../Centerline.js';
import { part, mergeParts, instanced, addSway } from './common.js';

let leafTex = null;

// Cluster of small leaves on a transparent background (near-white, tinted by vertex colour).
export function leafTexture() {
  if (leafTex) return leafTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = mulberry32(4242);
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * S * 0.42;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r;
    const l = 150 + rng() * 105;
    g.fillStyle = `rgb(${l},${l},${l * 0.94})`;
    g.save();
    g.translate(x, y);
    g.rotate(rng() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, 7 + rng() * 9, 3 + rng() * 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.generateMipmaps = true;
  leafTex.minFilter = THREE.LinearMipmapLinearFilter;
  leafTex.anisotropy = 4;
  return leafTex;
}

const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// Tapered cylinder from a to b.
function limb(a, b, r0, r1, color) {
  const len = _b.subVectors(b, a).length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
  geo.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, _b.normalize());
  geo.applyQuaternion(_q);
  geo.translate(a.x, a.y, a.z);
  return part(geo, color, { shade: 0.35, jitter: 0.06 });
}

// Leaf cards scattered over canopy spheres [{c: Vector3, r}], normals pointing out of the crown.
function leafCards(spheres, count, colors, rng) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];
  const centre = new THREE.Vector3();
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of spheres) {
    centre.add(s.c);
    yMin = Math.min(yMin, s.c.y - s.r);
    yMax = Math.max(yMax, s.c.y + s.r);
  }
  centre.divideScalar(spheres.length);
  const tc = new THREE.Color();
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const s = spheres[Math.floor(rng() * spheres.length)];
    // points biased to the upper part of each sphere
    n.set(rng() * 2 - 1, rng() * 1.6 - 0.45, rng() * 2 - 1).normalize();
    p.copy(s.c).addScaledVector(n, s.r * (0.55 + rng() * 0.5));
    const size = s.r * (0.75 + rng() * 0.45);
    // card plane: roughly facing outward, randomly spun
    t1.set(rng() - 0.5, rng() - 0.5, rng() - 0.5)
      .cross(n)
      .normalize();
    t2.crossVectors(n, t1).normalize();
    const base = pos.length / 3;
    const k = (p.y - yMin) / Math.max(yMax - yMin, 1e-3);
    tc.set(colors[Math.floor(rng() * colors.length)]).multiplyScalar(0.55 + k * 0.6 + rng() * 0.12);
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      v.copy(p)
        .addScaledVector(t1, su * size * 0.5)
        .addScaledVector(t2, sv * size * 0.5);
      pos.push(v.x, v.y, v.z);
      nv.subVectors(v, centre)
        .normalize()
        .multiplyScalar(0.8)
        .addScaledVector(UP, 0.35)
        .normalize();
      nrm.push(nv.x, nv.y, nv.z);
      uv.push((su + 1) / 2, (sv + 1) / 2);
      col.push(tc.r, tc.g, tc.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// A gnarled broadleaf tree. Returns { bark, leaves } geometries sharing one local frame.
export function treeGeos({
  height = 6.5,
  spread = 4.5,
  bark = 0x5a4430,
  leaves = [0x7f9a3e, 0x9cae4a, 0xb8a848],
  branches = 5,
  cards = 70,
  seed = 1,
} = {}) {
  const rng = mulberry32(seed * 7919 + 11);
  const parts = [];
  const top = new THREE.Vector3((rng() - 0.5) * 0.8, height * 0.6, (rng() - 0.5) * 0.8);
  parts.push(limb(new THREE.Vector3(0, -0.3, 0), top, 0.62, 0.36, bark));
  // root flare
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng();
    parts.push(
      limb(
        new THREE.Vector3(0, 0.9, 0),
        new THREE.Vector3(Math.cos(a) * 1.3, -0.2, Math.sin(a) * 1.3),
        0.3,
        0.1,
        bark
      )
    );
  }
  const spheres = [{ c: new THREE.Vector3(top.x, height * 0.95, top.z), r: spread * 0.55 }];
  for (let k = 0; k < branches; k++) {
    const a = (k / branches) * Math.PI * 2 + (rng() - 0.5) * 0.8;
    const tilt = 0.55 + rng() * 0.45;
    const len = spread * (0.6 + rng() * 0.3);
    const start = top.clone().lerp(new THREE.Vector3(0, 0, 0), rng() * 0.25);
    const end = new THREE.Vector3(
      start.x + Math.cos(a) * Math.sin(tilt) * len,
      start.y + Math.cos(tilt) * len,
      start.z + Math.sin(a) * Math.sin(tilt) * len
    );
    parts.push(limb(start, end, 0.26, 0.1, bark));
    const twig = end
      .clone()
      .add(new THREE.Vector3((rng() - 0.5) * 1.6, 0.9 + rng() * 0.6, (rng() - 0.5) * 1.6));
    parts.push(limb(end, twig, 0.1, 0.04, bark));
    spheres.push({
      c: end.clone().add(new THREE.Vector3(0, 0.5, 0)),
      r: spread * (0.34 + rng() * 0.12),
    });
  }
  return { bark: mergeParts(parts), leaves: leafCards(spheres, cards, leaves, rng) };
}

export function leafMaterial(uTime, sway = 0.35) {
  const m = new THREE.MeshLambertMaterial({
    map: leafTexture(),
    vertexColors: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
  });
  m.alphaToCoverage = true;
  return addSway(m, uTime, sway, 9);
}

// Instances a tree species at spots [{x,y,z,ry,s,color}].
export function plantTrees(ctx, species, spots) {
  if (!spots.length) return;
  const geos = treeGeos(species);
  const bm = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lm = leafMaterial(ctx.uTime, species.sway ?? 0.35);
  ctx.add(instanced(geos.bark, bm, spots)).name = 'tree-bark';
  ctx.add(instanced(geos.leaves, lm, spots)).name = 'tree-leaves';
  ctx.own(geos.bark, geos.leaves, bm, lm);
}

// Clump of curved grass blades, dark at the root and bright at the tips.
export function grassClumpGeo({
  blades = 9,
  height = 0.8,
  base = 0x3e5a24,
  tip = 0xc8b85a,
  seed = 1,
} = {}) {
  const rng = mulberry32(seed * 131 + 17);
  const pos = [];
  const col = [];
  const nrm = [];
  const cb = new THREE.Color(base);
  const ct = new THREE.Color(tip);
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.35;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 0.05 + rng() * 0.05;
    const h = height * (0.55 + rng() * 0.7);
    const lean = 0.15 + rng() * 0.35;
    const la = a + (rng() - 0.5);
    const face = a + Math.PI / 2;
    const fx = Math.cos(face) * w;
    const fz = Math.sin(face) * w;
    pos.push(
      x - fx,
      0,
      z - fz,
      x + fx,
      0,
      z + fz,
      x + Math.cos(la) * lean * h,
      h,
      z + Math.sin(la) * lean * h
    );
    col.push(cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Small bright flowers on thin stems.
export function flowerGeo({ petal = 0xf4eed8, heart = 0xe8c040, stem = 0x4a6a2a, seed = 3 } = {}) {
  const rng = mulberry32(seed * 91 + 5);
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const x = (rng() - 0.5) * 0.5;
    const z = (rng() - 0.5) * 0.5;
    const h = 0.35 + rng() * 0.35;
    parts.push(
      part(new THREE.CylinderGeometry(0.01, 0.015, h, 3), stem, { pos: [x, h / 2, z], shade: 0.2 })
    );
    parts.push(
      part(new THREE.CircleGeometry(0.09, 5), petal, {
        pos: [x, h, z],
        rot: [-Math.PI / 2 + (rng() - 0.5) * 0.6, 0, 0],
        shade: 0,
      })
    );
    parts.push(
      part(new THREE.SphereGeometry(0.03, 4, 3), heart, { pos: [x, h + 0.01, z], shade: 0 })
    );
  }
  return mergeParts(parts);
}

// Dense grass verges: clumps concentrated near the road and thinning out with distance.
// variants: grassClumpGeo options; flowers: flowerGeo options (8% of the clumps) or null.
export function grassField(
  ctx,
  { count = 12000, reach = 40, variants, flowers = null, tint = 0.25 }
) {
  const { core, rng, uTime } = ctx;
  const geos = variants.map((v, i) => grassClumpGeo({ ...v, seed: i + 1 }));
  if (flowers) geos.push(flowerGeo(flowers));
  const lists = geos.map(() => []);
  const mat = addSway(
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    uTime,
    0.12,
    1.2
  );
  let guard = 0;
  let placed = 0;
  while (placed < count && guard++ < count * 4) {
    const i = Math.floor(rng() * core.N);
    const side = rng() < 0.5 ? -1 : 1;
    const off = core.hw[i] + KERB + 0.4 + Math.pow(rng(), 1.7) * reach;
    const x = core.px[i] + core.rx[i] * side * off + (rng() - 0.5) * 3;
    const z = core.pz[i] + core.rz[i] * side * off + (rng() - 0.5) * 3;
    if (core.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1)) continue;
    if (core.distToRoad(x, z).d < KERB + 0.3) continue;
    const k = flowers && rng() < 0.08 ? geos.length - 1 : Math.floor(rng() * variants.length);
    const v = 1 + (rng() - 0.5) * tint;
    lists[k].push({
      x,
      y: core.groundAt(x, z) - 0.05,
      z,
      ry: rng() * 6.28,
      s: 0.7 + rng() * 0.7,
      color: new THREE.Color(v, v, v * 0.97).getHex(),
    });
    placed++;
  }
  geos.forEach((g, i) => {
    if (!lists[i].length) return;
    const mesh = instanced(g, mat, lists[i]);
    mesh.name = 'grass';
    mesh.receiveShadow = true;
    ctx.add(mesh);
  });
  ctx.own(...geos, mat);
}
