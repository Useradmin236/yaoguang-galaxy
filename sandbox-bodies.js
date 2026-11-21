// Procedural 3D visual factories & spawn catalog for dynamically created
// bodies in Yaoguang Observatory's Cosmic Sandbox 2.0.
// Zero external textures required — every world, star, pulsar, black hole, and
// spacecraft probe uses lightweight GPU shaders harmonized with the observatory's looks.

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

export const SPAWN_CATALOG = Object.freeze([
 {
  id: 'moon-ice',
  label: '冰质卫星',
  short: '冰月',
  icon: '◦',
  kind: 'moon',
  isGasOrIce: true,
  mass: 0.008,
  radius: 1.05,
  color: '#b8e2ff',
  hint: '轻质冰岩卫星 · 贴着大行星单击即可自动捕获为卫星圆轨'
 },
 {
  id: 'rocky',
  label: '岩质行星',
  short: '岩星',
  icon: '●',
  kind: 'planet',
  isGasOrIce: false,
  mass: 0.14,
  radius: 2.35,
  color: '#c6936c',
  hint: '类地岩质世界 · 可熔融合并、高速自转解体或超高速粉碎'
 },
 {
  id: 'gas',
  label: '气态巨星',
  short: '巨星',
  icon: '◎',
  kind: 'planet',
  isGasOrIce: true,
  mass: 0.65,
  radius: 3.75,
  color: '#d8b288',
  hint: '带光环的木星级巨行星 · 适合捕获卫星群或当弹弓借力点'
 },
 {
  id: 'brown-dwarf',
  label: '褐矮星',
  short: '褐矮',
  icon: '◐',
  kind: 'planet',
  isGasOrIce: true,
  mass: 1.35,
  radius: 4.15,
  color: '#d46a8c',
  hint: '次恒星暗红气态巨体 · 稍增质量（≥1.8 M☉）即可点燃成恒星'
 },
 {
  id: 'comet',
  label: '彗星簇',
  short: '彗星',
  icon: '☄',
  kind: 'comet',
  isGasOrIce: true,
  mass: 0.012,
  radius: 0.95,
  color: '#88d6ff',
  cluster: 5,
  hint: '一次撒出 5 颗冰核彗星 · 看潮汐雨或星际弹射'
 },
 {
  id: 'star-blue',
  label: '蓝巨星',
  short: '蓝星',
  icon: '✦',
  kind: 'star',
  variant: 'blue',
  mass: 6.4,
  radius: 4.8,
  color: '#9ed2ff',
  hint: '炽热蓝白主序星 · 双星正撞触发极超新星大爆炸'
 },
 {
  id: 'star-red',
  label: '红巨星',
  short: '红星',
  icon: '✺',
  kind: 'star',
  variant: 'red',
  mass: 4.2,
  radius: 5.9,
  color: '#ff8a54',
  hint: '膨胀红巨星 · 极易被黑洞撕扯出耀眼等离子火桥'
 },
 {
  id: 'white-dwarf',
  label: '白矮星',
  short: '白矮',
  icon: '✶',
  kind: 'white-dwarf',
  mass: 1.18,
  radius: 1.45,
  color: '#dff4ff',
  hint: '致密简并白矮星 · 质量越过 1.44 M☉ 钱德拉塞卡极限即爆 Ia 型超新星'
 },
 {
  id: 'neutron',
  label: '脉冲星',
  short: '中子星',
  icon: '✧',
  kind: 'neutron',
  mass: 2.35,
  radius: 1.35,
  color: '#a8d8ff',
  hint: '致密磁化中子星 · 带双极脉冲光束，双撞爆千新星'
 },
 {
  id: 'bh',
  label: '流浪黑洞',
  short: '黑洞',
  icon: '◉',
  kind: 'bh',
  mass: 10.8,
  radius: 1.95,
  color: '#f2be7e',
  hint: '独立克尔黑洞 · 可吞噬恒星，双黑洞并合激起引力波'
 },
 {
  id: 'probe',
  label: '弹弓探测器',
  short: '探测器',
  icon: '▲',
  kind: 'probe',
  isGasOrIce: false,
  mass: 0.001,
  radius: 0.85,
  color: '#6df2d6',
  hint: '极轻深空探测器 · 实时显示 Δv 加速倍率，专玩引力弹弓'
 }
]);

const ROCKY_PALETTES = [
 { landA: [0.36, 0.28, 0.24], landB: [0.76, 0.56, 0.40], ocean: [0.10, 0.24, 0.44], atmo: [0.48, 0.76, 1.0], hex: '#c8946e' },
 { landA: [0.22, 0.34, 0.28], landB: [0.58, 0.72, 0.54], ocean: [0.08, 0.22, 0.48], atmo: [0.42, 0.82, 0.96], hex: '#79b8c8' },
 { landA: [0.42, 0.20, 0.14], landB: [0.84, 0.44, 0.26], ocean: [0.22, 0.11, 0.09], atmo: [0.96, 0.56, 0.34], hex: '#df8158' },
 { landA: [0.46, 0.54, 0.62], landB: [0.84, 0.90, 0.96], ocean: [0.18, 0.32, 0.46], atmo: [0.68, 0.88, 1.0], hex: '#a4cce2' }
];

