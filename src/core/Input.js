const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyC',
  'KeyB',
  'KeyR',
  'KeyP',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
]);

const dead = (v, z = 0.15) => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));

// Keyboard + gamepad -> a plain state object that Game copies into kart.inputs.
export class Input {
  constructor(target = window) {
    this.target = target;
    this.enabled = false;
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, drift: false, useItem: false };
    this.lookBehind = false;
    this.onPause = null;
    this.onReset = null;
    this._padPrev = { start: false, select: false };

    this._down = (e) => {
      if (e.repeat) {
        if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      else if (e.code === 'KeyR') this.onReset?.();
    };
    this._up = (e) => this.keys.delete(e.code);
    this._blur = () => this.keys.clear();

    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
  }

  dispose() {
    this.target.removeEventListener('keydown', this._down);
    this.target.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }

  _pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Samples devices and returns the (smoothed) input state.
  update(dt) {
    const k = this.keys;
    const s = this.state;
    if (!this.enabled) {
      s.throttle = s.brake = s.steer = 0;
      s.drift = s.useItem = false;
      this.lookBehind = false;
      return s;
    }

    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    let steer =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let drift = k.has('Space');
    let item =
      k.has('KeyE') ||
      k.has('ShiftLeft') ||
      k.has('ShiftRight') ||
      k.has('ControlLeft') ||
      k.has('ControlRight');
    let look = k.has('KeyC') || k.has('KeyB');
    let analogSteer = null;

    const pad = this._pad();
    if (pad) {
      const b = (i) => !!pad.buttons[i]?.pressed;
      const v = (i) => pad.buttons[i]?.value || 0;
      const ax = dead(pad.axes[0] || 0);
      if (ax !== 0) analogSteer = ax;
      if (b(14)) steer -= 1;
      if (b(15)) steer += 1;
      throttle = Math.max(throttle, b(0) ? 1 : 0, v(7));
      brake = Math.max(brake, b(1) ? 1 : 0, v(6));
      drift = drift || b(5) || b(4);
      item = item || b(2);
      look = look || b(3);
      const start = b(9);
      if (start && !this._padPrev.start) this.onPause?.();
      this._padPrev.start = start;
      const select = b(8);
      if (select && !this._padPrev.select) this.onReset?.();
      this._padPrev.select = select;
    }

    // Smooth ramp: quick to build, faster to recentre; analog stick passes through.
    if (analogSteer !== null && steer === 0) {
      s.steer += (analogSteer - s.steer) * Math.min(1, dt * 20);
    } else {
      const target = Math.max(-1, Math.min(1, steer));
      let rate = 6.5;
      if (target === 0) rate = 11;
      else if (Math.sign(target) !== Math.sign(s.steer) && s.steer !== 0) rate = 14;
      const step = rate * dt;
      const d = target - s.steer;
      s.steer += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }
    s.throttle = throttle;
    s.brake = brake;
    s.drift = drift;
    s.useItem = item;
    this.lookBehind = look;
    return s;
  }
}
