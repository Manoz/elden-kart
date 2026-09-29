// GPU-animated effects: instanced billboards, particles, light beams, pools/water.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';
import { mulberry32 } from './util.js';

let glowTex = null;
export function getGlowTexture() {
  if (!glowTex) glowTex = makeGlowTexture(1, 128);
  return glowTex;
}

function instancedQuad(count) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  g.instanceCount = count;
  return g;
}

const BB_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec3 iData;
uniform float uTime;
uniform float uFlicker;
uniform float uGroundFade;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = uv;
  float size = iData.x * (1.0 + uFlicker * 0.18 * sin(uTime * (2.5 + iData.y * 3.0) + iData.y * 40.0));
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vec2 off = position.xy * size * 2.0;
  mv.xy += off;
  float worldY = iPos.y + off.x * viewMatrix[1][0] + off.y * viewMatrix[1][1];
  float gf = uGroundFade > 0.0 ? smoothstep(0.0, uGroundFade, worldY - iData.z) : 1.0;
  float depth = -mv.z;
  vCol = vec4(iCol.rgb, iCol.a * smoothstep(2.0, 14.0, depth) * gf);
  gl_Position = projectionMatrix * mv;
}`;

const BB_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float a = texture2D(uMap, vUv).r;
  gl_FragColor = vec4(vCol.rgb, a * vCol.a);
  #include <colorspace_fragment>
}`;

// items: [{ x, y, z, size, color (hex), alpha, phase }]
export function createBillboards(
  items,
  { additive = true, flicker = 0.4, map = null, groundFade = 0 } = {}
) {
  const n = items.length;
  const g = instancedQuad(n);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const dat = new Float32Array(n * 3);
  const c = new THREE.Color();
  items.forEach((it, i) => {
    pos.set([it.x, it.y, it.z], i * 3);
    c.set(it.color ?? 0xffffff);
    col.set([c.r, c.g, c.b, it.alpha ?? 1], i * 4);
    dat.set([it.size ?? 4, it.phase ?? Math.random(), it.ground ?? 0], i * 3);
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
  g.setAttribute('iCol', new THREE.InstancedBufferAttribute(col, 4));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlicker: { value: flicker },
      uGroundFade: { value: groundFade },
      uMap: { value: map || getGlowTexture() },
    },
    vertexShader: BB_VERT,
    fragmentShader: BB_FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    update: (t) => (mat.uniforms.uTime.value = t),
    dispose: () => (g.dispose(), mat.dispose()),
  };
}

const PT_VERT = /* glsl */ `
attribute vec3 iBase;
attribute vec4 iRand;
uniform float uTime, uSpeed, uRise, uRange, uSway, uSize, uSpin;
varying vec2 vUv;
varying float vFade;
varying float vMix;
void main() {
  vUv = uv;
  vMix = iRand.x;
  float t = uTime * uSpeed * (0.6 + iRand.x * 0.8);
  float phase = iRand.y * uRange + t * uRise;
  float wrapped = mod(phase, uRange);
  float life = wrapped / uRange;
  vec3 p = iBase;
  p.y += wrapped;
  float sw = t * 0.8 + iRand.z * 6.2831;
  p.x += sin(sw) * uSway + sin(sw * 0.37 + 1.3) * uSway * 0.6;
  p.z += cos(sw * 0.9) * uSway + cos(sw * 0.51) * uSway * 0.5;
  vFade = smoothstep(0.0, 0.12, life) * smoothstep(1.0, 0.75, life);
  float size = uSize * (0.55 + iRand.w * 0.9);
  vec2 q = position.xy;
  float ang = iRand.z * 6.2831 + uTime * uSpin * (0.5 + iRand.w);
  float ca = cos(ang), sa = sin(ang);
  q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
  q.x *= mix(1.0, cos(uTime * 2.0 * uSpin + iRand.z * 20.0), step(0.001, uSpin));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += q * size;
  vFade *= smoothstep(1.5, 8.0, -mv.z) * smoothstep(320.0, 120.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PT_FRAG = /* glsl */ `
