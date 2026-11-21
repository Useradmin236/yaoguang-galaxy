// Interactive N-Body Cosmic Sandbox 2.0 for Yaoguang Observatory.
// Full Velocity Verlet mutual gravity across original + dynamically spawned bodies
// (rocky planets, ringed gas giants, comet clusters, blue/red giant stars, rotating
// twin-beam pulsars, procedural Kerr black holes, and gravitational-slingshot probes).
// Features unrestricted 3D camera freedom (pan, WASD/QE flight, follow-cam, quick views),
// pull-back slingshot spawning with 72-step gravity-bent trajectory prediction,
// live body inspector with mass-induced self-collapse, and full cataclysm physics:
// Star x Star supernovae & remnants, Star x BH stellar TDE + GRB, BH x BH gravitational-wave
// ringdown mergers, NS x NS kilonovae, Roche planetary TDE, molten mergers & shatters.

import { SPAWN_CATALOG, createSandboxBodyFactory } from './sandbox-bodies.js';
import {
 SANDBOX_SCENARIOS,
 SANDBOX_PHENOMENA,
 SANDBOX_EGGS,
 computeEraTag,
 applySandboxScenario
} from './sandbox-scenarios.js';

const NOISE_GLSL = `
float hash3(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){
 vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(
  mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),
  f.z);
}
float fbm3(vec3 p){
 float v=0.,a=.5;
 for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(11.7,5.3,7.9);a*=.5;}
 return v;
}
`;

const PLANET_MASSES = Object.freeze({
 jixi: 0.038,
 mingai: 0.11,
 lingxi: 0.068,
 suxian: 0.145,
 xunqi: 0.058,
 qitang: 0.074
});

const MU_STAR_BASE = 920;
const STAR_MASS = 6.1;
const STAR_RADIUS = 5.1;
const DEFAULT_ORBIT_SPREAD = 2.0;
const MAX_DEBRIS = 4200;
const TRAIL_LEN = 110;
const MAX_SHOCKS = 20;
const PREVIEW_STEPS = 72;
const MAX_ALIVE_BODIES = 48;
const ARENA_LIMIT = 680;

function isLightKind(kind) {
 return kind === 'planet' || kind === 'moon' || kind === 'comet' || kind === 'probe';
}
function isCompactKind(kind) {
 return kind === 'bh' || kind === 'neutron' || kind === 'white-dwarf';
}
function isGravitatingKind(kind) {
 return kind === 'bh' || kind === 'star' || kind === 'neutron' || kind === 'white-dwarf' || kind === 'planet';
}
function speedToSlider(speed) {
 if (speed <= 0) return 0;
 const clamped = Math.max(0.05, Math.min(100, speed));
 return (Math.log(clamped / 0.05) / Math.log(2000)) * 100;
}
function sliderToSpeed(val) {
 const v = Math.max(0, Math.min(100, Number(val) || 0));
 const raw = 0.05 * Math.pow(2000, v / 100);
 if (raw < 0.2) return +raw.toFixed(2);
 if (raw < 2) return +raw.toFixed(2);
 if (raw < 10) return +raw.toFixed(1);
 return Math.round(raw);
}
function formatSpeedMult(spd) {
 if (spd <= 0) return '暂停';
 if (spd < 0.2) return `${spd.toFixed(2)}×`;
 if (spd < 2) return `${Number(spd.toFixed(2))}×`;
 if (spd < 10) return `${spd.toFixed(1)}×`;
 return `${Math.round(spd)}×`;
}

