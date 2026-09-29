import * as THREE from 'three';
import { bus } from './bus.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const damp = (dt, rate) => 1 - Math.exp(-rate * dt);

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ipos = new THREE.Vector3();
const _ilook = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.target = null;

    this.camYaw = 0;
    this.ySm = 0;
    this.fov = 62;
    this.boostAmt = 0;
    this.swing = 0;
    this.lookBehind = false;
    this._lb = 0;
    this.roll = 0;
    this.shake = 0;
    this._snap = true;
    this.intro = { active: false, time: 0, duration: 0 };

    this._offs = [
      bus.on('kart:hit', ({ kart, kind }) => this._kick(kart, kind === 'poison' ? 0.25 : 1)),
      bus.on('kart:wall', ({ kart, force }) => this._kick(kart, Math.min(0.55, force / 22))),
      bus.on('kart:land', ({ kart }) => this._kick(kart, 0.4)),
      bus.on('kart:boost', ({ kart }) => this._kick(kart, 0.3)),
      bus.on('kart:bump', ({ a, b, force }) => {
        this._kick(a, Math.min(0.5, force / 25));
        this._kick(b, Math.min(0.5, force / 25));
      }),
    ];
  }

  dispose() {
    this._offs.forEach((off) => off());
    this._offs = [];
  }

  _kick(kart, amount) {
    if (kart === this.target) this.shake = Math.max(this.shake, amount);
  }

  setTarget(kart) {
    this.target = kart;
    this.reset();
  }

  reset() {
    this._snap = true;
  }

  startIntro(duration = 3.6) {
    this.intro = { active: true, time: 0, duration };
    this._snap = true;
  }

  skipIntro() {
    this.intro.active = false;
  }

  get introActive() {
    return this.intro.active;
  }

  // Computes the chase pose into outPos / outLook and returns the target fov.
  _chasePose(dt, kart, outPos, outLook) {
    const vx = kart.velocity.x;
    const vz = kart.velocity.z;
    const hSpeed = Math.hypot(vx, vz);
    const speedRatio = clamp(Math.abs(kart.speed) / 42, 0, 1.4);
    const drifting = kart.drift.active;

    if (this._snap) {
      this.camYaw = kart.yaw;
      this.ySm = kart.pos.y;
      this._snap = false;
    }

    const boostTarget = kart.boostTimer > 0 ? Math.min(1, kart.boostPower || 1) : 0;
    this.boostAmt +=
      (boostTarget - this.boostAmt) * damp(dt, boostTarget > this.boostAmt ? 6 : 2.5);
    this.swing += ((drifting ? kart.drift.dir : 0) - this.swing) * damp(dt, 4);
    this._lb += ((this.lookBehind ? 1 : 0) - this._lb) * damp(dt, 9);

    // Blend heading and travel direction so slides read clearly.
    let target = kart.yaw;
    if (hSpeed > 4 && kart.speed > 0) {
      const travel = Math.atan2(-vx, -vz);
      const w = drifting ? 0.65 : 0.25;
      target = kart.yaw + wrapAngle(travel - kart.yaw) * w;
    }
    target -= this.swing * 0.16;
    const rate = drifting ? 3.4 : kart.speed < 0 ? 2.5 : 5.5;
    this.camYaw += wrapAngle(target - this.camYaw) * damp(dt, rate);

    const yaw = this.camYaw + this._lb * Math.PI;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);

    const dist = (6.4 + 0.9 * speedRatio + 1.8 * this.boostAmt) * (1 - 0.2 * this._lb);
    const height = 2.7 + 0.35 * speedRatio - 0.4 * this._lb;

    this.ySm += (kart.pos.y - this.ySm) * damp(dt, kart.grounded ? 9 : 3.5);

    outPos.set(kart.pos.x - fx * dist, this.ySm + height, kart.pos.z - fz * dist);
    // Sideways swing on drifts.
    outPos.x += -fz * -this.swing * 0.9;
    outPos.z += fx * -this.swing * 0.9;

    if (this.track) {
      const s = this.track.sample(outPos);
      if (s && s.surface !== 'void' && Number.isFinite(s.height)) {
        outPos.y = Math.max(outPos.y, s.height + 1.0);
      }
    }

    outLook.set(kart.pos.x + fx * 5, this.ySm + 1.3, kart.pos.z + fz * 5);

    return 60 + 16 * speedRatio + 12 * this.boostAmt;
  }

  update(dt, kart = this.target) {
    if (!kart) return;
    dt = clamp(dt, 0, 0.1);
    const cam = this.camera;

    let fovTarget = this._chasePose(dt, kart, _pos, _look);
    const speedRatio = clamp(Math.abs(kart.speed) / 42, 0, 1.4);
    let snapFov = false;

    if (this.intro.active) {
      const it = this.intro;
      it.time += dt;
      const u = clamp(it.time / it.duration, 0, 1);
      const e = u * u * (3 - 2 * u);
      // Keep chase state locked to the grid while the fly-over plays.
      this._snap = true;
      // Orbit from in front of the player's kart (grid behind it in shot) round to the chase pose.
      const side = it.side ?? (it.side = Math.random() < 0.5 ? -1 : 1);
      const phi = (1 - e) * 2.5 * side;
      const orbit = 6.4 + (1 - e) * 9;
      const lift = 2.7 + (1 - e) * 5;
      const yaw = kart.yaw + phi;
      _ipos.set(
        kart.pos.x + Math.sin(yaw) * orbit,
        kart.pos.y + lift,
        kart.pos.z + Math.cos(yaw) * orbit
      );
      if (this.track) {
        const s = this.track.sample(_ipos);
        if (s && s.surface !== 'void' && Number.isFinite(s.height))
          _ipos.y = Math.max(_ipos.y, s.height + 1.0);
      }
      _ilook.set(kart.pos.x, kart.pos.y + 1.2, kart.pos.z);
      _pos.lerpVectors(_ipos, _pos, e * e * e);
      _look.lerpVectors(_ilook, _look, e * e * e);
      fovTarget = 68 + (fovTarget - 68) * e;
      snapFov = true;
      if (u >= 1) it.active = false;
    }

    if (snapFov) this.fov = fovTarget;
    else this.fov += (fovTarget - this.fov) * damp(dt, 5);

    // Shake
    this.shake *= Math.exp(-6 * dt);
    const shake =
      this.shake +
      0.025 * this.boostAmt +
      0.012 * speedRatio * (kart.surface === 'offroad' ? 2 : 0);
    if (shake > 0.002) {
      _pos.x += (Math.random() - 0.5) * shake * 0.6;
      _pos.y += (Math.random() - 0.5) * shake * 0.6;
      _pos.z += (Math.random() - 0.5) * shake * 0.6;
    }

    cam.position.copy(_pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(_look);

    const rollTarget = -kart.steerValue * 0.018 - this.swing * 0.035;
    this.roll += (rollTarget - this.roll) * damp(dt, 5);
    cam.rotateZ(this.roll);

    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
