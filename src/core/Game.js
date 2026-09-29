import * as THREE from 'three';
import { bus } from './bus.js';
import { CHARACTERS, TRACKS, CLASSES, GP_POINTS } from './data.js';
import { QUALITY, loadSettings, saveSettings } from './settings.js';
import { Input } from './Input.js';
import { ChaseCamera } from './ChaseCamera.js';
import { Race } from './Race.js';
import { Kart } from '../karts/Kart.js';
import { KartModel } from '../karts/KartModel.js';
import { AIDriver } from '../ai/AIDriver.js';
import { ItemSystem } from '../items/ItemSystem.js';
import { FX } from '../fx/FX.js';
import { createPostFX } from '../fx/PostFX.js';
import { createTrack } from '../track/index.js';
import { UI } from '../ui/UI.js';
import { AudioSystem } from '../audio/Audio.js';

const MAX_STEP = 1 / 60;
const _camDir = new THREE.Vector3();
const _toKart = new THREE.Vector3();
const PLAYER_GRID_SLOT = 5;
const KART_COUNT = 8;
const RESULTS_DELAY = 4;
const RESULTS_DELAY_OVER = 1.6;

const ORD = (n) => `${n}${['st', 'nd', 'rd'][n - 1] || 'th'}`;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function warn(what, err) {
  console.warn(`[elden-kart] ${what} failed:`, err);
}

