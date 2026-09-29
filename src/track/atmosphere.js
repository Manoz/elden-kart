// Atmospheric fog for every built-in material: exponential-squared distance fog that thins with
// altitude (haze pools in valleys, peaks stay crisp) and picks up the sun colour when looking
// toward the sun. Replaces three's fog shader chunks once, at import.
import * as THREE from 'three';

// Height falloff of the fog density per metre above the scene fog base (see fogDensityFor()).
export const FOG_FALLOFF = 0.022;

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogViewPos = mvPosition.xyz;
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    // camera -> fragment ray in world space
    vec3 fogRay = transpose( mat3( viewMatrix ) ) * vFogViewPos;
    float fogDist = length( fogRay );
    float fogRise = fogRay.y * ${FOG_FALLOFF.toFixed(4)};
    float fogIntegral = abs( fogRise ) > 1e-4 ? ( 1.0 - exp( - fogRise ) ) / fogRise : 1.0;
    float fogTau = fogDensity * exp( - max( cameraPosition.y, -40.0 ) * ${FOG_FALLOFF.toFixed(4)} ) * fogDist * fogIntegral;
    float fogFactor = 1.0 - exp( - fogTau * fogTau );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogTint = fogColor;
  #if ( defined( LAMBERT ) || defined( PHONG ) || defined( STANDARD ) || defined( TOON ) ) && NUM_DIR_LIGHTS > 0
    float fogSun = max( dot( normalize( vFogViewPos ), directionalLights[ 0 ].direction ), 0.0 );
    fogTint += directionalLights[ 0 ].color * ( pow( fogSun, 10.0 ) * 0.07 + pow( fogSun, 3.0 ) * 0.02 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
#endif`;

// Density to hand FogExp2 so the haze at `baseHeight` matches `density` at sea level.
export function fogDensityFor(density, baseHeight) {
  return density * Math.exp(baseHeight * FOG_FALLOFF);
}
