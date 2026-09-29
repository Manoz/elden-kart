import { ITEMS } from '../core/data.js';

// Steering convention: inputs.steer > 0 turns right, < 0 turns left.
// Curvature convention (internal): > 0 = left turn, < 0 = right turn (seen from above, +Y up).

const CORNER_GRIP = 34; // lateral acceleration budget used for corner speeds (u/s^2)
const BRAKE_DECEL = 24; // braking capability used when planning the speed profile (u/s^2)
const DRIFT_CURV = 1 / 55; // curvature above which a corner is worth drifting
const DRIFT_MIN_RUN = 32; // shortest bend (m) worth a drift
const WALL_MARGIN = 3.2;
const DEFAULT_TOP = 42;

const profileCache = new WeakMap();
const boxCache = new WeakMap();

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Precomputes, once per track, the racing line and the corner-limited speed profile.
function getProfile(track) {
  let p = profileCache.get(track);
  if (p) return p;
  const n = clamp(Math.round(track.length / 5), 240, 1400);
  const ds = track.length / n;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const rx = new Float32Array(n);
  const rz = new Float32Array(n);
  const hw = new Float32Array(n);
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = track.getPoint(i / n);
    px[i] = s.pos.x;
    py[i] = s.pos.y;
    pz[i] = s.pos.z;
    rx[i] = s.right.x;
    rz[i] = s.right.z;
    hw[i] = s.halfWidth;
    const l = Math.hypot(s.tangent.x, s.tangent.z) || 1;
    tx[i] = s.tangent.x / l;
    tz[i] = s.tangent.z / l;
  }
  const at = (i) => ((i % n) + n) % n;

  // Signed curvature (1/m), positive = left, smoothed over ~ +-15 m.
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = at(i - 1);
    const b = at(i + 1);
    const cross = tz[a] * tx[b] - tx[a] * tz[b];
    const dot = tx[a] * tx[b] + tz[a] * tz[b];
    raw[i] = Math.atan2(cross, dot) / (2 * ds);
  }
  const win = Math.max(1, Math.round(15 / ds));
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -win; k <= win; k++) s += raw[at(i + k)];
    curv[i] = s / (2 * win + 1);
  }

  // Racing line: cut to the inside at the apex, swing wide on the approach.
  const near = Math.max(1, Math.round(10 / ds));
  const farA = Math.round(25 / ds);
  const farB = Math.round(70 / ds);
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let cn = 0;
    for (let k = -near; k <= near; k++) cn += curv[at(i + k)];
    cn /= 2 * near + 1;
    let cf = 0;
    let cnt = 0;
    for (let k = farA; k <= farB; k += 2) {
      cf += curv[at(i + k)];
      cnt++;
    }
    cf /= cnt;
    const x = -0.95 * cn + 0.45 * (cf - cn) * 0.5;
    line[i] = clamp(x * 30, -0.75, 0.75);
  }

  // Corner speed limit, then backward pass so braking starts early enough.
  const vlim = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(curv[i]);
    vlim[i] = Math.min(90, Math.sqrt(CORNER_GRIP / Math.max(k, 1e-4)));
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n * 2 - 1; i >= 0; i--) {
      const a = at(i);
      const b = at(i + 1);
      const v = Math.sqrt(vlim[b] * vlim[b] + 2 * BRAKE_DECEL * ds);
      if (v < vlim[a]) vlim[a] = v;
    }
  }

  // Length (m) of the same-direction bend that continues from each sample.
  const run = new Float32Array(n);
  const bend = (i) => Math.abs(curv[i]) > DRIFT_CURV * 0.5;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n * 2 - 1; i >= 0; i--) {
      const a = at(i);
      const b = at(i + 1);
      run[a] = bend(a) ? (bend(b) && curv[a] * curv[b] > 0 ? run[b] : 0) + ds : 0;
    }
  }

  p = { n, ds, px, py, pz, rx, rz, hw, curv, line, vlim, run, at };
  profileCache.set(track, p);
  return p;
}