function guard(what, fn, fallback = null) {
  try {
    return fn();
  } catch (err) {
    warn(what, err);
    return fallback;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function disposeScene(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const key in m) {
        const v = m[key];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose();
    }
    if (o.isInstancedMesh) o.dispose();
  });
}

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this._applyQuality();

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.3,
      4000
    );

    this.ui = new UI(uiRoot);
    this.audio = guard('audio', () => new AudioSystem());
    this._applyVolumes();
    this.input = new Input(window);
    this.input.onPause = () => this._pause();
    this.input.onReset = () => this._reset();

    this.world = null; // { scene, track, postfx }
    this.race = null; // active race session data
    this.mode = 'boot'; // boot | menu | countdown | racing | finished
    this.paused = false;
    this.time = 0;
    this._last = 0;

    window.addEventListener('resize', () => this._resize());
    // The AudioContext is only created after a user gesture (browser autoplay policy).
    this._audioReady = false;
    this._music = null;
    const unlock = () => {
      if (this._audioReady) return;
      this._audioReady = true;
      this._audio((a) => {
        a.init();
        if (this._music) a.playMusic(this._music);
      });
    };
    for (const ev of ['pointerdown', 'keydown'])
      window.addEventListener(ev, unlock, { capture: true });

    requestAnimationFrame((t) => {
      this._last = t;
      this._loop(t);
    });
  }

  // ------------------------------------------------------------------ flow

  async run() {
    const ui = this.ui;
    ui.showLoading(0.05);
    await nextFrame();
    ui.showLoading(0.3);
    await nextFrame();
    const params = new URLSearchParams(location.search);
    const quick = params.get('track') && params.get('char');
    // The menu backdrop is only needed when the menus show; a quick start goes straight to its race.
    if (!quick) {
      this.world = this._buildWorld('limgrave');
      ui.showLoading(0.85);
      await nextFrame();
      this.renderer.compile(this.world.scene, this.camera);
    }
    ui.showLoading(1);
    await nextFrame();

    if (quick) {
      const cls = CLASSES.find((c) => c.id === params.get('class')) || CLASSES[1];
      await this._quickRace({ trackId: params.get('track'), characterId: params.get('char') }, cls);
    } else {
      this.mode = 'menu';
      await ui.showTitle();
    }

    for (;;) {
      this.mode = 'menu';
      this._playMusic('menu');
      if (!this.world) this.world = this._buildWorld('limgrave');
      const choice = await ui.showMainMenu();
      if (choice === 'settings') {
        await this._settingsScreen();
        continue;
      }
      const gp = choice === 'gp';
      const clsId = await ui.showClassSelect({
        classes: CLASSES,
        subtitle: gp
          ? `Grand Prix · ${TRACKS.length} races · cumulative points`
          : 'Quick Race · a single circuit',
        initial:
          CLASSES.findIndex((c) => c.id === this._lastClass) >= 0
            ? CLASSES.findIndex((c) => c.id === this._lastClass)
            : 1,
      });
      if (!clsId) continue;
      this._lastClass = clsId;
      const cls = CLASSES.find((c) => c.id === clsId);
      const sel = await ui.showSelect({ characters: CHARACTERS, tracks: TRACKS, pickTrack: !gp });
      if (!sel) continue;
      if (gp) await this._grandPrix(sel, cls);
      else await this._quickRace(sel, cls);
    }
  }

  async _quickRace(sel, cls) {
    for (;;) {
      const { outcome } = await this._raceSession({ ...sel, cls });
      if (outcome !== 'restart') return;
    }
  }

  // Four races with a fixed rival roster; points accumulate and standings show between races.
  async _grandPrix(sel, cls) {
    const player = CHARACTERS.find((c) => c.id === sel.characterId) || CHARACTERS[0];
    const roster = this._makeRoster(player, cls);
    const totals = new Map([[player.id, 0], ...roster.map((r) => [r.character.id, 0])]);
    for (let i = 0; i < TRACKS.length;) {
      const gp = { index: i, total: TRACKS.length };
      const { outcome, rows } = await this._raceSession({
        trackId: TRACKS[i].id,
        characterId: player.id,
        cls,
        roster,
        gp,
      });
      if (outcome === 'restart') continue;
      if (outcome !== 'next') break;

      const gained = new Map(rows.map((r) => [r.id, r.points]));
      for (const r of rows) totals.set(r.id, totals.get(r.id) + r.points);
      const table = [...totals.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([id, total], k) => {
          const c = CHARACTERS.find((ch) => ch.id === id);
          return {
            place: k + 1,
            name: c.name,
            color: c.color,
            isPlayer: id === player.id,
            gained: gained.get(id) ?? 0,
            total,
          };
        });
      // Tied totals share a place.
      table.forEach((r, k) => {
        if (k > 0 && r.total === table[k - 1].total) r.place = table[k - 1].place;
      });
      const final = i === TRACKS.length - 1;
      const me = table.find((r) => r.isPlayer);
      let title = 'Standings';
      let subtitle = `After race ${i + 1} of ${TRACKS.length}`;
      let red = false;
      if (final) {
        if (me.place === 1) {
          title = 'Elden Lord';
          subtitle = `The ${cls.label} crown is yours`;
        } else if (me.place <= 3) {
          title = 'Great Rune Claimed';
          subtitle = `${ORD(me.place)} in the ${cls.label} Grand Prix`;
        } else {
          title = 'Defeated';
          subtitle = `${ORD(me.place)} in the ${cls.label} Grand Prix`;
          red = true;
        }
      }
      this._playMusic('menu');
      const choice = await this.ui.showStandings(table, {
        title,
        subtitle,
        red,
        caption: final ? 'Final standings' : `Next: ${TRACKS[i + 1].name}`,
        buttons: final
          ? [['Main Menu', 'menu']]
          : [
              ['Next Race', 'next'],
              ['Quit Grand Prix', 'menu'],
            ],
      });
      if (final || choice === 'menu') break;
      i++;
    }
    if (!this.world) this.world = guard('menu world', () => this._buildWorld('limgrave'));
  }

  async _settingsScreen() {
    const before = this.settings.quality;
    const next = await this.ui.showSettings(this.settings, {
      qualities: QUALITY,
      onChange: (st) => {
        this.settings = st;
        this._applyVolumes();
      },
    });
    this.settings = next;
    saveSettings(next);
    this._applyVolumes();
    if (next.quality !== before) {
      this._applyQuality();
      // Shadows and post-processing are set up per world, so rebuild the menu backdrop.
      this._disposeWorld(this.world);
      this.world = this._buildWorld('limgrave');
      this._resize();
    }
  }

  _applyVolumes() {
    const st = this.settings;
    guard('volume', () => {
      this.audio?.setVolume(st.master);
      this.audio?.setMusicVolume(st.music);
      this.audio?.setSfxVolume(st.sfx);
    });
  }

  _applyQuality() {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
  }

  _makeRoster(player, cls) {
    const [lo, hi] = cls.ai;
    return shuffle(CHARACTERS.filter((c) => c.id !== player.id))
      .slice(0, KART_COUNT - 1)
      .map((character) => ({
        character,
        skill: lo + Math.random() * (hi - lo),
        aggression: Math.random(),
      }));
  }

  _audio(fn) {
    if (this.audio && this._audioReady) guard('audio', () => fn(this.audio));
  }

  _playMusic(id) {
    this._music = id;
    this._audio((a) => a.playMusic(id));
  }

  _buildWorld(trackId) {
    const scene = new THREE.Scene();
    scene.add(this.camera);
    const track = createTrack(trackId, scene);
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    scene.traverse((o) => {
      if (o.isLight && o.shadow) o.castShadow = q.shadows;
    });
    const postfx = q.postfx
      ? guard('postfx', () => createPostFX(this.renderer, scene, this.camera, { msaa: q.msaa }))
      : null;
    return { scene, track, postfx };
  }

  _disposeWorld(world) {
    if (!world) return;
    guard('postfx dispose', () => world.postfx?.dispose());
    guard('track dispose', () => world.track?.dispose());
    guard('scene dispose', () => disposeScene(world.scene));
    world.scene.remove(this.camera);
    this.renderer.renderLists.dispose();
  }

  // opts: { trackId, characterId, cls, roster?, gp? }. Resolves { outcome: 'restart' | 'menu' | 'next', rows }.
  async _raceSession(opts) {
    const ui = this.ui;
    const trackData = TRACKS.find((t) => t.id === opts.trackId) || TRACKS[0];
    const charData = CHARACTERS.find((c) => c.id === opts.characterId) || CHARACTERS[0];
    const cls = opts.cls || CLASSES[1];

    this.mode = 'menu';
    this.paused = false;
    this._disposeWorld(this.world);
    this.world = null;
    await nextFrame();

    const r = this._buildRace(
      trackData,
      charData,
      cls,
      opts.roster || this._makeRoster(charData, cls)
    );
    r.gp = opts.gp || null;
    r.cls = cls;
    this.race = r;
    this.world = r.world;
    this.mode = 'countdown';
    this.input.enabled = true;

    const done = new Promise((resolve) => {
      r.resolve = resolve;
    });

    r.offs.push(
      bus.on('race:lap', ({ kart, lap }) => {
        if (kart !== r.player) return;
        r.lapStart = r.race.elapsed;
        if (lap < trackData.laps) ui.banner(`LAP ${lap}`, `of ${trackData.laps}`, 1600);
      }),
      bus.on('race:final-lap', ({ kart }) => {
        if (kart === r.player) ui.banner('FINAL LAP', null, 2400);
      }),
      bus.on('race:finish', ({ kart, place }) => {
        if (kart !== r.player) return;
        r.finishedAt = this.time;
        r.resultsTimer = RESULTS_DELAY;
        ui.banner('FINISH', `${place}${['st', 'nd', 'rd'][place - 1] || 'th'} place`, 2600);
        // Hand the kart to the AI so it keeps driving through the finish.
        r.autopilot = guard(
          'autopilot',
          () =>
            new AIDriver(kart, r.world.track, { skill: 0.75, aggression: 0.2, name: 'autopilot' })
        );
      }),
      bus.on('race:over', () => {
        if (r.resultsTimer === null || r.resultsTimer > RESULTS_DELAY_OVER)
          r.resultsTimer = RESULTS_DELAY_OVER;
      })
    );

    this._playMusic(trackData.music);
    ui.showHUD();
    r.chase.startIntro(2.6);
    r.introMessage = `${trackData.name} · ${r.gp ? `Race ${r.gp.index + 1} of ${r.gp.total}` : `${trackData.laps} laps`} · ${cls.label}`;

    ui.countdown().then(() => {
      if (!r.alive) return;
      r.race.start();
      this.mode = 'racing';
      const heldFor = performance.now() - r.throttleAt;
      if (r.throttleAt > 0 && this.input.state.throttle > 0 && heldFor < 700) {
        r.player.applyBoost(0.9, 0.9);
        ui.banner('ROCKET START', null, 1200);
      }
    });

    const outcome = await done;
    const rows = r.resultRows || [];

    r.alive = false;
    r.offs.forEach((off) => off());
    this.input.enabled = false;
    this.paused = false;
    this._audio((a) => {
      a.stopEngine();
      a.setListenerMuffle(false);
      a.stopMusic();
    });
    this._music = null;
    ui.hideHUD();
    this.mode = 'menu';
    this._disposeRace(r);
    this.race = null;
    this.world = null;
    if (outcome === 'menu') this.world = guard('menu world', () => this._buildWorld('limgrave'));
    return { outcome, rows };
  }

  _buildRace(trackData, charData, cls, roster) {
    const world = this._buildWorld(trackData.id);
    const { scene, track } = world;

    const slots = [];
    for (let i = 0; i < KART_COUNT; i++) if (i !== PLAYER_GRID_SLOT) slots.push(i);
    const karts = new Array(KART_COUNT);
    const ais = [];

    const makeKart = (character, isPlayer, slot) => {
      const kart = new Kart({
        id: `${character.id}${isPlayer ? '-player' : ''}`,
        character,
        isPlayer,
        track,
        scene,
        speedScale: cls.speed,
      });
      const model = guard(`model ${character.id}`, () => new KartModel(character));
      kart.setModel(model);
      const g = track.startGrid(slot);
      kart.placeAt(track, g.pos, g.yaw);
      karts[slot] = kart;
      return kart;
    };

    const player = makeKart(charData, true, PLAYER_GRID_SLOT);
    roster.forEach(({ character, skill, aggression }, i) => {
      const kart = makeKart(character, false, slots[i]);
      ais.push(
        guard('ai', () => new AIDriver(kart, track, { skill, aggression, name: character.name }))
      );
    });

    const fx = guard('fx', () => new FX(scene, this.camera));
    if (fx) karts.forEach((k) => guard('fx attach', () => fx.attachKart(k)));
    const items = guard('items', () => new ItemSystem({ scene, track, karts, fx }));
    const race = new Race({ track, karts, laps: trackData.laps ?? track.laps });
    const chase = new ChaseCamera(this.camera, track);
    chase.setTarget(player);

    return {
      alive: true,
      resolve: null,
      offs: [],
      world,
      trackData,
      track,
      karts,
      ais: ais.filter(Boolean),
      player,
      fx,
      items,
      race,
      chase,
      autopilot: null,
      throttleAt: 0,
      lapStart: 0,
      finishedAt: 0,
      resultsTimer: null,
      resultsShown: false,
      resetCd: 0,
      boostVis: 0,
    };
  }

  _disposeRace(r) {
    guard('items dispose', () => r.items?.dispose());
    guard('fx dispose', () => r.fx?.dispose());
    guard('camera dispose', () => r.chase.dispose());
    r.karts.forEach((k) => guard('kart dispose', () => k.dispose()));
    this._disposeWorld(r.world);
  }

  // ------------------------------------------------------------------ pause / reset

  _pause() {
    const r = this.race;
    if (!r || this.paused || this.mode !== 'racing') return;
    this.paused = true;
    this._audio((a) => a.setListenerMuffle(true));
    this.ui.showPause().then((choice) => {
      this.paused = false;
      this._audio((a) => a.setListenerMuffle(false));
      if (choice === 'restart') r.resolve?.('restart');
      else if (choice === 'menu') r.resolve?.('menu');
    });
  }

  _reset() {
    const r = this.race;
    if (!r || this.paused || this.mode !== 'racing' || r.player.finished || r.resetCd > 0) return;
    r.resetCd = 1.5;
    r.player.respawn(r.track);
    r.chase.reset();
  }

  // ------------------------------------------------------------------ frame

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._applyQuality();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const r = this.race;
    guard('postfx resize', () => (r?.world ?? this.world)?.postfx?.resize(w, h));
  }

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    try {
      this._frame(dt);
    } catch (err) {
      if (!this._errored) {
        this._errored = true;
        console.error('[elden-kart] frame error', err);
      }
    }
  }

  _frame(dt) {
    const world = this.world;
    if (!world) return;
    const r = this.race;

    if (!this.paused) {
      this.time += dt;
      guard('track update', () => world.track.update(dt, this.time));
    }

    if (r && r.alive) {
      if (!this.paused) this._simulate(r, dt);
      if (!this.paused) guard('fx update', () => r.fx?.update(dt));
      r.chase.lookBehind = this.input.lookBehind;
      r.chase.update(this.paused ? 0 : dt, r.player);
      // A rival right at the camera, or between the camera and the player, would fill the screen:
      // hide it while it is there.
      const cam = this.camera.position;
      const toPlayer = r.player.pos.distanceTo(cam);
      this.camera.getWorldDirection(_camDir);
      for (const k of r.karts) {
        if (k === r.player) continue;
        _toKart.subVectors(k.pos, cam);
        _toKart.y += 1.2;
        const d = _toKart.length();
        const inFront = d > 0 && _toKart.dot(_camDir) / d > 0.75;
        k.mesh.visible = d > 5.5 && !(inFront && d < toPlayer - 1);
      }
      this._updateHud(r);
      this._updateAudio(r);
      this._updateResults(r, dt);
      const boost = r.player.boostTimer > 0 ? Math.min(1, r.player.boostPower || 1) : 0;
      r.boostVis += (boost - r.boostVis) * (1 - Math.exp(-5 * dt));
      guard('postfx state', () => {
        world.postfx?.setBoost(r.boostVis);
        world.postfx?.setVignette(r.player.spinTimer > 0 ? 0.6 : 0.25);
      });
    } else {
      this._menuCamera(world);
    }

    this._render(world, dt);
  }

  _render(world, dt) {
    if (world.postfx) {
      try {
        world.postfx.render(dt);
        return;
      } catch (err) {
        warn('postfx render', err);
        world.postfx = null;
      }
    }
    this.renderer.render(world.scene, this.camera);
  }

  _menuCamera(world) {
    const track = world.track;
    const t = (this.time * 0.006) % 1;
    const p = track.getPoint(t);
    const ahead = track.getPoint((t + 0.02) % 1);
    this.camera.position
      .copy(p.pos)
      .addScaledVector(p.right, 22 + Math.sin(this.time * 0.2) * 6)
      .addScaledVector(p.up, 8);
    this.camera.lookAt(ahead.pos.x, ahead.pos.y + 2, ahead.pos.z);
    if (this.camera.fov !== 55) {
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
    }
  }

  _simulate(r, dt) {
    const { track, karts, player, race, items } = r;
    const racing = this.mode === 'racing' || this.mode === 'finished';
    const state = this.input.update(dt);
    r.resetCd = Math.max(0, r.resetCd - dt);
    if (this.mode === 'countdown' && state.throttle > 0 && r.throttleAt === 0)
      r.throttleAt = performance.now();
    if (state.throttle === 0) r.throttleAt = 0;

    const n = Math.ceil(dt / MAX_STEP);
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      const inp = player.inputs;
      if (racing && !player.finished) {
        inp.throttle = state.throttle;
        inp.brake = state.brake;
        inp.steer = state.steer;
        inp.drift = state.drift;
        inp.useItem = state.useItem;
      } else if (!racing) {
        inp.throttle = inp.brake = inp.steer = 0;
        inp.drift = inp.useItem = false;
      }
      if (racing) {
        for (const ai of r.ais) guard('ai', () => ai.update(h, race, items));
        if (r.autopilot) guard('autopilot', () => r.autopilot.update(h, race, items));
      } else {
        for (const k of karts) {
          if (k === player) continue;
          k.inputs.throttle = k.inputs.brake = k.inputs.steer = 0;
          k.inputs.drift = k.inputs.useItem = false;
        }
      }

      for (const k of karts) k.update(h, track);
      for (let i = 0; i < karts.length; i++) {
        for (let j = i + 1; j < karts.length; j++) Kart.collide(karts[i], karts[j]);
      }

      if (items) guard('items update', () => items.update(h));
      race.update(h);
    }
  }

  _updateResults(r, dt) {
    if (r.resultsTimer === null || r.resultsShown) return;
    r.resultsTimer -= dt;
    if (r.resultsTimer > 0) return;
    r.resultsShown = true;
    this.mode = 'finished';
    const rows = r.race.getResults().map(({ kart, place, time }) => ({
      id: kart.character.id,
      place,
      name: kart.character.name,
      color: kart.character.color,
      time,
      isPlayer: kart.isPlayer,
      points: GP_POINTS[place - 1] ?? 0,
    }));
    r.resultRows = rows;
    const opts = r.gp
      ? {
          points: true,
          caption: `Race ${r.gp.index + 1} of ${r.gp.total} · ${r.cls.label}`,
          buttons: [
            ['Continue', 'next'],
            ['Quit Grand Prix', 'menu'],
          ],
        }
      : { caption: `${r.trackData.name} · ${r.cls.label}` };
    this.ui
      .showResults(rows, opts)
      .then((choice) => r.resolve?.(choice === 'again' ? 'restart' : choice));
  }

  _updateHud(r) {
    const { player, race, track, karts } = r;
    const rolling = !!player.itemRolling && player.heldItem === null;
    const boost = player.boostTimer > 0 ? Math.min(1, player.boostTimer / 1.5) : 0;
    const minimap = {
      points: track.miniMap.points,
      bounds: track.miniMap.bounds,
      karts: karts.map((k) => ({
        x: k.pos.x,
        z: k.pos.z,
        color: k.character.color,
        isPlayer: k.isPlayer,
      })),
    };
    const started = race.state !== 'countdown';
    const standings = race.getRanking().map((k) => ({
      id: k.id,
      name: k.character.name,
      color: k.character.color,
      isPlayer: k.isPlayer,
      finished: k.finished,
    }));
    this.ui.updateHUD({
      position: player.place,
      racers: karts.length,
      lap: Math.min(race.laps, Math.max(1, player.lap)),
      laps: race.laps,
      item: player.heldItem,
      itemCount: player.itemCount,
      itemRolling: rolling,
      speed: Math.abs(player.speed),
      lapTime: started ? Math.max(0, race.elapsed - r.lapStart) : 0,
      totalTime: started ? race.elapsed : 0,
      boost,
      driftLevel: player.drift.active ? player.drift.level : 0,
      minimap,
      standings,
      message: started ? null : r.introMessage,
    });
  }

  _updateAudio(r) {
    if (!this.audio || !this._audioReady) return;
    const p = r.player;
    const racing = this.mode === 'racing' || this.mode === 'finished';
    guard('engine audio', () => {
      if (!racing || this.paused) this.audio.setEngine(-1);
      else this.audio.setEngine(Math.abs(p.speed) / (p.topSpeed || 42), p.boostTimer > 0);
    });
  }
}
