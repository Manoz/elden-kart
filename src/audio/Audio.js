// Fully procedural WebAudio: generative music, synthesised SFX and a layered engine loop.
import { bus } from '../core/bus.js';

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORMANTS = { ah: [800, 1150], oh: [450, 800], oo: [320, 800], ee: [300, 2300] };

// ---------------------------------------------------------------------------------------------
// Music definitions. `step(A, d, s, bar, t, sd)`:
//   A = synth helpers, d = destination node, s = 16th step in bar, bar = absolute bar, t = time, sd = step duration
// ---------------------------------------------------------------------------------------------

const MUSIC = {
  menu: {
    bpm: 72,
    chords: [
      { root: 38, n: [50, 57, 62, 65] },
      { root: 34, n: [46, 53, 58, 62] },
      { root: 31, n: [43, 55, 58, 62] },
      { root: 33, n: [45, 57, 61, 64] },
    ],
    step(A, d, s, bar, t, sd) {
      const c = this.chords[bar % 4];
      const barLen = sd * 16;
      if (s === 0) {
        A.choir(
          c.n.map((n) => n + 12),
          t,
          barLen * 1.02,
          d,
          { gain: 0.05, vowel: bar % 2 ? 'oh' : 'ah', attack: 1.2 }
        );
        A.drone(c.root, t, barLen * 1.05, d, { gain: 0.07, cutoff: 260 });
        A.strings(c.n, t, barLen * 1.02, d, { gain: 0.03, cutoff: 1400, attack: 1.4 });
        if (bar % 2 === 0) A.bell(midi(c.n[2] + 24), t + sd * 2, 3.5, d, 0.03);
      }
      if (s % 2 === 0) {
        const pat = [0, 1, 2, 3, 2, 1, 3, 2];
        const idx = pat[(s / 2) % 8];
        const n = c.n[idx % 4] + (idx > 2 ? 24 : 12);
        A.pluck(midi(n), t, 1.4, d, { gain: 0.08, cutoff: 3200 });
      }
    },
  },

  // Heroic folk-orchestral: driving string ostinato, timpani, horn call on each second half-phrase.
  limgrave: {
    bpm: 126,
    chords: [
      { root: 38, n: [62, 66, 69, 74] },
      { root: 33, n: [61, 64, 69, 73] },
      { root: 35, n: [62, 66, 71, 74] },
      { root: 43, n: [62, 67, 71, 74] },
    ],
    horn: [
      { 0: [2, 6], 6: [3, 2], 8: [1, 4], 12: [2, 4] },
      { 0: [3, 8], 8: [2, 8] },
    ],
    step(A, d, s, bar, t, sd) {
      const c = this.chords[bar % 4];
      const barLen = sd * 16;
      if (s === 0) {
        A.strings(c.n, t, barLen * 1.02, d, { gain: 0.03, attack: 0.35, cutoff: 2200 });
        A.strings([c.root + 12], t, barLen, d, { gain: 0.035, attack: 0.2, cutoff: 900 });
        if (bar % 4 === 0)
          A.choir(
            c.n.slice(0, 3).map((n) => n + 12),
            t,
            barLen * 4,
            d,
            { gain: 0.02, attack: 1.2, vowel: 'ah' }
          );
      }
      if (s % 2 === 0) {
        A.spiccato(midi(s % 4 === 0 ? c.root + 12 : c.root + 24), t, d, {
          gain: 0.07,
          cutoff: 1400,
        });
        const pat = [0, 1, 2, 1, 3, 2, 1, 2];
        A.spiccato(midi(c.n[pat[(s / 2) % 8]] + 12), t, d, { gain: 0.04, cutoff: 3200 });
      }
      if (s === 0 || s === 8) A.timpani(midi(c.root), t, d, s === 0 ? 0.4 : 0.28);
      if (bar % 2 === 1 && s >= 14) A.timpani(midi(c.root + (s === 14 ? 7 : 0)), t, d, 0.2);
      if (s === 0 && bar % 4 === 0) A.taiko(t, d, 0.45);
      if (s === 4 || s === 12) A.frame(t, d, 0.14);
      if (bar % 4 >= 2) {
        const hit = this.horn[(bar % 4) - 2][s];
        if (hit) A.horn(c.n[hit[0]], t, sd * hit[1], d, 0.06);
      }
      if (bar % 4 === 3 && s === 8) A.swell(t, sd * 8, d, 0.05);
    },
  },

  // Scarlet rot: war drums, relentless low strings, dissonant screeching violins.
  caelid: {
    bpm: 138,
    chords: [
      { root: 40, n: [52, 53, 59, 64] },
      { root: 41, n: [53, 56, 60, 65] },
      { root: 40, n: [52, 55, 58, 64] },
      { root: 46, n: [52, 58, 61, 64] },
    ],
    drums: [
      [0, 0.55],
      [3, 0.4],
      [6, 0.45],
      [10, 0.5],
      [11, 0.35],
      [14, 0.45],
    ],
    step(A, d, s, bar, t, sd) {
      const c = this.chords[bar % 4];
      const barLen = sd * 16;
      if (s === 0) {
        A.drone(28, t, barLen * 1.05, d, { gain: 0.075, cutoff: 200, detune: 9 });
        A.strings(c.n, t, barLen * 1.02, d, {
          gain: 0.028,
          cutoff: 1100,
          attack: 0.3,
          vibrato: 14,
        });
        if (bar % 2 === 1) A.screech(midi(c.n[3] + 24), t, barLen * 1.5, d, 0.025);
        if (bar % 4 === 0)
          A.choir(c.n.slice(0, 3), t, barLen * 2, d, { gain: 0.03, vowel: 'oo', attack: 0.6 });
      }
      for (const [st, g] of this.drums) if (s === st) A.taiko(t, d, g * 0.8);
      if (s === 4 || s === 12) A.snare(t, d, 0.16);
      if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s))
        A.spiccato(midi(c.root + 12), t, d, { gain: 0.1, cutoff: 900 });
      if (s === 0 || s === 10)
        A.brassStab(
          c.n.map((n) => n - 12),
          t,
          sd * 2.5,
          d,
          0.04
        );
      if (bar % 4 === 3 && s >= 12) A.timpani(midi(c.root), t, d, 0.2 + (s - 12) * 0.05);
    },
  },

  // Royal capital: brass chorale, choir, timpani on every beat, military snare, horn fanfare.
  leyndell: {
    bpm: 132,
    chords: [
      { root: 36, n: [60, 63, 67, 72] },
      { root: 32, n: [56, 60, 63, 68] },
      { root: 39, n: [58, 63, 67, 70] },
      { root: 34, n: [58, 62, 65, 70] },
    ],
    lead: { 0: [3, 3], 3: [2, 3], 8: [3, 3], 11: [1, 5] },
    step(A, d, s, bar, t, sd) {
      const c = this.chords[bar % 4];
      const barLen = sd * 16;
      if (s === 0) {
        A.brass(c.n, t, barLen * 1.02, d, { gain: 0.04, swell: 0.5 });
        A.choir(
          c.n.slice(0, 3).map((n) => n + 12),
          t,
          barLen,
          d,
          { gain: 0.03, vowel: 'ah', attack: 0.5 }
        );
        A.strings([c.root + 12, c.root + 24], t, barLen, d, { gain: 0.03, cutoff: 1200 });
        if (bar % 4 === 0) A.crash(t, d, 0.14);
      }
      if (s % 4 === 0) A.timpani(midi(c.root), t, d, s === 0 ? 0.42 : 0.26);
      if (s === 4 || s === 12) A.snare(t, d, 0.22);
      if (s === 14 || s === 15) A.snare(t, d, 0.09);
      if (bar % 4 === 3 && s === 8) A.snareRoll(t, sd * 8, d, 0.14);
      if (s % 2 === 0 && s % 4 !== 0)
        A.spiccato(midi(c.root + 12), t, d, { gain: 0.1, cutoff: 1000 });
      if (s === 0 || s === 6 || s === 10) A.brassStab(c.n, t, sd * 2.6, d, 0.04);
      const hit = this.lead[s];
      if (bar % 4 >= 2 && hit) A.horn(c.n[hit[0]], t, sd * hit[1], d, 0.06);
      if (bar % 4 === 3 && s >= 8)
        A.spiccato(midi(c.n[(s - 8) % 4] + 12), t, d, { gain: 0.04, cutoff: 3600 });
    },
  },

  // Haligtree: high choir, bells, harp arpeggios and a soft timpani pulse.
  haligtree: {
    bpm: 120,
    chords: [
      { root: 29, n: [65, 69, 72, 76] },
      { root: 36, n: [64, 67, 72, 76] },
      { root: 26, n: [62, 65, 69, 74] },
      { root: 34, n: [62, 65, 70, 74] },
    ],
    step(A, d, s, bar, t, sd) {
      const c = this.chords[bar % 4];
      const barLen = sd * 16;
      if (s === 0) {
        A.choir(
          c.n.map((n) => n + 12),
          t,
          barLen * 1.03,
          d,
          { gain: 0.035, vowel: bar % 2 ? 'ee' : 'ah', attack: 1.0 }
        );
        A.strings(c.n.slice(0, 3), t, barLen * 1.03, d, { gain: 0.026, cutoff: 2600, attack: 0.8 });
        A.pluck(midi(c.root + 12), t, 1.6, d, { gain: 0.14, cutoff: 500, type: 'sine' });
      }
      if (s === 0 || s === 8) A.timpani(midi(c.root + 12), t, d, 0.16);
      if (s % 2 === 0) {
        const pat = [0, 1, 2, 3, 2, 3, 1, 2];
        A.bell(midi(c.n[pat[(s / 2) % 8]] + 24), t, 2.4, d, 0.045);
      }
      if (s % 2 === 1 && bar % 2 === 0)
        A.pluck(midi(c.n[((s - 1) / 2) % 4] + 12), t, 1.8, d, { gain: 0.045, cutoff: 3000 });
      if (s === 8)
        A.pluck(midi(c.root + 19), t, 1.2, d, { gain: 0.07, cutoff: 2500, type: 'triangle' });
    },
  },
};

