// Road ribbon, kerbs, shoulders, walls, posts, boost pads, ramps and the start arch.
import * as THREE from 'three';
import { KERB } from '../Centerline.js';
import { buildStrip, loopIndices, runsOf, indexRange, merge } from './strips.js';
import {
  makeRoadTexture,
  makeKerbTexture,
  makeGroundTexture,
  makeWallTexture,
  makeChevronTexture,
  makeCheckerTexture,
  makeBannerTexture,
} from '../textures.js';
import { createBillboards } from '../fx.js';

const decal = (mat) => {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -4;
  return mat;
};

export function buildRoad(core, root) {
  const L = core.layout;
  const N = core.N;
  const disposables = [];
  const updaters = [];
  const group = new THREE.Group();
  group.name = 'road';
  root.add(group);
  const track = (o) => (disposables.push(o), o);
  const mesh = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.receiveShadow = true;
    group.add(m);
    disposables.push(geo);
    return m;
  };
  const all = loopIndices(N);
  const hw = (i) => core.hw[i];

  // --- road surface
  const roadTex = track(makeRoadTexture(L.road, L.seed));
  const roadMat = track(
    new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: L.road.rough ?? 0.92,
      metalness: L.road.metal ?? 0,
    })
  );
  mesh(
    buildStrip(core, { idx: all, a: (i) => [-hw(i), 0], b: (i) => [hw(i), 0], vScale: 24 }),
    roadMat,
    'road'
  );

  // --- kerbs
  const kerbTex = track(makeKerbTexture(L.kerb[0], L.kerb[1]));
  const kerbMat = track(new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.8 }));
  mesh(
    merge([
      buildStrip(core, {
        idx: all,
        a: (i) => [-(hw(i) + KERB), 0.04],
        b: (i) => [-hw(i), 0.04],
        vScale: 6,
      }),
      buildStrip(core, {
        idx: all,
        a: (i) => [hw(i), 0.04],
        b: (i) => [hw(i) + KERB, 0.04],
        vScale: 6,
      }),
    ]),
    kerbMat,
    'kerbs'
  );

  // --- skirts (hide the terrain gap under the road edge)
  const skirtMat = track(
    new THREE.MeshLambertMaterial({ color: L.wall.color, side: THREE.DoubleSide })
  );
  mesh(
    merge([
      buildStrip(core, {
        idx: all,
        a: (i) => [-(hw(i) + KERB), 0.04],
        b: (i) => [-(hw(i) + KERB) - 0.1, -1.6],
        vScale: 8,
      }),
      buildStrip(core, {
        idx: all,
        a: (i) => [hw(i) + KERB, 0.04],
        b: (i) => [hw(i) + KERB + 0.1, -1.6],
        vScale: 8,
      }),
    ]),
    skirtMat,
    'skirts'
  );

  // --- shoulders
  const groundTex = track(makeGroundTexture(L.seed + 3, 0.5));
  const shoulderMat = track(
    new THREE.MeshLambertMaterial({ map: groundTex, color: L.ground.dirt })
  );
  const sw = core.shoulderWidth;
  mesh(
    merge([
      buildStrip(core, {
        idx: all,
        a: (i) => [-(hw(i) + KERB) - sw, -1.3],
        b: (i) => [-(hw(i) + KERB), 0.0],
        uA: 0,
        uB: sw / 8,
        vScale: 8,
      }),
      buildStrip(core, {
        idx: all,
        a: (i) => [hw(i) + KERB, 0.0],
        b: (i) => [hw(i) + KERB + sw, -1.3],
        uA: 0,
        uB: sw / 8,
        vScale: 8,
      }),
    ]),
    shoulderMat,
    'shoulders'
  );

  // --- emissive edge lines
  if (L.edgeGlow) {
    const glowMat = decal(
      track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(L.edgeGlow).multiplyScalar(1.8),
          toneMapped: false,
        })
      )
    );
    mesh(
      merge([
        buildStrip(core, {
          idx: all,
          a: (i) => [-hw(i) + 0.9, 0.05],
          b: (i) => [-hw(i) + 1.25, 0.05],
          vScale: 8,
        }),
        buildStrip(core, {
          idx: all,
          a: (i) => [hw(i) - 1.25, 0.05],
          b: (i) => [hw(i) - 0.9, 0.05],
          vScale: 8,
        }),
      ]),
      glowMat,
      'edgeGlow'
    );
  }

  // --- walls
  const W = L.wall;
  const wallH = W.height ?? 1.5;
  const wallLat = (i) => hw(i) + KERB + 1.2;
  const wallTex = track(makeWallTexture(W.color, L.seed));
  const wallMat = track(
    new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.85,
      side: THREE.DoubleSide,
      emissive: W.emissive ?? 0x000000,
    })
  );
  const wallGeos = [];
  const capGeos = [];
  const posts = [];
  for (const side of [-1, 1]) {
    const runs = runsOf(side < 0 ? core.wallL : core.wallR, N);
    for (const idx of runs) {
      wallGeos.push(
        buildStrip(core, {
          idx,
          a: (i) => [side * (wallLat(i) - 0.5), 0],
          b: (i) => [side * (wallLat(i) - 0.5), wallH],
          uA: 0,
          uB: 0.25,
          vScale: 4,
        }),
        buildStrip(core, {
          idx,
          a: (i) => [side * (wallLat(i) - 0.5), wallH],
          b: (i) => [side * (wallLat(i) + 0.5), wallH],
          uA: 0,
          uB: 0.25,
          vScale: 4,
        }),
        buildStrip(core, {
          idx,
          a: (i) => [side * (wallLat(i) + 0.5), wallH],
          b: (i) => [side * (wallLat(i) + 0.5), -1.4],
          uA: 0,
          uB: 0.25,
          vScale: 4,
        })
      );
      if (W.glow) {
        capGeos.push(
          buildStrip(core, {
            idx,
            a: (i) => [side * (wallLat(i) - 0.12), wallH + 0.05],
            b: (i) => [side * (wallLat(i) + 0.12), wallH + 0.05],
            vScale: 4,
          })
        );
      }
      const step = Math.round(16 / core.ds);
      for (let k = 0; k < idx.length; k += step) {
        const i = idx[k];
        posts.push({ i, side });
      }
    }
  }
  const wallMerged = merge(wallGeos);
  if (wallMerged) mesh(wallMerged, wallMat, 'walls');
  const capMerged = merge(capGeos);
  if (capMerged) {
    mesh(
      capMerged,
      track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(W.glow).multiplyScalar(1.6),
          toneMapped: false,
        })
      ),
      'wallGlow'
    );
  }

  // --- posts with glowing tops
  const halos = [];
  if (posts.length) {
    const postGeo = track(new THREE.BoxGeometry(1.3, wallH + 1.8, 1.3));
    postGeo.translate(0, (wallH + 1.8) / 2 - 0.5, 0);
    const inst = new THREE.InstancedMesh(postGeo, wallMat, posts.length);
    const orbGeo = track(new THREE.SphereGeometry(0.42, 10, 8));
    const orbMat = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(W.post ?? 0xffd070).multiplyScalar(2.2),
        toneMapped: false,
      })
    );
    const orbs = new THREE.InstancedMesh(orbGeo, orbMat, posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(({ i, side }, k) => {
      const lat = side * wallLat(i);
      const x = core.px[i] + core.rx[i] * lat;
      const y = core.py[i];
      const z = core.pz[i] + core.rz[i] * lat;
      m.makeRotationY(Math.atan2(core.tx[i], core.tz[i]));
      m.setPosition(x, y, z);
      inst.setMatrixAt(k, m);
      m.makeTranslation(x, y + wallH + 1.6, z);
      orbs.setMatrixAt(k, m);
      halos.push({
        x,
        y: y + wallH + 1.6,
        z,
        size: 1.5,
        color: W.post ?? 0xffd070,
        alpha: 0.4,
        phase: (k * 0.37) % 1,
      });
    });
    group.add(inst, orbs);
    const hb = createBillboards(halos, { flicker: 0.5 });
    group.add(hb.mesh);
    updaters.push((dt, t) => hb.update(t));
    disposables.push({ dispose: hb.dispose });
  }

  // --- boost pads & ramp arrows
  const chevTex = track(makeChevronTexture('#ffffff'));
  chevTex.wrapT = THREE.RepeatWrapping;
  const boostColor = new THREE.Color(L.boostColor ?? 0xffc23a);
  const chevMat = decal(
    track(
      new THREE.MeshBasicMaterial({
        map: chevTex,
        color: boostColor.clone().multiplyScalar(2.4),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    )
  );
  const plateMat = decal(
    track(
      new THREE.MeshBasicMaterial({
        color: 0x0a0604,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    )
  );
  const chevGeos = [];
  const plateGeos = [];
  for (const p of core.boosts) {
    const idx = indexRange(core, p.s0, p.len);
    const a = () => [p.lat - p.w / 2, 0.07];
    const b = () => [p.lat + p.w / 2, 0.07];
    plateGeos.push(buildStrip(core, { idx, a, b, vScale: p.w }));
    chevGeos.push(
      buildStrip(core, {
        idx,
        a: () => [p.lat - p.w / 2, 0.09],
        b: () => [p.lat + p.w / 2, 0.09],
        vScale: p.w * 0.4,
      })
    );
  }
  const ramps = [];
  const rampMat = track(
    new THREE.MeshStandardMaterial({
      color: L.rampColor ?? 0x8a7040,
      roughness: 0.7,
      emissive: L.rampEmissive ?? 0x2a1804,
      side: THREE.DoubleSide,
    })
  );
  for (const r of core.ramps) {
    const idx = indexRange(core, r.s0, r.len);
    const hOf = (k) => Math.min(1, (k * core.ds) / r.len) * r.h;
    const lo = r.lat - r.w / 2;
    const hi = r.lat + r.w / 2;
    ramps.push(
      buildStrip(core, {
        idx,
        a: (i, k) => [lo, hOf(k) + 0.03],
        b: (i, k) => [hi, hOf(k) + 0.03],
        vScale: 4,
      }),
      buildStrip(core, { idx, a: () => [lo, 0], b: (i, k) => [lo, hOf(k) + 0.03], vScale: 4 }),
      buildStrip(core, { idx, a: () => [hi, 0], b: (i, k) => [hi, hOf(k) + 0.03], vScale: 4 })
    );
    const last = idx.length - 1;
    // vertical back face at the lip
    const i = idx[last];
    const q = new THREE.BufferGeometry();
    const yTop = core.py[i] + hOf(last) + 0.03;
    const yBot = core.py[i];
    const P = (lat, y) => [core.px[i] + core.rx[i] * lat, y, core.pz[i] + core.rz[i] * lat];
    q.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [...P(lo, yBot), ...P(hi, yBot), ...P(hi, yTop), ...P(lo, yTop)],
        3
      )
    );
    q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    q.setIndex([0, 1, 2, 0, 2, 3]);
    q.computeVertexNormals();
    ramps.push(q);
    chevGeos.push(
      buildStrip(core, {
        idx,
        a: (ii, k) => [lo + 1.2, hOf(k) + 0.08],
        b: (ii, k) => [hi - 1.2, hOf(k) + 0.08],
        vScale: (r.w - 2.4) * 0.4,
      })
    );
  }
  const rampMerged = merge(ramps);
  if (rampMerged) mesh(rampMerged, rampMat, 'ramps');
  const plate = merge(plateGeos);
  if (plate) mesh(plate, plateMat, 'boostPlates');
  const chev = merge(chevGeos);
  if (chev) {
    const cm = mesh(chev, chevMat, 'boostArrows');
    cm.renderOrder = 2;
    updaters.push((dt) => {
      chevTex.offset.y -= dt * 1.4;
    });
  }

  // --- start line + arch
  const p0 = core.getPoint(0);
  const checker = track(makeCheckerTexture());
  const startMat = decal(track(new THREE.MeshBasicMaterial({ map: checker })));
  const startIdx = [N - 1, 0, 1];
  mesh(
    buildStrip(core, {
      idx: startIdx,
      a: (i) => [-hw(i), 0.06],
      b: (i) => [hw(i), 0.06],
      vScale: 4,
    }),
    startMat,
    'startLine'
  );

  const arch = new THREE.Group();
  arch.position.copy(p0.pos);
  arch.rotation.y = Math.atan2(-p0.tangent.x, -p0.tangent.z);
  const span = p0.halfWidth + 3.4;
  const pillarGeo = track(new THREE.BoxGeometry(2, 12, 2));
  const archMat = track(
    new THREE.MeshStandardMaterial({
      color: W.color,
      roughness: 0.7,
      emissive: W.emissive ?? 0x000000,
    })
  );
  const trimMat = track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(L.arch ?? 0xffc84a).multiplyScalar(1.8),
      toneMapped: false,
    })
  );
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(pillarGeo, archMat);
    pil.position.set(s * span, 5.5, 0);
    arch.add(pil);
    const cap = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 0.5, 2.6)), trimMat);
    cap.position.set(s * span, 11.6, 0);
    arch.add(cap);
  }
  const beam = new THREE.Mesh(track(new THREE.BoxGeometry(span * 2 + 2, 1.4, 1.6)), archMat);
  beam.position.set(0, 11.2, 0);
  arch.add(beam);
  const bannerTex = track(makeBannerTexture(L.bannerText ?? 'ELDEN KART', L.banner));
  const bannerGeo = track(new THREE.PlaneGeometry(span * 2 - 1, (span * 2 - 1) * (160 / 1024)));
  const bannerMat = track(new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }));
  const banner = new THREE.Group();
  const bannerFront = new THREE.Mesh(bannerGeo, bannerMat);
  const bannerBack = new THREE.Mesh(bannerGeo, bannerMat);
  bannerFront.position.z = 0.02;
  bannerBack.position.z = -0.02;
  bannerBack.rotation.y = Math.PI;
  banner.add(bannerFront, bannerBack);
  banner.position.set(0, 8.9, 0);
  arch.add(banner);
  group.add(arch);
  disposables.push(pillarGeo);
  const bannerRef = banner;
  updaters.push((dt, t) => {
    bannerRef.rotation.x = Math.sin(t * 1.3) * 0.02;
    bannerRef.position.y = 8.9 + Math.sin(t * 0.9) * 0.05;
  });

  return {
    group,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    dispose() {
      root.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  };
}
