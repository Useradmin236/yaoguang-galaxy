// Late field notes (night lights, terminator, idle drift) and the "seventh star" egg.
// The watchers below are plain logic (no THREE, no DOM) so node tests can drive them
// with synthetic clocks; createEggs() wires them to the live scene. Unlocks go through
// the existing discovery tracker, so storage and counting stay in one place.
import {DRIFT,COARSE_POINTER} from './intro.js';
// Drift: 40 s on desktop (after 12 s idle); touch screens 16 s (after 8 s idle), under a 30 s auto-lock.
export const EGG_TIMING=Object.freeze({lamps:4,terminator:3,drift:COARSE_POINTER?16:40,taps:7,tapGap:1200,seventh:8});
export const LAMP_WORLDS=Object.freeze(['xunqi','qitang']);
const WATCHED=['lamps','terminator','drift'];

// Each condition must hold continuously for its dwell time; any gap restarts the clock.
export function createEggWatch({timing=EGG_TIMING,onFire=()=>{}}={}){
 const since={},fired={};
 return{
  update(now,flags={}){
   for(const key of WATCHED){
    if(!flags[key]){since[key]=null;fired[key]=false;continue;}
    if(since[key]==null)since[key]=now;
    if(!fired[key]&&now-since[key]>=timing[key]*1000){fired[key]=true;onFire(key);}
   }
  },
  reset(){for(const key of WATCHED){since[key]=null;fired[key]=false;}},
  // Test aid: pretend a running dwell started `seconds` earlier (equivalent to waiting).
  rewind(seconds){for(const key of WATCHED)if(since[key]!=null)since[key]-=seconds*1000;},
  held(now){return Object.fromEntries(WATCHED.map(k=>[k,since[k]==null?0:(now-since[k])/1000]));}
 };
}

// Seven taps, each within `gap` ms of the previous one; a disallowed tap breaks the streak.
export function createTapStreak({taps=EGG_TIMING.taps,gap=EGG_TIMING.tapGap}={}){
 let count=0,last=-Infinity;
 return{
  tap(now,allowed=true){
   if(!allowed){count=0;last=-Infinity;return false;}
   count=now-last<gap?count+1:1;last=now;
   if(count>=taps){count=0;last=-Infinity;return true;}
   return false;
  },
  get count(){return count;}
 };
}

// Big Dipper, mirrored to read naturally above the system: bowl on the left, handle ending at Alkaid.
export const DIPPER=Object.freeze([
 {name:'天枢',at:[-1,.30]},{name:'天璇',at:[-.98,-.12]},{name:'天玑',at:[-.55,-.22]},{name:'天权',at:[-.45,.14]},
 {name:'玉衡',at:[-.10,.20]},{name:'开阳',at:[.20,.18]},{name:'瑶光',at:[.58,.02]}
]);
export const DIPPER_EDGES=Object.freeze([[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]]);
const EDGES=DIPPER_EDGES;
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp01(v);return v*v*(3-2*v);};