const SFX_MIN_GAP = 0.03;

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.8;
    this.musicVolume = 1;
    this.sfxVolume = 1;
    this.muffled = false;
    this.player = null;
    this.engine = null;
    this.offline = false;
    this._unsubs = [bus.on('ui:sfx', ({ name, opts }) => this.sfx(name, opts))];
    this._lastSfx = {};
  }

  /** Idempotent. Pass { context } to inject an (Offline)AudioContext. */
  init(opts = {}) {
    if (this.ctx) {
      this._resume();
      return this;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (opts.context) {
      this.ctx = opts.context;
      this.offline = true;
    } else if (Ctor) this.ctx = new Ctor({ latencyHint: 'interactive' });
    else return this;
    const ctx = this.ctx;

    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 22000;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.2;
    this.muffle.connect(this.master).connect(this.comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(3.4, 2.4);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverb.connect(revOut).connect(this.muffle);
    this.revIn = ctx.createGain();
    this.revIn.connect(this.reverb);

    this.musicBus = this._makeBus(0.75 * this.musicVolume, 0.55);
    this.sfxBus = this._makeBus(0.9 * this.sfxVolume, 0.3);
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0.8 * this.sfxVolume;
    this.engineBus.connect(this.muffle);

    this.noiseBuf = this._makeNoise(2);
    if (!this.offline) {
      this._buildEngine();
      this._gestureFn = () => this._resume();
      for (const ev of ['pointerdown', 'keydown', 'touchstart'])
        window.addEventListener(ev, this._gestureFn, { passive: true });
      this._unsubs.push(...this._subscribe());
    }
    this._resume();
    return this;
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume)
      this.ctx.resume().catch(() => {});
  }

  _makeBus(gain, send) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.muffle);
    const s = this.ctx.createGain();
    s.gain.value = send;
    g.connect(s).connect(this.revIn);
    return g;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const r = rng(1234);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const white = r() * 2 - 1;
        lp += (white - lp) * (0.55 - 0.45 * x); // darker tail
        data[i] = lp * Math.pow(1 - x, decay) * (x < 0.005 ? x / 0.005 : 1);
      }
    }
    return buf;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(99);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  // ------------------------------------------------------------------ public controls

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicBus)
      this.musicBus.gain.setTargetAtTime(0.75 * this.musicVolume, this.ctx.currentTime, 0.03);
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (!this.sfxBus) return;
    this.sfxBus.gain.setTargetAtTime(0.9 * this.sfxVolume, this.ctx.currentTime, 0.03);
    this.engineBus.gain.setTargetAtTime(0.8 * this.sfxVolume, this.ctx.currentTime, 0.03);
  }

  mute(b) {
    this.muted = !!b;
    if (this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  setListenerMuffle(b) {
    this.muffled = !!b;
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(b ? 650 : 22000, this.ctx.currentTime, 0.12);
  }

  // ------------------------------------------------------------------ music

  playMusic(id) {
    if (!this.ctx) return;
    const def = MUSIC[id];
    if (!def) return;
    if (this.player && this.player.id === id && !this.player.stopping) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this._fadeOutPlayer(this.player, 1.6);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(1, now + (this.player ? 1.6 : 0.6));
    out.connect(this.musicBus);
    const player = {
      id,
      def,
      out,
      step: 0,
      next: now + 0.08,
      sd: 60 / def.bpm / 4,
      timer: null,
      stopping: false,
    };
    this.player = player;
    if (!this.offline) {
      player.timer = setInterval(() => this._pump(player), 30);
      this._pump(player);
    }
  }

  stopMusic(fade = 1.2) {
    this._fadeOutPlayer(this.player, fade);
    this.player = null;
  }

  _fadeOutPlayer(p, fade) {
    if (!p || p.stopping) return;
    p.stopping = true;
    const now = this.ctx.currentTime;
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(p.out.gain.value, now);
    p.out.gain.linearRampToValueAtTime(0.0001, now + fade);
    if (p.timer) clearInterval(p.timer);
    p.timer = null;
    // notes already scheduled ahead keep sounding under the fade; disconnect afterwards
    setTimeout(
      () => {
        try {
          p.out.disconnect();
        } catch {
          /* already gone */
        }
      },
      (fade + 6) * 1000
    );
  }

  _pump(p, until) {
    const ctx = this.ctx;
    const horizon = until ?? ctx.currentTime + 0.3;
    if (until === undefined && p.next < ctx.currentTime - 0.4) p.next = ctx.currentTime + 0.05;
    while (p.next < horizon) {
      const s = p.step % 16;
      const bar = Math.floor(p.step / 16);
      p.def.step.call(p.def, this._A, p.out, s, bar, p.next, p.sd);
      p.next += p.sd;
      p.step++;
    }
  }

  get _A() {
    if (!this.__A) this.__A = this._synth();
    return this.__A;
  }

  // ------------------------------------------------------------------ synth voices

  _synth() {
    const ctx = this.ctx;
    const self = this;

    const env = (param, t, peak, a, hold, r) => {
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(peak, t + a);
      param.setValueAtTime(peak, t + Math.max(a, hold));
      param.exponentialRampToValueAtTime(0.0001, t + Math.max(a, hold) + r);
    };

    const osc = (type, freq, t, dur, dest, o = {}) => {
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = o.ftype || 'lowpass';
      f.frequency.setValueAtTime(o.cutoff || 20000, t);
      if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(o.cutoffTo, t + dur);
      f.Q.value = o.q || 0.7;
      const oc = ctx.createOscillator();
      oc.type = type;
      oc.frequency.setValueAtTime(freq, t);
      if (o.slideTo) oc.frequency.exponentialRampToValueAtTime(o.slideTo, t + (o.slideTime || dur));
      if (o.detune) oc.detune.value = o.detune;
      env(g.gain, t, o.gain ?? 0.2, o.attack ?? 0.008, dur, o.release ?? 0.08);
      oc.connect(f).connect(g).connect(dest);
      oc.start(t);
      oc.stop(t + dur + (o.release ?? 0.08) + 0.05);
      return oc;
    };

    const noise = (t, dur, dest, o = {}) => {
      const src = ctx.createBufferSource();
      src.buffer = self.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 2000, t);
      if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
      f.Q.value = o.q || 0.8;
      const g = ctx.createGain();
      env(g.gain, t, o.gain ?? 0.2, o.attack ?? 0.004, dur, o.release ?? 0.05);
      src.connect(f).connect(g).connect(dest);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + (o.release ?? 0.05) + 0.05);
    };

    const A = {
      osc,
      noise,
      snare(t, d, g = 0.3) {
        noise(t, 0.12, d, { gain: g, freq: 1900, q: 0.6, release: 0.1 });
        osc('triangle', 200, t, 0.06, d, { gain: g * 0.7, slideTo: 140, release: 0.06 });
      },
      // soft frame drum / tambourine skin
      frame(t, d, g = 0.14) {
        noise(t, 0.05, d, { gain: g, freq: 900, q: 0.8, release: 0.12 });
        osc('triangle', 160, t, 0.05, d, { gain: g * 0.6, slideTo: 110, release: 0.1 });
      },
      snareRoll(t, dur, d, g = 0.14) {
        const n = Math.floor(dur / 0.035);
        for (let i = 0; i < n; i++) {
          const k = i / n;
          noise(t + i * 0.035, 0.03, d, {
            gain: g * (0.35 + k * 0.9),
            freq: 2000,
            q: 0.6,
            release: 0.04,
          });
        }
      },
      timpani(f, t, d, g = 0.35) {
        osc('sine', f * 1.02, t, 0.05, d, {
          gain: g,
          slideTo: f,
          slideTime: 0.08,
          attack: 0.003,
          release: 1.3,
        });
        osc('sine', f * 1.5, t, 0.03, d, { gain: g * 0.35, attack: 0.003, release: 0.6 });
        osc('triangle', f * 2, t, 0.02, d, { gain: g * 0.12, attack: 0.002, release: 0.35 });
        noise(t, 0.04, d, { gain: g * 0.35, type: 'lowpass', freq: 900, release: 0.12 });
      },
      // big war drum
      taiko(t, d, g = 0.5) {
        osc('sine', 95, t, 0.06, d, {
          gain: g,
          slideTo: 46,
          slideTime: 0.14,
          attack: 0.002,
          release: 0.9,
        });
        noise(t, 0.05, d, { gain: g * 0.5, type: 'lowpass', freq: 500, release: 0.2 });
        noise(t, 0.012, d, { gain: g * 0.25, freq: 1800, q: 1, release: 0.02 });
      },
      // reverse cymbal rising into the next downbeat
      swell(t, dur, d, g = 0.06) {
        noise(t, dur, d, { gain: g, type: 'highpass', freq: 3000, attack: dur, release: 0.15 });
      },
      tom(t, f, d, g = 0.4) {
        osc('sine', f * 1.6, t, 0.2, d, {
          gain: g,
          slideTo: f,
          slideTime: 0.1,
          release: 0.28,
          attack: 0.002,
        });
        noise(t, 0.03, d, { gain: g * 0.4, freq: 300, q: 1, release: 0.05 });
      },
      crash(t, d, g = 0.15) {
        noise(t, 0.3, d, { gain: g, type: 'highpass', freq: 5000, release: 1.6 });
      },
      pluck(f, t, dur, d, o = {}) {
        const cut = o.cutoff || 3000;
        osc(o.type || 'triangle', f, t, dur * 0.3, d, {
          gain: o.gain ?? 0.1,
          cutoff: cut,
          cutoffTo: Math.max(200, cut * 0.15),
          attack: 0.004,
          release: dur * 0.7,
        });
        if (!o.type || o.type === 'triangle')
          osc('sine', f * 2, t, dur * 0.15, d, {
            gain: (o.gain ?? 0.1) * 0.3,
            attack: 0.003,
            release: dur * 0.3,
          });
      },
      bell(f, t, dur, d, g = 0.05) {
        [
          [1, 1],
          [2.76, 0.5],
          [5.4, 0.25],
          [8.93, 0.12],
        ].forEach(([r, a], i) => {
          osc('sine', f * r, t, 0.01, d, {
            gain: g * a,
            attack: 0.002,
            release: dur / (1 + i * 0.7),
          });
        });
      },
      // String section: three detuned saws per note, gentle vibrato arriving after the attack.
      strings(notes, t, dur, d, o = {}) {
        const g = o.gain ?? 0.04;
        const rel = o.release ?? 0.6;
        const bus = ctx.createGain();
        env(bus.gain, t, 1, o.attack ?? 0.25, dur, rel);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = o.cutoff ?? 2400;
        f.Q.value = 0.5;
        f.connect(bus).connect(d);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.2 + Math.random() * 0.6;
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(o.vibrato ?? 7, t + 0.4);
        lfo.connect(lg);
        lfo.start(t);
        lfo.stop(t + dur + rel + 0.1);
        notes.forEach((n) => {
          for (const dt of [-11, 0, 12]) {
            const oc = ctx.createOscillator();
            oc.type = 'sawtooth';
            oc.frequency.value = midi(n);
            oc.detune.value = dt;
            lg.connect(oc.detune);
            const gg = ctx.createGain();
            gg.gain.value = (g / notes.length) * 1.6;
            oc.connect(gg).connect(f);
            oc.start(t);
            oc.stop(t + dur + rel + 0.1);
          }
        });
      },
      // short bowed note (spiccato)
      spiccato(f, t, d, o = {}) {
        for (const dt of [-7, 7]) {
          osc('sawtooth', f, t, 0.07, d, {
            gain: o.gain ?? 0.06,
            cutoff: o.cutoff ?? 2600,
            cutoffTo: (o.cutoff ?? 2600) * 0.35,
            attack: 0.01,
            release: 0.12,
            detune: dt,
          });
        }
      },
      // french horn: warm swelling tone for melodies
      horn(n, t, dur, d, g = 0.06) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 0.8;
        f.frequency.setValueAtTime(420, t);
        f.frequency.exponentialRampToValueAtTime(1700, t + Math.min(0.25, dur * 0.5));
        const out = ctx.createGain();
        env(out.gain, t, g, 0.09, dur, 0.35);
        f.connect(out).connect(d);
        for (const dt of [-5, 5]) {
          const oc = ctx.createOscillator();
          oc.type = 'sawtooth';
          oc.frequency.value = midi(n);
          oc.detune.value = dt;
          oc.connect(f);
          oc.start(t);
          oc.stop(t + dur + 0.45);
        }
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = midi(n);
        const sg = ctx.createGain();
        sg.gain.value = 0.6;
        sub.connect(sg).connect(f);
        sub.start(t);
        sub.stop(t + dur + 0.45);
      },
      drone(n, t, dur, d, o = {}) {
        const f = midi(n);
        osc('sawtooth', f, t, dur, d, {
          gain: o.gain ?? 0.08,
          cutoff: o.cutoff || 250,
          attack: 1,
          release: 1,
          detune: -(o.detune || 6),
        });
        osc('sawtooth', f * 1.0, t, dur, d, {
          gain: o.gain ?? 0.08,
          cutoff: o.cutoff || 250,
          attack: 1,
          release: 1,
          detune: o.detune || 6,
        });
        osc('sine', f / 2, t, dur, d, { gain: (o.gain ?? 0.08) * 1.2, attack: 1, release: 1 });
      },
      choir(notes, t, dur, d, o = {}) {
        const [f1, f2] = FORMANTS[o.vowel || 'ah'];
        const g = o.gain ?? 0.04;
        const bus = ctx.createGain();
        env(bus.gain, t, 1, o.attack || 0.8, dur, 1.2);
        bus.connect(d);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5 + Math.random();
        const lfoG = ctx.createGain();
        lfoG.gain.value = 6;
        lfo.connect(lfoG);
        lfo.start(t);
        lfo.stop(t + dur + 1.4);
        notes.forEach((n) => {
          [-7, 7].forEach((dt) => {
            const oc = ctx.createOscillator();
            oc.type = 'sawtooth';
            oc.frequency.value = midi(n);
            oc.detune.value = dt;
            lfoG.connect(oc.detune);
            [
              [f1, 1],
              [f2, 0.6],
            ].forEach(([ff, a]) => {
              const bp = ctx.createBiquadFilter();
              bp.type = 'bandpass';
              bp.frequency.value = ff;
              bp.Q.value = 5;
              const gg = ctx.createGain();
              gg.gain.value = ((g * a) / notes.length) * 2.2;
              oc.connect(bp).connect(gg).connect(bus);
            });
            oc.start(t);
            oc.stop(t + dur + 1.4);
          });
        });
      },
      brass(notes, t, dur, d, o = {}) {
        notes.forEach((n) => {
          for (const dt of [-8, 8]) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.Q.value = 1.2;
            f.frequency.setValueAtTime(350, t);
            f.frequency.exponentialRampToValueAtTime(2600, t + dur * (o.swell ?? 0.4));
            f.frequency.exponentialRampToValueAtTime(900, t + dur);
            const g = ctx.createGain();
            env(g.gain, t, ((o.gain ?? 0.05) / notes.length) * 2, 0.15, dur, 0.4);
            const oc = ctx.createOscillator();
            oc.type = 'sawtooth';
            oc.frequency.value = midi(n);
            oc.detune.value = dt;
            oc.connect(f).connect(g).connect(d);
            oc.start(t);
            oc.stop(t + dur + 0.5);
          }
        });
      },
      brassStab(notes, t, dur, d, g = 0.05) {
        notes.forEach((n) => {
          for (const dt of [-6, 6]) {
            osc('sawtooth', midi(n), t, dur, d, {
              gain: (g / notes.length) * 2,
              cutoff: 500,
              cutoffTo: 3000,
              attack: 0.03,
              release: 0.15,
              detune: dt,
              q: 1,
            });
          }
        });
      },
      screech(f, t, dur, d, g = 0.03) {
        for (const dt of [-30, 0, 35]) {
          osc('sawtooth', f, t, dur, d, {
            gain: g,
            ftype: 'bandpass',
            cutoff: 2400,
            q: 4,
            slideTo: f * 1.06,
            slideTime: dur,
            attack: dur * 0.5,
            release: 0.6,
            detune: dt,
          });
        }
      },
    };
    return A;
  }

  // ------------------------------------------------------------------ sfx

  sfx(name, opts = {}) {
    if (!this.ctx) return;
    const fn = SFX[name];
    if (!fn) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (!this.offline && now - (this._lastSfx[name] ?? -1) < SFX_MIN_GAP) return;
    this._lastSfx[name] = now;
    const out = ctx.createGain();
    out.gain.value = opts.volume ?? 1;
    let dest = out;
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      out.connect(p).connect(this.sfxBus);
    } else out.connect(this.sfxBus);
    fn(this._A, dest, now + 0.005, opts);
    setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        /* noop */
      }
    }, 4000);
  }

  // ------------------------------------------------------------------ engine

  _buildEngine() {
    const ctx = this.ctx;
    const e = {};
    e.gain = ctx.createGain();
    e.gain.gain.value = 0;
    e.filter = ctx.createBiquadFilter();
    e.filter.type = 'lowpass';
    e.filter.frequency.value = 500;
    e.filter.Q.value = 2;
    e.o1 = ctx.createOscillator();
    e.o1.type = 'sawtooth';
    e.o2 = ctx.createOscillator();
    e.o2.type = 'square';
    e.o2.detune.value = 14;
    e.o3 = ctx.createOscillator();
    e.o3.type = 'sine';
    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const g3 = ctx.createGain();
    g3.gain.value = 0.5;
    e.o1.connect(g1).connect(e.filter);
    e.o2.connect(g2).connect(e.filter);
    e.o3.connect(g3).connect(e.filter);
    // wind/road noise
    e.noise = ctx.createBufferSource();
    e.noise.buffer = this.noiseBuf;
    e.noise.loop = true;
    e.nf = ctx.createBiquadFilter();
    e.nf.type = 'bandpass';
    e.nf.frequency.value = 900;
    e.nf.Q.value = 0.7;
    e.ng = ctx.createGain();
    e.ng.gain.value = 0;
    e.noise.connect(e.nf).connect(e.ng).connect(e.gain);
    e.filter.connect(e.gain);
    e.gain.connect(this.engineBus);
    const t = ctx.currentTime;
    e.o1.frequency.value = 50;
    e.o2.frequency.value = 50;
    e.o3.frequency.value = 25;
    e.o1.start(t);
    e.o2.start(t);
    e.o3.start(t);
    e.noise.start(t);
    this.engine = e;
  }

  /** speedRatio 0..1 (>1 allowed while boosting); negative silences the engine. */
  setEngine(speedRatio, boosting = false) {
    if (!this.engine) {
      if (!this.ctx) return;
    }
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    if (speedRatio < 0) {
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const r = Math.max(0, Math.min(1.6, speedRatio));
    const base = 46 + r * 120 + (boosting ? 26 : 0);
    e.o1.frequency.setTargetAtTime(base, t, 0.06);
    e.o2.frequency.setTargetAtTime(base * 1.005, t, 0.06);
    e.o3.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    e.filter.frequency.setTargetAtTime(260 + r * 1500 + (boosting ? 700 : 0), t, 0.08);
    e.gain.gain.setTargetAtTime(0.055 + Math.min(1, r) * 0.085 + (boosting ? 0.03 : 0), t, 0.08);
    e.ng.gain.setTargetAtTime(Math.min(1, r) * 0.7, t, 0.1);
    e.nf.frequency.setTargetAtTime(500 + r * 2200, t, 0.1);
  }

  stopEngine() {
    this.setEngine(-1);
  }

  // ------------------------------------------------------------------ bus events

  _subscribe() {
    const isP = (k) => k && k.isPlayer;
    return [
      bus.on('kart:drift', ({ kart, level }) => {
        if (isP(kart) && level > 0) this.sfx('drift-charge', { level });
      }),
      bus.on('kart:boost', ({ kart, power }) => {
        if (isP(kart)) {
          this.sfx('boost', { power });
        }
      }),
      bus.on('kart:hit', ({ kart, kind }) => {
        if (isP(kart)) this.sfx(kind === 'explode' ? 'explosion' : 'hit', { kind });
      }),
      bus.on('kart:bump', ({ a, b, force }) => {
        if (isP(a) || isP(b)) this.sfx('bump', { volume: Math.min(1, 0.3 + (force || 0) * 0.02) });
      }),
      bus.on('kart:wall', ({ kart, force }) => {
        if (isP(kart)) this.sfx('wall', { volume: Math.min(1, 0.3 + (force || 0) * 0.03) });
      }),
      bus.on('kart:respawn', ({ kart }) => {
        if (isP(kart)) this.sfx('respawn');
      }),
      bus.on('kart:land', ({ kart }) => {
        if (isP(kart)) this.sfx('bump', { volume: 0.35 });
      }),
      bus.on('item:roll', ({ kart }) => {
        if (isP(kart)) this.sfx('item-roulette');
      }),
      bus.on('item:got', ({ kart }) => {
        if (!isP(kart)) return;
        this.sfx('item-box');
        clearTimeout(this._gotTimer);
        this._gotTimer = setTimeout(() => this.sfx('item-get'), 1200);
      }),
      bus.on('item:used', ({ kart }) => {
        if (isP(kart)) this.sfx('item-use');
      }),
      bus.on('race:lap', ({ kart }) => {
        if (isP(kart)) this.sfx('lap');
      }),
      bus.on('race:final-lap', ({ kart }) => {
        if (isP(kart)) this.sfx('final-lap');
      }),
      bus.on('race:finish', ({ kart }) => {
        if (isP(kart)) this.sfx('finish');
      }),
    ];
  }

  dispose() {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
    this.stopMusic(0.1);
    if (this._gestureFn)
      for (const ev of ['pointerdown', 'keydown', 'touchstart'])
        window.removeEventListener(ev, this._gestureFn);
    if (this.ctx && !this.offline && this.ctx.close) this.ctx.close();
    this.ctx = null;
    this.__A = null;
  }

  // ------------------------------------------------------------------ offline measurement (dev/testing)

  /** Render `music` or `sfx` offline through the full graph; returns { peak, rms }. */
  static async measure(kind, name, seconds = 6, opts = {}) {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const sys = new AudioSystem();
    sys.init({ context: ctx });
    if (kind === 'music') {
      sys.playMusic(name);
      sys._pump(sys.player, seconds);
    } else {
      sys.sfx(name, opts);
    }
    const buf = await ctx.startRendering();
    sys._unsubs.forEach((u) => u());
    let peak = 0,
      sum = 0,
      n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i]);
        if (v > peak) peak = v;
        sum += v * v;
        n++;
      }
    }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
  }
}

