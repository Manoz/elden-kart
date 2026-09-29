import * as THREE from 'three';
import { bus } from '../core/bus.js';

const GRAVITY = 42;
const RADIUS = 1.1;
const MAX_STEP = 1 / 60;
const DRIFT_LEVELS = [0.85, 1.8, 2.9];
const DRIFT_BOOST = [
  { time: 0.7, power: 0.75 },
  { time: 1.2, power: 0.9 },
  { time: 2.0, power: 1.1 },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

let blobTexture = null;
let blobGeometry = null;
let blobMaterial = null;

function getBlob() {
  if (!blobMaterial) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    blobTexture = new THREE.CanvasTexture(c);
    blobGeometry = new THREE.PlaneGeometry(1, 1);
    blobGeometry.rotateX(-Math.PI / 2);
    blobMaterial = new THREE.MeshBasicMaterial({
      map: blobTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }
  return { geometry: blobGeometry, material: blobMaterial };
}

const _m = new THREE.Matrix4();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();

export class Kart {
  // speedScale is the engine class multiplier (100cc/150cc/200cc).
  constructor({ id, character, isPlayer = false, track = null, scene = null, speedScale = 1 }) {
    this.id = id;
    this.character = character;
    this.isPlayer = isPlayer;
    this.scene = scene;

    this.mesh = new THREE.Group();
    this.mesh.name = `kart-${id}`;
    this.model = null;

    const blob = getBlob();
    this.blob = new THREE.Mesh(blob.geometry, blob.material);
    this.blob.scale.set(3.4, 1, 4.2);
    this.blob.renderOrder = 1;
    this.mesh.add(this.blob);

    this.pos = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.t = 0;
    this.lapProgress = 0;

    this.lap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.place = 1;
    this.rank = 1;

    this.inputs = { throttle: 0, brake: 0, steer: 0, drift: false, useItem: false };
    this.heldItem = null;
    this.itemCount = 0;

    this.drift = { active: false, dir: 0, charge: 0, level: 0 };
    this.boostTimer = 0;
    this.boostPower = 0;
    this.invincibleTimer = 0;
    this.spinTimer = 0;
    this.spinDuration = 1.3;
    this.shielded = false;
    this.hitKind = null;
    this.squashTimer = 0;
    this.poisonTimer = 0;

    // Read-only extras for visuals / camera / other systems.
    this.grounded = true;
    this.airTime = 0;
    this.height = 0;
    this.lateral = 0;
    this.surface = 'road';
    this.steerValue = 0;
    this.sample = null;
    this.radius = RADIUS;
    this.mass = 0.6 + this.character.stats.weight * 0.4;

    this._vx = 0;
    this._vz = 0;
    this._vy = 0;
    this._normal = new THREE.Vector3(0, 1, 0);
    this._driftLocked = false;
    this._prevDrift = false;
    this._voidTime = 0;
    this._safeT = 0;
    this._safeTimer = 0;
    this._padCd = 0;
    this._wallCd = 0;
    this._bumpCd = 0;
    this._hopping = false;

    const s = this.character.stats;
    this._maxSpeed = (36.4 + s.speed * 1.2) * speedScale;
    this.topSpeed = this._maxSpeed;
    this._accel = (9 + s.accel * 3.2) * (0.4 + 0.6 * speedScale);
    this._turn = (1.7 + s.handling * 0.22) * (1 + (speedScale - 1) * 0.45);
    this._grip = (7 + s.handling) * (1 + (speedScale - 1) * 0.6);

    if (scene) scene.add(this.mesh);
    if (track) this.placeAt(track);
  }

  // Positions the kart on the track surface at (pos, yaw), stationary.
  placeAt(track, pos, yaw) {
    if (pos) this.pos.copy(pos);
    if (yaw !== undefined) this.yaw = yaw;
    const s = track.sample(this.pos);
    this.t = s.t;
    this._safeT = s.t;
    this.sample = s;
    this.pos.y = s.height;
    this.height = s.height;
    this.lateral = s.lateral;
    this.surface = s.surface;
    this._normal.copy(s.normal);
    this._vx = this._vz = this._vy = 0;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this._syncMesh(0);
  }

  setModel(model) {
    if (this.model && this.model.group) this.mesh.remove(this.model.group);
    this.model = model || null;
    if (this.model && this.model.group) {
      this.mesh.add(this.model.group);
    } else if (!this.model) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.7, 2.2),
        new THREE.MeshStandardMaterial({ color: this.character.color })
      );
      box.position.y = 0.6;
      const holder = new THREE.Group();
      holder.add(box);
      this.model = { group: holder, update() {} };
      this.mesh.add(holder);
    }
  }

  get airborne() {
    return !this.grounded;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }

  applyBoost(seconds, power = 1) {
    const boosting = this.boostTimer > 0.05;
    this.boostTimer = Math.max(this.boostTimer, seconds);
    this.boostPower = Math.max(boosting ? this.boostPower : 0, power);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this._vx += fx * 3 * power;
    this._vz += fz * 3 * power;
    bus.emit('kart:boost', { kart: this, power });
  }

  hit(kind) {
    if (this.invincibleTimer > 0 || this.spinTimer > 0) return false;
    if (this.shielded) {
      this.shielded = false;
      this.invincibleTimer = 0.6;
      bus.emit('kart:shield', { kart: this });
      return false;
    }
    this._endDrift(false);
    this.hitKind = kind;
    switch (kind) {
      case 'explode':
        this.spinTimer = this.spinDuration = 1.6;
        this._vx *= 0.25;
        this._vz *= 0.25;
        this._vy = 15;
        this.grounded = false;
        this.airTime = 0;
        this.boostTimer = 0;
        break;
      case 'squash':
        this.squashTimer = 2.5;
        this._vx *= 0.4;
        this._vz *= 0.4;
        this.boostTimer = 0;
        break;
      case 'poison':
        this.poisonTimer = 3;
        this.boostTimer = 0;
        break;
      case 'spin':
      default:
        this.spinTimer = this.spinDuration = 1.3;
        this.boostTimer = 0;
        break;
    }
    bus.emit('kart:hit', { kart: this, kind });
    return true;
  }

  respawn(track) {
    const p = track.getPoint(this._safeT);
    this.pos.copy(p.pos);
    this.yaw = Math.atan2(-p.tangent.x, -p.tangent.z);
    const s = track.sample(this.pos, this._safeT);
    this.t = s.t;
    this.sample = s;
    this.pos.y = s.surface === 'void' ? p.pos.y : s.height;
    this.height = this.pos.y;
    this._normal.copy(s.normal);
    this._vx = this._vz = this._vy = 0;
    this.speed = 0;
    this.grounded = true;
    this.airTime = 0;
    this._voidTime = 0;
    this._endDrift(false);
    this._driftLocked = true;
    this.boostTimer = 0;
    this.boostPower = 0;
    this.spinTimer = 0;
    this.squashTimer = 0;
    this.poisonTimer = 0;
    this.hitKind = null;
    this.invincibleTimer = 2.5;
    this.velocity.set(0, 0, 0);
    this._syncMesh(0);
    bus.emit('kart:respawn', { kart: this });
  }

  _endDrift(release) {
    const d = this.drift;
    if (!d.active) return;
    const level = d.level;
    d.active = false;
    d.dir = 0;
    d.charge = 0;
    d.level = 0;
    bus.emit('kart:drift', { kart: this, level: 0, released: release });
    if (release && level > 0) {
      const b = DRIFT_BOOST[level - 1];
      this.applyBoost(b.time, b.power);
    }
  }

  update(dt, track) {
    dt = clamp(num(dt), 0, 0.1);
    if (dt <= 0) return;
    const n = Math.ceil(dt / MAX_STEP);
    const h = dt / n;
    for (let i = 0; i < n; i++) this._step(h, track);
    this._syncMesh(dt);
  }

  _step(h, track) {
    const inp = this.inputs;
    const d = this.drift;

    // Timers
    if (this.invincibleTimer > 0) this.invincibleTimer = Math.max(0, this.invincibleTimer - h);
    if (this.squashTimer > 0) this.squashTimer = Math.max(0, this.squashTimer - h);
    if (this.poisonTimer > 0) this.poisonTimer = Math.max(0, this.poisonTimer - h);
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - h);
      if (this.boostTimer === 0) this.boostPower = 0;
    }
    if (this.spinTimer > 0) {
      this.spinTimer = Math.max(0, this.spinTimer - h);
      if (this.spinTimer === 0) {
        this.hitKind = null;
        this.invincibleTimer = Math.max(this.invincibleTimer, 1.2);
      }
    }
    this._padCd = Math.max(0, this._padCd - h);
    this._wallCd = Math.max(0, this._wallCd - h);
    this._bumpCd = Math.max(0, this._bumpCd - h);

    // Track sample
    const s = track.sample(this.pos, this.t);
    this.sample = s;
    this.t = s.t;
    this.lateral = s.lateral;
    this.surface = s.surface;
    const surface = s.surface;
    const isVoid = surface === 'void';
    const groundY = num(s.height, this.pos.y);
    if (!isVoid) this.height = groundY;

    // Safe respawn point bookkeeping
    if (
      this.grounded &&
      !isVoid &&
      surface !== 'offroad' &&
      surface !== 'rot' &&
      Math.abs(s.lateral) < s.halfWidth * 0.85
    ) {
      this._safeTimer += h;
      if (this._safeTimer > 0.4) {
        this._safeTimer = 0;
        this._safeT = s.t;
      }
    }

    // Surface effects
    let surfMax = 1;
    let surfAccel = 1;
    const immune = this.invincibleTimer > 0 || this.boostTimer > 0.05;
    if (this.grounded) {
      if (surface === 'offroad') {
        surfMax = immune ? 0.85 : 0.55;
        surfAccel = 0.7;
      } else if (surface === 'rot') {
        surfMax = immune ? 0.85 : 0.45;
        surfAccel = 0.6;
        if (!immune) {
          if (this.poisonTimer <= 0) bus.emit('kart:hit', { kart: this, kind: 'poison' });
          this.poisonTimer = Math.max(this.poisonTimer, 1.0);
        }
      } else if (surface === 'boost' && this._padCd <= 0) {
        this._padCd = 0.8;
        this.applyBoost(1.0, 1.0);
      }
    }

    // Controls
    const controllable = this.spinTimer <= 0 && this._voidTime <= 0.05;
    const throttle = controllable ? clamp(num(inp.throttle), 0, 1) : 0;
    const brake = controllable ? clamp(num(inp.brake), 0, 1) : 0;
    const steerIn = controllable ? clamp(num(inp.steer), -1, 1) : 0;
    const wantDrift = controllable && !!inp.drift;
    this.steerValue += (steerIn - this.steerValue) * (1 - Math.exp(-14 * h));

    let fx = -Math.sin(this.yaw);
    let fz = -Math.cos(this.yaw);
    let fwd = this._vx * fx + this._vz * fz;

    // Drift state machine
    if (!wantDrift) this._driftLocked = false;
    if (!d.active) {
      if (wantDrift && !this._driftLocked && this.grounded && fwd > 15 && Math.abs(steerIn) > 0.3) {
        d.active = true;
        d.dir = Math.sign(steerIn);
        d.charge = 0;
        d.level = 0;
        this._vy = 4.5;
        this.grounded = false;
        this.airTime = 0;
        this._hopping = true;
        bus.emit('kart:drift', { kart: this, level: 0 });
      }
    } else {
      if (!wantDrift) {
        this._endDrift(true);
      } else if (fwd < 9 || this.airTime > 0.8) {
        this._endDrift(true);
        this._driftLocked = true;
      } else if (this.grounded) {
        const align = Math.max(0, steerIn * d.dir);
        d.charge += h * (1.1 + 0.5 * align);
        let lv = 0;
        for (let i = 0; i < DRIFT_LEVELS.length; i++) if (d.charge >= DRIFT_LEVELS[i]) lv = i + 1;
        if (lv > d.level) {
          d.level = lv;
          bus.emit('kart:drift', { kart: this, level: lv });
        }
      }
    }

    // Steering (positive yaw turns left, positive steer turns right)
    const absF = Math.abs(fwd);
    const sf = clamp(absF / 10, 0, 1) * (1 - 0.35 * clamp((absF - 20) / 25, 0, 1));
    const dirSign = fwd >= -0.5 ? 1 : -1;
    let yawRate;
    if (d.active) {
      const k = 0.85 + 0.4 * steerIn * d.dir;
      yawRate = -d.dir * this._turn * 1.05 * k * sf;
    } else {
      yawRate = -this.steerValue * this._turn * sf * dirSign;
    }
    if (!this.grounded) yawRate *= d.active ? 0.9 : 0.4;
    this.yaw += yawRate * h;
    // Momentum follows the heading; drifting keeps part of it so the kart slides.
    const carry = !this.grounded ? 0 : d.active ? 0.75 : 1;
    if (carry > 0) {
      const a = yawRate * h * carry;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nvx = this._vx * ca + this._vz * sa;
      this._vz = this._vz * ca - this._vx * sa;
      this._vx = nvx;
    }
    fx = -Math.sin(this.yaw);
    fz = -Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;

    // Longitudinal / lateral velocity
    fwd = this._vx * fx + this._vz * fz;
    let lat = this._vx * rx + this._vz * rz;

    const boosting = this.boostTimer > 0;
    let maxEff = this._maxSpeed;
    if (boosting) {
      maxEff *= 1 + 0.42 * this.boostPower;
      surfMax = surfMax + (1 - surfMax) * 0.75;
    }
    maxEff *= surfMax;
    if (!this.isPlayer && this.aiSpeedScale) maxEff *= this.aiSpeedScale;
    if (this.poisonTimer > 0) maxEff *= 0.65;
    if (this.squashTimer > 0) maxEff *= 0.6;

    if (this.grounded) {
      const net = throttle - brake;
      if (this.spinTimer > 0) {
        fwd *= Math.exp(-2.4 * h);
        lat *= Math.exp(-3 * h);
      } else if (net > 0.02) {
        if (fwd < maxEff) {
          const ratio = clamp(fwd / maxEff, 0, 1);
          const rate = boosting ? 60 : this._accel * surfAccel * (1 - 0.72 * ratio * ratio);
          fwd = Math.min(maxEff, fwd + rate * net * h);
        }
      } else if (net < -0.02) {
        if (fwd > 0.5) fwd = Math.max(0, fwd - 48 * -net * h);
        else fwd = Math.max(-11, fwd - 22 * -net * h);
      } else {
        const drag = 4 + 0.07 * Math.abs(fwd);
        fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), drag * h);
      }
      if (fwd > maxEff) fwd = Math.max(maxEff, fwd - (boosting ? 8 : 26) * h);

      // Slopes: gravity component along the heading.
      const n = this._normal;
      fwd += ((n.x * fx + n.z * fz) / Math.max(n.y, 0.5)) * 12 * h;

      const grip = d.active ? 2.6 : surface === 'offroad' || surface === 'rot' ? 6 : this._grip;
      lat *= Math.exp(-grip * h);
    } else {
      lat *= Math.exp(-0.3 * h);
    }

    this._vx = fx * fwd + rx * lat;
    this._vz = fz * fwd + rz * lat;

    // Integrate horizontally
    this.pos.x += this._vx * h;
    this.pos.z += this._vz * h;

    // Walls
    for (let i = 0; i < 2; i++) {
      const c = track.constrain(this.pos, RADIUS);
      if (!c) break;
      this.pos.x += num(c.push.x);
      this.pos.z += num(c.push.z);
      let nx = num(c.normal.x);
      let nz = num(c.normal.z);
      const nl = Math.hypot(nx, nz);
      if (nl < 1e-4) break;
      nx /= nl;
      nz /= nl;
      if (nx * c.push.x + nz * c.push.z < 0) {
        nx = -nx;
        nz = -nz;
      }
      const vn = this._vx * nx + this._vz * nz;
      if (vn < 0) {
        const force = -vn;
        this._vx -= 1.35 * vn * nx;
        this._vz -= 1.35 * vn * nz;
        const keep = 1 - Math.min(0.35, force * 0.012);
        this._vx *= keep;
        this._vz *= keep;
        if (force > 4 && this._wallCd <= 0) {
          this._wallCd = 0.3;
          bus.emit('kart:wall', { kart: this, force });
        }
        if (force > 14 && d.active) this._endDrift(false);
      }
    }

    // Vertical
    if (this.grounded) {
      const ballistic = this.pos.y + this._vy * h - 0.5 * GRAVITY * h * h;
      if (isVoid || groundY < ballistic - 0.06) {
        this.grounded = false;
        this.airTime = 0;
      } else {
        const vyT = clamp((groundY - this.pos.y) / h, -40, 40);
        this._vy = this._vy * 0.5 + vyT * 0.5;
        this.pos.y = groundY;
      }
    } else {
      this._vy -= GRAVITY * h;
      this.pos.y += this._vy * h;
      this.airTime += h;
      if (!isVoid && this.pos.y <= groundY && this._vy <= 0) {
        this.pos.y = groundY;
        this.grounded = true;
        this._vy = 0;
        if (this.airTime > 0.35 && !this._hopping) bus.emit('kart:land', { kart: this });
        this._hopping = false;
      } else if (this._hopping && this.airTime > 0.5) {
        this._hopping = false;
      }
    }

    // Falling off the world
    if (isVoid && !this.grounded) {
      // Only a kart that has dropped below the last known ground counts as fallen; a jump across a gap is safe.
      const below = this.height - this.pos.y;
      if (below > 3) this._voidTime += h;
      if (this._voidTime > 0.8 || below > 40) {
        this.respawn(track);
        return;
      }
    } else {
      this._voidTime = 0;
    }

    this.speed = this._vx * fx + this._vz * fz;
    this.velocity.set(this._vx, this._vy, this._vz);
  }

  _syncMesh(dt) {
    const target = this.grounded && this.sample ? this.sample.normal : _u.set(0, 1, 0);
    if (dt > 0) this._normal.lerp(target, 1 - Math.exp(-10 * dt));
    else this._normal.copy(target);
    if (this._normal.lengthSq() < 1e-6) this._normal.set(0, 1, 0);
    this._normal.normalize();

    const up = this._normal;
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _f.addScaledVector(up, -_f.dot(up)).normalize();
    _r.crossVectors(_f, up).normalize();
    _f.crossVectors(up, _r);
    _m.makeBasis(_r, up, _f.negate());
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.mesh.position.copy(this.pos);

    const sq =
      this.squashTimer > 0 ? Math.min(1, this.squashTimer * 4, (2.5 - this.squashTimer) * 8) : 0;
    this.mesh.scale.set(1 + 0.15 * sq, 1 - 0.55 * sq, 1 + 0.15 * sq);

    const above = clamp(this.pos.y - this.height, 0, 6);
    this.blob.position.y = -above + 0.06;
    const fade = 1 - above / 8;
    this.blob.scale.set(3.4 * fade, 1, 4.2 * fade);

    if (dt > 0 && this.model && this.model.update) this.model.update(dt, this);
  }

  // Weight-based kart-kart bump. Returns impact force (0 if no contact).
  static collide(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const min = a.radius + b.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || Math.abs(a.pos.y - b.pos.y) > 1.8) return 0;
    let dist = Math.sqrt(d2);
    let nx;
    let nz;
    if (dist < 1e-4) {
      nx = 1;
      nz = 0;
      dist = 0;
    } else {
      nx = dx / dist;
      nz = dz / dist;
    }
    const overlap = min - dist;
    const ia = 1 / a.mass;
    const ib = 1 / b.mass;
    const share = 1 / (ia + ib);
    a.pos.x -= nx * overlap * ia * share;
    a.pos.z -= nz * overlap * ia * share;
    b.pos.x += nx * overlap * ib * share;
    b.pos.z += nz * overlap * ib * share;

    const vn = (a._vx - b._vx) * nx + (a._vz - b._vz) * nz;
    if (vn <= 0) return 0;
    const j = 1.5 * vn * share;
    a._vx -= j * ia * nx;
    a._vz -= j * ia * nz;
    b._vx += j * ib * nx;
    b._vz += j * ib * nz;
    if (vn > 2.5 && a._bumpCd <= 0 && b._bumpCd <= 0) {
      a._bumpCd = b._bumpCd = 0.25;
      bus.emit('kart:bump', { a, b, force: vn });
    }
    return vn;
  }
}
