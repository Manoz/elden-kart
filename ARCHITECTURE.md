# Architecture

Elden Kart is plain JavaScript (ES modules, no TypeScript), rendered with three.js and bundled by Vite. Every asset is generated at runtime:

- Geometry is built from three.js primitives.
- Textures are drawn on canvas.
- Shaders are written inline.
- Music and sound effects are synthesized with WebAudio.

The game ships no binary assets.

## Conventions

- Code style: 2-space indent, single quotes, semicolons, named exports only. Prettier (`pnpm format`) and ESLint (`pnpm lint`) enforce it.
- Units: 1 unit = 1 metre, +Y up. A kart at yaw 0 faces -Z, so the forward vector is `(-sin(yaw), 0, -cos(yaw))`.
- Speeds: kart top speed is about 42 u/s at 150cc, about 60 when boosted. The road is 26 to 34 u wide.
- Fog: `src/track/atmosphere.js` replaces three's fog shader chunks for every material: distance fog that thins with altitude and takes the sun's colour when looking toward it.
- Communication: the main loop calls modules directly. Reactive systems (audio, particles, HUD) listen to the global event bus in `src/core/bus.js`.
- Checks: `pnpm build` bundles the game and `node src/track/check.mjs` validates the circuit layouts.

## Game flow

The menus lead to three branches:

- **Title and main menu**: loading, then the title screen, then the main menu.
- **Settings**: returns to the main menu.
- **Quick Race**: class, then character and circuit, then the race, then results, then race again or back to the menu.
- **Grand Prix**: class, then character. Four times: race, results with points, standings. Then the final standings and the menu.

`Game` builds a fresh world for each race:

- the scene, circuit and post-processing;
- eight karts: the player and seven AI rivals;
- `Race`, `ItemSystem`, `FX` and `ChaseCamera`.

It disposes all of it when the race ends. Physics runs in fixed substeps of at most 1/60 s. A Grand Prix keeps the same rival roster across its four races.

## Modules

| Path                      | Role                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.js`             | Entry point. Creates `Game` and runs it                                                                                                                                                   |
| `src/core/Game.js`        | Renderer, main loop, menu flow, race sessions, Grand Prix scoring, HUD feed                                                                                                               |
| `src/core/Input.js`       | Keyboard and gamepad mapped to kart inputs                                                                                                                                                |
| `src/core/ChaseCamera.js` | Chase camera and countdown fly-over                                                                                                                                                       |
| `src/core/Race.js`        | Laps with checkpoint validation, ranking, finish, AI rubber banding                                                                                                                       |
| `src/core/data.js`        | Static data: `CHARACTERS`, `TRACKS`, `ITEMS`, `CLASSES`, `GP_POINTS`                                                                                                                      |
| `src/core/settings.js`    | `QUALITY` presets and settings persisted in `localStorage`                                                                                                                                |
| `src/core/bus.js`         | Global event emitter                                                                                                                                                                      |
| `src/track/`              | Circuit generation: spline centreline, per-pixel road surfaces, terrain, sky, height fog (`atmosphere.js`), the giant tree on the horizon, vegetation and scenery, one layout per circuit |
| `src/karts/Kart.js`       | Arcade kart physics                                                                                                                                                                       |
| `src/karts/KartModel.js`  | Procedural kart and driver models, one builder per character                                                                                                                              |
| `src/ai/AIDriver.js`      | AI drivers                                                                                                                                                                                |
| `src/items/`              | Item boxes, roulette, the ten items and their meshes                                                                                                                                      |
| `src/fx/FX.js`            | GPU particle systems                                                                                                                                                                      |
| `src/fx/PostFX.js`        | Bloom, speed blur, vignette and colour grading                                                                                                                                            |
| `src/ui/`                 | DOM menus, HUD and canvas-drawn art                                                                                                                                                       |
| `src/audio/Audio.js`      | Procedural music, sound effects and engine sound                                                                                                                                          |

## Contracts

### Track: `src/track/index.js`

```js
createTrack(id, scene) -> Track   // builds sky, lights, fog, terrain, road and scenery into scene
Track {
  id, name, laps, length          // length of the centreline loop in metres
  getPoint(t) -> { pos, tangent, right, up, halfWidth }            // t in [0, 1), wraps
  sample(pos, hintT?) -> { t, lateral, halfWidth, height, normal, surface, jump? }
      // nearest centreline point; lateral in metres (+ is right); height is the ground Y under pos
      // surface: 'road' | 'offroad' | 'rot' | 'boost' | 'void'; jump is set on ramps
  constrain(pos, radius) -> { push, normal } | null   // wall collision; null where there is no wall
  startGrid(i) -> { pos, yaw }    // i = 0..7, staggered grid behind the start line
  checkpoints                     // count, evenly spaced in t
  itemBoxes                       // Vector3[] at hover height
  miniMap: { points: [x, z][], bounds: { minX, maxX, minZ, maxZ } }
  setShadowFocus(pos)             // optional: centre the sun's shadow frustum
  update(dt, time)
  dispose()
}
```

The circuits are `limgrave`, `caelid`, `leyndell` and `haligtree`.

### Kart: `src/karts/Kart.js`

```js
new Kart({ id, character, isPlayer, track, scene, speedScale })   // speedScale = engine class multiplier
Kart {
  pos, yaw, speed, velocity, t, topSpeed, grounded, airborne
  inputs: { throttle, brake, steer, drift, useItem }   // written by Input or AIDriver
  drift: { active, dir, charge, level }                // level 1..3 = blue, orange, purple
  boostTimer, boostPower, invincibleTimer, spinTimer, shielded
  lap, lapProgress, place, rank, finished, finishTime  // written by Race
  aiSpeedScale                                         // written by Race for rubber banding
  heldItem, itemCount, itemRolling                     // written by ItemSystem
  update(dt, track)
  applyBoost(seconds, power = 1)
  hit(kind)          // 'spin' | 'explode' | 'squash' | 'poison'
  respawn(track)
  placeAt(track, pos, yaw)
  setModel(kartModel)
  dispose()
  static collide(a, b)   // weight-based kart-to-kart bump
}
```

Handling scales with `character.stats`: speed, accel, handling and weight, each from 1 to 5.

### KartModel: `src/karts/KartModel.js`

`new KartModel(character)` exposes a `group`. Forward is -Z and the origin sits on the ground under the kart centre. `update(dt, kart)` animates the model:

- wheels, steering and drift lean;
- the driver's arms and head;
- boost flames, spin-out and invincibility aura;
- the shield.

Geometry and materials are cached and shared between karts.

### Race and AI

```js
new Race({ track, karts, laps })
Race { state, elapsed, start(), update(dt), getRanking() -> Kart[], getResults() -> [{ kart, place, time }] }

