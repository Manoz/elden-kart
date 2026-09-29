import * as THREE from 'three';
import { bus } from '../core/bus.js';
import { ITEMS } from '../core/data.js';
import { ItemAssets } from './ItemAssets.js';

const TAU = Math.PI * 2;

const ROLL_TIME = 1.2;
const BOX_RESPAWN = 3.0;
const BOX_RADIUS = 2.3;
const BOX_LIFT = 1.3;

const POT_GRAVITY = 32;
const FIRE_MAX_BOUNCES = 4;
const FIRE_BLAST_RADIUS = 4.2;
const PUDDLE_RADIUS = 2.3;
const PUDDLE_LIFE = 24;
const MISSILE_SPEED = 62;
const KNIFE_SPEED = 74;

const C_BLUE = [0.4, 0.8, 2.8];
const C_VIOLET = [1.4, 0.15, 0.9];
const C_ORANGE = [2.6, 1.0, 0.2];
const C_GOLD = [2.2, 1.55, 0.45];
const C_GHOST = [0.6, 1.2, 2.6];

// [item, weight for 1st place, weight for last place, minimum rank fraction (0 = 1st, 1 = last)]
const ROLL_TABLE = [
  [ITEMS.CRIMSON_FLASK, 30, 10, 0],
  [ITEMS.GOLDEN_RUNE, 5, 18, 0.15],
  [ITEMS.ROT_POT, 30, 4, 0],
  [ITEMS.FIRE_POT, 26, 6, 0],
  [ITEMS.GLINTSTONE_MISSILE, 0, 22, 0.25],
  [ITEMS.BLACK_KNIFE, 0, 8, 0.6],
  [ITEMS.ERDTREE_BLESSING, 0, 14, 0.6],
  [ITEMS.BLOODHOUND_STEP, 6, 12, 0],
  [ITEMS.STONESWORD_KEY, 14, 9, 0],
  [ITEMS.TORRENT_CALL, 0, 16, 0.4],
];

const HIT_NONE = 0;
const HIT_LANDED = 1;
const HIT_BLOCKED = 2;

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

class Pool {
  constructor(make, root) {
    this.make = make;
    this.root = root;
    this.free = [];
    this.all = [];
  }

  get() {
    let o = this.free.pop();
    if (!o) {
      o = this.make();
      this.all.push(o);
      this.root.add(o);
    }
    o.visible = true;
    return o;
  }

  put(o) {
    o.visible = false;
    this.free.push(o);
  }

  dispose() {
    this.all.forEach((o) => {
      this.root.remove(o);
      if (o.userData.ownMat && o.material) o.material.dispose();
    });
    this.all.length = 0;
    this.free.length = 0;
  }
}

export class ItemSystem {
  constructor({ scene, track, karts, fx }) {
    this.scene = scene;
    this.track = track;
    this.karts = karts;
    this.fx = fx || null;
    this.time = 0;
    this.assets = new ItemAssets();
    this.root = new THREE.Group();
    this.root.name = 'ItemSystem';
    scene.add(this.root);

    this.states = new Map();
    this.hazards = [];
    this.pots = [];
    this.puddles = [];
    this.seekers = [];
    this.ghosts = [];

    const a = this.assets;
    this.poolRotPot = new Pool(() => a.makeRotPot(), this.root);
    this.poolFirePot = new Pool(() => a.makeFirePot(), this.root);
    this.poolPuddle = new Pool(() => a.makePuddle(), this.root);
    this.poolMissile = new Pool(() => a.makeMissile(), this.root);
    this.poolKnife = new Pool(() => a.makeKnife(), this.root);
    this.poolKeys = new Pool(() => a.makeKeys(), this.root);
    this.poolShell = new Pool(() => a.makeShell(), this.root);
    this.poolHorse = new Pool(() => a.makeGhost('horse'), this.root);
    this.poolHound = new Pool(() => a.makeGhost('hound'), this.root);
    this.pools = [
      this.poolRotPot,
      this.poolFirePot,
      this.poolPuddle,
      this.poolMissile,
      this.poolKnife,
      this.poolKeys,
      this.poolShell,
      this.poolHorse,
      this.poolHound,
    ];

    this.boxes = (track.itemBoxes || []).map((p, i) => {
      const mesh = a.makeItemBox();
      mesh.position.set(p.x, p.y + BOX_LIFT, p.z);
      this.root.add(mesh);
      return { pos: p, mesh, active: true, timer: 0, appear: 1, phase: i * 0.7 };
    });
  }