function makeRand(seed) {
 let s = seed | 0;
 return () => {
  s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}

function lookTone(LOOK) {
 if (LOOK?.diagram) {
  return {
   grid: [0.42, 0.78, 0.98],
   accent: [0.85, 0.94, 1.0],
   roche: 0x7ac4ee,
   bary: 0x9cd8ff
  };
 }
 if (/nebula/.test(LOOK?.sky || '')) {
  return {
   grid: [0.70, 0.56, 0.96],
   accent: [0.95, 0.80, 0.98],
   roche: 0xd4a8ff,
   bary: 0xe6c8ff
  };
 }
 if (LOOK?.starTint && LOOK.starTint[2] < 0.95) {
  return {
   grid: [0.86, 0.72, 0.50],
   accent: [1.0, 0.86, 0.62],
   roche: 0xe6be84,
   bary: 0xf4d8a6
  };
 }
 return {
  grid: [0.54, 0.78, 0.96],
  accent: [0.96, 0.78, 0.54],
  roche: 0xe4b578,
  bary: 0x9fd0f0
 };
}

function kindLabel(e) {
 if (e.kind === 'bh') return '克尔黑洞';
 if (e.kind === 'star') return e.subType === 'star-red' ? '红巨星' : '主序蓝星';
 if (e.kind === 'white-dwarf') return '致密白矮星';
 if (e.kind === 'neutron') return '磁化脉冲星';
 if (e.kind === 'probe') return '弹弓探测器';
 if (e.kind === 'moon') return '冰质卫星';
 if (e.kind === 'comet') return '冰核彗星';
 if (e.subType === 'brown-dwarf') return '暗红褐矮星';
 return e.isGasOrIce ? '气态巨行星' : '岩质行星';
}

export function createCosmicSandbox({
 THREE,
 scene,
 camera,
 renderer,
 controls,
 bodies = [],
 blackHole = null,
 star = null,
 corona = null,
 halo = null,
 lightPosition = null,
 belt = null,
 dust = null,
 LOOK,
 hdrBoost,
 singularityDef,
 onEvent = () => {},
 onEnter = () => {},
 onExit = () => {}
}) {
 const tone = lookTone(LOOK);
 const rand = makeRand(4099);
 const bodyFactory = createSandboxBodyFactory({ THREE, lightPosition, hdrBoost, LOOK });

 const root = new THREE.Group();
 root.name = 'Cosmic Sandbox';
 root.visible = false;
 scene.add(root);

 const dynamicGroup = new THREE.Group();
 dynamicGroup.name = 'Sandbox dynamic bodies';
 root.add(dynamicGroup);

 // Saved baselines for pristine restoration on exit.
 const baseStarScale = star ? star.scale.clone() : new THREE.Vector3(5.1, 4.85, 5.1);
 const baseCoronaScale = corona ? corona.scale.clone() : new THREE.Vector3(5.75, 5.75, 5.75);
 const baseBhRadius = singularityDef?.radius || 2.1;
 const baseBhMass = singularityDef?.massSolar || 12.4;

 // Configuration state
 const config = {
  tool: 'orbit', // 'orbit' | 'spawn' | 'grab'
  spawnType: 'moon-ice',
  spawnMode: 'orbit', // 'stationary' | 'orbit' | 'slingshot'
  spawnRetrograde: false,
  spawnY: 0,
  scenario: 'default',
  showScenarios: false,
  showLaws: false,
  timeScale: 1,
  bhMass: baseBhMass,
  gravityScale: 1,
  planetGravityBoost: 3.0,
  orbitSpread: DEFAULT_ORBIT_SPREAD,
  drag: 0,
  collisionMode: 'realistic', // 'realistic' | 'accrete' | 'elastic'
  allowBreakup: true,
  overlays: false,
  autoBulletTime: true
 };

 let savedSnapshot = null;

 const unlockedEggs = new Set();
 let voidPrompted = false;
 let threeBodyActive = false;

 let active = false;
 let simTime = 0;
 let simAge = 0;
 let bulletTimer = 0;
 let bulletDuration = 1.65;
 let bulletFloor = 0.18;
 let bloomSurge = 0;
 let rippleSurge = 0;
 let bannerTimer = 0;
 let lastSimTimeFromHost = 0;
 let spawnCounter = 0;
 const typeCounters = Object.create(null);

 // Camera freedom, WASD flight & Follow-cam state
 let savedControls = null;
 let followEntity = null;
 const followLastPos = new THREE.Vector3();
 let selectedEntity = null;
 let camAnim = null;
 const keysHeld = new Set();

 // Gravitational-wave metric ripple pulse (BH mergers / Kilonovae / Supernovae)
 const gwWave = {
  active: false,
  origin: new THREE.Vector3(),
  radius: 0,
  amp: 0,
  speed: 68
 };

 // Reusable scratch vectors
 const vA = new THREE.Vector3();
 const vB = new THREE.Vector3();
 const vC = new THREE.Vector3();
 const vD = new THREE.Vector3();
 const vUp = new THREE.Vector3(0, 1, 0);
 const qTmp = new THREE.Quaternion();
 const raycaster = new THREE.Raycaster();
 const pointerNDC = new THREE.Vector2();
 const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
 const planeHit = new THREE.Vector3();

 // ==========================================================================
 // 1. MULTI-WELL SPACETIME METRIC GRID + GRAVITATIONAL-WAVE RIPPLES
 // ==========================================================================
 const wellUniforms = [
  new THREE.Vector4(-64, 4, 22, baseBhMass),
  new THREE.Vector4(0, 0, 0, STAR_MASS),
  new THREE.Vector4(0, 0, 0, 0),
  new THREE.Vector4(0, 0, 0, 0)
 ];
 const gridUniforms = {
  uWells: { value: wellUniforms },
  uGwOrigin: { value: new THREE.Vector3() },
  uGwRadius: { value: 0 },
  uGwAmp: { value: 0 },
  uStrength: { value: 0 },
  uPhase: { value: 0 },
  uColor: { value: new THREE.Vector3(...tone.grid) },
  uAccent: { value: new THREE.Vector3(...tone.accent) },
  uHdr: hdrBoost
 };
 const gridGeo = new THREE.PlaneGeometry(760, 760, 148, 148);
 gridGeo.rotateX(-Math.PI / 2);
 const gridMat = new THREE.ShaderMaterial({
  uniforms: gridUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   uniform vec4 uWells[4];
   uniform vec3 uGwOrigin;
   uniform float uGwRadius,uGwAmp,uStrength,uPhase;
   varying vec2 vXZ;
   varying float vMaxWell,vMinDist,vGwGlow;
   void main(){
    vec3 pos=position;
    float drop=0.;
    float maxW=0.;
    float minD=999.;
    for(int i=0;i<4;i++){
     float m=uWells[i].w;
     if(m<=.05)continue;
     float d=length(pos.xz-uWells[i].xz);
     minD=min(minD,d);
     float mScale=clamp(m/12.4,.22,4.5);
     float w=1./(1.+pow(d/(14.2*pow(mScale,.34)),2.));
     drop+=w*(8.2+6.4*pow(mScale,.45));
     maxW=max(maxW,w*clamp(m/10.,.35,1.25));
    }
    float gwD=length(pos.xz-uGwOrigin.xz);
    float gwEnv=exp(-pow((gwD-uGwRadius)/18.,2.))*uGwAmp;
    float gwOsc=sin((gwD-uGwRadius)*.34)*gwEnv;
    pos.y+=(-min(drop,36.)+gwOsc*5.0)*uStrength;
    vXZ=pos.xz;vMaxWell=clamp(maxW,0.,1.25);vMinDist=minD;vGwGlow=gwEnv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec2 vXZ;
   varying float vMaxWell,vMinDist,vGwGlow;
   uniform float uStrength,uHdr;
   uniform vec3 uColor,uAccent;
   void main(){
    float radialFade=1.-smoothstep(255.,375.,length(vXZ));
    if(radialFade<=.002)discard;
    vec2 coord=vXZ/18.;
    vec2 fw=max(fwidth(coord),vec2(.001));
    vec2 g=abs(fract(coord-.5)-.5)/(fw*.9);
    float line=1.-min(min(g.x,g.y),1.);
    float clearCore=smoothstep(3.8,9.8,vMinDist);
    float vis=(.036+vMaxWell*.26+vGwGlow*.48)*radialFade*uStrength*clearCore;
    vec3 col=mix(uColor,uAccent,clamp(vMaxWell*.78,0.,1.));
    col=mix(col,vec3(.88,.76,1.),clamp(vGwGlow*.85,0.,1.))*mix(.88,1.18,uHdr);
    gl_FragColor=vec4(col,clamp(line*vis,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const metricGrid = new THREE.Mesh(gridGeo, gridMat);
 metricGrid.position.y = -7.8;
 metricGrid.renderOrder = 1;
 root.add(metricGrid);

 function triggerGravityWave(pos, amp = 1.0) {
  gwWave.active = true;
  gwWave.origin.copy(pos);
  gwWave.radius = 2;
  gwWave.amp = Math.max(gwWave.amp, amp);
 }

 // ==========================================================================
 // 2. REAL-GRAVITY DEBRIS PARTICLE POOL (4200 PARTICLES, 1 DRAW CALL)
 // ==========================================================================
 const dPos = new Float32Array(MAX_DEBRIS * 3);
 const dVel = new Float32Array(MAX_DEBRIS * 3);
 const dCol = new Float32Array(MAX_DEBRIS * 3);
 const dSize = new Float32Array(MAX_DEBRIS);
 const dHeat = new Float32Array(MAX_DEBRIS);
 const dLife = new Float32Array(MAX_DEBRIS);
 const dMaxLife = new Float32Array(MAX_DEBRIS);
 const dKind = new Uint8Array(MAX_DEBRIS); // 0 = lava/rock, 1 = plasma/cyan, 2 = kilonova violet
 let debrisCursor = 0;
 let activeDebrisCount = 0;

 const debrisGeo = new THREE.BufferGeometry();
 const dPosAttr = new THREE.BufferAttribute(dPos, 3);
 const dColAttr = new THREE.BufferAttribute(dCol, 3);
 const dSizeAttr = new THREE.BufferAttribute(dSize, 1);
 const dHeatAttr = new THREE.BufferAttribute(dHeat, 1);
 const dLifeAttr = new THREE.BufferAttribute(dLife, 1);
 debrisGeo.setAttribute('position', dPosAttr);
 debrisGeo.setAttribute('aColor', dColAttr);
 debrisGeo.setAttribute('aSize', dSizeAttr);
 debrisGeo.setAttribute('aHeat', dHeatAttr);
 debrisGeo.setAttribute('aLife', dLifeAttr);

 const debrisMat = new THREE.ShaderMaterial({
  uniforms: { uHdr: hdrBoost },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   attribute vec3 aColor;
   attribute float aSize,aHeat,aLife;
   varying vec3 vColor;
   varying float vHeat,vLife;
   void main(){
    vColor=aColor;vHeat=aHeat;vLife=aLife;
    if(aLife<=.001){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}
    vec4 mv=modelViewMatrix*vec4(position,1.);
    float sz=aSize*(1.+aHeat*.42)*310./max(-mv.z,24.);
    gl_PointSize=clamp(sz,1.15,7.4);
    gl_Position=projectionMatrix*mv;
   }`,
  fragmentShader: `
   precision highp float;
   varying vec3 vColor;
   varying float vHeat,vLife;
   uniform float uHdr;
   void main(){
    if(vLife<=.001)discard;
    float d=length(gl_PointCoord-.5);
    if(d>.5)discard;
    float core=exp(-d*d*26.);
    float soft=pow(1.-smoothstep(.04,.5,d),2.6);
    vec3 ember=vec3(.96,.30,.06);
    vec3 gold=vec3(1.,.74,.32);
    vec3 hotCore=vec3(1.,.95,.84);
    vec3 hotLava=mix(ember,gold,smoothstep(.25,.75,vHeat));
    hotLava=mix(hotLava,hotCore,smoothstep(.76,1.0,vHeat)*core);
    // Preserve custom hue (blue supernova plasma / violet kilonova) while keeping glowing core
    vec3 col=mix(vColor,mix(vColor*1.35,hotLava,.62),clamp(vHeat*.82,0.,1.));
    col*=mix(.86,1.18,uHdr)*(1.+core*.35);
    float fade=smoothstep(0.,.18,vLife);
    gl_FragColor=vec4(col,clamp((soft*.42+core*.28)*fade,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const debrisPoints = new THREE.Points(debrisGeo, debrisMat);
 debrisPoints.name = 'Sandbox gravity debris';
 debrisPoints.frustumCulled = false;
 debrisPoints.renderOrder = 4;
 root.add(debrisPoints);

 function spawnDebris(x, y, z, vx, vy, vz, r, g, b, size, heat, maxLife, kind = 0) {
  const i = debrisCursor;
  debrisCursor = (debrisCursor + 1) % MAX_DEBRIS;
  const i3 = i * 3;
  dPos[i3] = x; dPos[i3 + 1] = y; dPos[i3 + 2] = z;
  dVel[i3] = vx; dVel[i3 + 1] = vy; dVel[i3 + 2] = vz;
  dCol[i3] = r; dCol[i3 + 1] = g; dCol[i3 + 2] = b;
  dSize[i] = size;
  dHeat[i] = heat;
  dLife[i] = 1.0;
  dMaxLife[i] = maxLife;
  dKind[i] = kind;
 }

 function clearDebris() {
  dLife.fill(0);
  dHeat.fill(0);
  dLifeAttr.needsUpdate = true;
  activeDebrisCount = 0;
 }

 // ==========================================================================
 // 3. SHOCKWAVE RINGS & VOLUMETRIC IMPACT / SUPERNOVA FLASHES (POOLED)
 // ==========================================================================
 const shocks = [];
 const shockRingGeo = new THREE.RingGeometry(0.58, 1.0, 96);
 const flashPlaneGeo = new THREE.PlaneGeometry(1, 1);

 for (let i = 0; i < MAX_SHOCKS; i++) {
  const ringUniforms = {
   uAge: { value: 0 },
   uFade: { value: 0 },
   uColorA: { value: new THREE.Vector3(1, 0.92, 0.78) },
   uColorB: { value: new THREE.Vector3(1, 0.45, 0.16) },
   uHdr: hdrBoost
  };
  const ringMat = new THREE.ShaderMaterial({
   uniforms: ringUniforms,
   transparent: true,
   depthWrite: false,
   side: THREE.DoubleSide,
   blending: THREE.AdditiveBlending,
   vertexShader: `varying vec2 vPos;void main(){vPos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader: `
    precision highp float;
    varying vec2 vPos;
    uniform float uAge,uFade,uHdr;
    uniform vec3 uColorA,uColorB;
    void main(){
     float r=length(vPos);
     float crest=exp(-pow((r-.88)*15.,2.));
     float inner=smoothstep(.58,.88,r)*exp(-max(.88-r,0.)*6.5)*.48;
     float ang=atan(vPos.y,vPos.x);
     float wisps=.78+.22*sin(ang*10.+uAge*2.8)*cos(ang*6.-uAge*1.9);
     vec3 col=mix(uColorB,uColorA,crest)*mix(.88,1.24,uHdr);
     gl_FragColor=vec4(col,clamp((crest+inner)*wisps*uFade*.78,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const ring = new THREE.Mesh(shockRingGeo, ringMat);
  ring.visible = false;
  ring.renderOrder = 5;
  root.add(ring);

  const flashUniforms = {
   uFade: { value: 0 },
   uColor: { value: new THREE.Vector3(1, 0.9, 0.72) },
   uHdr: hdrBoost
  };
  const flashMat = new THREE.ShaderMaterial({
   uniforms: flashUniforms,
   transparent: true,
   depthWrite: false,
   blending: THREE.AdditiveBlending,
   vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uFade,uHdr;
    uniform vec3 uColor;
    void main(){
     vec2 p=(vUv-.5)*2.;
     float r=length(p);
     if(r>1.)discard;
     float core=exp(-r*r*18.);
     float halo=exp(-r*4.2)*.55;
     float sx=exp(-abs(p.y)*56.)*exp(-abs(p.x)*3.5)*.45;
     float sy=exp(-abs(p.x)*56.)*exp(-abs(p.y)*3.5)*.45;
     float a=(core+halo+sx+sy)*uFade*(1.-smoothstep(.76,1.,r))*.52;
     vec3 col=mix(uColor,vec3(1.),core*.45)*mix(.88,1.15,uHdr);
     gl_FragColor=vec4(col,clamp(a,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const flash = new THREE.Mesh(flashPlaneGeo, flashMat);
  flash.visible = false;
  flash.renderOrder = 6;
  root.add(flash);

  shocks.push({
   active: false,
   age: 0,
   dur: 2.4,
   maxRadius: 18,
   flashSize: 16,
   ring,
   ringUniforms,
   flash,
   flashUniforms
  });
 }

 let shockCursor = 0;
 function spawnShockwave(pos, {
  maxRadius = 20,
  flashSize = 18,
  dur = 2.4,
  colorA = [1.0, 0.94, 0.80],
  colorB = [1.0, 0.44, 0.14],
  tiltX = Math.PI * 0.5,
  tiltZ = 0
 } = {}) {
  const s = shocks[shockCursor];
  shockCursor = (shockCursor + 1) % MAX_SHOCKS;
  s.active = true;
  s.age = 0;
  s.dur = dur;
  s.maxRadius = maxRadius;
  s.flashSize = flashSize;
  s.ring.position.copy(pos);
  s.ring.rotation.set(tiltX + (rand() - 0.5) * 0.3, 0, tiltZ + (rand() - 0.5) * 0.3);
  s.ring.scale.setScalar(1);
  s.ring.visible = true;
  s.ringUniforms.uColorA.value.set(...colorA);
  s.ringUniforms.uColorB.value.set(...colorB);
  s.flash.position.copy(pos);
  s.flash.scale.setScalar(flashSize);
  s.flash.visible = true;
  s.flashUniforms.uColor.value.set(...colorA);
 }

 // ==========================================================================
 // 4. DYNAMIC STELLAR ROCHE-LOBE PLASMA BRIDGE (CLOSEST STAR -> BH)
 // ==========================================================================
 const veilSegs = 56;
 const veilPos = new Float32Array((veilSegs + 1) * 2 * 3);
 const veilUv = new Float32Array((veilSegs + 1) * 2 * 2);
 const veilIdx = [];
 for (let i = 0; i <= veilSegs; i++) {
  const u = i / veilSegs;
  veilUv[i * 4] = u; veilUv[i * 4 + 1] = 0;
  veilUv[i * 4 + 2] = u; veilUv[i * 4 + 3] = 1;
  if (i < veilSegs) {
   const k = i * 2;
   veilIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
 }
 const veilGeo = new THREE.BufferGeometry();
 veilGeo.setAttribute('position', new THREE.BufferAttribute(veilPos, 3));
 veilGeo.setAttribute('uv', new THREE.BufferAttribute(veilUv, 2));
 veilGeo.setIndex(veilIdx);
 const veilUniforms = { uAge: { value: 0 }, uStrength: { value: 0 }, uHdr: hdrBoost };
 const veilMat = new THREE.ShaderMaterial({
  uniforms: veilUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
   precision highp float;
   varying vec2 vUv;
   uniform float uAge,uStrength,uHdr;
   ${NOISE_GLSL}
   void main(){
    float across=abs(vUv.y-.5)*2.;
    float core=exp(-across*across*6.2);
    float wisps=fbm3(vec3(vUv.x*8.5-uAge*1.8,vUv.y*3.6,uAge*.32));
    float strands=smoothstep(.24,.84,wisps);
    float env=smoothstep(0.,.10,vUv.x)*(1.-smoothstep(.88,1.,vUv.x));
    vec3 col=mix(vec3(.52,.80,1.),vec3(.96,.94,.88),smoothstep(.08,.50,vUv.x));
    col=mix(col,vec3(.98,.64,.32),smoothstep(.48,.94,vUv.x));
    float alpha=core*(.40+.60*strands)*env*uStrength*.62;
    gl_FragColor=vec4(col*mix(.88,1.26,uHdr),clamp(alpha,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const rocheVeil = new THREE.Mesh(veilGeo, veilMat);
 rocheVeil.frustumCulled = false;
 rocheVeil.visible = false;
 rocheVeil.renderOrder = 3;
 root.add(rocheVeil);

 // ==========================================================================
 // 5. ORIGINAL PLANET MOLTEN/TIDAL CRUST SHELLS & TRAILS
 // ==========================================================================
 const crustSphereGeo = new THREE.SphereGeometry(1, 40, 28);
 function createCrustShell(isGasOrIce) {
  const uniforms = {
   uTime: { value: 0 },
   uHeat: { value: 0 },
   uTidal: { value: 0 },
   uFrost: { value: 0 },
   uSpinGlow: { value: 0 },
   uImpactDir: { value: new THREE.Vector3(1, 0, 0) },
   uIsGas: { value: isGasOrIce ? 1 : 0 },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   transparent: true,
   depthWrite: false,
   blending: THREE.AdditiveBlending,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=normalize(position);
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uTime,uHeat,uTidal,uFrost,uSpinGlow,uIsGas,uHdr;
    uniform vec3 uImpactDir;
    ${NOISE_GLSL}
    void main(){
     float energy=max(max(uHeat,uTidal),max(uFrost*.65,uSpinGlow));
     if(energy<=.005)discard;
     vec3 p=normalize(vLocal);
     float n1=fbm3(p*3.8+vec3(0.,uTime*.08,0.));
     float r1=1.-abs(noise3(p*6.4+vec3(n1*1.8,uTime*.12,-uTime*.06))*2.-1.);
     float r2=1.-abs(noise3(p*12.5-vec3(uTime*.09,n1*1.5,0.))*2.-1.);
     float cracks=pow(r1,4.6)*.85+pow(r2,5.8)*.55;
     float hemi=smoothstep(-.28,.92,dot(p,normalize(uImpactDir)));
     float crater=smoothstep(.65,.98,dot(p,normalize(uImpactDir)))*uHeat;
     float impactMask=(cracks*(.35+.85*hemi)+crater*.95)*uHeat;
     vec3 V=normalize(cameraPosition-vWorld);
     float limb=pow(1.-abs(dot(normalize(vNormal),V)),2.4);
     float tidalMask=(cracks*.78+limb*.72)*uTidal;
     float eqBand=exp(-pow(p.y*5.2,2.))*(.55+.45*r1)*uSpinGlow;
     float frostMask=(limb*.82+pow(max(n1,0.),2.2)*.38)*uFrost;
     float hotTotal=clamp(impactMask+tidalMask+eqBand*.95,0.,1.5);
     vec3 lavaCol=mix(vec3(.92,.24,.04),vec3(1.,.74,.26),smoothstep(.15,.72,hotTotal));
     lavaCol=mix(lavaCol,vec3(1.,.96,.88),smoothstep(.68,1.25,hotTotal));
     vec3 gasCol=mix(vec3(.38,.78,1.),vec3(1.,.84,.58),smoothstep(.25,.95,hotTotal));
     vec3 hotCol=mix(lavaCol,gasCol,uIsGas*(uTidal/(max(uHeat,uTidal)+.001)));
     vec3 frostCol=vec3(.58,.86,1.);
     vec3 col=(hotCol*hotTotal+frostCol*frostMask*.65)/(max(hotTotal+frostMask*.65,.001))*mix(.92,1.48,uHdr);
     float alpha=clamp(hotTotal*.92+frostMask*.42,0.,1.);
     gl_FragColor=vec4(col,alpha);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const mesh = new THREE.Mesh(crustSphereGeo, mat);
  mesh.visible = false;
  mesh.renderOrder = 3;
  return { mesh, uniforms };
 }

 function createTrailLine(colorHex, parentGroup) {
  const posArr = new Float32Array(TRAIL_LEN * 3);
  const colArr = new Float32Array(TRAIL_LEN * 3);
  const c = new THREE.Color(colorHex || '#9ec6e4');
  for (let i = 0; i < TRAIL_LEN; i++) {
   const fade = Math.pow(i / (TRAIL_LEN - 1), 1.65);
   colArr[i * 3] = c.r * fade;
   colArr[i * 3 + 1] = c.g * fade;
   colArr[i * 3 + 2] = c.b * fade;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const mat = new THREE.LineBasicMaterial({
   vertexColors: true,
   transparent: true,
   opacity: 0.68,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  parentGroup.add(line);
  return line;
 }

 const planetVisuals = bodies.map(b => {
  const isGas = b.def.kind === 1 || b.def.kind === 4;
  const crust = createCrustShell(isGas);
  (b.tilt || b.root).add(crust.mesh);
  const trail = createTrailLine(b.def.color || '#9ec6e4', root);
  return { body: b, crust, trail, history: [], baseRadius: b.def.radius };
 });

 // ==========================================================================
 // 6. OPTIONAL PHYSICS OVERLAYS (ROCHE LIMIT, BARYCENTER, VELOCITY ARROWS)
 // ==========================================================================
 const overlaysGroup = new THREE.Group();
 overlaysGroup.name = 'Sandbox physics overlays';
 overlaysGroup.visible = false;
 root.add(overlaysGroup);

 const rocheRingPts = [];
 for (let i = 0; i < 96; i++) {
  if (i % 2 === 1) continue;
  const a0 = (i / 96) * Math.PI * 2;
  const a1 = ((i + 0.62) / 96) * Math.PI * 2;
  rocheRingPts.push(Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1));
 }
 const rocheLimitRing = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rocheRingPts, 3)),
  new THREE.LineBasicMaterial({ color: tone.roche, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 overlaysGroup.add(rocheLimitRing);

 const innerRingPts = [];
 for (let i = 0; i <= 72; i++) {
  const a = (i / 72) * Math.PI * 2;
  innerRingPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
 }
 const captureRing = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(innerRingPts),
  new THREE.LineBasicMaterial({ color: 0xf07a52, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 overlaysGroup.add(captureRing);

 const baryLinkGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
 const baryLink = new THREE.Line(
  baryLinkGeo,
  new THREE.LineBasicMaterial({ color: tone.bary, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 overlaysGroup.add(baryLink);

 const baryReticle = new THREE.Group();
 const crossPts = [-2.2, 0, 0, 2.2, 0, 0, 0, 0, -2.2, 0, 0, 2.2, 0, -1.6, 0, 0, 1.6, 0];
 baryReticle.add(new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(crossPts, 3)),
  new THREE.LineBasicMaterial({ color: tone.bary, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
 ));
 const baryCirclePts = [];
 for (let i = 0; i <= 36; i++) {
  const a = (i / 36) * Math.PI * 2;
  baryCirclePts.push(new THREE.Vector3(Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45));
 }
 baryReticle.add(new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(baryCirclePts),
  new THREE.LineBasicMaterial({ color: tone.bary, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending })
 ));
 overlaysGroup.add(baryReticle);

 // Pooled velocity arrows (up to 24 alive non-static entities)
 const MAX_ARROWS = 24;
 const velArrows = [];
 for (let i = 0; i < MAX_ARROWS; i++) {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  const line = new THREE.LineSegments(
   geo,
   new THREE.LineBasicMaterial({ color: 0x9ec6e4, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  line.visible = false;
  line.frustumCulled = false;
  overlaysGroup.add(line);
  velArrows.push(line);
 }

 // ==========================================================================
 // 7. INTERACTIVE SELECTION, SLINGSHOT SPAWN GHOST & 72-STEP TRAJECTORY PREVIEW
 // ==========================================================================
 const guidesGroup = new THREE.Group();
 guidesGroup.name = 'Sandbox interactive guides';
 root.add(guidesGroup);

 const circlePts = [];
 for (let i = 0; i <= 64; i++) {
  const a = (i / 64) * Math.PI * 2;
  circlePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
 }
 const hoverRing = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(circlePts),
  new THREE.LineBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 hoverRing.visible = false;
 guidesGroup.add(hoverRing);

 const selectRing = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(circlePts),
  new THREE.LineBasicMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 selectRing.visible = false;
 guidesGroup.add(selectRing);

 // Spawn ghost ring + vertical elevation drop stem to Y = 0
 const spawnGhostRing = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(circlePts),
  new THREE.LineBasicMaterial({ color: 0x7efae0, transparent: true, opacity: 0.78, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 spawnGhostRing.visible = false;
 guidesGroup.add(spawnGhostRing);

 const spawnStemGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
 const spawnStem = new THREE.Line(
  spawnStemGeo,
  new THREE.LineBasicMaterial({ color: 0x7efae0, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 spawnStem.visible = false;
 guidesGroup.add(spawnStem);

 // Slingshot elastic aim vector (arrow from spawn/drag point along launch velocity)
 const aimArrowGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
 const aimArrow = new THREE.LineSegments(
  aimArrowGeo,
  new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 aimArrow.visible = false;
 aimArrow.frustumCulled = false;
 guidesGroup.add(aimArrow);

 // 72-step real N-body gravity-bent predicted trajectory
 const previewPos = new Float32Array(PREVIEW_STEPS * 3);
 const previewCol = new Float32Array(PREVIEW_STEPS * 3);
 const previewGeo = new THREE.BufferGeometry();
 previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPos, 3));
 previewGeo.setAttribute('color', new THREE.BufferAttribute(previewCol, 3));
 const previewLine = new THREE.Line(
  previewGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.90, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 previewLine.visible = false;
 previewLine.frustumCulled = false;
 guidesGroup.add(previewLine);

 // ==========================================================================
 // 8. SIMULATION DATA & PHYSICS HELPERS
 // ==========================================================================
 let sim = null;
 const stats = {
  disrupted: 0,
  stellarTdes: 0,
  impacts: 0,
  mergers: 0,
  shatters: 0,
  vaporized: 0,
  supernovae: 0,
  typeIaSupernovae: 0,
  starMergers: 0,
  bhMergers: 0,
  kilonovae: 0,
  collapses: 0,
  slingshots: 0,
  bigBangs: 0,
  spinBreakups: 0,
  elasticBounces: 0,
  spawned: 0,
  lastEvent: '',
  lastEnergy1e32J: 0
 };

 function escapeVelocityFor(e) {
  if (!e) return 0;
  const G = Math.abs(gUnit());
  return Math.sqrt((2 * G * Math.max(e.mass, 1e-4)) / Math.max(e.radius, 0.25));
 }

 function criticalSpinFor(e) {
  if (!e || e.kind === 'bh' || e.kind === 'probe') return Infinity;
  const G = Math.abs(gUnit());
  const r = Math.max(e.radius, 0.45);
  const base = Math.sqrt((G * Math.max(e.mass, 0.002)) / (r * r * r));
  if (e.kind === 'neutron') return Math.max(18, base * 1.4);
  if (e.kind === 'white-dwarf') return base * 1.35;
  return Math.max(0.25, base);
 }

 function defaultSpinFor(kind, subType) {
  if (kind === 'bh' || kind === 'probe') return 0;
  if (kind === 'neutron') return 3.6;
  if (kind === 'white-dwarf') return 0.9;
  if (kind === 'star') return 0.14;
  if (kind === 'moon') return 0.18;
  if (kind === 'comet') return 0.26;
  if (subType === 'brown-dwarf') return 0.42;
  if (subType === 'gas') return 0.36;
  return 0.22;
 }

 function equilibriumTempAt(pos, exclude = null) {
  if (!sim) return 260;
  let flux = 0;
  for (const st of sim.entities) {
   if (!st.alive || st === exclude) continue;
   if (st.kind !== 'star' && st.kind !== 'white-dwarf') continue;
   const d = Math.max(pos.distanceTo(st.pos), st.radius + 2.5);
   const lum = st.kind === 'white-dwarf' ? 0.35 : (st.mass / STAR_MASS);
   flux += lum * (3400 / (d * d));
  }
  if (flux <= 1e-4) return 45;
  return THREE.MathUtils.clamp(Math.round(285 * Math.pow(flux, 0.25)), 40, 4200);
 }

 function pairGravityMult(kindA, kindB) {
  return (isLightKind(kindA) && isLightKind(kindB)) ? config.planetGravityBoost : 1.0;
 }

 // Exact continuous closest approach between moving segments a0->a1 and b0->b1
 function segmentMinDistSq(a0, a1, b0, b1) {
  const rx = a0.x - b0.x, ry = a0.y - b0.y, rz = a0.z - b0.z;
  const vx = (a1.x - a0.x) - (b1.x - b0.x);
  const vy = (a1.y - a0.y) - (b1.y - b0.y);
  const vz = (a1.z - a0.z) - (b1.z - b0.z);
  const vv = vx * vx + vy * vy + vz * vz;
  let t = 0;
  if (vv > 1e-9) {
   t = -(rx * vx + ry * vy + rz * vz) / vv;
   if (t < 0) t = 0;
   else if (t > 1) t = 1;
  }
  const dx = rx + vx * t, dy = ry + vy * t, dz = rz + vz * t;
  return { d2: dx * dx + dy * dy + dz * dz, t };
 }

 function computeOrbitTelemetry(e) {
  if (!sim || !e || !e.alive) return null;
  if (e.pinned) {
   return { attr: null, speed: 0, vCirc: 0, vEscAttr: 0, ecc: 0, hillR: 0, rocheMargin: 100, label: '📌 空间锚定' };
  }
  const attr = dominantAttractorNear(e.pos, e, e.kind);
  const speed = e.vel.length();
  if (!attr) {
   return { attr: null, speed, vCirc: 0, vEscAttr: 0, ecc: 0, hillR: 0, rocheMargin: 100, label: speed < 0.25 ? '静止' : '自由漂流' };
  }
  const G = Math.abs(gUnit()) * pairGravityMult(e.kind, attr.kind);
  const mu = Math.max(G * (attr.mass + e.mass), 1e-4);
  const relPos = e.pos.clone().sub(attr.pos);
  const relVel = e.vel.clone().sub(attr.vel);
  const r = Math.max(relPos.length(), 1);
  const v2 = relVel.lengthSq();
  const vRel = Math.sqrt(v2);
  const vCirc = Math.sqrt(mu / r);
  const vEscAttr = Math.sqrt((2 * mu) / r);
  const hVec = relPos.clone().cross(relVel);
  const specE = 0.5 * v2 - mu / r;
  const eccSq = Math.max(0, 1 + (2 * specE * hVec.lengthSq()) / (mu * mu));
  const ecc = Math.min(9.9, Math.sqrt(eccSq));
  const hillR = r * Math.cbrt((e.mass * config.planetGravityBoost) / Math.max(3 * attr.mass, 0.03));
  let rocheR = 0;
  if (attr.kind === 'bh') rocheR = rocheRadiusFor(e.radius, attr.mass, attr.radius);
  else if (attr.kind === 'neutron') rocheR = Math.max(7.2, attr.radius * 4.5 + e.radius);
  const rocheMargin = rocheR > 0 ? Math.max(0, Math.round(((r - rocheR) / rocheR) * 100)) : 999;

  let label = '椭圆轨道';
  if (speed < 0.22 && vRel < 0.28) label = '静止';
  else if (ecc >= 0.99 || vRel >= vEscAttr * 0.99) label = '双曲线逃逸';
  else if (ecc <= 0.14) label = '近圆轨道';
  else if (ecc >= 0.65) label = '高偏心椭圆';
  return { attr, speed, vRel, vCirc, vEscAttr, ecc, hillR, rocheMargin, label };
 }

 function unlockEgg(id, customDetail = null, action = null) {
  const def = SANDBOX_EGGS.find(x => x.id === id);
  if (!def) return false;
  const first = !unlockedEggs.has(id);
  unlockedEggs.add(id);
  if (first || action) {
   showBanner(`★ 彩蛋 · ${def.title}`, customDetail || def.desc, 'egg', action);
   updateDockUI();
  }
  return first;
 }

 function bhVisualScale(massSolar = config.bhMass) {
  return THREE.MathUtils.clamp(Math.pow(Math.max(massSolar, 1) / baseBhMass, 0.35), 0.56, 2.45);
 }

 function rocheRadiusFor(planetRadius, bhMass = config.bhMass, bhRadiusOverride = null) {
  const bhR = bhRadiusOverride ?? (baseBhRadius * bhVisualScale(bhMass));
  return THREE.MathUtils.clamp(
   bhR * 4.55 * Math.pow(Math.max(bhMass, 1) / baseBhMass, 1 / 3) * Math.pow(Math.max(planetRadius, 0.8) / 2.8, 0.36),
   9.8,
   38.0
  );
 }

 function stellarRocheRadius(starRadius, bh) {
  return THREE.MathUtils.clamp(
   bh.radius * 4.35 * Math.cbrt(Math.max(bh.mass, 2) / baseBhMass) + starRadius * 1.4,
   13.5,
   42.0
  );
 }

 function gUnit() {
  return (MU_STAR_BASE / STAR_MASS) * config.gravityScale;
 }

 function triggerBulletTime(duration = 1.6, floor = 0.18) {
  if (!config.autoBulletTime || config.timeScale <= 0.25) return;
  bulletDuration = duration;
  bulletFloor = floor;
  bulletTimer = Math.max(bulletTimer, duration);
 }

 function announceEvent(title, detail, badge = 'event', energy1e32J = 0) {
  stats.lastEvent = `${title} · ${detail}`;
  if (energy1e32J > 0) stats.lastEnergy1e32J = energy1e32J;
  showBanner(title, detail, badge);
  onEvent({ title, detail, badge, energy1e32J });
  updateDockUI();
 }

 function applyBlastImpulse(origin, strength, maxDist = 115) {
  if (!sim) return;
  for (const e of sim.entities) {
   if (!e.alive || e.kind === 'bh') continue;
   vA.copy(e.pos).sub(origin);
   const d = vA.length();
   if (d < 1.5 || d > maxDist) continue;
   vA.divideScalar(d);
   const falloff = Math.pow(1 - d / maxDist, 1.5);
   const massRes = 1 / Math.pow(Math.max(e.mass, 0.08), 0.25);
   const dv = Math.min(26, strength * falloff * massRes);
   e.vel.addScaledVector(vA, dv);
  }
 }

 // Dynamic Labels container for spawned entities
 const dynamicLabelsEl = document.createElement('div');
 dynamicLabelsEl.id = 'sandbox-labels';
 dynamicLabelsEl.hidden = true;
 document.body.append(dynamicLabelsEl);

 function createDynamicLabel(entity) {
  const el = document.createElement('span');
  el.className = `sb-dyn-label sb-kind-${entity.kind}`;
  el.innerHTML = `${entity.name} <small></small>`;
  el.hidden = true;
  dynamicLabelsEl.append(el);
  return el;
 }

 function clearDynamicEntities() {
  if (!sim) {
   dynamicLabelsEl.replaceChildren();
   return;
  }
  for (const e of sim.entities) {
   if (e.isOriginal) continue;
   if (e.dynVisual) {
    dynamicGroup.remove(e.dynVisual.root);
    e.dynVisual.dispose();
    e.dynVisual = null;
   }
   if (e.trail) {
    dynamicGroup.remove(e.trail);
    e.trail.geometry.dispose();
    e.trail.material.dispose();
    e.trail = null;
   }
   if (e.labelEl) {
    e.labelEl.remove();
    e.labelEl = null;
   }
  }
  dynamicLabelsEl.replaceChildren();
 }

 function hideEntityVisual(e) {
  e.alive = false;
  if (selectedEntity === e) selectEntity(null);
  if (followEntity === e) followBody(null);
  if (drag.target === e) endDrag(false);

  if (e.isOriginal) {
   if (e.kind === 'planet' && e.body) {
    e.body.root.visible = false;
    e.visual.crust.mesh.visible = false;
    for (const m of e.body.moons) m.mesh.visible = false;
   } else if (e.id === 'yaoguang') {
    if (star) star.visible = false;
    if (corona) corona.visible = false;
    if (halo) halo.visible = false;
   } else if (e.id === (singularityDef?.id || 'guixu')) {
    if (blackHole) blackHole.root.visible = false;
   }
  } else {
   if (e.dynVisual) e.dynVisual.root.visible = false;
   if (e.labelEl) e.labelEl.hidden = true;
  }
 }

 function dominantAttractorNear(pos, exclude = null, subjectKind = 'planet') {
  if (!sim) return null;
  let best = null;
  let bestPull = -1;
  for (const e of sim.entities) {
   if (!e.alive || e === exclude) continue;
   if (!isGravitatingKind(e.kind)) continue;
   if (e.kind === 'planet' && e.mass < 0.03) continue;
   // Heavy stellar/compact subjects only lock onto heavy bodies unless none exist
   if (!isLightKind(subjectKind) && e.kind === 'planet') continue;
   const d = Math.max(pos.distanceTo(e.pos), e.radius + 1.5);
   const mult = pairGravityMult(subjectKind, e.kind);
   const pull = (e.mass * mult) / (d * d);
   if (pull > bestPull) {
    bestPull = pull;
    best = e;
   }
  }
  return best;
 }

 function circularVelocityAround(pos, attractor, subjectKind = 'planet', retrograde = false) {
  if (!attractor) return new THREE.Vector3();
  const G = Math.abs(gUnit()) * pairGravityMult(subjectKind, attractor.kind);
  const rel = pos.clone().sub(attractor.pos);
  const r = Math.max(rel.length(), attractor.radius * 1.85 + 2.2);
  const tang = new THREE.Vector3(-rel.z, 0, rel.x);
  if (tang.lengthSq() < 1e-4) tang.set(1, 0, 0);
  else tang.normalize();
  if (retrograde) tang.negate();
  const vMag = Math.sqrt((G * attractor.mass) / r);
  return tang.multiplyScalar(vMag).add(attractor.vel);
 }

 function nextNameFor(def, customName) {
  if (customName) return customName;
  typeCounters[def.id] = (typeCounters[def.id] || 0) + 1;
  return `${def.short} #${typeCounters[def.id]}`;
 }

 function enforceBodyCap() {
  if (!sim) return;
  const aliveDynamic = sim.entities.filter(e => !e.isOriginal && e.alive);
  if (aliveDynamic.length < MAX_ALIVE_BODIES) return;
  const victim = aliveDynamic.find(e => e.kind === 'comet' || e.kind === 'probe') || aliveDynamic[0];
  if (victim) hideEntityVisual(victim);
 }

 function spawnSingleEntity(typeId, posVec, velVec = null, opts = {}) {
  if (!sim) return null;
  const def = SPAWN_CATALOG.find(c => c.id === typeId) || SPAWN_CATALOG[0];
  enforceBodyCap();

  spawnCounter++;
  const seed = spawnCounter * 17 + 31;
  const radius = opts.radius ?? def.radius;
  const mass = opts.mass ?? def.mass;
  const dynVisual = bodyFactory.createVisual(def.id, seed, radius);
  dynVisual.root.position.copy(posVec);
  dynamicGroup.add(dynVisual.root);

  let vel;
  if (velVec) {
   vel = velVec.clone();
  } else if (opts.stationary) {
   vel = new THREE.Vector3(0, 0, 0);
  } else {
   const attr = dominantAttractorNear(posVec, null, def.kind);
   vel = circularVelocityAround(posVec, attr, def.kind, !!opts.retrograde);
  }

  const colorHex = opts.colorHex || dynVisual.colorHex || def.color;
  const trail = createTrailLine(colorHex, dynamicGroup);
  const initSpin = opts.spinRate ?? defaultSpinFor(def.kind, def.id);
  const initTemp = opts.temperature ?? (def.id === 'brown-dwarf' ? 1280 : isLightKind(def.kind) ? equilibriumTempAt(posVec) : 6000);
  const entity = {
   id: opts.id || `dyn-${def.id}-${spawnCounter}`,
   name: nextNameFor(def, opts.name),
   kind: def.kind,
   subType: def.id,
   isOriginal: false,
   isGasOrIce: !!def.isGasOrIce,
   color: new THREE.Color(colorHex),
   baseRadius: radius,
   radius,
   targetRadius: radius,
   mass,
   pos: posVec.clone(),
   prevPos: posVec.clone(),
   vel,
   acc: new THREE.Vector3(),
   accNext: new THREE.Vector3(),
   alive: true,
   status: 'intact',
   mergedCount: 0,
   tidalStress: 0,
   tidalDamage: 0,
   lavaHeat: 0,
   flare: opts.initialFlare || 0,
   spinRate: initSpin,
   spinAngle: rand() * Math.PI * 2,
   spinDamage: 0,
   oblateXZ: 1,
   oblateY: 1,
   temperature: initTemp,
   tempHold: 0,
   noBreakup: !!opts.noBreakup,
   pinned: !!opts.pinned,
   impactDir: new THREE.Vector3(1, 0, 0),
   trailFade: 1,
   dynVisual,
   trail,
   history: [posVec.clone()],
   labelEl: null,
   baseSpeed: vel.length(),
   peakSpeed: vel.length(),
   slingshotFlash: 0,
   slingshotAwarded: false
  };
  entity.labelEl = createDynamicLabel(entity);
  sim.entities.push(entity);
  if (entity.kind === 'planet' || entity.kind === 'moon' || entity.kind === 'comet') sim.planets.push(entity);
  stats.spawned++;
  computeAccelerations(sim.entities, true);
  return entity;
 }

 function spawnBody(typeId, posArr, velArr = null, opts = {}) {
  if (!active || !sim) return null;
  const def = SPAWN_CATALOG.find(c => c.id === typeId) || SPAWN_CATALOG[0];
  const basePos = Array.isArray(posArr)
   ? new THREE.Vector3(posArr[0], posArr[1], posArr[2])
   : posArr.clone();
  const baseVel = Array.isArray(velArr)
   ? new THREE.Vector3(velArr[0], velArr[1], velArr[2])
   : velArr ? velArr.clone() : null;

  if (def.cluster && !opts.single) {
   const spawned = [];
   const n = def.cluster;
   for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.5;
    const rad = i === 0 ? 0 : 2.6 + rand() * 3.8;
    const p = basePos.clone().add(new THREE.Vector3(Math.cos(ang) * rad, (rand() - 0.5) * 1.8, Math.sin(ang) * rad));
    let v;
    if (baseVel) v = baseVel.clone();
    else if (opts.stationary) v = new THREE.Vector3(0, 0, 0);
    else v = circularVelocityAround(p, dominantAttractorNear(p, null, def.kind), def.kind, !!opts.retrograde);
    if (!opts.stationary) {
     v.x += (rand() - 0.5) * 2.2;
     v.y += (rand() - 0.5) * 0.8;
     v.z += (rand() - 0.5) * 2.2;
    }
    spawned.push(spawnSingleEntity(def.id, p, v, { ...opts, single: true }));
   }
   if (!opts.silent) {
    showBanner('投放彗星簇', opts.stationary ? '5 颗冰核彗星已静止放置' : '5 颗冰核彗星已进入轨道', 'info');
   }
   updateDockUI();
   return spawned[0];
  }

  const ent = spawnSingleEntity(def.id, basePos, baseVel, opts);
  if (ent && !opts.silent) {
   const spdNote = ent.vel.length() < 0.05 ? '静止放置 (0 km/s)' : `初速 ${(ent.vel.length() * 6.5).toFixed(0)} km/s`;
   showBanner(`已创建 · ${ent.name}`, `${kindLabel(ent)} · ${spdNote}`, 'info');
  }
  updateDockUI();
  return ent;
 }

 function initSimulation(hostSimTime = lastSimTimeFromHost, spreadOverride = null) {
  clearDynamicEntities();
  clearDebris();
  for (const s of shocks) {
   s.active = false;
   s.ring.visible = false;
   s.flash.visible = false;
  }
  gwWave.active = false;
  gwWave.amp = 0;

  stats.disrupted = 0;
  stats.stellarTdes = 0;
  stats.impacts = 0;
  stats.mergers = 0;
  stats.shatters = 0;
  stats.vaporized = 0;
  stats.supernovae = 0;
  stats.typeIaSupernovae = 0;
  stats.starMergers = 0;
  stats.bhMergers = 0;
  stats.kilonovae = 0;
  stats.collapses = 0;
  stats.slingshots = 0;
  stats.spinBreakups = 0;
  stats.elasticBounces = 0;
  stats.spawned = 0;
  stats.lastEvent = '';
  stats.lastEnergy1e32J = 0;

  spawnCounter = 0;
  for (const k of Object.keys(typeCounters)) delete typeCounters[k];
  selectedEntity = null;
  followEntity = null;
  voidPrompted = false;
  threeBodyActive = false;
  bulletTimer = 0;
  bloomSurge = 0;
  rippleSurge = 0;
  simTime = 0;
  simAge = 0;

  const spread = spreadOverride ?? config.orbitSpread;
  const G = Math.abs(gUnit());
  const bhMass = config.bhMass;
  const bhScale = bhVisualScale(bhMass);
  const bhR = baseBhRadius * bhScale;

  if (star) star.visible = true;
  if (corona) corona.visible = true;
  if (halo) halo.visible = true;
  if (blackHole) blackHole.root.visible = true;

  // Wide calm binary placement so all 6 planets sit strictly inside Alkaid's Hill sphere
  const baseBhDir = new THREE.Vector3(-64, 4.2, 22).normalize();
  const bhDist = spread >= 1.35 ? Math.max(210, 145 * spread) : 67.8 * Math.max(0.85, spread);
  const bhPos = baseBhDir.multiplyScalar(bhDist);
  const starPos = new THREE.Vector3(0, 0, 0);
  const sep = bhPos.length();
  const totalBinMass = STAR_MASS + bhMass;
  const binEccFactor = spread >= 1.35 ? 0.98 : 0.68;
  const vBin = Math.sqrt((G * totalBinMass) / sep) * binEccFactor;
  const tangBH = new THREE.Vector3(-bhPos.z / sep, 0, bhPos.x / sep);

  const bhVel = tangBH.clone().multiplyScalar(vBin * (STAR_MASS / totalBinMass));
  const starVel = tangBH.clone().multiplyScalar(-vBin * (bhMass / totalBinMass));

  const starEntity = {
   id: 'yaoguang',
   name: '瑶光',
   kind: 'star',
   subType: 'star-blue',
   isOriginal: true,
   color: new THREE.Color('#a4d4ff'),
   mass: STAR_MASS,
   baseRadius: STAR_RADIUS,
   radius: STAR_RADIUS,
   targetRadius: STAR_RADIUS,
   pos: starPos,
   prevPos: starPos.clone(),
   vel: starVel,
   acc: new THREE.Vector3(),
   accNext: new THREE.Vector3(),
   alive: true,
   status: 'intact',
   tidalStress: 0,
   tidalDamage: 0,
   flare: 0,
   spinRate: 0.14,
   spinAngle: 0,
   spinDamage: 0,
   oblateXZ: 1,
   oblateY: 1,
   temperature: 15500,
   tempHold: 0,
   noBreakup: false,
   pinned: false,
   baseSpeed: starVel.length(),
   peakSpeed: starVel.length(),
   slingshotFlash: 0,
   slingshotAwarded: false
  };

  const bhEntity = {
   id: singularityDef?.id || 'guixu',
   name: singularityDef?.name || '归墟',
   kind: 'bh',
   subType: 'bh',
   isOriginal: true,
   color: new THREE.Color('#f2be7e'),
   mass: bhMass,
   baseRadius: baseBhRadius,
   radius: bhR,
   targetRadius: bhR,
   pos: bhPos,
   prevPos: bhPos.clone(),
   vel: bhVel,
   acc: new THREE.Vector3(),
   accNext: new THREE.Vector3(),
   alive: true,
   status: 'intact',
   flare: 0,
   spinRate: 0,
   spinAngle: 0,
   spinDamage: 0,
   oblateXZ: 1,
   oblateY: 1,
   temperature: 0,
   tempHold: 0,
   noBreakup: true,
   pinned: false,
   baseSpeed: bhVel.length(),
   peakSpeed: bhVel.length(),
   slingshotFlash: 0,
   slingshotAwarded: false
  };

  const planets = planetVisuals.map((pv, idx) => {
   const b = pv.body;
   const d = b.def;
   const a = d.phase + (hostSimTime / d.period) * Math.PI * 2;
   const orbR = d.orbit * spread;
   const pos = new THREE.Vector3(Math.cos(a) * orbR, 0, Math.sin(a) * orbR);
   const r = Math.max(pos.length(), 7);
   const tang = new THREE.Vector3(-pos.z / r, 0, pos.x / r);
   const vOrb = Math.sqrt((G * STAR_MASS) / r);
   const vel = tang.multiplyScalar(vOrb).add(starVel);

   b.root.visible = true;
   b.root.position.copy(pos);
   b.root.scale.set(1, 1, 1);
   b.root.quaternion.identity();
   b.surface.scale.setScalar(pv.baseRadius);
   if (b.clouds) b.clouds.scale.setScalar(pv.baseRadius * 1.012);
   if (b.atmosphere) {
    b.atmosphere.rotation.z = 0;
    b.atmosphere.scale.setScalar(pv.baseRadius * 1.06);
   }
   if (b.ring) {
    b.ring.visible = true;
    b.ring.scale.setScalar(1);
    b.ring.material.uniforms.uCenter.value.copy(pos);
   }
   for (const m of b.moons) m.mesh.visible = true;
   b.label.innerHTML = `${d.name} <small>${d.au.toFixed(2)} AU</small>`;

   pv.crust.mesh.visible = false;
   pv.crust.mesh.scale.setScalar(pv.baseRadius * 1.028);
   pv.crust.uniforms.uHeat.value = 0;
   pv.crust.uniforms.uTidal.value = 0;
   pv.crust.uniforms.uFrost.value = 0;
   pv.crust.uniforms.uSpinGlow.value = 0;
   pv.history = [pos.clone()];
   pv.trail.geometry.setDrawRange(0, 1);
   pv.trail.material.opacity = 0.68;

   const isGas = d.kind === 1 || d.kind === 4;
   const mass = PLANET_MASSES[d.id] || 0.08;
   const initT = THREE.MathUtils.clamp(Math.round(285 * Math.pow(3400 / Math.max(r * r, 25), 0.25)), 45, 2200);
   return {
    index: idx,
    id: d.id,
    name: d.name,
    kind: 'planet',
    subType: isGas ? 'gas' : 'rocky',
    isOriginal: true,
    visual: pv,
    body: b,
    isGasOrIce: isGas,
    color: new THREE.Color(d.color || '#9ec6e4'),
    baseRadius: pv.baseRadius,
    radius: pv.baseRadius,
    targetRadius: pv.baseRadius,
    mass,
    pos,
    prevPos: pos.clone(),
    vel,
    acc: new THREE.Vector3(),
    accNext: new THREE.Vector3(),
    alive: true,
    status: 'intact',
    mergedCount: 0,
    tidalStress: 0,
    tidalDamage: 0,
    lavaHeat: 0,
    spinRate: isGas ? 0.34 : 0.20,
    spinAngle: idx * 0.9,
    spinDamage: 0,
    oblateXZ: 1,
    oblateY: 1,
    temperature: initT,
    tempHold: 0,
    noBreakup: false,
    pinned: false,
    impactDir: new THREE.Vector3(1, 0, 0),
    trailFade: 1,
    baseSpeed: vel.length(),
    peakSpeed: vel.length(),
    slingshotFlash: 0,
    slingshotAwarded: false
   };
  });

  sim = {
   star: starEntity,
   bh: bhEntity,
   starInitPos: starPos.clone(),
   bhInitPos: bhPos.clone(),
   spreadUsed: spread,
   planets,
   entities: [starEntity, bhEntity, ...planets],
   barycenter: new THREE.Vector3(),
   baryVel: new THREE.Vector3(),
   barySpeed: 0
  };

  computeAccelerations(sim.entities, true);
  applyVisualPoses(0);
  updateInspectorUI();
  updateCamBarUI();
  updateDockUI();
 }

 function computeAccelerations(entities, useAcc = true) {
  const G = gUnit();
  for (let i = 0; i < entities.length; i++) {
   const e = entities[i];
   (useAcc ? e.acc : e.accNext).set(0, 0, 0);
  }
  for (let i = 0; i < entities.length; i++) {
   const a = entities[i];
   if (!a.alive) continue;
   const accA = useAcc ? a.acc : a.accNext;
   for (let j = i + 1; j < entities.length; j++) {
    const b = entities[j];
    if (!b.alive) continue;
    const accB = useAcc ? b.acc : b.accNext;

    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const dz = b.pos.z - a.pos.z;
    const r2 = dx * dx + dy * dy + dz * dz;

    const heavyPair = !isLightKind(a.kind) || !isLightKind(b.kind);
    const soft = heavyPair ? (a.radius + b.radius) * 0.28 + 0.95 : (a.radius + b.radius) * 0.20 + 0.28;
    const denom = Math.pow(r2 + soft * soft, 1.5);
    const pairG = G * pairGravityMult(a.kind, b.kind);
    const inv = pairG / denom;

    const r = Math.sqrt(r2);
    const cap = 125 / (r + 0.42);
    const fA = Math.sign(inv) * Math.min(Math.abs(inv * b.mass), cap);
    const fB = Math.sign(inv) * Math.min(Math.abs(inv * a.mass), cap);

    if (!a.pinned) {
     accA.x += dx * fA; accA.y += dy * fA; accA.z += dz * fA;
    }
    if (!b.pinned) {
     accB.x -= dx * fB; accB.y -= dy * fB; accB.z -= dz * fB;
    }
   }
  }
 }

 // ==========================================================================
 // 9. CATACLYSM HANDLERS: SUPERNOVA, STELLAR TDE, BH MERGER, KILONOVA,
 //    SELF-COLLAPSE, ROCHE TDE & PLANETARY GIANT IMPACTS
 // ==========================================================================
 function triggerSupernovaAt(pos, vel, {
  totalMass = 8.0,
  title = '极超新星大爆炸',
  detail = '恒星核心剧烈坍缩，激波横扫星系',
  spawnRemnant = true
 } = {}) {
  stats.supernovae++;

  // 1,050 multi-shell plasma ejecta: electric cyan outer ionization shell + molten gold core
  const count = 1050;
  for (let i = 0; i < count; i++) {
   const theta = rand() * Math.PI * 2;
   const u = rand() * 2 - 1;
   const s = Math.sqrt(Math.max(0, 1 - u * u));
   const dx = Math.cos(theta) * s;
   const dy = u;
   const dz = Math.sin(theta) * s;
   const outerShell = i < count * 0.58;
   const rOff = (outerShell ? 2.6 : 1.2) + rand() * 2.4;
   const spd = outerShell ? (14 + rand() * 18) : (5 + rand() * 11);
   const col = outerShell
    ? (rand() < 0.72 ? [0.48, 0.84, 1.0] : [0.85, 0.96, 1.0])
    : (rand() < 0.6 ? [1.0, 0.68, 0.24] : [1.0, 0.36, 0.14]);
   spawnDebris(
    pos.x + dx * rOff, pos.y + dy * rOff, pos.z + dz * rOff,
    vel.x + dx * spd, vel.y + dy * spd * 0.85, vel.z + dz * spd,
    col[0], col[1], col[2],
    1.5 + Math.pow(rand(), 1.4) * 3.1,
    0.72 + rand() * 0.28,
    24 + rand() * 22,
    outerShell ? 1 : 0
   );
  }

  // Triple layered shockwave shells (equatorial + two oblique ionization rings)
  spawnShockwave(pos, {
   maxRadius: 56, flashSize: 48, dur: 3.4,
   colorA: [0.86, 0.96, 1.0], colorB: [0.34, 0.72, 1.0],
   tiltX: Math.PI * 0.5, tiltZ: 0
  });
  spawnShockwave(pos, {
   maxRadius: 42, flashSize: 34, dur: 2.8,
   colorA: [1.0, 0.94, 0.78], colorB: [1.0, 0.48, 0.16],
   tiltX: Math.PI * 0.24, tiltZ: 0.6
  });
  spawnShockwave(pos, {
   maxRadius: 34, flashSize: 22, dur: 2.3,
   colorA: [0.76, 0.86, 1.0], colorB: [0.68, 0.42, 1.0],
   tiltX: Math.PI * 0.72, tiltZ: -0.5
  });

  // Real physical blast impulse pushing surrounding worlds outward!
  applyBlastImpulse(pos, 18.5, 130);
  triggerGravityWave(pos, 0.75);

  bloomSurge = Math.min(0.55, bloomSurge + 0.36);
  rippleSurge = Math.min(0.92, rippleSurge + 0.62);
  triggerBulletTime(1.9, 0.15);

  let remnantNote = '';
  if (spawnRemnant && sim) {
   if (totalMass >= 12.5) {
    const bhM = Math.max(5.5, +(totalMass * 0.48).toFixed(1));
    const rem = spawnSingleEntity('bh', pos, vel, {
     mass: bhM,
     radius: baseBhRadius * bhVisualScale(bhM),
     name: `新生黑洞 #${++typeCounters.remBh || (typeCounters.remBh = 1)}`,
     initialFlare: 1.5
    });
    if (rem) remnantNote = `，中心坍缩诞生 ${rem.name}（${bhM} M☉）`;
   } else {
    const rem = spawnSingleEntity('neutron', pos, vel, {
     mass: 2.4,
     radius: 1.35,
     name: `新生脉冲星 #${++typeCounters.remNs || (typeCounters.remNs = 1)}`,
     initialFlare: 1.4
    });
    if (rem) remnantNote = `，核心坍缩留下 ${rem.name}`;
   }
  }

  announceEvent(title, `${detail}${remnantNote}`, 'supernova', +(totalMass * 95).toFixed(1));
 }

 function handleStarStarCollision(a, b) {
  if (!a.alive || !b.alive || !sim) return;
  stats.impacts++;
  const totalMass = a.mass + b.mass;
  const relSpeed = a.vel.distanceTo(b.vel);
  const cmPos = a.pos.clone().multiplyScalar(a.mass).addScaledVector(b.pos, b.mass).divideScalar(totalMass);
  const cmVel = a.vel.clone().multiplyScalar(a.mass).addScaledVector(b.vel, b.mass).divideScalar(totalMass);

  if (relSpeed >= 9.5 || totalMass >= 13.5) {
   // Hypervelocity or super-Chandrasekhar collision -> Twin-Star Hypernova!
   hideEntityVisual(a);
   hideEntityVisual(b);
   a.status = 'supernova';
   b.status = 'supernova';
   triggerSupernovaAt(cmPos, cmVel, {
    totalMass,
    title: '双星对撞 · 极超新星爆发',
    detail: `${a.name} × ${b.name} 剧烈撞击引发核失控大爆炸`,
    spawnRemnant: true
   });
  } else {
   // Gentle merger -> Blazing Blue Straggler Star!
   stats.starMergers++;
   const survivor = (a.id === 'yaoguang' || (b.id !== 'yaoguang' && a.mass >= b.mass)) ? a : b;
   const absorbed = survivor === a ? b : a;
   hideEntityVisual(absorbed);
   absorbed.status = 'merged';

   survivor.pos.copy(cmPos);
   survivor.vel.copy(cmVel);
   survivor.mass = totalMass;
   survivor.targetRadius = Math.min(8.8, Math.cbrt(Math.pow(survivor.radius, 3) + Math.pow(absorbed.radius, 3)));
   survivor.flare = 1.6;

   for (let i = 0; i < 480; i++) {
    const theta = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
    const spd = 6 + rand() * 14;
    spawnDebris(
     cmPos.x + dx * survivor.radius, cmPos.y + dy * survivor.radius, cmPos.z + dz * survivor.radius,
     cmVel.x + dx * spd, cmVel.y + dy * spd * 0.7, cmVel.z + dz * spd,
     0.64, 0.88, 1.0, 1.4 + rand() * 2.4, 0.82 + rand() * 0.18, 18 + rand() * 16, 1
    );
   }
   spawnShockwave(cmPos, {
    maxRadius: 34, flashSize: 32, dur: 2.6,
    colorA: [0.85, 0.96, 1.0], colorB: [0.42, 0.74, 1.0]
   });
   bloomSurge = Math.min(0.48, bloomSurge + 0.28);
   triggerBulletTime(1.5, 0.2);
   announceEvent('双星合并 · 蓝离散巨星', `${survivor.name} 吞并 ${absorbed.name}（总质量 ${totalMass.toFixed(1)} M☉）`, 'stellar', +(totalMass * 32).toFixed(1));
  }
 }

 function handleStellarTDE(st, bh) {
  if (!st.alive || !bh.alive || !sim) return;
  stats.stellarTdes++;
  stats.disrupted++;
  hideEntityVisual(st);
  st.status = 'disrupted';

  const gained = st.mass * 0.65;
  const prevBhMass = bh.mass;
  bh.mass += gained;
  bh.vel.multiplyScalar(prevBhMass).addScaledVector(st.vel, gained).divideScalar(bh.mass);
  bh.targetRadius = baseBhRadius * bhVisualScale(bh.mass);
  if (bh.id === (singularityDef?.id || 'guixu')) {
   config.bhMass = bh.mass;
   syncBhMassSliderBounds();
  }

  vA.copy(bh.pos).sub(st.pos);
  const dist = Math.max(vA.length(), 2);
  vA.divideScalar(dist);
  vB.crossVectors(vA, vUp);
  if (vB.lengthSq() < 1e-4) vB.set(1, 0, 0);
  else vB.normalize();
  vC.crossVectors(vB, vA).normalize();

  const relVel = st.vel.clone().sub(bh.vel);
  const tangSign = relVel.dot(vB) >= 0 ? 1 : -1;
  const tangDir = vB.clone().multiplyScalar(tangSign);
  const vCirc = Math.sqrt((Math.abs(gUnit()) * bh.mass) / Math.max(dist, 9));

  // 950 blazing blue-white -> golden superheated stellar accretion spiral particles
  const count = 950;
  const stretchL = st.radius * 3.2;
  const isRed = st.subType === 'star-red';
  for (let i = 0; i < count; i++) {
   const along = (rand() * 2 - 1) * stretchL;
   const normAlong = along / stretchL;
   const ang = rand() * Math.PI * 2;
   const rad = Math.pow(rand(), 0.55) * st.radius * 0.78;
   const px = st.pos.x + vA.x * along + (tangDir.x * Math.cos(ang) + vC.x * Math.sin(ang)) * rad;
   const py = st.pos.y + vA.y * along + (vC.y * Math.sin(ang) + (rand() - 0.5) * 0.8) * rad * 0.7;
   const pz = st.pos.z + vA.z * along + (tangDir.z * Math.cos(ang) + vC.z * Math.sin(ang)) * rad;

   const orbitalV = vCirc * (0.74 + normAlong * 0.30 + (rand() - 0.5) * 0.16);
   const radialBias = normAlong * vCirc * 0.24;
   const scatter = 2.2;
   const vx = bh.vel.x + relVel.x * 0.32 + tangDir.x * orbitalV + vA.x * radialBias + (rand() - 0.5) * scatter;
   const vy = bh.vel.y + relVel.y * 0.32 + (rand() - 0.5) * scatter * 0.8;
   const vz = bh.vel.z + relVel.z * 0.32 + tangDir.z * orbitalV + vA.z * radialBias + (rand() - 0.5) * scatter;

   const col = isRed
    ? [1.0, 0.48 + rand() * 0.32, 0.16]
    : (normAlong > 0 ? [1.0, 0.78, 0.38] : [0.56, 0.86, 1.0]);
   spawnDebris(px, py, pz, vx, vy, vz, col[0], col[1], col[2], 1.5 + Math.pow(rand(), 1.4) * 3.0, 0.72 + rand() * 0.28, 30 + rand() * 24, 1);
  }

  spawnShockwave(st.pos, {
   maxRadius: 44, flashSize: 42, dur: 3.0,
   colorA: [0.92, 0.97, 1.0], colorB: [1.0, 0.58, 0.20]
  });
  spawnShockwave(bh.pos, {
   maxRadius: 34, flashSize: 28, dur: 2.5,
   colorA: [1.0, 0.90, 0.65], colorB: [0.95, 0.40, 0.14],
   tiltX: Math.PI * 0.22, tiltZ: 0.4
  });

  applyBlastImpulse(st.pos, 10.5, 95);
  triggerGravityWave(bh.pos, 0.68);
  bh.flare = 2.1;
  bloomSurge = Math.min(0.52, bloomSurge + 0.34);
  rippleSurge = Math.min(0.95, rippleSurge + 0.72);
  triggerBulletTime(1.9, 0.16);
  announceEvent('恒星潮汐撕裂 · 伽马暴', `${st.name} 被 ${bh.name} 彻底撕碎吞噬，黑洞质量跃升至 ${bh.mass.toFixed(1)} M☉`, 'supernova', +(st.mass * 80).toFixed(1));
 }

 function handleBlackHoleMerger(a, b) {
  if (!a.alive || !b.alive || !sim) return;
  stats.bhMergers++;
  stats.impacts++;

  const guixuId = singularityDef?.id || 'guixu';
  const survivor = (a.id === guixuId || (b.id !== guixuId && a.mass >= b.mass)) ? a : b;
  const absorbed = survivor === a ? b : a;
  const rawTotal = a.mass + b.mass;
  const radiatedMass = rawTotal * 0.05; // 5% mass-energy radiated as gravitational waves!
  const finalMass = rawTotal - radiatedMass;

  const cmPos = a.pos.clone().multiplyScalar(a.mass).addScaledVector(b.pos, b.mass).divideScalar(rawTotal);
  const cmVel = a.vel.clone().multiplyScalar(a.mass).addScaledVector(b.vel, b.mass).divideScalar(rawTotal);
  // Subtle relativistic gravitational-wave recoil kick
  cmVel.x += (rand() - 0.5) * 1.8;
  cmVel.z += (rand() - 0.5) * 1.8;

  hideEntityVisual(absorbed);
  absorbed.status = 'merged';

  survivor.pos.copy(cmPos);
  survivor.vel.copy(cmVel);
  survivor.mass = finalMass;
  survivor.targetRadius = baseBhRadius * bhVisualScale(finalMass);
  survivor.radius = survivor.targetRadius;
  survivor.flare = 2.2;

  if (survivor.id === guixuId) {
   config.bhMass = finalMass;
   syncBhMassSliderBounds();
  }

  // 540 relativistic photon-ring & violet-gold gravitational wave ejecta sparks
  for (let i = 0; i < 540; i++) {
   const ang = rand() * Math.PI * 2;
   const elev = (rand() - 0.5) * 0.7;
   const dx = Math.cos(ang) * Math.cos(elev), dy = Math.sin(elev), dz = Math.sin(ang) * Math.cos(elev);
   const spd = 8 + rand() * 19;
   const violet = i % 3 === 0;
   spawnDebris(
    cmPos.x + dx * survivor.radius * 2.2, cmPos.y + dy * survivor.radius * 2.2, cmPos.z + dz * survivor.radius * 2.2,
    cmVel.x + dx * spd, cmVel.y + dy * spd * 0.6, cmVel.z + dz * spd,
    violet ? 0.78 : 1.0, violet ? 0.62 : 0.80, violet ? 1.0 : 0.42,
    1.4 + rand() * 2.6, 0.78 + rand() * 0.22, 18 + rand() * 16, 2
   );
  }

  spawnShockwave(cmPos, {
   maxRadius: 64, flashSize: 40, dur: 3.4,
   colorA: [0.94, 0.86, 1.0], colorB: [0.58, 0.44, 1.0]
  });
  spawnShockwave(cmPos, {
   maxRadius: 46, flashSize: 32, dur: 2.6,
   colorA: [1.0, 0.90, 0.68], colorB: [0.96, 0.52, 0.22],
   tiltX: Math.PI * 0.34, tiltZ: 0.5
  });

  triggerGravityWave(cmPos, 1.15);
  bloomSurge = Math.min(0.50, bloomSurge + 0.32);
  rippleSurge = Math.min(1.0, rippleSurge + 0.88);
  triggerBulletTime(1.85, 0.16);
  announceEvent('双黑洞并合 · 引力波铃振', `${a.name} × ${b.name} 融为 ${finalMass.toFixed(1)} M☉ 巨型奇点（${radiatedMass.toFixed(1)} M☉ 化作时空涟漪）`, 'gw', +(radiatedMass * 180).toFixed(1));
 }

 function handleKilonova(a, b) {
  if (!a.alive || !b.alive || !sim) return;
  stats.kilonovae++;
  stats.impacts++;
  const totalMass = a.mass + b.mass;
  const cmPos = a.pos.clone().multiplyScalar(a.mass).addScaledVector(b.pos, b.mass).divideScalar(totalMass);
  const cmVel = a.vel.clone().multiplyScalar(a.mass).addScaledVector(b.vel, b.mass).divideScalar(totalMass);

  hideEntityVisual(a);
  hideEntityVisual(b);
  a.status = 'kilonova';
  b.status = 'kilonova';

  // 850 violet-magenta-gold r-process heavy-element ejecta
  for (let i = 0; i < 850; i++) {
   const theta = rand() * Math.PI * 2;
   const u = rand() * 2 - 1;
   const s = Math.sqrt(Math.max(0, 1 - u * u));
   const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
   const spd = 9 + rand() * 19;
   const gold = rand() < 0.42;
   spawnDebris(
    cmPos.x + dx * 2, cmPos.y + dy * 2, cmPos.z + dz * 2,
    cmVel.x + dx * spd, cmVel.y + dy * spd * 0.8, cmVel.z + dz * spd,
    gold ? 1.0 : 0.78, gold ? 0.78 : 0.44, gold ? 0.34 : 1.0,
    1.5 + rand() * 2.8, 0.80 + rand() * 0.20, 24 + rand() * 20, 2
   );
  }

  spawnShockwave(cmPos, {
   maxRadius: 52, flashSize: 44, dur: 3.1,
   colorA: [0.95, 0.82, 1.0], colorB: [0.66, 0.34, 1.0]
  });
  spawnShockwave(cmPos, {
   maxRadius: 36, flashSize: 30, dur: 2.4,
   colorA: [1.0, 0.88, 0.56], colorB: [0.96, 0.46, 0.28],
   tiltX: Math.PI * 0.25, tiltZ: 0.4
  });

  applyBlastImpulse(cmPos, 14, 105);
  triggerGravityWave(cmPos, 0.95);
  bloomSurge = Math.min(0.54, bloomSurge + 0.36);
  rippleSurge = Math.min(0.95, rippleSurge + 0.78);
  triggerBulletTime(1.85, 0.16);

  const bhM = Math.max(3.6, +(totalMass * 0.88).toFixed(1));
  const rem = spawnSingleEntity('bh', cmPos, cmVel, {
   mass: bhM,
   radius: baseBhRadius * bhVisualScale(bhM),
   name: `千新星黑洞 #${++typeCounters.remKn || (typeCounters.remKn = 1)}`,
   initialFlare: 1.7
  });
  announceEvent('千新星爆发 · Kilonova', `${a.name} × ${b.name} 紫金重元素爆闪，坍缩为 ${rem?.name || '新生黑洞'}`, 'gw', +(totalMass * 120).toFixed(1));
 }

 function handleNeutronBlackHole(ns, bh) {
  if (!ns.alive || !bh.alive || !sim) return;
  stats.impacts++;
  stats.disrupted++;
  hideEntityVisual(ns);
  ns.status = 'disrupted';

  const gain = ns.mass * 0.9;
  const prevM = bh.mass;
  bh.mass += gain;
  bh.vel.multiplyScalar(prevM).addScaledVector(ns.vel, gain).divideScalar(bh.mass);
  bh.targetRadius = baseBhRadius * bhVisualScale(bh.mass);
  if (bh.id === (singularityDef?.id || 'guixu')) {
   config.bhMass = bh.mass;
   syncBhMassSliderBounds();
  }

  for (let i = 0; i < 450; i++) {
   const ang = rand() * Math.PI * 2;
   const dx = Math.cos(ang), dy = (rand() - 0.5) * 0.6, dz = Math.sin(ang);
   const spd = 7 + rand() * 14;
   spawnDebris(
    ns.pos.x + dx * 2, ns.pos.y + dy * 2, ns.pos.z + dz * 2,
    bh.vel.x + dx * spd, bh.vel.y + dy * spd, bh.vel.z + dz * spd,
    0.58, 0.82, 1.0, 1.3 + rand() * 2.2, 0.85, 18 + rand() * 14, 1
   );
  }
  spawnShockwave(ns.pos, { maxRadius: 34, flashSize: 30, dur: 2.4, colorA: [0.80, 0.94, 1.0], colorB: [0.56, 0.42, 1.0] });
  triggerGravityWave(bh.pos, 0.72);
  bh.flare = 1.9;
  bloomSurge = Math.min(0.46, bloomSurge + 0.26);
  rippleSurge = Math.min(0.90, rippleSurge + 0.62);
  triggerBulletTime(1.5, 0.2);
  announceEvent('脉冲星坠入视界', `${ns.name} 被 ${bh.name} 吞噬，激起高频引力波涟漪`, 'gw', +(ns.mass * 90).toFixed(1));
 }

 function disruptPlanetTDE(p, attractor) {
  if (!p.alive || !sim) return;
  hideEntityVisual(p);
  p.status = 'disrupted';
  stats.disrupted++;

  const bh = attractor || sim.bh;
  vA.copy(bh.pos).sub(p.pos);
  const dist = Math.max(vA.length(), 1);
  vA.divideScalar(dist);
  vB.crossVectors(vA, vUp);
  if (vB.lengthSq() < 1e-4) vB.set(1, 0, 0);
  else vB.normalize();
  vC.crossVectors(vB, vA).normalize();

  const count = p.kind === 'comet' ? 220 : 680;
  const stretchL = Math.max(p.radius, 1.4) * 2.95;
  const baseR = p.color.r, baseG = p.color.g, baseB = p.color.b;
  const vCirc = Math.sqrt((Math.abs(gUnit()) * bh.mass) / Math.max(dist, 8));
  const relVel = p.vel.clone().sub(bh.vel);
  const tangSign = relVel.dot(vB) >= 0 ? 1 : -1;
  const tangDir = vB.clone().multiplyScalar(tangSign);

  for (let i = 0; i < count; i++) {
   const along = (rand() * 2 - 1) * stretchL;
   const ang = rand() * Math.PI * 2;
   const rad = Math.pow(rand(), 0.55) * p.radius * 0.72;
   const px = p.pos.x + vA.x * along + (tangDir.x * Math.cos(ang) + vC.x * Math.sin(ang)) * rad;
   const py = p.pos.y + vA.y * along + (vC.y * Math.sin(ang) + (rand() - 0.5) * 0.6) * rad * 0.7;
   const pz = p.pos.z + vA.z * along + (tangDir.z * Math.cos(ang) + vC.z * Math.sin(ang)) * rad;

   const normAlong = along / stretchL;
   const orbitalV = vCirc * (0.72 + normAlong * 0.28 + (rand() - 0.5) * 0.14);
   const radialBias = normAlong * vCirc * 0.22;
   const scatter = 1.45;
   const vx = bh.vel.x + relVel.x * 0.35 + tangDir.x * orbitalV + vA.x * radialBias + (rand() - 0.5) * scatter;
   const vy = bh.vel.y + relVel.y * 0.35 + (rand() - 0.5) * scatter * 0.7;
   const vz = bh.vel.z + relVel.z * 0.35 + tangDir.z * orbitalV + vA.z * radialBias + (rand() - 0.5) * scatter;

   const isCore = Math.abs(normAlong) < 0.42;
   const heat = p.isGasOrIce ? (0.45 + rand() * 0.48) : (isCore ? 0.78 + rand() * 0.22 : 0.46 + rand() * 0.44);
   const size = 1.35 + Math.pow(rand(), 1.5) * 2.65;
   spawnDebris(px, py, pz, vx, vy, vz, baseR, baseG, baseB, size, heat, 28 + rand() * 24, p.isGasOrIce ? 1 : 0);
  }

  spawnShockwave(p.pos, {
   maxRadius: Math.max(p.radius, 1.5) * 5.2,
   flashSize: Math.max(p.radius, 1.5) * 5.8,
   dur: 2.3,
   colorA: p.isGasOrIce ? [0.80, 0.94, 1.0] : [1.0, 0.88, 0.64],
   colorB: p.isGasOrIce ? [0.42, 0.72, 1.0] : [0.98, 0.48, 0.18]
  });

  bh.flare = Math.min(1.8, (bh.flare || 0) + 0.65);
  bloomSurge = Math.min(0.42, bloomSurge + 0.24);
  rippleSurge = Math.min(0.85, rippleSurge + 0.58);
  if (p.kind !== 'comet') triggerBulletTime(1.65, 0.18);

  const energy = +(2.6 * Math.max(p.mass, 0.02) * (bh.mass / 12.4) * (24 / Math.max(dist, 6))).toFixed(1);
  announceEvent('潮汐撕裂 · TDE', `${p.name} 跨越 ${bh.name} 洛希极限，化作螺旋吸积流`, 'tde', energy);
 }

 function handleElasticBounce(a, b, normal, dist) {
  stats.elasticBounces++;
  const minR = a.radius + b.radius;
  const overlap = Math.max(0, minR - dist);
  const invA = a.pinned ? 0 : 1 / Math.max(a.mass, 0.005);
  const invB = b.pinned ? 0 : 1 / Math.max(b.mass, 0.005);
  const invSum = invA + invB;
  if (invSum > 0 && overlap > 0) {
   const push = overlap * 1.04 / invSum;
   if (!a.pinned) a.pos.addScaledVector(normal, -push * invA);
   if (!b.pinned) b.pos.addScaledVector(normal, push * invB);
  }
  const relV = vB.copy(b.vel).sub(a.vel);
  const velAlongN = relV.dot(normal);
  if (velAlongN < 0 && invSum > 0) {
   const restitution = 0.92;
   const j = -(1 + restitution) * velAlongN / invSum;
   if (!a.pinned) a.vel.addScaledVector(normal, -j * invA);
   if (!b.pinned) b.vel.addScaledVector(normal, j * invB);
  }
  const hitPos = a.pos.clone().addScaledVector(normal, a.radius);
  for (let i = 0; i < 65; i++) {
   const dx = (rand() - 0.5) * 2, dy = (rand() - 0.5) * 1.4, dz = (rand() - 0.5) * 2;
   const dl = Math.hypot(dx, dy, dz) || 1;
   const spd = 4 + rand() * 10;
   spawnDebris(hitPos.x, hitPos.y, hitPos.z, (dx / dl) * spd, (dy / dl) * spd, (dz / dl) * spd, 1.0, 0.86, 0.58, 1.0 + rand() * 1.5, 0.72, 10 + rand() * 8, 0);
  }
  spawnShockwave(hitPos, { maxRadius: Math.max(a.radius + b.radius, 4) * 2.2, flashSize: Math.max(a.radius + b.radius, 4) * 2.4, dur: 1.3, colorA: [0.92, 0.96, 1.0], colorB: [0.46, 0.82, 1.0] });
  announceEvent('弹性碰撞 · 动量反弹', `${a.name} × ${b.name} 发生弹性台球撞击`, 'info');
 }

 function triggerTypeIaSupernova(wd, detailOverride = null) {
  if (!wd || !wd.alive || !sim) return;
  const pos = wd.pos.clone();
  const vel = wd.vel.clone();
  const nm = wd.name;
  hideEntityVisual(wd);
  wd.status = 'supernova';
  stats.supernovae++;
  stats.typeIaSupernovae++;

  for (let i = 0; i < 1100; i++) {
   const theta = rand() * Math.PI * 2;
   const u = rand() * 2 - 1;
   const s = Math.sqrt(Math.max(0, 1 - u * u));
   const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
   const outer = i < 660;
   const rOff = (outer ? 2.2 : 1.0) + rand() * 2.2;
   const spd = outer ? (16 + rand() * 22) : (6 + rand() * 13);
   const col = outer ? [0.78, 0.94, 1.0] : [0.44, 0.76, 1.0];
   spawnDebris(
    pos.x + dx * rOff, pos.y + dy * rOff, pos.z + dz * rOff,
    vel.x + dx * spd, vel.y + dy * spd * 0.85, vel.z + dz * spd,
    col[0], col[1], col[2], 1.5 + rand() * 3.0, 0.88 + rand() * 0.12, 24 + rand() * 22, 1
   );
  }
  spawnShockwave(pos, { maxRadius: 62, flashSize: 52, dur: 3.5, colorA: [0.96, 0.99, 1.0], colorB: [0.46, 0.84, 1.0] });
  spawnShockwave(pos, { maxRadius: 46, flashSize: 38, dur: 2.8, colorA: [0.85, 0.95, 1.0], colorB: [0.58, 0.62, 1.0], tiltX: Math.PI * 0.28, tiltZ: 0.55 });
  applyBlastImpulse(pos, 22, 145);
  triggerGravityWave(pos, 0.82);
  bloomSurge = Math.min(0.56, bloomSurge + 0.38);
  rippleSurge = Math.min(0.95, rippleSurge + 0.68);
  triggerBulletTime(1.9, 0.15);
  announceEvent('Ia 型热核超新星', detailOverride || `${nm} 突破 1.44 M☉ 钱德拉塞卡极限，彻底炸碎不留残骸！`, 'supernova', 165.0);
 }

 function triggerSpinBreakup(e) {
  if (!e || !e.alive || !sim) return;
  const pos = e.pos.clone(), vel = e.vel.clone(), r = e.radius, col = e.color.clone(), nm = e.name;
  const spinSign = e.spinRate >= 0 ? 1 : -1;
  const eqSpd = Math.min(26, Math.max(7, Math.abs(e.spinRate) * r * 1.45));
  hideEntityVisual(e);
  e.status = 'spin-breakup';
  stats.spinBreakups++;
  stats.shatters++;

  // Flat blazing equatorial centrifugal ring + flying fragments
  for (let i = 0; i < 560; i++) {
   const ang = rand() * Math.PI * 2;
   const radialFrac = 0.45 + Math.pow(rand(), 0.7) * 0.85;
   const rx = Math.cos(ang), rz = Math.sin(ang);
   const tx = -rz * spinSign, tz = rx * spinSign;
   const outSpd = eqSpd * (0.45 + rand() * 0.65);
   const tangSpd = eqSpd * (0.75 + rand() * 0.55);
   const yOff = (rand() - 0.5) * r * 0.42;
   spawnDebris(
    pos.x + rx * r * radialFrac, pos.y + yOff, pos.z + rz * r * radialFrac,
    vel.x + rx * outSpd + tx * tangSpd, vel.y + (rand() - 0.5) * eqSpd * 0.28, vel.z + rz * outSpd + tz * tangSpd,
    col.r, col.g, col.b,
    1.2 + Math.pow(rand(), 1.4) * 2.6, 0.62 + rand() * 0.38, 26 + rand() * 20, e.isGasOrIce ? 1 : 0
   );
  }
  spawnShockwave(pos, {
   maxRadius: Math.max(r, 2) * 5.6,
   flashSize: Math.max(r, 2) * 4.2,
   dur: 2.5,
   colorA: [1.0, 0.90, 0.66],
   colorB: [1.0, 0.48, 0.16]
  });
  bloomSurge = Math.min(0.42, bloomSurge + 0.24);
  triggerBulletTime(1.45, 0.2);
  announceEvent('超临界自转解体', `${nm} 离心力突破自身引力束缚，沿赤道甩碎成碎片环！`, 'shatter');
 }

 function handlePlanetImpact(a, b) {
  if (!a.alive || !b.alive || !sim) return;
  stats.impacts++;

  vA.copy(b.pos).sub(a.pos);
  const dist = Math.max(vA.length(), 0.1);
  const normal = vA.clone().divideScalar(dist);

  if (config.collisionMode === 'elastic' || ((!config.allowBreakup || (a.noBreakup && b.noBreakup)) && a.pinned !== b.pinned)) {
   handleElasticBounce(a, b, normal, dist);
   return;
  }

  const hitPos = a.pos.clone().addScaledVector(normal, a.radius * (dist / (a.radius + b.radius)));

  vB.copy(a.vel).sub(b.vel);
  const relSpeed = vB.length();
  const totalMass = a.mass + b.mass;
  const vEsc = Math.sqrt((2 * Math.abs(gUnit()) * totalMass) / Math.max(a.radius + b.radius, 1.5));
  const reducedMass = (a.mass * b.mass) / totalMass;
  const energy = +(0.5 * reducedMass * relSpeed * relSpeed * 0.18).toFixed(1);
  const massRatio = Math.max(a.mass, b.mass) / Math.max(Math.min(a.mass, b.mass), 0.01);

  const canShatter = config.collisionMode === 'realistic' && config.allowBreakup && !a.noBreakup && !b.noBreakup;
  const hypervelocity = canShatter && relSpeed >= Math.max(13.5, vEsc * 2.8) && massRatio < 2.8;

  vC.crossVectors(normal, vUp);
  if (vC.lengthSq() < 1e-4) vC.set(1, 0, 0);
  else vC.normalize();
  vD.crossVectors(normal, vC).normalize();

  const cmVel = a.vel.clone().multiplyScalar(a.mass).addScaledVector(b.vel, b.mass).divideScalar(totalMass);

  if (hypervelocity) {
   stats.shatters++;
   for (const victim of [a, b]) {
    hideEntityVisual(victim);
    victim.status = 'shattered';
   }

   const count = 720;
   for (let i = 0; i < count; i++) {
    const src = i < count * 0.5 ? a : b;
    const theta = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
    const rad = Math.pow(rand(), 0.5) * src.radius * 0.95;
    const blast = (0.28 + Math.pow(rand(), 1.3) * 0.85) * Math.min(relSpeed * 0.65, 22);
    spawnDebris(
     hitPos.x + dx * rad, hitPos.y + dy * rad * 0.7, hitPos.z + dz * rad,
     cmVel.x + (src.vel.x - cmVel.x) * 0.35 + dx * blast,
     cmVel.y + dy * blast * 0.55,
     cmVel.z + (src.vel.z - cmVel.z) * 0.35 + dz * blast,
     src.color.r, src.color.g, src.color.b,
     1.2 + Math.pow(rand(), 1.5) * 2.8, 0.55 + rand() * 0.45, 28 + rand() * 22, src.isGasOrIce ? 1 : 0
    );
   }

   spawnShockwave(hitPos, { maxRadius: (a.radius + b.radius) * 5.0, flashSize: (a.radius + b.radius) * 5.2, dur: 2.8, colorA: [1.0, 0.96, 0.86], colorB: [1.0, 0.42, 0.14] });
   spawnShockwave(hitPos, { maxRadius: (a.radius + b.radius) * 3.4, flashSize: (a.radius + b.radius) * 3.0, dur: 2.1, colorA: [0.92, 0.96, 1.0], colorB: [0.95, 0.62, 0.25], tiltX: Math.PI * 0.22, tiltZ: 0.45 });

   bloomSurge = Math.min(0.46, bloomSurge + 0.30);
   rippleSurge = Math.min(0.85, rippleSurge + 0.48);
   triggerBulletTime(1.75, 0.16);
   announceEvent('超高速粉碎', `${a.name} × ${b.name} 灾难性对撞解体（${energy}×10³² J）`, 'shatter', energy);
  } else {
   stats.mergers++;
   const survivor = (a.pinned || (!b.pinned && a.mass >= b.mass)) ? a : b;
   const absorbed = survivor === a ? b : a;
   const impactFromAbsorbed = absorbed.pos.clone().sub(survivor.pos).normalize();

   // Oblique impact imparts angular momentum -> spin-up!
   const relV = absorbed.vel.clone().sub(survivor.vel);
   const tangV = relV.clone().addScaledVector(impactFromAbsorbed, -relV.dot(impactFromAbsorbed));
   const spinKick = (tangV.x * impactFromAbsorbed.z - tangV.z * impactFromAbsorbed.x) * (absorbed.mass / Math.max(totalMass, 0.02)) * 0.14;

   hideEntityVisual(absorbed);
   absorbed.status = 'merged';

   if (!survivor.pinned) {
    survivor.pos.copy(survivor.pos.clone().multiplyScalar(survivor.mass).addScaledVector(absorbed.pos, absorbed.mass).divideScalar(totalMass));
    survivor.vel.copy(cmVel);
   }
   survivor.mass = totalMass;
   survivor.targetRadius = Math.min(7.2, Math.cbrt(Math.pow(survivor.radius, 3) + Math.pow(absorbed.radius, 3)));
   survivor.mergedCount++;
   survivor.lavaHeat = 1.0;
   survivor.temperature = Math.min(4200, Math.max(survivor.temperature || 400, 1950 + relSpeed * 55));
   survivor.spinRate = THREE.MathUtils.clamp((survivor.spinRate || 0.2) + spinKick, -6, 6);
   survivor.impactDir.copy(impactFromAbsorbed);

   const count = 380;
   const splashSpeed = Math.max(4.5, Math.min(relSpeed * 0.58, 16));
   for (let i = 0; i < count; i++) {
    const inRing = i < count * 0.55;
    const ang = rand() * Math.PI * 2;
    let dirX, dirY, dirZ;
    if (inRing) {
     const lift = (rand() - 0.5) * 0.45;
     dirX = vC.x * Math.cos(ang) + vD.x * Math.sin(ang) + impactFromAbsorbed.x * lift;
     dirY = vC.y * Math.cos(ang) + vD.y * Math.sin(ang) + (rand() - 0.5) * 0.55;
     dirZ = vC.z * Math.cos(ang) + vD.z * Math.sin(ang) + impactFromAbsorbed.z * lift;
    } else {
     dirX = impactFromAbsorbed.x + (rand() - 0.5) * 0.65;
     dirY = impactFromAbsorbed.y + (rand() - 0.5) * 0.65;
     dirZ = impactFromAbsorbed.z + (rand() - 0.5) * 0.65;
    }
    const dl = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= dl; dirY /= dl; dirZ /= dl;
    const spd = (0.35 + Math.pow(rand(), 1.2) * 0.95) * splashSpeed;
    const src = rand() < 0.6 ? absorbed : survivor;
    spawnDebris(
     hitPos.x + dirX * (0.6 + rand() * 1.6), hitPos.y + dirY * (0.6 + rand() * 1.4), hitPos.z + dirZ * (0.6 + rand() * 1.6),
     cmVel.x + dirX * spd, cmVel.y + dirY * spd, cmVel.z + dirZ * spd,
     src.color.r, src.color.g, src.color.b,
     1.1 + Math.pow(rand(), 1.5) * 2.5, 0.65 + rand() * 0.35, 22 + rand() * 18, 0
    );
   }

   spawnShockwave(hitPos, {
    maxRadius: (survivor.targetRadius + absorbed.radius) * 3.8,
    flashSize: (survivor.targetRadius + absorbed.radius) * 4.2,
    dur: 2.3, colorA: [1.0, 0.94, 0.80], colorB: [1.0, 0.45, 0.14]
   });

   bloomSurge = Math.min(0.44, bloomSurge + 0.26);
   rippleSurge = Math.min(0.80, rippleSurge + 0.34);
   if (absorbed.kind !== 'comet' && absorbed.kind !== 'moon') triggerBulletTime(1.55, 0.18);
   announceEvent('行星大撞击 · 熔融合并', `${survivor.name} 吞并 ${absorbed.name}（${energy}×10³² J）`, 'merger', energy);
   checkMassCollapse(survivor);
  }
 }

 function handleStellarImpact(p, s) {
  if (!p.alive || !s.alive || !sim) return;
  hideEntityVisual(p);
  p.status = 'vaporized';
  stats.impacts++;
  stats.vaporized++;

  const hitDir = p.pos.clone().sub(s.pos).normalize();
  const hitPos = s.pos.clone().addScaledVector(hitDir, s.radius * 1.02);
  s.mass += p.mass;

  const count = p.kind === 'comet' || p.kind === 'probe' ? 120 : 300;
  for (let i = 0; i < count; i++) {
   let dx = hitDir.x + (rand() - 0.5) * 1.1;
   let dy = hitDir.y + (rand() - 0.5) * 1.1;
   let dz = hitDir.z + (rand() - 0.5) * 1.1;
   const dl = Math.hypot(dx, dy, dz) || 1;
   dx /= dl; dy /= dl; dz /= dl;
   const spd = 6 + rand() * 16;
   spawnDebris(
    hitPos.x + dx * rand() * 1.8, hitPos.y + dy * rand() * 1.8, hitPos.z + dz * rand() * 1.8,
    s.vel.x + dx * spd, s.vel.y + dy * spd, s.vel.z + dz * spd,
    0.58, 0.84, 1.0, 1.3 + rand() * 2.2, 0.85 + rand() * 0.15, 14 + rand() * 12, 1
   );
  }

  spawnShockwave(hitPos, { maxRadius: 24, flashSize: 28, dur: 2.2, colorA: [0.80, 0.94, 1.0], colorB: [0.32, 0.68, 1.0] });
  s.flare = Math.min(1.6, (s.flare || 0) + 1.0);
  bloomSurge = Math.min(0.48, bloomSurge + 0.28);
  if (p.kind === 'planet') triggerBulletTime(1.35, 0.22);
  announceEvent('恒星吞噬 · 耀斑爆发', `${p.name} 坠入 ${s.name}，激起蓝白日冕喷发`, 'stellar', +(Math.max(p.mass, 0.01) * 48).toFixed(1));
 }

 // Self-collapse / Ignition when user cranks mass past astrophysical thresholds!
 function checkMassCollapse(e) {
  if (!e || !e.alive || !sim) return;
  if (e.kind === 'white-dwarf' && e.mass >= 1.44) {
   stats.collapses++;
   triggerTypeIaSupernova(e);
   unlockEgg('self-collapse', `将 ${e.name} 推破钱德拉塞卡极限触发 Ia 型超新星，解锁造物主坍缩彩蛋！`);
   return;
  }
  if ((e.kind === 'planet' || e.kind === 'moon' || e.kind === 'comet') && e.mass >= 1.8) {
   stats.collapses++;
   const pos = e.pos.clone(), vel = e.vel.clone(), mass = Math.max(3.6, e.mass * 2.1);
   const oldName = e.name;
   const wasSelected = selectedEntity === e;
   const wasFollowed = followEntity === e;
   hideEntityVisual(e);
   e.status = 'ignited';
   spawnShockwave(pos, { maxRadius: 28, flashSize: 32, dur: 2.4, colorA: [1.0, 0.88, 0.56], colorB: [1.0, 0.42, 0.16] });
   const ignited = spawnSingleEntity('star-red', pos, vel, { mass, radius: 5.4, name: `${oldName}·点燃恒星`, initialFlare: 1.5 });
   if (ignited) {
    if (wasSelected) selectEntity(ignited);
    if (wasFollowed) followBody(ignited);
   }
   announceEvent('核聚变点火 · 行星成星', `${oldName} 质量越过临界线，核心点燃跃迁为恒星！`, 'stellar');
   unlockEgg('self-collapse', `亲手将 ${oldName} 点燃成恒星，解锁造物主坍缩彩蛋！`);
  } else if (e.kind === 'star' && e.mass >= 20.0) {
   stats.collapses++;
   const pos = e.pos.clone(), vel = e.vel.clone(), mass = e.mass;
   const oldName = e.name;
   hideEntityVisual(e);
   e.status = 'collapsed';
   triggerSupernovaAt(pos, vel, {
    totalMass: mass,
    title: '引力坍缩 · 自造黑洞',
    detail: `${oldName} 质量突破 ${mass.toFixed(1)} M☉ 托尔曼极限，触发超新星坍缩`,
    spawnRemnant: true
   });
   unlockEgg('self-collapse', `令 ${oldName} 引力坍缩自造黑洞，解锁造物主坍缩彩蛋！`);
  }
 }

 function detonateBody(id) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;

  if (e.kind === 'white-dwarf') {
   triggerTypeIaSupernova(e, `人为引爆 ${e.name}，触发耀眼 Ia 型热核超新星！`);
   return true;
  }
  if (e.kind === 'star') {
   const pos = e.pos.clone(), vel = e.vel.clone(), m = e.mass, nm = e.name;
   hideEntityVisual(e);
   e.status = 'supernova';
   triggerSupernovaAt(pos, vel, {
    totalMass: Math.max(m, 8.5),
    title: '人为超新星 · 核心引爆',
    detail: `${nm} 发生剧烈核心坍缩大爆炸`,
    spawnRemnant: true
   });
   return true;
  }
  if (isLightKind(e.kind)) {
   const pos = e.pos.clone(), vel = e.vel.clone();
   hideEntityVisual(e);
   e.status = 'shattered';
   stats.shatters++;
   for (let i = 0; i < 520; i++) {
    const theta = rand() * Math.PI * 2, u = rand() * 2 - 1, s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
    const spd = 4 + rand() * 14;
    spawnDebris(pos.x + dx * e.radius, pos.y + dy * e.radius, pos.z + dz * e.radius, vel.x + dx * spd, vel.y + dy * spd * 0.7, vel.z + dz * spd, e.color.r, e.color.g, e.color.b, 1.3 + rand() * 2.4, 0.78, 24 + rand() * 18, 0);
   }
   spawnShockwave(pos, { maxRadius: Math.max(e.radius, 2) * 5.2, flashSize: Math.max(e.radius, 2) * 5.5, dur: 2.5, colorA: [1.0, 0.94, 0.78], colorB: [1.0, 0.42, 0.14] });
   bloomSurge = Math.min(0.45, bloomSurge + 0.28);
   triggerBulletTime(1.4, 0.2);
   announceEvent('天体引爆解体', `${e.name} 已化作炽热碎片云`, 'shatter');
   return true;
  }
  if (e.kind === 'neutron') {
   const pos = e.pos.clone(), vel = e.vel.clone(), nm = e.name;
   hideEntityVisual(e);
   e.status = 'kilonova';
   stats.kilonovae++;
   for (let i = 0; i < 650; i++) {
    const theta = rand() * Math.PI * 2, u = rand() * 2 - 1, s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
    const spd = 10 + rand() * 18;
    spawnDebris(pos.x + dx * 2, pos.y + dy * 2, pos.z + dz * 2, vel.x + dx * spd, vel.y + dy * spd, vel.z + dz * spd, 0.72, 0.62, 1.0, 1.5 + rand() * 2.5, 0.9, 22 + rand() * 16, 2);
   }
   spawnShockwave(pos, { maxRadius: 44, flashSize: 38, dur: 2.8, colorA: [0.86, 0.92, 1.0], colorB: [0.62, 0.36, 1.0] });
   applyBlastImpulse(pos, 13, 95);
   triggerGravityWave(pos, 0.85);
   announceEvent('磁星巨耀斑', `${nm} 释放超高能星震伽马爆闪`, 'gw');
   return true;
  }
  return false;
 }

 // ==========================================================================
 // 10. VELOCITY VERLET PHYSICS STEP + FULL PAIRWISE CATACLYSMS + SLINGSHOTS
 // ==========================================================================
 function stepPhysics(dtSim) {
  if (!sim || dtSim <= 0) return;
  // Adaptive Verlet substeps so 0.05x..100x stays symplectic & stable!
  const substeps = Math.min(64, Math.max(6, Math.ceil(dtSim / 0.028)));
  const h = dtSim / substeps;
  const guixu = sim.bh;

  if (guixu && guixu.alive) {
   guixu.mass = config.bhMass;
   guixu.targetRadius = baseBhRadius * bhVisualScale(guixu.mass);
  }

  const dragFactor = config.drag > 0 ? Math.exp(-config.drag * 0.34 * h) : 1;
  const spinStepVis = Math.min(h, 0.032);

  for (let s = 0; s < substeps; s++) {
   // 1. Velocity Verlet position update (saving prevPos for Swept-Segment CCD!)
   for (const e of sim.entities) {
    if (!e.alive) continue;
    e.prevPos.copy(e.pos);
    if (drag.target === e) continue;
    if (e.pinned) {
     e.vel.set(0, 0, 0);
     continue;
    }
    e.pos.x += e.vel.x * h + 0.5 * e.acc.x * h * h;
    e.pos.y += e.vel.y * h + 0.5 * e.acc.y * h * h;
    e.pos.z += e.vel.z * h + 0.5 * e.acc.z * h * h;
   }

   // 2. Pairwise N-body accelerations (with planet-planet boost & pinned immunity)
   computeAccelerations(sim.entities, false);

   // 3. Velocity update, drag, spin/oblateness/critical breakup, thermal evolution & slingshots
   for (const e of sim.entities) {
    if (!e.alive || drag.target === e) continue;
    if (e.pinned) {
     e.vel.set(0, 0, 0);
     e.acc.set(0, 0, 0);
    } else {
     e.vel.x += 0.5 * (e.acc.x + e.accNext.x) * h;
     e.vel.y += 0.5 * (e.acc.y + e.accNext.y) * h;
     e.vel.z += 0.5 * (e.acc.z + e.accNext.z) * h;
     e.acc.copy(e.accNext);

     if (dragFactor < 1 && e.kind !== 'bh') {
      const bv = sim.baryVel;
      e.vel.x = bv.x + (e.vel.x - bv.x) * dragFactor;
      e.vel.y = bv.y + (e.vel.y - bv.y) * dragFactor;
      e.vel.z = bv.z + (e.vel.z - bv.z) * dragFactor;
     }

     const spdSq = e.vel.lengthSq();
     if (spdSq > 185 * 185) e.vel.multiplyScalar(185 / Math.sqrt(spdSq));
    }

    if (Math.abs(e.radius - e.targetRadius) > 0.005) {
     e.radius += (e.targetRadius - e.radius) * Math.min(1, h * 8);
    }

    // Cool molten impact crust slowly
    if (e.lavaHeat > 0.002) e.lavaHeat *= Math.exp(-0.042 * h);
    else if (e.lavaHeat) e.lavaHeat = 0;

    // Spin rotation, centrifugal equatorial oblateness & critical spin breakup!
    if (e.kind !== 'bh' && e.kind !== 'probe') {
     e.spinAngle = (e.spinAngle || 0) + (e.spinRate || 0) * 2.3 * spinStepVis;
     const crit = criticalSpinFor(e);
     const ratio = Number.isFinite(crit) ? Math.abs(e.spinRate || 0) / Math.max(crit, 0.05) : 0;
     const ob = Math.min(ratio, 1.38);
     e.oblateXZ = 1 + 0.30 * ob * ob;
     e.oblateY = 1 / (e.oblateXZ * e.oblateXZ);
     e._spinRatio = ratio;

     if (ratio > 1.0) {
      // Emit glowing equatorial centrifugal shedding sparks!
      if (s === 0 && rand() < Math.min(0.92, (0.35 + (ratio - 1) * 0.8) * Math.min(dtSim * 12, 1.2))) {
       const ang = rand() * Math.PI * 2;
       const rx = Math.cos(ang), rz = Math.sin(ang);
       const sign = (e.spinRate || 1) >= 0 ? 1 : -1;
       const tx = -rz * sign, tz = rx * sign;
       const eqR = e.radius * e.oblateXZ * 1.04;
       const tangSpd = Math.min(20, Math.abs(e.spinRate) * e.radius * 1.35 + 3);
       spawnDebris(
        e.pos.x + rx * eqR, e.pos.y + (rand() - 0.5) * e.radius * 0.28, e.pos.z + rz * eqR,
        e.vel.x + tx * tangSpd + rx * 2.4, e.vel.y + (rand() - 0.5) * 1.2, e.vel.z + tz * tangSpd + rz * 2.4,
        1.0, 0.72, 0.34, 1.0 + rand() * 1.5, 0.78, 10 + rand() * 8, 0
       );
      }
      if (config.allowBreakup && !e.noBreakup) {
       e.spinDamage = (e.spinDamage || 0) + (0.58 + (ratio - 1.0) * 1.5) * h;
       if (e.spinDamage >= 1.0) {
        triggerSpinBreakup(e);
        continue;
       }
      } else {
       e.spinDamage = 0;
      }
     } else if (e.spinDamage) {
      e.spinDamage = Math.max(0, e.spinDamage - h * 0.45);
     }
    }

    // Surface Temperature Evolution & Scorching Thermal Evaporation Tail (on last substep for performance)
    if (s === substeps - 1 && isLightKind(e.kind) && e.kind !== 'probe') {
     const tEq = equilibriumTempAt(e.pos, e);
     if (e.tempHold > 0) e.tempHold = Math.max(0, e.tempHold - dtSim);
     const rate = tEq > (e.temperature || 260) + 180 ? 0.36 : (e.tempHold > 0 ? 0.008 : 0.045);
     const targetT = e.subType === 'brown-dwarf' ? Math.max(tEq, 1100) : tEq;
     e.temperature = (e.temperature || targetT) + (targetT - (e.temperature || targetT)) * Math.min(1, rate * dtSim);
     if (e.temperature > 2550) {
      // Visible comet-like thermal evaporation plume streaming away from nearest star
      const nearStar = sim.entities.find(st => st.alive && st.kind === 'star');
      const away = nearStar ? vA.copy(e.pos).sub(nearStar.pos).normalize() : vA.set(1, 0, 0);
      if (rand() < Math.min(0.95, ((e.temperature - 2500) / 1400) * Math.min(dtSim * 18, 1.2))) {
       spawnDebris(
        e.pos.x + away.x * e.radius * 1.05 + (rand() - 0.5) * e.radius * 0.6,
        e.pos.y + (rand() - 0.5) * e.radius * 0.5,
        e.pos.z + away.z * e.radius * 1.05 + (rand() - 0.5) * e.radius * 0.6,
        e.vel.x + away.x * (7 + rand() * 8) + (rand() - 0.5) * 2,
        e.vel.y + (rand() - 0.5) * 1.5,
        e.vel.z + away.z * (7 + rand() * 8) + (rand() - 0.5) * 2,
        1.0, 0.58, 0.24, 1.1 + rand() * 1.6, 0.85, 11 + rand() * 9, 0
       );
      }
      if (config.allowBreakup && !e.noBreakup && e.mass > 0.006) {
       const ablate = Math.exp(-0.014 * Math.min(dtSim, 0.5));
       e.mass = Math.max(0.005, e.mass * ablate);
       e.targetRadius = Math.max(0.75, e.targetRadius * Math.cbrt(ablate));
      }
     }
    }

    // Track gravitational slingshot acceleration boost for Probes & Planets!
    if ((e.kind === 'probe' || e.kind === 'planet') && !e.pinned) {
     const spd = e.vel.length();
     if (spd > e.peakSpeed) e.peakSpeed = spd;
     if (!e.slingshotAwarded && e.baseSpeed > 1.5 && spd > Math.max(e.baseSpeed * 1.85, 20)) {
      for (const attr of sim.entities) {
       if (!attr.alive || attr === e) continue;
       if (attr.kind !== 'bh' && attr.kind !== 'star' && !(attr.kind === 'planet' && attr.isGasOrIce)) continue;
       const d = e.pos.distanceTo(attr.pos);
       if (d < Math.max(attr.radius * 8.5, 28)) {
        e.slingshotAwarded = true;
        e.slingshotFlash = 1.0;
        stats.slingshots++;
        spawnShockwave(e.pos, { maxRadius: 13, flashSize: 11, dur: 1.5, colorA: [1.0, 0.92, 0.58], colorB: [0.42, 0.94, 0.84] });
        const mult = (spd / e.baseSpeed).toFixed(1);
        announceEvent('引力弹弓达成 · +Δv', `${e.name} 借 ${attr.name} 加速至 ${mult}× 初始速率！`, 'slingshot');
        unlockEgg('slingshot-master', `${e.name} 贴近 ${attr.name} 完成 ${mult}× 极限引力弹弓！`);
        break;
       }
      }
     }
    }
   }

   // 4. Tidal stress accumulation & Swept-Segment CCD pairwise cataclysms
   const ents = sim.entities;
   for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (!a.alive) continue;
    a._maxTidalThisStep = 0;
   }

   for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < ents.length; j++) {
     const b = ents[j];
     if (!b.alive) continue;
     if (!a.alive) break;

     const seg = segmentMinDistSq(a.prevPos, a.pos, b.prevPos, b.pos);
     const d2 = seg.d2;

     // --- BH x BH ---
     if (a.kind === 'bh' && b.kind === 'bh') {
      const sumR = a.radius + b.radius;
      if (d2 < Math.pow(sumR * 6.5, 2)) {
       const d = Math.sqrt(d2);
       const proximity = 1 - Math.min(1, d / (sumR * 6.5));
       rippleSurge = Math.max(rippleSurge, proximity * 0.42);
       if (d < sumR * 1.48) {
        handleBlackHoleMerger(a, b);
        continue;
       }
      }
      continue;
     }

     // --- Star x BH ---
     if ((a.kind === 'star' && b.kind === 'bh') || (a.kind === 'bh' && b.kind === 'star')) {
      const st = a.kind === 'star' ? a : b;
      const bh = a.kind === 'bh' ? a : b;
      const rocheS = stellarRocheRadius(st.radius, bh);
      if (d2 < Math.pow(rocheS * 1.85, 2)) {
       const d = Math.sqrt(d2);
       const stress = THREE.MathUtils.smoothstep(d, rocheS * 1.85, rocheS * 0.82);
       st._maxTidalThisStep = Math.max(st._maxTidalThisStep || 0, stress);
       st._tidalTarget = bh;

       if (d < rocheS * 1.25) {
        if (config.allowBreakup && !st.noBreakup) {
         st.tidalDamage = (st.tidalDamage || 0) + (0.48 + stress * 1.75) * h;
        }
        bh.flare = Math.min(1.8, (bh.flare || 0) + h * 0.55);
        if (rand() < Math.min(0.9, (0.25 + stress * 0.7) * h * 30)) {
         vA.copy(bh.pos).sub(st.pos).normalize();
         const side = vB.crossVectors(vA, vUp).normalize();
         const sx = st.pos.x + vA.x * st.radius * 1.1 + (rand() - 0.5) * 1.6;
         const sy = st.pos.y + (rand() - 0.5) * 1.4;
         const sz = st.pos.z + vA.z * st.radius * 1.1 + (rand() - 0.5) * 1.6;
         const isRed = st.subType === 'star-red';
         spawnDebris(
          sx, sy, sz,
          st.vel.x + vA.x * 8.5 + side.x * 3.5, st.vel.y + (rand() - 0.5) * 1.8, st.vel.z + vA.z * 8.5 + side.z * 3.5,
          isRed ? 1.0 : 0.62, isRed ? 0.55 : 0.88, isRed ? 0.22 : 1.0,
          1.4 + rand() * 1.8, 0.88, 12 + rand() * 10, 1
         );
        }
       }
       if ((config.allowBreakup && !st.noBreakup) && (d <= bh.radius * 2.9 + st.radius * 0.72 || st.tidalDamage >= 1.0)) {
        handleStellarTDE(st, bh);
        continue;
       }
      }
      continue;
     }

     // --- White Dwarf x White Dwarf or Star -> Type Ia Supernova! ---
     if ((a.kind === 'white-dwarf' && (b.kind === 'white-dwarf' || b.kind === 'star')) ||
         (b.kind === 'white-dwarf' && a.kind === 'star')) {
      const minR = (a.radius + b.radius) * 1.1;
      if (d2 < minR * minR) {
       const wd = a.kind === 'white-dwarf' ? a : b;
       const other = wd === a ? b : a;
       const nmA = a.name, nmB = b.name;
       hideEntityVisual(other);
       other.status = 'supernova';
       triggerTypeIaSupernova(wd, `${nmA} × ${nmB} 突破钱德拉塞卡极限，引发耀眼 Ia 型热核超新星！`);
       continue;
      }
      continue;
     }

     // --- White Dwarf x BH or Neutron ---
     if ((a.kind === 'white-dwarf' && (b.kind === 'bh' || b.kind === 'neutron')) ||
         (b.kind === 'white-dwarf' && (a.kind === 'bh' || a.kind === 'neutron'))) {
      const wd = a.kind === 'white-dwarf' ? a : b;
      const other = wd === a ? b : a;
      const minR = other.radius * 2.4 + wd.radius;
      if (d2 < minR * minR) {
       if (other.kind === 'bh') handleNeutronBlackHole(wd, other);
       else triggerTypeIaSupernova(wd, `${wd.name} 撞击 ${other.name}，引爆高能 Ia 型热核超新星！`);
       continue;
      }
      continue;
     }

     // --- Star x Star ---
     if (a.kind === 'star' && b.kind === 'star') {
      const minR = (a.radius + b.radius) * 0.92;
      if (d2 < minR * minR) {
       if (seg.t < 0.99) {
        a.pos.lerpVectors(a.prevPos, a.pos, seg.t);
        b.pos.lerpVectors(b.prevPos, b.pos, seg.t);
       }
       handleStarStarCollision(a, b);
       continue;
      }
      continue;
     }

     // --- Neutron x Neutron ---
     if (a.kind === 'neutron' && b.kind === 'neutron') {
      const minR = (a.radius + b.radius) * 1.55;
      if (d2 < minR * minR) {
       handleKilonova(a, b);
       continue;
      }
      continue;
     }

     // --- Neutron x BH ---
     if ((a.kind === 'neutron' && b.kind === 'bh') || (a.kind === 'bh' && b.kind === 'neutron')) {
      const ns = a.kind === 'neutron' ? a : b;
      const bh = a.kind === 'bh' ? a : b;
      const minR = bh.radius * 2.5 + ns.radius;
      if (d2 < minR * minR) {
       handleNeutronBlackHole(ns, bh);
       continue;
      }
      continue;
     }

     // --- Neutron x Star ---
     if ((a.kind === 'neutron' && b.kind === 'star') || (a.kind === 'star' && b.kind === 'neutron')) {
      const ns = a.kind === 'neutron' ? a : b;
      const st = a.kind === 'star' ? a : b;
      const minR = (st.radius + ns.radius) * 0.95;
      if (d2 < minR * minR) {
       const pos = st.pos.clone(), vel = st.vel.clone(), tm = st.mass + ns.mass;
       const nsName = ns.name, stName = st.name;
       hideEntityVisual(ns);
       hideEntityVisual(st);
       triggerSupernovaAt(pos, vel, {
        totalMass: Math.max(tm, 13.0),
        title: '脉冲星贯穿 · 诱发超新星',
        detail: `${nsName} 击穿 ${stName} 核心，引发极超新星坍缩`,
        spawnRemnant: true
       });
       continue;
      }
      continue;
     }

     // --- Light body (planet/moon/comet/probe) x BH, Neutron, or White Dwarf ---
     const aLight = isLightKind(a.kind);
     const bLight = isLightKind(b.kind);
     const aCompact = isCompactKind(a.kind);
     const bCompact = isCompactKind(b.kind);

     if ((aLight && bCompact) || (bLight && aCompact)) {
      const p = aLight ? a : b;
      const attr = aCompact ? a : b;
      if (p.kind === 'probe') {
       const hitR = attr.radius * 1.9;
       if (d2 < hitR * hitR && config.allowBreakup && !p.noBreakup) {
        hideEntityVisual(p);
        p.status = 'vaporized';
        stats.vaporized++;
        spawnShockwave(p.pos, { maxRadius: 10, flashSize: 8, dur: 1.2, colorA: [0.6, 1.0, 0.9], colorB: [1.0, 0.6, 0.2] });
        announceEvent('探测器坠毁', `${p.name} 落入 ${attr.name} 视界`, 'tde');
       }
       continue;
      }
      if (attr.kind === 'white-dwarf') {
       const hitR = (attr.radius + p.radius) * 1.05;
       if (d2 < hitR * hitR) {
        handleStellarImpact(p, attr);
        checkMassCollapse(attr);
       }
       continue;
      }
      const rocheR = attr.kind === 'bh'
       ? rocheRadiusFor(p.radius, attr.mass, attr.radius)
       : Math.max(7.2, attr.radius * 4.5 + p.radius);
      if (d2 < Math.pow(rocheR * 1.9, 2)) {
       const d = Math.sqrt(d2);
       const stress = THREE.MathUtils.smoothstep(d, rocheR * 1.9, rocheR * 0.94);
       if (stress > (p._maxTidalThisStep || 0)) {
        p._maxTidalThisStep = stress;
        p._tidalTarget = attr;
       }
       if (d < rocheR * 1.32) {
        if (config.allowBreakup && !p.noBreakup) {
         p.tidalDamage += (0.45 + stress * 1.65) * h;
        }
        if (rand() < Math.min(0.85, (0.22 + stress * 0.65) * h * 26)) {
         vA.copy(attr.pos).sub(p.pos).normalize();
         const side = vB.crossVectors(vA, vUp).normalize();
         const sign = rand() < 0.72 ? 1 : -1;
         spawnDebris(
          p.pos.x + vA.x * p.radius * 1.35 * sign + (rand() - 0.5) * p.radius * 0.5,
          p.pos.y + (rand() - 0.5) * p.radius * 0.45,
          p.pos.z + vA.z * p.radius * 1.35 * sign + (rand() - 0.5) * p.radius * 0.5,
          p.vel.x + vA.x * 4.5 * sign + side.x * 2.4, p.vel.y + (rand() - 0.5) * 1.2, p.vel.z + vA.z * 4.5 * sign + side.z * 2.4,
          p.color.r, p.color.g, p.color.b, 1.1 + rand() * 1.5, 0.55 + stress * 0.45, 12 + rand() * 10, p.isGasOrIce ? 1 : 0
         );
        }
       }
       if (config.allowBreakup && !p.noBreakup && (d <= rocheR * 1.02 || p.tidalDamage >= 1.0)) {
        disruptPlanetTDE(p, attr);
        continue;
       }
      }
      continue;
     }

     // --- Light body x Star ---
     if ((aLight && b.kind === 'star') || (bLight && a.kind === 'star')) {
      const p = aLight ? a : b;
      const st = a.kind === 'star' ? a : b;
      const minR = (st.radius + p.radius) * 0.92;
      if (d2 < minR * minR) {
       if (!config.allowBreakup || p.noBreakup) {
        const distNow = Math.max(a.pos.distanceTo(b.pos), 0.1);
        const norm = vA.copy(b.pos).sub(a.pos).divideScalar(distNow);
        handleElasticBounce(a, b, norm, distNow);
       } else {
        handleStellarImpact(p, st);
       }
       continue;
      }
      continue;
     }

     // --- Planet/Moon/Comet x Planet/Moon/Comet ---
     if ((aLight && a.kind !== 'probe') && (bLight && b.kind !== 'probe')) {
      const minR = (a.radius + b.radius) * 0.96;
      if (d2 < minR * minR) {
       if (seg.t < 0.99) {
        a.pos.lerpVectors(a.prevPos, a.pos, seg.t);
        b.pos.lerpVectors(b.prevPos, b.pos, seg.t);
       }
       handlePlanetImpact(a, b);
       continue;
      }
     }
    }
   }

   // Decay tidal stress smoothly for bodies outside Roche zones
   for (const e of ents) {
    if (!e.alive) continue;
    if ((e._maxTidalThisStep || 0) > 0.005) {
     e.tidalStress = Math.max((e.tidalStress || 0) * Math.exp(-h * 2.5), e._maxTidalThisStep);
    } else {
     e.tidalStress = (e.tidalStress || 0) * Math.exp(-h * 2.4);
     if (e.tidalDamage) e.tidalDamage = Math.max(0, e.tidalDamage - h * 0.25);
    }
   }
  }

  // Update system barycenter & barycenter velocity across all alive bodies
  let sumM = 0, bx = 0, by = 0, bz = 0, vx = 0, vy = 0, vz = 0;
  for (const e of sim.entities) {
   if (!e.alive) continue;
   sumM += e.mass;
   bx += e.pos.x * e.mass; by += e.pos.y * e.mass; bz += e.pos.z * e.mass;
   vx += e.vel.x * e.mass; vy += e.vel.y * e.mass; vz += e.vel.z * e.mass;
  }
  if (sumM > 1e-4) {
   sim.barycenter.set(bx / sumM, by / sumM, bz / sumM);
   sim.baryVel.set(vx / sumM, vy / sumM, vz / sumM);
   sim.barySpeed = Math.hypot(vx / sumM, vz / sumM);
  }

  // Easter Egg monitors: Three-Body Chaos (>=3 stars) & All-Consumed Singularity Void!
  const aliveStars = sim.entities.filter(e => e.alive && e.kind === 'star');
  threeBodyActive = aliveStars.length >= 3;
  if (threeBodyActive && !unlockedEggs.has('three-body')) {
   unlockEgg('three-body', '场内已集齐三颗恒星，行星标签切换实时恒纪元 / 乱纪元温态！');
  }
  const aliveWorlds = sim.entities.filter(e => e.alive && (e.kind === 'planet' || e.kind === 'moon' || e.kind === 'comet'));
  const aliveBHs = sim.entities.filter(e => e.alive && e.kind === 'bh');
  if (!voidPrompted && aliveStars.length === 0 && aliveWorlds.length === 0 && aliveBHs.length >= 1) {
   voidPrompted = true;
   unlockEgg('big-bang', '万物已被奇点吞噬殆尽，宇宙陷入寂静——点击右侧按钮以大爆炸重开新星系！', {
    label: '✦ 奇点大爆炸重开',
    onClick: () => triggerPhenomenon('big-bang')
   });
  }

  stepDebris(dtSim);
 }

 function stepDebris(dtSim) {
  if (!sim || dtSim <= 0) return;
  const G = gUnit();
  const heavy = sim.entities
   .filter(e => e.alive && (e.kind === 'bh' || e.kind === 'star' || e.kind === 'neutron' || e.kind === 'white-dwarf'))
   .sort((a, b) => b.mass - a.mass)
   .slice(0, 4);

  const nH = heavy.length;
  const debrisSubs = Math.min(12, Math.max(2, Math.ceil(dtSim / 0.06)));
  const h = dtSim / debrisSubs;
  let aliveCount = 0;

  for (let i = 0; i < MAX_DEBRIS; i++) {
   let life = dLife[i];
   if (life <= 0) continue;
   life -= dtSim / dMaxLife[i];
   if (life <= 0) {
    dLife[i] = 0;
    continue;
   }

   const i3 = i * 3;
   let px = dPos[i3], py = dPos[i3 + 1], pz = dPos[i3 + 2];
   let vx = dVel[i3], vy = dVel[i3 + 1], vz = dVel[i3 + 2];
   let absorbed = false;

   for (let sub = 0; sub < debrisSubs; sub++) {
    let ax = 0, ay = 0, az = 0;
    let heated = false;
    for (let k = 0; k < nH; k++) {
     const attr = heavy[k];
     const dx = attr.pos.x - px, dy = attr.pos.y - py, dz = attr.pos.z - pz;
     const r2 = dx * dx + dy * dy + dz * dz;
     const capR = attr.kind === 'bh' ? attr.radius * 1.85 : attr.radius * 0.95;
     if (r2 < capR * capR) {
      absorbed = true;
      if (attr.kind === 'bh') {
       attr.flare = Math.min(1.8, (attr.flare || 0) + 0.008);
      }
      break;
     }
     const soft2 = attr.kind === 'bh' ? 9.0 : 16.0;
     const acc = (G * attr.mass) / Math.pow(r2 + soft2, 1.5);
     ax += dx * acc; ay += dy * acc; az += dz * acc;
     if (attr.kind === 'bh' && r2 < Math.pow(attr.radius * 8.2, 2)) heated = true;
    }
    if (absorbed) break;

    vx += ax * h; vy += ay * h; vz += az * h;
    if (heated) {
     const dragK = Math.exp(-0.18 * h);
     vx *= dragK; vy *= dragK; vz *= dragK;
     dHeat[i] = Math.min(1.0, dHeat[i] + h * 0.55);
    } else {
     dHeat[i] = Math.max(0.08, dHeat[i] * Math.exp(-0.065 * h));
    }
    px += vx * h; py += vy * h; pz += vz * h;
   }

   if (absorbed) {
    dLife[i] = 0;
    continue;
   }
   dPos[i3] = px; dPos[i3 + 1] = py; dPos[i3 + 2] = pz;
   dVel[i3] = vx; dVel[i3 + 1] = vy; dVel[i3 + 2] = vz;
   dLife[i] = life;
   aliveCount++;
  }

  activeDebrisCount = aliveCount;
  dPosAttr.needsUpdate = true;
  dColAttr.needsUpdate = true;
  dSizeAttr.needsUpdate = true;
  dHeatAttr.needsUpdate = true;
  dLifeAttr.needsUpdate = true;
 }

 // ==========================================================================
 // 11. APPLY 3D VISUALS, DYNAMIC LIGHT, METRIC WELLS & LABELS
 // ==========================================================================
 function applyVisualPoses(dtReal) {
  if (!sim) return;

  // Pick brightest surviving Star (prefer Alkaid) for dynamic world lighting
  const primaryStar = (sim.star?.alive ? sim.star : null)
   || sim.entities.find(e => e.alive && e.kind === 'star')
   || sim.entities.find(e => e.alive && e.kind === 'neutron')
   || sim.entities.find(e => e.alive && e.kind === 'bh');
  if (lightPosition && primaryStar) {
   lightPosition.lerp(primaryStar.pos, 0.25);
  }

  // Decay flares & slingshot flashes
  for (const e of sim.entities) {
   if (e.flare) e.flare *= Math.exp(-dtReal * 1.15);
   if (e.slingshotFlash) e.slingshotFlash *= Math.exp(-dtReal * 1.2);
  }
  bloomSurge *= Math.exp(-dtReal * 1.6);
  rippleSurge *= Math.exp(-dtReal * 1.8);

  // Alkaid original mesh pose
  const st = sim.star;
  if (st && st.alive) {
   const tidalBH = st._tidalTarget?.alive ? st._tidalTarget : (sim.bh?.alive ? sim.bh : null);
   const sbDist = tidalBH ? st.pos.distanceTo(tidalBH.pos) : 999;
   const starTidal = tidalBH ? THREE.MathUtils.smoothstep(sbDist, 66, 20) * THREE.MathUtils.clamp(tidalBH.mass / 12.4, 0.4, 2.2) : 0;
   const scaleMul = st.radius / STAR_RADIUS;
   const ox = st.oblateXZ || 1, oy = st.oblateY || 1;
   if (star) {
    star.visible = true;
    star.position.copy(st.pos);
    const stretch = 1 + Math.min(0.45, starTidal * 0.22 + (st.tidalStress || 0) * 0.35);
    const squash = 1 / Math.sqrt(stretch);
    star.scale.set(baseStarScale.x * scaleMul * stretch * ox, baseStarScale.y * scaleMul * squash * oy, baseStarScale.z * scaleMul * squash * ox);
    if (tidalBH && starTidal > 0.05) star.rotation.y = -Math.atan2(tidalBH.pos.z - st.pos.z, tidalBH.pos.x - st.pos.x);
    else star.rotation.y = st.spinAngle || 0;
   }
   if (corona) {
    corona.visible = true;
    corona.position.copy(st.pos);
    corona.scale.set(
     baseCoronaScale.x * scaleMul * ox * (1 + Math.min(0.32, starTidal * 0.08 + (st.flare || 0) * 0.20)),
     baseCoronaScale.y * scaleMul * oy * (1 + Math.min(0.32, starTidal * 0.08 + (st.flare || 0) * 0.20)),
     baseCoronaScale.z * scaleMul * ox * (1 + Math.min(0.32, starTidal * 0.08 + (st.flare || 0) * 0.20))
    );
   }
   if (halo) {
    halo.visible = true;
    halo.position.copy(st.pos);
   }
  }

  // Dynamic Stellar Roche-Lobe Plasma Bridge between closest alive Star & BH
  let closestPair = null;
  let closestDist = Infinity;
  for (const a of sim.entities) {
   if (!a.alive || a.kind !== 'star') continue;
   for (const b of sim.entities) {
    if (!b.alive || b.kind !== 'bh') continue;
    const d = a.pos.distanceTo(b.pos);
    if (d < closestDist) {
     closestDist = d;
     closestPair = [a, b];
    }
   }
  }
  if (closestPair) {
   const [pSt, pBh] = closestPair;
   const bridgeStrength = THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(closestDist, 64, 24) * Math.min(1.35, pBh.mass / 10), 0, 1);
   if (bridgeStrength > 0.01) {
    rocheVeil.visible = true;
    vA.copy(pBh.pos).sub(pSt.pos);
    vB.copy(vA).divideScalar(Math.max(closestDist, 1));
    vC.crossVectors(vB, vUp);
    if (vC.lengthSq() < 1e-4) vC.set(1, 0, 0);
    else vC.normalize();
    const start = pSt.pos.clone().addScaledVector(vB, pSt.radius);
    const c1 = start.clone().lerp(pBh.pos, 0.35).addScaledVector(vC, closestDist * 0.19).add(new THREE.Vector3(0, 1.8, 0));
    const c2 = start.clone().lerp(pBh.pos, 0.76).addScaledVector(vC, closestDist * 0.13).add(new THREE.Vector3(0, 0.9, 0));
    const vAttr = rocheVeil.geometry.attributes.position;
    for (let i = 0; i <= veilSegs; i++) {
     const t = i / veilSegs, omt = 1 - t;
     const x = omt * omt * omt * start.x + 3 * omt * omt * t * c1.x + 3 * omt * t * t * c2.x + t * t * t * pBh.pos.x;
     const y = omt * omt * omt * start.y + 3 * omt * omt * t * c1.y + 3 * omt * t * t * c2.y + t * t * t * pBh.pos.y;
     const z = omt * omt * omt * start.z + 3 * omt * omt * t * c1.z + 3 * omt * t * t * c2.z + t * t * t * pBh.pos.z;
     const halfW = (2.8 * (1 - t * 0.70) + 0.48) * (0.65 + 0.35 * Math.sin(t * Math.PI));
     vAttr.setXYZ(i * 2, x - vC.x * halfW, y - 0.3 * halfW, z - vC.z * halfW);
     vAttr.setXYZ(i * 2 + 1, x + vC.x * halfW, y + 0.3 * halfW, z + vC.z * halfW);
    }
    vAttr.needsUpdate = true;
    veilUniforms.uAge.value = simAge;
    veilUniforms.uStrength.value = bridgeStrength;
   } else {
    rocheVeil.visible = false;
   }
  } else {
   rocheVeil.visible = false;
  }

  // Update all original planets + dynamic spawned bodies
  const aliveStarsForEra = sim.entities.filter(x => x.alive && x.kind === 'star');
  for (const e of sim.entities) {
   const tempHeat = isLightKind(e.kind) && e.kind !== 'probe' ? THREE.MathUtils.smoothstep(e.temperature || 280, 1050, 2650) : 0;
   const tempFrost = isLightKind(e.kind) && e.kind !== 'probe' ? THREE.MathUtils.smoothstep(185, 55, e.temperature || 280) : 0;
   const spinGlow = THREE.MathUtils.smoothstep(e._spinRatio || 0, 0.78, 1.22);
   const ox = e.oblateXZ || 1;
   const oy = e.oblateY || 1;

   if (e.isOriginal && e.kind === 'planet') {
    const pv = e.visual;
    const b = e.body;
    if (e.alive) {
     b.root.visible = true;
     b.root.position.copy(e.pos);
     const scaleFactor = e.radius / e.baseRadius;
     b.surface.rotation.y = e.spinAngle || 0;
     b.surface.scale.set(e.radius * ox, e.radius * oy, e.radius * ox);
     if (b.clouds) {
      b.clouds.rotation.y = (e.spinAngle || 0) * 1.15;
      b.clouds.scale.set(e.radius * 1.012 * ox, e.radius * 1.012 * oy, e.radius * 1.012 * ox);
     }
     if (b.atmosphere) {
      b.atmosphere.rotation.z = b.tilt ? b.tilt.rotation.z : 0;
      b.atmosphere.scale.set(e.radius * 1.06 * ox, e.radius * 1.06 * oy, e.radius * 1.06 * ox);
     }
     if (b.ring) {
      b.ring.scale.setScalar(scaleFactor * Math.max(1, ox * 0.94));
      b.ring.material.uniforms.uCenter.value.copy(e.pos);
     }
     if (e.tidalStress > 0.015 && e._tidalTarget) {
      const stretch = 1 + e.tidalStress * 1.48;
      const squash = 1 / Math.sqrt(stretch);
      vB.copy(e._tidalTarget.pos).sub(e.pos).normalize();
      qTmp.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vB);
      b.root.quaternion.copy(qTmp);
      b.root.scale.set(stretch, squash, squash);
     } else {
      b.root.quaternion.identity();
      b.root.scale.set(1, 1, 1);
     }
     const effHeat = Math.max(e.lavaHeat || 0, tempHeat);
     const crustEnergy = Math.max(effHeat, e.tidalStress || 0, tempFrost * 0.6, spinGlow);
     if (crustEnergy > 0.008) {
      pv.crust.mesh.visible = true;
      pv.crust.mesh.rotation.y = e.spinAngle || 0;
      pv.crust.mesh.scale.set(e.radius * 1.028 * ox, e.radius * 1.028 * oy, e.radius * 1.028 * ox);
      pv.crust.uniforms.uTime.value = simAge;
      pv.crust.uniforms.uHeat.value = effHeat;
      pv.crust.uniforms.uTidal.value = e.tidalStress || 0;
      pv.crust.uniforms.uFrost.value = tempFrost;
      pv.crust.uniforms.uSpinGlow.value = spinGlow;
      pv.crust.uniforms.uImpactDir.value.copy(e.impactDir);
     } else {
      pv.crust.mesh.visible = false;
     }
     pushTrail(pv.history, pv.trail, e.pos, 0.66);
     const refPos = primaryStar ? primaryStar.pos : sim.barycenter;
     const eraTag = aliveStarsForEra.length >= 3 ? computeEraTag(e.pos, aliveStarsForEra) : null;
     const tag = e.pinned
      ? '📌 锚定'
      : e.mergedCount > 0
       ? `合并 ×${e.mergedCount + 1}`
       : e.tidalStress > 0.25
        ? '洛希撕裂中'
        : eraTag || `${(e.pos.distanceTo(refPos) / 31.4).toFixed(2)} AU`;
     const small = b.label.querySelector('small');
     if (small && small.textContent !== tag) small.textContent = tag;
    } else {
     e.trailFade = Math.max(0, e.trailFade - dtReal * 0.14);
     pv.trail.material.opacity = 0.52 * e.trailFade;
    }
   } else if (!e.isOriginal && e.dynVisual) {
    if (e.alive) {
     e.dynVisual.root.visible = true;
     e.dynVisual.root.position.copy(e.pos);
     if ((e.kind === 'planet' || e.kind === 'moon' || e.kind === 'comet' || e.kind === 'star') && e.tidalStress > 0.015 && e._tidalTarget) {
      const stretch = 1 + e.tidalStress * (e.kind === 'star' ? 0.55 : 1.45);
      const squash = 1 / Math.sqrt(stretch);
      vB.copy(e._tidalTarget.pos).sub(e.pos).normalize();
      qTmp.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vB);
      e.dynVisual.root.quaternion.copy(qTmp);
      e.dynVisual.root.scale.set(stretch, squash, squash);
     } else if (e.kind !== 'bh' && e.kind !== 'probe') {
      e.dynVisual.root.quaternion.identity();
      e.dynVisual.root.scale.set(1, 1, 1);
     }
     e.dynVisual.update(simAge, e);
     if (e.dynVisual.crust) {
      const effHeat = Math.max(e.lavaHeat || 0, tempHeat);
      const crustEnergy = Math.max(effHeat, e.tidalStress || 0, tempFrost * 0.6, spinGlow);
      if (crustEnergy > 0.008) {
       e.dynVisual.crust.mesh.visible = true;
       e.dynVisual.crust.mesh.rotation.y = e.spinAngle || 0;
       e.dynVisual.crust.mesh.scale.set(e.radius * 1.032 * ox, e.radius * 1.032 * oy, e.radius * 1.032 * ox);
       e.dynVisual.crust.uniforms.uTime.value = simAge;
       e.dynVisual.crust.uniforms.uHeat.value = effHeat;
       e.dynVisual.crust.uniforms.uTidal.value = e.tidalStress || 0;
       e.dynVisual.crust.uniforms.uFrost.value = tempFrost;
       e.dynVisual.crust.uniforms.uSpinGlow.value = spinGlow;
       e.dynVisual.crust.uniforms.uImpactDir.value.copy(e.impactDir);
      } else {
       e.dynVisual.crust.mesh.visible = false;
      }
     }
     pushTrail(e.history, e.trail, e.pos, e.kind === 'probe' ? 0.92 : 0.62);
    } else if (e.trail) {
     e.trailFade = Math.max(0, e.trailFade - dtReal * 0.14);
     e.trail.material.opacity = 0.50 * e.trailFade;
    }
   }
  }

  // Shockwaves & volumetric flashes
  for (const s of shocks) {
   if (!s.active) continue;
   s.age += dtReal;
   if (s.age >= s.dur) {
    s.active = false;
    s.ring.visible = false;
    s.flash.visible = false;
    continue;
   }
   const u = s.age / s.dur;
   const r = 1.0 + Math.pow(u, 0.56) * s.maxRadius;
   s.ring.scale.setScalar(r);
   s.ringUniforms.uAge.value = s.age;
   s.ringUniforms.uFade.value = THREE.MathUtils.smoothstep(u, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(u, 0.28, 1.0));
   s.flash.quaternion.copy(camera.quaternion);
   const fFade = Math.exp(-s.age * 2.8) * (1 - u);
   s.flash.scale.setScalar(s.flashSize * (0.65 + u * 0.85));
   s.flashUniforms.uFade.value = fFade;
  }

  // Spacetime metric grid: top 4 heavy wells + expanding GW ripple
  const topHeavy = sim.entities
   .filter(e => e.alive && (e.kind === 'bh' || e.kind === 'star' || e.kind === 'neutron'))
   .sort((a, b) => b.mass - a.mass)
   .slice(0, 4);
  for (let i = 0; i < 4; i++) {
   if (topHeavy[i]) {
    wellUniforms[i].set(topHeavy[i].pos.x, topHeavy[i].pos.y, topHeavy[i].pos.z, topHeavy[i].mass);
   } else {
    wellUniforms[i].set(0, 0, 0, 0);
   }
  }
  if (gwWave.active) {
   gwWave.radius += gwWave.speed * dtReal;
   gwWave.amp *= Math.exp(-dtReal * 0.72);
   if (gwWave.amp < 0.015 || gwWave.radius > 260) {
    gwWave.active = false;
    gwWave.amp = 0;
   }
  }
  gridUniforms.uGwOrigin.value.copy(gwWave.origin);
  gridUniforms.uGwRadius.value = gwWave.radius;
  gridUniforms.uGwAmp.value = gwWave.amp;
  gridUniforms.uPhase.value = simAge;
  gridUniforms.uStrength.value = config.overlays ? 0.94 : (gwWave.active ? 0.65 : 0.40);

  if (belt) belt.position.lerp(sim.barycenter, 0.06);

  // Optional Physics Overlays (Roche ring on heaviest BH, barycenter, velocity arrows)
  overlaysGroup.visible = config.overlays;
  if (config.overlays) {
   const topBH = topHeavy.find(e => e.kind === 'bh') || null;
   rocheLimitRing.visible = !!topBH;
   captureRing.visible = !!topBH;
   if (topBH) {
    const refRoche = rocheRadiusFor(3.0, topBH.mass, topBH.radius);
    rocheLimitRing.position.copy(topBH.pos);
    rocheLimitRing.scale.setScalar(refRoche);
    rocheLimitRing.rotation.y = simAge * 0.18;
    captureRing.position.copy(topBH.pos);
    captureRing.scale.setScalar(topBH.radius * 3.1);
   }
   baryLink.visible = topHeavy.length >= 2;
   if (topHeavy.length >= 2) {
    const bArr = baryLink.geometry.attributes.position;
    bArr.setXYZ(0, topHeavy[0].pos.x, topHeavy[0].pos.y, topHeavy[0].pos.z);
    bArr.setXYZ(1, topHeavy[1].pos.x, topHeavy[1].pos.y, topHeavy[1].pos.z);
    bArr.needsUpdate = true;
   }
   baryReticle.position.copy(sim.barycenter);
   baryReticle.rotation.y = simAge * 0.5;

   const movers = sim.entities.filter(e => e.alive && (e.kind === 'planet' || e.kind === 'probe' || e.kind === 'comet' || e.kind === 'neutron')).slice(0, MAX_ARROWS);
   for (let i = 0; i < MAX_ARROWS; i++) {
    const arrow = velArrows[i];
    const p = movers[i];
    if (!p) { arrow.visible = false; continue; }
    const spd = p.vel.length();
    if (spd < 0.05) { arrow.visible = false; continue; }
    arrow.visible = true;
    arrow.material.color.copy(p.color);
    const len = Math.min(24, Math.max(3.5, spd * 1.15));
    const dir = vA.copy(p.vel).divideScalar(spd);
    const side = vB.crossVectors(dir, vUp);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    else side.normalize();
    const startX = p.pos.x + dir.x * (p.radius + 0.6);
    const startY = p.pos.y + dir.y * (p.radius + 0.6);
    const startZ = p.pos.z + dir.z * (p.radius + 0.6);
    const tipX = startX + dir.x * len, tipY = startY + dir.y * len, tipZ = startZ + dir.z * len;
    const aPos = arrow.geometry.attributes.position;
    aPos.setXYZ(0, startX, startY, startZ);
    aPos.setXYZ(1, tipX, tipY, tipZ);
    aPos.setXYZ(2, tipX, tipY, tipZ);
    aPos.setXYZ(3, tipX - dir.x * 1.65 + side.x * 0.85, tipY - dir.y * 1.65, tipZ - dir.z * 1.65 + side.z * 0.85);
    aPos.setXYZ(4, tipX, tipY, tipZ);
    aPos.setXYZ(5, tipX - dir.x * 1.65 - side.x * 0.85, tipY - dir.y * 1.65, tipZ - dir.z * 1.65 - side.z * 0.85);
    aPos.needsUpdate = true;
   }
  }

  updateInteractiveGuides();
 }

 function pushTrail(history, trail, pos, opacity) {
  const last = history[history.length - 1];
  if (!last || last.distanceToSquared(pos) > 0.42) {
   history.push(pos.clone());
   if (history.length > TRAIL_LEN) history.shift();
  }
  const arr = trail.geometry.attributes.position;
  for (let j = 0; j < history.length; j++) {
   const pt = history[j];
   arr.setXYZ(j, pt.x, pt.y, pt.z);
  }
  arr.needsUpdate = true;
  trail.geometry.setDrawRange(0, history.length);
  trail.material.opacity = opacity;
 }

 function updateLabels(show = true) {
  if (!active || !sim) {
   dynamicLabelsEl.hidden = true;
   return;
  }
  dynamicLabelsEl.hidden = !show;
  if (!show) return;

  for (const e of sim.entities) {
   if (e.isOriginal || !e.labelEl) continue;
   if (!e.alive) {
    e.labelEl.hidden = true;
    continue;
   }
   vA.copy(e.pos).project(camera);
   const x = (vA.x * 0.5 + 0.5) * innerWidth;
   const y = (-vA.y * 0.5 + 0.5) * innerHeight;
   const out = vA.z > 1 || vA.z < -1 || x < 24 || x > innerWidth - 80 || y < 86 || y > innerHeight - 135;
   e.labelEl.hidden = out;
   if (out) continue;
   const dist = Math.max(camera.position.distanceTo(e.pos), 1);
   const screenR = (e.radius / dist) * innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
   e.labelEl.style.left = `${x.toFixed(1)}px`;
   e.labelEl.style.top = `${(y + Math.max(16, Math.min(48, screenR + 14))).toFixed(1)}px`;
   const small = e.labelEl.querySelector('small');
   if (small) {
    if (e.kind === 'probe') {
     const mult = e.baseSpeed > 0.5 ? (e.vel.length() / e.baseSpeed) : 1;
     small.textContent = `${(e.vel.length() * 6.5).toFixed(0)} km/s${mult >= 1.35 ? ` · ${mult.toFixed(1)}×Δv` : ''}`;
    } else if (e.kind === 'bh' || e.kind === 'star' || e.kind === 'neutron') {
     small.textContent = `${e.mass.toFixed(1)} M☉`;
    } else {
     small.textContent = e.mergedCount > 0 ? `合并 ×${e.mergedCount + 1}` : `${(e.vel.length() * 6.5).toFixed(0)} km/s`;
    }
   }
  }
 }

 // ==========================================================================
 // 12. CAMERA FREEDOM (FOLLOW-CAM, QUICK VIEWS, WASD/QE FREE FLIGHT)
 // ==========================================================================
 function setCameraView(preset, immediate = false) {
  if (!active || !sim) return;
  const sp = Math.max(1.0, sim.spreadUsed || config.orbitSpread || 1.0);
  const center = (followEntity && followEntity.alive) ? followEntity.pos.clone() : sim.barycenter.clone();
  let targetPos = center.clone();
  let camPos;
  if (preset === 'top') {
   followEntity = null;
   targetPos.copy(sim.barycenter);
   camPos = targetPos.clone().add(new THREE.Vector3(0, Math.min(540, 230 * sp), 0.2));
  } else if (preset === 'side') {
   followEntity = null;
   targetPos.copy(sim.barycenter);
   camPos = targetPos.clone().add(new THREE.Vector3(0, 22 * Math.sqrt(sp), Math.min(500, 220 * sp)));
  } else if (preset === 'barycenter') {
   followEntity = null;
   targetPos.copy(sim.barycenter);
   camPos = targetPos.clone().add(new THREE.Vector3(-42 * Math.sqrt(sp), 96 * Math.sqrt(sp), 185 * Math.sqrt(sp)));
  } else {
   // 'overview' frames Alkaid, expanded planet disk, and outer Guixu cleanly!
   followEntity = null;
   const shiftX = sp >= 1.35 ? -68 * (sp / 2.0) : -14;
   targetPos.set(shiftX, 0, sp >= 1.35 ? 16 : 4);
   camPos = new THREE.Vector3(shiftX - 18, Math.min(290, 142 * (0.55 + sp * 0.48)), Math.min(540, 265 * (0.55 + sp * 0.48)));
  }
  if (immediate) {
   camAnim = null;
   camera.position.copy(camPos);
   controls.target.copy(targetPos);
   controls.update();
  } else {
   camAnim = {
    start: performance.now(),
    dur: 720,
    fromPos: camera.position.clone(),
    toPos: camPos,
    fromTarget: controls.target.clone(),
    toTarget: targetPos
   };
  }
  updateCamBarUI();
 }

 function followBody(idOrEntity) {
  if (!active || !sim) return false;
  if (!idOrEntity) {
   followEntity = null;
   updateCamBarUI();
   updateInspectorUI();
   return true;
  }
  const ent = typeof idOrEntity === 'string'
   ? sim.entities.find(e => e.id === idOrEntity && e.alive)
   : (idOrEntity.alive ? idOrEntity : null);
  if (!ent) return false;
  followEntity = ent;
  followLastPos.copy(ent.pos);
  const standOff = Math.max(ent.radius * 7.5, ent.kind === 'bh' ? 32 : 24);
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1) dir.set(0, 0.4, 1);
  dir.normalize();
  camAnim = {
   start: performance.now(),
   dur: 580,
   fromPos: camera.position.clone(),
   toPos: ent.pos.clone().addScaledVector(dir, standOff),
   fromTarget: controls.target.clone(),
   toTarget: ent.pos.clone(),
   followTarget: ent
  };
  updateCamBarUI();
  updateInspectorUI();
  return true;
 }

 function selectEntity(idOrEntity) {
  if (!active || !sim) {
   selectedEntity = null;
   updateInspectorUI();
   return null;
  }
  if (!idOrEntity) {
   selectedEntity = null;
   updateInspectorUI();
   return null;
  }
  const ent = typeof idOrEntity === 'string'
   ? sim.entities.find(e => e.id === idOrEntity && e.alive)
   : (idOrEntity.alive ? idOrEntity : null);
  selectedEntity = ent || null;
  updateInspectorUI();
  return selectedEntity;
 }

 function updateCameraMotion(dtReal) {
  if (!active || !sim) return;

  // Smooth one-shot camera framing transition
  if (camAnim) {
   const u = Math.min(1, (performance.now() - camAnim.start) / camAnim.dur);
   const ease = 1 - Math.pow(1 - u, 3);
   if (camAnim.followTarget && camAnim.followTarget.alive) {
    const shift = camAnim.followTarget.pos.clone().sub(camAnim.toTarget);
    camAnim.toPos.add(shift);
    camAnim.toTarget.copy(camAnim.followTarget.pos);
    followLastPos.copy(camAnim.followTarget.pos);
   }
   camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease);
   controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, ease);
   if (u >= 1) camAnim = null;
  } else if (followEntity) {
   if (followEntity.alive) {
    vA.copy(followEntity.pos).sub(followLastPos);
    camera.position.add(vA);
    controls.target.add(vA);
    followLastPos.copy(followEntity.pos);
   } else {
    followEntity = null;
    updateCamBarUI();
    updateInspectorUI();
   }
  }

  // WASD + QE free 3D flight!
  if (keysHeld.size > 0 && dtReal > 0) {
   let fwd = 0, right = 0, vert = 0;
   if (keysHeld.has('KeyW')) fwd += 1;
   if (keysHeld.has('KeyS')) fwd -= 1;
   if (keysHeld.has('KeyD')) right += 1;
   if (keysHeld.has('KeyA')) right -= 1;
   if (keysHeld.has('KeyE')) vert += 1;
   if (keysHeld.has('KeyQ')) vert -= 1;

   if (fwd || right || vert) {
    camAnim = null;
    if (followEntity) {
     followEntity = null;
     updateCamBarUI();
     updateInspectorUI();
    }
    const camDist = camera.position.distanceTo(controls.target);
    const boost = keysHeld.has('ShiftLeft') || keysHeld.has('ShiftRight') ? 2.4 : 1.0;
    const speed = Math.max(40, Math.min(260, camDist * 0.72)) * boost * dtReal;

    camera.getWorldDirection(vA);
    vA.y = 0;
    if (vA.lengthSq() < 1e-4) vA.set(0, 0, -1);
    else vA.normalize();
    vB.crossVectors(vA, vUp).normalize();
    vC.set(0, 0, 0)
     .addScaledVector(vA, fwd * speed)
     .addScaledVector(vB, right * speed)
     .addScaledVector(vUp, vert * speed);
    camera.position.add(vC);
    controls.target.add(vC);
   }
  }
 }

 controls.addEventListener('start', () => {
  if (active) camAnim = null;
 });

 // ==========================================================================
 // 13. INTERACTIVE PICKING, GRAB & FLING, AND SLINGSHOT SPAWNING
 // ==========================================================================
 const drag = {
  hovered: null,
  target: null,
  pointerId: null,
  downX: 0,
  downY: 0,
  lastPos: new THREE.Vector3(),
  throwVel: new THREE.Vector3(),
  lastMoveMs: 0,
  moved: false
 };

 const spawnDrag = {
  active: false,
  pointerId: null,
  anchorPos: new THREE.Vector3(),
  launchVel: new THREE.Vector3(),
  hoverPos: new THREE.Vector3(),
  hoverValid: false,
  pulled: false,
  downX: 0,
  downY: 0,
  clientX: 0,
  clientY: 0
 };

 // Floating Live Aim / Launch Speed HUD Tooltip right next to cursor!
 const aimHud = document.createElement('div');
 aimHud.id = 'sb-aim-hud';
 aimHud.hidden = true;
 aimHud.innerHTML = '<strong id="sb-aim-spd">0 km/s</strong><span id="sb-aim-sub"></span>';
 document.body.append(aimHud);

 function updateAimHud(show, clientX, clientY, pos, vel, subjectKind, previewRes = null) {
  if (!show || !active || !sim) {
   aimHud.hidden = true;
   return;
  }
  const attr = dominantAttractorNear(pos, drag.target || null, subjectKind);
  const spd = vel.length();
  const kmS = (spd * 6.5).toFixed(0);
  let verdict = spd < 0.08 ? '静止放置' : '自由飞行';
  let ratioLine = '';
  let toneCls = 'cruise';

  if (attr) {
   const G = Math.abs(gUnit()) * pairGravityMult(subjectKind, attr.kind);
   const r = Math.max(pos.distanceTo(attr.pos), attr.radius * 1.85 + 2.2);
   const vCirc = Math.sqrt((G * attr.mass) / r);
   const vEsc = vCirc * Math.SQRT2;
   const vRel = vel.clone().sub(attr.vel).length();
   const cRat = vCirc > 0.01 ? vRel / vCirc : 0;
   const eRat = vEsc > 0.01 ? vRel / vEsc : 0;
   if (previewRes?.dangerHit) { verdict = '坠落撞击'; toneCls = 'danger'; }
   else if (previewRes?.isSlingshot) { verdict = '引力弹弓!'; toneCls = 'gold'; }
   else if (spd < 0.08) { verdict = '静止放置'; toneCls = 'still'; }
   else if (eRat >= 1.0) { verdict = '逃逸抛射'; toneCls = 'gold'; }
   else if (Math.abs(cRat - 1) <= 0.16) { verdict = `环绕 ${attr.name} 圆轨`; toneCls = 'cruise'; }
   else { verdict = `环绕 ${attr.name} 椭圆`; toneCls = 'cruise'; }
   ratioLine = `${cRat.toFixed(2)}×圆轨 · ${eRat.toFixed(2)}×逃逸 · ${verdict}`;
  } else {
   ratioLine = verdict;
  }

  aimHud.hidden = false;
  aimHud.dataset.tone = toneCls;
  aimHud.querySelector('#sb-aim-spd').textContent = spd < 0.08 ? '0 km/s · 静止' : `${kmS} km/s`;
  aimHud.querySelector('#sb-aim-sub').textContent = ratioLine;
  const x = Math.min(innerWidth - 235, Math.max(12, clientX + 18));
  const y = Math.min(innerHeight - 130, Math.max(18, clientY - 46));
  aimHud.style.left = `${x.toFixed(0)}px`;
  aimHud.style.top = `${y.toFixed(0)}px`;
 }

 function pickSandboxEntity(clientX, clientY) {
  if (!active || !sim) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  const ray = raycaster.ray;

  let best = null;
  let bestScore = Infinity;
  // Every alive body is pickable — including Alkaid, stars, BHs, pulsars, planets & probes!
  for (const e of sim.entities) {
   if (!e.alive) continue;
   const distAlong = ray.direction.dot(vA.copy(e.pos).sub(ray.origin));
   if (distAlong < 0) continue;
   const closestPt = vB.copy(ray.origin).addScaledVector(ray.direction, distAlong);
   const perp = closestPt.distanceTo(e.pos);
   const pickR = e.kind === 'bh'
    ? Math.max(e.radius * 3.8, 7.5)
    : e.kind === 'star'
     ? Math.max(e.radius * 1.55, 6.8)
     : Math.max(e.radius * 2.15, 4.6);
   if (perp < pickR) {
    const score = perp / pickR + distAlong * 0.0004;
    if (score < bestScore) {
     bestScore = score;
     best = e;
    }
   }
  }
  return best;
 }

 function rayToPlane(clientX, clientY, planeY, outVec) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  dragPlane.set(vUp, -planeY);
  if (!raycaster.ray.intersectPlane(dragPlane, outVec)) return false;
  const len = Math.hypot(outVec.x, outVec.z);
  if (len > ARENA_LIMIT) {
   outVec.x *= ARENA_LIMIT / len;
   outVec.z *= ARENA_LIMIT / len;
  }
  outVec.y = planeY;
  return true;
 }

 function updateAimArrow(origin, vel) {
  const spd = vel.length();
  if (spd < 0.35) {
   aimArrow.visible = false;
   return;
  }
  aimArrow.visible = true;
  const len = Math.min(44, Math.max(5, spd * 1.45));
  const dir = vA.copy(vel).divideScalar(spd);
  const side = vB.crossVectors(dir, vUp);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  else side.normalize();
  const tx = origin.x + dir.x * len, ty = origin.y + dir.y * len, tz = origin.z + dir.z * len;
  const arr = aimArrow.geometry.attributes.position;
  arr.setXYZ(0, origin.x, origin.y, origin.z);
  arr.setXYZ(1, tx, ty, tz);
  arr.setXYZ(2, tx, ty, tz);
  arr.setXYZ(3, tx - dir.x * 2.4 + side.x * 1.25, ty - dir.y * 2.4, tz - dir.z * 2.4 + side.z * 1.25);
  arr.setXYZ(4, tx, ty, tz);
  arr.setXYZ(5, tx - dir.x * 2.4 - side.x * 1.25, ty - dir.y * 2.4, tz - dir.z * 2.4 - side.z * 1.25);
  arr.needsUpdate = true;
 }

 function updateTrajectoryPreview(startPos, startVel, excludeEntity = null, bodyRadius = 2.0, subjectKind = 'planet') {
  if (!sim) { previewLine.visible = false; return { dangerHit: false, isSlingshot: false, peakSpd: 0 }; }
  previewLine.visible = true;
  const G = gUnit();
  const pPos = startPos.clone();
  const pVel = startVel.clone();
  const initSpd = Math.max(startVel.length(), 1.0);
  let peakSpd = initSpd;
  let dangerHit = false;

  const posArr = previewLine.geometry.attributes.position;
  const colArr = previewLine.geometry.attributes.color;
  const stepH = 0.095;

  for (let i = 0; i < PREVIEW_STEPS; i++) {
   posArr.setXYZ(i, pPos.x, pPos.y, pPos.z);
   let ax = 0, ay = 0, az = 0;
   for (const o of sim.entities) {
    if (!o.alive || o === excludeEntity) continue;
    const dx = o.pos.x - pPos.x, dy = o.pos.y - pPos.y, dz = o.pos.z - pPos.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    const dangerR = o.kind === 'bh' ? o.radius * 3.8 : (o.radius + bodyRadius) * 0.98;
    if (r2 < dangerR * dangerR) dangerHit = true;
    const soft = !isLightKind(o.kind) ? (o.radius + bodyRadius) * 0.28 + 0.95 : (o.radius + bodyRadius) * 0.20 + 0.35;
    const pairG = G * pairGravityMult(subjectKind, o.kind);
    const inv = (pairG * o.mass) / Math.pow(r2 + soft * soft, 1.5);
    ax += dx * inv; ay += dy * inv; az += dz * inv;
   }
   pVel.x += ax * stepH; pVel.y += ay * stepH; pVel.z += az * stepH;
   pPos.x += pVel.x * stepH; pPos.y += pVel.y * stepH; pPos.z += pVel.z * stepH;
   const spd = pVel.length();
   if (spd > peakSpd) peakSpd = spd;
  }

  // Color-code trajectory: coral-red = impact/TDE, gold = high-Δv slingshot, cyan = cruise
  const isSlingshot = !dangerHit && peakSpd >= initSpd * 1.45;
  const cr = dangerHit ? 1.0 : isSlingshot ? 1.0 : 0.45;
  const cg = dangerHit ? 0.36 : isSlingshot ? 0.80 : 0.90;
  const cb = dangerHit ? 0.24 : isSlingshot ? 0.30 : 1.0;
  for (let i = 0; i < PREVIEW_STEPS; i++) {
   const fade = 1 - (i / (PREVIEW_STEPS - 1)) * 0.85;
   colArr.setXYZ(i, cr * fade, cg * fade, cb * fade);
  }
  posArr.needsUpdate = true;
  colArr.needsUpdate = true;
  return { dangerHit, isSlingshot, peakSpd };
 }

 function computePlannedSpawnVelocity(pos, def) {
  if (spawnDrag.active && spawnDrag.pulled) return spawnDrag.launchVel.clone();
  if (config.spawnMode === 'stationary') return new THREE.Vector3(0, 0, 0);
  const attr = dominantAttractorNear(pos, null, def.kind);
  return circularVelocityAround(pos, attr, def.kind, config.spawnRetrograde);
 }

 function updateInteractiveGuides() {
  // Selection reticle
  if (active && selectedEntity && selectedEntity.alive) {
   selectRing.visible = true;
   selectRing.position.copy(selectedEntity.pos);
   const sr = selectedEntity.kind === 'bh' ? selectedEntity.radius * 3.8 : Math.max(selectedEntity.radius * 1.65, 2.2);
   selectRing.scale.setScalar(sr);
   selectRing.rotation.y = simAge * 0.7;
  } else {
   selectRing.visible = false;
  }

  // Hover / Grab halo
  const focus = drag.target || drag.hovered;
  if (active && focus && focus.alive && config.tool !== 'spawn') {
   hoverRing.visible = true;
   hoverRing.position.copy(focus.pos);
   const r = focus.kind === 'bh' ? focus.radius * 3.6 : Math.max(focus.radius * 1.8, 2.4);
   hoverRing.scale.setScalar(r * (drag.target ? 1.12 : 1.0));
   hoverRing.material.color.setHex(drag.target ? 0xffd59c : 0xd6ecff);
  } else {
   hoverRing.visible = false;
  }

  // Spawn ghost ring & elevation stem
  if (active && config.tool === 'spawn' && (spawnDrag.active || spawnDrag.hoverValid)) {
   const p = spawnDrag.active ? spawnDrag.anchorPos : spawnDrag.hoverPos;
   const def = SPAWN_CATALOG.find(c => c.id === config.spawnType) || SPAWN_CATALOG[0];
   spawnGhostRing.visible = true;
   spawnGhostRing.position.copy(p);
   spawnGhostRing.scale.setScalar(Math.max(def.radius * 1.35, 2.0));
   spawnGhostRing.material.color.set(def.color);
   if (Math.abs(p.y) > 0.25) {
    spawnStem.visible = true;
    const sArr = spawnStem.geometry.attributes.position;
    sArr.setXYZ(0, p.x, 0, p.z);
    sArr.setXYZ(1, p.x, p.y, p.z);
    sArr.needsUpdate = true;
   } else {
    spawnStem.visible = false;
   }
  } else {
   spawnGhostRing.visible = false;
   spawnStem.visible = false;
  }

  // Trajectory preview, aim arrow & Live Cursor Velocity HUD!
  if (active && spawnDrag.active) {
   const def = SPAWN_CATALOG.find(c => c.id === config.spawnType) || SPAWN_CATALOG[0];
   const vel = computePlannedSpawnVelocity(spawnDrag.anchorPos, def);
   updateAimArrow(spawnDrag.anchorPos, vel);
   const res = updateTrajectoryPreview(spawnDrag.anchorPos, vel, null, def.radius, def.kind);
   updateAimHud(true, spawnDrag.clientX, spawnDrag.clientY, spawnDrag.anchorPos, vel, def.kind, res);
  } else if (active && config.tool === 'spawn' && spawnDrag.hoverValid) {
   const def = SPAWN_CATALOG.find(c => c.id === config.spawnType) || SPAWN_CATALOG[0];
   const vel = computePlannedSpawnVelocity(spawnDrag.hoverPos, def);
   updateAimArrow(spawnDrag.hoverPos, vel);
   const res = updateTrajectoryPreview(spawnDrag.hoverPos, vel, null, def.radius, def.kind);
   updateAimHud(true, spawnDrag.clientX, spawnDrag.clientY, spawnDrag.hoverPos, vel, def.kind, res);
  } else if (active && drag.target && drag.target.alive) {
   updateAimArrow(drag.target.pos, drag.throwVel);
   const res = updateTrajectoryPreview(drag.target.pos, drag.throwVel, drag.target, drag.target.radius, drag.target.kind);
   updateAimHud(true, spawnDrag.clientX, spawnDrag.clientY, drag.target.pos, drag.throwVel, drag.target.kind, res);
  } else {
   aimArrow.visible = false;
   previewLine.visible = false;
   aimHud.hidden = true;
  }
 }

 function endDrag(applyThrow = true) {
  if (!drag.target) return;
  const entity = drag.target;
  if (applyThrow && entity.alive) {
   if (drag.moved && performance.now() - drag.lastMoveMs < 150) {
    const maxV = entity.kind === 'bh' ? 22 : entity.kind === 'star' ? 28 : 42;
    if (drag.throwVel.length() > maxV) drag.throwVel.setLength(maxV);
    entity.vel.copy(drag.throwVel);
    entity.baseSpeed = entity.vel.length();
    entity.peakSpeed = entity.baseSpeed;
    entity.slingshotAwarded = false;
   } else if (entity.kind === 'bh' || entity.kind === 'star') {
    entity.vel.multiplyScalar(0.25);
   }
  }
  drag.target = null;
  drag.pointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = config.tool === 'grab' ? 'grab' : config.tool === 'spawn' ? 'crosshair' : '';
 }

 let lastClickInfo = { id: null, time: 0 };

 function onPointerDown(e) {
  if (!active || !sim || e.button !== 0) return;

  // SPAWN MODE: Left click or pull-back slingshot creates new body!
  if (config.tool === 'spawn' && !e.shiftKey) {
   if (!rayToPlane(e.clientX, e.clientY, config.spawnY, planeHit)) return;
   e.stopImmediatePropagation();
   spawnDrag.active = true;
   spawnDrag.pointerId = e.pointerId;
   spawnDrag.anchorPos.copy(planeHit);
   spawnDrag.launchVel.set(0, 0, 0);
   spawnDrag.pulled = false;
   spawnDrag.downX = e.clientX;
   spawnDrag.downY = e.clientY;
   spawnDrag.clientX = e.clientX;
   spawnDrag.clientY = e.clientY;
   controls.enabled = false;
   renderer.domElement.style.cursor = 'crosshair';
   try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
   return;
  }

  // GRAB MODE (or Shift+drag in Orbit mode): grab ANY body
  const wantGrab = config.tool === 'grab' || e.shiftKey;
  if (wantGrab) {
   const picked = pickSandboxEntity(e.clientX, e.clientY);
   if (!picked) return;
   e.stopImmediatePropagation();
   drag.target = picked;
   drag.pointerId = e.pointerId;
   drag.downX = e.clientX;
   drag.downY = e.clientY;
   drag.lastPos.copy(picked.pos);
   drag.throwVel.copy(picked.vel);
   drag.lastMoveMs = performance.now();
   drag.moved = false;
   dragPlane.set(vUp, -picked.pos.y);
   controls.enabled = false;
   renderer.domElement.style.cursor = 'grabbing';
   try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
   return;
  }

  // ORBIT / SELECT MODE: record click start to distinguish tap-select vs orbit-drag
  drag.downX = e.clientX;
  drag.downY = e.clientY;
 }

 function onPointerMove(e) {
  if (!active || !sim) return;
  spawnDrag.clientX = e.clientX;
  spawnDrag.clientY = e.clientY;

  if (spawnDrag.active) {
   const distPx = Math.hypot(e.clientX - spawnDrag.downX, e.clientY - spawnDrag.downY);
   if (distPx >= 10 && rayToPlane(e.clientX, e.clientY, spawnDrag.anchorPos.y, planeHit)) {
    spawnDrag.pulled = true;
    // Pull back like a slingshot -> shoot forward!
    spawnDrag.launchVel.copy(spawnDrag.anchorPos).sub(planeHit).multiplyScalar(0.58);
    if (spawnDrag.launchVel.length() > 64) spawnDrag.launchVel.setLength(64);
   } else {
    spawnDrag.pulled = false;
    spawnDrag.launchVel.set(0, 0, 0);
   }
   return;
  }

  if (drag.target) {
   if (rayToPlane(e.clientX, e.clientY, drag.target.pos.y, planeHit)) {
    const now = performance.now();
    const dtMs = Math.max(8, now - drag.lastMoveMs);
    const instVel = vA.copy(planeHit).sub(drag.target.pos).divideScalar(dtMs / 1000);
    drag.throwVel.lerp(instVel.multiplyScalar(0.42), 0.55);
    drag.target.pos.copy(planeHit);
    drag.target.vel.copy(drag.throwVel);
    drag.lastPos.copy(planeHit);
    drag.lastMoveMs = now;
    drag.moved = true;
   }
   return;
  }

  if (config.tool === 'spawn') {
   spawnDrag.hoverValid = e.target === renderer.domElement && rayToPlane(e.clientX, e.clientY, config.spawnY, spawnDrag.hoverPos);
   drag.hovered = null;
   renderer.domElement.style.cursor = 'crosshair';
   return;
  }

  drag.hovered = pickSandboxEntity(e.clientX, e.clientY);
  if (config.tool === 'grab' || e.shiftKey) {
   renderer.domElement.style.cursor = drag.hovered ? 'grab' : '';
  } else {
   renderer.domElement.style.cursor = drag.hovered ? 'pointer' : '';
  }
 }

 function onPointerUp(e) {
  if (!active || !sim) return;

  if (spawnDrag.active) {
   if (spawnDrag.pointerId !== null && e.pointerId !== spawnDrag.pointerId) return;
   try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
   const anchor = spawnDrag.anchorPos.clone();
   const vel = spawnDrag.pulled ? spawnDrag.launchVel.clone() : null;
   const opts = spawnDrag.pulled
    ? {}
    : { stationary: config.spawnMode === 'stationary', retrograde: config.spawnRetrograde };
   spawnDrag.active = false;
   spawnDrag.pointerId = null;
   controls.enabled = true;
   const spawned = spawnBody(config.spawnType, anchor, vel, opts);
   if (spawned) selectEntity(spawned);
   return;
  }

  if (drag.target) {
   if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
   try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
   const clickedEntity = !drag.moved ? drag.target : null;
   endDrag(true);
   if (clickedEntity) selectEntity(clickedEntity);
   return;
  }

  // Orbit mode single-click -> Select body; Double-click -> Follow body!
  if (config.tool === 'orbit' && e.button === 0 && Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 6) {
   const picked = pickSandboxEntity(e.clientX, e.clientY);
   if (picked) {
    const now = performance.now();
    selectEntity(picked);
    if (lastClickInfo.id === picked.id && now - lastClickInfo.time < 380) {
     followBody(picked);
     lastClickInfo = { id: null, time: 0 };
    } else {
     lastClickInfo = { id: picked.id, time: now };
    }
   } else if (e.target === renderer.domElement) {
    selectEntity(null);
   }
  }
 }

 // Alt + Wheel adjusts 3D height Y when spawning or dragging!
 function onWheel(e) {
  if (!active || !e.altKey) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const step = e.deltaY < 0 ? 3 : -3;
  if (drag.target) {
   drag.target.pos.y = THREE.MathUtils.clamp(drag.target.pos.y + step, -60, 60);
  } else {
   setSpawnY(config.spawnY + step);
  }
 }

 function onKeyDown(e) {
  if (!active) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  keysHeld.add(e.code);
  if (e.code === 'Space') {
   e.preventDefault();
   setSpeed(config.timeScale === 0 ? 1 : 0);
  } else if (e.code === 'KeyF' && selectedEntity?.alive) {
   followBody(selectedEntity);
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
   if (selectedEntity?.alive) deleteEntity(selectedEntity.id);
  }
 }
 function onKeyUp(e) {
  keysHeld.delete(e.code);
 }

 renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
 renderer.domElement.addEventListener('wheel', onWheel, { passive: false, capture: true });
 window.addEventListener('pointermove', onPointerMove, { passive: true });
 window.addEventListener('pointerup', onPointerUp);
 window.addEventListener('pointercancel', onPointerUp);
 window.addEventListener('keydown', onKeyDown);
 window.addEventListener('keyup', onKeyUp);
 window.addEventListener('blur', () => keysHeld.clear());

 // ==========================================================================
 // 14. SANDBOX HUD: EVENT BANNER, TOP-RIGHT CAMERA BAR, INSPECTOR & DOCK
 // ==========================================================================
 const banner = document.createElement('div');
 banner.id = 'sandbox-banner';
 banner.setAttribute('role', 'status');
 banner.setAttribute('aria-live', 'polite');
 banner.hidden = true;
 banner.innerHTML = '<span class="sb-banner-dot" aria-hidden="true"></span><div class="sb-banner-body"><strong id="sb-banner-title"></strong><p id="sb-banner-detail"></p></div><button id="sb-banner-act" type="button" class="sb-banner-act" hidden></button>';
 document.body.append(banner);

 function showBanner(title, detail, badge = 'event', action = null) {
  banner.dataset.kind = badge;
  banner.querySelector('#sb-banner-title').textContent = title;
  banner.querySelector('#sb-banner-detail').textContent = detail;
  const actBtn = banner.querySelector('#sb-banner-act');
  if (action && action.label && typeof action.onClick === 'function') {
   actBtn.textContent = action.label;
   actBtn.hidden = false;
   actBtn.onclick = () => {
    actBtn.hidden = true;
    action.onClick();
   };
  } else {
   actBtn.hidden = true;
   actBtn.onclick = null;
  }
  banner.hidden = false;
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  const timeoutMs = action ? 12000 : 4800;
  bannerTimer = setTimeout(() => {
   banner.classList.remove('show');
   bannerTimer = setTimeout(() => { if (!banner.classList.contains('show')) banner.hidden = true; }, 320);
  }, timeoutMs);
 }

 // Top-Right Spatial Camera Bar
 const camBar = document.createElement('aside');
 camBar.id = 'sb-cam-bar';
 camBar.setAttribute('aria-label', '空间视角控制');
 camBar.hidden = true;
 camBar.innerHTML = `
  <div class="sb-cam-views" role="group" aria-label="快捷视角">
   <button type="button" class="sb-cam-btn" data-cam="overview" title="恢复开阔全景">全览</button>
   <button type="button" class="sb-cam-btn" data-cam="barycenter" title="对准系统共同质心">质心</button>
   <button type="button" class="sb-cam-btn" data-cam="top" title="正俯视星盘（极佳弹弓瞄准视角）">俯视</button>
   <button type="button" class="sb-cam-btn" data-cam="side" title="低倾角侧视影院视角">侧视</button>
  </div>
  <button id="sb-follow-chip" type="button" class="sb-follow-chip" hidden title="点击取消跟随"></button>
  <span class="sb-cam-tip">右键平移 · 滚轮缩放 · WASD/QE 漫游</span>
 `;
 document.body.append(camBar);

 camBar.querySelectorAll('[data-cam]').forEach(btn => {
  btn.onclick = () => setCameraView(btn.dataset.cam);
 });
 camBar.querySelector('#sb-follow-chip').onclick = () => followBody(null);

 function updateCamBarUI() {
  const chip = camBar.querySelector('#sb-follow-chip');
  if (followEntity && followEntity.alive) {
   chip.hidden = false;
   chip.textContent = `◉ 追踪：${followEntity.name} ×`;
  } else {
   chip.hidden = true;
  }
 }

 // Floating Selected-Body Inspector Card (Left-middle) — High-Visual-Payoff Parameters
 const inspector = document.createElement('aside');
 inspector.id = 'sb-inspector';
 inspector.setAttribute('aria-label', '天体属性调控面板');
 inspector.hidden = true;
 inspector.innerHTML = `
  <div class="sb-insp-head">
   <span class="sb-insp-dot" id="sb-insp-dot"></span>
   <div class="sb-insp-title">
    <strong id="sb-insp-name"></strong>
    <small id="sb-insp-kind"></small>
   </div>
   <span id="sb-insp-orbit-pill" class="sb-insp-pill">近圆轨道</span>
   <button id="sb-insp-close" type="button" class="sb-insp-close" aria-label="关闭面板">×</button>
  </div>
  <div class="sb-insp-metrics">
   <div><span>公转速率</span><strong id="sb-insp-spd">0 km/s</strong></div>
   <div><span>表面逃逸速度</span><strong id="sb-insp-vesc">0 km/s</strong></div>
   <div><span>离心自转比</span><strong id="sb-insp-spin-ratio">0%</strong></div>
   <div><span>偏心率 / 希尔球</span><strong id="sb-insp-ecc">e=0.00</strong></div>
  </div>
  <div class="sb-insp-sliders">
   <label class="sb-insp-slider" for="sb-insp-mass">
    <span>质量 <output id="sb-insp-mass-val">0 M☉</output><em id="sb-insp-thresh"></em></span>
    <input id="sb-insp-mass" type="range" min="0.02" max="24" step="0.05" value="1">
   </label>
   <label class="sb-insp-slider" for="sb-insp-radius" id="sb-insp-radius-row">
    <span>半径 <output id="sb-insp-radius-val">2.0</output><em>联动逃逸/洛希</em></span>
    <input id="sb-insp-radius" type="range" min="0.6" max="9" step="0.1" value="2">
   </label>
   <div class="sb-insp-slider">
    <span>公转速度 <output id="sb-insp-speed-out">0 km/s</output></span>
    <input id="sb-insp-speed" type="range" min="0" max="60" step="0.2" value="10">
    <div class="sb-insp-mini-row">
     <button id="sb-insp-stop" type="button" class="sb-insp-mini" title="立即将速度归零，静止悬浮">静止 0</button>
     <button id="sb-insp-circ" type="button" class="sb-insp-mini" title="按最近主引力源自动配成精准圆轨">精准圆轨</button>
     <button id="sb-insp-rev" type="button" class="sb-insp-mini" title="公转方向 180° 反向逆行">逆行反转</button>
    </div>
   </div>
   <label class="sb-insp-slider" for="sb-insp-spin" id="sb-insp-spin-row">
    <span>自转速度 <output id="sb-insp-spin-val">0.20</output><em id="sb-insp-spin-warn">超 100% 离心解体</em></span>
    <input id="sb-insp-spin" type="range" min="0" max="2.2" step="0.02" value="0.2">
   </label>
   <label class="sb-insp-slider" for="sb-insp-temp" id="sb-insp-temp-row">
    <span>表面温度 <output id="sb-insp-temp-val">280 K</output><em id="sb-insp-temp-state">温带</em></span>
    <input id="sb-insp-temp" type="range" min="40" max="4200" step="20" value="280">
   </label>
  </div>
  <div class="sb-insp-locks">
   <button id="sb-insp-nobreakup" type="button" class="sb-insp-lock" aria-pressed="false" title="开启后免疫自转解体、洛希撕裂与撞击粉碎">🔒 不解体</button>
   <button id="sb-insp-pin" type="button" class="sb-insp-lock" aria-pressed="false" title="钉死在空间坐标不动，专作引力桩或弹弓支点">📌 空间锚定</button>
  </div>
  <div class="sb-insp-actions">
   <button id="sb-insp-follow" type="button" class="sb-insp-btn">◎ 追踪</button>
   <button id="sb-insp-detonate" type="button" class="sb-insp-btn sb-insp-danger">💥 引爆</button>
   <button id="sb-insp-delete" type="button" class="sb-insp-btn">✕ 删除</button>
  </div>
 `;
 document.body.append(inspector);

 inspector.querySelector('#sb-insp-close').onclick = () => selectEntity(null);
 inspector.querySelector('#sb-insp-follow').onclick = () => {
  if (!selectedEntity?.alive) return;
  followBody(followEntity === selectedEntity ? null : selectedEntity);
 };
 inspector.querySelector('#sb-insp-stop').onclick = () => {
  if (selectedEntity?.alive) setEntityStationary(selectedEntity.id);
 };
 inspector.querySelector('#sb-insp-circ').onclick = () => {
  if (selectedEntity?.alive) setEntityCircularOrbit(selectedEntity.id);
 };
 inspector.querySelector('#sb-insp-rev').onclick = () => {
  if (selectedEntity?.alive) reverseEntityOrbit(selectedEntity.id);
 };
 inspector.querySelector('#sb-insp-nobreakup').onclick = () => {
  if (selectedEntity?.alive) setEntityNoBreakup(selectedEntity.id, !selectedEntity.noBreakup);
 };
 inspector.querySelector('#sb-insp-pin').onclick = () => {
  if (selectedEntity?.alive) setEntityPinned(selectedEntity.id, !selectedEntity.pinned);
 };
 inspector.querySelector('#sb-insp-detonate').onclick = () => {
  if (selectedEntity?.alive) detonateBody(selectedEntity.id);
 };
 inspector.querySelector('#sb-insp-delete').onclick = () => {
  if (selectedEntity?.alive) deleteEntity(selectedEntity.id);
 };
 inspector.querySelector('#sb-insp-mass').oninput = ev => {
  if (selectedEntity?.alive) setEntityMass(selectedEntity.id, Number(ev.target.value));
 };
 inspector.querySelector('#sb-insp-radius').oninput = ev => {
  if (selectedEntity?.alive) setEntityRadius(selectedEntity.id, Number(ev.target.value));
 };
 inspector.querySelector('#sb-insp-speed').oninput = ev => {
  if (selectedEntity?.alive) setEntitySpeed(selectedEntity.id, Number(ev.target.value));
 };
 inspector.querySelector('#sb-insp-spin').oninput = ev => {
  if (!selectedEntity?.alive) return;
  const crit = criticalSpinFor(selectedEntity);
  const ratio = Number(ev.target.value);
  const targetSpin = Number.isFinite(crit) ? crit * ratio : 0;
  setEntitySpin(selectedEntity.id, targetSpin);
 };
 inspector.querySelector('#sb-insp-temp').oninput = ev => {
  if (selectedEntity?.alive) setEntityTemp(selectedEntity.id, Number(ev.target.value));
 };

 function updateInspectorUI() {
  if (!active || !selectedEntity || !selectedEntity.alive) {
   inspector.hidden = true;
   return;
  }
  const e = selectedEntity;
  inspector.hidden = false;
  inspector.querySelector('#sb-insp-dot').style.background = `#${e.color.getHexString()}`;
  inspector.querySelector('#sb-insp-name').textContent = e.name;
  inspector.querySelector('#sb-insp-kind').textContent = kindLabel(e);

  const tel = computeOrbitTelemetry(e);
  const orbitPill = inspector.querySelector('#sb-insp-orbit-pill');
  orbitPill.textContent = tel?.label || '自由';
  orbitPill.dataset.state = e.pinned ? 'pinned' : (tel?.ecc >= 0.99 ? 'escape' : tel?.speed < 0.25 ? 'still' : 'bound');

  const spd = e.vel.length();
  const kmS = (spd * 6.5).toFixed(0);
  const mult = e.baseSpeed > 0.5 ? (spd / e.baseSpeed) : 1;
  inspector.querySelector('#sb-insp-spd').textContent = e.kind === 'probe' && mult > 1.2
   ? `${kmS} km/s (${mult.toFixed(1)}×)`
   : `${kmS} km/s`;

  const vEsc = escapeVelocityFor(e);
  inspector.querySelector('#sb-insp-vesc').textContent = e.kind === 'bh'
   ? 'c · 视界'
   : `${(vEsc * 6.5).toFixed(1)} km/s`;

  const crit = criticalSpinFor(e);
  const spinRatio = Number.isFinite(crit) ? Math.abs(e.spinRate || 0) / Math.max(crit, 0.05) : 0;
  const spinRatioEl = inspector.querySelector('#sb-insp-spin-ratio');
  spinRatioEl.textContent = Number.isFinite(crit) ? `${Math.round(spinRatio * 100)}%` : '克尔奇点';
  spinRatioEl.dataset.warn = spinRatio >= 1.0 ? 'crit' : spinRatio >= 0.78 ? 'hot' : '';

  const eccText = tel?.attr
   ? `e=${tel.ecc.toFixed(2)} · 希尔 ${tel.hillR.toFixed(1)}`
   : '无主引力源';
  inspector.querySelector('#sb-insp-ecc').textContent = eccText;

  // Mass slider
  inspector.querySelector('#sb-insp-mass-val').textContent = e.mass >= 1 ? `${e.mass.toFixed(2)} M☉` : e.mass >= 0.01 ? `${e.mass.toFixed(3)} M☉` : `${e.mass.toFixed(4)} M☉`;
  const massSlider = inspector.querySelector('#sb-insp-mass');
  const thresh = inspector.querySelector('#sb-insp-thresh');
  if (e.kind === 'planet' || e.kind === 'moon' || e.kind === 'comet') {
   massSlider.min = '0.005'; massSlider.max = '2.0'; massSlider.step = '0.01';
   thresh.textContent = '≥1.8 点燃成星';
  } else if (e.kind === 'white-dwarf') {
   massSlider.min = '0.4'; massSlider.max = '1.55'; massSlider.step = '0.02';
   thresh.textContent = '≥1.44 Ia超新星';
  } else if (e.kind === 'star') {
   massSlider.min = '1.0'; massSlider.max = '22.0'; massSlider.step = '0.2';
   thresh.textContent = '≥20 坍缩黑洞';
  } else if (e.kind === 'bh') {
   massSlider.min = '2.0'; massSlider.max = '60.0'; massSlider.step = '0.5';
   thresh.textContent = '扩张洛希极限';
  } else if (e.kind === 'neutron') {
   massSlider.min = '1.2'; massSlider.max = '6.0'; massSlider.step = '0.1';
   thresh.textContent = '致密脉冲核心';
  } else {
   massSlider.min = '0.001'; massSlider.max = '0.2'; massSlider.step = '0.005';
   thresh.textContent = '超轻弹弓载荷';
  }
  if (document.activeElement !== massSlider) {
   massSlider.value = String(Math.min(Number(massSlider.max), Math.max(Number(massSlider.min), e.mass)));
  }
  setRangePct(massSlider);

  // Radius slider
  const radRow = inspector.querySelector('#sb-insp-radius-row');
  const radSlider = inspector.querySelector('#sb-insp-radius');
  radRow.hidden = e.kind === 'probe';
  if (!radRow.hidden) {
   radSlider.min = e.kind === 'bh' ? '0.8' : '0.6';
   radSlider.max = e.kind === 'star' ? '10.0' : '8.0';
   if (document.activeElement !== radSlider) {
    radSlider.value = String(Math.min(Number(radSlider.max), Math.max(Number(radSlider.min), e.targetRadius)));
   }
   inspector.querySelector('#sb-insp-radius-val').textContent = `${e.radius.toFixed(2)} R`;
   setRangePct(radSlider);
  }

  // Orbital Speed slider
  const spdSlider = inspector.querySelector('#sb-insp-speed');
  if (document.activeElement !== spdSlider) {
   spdSlider.value = String(Math.min(60, Math.max(0, spd)));
  }
  inspector.querySelector('#sb-insp-speed-out').textContent = `${kmS} km/s`;
  setRangePct(spdSlider);

  // Spin Speed slider (as fraction of critical breakup velocity, 0..2.2x!)
  const spinRow = inspector.querySelector('#sb-insp-spin-row');
  const spinSlider = inspector.querySelector('#sb-insp-spin');
  spinRow.hidden = e.kind === 'bh' || e.kind === 'probe';
  if (!spinRow.hidden) {
   if (document.activeElement !== spinSlider) {
    spinSlider.value = String(Math.min(2.2, Math.max(0, spinRatio)));
   }
   inspector.querySelector('#sb-insp-spin-val').textContent = `${Math.round(spinRatio * 100)}% ω_c`;
   const warnEl = inspector.querySelector('#sb-insp-spin-warn');
   if (spinRatio >= 1.0) {
    warnEl.textContent = (!config.allowBreakup || e.noBreakup) ? '超临界(锁保护)' : '超临界解体中!';
   } else {
    warnEl.textContent = '≥100% 离心解体';
   }
   setRangePct(spinSlider);
  }

  // Temperature slider (for planets / moons / comets / brown dwarfs)
  const tempRow = inspector.querySelector('#sb-insp-temp-row');
  const tempSlider = inspector.querySelector('#sb-insp-temp');
  tempRow.hidden = !isLightKind(e.kind) || e.kind === 'probe';
  if (!tempRow.hidden) {
   const T = Math.round(e.temperature || 280);
   if (document.activeElement !== tempSlider) {
    tempSlider.value = String(Math.min(4200, Math.max(40, T)));
   }
   inspector.querySelector('#sb-insp-temp-val').textContent = `${T} K`;
   inspector.querySelector('#sb-insp-temp-state').textContent = T < 180 ? '极寒冰霜' : T < 950 ? '温和态' : T < 2550 ? '熔岩红热' : '炽烈蒸发尾!';
   setRangePct(tempSlider);
  }

  // Per-body protection locks
  const noBreakBtn = inspector.querySelector('#sb-insp-nobreakup');
  noBreakBtn.setAttribute('aria-pressed', String(!!e.noBreakup));
  noBreakBtn.textContent = e.noBreakup ? '🔒 不解体(已锁)' : '🔒 不解体';
  const pinBtn = inspector.querySelector('#sb-insp-pin');
  pinBtn.setAttribute('aria-pressed', String(!!e.pinned));
  pinBtn.textContent = e.pinned ? '📌 已钉死' : '📌 空间锚定';

  const followBtn = inspector.querySelector('#sb-insp-follow');
  followBtn.textContent = followEntity === e ? '◉ 追踪中' : '◎ 追踪';
  followBtn.setAttribute('aria-pressed', String(followEntity === e));

  const detBtn = inspector.querySelector('#sb-insp-detonate');
  detBtn.hidden = e.kind === 'bh';
  detBtn.textContent = e.kind === 'white-dwarf' ? '💥 Ia爆发' : e.kind === 'star' ? '💥 超新星' : e.kind === 'neutron' ? '💥 磁星爆' : '💥 引爆';
 }

 // Bottom Floating Sandbox Instrument Dock
 const dock = document.createElement('aside');
 dock.id = 'sandbox-dock';
 dock.setAttribute('aria-label', '宇宙沙盒操控台');
 dock.hidden = true;
 const spawnChipsHtml = SPAWN_CATALOG.map(c =>
  `<button type="button" class="sb-spawn-chip" data-spawn="${c.id}" aria-pressed="${c.id === config.spawnType}" title="${c.hint}"><span class="sb-sp-ico" style="color:${c.color}">${c.icon}</span><span>${c.short}</span></button>`
 ).join('');
 const scenarioChipsHtml = SANDBOX_SCENARIOS.map(sc =>
  `<button type="button" class="sb-scen-chip" data-scenario="${sc.id}" aria-pressed="${sc.id === config.scenario}" title="${sc.summary}"><span class="sb-sc-ico">${sc.icon}</span><span>${sc.name}</span><em>${sc.badge}</em></button>`
 ).join('');
 const phenomChipsHtml = SANDBOX_PHENOMENA.map(ph =>
  `<button type="button" class="sb-phen-btn sb-phen-${ph.kind}" data-phenom="${ph.id}" title="${ph.title}"><span>${ph.icon}</span>${ph.label}</button>`
 ).join('');

 dock.innerHTML = `
  <div id="sb-laws-bar" class="sb-laws-bar" hidden>
   <div class="sb-laws-grid">
    <label class="sb-slider" for="sb-gravity">
     <span>万有引力 <output id="sb-gravity-out">1.0×</output></span>
     <input id="sb-gravity" type="range" min="-2" max="5" step="0.1" value="1">
    </label>
    <label class="sb-slider" for="sb-planet-grav" title="专门增强行星/卫星之间的局部引力，轻松实现卫星捕获与双星互绕">
     <span>行星互引 <output id="sb-planet-grav-out">3.0×</output></span>
     <input id="sb-planet-grav" type="range" min="1" max="25" step="0.5" value="3">
    </label>
    <label class="sb-slider" for="sb-spread" title="实时舒展或收紧整个星系的轨道间距">
     <span>轨道间距 <output id="sb-spread-out">2.0×</output></span>
     <input id="sb-spread" type="range" min="0.6" max="3.0" step="0.05" value="2.0">
    </label>
    <label class="sb-slider" for="sb-drag" title="星际介质轨道阻力，打开后天体沿螺旋线缓慢吸积坠落">
     <span>轨道阻尼 <output id="sb-drag-out">0%</output></span>
     <input id="sb-drag" type="range" min="0" max="100" step="2" value="0">
    </label>
    <label class="sb-slider" for="sb-bh-mass">
     <span>归墟质量 <output id="sb-bh-mass-out">12.4 M☉</output></span>
     <input id="sb-bh-mass" type="range" min="2" max="60" step="0.5" value="12.4">
    </label>
   </div>
   <div class="sb-laws-row">
    <span class="sb-drawer-label">碰撞法则</span>
    <div class="sb-laws-seg" role="group" aria-label="碰撞物理模式">
     <button type="button" class="sb-law-chip" data-colmode="realistic" aria-pressed="true" title="写实演化：熔融合并 + 超高速粉碎 + 灾变爆发">写实演化</button>
     <button type="button" class="sb-law-chip" data-colmode="accrete" aria-pressed="false" title="温和吸积：抑制粉碎，撞击总是聚合成更大天体">温和吸积</button>
     <button type="button" class="sb-law-chip" data-colmode="elastic" aria-pressed="false" title="弹性台球：行星与卫星碰撞时动量反弹不毁灭">弹性台球</button>
    </div>
    <button id="sb-breakup-btn" type="button" class="sb-law-chip sb-law-breakup" aria-pressed="true" title="关闭后所有天体免疫超临界自转解体、洛希撕裂与撞击粉碎">临界解体：开</button>
    <div class="sb-laws-snap">
     <button id="sb-snap-save" type="button" class="sb-law-chip" title="保存当前全部天体位置、速度与参数快照">📷 保存快照</button>
     <button id="sb-snap-load" type="button" class="sb-law-chip" disabled title="一键回到上次保存的阵型快照">↺ 回滚快照</button>
    </div>
   </div>
  </div>
  <div id="sb-scenario-bar" class="sb-scenario-bar" hidden>
   <div class="sb-scen-row">
    <span class="sb-drawer-label">宇宙剧本</span>
    <div class="sb-scen-list" role="group" aria-label="一键切换宇宙剧本">${scenarioChipsHtml}</div>
    <span id="sb-egg-badge" class="sb-egg-badge" title="">★ 彩蛋 0 / ${SANDBOX_EGGS.length}</span>
   </div>
   <div class="sb-scen-row">
    <span class="sb-drawer-label">奇观天象</span>
    <div class="sb-phen-list" role="group" aria-label="手动触发宇宙天象">${phenomChipsHtml}</div>
   </div>
  </div>
  <div id="sb-spawn-bar" class="sb-spawn-bar" hidden>
   <div class="sb-spawn-list" role="group" aria-label="选择要创建的天体">${spawnChipsHtml}</div>
   <div class="sb-spawn-opts">
    <div class="sb-spawn-modes" role="group" aria-label="投放初速模式">
     <button type="button" class="sb-mode-chip" data-spawnmode="stationary" aria-pressed="false" title="单击绝对静止放置 (0 km/s)">静止 0</button>
     <button type="button" class="sb-mode-chip" data-spawnmode="orbit" aria-pressed="true" title="单击自动环绕最近引力源（含大行星）成精准圆轨">自动入轨</button>
     <button type="button" class="sb-mode-chip" data-spawnmode="slingshot" aria-pressed="false" title="按住向后拉弓，实时看速度与逃逸比标尺发射">拉弓发射</button>
    </div>
    <button id="sb-retro-btn" type="button" class="sb-mode-chip" aria-pressed="false" title="切换自动入轨的顺行 / 逆行方向">顺行</button>
    <div class="sb-spawn-y" title="按住 Alt+滚轮也可随时调整 3D 投放高度 Y">
     <span>高度 Y</span>
     <button id="sb-y-down" type="button" class="sb-y-btn" aria-label="降低高度">−</button>
     <output id="sb-y-out">0</output>
     <button id="sb-y-up" type="button" class="sb-y-btn" aria-label="升高高度">+</button>
    </div>
   </div>
  </div>
  <div id="sb-telemetry" class="sb-telemetry" hidden>
   <span class="sb-tel-item"><small>天体</small><strong id="sb-alive">8</strong></span>
   <span class="sb-tel-item"><small>超新星/并合</small><strong id="sb-cataclysms">0</strong></span>
   <span class="sb-tel-item"><small>潮汐撕裂</small><strong id="sb-tde">0</strong></span>
   <span class="sb-tel-item"><small>大撞击</small><strong id="sb-impacts">0</strong></span>
   <span class="sb-tel-item"><small>活跃碎片</small><strong id="sb-debris">0</strong></span>
   <span class="sb-tel-item sb-tel-wide"><small>最近事件</small><strong id="sb-last">宽间距稳态 N-Body 互引中</strong></span>
  </div>
  <div class="sb-bar">
   <div class="sb-group sb-mode-group" role="group" aria-label="交互工具">
    <button type="button" class="sb-pill" data-tool="orbit" aria-pressed="true" title="自由旋转平移视角 · 单击选天体微调，双击锁定追踪">探索</button>
    <button type="button" class="sb-pill" data-tool="spawn" aria-pressed="false" title="创建冰月/行星/褐矮/白矮/恒星/脉冲星/黑洞/探测器：支持静止放置、自动配月或拉弓发射">✦ 造物</button>
    <button type="button" class="sb-pill" data-tool="grab" aria-pressed="false" title="直接拎起黑洞、恒星或行星甩动对撞（也可按住 Shift 抓取）">抓取</button>
    <button id="sb-scenario-btn" type="button" class="sb-pill sb-scen-toggle" aria-pressed="false" title="一键加载三体/双黑洞/弹弓/超新星剧本，随时释放天象与查看彩蛋">✦ 剧本</button>
    <button id="sb-laws-btn" type="button" class="sb-pill sb-laws-toggle" aria-pressed="false" title="调节引力、行星互引倍率、轨道间距、阻尼、碰撞法则、临界解体与阵型快照">⚙ 法则</button>
   </div>
   <div class="sb-divider" aria-hidden="true"></div>
   <div class="sb-group sb-speed-group" role="group" aria-label="时间流速 0.05x-100x">
    <button type="button" class="sb-pill" data-speed="0" aria-pressed="false" title="暂停演化（空格键）">Ⅱ</button>
    <button type="button" class="sb-pill" data-speed="0.1" aria-pressed="false">0.1×</button>
    <button type="button" class="sb-pill" data-speed="1" aria-pressed="true">1×</button>
    <button type="button" class="sb-pill" data-speed="10" aria-pressed="false">10×</button>
    <button type="button" class="sb-pill" data-speed="100" aria-pressed="false">100×</button>
    <label class="sb-speed-slider" for="sb-speed-slider" title="无级对数时间倍率：最慢 0.05×，最快 100×">
     <input id="sb-speed-slider" type="range" min="0" max="100" step="0.5" value="39.4">
     <output id="sb-speed-out">1×</output>
    </label>
   </div>
   <div class="sb-divider" aria-hidden="true"></div>
   <div class="sb-group sb-toggles">
    <button id="sb-bullet-btn" type="button" class="sb-chip" aria-pressed="true" title="大爆炸/碰撞瞬间自动触发慢动作">子弹时间</button>
    <button id="sb-overlay-btn" type="button" class="sb-chip" aria-pressed="false" title="显示洛希极限圈、共同质心、速度矢量与遥测读数">辅助线</button>
   </div>
   <div class="sb-divider" aria-hidden="true"></div>
   <div class="sb-group sb-actions">
    <button id="sb-reset-btn" type="button" class="sb-act" title="恢复完整六星、瑶光与归墟">↺ 重置</button>
    <button id="sb-exit-btn" type="button" class="sb-act sb-exit" title="退出沙盒，返回观星展示模式">退出</button>
   </div>
  </div>
  <p id="sb-hint" class="sb-hint"></p>
 `;
 document.body.append(dock);

 function setRangePct(el) {
  const min = Number(el.min) || 0, max = Number(el.max) || 1, val = Number(el.value);
  el.style.setProperty('--pct', Math.max(0, Math.min(100, ((val - min) / (max - min || 1)) * 100)).toFixed(1) + '%');
 }

 function syncBhMassSliderBounds() {
  const massEl = dock.querySelector('#sb-bh-mass');
  const maxNow = Math.max(60, Math.ceil(config.bhMass / 5) * 5 + 10);
  massEl.max = String(Math.min(100, maxNow));
 }

 function updateDockUI() {
  for (const btn of dock.querySelectorAll('[data-tool]')) {
   btn.setAttribute('aria-pressed', String(btn.dataset.tool === config.tool));
  }
  for (const btn of dock.querySelectorAll('[data-spawn]')) {
   btn.setAttribute('aria-pressed', String(btn.dataset.spawn === config.spawnType));
  }
  for (const btn of dock.querySelectorAll('[data-spawnmode]')) {
   btn.setAttribute('aria-pressed', String(btn.dataset.spawnmode === config.spawnMode));
  }
  for (const btn of dock.querySelectorAll('[data-scenario]')) {
   btn.setAttribute('aria-pressed', String(btn.dataset.scenario === config.scenario));
  }
  for (const btn of dock.querySelectorAll('[data-colmode]')) {
   btn.setAttribute('aria-pressed', String(btn.dataset.colmode === config.collisionMode));
  }
  for (const btn of dock.querySelectorAll('[data-speed]')) {
   const targetS = Number(btn.dataset.speed);
   const match = targetS === 0 ? config.timeScale === 0 : Math.abs(config.timeScale - targetS) < Math.max(0.02, targetS * 0.04);
   btn.setAttribute('aria-pressed', String(match));
  }

  const speedEl = dock.querySelector('#sb-speed-slider');
  if (document.activeElement !== speedEl) {
   speedEl.value = String(config.timeScale > 0 ? speedToSlider(config.timeScale) : 0);
  }
  dock.querySelector('#sb-speed-out').textContent = formatSpeedMult(config.timeScale);
  setRangePct(speedEl);

  dock.querySelector('#sb-scenario-btn').setAttribute('aria-pressed', String(config.showScenarios));
  dock.querySelector('#sb-laws-btn').setAttribute('aria-pressed', String(config.showLaws));
  dock.querySelector('#sb-scenario-bar').hidden = !config.showScenarios;
  dock.querySelector('#sb-laws-bar').hidden = !config.showLaws;
  dock.querySelector('#sb-spawn-bar').hidden = config.tool !== 'spawn' || config.showScenarios || config.showLaws;
  dock.querySelector('#sb-y-out').textContent = config.spawnY === 0 ? '0' : (config.spawnY > 0 ? `+${config.spawnY}` : String(config.spawnY));

  const retroBtn = dock.querySelector('#sb-retro-btn');
  retroBtn.setAttribute('aria-pressed', String(config.spawnRetrograde));
  retroBtn.textContent = config.spawnRetrograde ? '逆行' : '顺行';
  retroBtn.hidden = config.spawnMode === 'stationary';

  const eggBadge = dock.querySelector('#sb-egg-badge');
  eggBadge.textContent = `★ 彩蛋 ${unlockedEggs.size} / ${SANDBOX_EGGS.length}`;
  eggBadge.dataset.complete = String(unlockedEggs.size >= SANDBOX_EGGS.length);
  eggBadge.title = SANDBOX_EGGS.map(eg => `${unlockedEggs.has(eg.id) ? '★' : '☆'} ${eg.title}：${eg.desc}`).join('\n');

  const massEl = dock.querySelector('#sb-bh-mass');
  syncBhMassSliderBounds();
  if (document.activeElement !== massEl) massEl.value = config.bhMass;
  dock.querySelector('#sb-bh-mass-out').textContent = `${config.bhMass.toFixed(1)} M☉`;
  setRangePct(massEl);

  const gravEl = dock.querySelector('#sb-gravity');
  if (document.activeElement !== gravEl) gravEl.value = config.gravityScale;
  const gOut = config.gravityScale < -0.05
   ? `${config.gravityScale.toFixed(1)}× 斥力`
   : Math.abs(config.gravityScale) <= 0.05
    ? '0.0× 失重'
    : `${config.gravityScale.toFixed(1)}×`;
  dock.querySelector('#sb-gravity-out').textContent = gOut;
  setRangePct(gravEl);

  const pGravEl = dock.querySelector('#sb-planet-grav');
  if (document.activeElement !== pGravEl) pGravEl.value = config.planetGravityBoost;
  dock.querySelector('#sb-planet-grav-out').textContent = `${config.planetGravityBoost.toFixed(1)}×`;
  setRangePct(pGravEl);

  const spreadEl = dock.querySelector('#sb-spread');
  if (document.activeElement !== spreadEl) spreadEl.value = config.orbitSpread;
  dock.querySelector('#sb-spread-out').textContent = `${config.orbitSpread.toFixed(2)}×`;
  setRangePct(spreadEl);

  const dragEl = dock.querySelector('#sb-drag');
  if (document.activeElement !== dragEl) dragEl.value = Math.round(config.drag * 100);
  dock.querySelector('#sb-drag-out').textContent = `${Math.round(config.drag * 100)}%`;
  setRangePct(dragEl);

  const brkBtn = dock.querySelector('#sb-breakup-btn');
  brkBtn.setAttribute('aria-pressed', String(!config.allowBreakup));
  brkBtn.textContent = config.allowBreakup ? '临界解体：开' : '🔒 全域不解体';

  const snapLoadBtn = dock.querySelector('#sb-snap-load');
  snapLoadBtn.disabled = !savedSnapshot;

  const antiBtn = dock.querySelector('[data-phenom="anti-gravity"]');
  if (antiBtn) {
   antiBtn.setAttribute('aria-pressed', String(config.gravityScale < 0));
   antiBtn.innerHTML = config.gravityScale < 0 ? '<span>⚡</span>恢复引力' : '<span>⚡</span>反重力炸花';
  }

  dock.querySelector('#sb-bullet-btn').setAttribute('aria-pressed', String(config.autoBulletTime));
  dock.querySelector('#sb-overlay-btn').setAttribute('aria-pressed', String(config.overlays));
  dock.querySelector('#sb-telemetry').hidden = !config.overlays;
  dock.dataset.bullet = String(bulletTimer > 0.05);
  dock.dataset.antigrav = String(config.gravityScale < 0);

  const hint = dock.querySelector('#sb-hint');
  if (config.showLaws) {
   hint.textContent = '全局物理法则 · 调高「行星互引」可贴脸捕获卫星 · 关闭「临界解体」可玩超极限自转不炸 · 可保存/回滚阵型快照';
  } else if (config.showScenarios) {
   hint.textContent = '宇宙剧本与天象 · 一键体验三体乱纪元、双黑洞引力波、引力弹弓靶场、反重力炸花与奇点大爆炸';
  } else if (config.tool === 'spawn') {
   const def = SPAWN_CATALOG.find(c => c.id === config.spawnType);
   const modeStr = config.spawnMode === 'stationary' ? '单击静止 0 km/s 放置' : config.spawnMode === 'orbit' ? `单击自动${config.spawnRetrograde ? '逆行' : '顺行'}入轨（贴巨行星自动配月）` : '按住向后拉弓发射';
   hint.textContent = `造物 · 「${def?.label || ''}」：${modeStr}，拖拽随时拉弓看实时速度与逃逸比（Alt+滚轮调高度 Y）`;
  } else if (config.tool === 'grab') {
   hint.textContent = '抓取模式 · 直接拖走黑洞、恒星或行星甩出对撞（Alt+滚轮调高度 · 拖空白处旋转）';
  } else {
   hint.textContent = '自由空间 · 时间 0.05×～100× 无级变速 · 单击任意天体调自转/公转/温度/不解体锁，双击锁定追踪';
  }

  if (sim) {
   const aliveTotal = sim.entities.filter(e => e.alive).length;
   dock.querySelector('#sb-alive').textContent = String(aliveTotal);
   dock.querySelector('#sb-cataclysms').textContent = String(stats.supernovae + stats.bhMergers + stats.kilonovae);
   dock.querySelector('#sb-tde').textContent = String(stats.disrupted);
   dock.querySelector('#sb-impacts').textContent = String(stats.impacts);
   dock.querySelector('#sb-debris').textContent = String(activeDebrisCount);
   dock.querySelector('#sb-last').textContent = stats.lastEvent || '宽间距稳态 N-Body 互引中';
  }
 }

 dock.querySelectorAll('[data-tool]').forEach(btn => { btn.onclick = () => setTool(btn.dataset.tool); });
 dock.querySelectorAll('[data-spawn]').forEach(btn => { btn.onclick = () => setSpawnType(btn.dataset.spawn); });
 dock.querySelectorAll('[data-spawnmode]').forEach(btn => { btn.onclick = () => setSpawnMode(btn.dataset.spawnmode); });
 dock.querySelectorAll('[data-scenario]').forEach(btn => { btn.onclick = () => loadScenario(btn.dataset.scenario); });
 dock.querySelectorAll('[data-phenom]').forEach(btn => { btn.onclick = () => triggerPhenomenon(btn.dataset.phenom); });
 dock.querySelectorAll('[data-colmode]').forEach(btn => { btn.onclick = () => setCollisionMode(btn.dataset.colmode); });
 dock.querySelector('#sb-scenario-btn').onclick = () => {
  config.showScenarios = !config.showScenarios;
  if (config.showScenarios) config.showLaws = false;
  updateDockUI();
 };
 dock.querySelector('#sb-laws-btn').onclick = () => {
  config.showLaws = !config.showLaws;
  if (config.showLaws) config.showScenarios = false;
  updateDockUI();
 };
 dock.querySelector('#sb-retro-btn').onclick = () => setSpawnRetrograde(!config.spawnRetrograde);
 dock.querySelector('#sb-breakup-btn').onclick = () => setAllowBreakup(!config.allowBreakup);
 dock.querySelector('#sb-snap-save').onclick = () => saveSnapshot();
 dock.querySelector('#sb-snap-load').onclick = () => restoreSnapshot();
 dock.querySelectorAll('[data-speed]').forEach(btn => { btn.onclick = () => setSpeed(Number(btn.dataset.speed)); });
 dock.querySelector('#sb-speed-slider').oninput = ev => setSpeed(sliderToSpeed(ev.target.value));
 dock.querySelector('#sb-y-down').onclick = () => setSpawnY(config.spawnY - 6);
 dock.querySelector('#sb-y-up').onclick = () => setSpawnY(config.spawnY + 6);
 dock.querySelector('#sb-bh-mass').oninput = e => setBhMass(Number(e.target.value));
 dock.querySelector('#sb-gravity').oninput = e => setGravityScale(Number(e.target.value));
 dock.querySelector('#sb-planet-grav').oninput = e => setPlanetGravityBoost(Number(e.target.value));
 dock.querySelector('#sb-spread').oninput = e => setOrbitSpread(Number(e.target.value));
 dock.querySelector('#sb-drag').oninput = e => setDrag(Number(e.target.value) / 100);
 dock.querySelector('#sb-bullet-btn').onclick = () => setAutoBulletTime(!config.autoBulletTime);
 dock.querySelector('#sb-overlay-btn').onclick = () => setOverlays(!config.overlays);
 dock.querySelector('#sb-reset-btn').onclick = () => {
  config.bhMass = baseBhMass;
  config.gravityScale = 1.0;
  config.drag = 0;
  config.collisionMode = 'realistic';
  config.allowBreakup = true;
  config.scenario = 'default';
  reset();
  showBanner('时空复原', '宽间距稳态六星、瑶光与归墟已回到初始构型', 'reset');
 };
 dock.querySelector('#sb-exit-btn').onclick = () => exit();

 // ==========================================================================
 // 15. SCENARIO PRESETS, INSTANT PHENOMENA & PUBLIC LIFECYCLE CONTROLS
 // ==========================================================================
 function loadScenario(scenarioId) {
  if (!active) return false;
  if (!SANDBOX_SCENARIOS.some(s => s.id === scenarioId)) return false;
  config.scenario = scenarioId;
  config.showScenarios = false;
  config.showLaws = false;
  endDrag(false);
  spawnDrag.active = false;
  applySandboxScenario(scenarioId, {
   initBase: spreadOverride => initSimulation(lastSimTimeFromHost, spreadOverride),
   hide: id => {
    const e = sim?.entities.find(x => x.id === id);
    if (e) hideEntityVisual(e);
   },
   fling: (id, pos, vel) => flingBody(id, pos, vel),
   setMass: (id, m) => setEntityMass(id, m),
   setGravity: g => { config.gravityScale = g; },
   setBhMass: m => {
    config.bhMass = m;
    if (sim?.bh?.alive) {
     sim.bh.mass = m;
     sim.bh.radius = baseBhRadius * bhVisualScale(m);
     sim.bh.targetRadius = sim.bh.radius;
    }
   },
   spawn: (type, pos, vel, opts) => spawnBody(type, pos, vel, opts),
   follow: id => followBody(id),
   select: id => selectEntity(id),
   cameraView: preset => setCameraView(preset),
   banner: (t, d, b) => showBanner(t, d, b)
  });
  computeAccelerations(sim.entities, true);
  applyVisualPoses(0);
  updateDockUI();
  updateCamBarUI();
  updateInspectorUI();
  return true;
 }

 function triggerPhenomenon(id) {
  if (!active || !sim) return false;

  if (id === 'detonate-star') {
   const target = (selectedEntity?.alive && selectedEntity.kind === 'star' ? selectedEntity : null)
    || (sim.star?.alive ? sim.star : null)
    || sim.entities.filter(e => e.alive && e.kind === 'star').sort((a, b) => b.mass - a.mass)[0];
   if (target) {
    return detonateBody(target.id);
   }
   const tempStar = spawnSingleEntity('star-red', sim.barycenter.clone(), new THREE.Vector3(), { mass: 9.5, radius: 5.8, name: '临爆红巨星' });
   if (tempStar) return detonateBody(tempStar.id);
   return false;
  }

  if (id === 'comet-storm') {
   const centerAttr = sim.entities.filter(e => e.alive && (e.kind === 'bh' || e.kind === 'star')).sort((a, b) => b.mass - a.mass)[0];
   const targetPos = centerAttr ? centerAttr.pos : sim.barycenter;
   const baseAngle = rand() * Math.PI * 2;
   for (let i = 0; i < 8; i++) {
    const a = baseAngle + (i - 3.5) * 0.14;
    const dist = 84 + rand() * 24;
    const pos = new THREE.Vector3(targetPos.x + Math.cos(a) * dist, (rand() - 0.5) * 14, targetPos.z + Math.sin(a) * dist);
    const toTarget = targetPos.clone().sub(pos).normalize();
    const tang = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
    const vel = toTarget.multiplyScalar(17 + rand() * 5).addScaledVector(tang, 6.5 + (rand() - 0.5) * 4);
    spawnSingleEntity('comet', pos, vel, { single: true, name: `潮汐彗星 #${i + 1}` });
   }
   showBanner('天象 · 彗星潮汐雨', '8 颗冰核彗星已从深空外缘扑向核心引力井！', 'tde');
   updateDockUI();
   return true;
  }

  if (id === 'summon-pulsar') {
   const a = rand() * Math.PI * 2;
   const pos = new THREE.Vector3(Math.cos(a) * 58, 7.5, Math.sin(a) * 58);
   const tang = new THREE.Vector3(-Math.sin(a), -0.14, Math.cos(a)).normalize();
   const vel = tang.multiplyScalar(13.5).addScaledVector(pos.clone().normalize(), -5.5);
   const psr = spawnSingleEntity('neutron', pos, vel, { mass: 2.5, radius: 1.4, name: `灯塔脉冲星 #${++typeCounters.psr || (typeCounters.psr = 1)}`, initialFlare: 1.2 });
   if (psr) selectEntity(psr);
   showBanner('天象 · 脉冲星灯塔', `${psr?.name || '脉冲星'} 正以双极光束斜切扫射星系`, 'gw');
   updateDockUI();
   return true;
  }

  if (id === 'anti-gravity') {
   if (config.gravityScale < 0) {
    setGravityScale(1.0);
    showBanner('引力恢复正常', '万有引力已恢复 1.0×，天体重新开始相互吸引', 'info');
   } else {
    setGravityScale(-1.2);
    applyBlastImpulse(sim.barycenter, 7.5, 140);
    spawnShockwave(sim.barycenter, { maxRadius: 68, flashSize: 28, dur: 2.6, colorA: [1.0, 0.86, 0.96], colorB: [0.85, 0.36, 1.0] });
    triggerGravityWave(sim.barycenter, 0.85);
   }
   return true;
  }

  if (id === 'big-bang') {
   stats.bigBangs++;
   const origin = (sim.entities.find(e => e.alive && e.kind === 'bh')?.pos || sim.barycenter || new THREE.Vector3()).clone();
   // Clear all old bodies & reset gravity
   selectEntity(null);
   followBody(null);
   config.gravityScale = 1.0;
   config.scenario = 'default';
   clearDynamicEntities();
   clearDebris();
   for (const e of sim.entities) {
    if (e.isOriginal && e.alive) hideEntityVisual(e);
   }
   voidPrompted = false;
   threeBodyActive = false;

   // Colossal polychromatic Big Bang dawn particles bursting outward beyond the newborn star's photosphere!
   for (let i = 0; i < 1400; i++) {
    const theta = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(theta) * s, dy = u * 0.45, dz = Math.sin(theta) * s;
    const rOff = 6.4 + rand() * 8.5;
    const spd = 11 + Math.pow(rand(), 0.72) * 24;
    const swirl = 4.5 + rand() * 4.0;
    const tx = -Math.sin(theta), tz = Math.cos(theta);
    const band = i % 3;
    const col = band === 0 ? [0.55, 0.88, 1.0] : band === 1 ? [1.0, 0.78, 0.42] : [0.88, 0.56, 1.0];
    spawnDebris(
     origin.x + dx * rOff, origin.y + dy * rOff, origin.z + dz * rOff,
     dx * spd + tx * swirl, dy * spd, dz * spd + tz * swirl,
     col[0], col[1], col[2], 1.5 + rand() * 2.8, 0.88, 24 + rand() * 18, 1
    );
   }
   spawnShockwave(origin, { maxRadius: 88, flashSize: 56, dur: 3.6, colorA: [1.0, 0.96, 0.88], colorB: [0.46, 0.82, 1.0] });
   spawnShockwave(origin, { maxRadius: 68, flashSize: 42, dur: 2.9, colorA: [0.96, 0.80, 1.0], colorB: [0.76, 0.42, 1.0], tiltX: Math.PI * 0.3, tiltZ: 0.4 });
   spawnShockwave(origin, { maxRadius: 54, flashSize: 34, dur: 2.5, colorA: [1.0, 0.88, 0.56], colorB: [1.0, 0.46, 0.18], tiltX: Math.PI * 0.7, tiltZ: -0.5 });
   triggerGravityWave(origin, 1.25);
   bloomSurge = Math.min(0.55, bloomSurge + 0.38);
   rippleSurge = Math.min(1.0, rippleSurge + 0.85);
   triggerBulletTime(1.6, 0.22);

   // Birth a brand-new central star + 6 fresh orbiting proto-planets + 4 outer comets!
   const newStar = spawnSingleEntity('star-blue', origin, new THREE.Vector3(), { mass: 6.8, radius: 5.2, name: '创世主星', initialFlare: 1.8 });
   const G = Math.abs(gUnit());
   const protoDefs = [
    { type: 'rocky', r: 17, name: '新生熔岩星' },
    { type: 'rocky', r: 26, name: '新生海洋星' },
    { type: 'gas', r: 39, name: '新生环巨星' },
    { type: 'rocky', r: 50, name: '新生冰原星' },
    { type: 'gas', r: 64, name: '新生外巨星' },
    { type: 'rocky', r: 78, name: '新生边疆星' }
   ];
   protoDefs.forEach((pd, idx) => {
    const a = idx * 1.12 + rand() * 0.5;
    const p = origin.clone().add(new THREE.Vector3(Math.cos(a) * pd.r, (rand() - 0.5) * 2.2, Math.sin(a) * pd.r));
    const vOrb = Math.sqrt((G * newStar.mass) / pd.r);
    const v = new THREE.Vector3(-Math.sin(a) * vOrb, 0, Math.cos(a) * vOrb);
    spawnSingleEntity(pd.type, p, v, { name: pd.name });
   });
   for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const p = origin.clone().add(new THREE.Vector3(Math.cos(a) * 90, (rand() - 0.5) * 6, Math.sin(a) * 90));
    const vOrb = Math.sqrt((G * newStar.mass) / 90) * 0.88;
    spawnSingleEntity('comet', p, new THREE.Vector3(-Math.sin(a) * vOrb, 0, Math.cos(a) * vOrb), { single: true });
   }

   setCameraView('overview');
   unlockEgg('big-bang', '奇点大爆炸重开宇宙：创世主星与全新六星原行星盘已诞生！');
   updateDockUI();
   return true;
  }

  return false;
 }

 function setTool(tool) {
  config.tool = tool === 'grab' ? 'grab' : tool === 'spawn' ? 'spawn' : 'orbit';
  if (config.tool === 'spawn') {
   config.showScenarios = false;
   config.showLaws = false;
  }
  if (config.tool !== 'grab' && drag.target) endDrag(false);
  if (config.tool !== 'spawn') {
   spawnDrag.active = false;
   spawnDrag.hoverValid = false;
   aimHud.hidden = true;
  }
  renderer.domElement.style.cursor = config.tool === 'grab' ? 'grab' : config.tool === 'spawn' ? 'crosshair' : '';
  updateDockUI();
 }

 function setSpawnType(typeId) {
  if (!SPAWN_CATALOG.some(c => c.id === typeId)) return;
  config.spawnType = typeId;
  config.showScenarios = false;
  config.showLaws = false;
  if (config.tool !== 'spawn') config.tool = 'spawn';
  updateDockUI();
 }

 function setSpawnMode(mode) {
  config.spawnMode = mode === 'stationary' ? 'stationary' : mode === 'slingshot' ? 'slingshot' : 'orbit';
  updateDockUI();
 }

 function setSpawnRetrograde(on) {
  config.spawnRetrograde = !!on;
  updateDockUI();
 }

 function setSpawnY(y) {
  config.spawnY = THREE.MathUtils.clamp(Math.round(Number(y) || 0), -48, 48);
  updateDockUI();
 }

 function setSpeed(speed) {
  const s = Number(speed);
  if (!Number.isFinite(s) || s <= 0) config.timeScale = 0;
  else config.timeScale = THREE.MathUtils.clamp(s, 0.05, 100);
  if (config.timeScale === 0 || config.timeScale <= 0.25) bulletTimer = 0;
  updateDockUI();
 }

 function setBhMass(mass) {
  config.bhMass = Math.max(2, Math.min(100, Number(mass) || baseBhMass));
  if (sim?.bh?.alive) sim.bh.mass = config.bhMass;
  updateDockUI();
  updateInspectorUI();
 }

 function setGravityScale(scale) {
  const prev = config.gravityScale;
  config.gravityScale = Math.max(-2.0, Math.min(5.0, Number(scale)));
  if (Number.isNaN(config.gravityScale)) config.gravityScale = 1.0;
  if (config.gravityScale < -0.05 && prev >= -0.05) {
   unlockEgg('anti-gravity', `引力已翻转至 ${config.gravityScale.toFixed(1)}×，整个星系进入斥力炸花态！`);
  }
  updateDockUI();
 }

 function setPlanetGravityBoost(mult) {
  config.planetGravityBoost = THREE.MathUtils.clamp(Number(mult) || 1.0, 1.0, 25.0);
  if (sim) computeAccelerations(sim.entities, true);
  updateDockUI();
  updateInspectorUI();
 }

 function setOrbitSpread(spread) {
  const next = THREE.MathUtils.clamp(Number(spread) || DEFAULT_ORBIT_SPREAD, 0.6, 3.0);
  const prev = sim?.spreadUsed || config.orbitSpread || 1.0;
  config.orbitSpread = next;
  if (active && sim && Math.abs(next - prev) > 0.005) {
   const ratio = next / prev;
   const invSqrt = 1 / Math.sqrt(ratio);
   const pivot = sim.barycenter.clone();
   const pVel = sim.baryVel.clone();
   for (const e of sim.entities) {
    if (!e.alive || e.pinned) continue;
    e.pos.sub(pivot).multiplyScalar(ratio).add(pivot);
    e.prevPos.copy(e.pos);
    e.vel.sub(pVel).multiplyScalar(invSqrt).add(pVel);
    if (e.isOriginal && e.visual) e.visual.history = [e.pos.clone()];
    else if (e.history) e.history = [e.pos.clone()];
   }
   sim.spreadUsed = next;
   computeAccelerations(sim.entities, true);
  }
  updateDockUI();
 }

 function setDrag(val) {
  config.drag = THREE.MathUtils.clamp(Number(val) || 0, 0, 1);
  updateDockUI();
 }

 function setCollisionMode(mode) {
  config.collisionMode = mode === 'accrete' ? 'accrete' : mode === 'elastic' ? 'elastic' : 'realistic';
  updateDockUI();
 }

 function setAllowBreakup(on) {
  config.allowBreakup = !!on;
  if (!config.allowBreakup && sim) {
   for (const e of sim.entities) {
    e.spinDamage = 0;
    e.tidalDamage = 0;
   }
  }
  updateDockUI();
  updateInspectorUI();
 }

 function saveSnapshot() {
  if (!active || !sim) return false;
  savedSnapshot = {
   config: {
    bhMass: config.bhMass,
    gravityScale: config.gravityScale,
    planetGravityBoost: config.planetGravityBoost,
    orbitSpread: config.orbitSpread,
    drag: config.drag,
    collisionMode: config.collisionMode,
    allowBreakup: config.allowBreakup,
    scenario: config.scenario
   },
   spreadUsed: sim.spreadUsed,
   entities: sim.entities.map(e => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    subType: e.subType,
    isOriginal: e.isOriginal,
    alive: e.alive,
    status: e.status,
    mass: e.mass,
    radius: e.radius,
    targetRadius: e.targetRadius,
    pos: [e.pos.x, e.pos.y, e.pos.z],
    vel: [e.vel.x, e.vel.y, e.vel.z],
    spinRate: e.spinRate || 0,
    spinAngle: e.spinAngle || 0,
    temperature: e.temperature || 280,
    lavaHeat: e.lavaHeat || 0,
    mergedCount: e.mergedCount || 0,
    noBreakup: !!e.noBreakup,
    pinned: !!e.pinned,
    colorHex: `#${e.color.getHexString()}`
   }))
  };
  showBanner('📷 阵型快照已保存', `已定格 ${savedSnapshot.entities.filter(x => x.alive).length} 颗天体的坐标、速度与全部物理参数`, 'info');
  updateDockUI();
  return true;
 }

 function restoreSnapshot() {
  if (!active || !savedSnapshot) return false;
  const snap = savedSnapshot;
  Object.assign(config, snap.config);
  initSimulation(lastSimTimeFromHost, snap.spreadUsed);

  // Restore original bodies first
  for (const rec of snap.entities) {
   if (!rec.isOriginal) continue;
   const ent = sim.entities.find(x => x.id === rec.id);
   if (!ent) continue;
   if (!rec.alive) {
    hideEntityVisual(ent);
    ent.status = rec.status;
    continue;
   }
   ent.alive = true;
   ent.status = rec.status;
   ent.mass = rec.mass;
   ent.radius = rec.radius;
   ent.targetRadius = rec.targetRadius;
   ent.pos.set(...rec.pos);
   ent.prevPos.copy(ent.pos);
   ent.vel.set(...rec.vel);
   ent.spinRate = rec.spinRate;
   ent.spinAngle = rec.spinAngle;
   ent.temperature = rec.temperature;
   ent.lavaHeat = rec.lavaHeat;
   ent.mergedCount = rec.mergedCount;
   ent.noBreakup = rec.noBreakup;
   ent.pinned = rec.pinned;
   ent.baseSpeed = ent.vel.length();
   ent.peakSpeed = ent.baseSpeed;
   if (ent.visual) ent.visual.history = [ent.pos.clone()];
  }

  // Recreate dynamic bodies
  for (const rec of snap.entities) {
   if (rec.isOriginal || !rec.alive) continue;
   const ent = spawnSingleEntity(rec.subType || 'rocky', new THREE.Vector3(...rec.pos), new THREE.Vector3(...rec.vel), {
    id: rec.id,
    name: rec.name,
    mass: rec.mass,
    radius: rec.radius,
    spinRate: rec.spinRate,
    temperature: rec.temperature,
    noBreakup: rec.noBreakup,
    pinned: rec.pinned,
    colorHex: rec.colorHex
   });
   if (ent) {
    ent.targetRadius = rec.targetRadius;
    ent.spinAngle = rec.spinAngle;
    ent.lavaHeat = rec.lavaHeat;
    ent.mergedCount = rec.mergedCount;
   }
  }

  computeAccelerations(sim.entities, true);
  applyVisualPoses(0);
  updateDockUI();
  updateInspectorUI();
  showBanner('↺ 已回滚阵型快照', `恢复 ${sim.entities.filter(e => e.alive).length} 颗天体与物理法则状态`, 'reset');
  return true;
 }

 function setOverlays(on) {
  config.overlays = !!on;
  updateDockUI();
 }

 function setAutoBulletTime(on) {
  config.autoBulletTime = !!on;
  if (!config.autoBulletTime) bulletTimer = 0;
  updateDockUI();
 }

 function setEntityMass(id, newMass) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  const m = Math.max(0.001, Number(newMass) || e.mass);
  e.mass = m;
  if (e.kind === 'bh') {
   e.targetRadius = baseBhRadius * bhVisualScale(m);
   if (e.id === (singularityDef?.id || 'guixu')) config.bhMass = m;
  } else if (e.kind === 'star') {
   e.targetRadius = THREE.MathUtils.clamp(STAR_RADIUS * Math.pow(m / STAR_MASS, 0.28), 3.2, 8.6);
  } else if (e.kind === 'planet') {
   e.targetRadius = THREE.MathUtils.clamp(e.baseRadius * Math.pow(m / Math.max(PLANET_MASSES[e.id] || 0.14, 0.04), 0.20), 1.2, 6.4);
  }
  checkMassCollapse(e);
  updateDockUI();
  updateInspectorUI();
  return true;
 }

 function setEntityRadius(id, newRadius) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  const r = THREE.MathUtils.clamp(Number(newRadius) || e.radius, 0.55, 10.5);
  e.radius = r;
  e.targetRadius = r;
  updateInspectorUI();
  return true;
 }

 function setEntitySpeed(id, newSpeed) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  const s = THREE.MathUtils.clamp(Number(newSpeed) || 0, 0, 140);
  if (s > 0.01) e.pinned = false;
  if (s <= 0.01) {
   e.vel.set(0, 0, 0);
  } else if (e.vel.lengthSq() > 1e-4) {
   e.vel.setLength(s);
  } else {
   const attr = dominantAttractorNear(e.pos, e, e.kind);
   const dir = attr ? circularVelocityAround(e.pos, attr, e.kind).sub(attr.vel) : new THREE.Vector3(1, 0, 0);
   if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
   e.vel.copy(dir.normalize().multiplyScalar(s));
  }
  e.baseSpeed = e.vel.length();
  e.peakSpeed = e.baseSpeed;
  updateInspectorUI();
  return true;
 }

 function setEntityStationary(id) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.vel.set(0, 0, 0);
  e.baseSpeed = 0;
  e.peakSpeed = 0;
  updateInspectorUI();
  return true;
 }

 function setEntityCircularOrbit(id, retrograde = false) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.pinned = false;
  const attr = dominantAttractorNear(e.pos, e, e.kind);
  if (!attr) return false;
  e.vel.copy(circularVelocityAround(e.pos, attr, e.kind, retrograde));
  e.baseSpeed = e.vel.length();
  e.peakSpeed = e.baseSpeed;
  showBanner('精准入轨', `${e.name} 已匹配环绕 ${attr.name} 的标准圆轨速度`, 'info');
  updateInspectorUI();
  return true;
 }

 function reverseEntityOrbit(id) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.pinned = false;
  const attr = dominantAttractorNear(e.pos, e, e.kind);
  if (attr) {
   e.vel.sub(attr.vel).negate().add(attr.vel);
  } else {
   e.vel.negate();
  }
  updateInspectorUI();
  return true;
 }

 function setEntitySpin(id, spinRate) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e || e.kind === 'bh' || e.kind === 'probe') return false;
  e.spinRate = THREE.MathUtils.clamp(Number(spinRate) || 0, -25, 25);
  const crit = criticalSpinFor(e);
  const ratio = Number.isFinite(crit) ? Math.abs(e.spinRate) / Math.max(crit, 0.05) : 0;
  const ob = Math.min(ratio, 1.38);
  e.oblateXZ = 1 + 0.30 * ob * ob;
  e.oblateY = 1 / (e.oblateXZ * e.oblateXZ);
  e._spinRatio = ratio;
  updateInspectorUI();
  return true;
 }

 function setEntityTemp(id, tempK) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.temperature = THREE.MathUtils.clamp(Number(tempK) || 280, 40, 4500);
  e.tempHold = 18;
  updateInspectorUI();
  return true;
 }

 function setEntityNoBreakup(id, on) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.noBreakup = !!on;
  if (e.noBreakup) {
   e.spinDamage = 0;
   e.tidalDamage = 0;
  }
  updateInspectorUI();
  return true;
 }

 function setEntityPinned(id, on) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.pinned = !!on;
  if (e.pinned) {
   e.vel.set(0, 0, 0);
   e.acc.set(0, 0, 0);
  }
  updateInspectorUI();
  return true;
 }

 function boostEntity(id, factor = 1.35) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  e.pinned = false;
  e.vel.multiplyScalar(factor);
  if (e.vel.length() > 140) e.vel.setLength(140);
  updateInspectorUI();
  return true;
 }

 function deleteEntity(id) {
  if (!active || !sim) return false;
  const e = sim.entities.find(x => x.id === id && x.alive);
  if (!e) return false;
  const nm = e.name;
  hideEntityVisual(e);
  e.status = 'deleted';
  showBanner('已移除天体', `${nm} 已从当前沙盒移出`, 'info');
  updateDockUI();
  return true;
 }

 function enter(hostSimTime = lastSimTimeFromHost) {
  if (active) return;
  active = true;
  root.visible = true;
  dock.hidden = false;
  camBar.hidden = false;
  dynamicLabelsEl.hidden = false;
  document.body.dataset.sandbox = 'true';

  // Unlock full 3D space navigation inside Sandbox!
  savedControls = {
   enablePan: controls.enablePan,
   screenSpacePanning: controls.screenSpacePanning,
   panSpeed: controls.panSpeed,
   minDistance: controls.minDistance,
   maxDistance: controls.maxDistance,
   minPolarAngle: controls.minPolarAngle,
   maxPolarAngle: controls.maxPolarAngle
  };
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = 1.15;
  controls.minDistance = 8;
  controls.maxDistance = 1280;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI * 0.96;

  onEnter();
  initSimulation(hostSimTime);
  setCameraView('overview', true);
  showBanner('宇宙沙盒 3.0 已就绪', '宽间距稳态开局 · 支持 0.05×～100× 变速、行星互引配月、静止投放、自转解体与物理法则定制', 'info');
 }

 function reset(hostSimTime = lastSimTimeFromHost) {
  if (!active) return;
  endDrag(false);
  spawnDrag.active = false;
  initSimulation(hostSimTime);
 }

 function restoreObservatoryVisuals() {
  for (const pv of planetVisuals) {
   const b = pv.body;
   b.root.visible = true;
   b.root.scale.set(1, 1, 1);
   b.root.quaternion.identity();
   b.surface.scale.setScalar(pv.baseRadius);
   if (b.clouds) b.clouds.scale.setScalar(pv.baseRadius * 1.012);
   if (b.atmosphere) {
    b.atmosphere.rotation.z = 0;
    b.atmosphere.scale.setScalar(pv.baseRadius * 1.06);
   }
   if (b.ring) {
    b.ring.visible = true;
    b.ring.scale.setScalar(1);
   }
   for (const m of b.moons) m.mesh.visible = true;
   b.label.innerHTML = `${b.def.name} <small>${b.def.au.toFixed(2)} AU</small>`;
   pv.crust.mesh.visible = false;
   pv.trail.geometry.setDrawRange(0, 0);
  }
  if (star) {
   star.visible = true;
   star.position.set(0, 0, 0);
   star.scale.copy(baseStarScale);
  }
  if (corona) {
   corona.visible = true;
   corona.position.set(0, 0, 0);
   corona.scale.copy(baseCoronaScale);
  }
  if (halo) {
   halo.visible = true;
   halo.position.set(0, 0, 0);
  }
  if (blackHole) blackHole.root.visible = true;
  if (lightPosition) lightPosition.set(0, 0, 0);
  if (belt) belt.position.set(0, 0, 0);
  dust?.setGravity?.({ strength: 0 });
 }

 function exit() {
  if (!active) return;
  endDrag(false);
  spawnDrag.active = false;
  keysHeld.clear();
  camAnim = null;
  followEntity = null;
  selectedEntity = null;
  active = false;
  root.visible = false;
  rocheVeil.visible = false;
  hoverRing.visible = false;
  selectRing.visible = false;
  spawnGhostRing.visible = false;
  spawnStem.visible = false;
  aimArrow.visible = false;
  previewLine.visible = false;
  aimHud.hidden = true;
  config.showScenarios = false;
  config.showLaws = false;
  config.gravityScale = 1.0;
  config.drag = 0;
  config.collisionMode = 'realistic';
  config.allowBreakup = true;
  config.scenario = 'default';
  dock.hidden = true;
  camBar.hidden = true;
  inspector.hidden = true;
  dynamicLabelsEl.hidden = true;
  banner.hidden = true;
  banner.classList.remove('show');
  document.body.dataset.sandbox = 'false';
  renderer.domElement.style.cursor = '';

  // Restore exact Observatory OrbitControls limits
  if (savedControls) {
   controls.enablePan = savedControls.enablePan;
   controls.screenSpacePanning = savedControls.screenSpacePanning;
   controls.panSpeed = savedControls.panSpeed;
   controls.minDistance = savedControls.minDistance;
   controls.maxDistance = savedControls.maxDistance;
   controls.minPolarAngle = savedControls.minPolarAngle;
   controls.maxPolarAngle = savedControls.maxPolarAngle;
   savedControls = null;
  }

  clearDynamicEntities();
  clearDebris();
  for (const s of shocks) {
   s.active = false;
   s.ring.visible = false;
   s.flash.visible = false;
  }
  restoreObservatoryVisuals();
  sim = null;
  bulletTimer = 0;
  bloomSurge = 0;
  rippleSurge = 0;
  onExit();
 }

 function flingBody(id, posArr, velArr) {
  if (!active || !sim) return false;
  const entity = sim.entities.find(e => e.id === id);
  if (!entity || !entity.alive) return false;
  entity.pinned = false;
  if (Array.isArray(posArr) && posArr.length === 3) {
   entity.pos.set(posArr[0], posArr[1], posArr[2]);
   entity.prevPos.copy(entity.pos);
  }
  if (Array.isArray(velArr) && velArr.length === 3) {
   entity.vel.set(velArr[0], velArr[1], velArr[2]);
   entity.baseSpeed = entity.vel.length();
   entity.peakSpeed = entity.baseSpeed;
  }
  computeAccelerations(sim.entities, true);
  return true;
 }

 let telemetryTick = 0;
 function update({ dt = 0, hostSimTime = 0, paused = false, reducedMotion = false } = {}) {
  lastSimTimeFromHost = hostSimTime;
  if (!active || !sim) return;

  const dtReal = Math.min(dt || 0, 0.08);
  simAge += dtReal;

  let effectiveScale = config.timeScale;
  if (bulletTimer > 0) {
   bulletTimer = Math.max(0, bulletTimer - dtReal);
   const prog = 1 - bulletTimer / Math.max(bulletDuration, 0.01);
   const dip = prog < 0.7 ? bulletFloor : THREE.MathUtils.lerp(bulletFloor, 1.0, (prog - 0.7) / 0.3);
   effectiveScale *= dip;
  }

  // True 0.05x .. 100x time scaling backed by adaptive Verlet substeps + CCD!
  const dtSim = (!paused && !reducedMotion && effectiveScale > 0) ? Math.min(dtReal * effectiveScale, 3.6) : 0;
  if (dtSim > 0) {
   simTime += dtSim;
   stepPhysics(dtSim);
  } else if (sim.bh?.alive) {
   sim.bh.mass = config.bhMass;
   sim.bh.radius = baseBhRadius * bhVisualScale(sim.bh.mass);
  }

  applyVisualPoses(dtReal);
  updateCameraMotion(dtReal);

  const mainBH = sim.bh?.alive ? sim.bh : sim.entities.find(e => e.alive && e.kind === 'bh');
  if (mainBH) {
   dust?.setGravity?.({
    origin: mainBH.pos,
    waveR: (simAge * 18) % 210,
    phase: simAge * 2.2,
    strength: 0.32 + Math.min(0.68, (mainBH.flare || 0) * 0.5)
   });
  }

  telemetryTick += dtReal;
  if (telemetryTick > 0.16) {
   telemetryTick = 0;
   updateDockUI();
   if (selectedEntity) updateInspectorUI();
  }
 }

 function getStats() {
  if (!sim) {
   return {
    active: false,
    alivePlanets: bodies.length,
    totalBodies: bodies.length + 2,
    aliveStars: 1,
    aliveBlackHoles: 1,
    aliveNeutronStars: 0,
    aliveWhiteDwarfs: 0,
    aliveMoons: 0,
    aliveProbes: 0,
    disrupted: 0,
    stellarTdes: 0,
    impacts: 0,
    mergers: 0,
    shatters: 0,
    vaporized: 0,
    supernovae: 0,
    typeIaSupernovae: 0,
    starMergers: 0,
    bhMergers: 0,
    kilonovae: 0,
    collapses: 0,
    slingshots: 0,
    spinBreakups: 0,
    elasticBounces: 0,
    spawned: 0,
    activeDebris: 0,
    bhFlare: 0,
    starDisp: 0,
    bhDisp: 0,
    barycenterSpeed: 0,
    orbitSpread: config.orbitSpread,
    planetGravityBoost: config.planetGravityBoost,
    drag: config.drag,
    collisionMode: config.collisionMode,
    allowBreakup: config.allowBreakup,
    hasSnapshot: !!savedSnapshot,
    following: null,
    selectedId: null,
    enablePan: !!controls.enablePan,
    lastEvent: '',
    planets: [],
    entities: []
   };
  }
  const origPlanets = sim.entities.filter(e => e.isOriginal && e.kind === 'planet');
  return {
   active,
   simTime: +simTime.toFixed(2),
   timeScale: config.timeScale,
   alivePlanets: origPlanets.filter(p => p.alive).length,
   totalBodies: sim.entities.filter(e => e.alive).length,
   aliveStars: sim.entities.filter(e => e.alive && e.kind === 'star').length,
   aliveBlackHoles: sim.entities.filter(e => e.alive && e.kind === 'bh').length,
   aliveNeutronStars: sim.entities.filter(e => e.alive && e.kind === 'neutron').length,
   aliveWhiteDwarfs: sim.entities.filter(e => e.alive && e.kind === 'white-dwarf').length,
   aliveMoons: sim.entities.filter(e => e.alive && e.kind === 'moon').length,
   aliveProbes: sim.entities.filter(e => e.alive && e.kind === 'probe').length,
   disrupted: stats.disrupted,
   stellarTdes: stats.stellarTdes,
   impacts: stats.impacts,
   mergers: stats.mergers,
   shatters: stats.shatters,
   vaporized: stats.vaporized,
   supernovae: stats.supernovae,
   typeIaSupernovae: stats.typeIaSupernovae,
   starMergers: stats.starMergers,
   bhMergers: stats.bhMergers,
   kilonovae: stats.kilonovae,
   collapses: stats.collapses,
   slingshots: stats.slingshots,
   bigBangs: stats.bigBangs,
   spinBreakups: stats.spinBreakups,
   elasticBounces: stats.elasticBounces,
   spawned: stats.spawned,
   scenario: config.scenario,
   orbitSpread: config.orbitSpread,
   planetGravityBoost: config.planetGravityBoost,
   drag: config.drag,
   collisionMode: config.collisionMode,
   allowBreakup: config.allowBreakup,
   spawnMode: config.spawnMode,
   hasSnapshot: !!savedSnapshot,
   unlockedEggs: [...unlockedEggs],
   eggCount: unlockedEggs.size,
   totalEggs: SANDBOX_EGGS.length,
   threeBodyActive,
   antiGravityActive: config.gravityScale < 0,
   activeDebris: activeDebrisCount,
   bhFlare: +(sim.bh?.flare || 0).toFixed(3),
   starAlive: !!sim.star?.alive,
   bhAlive: !!sim.bh?.alive,
   starDisp: +sim.star.pos.distanceTo(sim.starInitPos).toFixed(3),
   bhDisp: +sim.bh.pos.distanceTo(sim.bhInitPos).toFixed(3),
   barycenterSpeed: +sim.barySpeed.toFixed(4),
   bhMass: +(sim.bh?.mass || config.bhMass).toFixed(2),
   rocheRadiusRef: +rocheRadiusFor(3.0, sim.bh?.mass || config.bhMass).toFixed(2),
   following: followEntity?.id || null,
   selectedId: selectedEntity?.id || null,
   enablePan: !!controls.enablePan,
   lastEvent: stats.lastEvent,
   lastEnergy1e32J: stats.lastEnergy1e32J,
   planets: origPlanets.map(p => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    status: p.status,
    radius: +p.radius.toFixed(3),
    mass: +p.mass.toFixed(3),
    mergedCount: p.mergedCount,
    lavaHeat: +p.lavaHeat.toFixed(3),
    tidalStress: +p.tidalStress.toFixed(3),
    spinRate: +(p.spinRate || 0).toFixed(3),
    spinRatio: +(p._spinRatio || 0).toFixed(2),
    temperature: Math.round(p.temperature || 280),
    noBreakup: !!p.noBreakup,
    pinned: !!p.pinned,
    pos: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)]
   })),
   entities: sim.entities.filter(e => e.alive).map(e => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    subType: e.subType,
    mass: +e.mass.toFixed(3),
    radius: +e.radius.toFixed(3),
    speed: +e.vel.length().toFixed(2),
    escapeVel: +escapeVelocityFor(e).toFixed(2),
    spinRate: +(e.spinRate || 0).toFixed(3),
    criticalSpin: Number.isFinite(criticalSpinFor(e)) ? +criticalSpinFor(e).toFixed(3) : null,
    spinRatio: +(e._spinRatio || 0).toFixed(2),
    temperature: Math.round(e.temperature || 0),
    noBreakup: !!e.noBreakup,
    pinned: !!e.pinned,
    pos: [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)]
   }))
  };
 }

 return {
  get active() { return active; },
  get tool() { return config.tool; },
  get spawnType() { return config.spawnType; },
  get spawnMode() { return config.spawnMode; },
  get spawnRetrograde() { return config.spawnRetrograde; },
  get spawnY() { return config.spawnY; },
  get timeScale() { return config.timeScale; },
  get bhMass() { return sim?.bh?.alive ? sim.bh.mass : config.bhMass; },
  get gravityScale() { return config.gravityScale; },
  get planetGravityBoost() { return config.planetGravityBoost; },
  get orbitSpread() { return config.orbitSpread; },
  get drag() { return config.drag; },
  get collisionMode() { return config.collisionMode; },
  get allowBreakup() { return config.allowBreakup; },
  get overlays() { return config.overlays; },
  get autoBulletTime() { return config.autoBulletTime; },
  get starAlive() { return !active || !!sim?.star?.alive; },
  get blackHoleAlive() { return !active || !!sim?.bh?.alive; },
  get blackHolePosition() { return active && sim?.bh?.alive ? sim.bh.pos : null; },
  get blackHoleMassScale() { return active && sim?.bh?.alive ? bhVisualScale(sim.bh.mass) : 1; },
  get blackHoleGravityBoost() {
   if (!active || !sim?.bh?.alive) return 0;
   const massFactor = THREE.MathUtils.clamp((sim.bh.mass - 6) / 28, 0.15, 0.85);
   return Math.min(2.4, massFactor * 0.45 + (sim.bh.flare || 0));
  },
  get liveDistanceAu() {
   if (!active || !sim?.bh?.alive) return singularityDef?.au || 185;
   const ref = sim.star?.alive ? sim.star.pos : sim.barycenter;
   return Math.max(1.2, +(sim.bh.pos.distanceTo(ref) / 31.4 * 12).toFixed(1));
  },
  get bloomBoost() { return active ? bloomSurge : 0; },
  get rippleStrength() { return active ? rippleSurge : 0; },
  get followingId() { return followEntity?.id || null; },
  get selectedId() { return selectedEntity?.id || null; },
  get scenario() { return config.scenario; },
  get unlockedEggs() { return [...unlockedEggs]; },
  isPlanetAlive(id) {
   if (!active || !sim) return true;
   const p = sim.entities.find(x => x.id === id);
   return p ? p.alive : true;
  },
  enter,
  exit,
  reset,
  update,
  updateLabels,
  setTool,
  setSpawnType,
  setSpawnMode,
  setSpawnRetrograde,
  setSpawnY,
  setSpeed,
  setBhMass,
  setGravityScale,
  setPlanetGravityBoost,
  setOrbitSpread,
  setDrag,
  setCollisionMode,
  setAllowBreakup,
  saveSnapshot,
  restoreSnapshot,
  setOverlays,
  setAutoBulletTime,
  loadScenario,
  triggerPhenomenon,
  spawnBody,
  selectEntity,
  followBody,
  setCameraView,
  setEntityMass,
  setEntityRadius,
  setEntitySpeed,
  setEntityStationary,
  setEntityCircularOrbit,
  reverseEntityOrbit,
  setEntitySpin,
  setEntityTemp,
  setEntityNoBreakup,
  setEntityPinned,
  boostEntity,
  detonateBody,
  deleteEntity,
  flingBody,
  stats: getStats
 };
}
