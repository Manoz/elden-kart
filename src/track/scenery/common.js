// Shared helpers for scenery: geometry parts, instancing, placement, ambient particles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KERB } from '../Centerline.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Clone `geo`, bake a transform and a vertex colour (with a soft vertical gradient) into it.
export function part(
  geo,
  color,
  { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], shade = 0.35, jitter = 0 } = {}
) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...scale));
  g.applyMatrix4(_m);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const h = Math.max(bb.max.y - bb.min.y, 1e-3);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  _c.set(color);
  for (let i = 0; i < p.count; i++) {
    const k = 1 - shade + shade * ((p.getY(i) - bb.min.y) / h);
    const j = jitter
      ? 1 + ((Math.sin(i * 12.9898 + p.getX(i) * 78.233) * 43758.5453) % 1) * jitter
      : 1;
    col[i * 3] = _c.r * k * j;
    col[i * 3 + 1] = _c.g * k * j;
    col[i * 3 + 2] = _c.b * k * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function mergeParts(list) {
  const g = mergeGeometries(list, false);
  list.forEach((l) => l.dispose());
  return g;
}

// transforms: [{ x, y, z, ry, s (number|[x,y,z]), color?, rx?, rz? }]
export function instanced(geo, mat, transforms) {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let hasColor = false;
  transforms.forEach((t, i) => {
    _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _q.setFromEuler(_e);
    const s = t.s ?? 1;
    if (Array.isArray(s)) sc.set(s[0], s[1], s[2]);
    else sc.set(s, s, s);
    _m.compose(v.set(t.x, t.y, t.z), _q, sc);
    mesh.setMatrixAt(i, _m);
    if (t.color !== undefined) {
      mesh.setColorAt(i, _c.set(t.color));
      hasColor = true;
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function propMaterial(opts = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
}

export function glowMaterial(color, k = 2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(k),
    toneMapped: false,
  });
}

// Gentle wind sway for foliage-like materials.
export function addSway(mat, uTime, amount = 0.5, height = 14) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader =
      'uniform float uTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.07;
        #else
          float ph = 0.0;
        #endif
        float kk = clamp(position.y / ${height.toFixed(1)}, 0.0, 1.0);
        kk *= kk;
        transformed.x += sin(uTime * 1.3 + ph) * kk * ${amount.toFixed(2)};
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * kk * ${(amount * 0.7).toFixed(2)};`
      );
  };
  return mat;
}

// Random placement in a corridor around the road. Returns [{x,y,z,d,i,side}]
// `min` = clear gap (m) between the kerb and the prop footprint; `radius` = prop footprint radius, so the prop
// centre keeps at least KERB + min + radius from the road edge. Big props (radius > 2) get an extra floor so they
// never crowd the racing line or the chase camera.
export function scatter(
  core,
  rng,
  {
    count,
    min = 4,
    max = 60,
    tries = 40,
    poolMargin = 4,
    allowPool = false,
    filter = null,
    tRange = null,
    radius = 0,
  }
) {
  const out = [];
  const N = core.N;
  const gap = radius > 2 ? Math.max(min, 8 + radius * 0.5) : min;
  const need = gap + radius;
  let guard = 0;
  while (out.length < count && guard++ < count * tries) {
    let i = Math.floor(rng() * N);
    if (tRange) i = Math.floor((tRange[0] + rng() * (tRange[1] - tRange[0])) * N) % N;
    const side = rng() < 0.5 ? -1 : 1;
    const off = core.hw[i] + KERB + need + rng() * Math.max(max - min, 0);
    const x = core.px[i] + core.rx[i] * side * off;
    const z = core.pz[i] + core.rz[i] * side * off;
    const r = core.distToRoad(x, z);
    if (r.d < need + KERB) continue;
    if (
      !allowPool &&
      core.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + poolMargin + radius)
    )
      continue;
    const y = core.groundAt(x, z);
    const item = { x, y, z, d: r.d, i, side };
    if (filter && !filter(item)) continue;
    out.push(item);
  }
  return out;
}

// Positions for ambient particles along the track corridor.
export function corridorPositions(core, { spread = 70, yOff = -0.5 } = {}) {
  return (rng) => {
    const i = Math.floor(rng() * core.N);
    const off = (rng() * 2 - 1) * spread;
    const x = core.px[i] + core.rx[i] * off;
    const z = core.pz[i] + core.rz[i] * off;
    return [x, core.py[i] + yOff - Math.abs(off) * 0.02, z];
  };
}

// Point on the road side at fraction t: returns { x, y, z, yaw, tangent, right }.
export function roadside(core, t, lateral) {
  const p = core.getPoint(t);
  const x = p.pos.x + p.right.x * lateral;
  const z = p.pos.z + p.right.z * lateral;
  return {
    x,
    z,
    y: lateral === 0 ? p.pos.y : core.groundAt(x, z),
    roadY: p.pos.y,
    yaw: Math.atan2(p.tangent.x, p.tangent.z),
    tangent: p.tangent,
    right: p.right,
    hw: p.halfWidth,
  };
}
