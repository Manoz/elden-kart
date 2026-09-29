import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CHARACTERS } from '../core/data.js';
import { KartModel } from './KartModel.js';

// Dev-only turntable: all karts on a grid. Query: ?solo=<id> for a close-up, ?view=front|side|rear.
const params = new URLSearchParams(location.search);
const solo = params.get('solo');
const view = params.get('view') || 'iso';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14121a);
scene.fog = new THREE.Fog(0x14121a, 25, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
sun.position.set(6, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
scene.add(sun, new THREE.HemisphereLight(0x8899cc, 0x332211, 0.6));

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(40, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a2530, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const list = solo ? CHARACTERS.filter((c) => c.id === solo) : CHARACTERS;
const models = list.map((c, i) => {
  const m = new KartModel(c);
  const cols = solo ? 1 : 4;
  m.group.position.set(
    solo ? 0 : ((i % cols) - 1.5) * 4.2,
    0,
    solo ? 0 : (Math.floor(i / cols) - 0.5) * 5
  );
  scene.add(m.group);
  return m;
});

const camera = new THREE.PerspectiveCamera(solo ? 40 : 45, innerWidth / innerHeight, 0.1, 200);
const fake = {
  speed: 0,
  inputs: { steer: 0 },
  boostTimer: 0,
  boostPower: 1,
  invincibleTimer: 0,
  spinTimer: 0,
  shielded: false,
  drift: { active: false, dir: 0 },
};
const hud = document.getElementById('hud');
let t = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  fake.speed = 22 + Math.sin(t * 0.5) * 10;
  fake.inputs.steer = Math.sin(t * 0.8);
  fake.boostTimer = params.get('boost') || Math.sin(t * 0.4) > 0.3 ? 1 : 0;
  fake.invincibleTimer = params.get('inv') ? 5 : 0;
  fake.shielded = !!params.get('shield');
  fake.spinTimer = params.get('spin') ? 1 : 0;
  fake.drift.active = !!params.get('drift');
  fake.drift.dir = 1;
  models.forEach((m) => m.update(dt, fake));
  const a = params.get('static') ? 0 : t * 0.25;
  if (solo) {
    const r = Number(params.get('r') ?? 6.2);
    const ly = Number(params.get('ly') ?? 0.85);
    const ang =
      view === 'front'
        ? Math.PI
        : view === 'side'
          ? Math.PI / 2
          : view === 'rear'
            ? 0
            : view === 'q'
              ? Math.PI * 0.78
              : 0.7 + a;
    camera.position.set(
      Math.sin(ang) * r,
      ly + (view === 'iso' ? 2.35 : view === 'q' ? 0.5 : 1.35) * (r / 6.2),
      Math.cos(ang) * r
    );
    camera.lookAt(0, ly, 0);
  } else {
    camera.position.set(Math.sin(a) * 6, 9, -20 + Math.cos(a) * 2);
    camera.lookAt(0, 0.6, 0);
  }
  renderer.render(scene, camera);
  hud.innerHTML = list.map((c) => c.name).join(' | ');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