// Item boxes expressed in track coordinates, computed once.
function getBoxes(track) {
  let b = boxCache.get(track);
  if (b) return b;
  b = (track.itemBoxes || []).map((pos) => {
    const s = track.sample(pos);
    return { pos, t: s.t, lateral: s.lateral };
  });
  boxCache.set(track, b);
  return b;
}

export class AIDriver {
  constructor(kart, track, { skill = 0.7, aggression = 0.5, name = 'AI' } = {}) {
    this.kart = kart;
    this.track = track;
    this.skill = clamp(skill, 0, 1);
    this.aggression = clamp(aggression, 0, 1);
    this.name = name;
    this.prof = getProfile(track);
    this.boxes = getBoxes(track);

    this.phase = Math.random() * 100;
    this.wobble = (1 - this.skill) * 1.6 + 0.2; // metres of lateral sloppiness
    this.steerSmooth = 0;
    this.overtakeOffset = 0;
    this.overtakeTimer = 0;
    this.boxTarget = null;
    this.boxTimer = 0;

    this.drifting = false;
    this.driftCooldown = 0;

    this.itemTimer = 0; // time the current item has been held
    this.itemDelay = 0.6 + Math.random() * 1.2 - this.skill * 0.5;
    this.lastItem = null;
    this.useCooldown = 0;
    this.pulse = 0;
    this.pulseBack = false;

    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.recoveries = [];
    this.time = 0;
  }

  update(dt, race, itemSystem) {
    const kart = this.kart;
    const inp = kart.inputs;
    this.time += dt;

    if (!race || race.state === 'countdown') {
      inp.throttle = 0;
      inp.brake = 0;
      inp.steer = 0;
      inp.drift = false;
      inp.useItem = false;
      return;
    }
    if ((kart.spinTimer || 0) > 0) {
      inp.useItem = false;
      inp.drift = false;
      return;
    }

    const P = this.prof;
    const pos = kart.pos;
    const yaw = kart.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const speed = Math.abs(kart.speed);
    const top = kart.topSpeed ?? kart.maxSpeed ?? this._topFromStats();
    const skillTop = top * (0.88 + 0.12 * this.skill);

    const idx = Math.floor((Number.isFinite(kart.t) ? kart.t : 0) * P.n) % P.n;
    const toIdx = (m) => idx + Math.round(m / P.ds);

    // Stuck handling first: it overrides driving.
    if (this._stuck(dt, kart, race, speed)) return;

    // Curvature preview.
    let kNext = 0; // dominant curvature 8..30 m ahead
    for (let m = 8; m <= 30; m += 4) {
      const c = P.curv[P.at(toIdx(m))];
      if (Math.abs(c) > Math.abs(kNext)) kNext = c;
    }

    // Lateral aim: racing line + overtake shift + item box + sloppiness.
    const look = 7 + speed * (0.34 + 0.06 * this.skill);
    const ia = P.at(toIdx(look));
    const halfW = P.hw[ia];
    const maxOff = Math.max(1, halfW - WALL_MARGIN);
    let lat = P.line[ia] * maxOff * (0.6 + 0.4 * this.skill);
    lat += Math.sin(this.time * 0.7 + this.phase) * this.wobble * 0.5;

    lat += this._overtake(dt, race, kart, fx, fz, rx, rz, maxOff, lat);
    lat = this._itemBoxAim(dt, kart, lat, maxOff);
    lat = clamp(lat, -maxOff, maxOff);

    const tx = P.px[ia] + P.rx[ia] * lat;
    const tz = P.pz[ia] + P.rz[ia] * lat;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    let err = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz); // > 0: target on the right

    err += this._avoidHazards(kart, itemSystem, fx, fz, rx, rz, speed, lat);

