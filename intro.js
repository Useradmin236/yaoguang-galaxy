// C-tier narrative: the opening sequence and the idle camera drift.
// Both only touch objects handed in by app.js; nothing here owns scene state.

const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp01(v);return v*v*(3-2*v);};
const outCubic=v=>1-Math.pow(1-clamp01(v),3);
const outBack=v=>{v=clamp01(v);const c=1.35;return 1+(c+1)*Math.pow(v-1,3)+c*Math.pow(v-1,2);};
const span=(t,a,b)=>clamp01((t-a)/(b-a));

// Timeline in seconds from DefaultLoadingManager.onLoad.
export const INTRO_TIMING={
 duration:4.2,
 exposure:[.3,1.45],      // black field → Alkaid ignites
 star:[.3,1.5],           // star/corona swell from 40% to full size
 bloomPeak:1.3,bloomEnd:2.7,bloomGain:2.6,
 sky:[1.05,3.1],          // background and star field fade in after the star
 sweep:[1.15,2.7],        // light front crosses orbits inner → outer
 planetLag:.08,planetGrow:.8,
 belt:[2.3,3.5],
 hud:3.0,                 // HUD starts its .9s fade-in
 camera:[0,4.2],camYaw:.55,camScale:1.7,camLift:46
};

export function createIntro({THREE,scene,camera,controls,renderer,star,corona,halo,bodies,starField,belt,LOOK,skyIntensity,haloOpacity,onEnd}){
 const T=INTRO_TIMING;
 const order=[...bodies].sort((a,b)=>a.def.orbit-b.def.orbit);
 const starScale=star.scale.clone(),coronaScale=corona.scale.clone();
 const finalPos=new THREE.Vector3(),finalTarget=new THREE.Vector3(),offset=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
 let phase='idle',startAt=0,bloomGain=1,hudShown=false,wave=null,held=null;
 // seek(sec) freezes the timeline at `sec` (capture scripts); seek(null) resumes from there.
 const self={get phase(){return phase},get active(){return phase==='primed'||phase==='playing'},get bloomGain(){return bloomGain},prime,start,update,finish,
  seek(sec){if(phase!=='playing')return;if(sec===null){if(held!==null)startAt=performance.now()-held*1000;held=null;}else held=sec;}};

 function skip(){if(self.active)finish(true);}
 function listen(on){for(const type of ['pointerdown','wheel','keydown'])(on?addEventListener:removeEventListener)(type,skip,{capture:true});}
 function makeWave(){
  const pts=[];for(let i=0;i<=192;i++){const a=i/192*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a),0,Math.sin(a)));}
  const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xbfe0ff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  line.renderOrder=3;scene.add(line);return line;
 }
 function dark(){
  renderer.toneMappingExposure=0;scene.backgroundIntensity=0;
  if(starField)starField.material.uniforms.uFade.value=0;
  if(belt)belt.material.opacity=0;
  star.scale.copy(starScale).multiplyScalar(.4);corona.scale.copy(coronaScale).multiplyScalar(.4);halo.material.opacity=0;
  for(const b of bodies)b.root.scale.setScalar(.001);
 }
 function prime(){if(phase!=='idle')return;phase='primed';document.body.classList.add('intro');listen(true);dark();}
 function start(now){
  if(phase!=='primed')return;
  phase='playing';startAt=now;controls.enabled=false;
  finalPos.copy(camera.position);finalTarget.copy(controls.target);
  wave=makeWave();
 }
 // Called after updateLabels(), which rewrites orbit opacity every frame.
 function update(now){
  if(phase!=='playing')return;
  const t=held??(now-startAt)/1000;
  if(t>=T.duration)return finish(true);
  controls.enabled=false;
  const ignite=outCubic(span(t,...T.exposure));
  renderer.toneMappingExposure=LOOK.exposure*ignite;
  const s=.4+.6*outCubic(span(t,...T.star));star.scale.copy(starScale).multiplyScalar(s);corona.scale.copy(coronaScale).multiplyScalar(s);
  const flare=t<T.bloomPeak?smooth(span(t,T.exposure[0],T.bloomPeak)):1-smooth(span(t,T.bloomPeak,T.bloomEnd));
  bloomGain=1+(T.bloomGain-1)*flare;
  halo.material.opacity=haloOpacity()*(ignite+2.6*flare);
  const sky=smooth(span(t,...T.sky));scene.backgroundIntensity=skyIntensity()*sky;
  if(starField)starField.material.uniforms.uFade.value=sky;
  if(belt)belt.material.opacity=.28*smooth(span(t,...T.belt));
  // A light front travels out across the orbits; each one flashes then settles.
  const n=order.length,lead=1.3,front=span(t,...T.sweep)*(n-1+2*lead)-lead;
  order.forEach((b,i)=>{
   const lit=clamp01(front-i+.6),glow=Math.exp(-((front-i)**2)/.35);
   b.orbit.material.opacity=b.orbit.material.opacity*lit+LOOK.orbitOpacity*3.2*glow;
   const appear=T.sweep[0]+(T.sweep[1]-T.sweep[0])*(i+lead)/(n-1+2*lead)+T.planetLag;
   b.root.scale.setScalar(Math.max(.001,outBack(span(t,appear,appear+T.planetGrow))));
  });
  if(wave){
   const f=clamp01(front/(n-1)),k=f*(n-1),i=Math.min(n-2,Math.floor(k));
   const r=front<=0?THREE.MathUtils.lerp(6,order[0].def.orbit,clamp01(1+front/lead)):front>=n-1?order[n-1].def.orbit*(1+.08*(front-n+1)):THREE.MathUtils.lerp(order[i].def.orbit,order[i+1].def.orbit,k-i);
   wave.scale.setScalar(r);wave.material.opacity=.55*Math.sin(Math.PI*span(t,...T.sweep));
  }
  if(!hudShown&&t>=T.hud){hudShown=true;document.body.classList.remove('intro');}
  // Camera descends from higher, wider and slightly yawed onto the A-tier framing.
  const c=span(t,...T.camera),e=.5*smooth(c)+.5*outCubic(c);
  offset.copy(finalPos).sub(finalTarget).applyAxisAngle(up,T.camYaw*(1-e));
  const maxLen=controls.maxDistance*.95,scale=1+(T.camScale-1)*(1-e);
  offset.multiplyScalar(scale);offset.y+=T.camLift*(1-e);if(offset.length()>maxLen)offset.setLength(maxLen);
  camera.position.copy(finalTarget).add(offset);controls.target.copy(finalTarget);camera.lookAt(finalTarget);
 }
 // resetCamera=false when a navigation flight has already taken over.
 function finish(resetCamera=true){
  if(!self.active)return;
  const wasPlaying=phase==='playing';phase='done';listen(false);bloomGain=1;
  renderer.toneMappingExposure=LOOK.exposure;scene.backgroundIntensity=skyIntensity();
  if(starField)starField.material.uniforms.uFade.value=1;
  if(belt)belt.material.opacity=.28;
  star.scale.copy(starScale);corona.scale.copy(coronaScale);halo.material.opacity=haloOpacity();
  for(const b of bodies)b.root.scale.setScalar(1);
  if(wave){scene.remove(wave);wave.geometry.dispose();wave.material.dispose();wave=null;}
  document.body.classList.remove('intro');
  if(wasPlaying&&resetCamera){camera.position.copy(finalPos);controls.target.copy(finalTarget);camera.lookAt(finalTarget);}
  onEnd?.(resetCamera);
 }
 return self;
}

