import * as THREE from 'three';
import {LOOK} from './looks.js';

const noise=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(11.1,3.7,9.2);a*=.5;}return v;}
`;
const vertex=`varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;
void main(){vUv=uv;vLocal=position;vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;

// 1 while the HDR post-processing chain is active: star, corona and atmosphere
// output values above 1.0 so the bloom pass can pick them up. 0 for the direct
// LDR path, which keeps the original tone-mapped look.
export const hdrBoost={value:0};
const loader=new THREE.TextureLoader();
const textures={};
function texture(name,color=true){
 if(textures[name])return textures[name];
 const t=loader.load('./vendor/textures/'+name,()=>{},undefined,()=>{});t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=8;
 textures[name]=t;return t;
}
const maps=['2k_earth_daymap.webp','2k_jupiter.webp','2k_earth_daymap.webp','2k_moon.webp','2k_mercury.webp','2k_earth_daymap.webp','2k_venus_surface.webp'];

// Cloud density is shared between a planet's surface (cloud shadows) and its
// cloud shell, so the lab slider that writes clouds.uDensity also moves shadows.
const cloudDensity=new WeakMap();
function densityUniform(def){let u=cloudDensity.get(def);if(!u){u={value:def.cloud||0};cloudDensity.set(def,u);}return u;}
// Settlement lights per world kind: [strength, cluster threshold]. Kind 2 only
// gets a few sparse island points; worlds not listed stay dark.
const CITY={2:[.6,.66],5:[.85,.6],6:[.8,.62]};
// Shell radius / planet radius used by app.js for the atmosphere mesh.
const SHELL=1.035;
// Surface rotates at time*.015, clouds at time*.019 (app.js moveBodies).
const CLOUD_DRIFT=.004/(Math.PI*2);

const surfaceVertex=`uniform vec3 uLight;varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;varying vec3 vLightLocal;
void main(){vUv=uv;vLocal=position;vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;
vLightLocal=transpose(mat3(modelMatrix))*(uLight-vWorld);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;

export function surfaceMaterial(def, lightPosition){
 const custom=!!def.id;
 const hasCloud=custom&&!!(def.original?def.original.cloud:def.cloud);
 const city=custom&&CITY[def.kind]||[0,1];
 const relief=texture(custom?'worlds/'+def.id+'-relief.webp':'2k_moon.webp',false);
 const mat=new THREE.ShaderMaterial({uniforms:{uKind:{value:def.kind},uSeed:{value:def.seed||3},uLight:{value:lightPosition},uTime:{value:0},uCloud:densityUniform(def),uRing:{value:def.ring||0},uPalette:{value:new THREE.Vector3(...LOOK.palette)},uDiagram:{value:LOOK.diagram},uCustom:{value:custom?1:0},uRelief:{value:relief},uMap:{value:texture(custom?'worlds/'+def.id+'-albedo.webp':maps[def.kind]||maps[3])},uColor:{value:new THREE.Color(def.color||'#b5aaa0')},
  uHdr:hdrBoost,uClouds:{value:hasCloud?texture('worlds/'+def.id+'-clouds.webp',false):relief},uHasCloud:{value:hasCloud?1:0},uDrift:{value:CLOUD_DRIFT},
  uTint:{value:new THREE.Color(custom&&def.atmosphere||'#000000')},uAtmo:{value:custom&&def.atmosphere?1:0},uCity:{value:city[0]},uCityLo:{value:city[1]}},vertexShader:surfaceVertex,fragmentShader:`
precision highp float;
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;varying vec3 vLightLocal;
uniform sampler2D uMap,uRelief,uClouds;
uniform float uKind,uSeed,uTime,uCloud,uRing,uCustom,uDiagram,uHdr,uHasCloud,uDrift,uAtmo,uCity,uCityLo;uniform vec3 uLight,uColor,uPalette,uTint;
${noise}
// Sphere direction -> SphereGeometry uv (u from atan(z,-x), v=1-theta/pi).
vec2 sphereUv(vec3 d){return vec2(atan(d.z,-d.x)*.1591549,1.-acos(clamp(d.y,-1.,1.))*.3183099);}
// Terminator tint: violet just past the shadow line, warm just before it.
vec3 dusk(float sc){return mix(vec3(.42,.30,.85),vec3(1.,.50,.26),smoothstep(-.16,.08,sc));}
void main(){
vec3 p=normalize(vLocal);vec3 q=p*3.2+uSeed;
vec2 uv=vec2(vUv.x+uSeed*.031,vUv.y);vec3 photo=texture2D(uMap,uv).rgb;vec3 terrainData=texture2D(uRelief,uv).rgb;
// Retain authored geography, but soften pixel-scale coast/relief contrasts.
if(uCustom>.5){
 vec2 texel=vec2(1./2048.,1./1024.);
 vec3 nearby=(texture2D(uMap,uv+vec2(texel.x,0.)).rgb+texture2D(uMap,uv-vec2(texel.x,0.)).rgb+texture2D(uMap,uv+vec2(0.,texel.y)).rgb+texture2D(uMap,uv-vec2(0.,texel.y)).rgb)*.25;
 photo=mix(photo,nearby,.32);float lum=dot(photo,vec3(.2126,.7152,.0722));photo=mix(vec3(lum),photo,.88);
}
float continent=fbm(q);float fine=noise3(p*85.+uSeed);float mid=fbm(p*24.+uSeed);
vec3 color;float water=0.;float rough=.5;
if(uCustom>.5){color=photo;water=terrainData.g;}else if(uKind<.5){
 float land=smoothstep(.012,.06,photo.r);water=1.-land;
 float lum=dot(photo,vec3(.3,.6,.1));color=mix(photo*vec3(.65,1.25,1.1),vec3(.53,.60,.61)*sqrt(lum)*1.5,land);
}else if(uKind<1.5){
 float lum=dot(photo,vec3(.3,.6,.1));color=mix(photo*vec3(.84,.79,1.03),vec3(lum*.80,lum*.73,lum*.98),.45);
}else if(uKind<2.5){
 float land=smoothstep(.012,.07,photo.r);water=1.-land;
 vec3 sea=photo*vec3(.38,.64,1.0)+vec3(.002,.006,.017);
 color=mix(sea,photo*vec3(.60,.77,.73),land*.8);
}else if(uKind<3.5){
 color=photo*vec3(.79,.77,.73)*1.15;
}else if(uKind<4.5){
 float lum=dot(photo,vec3(.3,.6,.1));float veins=pow(1.-abs(sin(continent*31.+mid*3.)),14.);
 color=mix(vec3(.30,.39,.43),vec3(.81,.82,.77),smoothstep(.02,.42,lum));color-=veins*.032;
}else if(uKind<5.5){
 float land=smoothstep(.012,.06,photo.r);water=1.-land;color=mix(photo*vec3(.45,.8,.78),photo*vec3(.64,.91,.48),land);
}else{
 float lum=dot(photo,vec3(.3,.6,.1));color=mix(vec3(.13,.074,.060),vec3(.62,.37,.29),sqrt(lum));
}
vec3 N=normalize(vNormal);vec3 L=normalize(uLight-vWorld);vec3 V=normalize(cameraPosition-vWorld);
// Small-scale surface gradient; only rock/ice perturbs normal strongly.
// The baked height already flattens oceans. Multiplying by water here would
// create a discontinuity at every coastline and an exaggerated normal spike.
float height=terrainData.r;
vec3 dx=dFdx(vWorld),dy=dFdy(vWorld);vec3 r1=cross(dy,N),r2=cross(N,dx);float det=dot(dx,r1);
vec3 grad=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
if(abs(det)>.00000001)N=normalize(abs(det)*N-grad*.0028);
float dotLight=dot(N,L);float day=max(dotLight,0.);
float diffuse=pow(day,.82);
vec3 H=normalize(L+V);float fresnel=.028+.24*pow(1.-max(dot(N,V),0.),5.);float spec=pow(max(dot(N,H),0.),72.)*water*fresnel*.9;
float shadow=1.;
// Geometric approximation of rings casting a shadow over the surface.
if(uRing>.0){vec3 localL=normalize(vec3(L.x,L.y,L.z));float t=-p.y/(localL.y+.0001);vec3 hit=p+localL*t;float radius=length(hit.xz);shadow=1.-step(0.,t)*smoothstep(1.34,1.5,radius)*(1.-smoothstep(2.18,2.38,radius))*.38*uRing;}
float terminator=smoothstep(-.15,.22,dotLight);
// Cloud shadows: sample the cloud map where the ray towards the light pierces
// an (exaggerated) cloud altitude, in the cloud shell's rotated frame. The uv
// delta is wrapped so the atan seam does not break texture derivatives.
if(uHasCloud>.5){
 vec3 Ll=normalize(vLightLocal);float facing=dot(p,Ll);
 vec3 pc=normalize(p+Ll*(.03/max(facing,.18)));
 vec2 d=sphereUv(pc)-sphereUv(p);d.x=fract(d.x+.5)-.5;
 vec2 cuv=vec2(vUv.x+d.x-uTime*uDrift+uSeed*.067,vUv.y+d.y);
 float c=texture2D(uClouds,cuv,1.2).r;
 float cover=smoothstep(.16,.97,c)*min(uCloud*1.35,1.);
 shadow*=1.-cover*.62*smoothstep(-.05,.25,facing);
}
vec3 lit=color*(.032+diffuse*1.12*shadow)*vec3(.88,.96,1.06)+vec3(.66,.82,1.)*spec*terminator*shadow;
lit+=vec3(.0012,.0035,.006)*water*diffuse;
vec3 Ng=normalize(vNormal);float sc=dot(Ng,L);
// Settlement lights: clustered noise on land in the night hemisphere.
if(uCity>0.){
 float land=1.-smoothstep(.2,.55,terrainData.g);
 float night=1.-smoothstep(-.12,.07,sc);
 // Settlements favour coasts: a heavily mip-biased water lookup acts as a
 // cheap local water fraction, i.e. proximity to a shore.
 float shore=smoothstep(.03,.3,texture2D(uRelief,uv,4.5).g);
 float region=fbm(p*7.+uSeed*1.37)+shore*.12;
 float core=smoothstep(uCityLo,uCityLo+.12,region);
 float towns=noise3(p*46.+uSeed*2.1);
 float grain=noise3(p*170.-uSeed);
 float sharp=core*smoothstep(.45,.82,towns)*smoothstep(.55,.88,grain)*1.25+core*smoothstep(.66,.92,towns)*.22;
 // Far away the speckle aliases; fall back to a dim average glow.
 float detail=1.-smoothstep(.006,.03,length(fwidth(p)));
 float cityMask=mix(core*.04,sharp,detail)*land*night*uCity;
 lit+=vec3(1.,.62,.30)*cityMask*mix(.5,1.25,uHdr);
}
// Aerial perspective: the limb is seen through a long air column, so it
// picks up in-scattered sky light on the day side and loses some contrast.
if(uAtmo>.5){
 float mu=max(dot(Ng,V),0.);float airmass=1./(mu+.16);
 float haze=1.-exp(-airmass*.07);
 float sunlit=smoothstep(-.22,.45,sc);
 vec3 air=mix(uTint,dusk(sc)*dot(uTint,vec3(.3,.5,.2))*1.7,smoothstep(.35,.0,sc)*.65);
 lit=lit*(1.-haze*.28*sunlit)+air*haze*sunlit*mix(.42,.6,uHdr);
}
lit*=uPalette;
if(uDiagram>.5){
 float lum=dot(lit,vec3(.2126,.7152,.0722));lit=mix(lit,vec3(.52,.79,.98)*lum,.55);
 vec2 grid=abs(fract(vUv*vec2(24.,12.)-.5)-.5)/max(fwidth(vUv*vec2(24.,12.)),vec2(.0001));
 float line=1.-min(min(grid.x,grid.y),1.);lit+=vec3(.19,.36,.48)*line*.24*(.18+diffuse);
}
gl_FragColor=vec4(lit,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});return mat;
}

