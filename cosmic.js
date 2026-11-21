// Deep-space singularities and extreme cosmic phenomena for Yaoguang Observatory.
// Keeps the observatory's restrained aesthetic across all four looks, HDR and LDR.

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
 for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.04+vec3(13.1,4.7,8.3);a*=.5;}
 return v;
}
`;

// Guixu sits as a wide-orbit dark companion outside Alkaid's Hill stability sphere (~88.6 AU),
// rather than orbiting Alkaid on a planetary ring. During a gravitational-pull simulation it
// dives inside the critical radius, pulling Alkaid and all six planets with real N-body forces.
export const SINGULARITY = Object.freeze({
 id: 'guixu',
 name: '归墟',
 roman: 'Guīxū',
 type: '远距双星暗伴体 · 克尔黑洞',
 service: '深空奇点',
 color: '#d8b48a',
 au: 185,
 hillAu: 88.6,
 orbit: 86,
 anchor: Object.freeze([-82, 12, 16]),
 elevation: 12,
 radius: 2.1,
 phase: 2.70,
 period: 2400,
 tilt: 0.24,
 roll: -0.18,
 massSolar: 12.4,
 schwarzschildKm: 36.6,
 spin: 0.92,
 description: '众水所归，光亦折返。它是一颗游弋于百余天文单位外的深空暗伴体——常态下位于瑶光希尔稳定界之外，仅牵引外缘星际微尘坠入吸积盘；一旦逼近临界距离，其引力将直接拖拽母恒星并撕裂六条行星轨道。'
});

export const COSMIC_STORIES = Object.freeze({
 supernova: ['远空超新星', '一颗衰老的蓝超巨星在星海深处坍缩。蓝白闪光掠过，电离激波与星周光环缓缓铺开，留下轻淡的余晖。'],
 gravity: ['黑洞引力牵引', '归墟切入瑶光的希尔稳定界。母恒星被拽离中心并拉出洛希瓣炽热物质流，六颗行星依次脱离圆轨，沿引力曲线向黑洞偏转坠落。']
});

export const COSMIC_TIMING = Object.freeze({
 supernovaDuration: 26,
 gravityDuration: 34,
 gravityApproachEnd: 6.5,
 gravityRewindStart: 27.5,
 ambientFirstDelay: 120,
 ambientInterval: 185
});

function lookTone(LOOK) {
 if (LOOK?.diagram) {
  return {
   hot: [0.85, 0.96, 1.0],
   mid: [0.46, 0.78, 0.96],
   cool: [0.16, 0.36, 0.56],
   ring: [0.78, 0.93, 1.0],
   grid: [0.42, 0.78, 0.98],
   gridGain: 1.25
  };
 }
 if (/nebula/.test(LOOK?.sky || '')) {
  return {
   hot: [0.94, 0.92, 1.0],
   mid: [0.76, 0.58, 0.96],
   cool: [0.28, 0.22, 0.58],
   ring: [0.88, 0.80, 1.0],
   grid: [0.68, 0.58, 0.96],
   gridGain: 0.95
  };
 }
 if (LOOK?.starTint && LOOK.starTint[2] < 0.95) {
  return {
   hot: [1.0, 0.94, 0.84],
   mid: [0.86, 0.60, 0.34],
   cool: [0.34, 0.20, 0.14],
   ring: [0.98, 0.84, 0.62],
   grid: [0.86, 0.72, 0.52],
   gridGain: 0.85
  };
 }
 return {
  hot: [0.92, 0.96, 1.0],
  mid: [0.86, 0.64, 0.40],
  cool: [0.24, 0.36, 0.56],
  ring: [0.92, 0.84, 0.72],
  grid: [0.56, 0.80, 0.96],
  gridGain: 0.95
 };
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

let cachedPortrait = null;
export function singularityPortraitDataUrl() {
 if (cachedPortrait) return cachedPortrait;
 try {
  if (typeof document !== 'undefined') {
   const canvas = document.createElement('canvas');
   canvas.width = 440;
   canvas.height = 240;
   const ctx = canvas.getContext('2d');
   if (ctx) {
    const bg = ctx.createRadialGradient(220, 118, 12, 220, 120, 235);
    bg.addColorStop(0, '#131d2d');
    bg.addColorStop(0.45, '#080e1a');
    bg.addColorStop(1, '#04070e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 440, 240);

    for (let i = 0; i < 64; i++) {
     const x = ((i * 97 + 31) % 428) + 6;
     const y = ((i * 53 + 19) % 228) + 6;
     const d = Math.hypot(x - 220, y - 120);
     if (d < 54) continue;
     ctx.fillStyle = `rgba(195,218,242,${0.12 + (i % 5) * 0.08})`;
     ctx.fillRect(x, y, i % 7 === 0 ? 1.8 : 1.1, i % 7 === 0 ? 1.8 : 1.1);
    }

    ctx.save();
    ctx.translate(220, 120);
    ctx.rotate(-0.14);
    const halo = ctx.createRadialGradient(0, 0, 32, 0, 0, 88);
    halo.addColorStop(0, 'rgba(240,214,174,0)');
    halo.addColorStop(0.28, 'rgba(232,196,148,0.42)');
    halo.addColorStop(0.55, 'rgba(130,172,220,0.16)');
    halo.addColorStop(1, 'rgba(50,80,130,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 0, 92, 68, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 6; i++) {
     const rx = 56 + i * 20;
     const ry = 10 + i * 3.8;
     const g = ctx.createLinearGradient(-rx, 0, rx, 0);
     g.addColorStop(0, `rgba(232,242,255,${0.46 - i * 0.06})`);
     g.addColorStop(0.35, `rgba(222,174,116,${0.42 - i * 0.055})`);
     g.addColorStop(0.75, `rgba(148,118,98,${0.22 - i * 0.03})`);
     g.addColorStop(1, 'rgba(70,96,140,0.03)');
     ctx.strokeStyle = g;
     ctx.lineWidth = 4.2 - i * 0.45;
     ctx.beginPath();
     ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
     ctx.stroke();
    }

    ctx.fillStyle = '#020409';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(238,224,198,0.82)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    cachedPortrait = canvas.toDataURL('image/png');
    return cachedPortrait;
   }
  }
 } catch {
  // Fallback to inline SVG below.
 }
 const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 240"><rect width="440" height="240" fill="#060b16"/><ellipse cx="220" cy="120" rx="145" ry="24" transform="rotate(-8 220 120)" fill="none" stroke="#d8b48a" stroke-opacity="0.45" stroke-width="10"/><circle cx="220" cy="120" r="35" fill="#020409" stroke="#e8dcc8" stroke-opacity="0.8" stroke-width="2"/></svg>';
 cachedPortrait = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
 return cachedPortrait;
}

export function createBlackHole({ THREE, scene, LOOK, hdrBoost }) {
 const tone = lookTone(LOOK);
 const root = new THREE.Group();
 root.name = 'Singularity Guixu';
 scene.add(root);

 const tiltGroup = new THREE.Group();
 tiltGroup.rotation.set(SINGULARITY.tilt, 0, SINGULARITY.roll);
 root.add(tiltGroup);

 const R = SINGULARITY.radius;

 // 1. Pure dark event horizon with a razor-thin Fresnel photon ring.
 const horizonUniforms = {
  uTime: { value: 0 },
  uHdr: hdrBoost,
  uRingColor: { value: new THREE.Vector3(...tone.ring) },
  uHotColor: { value: new THREE.Vector3(...tone.hot) },
  uPulse: { value: 0 }
 };
 const horizonMat = new THREE.ShaderMaterial({
  uniforms: horizonUniforms,
  vertexShader: `
   varying vec3 vNormal;
   varying vec3 vWorld;
   varying vec3 vLocal;
   void main(){
    vLocal=position;
    vNormal=normalize(mat3(modelMatrix)*normal);
    vWorld=(modelMatrix*vec4(position,1.)).xyz;
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec3 vNormal;
   varying vec3 vWorld;
   varying vec3 vLocal;
   uniform float uTime,uHdr,uPulse;
   uniform vec3 uRingColor,uHotColor;
   ${NOISE_GLSL}
   void main(){
    vec3 N=normalize(vNormal);
    vec3 V=normalize(cameraPosition-vWorld);
    float mu=max(dot(N,V),0.);
    float razor=exp(-pow((mu-.11)*24.,2.));
    float rim=pow(1.-mu,12.);
    float shimmer=.9+.1*noise3(normalize(vLocal)*11.+vec3(uTime*.3,0.,-uTime*.2));
    vec3 col=vec3(0.);
    vec3 edgeCol=mix(uRingColor,uHotColor,.35+uPulse*.3);
    col+=edgeCol*(razor*.62+rim*.32)*shimmer*(1.+uPulse*.55)*mix(.85,1.08,uHdr);
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const surface = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), horizonMat);
 surface.name = 'Event horizon';
 surface.userData = { planet: SINGULARITY.id, moon: null };
 root.add(surface);

 // Invisible slightly larger pick sphere so clicking the disk/photon halo selects Guixu smoothly.
 const pickProxy = new THREE.Mesh(
  new THREE.SphereGeometry(R * 2.4, 24, 16),
  new THREE.MeshBasicMaterial({ visible: false })
 );
 pickProxy.userData = { planet: SINGULARITY.id, moon: null };
 root.add(pickProxy);

 // 2. Relativistic thin accretion disk with domain-warped spiral filaments and Doppler beaming.
 const diskInner = R * 1.28;
 const diskOuter = R * 4.6;
 const diskUniforms = {
  uTime: { value: 0 },
  uHdr: hdrBoost,
  uInner: { value: diskInner },
  uOuter: { value: diskOuter },
  uHot: { value: new THREE.Vector3(...tone.hot) },
  uMid: { value: new THREE.Vector3(...tone.mid) },
  uCool: { value: new THREE.Vector3(...tone.cool) },
  uPalette: { value: new THREE.Vector3(...(LOOK.palette || [1, 1, 1])) },
  uDiagram: { value: LOOK.diagram ? 1 : 0 },
  uPulse: { value: 0 },
  uAxis: { value: new THREE.Vector3(0, 1, 0) }
 };
 const diskMat = new THREE.ShaderMaterial({
  uniforms: diskUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   varying vec3 vLocal;
   varying vec3 vWorld;
   varying vec3 vCenter;
   void main(){
    vLocal=position;
    vWorld=(modelMatrix*vec4(position,1.)).xyz;
    vCenter=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec3 vLocal;
   varying vec3 vWorld;
   varying vec3 vCenter;
   uniform float uTime,uHdr,uInner,uOuter,uDiagram,uPulse;
   uniform vec3 uHot,uMid,uCool,uPalette,uAxis;
   ${NOISE_GLSL}
   void main(){
    float r=length(vLocal.xy);
    float u=clamp((r-uInner)/(uOuter-uInner),0.,1.);
    if(u<=.001||u>=.999)discard;

    float ang=atan(vLocal.y,vLocal.x);
    float shear=1.2/pow(u+.24,1.05);
    float spinRate=.24+uPulse*.32;
    float spiral=ang+uTime*spinRate*shear-log(u+.14)*5.2;
    vec3 p1=vec3(cos(spiral)*(1.4+u*3.2),sin(spiral)*(1.4+u*3.2),u*5.5-uTime*.06);
    float warp=fbm3(p1);
    float spiral2=spiral+warp*2.1;
    vec3 p2=vec3(cos(spiral2)*(2.2+u*4.6),sin(spiral2)*(2.2+u*4.6),u*11.5+warp*1.8);
    float streams=fbm3(p2);
    float micro=noise3(p2*2.4+vec3(0.,0.,uTime*.1));

    float onset=smoothstep(0.,.065,u);
    float fade=pow(1.-smoothstep(.08,1.,u),2.1);
    float lanes=smoothstep(.24,.82,streams*.72+warp*.28);
    float wisps=.42+.58*lanes*(.72+.28*micro);
    float density=onset*fade*wisps;

    vec3 rel=normalize(vWorld-vCenter);
    vec3 tangent=normalize(cross(uAxis,rel));
    vec3 viewDir=normalize(cameraPosition-vWorld);
    float approach=dot(tangent,viewDir);
    float doppler=pow(clamp(1.+approach*.46,.46,1.56),1.38);

    // Accreting stellar plasma shifts inner disk hotter & slightly blue-white when feeding.
    vec3 hotTone=mix(uHot,vec3(.82,.93,1.),uPulse*.45);
    vec3 col=mix(hotTone,uMid,smoothstep(.02,.28,u));
    col=mix(col,uCool,smoothstep(.30,.85,u));
    col=mix(col,col*vec3(.88,.96,1.15),smoothstep(0.,.75,approach)*.36);
    col=mix(col,col*vec3(1.12,.82,.68),smoothstep(0.,.75,-approach)*.36);

    float isco=exp(-pow((u-.035)*32.,2.));
    col+=hotTone*isco*(.48+uPulse*.38);

    if(uDiagram>.5){
     float ticks=exp(-pow(fract(u*4.)-.5,2.)*1200.)*.18;
     col+=vec3(.55,.84,1.)*ticks*fade;
    }

    float gain=doppler*(1.+uPulse*.55)*mix(.76,.96,uHdr);
    vec3 finalCol=col*uPalette*gain*(.44+isco*.52);
    float alpha=clamp(density*(.74+uPulse*.18)+isco*.30,0.,1.);
    gl_FragColor=vec4(finalCol,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const disk = new THREE.Mesh(new THREE.RingGeometry(diskInner, diskOuter, 180, 14), diskMat);
 disk.rotation.x = -Math.PI / 2;
 disk.name = 'Accretion disk';
 tiltGroup.add(disk);

 // 3. Gravitationally lensed back-disk arches.
 const lensUniforms = {
  uTime: { value: 0 },
  uHdr: hdrBoost,
  uHot: { value: new THREE.Vector3(...tone.hot) },
  uMid: { value: new THREE.Vector3(...tone.mid) },
  uRing: { value: new THREE.Vector3(...tone.ring) },
  uTiltSign: { value: 0.2 },
  uPulse: { value: 0 }
 };
 const lensMat = new THREE.ShaderMaterial({
  uniforms: lensUniforms,
  transparent: true,
  depthWrite: false,
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
   uniform float uTime,uHdr,uTiltSign,uPulse;
   uniform vec3 uHot,uMid,uRing;
   ${NOISE_GLSL}
   void main(){
    vec2 p=(vUv-.5)*2.;
    float r=length(p);
    if(r>.98)discard;

    float rs=.267;
    if(r<rs*1.005)discard;

    float ang=atan(p.y,p.x);
    float ny=p.y/max(r,.0001);
    float nx=p.x/max(r,.0001);

    float photon=exp(-pow((r-rs*1.045)/(rs*.036),2.));

    float asym=1.+ny*uTiltSign*.16;
    float archRadius=rs*(1.12+.18*abs(ny))*asym;
    float archWidth=rs*(.11+.14*abs(ny));
    float archMask=smoothstep(.18,.82,abs(ny));
    float arch=exp(-pow((r-archRadius)/archWidth,2.))*archMask;

    float flowA=ang+uTime*(.20+uPulse*.22);
    float streak=fbm3(vec3(cos(flowA)*3.4,sin(flowA)*3.4,r*14.-uTime*.14));
    arch*=.42+.75*smoothstep(.28,.82,streak);

    float doppler=clamp(1.-nx*.42,.54,1.44);
    float softAura=exp(-max(r-rs,0.)*8.5)*(.095+uPulse*.07);
    float edgeFade=1.-smoothstep(.68,.96,r);

    vec3 hotTone=mix(uHot,vec3(.82,.94,1.),uPulse*.4);
    vec3 col=mix(uMid,hotTone,clamp(photon*.75+streak*.3,0.,1.));
    col=mix(col,uRing,photon*.55);
    float intensity=(photon*.52+arch*.34+softAura)*doppler*edgeFade*(1.+uPulse*.48);
    col*=intensity*mix(.72,.96,uHdr);

    gl_FragColor=vec4(col,clamp(intensity,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const lensQuad = new THREE.Mesh(new THREE.PlaneGeometry(R * 7.5, R * 7.5), lensMat);
 lensQuad.name = 'Gravitational lens halo';
 lensQuad.renderOrder = 2;
 root.add(lensQuad);

 // 4. Relativistic polar jets — whisper-quiet at wide separation, brightening sharply during stellar accretion.
 const jetUniforms = {
  uTime: { value: 0 },
  uHdr: hdrBoost,
  uColor: { value: new THREE.Vector3(...tone.hot) },
  uPulse: { value: 0 }
 };
 const jetMat = new THREE.ShaderMaterial({
  uniforms: jetUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   varying vec2 vUv;
   varying vec3 vNormal;
   varying vec3 vWorld;
   void main(){
    vUv=uv;
    vNormal=normalize(mat3(modelMatrix)*normal);
    vWorld=(modelMatrix*vec4(position,1.)).xyz;
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec2 vUv;
   varying vec3 vNormal;
   varying vec3 vWorld;
   uniform float uTime,uHdr,uPulse;
   uniform vec3 uColor;
   ${NOISE_GLSL}
   void main(){
    float along=vUv.y;
    float mu=abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld)));
    float core=pow(mu,3.2);
    float flow=noise3(vec3(vUv.x*8.,along*11.-uTime*(.7+uPulse*1.8),uTime*.12));
    float env=smoothstep(.04,.20,along)*pow(1.-along,3.0-uPulse*.8);
    float alpha=env*core*(.08+.12*flow)*(1.+uPulse*2.1);
    vec3 col=mix(vec3(.38,.70,1.),uColor,.4)*mix(.75,1.15,uHdr);
    gl_FragColor=vec4(col,clamp(alpha*.24,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const jetGeo = new THREE.CylinderGeometry(R * 0.34, R * 0.06, R * 7.2, 24, 1, true);
 jetGeo.translate(0, R * 4.6, 0);
 const northJet = new THREE.Mesh(jetGeo, jetMat);
 const southJet = new THREE.Mesh(jetGeo, jetMat);
 southJet.rotation.x = Math.PI;
 tiltGroup.add(northJet, southJet);

 // 5. Ambient interstellar dust trickle drawn from outer-system space into Guixu's gravity well.
 // Replaces the unrealistic planetary ring-orbit: Guixu is an external dark companion, not a 7th planet.
 const trickleCount = 210;
 const tRand = makeRand(4217);
 const tSeed = new Float32Array(trickleCount);
 const tSpread = new Float32Array(trickleCount * 3);
 const tBase = new Float32Array(trickleCount * 3);
 for (let i = 0; i < trickleCount; i++) {
  tSeed[i] = tRand();
  tSpread[i * 3] = (tRand() - 0.5) * 14;
  tSpread[i * 3 + 1] = (tRand() - 0.5) * 7;
  tSpread[i * 3 + 2] = (tRand() - 0.5) * 14;
 }
 const trickleGeo = new THREE.BufferGeometry();
 trickleGeo.setAttribute('position', new THREE.BufferAttribute(tBase, 3));
 trickleGeo.setAttribute('aSeed', new THREE.BufferAttribute(tSeed, 1));
 trickleGeo.setAttribute('aSpread', new THREE.BufferAttribute(tSpread, 3));
 const trickleUniforms = {
  uTime: { value: 0 },
  uSource: { value: new THREE.Vector3(-52, 0.5, 24) },
  uTarget: { value: new THREE.Vector3(...SINGULARITY.anchor) },
  uFade: { value: 1 },
  uHdr: hdrBoost,
  uColorA: { value: new THREE.Vector3(...tone.grid) },
  uColorB: { value: new THREE.Vector3(...tone.ring) }
 };
 const trickleMat = new THREE.ShaderMaterial({
  uniforms: trickleUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   attribute float aSeed;
   attribute vec3 aSpread;
   uniform float uTime;
   uniform vec3 uSource,uTarget;
   varying float vT,vSeed;
   void main(){
    float u=fract(aSeed+uTime*.024);
    // Cubic-like tidal infall: starts gently from outer dust belt, curves and accelerates into the disk.
    float ease=u*u*(1.4-.4*u);
    vec3 delta=uTarget-uSource;
    vec3 side=normalize(cross(delta,vec3(0.,1.,0.)));
    vec3 mid=mix(uSource,uTarget,.45)+side*11.+vec3(0.,5.5,0.);
    vec3 p0=mix(uSource,mid,ease);
    vec3 p1=mix(mid,uTarget,ease);
    vec3 p=mix(p0,p1,ease);
    // Funnel narrows and spirals as dust approaches the accretion disk outer edge.
    float funnel=pow(1.-ease,1.35);
    float swirl=ease*9.5+aSeed*6.28318;
    float spiralR=2.8+funnel*4.2;
    p+=aSpread*funnel*.65+vec3(cos(swirl)*spiralR*(.35+ease*.65),sin(swirl*1.4)*1.4*funnel,sin(swirl)*spiralR*(.35+ease*.65))*smoothstep(.55,1.,ease);
    vT=ease;vSeed=aSeed;
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_PointSize=clamp((.85+aSeed*1.05)*230./max(-mv.z,35.),.8,2.15);
    gl_Position=projectionMatrix*mv;
   }`,
  fragmentShader: `
   precision highp float;
   varying float vT,vSeed;
   uniform float uFade,uHdr;
   uniform vec3 uColorA,uColorB;
   void main(){
    float d=length(gl_PointCoord-.5);
    float a=(1.-smoothstep(.02,.5,d));a=a*a*a;
    float env=smoothstep(0.,.22,vT)*(1.-smoothstep(.84,1.,vT));
    vec3 col=mix(uColorA,uColorB,smoothstep(.3,.9,vT))*mix(.78,1.04,uHdr);
    gl_FragColor=vec4(col,a*env*.24*uFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const ambientStream = new THREE.Points(trickleGeo, trickleMat);
 ambientStream.name = 'Tidal dust stream';
 ambientStream.frustumCulled = false;
 scene.add(ambientStream);

 // 6. Subtle local gravity-well reference arc around Guixu (no concentric circle around Alkaid!).
 const orbitPts = [];
 for (let i = 0; i < 64; i++) {
  if (i % 2 === 1) continue;
  const a0 = (i / 64) * Math.PI * 2;
  const a1 = ((i + 0.65) / 64) * Math.PI * 2;
  const rr = R * 6.2;
  orbitPts.push(
   Math.cos(a0) * rr, 0, Math.sin(a0) * rr,
   Math.cos(a1) * rr, 0, Math.sin(a1) * rr
  );
 }
 const orbit = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(orbitPts, 3)),
  new THREE.LineBasicMaterial({
   color: LOOK.diagram ? 0x6ea6cc : 0xa58e74,
   transparent: true,
   opacity: Math.min(0.24, LOOK.orbitOpacity * 0.9),
   depthWrite: false
  })
 );
 orbit.name = 'Singularity tidal boundary';
 root.add(orbit);

 const ticks = new THREE.Group();
 if (LOOK.diagram) {
  const ringPts = [];
  for (let i = 0; i <= 96; i++) {
   const a = (i / 96) * Math.PI * 2;
   ringPts.push(new THREE.Vector3(Math.cos(a) * R * 3.1, 0, Math.sin(a) * R * 3.1));
  }
  const refRing = new THREE.LineLoop(
   new THREE.BufferGeometry().setFromPoints(ringPts),
   new THREE.LineBasicMaterial({ color: 0x7ab4d8, transparent: true, opacity: 0.34, depthWrite: false })
  );
  refRing.rotation.x = Math.PI / 2;
  ticks.add(refRing);
  root.add(ticks);
 }

 const homePos = new THREE.Vector3(...SINGULARITY.anchor);
 const worldAxis = new THREE.Vector3();
 const toCam = new THREE.Vector3();
 const camUp = new THREE.Vector3();
 const camRight = new THREE.Vector3();
 const projectedAxis = new THREE.Vector3();
 const projVec = new THREE.Vector3();
 const streamSource = new THREE.Vector3();

 function basePosition(time = 0, out = new THREE.Vector3()) {
  // Very slow wide-binary drift arc in outer deep space (never circling like a planet).
  const driftAngle = (time / SINGULARITY.period) * Math.PI * 2;
  const c = Math.cos(driftAngle), s = Math.sin(driftAngle);
  out.set(
   homePos.x * c - homePos.z * s,
   homePos.y + Math.sin(time * 0.04) * 1.1,
   homePos.x * s + homePos.z * c
  );
  return out;
 }

 function update({
  time = 0,
  camera,
  systemFade = 1,
  orbitsVisible = true,
  selected = false,
  gravityBoost = 0,
  positionOverride = null,
  massScale = 1,
  suppressAmbientStream = false
 }) {
  if (positionOverride) {
   root.position.copy(positionOverride);
  } else {
   basePosition(time, root.position);
  }
  root.scale.setScalar(massScale);

  horizonUniforms.uTime.value = time;
  diskUniforms.uTime.value = time;
  lensUniforms.uTime.value = time;
  jetUniforms.uTime.value = time;

  horizonUniforms.uPulse.value = gravityBoost;
  diskUniforms.uPulse.value = gravityBoost;
  lensUniforms.uPulse.value = gravityBoost;
  jetUniforms.uPulse.value = gravityBoost;

  // Update the subtle ambient dust stream from the outer belt edge into Guixu.
  streamSource.copy(root.position).setY(0.5);
  const len = streamSource.length() || 1;
  streamSource.multiplyScalar(54 / len);
  trickleUniforms.uTime.value = time;
  trickleUniforms.uSource.value.copy(streamSource);
  trickleUniforms.uTarget.value.copy(root.position);
  trickleUniforms.uFade.value = suppressAmbientStream ? 0 : systemFade * (1 - Math.min(1, gravityBoost * 1.4));
  ambientStream.visible = trickleUniforms.uFade.value > 0.01;

  worldAxis.set(0, 1, 0).applyQuaternion(tiltGroup.quaternion).normalize();
  diskUniforms.uAxis.value.copy(worldAxis);

  if (camera) {
   lensQuad.quaternion.copy(camera.quaternion);
   toCam.copy(camera.position).sub(root.position).normalize();
   const elev = worldAxis.dot(toCam);
   lensUniforms.uTiltSign.value = THREE.MathUtils.clamp(elev * 2.2, -1, 1);

   camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
   camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
   projectedAxis.copy(worldAxis).addScaledVector(toCam, -elev);
   if (projectedAxis.lengthSq() > 1e-5) {
    projectedAxis.normalize();
    const roll = Math.atan2(projectedAxis.dot(camRight), projectedAxis.dot(camUp));
    lensQuad.rotateZ(-roll);
   }
  }

  orbit.visible = orbitsVisible && systemFade > 0.01;
  orbit.material.opacity = Math.min(0.32, LOOK.orbitOpacity * (selected ? 2.4 : 0.95)) * systemFade;
 }

 function screenLens(camera) {
  if (!camera) return { x: 0.5, y: 0.5, radius: 0, strength: 0 };
  projVec.copy(root.position).project(camera);
  if (projVec.z < -1 || projVec.z > 1) return { x: 0.5, y: 0.5, radius: 0, strength: 0 };
  const u = projVec.x * 0.5 + 0.5;
  const v = projVec.y * 0.5 + 0.5;
  if (u < -0.25 || u > 1.25 || v < -0.25 || v > 1.25) return { x: 0.5, y: 0.5, radius: 0, strength: 0 };
  const dist = camera.position.distanceTo(root.position);
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const effR = R * (root.scale.x || 1);
  const screenR = THREE.MathUtils.clamp(effR / Math.max(dist * halfH * 2, 1), 0.008, 0.28);
  const closeness = THREE.MathUtils.smoothstep(screenR, 0.012, 0.11);
  return { x: u, y: v, radius: screenR, strength: 0.14 + closeness * 0.72 };
 }

 function dispose() {
  scene.remove(root, ambientStream);
  root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  ambientStream.geometry?.dispose();
  ambientStream.material?.dispose();
 }

 return {
  def: SINGULARITY,
  root,
  tilt: tiltGroup,
  surface,
  pickProxy,
  orbit,
  ticks,
  ambientStream,
  basePosition,
  update,
  screenLens,
  dispose
 };
}

export function createCosmicEvents({
 THREE,
 scene,
 camera,
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
 onChange = () => {}
}) {
 const tone = lookTone(LOOK);
 const root = new THREE.Group();
 root.name = 'Cosmic events';
 scene.add(root);

 // ==========================================================================
 // 1. SUPERNOVA REMNANT & CORE-COLLAPSE SHOCKWAVE
 // ==========================================================================
 const supernovaGroup = new THREE.Group();
 supernovaGroup.name = 'supernova';
 supernovaGroup.visible = false;
 root.add(supernovaGroup);

 const flashUniforms = {
  uAge: { value: 0 },
  uHdr: hdrBoost,
  uTint: { value: new THREE.Vector3(...tone.hot) }
 };
 const flashMat = new THREE.ShaderMaterial({
  uniforms: flashUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   varying vec2 vUv;
   void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
   precision highp float;
   varying vec2 vUv;
   uniform float uAge,uHdr;
   uniform vec3 uTint;
   void main(){
    vec2 p=(vUv-.5)*2.;
    float r=length(p);
    if(r>1.)discard;

    float burst=smoothstep(0.,.32,uAge)*exp(-max(uAge-.32,0.)*.52);
    float ember=smoothstep(.4,2.,uAge)*(1.-smoothstep(18.,25.5,uAge))*(.14+.05*sin(uAge*7.5));
    float energy=burst+ember;

    float core=exp(-r*r*38.)*energy;
    float halo=exp(-r*4.6)*energy*.48;

    float sx=exp(-abs(p.y)*82.)*exp(-abs(p.x)*4.2);
    float sy=exp(-abs(p.x)*82.)*exp(-abs(p.y)*4.2);
    float diag=exp(-abs(p.x-p.y)*90.)*exp(-r*7.)*.24+exp(-abs(p.x+p.y)*90.)*exp(-r*7.)*.24;
    float spikes=(sx+sy+diag)*burst*.72;

    float fade=1.-smoothstep(.75,1.,r);
    vec3 col=mix(vec3(.55,.82,1.),uTint,.55)*(core*1.55+spikes*1.05)+vec3(.42,.56,1.)*halo*.82;
    col*=mix(.88,1.3,uHdr)*fade;
    float a=clamp((core+halo+spikes)*fade,0.,1.);
    gl_FragColor=vec4(col,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const snFlash = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), flashMat);
 snFlash.renderOrder = 4;
 supernovaGroup.add(snFlash);

 const shockUniforms = {
  uAge: { value: 0 },
  uHdr: hdrBoost,
  uProgress: { value: 0 },
  uFade: { value: 0 }
 };
 const shockMat = new THREE.ShaderMaterial({
  uniforms: shockUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   varying vec3 vNormal;
   varying vec3 vWorld;
   varying vec3 vLocal;
   ${NOISE_GLSL}
   void main(){
    vec3 dir=normalize(position);
    float lobe=1.+(fbm3(dir*2.2+vec3(1.7,-0.9,3.1))-.5)*.46;
    vec3 displaced=position*lobe;
    vLocal=dir;
    vNormal=normalize(mat3(modelMatrix)*normal);
    vWorld=(modelMatrix*vec4(displaced,1.)).xyz;
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec3 vNormal;
   varying vec3 vWorld;
   varying vec3 vLocal;
   uniform float uAge,uHdr,uProgress,uFade;
   ${NOISE_GLSL}
   void main(){
    vec3 N=normalize(vNormal);
    vec3 V=normalize(cameraPosition-vWorld);
    float limb=pow(1.-abs(dot(N,V)),3.1);

    float macro=fbm3(vLocal*3.2+vec3(0.,uAge*.03,-uAge*.025));
    float r1=1.-abs(noise3(vLocal*7.8+vec3(macro*1.6,uAge*.05,0.))*2.-1.);
    float r2=1.-abs(noise3(vLocal*15.5-vec3(uAge*.04,macro*1.4,0.))*2.-1.);
    float strands=pow(r1,4.2)*.75+pow(r2,5.5)*.45;
    float veil=smoothstep(.44,.86,macro)*.34;
    float web=strands+veil;

    vec3 hot=vec3(.76,.92,1.);
    vec3 ionized=vec3(.28,.76,.96);
    vec3 nebula=vec3(.58,.38,.92);
    vec3 col=mix(hot,ionized,smoothstep(.04,.32,uProgress));
    col=mix(col,nebula,smoothstep(.24,.82,uProgress)*(1.-limb*.5));
    col+=vec3(.96,.58,.46)*pow(r1,6.)*smoothstep(.15,.65,uProgress)*.58;

    float alpha=(limb*.88+.05)*web*uFade*.56;
    gl_FragColor=vec4(col*mix(.86,1.22,uHdr),clamp(alpha,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const snShock = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 36), shockMat);
 snShock.renderOrder = 3;
 supernovaGroup.add(snShock);

 const snRingUniforms = {
  uAge: { value: 0 },
  uHdr: hdrBoost,
  uFade: { value: 0 }
 };
 const snRingMat = new THREE.ShaderMaterial({
  uniforms: snRingUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   varying vec2 vPos;
   void main(){vPos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
   precision highp float;
   varying vec2 vPos;
   uniform float uAge,uHdr,uFade;
   void main(){
    float r=length(vPos);
    float band=exp(-pow((r-1.)*11.,2.));
    float ang=atan(vPos.y,vPos.x);
    float pearls=.62+.38*pow(.5+.5*sin(ang*16.+uAge*.4),3.);
    vec3 col=mix(vec3(.52,.78,1.),vec3(.96,.72,.58),.35*pearls)*mix(.9,1.35,uHdr);
    gl_FragColor=vec4(col,band*pearls*uFade*.68);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const snRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 1.24, 128), snRingMat);
 snRing.rotation.set(Math.PI * 0.36, 0.25, 0.18);
 supernovaGroup.add(snRing);

 const ejectaCount = 340;
 const ejDir = new Float32Array(ejectaCount * 3);
 const ejSpeed = new Float32Array(ejectaCount);
 const ejSeed = new Float32Array(ejectaCount);
 const ejBasePos = new Float32Array(ejectaCount * 3);
 const rand = makeRand(9187);
 for (let i = 0; i < ejectaCount; i++) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const k = Math.sqrt(Math.max(0, 1 - u * u));
  const eq = rand() < 0.3 ? 0.38 : 1.0;
  ejDir[i * 3] = Math.cos(phi) * k;
  ejDir[i * 3 + 1] = u * eq;
  ejDir[i * 3 + 2] = Math.sin(phi) * k;
  ejSpeed[i] = 0.55 + Math.pow(rand(), 1.4) * 0.95;
  ejSeed[i] = rand();
 }
 const ejGeo = new THREE.BufferGeometry();
 ejGeo.setAttribute('position', new THREE.BufferAttribute(ejBasePos, 3));
 ejGeo.setAttribute('aDir', new THREE.BufferAttribute(ejDir, 3));
 ejGeo.setAttribute('aSpeed', new THREE.BufferAttribute(ejSpeed, 1));
 ejGeo.setAttribute('aSeed', new THREE.BufferAttribute(ejSeed, 1));
 const ejUniforms = {
  uRadius: { value: 1 },
  uProgress: { value: 0 },
  uFade: { value: 0 },
  uHdr: hdrBoost
 };
 const ejMat = new THREE.ShaderMaterial({
  uniforms: ejUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   attribute vec3 aDir;
   attribute float aSpeed,aSeed;
   uniform float uRadius,uProgress;
   varying float vSeed;
   varying float vSpeed;
   void main(){
    vSeed=aSeed;vSpeed=aSpeed;
    vec3 pos=aDir*(uRadius*aSpeed);
    vec4 mv=modelViewMatrix*vec4(pos,1.);
    gl_PointSize=clamp((2.2+aSeed*3.4)*(1.-uProgress*.35)*360./max(-mv.z,40.),1.4,6.5);
    gl_Position=projectionMatrix*mv;
   }`,
  fragmentShader: `
   precision highp float;
   varying float vSeed,vSpeed;
   uniform float uProgress,uFade,uHdr;
   void main(){
    float d=length(gl_PointCoord-.5);
    float a=(1.-smoothstep(.04,.5,d));a*=a;
    vec3 c1=mix(vec3(.78,.93,1.),vec3(.45,.74,1.),vSeed);
    vec3 c2=mix(vec3(.66,.48,.96),vec3(.96,.70,.50),step(.62,vSeed));
    vec3 col=mix(c1,c2,smoothstep(.15,.75,uProgress))*mix(.95,1.45,uHdr);
    gl_FragColor=vec4(col,a*uFade*.82);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const snEjecta = new THREE.Points(ejGeo, ejMat);
 snEjecta.frustumCulled = false;
 supernovaGroup.add(snEjecta);

 // ==========================================================================
 // 2. REAL GRAVITATIONAL PULL, ROCHE-LOBE STELLAR STREAM & N-BODY DEFLECTION
 // ==========================================================================
 const gravityGroup = new THREE.Group();
 gravityGroup.name = 'gravity';
 gravityGroup.visible = false;
 root.add(gravityGroup);

 // 2a. Binary-well spacetime metric grid (deep funnel at Guixu + moving well under Alkaid).
 const gridUniforms = {
  uOrigin: { value: new THREE.Vector3(...SINGULARITY.anchor) },
  uStarPos: { value: new THREE.Vector3(0, 0, 0) },
  uWaveR: { value: 0 },
  uPhase: { value: 0 },
  uStrength: { value: 0 },
  uColor: { value: new THREE.Vector3(...tone.grid) },
  uAccent: { value: new THREE.Vector3(...tone.ring) },
  uGain: { value: tone.gridGain },
  uHdr: hdrBoost
 };
 const gridGeo = new THREE.PlaneGeometry(250, 250, 132, 132);
 gridGeo.rotateX(-Math.PI / 2);
 const gridMat = new THREE.ShaderMaterial({
  uniforms: gridUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   uniform vec3 uOrigin,uStarPos;
   uniform float uWaveR,uPhase,uStrength;
   varying vec2 vXZ;
   varying float vDist;
   varying float vStarDist;
   varying float vWave;
   varying float vWell;
   void main(){
    vec3 pos=position;
    vec2 rel=pos.xz-uOrigin.xz;
    float d=length(rel);
    float phi=atan(rel.y,rel.x);
    // Deep gravitational funnel at Guixu (12.4 M_sun) + companion well at dragged Alkaid (6.1 M_sun).
    float bhWell=1./(1.+pow(d/15.5,2.));
    float sd=length(pos.xz-uStarPos.xz);
    float starWell=1./(1.+pow(sd/14.,2.));
    float env1=exp(-pow((d-uWaveR)/26.,2.));
    float env2=exp(-pow((d-max(uWaveR-46.,0.))/22.,2.))*.65;
    float quad=.65+.35*cos(2.*phi-uPhase*.55);
    float ripple=sin((d-uWaveR)*.21)*env1+sin((d-uWaveR+46.)*.23)*env2;
    float disp=(-bhWell*16.5-starWell*6.2+ripple*quad*2.8)*uStrength;
    pos.y+=disp;
    vXZ=pos.xz;
    vDist=d;
    vStarDist=sd;
    vWave=clamp((env1+env2)*(.55+.45*abs(quad)),0.,1.);
    vWell=clamp(bhWell+starWell*.55,0.,1.2);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
   }`,
  fragmentShader: `
   precision highp float;
   varying vec2 vXZ;
   varying float vDist;
   varying float vStarDist;
   varying float vWave;
   varying float vWell;
   uniform float uStrength,uGain,uHdr;
   uniform vec3 uColor,uAccent;
   void main(){
    float radialFade=1.-smoothstep(88.,120.,length(vXZ));
    if(radialFade<=.002)discard;

    vec2 coord=vXZ/10.;
    vec2 fw=max(fwidth(coord),vec2(.001));
    vec2 grid=abs(fract(coord-.5)-.5)/(fw*.88);
    float line=1.-min(min(grid.x,grid.y),1.);

    float rc=vDist/14.;
    float rfw=max(fwidth(rc),.001);
    float rings=1.-min(abs(fract(rc-.5)-.5)/(rfw*.88),1.);

    float coreClear=smoothstep(4.5,11.,vDist)*smoothstep(4.,8.5,vStarDist);
    float mask=max(line*.82,rings*.48*(vWell+.65*vWave))*coreClear;
    float vis=(.055+vWell*.28+vWave*.52)*radialFade*uStrength*uGain;
    vec3 col=mix(uColor,uAccent,clamp(vWell*.62+vWave*.38,0.,1.))*mix(.86,1.16,uHdr);
    gl_FragColor=vec4(col,clamp(mask*vis,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const metricGrid = new THREE.Mesh(gridGeo, gridMat);
 metricGrid.position.y = -6.8;
 metricGrid.renderOrder = 1;
 gravityGroup.add(metricGrid);

 // 2b. 5 delicate quadrupole tidal rings expanding from Guixu across the orbital plane.
 const waveRings = [];
 for (let i = 0; i < 5; i++) {
  const pts = [];
  for (let j = 0; j <= 160; j++) {
   const a = (j / 160) * Math.PI * 2;
   pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const ring = new THREE.LineLoop(
   new THREE.BufferGeometry().setFromPoints(pts),
   new THREE.LineBasicMaterial({
    color: i % 2 === 0 ? 0x8cc8ec : 0xdcb88e,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
   })
  );
  gravityGroup.add(ring);
  waveRings.push(ring);
 }

 // 2c. Stellar Roche-lobe tidal accretion stream: luminous plasma ribbon + fine sparks torn from Alkaid into Guixu!
 const rocheCount = 540;
 const rRand = makeRand(6183);
 const rSeed = new Float32Array(rocheCount);
 const rSpread = new Float32Array(rocheCount * 3);
 const rPos = new Float32Array(rocheCount * 3);
 for (let i = 0; i < rocheCount; i++) {
  rSeed[i] = rRand();
  rSpread[i * 3] = (rRand() - 0.5) * 3.6;
  rSpread[i * 3 + 1] = (rRand() - 0.5) * 2.1;
  rSpread[i * 3 + 2] = (rRand() - 0.5) * 3.6;
 }
 const rocheGeo = new THREE.BufferGeometry();
 rocheGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
 rocheGeo.setAttribute('aSeed', new THREE.BufferAttribute(rSeed, 1));
 rocheGeo.setAttribute('aSpread', new THREE.BufferAttribute(rSpread, 3));
 const rocheUniforms = {
  uAge: { value: 0 },
  uStar: { value: new THREE.Vector3() },
  uBH: { value: new THREE.Vector3(...SINGULARITY.anchor) },
  uStrength: { value: 0 },
  uHdr: hdrBoost
 };
 const rocheMat = new THREE.ShaderMaterial({
  uniforms: rocheUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
   attribute float aSeed;
   attribute vec3 aSpread;
   uniform float uAge,uStrength;
   uniform vec3 uStar,uBH;
   varying float vU,vSeed;
   void main(){
    float u=fract(aSeed+uAge*(.18+aSeed*.07));
    float t=pow(u,1.42);
    vec3 delta=uBH-uStar;
    float dist=max(length(delta),1.);
    vec3 dir=delta/dist;
    vec3 side=normalize(cross(dir,vec3(0.,1.,0.)));
    vec3 start=uStar+dir*5.1;
    vec3 c1=mix(start,uBH,.35)+side*(dist*.20)+vec3(0.,2.2,0.);
    vec3 c2=mix(start,uBH,.76)+side*(dist*.14)+vec3(0.,1.2,0.);
    float omt=1.-t;
    vec3 p=omt*omt*omt*start+3.*omt*omt*t*c1+3.*omt*t*t*c2+t*t*t*uBH;
    float wrap=smoothstep(.70,1.,t);
    float ang=wrap*5.4+aSeed*6.28318;
    float rDisk=mix(4.0,2.7,wrap);
    p+=vec3(cos(ang)*rDisk,sin(ang*.7)*.4,sin(ang)*rDisk)*wrap;
    float width=mix(.90,.20,t)*(.55+.45*sin(t*3.14159));
    p+=aSpread*width*(1.-wrap*.65);
    vU=t;vSeed=aSeed;
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_PointSize=clamp((1.15+aSeed*1.45)*(1.-t*.22)*270./max(-mv.z,32.),1.0,3.2);
    gl_Position=projectionMatrix*mv;
   }`,
  fragmentShader: `
   precision highp float;
   varying float vU,vSeed;
   uniform float uStrength,uHdr;
   void main(){
    float d=length(gl_PointCoord-.5);
    float a=1.-smoothstep(.02,.5,d);a=a*a*a;
    float env=smoothstep(0.,.08,vU)*(1.-smoothstep(.90,1.,vU));
    vec3 cStar=vec3(.56,.82,1.);
    vec3 cMid=vec3(.92,.95,1.);
    vec3 cDisk=vec3(.96,.70,.42);
    vec3 col=mix(cStar,cMid,smoothstep(.1,.55,vU));
    col=mix(col,cDisk,smoothstep(.52,.94,vU));
    col*=mix(.88,1.25,uHdr);
    gl_FragColor=vec4(col,a*env*uStrength*.70);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const rochePoints = new THREE.Points(rocheGeo, rocheMat);
 rochePoints.name = 'Roche lobe plasma stream';
 rochePoints.frustumCulled = false;
 rochePoints.renderOrder = 3;
 gravityGroup.add(rochePoints);

 // Continuous luminous plasma veil ribbon along the Roche bridge so the flow reads silky rather than dotted.
 const veilSegs = 64;
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
    float core=exp(-across*across*6.5);
    float wisps=fbm3(vec3(vUv.x*8.-uAge*1.55,vUv.y*3.8,uAge*.28));
    float strands=smoothstep(.25,.85,wisps);
    float env=smoothstep(0.,.10,vUv.x)*(1.-smoothstep(.88,1.,vUv.x));
    vec3 cStar=vec3(.52,.80,1.);
    vec3 cMid=vec3(.92,.95,1.);
    vec3 cDisk=vec3(.96,.68,.40);
    vec3 col=mix(cStar,cMid,smoothstep(.08,.52,vUv.x));
    col=mix(col,cDisk,smoothstep(.50,.94,vUv.x));
    float alpha=core*(.42+.58*strands)*env*uStrength*.52;
    gl_FragColor=vec4(col*mix(.88,1.22,uHdr),clamp(alpha,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const rocheVeil = new THREE.Mesh(veilGeo, veilMat);
 rocheVeil.frustumCulled = false;
 rocheVeil.renderOrder = 2;
 gravityGroup.add(rocheVeil);

 // 3 delicate core filament lines inside the Roche stream.
 const streamRibbons = [];
 const ribbonSegs = 64;
 for (let r = 0; r < 3; r++) {
  const posArr = new Float32Array(ribbonSegs * 3);
  const colArr = new Float32Array(ribbonSegs * 3);
  for (let i = 0; i < ribbonSegs; i++) {
   const t = i / (ribbonSegs - 1);
   const env = Math.sin(t * Math.PI);
   colArr[i * 3] = (0.55 + t * 0.43) * env;
   colArr[i * 3 + 1] = (0.82 - t * 0.08) * env;
   colArr[i * 3 + 2] = (1.0 - t * 0.52) * env;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const line = new THREE.Line(
   geo,
   new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
   })
  );
  line.frustumCulled = false;
  gravityGroup.add(line);
  streamRibbons.push({ line, offset: (r - 1) * 0.85, phase: r * 2.1 });
 }

 // 2d. Real-time gravitational deflection trails for all 6 planets!
 const TRAIL_LEN = 72;
 const planetTrails = bodies.map(b => {
  const posArr = new Float32Array(TRAIL_LEN * 3);
  const colArr = new Float32Array(TRAIL_LEN * 3);
  const c = new THREE.Color(b.def.color || '#9ec6e4');
  for (let i = 0; i < TRAIL_LEN; i++) {
   const fade = Math.pow(i / (TRAIL_LEN - 1), 1.6);
   colArr[i * 3] = c.r * fade;
   colArr[i * 3 + 1] = c.g * fade;
   colArr[i * 3 + 2] = c.b * fade;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const line = new THREE.Line(
   geo,
   new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
   })
  );
  line.frustumCulled = false;
  gravityGroup.add(line);
  return { body: b, line, count: 0, history: [] };
 });

 // Physics state for the gravitational-pull simulation.
 const baseStarScale = star ? star.scale.clone() : new THREE.Vector3(5.1, 4.85, 5.1);
 const baseCoronaScale = corona ? corona.scale.clone() : new THREE.Vector3(5.75, 5.75, 5.75);
 let sim = null;

 let active = null;
 let age = 0;
 let queued = null;
 let nextAmbient = COSMIC_TIMING.ambientFirstDelay;
 let ambientToggle = 0;
 let bloomBoost = 0;
 let rippleStrength = 0;
 let gravityIntensity = 0;
 let lastSimTime = 0;
 const snAnchor = new THREE.Vector3();
 const tmpV1 = new THREE.Vector3();
 const tmpV2 = new THREE.Vector3();
 const tmpV3 = new THREE.Vector3();
 const tmpUp = new THREE.Vector3(0, 1, 0);

 function initGravitySim(simTime) {
  const bhStart = blackHole ? blackHole.root.position.clone() : new THREE.Vector3(...SINGULARITY.anchor);
  const dir = bhStart.clone().setY(0).normalize();
  const bhClose = dir.multiplyScalar(48).setY(4.2);
  const MU_STAR = 920; // Visual gravitational parameter for Alkaid (6.1 M_sun)

  const planets = bodies.map(b => {
   const pos = b.root.position.clone();
   const r = Math.max(pos.length(), 6);
   // Tangent direction matching Alkaid's counter-clockwise/clockwise Keplerian motion (cos a, 0, sin a) -> (-sin a, 0, cos a).
   const tang = new THREE.Vector3(-pos.z / r, 0, pos.x / r);
   const vMag = Math.sqrt(MU_STAR / r);
   return {
    body: b,
    pos,
    vel: tang.multiplyScalar(vMag),
    homeOrbit: b.def.orbit,
    snapPos: pos.clone(),
    captured: false
   };
  });

  for (const tr of planetTrails) {
   tr.history = [];
   tr.line.geometry.setDrawRange(0, 0);
   tr.line.material.opacity = 0;
  }

  sim = {
   bhStart,
   bhClose,
   bhPos: bhStart.clone(),
   starPos: new THREE.Vector3(0, 0, 0),
   starVel: new THREE.Vector3(0, 0, 0),
   starSnap: new THREE.Vector3(0, 0, 0),
   bhSnap: bhClose.clone(),
   rewinding: false,
   planets,
   muStar: MU_STAR,
   simTime
  };
 }

 function stepGravityPhysics(dtSim, pullGain) {
  if (!sim || dtSim <= 0) return;
  const substeps = 4;
  const h = dtSim / substeps;
  const bhMassRatio = SINGULARITY.massSolar / 6.1; // ~2.03x Alkaid's mass!
  const muBH = sim.muStar * bhMassRatio * 2.35 * pullGain;
  const bhRadius = SINGULARITY.radius;

  for (let s = 0; s < substeps; s++) {
   // 1. Pull Alkaid toward Guixu along a curved binary infall trajectory (capped outside Roche contact).
   tmpV1.copy(sim.bhPos).sub(sim.starPos);
   const dSB = tmpV1.length();
   if (dSB > 1e-3 && muBH > 0.01) {
    // Direct gravitational attraction + slight binary orbital swirl around common barycenter.
    const softSB = dSB * dSB + 24 * 24;
    const accMag = (muBH * 0.58) / (softSB * Math.sqrt(softSB));
    sim.starVel.addScaledVector(tmpV1, accMag * h);
    // Gentle swirl perpendicular to separation so star & black hole curve around barycenter.
    tmpV2.set(-tmpV1.z / dSB, 0, tmpV1.x / dSB);
    sim.starVel.addScaledVector(tmpV2, Math.min(1.6, accMag * dSB * 0.16) * h);
   }
   // Damp star speed mildly so it glides dramatically rather than slingshotting off-screen.
   sim.starVel.multiplyScalar(Math.exp(-0.24 * h));
   sim.starPos.addScaledVector(sim.starVel, h);

   // Keep Alkaid outside direct collision with Guixu's accretion disk (realistic close Roche contact ~25 units).
   tmpV1.copy(sim.starPos).sub(sim.bhPos);
   const curSB = tmpV1.length();
   if (curSB < 25.5 && curSB > 1e-3) {
    tmpV1.multiplyScalar(25.5 / curSB);
    sim.starPos.copy(sim.bhPos).add(tmpV1);
    sim.starVel.multiplyScalar(0.85);
   }

   // 2. Real N-body integration on every planet: pulled by both moving Alkaid AND massive Guixu!
   for (const p of sim.planets) {
    // Force from moving Alkaid
    tmpV1.copy(sim.starPos).sub(p.pos);
    const dS = tmpV1.length();
    const softS = dS * dS + 16;
    const aS = sim.muStar / (softS * Math.sqrt(softS));

    // Force from massive Guixu (dominant when Guixu approaches!)
    tmpV2.copy(sim.bhPos).sub(p.pos);
    const dB = tmpV2.length();
    const softB = dB * dB + 64;
    const aB = (muBH * 1.48) / (softB * Math.sqrt(softB));

    p.vel.addScaledVector(tmpV1, aS * h);
    p.vel.addScaledVector(tmpV2, aB * h);

    // Subtle tidal drag near Guixu's accretion halo so captured worlds spiral vividly around the black hole.
    if (dB < 26) {
     p.vel.multiplyScalar(Math.exp(-0.22 * h));
    } else {
     p.vel.multiplyScalar(Math.exp(-0.025 * h));
    }

    p.pos.addScaledVector(p.vel, h);

    // Prevent planets from clipping inside the event horizon or Alkaid's photosphere.
    tmpV2.copy(p.pos).sub(sim.bhPos);
    const distB = tmpV2.length();
    const minBH = bhRadius * 3.1 + p.body.def.radius * 0.5;
    if (distB < minBH && distB > 1e-3) {
     tmpV2.normalize();
     p.pos.copy(sim.bhPos).addScaledVector(tmpV2, minBH);
     // Keep tangential velocity so it skims/spirals along the accretion outer rim.
     const radialV = p.vel.dot(tmpV2);
     if (radialV < 0) p.vel.addScaledVector(tmpV2, -radialV * 1.05);
     p.captured = true;
    }

    tmpV1.copy(p.pos).sub(sim.starPos);
    const distS = tmpV1.length();
    const minStar = 7.2 + p.body.def.radius;
    if (distS < minStar && distS > 1e-3) {
     tmpV1.normalize();
     p.pos.copy(sim.starPos).addScaledVector(tmpV1, minStar);
     const radialV = p.vel.dot(tmpV1);
     if (radialV < 0) p.vel.addScaledVector(tmpV1, -radialV * 1.1);
    }
   }
  }
 }

 function updateRocheRibbons(ageVal, strength) {
  if (!sim) return;
  tmpV1.copy(sim.bhPos).sub(sim.starPos);
  const dist = Math.max(tmpV1.length(), 1);
  tmpV2.copy(tmpV1).divideScalar(dist); // dir
  tmpV3.crossVectors(tmpV2, tmpUp).normalize(); // side
  const start = sim.starPos.clone().addScaledVector(tmpV2, 5.1);
  const c1 = start.clone().lerp(sim.bhPos, 0.35).addScaledVector(tmpV3, dist * 0.20).add(new THREE.Vector3(0, 2.2, 0));
  const c2 = start.clone().lerp(sim.bhPos, 0.76).addScaledVector(tmpV3, dist * 0.14).add(new THREE.Vector3(0, 1.2, 0));

  // Update silky continuous plasma veil mesh along the Roche curve.
  const vAttr = rocheVeil.geometry.attributes.position;
  for (let i = 0; i <= veilSegs; i++) {
   const t = i / veilSegs;
   const omt = 1 - t;
   const x = omt * omt * omt * start.x + 3 * omt * omt * t * c1.x + 3 * omt * t * t * c2.x + t * t * t * sim.bhPos.x;
   const y = omt * omt * omt * start.y + 3 * omt * omt * t * c1.y + 3 * omt * t * t * c2.y + t * t * t * sim.bhPos.y;
   const z = omt * omt * omt * start.z + 3 * omt * omt * t * c1.z + 3 * omt * t * t * c2.z + t * t * t * sim.bhPos.z;
   const halfW = (2.7 * (1 - t * 0.72) + 0.45) * (0.65 + 0.35 * Math.sin(t * Math.PI));
   vAttr.setXYZ(i * 2, x - tmpV3.x * halfW, y - 0.35 * halfW, z - tmpV3.z * halfW);
   vAttr.setXYZ(i * 2 + 1, x + tmpV3.x * halfW, y + 0.35 * halfW, z + tmpV3.z * halfW);
  }
  vAttr.needsUpdate = true;
  veilUniforms.uAge.value = ageVal;
  veilUniforms.uStrength.value = strength;
  rocheVeil.visible = strength > 0.01;

  for (const rb of streamRibbons) {
   const posAttr = rb.line.geometry.attributes.position;
   for (let i = 0; i < ribbonSegs; i++) {
    const t = i / (ribbonSegs - 1);
    const omt = 1 - t;
    const x = omt * omt * omt * start.x + 3 * omt * omt * t * c1.x + 3 * omt * t * t * c2.x + t * t * t * sim.bhPos.x;
    const y = omt * omt * omt * start.y + 3 * omt * omt * t * c1.y + 3 * omt * t * t * c2.y + t * t * t * sim.bhPos.y;
    const z = omt * omt * omt * start.z + 3 * omt * omt * t * c1.z + 3 * omt * t * t * c2.z + t * t * t * sim.bhPos.z;
    const sway = Math.sin(t * 10 - ageVal * 2.8 + rb.phase) * (1 - t * 0.7) * 0.55;
    const spread = rb.offset * (1 - t * 0.75) * Math.sin(t * Math.PI);
    posAttr.setXYZ(i, x + tmpV3.x * (spread + sway), y + Math.cos(t * 8 - ageVal * 2.2 + rb.phase) * 0.35 * (1 - t), z + tmpV3.z * (spread + sway));
   }
   posAttr.needsUpdate = true;
   rb.line.material.opacity = strength * 0.42;
  }
 }

 function pushTrails(opacity) {
  for (let i = 0; i < planetTrails.length; i++) {
   const tr = planetTrails[i];
   const pos = tr.body.root.position;
   const last = tr.history[tr.history.length - 1];
   if (!last || last.distanceToSquared(pos) > 0.35) {
    tr.history.push(pos.clone());
    if (tr.history.length > TRAIL_LEN) tr.history.shift();
   }
   const arr = tr.line.geometry.attributes.position;
   const n = tr.history.length;
   for (let j = 0; j < n; j++) {
    const p = tr.history[j];
    arr.setXYZ(j, p.x, p.y, p.z);
   }
   arr.needsUpdate = true;
   tr.line.geometry.setDrawRange(0, n);
   tr.line.material.opacity = opacity;
  }
 }

 function applyStarPose(pos, bhPos, tidalFactor) {
  if (star) {
   star.position.copy(pos);
   star.scale.copy(baseStarScale);
   if (tidalFactor > 0.01 && bhPos) {
    // Subtle tidal elongation along the vector toward Guixu.
    const stretch = 1 + tidalFactor * 0.14;
    const squash = 1 / Math.sqrt(stretch);
    star.scale.set(baseStarScale.x * stretch, baseStarScale.y * squash, baseStarScale.z * squash);
    const angle = Math.atan2(bhPos.z - pos.z, bhPos.x - pos.x);
    star.rotation.y = -angle;
   }
  }
  if (corona) {
   corona.position.copy(pos);
   corona.scale.copy(baseCoronaScale).multiplyScalar(1 + tidalFactor * 0.06);
  }
  if (halo) halo.position.copy(pos);
  if (lightPosition) lightPosition.copy(pos);
 }

 function resetBodyPerturbations() {
  for (const b of bodies) {
   b.orbit.position.y = 0;
   b.ticks.position.y = 0;
   const d = b.def;
   const a = d.phase + (lastSimTime / d.period) * Math.PI * 2;
   b.root.position.set(Math.cos(a) * d.orbit, 0, Math.sin(a) * d.orbit);
   if (b.ring) b.ring.material.uniforms.uCenter.value.copy(b.root.position);
  }
  applyStarPose(new THREE.Vector3(0, 0, 0), null, 0);
  if (belt) {
   belt.position.set(0, 0, 0);
   belt.scale.set(1, 1, 1);
  }
  for (const tr of planetTrails) {
   tr.history = [];
   tr.line.geometry.setDrawRange(0, 0);
   tr.line.material.opacity = 0;
  }
  for (const rb of streamRibbons) rb.line.material.opacity = 0;
  rocheVeil.visible = false;
  veilUniforms.uStrength.value = 0;
  dust?.setGravity?.({ strength: 0 });
  sim = null;
  rippleStrength = 0;
  gravityIntensity = 0;
 }

 function start(id) {
  if (id !== 'supernova' && id !== 'gravity') return;
  stop(false);
  active = id;
  age = id === 'gravity' ? 1.1 : 0.85;
  if (id === 'supernova') {
   const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
   const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
   const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
   snAnchor.copy(camera.position)
    .addScaledVector(forward, 470)
    .addScaledVector(right, 96)
    .addScaledVector(up, 84);
   supernovaGroup.position.copy(snAnchor);
   supernovaGroup.visible = true;
  } else {
   initGravitySim(lastSimTime);
   // Pre-step slightly so even reduced-motion or immediate frames show authentic gravitational pull.
   stepGravityPhysics(0.65, 0.85);
   gravityGroup.visible = true;
  }
  onChange(id, COSMIC_STORIES[id]);
 }

 function stop(notify = true) {
  const wasActive = !!active;
  active = null;
  queued = null;
  supernovaGroup.visible = false;
  gravityGroup.visible = false;
  bloomBoost = 0;
  resetBodyPerturbations();
  if (notify && wasActive) onChange(null, null);
 }

 function update({
  dt = 0,
  simTime = 0,
  speed = 1,
  effectTime = 0,
  paused = false,
  reducedMotion = false,
  transitioning = false,
  mode = 'system',
  hold = false,
  otherEventActive = false,
  ambientAllowed = true
 } = {}) {
  lastSimTime = simTime;

  // Ambient encounters in overview mode stay gentle (supernova only, so background drift never surprises by dragging planets unasked).
  if (
   !active && !queued && !otherEventActive && ambientAllowed &&
   !paused && !reducedMotion && !transitioning && !hold && mode === 'system' &&
   effectTime > nextAmbient
  ) {
   nextAmbient = effectTime + COSMIC_TIMING.ambientInterval;
   ambientToggle++;
   start('supernova');
  }

  if (queued && !transitioning && !hold && mode === 'system') {
   const id = queued;
   queued = null;
   start(id);
  }

  if (!active) {
   bloomBoost *= Math.max(0, 1 - (dt || 0.016) * 4);
   return;
  }

  if (mode !== 'system' && mode !== 'singularity') {
   stop(true);
   return;
  }

  const timeStep = (!paused && !reducedMotion) ? dt : 0;
  age += timeStep;

  if (active === 'supernova') {
   const dur = COSMIC_TIMING.supernovaDuration;
   if (age >= dur) { stop(true); return; }
   supernovaGroup.visible = !transitioning;
   if (transitioning) return;

   const progress = THREE.MathUtils.clamp(age / dur, 0, 1);
   const fadeIn = THREE.MathUtils.smoothstep(age, 0, 0.8);
   const fadeOut = 1 - THREE.MathUtils.smoothstep(age, dur - 6.5, dur);
   const fade = fadeIn * fadeOut;

   const shockR = 4.0 + Math.pow(age, 0.50) * 12.2;
   snFlash.quaternion.copy(camera.quaternion);
   flashUniforms.uAge.value = age;

   snShock.scale.setScalar(shockR);
   snShock.rotation.y = age * 0.05;
   shockUniforms.uAge.value = age;
   shockUniforms.uProgress.value = progress;
   shockUniforms.uFade.value = fade;

   snRing.scale.setScalar(shockR * 0.72);
   snRing.rotation.z = 0.18 + age * 0.04;
   snRingUniforms.uAge.value = age;
   snRingUniforms.uFade.value = fade * THREE.MathUtils.smoothstep(age, 0.5, 2.6);

   ejUniforms.uRadius.value = shockR * 1.08;
   ejUniforms.uProgress.value = progress;
   ejUniforms.uFade.value = fade;

   const flashPeak = Math.exp(-Math.pow((age - 0.8) / 1.4, 2));
   bloomBoost = flashPeak * 0.36;
   rippleStrength = 0;
   gravityIntensity = 0;
  } else if (active === 'gravity' && sim) {
   const dur = COSMIC_TIMING.gravityDuration;
   const rewindStart = COSMIC_TIMING.gravityRewindStart;
   if (age >= dur) { stop(true); return; }
   gravityGroup.visible = !transitioning;
   if (transitioning) return;

   const fadeIn = THREE.MathUtils.smoothstep(age, 0, 1.5);
   const fadeOut = 1 - THREE.MathUtils.smoothstep(age, rewindStart + 1.0, dur);
   const strength = fadeIn * fadeOut;
   gravityIntensity = strength;

   const approachT = THREE.MathUtils.smoothstep(age, 0.4, COSMIC_TIMING.gravityApproachEnd);
   const pullGain = THREE.MathUtils.smoothstep(age, 0.6, 5.2);

   if (age < rewindStart) {
    // Advance Guixu inward into Alkaid's Hill sphere and gently arc around the barycenter.
    const orbitArc = (age - 1.1) * 0.032;
    sim.bhPos.lerpVectors(sim.bhStart, sim.bhClose, approachT);
    const c = Math.cos(orbitArc), s = Math.sin(orbitArc);
    const bx = sim.bhPos.x * c - sim.bhPos.z * s;
    const bz = sim.bhPos.x * s + sim.bhPos.z * c;
    sim.bhPos.set(bx, sim.bhPos.y, bz);

    // Integrate real gravitational pull on Alkaid and all six planets.
    if (timeStep > 0) {
     const simStep = Math.min(timeStep * Math.max(0.6, Math.min(2.4, 0.85 + speed * 0.25)), 0.14);
     stepGravityPhysics(simStep, pullGain);
    }

    // Apply simulated coordinates to bodies & Alkaid.
    for (const p of sim.planets) {
     p.body.root.position.copy(p.pos);
     if (p.body.ring) p.body.ring.material.uniforms.uCenter.value.copy(p.pos);
    }
    applyStarPose(sim.starPos, sim.bhPos, pullGain * strength);
    pushTrails(0.68 * strength);
   } else {
    // Graceful spacetime rewind back to undisturbed Keplerian orbits.
    if (!sim.rewinding) {
     sim.rewinding = true;
     sim.starSnap.copy(sim.starPos);
     sim.bhSnap.copy(sim.bhPos);
     for (const p of sim.planets) p.snapPos.copy(p.pos);
    }
    const rt = THREE.MathUtils.smoothstep(age, rewindStart, dur - 0.3);
    const homeBH = blackHole ? blackHole.basePosition(simTime, tmpV1) : sim.bhStart;
    sim.bhPos.lerpVectors(sim.bhSnap, homeBH, rt);
    sim.starPos.lerpVectors(sim.starSnap, new THREE.Vector3(0, 0, 0), rt);
    applyStarPose(sim.starPos, sim.bhPos, (1 - rt) * 0.6);
    for (const p of sim.planets) {
     const d = p.body.def;
     const a = d.phase + (simTime / d.period) * Math.PI * 2;
     tmpV2.set(Math.cos(a) * d.orbit, 0, Math.sin(a) * d.orbit);
     p.body.root.position.lerpVectors(p.snapPos, tmpV2, rt);
     if (p.body.ring) p.body.ring.material.uniforms.uCenter.value.copy(p.body.root.position);
    }
    for (const tr of planetTrails) tr.line.material.opacity = (1 - rt) * 0.55;
   }

   // Pull asteroid belt mildly toward Guixu as well.
   if (belt) {
    const beltPull = strength * pullGain;
    belt.position.set(sim.bhPos.x * 0.11 * beltPull, sim.bhPos.y * 0.08 * beltPull, sim.bhPos.z * 0.11 * beltPull);
    belt.scale.set(1 + 0.08 * beltPull, 1, 1 - 0.04 * beltPull);
   }

   // Update Roche-lobe plasma stream from Alkaid into Guixu.
   const streamStrength = THREE.MathUtils.smoothstep(age, 1.4, 4.5) * (1 - THREE.MathUtils.smoothstep(age, rewindStart, rewindStart + 3.2));
   rochePoints.visible = streamStrength > 0.01;
   rocheUniforms.uAge.value = age;
   rocheUniforms.uStar.value.copy(sim.starPos);
   rocheUniforms.uBH.value.copy(sim.bhPos);
   rocheUniforms.uStrength.value = streamStrength;
   updateRocheRibbons(age, streamStrength);

   // Update binary-well spacetime metric grid & quadrupole tidal waves.
   const waveR = (age * 17.0) % 210;
   gridUniforms.uOrigin.value.copy(sim.bhPos);
   gridUniforms.uStarPos.value.copy(sim.starPos);
   gridUniforms.uWaveR.value = waveR;
   gridUniforms.uPhase.value = age * 2.2;
   gridUniforms.uStrength.value = strength;

   waveRings.forEach((ring, idx) => {
    const t = ((age * 0.14 + idx / waveRings.length) % 1);
    const r = 6 + t * 185;
    const squeeze = 1 + 0.08 * Math.sin(age * 2.2 + idx * 1.4);
    ring.position.set(sim.bhPos.x, sim.bhPos.y * (1 - t * 0.65), sim.bhPos.z);
    ring.scale.set(r * squeeze, 1, r / squeeze);
    ring.rotation.y = idx * 0.5 + age * 0.06;
    ring.material.opacity = Math.sin(t * Math.PI) * 0.24 * strength;
   });

   // Fade static circular reference orbits while planets are dynamically pulled off-orbit.
   const orbitLiftFade = 1 - Math.min(1, pullGain * strength * 0.82);
   for (const b of bodies) {
    const dPlanet = b.root.position.distanceTo(sim.bhPos);
    const sweep = Math.exp(-Math.pow((dPlanet - waveR) / 22, 2));
    const lift = Math.sin((dPlanet - waveR) * 0.22) * sweep * 0.72 * strength;
    b.orbit.position.y = lift;
    b.ticks.position.y = lift;
    b.orbit.material.opacity *= orbitLiftFade;
   }

   dust?.setGravity?.({
    origin: sim.bhPos,
    waveR,
    phase: age * 2.2,
    strength
   });

   bloomBoost = strength * (0.14 + streamStrength * 0.12);
   rippleStrength = strength * 0.52;
  }
 }

 function dispose() {
  stop(false);
  scene.remove(root);
  root.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
 }

 return {
  start,
  stop,
  queue(id) { queued = id; },
  update,
  get active() { return active; },
  get overrideBodies() { return active === 'gravity' && !!sim; },
  get blackHolePosition() { return active === 'gravity' && sim ? sim.bhPos : null; },
  get liveDistanceAu() {
   if (active !== 'gravity' || !sim) return SINGULARITY.au;
   const d = sim.bhPos.distanceTo(sim.starPos);
   const ratio = THREE.MathUtils.clamp((d - 25) / 60, 0, 1);
   return +(3.2 + Math.pow(ratio, 2.2) * (SINGULARITY.au - 3.2)).toFixed(1);
  },
  get starDisplacement() { return active === 'gravity' && sim ? sim.starPos.length() : 0; },
  get bloomBoost() { return bloomBoost; },
  get rippleStrength() { return rippleStrength; },
  get gravityIntensity() { return gravityIntensity; },
  dispose
 };
}
