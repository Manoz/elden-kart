// Procedural low-poly prop geometry factories (vertex coloured, merged).
import * as THREE from 'three';
import { part, mergeParts } from './common.js';

const PI = Math.PI;
const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export function blob(radius, detail = 1, squash = 1, seed = 1, rough = 0.25) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k =
      1 +
      (hash3(Math.round(x * 50) + seed, Math.round(y * 50), Math.round(z * 50)) - 0.5) * 2 * rough;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function rockGeo(color = 0x777777, seed = 1) {
  return mergeParts([
    part(blob(1, 1, 0.72, seed, 0.28), color, { pos: [0, 0.5, 0], shade: 0.45, jitter: 0.15 }),
  ]);
}

export function oakGeo({ trunk = 0x5a4028, leaf = 0x4f8a3a, leaf2 = 0x6aa04a, scale = 1 } = {}) {
  const c = new THREE.CylinderGeometry(0.35, 0.6, 4.4, 6);
  return mergeParts([
    part(c, trunk, { pos: [0, 2.2, 0], scale: [scale, scale, scale], shade: 0.5 }),
    part(blob(3.0, 1, 0.85, 3, 0.2), leaf, {
      pos: [0, 6.0 * scale, 0],
      scale: [scale, scale, scale],
      shade: 0.5,
      jitter: 0.1,
    }),
    part(blob(2.2, 1, 0.85, 5, 0.2), leaf2, {
      pos: [1.7 * scale, 4.9 * scale, 0.7 * scale],
      scale: [scale, scale, scale],
      shade: 0.5,
      jitter: 0.1,
    }),
    part(blob(2.0, 1, 0.85, 7, 0.2), leaf, {
      pos: [-1.5 * scale, 5.1 * scale, -0.9 * scale],
      scale: [scale, scale, scale],
      shade: 0.5,
      jitter: 0.1,
    }),
  ]);
}

export function pineGeo({ trunk = 0x4a3524, leaf = 0x2f5f3a, leaf2 = 0x3b7346 } = {}) {
  const list = [
    part(new THREE.CylinderGeometry(0.3, 0.5, 3, 6), trunk, { pos: [0, 1.5, 0], shade: 0.4 }),
  ];
  const tiers = [
    [3.4, 4.2, 3.2],
    [2.7, 3.8, 5.4],
    [2.0, 3.4, 7.4],
    [1.2, 3.0, 9.2],
  ];
  tiers.forEach(([r, h, y], i) =>
    list.push(
      part(new THREE.ConeGeometry(r, h, 7), i % 2 ? leaf2 : leaf, {
        pos: [0, y, 0],
        shade: 0.5,
        jitter: 0.1,
      })
    )
  );
  return mergeParts(list);
}

export function deadTreeGeo({ bark = 0x3b2a22, glow = null } = {}) {
  const list = [
    part(new THREE.CylinderGeometry(0.25, 0.7, 8, 6), bark, {
      pos: [0, 4, 0],
      rot: [0.05, 0, 0.08],
      shade: 0.5,
    }),
  ];
  const br = [
    [0.9, 0.2, 5, 0.9],
    [-0.8, 3.0, 5.6, 1.0],
    [0.5, -2.3, 6.4, 0.7],
    [-0.6, 1.8, 7.1, 0.8],
    [1.1, 4.1, 4.2, 0.6],
  ];
  for (const [tilt, yaw, y, s] of br) {
    list.push(
      part(new THREE.CylinderGeometry(0.06, 0.24, 4.5 * s, 5), bark, {
        pos: [Math.sin(yaw) * 0.6, y, Math.cos(yaw) * 0.6],
        rot: [tilt * Math.cos(yaw), yaw, -tilt * Math.sin(yaw)],
        shade: 0.3,
      })
    );
    list.push(
      part(new THREE.CylinderGeometry(0.03, 0.12, 2.4 * s, 4), bark, {
        pos: [Math.sin(yaw) * 2.4, y + 1.6 * s, Math.cos(yaw) * 2.4],
        rot: [tilt * 1.3, yaw + 0.8, tilt],
        shade: 0.3,
      })
    );
  }
  if (glow) list.push(part(blob(0.9, 1, 1, 2, 0.3), glow, { pos: [0.6, 3.2, 0.3], shade: 0 }));
  return mergeParts(list);
}

export function pillarGeo({ stone = 0x9a9080, height = 10, broken = false } = {}) {
  const list = [
    part(new THREE.BoxGeometry(2.6, 0.8, 2.6), stone, { pos: [0, 0.4, 0], shade: 0.3 }),
    part(new THREE.CylinderGeometry(0.85, 1.0, height, 10), stone, {
      pos: [0, 0.8 + height / 2, 0],
      shade: 0.35,
    }),
  ];
  if (!broken)
    list.push(
      part(new THREE.BoxGeometry(2.4, 0.9, 2.4), stone, { pos: [0, height + 1.2, 0], shade: 0.2 })
    );
  else
    list.push(
      part(blob(1.0, 0, 0.6, 4, 0.3), stone, { pos: [0.5, height + 0.9, 0.2], shade: 0.2 })
    );
  return mergeParts(list);
}