    // Human-like steering: proportional with slew limiting.
    const want = clamp(err * (1.7 + this.skill * 0.6), -1, 1);
    const slew = (5 + this.skill * 5) * dt;
    this.steerSmooth += clamp(want - this.steerSmooth, -slew, slew);
    inp.steer = this.steerSmooth;

    // Speed control.
    const ahead = P.vlim[P.at(idx + 2)];
    const grip = 0.86 + 0.2 * this.skill;
    const cornerV = Math.min(ahead, P.vlim[P.at(toIdx(speed * 0.35))]) * grip;
    const target = Math.min(skillTop, cornerV);
    const angleSlow = 1 - clamp((Math.abs(err) - 0.5) * 0.6, 0, 0.35);
    const targetV = target * angleSlow;
    if (speed < targetV - 0.5) {
      inp.throttle = 1;
      inp.brake = 0;
    } else if (speed > targetV + 3) {
      inp.throttle = 0;
      inp.brake = clamp((speed - targetV - 3) / 10, 0, 1);
    } else {
      inp.throttle = clamp((targetV - speed) / 4 + 0.6, 0.3, 1);
      inp.brake = 0;
    }

    this._drift(dt, kart, inp, kNext, P.run[P.at(toIdx(10))], P.run[P.at(idx + 1)], speed, top);
    this._items(dt, race, itemSystem, kart, inp, kNext, fx, fz, rx, rz);
  }

  _topFromStats() {
    const s = this.kart.character?.stats?.speed ?? 3;
    return DEFAULT_TOP - 4 + 2 * s;
  }

  _stuck(dt, kart, race, speed) {
    const inp = kart.inputs;
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.drift = false;
      inp.steer = -this.recoverSteer;
      inp.useItem = false;
      return true;
    }
    const trying = race.state === 'racing' && (kart.spinTimer || 0) <= 0;
    if (trying && speed < 2.5) this.stuckTimer += dt;
    else if (speed > 5) this.stuckTimer = 0;
    else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 0.5);

    if (this.stuckTimer > 3) {
      this.stuckTimer = 0;
      this.recoveries.length = 0;
      kart.respawn?.(this.track);
      return false;
    }
    if (this.stuckTimer > 1.2) {
      this.recoveries = this.recoveries.filter((t) => this.time - t < 8);
      this.recoveries.push(this.time);
      this.reverseTimer = 0.9;
      this.stuckTimer = 1.0;
      // Reverse while steering away from the side the track centre lies on.
      const s = this.track.sample(kart.pos, kart.t);
      this.recoverSteer = s.lateral > 0 ? 1 : -1;
      if (this.recoveries.length >= 3) {
        this.recoveries.length = 0;
        this.reverseTimer = 0;
        this.stuckTimer = 0;
        kart.respawn?.(this.track);
      }
    }
    return false;
  }

  _overtake(dt, race, kart, fx, fz, rx, rz, maxOff, lat) {
    this.overtakeTimer -= dt;
    if (this.overtakeTimer <= 0) {
      let best = null;
      let bestF = 26;
      for (const other of race.karts) {
        if (other === kart) continue;
        const dx = other.pos.x - kart.pos.x;
        const dz = other.pos.z - kart.pos.z;
        const f = dx * fx + dz * fz;
        const l = dx * rx + dz * rz;
        if (f > 2.5 && f < bestF && Math.abs(l) < 3.4) {
          best = { l, f };
          bestF = f;
        }
      }
      if (best) {
        // Pass on the side with more room; aggressive drivers pick the tighter line.
        const wantRight = best.l < 0 ? true : best.l > 0 ? false : lat < 0;
        const shift = 4.2 + this.aggression * 1.2;
        this.overtakeOffset = wantRight ? shift : -shift;
        if (Math.abs(lat + this.overtakeOffset) > maxOff)
          this.overtakeOffset = -this.overtakeOffset;
        this.overtakeTimer = 1.4;
      } else {
        this.overtakeOffset = 0;
        this.overtakeTimer = 0.2;
      }
    }
    return this.overtakeOffset;
  }

  _itemBoxAim(dt, kart, lat, maxOff) {
    this.boxTimer -= dt;
    if (kart.heldItem || this.skill < 0.3) {
      this.boxTarget = null;
      return lat;
    }
    if (this.boxTimer <= 0) {
      this.boxTimer = 0.5;
      const t0 = kart.t;
      let best = null;
      let bestScore = Infinity;
      for (const b of this.boxes) {
        let dt01 = b.t - t0;
        if (dt01 < 0) dt01 += 1;
        const dist = dt01 * this.track.length;
        if (dist < 10 || dist > 75) continue;
        const dl = Math.abs(b.lateral - lat);
        if (dl > maxOff * 1.1 || dl > 9) continue;
        const score = dl + dist * 0.08;
        if (score < bestScore) {
          bestScore = score;
          best = b;
        }
      }
      this.boxTarget = best;
    }
    if (!this.boxTarget) return lat;
    let d = this.boxTarget.t - kart.t;
    if (d < 0) d += 1;
    if (d * this.track.length > 80) return lat;
    return clamp(this.boxTarget.lateral, -maxOff, maxOff);
  }

  _avoidHazards(kart, itemSystem, fx, fz, rx, rz, speed, lat) {
    if (!itemSystem?.getHazards) return 0;
    const hazards = itemSystem.getHazards();
    if (!hazards || !hazards.length) return 0;
    const range = 12 + speed * 0.6;
    let push = 0;
    for (const h of hazards) {
      const dx = h.pos.x - kart.pos.x;
      const dz = h.pos.z - kart.pos.z;
      const f = dx * fx + dz * fz;
      if (f < 1 || f > range) continue;
      const l = dx * rx + dz * rz;
      const clear = (h.radius || 1.5) + 1.8;
      if (Math.abs(l) > clear + 1) continue;
      const side = Math.abs(l) < 0.4 ? (lat >= 0 ? -1 : 1) : l > 0 ? -1 : 1;
      const w = (1 - f / range) * (0.35 + 0.5 * this.skill);
      push += side * w * (1.2 - Math.abs(l) / (clear + 1));
    }
    return clamp(push, -0.9, 0.9);
  }

  _drift(dt, kart, inp, kNext, runAhead, runHere, speed, top) {
    this.driftCooldown -= dt;
    const active = kart.drift?.active;
    const turnSteer = -Math.sign(kNext); // steer sign needed to follow the corner
    if (this.drifting) {
      const wrongWay = active && kart.drift.dir * inp.steer < -0.9;
      if (Math.max(runHere, runAhead) < 6 || wrongWay || speed < top * 0.4) {
        this.drifting = false;
        this.driftCooldown = 0.5;
      }
    } else if (
      this.skill > 0.35 &&
      this.driftCooldown <= 0 &&
      !active &&
      Math.abs(kNext) > DRIFT_CURV &&
      runAhead > DRIFT_MIN_RUN &&
      speed > top * 0.55 &&
      Math.sign(inp.steer) === turnSteer &&
      Math.abs(inp.steer) > 0.3
    ) {
      this.drifting = true;
    }
    inp.drift = this.drifting;
  }

  _items(dt, race, itemSystem, kart, inp, kNext, fx, fz, rx, rz) {
    this.useCooldown -= dt;
    if (this.pulse > 0) {
      this.pulse -= dt;
      inp.useItem = true;
      if (this.pulseBack) {
        inp.throttle = 0;
        inp.brake = 1;
      }
      if (this.pulse <= 0) inp.useItem = false;
      return;
    }
    inp.useItem = false;

    const item = kart.heldItem;
    if (item !== this.lastItem) {
      this.lastItem = item;
      this.itemTimer = 0;
      this.itemDelay = 0.6 + Math.random() * 1.4 - this.skill * 0.5;
    }
    if (!item) return;
    this.itemTimer += dt;
    if (this.itemTimer < this.itemDelay || this.useCooldown > 0) return;

    // Nearest rivals ahead / behind in the kart frame.
    let ahead = null;
    let behind = null;
    for (const o of race.karts) {
      if (o === kart) continue;
      const dx = o.pos.x - kart.pos.x;
      const dz = o.pos.z - kart.pos.z;
      const f = dx * fx + dz * fz;
      const l = dx * rx + dz * rz;
      if (f > 0 && (!ahead || f < ahead.f)) ahead = { f, l, kart: o };
      if (f < 0 && (!behind || -f < behind.f)) behind = { f: -f, l, kart: o };
    }
    const straight = Math.abs(kNext) < DRIFT_CURV * 0.6 && !this.drifting;
    const held = this.itemTimer;
    const fire = (back = false) => {
      this.pulse = 0.09;
      this.pulseBack = back;
      this.useCooldown = 0.9;
      inp.useItem = true;
      if (back) {
        inp.throttle = 0;
        inp.brake = 1;
      }
    };

    switch (item) {
      case ITEMS.CRIMSON_FLASK:
      case ITEMS.GOLDEN_RUNE:
      case ITEMS.TORRENT_CALL:
      case ITEMS.BLOODHOUND_STEP:
        if (straight || held > 6) fire();
        break;
      case ITEMS.ERDTREE_BLESSING:
        fire();
        break;
      case ITEMS.STONESWORD_KEY:
        if ((behind && behind.f < 35) || held > 5 || this.skill < 0.5) fire();
        break;
      case ITEMS.ROT_POT:
        if (behind && behind.f < 22 && Math.abs(behind.l) < 7) fire(true);
        else if (
          held > 14 ||
          (ahead && ahead.f < 6 && Math.abs(ahead.l) < 2.5 && this.aggression > 0.6)
        )
          fire(true);
        break;
      case ITEMS.FIRE_POT:
        if (ahead && ahead.f < 42 && ahead.f > 5 && Math.abs(ahead.l) < 6 + this.aggression * 2)
          fire(false);
        else if (held > 10) fire(false);
        break;
      case ITEMS.GLINTSTONE_MISSILE:
        if (ahead && ahead.f < 70) fire(false);
        else if (held > 8) fire(false);
        break;
      case ITEMS.BLACK_KNIFE:
        if (kart.place > 1 || held > 8) fire(false);
        break;
      default:
        if (held > 3) fire();
    }
  }
}

