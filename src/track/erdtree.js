// The giant tree on the horizon (Erdtree, or the Haligtree), built in 3D far outside the circuit:
// braided glowing trunk, arching limbs and a vast crown of luminous leaf cards. The height fog
// swallows its base while the crown shines above the haze.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { leafTexture } from './scenery/flora.js';

const PALETTES = {
  gold: {
    bark: 0x8a6424,
    barkGlow: 0x6a4410,
    leaves: [0xffd66e, 0xffc048, 0xfff0b8],
    leafGlow: 0xffb030,
  },
  red: {
    bark: 0x5a2a14,
    barkGlow: 0x5a1a08,
    leaves: [0xff9a4a, 0xffb060, 0xff7a3a],
    leafGlow: 0xff6a20,
  },
  pale: {
    bark: 0xe8dcc4,
    barkGlow: 0x4a4030,
    leaves: [0xfff6dc, 0xffe8b0, 0xffffff],
    leafGlow: 0xffe0a0,
  },
};

const UP = new THREE.Vector3(0, 1, 0);

function taperedTube(points, r0, r1, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const seg = Math.max(8, points.length * 6);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.getAttribute('position');
  const per = radial + 1;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(Math.floor(i / per) / seg, 1);
    curve.getPoint(t, c);
    const r = r0 + (r1 - r0) * t;
    p.setXYZ(
      i,
      c.x + (p.getX(i) - c.x) * r,
      c.y + (p.getY(i) - c.y) * r,
      c.z + (p.getZ(i) - c.z) * r
    );
  }
  g.computeVertexNormals();
  return g;
}

function mergeAll(geos) {
  let count = 0;
  let icount = 0;
  for (const g of geos) {
    count += g.attributes.position.count;
    icount += g.index.count;
  }
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const idx = new Uint32Array(icount);
  let o = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    const ia = g.index.array;
    for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + o;
    o += g.attributes.position.count;
    io += ia.length;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

// cfg (layout.sky.tree): { variant, height, az, dist, glow }
export function buildErdtree(core, root, cfg) {
  const P = PALETTES[cfg.variant || 'gold'] || PALETTES.gold;
  const glow = cfg.glow ?? 1;
  const rng = mulberry32(977);
  const H = cfg.height ?? 520;
  const dist = cfg.dist ?? core.worldSize * 0.95;
  const group = new THREE.Group();
  group.name = 'erdtree';
  group.position.set(
    core.worldCx + Math.sin(cfg.az ?? 0) * dist,
    -H * 0.08,
    core.worldCz - Math.cos(cfg.az ?? 0) * dist
  );

  const barkGeos = [];
  // braided trunk
  const strands = 8;
  const neck = H * 0.55;
  for (let k = 0; k < strands; k++) {
    const a0 = (k / strands) * Math.PI * 2;
    const pts = [];
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      const a = a0 + t * 2.4;
      const r = H * (0.13 * Math.pow(1 - t, 1.6) + 0.025);
      pts.push(new THREE.Vector3(Math.cos(a) * r, t * neck, Math.sin(a) * r));
    }
    barkGeos.push(taperedTube(pts, H * 0.034, H * 0.016));
  }
  // limbs arching up and out, each splitting twice
  const tips = [];
  const limb = (start, dir, len, r, depth) => {
    const bend = new THREE.Vector3((rng() - 0.5) * 0.4, 0.25, (rng() - 0.5) * 0.4);
    const mid = start
      .clone()
      .addScaledVector(dir, len * 0.5)
      .addScaledVector(bend, len * 0.2);
    const end = start.clone().addScaledVector(dir.clone().add(bend).normalize(), len);
    barkGeos.push(taperedTube([start, mid, end], r, r * 0.55, 6));
    if (depth >= 2) {
      tips.push(end);
      return;
    }
    for (let i = 0; i < 2; i++) {
      const d = dir
        .clone()
        .applyAxisAngle(UP, (i ? 1 : -1) * (0.4 + rng() * 0.5))
        .add(new THREE.Vector3(0, 0.35, 0))
        .normalize();
      limb(end, d, len * 0.62, r * 0.55, depth + 1);
    }
  };
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.4;
    const tilt = 0.75 + rng() * 0.35;
    const dir = new THREE.Vector3(
      Math.cos(a) * Math.sin(tilt),
      Math.cos(tilt),
      Math.sin(a) * Math.sin(tilt)
    );
    limb(new THREE.Vector3(0, neck * (0.92 + rng() * 0.08), 0), dir, H * 0.34, H * 0.02, 0);
  }
  const barkGeo = mergeAll(barkGeos);
  const barkMat = new THREE.MeshLambertMaterial({
    color: P.bark,
    emissive: P.barkGlow,
    emissiveIntensity: 0.9 * glow,
  });
  group.add(new THREE.Mesh(barkGeo, barkMat));

  // crown: a wide dome of glowing leaf cards around the limb tips
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];
  const centre = new THREE.Vector3(0, neck + H * 0.2, 0);
  const tc = new THREE.Color();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < 1600; i++) {
    const tip = tips[Math.floor(rng() * tips.length)];
    p.copy(tip).add(
      new THREE.Vector3(
        (rng() - 0.5) * H * 0.18,
        (rng() - 0.35) * H * 0.1,
        (rng() - 0.5) * H * 0.18
      )
    );
    n.subVectors(p, centre).normalize();
    t1.set(rng() - 0.5, rng() - 0.5, rng() - 0.5)
      .cross(n)
      .normalize();
    t2.crossVectors(n, t1).normalize();
    const size = H * (0.06 + rng() * 0.07);
    tc.set(P.leaves[Math.floor(rng() * P.leaves.length)]).multiplyScalar(0.7 + rng() * 0.5);
    const base = pos.length / 3;
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
      nrm.push(n.x, n.y, n.z);
      uv.push((su + 1) / 2, (sv + 1) / 2);
      col.push(tc.r, tc.g, tc.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leafGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  leafGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  leafGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  leafGeo.setIndex(idx);
  const leafMat = new THREE.MeshLambertMaterial({
    map: leafTexture(),
    vertexColors: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    emissive: P.leafGlow,
    emissiveIntensity: 1.3 * glow,
  });
  group.add(new THREE.Mesh(leafGeo, leafMat));
  group.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });
  root.add(group);

  return {
    group,
    update(dt, t) {
      // slow breathing of the crown's glow
      leafMat.emissiveIntensity = 1.3 * glow * (0.9 + 0.1 * Math.sin(t * 0.6));
    },
    dispose() {
      root.remove(group);
      barkGeo.dispose();
      leafGeo.dispose();
      barkMat.dispose();
      leafMat.dispose();
    },
  };
}
