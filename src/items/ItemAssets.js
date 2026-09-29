import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

function canvasTex(size, draw, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function boxTransform(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1)
  );
  g.applyMatrix4(m);
  return g;
}

function horseGeometry() {
  return mergeGeometries([
    boxTransform(0.7, 0.8, 2.0, 0, 1.3, 0),
    boxTransform(0.4, 1.1, 0.5, 0, 1.9, -1.05, 0.5, 0, 0),
    boxTransform(0.35, 0.4, 0.9, 0, 2.4, -1.5, -0.35, 0, 0),
    boxTransform(0.18, 0.9, 0.18, 0.24, 0.5, -0.8),
    boxTransform(0.18, 0.9, 0.18, -0.24, 0.5, -0.8),
    boxTransform(0.18, 0.9, 0.18, 0.24, 0.5, 0.8),
    boxTransform(0.18, 0.9, 0.18, -0.24, 0.5, 0.8),
    boxTransform(0.15, 0.9, 0.3, 0, 1.4, 1.2, -0.6, 0, 0),
    boxTransform(0.5, 0.9, 0.5, 0, 2.0, 0.1),
  ]);
}

function houndGeometry() {
  return mergeGeometries([
    boxTransform(0.7, 0.55, 1.5, 0, 0.75, 0),
    boxTransform(0.4, 0.4, 0.55, 0, 0.95, -0.95),
    boxTransform(0.22, 0.2, 0.4, 0, 0.85, -1.35),
    boxTransform(0.12, 0.5, 0.12, 0.25, 0.3, -0.5),
    boxTransform(0.12, 0.5, 0.12, -0.25, 0.3, -0.5),
    boxTransform(0.12, 0.5, 0.12, 0.25, 0.3, 0.5),
    boxTransform(0.12, 0.5, 0.12, -0.25, 0.3, 0.5),
    boxTransform(0.1, 0.1, 0.8, 0, 1.0, 1.0, 0.5, 0, 0),
    boxTransform(0.1, 0.25, 0.1, 0.12, 1.25, -0.9),
    boxTransform(0.1, 0.25, 0.1, -0.12, 1.25, -0.9),
  ]);
}

function lathe(points, segs = 14) {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segs
  );
}

export class ItemAssets {
  constructor() {
    this.disposables = [];
    const own = (o) => {
      this.disposables.push(o);
      return o;
    };
    this._own = own;

    this.glowTex = own(
      canvasTex(
        128,
        (g, s) => {
          const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
          gr.addColorStop(0, 'rgba(255,255,255,1)');
          gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, s, s);
        },
        false
      )
    );

