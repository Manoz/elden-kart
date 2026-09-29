// Injected stylesheet for all UI screens and the HUD.
export const CSS = `
.ek-ui {
  --gold: #c9a94f; --gold-hi: #f1dc9a; --gold-lo: #7d6a30; --ink: #0a0908; --paper: #e8dcb8; --blood: #a3231b;
  --serif: 'Cormorant Garamond', 'Trajan Pro', 'Cinzel', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  position: absolute; inset: 0; pointer-events: none; overflow: hidden; color: var(--paper);
  font-family: var(--serif); user-select: none; -webkit-user-select: none;
}
.ek-ui * { box-sizing: border-box; }
.ek-screen { position: absolute; inset: 0; pointer-events: auto; opacity: 0; transition: opacity .55s ease; }
.ek-screen.in { opacity: 1; }
.ek-screen.solid { background: radial-gradient(ellipse at 50% 38%, #1d1709 0%, #0b0906 55%, #030302 100%); }
.ek-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.75) 100%); }
.ek-embers { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.ek-glow-tree { position: absolute; left: 50%; top: 34%; width: 90vmin; height: 90vmin; transform: translate(-50%,-50%);
  background: radial-gradient(circle, rgba(255,200,90,.28) 0%, rgba(255,170,60,.09) 38%, transparent 66%); animation: ek-breathe 6s ease-in-out infinite; pointer-events: none; }
@keyframes ek-breathe { 0%,100% { opacity: .75; transform: translate(-50%,-50%) scale(1); } 50% { opacity: 1; transform: translate(-50%,-50%) scale(1.07); } }

.ek-gold-text { background: linear-gradient(180deg, #fff3c4 0%, #e0c26a 42%, #a8863a 58%, #e8cf82 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 2px 0 rgba(0,0,0,.65)) drop-shadow(0 0 18px rgba(201,169,79,.35)); }
.ek-div { display: flex; align-items: center; gap: .8em; width: min(520px, 70%); margin: 1.1em auto; color: var(--gold); }
.ek-div::before, .ek-div::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--gold) 60%, transparent); }
.ek-div i { width: .5em; height: .5em; border: 1px solid var(--gold); transform: rotate(45deg); box-shadow: 0 0 8px rgba(201,169,79,.6); }

/* ---------- loading ---------- */
.ek-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.6em; }
.ek-loading h2 { margin: 0; font-weight: 500; letter-spacing: .5em; font-size: clamp(16px, 3vmin, 28px); text-transform: uppercase; }
.ek-loadbar { width: min(360px, 60vw); height: 3px; background: rgba(201,169,79,.18); position: relative; }
.ek-loadbar b { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, var(--gold-lo), var(--gold-hi)); box-shadow: 0 0 10px var(--gold); transition: width .25s ease; }

/* ---------- title ---------- */
.ek-title { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.ek-title .pre { letter-spacing: .6em; font-size: clamp(11px, 1.9vmin, 18px); color: var(--gold); text-transform: uppercase; opacity: .85; margin-bottom: 1.2em; }
.ek-title h1 { margin: 0; font-weight: 600; text-transform: uppercase; font-size: clamp(44px, 13vmin, 150px); letter-spacing: .12em; padding-left: .12em; line-height: 1;
  animation: ek-rise 2.2s cubic-bezier(.2,.7,.2,1) both; }
.ek-title .sub { font-size: clamp(14px, 2.4vmin, 24px); letter-spacing: .35em; text-transform: uppercase; color: #cdbb8a; font-style: italic; animation: ek-fade 2.4s .8s both; }
.ek-title .press { margin-top: 4.5vmin; letter-spacing: .5em; text-transform: uppercase; font-size: clamp(13px, 2.1vmin, 20px); color: var(--paper); cursor: pointer;
  animation: ek-fade 1.6s 1.6s both, ek-blink 2.6s 3s ease-in-out infinite; padding: .6em 1.4em; }
@keyframes ek-rise { from { opacity: 0; letter-spacing: .4em; filter: blur(8px); } to { opacity: 1; letter-spacing: .12em; filter: blur(0); } }
@keyframes ek-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ek-blink { 0%,100% { opacity: 1; } 50% { opacity: .25; } }

/* ---------- select ---------- */
.ek-select { display: flex; flex-direction: column; padding: clamp(10px, 2.4vmin, 28px) clamp(12px, 3vw, 44px); gap: clamp(6px, 1.4vmin, 16px); overflow: auto; }
.ek-select header { text-align: center; }
.ek-select header h2 { margin: 0; font-weight: 500; text-transform: uppercase; letter-spacing: .4em; padding-left: .4em; font-size: clamp(18px, 3.4vmin, 34px); }
.ek-select header .ek-div { margin: .5em auto 0; }
.ek-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: clamp(10px, 2.2vw, 32px); }
.ek-panel { position: relative; border: 1px solid rgba(201,169,79,.28); background: linear-gradient(180deg, rgba(20,16,9,.78), rgba(8,7,5,.86));
  box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(201,169,79,.16), 0 10px 40px rgba(0,0,0,.6); padding: clamp(8px, 1.6vmin, 18px); transition: border-color .3s, box-shadow .3s; }
.ek-panel.active { border-color: rgba(241,220,154,.75); box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(201,169,79,.4), 0 0 26px rgba(201,169,79,.2), 0 10px 40px rgba(0,0,0,.6); }
.ek-panel > h3 { margin: 0 0 .6em; font-weight: 500; letter-spacing: .3em; text-transform: uppercase; font-size: clamp(11px, 1.7vmin, 16px); color: var(--gold); text-align: center; }
.ek-panel[data-zone=char] { display: flex; flex-direction: column; }
.ek-cards { flex: 1; grid-auto-rows: 1fr; align-content: stretch; display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(6px, 1.1vmin, 12px); }
.ek-card { position: relative; cursor: pointer; justify-content: center; border: 1px solid rgba(201,169,79,.22); background: linear-gradient(180deg, rgba(30,24,13,.9), rgba(10,9,6,.95));
  padding: clamp(5px, .9vmin, 10px); display: flex; flex-direction: column; align-items: center; gap: .3em; transition: transform .2s, border-color .2s, box-shadow .2s; min-width: 0; }
.ek-card:hover { border-color: rgba(241,220,154,.55); transform: translateY(-2px); }
.ek-card.sel { border-color: var(--gold-hi); box-shadow: 0 0 0 1px rgba(241,220,154,.5), 0 0 22px rgba(201,169,79,.45), inset 0 0 22px rgba(201,169,79,.14); transform: translateY(-3px); }
.ek-card.sel::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 9px; height: 9px; transform: translateX(-50%) rotate(45deg); background: var(--gold-hi); box-shadow: 0 0 10px var(--gold); }
.ek-card canvas { width: 78%; aspect-ratio: 1; height: auto; display: block; filter: drop-shadow(0 4px 8px rgba(0,0,0,.6)); }
.ek-card .nm { font-size: clamp(11px, 1.75vmin, 17px); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; text-align: center; line-height: 1.1; color: #f0e2b4; }
.ek-card .tt { font-size: clamp(9px, 1.35vmin, 13px); font-style: italic; color: #a99a6c; text-align: center; letter-spacing: .06em; line-height: 1.1; }
.ek-stats { width: 100%; display: grid; grid-template-columns: auto 1fr; gap: 2px .5em; margin-top: .25em; font-size: clamp(8px, 1.15vmin, 11px); letter-spacing: .1em; text-transform: uppercase; color: #9a8c62; align-items: center; }
.ek-bar { height: 5px; background: rgba(0,0,0,.65); border: 1px solid rgba(201,169,79,.25); position: relative; }
.ek-bar b { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #8a6f2c, #f1dc9a); box-shadow: 0 0 6px rgba(201,169,79,.5); }
.ek-bar::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(20% - 1px), rgba(0,0,0,.7) calc(20% - 1px) 20%); }
.ek-track { display: flex; flex-direction: column; gap: .7em; align-items: stretch; height: calc(100% - 2em); }
.ek-art { position: relative; flex: 1; min-height: 120px; border: 1px solid rgba(201,169,79,.5); overflow: hidden; background: #000; box-shadow: 0 0 0 3px #0a0908, 0 0 0 4px rgba(201,169,79,.25); }
.ek-art canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; transition: opacity .35s; }
.ek-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 2.4em; height: 3.4em; display: grid; place-items: center; cursor: pointer; color: var(--gold-hi); font-size: clamp(14px, 2.4vmin, 24px);
  background: rgba(8,7,5,.6); border: 1px solid rgba(201,169,79,.4); transition: background .2s, box-shadow .2s; z-index: 2; }
.ek-arrow:hover { background: rgba(60,45,15,.75); box-shadow: 0 0 14px rgba(201,169,79,.45); }
.ek-arrow.l { left: 6px; } .ek-arrow.r { right: 6px; }
.ek-tinfo { text-align: center; }
.ek-tinfo .n { font-size: clamp(16px, 2.8vmin, 28px); font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: #f0e2b4; }
.ek-tinfo .s { font-style: italic; color: #a99a6c; letter-spacing: .1em; font-size: clamp(11px, 1.7vmin, 16px); }
.ek-tinfo .l { margin-top: .3em; letter-spacing: .3em; text-transform: uppercase; color: var(--gold); font-size: clamp(10px, 1.5vmin, 14px); }
.ek-dots { display: flex; justify-content: center; gap: .7em; }
.ek-dots i { width: .6em; height: .6em; transform: rotate(45deg); border: 1px solid var(--gold); cursor: pointer; transition: background .2s, box-shadow .2s; }
.ek-dots i.on { background: var(--gold-hi); box-shadow: 0 0 8px var(--gold); }
.ek-footer { display: flex; align-items: center; justify-content: center; gap: 2em; flex-wrap: wrap; }
.ek-count-sub { margin-top: 1.5vmin; font-size: clamp(22px, 4.2vmin, 48px); font-weight: 600; letter-spacing: .5em; text-indent: .5em; text-transform: uppercase; color: #f3dc98; text-shadow: 0 2px 6px rgba(0,0,0,.9), 0 0 24px rgba(255,190,80,.55); animation: ek-sub .95s ease-out both; }
@keyframes ek-sub { 0% { opacity: 0; transform: translateY(12px); } 25% { opacity: 1; transform: none; } 70% { opacity: 1; } 100% { opacity: 0; } }
.ek-hint { color: #8b7e58; letter-spacing: .18em; font-size: clamp(10px, 1.4vmin, 13px); text-transform: uppercase; }
.ek-btn { position: relative; cursor: pointer; font-family: inherit; color: var(--paper); background: linear-gradient(180deg, rgba(40,31,14,.9), rgba(12,10,6,.95)); border: 1px solid rgba(201,169,79,.55);
  padding: .7em 2.2em; text-transform: uppercase; letter-spacing: .3em; font-size: clamp(12px, 1.9vmin, 18px); font-weight: 600;
  box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(201,169,79,.2); transition: color .2s, box-shadow .2s, border-color .2s, transform .15s; }
.ek-btn:hover, .ek-btn.focus { color: #fff3c4; border-color: var(--gold-hi); box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(241,220,154,.5), 0 0 20px rgba(201,169,79,.4); }
.ek-btn:active { transform: scale(.97); }
@media (max-width: 900px) {
  .ek-main { grid-template-columns: 1fr; flex: none; min-height: auto; }
  .ek-cards { grid-template-columns: repeat(4, 1fr); grid-auto-rows: auto; }
  .ek-track { height: auto; }
  .ek-art { min-height: 150px; flex: none; aspect-ratio: 16/9; }
  .ek-footer { position: sticky; bottom: 0; padding: 8px 0; background: linear-gradient(180deg, transparent, rgba(5,4,3,.92) 40%); z-index: 3; }
}
@media (max-width: 560px) { .ek-cards { grid-template-columns: repeat(2, 1fr); } .ek-stats { font-size: 9px; } }

/* ---------- HUD ---------- */
.ek-hud { position: absolute; inset: 0; pointer-events: none; font-size: clamp(11px, 1.75vmin, 20px); opacity: 0; transition: opacity .4s; }
.ek-hud.in { opacity: 1; }
.ek-hud * { pointer-events: none; }
.ek-hud .shadow { text-shadow: 0 2px 4px rgba(0,0,0,.9), 0 0 14px rgba(0,0,0,.6); }
.ek-itemslot { position: absolute; left: 2.2em; top: 2em; width: 6.6em; height: 6.6em; }
.ek-frame { position: absolute; inset: 0; border: 2px solid var(--gold); background: radial-gradient(circle at 50% 40%, rgba(50,38,14,.85), rgba(6,5,3,.9));
  box-shadow: inset 0 0 0 3px #080706, inset 0 0 0 4px rgba(201,169,79,.35), 0 4px 18px rgba(0,0,0,.7); transform: rotate(0deg); }
.ek-frame::before, .ek-frame::after { content: ''; position: absolute; width: .9em; height: .9em; border: 2px solid var(--gold-hi); }
.ek-frame::before { left: -5px; top: -5px; border-right: 0; border-bottom: 0; }
.ek-frame::after { right: -5px; bottom: -5px; border-left: 0; border-top: 0; }
.ek-itemslot canvas { position: absolute; inset: 12%; width: 76%; height: 76%; }
.ek-itemslot.has canvas { animation: ek-pop .4s cubic-bezier(.2,1.6,.4,1); filter: drop-shadow(0 0 8px rgba(255,220,130,.6)); }
.ek-itemslot.rolling canvas { filter: blur(1.2px) brightness(1.2); }
.ek-itemslot.rolling .ek-frame { border-color: var(--gold-hi); box-shadow: inset 0 0 0 3px #080706, inset 0 0 0 4px rgba(241,220,154,.6), 0 0 22px rgba(241,220,154,.5); }
.ek-itemslot .lbl { position: absolute; left: 0; right: 0; bottom: -1.7em; text-align: center; font-size: .72em; letter-spacing: .25em; color: var(--gold); text-transform: uppercase; opacity: .85; }
@keyframes ek-pop { 0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.ek-pos { position: absolute; left: 2em; bottom: 2em; line-height: .85; display: flex; align-items: baseline; }
.ek-pos .num { font-size: 7.5em; font-weight: 700; font-style: italic; }
.ek-pos .ord { font-size: 3em; font-weight: 600; margin-left: .05em; align-self: flex-start; margin-top: .4em; }
.ek-pos .of { font-size: 2.4em; font-weight: 500; margin-left: .2em; color: #b3a577; }
.ek-pos.first .num, .ek-pos.first .ord { filter: drop-shadow(0 0 18px rgba(255,210,90,.75)) drop-shadow(0 2px 0 rgba(0,0,0,.7)); }
.ek-pos.bump { animation: ek-bump .45s cubic-bezier(.2,1.5,.4,1); transform-origin: 0 100%; }
@keyframes ek-bump { 0% { transform: scale(1.45); } 100% { transform: scale(1); } }
.ek-lap { position: absolute; left: 2.2em; bottom: 8.6em; letter-spacing: .3em; font-size: 1.6em; font-weight: 700; text-transform: uppercase; color: var(--paper); }
.ek-lap small { font-size: .7em; color: #b3a577; }
.ek-times { position: absolute; left: 50%; top: 1.6em; transform: translateX(-50%); text-align: center; display: flex; gap: 2.4em; letter-spacing: .12em; }
.ek-times div { display: flex; flex-direction: column; align-items: center; min-width: 6em; }
.ek-times span { font-size: .72em; letter-spacing: .3em; color: var(--gold); text-transform: uppercase; }
.ek-times b { font-size: 1.9em; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--paper); }
.ek-mm { position: absolute; right: 2em; top: 2em; width: 14em; height: 14em; }
.ek-mm .ek-frame { border-radius: 50%; }
.ek-mm .ek-frame::before, .ek-mm .ek-frame::after { display: none; }
.ek-mm canvas { position: absolute; inset: 4px; width: calc(100% - 8px); height: calc(100% - 8px); border-radius: 50%; }
.ek-speedo { position: absolute; right: 2em; bottom: 1.6em; width: 15em; height: 12em; }
.ek-speedo svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
.ek-speedo .val { position: absolute; left: 0; right: 0; top: 3.4em; text-align: center; line-height: 1; }
.ek-speedo .val b { font-size: 4.2em; font-weight: 700; font-variant-numeric: tabular-nums; font-style: italic; }
.ek-speedo .val span { display: block; font-size: .85em; letter-spacing: .4em; color: var(--gold); margin-top: .1em; }
.ek-speedo.boost .val b { color: #ffd870; text-shadow: 0 0 22px rgba(255,170,50,.9); }
.ek-speedo .surge { position: absolute; left: 0; right: 0; bottom: -.4em; text-align: center; letter-spacing: .5em; font-size: 1em; font-weight: 700; color: #ffd870; text-shadow: 0 0 14px #ff9a2a; opacity: 0; transform: scale(.85); transition: opacity .15s, transform .15s; }
.ek-speedo.boost .surge { opacity: 1; transform: scale(1); animation: ek-blinkfast .5s ease-in-out infinite; }
@keyframes ek-blinkfast { 50% { opacity: .55; } }
.ek-drift { position: absolute; left: 50%; bottom: 8%; transform: translateX(-50%); display: flex; gap: .5em; opacity: 0; transition: opacity .15s; }
.ek-drift.on { opacity: 1; }
.ek-drift i { width: 3.6em; height: .55em; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.25); transform: skewX(-30deg); transition: background .1s, box-shadow .1s; }
.ek-drift.l1 i:nth-child(1) { background: #4aa8ff; box-shadow: 0 0 12px #4aa8ff; }
.ek-drift.l2 i:nth-child(-n+2) { background: #ff9a2a; box-shadow: 0 0 12px #ff9a2a; }
.ek-drift.l3 i { background: #c46bff; box-shadow: 0 0 14px #c46bff; }
.ek-toast { position: absolute; left: 50%; top: 14%; transform: translateX(-50%) translateY(-10px); padding: .5em 2.2em; letter-spacing: .25em; text-transform: uppercase; font-size: 1.35em; font-weight: 600; color: var(--gold-hi);
  background: linear-gradient(90deg, transparent, rgba(8,6,3,.82) 20%, rgba(8,6,3,.82) 80%, transparent); opacity: 0; transition: opacity .3s, transform .3s; white-space: nowrap; }
.ek-toast.on { opacity: 1; transform: translateX(-50%); }

/* ---------- countdown + banner ---------- */
.ek-center { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.ek-count { filter: drop-shadow(0 4px 10px rgba(0,0,0,.6)) drop-shadow(0 0 18px rgba(255,180,60,.35)); font-size: clamp(90px, 30vmin, 340px); font-weight: 700; line-height: 1; animation: ek-count 1s cubic-bezier(.15,.8,.3,1) both; text-transform: uppercase; }
.ek-count.go { font-size: clamp(80px, 26vmin, 300px); letter-spacing: .1em; animation: ek-go .95s cubic-bezier(.15,.8,.3,1) both; }
@keyframes ek-count { 0% { transform: scale(2.2); opacity: 0; filter: blur(12px); } 25% { transform: scale(1); opacity: 1; filter: blur(0); } 75% { transform: scale(.94); opacity: 1; } 100% { transform: scale(.7); opacity: 0; } }
@keyframes ek-go { 0% { transform: scale(.6); opacity: 0; letter-spacing: -.1em; } 22% { transform: scale(1.05); opacity: 1; letter-spacing: .1em; } 70% { opacity: 1; } 100% { transform: scale(1.5); opacity: 0; letter-spacing: .3em; } }
.ek-banner { position: absolute; left: 0; right: 0; top: 30%; padding: 1.4em 0 1.5em; text-align: center; pointer-events: none; opacity: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(4,3,2,.86) 18%, rgba(4,3,2,.9) 50%, rgba(4,3,2,.86) 82%, transparent 100%); }
.ek-banner::before, .ek-banner::after { content: ''; position: absolute; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, var(--gold) 30%, var(--gold-hi) 50%, var(--gold) 70%, transparent); }
.ek-banner::before { top: .5em; } .ek-banner::after { bottom: .5em; }
.ek-banner .t { font-size: clamp(28px, 7.4vmin, 84px); font-weight: 600; letter-spacing: .28em; padding-left: .28em; text-transform: uppercase; line-height: 1.05; }
.ek-banner .s { margin-top: .35em; font-size: clamp(12px, 2.3vmin, 24px); letter-spacing: .4em; color: #cdbb8a; text-transform: uppercase; font-style: italic; }
.ek-banner.on { animation: ek-banner var(--ms, 2600ms) ease both; }
.ek-banner.on .t { animation: ek-spread var(--ms, 2600ms) cubic-bezier(.2,.7,.2,1) both; }
@keyframes ek-banner { 0% { opacity: 0; transform: scaleY(.6); } 10% { opacity: 1; transform: scaleY(1); } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ek-spread { 0% { letter-spacing: .12em; filter: blur(6px); } 22% { filter: blur(0); } 100% { letter-spacing: .4em; } }
.ek-banner.red .t { background: none; color: #b3241c; -webkit-text-fill-color: #b3241c; filter: drop-shadow(0 0 16px rgba(160,20,10,.6)); }
.ek-banner.red::before, .ek-banner.red::after { background: linear-gradient(90deg, transparent, #6d1712 30%, #a3231b 50%, #6d1712 70%, transparent); }

/* ---------- pause + results ---------- */
.ek-overlay { display: grid; place-items: center; background: rgba(2,2,1,.68); backdrop-filter: blur(3px); }
.ek-menu { text-align: center; min-width: min(420px, 86vw); padding: 2.2em 2em; }
.ek-menu h2 { margin: 0; font-weight: 500; letter-spacing: .5em; padding-left: .5em; text-transform: uppercase; font-size: clamp(22px, 4.4vmin, 44px); }
.ek-menu .list { display: flex; flex-direction: column; gap: .9em; align-items: stretch; margin-top: 1.6em; }
.ek-results { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.2vmin; padding: 2vmin 4vw; background: radial-gradient(ellipse at 50% 30%, rgba(30,22,8,.94), rgba(3,3,2,.97)); overflow: auto; }
.ek-res-band { width: 100%; text-align: center; padding: 1.2em 0; background: linear-gradient(90deg, transparent, rgba(0,0,0,.85) 15%, rgba(0,0,0,.85) 85%, transparent); position: relative; flex: none; }
.ek-res-band .t { font-size: clamp(30px, 8vmin, 96px); font-weight: 600; letter-spacing: .3em; padding-left: .3em; text-transform: uppercase; line-height: 1; animation: ek-spread 3s cubic-bezier(.2,.7,.2,1) both; }
.ek-res-band .s { font-size: clamp(12px, 2.2vmin, 22px); letter-spacing: .4em; color: #cdbb8a; font-style: italic; margin-top: .5em; text-transform: uppercase; animation: ek-fade 2s .7s both; }
.ek-res-band.red .t { color: #a3231b; -webkit-text-fill-color: #a3231b; background: none; filter: drop-shadow(0 0 22px rgba(150,15,8,.65)); }
.ek-table { width: min(680px, 94%); border-collapse: separate; border-spacing: 0 3px; font-size: clamp(12px, 2vmin, 20px); animation: ek-fade 1s .9s both; }
.ek-table td { padding: .32em .8em; background: rgba(20,16,9,.7); border-top: 1px solid rgba(201,169,79,.1); border-bottom: 1px solid rgba(201,169,79,.1); }
.ek-table tr.you td { background: linear-gradient(90deg, rgba(201,169,79,.28), rgba(201,169,79,.1)); color: #fff3c4; border-color: rgba(241,220,154,.55); font-weight: 700; }
.ek-table td.p { width: 3.4em; font-weight: 700; color: var(--gold); letter-spacing: .05em; font-style: italic; }
.ek-table td.c { width: 2em; }
.ek-table td.c i { display: block; width: 1.05em; height: 1.05em; transform: rotate(45deg); border: 1px solid rgba(255,255,255,.55); }
.ek-table td.n { letter-spacing: .12em; text-transform: uppercase; }
.ek-table td.t { text-align: right; font-variant-numeric: tabular-nums; letter-spacing: .06em; }
.ek-table tr { animation: ek-slide .5s both; }
@keyframes ek-slide { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
.ek-btnrow { display: flex; gap: 1.6em; flex-wrap: wrap; justify-content: center; margin-top: 1vmin; animation: ek-fade 1s 1.2s both; }
/* ---------- key hints ---------- */
.ek-keys { position: absolute; right: clamp(12px, 3vw, 44px); bottom: clamp(10px, 3vmin, 32px); display: flex; gap: 1.8em; flex-wrap: wrap; justify-content: flex-end;
  font-size: clamp(10px, 1.5vmin, 14px); letter-spacing: .3em; text-transform: uppercase; color: #cdbb8a; z-index: 3; }
.ek-keys span { display: flex; align-items: center; gap: .7em; }
.ek-keys kbd { font-family: inherit; font-weight: 700; color: #f3e4b0; padding: .35em .8em; letter-spacing: .25em; border: 1px solid rgba(201,169,79,.6);
  background: linear-gradient(180deg, rgba(40,31,14,.95), rgba(10,8,5,.95)); box-shadow: inset 0 0 0 2px #0a0908, 0 2px 0 rgba(0,0,0,.6); }

/* ---------- main menu ---------- */
.ek-mainmenu { display: flex; flex-direction: column; justify-content: center; padding-left: clamp(16px, 7vw, 120px); }
.ek-mm-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(4,3,2,.92) 0%, rgba(4,3,2,.7) 38%, rgba(4,3,2,.1) 70%, transparent 100%); }
.ek-mm-head { position: relative; margin-bottom: clamp(16px, 5vmin, 56px); animation: ek-fade 1s both; }
.ek-mm-head .pre { letter-spacing: .5em; font-size: clamp(10px, 1.6vmin, 15px); color: var(--gold); text-transform: uppercase; font-style: italic; }
.ek-mm-head h1 { margin: .15em 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: .14em; line-height: 1; font-size: clamp(34px, 8vmin, 96px); }
.ek-plaques { position: relative; display: flex; flex-direction: column; gap: clamp(10px, 2.2vmin, 22px); width: min(620px, 86vw); }
.ek-plaque { position: relative; cursor: pointer; padding: clamp(12px, 2.4vmin, 26px) clamp(18px, 3.4vmin, 40px); border: 1px solid rgba(201,169,79,.35);
  background: linear-gradient(90deg, rgba(22,17,9,.92), rgba(10,8,5,.78)); box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(201,169,79,.14), 0 10px 30px rgba(0,0,0,.5);
  transition: transform .25s cubic-bezier(.2,.8,.2,1), border-color .25s, box-shadow .25s, background .25s; animation: ek-slide .6s both; clip-path: polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%); }
.ek-plaque .t { font-size: clamp(22px, 5vmin, 54px); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; line-height: 1; color: #d9c996; transition: color .25s; }
.ek-plaque .s { margin-top: .45em; font-size: clamp(11px, 1.8vmin, 17px); font-style: italic; letter-spacing: .12em; color: #9a8c62; }
.ek-plaque::before { content: ''; position: absolute; left: 10px; top: 50%; width: 10px; height: 10px; transform: translateY(-50%) rotate(45deg) scale(0); background: var(--gold-hi); box-shadow: 0 0 12px var(--gold); transition: transform .25s; }
.ek-plaque.focus { transform: translateX(22px); border-color: var(--gold-hi); background: linear-gradient(90deg, rgba(70,52,18,.95), rgba(24,18,8,.85));
  box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(241,220,154,.45), 0 0 34px rgba(201,169,79,.35), 0 10px 30px rgba(0,0,0,.5); }
.ek-plaque.focus .t { color: #fff3c4; text-shadow: 0 0 18px rgba(255,200,90,.55); }
.ek-plaque.focus .s { color: #d8c78f; }
.ek-plaque.focus::before { transform: translateY(-50%) rotate(45deg) scale(1); }

/* ---------- class select ---------- */
.ek-classes { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(14px, 4vmin, 44px); padding: 3vmin 3vw; }
.ek-cls-shade { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 55%, rgba(6,5,3,.55), rgba(3,2,1,.9)); }
.ek-classes header { position: relative; text-align: center; }
.ek-classes header h2 { margin: 0; font-weight: 600; text-transform: uppercase; letter-spacing: .3em; padding-left: .3em; font-size: clamp(26px, 6.4vmin, 72px); line-height: 1; }
.ek-classes header .ek-div { margin: .8em auto .6em; }
.ek-cls-row { position: relative; display: flex; gap: clamp(12px, 2.6vw, 40px); justify-content: center; flex-wrap: wrap; }
.ek-cls { --acc: #d8cfa8; position: relative; cursor: pointer; width: clamp(180px, 24vw, 320px); padding: clamp(18px, 4vmin, 44px) 1.4em; text-align: center; border: 1px solid rgba(201,169,79,.3);
  background: linear-gradient(180deg, rgba(24,19,10,.94), rgba(8,7,5,.94)); box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px rgba(201,169,79,.12), 0 14px 40px rgba(0,0,0,.6);
  transition: transform .25s cubic-bezier(.2,.8,.2,1), border-color .25s, box-shadow .25s; animation: ek-fade .6s both; }
.ek-cls::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--acc); box-shadow: 0 0 14px var(--acc); opacity: .75; }
.ek-cls.c2 { --acc: #e0b64a; } .ek-cls.c3 { --acc: #d2402a; }
.ek-cls .cc { font-size: clamp(38px, 8vmin, 92px); font-weight: 700; font-style: italic; line-height: 1; color: var(--acc); text-shadow: 0 3px 0 rgba(0,0,0,.7), 0 0 26px color-mix(in srgb, var(--acc) 45%, transparent); }
.ek-cls .rk { margin-top: .5em; font-size: clamp(14px, 2.6vmin, 26px); font-weight: 700; letter-spacing: .4em; padding-left: .4em; text-transform: uppercase; color: #f0e2b4; }
.ek-cls .pips { display: flex; justify-content: center; gap: .9em; margin: 1.3em 0 1.1em; }
.ek-cls .pips i { width: 1.1em; height: 1.1em; transform: rotate(45deg); border: 1px solid rgba(201,169,79,.4); background: rgba(0,0,0,.5); }
.ek-cls .pips i.on { background: var(--acc); border-color: #fff3c4; box-shadow: 0 0 12px var(--acc); }
.ek-cls .ds { font-style: italic; color: #b3a577; letter-spacing: .06em; font-size: clamp(12px, 1.9vmin, 18px); line-height: 1.35; }
.ek-cls.focus { transform: translateY(-10px) scale(1.04); border-color: var(--acc); box-shadow: inset 0 0 0 3px #0a0908, inset 0 0 0 4px color-mix(in srgb, var(--acc) 55%, transparent), 0 0 40px color-mix(in srgb, var(--acc) 40%, transparent), 0 14px 40px rgba(0,0,0,.6); }
.ek-cls.focus::before { opacity: 1; }
.ek-back { position: absolute; left: clamp(12px, 3vw, 44px); bottom: clamp(10px, 3vmin, 32px); z-index: 3; }

/* ---------- settings ---------- */
.ek-set { min-width: min(620px, 92vw); }
.ek-set .rows { display: flex; flex-direction: column; gap: .7em; margin-top: 1.4em; }
.ek-set-row { display: grid; grid-template-columns: 11em 1fr 3.4em; align-items: center; gap: 1em; padding: .6em 1em; border: 1px solid transparent; text-align: left;
  letter-spacing: .2em; text-transform: uppercase; font-size: clamp(11px, 1.8vmin, 16px); color: #cdbb8a; transition: border-color .2s, background .2s; }
.ek-set-row.focus { border-color: rgba(241,220,154,.6); background: rgba(201,169,79,.1); color: #fff3c4; }
.ek-set-row .ctl { display: flex; gap: 4px; }
.ek-set-row .ctl i { flex: 1; height: 1.1em; cursor: pointer; background: rgba(0,0,0,.6); border: 1px solid rgba(201,169,79,.3); transform: skewX(-20deg); }
.ek-set-row .ctl i.on { background: linear-gradient(180deg, #f1dc9a, #a8863a); box-shadow: 0 0 8px rgba(201,169,79,.5); }
.ek-set-row .ctl b { flex: 1; text-align: center; cursor: pointer; padding: .35em 0; font-weight: 600; border: 1px solid rgba(201,169,79,.3); background: rgba(0,0,0,.5); color: #9a8c62; }
.ek-set-row .ctl b.on { color: #1a1206; background: linear-gradient(180deg, #f1dc9a, #b8943f); border-color: #fff3c4; }
.ek-set-row .vl { text-align: right; font-variant-numeric: tabular-nums; }
.ek-set .ek-btn { margin-top: .8em; }

/* ---------- select without circuit (grand prix) ---------- */
.ek-select.no-track .ek-main { grid-template-columns: minmax(0, 1fr); width: min(1100px, 100%); margin: 0 auto; }
.ek-select.no-track [data-zone=track] { display: none; }

/* ---------- live standings board ---------- */
.ek-board { position: absolute; left: 2em; top: 11.5em; width: 15.5em; height: 16.8em; }
.ek-brow { position: absolute; left: 0; top: 0; width: 100%; height: 2.1em; display: flex; align-items: center; gap: .55em; padding: 0 .7em;
  transition: transform .45s cubic-bezier(.2,.8,.2,1); font-size: 1em; }
.ek-brow::before { content: ''; position: absolute; inset: 2px 0; z-index: -1; background: linear-gradient(90deg, rgba(8,6,3,.82), rgba(8,6,3,.35)); border-left: 2px solid rgba(201,169,79,.45);
  clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%); }
.ek-brow .p { width: 1.2em; font-weight: 700; font-style: italic; color: var(--gold); text-align: right; font-variant-numeric: tabular-nums; }
.ek-brow i { width: .75em; height: .75em; transform: rotate(45deg); border: 1px solid rgba(255,255,255,.6); flex: none; }
.ek-brow .n { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; color: #e8dcb8; text-shadow: 0 1px 3px #000; }
.ek-brow .f { width: .9em; height: .9em; opacity: 0; background: repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 50% 50%; border: 1px solid rgba(255,255,255,.5); }
.ek-brow.fin .f { opacity: 1; }
.ek-brow.lead .p { color: #fff3c4; text-shadow: 0 0 10px rgba(255,200,90,.8); }
.ek-brow.you::before { background: linear-gradient(90deg, rgba(201,169,79,.55), rgba(201,169,79,.12)); border-left-color: #fff3c4; }
.ek-brow.you .n { color: #fff3c4; }
.ek-brow.you { transform-origin: left center; }

/* ---------- results extras ---------- */
.ek-caption { position: relative; letter-spacing: .4em; }
.ek-table td.pt { text-align: right; width: 4em; font-weight: 700; color: var(--gold-hi); font-variant-numeric: tabular-nums; }
.ek-table td.g { text-align: right; width: 3.4em; color: #9a8c62; font-variant-numeric: tabular-nums; }
@media (max-height: 560px) { .ek-board { top: 10em; font-size: .85em; } }
@media (prefers-reduced-motion: reduce) { .ek-glow-tree, .ek-title .press { animation: none; } }
`;
