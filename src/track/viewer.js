// Standalone track viewer: ?track=limgrave|caelid|leyndell|haligtree &mode=fly|chase|top &t=0.3 &freeze=1 &bloom=0
// Keys: 1-4 track, M cycle mode, Space freeze.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createTrack } from './index.js';

const IDS = ['limgrave', 'caelid', 'leyndell', 'haligtree'];
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const hud = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 2000);
let scene = new THREE.Scene();
let track = null;
let mode = q.get('mode') || 'fly';
let freeze = q.get('freeze') === '1';
let t = parseFloat(q.get('t') || '0');
let dotT = 0;
let composer = null;
let bloom = null;
const dot = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xff00ff })
);
const kartBox = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 1, 2.4),
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
let info = '';
let savedFog = null;
const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));

function setup(id) {
  if (track) track.dispose();
  scene = new THREE.Scene();
  track = createTrack(id, scene);
  scene.add(dot, kartBox);
  savedFog = scene.fog;
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (q.get('bloom') !== '0') {
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.9);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  resize();
  const starts = [0, 1, 2, 3].map((i) => track.startGrid(i));
  window.__grid = starts.map((s) => [s.pos.x, s.pos.y, s.pos.z, s.yaw]);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  composer?.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') setup(IDS[+e.key - 1]);
  if (e.key === 'm') mode = mode === 'fly' ? 'chase' : mode === 'chase' ? 'top' : 'fly';
  if (e.key === ' ') freeze = !freeze;
});

const camPos = new THREE.Vector3();
const look = new THREE.Vector3();
const tmp = new THREE.Vector3();
let last = performance.now();
let acc = 0;
let frames = 0;
let fps = 60;
let simTime = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  frames++;
  if (acc > 0.5) {
    fps = frames / acc;
    acc = 0;
    frames = 0;
  }
  simTime += dt;
  if (!freeze) t = (t + (dt * 28) / track.length) % 1;
  track.update(dt, simTime);

  // debug kart driven along the centreline with a lateral wobble, using sample() with hint
  if (!freeze) dotT = t;
  const pt = track.getPoint(dotT + 30 / track.length);
  const wob = Math.sin(simTime * 0.7) * pt.halfWidth * 0.6;
  tmp.copy(pt.pos).addScaledVector(pt.right, wob);
  const s = track.sample(tmp, dotT);
  dot.position.set(tmp.x, s.height + 1.4, tmp.z);
  kartBox.position.set(tmp.x, s.height + 0.5, tmp.z);
  kartBox.rotation.y = Math.atan2(-pt.tangent.x, -pt.tangent.z);
  info = `${track.id}  L=${track.length.toFixed(0)}m  t=${t.toFixed(3)}  mode=${mode}\nsample: t=${s.t.toFixed(3)} lat=${s.lateral.toFixed(1)} h=${s.height.toFixed(2)} ${s.surface}\nfps=${fps.toFixed(0)} calls=${renderer.info.render.calls} tris=${(renderer.info.render.triangles / 1000).toFixed(0)}k${errors.length ? '\nERR ' + errors[0] : ''}`;

  const p = track.getPoint(t);
  scene.fog = mode === 'top' ? null : savedFog;
  if (mode === 'free') {
    const c = (q.get('cam') || '0,50,0,0,0,-100').split(',').map(Number);
    camera.up.set(0, 1, 0);
    camera.far = 2000;
    camera.fov = 60;
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(c[3], c[4], c[5]);
  } else if (mode === 'top') {
    camPos.set(track.worldCx, track.worldSize * 0.6, track.worldCz + 1);
    camera.position.copy(camPos);
    camera.up.set(0, 0, -1);
    camera.lookAt(track.worldCx, 0, track.worldCz);
    camera.far = 4000;
    camera.fov = 45;
  } else {
    camera.up.set(0, 1, 0);
    camera.far = 2000;
    const back = mode === 'chase' ? 10 : 26;
    const up = mode === 'chase' ? 4.5 : 11;
    camPos.copy(p.pos).addScaledVector(p.tangent, -back);
    camPos.y += up;
    camera.position.copy(camPos);
    const ahead = track.getPoint(t + 22 / track.length);
    look.copy(ahead.pos);
    look.y += 1.5;
    camera.lookAt(look);
    camera.fov = mode === 'chase' ? 68 : 62;
  }
  camera.updateProjectionMatrix();
  hud.textContent = info;
  composer.render(dt);
  requestAnimationFrame(frame);
}

window.__viewer = {
  setTrack: setup,
  setT: (v) => {
    t = v;
  },
  setMode: (m) => {
    mode = m;
  },
  setFreeze: (f) => {
    freeze = f;
  },
  get track() {
    return track;
  },
  get renderer() {
    return renderer;
  },
  get scene() {
    return scene;
  },
  camera,
  stats() {
    renderer.info.reset();
    renderer.render(scene, camera);
    const i = renderer.info;
    return {
      calls: i.render.calls,
      tris: i.render.triangles,
      geos: i.memory.geometries,
      tex: i.memory.textures,
    };
  },
  errors,
};
setup(q.get('track') || 'limgrave');
requestAnimationFrame(frame);
