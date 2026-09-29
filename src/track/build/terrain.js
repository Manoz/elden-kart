// Terrain heightfield mesh (stays below the road), plus rot/water pool surfaces.
import * as THREE from 'three';
import { clamp, smoothstep, makeNoise } from '../util.js';
import { makeGroundTexture } from '../textures.js';
import { createPoolMaterial } from '../fx.js';

export function buildTerrain(core, root) {
  const L = core.layout;
  const T = core.terrainCfg;
  const G = L.ground;
  const size = core.worldSize;
  const seg = T.seg;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const posAttr = geo.getAttribute('position');
  const n = posAttr.count;
  const info = {};
  const colors = new Float32Array(n * 3);
  const uvs = geo.getAttribute('uv');
  const hs = new Float32Array(n);
  const ds = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const x = posAttr.getX(v) + core.worldCx;
    const z = posAttr.getZ(v) + core.worldCz;
    core.groundInfo(x, z, info);
    posAttr.setXYZ(v, x, info.h, z);
    hs[v] = info.h;
    ds[v] = info.d;
    uvs.setXY(v, x / 22, z / 22);
  }
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  const nz = makeNoise((L.seed ?? 1) + 40);
  const cLow = new THREE.Color(G.low);
  const cMid = new THREE.Color(G.mid);
  const cHigh = new THREE.Color(G.high);
  const cRock = new THREE.Color(G.rock);
  const cDirt = new THREE.Color(G.dirt);
  const tmp = new THREE.Color();
  const poolTint = {
    rot: new THREE.Color(G.rotTint ?? 0x3a0c08),
    water: new THREE.Color(G.shore ?? 0x3a3a30),
  };
  const range = T.amp + T.mtn * 0.7;
  for (let v = 0; v < n; v++) {
    const x = posAttr.getX(v);
    const z = posAttr.getZ(v);
    const p = nz.fbm(x * 0.018, z * 0.018, 3);
    const p2 = nz.fbm(x * 0.09 + 30, z * 0.09, 2);
    tmp.copy(cLow).lerp(cMid, smoothstep(0.3, 0.65, p));
    const hh = clamp((hs[v] - T.level) / range, 0, 1);
    tmp.lerp(cHigh, smoothstep(0.35, 0.85, hh));
    const slope = nrm.getY(v);
    tmp.lerp(cRock, smoothstep(0.86, 0.62, slope));
    tmp.lerp(cDirt, (1 - smoothstep(0, 22, ds[v])) * 0.92);
    tmp.multiplyScalar(1.12 + p2 * 0.36);
    for (const pool of core.pools) {
      const dd = Math.hypot(x - pool.x, z - pool.z);
      const w = 1 - smoothstep(pool.r * 0.9, pool.r * 1.7, dd);
      if (w > 0) tmp.lerp(pool.type === 'rot' ? poolTint.rot : poolTint.water, w * 0.85);
    }
    colors[v * 3] = tmp.r;
    colors[v * 3 + 1] = tmp.g;
    colors[v * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tex = makeGroundTexture(L.seed, 0.45);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  root.add(mesh);

  // pools
  const poolGroup = new THREE.Group();
  const poolMats = [];
  const disposables = [geo, mat, tex];
  for (const p of core.pools) {
    const kind = p.type === 'rot' ? 'rot' : 'water';
    const pm = createPoolMaterial(kind, {
      radius: p.r * 1.15,
      ...(kind === 'rot' ? L.rotPool : L.waterPool),
    });
    poolMats.push(pm);
    const cg = new THREE.CircleGeometry(p.r * 1.15, 56);
    cg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(cg, pm);
    m.position.set(p.x, kind === 'rot' ? p.level + 0.14 : p.y - 0.8, p.z);
    m.renderOrder = 1;
    poolGroup.add(m);
    disposables.push(cg, pm);
  }
  root.add(poolGroup);
  return {
    mesh,
    update(dt, t) {
      for (const pm of poolMats) pm.uniforms.uTime.value = t;
    },
    dispose() {
      root.remove(mesh, poolGroup);
      for (const d of disposables) d.dispose?.();
    },
  };
}
