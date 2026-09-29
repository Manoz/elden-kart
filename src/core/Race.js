import { bus } from './bus.js';

const OVER_TIMEOUT = 15; // seconds the race keeps running after the first human finishes
const RB_RANGE = 160; // metres of gap at which rubber banding saturates
const RB_HELP = 0.06; // max speed bonus for AI far behind
const RB_HINDER = 0.035; // max speed penalty for AI far ahead
const RB_SMOOTH = 1.5; // 1/s response of the scale
const CP_SKIP = 2; // how many checkpoints may be skipped in one frame (fast karts, lag spikes)

function wrapDelta(d) {
  if (d > 0.5) return d - 1;
  if (d < -0.5) return d + 1;
  return d;
}

export class Race {
  constructor({ track, karts, laps }) {
    this.track = track;
    this.karts = karts;
    this.laps = laps ?? track.laps ?? 3;
    this.state = 'countdown';
    this.elapsed = 0;
    this.results = null;
    this._finishedCount = 0;
    this._anchorTime = null; // elapsed when the race-over countdown started
    this._over = false;
    this._ranking = karts.slice();
    this._rec = new Map();
    karts.forEach((kart, i) => {
      this._rec.set(kart, {
        grid: i,
        ready: false,
        cpCount: 0, // checkpoints consumed; the first one (cp 0) is the start line crossing
        nextCp: 0,
        lapsDone: 0,
        prevT: 0,
        unwrapped: 0, // continuous progress in laps, 0 = start line
        finalLapSent: false,
        lapStart: 0,
      });
      kart.lap = 1;
      kart.finished = false;
      kart.finishTime = 0;
      kart.place = kart.rank = i + 1;
      kart.lapProgress = 0;
      kart.lapTimes = [];
      kart.aiSpeedScale = 1;
    });
  }

  start() {
    if (this.state !== 'countdown') return;
    this.state = 'racing';
    this.elapsed = 0;
    bus.emit('race:start', { race: this });
  }

  getRanking() {
    return this._ranking.slice();
  }

  getResults() {
    return this.results ?? this._buildResults();
  }

  update(dt) {
    if (this.state === 'finished') return;
    this._trackProgress();
    if (this.state === 'racing') {
      this.elapsed += dt;
      this._trackCheckpoints();
      this._rank();
      this._rubberBand(dt);
      this._checkOver();
    } else {
      this._rank();
    }
  }

  _initRec(kart, rec) {
    let t = kart.t;
    if (!Number.isFinite(t)) {
      t = this.track.sample(kart.pos, undefined).t;
      kart.t = t;
    }
    rec.prevT = t;
    rec.unwrapped = t > 0.5 ? t - 1 : t;
    // Starting cell: karts on the grid sit behind the line, so cp 0 is not consumed yet.
    rec.nextCp = t > 0.5 ? 0 : 1;
    rec.cpCount = t > 0.5 ? 0 : 1;
    rec.ready = true;
  }

  _trackProgress() {
    for (const kart of this.karts) {
      const rec = this._rec.get(kart);
      if (!rec.ready) this._initRec(kart, rec);
      const t = Number.isFinite(kart.t) ? kart.t : rec.prevT;
      rec.unwrapped += wrapDelta(t - rec.prevT);
      rec.prevT = t;
    }
  }

  _trackCheckpoints() {
    const n = this.track.checkpoints;
    for (const kart of this.karts) {
      const rec = this._rec.get(kart);
      if (kart.finished) continue;
      const cp = Math.min(n - 1, Math.floor(rec.prevT * n));
      const diff = (cp - rec.nextCp + n) % n;
      if (diff > CP_SKIP) continue; // behind or too far ahead: shortcut / wrong way, ignore
      const before = rec.lapsDone;
      rec.cpCount += diff + 1;
      rec.nextCp = (cp + 1) % n;
      const done = rec.cpCount > 0 ? Math.floor((rec.cpCount - 1) / n) : 0;
      if (done > before) {
        rec.lapsDone = done;
        this._lapCompleted(kart, rec);
      }
    }
  }

