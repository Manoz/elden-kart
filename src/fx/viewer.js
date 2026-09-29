// Standalone harness for src/items and src/fx: fake track + fake karts on a ring road.
import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { ITEMS } from '../core/data.js';
import { ItemSystem } from '../items/ItemSystem.js';
import { FX } from './FX.js';
import { createPostFX } from './PostFX.js';

let autopilot = true; // player drives itself until a driving key is pressed
const R = 110;
const HALF = 15;
const TAU = Math.PI * 2;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141a2c);
scene.fog = new THREE.FogExp2(0x1a2038, 0.004);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1500);

scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x3a2a14, 0.9));
const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
sun.position.set(80, 120, 40);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1200, 1200),
  new THREE.MeshStandardMaterial({ color: 0x1f2b1a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);
const road = new THREE.Mesh(
  new THREE.RingGeometry(R - HALF, R + HALF, 96, 1),
  new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.9 })
);
road.rotation.x = -Math.PI / 2;
scene.add(road);
const grid = new THREE.GridHelper(1200, 120, 0x333a55, 0x222842);
grid.position.y = 0.02;
scene.add(grid);

// ---- fake track (contract subset)
const track = {
  id: 'fake',
  name: 'Fake',
  laps: 3,
  length: TAU * R,
  checkpoints: 8,
  getPoint(t) {
    const a = t * TAU;
    const pos = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
    const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
    return { pos, tangent, right, up: new THREE.Vector3(0, 1, 0), halfWidth: HALF };
  },
  sample(pos) {
    const d = Math.hypot(pos.x, pos.z);
    let t = Math.atan2(pos.z, pos.x) / TAU;
    t = ((t % 1) + 1) % 1;
    return {
      t,
      lateral: R - d,
      halfWidth: HALF,
      height: 0,
      normal: new THREE.Vector3(0, 1, 0),
      surface: Math.abs(d - R) > HALF ? 'offroad' : 'road',
    };
  },
  constrain(pos, radius) {
    const d = Math.hypot(pos.x, pos.z);
    const lim = HALF + 3 - radius;
    const off = d - R;
    if (Math.abs(off) <= lim) return null;
    const n = new THREE.Vector3(-pos.x / d, 0, -pos.z / d).multiplyScalar(Math.sign(off));
    const push = n.clone().multiplyScalar(Math.abs(off) - lim);
    return { push, normal: n };
  },
  itemBoxes: [],
};
for (const t of [0.03, 0.28, 0.53, 0.78]) {
  for (let i = -1; i <= 2; i++) {
    const p = track.getPoint(t);
    track.itemBoxes.push(p.pos.clone().addScaledVector(p.right, (i - 0.5) * 6.5));
  }
}