// Idle drift: a very slow orbit around the controls target with a gentle bob.
// Strength ramps in so the hand-off from stillness is invisible; stopping is
// instant but the velocity is tiny, so OrbitControls takes over without a jolt.
// Touch screens start sooner (8 s) so idle + the drift field note stays under a 30 s auto-lock;
// any touch still stops the drift at once.
export const COARSE_POINTER=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;
export const DRIFT={idleMs:COARSE_POINTER?8000:12000,rampS:3.5,yawRate:.016,bobAmp:3.2,bobPeriod:48};
export function createDrift({THREE,camera,controls}){
 const up=new THREE.Vector3(0,1,0),offset=new THREE.Vector3();
 let weight=0,clock=0,bob=0,active=false;
 return{
  get active(){return active},
  update(dt,on){
   if(!on){active=false;weight=0;clock=0;bob=0;return;}
   active=true;clock+=dt;weight=Math.min(1,weight+dt/DRIFT.rampS);
   const w=weight*weight*(3-2*weight);
   offset.copy(camera.position).sub(controls.target).applyAxisAngle(up,DRIFT.yawRate*w*dt);
   const next=DRIFT.bobAmp*w*Math.sin(clock*Math.PI*2/DRIFT.bobPeriod);offset.y+=next-bob;bob=next;
   camera.position.copy(controls.target).add(offset);
  }
 };
}