export function cloudMaterial(def, lightPosition){return new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uSeed:{value:def.seed},uDensity:densityUniform(def),uLight:{value:lightPosition},uMap:{value:texture('worlds/'+def.id+'-clouds.webp',false)}},vertexShader:vertex,fragmentShader:`
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;uniform float uSeed,uDensity;uniform vec3 uLight;uniform sampler2D uMap;
${noise}
void main(){float c=texture2D(uMap,vec2(vUv.x+uSeed*.067,vUv.y)).r;float alpha=smoothstep(.16,.97,c)*min(uDensity*1.35,1.);float light=max(dot(normalize(vNormal),normalize(uLight-vWorld)),0.);gl_FragColor=vec4(vec3(.82,.88,.95)*(.025+light*1.08),alpha*.62);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});}

// Single-scattering approximation along the view ray through the shell:
// exponential density, per-sample sunlight with a soft planet shadow, Rayleigh
// phase plus a little forward (Mie) lobe. Day side gives a bright tinted limb,
// the terminator shifts warm/violet, the night side fades to nothing.
const atmosphereVertex=`varying vec3 vWorld;varying vec3 vCenter;varying float vRadius;
void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;vCenter=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;vRadius=length(modelMatrix[0].xyz);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
export function atmosphereMaterial(color,lightPosition,shell=SHELL){return new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTint:{value:new THREE.Color(color)},uLight:{value:lightPosition},uHdr:hdrBoost,uShell:{value:shell}},vertexShader:atmosphereVertex,fragmentShader:`
varying vec3 vWorld;varying vec3 vCenter;varying float vRadius;uniform vec3 uTint,uLight;uniform float uHdr,uShell;
void main(){
 vec3 ro=cameraPosition,rd=normalize(vWorld-ro),oc=ro-vCenter;
 float Ra=vRadius,Rp=Ra/uShell,shell=Ra-Rp;
 float b=dot(oc,rd),c=dot(oc,oc);
 float h=b*b-(c-Ra*Ra);if(h<=0.)discard;h=sqrt(h);
 float t0=max(-b-h,0.),t1=-b+h;
 float hp=b*b-(c-Rp*Rp);if(hp>0.){float tp=-b-sqrt(hp);if(tp>0.)t1=min(t1,tp);}
 vec3 L=normalize(uLight-vCenter);
 float dt=(t1-t0)/10.;vec3 day=vec3(0.);vec3 edge=vec3(0.);
 for(int i=0;i<10;i++){
  vec3 s=oc+rd*(t0+(float(i)+.5)*dt);float r=length(s);
  float dens=exp(-clamp((r-Rp)/shell,0.,1.)*3.2);
  float sc=dot(s/r,L);
  float sun=smoothstep(-.24,.12,sc);
  float warm=smoothstep(.4,.02,sc);
  day+=dens*sun*(1.-warm*.7)*dt;
  edge+=dens*sun*warm*mix(vec3(.42,.30,.85),vec3(1.,.50,.26),smoothstep(-.16,.08,sc))*dt;
 }
 // Normalise so the tangent ray at the limb integrates to ~1.
 float norm=1./(Ra*.42);
 float mu=dot(rd,L);
 float phase=.75*(1.+mu*mu)+.35*pow(max(mu,0.),8.);
 float lum=dot(uTint,vec3(.3,.5,.2));
 vec3 col=(uTint*day+edge*lum*1.5)*norm*phase;
 col=col*mix(.95,1.55,uHdr);
 // Soft knee keeps the LDR path inside display range without a hard clip.
 col=mix(col/(1.+col*.6),col,uHdr);
 gl_FragColor=vec4(col,1.);
#include <colorspace_fragment>
}`});}