new AIDriver(kart, track, { skill, aggression, name })   // skill 0..1 comes from the engine class
AIDriver { update(dt, race, itemSystem) }
```

### Items and effects

```js
new ItemSystem({ scene, track, karts, fx })
ItemSystem { update(dt), rollItem(kart), useItem(kart), giveItem(kart, item), isRolling(kart), getHazards(), dispose() }
// update() detects the rising edge of kart.inputs.useItem; holding brake throws or drops the item backward.

new FX(scene, camera)
FX { emit(name, pos, opts), attachKart(kart), detachKart(kart), setViewportHeight(px), update(dt), dispose() }

createPostFX(renderer, scene, camera, { msaa }) -> { render(dt), resize(w, h), setBoost(0..1), setVignette(0..1), dispose() }
```

### UI: `src/ui/UI.js`

```js
new UI(rootEl)
UI {
  showLoading(progress)
  showTitle() -> Promise<void>
  showMainMenu() -> Promise<'gp' | 'quick' | 'settings'>
  showClassSelect({ classes, subtitle, initial }) -> Promise<classId | null>
  showSettings(settings, { qualities, onChange }) -> Promise<settings>
  showSelect({ characters, tracks, pickTrack }) -> Promise<{ characterId, trackId } | null>
  showHUD(), hideHUD()
  updateHUD({ position, racers, lap, laps, item, itemRolling, speed, lapTime, totalTime, boost, driftLevel, minimap, standings, message })
  countdown() -> Promise<void>   // resolves at GO
  banner(text, sub, ms)
  showPause() -> Promise<'resume' | 'restart' | 'menu'>
  showResults(rows, { points, caption, buttons }) -> Promise<button value>
  showStandings(rows, { title, subtitle, red, caption, buttons }) -> Promise<button value>
}
```

The UI emits `ui:sfx` for menu sounds and `AudioSystem` plays them.

### Audio: `src/audio/Audio.js`

```js
new AudioSystem()
AudioSystem {
  init()   // call on the first user gesture (browser autoplay policy)
  playMusic(id), stopMusic(fade)   // id: 'menu' or a TRACKS[].music id
  sfx(name, opts)
  setEngine(speedRatio, boosting), stopEngine()
  setListenerMuffle(on)
  setVolume(v), setMusicVolume(v), setSfxVolume(v), mute(on)
  dispose()
}
```

## Events

| Event               | Payload                 | Emitted by                                    |
| ------------------- | ----------------------- | --------------------------------------------- |
| `kart:drift`        | `{ kart, level }`       | Kart                                          |
| `kart:boost`        | `{ kart, power }`       | Kart                                          |
| `kart:hit`          | `{ kart, kind }`        | Kart                                          |
| `kart:shield`       | `{ kart }`              | Kart                                          |
| `kart:bump`         | `{ a, b, force }`       | Kart                                          |
| `kart:wall`         | `{ kart, force }`       | Kart                                          |
| `kart:land`         | `{ kart }`              | Kart                                          |
| `kart:respawn`      | `{ kart }`              | Kart                                          |
| `item:box`          | `{ kart, pos }`         | ItemSystem, on box pickup                     |
| `item:roll`         | `{ kart }`              | ItemSystem, when the roulette starts          |
| `item:got`          | `{ kart, item }`        | ItemSystem, when the roulette ends            |
| `item:used`         | `{ kart, item }`        | ItemSystem                                    |
| `item:incoming`     | `{ kart, item }`        | ItemSystem, when a Black Knife targets a kart |
| `item:shield-break` | `{ kart }`              | ItemSystem                                    |
| `item:explode`      | `{ pos }`               | ItemSystem                                    |
| `item:bounce`       | `{ pos }`               | ItemSystem                                    |
| `race:start`        | `{ race }`              | Race                                          |
| `race:lap`          | `{ kart, lap, time }`   | Race                                          |
| `race:final-lap`    | `{ kart }`              | Race                                          |
| `race:finish`       | `{ kart, place, time }` | Race                                          |
| `race:over`         | `{ results }`           | Race                                          |
| `ui:sfx`            | `{ name }`              | UI                                            |