  _lapCompleted(kart, rec) {
    const lapTime = this.elapsed - rec.lapStart;
    rec.lapStart = this.elapsed;
    kart.lapTimes.push(lapTime);
    if (rec.lapsDone >= this.laps) {
      this._finish(kart);
      return;
    }
    kart.lap = rec.lapsDone + 1;
    bus.emit('race:lap', { kart, lap: kart.lap, time: lapTime });
    if (kart.lap === this.laps && !rec.finalLapSent) {
      rec.finalLapSent = true;
      bus.emit('race:final-lap', { kart });
    }
  }

  _finish(kart) {
    kart.finished = true;
    kart.finishTime = this.elapsed;
    kart.lap = this.laps;
    kart.place = kart.rank = ++this._finishedCount;
    if (this._anchorTime === null && (kart.isPlayer || !this.karts.some((k) => k.isPlayer))) {
      this._anchorTime = this.elapsed;
    }
    bus.emit('race:finish', { kart, place: kart.place, time: kart.finishTime });
  }

  _progressOf(kart) {
    const rec = this._rec.get(kart);
    // Never let a shortcut overtake the checkpoint count: cap at the next lap boundary.
    return Math.min(rec.unwrapped, rec.lapsDone + 1 - 1e-4);
  }

  _rank() {
    const rec = this._rec;
    for (const kart of this.karts) {
      const r = rec.get(kart);
      kart.lapProgress = kart.finished ? this.laps + 1 : this._progressOf(kart);
      kart.lap = kart.finished ? this.laps : Math.min(this.laps, r.lapsDone + 1);
    }
    this._ranking.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.place - b.place;
      const d = b.lapProgress - a.lapProgress;
      return d !== 0 ? d : rec.get(a).grid - rec.get(b).grid;
    });
    this._ranking.forEach((kart, i) => {
      if (!kart.finished) kart.place = kart.rank = i + 1;
    });
  }

  _rubberBand(dt) {
    const humans = this.karts.filter((k) => k.isPlayer && !k.finished);
    const len = this.track.length;
    let ref;
    if (humans.length) {
      ref = humans.reduce((s, k) => s + k.lapProgress, 0) / humans.length;
    } else {
      ref = this.karts.reduce((s, k) => s + k.lapProgress, 0) / this.karts.length;
    }
    const k = 1 - Math.exp(-RB_SMOOTH * dt);
    for (const kart of this.karts) {
      if (kart.isPlayer) {
        kart.aiSpeedScale = 1;
        continue;
      }
      let target = 1;
      if (!kart.finished && humans.length) {
        const gap = (ref - kart.lapProgress) * len; // > 0: AI is behind the human
        const x = Math.max(-1, Math.min(1, gap / RB_RANGE));
        target = 1 + (x >= 0 ? x * RB_HELP : x * RB_HINDER);
      }
      kart.aiSpeedScale += (target - kart.aiSpeedScale) * k;
    }
  }

  _checkOver() {
    if (this._over) return;
    const allDone = this.karts.every((k) => k.finished);
    const timeout = this._anchorTime !== null && this.elapsed - this._anchorTime >= OVER_TIMEOUT;
    if (!allDone && !timeout) return;
    this._over = true;
    this.results = this._buildResults();
    this.state = 'finished';
    bus.emit('race:over', { results: this.results });
  }

  _buildResults() {
    const out = [];
    const ranking = this._ranking;
    let last = 0;
    ranking.forEach((kart, i) => {
      let time;
      let estimated = false;
      if (kart.finished) {
        time = kart.finishTime;
      } else {
        // Extrapolate at the kart's average pace so far.
        const prog = Math.max(0.001, this._progressOf(kart));
        const pace = Math.max(prog / Math.max(this.elapsed, 0.001), 0.005);
        time = this.elapsed + Math.max(0, this.laps - this._progressOf(kart)) / pace;
        estimated = true;
      }
      time = Math.max(time, last + (estimated ? 0.01 : 0));
      last = time;
      out.push({ kart, place: i + 1, time, estimated });
    });
    return out;
  }
}