export function archGeo({ stone = 0x9a9080, span = 12, height = 11 } = {}) {
  const list = [];
  for (const s of [-1, 1]) {
    list.push(
      part(new THREE.BoxGeometry(2.4, height, 2.4), stone, {
        pos: [(s * span) / 2, height / 2, 0],
        shade: 0.35,
      })
    );
    list.push(
      part(new THREE.BoxGeometry(3.2, 0.9, 3.2), stone, {
        pos: [(s * span) / 2, 0.45, 0],
        shade: 0.2,
      })
    );
  }
  list.push(
    part(new THREE.TorusGeometry(span / 2, 1.3, 6, 18, PI), stone, {
      pos: [0, height, 0],
      scale: [1, 0.7, 1.2],
      shade: 0.2,
    })
  );
  return mergeParts(list);
}

export function towerGeo({ stone = 0x6c6a66, roof = 0x3a3a48, h = 26, r = 5 } = {}) {
  const list = [
    part(new THREE.CylinderGeometry(r, r * 1.15, h, 10), stone, { pos: [0, h / 2, 0], shade: 0.4 }),
    part(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 1.6, 10), stone, {
      pos: [0, h + 0.4, 0],
      shade: 0.2,
    }),
    part(new THREE.ConeGeometry(r * 1.35, r * 1.9, 10), roof, {
      pos: [0, h + 2.2 + r * 0.95, 0],
      shade: 0.3,
    }),
  ];
  return mergeParts(list);
}

export function wallSegGeo({ stone = 0x6c6a66, len = 22, h = 12, th = 4, crenel = true } = {}) {
  const list = [part(new THREE.BoxGeometry(len, h, th), stone, { pos: [0, h / 2, 0], shade: 0.4 })];
  if (crenel) {
    const n = Math.floor(len / 3);
    for (let i = 0; i < n; i++)
      list.push(
        part(new THREE.BoxGeometry(1.6, 1.4, th + 0.4), stone, {
          pos: [-len / 2 + 1.5 + i * 3, h + 0.7, 0],
          shade: 0.2,
        })
      );
  }
  return mergeParts(list);
}

export function houseGeo({ wall = 0xb79f7a, roof = 0x6a3b2a, w = 8, d = 8, h = 7 } = {}) {
  return mergeParts([
    part(new THREE.BoxGeometry(w, h, d), wall, { pos: [0, h / 2, 0], shade: 0.4, jitter: 0.08 }),
    part(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.55, 4), roof, {
      pos: [0, h + h * 0.27, 0],
      rot: [0, PI / 4, 0],
      shade: 0.2,
    }),
  ]);
}

export function mushroomGeo({ stem = 0xd8c4a0, cap = 0xd23a1a, r = 1.6 } = {}) {
  return mergeParts([
    part(new THREE.CylinderGeometry(r * 0.22, r * 0.32, r * 1.6, 7), stem, {
      pos: [0, r * 0.8, 0],
      shade: 0.3,
    }),
    part(new THREE.SphereGeometry(r, 10, 6, 0, PI * 2, 0, PI * 0.55), cap, {
      pos: [0, r * 1.5, 0],
      scale: [1, 0.7, 1],
      shade: 0.1,
    }),
  ]);
}

export function flameBowlGeo({ stone = 0x8a7a58 } = {}) {
  return mergeParts([
    part(new THREE.CylinderGeometry(0.5, 0.7, 2.8, 8), stone, { pos: [0, 1.4, 0], shade: 0.3 }),
    part(new THREE.CylinderGeometry(1.3, 0.7, 0.9, 10), stone, { pos: [0, 3.1, 0], shade: 0.2 }),
  ]);
}

export function dragonStatueGeo({ gold = 0xc9a24a, dark = 0x6a5220 } = {}) {
  const list = [
    part(new THREE.BoxGeometry(5, 2, 9), dark, { pos: [0, 1, 0], shade: 0.3 }),
    part(blob(2.6, 1, 0.8, 2, 0.12), gold, { pos: [0, 4.1, 0], scale: [1.1, 1, 1.6], shade: 0.3 }),
    part(new THREE.CylinderGeometry(0.7, 1.2, 5.5, 8), gold, {
      pos: [0, 7.0, -3.2],
      rot: [-0.55, 0, 0],
      shade: 0.3,
    }),
    part(blob(1.3, 1, 0.8, 4, 0.1), gold, {
      pos: [0, 9.4, -5.1],
      scale: [1, 0.8, 1.5],
      shade: 0.2,
    }),
    part(new THREE.ConeGeometry(0.3, 1.6, 5), gold, {
      pos: [0.6, 10.6, -5.0],
      rot: [-0.4, 0, 0.3],
      shade: 0.2,
    }),
    part(new THREE.ConeGeometry(0.3, 1.6, 5), gold, {
      pos: [-0.6, 10.6, -5.0],
      rot: [-0.4, 0, -0.3],
      shade: 0.2,
    }),
    part(new THREE.CylinderGeometry(0.4, 0.9, 6, 6), gold, {
      pos: [0, 3.6, 5.2],
      rot: [1.3, 0, 0],
      shade: 0.3,
    }),
  ];
  for (const s of [-1, 1]) {
    list.push(
      part(new THREE.BoxGeometry(0.4, 6.5, 3.6), gold, {
        pos: [s * 3.0, 6.6, 0.4],
        rot: [0, 0, s * -0.7],
        shade: 0.3,
      })
    );
    list.push(
      part(new THREE.BoxGeometry(0.3, 4.8, 3.0), gold, {
        pos: [s * 5.1, 7.6, 0.9],
        rot: [0, 0, s * -1.1],
        shade: 0.3,
      })
    );
  }
  return mergeParts(list);
}

