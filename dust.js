// Parallax dust and nebula layers (B tier).
//   createDust({THREE,scene,LOOK,seeded}) -> {update({camera,mode,dt,time,sky})}
// Three additive Points layers in a shell between the outer planets and the
// background star sphere (r 150-320, stars sit at 350-510). Each layer drifts
// at its own very slow rate, so camera motion and drift produce parallax.
// Colours are stored linear (light values are linear; hue squared as a cheap
// sRGB->linear) and pass through the renderer's tone mapping /
// colour space chunks, like the background stars.

function palette(LOOK){
 if(LOOK.diagram)return{dust:[.55,.78,.95],cloud:[.30,.55,.78],accent:[.45,.70,.90],gain:.55};
 if(/nebula/.test(LOOK.sky||''))return{dust:[.80,.70,1.0],cloud:[.62,.38,.92],accent:[.95,.52,.80],gain:1.15};
 if(LOOK.starTint&&LOOK.starTint[2]<.95)return{dust:[1.0,.86,.70],cloud:[.85,.60,.42],accent:[.62,.70,.85],gain:.85};
 return{dust:[.70,.84,1.0],cloud:[.34,.52,.90],accent:[.52,.42,.86],gain:1};
}

const vertexShader=`attribute float size;attribute float seed;uniform float uScale,uMaxSize,uTime;varying vec3 vColor;varying float vSeed;varying float vFade;
void main(){vColor=color;vSeed=seed;vec4 mv=modelViewMatrix*vec4(position,1.);
float px=size*uScale/max(-mv.z,1.);
// Sub-pixel points flicker or vanish; keep >=1.4px and fade them instead.
vFade=clamp(px/1.4,0.,1.);gl_PointSize=clamp(px,1.4,uMaxSize);
gl_Position=projectionMatrix*mv;}`;
const motes=`uniform float uOpacity,uTime;varying vec3 vColor;varying float vSeed;varying float vFade;
void main(){float d=length(gl_PointCoord-.5);float a=1.-smoothstep(.0,.5,d);a*=a;
float tw=.78+.22*sin(uTime*.35+vSeed*40.);
gl_FragColor=vec4(vColor*tw,a*uOpacity*vFade);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
// Soft, lumpy nebula fragments: a radial falloff broken up by cheap value noise.
const wisps=`uniform float uOpacity,uTime;varying vec3 vColor;varying float vSeed;varying float vFade;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 q=gl_PointCoord-.5;float ang=vSeed*6.2832;q=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*q;
// Stretched and noise-eroded so fragments read as wisps rather than round blobs.
float d=length(q*vec2(1.,2.4))*2.;if(d>1.)discard;
vec2 o=vec2(vSeed*17.,vSeed*31.)+uTime*.004;
float lump=n(q*vec2(2.6,5.)+o)*.6+n(q*9.+o*1.7)*.4;
float a=pow(1.-d,1.3)*smoothstep(.36,.82,lump);
gl_FragColor=vec4(vColor,a*uOpacity*vFade);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export function createDust({THREE,scene,LOOK,seeded}){
 const tone=palette(LOOK);
 const bandNormal=new THREE.Vector3(.24,.87,.43).normalize();
 const band=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),bandNormal);
 const layers=[];
 // count, radius range, size, brightness, flatten toward the galactic band, drift rate, shader, max px
 const specs=[
  {count:1400,r:[150,215],size:[.45,1.1],light:[.1,.55],flat:.3,drift:.0016,frag:motes,max:3.6,opacity:.75,colors:['dust','dust','accent']},
  {count:1300,r:[215,320],size:[.6,1.4],light:[.08,.36],flat:.2,drift:-.0009,frag:motes,max:2.8,opacity:.7,colors:['dust','cloud']},
  {count:280,r:[175,310],size:[14,34],light:[.06,.15],flat:.45,drift:.0005,frag:wisps,max:150,opacity:.55,colors:['cloud','cloud','accent']}
 ];
 specs.forEach((s,index)=>{
  const rand=seeded(4401+index*97),pos=[],col=[],size=[],seed=[];
  for(let i=0;i<s.count;i++){
   const a=rand()*Math.PI*2;
   // Mix of a uniform shell and a band-concentrated population.
   const z=rand()<s.flat?(rand()+rand()+rand()-1.5)*.32:rand()*2-1;
   const r=s.r[0]+(s.r[1]-s.r[0])*Math.pow(rand(),.8),w=Math.sqrt(Math.max(0,1-z*z));
   const v=new THREE.Vector3(Math.cos(a)*w*r,z*r,Math.sin(a)*w*r).applyQuaternion(band);pos.push(v.x,v.y,v.z);
   const c=tone[s.colors[Math.floor(rand()*s.colors.length)]],l=(s.light[0]+(s.light[1]-s.light[0])*Math.pow(rand(),2))*tone.gain;
   col.push(c[0]*c[0]*l,c[1]*c[1]*l,c[2]*c[2]*l);
   size.push(s.size[0]+(s.size[1]-s.size[0])*Math.pow(rand(),2.5));seed.push(rand());
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('size',new THREE.Float32BufferAttribute(size,1));g.setAttribute('seed',new THREE.Float32BufferAttribute(seed,1));
  const uniforms={uOpacity:{value:0},uScale:{value:500},uMaxSize:{value:s.max},uTime:{value:0}};
  const mat=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader:s.frag,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(g,mat);points.frustumCulled=false;points.renderOrder=-1;scene.add(points);
  layers.push({points,uniforms,spec:s});
 });
 let fade=1;
 return{
  layers,
  update({camera,mode,dt=0,time=0,sky=1}){
   const target=mode==='system'?1:.3;
   fade+=(target-fade)*(1-Math.exp(-(dt||1/30)*1.6));
   const ratio=Math.min(globalThis.devicePixelRatio||1,1.5);
   // Pixel size of one world unit at distance 1, so sizes stay perspective-correct.
   const scale=(globalThis.innerHeight||960)*ratio*.5*(camera?.projectionMatrix?.elements?.[5]||2.75);
   const strength=Math.max(0,Math.min(sky,1.8))*fade;
   for(const l of layers){
    l.uniforms.uScale.value=scale;l.uniforms.uTime.value=time;
    l.uniforms.uOpacity.value=l.spec.opacity*strength;
    l.points.visible=strength>.002;
    l.points.rotation.y=time*l.spec.drift;
   }
  }
 };
}