export function ringMaterial(radius,strength,lightPosition){return new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,uniforms:{uRadius:{value:radius},uStrength:{value:strength},uLight:{value:lightPosition},uCenter:{value:new THREE.Vector3()},uMap:{value:texture('2k_saturn_ring_alpha.webp')}},vertexShader:vertex,fragmentShader:`
varying vec3 vLocal;varying vec3 vWorld;varying vec3 vNormal;uniform float uRadius,uStrength;uniform vec3 uLight,uCenter;uniform sampler2D uMap;
void main(){float r=length(vLocal.xy)/uRadius;vec4 ring=texture2D(uMap,vec2((r-1.28)/1.15,.5));float bands=.5+.5*sin(r*172.+sin(r*31.)*3.);float fine=.5+.5*sin(r*611.);float alpha=(.2+ring.a*.7)*uStrength;
alpha*=smoothstep(1.28,1.43,r)*(1.-smoothstep(2.28,2.43,r));alpha*=1.-.92*exp(-pow((r-1.91)*66.,2.));alpha*=1.-.5*exp(-pow((r-2.15)*95.,2.));
vec3 toLight=normalize(uLight-vWorld);vec3 rel=vWorld-uCenter;float t=dot(-rel,toLight);float closest=length(rel+toLight*max(t,0.));float shadow=mix(.07,1.,smoothstep(uRadius*.96,uRadius*1.035,closest));
vec3 color=ring.rgb*.77+vec3(.10,.105,.105);float light=.45+.55*abs(dot(normalize(vNormal),toLight));gl_FragColor=vec4(color*light*shadow,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});}

export function starMaterial(){return new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uHdr:hdrBoost},vertexShader:vertex,fragmentShader:`varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;uniform float uTime,uHdr;${noise}
void main(){
 vec3 p=normalize(vLocal);float t=uTime*.009;
 // A B-type photosphere reads as blue-white light. Broad cloud-shaped
 // contrast would instead make it resemble another cool planetary surface.
 vec3 drift=vec3(t,-t*.28,t*.17);
 vec3 flow=vec3(noise3(p*4.+drift),noise3(p*4.+drift+17.),noise3(p*4.+drift-11.))-.5;
 vec3 q=p+flow*.065;
 float cells=noise3(q*52.+drift*1.7);
 float fine=noise3(q*113.-drift*.6);
 float currents=fbm(q*12.+drift*.4);
 float detail=1.-smoothstep(.018,.065,max(length(dFdx(p)),length(dFdy(p))));
 float textureLight=(cells-.5)*.17+(fine-.5)*.045;
 float mu=max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);
 float limb=pow(mu,.72);
 vec3 color=mix(vec3(.07,.28,.78),vec3(.37,.78,1.50),limb);
 color*=.96+((currents-.5)*.22+textureLight*detail)*mix(1.,2.1,uHdr);
 float brightCell=smoothstep(.54,.76,cells)*detail;
 color+=vec3(.025,.04,.055)*brightCell*limb;
 // HDR path: the photosphere exceeds 1.0 so the bloom pass turns the disc
 // into a light source; tone mapping happens later in the output pass.
 color*=mix(1.,1.3,uHdr);
 gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});}

