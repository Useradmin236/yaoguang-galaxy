// Interactive N-Body Cosmic Sandbox for Yaoguang Observatory.
// Runs a real Velocity Verlet gravitational simulation with black-hole Roche tidal disruption
// (spaghettification -> debris accretion stream -> disk/jet flare), planetary giant impacts
// (molten magma merger / hypervelocity shatter / stellar vaporization), interactive grab & fling
// with gravity-bent trajectory preview, bullet-time highlights, and optional physics overlays.

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
 jixi: 0.065,
 mingai: 0.34,
 lingxi: 0.145,
 suxian: 0.42,
 xunqi: 0.125,
 qitang: 0.165
});

const MU_STAR_BASE = 920;
const STAR_MASS = 6.1;
const STAR_RADIUS = 5.1;
const MAX_DEBRIS = 2600;
const TRAIL_LEN = 96;
const MAX_SHOCKS = 14;
const PREVIEW_STEPS = 54;

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

 const root = new THREE.Group();
 root.name = 'Cosmic Sandbox';
 root.visible = false;
 scene.add(root);

 // Saved baselines for pristine restoration on exit.
 const baseStarScale = star ? star.scale.clone() : new THREE.Vector3(5.1, 4.85, 5.1);
 const baseCoronaScale = corona ? corona.scale.clone() : new THREE.Vector3(5.75, 5.75, 5.75);
 const baseBhRadius = singularityDef?.radius || 2.1;
 const baseBhMass = singularityDef?.massSolar || 12.4;

 // Configuration state
 const config = {
  tool: 'orbit', // 'orbit' | 'grab'
  timeScale: 1,
  bhMass: baseBhMass,
  gravityScale: 1,
  overlays: false,
  autoBulletTime: true
 };

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

 // Reusable scratch vectors
 const vA = new THREE.Vector3();
 const vB = new THREE.Vector3();
 const vC = new THREE.Vector3();
 const vD = new THREE.Vector3();
 const vUp = new THREE.Vector3(0, 1, 0);
 const qTmp = new THREE.Quaternion();
 const mTmp = new THREE.Matrix4();
 const raycaster = new THREE.Raycaster();
 const pointerNDC = new THREE.Vector2();
 const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
 const planeHit = new THREE.Vector3();

 // ==========================================================================
 // 1. SUBTLE BINARY SPACETIME METRIC GRID
 // ==========================================================================
 const gridUniforms = {
  uBH: { value: new THREE.Vector3(-64, 4, 22) },
  uStar: { value: new THREE.Vector3(0, 0, 0) },
  uBhMass: { value: baseBhMass },
  uStrength: { value: 0 },
  uPhase: { value: 0 },
  uColor: { value: new THREE.Vector3(...tone.grid) },
  uAccent: { value: new THREE.Vector3(...tone.accent) },
  uHdr: hdrBoost
 };
 const gridGeo = new THREE.PlaneGeometry(280, 280, 124, 124);
 gridGeo.rotateX(-Math.PI / 2);
 const gridMat = new THREE.ShaderMaterial({
  uniforms: gridUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   uniform vec3 uBH,uStar;
   uniform float uBhMass,uStrength,uPhase;
   varying vec2 vXZ;
   varying float vBhWell,vStarWell,vBhDist,vStarDist;
   void main(){
    vec3 pos=position;
    float dB=length(pos.xz-uBH.xz);
    float dS=length(pos.xz-uStar.xz);
    float mScale=clamp(uBhMass/12.4,.28,3.6);
    float wB=1./(1.+pow(dB/(13.5*pow(mScale,.35)),2.));
    float wS=1./(1.+pow(dS/13.,2.));
    float ripple=sin(dB*.19-uPhase*2.6)*exp(-dB*.016)*.9;
    pos.y+=(-wB*(11.5+5.5*pow(mScale,.45))-wS*5.2+ripple)*uStrength;
    vXZ=pos.xz;vBhWell=wB;vStarWell=wS;vBhDist=dB;vStarDist=dS;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec2 vXZ;
   varying float vBhWell,vStarWell,vBhDist,vStarDist;
   uniform float uStrength,uHdr;
   uniform vec3 uColor,uAccent;
   void main(){
    float radialFade=1.-smoothstep(96.,136.,length(vXZ));
    if(radialFade<=.002)discard;
    vec2 coord=vXZ/12.;
    vec2 fw=max(fwidth(coord),vec2(.001));
    vec2 g=abs(fract(coord-.5)-.5)/(fw*.9);
    float line=1.-min(min(g.x,g.y),1.);
    float clearCore=smoothstep(4.2,10.5,vBhDist)*smoothstep(4.5,9.5,vStarDist);
    float well=clamp(vBhWell+vStarWell*.5,0.,1.2);
    float vis=(.038+well*.26)*radialFade*uStrength*clearCore;
    vec3 col=mix(uColor,uAccent,clamp(vBhWell*.75,0.,1.))*mix(.88,1.14,uHdr);
    gl_FragColor=vec4(col,clamp(line*vis,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const metricGrid = new THREE.Mesh(gridGeo, gridMat);
 metricGrid.position.y = -7.5;
 metricGrid.renderOrder = 1;
 root.add(metricGrid);

 // ==========================================================================
 // 2. REAL-GRAVITY DEBRIS PARTICLE POOL (TDE STREAMS & IMPACT EJECTA)
 // ==========================================================================
 const dPos = new Float32Array(MAX_DEBRIS * 3);
 const dVel = new Float32Array(MAX_DEBRIS * 3);
 const dCol = new Float32Array(MAX_DEBRIS * 3);
 const dSize = new Float32Array(MAX_DEBRIS);
 const dHeat = new Float32Array(MAX_DEBRIS);
 const dLife = new Float32Array(MAX_DEBRIS);
 const dMaxLife = new Float32Array(MAX_DEBRIS);
 const dKind = new Uint8Array(MAX_DEBRIS); // 0 = rock/lava, 1 = ice/gas plasma
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
    float sz=aSize*(1.+aHeat*.45)*310./max(-mv.z,24.);
    gl_PointSize=clamp(sz,1.15,7.2);
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
    vec3 col=mix(vColor,hotLava,clamp(vHeat*.88,0.,1.));
    col*=mix(.86,1.18,uHdr)*(1.+core*.35);
    float fade=smoothstep(0.,.18,vLife);
    gl_FragColor=vec4(col,clamp((soft*.44+core*.28)*fade,0.,1.));
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
 // 3. SHOCKWAVE RINGS & VOLUMETRIC IMPACT FLASHES (POOLED)
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
     vec3 col=mix(uColorB,uColorA,crest)*mix(.92,1.45,uHdr);
     gl_FragColor=vec4(col,clamp((crest+inner)*wisps*uFade,0.,1.));
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
     float a=(core+halo+sx+sy)*uFade*(1.-smoothstep(.76,1.,r))*.72;
     vec3 col=mix(uColor,vec3(1.),core*.55)*mix(.90,1.25,uHdr);
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
  s.ring.rotation.set(tiltX + (rand() - 0.5) * 0.35, 0, tiltZ + (rand() - 0.5) * 0.35);
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
 // 4. DYNAMIC STELLAR ROCHE-LOBE PLASMA BRIDGE (ALKAID -> GUIXU)
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
    vec3 col=mix(vec3(.52,.80,1.),vec3(.92,.95,1.),smoothstep(.08,.50,vUv.x));
    col=mix(col,vec3(.98,.66,.36),smoothstep(.48,.94,vUv.x));
    float alpha=core*(.40+.60*strands)*env*uStrength*.58;
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
 // 5. PER-PLANET MOLTEN CRUST / TIDAL FISSURE SHELLS & ORBIT TRAILS
 // ==========================================================================
 const crustSphereGeo = new THREE.SphereGeometry(1, 48, 32);
 function createCrustShell(isGasOrIce) {
  const uniforms = {
   uTime: { value: 0 },
   uHeat: { value: 0 },
   uTidal: { value: 0 },
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
    varying vec3 vLocal;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main(){
     vLocal=normalize(position);
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*modelViewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal;
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform float uTime,uHeat,uTidal,uIsGas,uHdr;
    uniform vec3 uImpactDir;
    ${NOISE_GLSL}
    void main(){
     float energy=max(uHeat,uTidal);
     if(energy<=.005)discard;
     vec3 p=normalize(vLocal);
     float n1=fbm3(p*3.8+vec3(0.,uTime*.08,0.));
     float ridge1=1.-abs(noise3(p*6.4+vec3(n1*1.8,uTime*.12,-uTime*.06))*2.-1.);
     float ridge2=1.-abs(noise3(p*12.5-vec3(uTime*.09,n1*1.5,0.))*2.-1.);
     float cracks=pow(ridge1,4.6)*.85+pow(ridge2,5.8)*.55;

     // Crater focus on impact hemisphere + spreading fissures
     float hemi=smoothstep(-.28,.92,dot(p,normalize(uImpactDir)));
     float crater=smoothstep(.65,.98,dot(p,normalize(uImpactDir)))*uHeat;
     float impactMask=(cracks*(.35+.85*hemi)+crater*.95)*uHeat;

     // Tidal stress glows along stretched polar tips + rim plasma stripping
     vec3 V=normalize(cameraPosition-vWorld);
     float limb=pow(1.-abs(dot(normalize(vNormal),V)),2.4);
     float tidalMask=(cracks*.78+limb*.72)*uTidal;

     float total=clamp(impactMask+tidalMask,0.,1.5);
     vec3 lavaCol=mix(vec3(.92,.24,.04),vec3(1.,.74,.26),smoothstep(.15,.72,total));
     lavaCol=mix(lavaCol,vec3(1.,.96,.88),smoothstep(.68,1.25,total));
     vec3 gasCol=mix(vec3(.38,.78,1.),vec3(1.,.84,.58),smoothstep(.25,.95,total));
     vec3 col=mix(lavaCol,gasCol,uIsGas*(uTidal/(energy+.001)));
     col*=mix(.92,1.48,uHdr);
     gl_FragColor=vec4(col,clamp(total*.92,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const mesh = new THREE.Mesh(crustSphereGeo, mat);
  mesh.visible = false;
  mesh.renderOrder = 3;
  return { mesh, uniforms };
 }

 const planetVisuals = bodies.map(b => {
  const isGas = b.def.kind === 1 || b.def.kind === 4;
  const crust = createCrustShell(isGas);
  b.root.add(crust.mesh);

  const posArr = new Float32Array(TRAIL_LEN * 3);
  const colArr = new Float32Array(TRAIL_LEN * 3);
  const c = new THREE.Color(b.def.color || '#9ec6e4');
  for (let i = 0; i < TRAIL_LEN; i++) {
   const fade = Math.pow(i / (TRAIL_LEN - 1), 1.7);
   colArr[i * 3] = c.r * fade;
   colArr[i * 3 + 1] = c.g * fade;
   colArr[i * 3 + 2] = c.b * fade;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const trail = new THREE.Line(
   geo,
   new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending
   })
  );
  trail.frustumCulled = false;
  root.add(trail);
  return { body: b, crust, trail, history: [], baseRadius: b.def.radius };
 });

 // ==========================================================================
 // 6. OPTIONAL PHYSICS OVERLAYS (ROCHE LIMIT, BARYCENTER, VELOCITY ARROWS)
 // ==========================================================================
 const overlaysGroup = new THREE.Group();
 overlaysGroup.name = 'Sandbox physics overlays';
 overlaysGroup.visible = false;
 root.add(overlaysGroup);

 // Dynamic Roche limit dashed ring around Guixu
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
 rocheLimitRing.name = 'Roche limit ring';
 overlaysGroup.add(rocheLimitRing);

 // Inner accretion capture ring
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

 // Star-BH binary link & barycenter reticle
 const baryLinkGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
 const baryLink = new THREE.Line(
  baryLinkGeo,
  new THREE.LineBasicMaterial({ color: tone.bary, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 overlaysGroup.add(baryLink);

 const baryReticle = new THREE.Group();
 const crossPts = [
  -2.2, 0, 0, 2.2, 0, 0,
  0, 0, -2.2, 0, 0, 2.2,
  0, -1.6, 0, 0, 1.6, 0
 ];
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

 // Per-planet velocity vector arrows (shaft + 2 arrowhead wings = 3 line segments)
 const velArrows = bodies.map(b => {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  const line = new THREE.LineSegments(
   geo,
   new THREE.LineBasicMaterial({
    color: new THREE.Color(b.def.color || '#9ec6e4'),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
   })
  );
  line.frustumCulled = false;
  overlaysGroup.add(line);
  return line;
 });

 // ==========================================================================
 // 7. INTERACTIVE GRAB HALO & LIVE GRAVITY-BENT TRAJECTORY PREVIEW
 // ==========================================================================
 const grabGroup = new THREE.Group();
 grabGroup.name = 'Sandbox grab guides';
 root.add(grabGroup);

 const hoverRingPts = [];
 for (let i = 0; i <= 64; i++) {
  const a = (i / 64) * Math.PI * 2;
  hoverRingPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
 }
 const hoverRing = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(hoverRingPts),
  new THREE.LineBasicMaterial({ color: 0xe6f2ff, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 hoverRing.visible = false;
 grabGroup.add(hoverRing);

 const previewPos = new Float32Array(PREVIEW_STEPS * 3);
 const previewCol = new Float32Array(PREVIEW_STEPS * 3);
 for (let i = 0; i < PREVIEW_STEPS; i++) {
  const fade = 1 - i / (PREVIEW_STEPS - 1);
  previewCol[i * 3] = 0.76 * fade + 0.22;
  previewCol[i * 3 + 1] = 0.88 * fade + 0.1;
  previewCol[i * 3 + 2] = 1.0 * fade;
 }
 const previewGeo = new THREE.BufferGeometry();
 previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPos, 3));
 previewGeo.setAttribute('color', new THREE.BufferAttribute(previewCol, 3));
 const previewLine = new THREE.Line(
  previewGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
 );
 previewLine.visible = false;
 previewLine.frustumCulled = false;
 grabGroup.add(previewLine);

 // ==========================================================================
 // 8. SIMULATION DATA & PHYSICS HELPERS
 // ==========================================================================
 let sim = null;
 const stats = {
  disrupted: 0,
  impacts: 0,
  mergers: 0,
  shatters: 0,
  vaporized: 0,
  lastEvent: '',
  lastEnergy1e32J: 0
 };

 function bhVisualScale(massSolar = config.bhMass) {
  return THREE.MathUtils.clamp(Math.pow(massSolar / baseBhMass, 0.35), 0.56, 1.62);
 }

 function rocheRadiusFor(planetRadius, bhMass = config.bhMass) {
  const bhR = baseBhRadius * bhVisualScale(bhMass);
  return THREE.MathUtils.clamp(
   bhR * 4.55 * Math.pow(bhMass / baseBhMass, 1 / 3) * Math.pow(planetRadius / 2.8, 0.36),
   10.8,
   33.0
  );
 }

 function gUnit() {
  return (MU_STAR_BASE / STAR_MASS) * config.gravityScale;
 }

 function triggerBulletTime(duration = 1.6, floor = 0.18) {
  if (!config.autoBulletTime || config.timeScale <= 0.25) return;
  bulletDuration = duration;
  bulletFloor = floor;
  bulletTimer = duration;
 }

 function announceEvent(title, detail, badge = 'event', energy1e32J = 0) {
  stats.lastEvent = `${title} · ${detail}`;
  if (energy1e32J > 0) stats.lastEnergy1e32J = energy1e32J;
  showBanner(title, detail, badge);
  onEvent({ title, detail, badge, energy1e32J });
  updateDockUI();
 }

 function initSimulation(hostSimTime = lastSimTimeFromHost) {
  clearDebris();
  for (const s of shocks) {
   s.active = false;
   s.ring.visible = false;
   s.flash.visible = false;
  }
  stats.disrupted = 0;
  stats.impacts = 0;
  stats.mergers = 0;
  stats.shatters = 0;
  stats.vaporized = 0;
  stats.lastEvent = '';
  stats.lastEnergy1e32J = 0;
  bulletTimer = 0;
  bloomSurge = 0;
  rippleSurge = 0;
  simTime = 0;
  simAge = 0;

  const G = gUnit();
  const bhMass = config.bhMass;
  const bhScale = bhVisualScale(bhMass);
  const bhR = baseBhRadius * bhScale;

  // Place Guixu just inside Alkaid's outer edge with an elliptical binary sweep velocity
  // so real gravitational curves begin naturally even before dragging.
  const bhPos = new THREE.Vector3(-64, 4.2, 22);
  const starPos = new THREE.Vector3(0, 0, 0);
  const sep = bhPos.length();
  const totalBinMass = STAR_MASS + bhMass;
  const vBin = Math.sqrt((G * totalBinMass) / sep) * 0.62;
  const tangBH = new THREE.Vector3(-bhPos.z / sep, 0, bhPos.x / sep);

  // Zero-momentum center-of-mass velocities for the Alkaid-Guixu binary
  const bhVel = tangBH.clone().multiplyScalar(vBin * (STAR_MASS / totalBinMass));
  const starVel = tangBH.clone().multiplyScalar(-vBin * (bhMass / totalBinMass));

  const starEntity = {
   id: 'yaoguang',
   name: '瑶光',
   kind: 'star',
   mass: STAR_MASS,
   radius: STAR_RADIUS,
   pos: starPos,
   vel: starVel,
   acc: new THREE.Vector3(),
   accNext: new THREE.Vector3(),
   alive: true,
   flare: 0
  };

  const bhEntity = {
   id: singularityDef?.id || 'guixu',
   name: singularityDef?.name || '归墟',
   kind: 'bh',
   mass: bhMass,
   radius: bhR,
   pos: bhPos,
   vel: bhVel,
   acc: new THREE.Vector3(),
   accNext: new THREE.Vector3(),
   alive: true,
   flare: 0
  };

  const planets = planetVisuals.map((pv, idx) => {
   const b = pv.body;
   const d = b.def;
   const a = d.phase + (hostSimTime / d.period) * Math.PI * 2;
   const pos = new THREE.Vector3(Math.cos(a) * d.orbit, 0, Math.sin(a) * d.orbit);
   const r = Math.max(pos.length(), 7);
   const tang = new THREE.Vector3(-pos.z / r, 0, pos.x / r);
   const vOrb = Math.sqrt((G * STAR_MASS) / r);
   const vel = tang.multiplyScalar(vOrb).add(starVel);

   // Restore full pristine appearance for every planet
   b.root.visible = true;
   b.root.position.copy(pos);
   b.root.scale.set(1, 1, 1);
   b.root.quaternion.identity();
   b.surface.scale.setScalar(pv.baseRadius);
   if (b.clouds) b.clouds.scale.setScalar(pv.baseRadius * 1.012);
   if (b.atmosphere) b.atmosphere.scale.setScalar(pv.baseRadius * 1.06);
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
   pv.history = [pos.clone()];
   pv.trail.geometry.setDrawRange(0, 1);
   pv.trail.material.opacity = 0.68;

   const mass = PLANET_MASSES[d.id] || 0.14;
   return {
    index: idx,
    id: d.id,
    name: d.name,
    kind: 'planet',
    visual: pv,
    body: b,
    isGasOrIce: d.kind === 1 || d.kind === 4,
    color: new THREE.Color(d.color || '#9ec6e4'),
    baseRadius: pv.baseRadius,
    radius: pv.baseRadius,
    targetRadius: pv.baseRadius,
    mass,
    pos,
    vel,
    acc: new THREE.Vector3(),
    accNext: new THREE.Vector3(),
    alive: true,
    status: 'intact',
    mergedCount: 0,
    tidalStress: 0,
    tidalDamage: 0,
    lavaHeat: 0,
    impactDir: new THREE.Vector3(1, 0, 0),
    trailFade: 1
   };
  });

  sim = {
   star: starEntity,
   bh: bhEntity,
   planets,
   all: [starEntity, bhEntity, ...planets],
   barycenter: new THREE.Vector3(),
   barySpeed: 0
  };

  computeAccelerations(sim.all, true);
  applyVisualPoses(0);
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

    const heavyPair = a.kind !== 'planet' || b.kind !== 'planet';
    const soft = heavyPair ? (a.radius + b.radius) * 0.42 + 1.8 : (a.radius + b.radius) * 0.22 + 0.35;
    const denom = Math.pow(r2 + soft * soft, 1.5);
    const inv = G / denom;

    // Limit peak acceleration to avoid numerical spikes during ultra-close encounters
    const fA = Math.min(inv * b.mass, 90 / (Math.sqrt(r2) + 0.5));
    const fB = Math.min(inv * a.mass, 90 / (Math.sqrt(r2) + 0.5));

    accA.x += dx * fA; accA.y += dy * fA; accA.z += dz * fA;
    accB.x -= dx * fB; accB.y -= dy * fB; accB.z -= dz * fB;
   }
  }
 }

 // ==========================================================================
 // 9. TIDAL DISRUPTION (TDE) & GIANT IMPACT HANDLERS
 // ==========================================================================
 function disruptPlanetTDE(p) {
  if (!p.alive || !sim) return;
  p.alive = false;
  p.status = 'disrupted';
  stats.disrupted++;
  p.body.root.visible = false;
  p.visual.crust.mesh.visible = false;
  for (const m of p.body.moons) m.mesh.visible = false;

  const bh = sim.bh;
  vA.copy(bh.pos).sub(p.pos);
  const dist = Math.max(vA.length(), 1);
  vA.divideScalar(dist); // unit vector toward Guixu
  vB.crossVectors(vA, vUp);
  if (vB.lengthSq() < 1e-4) vB.set(1, 0, 0);
  else vB.normalize();
  vC.crossVectors(vB, vA).normalize();

  // Spawn 680 real-gravity debris particles stretched along the tidal axis with orbital tangential shear!
  const count = 680;
  const stretchL = p.radius * 2.95;
  const baseR = p.color.r, baseG = p.color.g, baseB = p.color.b;
  const vCirc = Math.sqrt((gUnit() * bh.mass) / Math.max(dist, 8));
  // Align tangent with the planet's existing angular momentum direction around Guixu
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

   // Real tidal differential velocity: inner stream orbits fast around Guixu (forming a glowing accretion spiral),
   // outer half stretches into a sweeping unbound tidal tail.
   const normAlong = along / stretchL; // -1 (far tail) .. +1 (near-BH accretion tip)
   const orbitalV = vCirc * (0.72 + normAlong * 0.28 + (rand() - 0.5) * 0.14);
   const radialBias = normAlong * vCirc * 0.22;
   const scatter = 1.45;
   const vx = bh.vel.x + relVel.x * 0.35 + tangDir.x * orbitalV + vA.x * radialBias + (rand() - 0.5) * scatter;
   const vy = bh.vel.y + relVel.y * 0.35 + (rand() - 0.5) * scatter * 0.7;
   const vz = bh.vel.z + relVel.z * 0.35 + tangDir.z * orbitalV + vA.z * radialBias + (rand() - 0.5) * scatter;

   const isCore = Math.abs(normAlong) < 0.42;
   const heat = p.isGasOrIce ? (0.45 + rand() * 0.48) : (isCore ? 0.78 + rand() * 0.22 : 0.46 + rand() * 0.44);
   const size = 1.35 + Math.pow(rand(), 1.5) * 2.65;
   const life = 28 + rand() * 24;
   spawnDebris(px, py, pz, vx, vy, vz, baseR, baseG, baseB, size, heat, life, p.isGasOrIce ? 1 : 0);
  }

  spawnShockwave(p.pos, {
   maxRadius: p.radius * 5.2,
   flashSize: p.radius * 5.8,
   dur: 2.3,
   colorA: p.isGasOrIce ? [0.80, 0.94, 1.0] : [1.0, 0.88, 0.64],
   colorB: p.isGasOrIce ? [0.42, 0.72, 1.0] : [0.98, 0.48, 0.18]
  });

  bh.flare = Math.min(1.6, bh.flare + 0.65);
  bloomSurge = Math.min(0.42, bloomSurge + 0.24);
  rippleSurge = Math.min(0.85, rippleSurge + 0.58);
  triggerBulletTime(1.65, 0.18);

  const energy = +(2.6 * p.mass * (bh.mass / 12.4) * (24 / Math.max(dist, 6))).toFixed(1);
  announceEvent('潮汐撕裂 · TDE', `${p.name} 跨越归墟洛希极限，化作螺旋吸积流`, 'tde', energy);
 }

 function handlePlanetImpact(a, b) {
  if (!a.alive || !b.alive || !sim) return;
  stats.impacts++;

  vA.copy(b.pos).sub(a.pos);
  const dist = Math.max(vA.length(), 0.1);
  const normal = vA.clone().divideScalar(dist); // a -> b
  const hitPos = a.pos.clone().addScaledVector(normal, a.radius * (dist / (a.radius + b.radius)));

  vB.copy(a.vel).sub(b.vel);
  const relSpeed = vB.length();
  const totalMass = a.mass + b.mass;
  const vEsc = Math.sqrt((2 * gUnit() * totalMass) / Math.max(a.radius + b.radius, 1.5));
  const reducedMass = (a.mass * b.mass) / totalMass;
  const energy = +(0.5 * reducedMass * relSpeed * relSpeed * 0.18).toFixed(1);
  const massRatio = Math.max(a.mass, b.mass) / Math.max(Math.min(a.mass, b.mass), 0.01);

  const hypervelocity = relSpeed >= Math.max(13.5, vEsc * 2.8) && massRatio < 2.8;

  // Tangent basis around impact normal
  vC.crossVectors(normal, vUp);
  if (vC.lengthSq() < 1e-4) vC.set(1, 0, 0);
  else vC.normalize();
  vD.crossVectors(normal, vC).normalize();

  const cmVel = a.vel.clone().multiplyScalar(a.mass).addScaledVector(b.vel, b.mass).divideScalar(totalMass);

  if (hypervelocity) {
   // Catastrophic Shatter: BOTH planets disintegrate into a glowing multi-hue debris cloud!
   stats.shatters++;
   for (const victim of [a, b]) {
    victim.alive = false;
    victim.status = 'shattered';
    victim.body.root.visible = false;
    victim.visual.crust.mesh.visible = false;
    for (const m of victim.body.moons) m.mesh.visible = false;
   }

   const count = 720;
   for (let i = 0; i < count; i++) {
    const src = i < count * 0.5 ? a : b;
    const theta = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = Math.cos(theta) * s, dy = u, dz = Math.sin(theta) * s;
    const rad = Math.pow(rand(), 0.5) * src.radius * 0.95;
    const px = hitPos.x + dx * rad;
    const py = hitPos.y + dy * rad * 0.7;
    const pz = hitPos.z + dz * rad;

    // Combine CM velocity + energetic radial blast + residual shearing
    const blast = (0.28 + Math.pow(rand(), 1.3) * 0.85) * Math.min(relSpeed * 0.65, 22);
    const vx = cmVel.x + (src.vel.x - cmVel.x) * 0.35 + dx * blast;
    const vy = cmVel.y + dy * blast * 0.55;
    const vz = cmVel.z + (src.vel.z - cmVel.z) * 0.35 + dz * blast;

    const heat = 0.55 + rand() * 0.45;
    const size = 1.2 + Math.pow(rand(), 1.5) * 2.8;
    spawnDebris(px, py, pz, vx, vy, vz, src.color.r, src.color.g, src.color.b, size, heat, 28 + rand() * 22, src.isGasOrIce ? 1 : 0);
   }

   spawnShockwave(hitPos, {
    maxRadius: (a.radius + b.radius) * 5.0,
    flashSize: (a.radius + b.radius) * 5.2,
    dur: 2.8,
    colorA: [1.0, 0.96, 0.86],
    colorB: [1.0, 0.42, 0.14]
   });
   spawnShockwave(hitPos, {
    maxRadius: (a.radius + b.radius) * 3.4,
    flashSize: (a.radius + b.radius) * 3.0,
    dur: 2.1,
    colorA: [0.92, 0.96, 1.0],
    colorB: [0.95, 0.62, 0.25],
    tiltX: Math.PI * 0.22,
    tiltZ: 0.45
   });

   bloomSurge = Math.min(0.46, bloomSurge + 0.30);
   rippleSurge = Math.min(0.85, rippleSurge + 0.48);
   triggerBulletTime(1.75, 0.16);
   announceEvent('超高速粉碎', `${a.name} × ${b.name} 灾难性对撞解体（${energy}×10³² J）`, 'shatter', energy);
  } else {
   // Accretionary Giant Impact: Molten Merger with glowing lava crust + ejecta ring!
   stats.mergers++;
   const survivor = a.mass >= b.mass ? a : b;
   const absorbed = survivor === a ? b : a;
   const impactFromAbsorbed = absorbed.pos.clone().sub(survivor.pos).normalize();

   absorbed.alive = false;
   absorbed.status = 'merged';
   absorbed.body.root.visible = false;
   absorbed.visual.crust.mesh.visible = false;
   for (const m of absorbed.body.moons) m.mesh.visible = false;

   // Conserve momentum & volume
   survivor.pos.copy(survivor.pos.clone().multiplyScalar(survivor.mass).addScaledVector(absorbed.pos, absorbed.mass).divideScalar(totalMass));
   survivor.vel.copy(cmVel);
   survivor.mass = totalMass;
   survivor.targetRadius = Math.min(7.2, Math.cbrt(Math.pow(survivor.radius, 3) + Math.pow(absorbed.radius, 3)));
   survivor.mergedCount++;
   survivor.lavaHeat = 1.0;
   survivor.impactDir.copy(impactFromAbsorbed);

   // Eject molten splash cone & equatorial debris ring
   const count = 380;
   const splashSpeed = Math.max(4.5, Math.min(relSpeed * 0.58, 16));
   for (let i = 0; i < count; i++) {
    const inRing = i < count * 0.55;
    const ang = rand() * Math.PI * 2;
    let dirX, dirY, dirZ;
    if (inRing) {
     // Splash sideways along the collision tangent plane
     const lift = (rand() - 0.5) * 0.45;
     dirX = vC.x * Math.cos(ang) + vD.x * Math.sin(ang) + impactFromAbsorbed.x * lift;
     dirY = vC.y * Math.cos(ang) + vD.y * Math.sin(ang) + (rand() - 0.5) * 0.55;
     dirZ = vC.z * Math.cos(ang) + vD.z * Math.sin(ang) + impactFromAbsorbed.z * lift;
    } else {
     // Plume blasting back from impact caldera
     const spread = 0.65;
     dirX = impactFromAbsorbed.x + (rand() - 0.5) * spread;
     dirY = impactFromAbsorbed.y + (rand() - 0.5) * spread;
     dirZ = impactFromAbsorbed.z + (rand() - 0.5) * spread;
    }
    const dl = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= dl; dirY /= dl; dirZ /= dl;
    const spd = (0.35 + Math.pow(rand(), 1.2) * 0.95) * splashSpeed;
    const src = rand() < 0.6 ? absorbed : survivor;
    const px = hitPos.x + dirX * (0.6 + rand() * 1.6);
    const py = hitPos.y + dirY * (0.6 + rand() * 1.4);
    const pz = hitPos.z + dirZ * (0.6 + rand() * 1.6);
    spawnDebris(
     px, py, pz,
     cmVel.x + dirX * spd, cmVel.y + dirY * spd, cmVel.z + dirZ * spd,
     src.color.r, src.color.g, src.color.b,
     1.1 + Math.pow(rand(), 1.5) * 2.5,
     0.65 + rand() * 0.35,
     22 + rand() * 18,
     0
    );
   }

   spawnShockwave(hitPos, {
    maxRadius: (survivor.targetRadius + absorbed.radius) * 3.8,
    flashSize: (survivor.targetRadius + absorbed.radius) * 4.2,
    dur: 2.3,
    colorA: [1.0, 0.94, 0.80],
    colorB: [1.0, 0.45, 0.14]
   });

   bloomSurge = Math.min(0.44, bloomSurge + 0.26);
   rippleSurge = Math.min(0.80, rippleSurge + 0.34);
   triggerBulletTime(1.55, 0.18);
   const ratio = (survivor.mass / (PLANET_MASSES[survivor.id] || 0.14)).toFixed(2);
   announceEvent('行星大撞击 · 熔融合并', `${survivor.name} 吞并 ${absorbed.name}（质量 ×${ratio} · ${energy}×10³² J）`, 'merger', energy);
  }
 }

 function handleStellarImpact(p) {
  if (!p.alive || !sim) return;
  p.alive = false;
  p.status = 'vaporized';
  stats.impacts++;
  stats.vaporized++;
  p.body.root.visible = false;
  p.visual.crust.mesh.visible = false;
  for (const m of p.body.moons) m.mesh.visible = false;

  const s = sim.star;
  const hitDir = p.pos.clone().sub(s.pos).normalize();
  const hitPos = s.pos.clone().addScaledVector(hitDir, s.radius * 1.02);

  // Blue-white coronal eruption ejecta
  for (let i = 0; i < 300; i++) {
   const spread = 1.1;
   let dx = hitDir.x + (rand() - 0.5) * spread;
   let dy = hitDir.y + (rand() - 0.5) * spread;
   let dz = hitDir.z + (rand() - 0.5) * spread;
   const dl = Math.hypot(dx, dy, dz) || 1;
   dx /= dl; dy /= dl; dz /= dl;
   const spd = 6 + rand() * 16;
   spawnDebris(
    hitPos.x + dx * rand() * 1.8,
    hitPos.y + dy * rand() * 1.8,
    hitPos.z + dz * rand() * 1.8,
    s.vel.x + dx * spd, s.vel.y + dy * spd, s.vel.z + dz * spd,
    0.58, 0.84, 1.0,
    1.3 + rand() * 2.2,
    0.85 + rand() * 0.15,
    14 + rand() * 12,
    1
   );
  }

  spawnShockwave(hitPos, {
   maxRadius: 24,
   flashSize: 28,
   dur: 2.2,
   colorA: [0.80, 0.94, 1.0],
   colorB: [0.32, 0.68, 1.0]
  });

  s.flare = Math.min(1.5, s.flare + 1.0);
  bloomSurge = Math.min(0.9, bloomSurge + 0.48);
  triggerBulletTime(1.35, 0.22);
  announceEvent('恒星吞噬 · 耀斑爆发', `${p.name} 坠入主星瑶光，激起蓝白日冕喷发`, 'stellar', +(p.mass * 48).toFixed(1));
 }

 // ==========================================================================
 // 10. VELOCITY VERLET PHYSICS STEP + DEBRIS GRAVITY + TDE / COLLISIONS
 // ==========================================================================
 function stepPhysics(dtSim) {
  if (!sim || dtSim <= 0) return;
  const substeps = 6;
  const h = dtSim / substeps;
  const bh = sim.bh;
  const st = sim.star;

  bh.mass = config.bhMass;
  bh.radius = baseBhRadius * bhVisualScale(bh.mass);

  for (let s = 0; s < substeps; s++) {
   // 1. Velocity Verlet position update
   for (const e of sim.all) {
    if (!e.alive || drag.target === e) continue;
    e.pos.x += e.vel.x * h + 0.5 * e.acc.x * h * h;
    e.pos.y += e.vel.y * h + 0.5 * e.acc.y * h * h;
    e.pos.z += e.vel.z * h + 0.5 * e.acc.z * h * h;
   }

   // 2. Recompute pairwise accelerations at new positions
   computeAccelerations(sim.all, false);

   // 3. Velocity Verlet velocity update
   for (const e of sim.all) {
    if (!e.alive || drag.target === e) continue;
    e.vel.x += 0.5 * (e.acc.x + e.accNext.x) * h;
    e.vel.y += 0.5 * (e.acc.y + e.accNext.y) * h;
    e.vel.z += 0.5 * (e.acc.z + e.accNext.z) * h;
    e.acc.copy(e.accNext);
    // Guard against runaway velocity
    const spdSq = e.vel.lengthSq();
    if (spdSq > 140 * 140) e.vel.multiplyScalar(140 / Math.sqrt(spdSq));
   }

   // 4. Prevent Alkaid from clipping straight inside Guixu's horizon (close Roche binary sweep)
   vA.copy(st.pos).sub(bh.pos);
   const sbDist = vA.length();
   const minSB = Math.max(15.5, bh.radius * 4.4 + st.radius);
   if (sbDist < minSB && sbDist > 1e-3) {
    vA.divideScalar(sbDist);
    const overlap = minSB - sbDist;
    if (drag.target === bh) {
     st.pos.addScaledVector(vA, overlap);
    } else if (drag.target === st) {
     bh.pos.addScaledVector(vA, -overlap);
    } else {
     const wS = bh.mass / (bh.mass + st.mass);
     const wB = 1 - wS;
     st.pos.addScaledVector(vA, overlap * wS);
     bh.pos.addScaledVector(vA, -overlap * wB);
    }
    const relN = st.vel.clone().sub(bh.vel).dot(vA);
    if (relN < 0) {
     const damp = -relN * 1.05;
     const wS = bh.mass / (bh.mass + st.mass);
     if (drag.target !== st) st.vel.addScaledVector(vA, damp * wS);
     if (drag.target !== bh) bh.vel.addScaledVector(vA, -damp * (1 - wS));
    }
    bh.flare = Math.min(1.6, bh.flare + h * 0.45);
   }

   // 5. Check Tidal Disruption (Roche limit) & Stellar/Horizon impacts
   for (const p of sim.planets) {
    if (!p.alive) continue;

    // Smoothly grow merged planets toward volume-conserved radius
    if (Math.abs(p.radius - p.targetRadius) > 0.005) {
     p.radius += (p.targetRadius - p.radius) * Math.min(1, h * 9);
    }

    // Distance to Guixu
    const dBH = p.pos.distanceTo(bh.pos);
    const rocheR = rocheRadiusFor(p.radius, bh.mass);

    if (dBH < rocheR * 1.9) {
     const stress = THREE.MathUtils.smoothstep(dBH, rocheR * 1.9, rocheR * 0.94);
     p.tidalStress = Math.max(p.tidalStress * Math.exp(-h * 2.5), stress);
     // Accumulate tidal structural fracture if deep inside warning zone
     if (dBH < rocheR * 1.32) {
      p.tidalDamage += (0.45 + stress * 1.65) * h;
      // Continuously strip fine hot filaments toward Guixu as planet spaghettifies!
      if (rand() < Math.min(0.85, (0.22 + stress * 0.65) * h * 26)) {
       vA.copy(bh.pos).sub(p.pos).normalize();
       const side = vB.crossVectors(vA, vUp).normalize();
       const sign = rand() < 0.72 ? 1 : -1; // L1 tip dominates, L2 minor tail
       const sx = p.pos.x + vA.x * p.radius * 1.35 * sign + (rand() - 0.5) * p.radius * 0.5;
       const sy = p.pos.y + (rand() - 0.5) * p.radius * 0.45;
       const sz = p.pos.z + vA.z * p.radius * 1.35 * sign + (rand() - 0.5) * p.radius * 0.5;
       spawnDebris(
        sx, sy, sz,
        p.vel.x + vA.x * 4.5 * sign + side.x * 2.4,
        p.vel.y + (rand() - 0.5) * 1.2,
        p.vel.z + vA.z * 4.5 * sign + side.z * 2.4,
        p.color.r, p.color.g, p.color.b,
        1.1 + rand() * 1.5,
        0.55 + stress * 0.45,
        12 + rand() * 10,
        p.isGasOrIce ? 1 : 0
       );
      }
     }
     if (dBH <= rocheR * 1.02 || p.tidalDamage >= 1.0) {
      if (drag.target === p) endDrag(false);
      disruptPlanetTDE(p);
      continue;
     }
    } else {
     p.tidalStress *= Math.exp(-h * 2.4);
     p.tidalDamage = Math.max(0, p.tidalDamage - h * 0.25);
    }

    // Distance to Alkaid
    const dStar = p.pos.distanceTo(st.pos);
    if (dStar < (st.radius + p.radius) * 0.92) {
     if (drag.target === p) endDrag(false);
     handleStellarImpact(p);
     continue;
    }

    // Cool molten impact crust slowly over time
    if (p.lavaHeat > 0.002) {
     p.lavaHeat *= Math.exp(-0.042 * h);
    } else {
     p.lavaHeat = 0;
    }
   }

   // 6. Pairwise Planet–Planet Giant Impact Detection
   for (let i = 0; i < sim.planets.length; i++) {
    const a = sim.planets[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < sim.planets.length; j++) {
     const b = sim.planets[j];
     if (!b.alive) continue;
     const minR = (a.radius + b.radius) * 0.96;
     if (a.pos.distanceToSquared(b.pos) < minR * minR) {
      if (drag.target === a || drag.target === b) endDrag(false);
      handlePlanetImpact(a, b);
      if (!a.alive) break;
     }
    }
   }
  }

  // Update system barycenter (Alkaid + Guixu)
  const binM = st.mass + bh.mass;
  sim.barycenter.set(
   (st.pos.x * st.mass + bh.pos.x * bh.mass) / binM,
   (st.pos.y * st.mass + bh.pos.y * bh.mass) / binM,
   (st.pos.z * st.mass + bh.pos.z * bh.mass) / binM
  );
  sim.barySpeed = Math.hypot(
   (st.vel.x * st.mass + bh.vel.x * bh.mass) / binM,
   (st.vel.z * st.mass + bh.vel.z * bh.mass) / binM
  );

  // Integrate real-gravity debris particles (2 substeps)
  stepDebris(dtSim);
 }

 function stepDebris(dtSim) {
  if (!sim || dtSim <= 0) return;
  const G = gUnit();
  const bh = sim.bh;
  const st = sim.star;
  const bx = bh.pos.x, by = bh.pos.y, bz = bh.pos.z;
  const sx = st.pos.x, sy = st.pos.y, sz = st.pos.z;
  const muBH = G * bh.mass;
  const muStar = G * st.mass;
  const captureR2 = Math.pow(bh.radius * 1.85, 2);
  const heatZoneR2 = Math.pow(bh.radius * 8.2, 2);
  const starConsumeR2 = Math.pow(st.radius * 0.95, 2);
  const h = dtSim * 0.5;
  let aliveCount = 0;
  let consumedCount = 0;

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

   for (let sub = 0; sub < 2; sub++) {
    const dbx = bx - px, dby = by - py, dbz = bz - pz;
    const rb2 = dbx * dbx + dby * dby + dbz * dbz;
    if (rb2 < captureR2) {
     absorbed = true;
     consumedCount++;
     break;
    }
    const dsx = sx - px, dsy = sy - py, dsz = sz - pz;
    const rs2 = dsx * dsx + dsy * dsy + dsz * dsz;
    if (rs2 < starConsumeR2) {
     absorbed = true;
     break;
    }

    const ab = muBH / Math.pow(rb2 + 9.0, 1.5);
    const as = muStar / Math.pow(rs2 + 16.0, 1.5);
    vx += (dbx * ab + dsx * as) * h;
    vy += (dby * ab + dsy * as) * h;
    vz += (dbz * ab + dsz * as) * h;

    // Subtle accretion disk tidal friction & heating near Guixu
    if (rb2 < heatZoneR2) {
     const dragK = Math.exp(-0.18 * h);
     vx *= dragK; vy *= dragK; vz *= dragK;
     dHeat[i] = Math.min(1.0, dHeat[i] + h * 0.55);
    } else {
     dHeat[i] = Math.max(0.08, dHeat[i] * Math.exp(-0.065 * h));
    }

    px += vx * h;
    py += vy * h;
    pz += vz * h;
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

  if (consumedCount > 0) {
   bh.flare = Math.min(1.6, bh.flare + consumedCount * 0.012);
   bloomSurge = Math.min(0.38, bloomSurge + consumedCount * 0.0025);
   rippleSurge = Math.min(0.75, rippleSurge + consumedCount * 0.004);
  }

  activeDebrisCount = aliveCount;
  dPosAttr.needsUpdate = true;
  dColAttr.needsUpdate = true;
  dSizeAttr.needsUpdate = true;
  dHeatAttr.needsUpdate = true;
  dLifeAttr.needsUpdate = true;
 }

 // ==========================================================================
 // 11. APPLY 3D VISUALS (PLANETS, SPAGHETTIFICATION, ROCHE BRIDGE, OVERLAYS)
 // ==========================================================================
 function applyVisualPoses(dtReal) {
  if (!sim) return;
  const st = sim.star;
  const bh = sim.bh;

  // 1. Alkaid pose + subtle tidal elongation toward Guixu when close
  const sbDelta = vA.copy(bh.pos).sub(st.pos);
  const sbDist = Math.max(sbDelta.length(), 1);
  const starTidal = THREE.MathUtils.smoothstep(sbDist, 66, 22) * THREE.MathUtils.clamp(bh.mass / 12.4, 0.4, 2.2);
  if (star) {
   star.position.copy(st.pos);
   const stretch = 1 + Math.min(0.20, starTidal * 0.14);
   const squash = 1 / Math.sqrt(stretch);
   star.scale.set(baseStarScale.x * stretch, baseStarScale.y * squash, baseStarScale.z * squash);
   star.rotation.y = -Math.atan2(bh.pos.z - st.pos.z, bh.pos.x - st.pos.x);
  }
  if (corona) {
   corona.position.copy(st.pos);
   corona.scale.copy(baseCoronaScale).multiplyScalar(1 + Math.min(0.24, starTidal * 0.08 + st.flare * 0.18));
  }
  if (halo) halo.position.copy(st.pos);
  if (lightPosition) lightPosition.copy(st.pos);

  // Decay flares smoothly
  bh.flare *= Math.exp(-dtReal * 0.95);
  st.flare *= Math.exp(-dtReal * 1.45);
  bloomSurge *= Math.exp(-dtReal * 1.6);
  rippleSurge *= Math.exp(-dtReal * 1.8);

  // 2. Dynamic Stellar Roche-Lobe Plasma Bridge when Alkaid & Guixu approach
  const bridgeStrength = THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(sbDist, 64, 28) * Math.min(1.3, bh.mass / 10), 0, 1);
  if (bridgeStrength > 0.01) {
   rocheVeil.visible = true;
   vB.copy(sbDelta).divideScalar(sbDist); // dir
   vC.crossVectors(vB, vUp);
   if (vC.lengthSq() < 1e-4) vC.set(1, 0, 0);
   else vC.normalize();
   const start = st.pos.clone().addScaledVector(vB, st.radius);
   const c1 = start.clone().lerp(bh.pos, 0.35).addScaledVector(vC, sbDist * 0.19).add(new THREE.Vector3(0, 1.8, 0));
   const c2 = start.clone().lerp(bh.pos, 0.76).addScaledVector(vC, sbDist * 0.13).add(new THREE.Vector3(0, 0.9, 0));
   const vAttr = rocheVeil.geometry.attributes.position;
   for (let i = 0; i <= veilSegs; i++) {
    const t = i / veilSegs, omt = 1 - t;
    const x = omt * omt * omt * start.x + 3 * omt * omt * t * c1.x + 3 * omt * t * t * c2.x + t * t * t * bh.pos.x;
    const y = omt * omt * omt * start.y + 3 * omt * omt * t * c1.y + 3 * omt * t * t * c2.y + t * t * t * bh.pos.y;
    const z = omt * omt * omt * start.z + 3 * omt * omt * t * c1.z + 3 * omt * t * t * c2.z + t * t * t * bh.pos.z;
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

  // 3. Planets: position, volume-conserved growth, spaghettification stretch, molten/tidal crust & trails
  for (const p of sim.planets) {
   const pv = p.visual;
   const b = p.body;
   if (p.alive) {
    b.root.visible = true;
    b.root.position.copy(p.pos);
    const scaleFactor = p.radius / p.baseRadius;
    b.surface.scale.setScalar(p.radius);
    if (b.clouds) b.clouds.scale.setScalar(p.radius * 1.012);
    if (b.atmosphere) b.atmosphere.scale.setScalar(p.radius * 1.06);
    if (b.ring) {
     b.ring.scale.setScalar(scaleFactor);
     b.ring.material.uniforms.uCenter.value.copy(p.pos);
    }

    // Spaghettification deformation along axis toward Guixu!
    if (p.tidalStress > 0.015) {
     const stretch = 1 + p.tidalStress * 1.48;
     const squash = 1 / Math.sqrt(stretch);
     vB.copy(bh.pos).sub(p.pos).normalize();
     qTmp.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vB);
     b.root.quaternion.copy(qTmp);
     b.root.scale.set(stretch, squash, squash);
    } else {
     b.root.quaternion.identity();
     b.root.scale.set(1, 1, 1);
    }

    // Molten / Tidal Crust Shell
    const crustHeat = Math.max(p.lavaHeat, p.tidalStress);
    if (crustHeat > 0.008) {
     pv.crust.mesh.visible = true;
     pv.crust.mesh.scale.setScalar(p.radius * 1.028);
     pv.crust.uniforms.uTime.value = simAge;
     pv.crust.uniforms.uHeat.value = p.lavaHeat;
     pv.crust.uniforms.uTidal.value = p.tidalStress;
     pv.crust.uniforms.uImpactDir.value.copy(p.impactDir);
    } else {
     pv.crust.mesh.visible = false;
    }

    // Push orbital trail
    const last = pv.history[pv.history.length - 1];
    if (!last || last.distanceToSquared(p.pos) > 0.42) {
     pv.history.push(p.pos.clone());
     if (pv.history.length > TRAIL_LEN) pv.history.shift();
    }
    const arr = pv.trail.geometry.attributes.position;
    for (let j = 0; j < pv.history.length; j++) {
     const pt = pv.history[j];
     arr.setXYZ(j, pt.x, pt.y, pt.z);
    }
    arr.needsUpdate = true;
    pv.trail.geometry.setDrawRange(0, pv.history.length);
    pv.trail.material.opacity = 0.66;

    // Update label live
    const tag = p.mergedCount > 0 ? `合并 ×${p.mergedCount + 1}` : p.tidalStress > 0.25 ? '洛希撕裂中' : `${(p.pos.distanceTo(st.pos) / 31.4).toFixed(2)} AU`;
    const small = b.label.querySelector('small');
    if (small && small.textContent !== tag) small.textContent = tag;
   } else {
    // Fade dead planet's historical trajectory gradually
    p.trailFade = Math.max(0, p.trailFade - dtReal * 0.14);
    pv.trail.material.opacity = 0.52 * p.trailFade;
   }
  }

  // 4. Update shockwaves & volumetric flashes
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

  // 5. Spacetime metric grid
  gridUniforms.uBH.value.copy(bh.pos);
  gridUniforms.uStar.value.copy(st.pos);
  gridUniforms.uBhMass.value = bh.mass;
  gridUniforms.uPhase.value = simAge;
  gridUniforms.uStrength.value = config.overlays ? 0.92 : 0.42;

  // 6. Asteroid belt gently tracks star-BH midpoint
  if (belt) {
   belt.position.lerp(sim.barycenter, 0.08);
  }

  // 7. Optional Physics Overlays (Roche ring, barycenter, velocity arrows)
  overlaysGroup.visible = config.overlays;
  if (config.overlays) {
   const refRoche = rocheRadiusFor(3.0, bh.mass);
   rocheLimitRing.position.copy(bh.pos);
   rocheLimitRing.scale.setScalar(refRoche);
   rocheLimitRing.rotation.y = simAge * 0.18;

   captureRing.position.copy(bh.pos);
   captureRing.scale.setScalar(bh.radius * 3.1);

   const bArr = baryLink.geometry.attributes.position;
   bArr.setXYZ(0, st.pos.x, st.pos.y, st.pos.z);
   bArr.setXYZ(1, bh.pos.x, bh.pos.y, bh.pos.z);
   bArr.needsUpdate = true;

   baryReticle.position.copy(sim.barycenter);
   baryReticle.rotation.y = simAge * 0.5;

   for (let i = 0; i < sim.planets.length; i++) {
    const p = sim.planets[i];
    const arrow = velArrows[i];
    if (!p.alive) {
     arrow.visible = false;
     continue;
    }
    const spd = p.vel.length();
    if (spd < 0.05) {
     arrow.visible = false;
     continue;
    }
    arrow.visible = true;
    const len = Math.min(22, Math.max(3.5, spd * 1.15));
    const dir = vA.copy(p.vel).divideScalar(spd);
    const side = vB.crossVectors(dir, vUp);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    else side.normalize();

    const startX = p.pos.x + dir.x * (p.radius + 0.6);
    const startY = p.pos.y + dir.y * (p.radius + 0.6);
    const startZ = p.pos.z + dir.z * (p.radius + 0.6);
    const tipX = startX + dir.x * len;
    const tipY = startY + dir.y * len;
    const tipZ = startZ + dir.z * len;
    const headBack = 1.65;
    const headWide = 0.85;

    const aPos = arrow.geometry.attributes.position;
    // Main shaft
    aPos.setXYZ(0, startX, startY, startZ);
    aPos.setXYZ(1, tipX, tipY, tipZ);
    // Left wing
    aPos.setXYZ(2, tipX, tipY, tipZ);
    aPos.setXYZ(3, tipX - dir.x * headBack + side.x * headWide, tipY - dir.y * headBack, tipZ - dir.z * headBack + side.z * headWide);
    // Right wing
    aPos.setXYZ(4, tipX, tipY, tipZ);
    aPos.setXYZ(5, tipX - dir.x * headBack - side.x * headWide, tipY - dir.y * headBack, tipZ - dir.z * headBack - side.z * headWide);
    aPos.needsUpdate = true;
   }
  }

  // 8. Hover / Drag targeting visuals & live gravity-bent preview trajectory
  updateDragGuides();
 }

 // ==========================================================================
 // 12. INTERACTIVE GOD-HAND GRAB & FLING WITH GRAVITY-BENT TRAJECTORY PREVIEW
 // ==========================================================================
 const drag = {
  hovered: null,
  target: null,
  pointerId: null,
  lastPos: new THREE.Vector3(),
  throwVel: new THREE.Vector3(),
  lastMoveMs: 0,
  moved: false
 };

 function pickSandboxEntity(clientX, clientY) {
  if (!active || !sim) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  const ray = raycaster.ray;

  // Generous ray-to-sphere proximity picking so moving planets & Guixu are effortless to grab!
  let best = null;
  let bestScore = Infinity;
  const candidates = [sim.bh, ...sim.planets];
  for (const e of candidates) {
   if (!e.alive) continue;
   const distAlong = ray.direction.dot(vA.copy(e.pos).sub(ray.origin));
   if (distAlong < 0) continue;
   const closestPt = vB.copy(ray.origin).addScaledVector(ray.direction, distAlong);
   const perp = closestPt.distanceTo(e.pos);
   const pickR = e.kind === 'bh' ? Math.max(e.radius * 3.8, 7.5) : Math.max(e.radius * 2.15, 4.8);
   if (perp < pickR) {
    const score = perp / pickR + distAlong * 0.0005;
    if (score < bestScore) {
     bestScore = score;
     best = e;
    }
   }
  }
  return best;
 }

 function updateDragGuides() {
  const focus = drag.target || drag.hovered;
  if (active && focus && focus.alive && (config.tool === 'grab' || drag.target)) {
   hoverRing.visible = true;
   hoverRing.position.copy(focus.pos);
   const r = focus.kind === 'bh' ? focus.radius * 3.6 : focus.radius * 1.85;
   hoverRing.scale.setScalar(r * (drag.target ? 1.12 : 1.0));
   hoverRing.material.color.setHex(drag.target ? 0xffd59c : 0xd6ecff);
  } else {
   hoverRing.visible = false;
  }

  // While dragging a planet, integrate a real 54-step gravity-bent preview trajectory!
  if (active && drag.target && drag.target.kind === 'planet' && sim) {
   previewLine.visible = true;
   const G = gUnit();
   const pPos = drag.target.pos.clone();
   const pVel = drag.throwVel.clone();
   const arr = previewLine.geometry.attributes.position;
   const stepH = 0.095;
   for (let i = 0; i < PREVIEW_STEPS; i++) {
    arr.setXYZ(i, pPos.x, pPos.y, pPos.z);
    let ax = 0, ay = 0, az = 0;
    for (const o of sim.all) {
     if (!o.alive || o === drag.target) continue;
     const dx = o.pos.x - pPos.x, dy = o.pos.y - pPos.y, dz = o.pos.z - pPos.z;
     const soft = o.kind !== 'planet' ? (o.radius + drag.target.radius) * 0.42 + 1.8 : 1.2;
     const inv = (G * o.mass) / Math.pow(dx * dx + dy * dy + dz * dz + soft * soft, 1.5);
     ax += dx * inv; ay += dy * inv; az += dz * inv;
    }
    pVel.x += ax * stepH; pVel.y += ay * stepH; pVel.z += az * stepH;
    pPos.x += pVel.x * stepH; pPos.y += pVel.y * stepH; pPos.z += pVel.z * stepH;
   }
   arr.needsUpdate = true;
  } else {
   previewLine.visible = false;
  }
 }

 function endDrag(applyThrow = true) {
  if (!drag.target) return;
  const entity = drag.target;
  if (applyThrow && entity.alive) {
   if (drag.moved && performance.now() - drag.lastMoveMs < 140) {
    // Clamp max throw velocity so planets can trigger awesome hypervelocity shatters without teleporting to infinity
    const maxV = entity.kind === 'bh' ? 18 : 34;
    if (drag.throwVel.length() > maxV) drag.throwVel.setLength(maxV);
    entity.vel.copy(drag.throwVel);
   } else if (entity.kind === 'bh') {
    entity.vel.multiplyScalar(0.25);
   }
  }
  drag.target = null;
  drag.pointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = config.tool === 'grab' ? 'grab' : '';
 }

 function onPointerDown(e) {
  if (!active || !sim || e.button !== 0) return;
  const wantGrab = config.tool === 'grab' || e.shiftKey;
  if (!wantGrab) return;

  const picked = pickSandboxEntity(e.clientX, e.clientY);
  if (!picked) return; // Empty sky still orbits cleanly!

  e.stopImmediatePropagation();
  drag.target = picked;
  drag.pointerId = e.pointerId;
  drag.lastPos.copy(picked.pos);
  drag.throwVel.copy(picked.vel);
  drag.lastMoveMs = performance.now();
  drag.moved = false;
  dragPlane.set(vUp, -picked.pos.y);
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
 }

 function onPointerMove(e) {
  if (!active || !sim) return;
  if (drag.target) {
   const rect = renderer.domElement.getBoundingClientRect();
   pointerNDC.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
   raycaster.setFromCamera(pointerNDC, camera);
   if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
    // Clamp drag arena so user never drops a body out at 5000 units
    const len = Math.hypot(planeHit.x, planeHit.z);
    if (len > 115) {
     planeHit.x *= 115 / len;
     planeHit.z *= 115 / len;
    }
    const now = performance.now();
    const dtMs = Math.max(8, now - drag.lastMoveMs);
    const instVel = vA.copy(planeHit).sub(drag.target.pos).divideScalar(dtMs / 1000);
    // Smooth throw velocity for crisp cosmic billiards feel
    drag.throwVel.lerp(instVel.multiplyScalar(0.42), 0.55);
    drag.target.pos.copy(planeHit);
    drag.target.vel.copy(drag.throwVel);
    drag.lastPos.copy(planeHit);
    drag.lastMoveMs = now;
    drag.moved = true;
   }
   return;
  }
  if (config.tool === 'grab' || e.shiftKey) {
   drag.hovered = pickSandboxEntity(e.clientX, e.clientY);
   renderer.domElement.style.cursor = drag.hovered ? 'grab' : '';
  } else {
   drag.hovered = null;
   renderer.domElement.style.cursor = '';
  }
 }

 function onPointerUp(e) {
  if (!drag.target) return;
  if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
  endDrag(true);
 }

 renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
 window.addEventListener('pointermove', onPointerMove, { passive: true });
 window.addEventListener('pointerup', onPointerUp);
 window.addEventListener('pointercancel', onPointerUp);

 // ==========================================================================
 // 13. SANDBOX HUD DOCK & CINEMATIC EVENT BANNER
 // ==========================================================================
 const banner = document.createElement('div');
 banner.id = 'sandbox-banner';
 banner.setAttribute('role', 'status');
 banner.setAttribute('aria-live', 'polite');
 banner.hidden = true;
 banner.innerHTML = '<span class="sb-banner-dot" aria-hidden="true"></span><div><strong id="sb-banner-title"></strong><p id="sb-banner-detail"></p></div>';
 document.body.append(banner);

 function showBanner(title, detail, badge = 'event') {
  banner.dataset.kind = badge;
  banner.querySelector('#sb-banner-title').textContent = title;
  banner.querySelector('#sb-banner-detail').textContent = detail;
  banner.hidden = false;
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
   banner.classList.remove('show');
   bannerTimer = setTimeout(() => { if (!banner.classList.contains('show')) banner.hidden = true; }, 320);
  }, 4400);
 }

 const dock = document.createElement('aside');
 dock.id = 'sandbox-dock';
 dock.setAttribute('aria-label', '宇宙沙盒操控台');
 dock.hidden = true;
 dock.innerHTML = `
  <div id="sb-telemetry" class="sb-telemetry" hidden>
   <span class="sb-tel-item"><small>存活行星</small><strong id="sb-alive">6 / 6</strong></span>
   <span class="sb-tel-item"><small>潮汐撕裂</small><strong id="sb-tde">0</strong></span>
   <span class="sb-tel-item"><small>大撞击</small><strong id="sb-impacts">0</strong></span>
   <span class="sb-tel-item"><small>活跃碎片</small><strong id="sb-debris">0</strong></span>
   <span class="sb-tel-item sb-tel-wide"><small>最近事件</small><strong id="sb-last">双星引力演化中</strong></span>
  </div>
  <div class="sb-bar">
   <div class="sb-group sb-mode-group" role="group" aria-label="交互工具">
    <button type="button" class="sb-pill" data-tool="orbit" aria-pressed="true" title="拖动旋转星系视角">视角</button>
    <button type="button" class="sb-pill" data-tool="grab" aria-pressed="false" title="拖动黑洞或任意行星轻甩对撞（也可按住 Shift 抓取）">抓取天体</button>
   </div>
   <div class="sb-divider" aria-hidden="true"></div>
   <div class="sb-group sb-speed-group" role="group" aria-label="时间流速">
    <button type="button" class="sb-pill" data-speed="0" aria-pressed="false" title="暂停物理演化">Ⅱ</button>
    <button type="button" class="sb-pill" data-speed="0.15" aria-pressed="false" title="子弹时间慢动作">0.15×</button>
    <button type="button" class="sb-pill" data-speed="0.5" aria-pressed="false">0.5×</button>
    <button type="button" class="sb-pill" data-speed="1" aria-pressed="true">1×</button>
    <button type="button" class="sb-pill" data-speed="2.5" aria-pressed="false">2.5×</button>
   </div>
   <div class="sb-divider" aria-hidden="true"></div>
   <label class="sb-slider" for="sb-bh-mass">
    <span>归墟质量 <output id="sb-bh-mass-out">12.4 M☉</output></span>
    <input id="sb-bh-mass" type="range" min="2" max="45" step="0.5" value="12.4">
   </label>
   <label class="sb-slider" for="sb-gravity">
    <span>引力倍率 <output id="sb-gravity-out">1.0×</output></span>
    <input id="sb-gravity" type="range" min="0.5" max="3" step="0.1" value="1">
   </label>
   <div class="sb-divider" aria-hidden="true"></div>
   <div class="sb-group sb-toggles">
    <button id="sb-bullet-btn" type="button" class="sb-chip" aria-pressed="true" title="碰撞与撕裂瞬间自动触发慢动作">子弹时间</button>
    <button id="sb-overlay-btn" type="button" class="sb-chip" aria-pressed="false" title="显示洛希极限圈、共同质心、速度矢量与遥测读数">辅助线</button>
   </div>
   <div class="sb-divider" aria-hidden="true"></div>
   <div class="sb-group sb-actions">
    <button id="sb-reset-btn" type="button" class="sb-act" title="立即恢复完整六星与归墟">↺ 重置</button>
    <button id="sb-exit-btn" type="button" class="sb-act sb-exit" title="退出沙盒，返回观星展示模式">退出沙盒</button>
   </div>
  </div>
  <p id="sb-hint" class="sb-hint">实时 N-Body 物理运行中 · 切到「抓取天体」（或按住 Shift）可拎动归墟或甩出行星制造大撞击</p>
 `;
 document.body.append(dock);

 function setRangePct(el) {
  const min = Number(el.min) || 0, max = Number(el.max) || 1, val = Number(el.value);
  el.style.setProperty('--pct', Math.max(0, Math.min(100, ((val - min) / (max - min || 1)) * 100)).toFixed(1) + '%');
 }

 function updateDockUI() {
  for (const btn of dock.querySelectorAll('[data-tool]')) {
   btn.setAttribute('aria-pressed', String(btn.dataset.tool === config.tool));
  }
  for (const btn of dock.querySelectorAll('[data-speed]')) {
   btn.setAttribute('aria-pressed', String(Number(btn.dataset.speed) === config.timeScale));
  }
  const massEl = dock.querySelector('#sb-bh-mass');
  massEl.value = config.bhMass;
  dock.querySelector('#sb-bh-mass-out').textContent = `${config.bhMass.toFixed(1)} M☉`;
  setRangePct(massEl);

  const gravEl = dock.querySelector('#sb-gravity');
  gravEl.value = config.gravityScale;
  dock.querySelector('#sb-gravity-out').textContent = `${config.gravityScale.toFixed(1)}×`;
  setRangePct(gravEl);

  dock.querySelector('#sb-bullet-btn').setAttribute('aria-pressed', String(config.autoBulletTime));
  dock.querySelector('#sb-overlay-btn').setAttribute('aria-pressed', String(config.overlays));
  dock.querySelector('#sb-telemetry').hidden = !config.overlays;
  dock.dataset.bullet = String(bulletTimer > 0.05);

  const hint = dock.querySelector('#sb-hint');
  if (config.tool === 'grab') {
   hint.textContent = '抓取模式 · 直接拖走黑洞搅局，或甩出任意行星瞄准对撞 / 投入洛希极限（拖空白处仍可环绕视角）';
  } else {
   hint.textContent = '实时 N-Body 物理运行中 · 点「抓取天体」（或按住 Shift）可拖曳归墟与行星，调大质量扩张洛希极限';
  }

  if (sim) {
   const alive = sim.planets.filter(p => p.alive).length;
   dock.querySelector('#sb-alive').textContent = `${alive} / ${sim.planets.length}`;
   dock.querySelector('#sb-tde').textContent = String(stats.disrupted);
   dock.querySelector('#sb-impacts').textContent = String(stats.impacts);
   dock.querySelector('#sb-debris').textContent = String(activeDebrisCount);
   dock.querySelector('#sb-last').textContent = stats.lastEvent || '双星实时互引中';
  }
 }

 dock.querySelectorAll('[data-tool]').forEach(btn => {
  btn.onclick = () => setTool(btn.dataset.tool);
 });
 dock.querySelectorAll('[data-speed]').forEach(btn => {
  btn.onclick = () => setSpeed(Number(btn.dataset.speed));
 });
 dock.querySelector('#sb-bh-mass').oninput = e => setBhMass(Number(e.target.value));
 dock.querySelector('#sb-gravity').oninput = e => setGravityScale(Number(e.target.value));
 dock.querySelector('#sb-bullet-btn').onclick = () => setAutoBulletTime(!config.autoBulletTime);
 dock.querySelector('#sb-overlay-btn').onclick = () => setOverlays(!config.overlays);
 dock.querySelector('#sb-reset-btn').onclick = () => {
  reset();
  showBanner('时空复原', '六颗行星与归墟已回到初始沙盒构型', 'reset');
 };
 dock.querySelector('#sb-exit-btn').onclick = () => exit();

 // ==========================================================================
 // 14. PUBLIC LIFECYCLE & CONTROL METHODS
 // ==========================================================================
 function setTool(tool) {
  config.tool = tool === 'grab' ? 'grab' : 'orbit';
  if (config.tool === 'orbit' && drag.target) endDrag(false);
  renderer.domElement.style.cursor = config.tool === 'grab' ? 'grab' : '';
  updateDockUI();
 }

 function setSpeed(speed) {
  config.timeScale = Math.max(0, Math.min(4, Number(speed) || 0));
  if (config.timeScale === 0 || config.timeScale <= 0.25) bulletTimer = 0;
  updateDockUI();
 }

 function setBhMass(mass) {
  config.bhMass = Math.max(2, Math.min(45, Number(mass) || baseBhMass));
  if (sim) sim.bh.mass = config.bhMass;
  updateDockUI();
 }

 function setGravityScale(scale) {
  config.gravityScale = Math.max(0.5, Math.min(3, Number(scale) || 1));
  updateDockUI();
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

 function enter(hostSimTime = lastSimTimeFromHost) {
  if (active) return;
  active = true;
  root.visible = true;
  dock.hidden = false;
  document.body.dataset.sandbox = 'true';
  onEnter();
  initSimulation(hostSimTime);
  showBanner('宇宙沙盒已启动', '全 N-Body 实时引力接管 · 可抓取黑洞或行星制造撞击与撕裂', 'info');
 }

 function reset(hostSimTime = lastSimTimeFromHost) {
  if (!active) return;
  endDrag(false);
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
   if (b.atmosphere) b.atmosphere.scale.setScalar(pv.baseRadius * 1.06);
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
   star.position.set(0, 0, 0);
   star.scale.copy(baseStarScale);
  }
  if (corona) {
   corona.position.set(0, 0, 0);
   corona.scale.copy(baseCoronaScale);
  }
  if (halo) halo.position.set(0, 0, 0);
  if (lightPosition) lightPosition.set(0, 0, 0);
  if (belt) belt.position.set(0, 0, 0);
  dust?.setGravity?.({ strength: 0 });
 }

 function exit() {
  if (!active) return;
  endDrag(false);
  active = false;
  root.visible = false;
  rocheVeil.visible = false;
  hoverRing.visible = false;
  previewLine.visible = false;
  dock.hidden = true;
  banner.hidden = true;
  banner.classList.remove('show');
  document.body.dataset.sandbox = 'false';
  renderer.domElement.style.cursor = '';
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

 // Deterministic helper for automated verification & scriptable experiments
 function flingBody(id, posArr, velArr) {
  if (!active || !sim) return false;
  const entity = sim.all.find(e => e.id === id);
  if (!entity || !entity.alive) return false;
  if (Array.isArray(posArr) && posArr.length === 3) entity.pos.set(posArr[0], posArr[1], posArr[2]);
  if (Array.isArray(velArr) && velArr.length === 3) entity.vel.set(velArr[0], velArr[1], velArr[2]);
  computeAccelerations(sim.all, true);
  return true;
 }

 let telemetryTick = 0;
 function update({ dt = 0, hostSimTime = 0, paused = false, reducedMotion = false } = {}) {
  lastSimTimeFromHost = hostSimTime;
  if (!active || !sim) return;

  const dtReal = Math.min(dt || 0, 0.08);
  simAge += dtReal;

  // Smooth auto bullet-time envelope
  let effectiveScale = config.timeScale;
  if (bulletTimer > 0) {
   bulletTimer = Math.max(0, bulletTimer - dtReal);
   const prog = 1 - bulletTimer / Math.max(bulletDuration, 0.01);
   const dip = prog < 0.7 ? bulletFloor : THREE.MathUtils.lerp(bulletFloor, 1.0, (prog - 0.7) / 0.3);
   effectiveScale *= dip;
  }

  const dtSim = (!paused && !reducedMotion && effectiveScale > 0) ? Math.min(dtReal * effectiveScale, 0.12) : 0;
  if (dtSim > 0) {
   simTime += dtSim;
   stepPhysics(dtSim);
  } else {
   // Even when paused, reflect slider changes (BH mass / radius) immediately
   sim.bh.mass = config.bhMass;
   sim.bh.radius = baseBhRadius * bhVisualScale(sim.bh.mass);
  }

  applyVisualPoses(dtReal);

  // Subtle ambient dust wave coupling to Guixu
  dust?.setGravity?.({
   origin: sim.bh.pos,
   waveR: (simAge * 18) % 210,
   phase: simAge * 2.2,
   strength: 0.32 + Math.min(0.68, sim.bh.flare * 0.5)
  });

  telemetryTick += dtReal;
  if (telemetryTick > 0.18) {
   telemetryTick = 0;
   updateDockUI();
  }
 }

 function getStats() {
  if (!sim) {
   return {
    active: false,
    alivePlanets: bodies.length,
    disrupted: 0,
    impacts: 0,
    mergers: 0,
    shatters: 0,
    vaporized: 0,
    activeDebris: 0,
    bhFlare: 0,
    starDisp: 0,
    bhDisp: 0,
    barycenterSpeed: 0,
    lastEvent: '',
    planets: []
   };
  }
  return {
   active,
   alivePlanets: sim.planets.filter(p => p.alive).length,
   disrupted: stats.disrupted,
   impacts: stats.impacts,
   mergers: stats.mergers,
   shatters: stats.shatters,
   vaporized: stats.vaporized,
   activeDebris: activeDebrisCount,
   bhFlare: +sim.bh.flare.toFixed(3),
   starDisp: +sim.star.pos.length().toFixed(3),
   bhDisp: +sim.bh.pos.distanceTo(new THREE.Vector3(-64, 4.2, 22)).toFixed(3),
   barycenterSpeed: +sim.barySpeed.toFixed(4),
   bhMass: config.bhMass,
   rocheRadiusRef: +rocheRadiusFor(3.0, config.bhMass).toFixed(2),
   lastEvent: stats.lastEvent,
   lastEnergy1e32J: stats.lastEnergy1e32J,
   planets: sim.planets.map(p => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    status: p.status,
    radius: +p.radius.toFixed(3),
    mass: +p.mass.toFixed(3),
    mergedCount: p.mergedCount,
    lavaHeat: +p.lavaHeat.toFixed(3),
    tidalStress: +p.tidalStress.toFixed(3),
    pos: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)]
   }))
  };
 }

 return {
  get active() { return active; },
  get tool() { return config.tool; },
  get timeScale() { return config.timeScale; },
  get bhMass() { return config.bhMass; },
  get gravityScale() { return config.gravityScale; },
  get overlays() { return config.overlays; },
  get autoBulletTime() { return config.autoBulletTime; },
  get blackHolePosition() { return active && sim ? sim.bh.pos : null; },
  get blackHoleMassScale() { return active ? bhVisualScale(config.bhMass) : 1; },
  get blackHoleGravityBoost() {
   if (!active || !sim) return 0;
   const massFactor = THREE.MathUtils.clamp((config.bhMass - 6) / 28, 0.15, 0.85);
   return Math.min(2.2, massFactor * 0.45 + sim.bh.flare);
  },
  get liveDistanceAu() {
   if (!active || !sim) return singularityDef?.au || 185;
   return Math.max(1.2, +(sim.bh.pos.distanceTo(sim.star.pos) / 31.4 * 12).toFixed(1));
  },
  get bloomBoost() { return active ? bloomSurge : 0; },
  get rippleStrength() { return active ? rippleSurge : 0; },
  isPlanetAlive(id) {
   if (!active || !sim) return true;
   const p = sim.planets.find(x => x.id === id);
   return p ? p.alive : true;
  },
  enter,
  exit,
  reset,
  update,
  setTool,
  setSpeed,
  setBhMass,
  setGravityScale,
  setOverlays,
  setAutoBulletTime,
  flingBody,
  stats: getStats
 };
}
