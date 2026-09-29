import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural Elden Ring karts. Forward is -Z, origin on the ground under the kart centre.
// Shared geometries, materials and textures are cached at module level; each model owns only
// its animated bits (cape/hair ribbons, flames, aura, shield) and frees them in dispose().

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const cache = { geo: new Map(), mat: new Map(), tex: new Map() };
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function cachedGeo(key, make) {
  let g = cache.geo.get(key);
  if (!g) {
    g = make();
    cache.geo.set(key, g);
  }
  return g;
}

function cachedTex(key, make) {
  let t = cache.tex.get(key);
  if (!t) {
    t = make();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.tex.set(key, t);
  }
  return t;
}

function hex(c) {
  return '#' + new THREE.Color(c).getHexString();
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

// Base colour with darker scrollwork, used for gold trim and ornate panels.
function filigreeTex(base, line) {
  return cachedTex(`fili:${base}:${line}`, () =>
    canvasTex(256, (g, s) => {
      const grad = g.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, hex(base));
      grad.addColorStop(0.5, hex(new THREE.Color(base).multiplyScalar(1.25)));
      grad.addColorStop(1, hex(new THREE.Color(base).multiplyScalar(0.8)));
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = hex(line);
      g.fillStyle = hex(line);
      g.lineWidth = 3;
      g.lineCap = 'round';
      const cell = s / 4;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const x = i * cell;
          const y = j * cell;
          g.beginPath();
          g.arc(x + cell * 0.5, y, cell * 0.5, 0, Math.PI);
          g.stroke();
          g.beginPath();
          g.arc(x, y + cell * 0.5, cell * 0.3, -Math.PI / 2, Math.PI / 2);
          g.stroke();
          g.beginPath();
          g.arc(x + cell, y + cell * 0.5, cell * 0.3, Math.PI / 2, (3 * Math.PI) / 2);
          g.stroke();
          g.beginPath();
          g.arc(x + cell * 0.5, y + cell * 0.5, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.lineWidth = 6;
      g.strokeRect(0, 0, s, s);
    })
  );
}

function clothTex(color, stripe) {
  return cachedTex(`cloth:${color}:${stripe}`, () =>
    canvasTex(128, (g, s) => {
      g.fillStyle = hex(color);
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 2) {
        g.fillStyle = `rgba(0,0,0,${0.05 + ((i * 7) % 5) * 0.015})`;
        g.fillRect(i, 0, 1, s);
        g.fillStyle = `rgba(255,255,255,${0.03 + ((i * 3) % 4) * 0.01})`;
        g.fillRect(0, i, s, 1);
      }
      if (stripe) {
        g.fillStyle = hex(stripe);
        g.fillRect(0, 0, s, 8);
        g.fillRect(0, s - 8, s, 8);
      }
    })
  );
}

function grainTex(color, dark, kind = 'wood') {
  return cachedTex(`grain:${kind}:${color}:${dark}`, () =>
    canvasTex(128, (g, s) => {
      g.fillStyle = hex(color);
      g.fillRect(0, 0, s, s);
      g.strokeStyle = hex(dark);
      g.globalAlpha = 0.35;
      for (let i = 0; i < 26; i++) {
        g.lineWidth = 1 + ((i * 13) % 3);
        g.beginPath();
        const y = ((i * 37) % s) + 0.5;
        if (kind === 'wood') {
          g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y + 2);
        } else {
          g.moveTo((i * 53) % s, 0);
          g.lineTo(((i * 53) % s) + 8, s);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    })
  );
}

let _glowTex = null;
function glowTexture() {
  if (!_glowTex) {
    _glowTex = canvasTex(64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    });
    _glowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return _glowTex;
}

// Cached standard material. opts: metal, rough, emissive, ei, map, flat, opacity, side, additive.
function mat(color, o = {}) {
  const key = `${color}|${o.metal ?? 0.1}|${o.rough ?? 0.7}|${o.emissive ?? ''}|${o.ei ?? 0}|${o.map?.uuid ?? ''}|${o.opacity ?? 1}|${o.side ?? 0}|${o.additive ? 1 : 0}|${o.flat ? 1 : 0}`;
  let m = cache.mat.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      metalness: o.metal ?? 0.1,
      roughness: o.rough ?? 0.7,
      map: o.map ?? null,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.ei ?? 0,
      transparent: (o.opacity ?? 1) < 1 || !!o.additive,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      flatShading: !!o.flat,
    });
    if (o.additive) {
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
    }
    cache.mat.set(key, m);
  }
  return m;
}

function glowSprite(color, size, opacity = 0.9) {
  const key = `sprite:${color}:${opacity}`;
  let m = cache.mat.get(key);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    cache.mat.set(key, m);
  }
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

function put(parent, geometry, material, p = [0, 0, 0], r = [0, 0, 0], s = 1, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.set(r[0], r[1], r[2]);
  if (Array.isArray(s)) m.scale.set(s[0], s[1], s[2]);
  else m.scale.setScalar(s);
  m.castShadow = shadow && !material.transparent;
  parent.add(m);
  return m;
}

const box = (w, h, d) => cachedGeo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 14) =>
  cachedGeo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sph = (r, ws = 16, hs = 12) =>
  cachedGeo(`sph${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const cone = (r, h, seg = 12) =>
  cachedGeo(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const tor = (r, t, rs = 10, ts = 28, arc = Math.PI * 2) =>
  cachedGeo(`tor${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
const capsule = (r, l) => cachedGeo(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12));
const octa = (r) => cachedGeo(`oct${r}`, () => new THREE.OctahedronGeometry(r, 0));

// Reverses triangle winding of a non-indexed geometry (after a mirroring transform).
function flipWinding(g) {
  for (const attr of Object.values(g.attributes)) {
    const a = attr.array;
    const n = attr.itemSize;
    for (let t = 0; t < attr.count; t += 3) {
      for (let c = 0; c < n; c++) {
        const i1 = (t + 1) * n + c;
        const i2 = (t + 2) * n + c;
        const tmp = a[i1];
        a[i1] = a[i2];
        a[i2] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
}

// Orient a unit-height Y cylinder so it spans a -> b.
function setLimb(mesh, a, b, radiusScale = 1) {
  _v1.subVectors(b, a);
  const len = _v1.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, _v1.divideScalar(len || 1));
  mesh.scale.set(radiusScale, len, radiusScale);
}

const limbGeo = () => cachedGeo('limb', () => new THREE.CylinderGeometry(0.05, 0.045, 1, 8));

// Tapered ribbon (cape, hair, banner) that ripples with speed. Hangs from y=0 downwards along -y, trails toward +z.
function makeRibbon(width, length, material, segs = 8) {
  const geometry = new THREE.PlaneGeometry(width, length, 3, segs);
  geometry.translate(0, -length / 2, 0);
  const base = geometry.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.ribbon = { base, width, length };
  return mesh;
}

function updateRibbon(mesh, time, speedRatio, sway = 0) {
  const { base, length } = mesh.userData.ribbon;
  const pos = mesh.geometry.attributes.position;
  const a = pos.array;
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3];
    const y = base[i * 3 + 1];
    const k = -y / length; // 0 at anchor, 1 at tip
    const flap = Math.sin(time * 9 - k * 6 + x * 3) * 0.05 * k * (0.4 + speedRatio);
    a[i * 3] = x + sway * k * k;
    a[i * 3 + 2] = k * (0.12 + 0.55 * speedRatio) * length + flap;
    a[i * 3 + 1] = y * (1 - 0.25 * speedRatio * k);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// Smooth outline extruded with bevel. pts are [x, y] in the XY plane, extrusion along Z.
function smoothShape(pts, depth, bevel = 0.03, curve = true) {
  let shapePts = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  if (curve)
    shapePts = new THREE.SplineCurve([...shapePts, shapePts[0]]).getPoints(
      Math.max(60, pts.length * 8)
    );
  const shape = new THREE.Shape(shapePts);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Shared kart chassis + driver
// ---------------------------------------------------------------------------------------------

const FRONT = { x: 0.7, z: -0.72, r: 0.3 };
const REAR = { x: 0.74, z: 0.72, r: 0.36 };
const WHEEL_W = 0.28;

function buildWheel(rim, tire, r, opts = {}) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const tireG = cachedGeo(
    `tire${r},${opts.fat ?? 0}`,
    () => new THREE.TorusGeometry(r - 0.09, 0.1 + (opts.fat ?? 0), 10, 24)
  );
  put(spin, tireG, tire, [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1 + (opts.fat ?? 0) * 2]);
  put(spin, cyl(r - 0.09, r - 0.09, WHEEL_W * 0.8, 16), rim, [0, 0, 0], [0, 0, Math.PI / 2]);
  const spokes = opts.spokes ?? 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI;
    put(spin, box(WHEEL_W * 0.95, (r - 0.1) * 2, 0.045), rim, [0, 0, 0], [a, 0, 0], 1, false);
  }
  put(spin, cyl(0.09, 0.09, WHEEL_W * 1.15, 10), opts.hub ?? rim, [0, 0, 0], [0, 0, Math.PI / 2]);
  if (opts.spikes) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put(
        spin,
        cone(0.05, 0.16, 6),
        opts.hub ?? rim,
        [0, Math.sin(a) * (r + 0.02), Math.cos(a) * (r + 0.02)],
        [Math.PI / 2 - a, 0, 0],
        1,
        false
      );
    }
  }
  g.userData.spin = spin;
  g.userData.radius = r;
  return g;
}

function makeSteeringWheel(rimMat, hubMat) {
  const g = new THREE.Group();
  const rot = new THREE.Group();
  g.add(rot);
  put(rot, tor(0.15, 0.022, 8, 20), rimMat);
  put(rot, box(0.3, 0.03, 0.03), rimMat, [0, 0, 0], [0, 0, 0], 1, false);
  put(rot, box(0.03, 0.15, 0.03), rimMat, [0, -0.07, 0], [0, 0, 0], 1, false);
  put(rot, cyl(0.05, 0.05, 0.05, 10), hubMat, [0, 0, 0], [Math.PI / 2, 0, 0], 1, false);
  g.userData.rot = rot;
  return g;
}

