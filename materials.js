import * as THREE from 'three';
import {LOOK} from './looks.js';

const noise=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(11.1,3.7,9.2);a*=.5;}return v;}
`;
const vertex=`varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;
void main(){vUv=uv;vLocal=position;vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;

const loader=new THREE.TextureLoader();
const textures={};
function texture(name,color=true){
 if(textures[name])return textures[name];
 const t=loader.load('./vendor/textures/'+name,()=>{},undefined,()=>{});t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=8;
 textures[name]=t;return t;
}
const maps=['2k_earth_daymap.webp','2k_jupiter.webp','2k_earth_daymap.webp','2k_moon.webp','2k_mercury.webp','2k_earth_daymap.webp','2k_venus_surface.webp'];

export function surfaceMaterial(def, lightPosition){
 const custom=!!def.id;
 const mat=new THREE.ShaderMaterial({uniforms:{uKind:{value:def.kind},uSeed:{value:def.seed||3},uLight:{value:lightPosition},uTime:{value:0},uCloud:{value:def.cloud||0},uRing:{value:def.ring||0},uPalette:{value:new THREE.Vector3(...LOOK.palette)},uDiagram:{value:LOOK.diagram},uCustom:{value:custom?1:0},uRelief:{value:texture(custom?'worlds/'+def.id+'-relief.webp':'2k_moon.webp',false)},uMap:{value:texture(custom?'worlds/'+def.id+'-albedo.webp':maps[def.kind]||maps[3])},uColor:{value:new THREE.Color(def.color||'#b5aaa0')}},vertexShader:vertex,fragmentShader:`
precision highp float;
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;
uniform sampler2D uMap,uRelief;
uniform float uKind,uSeed,uTime,uCloud,uRing,uCustom,uDiagram;uniform vec3 uLight,uColor,uPalette;
${noise}
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
vec3 lit=color*(.032+diffuse*1.12*shadow)*vec3(.88,.96,1.06)+vec3(.66,.82,1.)*spec*terminator;
lit+=vec3(.0012,.0035,.006)*water*diffuse;
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

export function cloudMaterial(def, lightPosition){return new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uSeed:{value:def.seed},uDensity:{value:def.cloud},uLight:{value:lightPosition},uMap:{value:texture('worlds/'+def.id+'-clouds.webp',false)}},vertexShader:vertex,fragmentShader:`
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUv;uniform float uSeed,uDensity;uniform vec3 uLight;uniform sampler2D uMap;
${noise}
void main(){float c=texture2D(uMap,vec2(vUv.x+uSeed*.067,vUv.y)).r;float alpha=smoothstep(.16,.97,c)*min(uDensity*1.35,1.);float light=max(dot(normalize(vNormal),normalize(uLight-vWorld)),0.);gl_FragColor=vec4(vec3(.82,.88,.95)*(.025+light*1.08),alpha*.62);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});}

export function atmosphereMaterial(color,lightPosition){return new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTint:{value:new THREE.Color(color)},uLight:{value:lightPosition}},vertexShader:vertex,fragmentShader:`
varying vec3 vNormal;varying vec3 vWorld;uniform vec3 uTint,uLight;
void main(){vec3 N=normalize(vNormal);vec3 V=normalize(cameraPosition-vWorld);float rim=pow(1.-abs(dot(N,V)),4.2);float sun=dot(N,normalize(uLight-vWorld));float amount=rim*(.03+smoothstep(-.35,.6,sun)*.62);gl_FragColor=vec4(uTint,amount);
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

export function starMaterial(){return new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:vertex,fragmentShader:`varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;uniform float uTime;${noise}
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
 color*=.96+(currents-.5)*.22+textureLight*detail;
 float brightCell=smoothstep(.54,.76,cells)*detail;
 color+=vec3(.025,.04,.055)*brightCell*limb;
 gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});}

export function coronaMaterial(){return new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0}},vertexShader:vertex,fragmentShader:`
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;uniform float uTime;${noise}
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
 vec3 tint=mix(vec3(.07,.31,.74),vec3(.38,.69,1.),inner);
 gl_FragColor=vec4(tint,(inner*.46+outer*.12)*fade*filaments);
#include <colorspace_fragment>
}`});}