uniform vec3 uColA, uColB;
uniform float uKind, uAlpha;
varying vec2 vUv;
varying float vFade;
varying float vMix;
void main() {
  vec2 c = vUv - 0.5;
  float a;
  if (uKind > 0.5) {
    a = smoothstep(0.5, 0.35, length(c * vec2(1.0, 2.1)));
  } else {
    float r = length(c) * 2.0;
    a = pow(max(1.0 - r, 0.0), 2.0);
  }
  vec3 col = mix(uColA, uColB, vMix);
  gl_FragColor = vec4(col, a * vFade * uAlpha);
  #include <colorspace_fragment>
}`;

// cfg: { count, positions: fn(rng)->[x,y,z], colorA, colorB, size, rise, range, sway, speed, spin, kind:'glow'|'petal', additive, alpha }
export function createParticles(cfg, seed = 1) {
  const rng = mulberry32(seed * 4241);
  const n = cfg.count;
  const g = instancedQuad(n);
  const base = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = cfg.positions(rng);
    base.set(p, i * 3);
    rnd.set([rng(), rng(), rng(), rng()], i * 4);
  }
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(base, 3));
  g.setAttribute('iRand', new THREE.InstancedBufferAttribute(rnd, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: cfg.speed ?? 1 },
      uRise: { value: cfg.rise ?? 2 },
      uRange: { value: cfg.range ?? 30 },
      uSway: { value: cfg.sway ?? 1 },
      uSize: { value: cfg.size ?? 0.3 },
      uSpin: { value: cfg.spin ?? 0 },
      uColA: { value: new THREE.Color(cfg.colorA) },
      uColB: { value: new THREE.Color(cfg.colorB ?? cfg.colorA) },
      uKind: { value: cfg.kind === 'petal' ? 1 : 0 },
      uAlpha: { value: cfg.alpha ?? 1 },
    },
    vertexShader: PT_VERT,
    fragmentShader: PT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: cfg.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return {
    mesh,
    update: (t) => (mat.uniforms.uTime.value = t),
    dispose: () => (g.dispose(), mat.dispose()),
  };
}

// Vertical additive light beams (sites of grace etc). items: [{x,y,z,height,radius,color}]
export function createBeams(items, color = 0xffd36a) {
  const geo = new THREE.CylinderGeometry(1, 1.7, 1, 24, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vP;
      void main() {
        vUv = uv;
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vP = p.xyz;
        gl_Position = projectionMatrix * viewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vP;
      void main() {
        float y = clamp(vUv.y, 0.0, 1.0);
        float streak = 0.55 + 0.45 * sin(vUv.x * 60.0 + uTime * 1.6 + y * 8.0) * sin(vUv.x * 23.0 - uTime * 0.9);
        float a = pow(max(1.0 - y, 0.0), 1.6) * smoothstep(0.0, 0.05, y) * streak;
        a *= 0.85 + 0.15 * sin(uTime * 2.0 + vP.x * 0.3);
        gl_FragColor = vec4(uColor * a * 1.5, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  items.forEach((it, i) => {
    m.compose(
      new THREE.Vector3(it.x, it.y, it.z),
      new THREE.Quaternion(),
      new THREE.Vector3(it.radius ?? 1.6, it.height ?? 60, it.radius ?? 1.6)
    );
    mesh.setMatrixAt(i, m);
  });
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return {
    mesh,
    update: (t) => (mat.uniforms.uTime.value = t),
    dispose: () => (geo.dispose(), mat.dispose()),
  };
}

const POOL_FRAG = /* glsl */ `
uniform float uTime, uKind;
uniform vec3 uColA, uColB, uEmis;
varying vec3 vWorld;
varying vec2 vLocal;
uniform float uRadius;
#include <fog_pars_fragment>
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vLocal * uRadius;
  float t = uTime;
  float edge = smoothstep(1.0, 0.82, length(vLocal));
  vec3 col;
  float alpha;
  if (uKind < 0.5) {
    float w1 = vn(p * 0.35 + vec2(t * 0.25, t * 0.15));
    float w2 = vn(p * 0.9 - vec2(t * 0.35, -t * 0.2));
    float rip = w1 * 0.6 + w2 * 0.4;
    col = mix(uColA, uColB, rip);
    float spark = pow(vn(p * 3.0 + t * 0.8), 8.0) * 1.6;
    col += vec3(1.0, 0.95, 0.8) * spark * 0.5;
    col += uEmis * pow(rip, 3.0) * 0.3;
    alpha = 0.86 * edge;
  } else {
    // Low-frequency, band-limited pattern: stays smooth when seen from above at a distance.
    float n1 = vn(p * 0.09 + vec2(t * 0.04, -t * 0.03));
    float n2 = vn(p * 0.2 + vec2(-t * 0.06, t * 0.05));
    float bub = smoothstep(0.45, 0.95, vn(p * 0.16 + vec2(0.0, t * 0.15)));
    col = mix(uColA, uColB, n1 * 0.7 + n2 * 0.3);
    col += uEmis * (0.1 + bub * 0.45 + n2 * n2 * 0.25);
    alpha = 0.95 * edge;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createPoolMaterial(kind, cfg = {}) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uKind: { value: kind === 'rot' ? 1 : 0 },
      uRadius: { value: cfg.radius ?? 1 },
      uColA: { value: new THREE.Color(cfg.colorA ?? (kind === 'rot' ? 0x4a0a08 : 0x1b4f72)) },
      uColB: { value: new THREE.Color(cfg.colorB ?? (kind === 'rot' ? 0xa02010 : 0x5ab2d6)) },
      uEmis: { value: new THREE.Color(cfg.emis ?? (kind === 'rot' ? 0xff5a1a : 0x88ccff)) },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld; varying vec2 vLocal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vLocal = position.xy / ${(cfg.radius ?? 1).toFixed(3)};
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: POOL_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}
