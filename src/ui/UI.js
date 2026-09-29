// DOM/canvas UI: loading, title, select, HUD, countdown, banners, pause, results.
import { bus } from '../core/bus.js';
import { ITEMS } from '../core/data.js';
import { CSS } from './style.js';
import { drawEmblem, drawTrackArt, drawItemIcon, cssColor, Embers } from './art.js';

const ITEM_IDS = Object.values(ITEMS);
const STAT_LABELS = [
  ['speed', 'Speed'],
  ['accel', 'Accel'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
];
const KMH_PER_UNIT = 4.5;
const MAX_KMH = 280;

const sfx = (name) => bus.emit('ui:sfx', { name });
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (t) =>
  String(t).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
}

function fmtTime(t) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}

// Footer of key caps: [['W S', 'Move'], ...]
function keyHints(pairs) {
  return `<div class="ek-keys">${pairs.map(([k, label]) => `<span><kbd>${esc(k)}</kbd>${esc(label)}</span>`).join('')}</div>`;
}

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const st = document.createElement('style');
  st.id = 'ek-ui-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export class UI {
  constructor(rootEl) {
    injectCSS();
    this.host = rootEl || document.getElementById('ui') || document.body;
    this.root = el('div', 'ek-ui');
    this.root.style.pointerEvents = 'none';
    this.host.appendChild(this.root);
    this.layer = el('div', 'ek-layer');
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:20';
    this.hud = null;
    this.loading = null;
    this._h = {};
    this._banner = null;
    this._toastTimer = 0;
    this._mm = { last: 0, key: null, bg: null };
    this._rollTimer = 0;
    this.root.appendChild(this.layer);
  }

  // ------------------------------------------------------------------ helpers

  _screen(cls, solid = false) {
    const s = el('div', `ek-screen ${cls}${solid ? ' solid' : ''}`);
    this.root.insertBefore(s, this.layer);
    void s.offsetWidth;
    requestAnimationFrame(() => s.classList.add('in'));
    return s;
  }

  _leave(s, ms = 550) {
    return new Promise((res) => {
      s.classList.remove('in');
      s.style.pointerEvents = 'none';
      setTimeout(() => {
        s.remove();
        res();
      }, ms);
    });
  }

  _keys(fn) {
    const h = (e) => {
      if (fn(e)) e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }

  // ------------------------------------------------------------------ loading

  showLoading(progress = 0) {
    if (!this.loading) {
      this.loading = this._screen('ek-loading', true);
      this.loading.innerHTML =
        '<h2 class="ek-gold-text">Elden Kart</h2><div class="ek-loadbar"><b></b></div><div class="ek-hint">Loading</div><div class="ek-vignette"></div>';
      this.loading.classList.add('in');
    }
    this.loading.querySelector('.ek-loadbar b').style.width = `${clamp(progress, 0, 1) * 100}%`;
    if (progress >= 1) this._hideLoading();
  }

  _hideLoading() {
    if (!this.loading) return;
    const s = this.loading;
    this.loading = null;
    this._leave(s, 500);
  }

  // ------------------------------------------------------------------ title

  showTitle() {
    this._hideLoading();
    return new Promise((resolve) => {
      const s = this._screen('ek-title', true);
      s.innerHTML = `
        <div class="ek-glow-tree"></div>
        <canvas class="ek-embers"></canvas>
        <div class="pre">Rise, Tarnished</div>
        <h1 class="ek-gold-text">Elden Kart</h1>
        <div class="ek-div"><i></i></div>
        <div class="sub">Grand Prix of the Lands Between</div>
        <div class="press">Press Enter</div>
        <div class="ek-vignette"></div>`;
      const embers = new Embers(s.querySelector('.ek-embers'), 90);
      embers.start();
      const onResize = () => embers.resize();
      window.addEventListener('resize', onResize);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        sfx('ui-select');
        off();
        window.removeEventListener('resize', onResize);
        s.removeEventListener('click', finish);
        // Crossfade: hand control back at once so the next screen fades in over this one, then drop it.
        s.style.pointerEvents = 'none';
        resolve();
        setTimeout(() => {
          embers.stop();
          s.remove();
        }, 900);
      };
      const off = this._keys(
        (e) =>
          (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && (finish(), true)
      );
      s.addEventListener('click', finish);
    });
  }

  // ------------------------------------------------------------------ main menu

  // Vertical list of plaques over the live 3D backdrop. Resolves with the chosen item id.
  showMainMenu(
    items = [
      ['gp', 'Grand Prix', 'Four circuits, cumulative points, one crown'],
      ['quick', 'Quick Race', 'Choose a circuit and ride'],
      ['settings', 'Settings', 'Volume and graphics quality'],
    ]
  ) {
    return new Promise((resolve) => {
      const s = this._screen('ek-mainmenu');
      s.innerHTML = `
        <div class="ek-mm-shade"></div>
        <div class="ek-mm-head"><div class="pre">Grand Prix of the Lands Between</div><h1 class="ek-gold-text">Elden Kart</h1></div>
        <div class="ek-plaques"></div>
        ${keyHints([
          ['W S', 'Move'],
          ['Enter', 'Select'],
        ])}
        <div class="ek-vignette"></div>`;
      const list = s.querySelector('.ek-plaques');
      let idx = 0,
        done = false;
      const btns = items.map(([, title, sub], i) => {
        const b = el(
          'div',
          'ek-plaque',
          `<div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div>`
        );
        b.style.animationDelay = `${0.08 * i}s`;
        b.addEventListener('mouseenter', () => {
          if (idx !== i) {
            idx = i;
            sfx('ui-move');
            paint();
          }
        });
        b.addEventListener('click', () => pick(i));
        list.appendChild(b);
        return b;
      });
      const paint = () => btns.forEach((b, i) => b.classList.toggle('focus', i === idx));
      const pick = (i) => {
        if (done) return;
        done = true;
        sfx('ui-select');
        off();
        this._leave(s, 350).then(() => resolve(items[i][0]));
      };
      const off = this._keys((e) => {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          idx = (idx + 1) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          idx = (idx - 1 + btns.length) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
          pick(idx);
          return true;
        }
        return false;
      });
      paint();
    });
  }

  // Engine class cards. Resolves with the class id, or null on back.
  showClassSelect({ classes, subtitle = '', initial = 1 }) {
    return new Promise((resolve) => {
      const s = this._screen('ek-classes');
      s.innerHTML = `
        <div class="ek-cls-shade"></div>
        <header><h2 class="ek-gold-text">Choose your Class</h2><div class="ek-div"><i></i></div><div class="ek-hint">${esc(subtitle)}</div></header>
        <div class="ek-cls-row"></div>
        <button class="ek-btn ek-back">Back</button>
        ${keyHints([
          ['A D', 'Choose'],
          ['Enter', 'Confirm'],
          ['Esc', 'Back'],
        ])}
        <div class="ek-vignette"></div>`;
      const row = s.querySelector('.ek-cls-row');
      let idx = clamp(initial, 0, classes.length - 1),
        done = false;
      const cards = classes.map((c, i) => {
        const pips = Array.from(
          { length: 3 },
          (_, k) => `<i class="${k < c.pips ? 'on' : ''}"></i>`
        ).join('');
        const card = el(
          'div',
          `ek-cls c${c.pips}`,
          `<div class="cc">${esc(c.label)}</div><div class="rk">${esc(c.rank)}</div><div class="pips">${pips}</div><div class="ds">${esc(c.desc)}</div>`
        );
        card.addEventListener('mouseenter', () => {
          if (idx !== i) {
            idx = i;
            sfx('ui-move');
            paint();
          }
        });
        card.addEventListener('click', () => finish(classes[i].id));
        row.appendChild(card);
        return card;
      });
      const paint = () => cards.forEach((c, i) => c.classList.toggle('focus', i === idx));
      const finish = (v) => {
        if (done) return;
        done = true;
        sfx(v ? 'ui-select' : 'ui-back');
        off();
        this._leave(s, 350).then(() => resolve(v));
      };
      s.querySelector('.ek-back').addEventListener('click', () => finish(null));
      const off = this._keys((e) => {
        const k = e.code;
        if (k === 'ArrowRight' || k === 'KeyD') {
          idx = (idx + 1) % cards.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (k === 'ArrowLeft' || k === 'KeyA') {
          idx = (idx - 1 + cards.length) % cards.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') {
          finish(classes[idx].id);
          return true;
        }
        if (k === 'Escape' || k === 'Backspace') {
          finish(null);
          return true;
        }
        return false;
      });
      paint();
    });
  }

  // Volume sliders and quality presets. onChange(settings) fires on every edit; resolves with the final settings.
  showSettings(settings, { qualities, onChange }) {
    return new Promise((resolve) => {
      const st = { ...settings };
      const qIds = Object.keys(qualities);
      const rows = [
        { key: 'master', label: 'Master Volume', type: 'vol' },
        { key: 'music', label: 'Music', type: 'vol' },
        { key: 'sfx', label: 'Effects', type: 'vol' },
        { key: 'quality', label: 'Graphics Quality', type: 'opt' },
        { key: 'back', label: 'Back', type: 'btn' },
      ];
      const s = this._screen('ek-settings ek-overlay');
      s.innerHTML = `<div class="ek-menu ek-panel ek-set"><h2 class="ek-gold-text">Settings</h2><div class="ek-div"><i></i></div><div class="rows"></div></div>
        ${keyHints([
          ['W S', 'Move'],
          ['A D', 'Adjust'],
          ['Esc', 'Back'],
        ])}`;
      const box = s.querySelector('.rows');
      let idx = 0,
        done = false;
      const els = rows.map((r, i) => {
        let row;
        if (r.type === 'btn') {
          row = el('button', 'ek-btn', esc(r.label));
          row.addEventListener('click', () => finish());
        } else {
          row = el(
            'div',
            'ek-set-row',
            `<span class="lb">${esc(r.label)}</span><div class="ctl"></div><span class="vl"></span>`
          );
          const ctl = row.querySelector('.ctl');
          if (r.type === 'vol') {
            for (let k = 1; k <= 10; k++) {
              const seg = el('i');
              seg.addEventListener('click', () => set(r, k / 10));
              ctl.appendChild(seg);
            }
          } else {
            qIds.forEach((q) => {
              const b = el('b', '', esc(qualities[q].label));
              b.addEventListener('click', () => set(r, q));
              ctl.appendChild(b);
            });
          }
        }
        row.addEventListener('mouseenter', () => {
          if (idx !== i) {
            idx = i;
            paint();
          }
        });
        box.appendChild(row);
        return row;
      });
      const paint = () => {
        els.forEach((e, i) => e.classList.toggle('focus', i === idx));
        rows.forEach((r, i) => {
          const e = els[i];
          if (r.type === 'vol') {
            const n = Math.round(st[r.key] * 10);
            [...e.querySelectorAll('.ctl i')].forEach((seg, k) =>
              seg.classList.toggle('on', k < n)
            );
            e.querySelector('.vl').textContent = `${n * 10}%`;
          } else if (r.type === 'opt') {
            [...e.querySelectorAll('.ctl b')].forEach((b, k) =>
              b.classList.toggle('on', qIds[k] === st.quality)
            );
            e.querySelector('.vl').textContent = '';
          }
        });
      };
      const set = (r, v) => {
        st[r.key] = v;
        sfx('ui-move');
        onChange?.({ ...st });
        paint();
      };
      const adjust = (d) => {
        const r = rows[idx];
        if (r.type === 'vol') set(r, clamp(Math.round((st[r.key] + d * 0.1) * 10) / 10, 0, 1));
        else if (r.type === 'opt')
          set(r, qIds[clamp(qIds.indexOf(st.quality) + d, 0, qIds.length - 1)]);
      };
      const finish = () => {
        if (done) return;
        done = true;
        sfx('ui-back');
        off();
        this._leave(s, 300).then(() => resolve({ ...st }));
      };
      const off = this._keys((e) => {
        const k = e.code;
        if (k === 'ArrowDown' || k === 'KeyS') {
          idx = (idx + 1) % rows.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (k === 'ArrowUp' || k === 'KeyW') {
          idx = (idx - 1 + rows.length) % rows.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (k === 'ArrowRight' || k === 'KeyD') {
          adjust(1);
          return true;
        }
        if (k === 'ArrowLeft' || k === 'KeyA') {
          adjust(-1);
          return true;
        }
        if (k === 'Escape' || k === 'Backspace') {
          finish();
          return true;
        }
        if ((k === 'Enter' || k === 'NumpadEnter' || k === 'Space') && rows[idx].type === 'btn') {
          finish();
          return true;
        }
        return false;
      });
      paint();
    });
  }

  // ------------------------------------------------------------------ select

  // Character (and optionally circuit) picker. Resolves { characterId, trackId } or null when backing out.
  showSelect({ characters, tracks, pickTrack = true }) {
    return new Promise((resolve) => {
      const s = this._screen(`ek-select${pickTrack ? '' : ' no-track'}`, true);
      s.innerHTML = `
        <canvas class="ek-embers"></canvas>
        <header><h2 class="ek-gold-text">Choose your Champion</h2><div class="ek-div"><i></i></div></header>
        <div class="ek-main">
          <section class="ek-panel" data-zone="char"><h3>Tarnished</h3><div class="ek-cards"></div></section>
          <section class="ek-panel" data-zone="track"><h3>Circuit</h3>
            <div class="ek-track">
              <div class="ek-art"><div class="ek-arrow l">&#10094;</div><div class="ek-arrow r">&#10095;</div></div>
              <div class="ek-dots"></div>
              <div class="ek-tinfo"><div class="n"></div><div class="s"></div><div class="l"></div></div>
            </div>
          </section>
        </div>
        <div class="ek-footer"><div class="ek-hint">Arrows navigate &middot; Enter confirm &middot; Esc back</div><button class="ek-btn">Begin the Race</button></div>
        <div class="ek-vignette"></div>`;
      const embers = new Embers(s.querySelector('.ek-embers'), 40);
      embers.start();
      const onResize = () => embers.resize();
      window.addEventListener('resize', onResize);

      let ci = 0,
        ti = 0,
        zone = 'char';
      const cardsEl = s.querySelector('.ek-cards');
      const cards = characters.map((ch, i) => {
        const card = el('div', 'ek-card');
        const cv = el('canvas');
        cv.width = cv.height = 220;
        drawEmblem(cv, ch);
        card.appendChild(cv);
        card.appendChild(el('div', 'nm', ch.name));
        card.appendChild(el('div', 'tt', ch.title));
        const st = el('div', 'ek-stats');
        for (const [k, label] of STAT_LABELS) {
          st.appendChild(el('span', '', label));
          const bar = el('div', 'ek-bar', `<b style="width:${(ch.stats[k] / 5) * 100}%"></b>`);
          st.appendChild(bar);
        }
        card.appendChild(st);
        card.addEventListener('click', () => {
          if (ci !== i) sfx('ui-move');
          ci = i;
          if (pickTrack) setZone('track');
          refresh();
        });
        cardsEl.appendChild(card);
        return card;
      });

      const art = s.querySelector('.ek-art');
      const arts = tracks.map((t, i) => {
        const cv = el('canvas');
        cv.width = 640;
        cv.height = 360;
        drawTrackArt(cv, t.id);
        cv.style.opacity = i === 0 ? '1' : '0';
        art.insertBefore(cv, art.firstChild);
        return cv;
      });
      const dotsEl = s.querySelector('.ek-dots');
      const dots = tracks.map((t, i) => {
        const d = el('i');
        d.addEventListener('click', () => {
          ti = i;
          sfx('ui-move');
          refresh();
        });
        dotsEl.appendChild(d);
        return d;
      });
      const tn = s.querySelector('.ek-tinfo .n'),
        ts = s.querySelector('.ek-tinfo .s'),
        tl = s.querySelector('.ek-tinfo .l');
      const panels = [...s.querySelectorAll('.ek-panel')];

      const setZone = (z) => {
        zone = z;
        panels.forEach((p) => p.classList.toggle('active', p.dataset.zone === z));
      };
      const refresh = () => {
        cards.forEach((c, i) => c.classList.toggle('sel', i === ci));
        arts.forEach((c, i) => {
          c.style.opacity = i === ti ? '1' : '0';
        });
        dots.forEach((d, i) => d.classList.toggle('on', i === ti));
        const t = tracks[ti];
        tn.textContent = t.name;
        ts.textContent = t.subtitle;
        tl.textContent = `${t.laps} laps`;
      };
      const moveTrack = (d) => {
        ti = (ti + d + tracks.length) % tracks.length;
        sfx('ui-move');
        refresh();
      };
      s.querySelector('.ek-arrow.l').addEventListener('click', () => moveTrack(-1));
      s.querySelector('.ek-arrow.r').addEventListener('click', () => moveTrack(1));
      panels[1].addEventListener('mousedown', () => setZone('track'));
      panels[0].addEventListener('mousedown', () => setZone('char'));

      let done = false;
      const confirm = () => {
        if (done) return;
        done = true;
        sfx('ui-select');
        off();
        window.removeEventListener('resize', onResize);
        const result = {
          characterId: characters[ci].id,
          trackId: pickTrack ? tracks[ti].id : null,
        };
        this._leave(s, 650).then(() => {
          embers.stop();
          resolve(result);
        });
      };
      const back = () => {
        if (done) return;
        done = true;
        sfx('ui-back');
        off();
        window.removeEventListener('resize', onResize);
        this._leave(s, 450).then(() => {
          embers.stop();
          resolve(null);
        });
      };
      s.querySelector('.ek-btn').addEventListener('click', confirm);

      const off = this._keys((e) => {
        const k = e.code;
        if (k === 'Enter' || k === 'NumpadEnter') {
          if (zone === 'char' && pickTrack) {
            sfx('ui-select');
            setZone('track');
          } else confirm();
          return true;
        }
        if (k === 'Escape' || k === 'Backspace') {
          if (zone === 'track') {
            sfx('ui-back');
            setZone('char');
          } else back();
          return true;
        }
        if (k === 'Tab' && pickTrack) {
          setZone(zone === 'char' ? 'track' : 'char');
          sfx('ui-move');
          return true;
        }
        const dx =
          k === 'ArrowRight' || k === 'KeyD' ? 1 : k === 'ArrowLeft' || k === 'KeyA' ? -1 : 0;
        const dy = k === 'ArrowDown' || k === 'KeyS' ? 1 : k === 'ArrowUp' || k === 'KeyW' ? -1 : 0;
        if (!dx && !dy) return false;
        if (zone === 'track') {
          if (dx) moveTrack(dx);
          else {
            setZone('char');
            sfx('ui-move');
          }
          return true;
        }
        const cols = getComputedStyle(cardsEl).gridTemplateColumns.split(' ').length || 4;
        let n = ci + dx + dy * cols;
        if (dy && (n < 0 || n >= characters.length)) {
          if (dy > 0 && pickTrack) {
            setZone('track');
            sfx('ui-move');
            return true;
          }
          n = ci;
        }
        n = (n + characters.length) % characters.length;
        if (n !== ci) {
          ci = n;
          sfx('ui-move');
          refresh();
        }
        return true;
      });
      setZone('char');
      refresh();
    });
  }

  // ------------------------------------------------------------------ HUD

  _buildHUD() {
    const h = el('div', 'ek-hud');
    h.innerHTML = `
      <div class="ek-itemslot"><div class="ek-frame"></div><canvas width="128" height="128"></canvas><div class="lbl">Item</div></div>
      <div class="ek-times shadow"><div><span>Lap</span><b class="lt">0:00.000</b></div><div><span>Total</span><b class="tt">0:00.000</b></div></div>
      <div class="ek-mm"><div class="ek-frame"></div><canvas></canvas></div>
      <div class="ek-lap shadow">Lap <b class="lc">1</b><small>/<span class="ll">3</span></small></div>
      <div class="ek-pos"><span class="num ek-gold-text">1</span><span class="ord ek-gold-text">st</span><span class="of shadow">/8</span></div>
      <div class="ek-speedo">
        <svg viewBox="0 0 200 170">
          <path d="M 43.4 156.6 A 80 80 0 1 1 156.6 156.6" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="12" stroke-linecap="round"/>
          <path d="M 43.4 156.6 A 80 80 0 1 1 156.6 156.6" fill="none" stroke="rgba(201,169,79,.3)" stroke-width="2" transform="translate(0,0)" stroke-linecap="round"/>
          <path class="arc" d="M 43.4 156.6 A 80 80 0 1 1 156.6 156.6" pathLength="100" fill="none" stroke="#e0c26a" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 100" style="filter:drop-shadow(0 0 6px rgba(201,169,79,.7))"/>
        </svg>
        <div class="val shadow"><b>0</b><span>KM/H</span></div>
        <div class="surge">SURGE</div>
      </div>
      <div class="ek-board"></div>
      <div class="ek-drift"><i></i><i></i><i></i></div>
      <div class="ek-toast"></div>`;
    this.root.insertBefore(h, this.layer);
    const q = (s) => h.querySelector(s);
    this.hud = h;
    this._h = {
      slot: q('.ek-itemslot'),
      slotCv: q('.ek-itemslot canvas'),
      lt: q('.lt'),
      tt: q('.tt'),
      mm: q('.ek-mm canvas'),
      lc: q('.lc'),
      ll: q('.ll'),
      pos: q('.ek-pos'),
      num: q('.ek-pos .num'),
      ord: q('.ek-pos .ord'),
      of: q('.ek-pos .of'),
      speedo: q('.ek-speedo'),
      arc: q('.ek-speedo .arc'),
      spd: q('.ek-speedo .val b'),
      drift: q('.ek-drift'),
      toast: q('.ek-toast'),
      board: q('.ek-board'),
      last: {},
    };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this._h.mm.width = this._h.mm.height = Math.round(240 * dpr);
    this._mm.dpr = dpr;
  }

  showHUD() {
    if (!this.hud) this._buildHUD();
    this._h.last = {};
    this._h.board.innerHTML = '';
    this._board = null;
    this._mm.key = null;
    void this.hud.offsetWidth;
    this.hud.classList.add('in');
  }

  hideHUD() {
    if (!this.hud) return;
    this.hud.classList.remove('in');
    this._stopRoll();
  }

  updateHUD(d) {
    if (!this.hud || !d) return;
    const h = this._h,
      L = h.last;

    if (d.position !== undefined && (d.position !== L.position || d.racers !== L.racers)) {
      const changed = L.position !== undefined && d.position !== L.position;
      h.num.textContent = d.position;
      h.ord.textContent = ordinal(d.position);
      h.of.textContent = `/${d.racers ?? 8}`;
      h.pos.classList.toggle('first', d.position === 1);
      if (changed) {
        h.pos.classList.remove('bump');
        void h.pos.offsetWidth;
        h.pos.classList.add('bump');
      }
      L.position = d.position;
      L.racers = d.racers;
    }
    if (d.lap !== undefined && (d.lap !== L.lap || d.laps !== L.laps)) {
      h.lc.textContent = Math.max(1, d.lap);
      h.ll.textContent = d.laps ?? 3;
      L.lap = d.lap;
      L.laps = d.laps;
    }
    if (d.lapTime !== undefined) {
      const s = fmtTime(d.lapTime);
      if (s !== L.lapTime) {
        h.lt.textContent = s;
        L.lapTime = s;
      }
    }
    if (d.totalTime !== undefined) {
      const s = fmtTime(d.totalTime);
      if (s !== L.totalTime) {
        h.tt.textContent = s;
        L.totalTime = s;
      }
    }
    if (d.speed !== undefined) {
      const kmh = Math.round(Math.abs(d.speed) * KMH_PER_UNIT);
      if (kmh !== L.kmh) {
        h.spd.textContent = kmh;
        h.arc.setAttribute('stroke-dasharray', `${clamp(kmh / MAX_KMH, 0, 1) * 100} 100`);
        L.kmh = kmh;
      }
    }
    if (d.boost !== undefined) {
      const on = typeof d.boost === 'boolean' ? d.boost : d.boost > 0;
      if (on !== L.boost) {
        h.speedo.classList.toggle('boost', on);
        h.arc.setAttribute('stroke', on ? '#ff9a2a' : '#e0c26a');
        L.boost = on;
      }
    }
    if (d.driftLevel !== undefined && d.driftLevel !== L.driftLevel) {
      h.drift.className = `ek-drift${d.driftLevel > 0 ? ` on l${d.driftLevel}` : ''}`;
      L.driftLevel = d.driftLevel;
    }
    if (d.itemRolling !== undefined || d.item !== undefined)
      this._updateItem(!!d.itemRolling, d.item ?? null);
    if (d.minimap) this._drawMinimap(d.minimap);
    if (d.standings) this._updateBoard(d.standings);
    if (d.message !== undefined && d.message !== L.message) {
      L.message = d.message;
      if (d.message) this._toast(typeof d.message === 'string' ? d.message : d.message.text);
    }
  }

  _updateItem(rolling, item) {
    const h = this._h,
      L = h.last;
    if (rolling === L.rolling && item === L.item) return;
    const startRoll = rolling && !L.rolling;
    L.rolling = rolling;
    L.item = item;
    const slot = h.slot;
    slot.classList.toggle('rolling', rolling);
    if (rolling) {
      if (startRoll) {
        this._stopRoll();
        let i = Math.floor(Math.random() * ITEM_IDS.length);
        slot.classList.remove('has');
        const tick = () => {
          i = (i + 1 + Math.floor(Math.random() * 3)) % ITEM_IDS.length;
          drawItemIcon(h.slotCv, ITEM_IDS[i]);
        };
        tick();
        this._rollTimer = setInterval(tick, 85);
      }
      return;
    }
    this._stopRoll();
    slot.classList.remove('has');
    if (item) {
      drawItemIcon(h.slotCv, item);
      void slot.offsetWidth;
      slot.classList.add('has');
    } else {
      h.slotCv.getContext('2d').clearRect(0, 0, h.slotCv.width, h.slotCv.height);
    }
  }

  // Live race order: one row per racer, slid into place with a CSS transform when the order changes.
  _updateBoard(list) {
    const box = this._h.board;
    if (!this._board) {
      this._board = { rows: new Map(), key: '' };
      for (const r of list) {
        const row = el(
          'div',
          `ek-brow${r.isPlayer ? ' you' : ''}`,
          `<span class="p"></span><i style="background:${cssColor(r.color)}"></i><span class="n">${esc(r.name.replace(/^The /, ''))}</span><span class="f"></span>`
        );
        box.appendChild(row);
        this._board.rows.set(r.id, row);
      }
    }
    const key = list.map((r) => `${r.id}${r.finished ? '!' : ''}`).join('|');
    if (key === this._board.key) return;
    this._board.key = key;
    list.forEach((r, i) => {
      const row = this._board.rows.get(r.id);
      if (!row) return;
      row.style.transform = `translateY(${i * 100}%)`;
      row.querySelector('.p').textContent = i + 1;
      row.classList.toggle('fin', !!r.finished);
      row.classList.toggle('lead', i === 0);
    });
  }

  _stopRoll() {
    if (this._rollTimer) clearInterval(this._rollTimer);
    this._rollTimer = 0;
  }

  _toast(text) {
    const t = this._h.toast;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  _drawMinimap(m) {
    const now = performance.now();
    if (now - this._mm.last < 50) return;
    this._mm.last = now;
    const cv = this._h.mm,
      S = cv.width,
      c = cv.getContext('2d');
    const b = m.bounds;
    if (!m.points || !b) return;
    const pad = S * 0.14;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) || 1;
    const sc = (S - pad * 2) / span;
    const ox = S / 2 - ((b.minX + b.maxX) / 2) * sc;
    const oy = S / 2 - ((b.minZ + b.maxZ) / 2) * sc;
    const key = `${m.points.length}|${b.minX}|${b.maxX}|${b.minZ}|${b.maxZ}|${S}|${m.points[0]}`;
    if (this._mm.key !== key) {
      const bg = document.createElement('canvas');
      bg.width = bg.height = S;
      const g = bg.getContext('2d');
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const path = () => {
        g.beginPath();
        m.points.forEach(([x, z], i) =>
          i ? g.lineTo(x * sc + ox, z * sc + oy) : g.moveTo(x * sc + ox, z * sc + oy)
        );
        g.closePath();
      };
      g.fillStyle = 'rgba(8,7,5,.72)';
      g.fillRect(0, 0, S, S);
      path();
      g.strokeStyle = 'rgba(0,0,0,.9)';
      g.lineWidth = S * 0.07;
      g.stroke();
      path();
      g.strokeStyle = '#c9a94f';
      g.lineWidth = S * 0.05;
      g.stroke();
      path();
      g.strokeStyle = '#3b3020';
      g.lineWidth = S * 0.035;
      g.stroke();
      // start line
      const [sx, sz] = m.points[0];
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.arc(sx * sc + ox, sz * sc + oy, S * 0.025, 0, Math.PI * 2);
      g.fill();
      this._mm.bg = bg;
      this._mm.key = key;
    }
    c.clearRect(0, 0, S, S);
    c.drawImage(this._mm.bg, 0, 0);
    const karts = m.karts || [];
    const pulse = 1 + 0.25 * Math.sin(now / 160);
    for (const k of karts) {
      if (k.isPlayer) continue;
      c.fillStyle = cssColor(k.color);
      c.strokeStyle = 'rgba(0,0,0,.8)';
      c.lineWidth = S * 0.008;
      c.beginPath();
      c.arc(k.x * sc + ox, k.z * sc + oy, S * 0.032, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    for (const k of karts) {
      if (!k.isPlayer) continue;
      const x = k.x * sc + ox,
        y = k.z * sc + oy;
      c.fillStyle = 'rgba(255,240,180,.25)';
      c.beginPath();
      c.arc(x, y, S * 0.075 * pulse, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = cssColor(k.color);
      c.strokeStyle = '#fff';
      c.lineWidth = S * 0.014;
      c.beginPath();
      c.arc(x, y, S * 0.045, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  // ------------------------------------------------------------------ countdown + banner

  countdown() {
    return new Promise((resolve) => {
      const wrap = el('div', 'ek-center');
      this.layer.appendChild(wrap);
      const show = (txt, go, sub) => {
        wrap.innerHTML = '';
        const box = el('div', '');
        box.style.textAlign = 'center';
        const n = el('div', `ek-count ek-gold-text${go ? ' go' : ''}`, txt);
        box.appendChild(n);
        if (sub) box.appendChild(el('div', 'ek-count-sub', sub));
        wrap.appendChild(box);
      };
      const steps = [
        () => {
          show('3');
          sfx('countdown');
        },
        () => {
          show('2');
          sfx('countdown');
        },
        () => {
          show('1');
          sfx('countdown');
        },
        () => {
          show('GO', true, 'Lap 1');
          sfx('go');
          resolve();
        },
      ];
      steps.forEach((fn, i) => setTimeout(fn, i * 1000));
      setTimeout(() => wrap.remove(), 3 * 1000 + 1000);
    });
  }

  banner(text, sub, ms = 2600) {
    if (this._banner) {
      this._banner.remove();
      clearTimeout(this._bannerTimer);
    }
    const red = /spun|died|defeat|exploded|poison|fell/i.test(text);
    const b = el('div', `ek-banner${red ? ' red' : ''}`);
    b.style.setProperty('--ms', `${ms}ms`);
    b.innerHTML = `<div class="t ek-gold-text"></div>${sub ? '<div class="s"></div>' : ''}`;
    b.querySelector('.t').textContent = text;
    if (sub) b.querySelector('.s').textContent = sub;
    this.layer.appendChild(b);
    void b.offsetWidth;
    b.classList.add('on');
    this._banner = b;
    this._bannerTimer = setTimeout(() => {
      b.remove();
      if (this._banner === b) this._banner = null;
    }, ms + 100);
  }

  // ------------------------------------------------------------------ menus

  _choice(cls, title, items, { escValue, subtitle } = {}) {
    return new Promise((resolve) => {
      const s = this._screen(`${cls} ek-overlay`);
      s.innerHTML = `<div class="ek-menu ek-panel"><h2 class="ek-gold-text">${title}</h2><div class="ek-div"><i></i></div>${subtitle ? `<div class="ek-hint">${subtitle}</div>` : ''}<div class="list"></div></div>`;
      const list = s.querySelector('.list');
      let idx = 0,
        done = false;
      const btns = items.map(([label], i) => {
        const b = el('button', 'ek-btn', label);
        b.addEventListener('mouseenter', () => {
          if (idx !== i) {
            idx = i;
            sfx('ui-move');
            paint();
          }
        });
        b.addEventListener('click', () => pick(i));
        list.appendChild(b);
        return b;
      });
      const paint = () => btns.forEach((b, i) => b.classList.toggle('focus', i === idx));
      const pick = (i) => {
        if (done) return;
        done = true;
        sfx(items[i][1] === escValue ? 'ui-back' : 'ui-select');
        off();
        this._leave(s, 300).then(() => resolve(items[i][1]));
      };
      const off = this._keys((e) => {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          idx = (idx + 1) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          idx = (idx - 1 + btns.length) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
          pick(idx);
          return true;
        }
        if (escValue && (e.code === 'Escape' || e.code === 'KeyP')) {
          pick(items.findIndex((it) => it[1] === escValue));
          return true;
        }
        return false;
      });
      paint();
    });
  }

  showPause() {
    return this._choice(
      'ek-pause',
      'Paused',
      [
        ['Resume', 'resume'],
        ['Restart', 'restart'],
        ['Quit to Menu', 'menu'],
      ],
      { escValue: 'resume' }
    );
  }

  // opts.points shows a points column; opts.buttons overrides [[label, value], ...]; opts.caption sits above the table.
  showResults(rows, opts = {}) {
    return new Promise((resolve) => {
      const me = rows.find((r) => r.isPlayer) || rows[0];
      const place = me ? me.place : 1;
      const won = place === 1;
      const died = place > 4;
      const title = won ? 'Victory Achieved' : died ? 'Defeated' : 'Race Complete';
      const sub = won
        ? 'The Elden Throne awaits'
        : died
          ? 'The Lands Between claim another'
          : `${place}${ordinal(place)} place`;
      const s = this._screen('ek-results');
      const body = [...rows]
        .sort((a, b) => a.place - b.place)
        .map(
          (r, i) => `
        <tr class="${r.isPlayer ? 'you' : ''}" style="animation-delay:${1.0 + i * 0.09}s">
          <td class="p">${r.place}${ordinal(r.place)}</td><td class="c"><i style="background:${cssColor(r.color)}"></i></td>
          <td class="n">${esc(r.name)}</td><td class="t">${fmtTime(r.time)}</td>${opts.points ? `<td class="pt">+${r.points ?? 0}</td>` : ''}</tr>`
        )
        .join('');
      const buttons = opts.buttons ?? [
        ['Race Again', 'again'],
        ['Main Menu', 'menu'],
      ];
      s.innerHTML = `
        <div class="ek-res-band${died ? ' red' : ''}"><div class="t ek-gold-text">${title}</div><div class="s">${sub}</div></div>
        ${opts.caption ? `<div class="ek-hint ek-caption">${esc(opts.caption)}</div>` : ''}
        <table class="ek-table"><tbody>${body}</tbody></table>
        <div class="ek-btnrow">${buttons.map(([label, v]) => `<button class="ek-btn" data-v="${v}">${esc(label)}</button>`).join('')}</div>
        <div class="ek-vignette"></div>`;
      const btns = [...s.querySelectorAll('.ek-btn')];
      let idx = 0,
        done = false;
      const paint = () => btns.forEach((b, i) => b.classList.toggle('focus', i === idx));
      const pick = (i) => {
        if (done) return;
        done = true;
        sfx('ui-select');
        off();
        this._leave(s, 500).then(() => resolve(btns[i].dataset.v));
      };
      btns.forEach((b, i) => {
        b.addEventListener('mouseenter', () => {
          idx = i;
          paint();
        });
        b.addEventListener('click', () => pick(i));
      });
      const off = this._keys((e) => {
        if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(e.code)) {
          idx = (idx + 1) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code)) {
          idx = (idx - 1 + btns.length) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
          pick(idx);
          return true;
        }
        return false;
      });
      paint();
    });
  }

  // Grand Prix standings. rows: [{ place, name, color, isPlayer, gained, total }] in standings order.
  showStandings(rows, { title, subtitle, red = false, caption, buttons }) {
    return new Promise((resolve) => {
      const s = this._screen('ek-results ek-standings');
      const body = rows
        .map(
          (r, i) => `
        <tr class="${r.isPlayer ? 'you' : ''}" style="animation-delay:${0.8 + i * 0.08}s">
          <td class="p">${r.place}${ordinal(r.place)}</td><td class="c"><i style="background:${cssColor(r.color)}"></i></td>
          <td class="n">${esc(r.name)}</td><td class="g">+${r.gained}</td><td class="pt">${r.total}</td></tr>`
        )
        .join('');
      s.innerHTML = `
        <div class="ek-res-band${red ? ' red' : ''}"><div class="t ek-gold-text">${esc(title)}</div><div class="s">${esc(subtitle ?? '')}</div></div>
        ${caption ? `<div class="ek-hint ek-caption">${esc(caption)}</div>` : ''}
        <table class="ek-table"><tbody>${body}</tbody></table>
        <div class="ek-btnrow">${buttons.map(([label, v]) => `<button class="ek-btn" data-v="${v}">${esc(label)}</button>`).join('')}</div>
        <div class="ek-vignette"></div>`;
      const btns = [...s.querySelectorAll('.ek-btn')];
      let idx = 0,
        done = false;
      const paint = () => btns.forEach((b, i) => b.classList.toggle('focus', i === idx));
      const pick = (i) => {
        if (done) return;
        done = true;
        sfx('ui-select');
        off();
        this._leave(s, 500).then(() => resolve(btns[i].dataset.v));
      };
      btns.forEach((b, i) => {
        b.addEventListener('mouseenter', () => {
          idx = i;
          paint();
        });
        b.addEventListener('click', () => pick(i));
      });
      const off = this._keys((e) => {
        if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(e.code)) {
          idx = (idx + 1) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(e.code)) {
          idx = (idx - 1 + btns.length) % btns.length;
          sfx('ui-move');
          paint();
          return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
          pick(idx);
          return true;
        }
        return false;
      });
      paint();
    });
  }
}