  // ---------------------------------------------------------------- public API

  rollItem(kart) {
    const n = this.karts.length;
    const rank = this._rank(kart);
    const f = n > 1 ? (rank - 1) / (n - 1) : 0;
    let total = 0;
    for (let i = 0; i < ROLL_TABLE.length; i++) {
      const [id, w0, w1, min] = ROLL_TABLE[i];
      if (f < min || (id === ITEMS.BLACK_KNIFE && rank <= 1)) continue;
      total += w0 + (w1 - w0) * f;
    }
    let r = Math.random() * total;
    for (let i = 0; i < ROLL_TABLE.length; i++) {
      const [id, w0, w1, min] = ROLL_TABLE[i];
      if (f < min || (id === ITEMS.BLACK_KNIFE && rank <= 1)) continue;
      r -= w0 + (w1 - w0) * f;
      if (r <= 0) return id;
    }
    return ITEMS.CRIMSON_FLASK;
  }

  isRolling(kart) {
    return this._st(kart).rolling;
  }

  // Immediately hand an item over (debug / scripted use).
  giveItem(kart, item) {
    const st = this._st(kart);
    st.rolling = false;
    kart.itemRolling = false;
    kart.heldItem = item;
    kart.itemCount = item === ITEMS.GOLDEN_RUNE ? 3 : 1;
    bus.emit('item:got', { kart, item });
  }

  useItem(kart) {
    const item = kart.heldItem;
    const st = this._st(kart);
    if (!item || st.rolling) return;
    const backward = kart.inputs && kart.inputs.brake > 0.3;
    const p = kart.pos;
    const fx = -Math.sin(kart.yaw);
    const fz = -Math.cos(kart.yaw);

    if (item === ITEMS.GOLDEN_RUNE) {
      kart.itemCount = Math.max(0, (kart.itemCount || 3) - 1);
      if (kart.itemCount <= 0) kart.heldItem = null;
    } else {
      kart.heldItem = null;
      kart.itemCount = 0;
    }

    switch (item) {
      case ITEMS.CRIMSON_FLASK:
        kart.applyBoost(1.2, 1);
        this._fx('glint', p.x, p.y + 1.6, p.z, { color: [2.6, 0.4, 0.3], count: 4, size: 1.6 });
        this._fx('spark', p.x, p.y + 0.8, p.z, { color: [2.6, 0.3, 0.2], count: 10 });
        break;
      case ITEMS.GOLDEN_RUNE:
        kart.applyBoost(1.0, 1.05);
        this._fx('rune', p.x, p.y + 1.0, p.z, { count: 10 });
        break;
      case ITEMS.ROT_POT:
        this._useRotPot(kart, backward, fx, fz);
        break;
      case ITEMS.FIRE_POT:
        this._useFirePot(kart, backward, fx, fz);
        break;
      case ITEMS.GLINTSTONE_MISSILE:
        this._launchSeeker(kart, 'missile', backward, fx, fz);
        break;
      case ITEMS.BLACK_KNIFE:
        this._launchSeeker(kart, 'knife', false, fx, fz);
        break;
      case ITEMS.ERDTREE_BLESSING:
        kart.invincibleTimer = Math.max(kart.invincibleTimer || 0, 8);
        kart.applyBoost(3.0, 1.15);
        st.blessT = 8;
        if (!st.shell) {
          st.shell = this.poolShell.get();
        }
        this._fx('rune', p.x, p.y + 1.0, p.z, { count: 18, speed: 4 });
        this._fx('glint', p.x, p.y + 1.5, p.z, { count: 6, size: 2 });
        break;
      case ITEMS.BLOODHOUND_STEP:
        kart.invincibleTimer = Math.max(kart.invincibleTimer || 0, 1.3);
        kart.applyBoost(1.0, 1.6);
        st.houndT = 1.0;
        st.ghostCd = 0;
        this._fx('spark', p.x, p.y + 0.8, p.z, { color: C_VIOLET.map((c) => c * 1.6), count: 16 });
        break;
      case ITEMS.STONESWORD_KEY:
        kart.shielded = true;
        st.keysT = 25;
        if (!st.keys) st.keys = this.poolKeys.get();
        this._fx('glint', p.x, p.y + 1.0, p.z, { count: 5, size: 1.4, color: C_GOLD });
        break;
      case ITEMS.TORRENT_CALL:
        kart.applyBoost(4.0, 1.25);
        st.horseT = 4.0;
        st.ghostCd = 0;
        this._fx('glint', p.x, p.y + 1.2, p.z, { count: 8, size: 2, color: C_GHOST });
        this._fx('rune', p.x, p.y + 0.6, p.z, { count: 10, color: C_GHOST });
        break;
      default:
        break;
    }
    bus.emit('item:used', { kart, item });
  }

