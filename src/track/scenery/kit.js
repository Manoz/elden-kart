// Higher-level scenery building blocks shared by the four tracks.
import * as THREE from 'three';
import { createBeams, createBillboards, createParticles } from '../fx.js';
import { KERB } from '../Centerline.js';
import {
  corridorPositions,
  roadside,
  glowMaterial,
  instanced,
  propMaterial,
  part,
  mergeParts,
} from './common.js';

// Sites of grace: golden beam + halos + ring + rising motes. ts: fractions along the track.
export function graceSites(
  ctx,
  ts,
  { color = 0xffd36a, height = 45, offset = 9, motes = 0xffe8a0 } = {}
) {
  const { core } = ctx;
  const beams = [];
  const halos = [];
  const rings = [];
  const spots = [];
  ts.forEach((t, k) => {
    const side = k % 2 ? -1 : 1;
    const p = roadside(core, t, side * (core.layout.halfWidth + KERB + offset));
    spots.push(p);
    beams.push({ x: p.x, y: p.y, z: p.z, height, radius: 0.55 });
    halos.push({ x: p.x, y: p.y + 1.5, z: p.z, size: 5, color, alpha: 0.5, phase: k * 0.31 });
    halos.push({ x: p.x, y: p.y + 10, z: p.z, size: 6, color, alpha: 0.06, phase: k * 0.17 });
    rings.push({ x: p.x, y: p.y + 0.15, z: p.z, s: 1 });
  });
  if (!spots.length) return spots;
  ctx.register(createBeams(beams, color));
  ctx.register(createBillboards(halos, { flicker: 0.6 }));
  const ringGeo = new THREE.RingGeometry(1.6, 2.5, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = instanced(ringGeo, glowMaterial(color, 2.2), rings);
  ctx.add(ringMesh);
  ctx.own(ringGeo);
  const altarGeo = mergeParts([
    part(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 10), 0x8a7a5a, { pos: [0, 0.3, 0] }),
    part(new THREE.CylinderGeometry(0.5, 0.7, 1.3, 8), 0xa89868, { pos: [0, 1.25, 0] }),
  ]);
  ctx.add(
    instanced(
      altarGeo,
      propMaterial(),
      rings.map((r) => ({ ...r, y: r.y - 0.1 }))
    )
  );
  ctx.own(altarGeo);
  ctx.register(
    createParticles(
      {
        count: spots.length * 36,
        positions: (rng) => {
          const p = spots[Math.floor(rng() * spots.length)];
          const a = rng() * Math.PI * 2;
          const r = Math.sqrt(rng()) * 3.2;
          return [p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r];
        },
        colorA: motes,
        colorB: color,
        size: 0.32,
        rise: 3.2,
        range: 16,
        sway: 0.5,
      },
      ctx.layout.seed + 5
    )
  );
  return spots;
}

// Low, soft mist puffs (camera-facing) around the track corridor.
export function mistPuffs(
  ctx,
  {
    count = 60,
    color = 0xffffff,
    alpha = 0.16,
    size = 30,
    yMin = 1,
    yMax = 8,
    spread = 90,
    additive = false,
  } = {}
) {
  const { core, rng } = ctx;
  const items = [];
  for (let n = 0; n < count; n++) {
    const i = Math.floor(rng() * core.N);
    const off = (rng() * 2 - 1) * spread;
    items.push({
      x: core.px[i] + core.rx[i] * off,
      y: core.py[i] + yMin + rng() * (yMax - yMin) - 1.3,
      z: core.pz[i] + core.rz[i] * off,
      ground: 0,
      size: size * (0.6 + rng() * 0.9),
      color,
      alpha: alpha * (0.6 + rng() * 0.8),
      phase: rng(),
    });
  }
  for (const it of items) it.ground = Math.min(core.groundAt(it.x, it.z), it.y);
  return ctx.register(createBillboards(items, { additive, flicker: 0.05, groundFade: 5 }));
}

// Free-floating particles (embers, motes, petals) all along the corridor.
export function ambient(ctx, cfg) {
  return ctx.register(
    createParticles(
      {
        positions: corridorPositions(ctx.core, { spread: cfg.spread ?? 70, yOff: cfg.yOff ?? 0 }),
        ...cfg,
      },
      ctx.layout.seed + 11
    )
  );
}

// Light glows for lamps: items [{x,y,z}]
export function lampGlows(ctx, items, { color = 0xffc070, size = 3, alpha = 0.7 } = {}) {
  return ctx.register(
    createBillboards(
      items.map((p, k) => ({ x: p.x, y: p.y, z: p.z, size, color, alpha, phase: (k * 0.29) % 1 })),
      { flicker: 0.6 }
    )
  );
}