export function churchGeo({ wall = 0xc9bfa5, roof = 0x5a3a2a, trim = 0x8a7a5a } = {}) {
  return mergeParts([
    part(new THREE.BoxGeometry(10, 8, 18), wall, { pos: [0, 4, 0], shade: 0.4 }),
    part(new THREE.CylinderGeometry(0.1, 5.8, 5, 3, 1), roof, {
      pos: [0, 10.4, 0],
      rot: [PI / 2, 0, 0],
      scale: [1, 1.8, 1],
      shade: 0.2,
    }),
    part(new THREE.BoxGeometry(5, 16, 5), wall, { pos: [0, 8, -10.5], shade: 0.4 }),
    part(new THREE.ConeGeometry(4, 7, 4), roof, {
      pos: [0, 19.5, -10.5],
      rot: [0, PI / 4, 0],
      shade: 0.2,
    }),
    part(new THREE.BoxGeometry(2.4, 4, 0.6), trim, { pos: [0, 2, 9.2], shade: 0.2 }),
  ]);
}

export function ribGeo(bone = 0xd9d0bc, radius = 16, tube = 1.0, arc = 2.9) {
  return mergeParts([
    part(new THREE.TorusGeometry(radius, tube, 6, 22, arc), bone, { shade: 0.3, jitter: 0.05 }),
  ]);
}

// Giant skeleton lying on its back: ribcage arch, spine, skull, femurs.
export function giantSkeletonGeo(bone = 0xd9cdb4, dark = 0x2a1410) {
  const list = [];
  // spine
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = -34 + t * 68;
    const y = 2.2 + Math.sin(t * PI) * 3;
    list.push(
      part(new THREE.CylinderGeometry(2.0 - t * 0.6, 2.3 - t * 0.6, 3.2, 8), bone, {
        pos: [x, y, 0],
        rot: [0, 0, PI / 2],
        shade: 0.3,
        jitter: 0.05,
      })
    );
    list.push(
      part(new THREE.BoxGeometry(1.2, 4.0 - t, 1.0), bone, { pos: [x, y + 1.6, 0], shade: 0.3 })
    );
  }
  // ribs
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = -20 + t * 38;
    const rad = 14 - Math.abs(t - 0.4) * 10;
    list.push(
      part(new THREE.TorusGeometry(rad, 0.85, 6, 24, PI * 0.96), bone, {
        pos: [x, 2.5, 0],
        rot: [0, PI / 2, 0],
        scale: [1, 1, 0.6],
        shade: 0.3,
        jitter: 0.05,
      })
    );
  }
  // skull
  list.push(
    part(blob(8, 1, 0.9, 6, 0.12), bone, { pos: [-44, 6.5, 0], scale: [1.2, 1, 1], shade: 0.3 })
  );
  list.push(part(new THREE.BoxGeometry(9, 3.2, 8), bone, { pos: [-51, 2.5, 0], shade: 0.3 }));
  for (const s of [-1, 1])
    list.push(part(blob(1.9, 1, 1, 8, 0.05), dark, { pos: [-50, 8, s * 3.4], shade: 0 }));
  // thigh bones
  for (const s of [-1, 1]) {
    list.push(
      part(new THREE.CylinderGeometry(1.3, 1.5, 32, 8), bone, {
        pos: [42, 2, s * 10],
        rot: [0, 0, PI / 2.3],
        shade: 0.3,
      })
    );
    list.push(part(blob(2.4, 1, 1, 9, 0.1), bone, { pos: [30, 8.5, s * 10], shade: 0.3 }));
    list.push(part(blob(2.6, 1, 1, 11, 0.1), bone, { pos: [56, -1, s * 11], shade: 0.3 }));
  }
  return mergeParts(list);
}

export function rootGeo(curvePts, radius = 3, color = 0x5a3e24, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(curvePts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, radius, 8, false);
  // taper the tube towards its end
  const p = g.getAttribute('position');
  const per = 9;
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / per);
    const t = ring / seg;
    const c = curve.getPoint(Math.min(t, 1));
    const k = 1 - 0.55 * t;
    p.setXYZ(
      i,
      c.x + (p.getX(i) - c.x) * k,
      c.y + (p.getY(i) - c.y) * k,
      c.z + (p.getZ(i) - c.z) * k
    );
  }
  g.computeVertexNormals();
  return part(g, color, { shade: 0.2, jitter: 0.1 });
}