  getHazards() {
    return this.hazards;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this._updateBoxes(dt);
    this._updateKarts(dt);
    this._updatePots(dt);
    this._updatePuddles(dt);
    this._updateSeekers(dt);
    this._updateGhosts(dt);
    this._buildHazards();
  }

  dispose() {
    this.karts.forEach((k) => {
      const st = this.states.get(k);
      if (st && st.keys) k.shielded = false;
    });
    this.scene.remove(this.root);
    this.pools.forEach((p) => p.dispose());
    this.boxes.length = 0;
    this.pots.length = 0;
    this.puddles.length = 0;
    this.seekers.length = 0;
    this.ghosts.length = 0;
    this.states.clear();
    this.assets.dispose();
  }

  // ---------------------------------------------------------------- helpers

  _st(kart) {
    let s = this.states.get(kart);
    if (!s) {
      s = {
        rolling: false,
        rollT: 0,
        prevUse: false,
        hitCd: 0,
        keys: null,
        keysT: 0,
        shell: null,
        blessT: 0,
        houndT: 0,
        horseT: 0,
        ghostCd: 0,
        trailAcc: 0,
      };
      this.states.set(kart, s);
    }
    return s;
  }

  _fx(name, x, y, z, opts) {
    if (!this.fx) return;
    _v.set(x, y, z);
    this.fx.emit(name, _v, opts);
  }

  _prog(k) {
    return k.lapProgress != null ? k.lapProgress : (k.lap || 0) + (k.t || 0);
  }

  _rank(kart) {
    if (kart.place >= 1) return kart.place;
    const mine = this._prog(kart);
    let r = 1;
    for (let i = 0; i < this.karts.length; i++) {
      if (this.karts[i] !== kart && this._prog(this.karts[i]) > mine) r++;
    }
    return r;
  }

  // Nearest kart ahead (dir > 0) or behind (dir < 0) in race progress; null if none.
  _findTarget(owner, dir) {
    const mine = this._prog(owner);
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      if (k === owner) continue;
      const d = (this._prog(k) - mine) * dir;
      if (d > 0 && d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  _leader(owner) {
    let best = null;
    let bestP = -Infinity;
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      if (k === owner) continue;
      const p = this._prog(k);
      if (p > bestP) {
        bestP = p;
        best = k;
      }
    }
    return best;
  }

  // Applies a hit honouring shield / invincibility. Returns HIT_NONE when ignored.
  _applyHit(kart, kind) {
    const st = this._st(kart);
    if (kart.invincibleTimer > 0 || st.hitCd > 0) return HIT_NONE;
    if (kart.shielded) {
      kart.shielded = false;
      this._breakKeys(kart, st);
      return HIT_BLOCKED;
    }
    kart.hit(kind);
    st.hitCd = 0.5;
    return HIT_LANDED;
  }

  _breakKeys(kart, st) {
    if (st.keys) {
      this.poolKeys.put(st.keys);
      st.keys = null;
      st.keysT = 0;
    }
    const p = kart.pos;
    this._fx('glint', p.x, p.y + 1.0, p.z, { count: 8, size: 2.2, color: C_GOLD });
    this._fx('rune', p.x, p.y + 1.0, p.z, { count: 10 });
    this._fx('spark', p.x, p.y + 1.0, p.z, { count: 12, color: C_GOLD });
    bus.emit('item:shield-break', { kart });
  }

  _ground(pos, hint) {
    const s = this.track.sample(pos, hint);
    return s;
  }

  // ---------------------------------------------------------------- item boxes / roulette

  _updateBoxes(dt) {
    const t = this.time;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.active = true;
          b.appear = 0;
          b.mesh.visible = true;
          this._fx('glint', b.pos.x, b.pos.y + BOX_LIFT, b.pos.z, {
            count: 3,
            size: 1.6,
            color: C_GOLD,
          });
        }
        continue;
      }
      const m = b.mesh;
      const u = m.userData;
      if (b.appear < 1) {
        b.appear = Math.min(1, b.appear + dt * 2.5);
        const e = b.appear;
        // ease-out-back
        const s = 1 + 2.7 * Math.pow(e - 1, 3) + 1.7 * Math.pow(e - 1, 2);
        m.scale.setScalar(Math.max(0.01, s));
      }
      u.cube.rotation.y += dt * 1.5;
      u.cube.rotation.x += dt * 0.8;
      u.cage.rotation.y -= dt * 0.9;
      u.cage.rotation.z += dt * 0.6;
      u.core.rotation.y += dt * 3;
      u.core.rotation.x -= dt * 2;
      m.position.y = b.pos.y + BOX_LIFT + Math.sin(t * 2 + b.phase) * 0.22;
      u.halo.scale.setScalar(5.0 + Math.sin(t * 3 + b.phase) * 0.7);