    this.boxTex = own(
      canvasTex(256, (g, s) => {
        const bg = g.createLinearGradient(0, 0, s, s);
        bg.addColorStop(0, '#5a3d0c');
        bg.addColorStop(0.5, '#c7911f');
        bg.addColorStop(1, '#6b4810');
        g.fillStyle = bg;
        g.fillRect(0, 0, s, s);
        g.strokeStyle = '#ffe9a0';
        g.lineWidth = 8;
        g.strokeRect(10, 10, s - 20, s - 20);
        g.lineWidth = 3;
        g.strokeRect(24, 24, s - 48, s - 48);
        // engraved rune ring
        g.strokeStyle = 'rgba(255,240,180,0.7)';
        g.beginPath();
        g.arc(s / 2, s / 2, 82, 0, TAU);
        g.stroke();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          g.beginPath();
          g.moveTo(s / 2 + Math.cos(a) * 82, s / 2 + Math.sin(a) * 82);
          g.lineTo(s / 2 + Math.cos(a) * 94, s / 2 + Math.sin(a) * 94);
          g.stroke();
        }
        g.font = 'bold 150px Georgia, "Times New Roman", serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#fff2b0';
        g.shadowBlur = 24;
        g.fillStyle = '#fff6cf';
        g.fillText('?', s / 2, s / 2 + 8);
      })
    );

    this.puddleTex = own(
      canvasTex(256, (g, s) => {
        g.clearRect(0, 0, s, s);
        const blob = (x, y, r, c0, c1) => {
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, c0);
          gr.addColorStop(1, c1);
          g.fillStyle = gr;
          g.beginPath();
          g.arc(x, y, r, 0, TAU);
          g.fill();
        };
        blob(s / 2, s / 2, s * 0.5, 'rgba(120,20,10,0.85)', 'rgba(60,8,6,0)');
        for (let i = 0; i < 9; i++) {
          const a = Math.random() * TAU;
          const d = Math.random() * s * 0.28;
          blob(
            s / 2 + Math.cos(a) * d,
            s / 2 + Math.sin(a) * d,
            26 + Math.random() * 30,
            'rgba(230,90,25,0.75)',
            'rgba(150,30,10,0)'
          );
        }
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * TAU;
          const d = Math.random() * s * 0.4;
          g.fillStyle = 'rgba(255,190,110,0.8)';
          g.beginPath();
          g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + Math.random() * 3, 0, TAU);
          g.fill();
        }
      })
    );

    // Item box.
    this.boxGeo = own(new THREE.BoxGeometry(1.7, 1.7, 1.7));
    this.cageGeo = own(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.05, 2.05, 2.05)));
    this.coreGeo = own(new THREE.OctahedronGeometry(0.75, 0));
    this.boxMat = own(
      new THREE.MeshBasicMaterial({
        map: this.boxTex,
        color: new THREE.Color(1.5, 1.25, 0.8),
        transparent: true,
        opacity: 0.92,
      })
    );
    this.cageMat = own(
      new THREE.LineBasicMaterial({
        color: new THREE.Color(2.4, 1.7, 0.5),
        transparent: true,
        opacity: 0.9,
      })
    );
    this.coreMat = own(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.4, 1.6, 0.4),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    // Pots.
    this.rotPotGeo = own(
      lathe([
        [0.001, 0],
        [0.32, 0.02],
        [0.5, 0.25],
        [0.55, 0.5],
        [0.42, 0.75],
        [0.26, 0.85],
        [0.34, 0.92],
        [0.3, 0.98],
      ])
    );
    this.rotPotMat = own(
      new THREE.MeshStandardMaterial({
        color: 0x5b3a22,
        emissive: 0xc2420f,
        emissiveIntensity: 0.55,
        roughness: 0.8,
      })
    );
    this.firePotGeo = own(
      lathe([
        [0.001, 0],
        [0.3, 0.02],
        [0.48, 0.25],
        [0.5, 0.5],
        [0.36, 0.72],
        [0.2, 0.82],
        [0.28, 0.88],
        [0.24, 0.94],
      ])
    );
    this.firePotMat = own(
      new THREE.MeshStandardMaterial({
        color: 0x1d1a1a,
        emissive: 0xff5a10,
        emissiveIntensity: 0.9,
        roughness: 0.5,
        metalness: 0.4,
      })
    );
    this.puddleGeo = own(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
    this.puddleMat = own(
      new THREE.MeshBasicMaterial({
        map: this.puddleTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );

    // Missile & knife.
    this.missileCoreGeo = own(new THREE.IcosahedronGeometry(0.32, 1));
    this.missileCoreMat = own(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3.4) })
    );
    this.missileShardGeo = own(new THREE.OctahedronGeometry(0.28, 0));
    this.missileShardMat = own(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.5, 1.0, 2.6),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.knifeBladeGeo = own(new THREE.OctahedronGeometry(1, 0).scale(0.11, 0.05, 0.85));
    this.knifeHiltGeo = own(new THREE.BoxGeometry(0.34, 0.08, 0.1));
    this.knifeMat = own(new THREE.MeshBasicMaterial({ color: 0x0a0610 }));
    this.knifeEdgeMat = own(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.5), wireframe: true })
    );

    // Stonesword key.
    this.keyGeo = own(
      mergeGeometries([
        new THREE.TorusGeometry(0.2, 0.06, 8, 16).translate(0, 0.62, 0),
        new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8).translate(0, 0, 0),
        new THREE.BoxGeometry(0.22, 0.09, 0.07).translate(0.13, -0.32, 0),
        new THREE.BoxGeometry(0.16, 0.09, 0.07).translate(0.1, -0.5, 0),
      ])
    );
    this.keyMat = own(
      new THREE.MeshStandardMaterial({
        color: 0xe0b34a,
        emissive: 0xc88a20,
        emissiveIntensity: 0.9,
        metalness: 0.9,
        roughness: 0.3,
      })
    );

    // Ghosts.
    this.horseGeo = own(horseGeometry());
    this.houndGeo = own(houndGeometry());

    // Aura shell.
    this.shellGeo = own(new THREE.SphereGeometry(2.1, 28, 18));

    this.haloMats = new Map();
  }

  haloMaterial(r, g, b) {
    const key = `${r}|${g}|${b}`;
    let m = this.haloMats.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: new THREE.Color(r, g, b),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      this.haloMats.set(key, m);
      this.disposables.push(m);
    }
    return m;
  }

  halo(r, g, b, scale) {
    const s = new THREE.Sprite(this.haloMaterial(r, g, b));
    s.scale.setScalar(scale);
    return s;
  }

  makeItemBox() {
    const grp = new THREE.Group();
    const cube = new THREE.Mesh(this.boxGeo, this.boxMat);
    const cage = new THREE.LineSegments(this.cageGeo, this.cageMat);
    const core = new THREE.Mesh(this.coreGeo, this.coreMat);
    const halo = this.halo(1.6, 1.05, 0.3, 5.2);
    grp.add(cube, cage, core, halo);
    grp.userData = { cube, cage, core, halo };
    return grp;
  }

  makeRotPot() {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(this.rotPotGeo, this.rotPotMat);
    g.add(pot, this.halo(1.6, 0.5, 0.1, 2.6));
    return g;
  }

  makeFirePot() {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(this.firePotGeo, this.firePotMat);
    pot.position.y = -0.45;
    g.add(pot, this.halo(2.4, 0.9, 0.2, 2.8));
    const fuse = this.halo(3.0, 2.0, 0.6, 0.9);
    fuse.position.y = 0.55;
    g.add(fuse);
    return g;
  }

  makePuddle() {
    const m = new THREE.Mesh(this.puddleGeo, this.puddleMat.clone());
    m.renderOrder = 2;
    m.userData.ownMat = true;
    return m;
  }

  makeMissile() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.missileCoreGeo, this.missileCoreMat));
    const shards = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(this.missileShardGeo, this.missileShardMat);
      const a = (i / 3) * TAU;
      s.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
      shards.add(s);
    }
    g.add(shards, this.halo(0.6, 1.2, 3.0, 3.4));
    g.userData.shards = shards;
    return g;
  }

  makeKnife() {
    const g = new THREE.Group();
    const roll = new THREE.Group();
    const blade = new THREE.Mesh(this.knifeBladeGeo, this.knifeMat);
    blade.position.z = -0.4;
    const edge = new THREE.Mesh(this.knifeBladeGeo, this.knifeEdgeMat);
    edge.position.z = -0.4;
    edge.scale.setScalar(1.06);
    const hilt = new THREE.Mesh(this.knifeHiltGeo, this.knifeMat);
    hilt.position.z = 0.5;
    roll.add(blade, edge, hilt);
    g.add(roll, this.halo(2.4, 0.15, 0.6, 3.4));
    g.userData.roll = roll;
    return g;
  }

  makeKeys() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const holder = new THREE.Group();
      const k = new THREE.Mesh(this.keyGeo, this.keyMat);
      k.rotation.z = 0.35;
      k.scale.setScalar(1.15);
      holder.add(k, this.halo(2.0, 1.4, 0.4, 1.4));
      g.add(holder);
    }
    return g;
  }

  makeShell() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uColor: { value: new THREE.Color(2.2, 1.5, 0.4) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          vY = position.y;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float band = 0.5 + 0.5 * sin(vY * 7.0 - uTime * 4.0);
          float a = (f * 0.55 + 0.025 + f * band * 0.35) * uOpacity;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    const m = new THREE.Mesh(this.shellGeo, mat);
    m.frustumCulled = false;
    m.renderOrder = 15;
    return m;
  }

  makeGhost(kind) {
    const mat = new THREE.MeshBasicMaterial({
      color: kind === 'horse' ? new THREE.Color(0.5, 1.0, 2.4) : new THREE.Color(0.9, 0.5, 2.2),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(kind === 'horse' ? this.horseGeo : this.houndGeo, mat);
    m.userData.ownMat = true;
    return m;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose && d.dispose());
    this.disposables.length = 0;
  }
}