const GAS_PALETTES = [
 { bandA: [0.84, 0.70, 0.52], bandB: [0.56, 0.38, 0.26], bandC: [0.95, 0.88, 0.74], atmo: [0.94, 0.80, 0.58], hex: '#ddb888' },
 { bandA: [0.44, 0.64, 0.86], bandB: [0.22, 0.36, 0.62], bandC: [0.76, 0.90, 1.0], atmo: [0.56, 0.80, 1.0], hex: '#84b8e6' },
 { bandA: [0.72, 0.58, 0.76], bandB: [0.38, 0.28, 0.52], bandC: [0.92, 0.82, 0.96], atmo: [0.80, 0.68, 0.96], hex: '#b89ad4' }
];

export function createSandboxBodyFactory({ THREE, lightPosition, hdrBoost, LOOK }) {
 const sharedSphere = new THREE.SphereGeometry(1, 44, 30);
 const lowSphere = new THREE.SphereGeometry(1, 24, 18);
 const diskRingGeo = new THREE.RingGeometry(1.55, 5.2, 96, 1);
 diskRingGeo.rotateX(-Math.PI / 2);
 const planetRingGeo = new THREE.RingGeometry(1.32, 2.38, 96, 1);
 planetRingGeo.rotateX(-Math.PI / 2);
 const impactRingGeo = new THREE.RingGeometry(1.30, 2.85, 112, 1);
 impactRingGeo.rotateX(-Math.PI / 2);
 const beamConeGeo = new THREE.ConeGeometry(1.0, 1.0, 28, 1, true);
 const probeOctaGeo = new THREE.OctahedronGeometry(1, 0);

 // Soft radial sprite texture for halos / comas / pulsar cores
 const haloCanvas = document.createElement('canvas');
 haloCanvas.width = haloCanvas.height = 128;
 const hCtx = haloCanvas.getContext('2d');
 if (hCtx) {
  const g = hCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(220,238,255,0.68)');
  g.addColorStop(0.45, 'rgba(140,190,255,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  hCtx.fillStyle = g;
  hCtx.fillRect(0, 0, 128, 128);
 }
 const glowMap = new THREE.CanvasTexture(haloCanvas);

 function makeCrustShell(isGasOrIce) {
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
     float r2=1.-abs(noise3(p*12.2-vec3(uTime*.09,n1*1.4,0.))*2.-1.);
     float cracks=pow(r1,4.6)*.85+pow(r2,5.6)*.55;
     float hemi=smoothstep(-.25,.92,dot(p,normalize(uImpactDir)));
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
     vec3 col=(hotCol*hotTotal+frostCol*frostMask*.65)/(max(hotTotal+frostMask*.65,.001))*mix(.92,1.45,uHdr);
     float alpha=clamp(hotTotal*.92+frostMask*.42,0.,1.);
     gl_FragColor=vec4(col,alpha);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const mesh = new THREE.Mesh(lowSphere, mat);
  mesh.visible = false;
  mesh.renderOrder = 3;
  return { mesh, uniforms };
 }

 function createRockyVisual(seed, radius) {
  const pal = ROCKY_PALETTES[Math.abs(Math.floor(seed)) % ROCKY_PALETTES.length];
  const root = new THREE.Group();
  const uniforms = {
   uSeed: { value: seed },
   uLight: { value: lightPosition },
   uLandA: { value: new THREE.Vector3(...pal.landA) },
   uLandB: { value: new THREE.Vector3(...pal.landB) },
   uOcean: { value: new THREE.Vector3(...pal.ocean) },
   uAtmo: { value: new THREE.Vector3(...pal.atmo) },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=position;
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uSeed,uHdr;
    uniform vec3 uLight,uLandA,uLandB,uOcean,uAtmo;
    ${NOISE_GLSL}
    void main(){
     vec3 p=normalize(vLocal);
     float h=fbm3(p*3.1+vec3(uSeed*1.3,uSeed*.7,uSeed*.4));
     float detail=noise3(p*14.+uSeed);
     float sea=smoothstep(.45,.51,h);
     vec3 terrain=mix(uLandA,uLandB,smoothstep(.48,.82,h+detail*.14));
     vec3 base=mix(uOcean,terrain,sea);
     vec3 N=normalize(vNormal);
     vec3 L=normalize(uLight-vWorld);
     vec3 V=normalize(cameraPosition-vWorld);
     float ndl=dot(N,L);
     float day=smoothstep(-.12,.85,ndl);
     float rim=pow(1.-max(dot(N,V),0.),3.2);
     float spec=pow(max(dot(N,normalize(L+V)),0.),42.)*(1.-sea)*max(ndl,0.)*.45;
     vec3 col=base*(.09+.95*day)+uAtmo*rim*(.22+.65*max(ndl+.2,0.))+vec3(.9,.95,1.)*spec;
     col*=mix(.95,1.12,uHdr);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(sharedSphere, mat);
  surface.scale.setScalar(radius);
  root.add(surface);
  const crust = makeCrustShell(false);
  crust.mesh.scale.setScalar(radius * 1.03);
  root.add(crust.mesh);

  return {
   root,
   surface,
   crust,
   colorHex: pal.hex,
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    surface.rotation.y = entity.spinAngle ?? age * 0.22;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
   },
   dispose() {
    mat.dispose();
    crust.mesh.material.dispose();
   }
  };
 }

 function createGasVisual(seed, radius) {
  const pal = GAS_PALETTES[Math.abs(Math.floor(seed)) % GAS_PALETTES.length];
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.24 + (seed % 3) * 0.08;
  root.add(tilt);

  const uniforms = {
   uSeed: { value: seed },
   uTime: { value: 0 },
   uLight: { value: lightPosition },
   uBandA: { value: new THREE.Vector3(...pal.bandA) },
   uBandB: { value: new THREE.Vector3(...pal.bandB) },
   uBandC: { value: new THREE.Vector3(...pal.bandC) },
   uAtmo: { value: new THREE.Vector3(...pal.atmo) },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=position;
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uSeed,uTime,uHdr;
    uniform vec3 uLight,uBandA,uBandB,uBandC,uAtmo;
    ${NOISE_GLSL}
    void main(){
     vec3 p=normalize(vLocal);
     float swirl=fbm3(vec3(p.x*3.6+uTime*.04,p.y*9.5,p.z*3.6)+uSeed);
     float lat=p.y*12.+swirl*2.4;
     float b1=sin(lat)*.5+.5;
     float b2=cos(lat*1.7+swirl*3.)*.5+.5;
     vec3 base=mix(uBandB,uBandA,b1);
     base=mix(base,uBandC,smoothstep(.58,.92,b2)*.65);
     vec3 N=normalize(vNormal);
     vec3 L=normalize(uLight-vWorld);
     vec3 V=normalize(cameraPosition-vWorld);
     float ndl=dot(N,L);
     float day=smoothstep(-.15,.85,ndl);
     float rim=pow(1.-max(dot(N,V),0.),2.8);
     vec3 col=base*(.10+.96*day)+uAtmo*rim*(.25+.65*max(ndl+.25,0.));
     col*=mix(.95,1.14,uHdr);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(sharedSphere, mat);
  surface.scale.setScalar(radius);
  tilt.add(surface);

  const ringMat = new THREE.ShaderMaterial({
   uniforms: {
    uColor: { value: new THREE.Vector3(...pal.bandC) },
    uLight: { value: lightPosition },
    uCenter: { value: new THREE.Vector3() },
    uRadius: { value: radius },
    uHdr: hdrBoost
   },
   transparent: true,
   depthWrite: false,
   side: THREE.DoubleSide,
   vertexShader: `
    varying vec3 vWorld;
    varying float vRad;
    void main(){
     vRad=length(position.xz);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vWorld;
    varying float vRad;
    uniform vec3 uColor,uLight,uCenter;
    uniform float uRadius,uHdr;
    void main(){
     float u=clamp((vRad-1.32)/(2.38-1.32),0.,1.);
     float bands=.52+.32*sin(u*34.)+.16*cos(u*72.);
     float gap=1.-smoothstep(.02,.05,abs(u-.56))*.72;
     float edge=smoothstep(0.,.08,u)*(1.-smoothstep(.88,1.,u));
     vec3 toL=normalize(uLight-vWorld);
     vec3 rel=vWorld-uCenter;
     float proj=dot(rel,toL);
     float perp=length(rel-toL*proj);
     float shadow=(proj<0.&&perp<uRadius*.98)?.24:1.;
     vec3 col=uColor*bands*shadow*mix(.9,1.16,uHdr);
     gl_FragColor=vec4(col,clamp(edge*gap*.58,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const ring = new THREE.Mesh(planetRingGeo, ringMat);
  ring.scale.setScalar(radius);
  tilt.add(ring);

  const crust = makeCrustShell(true);
  crust.mesh.scale.setScalar(radius * 1.03);
  tilt.add(crust.mesh);

  return {
   root,
   surface,
   ring,
   crust,
   colorHex: pal.hex,
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    uniforms.uTime.value = age;
    surface.rotation.y = entity.spinAngle ?? age * 0.28;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
    ring.scale.setScalar(entity.radius * Math.max(1, ox * 0.94));
    ringMat.uniforms.uCenter.value.copy(entity.pos);
    ringMat.uniforms.uRadius.value = entity.radius * ox;
   },
   dispose() {
    mat.dispose();
    ringMat.dispose();
    crust.mesh.material.dispose();
   }
  };
 }

 function createCometVisual(seed, radius) {
  const root = new THREE.Group();
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xb8ecff });
  const surface = new THREE.Mesh(lowSphere, coreMat);
  surface.scale.setScalar(radius);
  root.add(surface);

  const comaMat = new THREE.SpriteMaterial({
   map: glowMap,
   color: 0x7ad6ff,
   transparent: true,
   opacity: 0.78,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const coma = new THREE.Sprite(comaMat);
  coma.scale.setScalar(radius * 5.2);
  root.add(coma);

  const crust = makeCrustShell(true);
  crust.mesh.scale.setScalar(radius * 1.05);
  root.add(crust.mesh);

  return {
   root,
   surface,
   crust,
   colorHex: '#88d6ff',
   update(age, entity) {
    surface.scale.setScalar(entity.radius);
    const pulse = 4.6 + Math.sin(age * 4 + seed) * 0.6;
    coma.scale.setScalar(entity.radius * pulse);
   },
   dispose() {
    coreMat.dispose();
    comaMat.dispose();
    crust.mesh.material.dispose();
   }
  };
 }

 function createStarVisual(variant, seed, radius) {
  const isRed = variant === 'red';
  const root = new THREE.Group();
  const cCore = isRed ? [1.0, 0.78, 0.42] : [0.88, 0.96, 1.0];
  const cMid = isRed ? [0.98, 0.36, 0.12] : [0.46, 0.78, 1.0];
  const cDark = isRed ? [0.58, 0.12, 0.04] : [0.22, 0.46, 0.88];

  const uniforms = {
   uTime: { value: 0 },
   uSeed: { value: seed },
   uCore: { value: new THREE.Vector3(...cCore) },
   uMid: { value: new THREE.Vector3(...cMid) },
   uDark: { value: new THREE.Vector3(...cDark) },
   uFlare: { value: 0 },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=position;
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uTime,uSeed,uFlare,uHdr;
    uniform vec3 uCore,uMid,uDark;
    ${NOISE_GLSL}
    void main(){
     vec3 p=normalize(vLocal);
     float n1=fbm3(p*4.2+vec3(uTime*.18,uSeed,-uTime*.14));
     float n2=fbm3(p*9.5-vec3(uTime*.26,n1*1.4,uSeed));
     float gran=clamp(n1*.62+n2*.52,0.,1.);
     vec3 V=normalize(cameraPosition-vWorld);
     float ndv=max(dot(normalize(vNormal),V),0.);
     float limb=pow(ndv,.55);
     vec3 col=mix(uDark,uMid,smoothstep(.22,.65,gran));
     col=mix(col,uCore,smoothstep(.58,.96,gran)*limb+.32*pow(ndv,1.6));
     col+=uCore*(1.-ndv)*.36;
     col*=mix(1.0,1.42,uHdr)*(1.+uFlare*.45);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(sharedSphere, mat);
  surface.scale.setScalar(radius);
  root.add(surface);

  const haloMat = new THREE.SpriteMaterial({
   map: glowMap,
   color: isRed ? 0xff7038 : 0x62b0ff,
   transparent: true,
   opacity: isRed ? 0.56 : 0.62,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius * 4.4);
  root.add(halo);

  return {
   root,
   surface,
   halo,
   colorHex: isRed ? '#ff8a54' : '#9ed2ff',
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    uniforms.uTime.value = age;
    uniforms.uFlare.value = entity.flare || 0;
    surface.rotation.y = entity.spinAngle ?? age * 0.14;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
    halo.scale.setScalar(entity.radius * (4.2 + (entity.flare || 0) * 1.4));
   },
   dispose() {
    mat.dispose();
    haloMat.dispose();
   }
  };
 }

 function createNeutronVisual(seed, radius) {
  const root = new THREE.Group();
  const spinGroup = new THREE.Group();
  spinGroup.rotation.z = 0.52;
  root.add(spinGroup);

  const coreMat = new THREE.ShaderMaterial({
   uniforms: { uTime: { value: 0 }, uHdr: hdrBoost },
   vertexShader: `
    varying vec3 vNormal,vWorld;
    void main(){
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vNormal,vWorld;
    uniform float uTime,uHdr;
    void main(){
     vec3 V=normalize(cameraPosition-vWorld);
     float ndv=max(dot(normalize(vNormal),V),0.);
     float pulse=.92+.08*sin(uTime*18.);
     vec3 col=mix(vec3(.45,.72,1.),vec3(.96,.99,1.),pow(ndv,.6))*pulse*mix(1.1,1.65,uHdr);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(lowSphere, coreMat);
  surface.scale.setScalar(radius);
  root.add(surface);

  const beamMat = new THREE.ShaderMaterial({
   uniforms: { uTime: { value: 0 }, uHdr: hdrBoost },
   transparent: true,
   depthWrite: false,
   side: THREE.DoubleSide,
   blending: THREE.AdditiveBlending,
   vertexShader: `
    varying vec2 vUv;
    void main(){
     vUv=uv;
     gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime,uHdr;
    void main(){
     // Cone tip is at vUv.y = 1, wide end at vUv.y = 0
     float along=vUv.y;
     float fade=smoothstep(0.,.65,along)*(1.-smoothstep(.92,1.,along));
     float shimmer=.80+.20*sin(along*28.-uTime*22.);
     vec3 col=mix(vec3(.52,.44,1.),vec3(.78,.96,1.),along)*mix(.95,1.45,uHdr);
     gl_FragColor=vec4(col,clamp(fade*shimmer*.52,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const beamLen = 22;
  const beamRadius = 2.6;
  const beamTop = new THREE.Mesh(beamConeGeo, beamMat);
  beamTop.scale.set(beamRadius, beamLen, beamRadius);
  beamTop.rotation.x = Math.PI;
  beamTop.position.y = beamLen * 0.5;
  spinGroup.add(beamTop);

  const beamBot = new THREE.Mesh(beamConeGeo, beamMat);
  beamBot.scale.set(beamRadius, beamLen, beamRadius);
  beamBot.position.y = -beamLen * 0.5;
  spinGroup.add(beamBot);

  const haloMat = new THREE.SpriteMaterial({
   map: glowMap,
   color: 0x8cc8ff,
   transparent: true,
   opacity: 0.85,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius * 7.2);
  root.add(halo);

  return {
   root,
   surface,
   colorHex: '#a8d8ff',
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    coreMat.uniforms.uTime.value = age;
    beamMat.uniforms.uTime.value = age;
    spinGroup.rotation.y = (entity.spinAngle ?? age * 7.5) + seed;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
    halo.scale.setScalar(entity.radius * (6.8 + (entity.flare || 0) * 2.2));
   },
   dispose() {
    coreMat.dispose();
    beamMat.dispose();
    haloMat.dispose();
   }
  };
 }

 function createBlackHoleVisual(seed, radius) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.set(0.22, 0, -0.18);
  root.add(tilt);

  // Pure black event horizon sphere
  const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const surface = new THREE.Mesh(sharedSphere, horizonMat);
  surface.renderOrder = 2;
  root.add(surface);

  // Thin crisp Einstein photon ring
  const photonMat = new THREE.ShaderMaterial({
   uniforms: { uHdr: hdrBoost, uFlare: { value: 0 } },
   transparent: true,
   depthWrite: false,
   blending: THREE.AdditiveBlending,
   vertexShader: `
    varying vec3 vNormal,vWorld;
    void main(){
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vNormal,vWorld;
    uniform float uHdr,uFlare;
    void main(){
     vec3 V=normalize(cameraPosition-vWorld);
     float edge=1.-abs(dot(normalize(vNormal),V));
     float ring=exp(-pow((edge-.86)*18.,2.));
     vec3 col=vec3(1.,.86,.62)*mix(1.0,1.45,uHdr)*(1.+uFlare*.6);
     gl_FragColor=vec4(col,clamp(ring*.92,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const photon = new THREE.Mesh(sharedSphere, photonMat);
  photon.scale.setScalar(1.26);
  photon.renderOrder = 3;
  root.add(photon);

  // Relativistic Doppler-beamed accretion disk
  const diskUniforms = {
   uTime: { value: 0 },
   uSeed: { value: seed },
   uFlare: { value: 0 },
   uHdr: hdrBoost
  };
  const diskMat = new THREE.ShaderMaterial({
   uniforms: diskUniforms,
   transparent: true,
   depthWrite: false,
   side: THREE.DoubleSide,
   blending: THREE.AdditiveBlending,
   vertexShader: `
    varying vec3 vLocal;
    void main(){
     vLocal=position;
     gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal;
    uniform float uTime,uSeed,uFlare,uHdr;
    ${NOISE_GLSL}
    void main(){
     float r=length(vLocal.xz);
     float u=clamp((r-1.55)/(5.2-1.55),0.,1.);
     float ang=atan(vLocal.z,vLocal.x);
     float spiral=ang+4.5/max(r,.7)-uTime*(2.2-u*1.1);
     float n=fbm3(vec3(cos(spiral)*2.4,u*5.5+uSeed,sin(spiral)*2.4));
     float doppler=.76+.34*cos(ang+0.6);
     float inner=smoothstep(0.,.14,u);
     float outer=1.-smoothstep(.45,1.,u);
     float glow=(.35+.65*n)*inner*outer*doppler;
     vec3 col=mix(vec3(.92,.40,.14),vec3(1.,.78,.42),smoothstep(.1,.75,1.-u));
     col=mix(col,vec3(1.,.96,.88),smoothstep(.65,1.,(1.-u)*doppler));
     col*=mix(.92,1.38,uHdr)*(1.+uFlare*.55);
     gl_FragColor=vec4(col,clamp(glow*.88,0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const disk = new THREE.Mesh(diskRingGeo, diskMat);
  disk.renderOrder = 3;
  tilt.add(disk);

  // Subtle vertical gravitational-lensed halo arch (perpendicular thin ring)
  const arch = new THREE.Mesh(diskRingGeo, diskMat);
  arch.rotation.x = Math.PI * 0.48;
  arch.scale.set(0.68, 1, 0.68);
  arch.renderOrder = 3;
  tilt.add(arch);

  // Faint relativistic polar jets that surge during feeding / flare
  const jetMat = new THREE.ShaderMaterial({
   uniforms: { uFlare: { value: 0 }, uHdr: hdrBoost },
   transparent: true,
   depthWrite: false,
   side: THREE.DoubleSide,
   blending: THREE.AdditiveBlending,
   vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uFlare,uHdr;
    void main(){
     float fade=smoothstep(0.,.7,vUv.y)*(1.-smoothstep(.92,1.,vUv.y));
     vec3 col=mix(vec3(.52,.74,1.),vec3(1.,.92,.82),vUv.y)*mix(.9,1.4,uHdr);
     gl_FragColor=vec4(col,clamp(fade*(.16+uFlare*.42),0.,1.));
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const jetTop = new THREE.Mesh(beamConeGeo, jetMat);
  jetTop.scale.set(0.85, 10, 0.85);
  jetTop.rotation.x = Math.PI;
  jetTop.position.y = 5.4;
  tilt.add(jetTop);

  const jetBot = new THREE.Mesh(beamConeGeo, jetMat);
  jetBot.scale.set(0.85, 10, 0.85);
  jetBot.position.y = -5.4;
  tilt.add(jetBot);

  root.scale.setScalar(radius);

  return {
   root,
   surface,
   colorHex: '#f2be7e',
   update(age, entity) {
    diskUniforms.uTime.value = age;
    diskUniforms.uFlare.value = entity.flare || 0;
    photonMat.uniforms.uFlare.value = entity.flare || 0;
    jetMat.uniforms.uFlare.value = entity.flare || 0;
    root.scale.setScalar(entity.radius);
   },
   dispose() {
    horizonMat.dispose();
    photonMat.dispose();
    diskMat.dispose();
    jetMat.dispose();
   }
  };
 }

 function createProbeVisual(seed, radius) {
  const root = new THREE.Group();
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x7efae0 });
  const surface = new THREE.Mesh(probeOctaGeo, hullMat);
  surface.scale.set(radius * 0.72, radius * 0.72, radius * 1.45);
  root.add(surface);

  const wingGeo = new THREE.BoxGeometry(radius * 3.2, radius * 0.12, radius * 0.65);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xe6f8ff });
  const wings = new THREE.Mesh(wingGeo, wingMat);
  root.add(wings);

  const haloMat = new THREE.SpriteMaterial({
   map: glowMap,
   color: 0x5ef2d4,
   transparent: true,
   opacity: 0.9,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius * 6.5);
  root.add(halo);

  return {
   root,
   surface,
   colorHex: '#6df2d6',
   update(age, entity) {
    if (entity.vel && entity.vel.lengthSq() > 0.01) {
     const v = entity.vel;
     root.rotation.y = Math.atan2(v.x, v.z);
    }
    const boost = entity.slingshotFlash || 0;
    haloMat.color.setHex(boost > 0.15 ? 0xffd27a : 0x5ef2d4);
    halo.scale.setScalar(radius * (6.2 + boost * 5.0 + Math.sin(age * 6 + seed) * 0.5));
   },
   dispose() {
    hullMat.dispose();
    wingGeo.dispose();
    wingMat.dispose();
    haloMat.dispose();
   }
  };
 }

 function createIceMoonVisual(seed, radius) {
  const root = new THREE.Group();
  const uniforms = {
   uSeed: { value: seed },
   uLight: { value: lightPosition },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=position;
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uSeed,uHdr;
    uniform vec3 uLight;
    ${NOISE_GLSL}
    void main(){
     vec3 p=normalize(vLocal);
     float n=fbm3(p*4.4+vec3(uSeed*1.1,uSeed*.5,uSeed*.8));
     float ridge=1.-abs(noise3(p*11.+vec3(n*1.6,uSeed,0.))*2.-1.);
     float cracks=pow(ridge,4.2);
     vec3 ice=mix(vec3(.56,.72,.86),vec3(.92,.96,1.),smoothstep(.25,.78,n));
     ice=mix(ice,vec3(.34,.58,.82),cracks*.62);
     vec3 N=normalize(vNormal);
     vec3 L=normalize(uLight-vWorld);
     vec3 V=normalize(cameraPosition-vWorld);
     float ndl=dot(N,L);
     float day=smoothstep(-.15,.85,ndl);
     float rim=pow(1.-max(dot(N,V),0.),2.8);
     float spec=pow(max(dot(N,normalize(L+V)),0.),36.)*max(ndl,0.)*.42;
     vec3 col=ice*(.14+.94*day)+vec3(.55,.84,1.)*rim*.36+vec3(.92,.97,1.)*spec;
     col*=mix(.95,1.14,uHdr);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(lowSphere, mat);
  surface.scale.setScalar(radius);
  root.add(surface);
  const crust = makeCrustShell(true);
  crust.mesh.scale.setScalar(radius * 1.04);
  root.add(crust.mesh);

  return {
   root,
   surface,
   crust,
   colorHex: '#b8e2ff',
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    surface.rotation.y = entity.spinAngle ?? age * 0.25;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
   },
   dispose() {
    mat.dispose();
    crust.mesh.material.dispose();
   }
  };
 }

 function createBrownDwarfVisual(seed, radius) {
  const root = new THREE.Group();
  const uniforms = {
   uSeed: { value: seed },
   uTime: { value: 0 },
   uLight: { value: lightPosition },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=position;
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uSeed,uTime,uHdr;
    uniform vec3 uLight;
    ${NOISE_GLSL}
    void main(){
     vec3 p=normalize(vLocal);
     float swirl=fbm3(vec3(p.x*3.4+uTime*.08,p.y*10.5,p.z*3.4)+uSeed);
     float lat=p.y*13.+swirl*2.8;
     float band=sin(lat)*.5+.5;
     float glowBand=smoothstep(.60,.96,cos(lat*1.4+swirl*3.2)*.5+.5);
     vec3 darkCol=vec3(.24,.09,.16);
     vec3 midCol=vec3(.62,.22,.32);
     vec3 hotCol=vec3(1.,.50,.36);
     vec3 base=mix(darkCol,midCol,band);
     base=mix(base,hotCol,glowBand*.72);
     vec3 N=normalize(vNormal);
     vec3 L=normalize(uLight-vWorld);
     vec3 V=normalize(cameraPosition-vWorld);
     float day=smoothstep(-.2,.85,dot(N,L));
     float rim=pow(1.-max(dot(N,V),0.),2.6);
     vec3 col=base*(.48+.62*day)+hotCol*glowBand*.35+vec3(.96,.42,.56)*rim*.52;
     col*=mix(.96,1.22,uHdr);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(sharedSphere, mat);
  surface.scale.setScalar(radius);
  root.add(surface);

  const haloMat = new THREE.SpriteMaterial({
   map: glowMap,
   color: 0xd84c74,
   transparent: true,
   opacity: 0.42,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius * 3.4);
  root.add(halo);

  const crust = makeCrustShell(true);
  crust.mesh.scale.setScalar(radius * 1.03);
  root.add(crust.mesh);

  return {
   root,
   surface,
   crust,
   colorHex: '#d46a8c',
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    uniforms.uTime.value = age;
    surface.rotation.y = entity.spinAngle ?? age * 0.4;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
    halo.scale.setScalar(entity.radius * (3.3 + (entity.flare || 0) * 1.1));
   },
   dispose() {
    mat.dispose();
    haloMat.dispose();
    crust.mesh.material.dispose();
   }
  };
 }

 function createWhiteDwarfVisual(seed, radius) {
  const root = new THREE.Group();
  const uniforms = {
   uTime: { value: 0 },
   uSeed: { value: seed },
   uFlare: { value: 0 },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   vertexShader: `
    varying vec3 vLocal,vNormal,vWorld;
    void main(){
     vLocal=position;
     vNormal=normalize(mat3(modelMatrix)*normal);
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vNormal,vWorld;
    uniform float uTime,uSeed,uFlare,uHdr;
    ${NOISE_GLSL}
    void main(){
     vec3 p=normalize(vLocal);
     float n=fbm3(p*7.5+vec3(uTime*.35,uSeed,-uTime*.28));
     vec3 V=normalize(cameraPosition-vWorld);
     float ndv=max(dot(normalize(vNormal),V),0.);
     vec3 col=mix(vec3(.62,.86,1.),vec3(.98,.99,1.),pow(ndv,.45)*.75+n*.25);
     col+=vec3(.78,.94,1.)*(1.-ndv)*.45;
     col*=mix(1.12,1.62,uHdr)*(1.+uFlare*.55);
     gl_FragColor=vec4(col,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const surface = new THREE.Mesh(lowSphere, mat);
  surface.scale.setScalar(radius);
  root.add(surface);

  const haloMat = new THREE.SpriteMaterial({
   map: glowMap,
   color: 0xc2ecff,
   transparent: true,
   opacity: 0.92,
   depthWrite: false,
   blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius * 6.8);
  root.add(halo);

  return {
   root,
   surface,
   halo,
   colorHex: '#dff4ff',
   update(age, entity) {
    const ox = entity.oblateXZ || 1;
    const oy = entity.oblateY || 1;
    uniforms.uTime.value = age;
    uniforms.uFlare.value = entity.flare || 0;
    surface.rotation.y = entity.spinAngle ?? age * 0.9;
    surface.scale.set(entity.radius * ox, entity.radius * oy, entity.radius * ox);
    halo.scale.setScalar(entity.radius * (6.6 + (entity.flare || 0) * 2.2));
   },
   dispose() {
    mat.dispose();
    haloMat.dispose();
   }
  };
 }

 function createImpactRing(radius, {
  color = [0.88, 0.78, 0.66],
  heat = 1.0,
  density = 0.85,
  tiltX = 0.14,
  tiltZ = 0.22,
  seed = 1.7
 } = {}) {
  const uniforms = {
   uTime: { value: 0 },
   uSeed: { value: seed },
   uHeat: { value: heat },
   uDensity: { value: density },
   uColor: { value: new THREE.Vector3(...color) },
   uLight: { value: lightPosition },
   uCenter: { value: new THREE.Vector3() },
   uRadius: { value: radius },
   uHdr: hdrBoost
  };
  const mat = new THREE.ShaderMaterial({
   uniforms,
   transparent: true,
   depthWrite: false,
   side: THREE.DoubleSide,
   vertexShader: `
    varying vec3 vLocal,vWorld;
    void main(){
     vLocal=position;
     vWorld=(modelMatrix*vec4(position,1.)).xyz;
     gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
    }`,
   fragmentShader: `
    precision highp float;
    varying vec3 vLocal,vWorld;
    uniform float uTime,uSeed,uHeat,uDensity,uRadius,uHdr;
    uniform vec3 uColor,uLight,uCenter;
    ${NOISE_GLSL}
    void main(){
     float r=length(vLocal.xz);
     float u=clamp((r-1.30)/(2.85-1.30),0.,1.);
     float ang=atan(vLocal.z,vLocal.x);
     // Differential Keplerian shear swirl + fine debris ringlets
     float swirl=ang+3.6/max(r,.8)-uTime*(1.15-u*.58);
     float clumps=fbm3(vec3(cos(swirl)*3.2,u*9.5+uSeed,sin(swirl)*3.2));
     float bands=.45+.34*sin(u*42.+clumps*2.2)+.21*cos(u*88.-u*6.);
     float gap=1.-smoothstep(.018,.045,abs(u-.52))*.68;
     float edge=smoothstep(0.,.10,u)*(1.-smoothstep(.82,1.,u));
     vec3 toL=normalize(uLight-vWorld);
     vec3 rel=vWorld-uCenter;
     float proj=dot(rel,toL);
     float perp=length(rel-toL*proj);
     float shadow=(proj<0.&&perp<uRadius*.98)?.22:1.;
     vec3 coolCol=uColor*(.58+.52*clumps)*bands*shadow;
     vec3 hotCol=mix(vec3(.96,.36,.08),vec3(1.,.86,.48),smoothstep(.15,.85,clumps*bands*(1.-u*.35)));
     vec3 col=mix(coolCol,hotCol,clamp(uHeat,0.,1.))*mix(.92,1.28,uHdr);
     float alpha=clamp(edge*gap*(.34+.62*clumps)*uDensity*(.72+uHeat*.32),0.,.92);
     if(alpha<=.01)discard;
     gl_FragColor=vec4(col,alpha);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const mesh = new THREE.Mesh(impactRingGeo, mat);
  mesh.rotation.set(tiltX, 0, tiltZ);
  mesh.scale.setScalar(radius);
  mesh.renderOrder = 3;
  return {
   mesh,
   uniforms,
   tiltX,
   tiltZ,
   heat,
   density,
   seed,
   color: [...color],
   update(age, entity) {
    uniforms.uTime.value = age;
    uniforms.uHeat.value = this.heat;
    uniforms.uDensity.value = this.density;
    uniforms.uCenter.value.copy(entity.pos);
    uniforms.uRadius.value = entity.radius * (entity.oblateXZ || 1);
    mesh.scale.setScalar(entity.radius * Math.max(1, (entity.oblateXZ || 1) * 0.94));
   },
   dispose() {
    mat.dispose();
   }
  };
 }

 function createVisual(typeId, seed, radius) {
  switch (typeId) {
   case 'moon-ice': return createIceMoonVisual(seed, radius);
   case 'brown-dwarf': return createBrownDwarfVisual(seed, radius);
   case 'white-dwarf': return createWhiteDwarfVisual(seed, radius);
   case 'gas': return createGasVisual(seed, radius);
   case 'comet': return createCometVisual(seed, radius);
   case 'star-blue': return createStarVisual('blue', seed, radius);
   case 'star-red': return createStarVisual('red', seed, radius);
   case 'neutron': return createNeutronVisual(seed, radius);
   case 'bh': return createBlackHoleVisual(seed, radius);
   case 'probe': return createProbeVisual(seed, radius);
   case 'rocky':
   default: return createRockyVisual(seed, radius);
  }
 }

 return { createVisual, createImpactRing, glowMap };
}