// ---- fake karts
class FakeKart {
  constructor(id, color, isPlayer, t0, lane) {
    this.id = id;
    this.isPlayer = isPlayer;
    this.character = { color };
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.6, 2.4),
      new THREE.MeshStandardMaterial({ color })
    );
    body.position.y = 0.55;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.6, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    cab.position.set(0, 1.1, 0.2);
    this.mesh.add(body, cab);
    this.body = body;
    scene.add(this.mesh);
    const p = track.getPoint(t0);
    this.pos = p.pos.clone().addScaledVector(p.right, lane);
    this.yaw = Math.atan2(-p.tangent.x, -p.tangent.z);
    this.speed = 0;
    this.velocity = new THREE.Vector3();
    this.t = t0;
    this.lap = 0;
    this.lapProgress = t0;
    this.place = 1;
    this.inputs = { throttle: 0, brake: 0, steer: 0, drift: false, useItem: false };
    this.heldItem = null;
    this.itemCount = 0;
    this.drift = { active: false, dir: 0, charge: 0, level: 0 };
    this.boostTimer = 0;
    this.boostPower = 1;
    this.invincibleTimer = 0;
    this.spinTimer = 0;
    this.shielded = false;
    this.lane = lane;
    this.aiSpeed = isPlayer ? 34 : 26 + Math.random() * 8;
  }

  applyBoost(sec, power = 1) {
    this.boostTimer = Math.max(this.boostTimer, sec);
    this.boostPower = power;
    bus.emit('kart:boost', { kart: this, power });
  }

  hit(kind) {
    if (this.invincibleTimer > 0 || this.shielded) return;
    this.spinTimer = kind === 'explode' ? 1.6 : 1.1;
    this.speed *= kind === 'explode' ? 0 : 0.35;
    bus.emit('kart:hit', { kart: this, kind });
  }

  update(dt) {
    const inp = this.inputs;
    if (!this.isPlayer || autopilot) {
      const smp = track.sample(this.pos);
      const ahead = track.getPoint((smp.t + 0.02) % 1);
      const tgt = ahead.pos.clone().addScaledVector(ahead.right, this.lane);
      const want = Math.atan2(-(tgt.x - this.pos.x), -(tgt.z - this.pos.z));
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      inp.steer = -Math.max(-1, Math.min(1, d * 2.5));
      inp.throttle = 1;
    }
    for (const k of ['boostTimer', 'invincibleTimer', 'spinTimer']) if (this[k] > 0) this[k] -= dt;
    const top =
      (this.isPlayer ? 42 : this.aiSpeed) * (this.boostTimer > 0 ? 1.35 * this.boostPower : 1);
    if (this.spinTimer > 0) {
      this.mesh.rotation.y += dt * 12;
      this.speed *= 1 - dt * 2;
    } else {
      this.mesh.rotation.y = this.yaw;
      const acc = inp.throttle > 0 ? (this.boostTimer > 0 ? 60 : 24) : 0;
      if (this.speed < top) this.speed = Math.min(top, this.speed + acc * dt);
      else this.speed -= 30 * dt;
      if (inp.brake > 0) this.speed = Math.max(-10, this.speed - 50 * dt);
      if (inp.throttle === 0 && inp.brake === 0) this.speed *= 1 - dt * 0.8;
      const wasDrift = this.drift.active;
      if (inp.drift && Math.abs(inp.steer) > 0.3 && this.speed > 15) {
        if (!wasDrift) {
          this.drift.active = true;
          this.drift.dir = Math.sign(inp.steer);
          this.drift.charge = 0;
        }
        this.drift.charge += dt;
        this.drift.level =
          this.drift.charge > 2.2
            ? 3
            : this.drift.charge > 1.4
              ? 2
              : this.drift.charge > 0.6
                ? 1
                : 0;
      } else if (wasDrift) {
        if (this.drift.level > 0) this.applyBoost(0.5 + this.drift.level * 0.5, 1);
        this.drift.active = false;
        this.drift.level = 0;
      }
      const steerMul = this.drift.active ? 1.5 : 1;
      this.yaw -=
        inp.steer *
        dt *
        1.9 *
        Math.min(1, Math.abs(this.speed) / 14) *
        steerMul *
        Math.sign(this.speed || 1);
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.velocity.set(fx * this.speed, 0, fz * this.speed);
    const c = track.constrain(this.pos, 1);
    if (c) {
      this.pos.add(c.push);
      this.speed *= 0.85;
      bus.emit('kart:wall', { kart: this, force: 6 });
    }
    const s = track.sample(this.pos);
    const dt2 = s.t - this.t;
    this.t = s.t;
    if (dt2 < -0.5) this.lap++;
    else if (dt2 > 0.5) this.lap--;
    this.lapProgress = this.lap + this.t;
    this.mesh.position.copy(this.pos);
    this.body.material.emissive.setHex(this.invincibleTimer > 0 ? 0x664400 : 0x000000);
  }
}

const karts = [
  new FakeKart('player', 0xc9a227, true, 0.0, 0),
  new FakeKart('ai1', 0x3f6fd1, false, 0.02, -6),
  new FakeKart('ai2', 0xb3261e, false, 0.04, 6),
  new FakeKart('ai3', 0x4c7a34, false, 0.06, 0),
];
const player = karts[0];

const fx = new FX(scene, camera);
karts.forEach((k) => fx.attachKart(k));
const items = new ItemSystem({ scene, track, karts, fx });
const post = createPostFX(renderer, scene, camera);
let postOn = true;
let boostFx = false;

// ---- controls
const keys = new Set();
const ORDER = [
  ITEMS.CRIMSON_FLASK,
  ITEMS.GOLDEN_RUNE,
  ITEMS.ROT_POT,
  ITEMS.FIRE_POT,
  ITEMS.GLINTSTONE_MISSILE,
  ITEMS.BLACK_KNIFE,
  ITEMS.ERDTREE_BLESSING,
  ITEMS.BLOODHOUND_STEP,
  ITEMS.STONESWORD_KEY,
  ITEMS.TORRENT_CALL,
];
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(
      e.code
    )
  )
    autopilot = false;
  if (e.code === 'KeyT') autopilot = true;
  const n = e.code.startsWith('Digit') ? (Number(e.code.slice(5)) + 9) % 10 : -1;
  if (n >= 0) items.giveItem(player, ORDER[n]);
  if (e.code === 'KeyB') boostFx = !boostFx;
  if (e.code === 'KeyP') postOn = !postOn;
});
addEventListener('keyup', (e) => keys.delete(e.code));