export function coronaMaterial(){return new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uHdr:hdrBoost},vertexShader:vertex,fragmentShader:`
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;uniform float uTime,uHdr;${noise}
void main(){
 vec3 p=normalize(vLocal),viewDirection=normalize(vWorld-cameraPosition);
 // Distance to the actual oblate photosphere in ray space keeps the inner
 // corona attached to the limb from every camera angle, including close-up.
 vec3 radii=vec3(5.1,4.85,5.1);
 vec3 origin=cameraPosition/radii,ray=viewDirection/radii;
 float nearest=-dot(origin,ray)/dot(ray,ray);
 float altitude=max(length(origin+ray*nearest)-1.,0.);
 float mu=abs(dot(normalize(vNormal),-viewDirection));
 float veil=fbm(p*9.+vec3(uTime*.007,0.,0.));
 float filaments=.83+smoothstep(.30,.68,veil)*.17;
 float inner=exp(-altitude*36.);
 float outer=exp(-altitude*15.);
 float fade=smoothstep(0.,.21,mu);
 vec3 tint=mix(vec3(.07,.31,.74),vec3(.38,.69,1.),inner)*mix(1.,1.5,uHdr);
 // Small prominences: ridged noise loops hugging the limb, drifting slowly.
 float ridge=1.-abs(noise3(p*6.+vec3(0.,uTime*.004,uTime*.002))*2.-1.);
 float loops=pow(ridge,5.)*smoothstep(.45,.75,noise3(p*2.3-uTime*.0015));
 float prom=loops*exp(-altitude*16.)*(1.-exp(-altitude*70.));
 tint+=vec3(.30,.36,.62)*prom*mix(.8,1.3,uHdr);
 gl_FragColor=vec4(tint,(inner*.46+outer*.12+prom*.24)*fade*filaments);
#include <colorspace_fragment>
}`});}
