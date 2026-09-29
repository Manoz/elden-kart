import * as THREE from 'three';
import { bus } from '../core/bus.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// HDR-ish colours (values above 1 feed the bloom pass).
const COL = {
  blue: [0.35, 0.65, 2.4],
  orange: [2.4, 1.15, 0.25],
  purple: [1.9, 0.45, 2.6],
  gold: [2.2, 1.55, 0.45],
  white: [2.2, 2.1, 1.8],
  fire: [2.6, 0.9, 0.15],
  rot: [2.0, 0.55, 0.12],
  ghost: [0.5, 0.9, 2.2],
};
const DRIFT_COL = [null, COL.blue, COL.orange, COL.purple];

function makeGlyphAtlas() {
  const cell = 128;
  const cv = document.createElement('canvas');
  cv.width = cell * 5;
  cv.height = cell;
  const g = cv.getContext('2d');
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  g.lineWidth = 9;
  const line = (i, pts) => {
    g.beginPath();
    pts.forEach(([x, y], k) => {
      const px = i * cell + x * cell;
      const py = y * cell;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.stroke();
  };
  line(0, [
    [0.36, 0.14],
    [0.36, 0.86],
  ]);
  line(0, [
    [0.36, 0.3],
    [0.68, 0.14],
  ]);
  line(0, [
    [0.36, 0.5],
    [0.68, 0.34],
  ]);
  line(1, [
    [0.5, 0.14],
    [0.5, 0.86],
  ]);
  line(1, [
    [0.5, 0.5],
    [0.24, 0.2],
  ]);
  line(1, [
    [0.5, 0.5],
    [0.76, 0.2],
  ]);
  line(2, [
    [0.5, 0.14],
    [0.26, 0.42],
    [0.5, 0.62],
    [0.74, 0.42],
    [0.5, 0.14],
  ]);
  line(2, [
    [0.5, 0.62],
    [0.28, 0.86],
  ]);
  line(2, [
    [0.5, 0.62],
    [0.72, 0.86],
  ]);
  line(3, [
    [0.36, 0.14],
    [0.36, 0.86],
  ]);
  line(3, [
    [0.36, 0.3],
    [0.7, 0.5],
    [0.36, 0.7],
  ]);
  // sparkle
  g.lineWidth = 3;
  const cx = 4 * cell + cell / 2;
  const cy = cell / 2;
  g.beginPath();
  g.moveTo(cx, cy - 58);
  g.lineTo(cx + 6, cy - 6);
  g.lineTo(cx + 58, cy);
  g.lineTo(cx + 6, cy + 6);
  g.lineTo(cx, cy + 58);
  g.lineTo(cx - 6, cy + 6);
  g.lineTo(cx - 58, cy);
  g.lineTo(cx - 6, cy - 6);
  g.closePath();
  g.fill();
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 22);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(cx - 24, cy - 24, 48, 48);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  attribute float aShape;
  attribute float aRot;
  uniform float uScale;
  varying vec4 vColor;
  varying float vShape;
  varying float vRot;
  varying float vNear;
  void main() {
    vColor = aColor;
    vShape = aShape;
    vRot = aRot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vNear = clamp((-mv.z - 2.0) / 6.0, 0.0, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 400.0);
    if (aSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec4 vColor;
  varying float vShape;
  varying float vRot;
  varying float vNear;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a;
    if (vShape < 0.5) {
      float d = length(p) * 2.0;
      a = pow(clamp(1.0 - d, 0.0, 1.0), 1.4);
    } else {
      float c = cos(vRot);
      float s = sin(vRot);
      vec2 uv = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
      float cell = floor(vShape + 0.5) - 1.0;
      a = texture2D(uMap, vec2((uv.x + cell) / 5.0, 1.0 - uv.y)).r;
    }
    gl_FragColor = vec4(vColor.rgb, a * vColor.a * vNear);
    if (gl_FragColor.a < 0.003) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class ParticleSystem {
  constructor(cap, additive, atlas) {
    this.cap = cap;
    this.head = 0;
    this.active = 0;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.shape = new Float32Array(cap);
    this.rot = new Float32Array(cap);
    this.spin = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.c0 = new Float32Array(cap * 4);
    this.c1 = new Float32Array(cap * 4);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);

    const geo = new THREE.BufferGeometry();
    const dyn = (arr, n) => {
      const a = new THREE.BufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('position', dyn(this.pos, 3));
    geo.setAttribute('aColor', dyn(this.col, 4));
    geo.setAttribute('aSize', dyn(this.size, 1));
    geo.setAttribute('aShape', dyn(this.shape, 1));
    geo.setAttribute('aRot', dyn(this.rot, 1));
    this.geometry = geo;
    this.uniforms = { uScale: { value: 600 }, uMap: { value: atlas } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, a0, c1, a1, grav, drag, shape, spin) {
    const i = this.head;
    this.head = (i + 1) % this.cap;
    const i3 = i * 3;
    const i4 = i * 4;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.size[i] = s0;
    this.c0[i4] = c0[0];
    this.c0[i4 + 1] = c0[1];
    this.c0[i4 + 2] = c0[2];
    this.c0[i4 + 3] = a0;
    const e = c1 || c0;
    this.c1[i4] = e[0];
    this.c1[i4 + 1] = e[1];
    this.c1[i4 + 2] = e[2];
    this.c1[i4 + 3] = a1;
    this.col[i4] = c0[0];
    this.col[i4 + 1] = c0[1];
    this.col[i4 + 2] = c0[2];
    this.col[i4 + 3] = a0;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.shape[i] = shape;
    this.rot[i] = shape > 0 ? Math.random() * TAU : 0;
    this.spin[i] = spin;
    this.active++;
  }

  update(dt) {
    if (this.active <= 0) return;
    const { pos, vel, col, size, rot, spin, age, life, s0, s1, c0, c1, grav, drag } = this;
    let alive = 0;
    for (let i = 0; i < this.cap; i++) {
      const l = life[i];
      if (l <= 0) continue;
      const a = age[i] + dt;
      const i4 = i * 4;
      if (a >= l) {
        life[i] = 0;
        size[i] = 0;
        col[i4 + 3] = 0;
        continue;
      }
      alive++;
      age[i] = a;
      const k = a / l;
      const i3 = i * 3;
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= dr;
      vel[i3 + 1] = vel[i3 + 1] * dr - grav[i] * dt;
      vel[i3 + 2] *= dr;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      size[i] = s0[i] + (s1[i] - s0[i]) * k;
      col[i4] = c0[i4] + (c1[i4] - c0[i4]) * k;
      col[i4 + 1] = c0[i4 + 1] + (c1[i4 + 1] - c0[i4 + 1]) * k;
      col[i4 + 2] = c0[i4 + 2] + (c1[i4 + 2] - c0[i4 + 2]) * k;
      const fade = Math.min(1, k * 12);
      col[i4 + 3] = (c0[i4 + 3] + (c1[i4 + 3] - c0[i4 + 3]) * k) * fade;
      rot[i] += spin[i] * dt;
    }
    this.active = alive;
    const g = this.geometry.attributes;
    g.position.needsUpdate = true;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
    g.aRot.needsUpdate = true;
    g.aShape.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.atlas = makeGlyphAtlas();
    this.add = new ParticleSystem(5000, true, this.atlas);
    this.alpha = new ParticleSystem(2500, false, this.atlas);
    scene.add(this.alpha.points, this.add.points);
    this.karts = [];
    this.time = 0;
    this.viewportH = 0;
    this._o = {};
    this._wallCd = new WeakMap();
    this._unsub = [];
    this._bindBus();
  }

  // Optional: drawing-buffer height in pixels; otherwise derived from the window.
  setViewportHeight(px) {
    this.viewportH = px;
  }

  attachKart(kart) {
    if (this.karts.some((e) => e.kart === kart)) return;
    this.karts.push({
      kart,
      dust: 0,
      spark: 0,
      flame: 0,
      aura: 0,
      lastLevel: 0,
      wasSpin: 0,
    });
  }

  detachKart(kart) {
    const i = this.karts.findIndex((e) => e.kart === kart);
    if (i >= 0) this.karts.splice(i, 1);
  }

  emit(name, pos, opts) {
    this._emit(name, pos.x, pos.y, pos.z, opts || this._o);
  }

  _emit(name, x, y, z, o) {
    const A = this.add;
    const B = this.alpha;
    switch (name) {
      case 'dust': {
        const n = o.count || 3;
        const c = o.color || [0.62, 0.52, 0.38];
        const up = o.up ?? 1;
        for (let i = 0; i < n; i++) {
          B.spawn(
            x + rnd(-0.4, 0.4),
            y + 0.1,
            z + rnd(-0.4, 0.4),
            rnd(-1.5, 1.5) + (o.vx || 0),
            rnd(0.8, 2.6) * up,
            rnd(-1.5, 1.5) + (o.vz || 0),
            rnd(0.5, 1.0),
            rnd(0.5, 0.9),
            rnd(1.8, 3.2),
            c,
            rnd(0.25, 0.4),
            c,
            0,
            -0.6,
            1.5,
            0,
            0
          );
        }
        break;
      }
      case 'spark': {
        const n = o.count || 6;
        const c = o.color || COL.orange;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, TAU);
          const s = rnd(4, 12);
          A.spawn(
            x,
            y,
            z,
            Math.cos(a) * s,
            rnd(2, 9),
            Math.sin(a) * s,
            rnd(0.25, 0.55),
            0.35,
            0.04,
            COL.white,
            1,
            c,
            0.6,
            22,
            1.2,
            0,
            0
          );
        }
        break;
      }
      case 'impact': {
        const n = o.count || 10;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, TAU);
          const s = rnd(3, 10) * (o.scale || 1);
          A.spawn(
            x,
            y,
            z,
            Math.cos(a) * s,
            rnd(1, 6),
            Math.sin(a) * s,
            rnd(0.2, 0.45),
            0.4,
            0.05,
            COL.white,
            1,
            COL.orange,
            0.5,
            20,
            1.5,
            0,
            0
          );
        }
        A.spawn(
          x,
          y,
          z,
          0,
          0,
          0,
          0.18,
          1.6 * (o.scale || 1),
          0.2,
          COL.white,
          0.9,
          COL.orange,
          0,
          0,
          0,
          5,
          0
        );
        B.spawn(
          x,
          y,
          z,
          0,
          1,
          0,
          0.6,
          0.8,
          2.2,
          [0.5, 0.45, 0.4],
          0.3,
          [0.5, 0.45, 0.4],
          0,
          -0.4,
          1,
          0,
          0
        );
        break;
      }
      case 'driftSpark': {
        const c = DRIFT_COL[o.level || 1] || COL.blue;
        const n = o.count || 2;
        const dx = o.dx || 0;
        const dz = o.dz || 0;
        for (let i = 0; i < n; i++) {
          A.spawn(
            x,
            y,
            z,
            dx * rnd(2, 6) + rnd(-3, 3),
            rnd(2, 6),
            dz * rnd(2, 6) + rnd(-3, 3),
            rnd(0.25, 0.5),
            0.32,
            0.05,
            COL.white,
            1,
            c,
            0.7,
            14,
            0.8,
            0,
            0
          );
        }
        A.spawn(x, y, z, 0, 0.2, 0, 0.12, 0.7, 0.3, c, 0.7, c, 0, 0, 0, 0, 0);
        break;
      }
      case 'boostFlame': {
        const dx = o.dx ?? 0;
        const dz = o.dz ?? 1;
        const power = o.power || 1;
        const hot = power > 1.25 ? COL.purple : COL.blue;
        const n = o.count || 2;
        for (let i = 0; i < n; i++) {
          const sp = rnd(7, 12) * power;
          A.spawn(
            x,
            y,
            z,
            dx * sp + rnd(-0.6, 0.6),
            rnd(-0.3, 0.6),
            dz * sp + rnd(-0.6, 0.6),
            rnd(0.22, 0.38),
            0.45 * power,
            0.05,
            hot,
            0.6,
            COL.fire,
            0.35,
            0,
            2.5,
            0,
            0
          );
        }
        A.spawn(
          x,
          y,
          z,
          dx * 3,
          0,
          dz * 3,
          0.1,
          0.9,
          0.3,
          COL.white,
          0.8,
          COL.orange,
          0,
          0,
          2,
          0,
          0
        );
        break;
      }
      case 'explosion': {
        const s = o.scale || 1;
        A.spawn(x, y, z, 0, 0, 0, 0.16, 7 * s, 11 * s, COL.white, 1, COL.fire, 0, 0, 0, 0, 0);
        for (let i = 0; i < 26; i++) {
          const a = rnd(0, TAU);
          const e = rnd(-0.3, 1);
          const sp = rnd(2, 9) * s;
          const ch = Math.sqrt(1 - e * e);
          A.spawn(
            x,
            y,
            z,
            Math.cos(a) * sp * ch,
            e * sp * 0.9 + 1,
            Math.sin(a) * sp * ch,
            rnd(0.4, 0.85),
            rnd(1.5, 2.6) * s,
            rnd(3, 5) * s,
            COL.fire,
            1,
            [0.6, 0.08, 0.02],
            0,
            -2,
            2.2,
            0,
            0
          );
        }
        for (let i = 0; i < 14; i++) {
          const a = rnd(0, TAU);
          const sp = rnd(1, 5) * s;
          B.spawn(
            x,
            y,
            z,
            Math.cos(a) * sp,
            rnd(2, 6),
            Math.sin(a) * sp,
            rnd(0.9, 1.6),
            rnd(1.5, 2.5) * s,
            rnd(4, 7) * s,
            [0.13, 0.11, 0.1],
            0.55,
            [0.08, 0.08, 0.08],
            0,
            -1,
            1.2,
            0,
            0
          );
        }
        for (let i = 0; i < 34; i++) {
          const a = rnd(0, TAU);
          const sp = rnd(6, 20) * s;
          A.spawn(
            x,
            y,
            z,
            Math.cos(a) * sp,
            rnd(3, 14),
            Math.sin(a) * sp,
            rnd(0.4, 0.9),
            0.35,
            0.05,
            COL.white,
            1,
            COL.orange,
            0.7,
            24,
            0.8,
            5,
            rnd(-8, 8)
          );
        }
        break;
      }
      case 'poison': {
        const n = o.count || 4;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, TAU);
          const r = rnd(0, o.radius || 0.8);
          A.spawn(
            x + Math.cos(a) * r,
            y + 0.15,
            z + Math.sin(a) * r,
            rnd(-0.4, 0.4),
            rnd(1.0, 2.6),
            rnd(-0.4, 0.4),
            rnd(0.8, 1.5),
            rnd(0.25, 0.5),
            0.05,
            COL.rot,
            0.9,
            [1.4, 0.2, 0.1],
            0,
            -0.4,
            0.4,
            0,
            0
          );
        }
        if (Math.random() < 0.5) {
          B.spawn(
            x,
            y + 0.2,
            z,
            rnd(-0.3, 0.3),
            1.2,
            rnd(-0.3, 0.3),
            1.2,
            0.8,
            2.6,
            [0.55, 0.16, 0.08],
            0.28,
            [0.3, 0.06, 0.05],
            0,
            -0.3,
            0.6,
            0,
            0
          );
        }
        break;
      }
      case 'glint': {
        const n = o.count || 1;
        const c = o.color || COL.white;
        for (let i = 0; i < n; i++) {
          A.spawn(
            x + rnd(-0.5, 0.5) * (n > 1 ? 1 : 0),
            y + rnd(-0.3, 0.3) * (n > 1 ? 1 : 0),
            z + rnd(-0.5, 0.5) * (n > 1 ? 1 : 0),
            0,
            rnd(0.2, 1.2),
            0,
            rnd(0.3, 0.6),
            (o.size || 1.1) * rnd(0.6, 1),
            0.05,
            c,
            1,
            c,
            0,
            0,
            1,
            5,
            rnd(-3, 3)
          );
        }
        break;
      }
      case 'rune': {
        const n = o.count || 12;
        const c = o.color || COL.gold;
        const sp = o.speed || 3;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, TAU);
          const r = rnd(0.2, 1);
          A.spawn(
            x,
            y,
            z,
            Math.cos(a) * r * sp,
            rnd(1, 4) * (sp / 3),
            Math.sin(a) * r * sp,
            rnd(0.9, 1.5),
            rnd(0.45, 0.8),
            0.15,
            c,
            1,
            [1.6, 0.9, 0.2],
            0,
            -0.8,
            1.6,
            1 + ((Math.random() * 4) | 0),
            rnd(-2, 2)
          );
        }
        break;
      }
      case 'trail': {
        const c = o.color || COL.blue;
        const sz = o.size || 0.9;
        A.spawn(
          x + rnd(-0.1, 0.1),
          y + rnd(-0.1, 0.1),
          z + rnd(-0.1, 0.1),
          0,
          0,
          0,
          o.life || 0.5,
          sz,
          0.05,
          c,
          o.alpha ?? 0.45,
          o.color2 || c,
          0,
          0,
          0,
          0,
          0
        );
        break;
      }
      case 'confetti': {
        const n = o.count || 40;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, TAU);
          const sp = rnd(3, 11);
          const warm =
            Math.random() < 0.7 ? COL.gold : Math.random() < 0.5 ? COL.white : COL.orange;
          A.spawn(
            x,
            y,
            z,
            Math.cos(a) * sp,
            rnd(8, 20),
            Math.sin(a) * sp,
            rnd(1.6, 2.8),
            rnd(0.55, 1.0),
            0.25,
            warm,
            1,
            [1.4, 0.8, 0.2],
            0.2,
            14,
            0.9,
            1 + ((Math.random() * 5) | 0),
            rnd(-6, 6)
          );
        }
        break;
      }
      case 'aura': {
        const a = rnd(0, TAU);
        const r = rnd(1.0, 1.7);
        A.spawn(
          x + Math.cos(a) * r,
          y + rnd(0, 0.5),
          z + Math.sin(a) * r,
          0,
          rnd(1.5, 3.5),
          0,
          rnd(0.5, 0.9),
          rnd(0.3, 0.5),
          0.05,
          COL.gold,
          0.55,
          [1.6, 0.8, 0.1],
          0,
          -0.5,
          0.5,
          0,
          0
        );
        break;
      }
      default:
        break;
    }
  }

  _bindBus() {
    const on = (name, fn) => this._unsub.push(bus.on(name, fn));
    on('kart:hit', ({ kart, kind }) => {
      if (!kart || !kart.pos) return;
      const p = kart.pos;
      if (kind === 'explode') {
        this._emit('explosion', p.x, p.y + 0.8, p.z, { scale: 1 });
      } else if (kind === 'spin') {
        this._emit('impact', p.x, p.y + 0.6, p.z, { count: 12 });
        this._emit('glint', p.x, p.y + 1.2, p.z, { count: 4 });
      } else if (kind === 'poison') {
        this._emit('poison', p.x, p.y + 0.4, p.z, { count: 14, radius: 1.2 });
      } else if (kind === 'squash') {
        this._emit('dust', p.x, p.y, p.z, { count: 10 });
      }
    });
    on('kart:land', ({ kart }) => {
      if (!kart || !kart.pos) return;
      const p = kart.pos;
      const o = this._o;
      o.count = 12;
      o.up = 0.4;
      this._emit('dust', p.x, p.y, p.z, o);
      o.up = 1;
    });
    on('kart:bump', ({ a, b, force }) => {
      if (!a || !b || !(force > 2)) return;
      this._emit(
        'impact',
        (a.pos.x + b.pos.x) / 2,
        (a.pos.y + b.pos.y) / 2 + 0.6,
        (a.pos.z + b.pos.z) / 2,
        { count: 8, scale: Math.min(1.5, 0.5 + force * 0.05) }
      );
    });
    on('kart:wall', ({ kart, force }) => {
      if (!kart || !kart.pos || !(force > 1)) return;
      if (this.time - (this._wallCd.get(kart) || -1) < 0.12) return;
      this._wallCd.set(kart, this.time);
      this._emit('impact', kart.pos.x, kart.pos.y + 0.5, kart.pos.z, { count: 7, scale: 0.8 });
    });
    on('kart:boost', ({ kart, power }) => {
      if (!kart || !kart.pos) return;
      const fx = -Math.sin(kart.yaw);
      const fz = -Math.cos(kart.yaw);
      const o = this._o;
      o.dx = -fx;
      o.dz = -fz;
      o.power = power || 1;
      o.count = 8;
      this._emit('boostFlame', kart.pos.x - fx * 1.1, kart.pos.y + 0.6, kart.pos.z - fz * 1.1, o);
      o.count = 0;
    });
    on('kart:drift', ({ kart, level }) => {
      if (!kart || !kart.pos || !level) return;
      const fx = -Math.sin(kart.yaw);
      const fz = -Math.cos(kart.yaw);
      const c = DRIFT_COL[level];
      this._emit('glint', kart.pos.x - fx * 1.0, kart.pos.y + 0.5, kart.pos.z - fz * 1.0, {
        color: c,
        size: 1.6,
        count: 1,
      });
    });
    on('kart:respawn', ({ kart }) => {
      if (!kart || !kart.pos) return;
      this._emit('rune', kart.pos.x, kart.pos.y + 0.5, kart.pos.z, { count: 16 });
      this._emit('glint', kart.pos.x, kart.pos.y + 1.2, kart.pos.z, { count: 5 });
    });
    on('race:lap', ({ kart }) => {
      if (kart && kart.isPlayer && kart.pos)
        this._emit('confetti', kart.pos.x, kart.pos.y + 2, kart.pos.z, { count: 36 });
    });
    on('race:finish', ({ kart }) => {
      if (kart && kart.isPlayer && kart.pos)
        this._emit('confetti', kart.pos.x, kart.pos.y + 2, kart.pos.z, { count: 90 });
    });
  }

  _updateKart(e, dt) {
    const k = e.kart;
    if (!k.pos) return;
    const fx = -Math.sin(k.yaw);
    const fz = -Math.cos(k.yaw);
    const rx = -fz;
    const rz = fx;
    const bx = k.pos.x - fx * 1.0;
    const bz = k.pos.z - fz * 1.0;
    const gy = k.pos.y;
    const o = this._o;
    const speed = Math.abs(k.speed || 0);
    const drifting = k.drift && k.drift.active;
    const level = drifting ? k.drift.level || 0 : 0;

    // Tyre dust (drifting or off the road).
    const surf = k.surface || k.groundSurface;
    const dirty = drifting || k.offroad || surf === 'offroad' || surf === 'rot';
    if (dirty && speed > 6 && !k.airborne) {
      e.dust += dt * (14 + speed * 0.5);
      const col = surf === 'rot' ? [0.5, 0.2, 0.12] : o.dustColor || undefined;
      while (e.dust >= 1) {
        e.dust -= 1;
        const side = Math.random() < 0.5 ? -0.8 : 0.8;
        o.count = 1;
        o.color = col;
        o.vx = -fx * 2;
        o.vz = -fz * 2;
        o.up = 1;
        this._emit('dust', bx + rx * side, gy, bz + rz * side, o);
      }
      o.color = undefined;
      o.vx = 0;
      o.vz = 0;
    }

    // Drift sparks, colour by charge level.
    if (level >= 1 && speed > 5) {
      e.spark += dt * (35 + level * 25);
      while (e.spark >= 1) {
        e.spark -= 1;
        const side = k.drift.dir >= 0 ? -1 : 1;
        // sparks fly from the outer rear wheel
        o.level = level;
        o.count = 1;
        o.dx = -fx + rx * side * 0.6;
        o.dz = -fz + rz * side * 0.6;
        this._emit('driftSpark', bx + rx * side * 0.8, gy + 0.15, bz + rz * side * 0.8, o);
        o.dx = 0;
        o.dz = 0;
      }
    }
    if (level > e.lastLevel && level >= 1) {
      this._emit('glint', bx, gy + 0.5, bz, { color: DRIFT_COL[level], size: 1.8 });
    }
    e.lastLevel = level;

    // Boost flame.
    if (k.boostTimer > 0) {
      e.flame += dt * 50;
      const power = k.boostPower || 1;
      while (e.flame >= 1) {
        e.flame -= 1;
        for (let s = -1; s <= 1; s += 2) {
          o.count = 1;
          o.dx = -fx;
          o.dz = -fz;
          o.power = power;
          this._emit(
            'boostFlame',
            bx - fx * 0.15 + rx * 0.38 * s,
            gy + 0.55,
            bz - fz * 0.15 + rz * 0.38 * s,
            o
          );
        }
      }
    }

    // Invincibility aura.
    if (k.invincibleTimer > 0 && !k.respawning) {
      e.aura += dt * 24;
      while (e.aura >= 1) {
        e.aura -= 1;
        this._emit('aura', k.pos.x, gy + 0.2, k.pos.z, o);
      }
    }

    // Spin-out stars.
    if (k.spinTimer > 0) {
      e.wasSpin += dt;
      if (e.wasSpin > 0.09) {
        e.wasSpin = 0;
        o.count = 1;
        o.color = COL.gold;
        o.size = 0.9;
        this._emit('glint', k.pos.x + rnd(-0.6, 0.6), gy + 1.9, k.pos.z + rnd(-0.6, 0.6), o);
        o.color = undefined;
        o.size = 0;
      }
    }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const h =
      this.viewportH ||
      (typeof window !== 'undefined'
        ? window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)
        : 800);
    const fov = THREE.MathUtils.degToRad(this.camera.fov || 60);
    const scale = h / (2 * Math.tan(fov / 2));
    this.add.uniforms.uScale.value = scale;
    this.alpha.uniforms.uScale.value = scale;
    for (let i = 0; i < this.karts.length; i++) this._updateKart(this.karts[i], dt);
    this.alpha.update(dt);
    this.add.update(dt);
  }

  dispose() {
    this._unsub.forEach((u) => u());
    this._unsub.length = 0;
    this.scene.remove(this.alpha.points, this.add.points);
    this.alpha.dispose();
    this.add.dispose();
    this.atlas.dispose();
    this.karts.length = 0;
  }
}