      for (let k = 0; k < this.karts.length; k++) {
        const kart = this.karts[k];
        const st = this._st(kart);
        if (st.rolling || kart.heldItem) continue;
        const dx = kart.pos.x - b.pos.x;
        const dz = kart.pos.z - b.pos.z;
        if (dx * dx + dz * dz > BOX_RADIUS * BOX_RADIUS) continue;
        if (Math.abs(kart.pos.y - b.pos.y) > 3.5) continue;
        this._pickup(b, kart, st);
        break;
      }
    }
  }

  _pickup(b, kart, st) {
    b.active = false;
    b.timer = BOX_RESPAWN;
    b.mesh.visible = false;
    const y = b.pos.y + BOX_LIFT;
    this._fx('rune', b.pos.x, y, b.pos.z, { count: 16, speed: 5 });
    this._fx('glint', b.pos.x, y, b.pos.z, { count: 7, size: 1.8 });
    this._fx('spark', b.pos.x, y, b.pos.z, { count: 14, color: C_GOLD });
    st.rolling = true;
    st.rollT = ROLL_TIME;
    kart.heldItem = null;
    kart.itemCount = 0;
    kart.itemRolling = true;
    bus.emit('item:box', { kart, pos: b.pos });
    bus.emit('item:roll', { kart });
  }

  _updateKarts(dt) {
    for (let i = 0; i < this.karts.length; i++) {
      const kart = this.karts[i];
      const st = this._st(kart);
      if (st.hitCd > 0) st.hitCd -= dt;

      if (st.rolling) {
        st.rollT -= dt;
        if (st.rollT <= 0) {
          st.rolling = false;
          kart.itemRolling = false;
          const item = this.rollItem(kart);
          kart.heldItem = item;
          kart.itemCount = item === ITEMS.GOLDEN_RUNE ? 3 : 1;
          bus.emit('item:got', { kart, item });
        }
      }

      const use = !!(kart.inputs && kart.inputs.useItem);
      if (use && !st.prevUse && kart.heldItem && !st.rolling) this.useItem(kart);
      st.prevUse = use;

      this._updateKartEffects(kart, st, dt);
    }
  }

  // ---------------------------------------------------------------- per-kart effects

  _updateKartEffects(kart, st, dt) {
    const p = kart.pos;
    const t = this.time;

    if (st.keys) {
      st.keysT -= dt;
      if (!kart.shielded || st.keysT <= 0) {
        kart.shielded = false;
        this._breakKeys(kart, st);
      } else {
        const g = st.keys;
        g.position.set(p.x, p.y, p.z);
        for (let i = 0; i < 3; i++) {
          const h = g.children[i];
          const a = t * 3 + (i * TAU) / 3;
          h.position.set(
            Math.cos(a) * 1.9,
            1.0 + Math.sin(t * 2.4 + i * 2) * 0.18,
            Math.sin(a) * 1.9
          );
          h.rotation.y = -a;
        }
      }
    }

    if (st.shell) {
      st.blessT -= dt;
      const sh = st.shell;
      if (st.blessT <= 0 || !(kart.invincibleTimer > 0)) {
        this.poolShell.put(sh);
        st.shell = null;
        st.blessT = 0;
      } else {
        sh.position.set(p.x, p.y + 0.9, p.z);
        const u = sh.material.uniforms;
        u.uTime.value = t;
        const flicker = st.blessT < 1.6 ? 0.5 + 0.5 * Math.sin(t * 24) : 1;
        u.uOpacity.value = flicker * 0.7;
        sh.scale.setScalar(1 + Math.sin(t * 5) * 0.03);
      }
    }

    if (st.houndT > 0) {
      st.houndT -= dt;
      st.ghostCd -= dt;
      if (st.ghostCd <= 0) {
        st.ghostCd = 0.05;
        this._spawnGhost(this.poolHound, 'hound', p, kart.yaw, 0.55, 0.55, 1.0);
        this._fx('trail', p.x, p.y + 0.8, p.z, { color: [1.2, 0.5, 2.6], size: 1.2, life: 0.4 });
      }
    }

    if (st.horseT > 0) {
      st.horseT -= dt;
      st.ghostCd -= dt;
      const fx = -Math.sin(kart.yaw);
      const fz = -Math.cos(kart.yaw);
      if (st.ghostCd <= 0) {
        st.ghostCd = 0.13;
        _p.set(p.x - fx * 1.6, p.y, p.z - fz * 1.6);
        this._spawnGhost(this.poolHorse, 'horse', _p, kart.yaw, 0.4, 0.9, 1.15);
      }
      st.trailAcc += dt * 30;
      while (st.trailAcc >= 1) {
        st.trailAcc -= 1;
        this._fx('trail', p.x - fx * 1.2, p.y + 0.7, p.z - fz * 1.2, {
          color: C_GHOST,
          size: 1.0,
          life: 0.6,
        });
        this._fx(
          'glint',
          p.x - fx * 2 + (Math.random() - 0.5) * 2,
          p.y + 1 + Math.random() * 1.5,
          p.z - fz * 2 + (Math.random() - 0.5) * 2,
          { color: [1.4, 2.0, 2.8], size: 0.6, count: 1 }
        );
      }
    }
  }

  _spawnGhost(pool, kind, pos, yaw, opacity, life, scale) {
    const m = pool.get();
    m.position.copy(pos);
    m.rotation.set(0, yaw, 0);
    m.scale.setScalar(scale);
    m.material.opacity = opacity;
    this.ghosts.push({ mesh: m, pool, age: 0, life, opacity });
  }

  _updateGhosts(dt) {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      const k = g.age / g.life;
      if (k >= 1) {
        g.pool.put(g.mesh);
        this.ghosts[i] = this.ghosts[this.ghosts.length - 1];
        this.ghosts.pop();
        continue;
      }
      g.mesh.material.opacity = g.opacity * (1 - k) * (1 - k);
    }
  }

  // ---------------------------------------------------------------- pots & puddles

  _useRotPot(kart, backward, fx, fz) {
    const p = kart.pos;
    if (backward) {
      this._spawnPuddle(p.x - fx * 2.8, p.z - fz * 2.8, p.y, kart);
      return;
    }
    const speed = Math.max(kart.speed || 0, 0) + 14;
    const mesh = this.poolRotPot.get();
    this.pots.push({
      kind: 'rot',
      mesh,
      owner: kart,
      age: 0,
      bounces: 0,
      t: undefined,
      sign: 1,
      pos: new THREE.Vector3(p.x + fx * 2.4, p.y + 1.0, p.z + fz * 2.4),
      vel: new THREE.Vector3(fx * speed, 9, fz * speed),
    });
  }

  _useFirePot(kart, backward, fx, fz) {
    const p = kart.pos;
    const dir = backward ? -1 : 1;
    const speed = backward ? 30 : Math.max(kart.speed || 0, 0) + 30;
    const mesh = this.poolFirePot.get();
    this.pots.push({
      kind: 'fire',
      mesh,
      owner: kart,
      age: 0,
      bounces: 0,
      t: undefined,
      sign: dir,
      pos: new THREE.Vector3(p.x + fx * 2.4 * dir, p.y + 1.0, p.z + fz * 2.4 * dir),
      vel: new THREE.Vector3(fx * speed * dir, 6, fz * speed * dir),
    });
  }

  _spawnPuddle(x, z, y, owner) {
    _p.set(x, y, z);
    const s = this.track.sample(_p);
    const mesh = this.poolPuddle.get();
    mesh.position.set(x, s.height + 0.06, z);
    mesh.material.opacity = 1;
    mesh.rotation.y = Math.random() * TAU;
    mesh.scale.setScalar(0.1);
    this.puddles.push({
      pos: mesh.position,
      mesh,
      owner,
      age: 0,
      dying: -1,
      spore: 0,
    });
    this._fx('poison', x, s.height, z, { count: 8, radius: 1.2 });
  }

  _explodePot(pot) {
    const p = pot.pos;
    this._fx('explosion', p.x, p.y, p.z, { scale: 1.1 });
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      if (k === pot.owner && pot.age < 0.6) continue;
      const dx = k.pos.x - p.x;
      const dz = k.pos.z - p.z;
      if (
        dx * dx + dz * dz < FIRE_BLAST_RADIUS * FIRE_BLAST_RADIUS &&
        Math.abs(k.pos.y - p.y) < 4
      ) {
        this._applyHit(k, 'explode');
      }
    }
    bus.emit('item:explode', { pos: p });
  }

  _updatePots(dt) {
    for (let i = this.pots.length - 1; i >= 0; i--) {
      const pot = this.pots[i];
      const p = pot.pos;
      const v = pot.vel;
      pot.age += dt;
      let done = false;

      v.y -= POT_GRAVITY * dt;
      p.x += v.x * dt;
      p.y += v.y * dt;
      p.z += v.z * dt;

      const s = this.track.sample(p, pot.t);
      pot.t = s.t;
      const ground = s.height + (pot.kind === 'fire' ? 0.5 : 0.4);

      if (s.surface === 'void' && p.y < s.height - 6) done = true;

      if (!done && p.y <= ground) {
        p.y = ground;
        if (pot.kind === 'rot') {
          this._spawnPuddle(p.x, p.z, ground, pot.owner);
          done = true;
        } else {
          pot.bounces++;
          if (pot.bounces > FIRE_MAX_BOUNCES) {
            this._explodePot(pot);
            done = true;
          } else {
            v.y = 9.5 - pot.bounces * 0.8;
            v.x *= 0.94;
            v.z *= 0.94;
            this._fx('spark', p.x, ground, p.z, { count: 6, color: C_ORANGE });
            bus.emit('item:bounce', { pos: p });
          }
        }
      }

      if (!done && pot.kind === 'fire') {
        // follow the road: ease horizontal heading towards the centreline tangent
        const tan = this.track.getPoint(s.t).tangent;
        const sp = Math.hypot(v.x, v.z);
        const want = Math.atan2(tan.x * pot.sign, tan.z * pot.sign);
        const cur = Math.atan2(v.x, v.z);
        const na = cur + wrapAngle(want - cur) * Math.min(1, dt * 1.6);
        v.x = Math.sin(na) * sp;
        v.z = Math.cos(na) * sp;

        const c = this.track.constrain(p, 0.55);
        if (c) {
          p.add(c.push);
          const d = v.x * c.normal.x + v.z * c.normal.z;
          if (d < 0) {
            v.x -= 2 * d * c.normal.x;
            v.z -= 2 * d * c.normal.z;
          }
          pot.bounces++;
          this._fx('impact', p.x, p.y, p.z, { count: 6, scale: 0.7 });
          if (pot.bounces > FIRE_MAX_BOUNCES) {
            this._explodePot(pot);
            done = true;
          }
        }
      }

      if (!done) {
        for (let k = 0; k < this.karts.length; k++) {
          const kart = this.karts[k];
          if (kart === pot.owner && pot.age < 0.5) continue;
          if (kart.invincibleTimer > 0) continue;
          const dx = kart.pos.x - p.x;
          const dz = kart.pos.z - p.z;
          if (dx * dx + dz * dz < 2.2 * 2.2 && Math.abs(kart.pos.y + 0.6 - p.y) < 2.6) {
            if (pot.kind === 'fire') {
              this._explodePot(pot);
            } else {
              this._applyHit(kart, 'poison');
              this._spawnPuddle(p.x, p.z, p.y, pot.owner);
            }
            done = true;
            break;
          }
        }
      }

      if (!done && pot.age > 9) {
        if (pot.kind === 'fire') this._explodePot(pot);
        done = true;
      }

      if (done) {
        (pot.kind === 'fire' ? this.poolFirePot : this.poolRotPot).put(pot.mesh);
        this.pots[i] = this.pots[this.pots.length - 1];
        this.pots.pop();
        continue;
      }

      pot.mesh.position.copy(p);
      pot.mesh.rotation.x += dt * 7;
      pot.mesh.rotation.z += dt * 4;
      if (pot.kind === 'fire')
        this._fx('trail', p.x, p.y + 0.5, p.z, { color: C_ORANGE, size: 0.7, life: 0.3 });
    }
  }

  _updatePuddles(dt) {
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const pd = this.puddles[i];
      pd.age += dt;
      const m = pd.mesh;
      if (pd.dying >= 0) {
        pd.dying += dt;
        const k = pd.dying / 0.4;
        m.scale.setScalar(PUDDLE_RADIUS * Math.max(0.01, 1 - k));
        if (k >= 1) {
          this.poolPuddle.put(m);
          this.puddles[i] = this.puddles[this.puddles.length - 1];
          this.puddles.pop();
        }
        continue;
      }
      const grow = Math.min(1, pd.age / 0.35);
      const fade = pd.age > PUDDLE_LIFE - 2 ? Math.max(0, (PUDDLE_LIFE - pd.age) / 2) : 1;
      m.scale.setScalar(
        PUDDLE_RADIUS * (0.15 + 0.85 * grow) * (1 + Math.sin(this.time * 3 + i) * 0.03)
      );
      m.material.opacity = fade;
      pd.spore -= dt;
      if (pd.spore <= 0) {
        pd.spore = 0.12;
        this._fx('poison', m.position.x, m.position.y, m.position.z, {
          count: 1,
          radius: PUDDLE_RADIUS * 0.7,
        });
      }
      if (pd.age >= PUDDLE_LIFE) {
        pd.dying = 0.3;
        continue;
      }
      if (grow < 1) continue;
      for (let k = 0; k < this.karts.length; k++) {
        const kart = this.karts[k];
        if (kart === pd.owner && pd.age < 1.2) continue;
        const dx = kart.pos.x - m.position.x;
        const dz = kart.pos.z - m.position.z;
        if (dx * dx + dz * dz > PUDDLE_RADIUS * 0.85 * (PUDDLE_RADIUS * 0.85)) continue;
        if (Math.abs(kart.pos.y - m.position.y) > 2.2 || kart.airborne) continue;
        if (this._applyHit(kart, 'poison') !== HIT_NONE) {
          pd.dying = 0;
          this._fx('poison', m.position.x, m.position.y, m.position.z, { count: 12, radius: 1.5 });
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- homing projectiles

  _launchSeeker(kart, kind, backward, fx, fz) {
    const p = kart.pos;
    const isKnife = kind === 'knife';
    const sign = backward ? -1 : 1;
    const target = isKnife ? this._leader(kart) : this._findTarget(kart, sign);
    const mesh = (isKnife ? this.poolKnife : this.poolMissile).get();
    const heading = Math.atan2(fx * sign, fz * sign);
    const s0 = { x: p.x + fx * 2.6 * sign, y: p.y + 1.0, z: p.z + fz * 2.6 * sign };
    mesh.position.set(s0.x, s0.y, s0.z);
    this.seekers.push({
      kind,
      mesh,
      owner: kart,
      target,
      sign,
      heading,
      age: 0,
      t: undefined,
      acc: 0,
      pos: mesh.position,
      speed: isKnife ? KNIFE_SPEED : MISSILE_SPEED,
      turn: isKnife ? 6.5 : 3.2,
      life: isKnife ? 14 : 10,
    });
    if (isKnife && target) bus.emit('item:incoming', { kart: target, item: ITEMS.BLACK_KNIFE });
    this._fx('glint', s0.x, s0.y, s0.z, {
      count: 3,
      size: 1.6,
      color: isKnife ? C_VIOLET : C_BLUE,
    });
  }

  _endSeeker(i) {
    const s = this.seekers[i];
    (s.kind === 'knife' ? this.poolKnife : this.poolMissile).put(s.mesh);
    this.seekers[i] = this.seekers[this.seekers.length - 1];
    this.seekers.pop();
  }

  _updateSeekers(dt) {
    const len = this.track.length || 1000;
    for (let i = this.seekers.length - 1; i >= 0; i--) {
      const s = this.seekers[i];
      const p = s.pos;
      const isKnife = s.kind === 'knife';
      s.age += dt;

      const smp = this.track.sample(p, s.t);
      s.t = smp.t;

      // Desired heading: straight at the target when close (always for the knife), else along the road.
      let wx;
      let wz;
      const tgt = s.target;
      let homing = false;
      if (tgt) {
        const dx = tgt.pos.x - p.x;
        const dz = tgt.pos.z - p.z;
        const d2 = dx * dx + dz * dz;
        const range = isKnife ? 95 : 42;
        if (d2 < range * range) {
          wx = dx;
          wz = dz;
          homing = true;
        }
      }
      if (!homing) {
        const ahead = this.track.getPoint((((smp.t + (s.sign * 22) / len) % 1) + 1) % 1).pos;
        wx = ahead.x - p.x;
        wz = ahead.z - p.z;
      }
      const want = Math.atan2(wx, wz);
      const diff = wrapAngle(want - s.heading);
      const maxTurn = s.turn * dt;
      s.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      const dirx = Math.sin(s.heading);
      const dirz = Math.cos(s.heading);
      p.x += dirx * s.speed * dt;
      p.z += dirz * s.speed * dt;
      const wantY = smp.height + 1.1;
      p.y += (wantY - p.y) * Math.min(1, dt * 10);

      if (!isKnife) {
        const c = this.track.constrain(p, 0.6);
        if (c) p.add(c.push);
      }

      // trail (time based so density does not depend on frame rate)
      s.acc += dt * 45;
      while (s.acc >= 1) {
        s.acc -= 1;
        const back = s.acc * (s.speed / 45);
        const tx = p.x - dirx * back;
        const tz = p.z - dirz * back;
        if (isKnife) {
          this._fx('trail', tx, p.y, tz, { color: C_VIOLET, size: 1.1, life: 0.55 });
          this._fx('trail', tx, p.y, tz, { color: [2.6, 0.6, 0.3], size: 0.5, life: 0.35 });
        } else {
          this._fx('trail', tx, p.y, tz, { color: C_BLUE, size: 0.9, life: 0.55 });
          if (Math.random() < 0.35)
            this._fx('glint', tx, p.y, tz, { color: [1.2, 1.8, 3.0], size: 0.7, count: 1 });
        }
      }

      s.mesh.position.copy(p);
      if (isKnife) {
        s.mesh.rotation.y = s.heading + Math.PI;
        s.mesh.userData.roll.rotation.z += dt * 14;
      } else {
        s.mesh.rotation.y = s.heading;
        s.mesh.userData.shards.rotation.z += dt * 8;
      }

      let done = s.age > s.life;
      if (done)
        this._fx('glint', p.x, p.y, p.z, {
          count: 5,
          size: 1.6,
          color: isKnife ? C_VIOLET : C_BLUE,
        });

      if (!done) {
        for (let k = 0; k < this.karts.length; k++) {
          const kart = this.karts[k];
          if (kart === s.owner && s.age < 0.4) continue;
          if (kart.invincibleTimer > 0) continue;
          const dx = kart.pos.x - p.x;
          const dz = kart.pos.z - p.z;
          if (dx * dx + dz * dz < 2.0 * 2.0 && Math.abs(kart.pos.y + 0.6 - p.y) < 2.8) {
            const r = this._applyHit(kart, isKnife ? 'explode' : 'spin');
            if (r === HIT_NONE) continue;
            if (isKnife) {
              this._fx('explosion', p.x, p.y, p.z, { scale: 1.2 });
              this._fx('glint', p.x, p.y, p.z, { count: 6, size: 2.2, color: C_VIOLET });
            } else {
              this._fx('impact', p.x, p.y, p.z, { count: 14, scale: 1.2 });
              this._fx('glint', p.x, p.y, p.z, { count: 6, size: 2, color: C_BLUE });
            }
            done = true;
            break;
          }
        }
      }

      if (done) this._endSeeker(i);
    }
  }

  // ---------------------------------------------------------------- AI hazard list

  _buildHazards() {
    const h = this.hazards;
    let n = 0;
    const put = (pos, radius) => {
      let e = h[n];
      if (!e) {
        e = { pos: new THREE.Vector3(), radius: 0 };
        h[n] = e;
      }
      e.pos.copy(pos);
      e.radius = radius;
      n++;
    };
    for (let i = 0; i < this.puddles.length; i++) {
      if (this.puddles[i].dying < 0) put(this.puddles[i].pos, PUDDLE_RADIUS);
    }
    for (let i = 0; i < this.pots.length; i++) {
      if (this.pots[i].kind === 'fire') put(this.pots[i].pos, 3.0);
    }
    h.length = n;
  }
}