function createSeventhSky(THREE,scene){
 const root=new THREE.Group();root.name='Seventh star';root.visible=false;root.renderOrder=4;scene.add(root);
 const shape=new THREE.Group();root.add(shape);
 const n=DIPPER.length,pos=[],size=[],delay=[],alk=[];
 DIPPER.forEach((s,i)=>{pos.push(s.at[0],s.at[1],0);size.push(i===n-1?13:9);delay.push(.15+i*.22);alk.push(i===n-1?1:0);});
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(pos,3))
  .setAttribute('size',new THREE.Float32BufferAttribute(size,1)).setAttribute('delay',new THREE.Float32BufferAttribute(delay,1)).setAttribute('alk',new THREE.Float32BufferAttribute(alk,1));
 const uniforms={uT:{value:0},uFade:{value:0},uPulse:{value:0},uDpr:{value:1}};
 const points=new THREE.Points(geometry,new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:'attribute float size,delay,alk;uniform float uT,uFade,uPulse,uDpr;varying float vA,vAlk;void main(){vA=clamp((uT-delay)/.5,0.,1.)*uFade;vAlk=alk;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*uDpr*(1.+alk*uPulse*1.3);}',
  // Alkaid shares the star's blue-white and runs above 1.0 so the HDR bloom catches it.
  fragmentShader:'uniform float uPulse;varying float vA,vAlk;void main(){float d=length(gl_PointCoord-.5);float core=1.-smoothstep(.04,.17,d),glow=1.-smoothstep(.08,.5,d);vec3 c=mix(vec3(.82,.88,1.),vec3(.58,.78,1.),vAlk)*(1.+vAlk*(.9+uPulse*1.8));gl_FragColor=vec4(c,vA*(core*.95+glow*.38));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));
 points.name='Seventh star points';points.frustumCulled=false;shape.add(points);
 const lineArray=new Float32Array(EDGES.length*6);
 const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(lineArray,3)),new THREE.LineBasicMaterial({color:0x9cc9e6,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
 lines.frustumCulled=false;shape.add(lines);
 const alkaid=DIPPER[n-1].at,ringPts=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;ringPts.push(new THREE.Vector3(Math.cos(a)*.07,Math.sin(a)*.07,0));}
 const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts),new THREE.LineBasicMaterial({color:0xb4d6ff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
 ring.position.set(alkaid[0],alkaid[1],0);ring.frustumCulled=false;shape.add(ring);
 let startAt=null;
 function stop(){startAt=null;root.visible=false;}
 return{
  root,points,
  get playing(){return startAt!==null;},
  start(camera,now,dpr=1){
   // Anchored like distant sky: upper part of the current view, behind the whole system.
   root.position.copy(camera.position);root.quaternion.copy(camera.quaternion);
   const k=Math.min(1,camera.aspect/1.25),scale=150*k;
   shape.position.set(50*k,190,-800);shape.scale.set(scale,scale,1);
   uniforms.uDpr.value=dpr;startAt=now;root.visible=true;
  },
  stop,
  update(now,camera,allowed){
   if(startAt===null)return;
   const t=(now-startAt)/1000;
   if(!allowed||t>=EGG_TIMING.seventh)return stop();
   root.visible=true;root.position.copy(camera.position);
   const fade=1-smooth((t-6.6)/1.4),pulse=t>3&&t<4.4?Math.sin(Math.PI*(t-3)/1.4):0;
   uniforms.uT.value=t;uniforms.uFade.value=fade;uniforms.uPulse.value=pulse;
   let drawn=0;
   EDGES.forEach(([a,b],k)=>{
    const f=clamp01((t-.9-k*.28)/.28),A=DIPPER[a].at,B=DIPPER[b].at;if(f>0)drawn=k+1;
    lineArray.set([A[0],A[1],0,A[0]+(B[0]-A[0])*f,A[1]+(B[1]-A[1])*f,0],k*6);
   });
   lines.geometry.attributes.position.needsUpdate=true;lines.geometry.setDrawRange(0,drawn*2);lines.material.opacity=.38*fade;
   const r=clamp01((t-3)/1.6);ring.visible=t>3&&t<4.6;ring.scale.setScalar(1+r*2.2);ring.material.opacity=.6*(1-r)*fade;
  },
  dispose(){scene.remove(root);root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 };
}

// Close-up yaw for journal replays (pure math, no camera). app.js builds a planet close-up as
//   dir = (planet→Alkaid, horizontal) rotated about +Y by yaw, dir.y = height, normalised;
//   camera = centre − right·offset·r + dir·distance·r (− up'·drop·r on phones).
// Returns the yaw that makes the planet→camera direction meet sunlight at cosine d, used as
// state.yawOverride in place of LOOK.closeYaw. side=+1 keeps Alkaid on the right of the frame,
// away from the title in the top-left corner.
export function closeYawFor({d=0,height=.36,distance=5.8,offset=1.12,drop=0,side=1}={}){
 const s=Math.hypot(1,height),along=(distance+drop*height)/s,flat=Math.hypot(along,offset),rise=(distance*height-drop)/s;
 const want=Math.acos(Math.max(-1,Math.min(1,d*Math.hypot(flat,rise)/flat)));
 return Math.atan2(offset,along)-side*want;
}
export function createEggs({THREE,scene,camera,controls,bodies,state,discoveries,skyEvents=null,navigate,toast=()=>{},reduced=null,journalSize=8,
 isTransitioning=()=>false,isDrifting=()=>false,pixelRatio=()=>1,closeRig=()=>({height:.36,distance:5.8,offset:1.12,drop:0}),idleMs=()=>DRIFT.idleMs}){
 const v=new THREE.Vector3(),l=new THREE.Vector3(),p=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 const watch=createEggWatch({onFire:id=>discoveries?.unlock(id)});
 const streak=createTapStreak();
 const sky=createSeventhSky(THREE,scene);
 let seventhButton=null;
 const bodyOf=id=>bodies.find(b=>b.def.id===id);
 // Camera-to-planet geometry: cosine between "planet → camera" and "planet → Alkaid", plus screen position.
 function view(b){
  v.copy(camera.position).sub(b.root.position);const dist=v.length();v.divideScalar(dist||1);
  l.copy(b.root.position).negate().normalize();p.copy(b.root.position).project(camera);
  return{dot:v.dot(l),dist,x:p.x,y:p.y,front:p.z>-1&&p.z<1};
 }
 function flags(now=performance.now()){
  const out={lamps:false,terminator:false,drift:false};
  if(typeof document!=='undefined'&&document.hidden)return out;
  if(state.mode==='planet'&&state.planet&&!isTransitioning()){
   const b=bodyOf(state.planet);
   if(b){
    const s=view(b),near=s.front&&s.dist<b.def.radius*12;
    // Lamps: camera well inside the night hemisphere, planet still in frame.
    if(LAMP_WORLDS.includes(b.def.id))out.lamps=near&&s.dot<-.25&&Math.abs(s.x)<.95&&Math.abs(s.y)<.95;
    // Terminator: view ⟂ sunlight (±11.5°), so the day/night line crosses the disc centre, kept near mid-screen.
    if(b.def.id==='lingxi')out.terminator=near&&Math.abs(s.dot)<.2&&Math.abs(s.x)<.6&&Math.abs(s.y)<.6;
   }
  }
  // Reduced motion never drifts; sitting still in the overview for the same idle time counts instead.
  out.drift=state.mode==='system'&&(isDrifting()||(!!reduced?.matches&&!isTransitioning()&&now-state.lastActivity>idleMs()));
  return out;
 }
 // Orbit the close-up rig (camera and target together) about the planet's vertical axis
 // until the view direction meets sunlight at cos = d. Used by journal replays.
 function frame(id,d){
  const b=bodyOf(id);if(!b||state.mode!=='planet'||state.planet!==id)return false;
  const c=b.root.position;v.copy(camera.position).sub(c);l.copy(c).negate().normalize();
  const horizontal=Math.hypot(v.x,v.z)/(v.length()||1),want=Math.acos(Math.max(-1,Math.min(1,d/Math.max(horizontal,1e-3))));
  // side=+1 puts Alkaid on the right of the frame, as closeYawFor() does.
  const lightAngle=Math.atan2(l.z,l.x),camAngle=Math.atan2(v.z,v.x),side=1;
  const delta=lightAngle+side*want-camAngle;
  // applyAxisAngle about +Y decreases atan2(z,x), hence the minus sign.
  camera.position.sub(c).applyAxisAngle(up,-delta).add(c);controls.target.sub(c).applyAxisAngle(up,-delta).add(c);
  controls.update();camera.updateMatrixWorld(true);return true;
 }
 function play(){
  if(skyEvents&&(skyEvents.active==='constellation'||skyEvents.active==='meteors'))skyEvents.stop();
  // Reduced motion: no constellation animation, only the line of text and the unlock.
  if(reduced?.matches)sky.stop();else sky.start(camera,performance.now(),pixelRatio());
  toast('北斗第七星，开阳之外，瑶光所在',EGG_TIMING.seventh*1000);
 }
 // Yaw (radians, replaces LOOK.closeYaw) for a close-up of `id` whose view meets sunlight at cosine d.
 function yawFor(id,d){const b=bodyOf(id),rig=closeRig();return closeYawFor({...rig,d,distance:rig.distance*(b?.def.ring?1.42:1)});}
 function replay(id){
  if(id==='seventh'){if(state.mode!=='system')navigate();play();return true;}
  // One flight straight to the night side / terminator: app.js focusCamera reads and clears state.yawOverride.
  if(id==='lamps'||id==='terminator'){const world=id==='lamps'?'xunqi':'lingxi';state.yawOverride=yawFor(world,id==='lamps'?-.62:0);navigate(world);return true;}
  if(id==='drift'){navigate();toast(reduced?.matches?'静候片刻，什么都不用做。':'松开手，静候片刻；镜头会自己漂流。',4000);return true;}
  return false;
 }
 function onTap(event){
  const hit=event.target instanceof Element&&event.target.closest('#home,#star-info,#title');if(!hit)return;
  // Capture phase: the mode is read before the button's own handler changes it.
  if(streak.tap(performance.now(),state.mode==='system'&&!isTransitioning())){play();discoveries?.unlock('seventh');}
 }
 // The running total lives in the journal (#journal-tally, discoveries.js); here only the earned replay button.
 function progress(s){
  if(!s)return;
  if(seventhButton)seventhButton.hidden=!s.unlocked.some(e=>e.id==='seventh');
 }
 const onVisibility=()=>{if(document.hidden)watch.reset();};
 if(typeof document!=='undefined'){
  // index.html is expected to link eggs.css; add it once if that link is not there yet.
  if(!document.querySelector('link[href$="eggs.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='eggs.css';document.head.append(link);}
  const actions=document.querySelector('#play-panel .sky-actions');
  if(actions){seventhButton=document.createElement('button');seventhButton.id='seventh-star';seventhButton.type='button';seventhButton.hidden=true;seventhButton.textContent='斗柄的尽头';
   seventhButton.onclick=()=>{const panel=document.getElementById('play-panel');if(panel&&!panel.hidden)document.getElementById('play-close')?.click();replay('seventh');};actions.append(seventhButton);}
  document.addEventListener('click',onTap,true);document.addEventListener('visibilitychange',onVisibility);
  if(discoveries)progress(discoveries.getState());
 }
 return{
  update(now){
   watch.update(now,flags(now));
   sky.update(now,camera,state.mode==='system');
  },
  progress,replay,frame,yawFor,play,
  rewind:seconds=>watch.rewind(seconds),
  held:()=>watch.held(performance.now()),
  get seventh(){return sky;},
  dispose(){sky.dispose();if(typeof document!=='undefined'){document.removeEventListener('click',onTap,true);document.removeEventListener('visibilitychange',onVisibility);seventhButton?.remove();}}
 };
}
