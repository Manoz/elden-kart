// Track: renderable wrapper around TrackCore (centreline logic) implementing the contract.
import * as THREE from 'three';
import { TrackCore } from './Centerline.js';
import { createSky } from './sky.js';
import { buildErdtree } from './erdtree.js';
import { buildTerrain } from './build/terrain.js';
import { buildRoad } from './build/road.js';
import { makeNoise, mulberry32 } from './util.js';

export class Track extends TrackCore {
  constructor(layout, scene, sceneryBuilder) {
    super(layout);
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = `track:${layout.id}`;
    scene.add(this.root);
    this.time = 0;
    this._updaters = [];
    this._disposers = [];
    this._uTime = { value: 0 };

    let roadY = 0;
    for (let i = 0; i < this.N; i++) roadY += this.py[i];
    this.sky = createSky(layout, scene, roadY / this.N);
    this.terrain = buildTerrain(this, this.root);
    this.roadMesh = buildRoad(this, this.root);
    this._updaters.push(this.sky.update, this.terrain.update, this.roadMesh.update);
    if (layout.sky.tree) {
      this.erdtree = buildErdtree(this, this.root, layout.sky.tree);
      this._updaters.push(this.erdtree.update);
      this._disposers.push(this.erdtree);
    }

    const ctx = {
      core: this,
      layout,
      root: this.root,
      rng: mulberry32((layout.seed ?? 1) * 7717 + 13),
      noise: makeNoise((layout.seed ?? 1) + 200),
      uTime: this._uTime,
      add: (obj) => (this.root.add(obj), obj),
      onUpdate: (fn) => this._updaters.push(fn),
      own: (...ds) => this._disposers.push(...ds),
      register: (fx) => {
        this.root.add(fx.mesh);
        this._updaters.push((dt, t) => fx.update(t, dt));
        this._disposers.push(fx);
        return fx;
      },
    };
    sceneryBuilder?.(ctx);
  }

  // Optional: pin the shadow frustum on a world position (defaults to following the camera).
  setShadowFocus(pos) {
    this.sky.setShadowFocus(pos);
  }

  update(dt, time) {
    this.time = Number.isFinite(time) ? time : this.time + dt;
    this._uTime.value = this.time;
    for (const fn of this._updaters) fn(dt, this.time);
  }

  dispose() {
    this.scene.remove(this.root);
    this.sky.dispose();
    this.terrain.dispose();
    this.roadMesh.dispose();
    for (const d of this._disposers) d.dispose?.();
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose?.();
        m.dispose?.();
      }
      o.dispose?.();
    });
    this.scene.fog = null;
    this.scene.background = null;
    this._updaters.length = 0;
  }
}
