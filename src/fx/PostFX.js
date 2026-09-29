import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Runs on linear HDR colour, after bloom and before tone mapping / sRGB output.
const GradeShader = {
  name: 'EldenGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uBoost: { value: 0 },
    uVignette: { value: 0.35 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBoost;
    uniform float uVignette;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));

      // Radial speed blur: stronger towards the edges, clear in the centre.
      float blur = uBoost * 0.07 * smoothstep(0.12, 0.85, r);
      // Chromatic aberration: a hint always, more at high boost.
      float ca = (0.0006 + uBoost * 0.0045) * smoothstep(0.1, 0.9, r);
      vec3 col = vec3(0.0);
      const int N = 8;
      for (int i = 0; i < N; i++) {
        float k = float(i) / float(N - 1);
        vec2 uv = 0.5 + c * (1.0 - blur * k);
        vec2 off = c * ca * (1.0 + k);
        col.r += texture2D(tDiffuse, uv + off).r;
        col.g += texture2D(tDiffuse, uv).g;
        col.b += texture2D(tDiffuse, uv - off).b;
      }
      col /= float(N);

      // Filmic-ish contrast around mid grey and a touch of warm saturation.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.12);
      col = 0.18 * pow(max(col, vec3(0.0)) / 0.18, vec3(1.06));
      // Warm highlights, cool shadows.
      col *= mix(vec3(0.97, 0.99, 1.04), vec3(1.05, 1.0, 0.94), smoothstep(0.0, 1.2, luma));

      // Vignette (deepens a little with boost).
      float v = smoothstep(0.35, 0.95, r * (1.0 + uBoost * 0.25));
      col *= 1.0 - v * uVignette * 1.4;

      // Hot-edge tint while boosting.
      col += vec3(0.5, 0.28, 0.08) * v * uBoost * 0.12;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// opts.msaa: multisample count for the HDR target (0 disables MSAA).
export function createPostFX(renderer, scene, camera, opts = {}) {
  let composer = null;
  let grade = null;
  let bloom = null;
  let target = null;
  let boost = 0;
  let boostTarget = 0;
  let vignette = 0.35;
  let time = 0;

  try {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: renderer.capabilities.isWebGL2 === false ? 0 : (opts.msaa ?? 4),
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.65, 0.88);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    grade.uniforms.uAspect.value = size.x / size.y;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('[PostFX] composer unavailable, falling back to direct rendering', err);
    composer = null;
  }

  return {
    render(dt = 0.016) {
      if (!composer) {
        renderer.render(scene, camera);
        return;
      }
      time += dt;
      // Ease boost so pulses fade in/out instead of popping.
      boost += (boostTarget - boost) * Math.min(1, dt * (boostTarget > boost ? 8 : 4));
      grade.uniforms.uBoost.value = boost;
      grade.uniforms.uVignette.value = vignette;
      grade.uniforms.uTime.value = time;
      composer.render(dt);
    },
    resize(w, h) {
      if (!composer) return;
      composer.setSize(w, h);
      grade.uniforms.uAspect.value = w / h;
      bloom.resolution.set(w, h);
    },
    setBoost(v) {
      boostTarget = Math.max(0, Math.min(1, v));
    },
    setVignette(v) {
      vignette = Math.max(0, Math.min(1, v));
    },
    dispose() {
      if (!composer) return;
      composer.passes.forEach((p) => p.dispose && p.dispose());
      composer.dispose();
      if (target) target.dispose();
      composer = null;
    },
  };
}
