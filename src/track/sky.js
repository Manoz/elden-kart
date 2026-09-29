// Sky dome, distant ridges, giant tree billboard, fog and lights.
import * as THREE from 'three';
import { makeNoise } from './util.js';
import { fogDensityFor } from './atmosphere.js';

const R = 1000;

// Small equirect environment (sky gradient + sun glow) so metallic materials have something to reflect.
function makeEnvTexture(S, sunDir, groundColor) {
  const W = 128;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const zen = new THREE.Color(S.zenith);
  const mid = new THREE.Color(S.mid);
  const hor = new THREE.Color(S.horizon);
  const gnd = new THREE.Color(groundColor);
  const sunC = new THREE.Color(S.sunColor);
  const col = new THREE.Color();
  const d = new THREE.Vector3();
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < H; y++) {
    const elev = Math.PI * (0.5 - (y + 0.5) / H);
    for (let x = 0; x < W; x++) {
      const az = (x / W) * Math.PI * 2 - Math.PI;
      d.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
      const h = d.y;
      col
        .copy(hor)
        .lerp(mid, sm(0, 0.3, h))
        .lerp(zen, sm(0.25, 0.95, h))
        .lerp(gnd, sm(0, -0.1, h));
      const sun = Math.pow(Math.max(d.dot(sunDir), 0), 24);
      col.r += sunC.r * sun * 2.2;
      col.g += sunC.g * sun * 2.2;
      col.b += sunC.b * sun * 2.2;
      const i = (y * W + x) * 4;
      col.convertLinearToSRGB();
      img.data[i] = Math.min(255, col.r * 255);
      img.data[i + 1] = Math.min(255, col.g * 255);
      img.data[i + 2] = Math.min(255, col.b * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DOME_FRAG = /* glsl */ `
uniform vec3 uZenith, uMid, uHorizon, uGround, uSunDir, uSunColor, uMoonDir, uMoonColor, uCloudLit, uCloudDark, uBand;
uniform float uSunSize, uMoonSize, uStars, uTime, uCloudAmt, uCloudSpeed, uBandAmt;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, h));
  col = mix(col, uZenith, smoothstep(0.25, 0.95, h));
  col = mix(col, uGround, smoothstep(0.0, -0.1, h));
  float sd = max(dot(d, uSunDir), 0.0);
  float horizonGlow = exp(-abs(h) * 5.0);
  col += uSunColor * (pow(sd, 6.0) * 0.16 * (0.4 + horizonGlow) + pow(sd, 48.0) * 0.5);
  float disc = smoothstep(cos(uSunSize), cos(uSunSize * 0.82), sd);
  col = mix(col, uSunColor * 4.0, disc);
  float md = max(dot(d, uMoonDir), 0.0);
  col += uMoonColor * pow(md, 30.0) * 0.4;
  col = mix(col, uMoonColor * 2.5, smoothstep(cos(uMoonSize), cos(uMoonSize * 0.9), md) * step(0.001, uMoonSize));
  if (uStars > 0.0 && h > 0.0) {
    vec3 p = d * 170.0;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float r = hash(id);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + r * 90.0);
    col += vec3(0.85, 0.92, 1.0) * step(0.982, r) * smoothstep(0.38, 0.0, length(f)) * tw * uStars * smoothstep(0.0, 0.2, h) * 1.6;
  }
  if (uBandAmt > 0.0) {
    float a = atan(d.z, d.x);
    float band = sin(a * 3.0 + uTime * 0.05 + sin(a * 7.0 + uTime * 0.13) * 0.8) * 0.5 + 0.5;
    col += uBand * band * uBandAmt * smoothstep(0.05, 0.3, h) * smoothstep(0.85, 0.35, h);
  }
  // Procedural cumulus on a plane above the camera, self-shadowed away from the sun.
  if (h > 0.0 && uCloudAmt > 0.0) {
    vec2 wind = vec2(uTime * uCloudSpeed * 6.0, uTime * uCloudSpeed * 2.0);
    vec2 uv = d.xz / (h + 0.08) * 0.55 + wind;
    float c = fbm(uv);
    float cover = smoothstep(0.66 - uCloudAmt * 0.24, 0.9 - uCloudAmt * 0.18, c);
    float c2 = fbm(uv + uSunDir.xz * 0.18);
    float lit = clamp(0.55 + (c - c2) * 3.2, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit);
    cc += uSunColor * pow(sd, 5.0) * (1.0 - cover) * 0.9;
    // distant clouds dissolve into the horizon haze
    cc = mix(cc, uHorizon, (1.0 - smoothstep(0.0, 0.35, h)) * 0.55);
    col = mix(col, cc, cover * smoothstep(0.0, 0.1, h) * 0.95);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function ridgeRing(layer, fogColor) {
  const seg = 220;
  const noise = makeNoise(layer.seed ?? 3);
  const pos = [];
  const col = [];
  const idx = [];
  const top = new THREE.Color(layer.color);
  const bot = new THREE.Color(layer.bottom ?? fogColor);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const n = noise.fbm(x * (layer.freq ?? 3) + 20, z * (layer.freq ?? 3) + 20, 4);
    const ridged = 1 - Math.abs(n * 2 - 1);
    const h = layer.height + (n * 2 - 1) * layer.amp + ridged * ridged * (layer.spike ?? 0);
    pos.push(x * layer.radius, -250, z * layer.radius, x * layer.radius, h, z * layer.radius);
    col.push(bot.r, bot.g, bot.b, top.r, top.g, top.b);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// baseHeight: typical road height, so the height fog feels the same on high and low tracks.
export function createSky(cfg, scene, baseHeight = 0) {
  const group = new THREE.Group();
  group.name = 'sky';
  const disposables = [];
  const fogColor = new THREE.Color(cfg.fog.color);
  scene.fog = new THREE.FogExp2(fogColor.getHex(), fogDensityFor(cfg.fog.density, baseHeight));
  scene.background = fogColor.clone();

  const S = cfg.sky;
  const sunDir = new THREE.Vector3(...S.sunDir).normalize();
  const moonDir = new THREE.Vector3(...(S.moonDir || [0, -1, 0])).normalize();
  const u = {
    uZenith: { value: new THREE.Color(S.zenith) },
    uMid: { value: new THREE.Color(S.mid) },
    uHorizon: { value: new THREE.Color(S.horizon) },
    uGround: { value: new THREE.Color(S.ground ?? cfg.fog.color) },
    uSunDir: { value: sunDir },
    uSunColor: { value: new THREE.Color(S.sunColor) },
    uSunSize: { value: S.sunSize ?? 0.03 },
    uMoonDir: { value: moonDir },
    uMoonColor: { value: new THREE.Color(S.moonColor ?? 0xffffff) },
    uMoonSize: { value: S.moonSize ?? 0 },
    uStars: { value: S.stars ?? 0 },
    uTime: { value: 0 },
    uCloudAmt: { value: S.cloudAmt ?? 0.8 },
    uCloudSpeed: { value: S.cloudSpeed ?? 0.004 },
    uCloudLit: { value: new THREE.Color(S.cloudLit ?? 0xffffff) },
    uCloudDark: { value: new THREE.Color(S.cloudDark ?? 0x888888) },
    uBand: { value: new THREE.Color(S.band ?? 0x000000) },
    uBandAmt: { value: S.band ? (S.bandAmt ?? 0.3) : 0 },
  };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), domeMat);
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.onBeforeRender = (renderer, scn, camera) => {
    const s = Math.min(camera.far * 0.42, 2500) / R;
    group.position.copy(camera.position);
    group.scale.setScalar(s);
    group.updateMatrixWorld(true);
  };
  group.add(dome);
  disposables.push(dome.geometry, domeMat);

  // distant ridges
  (S.ridges || []).forEach((layer, i) => {
    const geo = ridgeRing(layer, fogColor);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -900 + i;
    m.frustumCulled = false;
    group.add(m);
    disposables.push(geo, mat);
  });

  scene.add(group);

  const envTex = makeEnvTexture(S, sunDir, S.ground ?? cfg.fog.color);
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;
  disposables.push(envTex);

  // lights
  const L = cfg.lights;
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
  const sun = new THREE.DirectionalLight(L.sun, L.sunIntensity);
  sun.position.copy(new THREE.Vector3(...(L.sunDir || S.sunDir)).normalize().multiplyScalar(500));
  scene.add(hemi, sun, sun.target);

  // Tight shadow frustum that follows a focus point (kart shadows only; scenery does not cast).
  const SHADOW_R = 34;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_R;
  sc.right = SHADOW_R;
  sc.top = SHADOW_R;
  sc.bottom = -SHADOW_R;
  sc.near = 10;
  sc.far = 420;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2;
  const lightDir = new THREE.Vector3(...(L.sunDir || S.sunDir)).normalize();
  const texel = (2 * SHADOW_R) / 2048;
  const q = new THREE.Vector3();
  const right = new THREE.Vector3();
  const upv = new THREE.Vector3();
  let explicitFocus = 0;
  const setShadowFocus = (pos) => {
    // Snap the focus to the shadow-map texel grid so shadows do not shimmer while moving.
    right.crossVectors(new THREE.Vector3(0, 1, 0), lightDir).normalize();
    upv.crossVectors(lightDir, right).normalize();
    const a = Math.round(pos.dot(right) / texel) * texel;
    const b = Math.round(pos.dot(upv) / texel) * texel;
    const c = pos.dot(lightDir);
    q.set(0, 0, 0).addScaledVector(right, a).addScaledVector(upv, b).addScaledVector(lightDir, c);
    sun.target.position.copy(q);
    sun.position.copy(q).addScaledVector(lightDir, 200);
    sun.target.updateMatrixWorld();
  };
  // Without an explicit focus, follow the point ~15 m in front of the rendering camera (where the player kart is).
  scene.onBeforeRender = (renderer, sc2, camera) => {
    if (explicitFocus > 0) {
      explicitFocus--;
      return;
    }
    camera.getWorldDirection(q);
    q.multiplyScalar(15).add(camera.position);
    setShadowFocus(q.clone());
  };

  return {
    group,
    fogColor,
    setShadowFocus(pos) {
      explicitFocus = 2;
      setShadowFocus(pos);
    },
    update(dt, time) {
      u.uTime.value = time;
    },
    dispose() {
      scene.remove(group, hemi, sun, sun.target);
      scene.onBeforeRender = () => {};
      scene.environment = null;
      sun.shadow.dispose?.();
      hemi.dispose?.();
      sun.dispose?.();
      for (const d of disposables) d.dispose?.();
    },
  };
}