const panel = document.getElementById('panel');
ORDER.forEach((id, i) => {
  const b = document.createElement('button');
  b.textContent = `${(i + 1) % 10} ${id}`;
  b.onclick = () => items.giveItem(player, id);
  panel.appendChild(b);
});
for (const [label, fn] of [
  ['use item', () => items.useItem(player)],
  ['fx: explosion', () => fx.emit('explosion', player.pos, { scale: 1 })],
  ['fx: confetti', () => fx.emit('confetti', player.pos, {})],
  ['fx: rune', () => fx.emit('rune', new THREE.Vector3(player.pos.x, 1.5, player.pos.z), {})],
  [
    'invincible 5s',
    () => {
      player.invincibleTimer = 5;
    },
  ],
  ['boost 3s', () => player.applyBoost(3, 1.2)],
  [
    'toggle boost blur',
    () => {
      boostFx = !boostFx;
    },
  ],
  [
    'toggle post-fx',
    () => {
      postOn = !postOn;
    },
  ],
]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  panel.appendChild(b);
}

function setInputs() {
  const i = player.inputs;
  i.throttle = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
  i.brake = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
  i.steer =
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
    (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  i.drift = keys.has('Space');
  i.useItem = keys.has('KeyE') || keys.has('ShiftLeft');
}

// AI karts grab and use items so rolling / hazards show up.
function aiItems(dt) {
  for (let i = 1; i < karts.length; i++) {
    const k = karts[i];
    k._aiT = (k._aiT || 0) + dt;
    k.inputs.useItem = false;
    if (k.heldItem && k._aiT > 3 + i) {
      k.inputs.useItem = true;
      k._aiT = 0;
    }
  }
}

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const fx_ = -Math.sin(player.yaw);
  const fz_ = -Math.cos(player.yaw);
  const want = new THREE.Vector3(player.pos.x - fx_ * 7, 3.2, player.pos.z - fz_ * 7);
  camPos.lerp(want, Math.min(1, dt * 6));
  camera.position.copy(camPos);
  camLook.set(player.pos.x + fx_ * 6, 1.4, player.pos.z + fz_ * 6);
  camera.lookAt(camLook);
  camera.fov = 65 + (player.boostTimer > 0 ? 10 : 0);
  camera.updateProjectionMatrix();
}
camPos.set(player.pos.x + Math.sin(player.yaw) * 7, 3.2, player.pos.z + Math.cos(player.yaw) * 7);

const itemEl = document.getElementById('item');
const clock = new THREE.Clock();
let acc = 0;
function simulate(dt) {
  setInputs();
  aiItems(dt);
  karts.forEach((k) => k.update(dt));
  const sorted = [...karts].sort((a, b) => b.lapProgress - a.lapProgress);
  sorted.forEach((k, i) => {
    k.place = i + 1;
  });
  items.update(dt);
  fx.update(dt);
  updateCamera(dt);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  simulate(dt);
  post.setBoost(boostFx || player.boostTimer > 0 ? Math.min(1, 0.5 * player.boostPower + 0.3) : 0);
  if (postOn) post.render(dt);
  else renderer.render(scene, camera);
  acc += dt;
  if (acc > 0.1) {
    acc = 0;
    itemEl.textContent = items.isRolling(player)
      ? '(rolling...)'
      : `${player.heldItem || '-'} x${player.itemCount || 0}  place ${player.place}`;
  }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize(innerWidth, innerHeight);
});
// ?item=<id>&at=<seconds> gives and uses an item automatically (for headless screenshots).
const qs = new URLSearchParams(location.search);
if (qs.get('warp') || qs.get('item')) {
  // deterministic fast-forward: ?warp=<s>&item=<id>&after=<s>
  for (let i = 0; i < Number(qs.get('warp') || 0) * 60; i++) simulate(1 / 60);
  if (qs.get('item')) {
    items.giveItem(player, qs.get('item'));
    items.useItem(player);
  }
  for (let i = 0; i < Number(qs.get('after') || 0) * 60; i++) simulate(1 / 60);
}
if (qs.get('nopost')) postOn = false;
window.__viewer = { items, fx, karts, player, post, track, scene, camera, renderer };
frame();