// ---------------------------------------------------------------------------------------------
// SFX recipes: (A, dest, t, opts)
// ---------------------------------------------------------------------------------------------

const SFX = {
  'ui-move'(A, d, t) {
    A.osc('sine', 1400, t, 0.03, d, { gain: 0.12, slideTo: 1100, release: 0.05 });
    A.noise(t, 0.01, d, { gain: 0.03, type: 'highpass', freq: 5000 });
  },
  'ui-select'(A, d, t) {
    A.bell(midi(76), t, 1.2, d, 0.12);
    A.bell(midi(83), t + 0.07, 1.4, d, 0.1);
    A.osc('sine', 110, t, 0.1, d, { gain: 0.2, slideTo: 60, release: 0.15 });
  },
  'ui-back'(A, d, t) {
    A.osc('triangle', 660, t, 0.06, d, { gain: 0.14, slideTo: 330, release: 0.08 });
    A.bell(midi(64), t, 0.6, d, 0.06);
  },
  countdown(A, d, t) {
    A.osc('sine', 440, t, 0.28, d, { gain: 0.25, attack: 0.005, release: 0.15 });
    A.osc('triangle', 880, t, 0.2, d, { gain: 0.1, release: 0.15 });
    A.bell(midi(69), t, 1.0, d, 0.08);
  },
  go(A, d, t) {
    [69, 73, 76, 81].forEach((n) => {
      A.osc('sawtooth', midi(n), t, 0.6, d, {
        gain: 0.09,
        cutoff: 3500,
        attack: 0.01,
        release: 0.4,
        detune: 6,
      });
    });
    A.bell(midi(93), t, 1.6, d, 0.1);
    A.noise(t, 0.4, d, { gain: 0.12, freq: 600, freqTo: 5000, release: 0.3 });
  },
  'item-box'(A, d, t) {
    [79, 83, 86, 91].forEach((n, i) => A.bell(midi(n), t + i * 0.045, 0.8, d, 0.08));
    A.osc('sine', 300, t, 0.15, d, { gain: 0.14, slideTo: 900, release: 0.1 });
  },
  'item-roulette'(A, d, t) {
    for (let i = 0; i < 12; i++) {
      const tt = t + i * 0.1;
      A.osc('square', 600 + i * 55, tt, 0.025, d, { gain: 0.06, cutoff: 3000, release: 0.03 });
      A.noise(tt, 0.01, d, { gain: 0.04, type: 'highpass', freq: 4000 });
    }
  },
  'item-get'(A, d, t) {
    [72, 76, 79, 84].forEach((n, i) => A.bell(midi(n), t + i * 0.06, 1.4, d, 0.1));
    A.noise(t, 0.3, d, { gain: 0.05, type: 'highpass', freq: 6000, release: 0.4 });
  },
  'item-use'(A, d, t) {
    A.noise(t, 0.3, d, { gain: 0.22, freq: 500, freqTo: 4000, q: 1.2, release: 0.15 });
    A.osc('triangle', 400, t, 0.15, d, { gain: 0.15, slideTo: 800, release: 0.1 });
  },
  boost(A, d, t) {
    A.noise(t, 0.55, d, { gain: 0.3, freq: 300, freqTo: 3500, q: 1.5, attack: 0.05, release: 0.3 });
    A.osc('sawtooth', 120, t, 0.5, d, {
      gain: 0.14,
      slideTo: 520,
      cutoff: 1800,
      attack: 0.03,
      release: 0.3,
    });
    A.osc('sine', 80, t, 0.1, d, { gain: 0.3, slideTo: 40, release: 0.2 });
  },
  'drift-charge'(A, d, t, o) {
    const lv = Math.max(1, Math.min(3, o.level || 1));
    const f = [midi(88), midi(91), midi(95)][lv - 1];
    A.osc('sine', f, t, 0.08, d, { gain: 0.16, release: 0.25 });
    A.osc('triangle', f * 2, t, 0.05, d, { gain: 0.05, release: 0.2 });
    A.noise(t, 0.05, d, { gain: 0.06 * lv, type: 'highpass', freq: 6000, release: 0.1 });
  },
  'drift-release'(A, d, t) {
    A.noise(t, 0.25, d, { gain: 0.18, freq: 800, freqTo: 3000, release: 0.15 });
    A.osc('sine', 150, t, 0.1, d, { gain: 0.22, slideTo: 50, release: 0.15 });
  },
  hit(A, d, t) {
    A.osc('sawtooth', 500, t, 0.45, d, { gain: 0.2, slideTo: 70, cutoff: 1800, release: 0.2 });
    A.osc('square', 250, t, 0.4, d, { gain: 0.1, slideTo: 60, release: 0.2 });
    A.noise(t, 0.2, d, { gain: 0.2, freq: 1200, q: 0.7, release: 0.2 });
    A.osc('sine', 100, t, 0.1, d, { gain: 0.3, slideTo: 40, release: 0.2 });
  },
  explosion(A, d, t) {
    A.noise(t, 0.6, d, {
      gain: 0.5,
      type: 'lowpass',
      freq: 4000,
      freqTo: 120,
      q: 0.5,
      attack: 0.002,
      release: 0.5,
    });
    A.osc('sine', 110, t, 0.5, d, { gain: 0.5, slideTo: 28, release: 0.5, attack: 0.003 });
    A.noise(t, 0.05, d, { gain: 0.3, type: 'highpass', freq: 3000, release: 0.1 });
  },
  bump(A, d, t) {
    A.osc('sine', 130, t, 0.06, d, { gain: 0.35, slideTo: 55, release: 0.1, attack: 0.002 });
    A.noise(t, 0.04, d, { gain: 0.15, freq: 900, release: 0.06 });
  },
  wall(A, d, t) {
    A.noise(t, 0.18, d, { gain: 0.2, freq: 1400, freqTo: 500, q: 1.5, release: 0.15 });
    A.osc('sine', 90, t, 0.08, d, { gain: 0.3, slideTo: 45, release: 0.12, attack: 0.002 });
  },
  lap(A, d, t) {
    [72, 76, 79].forEach((n, i) => A.bell(midi(n), t + i * 0.12, 1.6, d, 0.12));
  },
  'final-lap'(A, d, t) {
    A.brassStab([57, 64, 69], t, 0.5, d, 0.14);
    A.brassStab([62, 66, 69, 74], t + 0.38, 0.9, d, 0.16);
    A.tom(t, 70, d, 0.6);
    A.tom(t + 0.38, 55, d, 0.7);
    A.bell(midi(86), t + 0.38, 2.0, d, 0.1);
  },
  finish(A, d, t) {
    const seq = [
      [62, 0],
      [66, 0.18],
      [69, 0.36],
      [74, 0.6],
    ];
    seq.forEach(([n, dt]) => A.brassStab([n, n + 7], t + dt, 0.5, d, 0.14));
    A.choir([62, 69, 74, 78], t + 0.6, 2.4, d, { gain: 0.09, attack: 0.3, vowel: 'ah' });
    A.crash(t + 0.6, d, 0.2);
    A.bell(midi(86), t + 0.6, 2.5, d, 0.1);
  },
  respawn(A, d, t) {
    A.osc('sine', 200, t, 0.5, d, { gain: 0.16, slideTo: 1400, attack: 0.05, release: 0.3 });
    A.bell(midi(84), t + 0.4, 1.4, d, 0.1);
    A.noise(t, 0.5, d, { gain: 0.06, type: 'highpass', freq: 4000, release: 0.4 });
  },
  coin(A, d, t) {
    A.osc('square', midi(83), t, 0.06, d, { gain: 0.1, release: 0.05, cutoff: 5000 });
    A.osc('square', midi(88), t + 0.06, 0.25, d, { gain: 0.1, release: 0.2, cutoff: 5000 });
  },
};

export const SFX_NAMES = Object.keys(SFX);
export const MUSIC_IDS = Object.keys(MUSIC);