// Skeleton shared by every kart. `look` gives per-character colours/dimensions.
function buildBase(model, look) {
  const { body } = model;
  const gold = look.gold;
  const wheelRim = look.rim ?? gold;
  const tire = mat(0x151515, { rough: 0.9, metal: 0 });
  const dark = mat(0x1d1a1a, { rough: 0.6, metal: 0.5 });

  // Tub: pointed-nose extruded outline (shape Y maps to world -Z after the rotation).
  const outline =
    look.tub ??
    [
      [-0.55, -0.95],
      [-0.62, -0.5],
      [-0.6, 0.2],
      [-0.5, 0.95],
      [0.5, 0.95],
      [0.6, 0.2],
      [0.62, -0.5],
      [0.5, -0.85],
      [0.28, -1.08],
      [0, -1.16],
      [-0.28, -1.08],
      [-0.5, -0.85],
    ].map((p) => [p[0], -p[1]]);
  const tubGeo = cachedGeo(`tub:${look.id}`, () => {
    const g = smoothShape(outline, look.tubH ?? 0.26, 0.05);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  put(body, tubGeo, look.tubMat, [0, 0.3, 0]);
  // Skirt / floor plate
  put(body, box(1.0, 0.06, 1.7), dark, [0, 0.2, 0.05]);
  // Seat
  put(body, box(0.5, 0.12, 0.45), look.seatMat ?? mat(0x2a1a14, { rough: 0.85 }), [0, 0.6, 0.28]);
  put(
    body,
    box(0.5, 0.42, 0.1),
    look.seatMat ?? mat(0x2a1a14, { rough: 0.85 }),
    [0, 0.8, 0.5],
    [0.15, 0, 0]
  );
  // Axles
  put(body, cyl(0.045, 0.045, 1.5, 8), dark, [0, REAR.r, REAR.z], [0, 0, Math.PI / 2], 1, false);
  put(body, cyl(0.045, 0.045, 1.35, 8), dark, [0, FRONT.r, FRONT.z], [0, 0, Math.PI / 2], 1, false);

  // Wheels
  model.wheels = [];
  const specs = look.wheelSpecs ?? [
    { x: -FRONT.x, z: FRONT.z, r: FRONT.r, front: true },
    { x: FRONT.x, z: FRONT.z, r: FRONT.r, front: true },
    { x: -REAR.x, z: REAR.z, r: REAR.r },
    { x: REAR.x, z: REAR.z, r: REAR.r },
  ];
  specs.forEach((s, i) => {
    const w = buildWheel(look.wheelRim?.[i] ?? wheelRim, tire, s.r, {
      hub: look.hub,
      spikes: look.spikes,
      fat: look.fat,
      spokes: look.spokes,
    });
    const pivot = new THREE.Group();
    pivot.position.set(s.x, s.r + (s.dy ?? 0), s.z);
    if (s.x > 0) w.rotation.y = 0;
    pivot.add(w);
    body.add(pivot);
    model.wheels.push({
      pivot,
      spin: w.userData.spin,
      r: s.r,
      front: !!s.front,
      wobble: s.wobble ?? 0,
      side: Math.sign(s.x),
    });
  });

  // Steering wheel + column
  const sw = makeSteeringWheel(look.wheelMat ?? gold, dark);
  sw.position.set(0, 0.92, -0.3);
  sw.rotation.x = -0.75;
  sw.updateMatrix();
  body.add(sw);
  model.steerWheel = sw;
  put(body, cyl(0.03, 0.04, 0.5, 8), dark, [0, 0.7, -0.38], [-0.35, 0, 0], 1, false);

  // Exhaust / boost nozzles at the rear
  model.flames = [];
  const flameMat = new THREE.MeshBasicMaterial({
    color: look.flame ?? 0xffa030,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffe8b0,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  model.owned.push(flameMat, coreMat);
  [-0.28, 0.28].forEach((x) => {
    put(body, cyl(0.075, 0.1, 0.22, 10), dark, [x, 0.42, 1.0], [Math.PI / 2, 0, 0]);
    put(body, tor(0.08, 0.018, 6, 12), look.gold, [x, 0.42, 1.11]);
    const f = new THREE.Group();
    f.position.set(x, 0.42, 1.12);
    const outer = new THREE.Mesh(cone(0.11, 0.75, 10), flameMat);
    outer.rotation.x = -Math.PI / 2;
    outer.position.z = 0.38;
    const inner = new THREE.Mesh(cone(0.05, 0.42, 8), coreMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.z = 0.22;
    f.add(outer, inner);
    const spr = glowSprite(look.flame ?? 0xffa030, 0.7, 0.8);
    spr.position.z = 0.15;
    f.add(spr);
    f.visible = false;
    body.add(f);
    model.flames.push(f);
  });
  model.flameMat = flameMat;
  model.baseFlame = look.flame ?? 0xffa030;
}

// Tapered chest lathe: narrow waist, broad shoulders, closed at the neck. Y runs up from the waist.
const torsoGeo = () =>
  cachedGeo(
    'torso',
    () =>
      new THREE.LatheGeometry(
        [
          [0.001, 0],
          [0.15, 0],
          [0.155, 0.08],
          [0.18, 0.22],
          [0.205, 0.36],
          [0.21, 0.44],
          [0.18, 0.5],
          [0.11, 0.55],
          [0.06, 0.58],
          [0.001, 0.585],
        ].map((p) => new THREE.Vector2(p[0], p[1])),
        20
      )
  );
const legGeo = () => cachedGeo('leg', () => new THREE.CylinderGeometry(0.07, 0.06, 1, 10));
const shellGeo = (rt, rb, h) =>
  cachedGeo(`shell${rt},${rb},${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 20, 1, true));
const featherGeo = () =>
  cachedGeo('feather', () =>
    smoothShape(
      [
        [0, 0],
        [0.12, 0.25],
        [0.1, 0.75],
        [0, 1.1],
        [-0.1, 0.75],
        [-0.12, 0.25],
      ],
      0.02,
      0.008
    )
  );

// Horse head in profile: muzzle toward -Z, poll at y ~1.
const horseHeadGeo = () =>
  cachedGeo('horse-head', () => {
    const g = smoothShape(
      [
        [-0.05, 0],
        [-0.22, 0.3],
        [-0.2, 0.7],
        [-0.12, 0.95],
        [0, 1.0],
        [0.08, 0.93],
        [0.35, 0.62],
        [0.5, 0.46],
        [0.56, 0.36],
        [0.56, 0.26],
        [0.48, 0.22],
        [0.36, 0.3],
        [0.22, 0.42],
        [0.14, 0.5],
        [0.16, 0.25],
        [0.22, 0],
      ],
      0.2,
      0.045
    );
    g.rotateY(Math.PI / 2);
    return g;
  });

// Hood or open-faced helm: closed crown, face opening toward -Z, dark inner lining.
function addHood(parent, r, material, lining, p = [0, 0, 0], s = 1) {
  const g = new THREE.Group();
  g.position.set(p[0], p[1], p[2]);
  if (Array.isArray(s)) g.scale.set(s[0], s[1], s[2]);
  else g.scale.setScalar(s);
  put(
    g,
    cachedGeo(
      `hood-cap${r}`,
      () => new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.3)
    ),
    material
  );
  put(
    g,
    cachedGeo(
      `hood-side${r}`,
      () =>
        new THREE.SphereGeometry(
          r,
          24,
          12,
          Math.PI * 1.5 + 0.6,
          Math.PI * 2 - 1.2,
          Math.PI * 0.3,
          Math.PI * 0.45
        )
    ),
    material
  );
  put(
    g,
    cachedGeo(
      `hood-lining${r}`,
      () => new THREE.SphereGeometry(r * 0.95, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.75)
    ),
    lining,
    [0, 0, 0],
    [0, 0, 0],
    1,
    false
  );
  parent.add(g);
  return g;
}

// Seated humanoid driver. Torso, head and pauldrons follow the torso pivot (lean); legs and arms live in the driver group.
function buildDriver(model, d) {
  const g = new THREE.Group();
  model.body.add(g);
  model.driver = g;
  const sc = d.scale ?? 1;
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.62, 0.32);
  torsoPivot.scale.setScalar(sc);
  g.add(torsoPivot);
  model.torso = torsoPivot;
  const skin = mat(d.skin ?? 0xe0b090, { rough: 0.6 });
  const cloth =
    d.torsoMat ?? mat(d.cloth ?? 0x444444, { rough: 0.75, metal: d.clothMetal ?? 0.05 });
  const ts = d.torsoScale ?? [1, 1, 1];

  put(torsoPivot, torsoGeo(), cloth, [0, 0, 0], [0, 0, 0], [ts[0], ts[1], 0.72 * ts[2]]);
  put(
    torsoPivot,
    cyl(0.165, 0.165, 0.07, 18),
    d.beltMat ?? mat(0x2b1d10, { rough: 0.6 }),
    [0, 0.06, 0],
    [0, 0, 0],
    [ts[0], 1, 0.76 * ts[2]],
    false
  );
  put(torsoPivot, cyl(0.055, 0.065, 0.14, 10), d.neckMat ?? skin, [0, 0.6, 0]);
  if (d.mantle)
    put(
      torsoPivot,
      shellGeo(0.1, 0.27, 0.24),
      d.mantle,
      [0, 0.47, 0.01],
      [0, 0, 0],
      [ts[0], 1, 0.85 * ts[2]]
    );
  if (d.pauldron) {
    const ps = d.pauldronSize ?? 1;
    [-1, 1].forEach((s) =>
      put(
        torsoPivot,
        sph(0.105, 14, 10),
        d.pauldron,
        [s * 0.215 * ts[0], 0.47, 0.01],
        [0, 0, s * -0.35],
        [1.15 * ps, 0.8 * ps, 1.05 * ps]
      )
    );
  }

  // seated legs: thigh forward, shin down to the footwell
  const legMat = d.legMat ?? cloth;
  const bootMat = d.bootMat ?? mat(0x201510, { rough: 0.7 });
  [-1, 1].forEach((s) => {
    const hip = new THREE.Vector3(s * 0.11, 0.68, 0.32);
    const knee = new THREE.Vector3(s * 0.13, 0.76, -0.06);
    const ankle = new THREE.Vector3(s * 0.13, 0.52, -0.28);
    setLimb(put(g, legGeo(), legMat), hip, knee, 1.25);
    setLimb(put(g, legGeo(), legMat), knee, ankle, 1.0);
    put(g, sph(0.075, 10, 8), legMat, [knee.x, knee.y, knee.z]);
    put(g, box(0.14, 0.12, 0.26), bootMat, [s * 0.13, 0.48, -0.34]);
  });
  if (d.robe) {
    put(g, box(0.38, 0.05, 0.44), d.robe, [0, 0.84, 0.12], [0.23, 0, 0]);
    put(g, box(0.38, 0.3, 0.04), d.robe, [0, 0.71, -0.13], [0.05, 0, 0]);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.76, 0);
  torsoPivot.add(head);
  model.head = head;
  if (!d.noFace)
    put(
      head,
      sph(0.14, 20, 16),
      d.faceMat ?? skin,
      [0, 0, 0],
      [0, 0, 0],
      d.headScale ?? [0.92, 1.04, 1]
    );
  if (!d.noEyes) {
    const eyeMat = mat(d.eyeColor ?? 0x111111, {
      rough: 0.3,
      emissive: d.eyeGlow ?? 0x000000,
      ei: d.eyeGlow ? (d.eyeIntensity ?? 1.5) : 0,
    });
    [-0.048, 0.048].forEach((x) =>
      put(head, sph(0.02, 8, 6), eyeMat, [x, 0.015, -0.122], [0, 0, 0], 1, false)
    );
  }
  const u = { skin, cloth, mat, put, sph, cyl, cone, box, tor, capsule, octa };
  if (d.head) d.head(head, u);
  if (d.torsoExtra) d.torsoExtra(torsoPivot, u);

  // arms (two segments) reaching the steering wheel
  const sleeve =
    d.sleeveMat ??
    mat(d.sleeve ?? d.cloth ?? 0x444444, { rough: 0.7, metal: d.sleeveMetal ?? 0.05 });
  const glove = mat(d.glove ?? 0x2a1a10, { rough: 0.6, metal: d.gloveMetal ?? 0.1 });
  const thick = d.armThick ?? 1.3;
  model.arms = [-1, 1].map((side) => {
    const prosthetic = side === (d.protheticSide ?? 0) ? d.protheticMat : null;
    const upper = new THREE.Mesh(limbGeo(), prosthetic ?? sleeve);
    const lower = new THREE.Mesh(limbGeo(), prosthetic ?? d.forearmMat ?? sleeve);
    const hand = new THREE.Mesh(sph(0.065, 10, 8), prosthetic ?? glove);
    upper.castShadow = lower.castShadow = true;
    g.add(upper, lower, hand);
    return {
      side,
      upper,
      lower,
      hand,
      thick,
      shoulder: new THREE.Vector3(side * 0.2 * sc, 0.62 + 0.47 * sc, 0.32),
      elbow: new THREE.Vector3(),
      target: new THREE.Vector3(),
    };
  });
  model.armScale = sc;
  return g;
}

function addRibbon(model, width, length, material, p, sway, rotY = 0) {
  const r = makeRibbon(width, length, material);
  r.position.set(p[0], p[1], p[2]);
  r.rotation.y = rotY;
  model.body.add(r);
  model.ribbons.push({ mesh: r, sway });
  return r;
}

// ---------------------------------------------------------------------------------------------
// Character builders
// ---------------------------------------------------------------------------------------------

const CHARACTER_BUILDERS = {
  tarnished(model, c) {
    const goldTex = filigreeTex(0xc9a227, 0x5a3f08);
    const gold = mat(0xffffff, { metal: 0.6, rough: 0.35, map: goldTex });
    const black = mat(0x14141a, { metal: 0.5, rough: 0.4 });
    const tub = mat(0xffffff, { metal: 0.4, rough: 0.6, map: filigreeTex(0xb8891c, 0x3a2705) });
    buildBase(model, { id: c.id, gold, tubMat: tub, flame: 0xff9a30, hub: black, rim: gold });
    const { body } = model;
    // Sweeping crescent back rest
    put(body, tor(0.62, 0.05, 8, 32, Math.PI), gold, [0, 0.62, 0.78], [0, 0, 0], [1, 1.1, 1]);
    put(body, tor(0.5, 0.035, 8, 32, Math.PI), black, [0, 0.62, 0.78], [0, 0, 0], [1, 1.1, 1]);
    // Rear ornaments: erdtree leaf spires
    [-0.5, 0.5].forEach((x) => {
      put(body, cone(0.06, 0.55, 6), gold, [x, 0.95, 0.85], [0.1, 0, x * -0.3]);
      put(
        body,
        sph(0.055, 10, 8),
        mat(0xffd070, { emissive: 0xffb030, ei: 1.5 }),
        [x * 1.05, 1.24, 0.88],
        [0, 0, 0],
        1,
        false
      );
    });
    // Side rails
    [-1, 1].forEach((s) => {
      put(body, box(0.05, 0.05, 1.3), gold, [s * 0.6, 0.62, 0.15]);
      put(body, box(0.14, 0.04, 0.6), black, [s * 0.66, 0.53, 0.55], [0, 0, s * 0.2]);
    });
    // Torrent: slate-grey steed head with ibex horns and a pale spectral mane
    const coat = mat(0x474a52, { rough: 0.6, metal: 0.05 });
    const hornMat = mat(0xa39680, { rough: 0.5, metal: 0.1 });
    const horse = new THREE.Group();
    horse.position.set(0, 0.4, -0.95);
    horse.scale.set(1.25, 1.1, 1.1);
    horse.rotation.x = 0.12;
    put(horse, horseHeadGeo(), coat, [0, 0, 0], [0, 0, 0], 1.02, false);
    [-0.07, 0.07].forEach((x) =>
      put(horse, cone(0.04, 0.15, 6), coat, [x, 1.0, 0.06], [-0.2, 0, x * 2], 1, false)
    );
    const hornGeo = cachedGeo('torrent-horn', () => {
      const g = new THREE.TorusGeometry(0.17, 0.034, 6, 18, Math.PI * 0.85);
      g.rotateY(Math.PI / 2);
      g.translate(0, 0, 0.17);
      return g;
    });
    [-1, 1].forEach((s) => {
      const h = new THREE.Group();
      h.position.set(s * 0.13, 0.96, -0.02);
      h.rotation.set(0.5, s * 0.3, 0);
      put(h, hornGeo, hornMat, [0, 0, 0], [0, 0, 0], 1, false);
      horse.add(h);
    });
    [-0.1, 0.1].forEach((x) =>
      put(
        horse,
        sph(0.028, 8, 6),
        mat(0x1a1c22, { rough: 0.2, emissive: 0x6f9fd0, ei: 0.5 }),
        [x, 0.66, -0.22],
        [0, 0, 0],
        1,
        false
      )
    );
    put(
      horse,
      tor(0.13, 0.014, 6, 16),
      gold,
      [0, 0.36, -0.26],
      [0, Math.PI / 2, 0.55],
      [1, 0.9, 1.1],
      false
    );
    const maneMat = new THREE.MeshBasicMaterial({
      color: 0xd6ecff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    model.owned.push(maneMat);
    const mane = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(cone(0.07 - i * 0.006, 0.3, 6), maneMat);
      m.position.set(0, 0.95 - i * 0.13, 0.12 + i * 0.02);
      m.rotation.x = Math.PI / 2 - 0.7;
      horse.add(m);
      mane.push(m);
    }
    body.add(horse);
    model.anim.push((t, dt, kart, sr) => {
      mane.forEach((m, i) => {
        m.rotation.x = Math.PI / 2 - 0.8 + Math.sin(t * 6 + i) * 0.15 + sr * 0.5;
        m.scale.y = 1 + Math.sin(t * 9 + i * 1.7) * 0.15;
      });
      horse.rotation.x = 0.12 + Math.sin(t * 2.2) * 0.02;
    });

    // Black Knife-style hooded assassin: layered dark leather, tattered cloak, masked face in shadow
    const leather = mat(0xffffff, {
      rough: 0.7,
      metal: 0.25,
      map: grainTex(0x4a4852, 0x1e1d22, 'metal'),
    });
    const hoodCloth = mat(0xffffff, {
      rough: 0.9,
      side: THREE.DoubleSide,
      map: clothTex(0x5a5862, 0x7a6a3a),
    });
    const lining = mat(0x050506, { rough: 1, side: THREE.BackSide });
    buildDriver(model, {
      torsoMat: leather,
      legMat: leather,
      sleeveMat: leather,
      glove: 0x121215,
      bootMat: mat(0x18171b, { rough: 0.6, metal: 0.3 }),
      beltMat: mat(0x4a3418, { rough: 0.55, metal: 0.3 }),
      pauldron: leather,
      mantle: hoodCloth,
      faceMat: mat(0x0b0b0e, { rough: 0.9 }),
      eyeColor: 0xe0d6b0,
      eyeGlow: 0xa08a50,
      eyeIntensity: 0.9,
      head(h, u) {
        addHood(h, 0.185, hoodCloth, lining, [0, 0.02, 0.02]);
        u.put(h, u.cone(0.07, 0.26, 10), hoodCloth, [0, 0.1, 0.2], [2.1, 0, 0]);
        u.put(
          h,
          cachedGeo(
            'face-mask',
            () => new THREE.CylinderGeometry(0.15, 0.135, 0.12, 18, 1, true, Math.PI * 0.5, Math.PI)
          ),
          hoodCloth,
          [0, -0.06, 0]
        );
      },
      torsoExtra(t) {
        put(
          t,
          box(0.05, 0.75, 0.03),
          mat(0xd8d8e0, { metal: 0.9, rough: 0.2 }),
          [0.1, 0.45, 0.2],
          [0.1, 0, 0.35]
        );
        put(t, box(0.16, 0.03, 0.04), gold, [-0.05, 0.1, 0.2], [0.1, 0, 0.35]);
        put(t, box(0.07, 0.07, 0.03), gold, [0, 0.06, -0.12], [0, 0, 0], 1, false);
      },
    });
    addRibbon(
      model,
      0.5,
      1.0,
      mat(0xffffff, { rough: 0.85, side: THREE.DoubleSide, map: clothTex(0x24232b, 0x8a6a1c) }),
      [0, 1.14, 0.58],
      0.05
    );
  },

  ranni(model, c) {
    const silver = mat(0xffffff, { metal: 0.6, rough: 0.3, map: filigreeTex(0xc9d8ea, 0x3b5f99) });
    const tub = mat(0xffffff, { metal: 0.3, rough: 0.55, map: filigreeTex(0x2a4fa8, 0xbfe3ff) });
    const glint = mat(0x9fdcff, {
      emissive: 0x4fb0ff,
      ei: 1.6,
      metal: 0.1,
      rough: 0.15,
      opacity: 0.92,
    });
    buildBase(model, {
      id: c.id,
      gold: silver,
      tubMat: tub,
      flame: 0x7fc8ff,
      rim: silver,
      hub: glint,
      spokes: 5,
    });
    const { body } = model;
    // Flared pointed fenders (witch hat brims)
    [-1, 1].forEach((s) => {
      put(body, cone(0.42, 0.28, 16), tub, [s * 0.82, 0.8, 0.72], [0, 0, -s * 1.2], [1, 1, 0.6]);
      put(body, box(0.05, 0.05, 1.2), silver, [s * 0.6, 0.62, 0.05]);
    });
    // Dark moon lamp on a curved post
    const post = new THREE.Group();
    post.position.set(0.58, 0.75, 0.85);
    body.add(post);
    put(post, cyl(0.03, 0.045, 1.0, 8), silver, [0, 0.45, 0]);
    put(post, tor(0.28, 0.035, 8, 24, Math.PI * 1.55), silver, [0, 1.0, 0], [0, 0, Math.PI * 0.72]);
    const moon = new THREE.Group();
    moon.position.set(0.02, 1.08, 0);
    post.add(moon);
    put(
      moon,
      sph(0.16, 20, 14),
      mat(0xeaf6ff, { emissive: 0xb8e2ff, ei: 1.8, rough: 0.4 }),
      [0, 0, 0],
      [0, 0, 0],
      1,
      false
    );
    const halo = glowSprite(0x8fd0ff, 1.6, 0.7);
    moon.add(halo);
    const crystals = [];
    for (let i = 0; i < 5; i++) {
      const cr = new THREE.Mesh(octa(0.07 + (i % 3) * 0.02), glint);
      body.add(cr);
      crystals.push(cr);
    }
    put(body, cone(0.08, 0.45, 6), glint, [0, 0.55, -1.15], [-Math.PI / 2 + 0.05, 0, 0], 1, false);
    put(body, sph(0.09, 10, 8), glint, [0, 0.6, -1.05], [0, 0, 0], 1, false);
    model.anim.push((t) => {
      crystals.forEach((cr, i) => {
        const a = t * 1.3 + (i / crystals.length) * Math.PI * 2;
        cr.position.set(
          Math.cos(a) * 0.75,
          1.15 + Math.sin(t * 2 + i) * 0.08,
          0.7 + Math.sin(a) * 0.35
        );
        cr.rotation.y = t * 2 + i;
        cr.rotation.x = t + i;
      });
      halo.scale.setScalar(1.6 + Math.sin(t * 3) * 0.12);
      moon.position.y = 1.08 + Math.sin(t * 2.1) * 0.02;
    });

    // Snow witch: pale blue doll skin, four arms, silver hair, huge bent witch hat, white fur mantle
    const dress = mat(0xffffff, { rough: 0.8, map: clothTex(0x1f2d5c, 0x9fb4e0) });
    const fur = mat(0xf1f0ec, { rough: 1, side: THREE.DoubleSide });
    const hatMat = mat(0xffffff, {
      rough: 0.85,
      side: THREE.DoubleSide,
      map: clothTex(0x2d3a5a, 0),
    });
    const hair = mat(0xe6ecf6, { rough: 0.55, side: THREE.DoubleSide });
    const doll = mat(0xa6bddf, { rough: 0.35, metal: 0.1 });
    buildDriver(model, {
      torsoMat: dress,
      legMat: dress,
      sleeveMat: dress,
      robe: dress,
      forearmMat: doll,
      glove: 0xa6bddf,
      skin: 0xa6bddf,
      faceMat: doll,
      mantle: fur,
      eyeColor: 0x2a5fc0,
      eyeGlow: 0x3f8fff,
      eyeIntensity: 0.8,
      head(h, u) {
        u.put(h, u.sph(0.152, 18, 12), hair, [0, 0.035, 0.03]);
        u.put(h, u.box(0.2, 0.05, 0.05), hair, [0, 0.085, -0.112], [0.35, 0, 0]);
        [-1, 1].forEach((s) => u.put(h, u.box(0.05, 0.26, 0.08), hair, [s * 0.118, -0.07, -0.03]));
        const brim = cachedGeo(
          'ranni-brim',
          () =>
            new THREE.LatheGeometry(
              [
                [0.12, 0.03],
                [0.24, 0.0],
                [0.36, -0.035],
                [0.41, -0.065],
              ].map((p) => new THREE.Vector2(p[0], p[1])),
              32
            )
        );
        u.put(h, brim, hatMat, [0, 0.11, 0], [0.1, 0, 0]);
        const crown = new THREE.Group();
        crown.position.set(0, 0.12, 0.01);
        crown.rotation.x = 0.1;
        h.add(crown);
        u.put(crown, u.cyl(0.075, 0.15, 0.3, 18), hatMat, [0, 0.15, 0]);
        u.put(crown, u.cone(0.075, 0.26, 16), hatMat, [0, 0.41, 0.07], [0.55, 0, 0]);
        u.put(
          crown,
          u.tor(0.142, 0.012, 6, 24),
          mat(0x9fb4e0, { metal: 0.6, rough: 0.35 }),
          [0, 0.03, 0],
          [Math.PI / 2, 0, 0]
        );
      },
      torsoExtra(t) {
        // second pair of arms folded on the lap
        [-1, 1].forEach((s) =>
          put(t, capsule(0.04, 0.2), doll, [s * 0.14, 0.2, -0.17], [Math.PI / 2 + 0.2, 0, s * -0.5])
        );
        put(t, tor(0.15, 0.06, 8, 20), fur, [0, 0.53, 0.01], [Math.PI / 2, 0, 0]);
      },
    });
    addRibbon(model, 0.52, 0.95, fur, [0, 1.13, 0.58], 0.02);
    [-1, 0, 1].forEach((k) =>
      addRibbon(model, 0.18, 0.8 - Math.abs(k) * 0.12, hair, [k * 0.09, 1.42, 0.47], 0, k * 0.45)
    );
  },

  malenia(model, c) {
    const gold = mat(0xffffff, { metal: 0.65, rough: 0.3, map: filigreeTex(0xe0b64a, 0x6b4a10) });
    const red = mat(0xffffff, { metal: 0.25, rough: 0.55, map: filigreeTex(0xa8201a, 0xf1d38a) });
    buildBase(model, {
      id: c.id,
      gold,
      tubMat: red,
      flame: 0xff6a3a,
      rim: gold,
      hub: gold,
      spokes: 8,
    });
    const { body } = model;
    // Wings: layered feather fans per side
    const wingPivots = [];
    [-1, 1].forEach((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.45, 0.85, 0.75);
      body.add(pivot);
      for (let i = 0; i < 7; i++) {
        const f = new THREE.Group();
        f.rotation.z = -s * (0.25 + i * 0.22);
        f.rotation.x = 0.35;
        f.scale.setScalar(1.15 - i * 0.05);
        put(f, featherGeo(), i % 2 ? red : gold, [0, 0, i * 0.008]);
        pivot.add(f);
      }
      wingPivots.push({ pivot, s });
      put(body, cone(0.035, 0.5, 6), gold, [s * 0.6, 0.6, 0.98], [0.6, 0, s * -0.5]);
    });
    model.anim.push((t, dt, kart, sr) => {
      wingPivots.forEach(({ pivot, s }) => {
        pivot.rotation.z = s * (0.05 + Math.sin(t * 2.4) * 0.05 + sr * 0.12);
        pivot.rotation.y = -s * (0.15 + sr * 0.25);
      });
    });
    // Hand of Malenia: slender katana racked along the left side
    const steel = mat(0xe6e2d8, { metal: 0.95, rough: 0.15 });
    put(body, box(0.016, 0.055, 1.45), steel, [-0.72, 0.74, -0.2], [0.03, 0, 0]);
    put(
      body,
      cone(0.028, 0.16, 4),
      steel,
      [-0.72, 0.745, -1.0],
      [-Math.PI / 2, Math.PI / 4, 0],
      [0.6, 1, 1.8]
    );
    put(body, cyl(0.07, 0.07, 0.02, 12), gold, [-0.72, 0.76, 0.54], [Math.PI / 2, 0, 0]);
    put(body, box(0.035, 0.05, 0.3), mat(0x5a0f0c, { rough: 0.8 }), [-0.72, 0.77, 0.7]);
    // Front golden bud
    put(body, cone(0.12, 0.5, 8), gold, [0, 0.45, -1.35], [-Math.PI / 2, 0, 0]);
    put(body, sph(0.13, 12, 10), red, [0, 0.45, -1.12], [0, 0, 0], [1, 0.8, 1]);
    const bloom = glowSprite(0xff5a2a, 1.4, 0.45);
    bloom.position.set(0, 0.5, -1.3);
    body.add(bloom);

    // Blade of Miquella: gold plate and prosthetics, closed winged helm, long crimson hair
    const plate = mat(0xffffff, {
      metal: 0.8,
      rough: 0.3,
      map: grainTex(0xcfa655, 0x8a6424, 'metal'),
    });
    const helm = mat(0xffffff, {
      metal: 0.8,
      rough: 0.26,
      map: grainTex(0xdcb466, 0x9a7430, 'metal'),
    });
    const redCloth = mat(0xffffff, { rough: 0.8, map: clothTex(0x8e1d16, 0xd9b35a) });
    buildDriver(model, {
      torsoMat: plate,
      sleeveMat: redCloth,
      legMat: plate,
      robe: redCloth,
      bootMat: plate,
      beltMat: mat(0x5a0f0c, { rough: 0.7 }),
      pauldron: plate,
      protheticSide: 1,
      protheticMat: plate,
      glove: 0xcfa655,
      gloveMetal: 0.8,
      neckMat: plate,
      mantle: mat(0xffffff, {
        rough: 0.8,
        side: THREE.DoubleSide,
        map: clothTex(0x8e1d16, 0xd9b35a),
      }),
      noFace: true,
      noEyes: true,
      head(h, u) {
        u.put(h, u.sph(0.165, 20, 16), helm, [0, 0.02, 0.005], [0, 0, 0], [0.95, 1.05, 1.02]);
        u.put(h, u.box(0.022, 0.2, 0.03), helm, [0, 0.0, -0.158]);
        u.put(h, u.box(0.19, 0.018, 0.02), mat(0x120806, { rough: 0.8 }), [0, 0.03, -0.152]);
        [-1, 1].forEach((s) => {
          const tilt = new THREE.Group();
          tilt.position.set(s * 0.13, 0.06, 0.02);
          tilt.rotation.z = -s * 0.3;
          h.add(tilt);
          const wing = new THREE.Group();
          wing.rotation.y = Math.PI / 2;
          tilt.add(wing);
          for (let i = 0; i < 5; i++)
            u.put(
              wing,
              featherGeo(),
              helm,
              [0, 0, i * 0.004],
              [0, 0, 0.05 + i * 0.3],
              0.3 - i * 0.03
            );
        });
      },
    });
    const hairMat = mat(0xffffff, {
      rough: 0.6,
      side: THREE.DoubleSide,
      map: clothTex(0xb02a14, 0xd0461c),
    });
    [-1, 0, 1].forEach((k) =>
      addRibbon(
        model,
        0.26,
        1.15 - Math.abs(k) * 0.2,
        hairMat,
        [k * 0.12, 1.4, 0.47],
        0.03,
        k * 0.45
      )
    );
  },

  radahn(model, c) {
    const bronze = mat(0xffffff, {
      metal: 0.6,
      rough: 0.45,
      map: grainTex(0x7a4b1e, 0x2e1a08, 'metal'),
    });
    const wood = mat(0xffffff, { rough: 0.8, map: grainTex(0x5a3a1a, 0x24140a) });
    const iron = mat(0x5a4e46, { metal: 0.6, rough: 0.55 });
    const starMat = mat(0xffa040, { emissive: 0xff7a1a, ei: 2.2 });
    const gold = mat(0xffffff, { metal: 0.6, rough: 0.35, map: filigreeTex(0xb0803a, 0x3a2208) });
    const wheelSpecs = [
      { x: -0.78, z: -0.72, r: 0.42, front: true },
      { x: 0.78, z: -0.72, r: 0.42, front: true },
      { x: -0.82, z: 0.72, r: 0.48 },
      { x: 0.82, z: 0.72, r: 0.48 },
    ];
    buildBase(model, {
      id: c.id,
      gold: bronze,
      tubMat: wood,
      tubH: 0.34,
      flame: 0xff8a2a,
      rim: iron,
      hub: gold,
      spikes: true,
      fat: 0.02,
      wheelSpecs,
      spokes: 5,
      tub: [
        [-0.7, -0.9],
        [-0.75, 0.9],
        [0.75, 0.9],
        [0.7, -0.9],
        [0.45, -1.1],
        [-0.45, -1.1],
      ].map((p) => [p[0], -p[1]]),
    });
    const { body } = model;
    [-1, 1].forEach((s) => {
      put(body, box(0.06, 0.4, 1.7), iron, [s * 0.72, 0.68, 0.05]);
      for (let i = 0; i < 5; i++)
        put(
          body,
          sph(0.035, 8, 6),
          starMat,
          [s * 0.76, 0.8, -0.65 + i * 0.36],
          [0, 0, 0],
          1,
          false
        );
    });
    put(body, box(1.4, 0.55, 0.08), iron, [0, 0.78, 0.98]);
    for (let i = 0; i < 5; i++)
      put(body, sph(0.04, 8, 6), starMat, [-0.5 + i * 0.25, 0.9, 1.03], [0, 0, 0], 1, false);
    put(body, box(1.2, 0.3, 0.55), iron, [0, 0.55, -0.9], [0.25, 0, 0]);
    // Leonard, Radahn's loyal little chestnut steed, as the prow
    const leonard = new THREE.Group();
    leonard.position.set(0, 0.62, -1.05);
    leonard.scale.set(1.0, 0.6, 0.6);
    leonard.rotation.x = 0.1;
    body.add(leonard);
    const chestnut = mat(0x7a4a26, { rough: 0.65 });
    put(leonard, horseHeadGeo(), chestnut, [0, 0, 0], [0, 0, 0], 1, false);
    [-0.07, 0.07].forEach((x) =>
      put(leonard, cone(0.05, 0.18, 6), chestnut, [x, 1.02, 0.04], [-0.15, 0, x * 2], 1, false)
    );
    [-0.1, 0.1].forEach((x) =>
      put(
        leonard,
        sph(0.035, 8, 6),
        mat(0x0a0806, { rough: 0.2 }),
        [x, 0.66, -0.2],
        [0, 0, 0],
        1,
        false
      )
    );
    const leoMane = mat(0xc8321c, { rough: 0.7 });
    for (let i = 0; i < 6; i++)
      put(
        leonard,
        cone(0.07, 0.3, 5),
        leoMane,
        [0, 0.95 - i * 0.14, 0.14 + i * 0.02],
        [Math.PI / 2 - 0.6, 0, 0],
        1,
        false
      );
    // Gravity star ornaments orbiting behind the driver
    const stars = new THREE.Group();
    stars.position.set(0, 1.25, 1.05);
    body.add(stars);
    const core = put(stars, sph(0.16, 16, 12), starMat, [0, 0, 0], [0, 0, 0], 1, false);
    const gl = glowSprite(0xff8a2a, 1.5, 0.8);
    stars.add(gl);
    put(
      stars,
      tor(0.38, 0.012, 6, 32),
      mat(0xffc080, { emissive: 0xff9a40, ei: 1.5 }),
      [0, 0, 0],
      [Math.PI / 2 - 0.3, 0, 0.3],
      1,
      false
    );
    put(
      stars,
      tor(0.5, 0.01, 6, 32),
      mat(0xffc080, { emissive: 0xff9a40, ei: 1.2 }),
      [0, 0, 0],
      [Math.PI / 2 + 0.4, 0.5, 0],
      1,
      false
    );
    const orbs = [];
    for (let i = 0; i < 4; i++)
      orbs.push(put(stars, sph(0.05, 8, 6), starMat, [0, 0, 0], [0, 0, 0], 1, false));
    model.anim.push((t, dt, kart, sr) => {
      orbs.forEach((o, i) => {
        const a = t * (1.6 + i * 0.3) + i * 1.6;
        const r = 0.38 + (i % 2) * 0.12;
        o.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * 0.2, Math.sin(a) * r);
      });
      core.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      gl.scale.setScalar(1.5 + Math.sin(t * 4) * 0.15);
      stars.rotation.y = t * 0.4;
      leonard.rotation.x = 0.1 + Math.sin(t * 7) * 0.04 * (0.3 + sr);
    });

    // Starscourge: hulking lion-plate armour, lion greathelm, blazing red mane, twin curved greatswords
    const armor = mat(0xffffff, {
      metal: 0.65,
      rough: 0.5,
      map: grainTex(0x6e3c22, 0x2a140a, 'metal'),
    });
    const helmMat = mat(0xffffff, {
      metal: 0.7,
      rough: 0.38,
      map: grainTex(0xa67c3c, 0x4a3010, 'metal'),
    });
    const helmShell = mat(0xffffff, {
      metal: 0.7,
      rough: 0.38,
      side: THREE.DoubleSide,
      map: grainTex(0xa67c3c, 0x4a3010, 'metal'),
    });
    const maneMat = mat(0xc8321c, { rough: 0.7, emissive: 0x5a0a00, ei: 0.35 });
    buildDriver(model, {
      torsoMat: armor,
      sleeveMat: armor,
      legMat: armor,
      bootMat: armor,
      pauldron: helmMat,
      pauldronSize: 1.35,
      glove: 0x3a2412,
      gloveMetal: 0.5,
      scale: 1.3,
      torsoScale: [1.15, 1, 1.1],
      armThick: 1.7,
      faceMat: mat(0x140a06, { rough: 0.9 }),
      eyeColor: 0xffc070,
      eyeGlow: 0xff8a20,
      head(h, u) {
        addHood(
          h,
          0.172,
          helmShell,
          mat(0x0a0503, { rough: 1, side: THREE.BackSide }),
          [0, 0.02, 0.01]
        );
        // lion face crowning the helm: brow, muzzle, nose, ears
        u.put(h, u.tor(0.15, 0.022, 6, 20, Math.PI), helmMat, [0, 0.06, -0.035], [0.25, 0, 0]);
        u.put(h, u.box(0.12, 0.08, 0.1), helmMat, [0, 0.15, -0.12], [0.35, 0, 0]);
        u.put(
          h,
          u.sph(0.035, 8, 6),
          mat(0x2a1a0a, { metal: 0.6, rough: 0.4 }),
          [0, 0.14, -0.175],
          [0, 0, 0],
          1,
          false
        );
        [-1, 1].forEach((s) =>
          u.put(h, u.sph(0.045, 8, 6), helmMat, [s * 0.1, 0.19, -0.02], [0, 0, 0], [1, 1, 0.6])
        );
        // wild red mane radiating around the helm
        for (let i = 0; i < 17; i++) {
          const a = -Math.PI * 0.25 + (i / 16) * Math.PI * 1.5;
          const len = 0.3 + (i % 3) * 0.09;
          u.put(
            h,
            u.cone(0.06, len, 5),
            maneMat,
            [Math.cos(a) * (0.13 + len / 2), 0.04 + Math.sin(a) * (0.13 + len / 2), 0.08],
            [0.35, 0, a - Math.PI / 2],
            1,
            false
          );
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 5 - 0.5) * 1.6;
          u.put(
            h,
            u.cone(0.07, 0.5, 5),
            maneMat,
            [Math.sin(a) * 0.1, 0.02, 0.2],
            [Math.PI / 2 - 0.3, 0, -a * 0.4],
            1,
            false
          );
        }
      },
      torsoExtra(t) {
        const bladeGeo = cachedGeo('starscourge-blade', () =>
          smoothShape(
            [
              [0, 0],
              [0.07, 0.3],
              [0.1, 0.7],
              [0.06, 1.05],
              [-0.06, 1.2],
              [-0.02, 0.8],
              [-0.04, 0.35],
              [-0.05, 0],
            ],
            0.025,
            0.01
          )
        );
        const bladeMat = mat(0x4c4a50, { metal: 0.85, rough: 0.3 });
        [-1, 1].forEach((s) => {
          const sword = new THREE.Group();
          sword.position.set(s * 0.08, 0.05, 0.2);
          sword.rotation.set(0.15, 0, s * 0.55);
          t.add(sword);
          put(sword, bladeGeo, bladeMat, [0, 0.12, 0], [0, 0, 0], [s, 1, 1]);
          put(sword, box(0.26, 0.04, 0.06), helmMat, [0, 0.1, 0]);
          put(sword, cyl(0.025, 0.025, 0.24, 6), mat(0x2a1a0a, { rough: 0.7 }), [0, -0.03, 0]);
        });
      },
    });
    addRibbon(
      model,
      0.7,
      1.0,
      mat(0xffffff, { rough: 0.85, side: THREE.DoubleSide, map: clothTex(0x7a1c12, 0x4a0e08) }),
      [0, 1.26, 0.7],
      0.04
    );
  },

  melina(model, c) {
    const wood = mat(0xffffff, { rough: 0.7, map: grainTex(0x7a4a22, 0x2a1508) });
    const brass = mat(0xffffff, { metal: 0.6, rough: 0.35, map: filigreeTex(0xd09a3a, 0x5a3608) });
    const tubMat = mat(0xffffff, { rough: 0.7, map: filigreeTex(0xd97b29, 0x4a2a12) });
    buildBase(model, {
      id: c.id,
      gold: brass,
      tubMat,
      flame: 0xffb040,
      rim: wood,
      hub: brass,
      spokes: 8,
    });
    const { body } = model;
    [-1, 1].forEach((s) =>
      put(
        body,
        tor(0.62, 0.035, 6, 24, Math.PI),
        brass,
        [s * 0.5, 0.62, 0.35],
        [0, Math.PI / 2, 0],
        [1, 1.1, 1]
      )
    );
    put(body, cyl(0.03, 0.03, 1.1, 6), brass, [0, 1.3, 0.35], [0, 0, Math.PI / 2]);
    const emberMat = mat(0xffb040, { emissive: 0xff8a20, ei: 2 });
    [-0.45, 0.45].forEach((x) => {
      put(body, cyl(0.012, 0.012, 0.25, 4), brass, [x, 1.2, 0.35], [0, 0, 0], 1, false);
      put(body, cyl(0.1, 0.08, 0.2, 8), emberMat, [x, 1.0, 0.35], [0, 0, 0], 1, false);
      put(body, cone(0.12, 0.08, 8), brass, [x, 1.13, 0.35], [0, 0, 0], 1, false);
      const g = glowSprite(0xff9a30, 0.9, 0.6);
      g.position.set(x, 1.0, 0.35);
      body.add(g);
    });
    const brazier = new THREE.Group();
    brazier.position.set(0, 0.62, 0.95);
    body.add(brazier);
    put(brazier, cyl(0.2, 0.1, 0.16, 12), brass, [0, 0, 0]);
    put(brazier, tor(0.2, 0.025, 6, 16), brass, [0, 0.08, 0], [Math.PI / 2, 0, 0]);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffc040,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    model.owned.push(flameMat);
    const flames = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(cone(0.11 - i * 0.015, 0.5 + (i % 2) * 0.15, 8), flameMat);
      f.position.set(Math.cos(i * 1.6) * 0.06, 0.32, Math.sin(i * 1.6) * 0.06);
      brazier.add(f);
      flames.push(f);
    }
    const fg = glowSprite(0xffaa40, 1.5, 0.75);
    fg.position.y = 0.4;
    brazier.add(fg);
    const embers = [];
    for (let i = 0; i < 8; i++) {
      const e = new THREE.Mesh(
        sph(0.018, 6, 4),
        new THREE.MeshBasicMaterial({
          color: 0xffcc60,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      model.owned.push(e.material);
      brazier.add(e);
      embers.push(e);
    }
    model.anim.push((t) => {
      flames.forEach((f, i) => {
        f.scale.set(1 + Math.sin(t * 11 + i * 2) * 0.12, 1 + Math.sin(t * 8 + i * 1.3) * 0.2, 1);
        f.rotation.z = Math.sin(t * 6 + i) * 0.1;
      });
      fg.scale.setScalar(1.5 + Math.sin(t * 9) * 0.15);
      embers.forEach((e, i) => {
        const k = (t * 0.6 + i / embers.length) % 1;
        e.position.set(
          Math.sin(i * 3 + t) * 0.15 * k,
          0.4 + k * 0.9,
          Math.cos(i * 2 + t) * 0.15 * k
        );
        e.material.opacity = 0.9 * (1 - k);
      });
    });

    // Kindling maiden: grey-brown travelling hood and mantle, dark dress, auburn fringe, left eye sealed by a golden mark
    const cloak = mat(0xffffff, { rough: 0.9, side: THREE.DoubleSide, map: clothTex(0x6e5f4e, 0) });
    const dress = mat(0xffffff, { rough: 0.85, map: clothTex(0x3a2c26, 0x6a4a2a) });
    buildDriver(model, {
      torsoMat: dress,
      sleeveMat: dress,
      legMat: dress,
      robe: dress,
      mantle: cloak,
      glove: 0x3a2418,
      skin: 0xf2d4bc,
      noEyes: true,
      head(h, u) {
        addHood(
          h,
          0.182,
          cloak,
          mat(0x100c0a, { rough: 1, side: THREE.BackSide }),
          [0, 0.025, 0.02]
        );
        const hair = mat(0x7a3418, { rough: 0.7 });
        u.put(h, u.sph(0.148, 16, 10), hair, [0, 0.035, 0.02]);
        u.put(h, u.box(0.17, 0.045, 0.04), hair, [0, 0.075, -0.115], [0.35, 0, 0]);
        [-1, 1].forEach((s) =>
          u.put(h, u.box(0.045, 0.2, 0.06), hair, [s * 0.105, -0.05, -0.06], [0, 0, s * 0.08])
        );
        u.put(
          h,
          u.sph(0.02, 8, 6),
          mat(0x9a5a20, { rough: 0.3, emissive: 0x6a3008, ei: 0.4 }),
          [0.048, 0.012, -0.123],
          [0, 0, 0],
          1,
          false
        );
        u.put(
          h,
          u.box(0.042, 0.006, 0.01),
          mat(0x3a2018, { rough: 0.8 }),
          [-0.048, 0.012, -0.132],
          [0, 0, 0],
          1,
          false
        );
        u.put(
          h,
          u.box(0.008, 0.075, 0.008),
          mat(0xffd070, { emissive: 0xffa030, ei: 1.4 }),
          [-0.048, 0.012, -0.136],
          [0, 0, 0],
          1,
          false
        );
      },
    });
    addRibbon(model, 0.5, 0.9, cloak, [0, 1.12, 0.56], 0.03);
  },

  blaidd(model, c) {
    const steel = mat(0xffffff, {
      metal: 0.7,
      rough: 0.35,
      map: grainTex(0x6b7b8c, 0x2c3540, 'metal'),
    });
    const ivory = mat(0xe8e4dc, { rough: 0.45, metal: 0.2 });
    const fur = mat(0x8a939c, { rough: 0.95 });
    const tub = mat(0xffffff, { metal: 0.4, rough: 0.6, map: filigreeTex(0x56667a, 0x2a3440) });
    buildBase(model, {
      id: c.id,
      gold: steel,
      tubMat: tub,
      flame: 0x90c0ff,
      rim: ivory,
      hub: steel,
      seatMat: mat(0x3a3f47, { rough: 0.9 }),
    });
    const { body } = model;
    const wolf = new THREE.Group();
    wolf.position.set(0, 0.5, -1.15);
    body.add(wolf);
    put(wolf, capsule(0.19, 0.3), fur, [0, 0, 0.05], [Math.PI / 2, 0, 0], [1.3, 1, 0.9]);
    put(wolf, cone(0.16, 0.5, 8), fur, [0, -0.03, -0.32], [-Math.PI / 2, 0, 0], [1, 1, 0.7]);
    put(
      wolf,
      sph(0.045, 8, 6),
      mat(0x101010, { rough: 0.3 }),
      [0, 0.02, -0.6],
      [0, 0, 0],
      1,
      false
    );
    [-0.08, 0.08].forEach((x) => {
      put(wolf, cone(0.11, 0.3, 4), fur, [x * 2.4, 0.26, 0.1], [0.1, 0, -x * 4]);
      put(wolf, cone(0.02, 0.08, 4), ivory, [x, -0.1, -0.48], [Math.PI, 0, 0], 1, false);
      put(
        wolf,
        sph(0.035, 8, 6),
        mat(0xffc040, { emissive: 0xffa010, ei: 1.8 }),
        [x * 1.6, 0.09, -0.24],
        [0, 0, 0],
        1,
        false
      );
    });
    put(wolf, box(0.16, 0.03, 0.3), mat(0x5a2020, { rough: 0.8 }), [0, -0.09, -0.4]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI - Math.PI / 2;
      put(
        wolf,
        cone(0.05, 0.22, 4),
        fur,
        [Math.sin(a) * 0.25, Math.cos(a) * 0.1 - 0.05, 0.28],
        [Math.PI / 2 + 0.3, 0, -Math.sin(a) * 0.5]
      );
    }
    model.anim.push((t) => {
      wolf.rotation.x = Math.sin(t * 1.8) * 0.02;
    });
    [-1, 1].forEach((s) =>
      put(body, box(0.1, 0.34, 0.9), steel, [s * 0.66, 0.58, 0.1], [0, 0, s * 0.1])
    );
    const tail = makeRibbon(0.22, 0.7, fur);
    tail.position.set(0, 0.62, 0.98);
    tail.rotation.x = -1.2;
    body.add(tail);
    model.ribbons.push({ mesh: tail, sway: 0.05 });

    // Half-wolf: blue-grey fur, long muzzle, tall ears, amber eyes, dark steel plate and a cold greatsword
    const wolfFur = mat(0x7d8898, { rough: 0.95 });
    const darkFur = mat(0x4e5764, { rough: 0.95 });
    const plate = mat(0xffffff, {
      metal: 0.7,
      rough: 0.4,
      map: grainTex(0x4e5866, 0x262c34, 'metal'),
    });
    buildDriver(model, {
      torsoMat: plate,
      sleeveMat: plate,
      legMat: plate,
      pauldron: plate,
      pauldronSize: 1.2,
      glove: 0x2a2f36,
      gloveMetal: 0.4,
      bootMat: mat(0x2a2f36, { metal: 0.5, rough: 0.5 }),
      neckMat: wolfFur,
      scale: 1.12,
      noFace: true,
      noEyes: true,
      head(h, u) {
        u.put(h, u.sph(0.15, 18, 14), wolfFur, [0, 0.02, 0.02], [0, 0, 0], [1, 0.95, 1.1]);
        u.put(
          h,
          cachedGeo('wolf-snout', () => {
            const g = new THREE.CylinderGeometry(0.035, 0.085, 0.24, 10);
            g.rotateX(-Math.PI / 2);
            return g;
          }),
          wolfFur,
          [0, -0.03, -0.2]
        );
        u.put(h, u.sph(0.032, 8, 6), mat(0x0c0c0e, { rough: 0.3 }), [0, -0.012, -0.325]);
        u.put(h, u.box(0.08, 0.028, 0.17), darkFur, [0, -0.085, -0.19], [-0.12, 0, 0]);
        [-1, 1].forEach((s) => {
          u.put(
            h,
            u.cone(0.012, 0.045, 4),
            mat(0xf2eee4, { rough: 0.4 }),
            [s * 0.025, -0.07, -0.27],
            [Math.PI, 0, 0],
            1,
            false
          );
          u.put(
            h,
            u.sph(0.019, 8, 6),
            mat(0xffc040, { emissive: 0xffa010, ei: 1.3 }),
            [s * 0.058, 0.03, -0.125],
            [0, 0, 0],
            1,
            false
          );
          u.put(
            h,
            u.cone(0.055, 0.17, 4),
            wolfFur,
            [s * 0.085, 0.17, 0.04],
            [0.05, 0, -s * 0.25],
            [1, 1, 0.6]
          );
        });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          u.put(
            h,
            u.cone(0.05, 0.2, 4),
            darkFur,
            [Math.sin(a) * 0.14, -0.14, Math.cos(a) * 0.12 + 0.03],
            [Math.PI + Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5],
            1,
            false
          );
        }
      },
      torsoExtra(t) {
        put(
          t,
          box(0.07, 0.95, 0.03),
          mat(0xc6d2de, { metal: 0.9, rough: 0.2, emissive: 0x3a6a9a, ei: 0.25 }),
          [0.12, 0.5, 0.2],
          [0.1, 0, 0.5]
        );
        put(t, box(0.22, 0.04, 0.05), steel, [0.0, 0.12, 0.2], [0.1, 0, 0.5]);
      },
    });
    addRibbon(
      model,
      0.52,
      0.85,
      mat(0xffffff, { rough: 0.9, side: THREE.DoubleSide, map: clothTex(0x343c4a, 0x1c222c) }),
      [0, 1.18, 0.6],
      0.02
    );
  },

  patches(model, c) {
    const woodA = mat(0xffffff, { rough: 0.9, map: grainTex(0x6a5a34, 0x2a2010) });
    const woodB = mat(0xffffff, { rough: 0.9, map: grainTex(0x4c7a34, 0x1c3010) });
    const woodC = mat(0xffffff, { rough: 0.9, map: grainTex(0x8a4a2a, 0x2a1408) });
    const rust = mat(0x8a6a3a, { metal: 0.5, rough: 0.7 });
    const cloth = mat(0xffffff, {
      rough: 0.95,
      map: clothTex(0x6a8a3a, 0xe2c275),
      side: THREE.DoubleSide,
    });
    const wheelSpecs = [
      { x: -0.7, z: -0.72, r: 0.3, front: true, wobble: 0.05 },
      { x: 0.7, z: -0.72, r: 0.33, front: true, wobble: 0.03 },
      { x: -0.74, z: 0.72, r: 0.36, wobble: 0.04 },
      { x: 0.74, z: 0.72, r: 0.31, wobble: 0.06, dy: 0.03 },
    ];
    buildBase(model, {
      id: c.id,
      gold: rust,
      tubMat: woodA,
      flame: 0xffaa40,
      rim: woodC,
      hub: rust,
      wheelSpecs,
      spokes: 4,
      wheelRim: [woodC, woodA, woodB, woodC],
    });
    const { body } = model;
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 1 : -1;
      put(
        body,
        box(0.09, 0.32, 0.4 + (i % 3) * 0.12),
        [woodA, woodB, woodC][i % 3],
        [s * 0.66, 0.58, -0.5 + i * 0.28],
        [0, (i - 3) * 0.02, s * 0.06 * (i % 3)]
      );
    }
    put(body, box(0.5, 0.06, 0.1), rust, [-0.35, 0.72, -0.7], [0, 0.1, 0.4]);
    put(body, box(1.2, 0.35, 0.08), woodC, [0, 0.62, 1.0], [0.1, 0.03, 0]);
    const lid = new THREE.Group();
    lid.position.set(0, 0.6, -1.12);
    lid.rotation.set(-0.35, 0.1, 0.08);
    body.add(lid);
    put(
      lid,
      cyl(0.36, 0.36, 0.035, 20),
      mat(0x8a8a84, { metal: 0.5, rough: 0.55 }),
      [0, 0, 0],
      [Math.PI / 2, 0, 0]
    );
    put(lid, sph(0.08, 10, 8), rust, [0, 0, -0.04], [0, 0, 0], [1, 1, 0.6]);
    put(lid, tor(0.34, 0.02, 6, 24), rust, [0, 0, 0]);
    put(
      body,
      sph(0.3, 12, 10),
      mat(0x8a7040, { rough: 0.95 }),
      [0.3, 0.85, 0.85],
      [0, 0, 0],
      [1, 1.1, 1]
    );
    put(body, cone(0.09, 0.14, 6), mat(0x8a7040, { rough: 0.95 }), [0.3, 1.2, 0.85]);
    put(
      body,
      sph(0.09, 8, 6),
      mat(0xffd070, { metal: 0.9, rough: 0.2, emissive: 0x805010, ei: 0.4 }),
      [0.12, 1.04, 0.82],
      [0, 0, 0],
      1,
      false
    );
    put(
      body,
      sph(0.07, 8, 6),
      mat(0xffd070, { metal: 0.9, rough: 0.2, emissive: 0x805010, ei: 0.4 }),
      [0.5, 1.02, 0.98],
      [0, 0, 0],
      1,
      false
    );
    const flag = makeRibbon(0.3, 0.42, cloth, 4);
    flag.position.set(-0.55, 1.5, 0.7);
    put(body, cyl(0.015, 0.015, 0.95, 5), rust, [-0.55, 1.03, 0.7], [0, 0, 0], 1, false);
    body.add(flag);
    model.ribbons.push({ mesh: flag, sway: 0.03 });
    // Patches' spear racked upright beside the sack
    const spear = new THREE.Group();
    spear.position.set(0.66, 0.5, 0.45);
    spear.rotation.x = 0.28;
    body.add(spear);
    put(spear, cyl(0.02, 0.022, 1.5, 6), woodC, [0, 0.75, 0]);
    put(
      spear,
      octa(0.09),
      mat(0xb0aca0, { metal: 0.8, rough: 0.35 }),
      [0, 1.6, 0],
      [0, 0, 0],
      [0.45, 1.9, 0.18]
    );
    put(spear, tor(0.03, 0.01, 5, 10), rust, [0, 1.47, 0], [Math.PI / 2, 0, 0], 1, false);
    model.anim.push((t, dt, kart, sr) => {
      const j = 0.008 + sr * 0.012;
      model.body.rotation.z += Math.sin(t * 23) * j;
      model.body.rotation.x += Math.sin(t * 19 + 1) * j * 0.6;
    });

    // Untethered rogue: shiny bald head, bushy scheming brows, bulbous nose, crooked grin, scruffy leathers
    const skinM = mat(0xdca27a, { rough: 0.45 });
    const leather = mat(0xffffff, { rough: 0.85, map: grainTex(0x5a4228, 0x2a1c10, 'metal') });
    buildDriver(model, {
      torsoMat: mat(0xffffff, { rough: 0.9, map: clothTex(0x4c6a30, 0x2a3a1a) }),
      sleeveMat: leather,
      legMat: leather,
      beltMat: mat(0x3a2412, { rough: 0.7 }),
      pauldron: leather,
      pauldronSize: 0.85,
      glove: 0x4a3018,
      skin: 0xdca27a,
      faceMat: skinM,
      eyeColor: 0x1a1008,
      scale: 0.95,
      torsoScale: [1.2, 0.95, 1.2],
      headScale: [0.95, 1.02, 1],
      head(h, u) {
        const brow = mat(0x2a1a0e, { rough: 0.9 });
        [-1, 1].forEach((s) => {
          u.put(
            h,
            u.box(0.065, 0.02, 0.025),
            brow,
            [s * 0.05, 0.05, -0.125],
            [0, 0, s * 0.35],
            1,
            false
          );
          u.put(h, u.sph(0.04, 8, 6), skinM, [s * 0.14, 0, 0], [0, 0, 0], [0.55, 1, 0.8]);
        });
        u.put(
          h,
          u.sph(0.036, 10, 8),
          mat(0xd08868, { rough: 0.5 }),
          [0, -0.012, -0.148],
          [0, 0, 0],
          [0.85, 1, 1.2],
          false
        );
        u.put(
          h,
          u.box(0.1, 0.018, 0.02),
          mat(0xf0e6cc, { rough: 0.4 }),
          [0.008, -0.068, -0.13],
          [0, 0, -0.12],
          1,
          false
        );
        u.put(
          h,
          u.box(0.11, 0.012, 0.02),
          mat(0x4a1a10, { rough: 0.6 }),
          [0.008, -0.056, -0.132],
          [0, 0, -0.12],
          1,
          false
        );
        u.put(h, u.cone(0.03, 0.06, 6), brow, [0, -0.13, -0.08], [Math.PI + 0.4, 0, 0], 1, false);
      },
      torsoExtra(t) {
        [-1, 1].forEach((s) =>
          put(t, box(0.08, 0.1, 0.06), leather, [s * 0.13, 0.06, -0.12], [0, 0, 0], 1, false)
        );
      },
    });
  },

  godrick(model, c) {
    const gold = mat(0xffffff, { metal: 0.65, rough: 0.3, map: filigreeTex(0xd4af37, 0x5a3f08) });
    const purple = mat(0xffffff, { metal: 0.25, rough: 0.6, map: filigreeTex(0x8c2f6b, 0xd4af37) });
    const flesh = mat(0xd8b8a0, { rough: 0.7 });
    const wheelSpecs = [
      { x: -0.72, z: -0.72, r: 0.34, front: true },
      { x: 0.7, z: -0.72, r: 0.27, front: true },
      { x: -0.76, z: 0.72, r: 0.32 },
      { x: 0.74, z: 0.72, r: 0.4 },
    ];
    buildBase(model, {
      id: c.id,
      gold,
      tubMat: purple,
      flame: 0xffcc50,
      rim: gold,
      hub: gold,
      wheelSpecs,
      wheelRim: [gold, mat(0x5a1a48, { metal: 0.4, rough: 0.5 }), purple, gold],
      spokes: 7,
    });
    const { body } = model;
    const grafts = [];
    const limbMat = [
      flesh,
      mat(0xb89078, { rough: 0.7 }),
      mat(0xe8d0bc, { rough: 0.7 }),
      mat(0xa88870, { rough: 0.7 }),
    ];
    [
      [-0.66, 0.5, -0.3, -1],
      [0.66, 0.55, 0.3, 1],
      [-0.64, 0.6, 0.72, -1],
      [0.62, 0.5, -0.65, 1],
    ].forEach(([x, y, z, s], i) => {
      const arm = new THREE.Group();
      arm.position.set(x, y, z);
      const len = 0.35 + (i % 3) * 0.12;
      put(
        arm,
        capsule(0.06 + (i % 2) * 0.03, len),
        limbMat[i],
        [s * 0.1, len / 2 + 0.05, 0],
        [0, 0, -s * 0.5]
      );
      put(arm, sph(0.08 + (i % 2) * 0.02, 8, 6), limbMat[i], [s * 0.35, len + 0.15, 0]);
      for (let f = 0; f < 4; f++)
        put(
          arm,
          capsule(0.015, 0.07),
          limbMat[i],
          [s * 0.35 + (f - 1.5) * 0.03, len + 0.24, 0],
          [0, 0, (f - 1.5) * 0.25],
          1,
          false
        );
      body.add(arm);
      grafts.push({ arm, s, i, base: -s * 0.1 });
    });
    const dragon = new THREE.Group();
    dragon.position.set(0, 0.5, -1.12);
    body.add(dragon);
    const scale = mat(0x3a7a4a, { rough: 0.55, metal: 0.2 });
    put(dragon, cone(0.17, 0.55, 8), scale, [0, 0.05, -0.15], [-Math.PI / 2, 0, 0], [1.2, 1, 0.8]);
    put(dragon, sph(0.2, 12, 10), scale, [0, 0.08, 0.1], [0, 0, 0], [1.1, 0.9, 1]);
    [-1, 1].forEach((s) => {
      put(
        dragon,
        cone(0.035, 0.22, 4),
        mat(0xe8d8a0, { rough: 0.5 }),
        [s * 0.12, 0.28, 0.16],
        [0.6, 0, -s * 0.5]
      );
      put(
        dragon,
        sph(0.03, 6, 6),
        mat(0xffcc30, { emissive: 0xff9a10, ei: 1.6 }),
        [s * 0.1, 0.16, -0.06],
        [0, 0, 0],
        1,
        false
      );
      put(
        dragon,
        cone(0.015, 0.06, 4),
        mat(0xf4f0e0, {}),
        [s * 0.06, -0.06, -0.38],
        [Math.PI, 0, 0],
        1,
        false
      );
    });
    put(body, box(0.9, 0.7, 0.08), gold, [0, 1.0, 0.86], [0.1, 0, 0]);
    for (let i = 0; i < 5; i++)
      put(body, cone(0.06, 0.24, 5), gold, [-0.36 + i * 0.18, 1.45 + (i === 2 ? 0.1 : 0), 0.9]);
    put(
      body,
      sph(0.06, 8, 6),
      mat(0xff3a4a, { emissive: 0xa01020, ei: 1, metal: 0.4, rough: 0.2 }),
      [0, 1.18, 0.82],
      [0, 0, 0],
      1,
      false
    );
    [-1, 1].forEach((s) => put(body, box(0.05, 0.05, 1.3), gold, [s * 0.6, 0.62, 0.15]));

    // The Grafted: ornate gold armour, long pale-gold hair, spiked crown, extra arms sprouting from his back, great axe
    const armor = mat(0xffffff, {
      metal: 0.7,
      rough: 0.32,
      map: grainTex(0xc9a44a, 0x7a5a1c, 'metal'),
    });
    const hair = mat(0xe8d49a, { rough: 0.6, side: THREE.DoubleSide });
    buildDriver(model, {
      torsoMat: armor,
      sleeveMat: armor,
      legMat: armor,
      bootMat: armor,
      robe: mat(0xffffff, { rough: 0.8, map: clothTex(0x6a1a50, 0xd4af37) }),
      pauldron: gold,
      pauldronSize: 1.25,
      glove: 0xc9a44a,
      gloveMetal: 0.7,
      skin: 0xd8c0a8,
      eyeColor: 0x3a2a18,
      scale: 1.15,
      torsoScale: [1.15, 1, 1],
      head(h, u) {
        u.put(h, u.sph(0.15, 16, 12), hair, [0, 0.035, 0.035], [0, 0, 0], [1, 1, 1.05]);
        [-1, 1].forEach((s) => {
          u.put(h, u.box(0.05, 0.3, 0.1), hair, [s * 0.125, -0.1, 0.0]);
          u.put(
            h,
            u.box(0.06, 0.018, 0.022),
            mat(0x8a7040, { rough: 0.8 }),
            [s * 0.05, 0.05, -0.124],
            [0, 0, -s * 0.25],
            1,
            false
          );
        });
        u.put(h, u.cyl(0.152, 0.158, 0.07, 18), model.matGold(), [0, 0.1, 0.01]);
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI * 0.55 + (i / 8) * Math.PI * 1.1;
          const tall = i === 4 ? 0.2 : 0.1 + (1 - Math.abs(i - 4) / 4) * 0.06;
          u.put(
            h,
            u.cone(0.025, tall, 4),
            model.matGold(),
            [Math.sin(a) * 0.15, 0.135 + tall / 2, -Math.cos(a) * 0.15 + 0.01],
            [0, 0, 0],
            1,
            false
          );
        }
        u.put(
          h,
          u.octa(0.028),
          mat(0xff3a4a, { emissive: 0xa01020, ei: 1.2, metal: 0.4, rough: 0.2 }),
          [0, 0.1, -0.155],
          [0, 0, 0],
          1,
          false
        );
      },
      torsoExtra(t) {
        // grafted arms bursting from the back and shoulders
        [
          [-0.16, 0.42, -1, 0.9],
          [0.16, 0.42, 1, 0.9],
          [-0.1, 0.25, -1, 0.3],
          [0.12, 0.3, 1, 0.45],
        ].forEach(([x, y, s, up], i) => {
          const arm = new THREE.Group();
          arm.position.set(x, y, 0.12);
          t.add(arm);
          const len = 0.3 + (i % 2) * 0.1;
          put(
            arm,
            capsule(0.045, len),
            limbMat[i],
            [s * 0.12, len / 2, 0.06],
            [0.5, 0, -s * up],
            1
          );
          put(
            arm,
            sph(0.06, 8, 6),
            limbMat[i],
            [s * (0.12 + Math.sin(up) * len * 0.55), Math.cos(up) * len * 0.9 + 0.05, 0.14],
            [0, 0, 0],
            1,
            false
          );
          grafts.push({ arm, s, i: i + 4, base: 0 });
        });
        // Axe of Godrick on the back
        put(
          t,
          cyl(0.025, 0.025, 1.0, 6),
          mat(0x3a2a1a, { rough: 0.7 }),
          [-0.12, 0.35, 0.2],
          [0.1, 0, -0.45]
        );
        put(
          t,
          cachedGeo('godrick-axe', () =>
            smoothShape(
              [
                [0, -0.2],
                [0.2, -0.25],
                [0.3, 0],
                [0.2, 0.25],
                [0, 0.2],
              ],
              0.03,
              0.01
            )
          ),
          gold,
          [-0.37, 0.82, 0.24],
          [0.1, 0, -0.45]
        );
      },
    });
    model.anim.push((t) => {
      grafts.forEach(({ arm, i, base }) => {
        arm.rotation.z = base + Math.sin(t * (2 + i * 0.4) + i) * 0.14;
        arm.rotation.x = Math.sin(t * 1.7 + i) * 0.08;
      });
      dragon.rotation.y = Math.sin(t * 1.4) * 0.12;
    });
    [-1, 0, 1].forEach((k) =>
      addRibbon(model, 0.2, 0.75 - Math.abs(k) * 0.12, hair, [k * 0.1, 1.45, 0.48], 0.02, k * 0.45)
    );
    addRibbon(
      model,
      0.62,
      1.05,
      mat(0xffffff, { rough: 0.8, side: THREE.DoubleSide, map: clothTex(0x6a1a50, 0xd4af37) }),
      [0, 1.2, 0.62],
      0.04
    );
  },
};

// ---------------------------------------------------------------------------------------------

export class KartModel {
  constructor(character) {
    this.character = character;
    this.group = new THREE.Group();
    this.group.name = `kart-${character.id}`;
    this.spinNode = new THREE.Group();
    this.body = new THREE.Group();
    this.spinNode.add(this.body);
    this.group.add(this.spinNode);
    this.owned = []; // per-instance materials/geometries freed in dispose()
    this.anim = [];
    this.ribbons = [];
    this.time = Math.random() * 10;
    this.steer = 0;
    this.prevSpeed = 0;
    this.pitch = 0;
    this.spinAngle = 0;
    this.driftYaw = 0;
    this.lean = 0;
    this.driverLean = 0;
    this.wheelPhase = 0;

    const gold = mat(0xffffff, { metal: 0.6, rough: 0.35, map: filigreeTex(0xd4af37, 0x5a3f08) });
    this.matGold = () => gold;

    (CHARACTER_BUILDERS[character.id] ?? CHARACTER_BUILDERS.tarnished)(this, character);
    this._buildEffects();
    this._mergeStatic();
    this.group.traverse((o) => {
      if (o.isMesh) o.frustumCulled = true;
    });
    this.update(0, null);
  }

  // Merges every mesh the animation code never moves into one mesh per parent and material,
  // so a kart costs a few dozen draw calls instead of a few hundred.
  _mergeStatic() {
    const meshes = [];
    this.group.traverse((o) => {
      if (o.isMesh && !o.userData.ribbon) meshes.push(o);
    });
    const snap = (m) => [
      ...m.position.toArray(),
      ...m.quaternion.toArray(),
      ...m.scale.toArray(),
      m.visible ? 1 : 0,
    ];
    const before = meshes.map(snap);
    const dynamic = new Set();
    const saved = {
      time: this.time,
      steer: this.steer,
      pitch: this.pitch,
      prevSpeed: this.prevSpeed,
    };
    const probe = {
      speed: 0,
      inputs: { steer: 0 },
      drift: { active: false, dir: 0, level: 0 },
      boostTimer: 0,
      boostPower: 1,
      spinTimer: 0,
      invincibleTimer: 0,
      shielded: false,
      airborne: false,
    };
    for (let i = 0; i < 48; i++) {
      probe.speed = (i % 12) * 5;
      probe.inputs.steer = Math.sin(i * 0.7);
      probe.drift.active = i % 8 < 4;
      probe.drift.dir = i % 16 < 8 ? 1 : -1;
      probe.boostTimer = i % 6 < 3 ? 1 : 0;
      probe.boostPower = i % 12 < 6 ? 1 : 1.6;
      probe.spinTimer = i >= 20 && i < 26 ? 1 : 0;
      probe.invincibleTimer = i >= 30 && i < 36 ? (i % 2 ? 3 : 0.5) : 0;
      probe.shielded = i >= 36 && i < 42;
      probe.airborne = i % 10 === 5;
      this.update(1 / 30, probe);
      meshes.forEach((m, k) => {
        if (dynamic.has(m)) return;
        const s = snap(m);
        if (s.some((v, j) => Math.abs(v - before[k][j]) > 1e-6)) dynamic.add(m);
      });
    }
    Object.assign(this, saved, { spinAngle: 0, driftYaw: 0, lean: 0, driverLean: 0 });
    this.spinNode.rotation.y = 0;
    this.spinNode.position.y = 0;

    const groups = new Map();
    for (const m of meshes) {
      if (dynamic.has(m) || !m.parent) continue;
      const key = m.parent.uuid + '|' + m.material.uuid + '|' + m.castShadow + '|' + m.renderOrder;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const parent = list[0].parent;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        }
        if (!g.attributes.uv) {
          g.setAttribute(
            'uv',
            new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)
          );
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(m.matrix);
        if (m.matrix.determinant() < 0) flipWinding(g);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      mesh.renderOrder = list[0].renderOrder;
      for (const m of list) parent.remove(m);
      parent.add(mesh);
      this.owned.push(merged);
    }
    // Details smaller than a few shadow-map texels cast no visible shadow; skip them in the shadow pass.
    this.group.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = Math.max(o.scale.x, o.scale.y, o.scale.z);
      if (o.geometry.boundingSphere.radius * s < 0.09) o.castShadow = false;
    });
  }

  _buildEffects() {
    // invincibility gold aura
    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0xffd45a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.aura = new THREE.Mesh(
      cachedGeo('aura', () => new THREE.SphereGeometry(1, 20, 14)),
      this.auraMat
    );
    this.aura.scale.set(1.15, 0.95, 1.7);
    this.aura.position.set(0, 0.85, 0);
    this.aura.visible = false;
    this.body.add(this.aura);
    this.owned.push(this.auraMat);

    // Stonesword-key shield: orbiting gold blades and a glowing ring
    this.shield = new THREE.Group();
    this.shield.position.y = 0.75;
    this.shield.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.owned.push(ringMat);
    const ring = new THREE.Mesh(
      cachedGeo('shield-ring', () => new THREE.TorusGeometry(1.35, 0.03, 6, 48)),
      ringMat
    );
    ring.rotation.x = Math.PI / 2;
    this.shield.add(ring);
    const bladeMat = mat(0xffe08a, { metal: 0.9, rough: 0.2, emissive: 0xffc040, ei: 1.2 });
    this.shieldBlades = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(
        cachedGeo('shield-blade', () =>
          new THREE.OctahedronGeometry(0.14, 0).scale(0.35, 1.6, 0.35)
        ),
        bladeMat
      );
      this.shield.add(b);
      this.shieldBlades.push(b);
    }
    this.body.add(this.shield);
  }

  update(dt, kart) {
    this.time += dt;
    const t = this.time;
    const speed = kart ? (kart.speed ?? 0) : 0;
    const top = 42;
    const sr = Math.min(1, Math.abs(speed) / top);
    const steerIn = kart?.inputs?.steer ?? 0;
    const k = Math.min(1, dt * 12);
    this.steer += (steerIn - this.steer) * k;

    // suspension: bob and squat/dive from acceleration
    const accel = dt > 0 ? (speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = speed;
    this.pitch +=
      (Math.max(-0.08, Math.min(0.08, accel * 0.0025)) - this.pitch) * Math.min(1, dt * 6);
    const bob = Math.sin(t * (7 + speed * 0.35)) * 0.012 * sr + Math.sin(t * 2.3) * 0.004;

    const drift = kart?.drift;
    const driftDir = drift?.active ? drift.dir || Math.sign(steerIn) || 1 : 0;
    this.driftYaw += (driftDir * -0.32 - this.driftYaw) * Math.min(1, dt * 8);
    this.lean += (this.steer * 0.05 * sr + driftDir * 0.09 - this.lean) * Math.min(1, dt * 8);
    this.driverLean +=
      (-this.steer * 0.16 * sr - driftDir * 0.22 - this.driverLean) * Math.min(1, dt * 8);

    const body = this.body;
    body.position.y = bob;
    body.rotation.set(this.pitch, this.driftYaw, this.lean);
    if (kart?.airborne) body.rotation.x += 0.1;

    // spin-out animation
    const spinning = (kart?.spinTimer ?? 0) > 0;
    if (spinning) {
      this.spinAngle += dt * 15;
      this.spinNode.position.y =
        Math.sin(Math.min(1, (this.spinAngle % (Math.PI * 2)) / (Math.PI * 2)) * Math.PI) * 0.12;
    } else if (this.spinAngle !== 0) {
      const rem = Math.PI * 2 - (this.spinAngle % (Math.PI * 2));
      this.spinAngle =
        rem < 0.4 || rem > Math.PI * 2 - 0.01 ? 0 : this.spinAngle + Math.min(rem, dt * 15);
      this.spinNode.position.y = 0;
    }
    this.spinNode.rotation.y = this.spinAngle;

    // wheels
    this.wheelPhase -= (speed * dt) / 0.33;
    for (const w of this.wheels) {
      w.spin.rotation.x -= (speed * dt) / w.r;
      if (w.wobble) w.spin.rotation.y = Math.sin(t * 6 + w.side) * w.wobble * (0.3 + sr);
      if (w.front) w.pivot.rotation.y = -this.steer * 0.5;
    }

    // steering wheel + arms
    const sw = this.steerWheel;
    sw.userData.rot.rotation.z = -this.steer * 1.1;
    sw.updateMatrix();
    this.driver.rotation.z = this.driverLean * 0.3;
    this.torso.rotation.z = this.driverLean;
    this.torso.rotation.x = -this.pitch * 2 - sr * 0.08;
    this.head.rotation.y = -this.steer * 0.35;
    this.head.rotation.z = -this.driverLean * 0.4;
    for (const a of this.arms) {
      _v1.set(a.side * 0.17, 0, 0);
      const ang = -this.steer * 1.1;
      _v2.set(_v1.x * Math.cos(ang), _v1.x * Math.sin(ang), 0).applyMatrix4(sw.matrix);
      a.target.copy(_v2);
      const sh = _v3.copy(a.shoulder);
      sh.x += this.driverLean * 0.05;
      a.elbow.addVectors(sh, a.target).multiplyScalar(0.5);
      a.elbow.x += a.side * 0.1 * this.armScale;
      a.elbow.y -= 0.1;
      a.elbow.z += 0.1;
      setLimb(a.upper, sh, a.elbow, a.thick);
      setLimb(a.lower, a.elbow, a.target, a.thick * 0.88);
      a.hand.position.copy(a.target);
    }

    // boost flames
    const boosting = (kart?.boostTimer ?? 0) > 0;
    const power = kart?.boostPower ?? 1;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        const fl = 0.85 + Math.random() * 0.3;
        f.scale.set(fl * (0.8 + power * 0.2), fl * (0.8 + power * 0.2), fl * (0.9 + power * 0.5));
      }
    }
    if (boosting) this.flameMat.color.setHex(power > 1.3 ? 0x60b0ff : this.baseFlame);

    // invincibility: gold aura + blink
    const inv = (kart?.invincibleTimer ?? 0) > 0;
    this.aura.visible = inv;
    if (inv) {
      this.auraMat.opacity = 0.3 + Math.sin(t * 18) * 0.12;
      this.aura.scale.set(1.15, 0.95, 1.7).multiplyScalar(1 + Math.sin(t * 9) * 0.03);
      // strobe only when the timer is running out or after a hit (not a power-up glow)
      this.body.visible = kart.invincibleTimer > 1.2 || Math.sin(t * 40) > -0.3;
    } else {
      this.body.visible = true;
    }

    // shield
    const shielded = !!kart?.shielded;
    this.shield.visible = shielded;
    if (shielded) {
      this.shield.rotation.y = t * 2.2;
      this.shieldBlades.forEach((b, i) => {
        const a = (i / this.shieldBlades.length) * Math.PI * 2;
        b.position.set(Math.cos(a) * 1.35, Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 1.35);
        b.rotation.set(0, -a, Math.PI / 2);
      });
    }

    // per-character animation + ribbons
    for (const fn of this.anim) fn(t, dt, kart, sr);
    for (const r of this.ribbons) updateRibbon(r.mesh, t, sr, r.sway * this.steer * 3);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.userData?.ribbon) o.geometry.dispose();
    });
    for (const m of this.owned) m.dispose();
    this.owned.length = 0;
    this.group.removeFromParent();
  }
}