// Skill/aggression per non-player character.
const PERSONALITIES = {
  tarnished: { skill: 0.78, aggression: 0.5 },
  ranni: { skill: 0.84, aggression: 0.35 },
  malenia: { skill: 0.95, aggression: 0.8 },
  radahn: { skill: 0.85, aggression: 0.9 },
  melina: { skill: 0.7, aggression: 0.3 },
  blaidd: { skill: 0.8, aggression: 0.6 },
  patches: { skill: 0.62, aggression: 0.85 },
  godrick: { skill: 0.66, aggression: 0.7 },
};

// Returns an array of { id, characterId, skill, aggression, name } for every character except the player's.
// Each entry is also reachable as roster[characterId] and roster.byId[characterId].
export function createAIRoster(characters, playerCharacterId) {
  const roster = [];
  const byId = {};
  for (const c of characters) {
    if (c.id === playerCharacterId) continue;
    const p = PERSONALITIES[c.id] || { skill: 0.7, aggression: 0.5 };
    const entry = {
      id: c.id,
      characterId: c.id,
      skill: p.skill,
      aggression: p.aggression,
      name: c.name,
    };
    roster.push(entry);
    byId[c.id] = entry;
    Object.defineProperty(roster, c.id, { value: entry, enumerable: false });
  }
  Object.defineProperty(roster, 'byId', { value: byId, enumerable: false });
  return roster;
}
