// Small stories earned by looking around. Progress is local; no account or network.
export const DISCOVERY_STORAGE_KEY='alkaid-observations-v1';
export const DISCOVERIES=Object.freeze([
 {id:'tides',number:'01',title:'同一片潮声',hint:'聆汐的两轮月亮，总是分别看见另一半海。',body:'你从望舒飞到既白。两轮月亮的引力在深海相逢，潮汐里多出一声极轻的回响：「海的两岸，都有人仰望。」',after:'已收录 · 双月之间的回声',color:0x79cfec},
 {id:'voyager',number:'02',title:'远航者的留笺',hint:'最外圈的航标，为走过每一颗行星的人保留一盏灯。',body:'六条轨道都留下了你的来访记录。外缘航标亮起，传来一张没有署名的留笺：「如果你已走遍这里，就把第七个坐标留给明天。」',after:'已收录 · 六颗行星的来访印记',color:0xc6dbb6},
 {id:'still-comet',number:'03',title:'把一瞬留下',hint:'有些漫长的旅途，只有让时间停下时才能被读懂。',body:'彗星停在蓝白色的光里。细长离子尾与弯曲尘埃尾之间，浮出几颗早已熄灭的尘埃；那是它上一回经过这里时，留下的星光。',after:'已收录 · 停驻的彗尾',color:0x9aaeea},
 {id:'old-signal',number:'04',title:'冰下的来信',hint:'素霰的卫星小传里，三段刻痕讲述着一件尚未结束的事。',body:'你循着「叩门、聆听、作答」的刻痕穿过冰卫星。一段信号终于连成句子：「收到。我们将在春天抵达。」这里没有春天，航标却仍为他们亮着。',after:'已收录 · 三段刻痕拼成的来信',color:0xbddde0}
]);
const DEFAULT_WORLDS=[{id:'jixi',name:'霁晞',moons:1},{id:'mingai',name:'暝霭',moons:3},{id:'lingxi',name:'聆汐',moons:2},{id:'suxian',name:'素霰',moons:5},{id:'xunqi',name:'浔萋',moons:1},{id:'qitang',name:'栖棠',moons:2}];

function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function createDiscoveryTracker({storage=browserStorage(),onUnlock=()=>{},onChange=()=>{},planets=DEFAULT_WORLDS}={}){
 const worlds=new Map(planets.map(p=>[p.id,Array.isArray(p.moons)?p.moons.length:p.moons]));
 const visited=new Set(),moons=new Set(),unlocked=new Map();
 let storageAvailable=!!storage,signalTrail=[],lastPlanet=null,cometDwell=0;
 const validMoon=key=>{if(typeof key!=='string')return false;const [id,index]=key.split(':');return worlds.has(id)&&/^\d+$/.test(index)&&Number(index)<worlds.get(id);};
 try{
  const saved=JSON.parse(storage?.getItem(DISCOVERY_STORAGE_KEY)||'null');
  if(saved&&typeof saved==='object'){
   for(const id of Array.isArray(saved.visited)?saved.visited:[])if(worlds.has(id))visited.add(id);
   for(const key of Array.isArray(saved.moons)?saved.moons:[])if(validMoon(key))moons.add(key);
   for(const entry of Array.isArray(saved.unlocked)?saved.unlocked:[]){
    if(DISCOVERIES.some(d=>d.id===entry?.id)&&typeof entry.at==='number'&&Number.isFinite(entry.at)&&entry.at>0)unlocked.set(entry.id,entry.at);
   }
  }
 }catch{storageAvailable=false;/* An old or damaged journal starts clean; navigation remains usable. */}
 const getState=()=>({version:1,visited:[...visited],moons:[...moons],unlocked:[...unlocked].map(([id,at])=>({id,at})),storageAvailable});
 function save(){try{if(!storage)throw Error('No local storage');storage.setItem(DISCOVERY_STORAGE_KEY,JSON.stringify(getState()));storageAvailable=true;}catch{storageAvailable=false;}}
 function unlock(id){
  if(unlocked.has(id))return;
  const discovery=DISCOVERIES.find(d=>d.id===id);if(!discovery)return;
  unlocked.set(id,Date.now());save();onUnlock(discovery);onChange(getState());
 }
 function visit(planet,moon=null){
  const id=typeof planet==='string'?planet:planet?.id;
  if(!worlds.has(id)||(moon!==null&&(!Number.isInteger(moon)||moon<0||moon>=worlds.get(id))))return;
  if(lastPlanet!==id)signalTrail=[];
  lastPlanet=id;
  let changed=!visited.has(id);visited.add(id);
  if(moon!==null){
   const key=`${id}:${moon}`;changed||=!moons.has(key);moons.add(key);
   if(id==='suxian'&&signalTrail.at(-1)!==moon){
    signalTrail.push(moon);signalTrail=signalTrail.slice(-3);
    if(signalTrail.join(',')==='2,1,4')unlock('old-signal');
   }
  }
  if(moons.has('lingxi:0')&&moons.has('lingxi:1'))unlock('tides');
  if(visited.size===worlds.size)unlock('voyager');
  if(changed){save();onChange(getState());}
 }
 function update({dt=0,mode,paused=false,cometVisible=false}={}){
  if(unlocked.has('still-comet'))return;
  if(mode==='system'&&paused&&cometVisible){
   cometDwell+=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;
   if(cometDwell>=1.6)unlock('still-comet');
  }else cometDwell=0;
 }
 return {visit,update,getState};
}

function createBoundaryLights(THREE,scene){
 if(!THREE||!scene)return null;
 const group=new THREE.Group();group.name='Outer navigation beacons';
 const positions=[],strokes=[];
 // Sparse broken ellipses read as old navigation marks, not another orbit.
 for(let i=0;i<12;i++){
  const angle=i*Math.PI/6+.18,r=89+(i%3)*2.3,y=(i%2?.8:-.8);
  const x=Math.cos(angle)*r,z=Math.sin(angle)*r;positions.push(x,y,z);
  for(let j=0;j<7;j++){
   const a=angle-.016+j*.004,b=a+.0025;
   strokes.push(Math.cos(a)*(r+1.8),y,Math.sin(a)*(r+1.8),Math.cos(b)*(r+1.8),y,Math.sin(b)*(r+1.8));
  }
 }
 const points=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.PointsMaterial({color:0xb4d2df,size:1.8,sizeAttenuation:false,transparent:true,opacity:.42,depthWrite:false}));
 const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(strokes,3)),new THREE.LineBasicMaterial({color:0x7fa4ba,transparent:true,opacity:.19,depthWrite:false}));
 group.add(points,lines);scene.add(group);
 // A single arc becomes visible briefly after a discovery.
 const arc=[];for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;arc.push(Math.cos(a)*89,0,Math.sin(a)*89);}
 const echo=new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(arc,3)),new THREE.LineBasicMaterial({color:0xa5d8e6,transparent:true,opacity:0,depthWrite:false}));
 group.add(echo);echo.visible=false;
 let flare=0;
 return {
  respond(color){flare=7;echo.material.color.setHex(color);},
  update({dt=0,time=0,mode,sky=1,reducedMotion=false,paused=false}){
   if(mode==='system')flare=Math.max(0,flare-Math.max(0,Math.min(.25,dt)));
   group.visible=mode==='system'&&sky>0;
   const light=Math.min(1.4,Math.max(0,sky));
   points.material.opacity=(.34+(reducedMotion||paused?0:.07*Math.sin(time*.32)))*light;
   lines.material.opacity=.16*light;
   echo.visible=flare>0&&mode==='system';
   echo.material.opacity=Math.min(.25,flare*.07)*light;
   echo.scale.setScalar(reducedMotion?1:1+(7-flare)*.002);
  },
  dispose(){scene.remove(group);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 };
}

export function createDiscoveries({THREE,scene,planets=DEFAULT_WORLDS,onDiscovery=()=>{},onReplay=null,storage=browserStorage()}={}){
 const lights=createBoundaryLights(THREE,scene);
 let journal=null,toggle=null,notice=null,noticeTimer,returnFocus=null,disposed=false;
 const tracker=createDiscoveryTracker({storage,planets,onChange:renderJournal,onUnlock:d=>{
  lights?.respond(d.color);announce(d);onDiscovery(d);
 }});
 function renderJournal(){
  if(!journal)return;
  const state=tracker.getState();
  toggle.querySelector('.journal-count').textContent=String(state.unlocked.length).padStart(2,'0');
  toggle.setAttribute('aria-label',`观测手记，已收录 ${state.unlocked.length} 则发现`);
  journal.querySelector('#journal-progress').textContent=`${state.unlocked.length} / ${DISCOVERIES.length}`;
  journal.querySelector('#journal-storage').textContent=state.storageAvailable?'手记保存在当前浏览器。下次回来，可以接着探索。':'当前浏览器无法保存手记；本次发现仍可查看。';
  for(const p of planets){const mark=journal.querySelector(`[data-world="${p.id}"]`);if(mark){mark.dataset.visited=String(state.visited.includes(p.id));mark.title=state.visited.includes(p.id)?`已到访${p.name}`:`尚未到访${p.name}`;mark.setAttribute('aria-label',mark.title);}}
  for(const discovery of DISCOVERIES){
   const row=journal.querySelector(`[data-discovery="${discovery.id}"]`),found=state.unlocked.some(e=>e.id===discovery.id);
   row.dataset.unlocked=String(found);row.querySelector('h3').textContent=found?discovery.title:'未写下的故事';
   row.querySelector('.journal-story').textContent=found?discovery.body:discovery.hint;
   row.querySelector('.journal-status').textContent=found?discovery.after:'线索 · 等待一次发现';
   const replay=row.querySelector('.journal-replay');if(replay)replay.hidden=!found;
  }
 }
 function open(){
  if(!journal||journal.open)return;
  returnFocus=document.activeElement;renderJournal();
  if(document.body.classList.contains('clean'))document.getElementById('clean')?.click();
  const lab=document.getElementById('play-panel');if(lab&&!lab.hidden)document.getElementById('play-close')?.click();
  toggle.setAttribute('aria-expanded','true');journal.showModal();
  journal.querySelector('#journal-close').focus({preventScroll:true});
 }
 function close(){if(journal?.open)journal.close();}
 function onKey(event){if(journal?.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}}
 function announce(discovery){
  if(!notice)return;
  clearTimeout(noticeTimer);notice.querySelector('strong').textContent=discovery.title;
  notice.setAttribute('aria-label',`阅读新发现：${discovery.title}`);
  notice.querySelector('span').textContent='一则新手记，已为你留下。';notice.hidden=false;
  toggle.dataset.unread='true';
  noticeTimer=setTimeout(()=>{notice.hidden=true;},6500);
 }
 if(typeof document!=='undefined'){
  toggle=document.createElement('button');toggle.id='journal-toggle';toggle.type='button';
  toggle.setAttribute('aria-controls','observation-journal');toggle.setAttribute('aria-expanded','false');
  toggle.innerHTML='<span class="journal-icon" aria-hidden="true">✧</span><span>观测手记</span><span class="journal-count" aria-hidden="true">00</span>';
  journal=document.createElement('dialog');journal.id='observation-journal';journal.setAttribute('aria-labelledby','journal-title');
  journal.innerHTML='<div class="journal-heading"><div><p class="journal-kicker">ALKAID · FIELD NOTES</p><h2 id="journal-title">在星海里，留下片刻</h2></div><button id="journal-close" type="button" aria-label="关闭观测手记">×</button></div><p class="journal-intro">不必急着找到所有答案。走近星球，听一段潮声，或等一次偶遇。</p><div class="journal-summary"><span>已收录的发现</span><strong id="journal-progress">0 / 4</strong></div><div id="journal-voyage" aria-label="行星来访记录"></div><div id="journal-entries"></div><p id="journal-storage"></p><button id="journal-return" type="button">继续探索 <span aria-hidden="true">↗</span></button>';
  for(const p of planets){const mark=document.createElement('span');mark.dataset.world=p.id;mark.textContent=p.name;journal.querySelector('#journal-voyage').append(mark);}
  for(const d of DISCOVERIES){const entry=document.createElement('article');entry.dataset.discovery=d.id;entry.innerHTML=`<span class="journal-number">${d.number}</span><div><h3></h3><p class="journal-story"></p><p class="journal-status"></p></div>`;if(onReplay){const replay=document.createElement('button');replay.className='journal-replay';replay.type='button';replay.textContent='重看这片星光';replay.onclick=()=>{close();onReplay(d.id);};entry.lastElementChild.append(replay);}journal.querySelector('#journal-entries').append(entry);}
  notice=document.createElement('button');notice.id='discovery-notice';notice.type='button';notice.hidden=true;notice.setAttribute('aria-live','polite');notice.setAttribute('aria-label','阅读新发现');notice.innerHTML='<small>观测到一段故事</small><strong></strong><span></span>';
  toggle.onclick=()=>{toggle.dataset.unread='false';open();};notice.onclick=()=>{notice.hidden=true;toggle.dataset.unread='false';open();};
  journal.querySelector('#journal-close').onclick=close;journal.querySelector('#journal-return').onclick=close;
  journal.addEventListener('close',()=>{toggle.setAttribute('aria-expanded','false');const target=returnFocus?.isConnected&&!returnFocus.hidden?returnFocus:toggle;target.focus({preventScroll:true});});
  journal.addEventListener('click',event=>{if(event.target===journal){const box=journal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}});
  document.addEventListener('keydown',onKey,true);document.body.append(toggle,journal,notice);renderJournal();
 }
 return {
  visit(planet,moon=null){if(!disposed)tracker.visit(planet,moon);},
  update(context){if(!disposed){tracker.update(context);lights?.update(context);}},
  getState:tracker.getState,open,close,
  dispose(){disposed=true;clearTimeout(noticeTimer);lights?.dispose();if(typeof document!=='undefined')document.removeEventListener('keydown',onKey,true);journal?.remove();toggle?.remove();notice?.remove();}
 };
}

// Celestial stories are geometry in the same scene: the planets can occult them.
// No new textures, network calls or permanent timers are needed.
export function createSkyPhenomena({THREE,scene,camera,bodies,onChange=()=>{}}){
 const root=new THREE.Group();root.name='Sky phenomena';scene.add(root);
 const events=new Map(),tau=Math.PI*2;
 const makeGroup=id=>{const group=new THREE.Group();group.name=id;group.visible=false;root.add(group);events.set(id,group);return group;};
 const lineMaterial=(color,opacity)=>new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
 const meteors=makeGroup('meteors');
 for(let i=0;i<22;i++){
  const points=new Float32Array(18*3),colors=[];
  for(let j=0;j<18;j++){const a=(1-j/17)**1.5;colors.push(.5*a,.82*a,a);}
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(points,3)).setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const streak=new THREE.Line(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending}));
  streak.userData={phase:i*.618%1,x:(i*.381%1-.5)*560,y:25+(i*.713%1)*240,length:14+(i%5)*8};meteors.add(streak);
 }
 const constellation=makeGroup('constellation');
 const chart=[[-195,135,-750],[-115,155,-750],[-66,114,-750],[-141,85,-750],[-195,135,-750],[-141,85,-750],[-66,40,-750],[19,49,-750],[114,7,-750]];
 constellation.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(chart.map(v=>new THREE.Vector3(...v))),lineMaterial(0x92c6e5,.7)));
 const seven=[chart[0],chart[1],chart[2],chart[3],chart[6],chart[7],chart[8]];
 constellation.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(seven.flat(),3)),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=13.;}',fragmentShader:'void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.03,.12,d))*.9+(1.-smoothstep(.06,.5,d))*.3;gl_FragColor=vec4(.65,.85,1.,a);}'})));
 // A soft ring at the end of the handle locates Alkaid, the namesake of this system.
 const alkaidRing=Array.from({length:65},(_,i)=>new THREE.Vector3(114+Math.cos(i/64*tau)*14,7+Math.sin(i/64*tau)*14,-750));
 constellation.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(alkaidRing),lineMaterial(0xafd5f2,.42)));
 const aurora=makeGroup('aurora');
 for(const pole of [1,-1]){
  const geometry=new THREE.BufferGeometry(),points=[],uvs=[],indices=[],count=150;
  for(let i=0;i<=count;i++){
   const a=i/count*tau,r=.61+.06*Math.sin(a*5);points.push(Math.cos(a)*r,pole*.88,Math.sin(a)*r,Math.cos(a)*(r+.13),pole*1.2,Math.sin(a)*(r+.13));uvs.push(i/count,0,i/count,1);
   if(i<count){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
   vertexShader:'varying vec2 vUv; uniform float uTime; void main(){vUv=uv; vec3 p=position; p.y+=sign(p.y)*sin(uv.x*50.265482+uTime*.7)*.07*uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
   fragmentShader:'varying vec2 vUv; uniform float uTime; void main(){float folds=.52+.25*sin(vUv.x*106.81415+sin(vUv.x*31.415927-uTime)*3.); float veil=sin(vUv.y*3.14159)*folds; vec3 c=mix(vec3(.18,.94,.71),vec3(.38,.36,.93),smoothstep(.3,1.,vUv.y)); gl_FragColor=vec4(c,veil*.8);}'
  });aurora.add(new THREE.Mesh(geometry,material));
 }
 const signal=makeGroup('signal');
 for(let i=0;i<4;i++){
  const ring=Array.from({length:160},(_,j)=>{const a=j/160*tau;return new THREE.Vector3(Math.cos(a),0,Math.sin(a));});
  signal.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring),lineMaterial(0x9cebea,.7)));
 }
 let active=null,age=0,anchorPending=false,queued=null;
 function start(id){if(!events.has(id))return;active=id;age=1.8;anchorPending=true;for(const [key,g] of events)g.visible=key===id;onChange(id);}
 function stop(){active=null;queued=null;for(const g of events.values())g.visible=false;onChange(null);}
 function update({dt=0,paused=false,reducedMotion=false,transitioning=false,mode,planet}={}){
  const canShow=id=>(id==='aurora'?planet==='lingxi'&&mode==='planet':id==='signal'?planet==='suxian'&&mode==='planet':mode==='system');
  if(queued&&!transitioning&&canShow(queued)){const id=queued;queued=null;start(id);}
  if(!active)return;
  if(!paused&&!reducedMotion)age+=dt;
  const group=events.get(active);
  // Celestial events remain attached to their own world, not a newly selected one.
  if(!canShow(active)){active=null;for(const g of events.values())g.visible=false;onChange(null);return;}
  group.visible=!transitioning;
  if(transitioning)return;
  if(anchorPending){if(active==='meteors'||active==='constellation'){group.position.copy(camera.position);group.quaternion.copy(camera.quaternion);}anchorPending=false;}
  if(active==='meteors'){
   for(const streak of group.children){const d=streak.userData,t=(age*.25+d.phase)%1,arr=streak.geometry.attributes.position;
    for(let j=0;j<arr.count;j++){const f=j/(arr.count-1),x=d.x+t*110,y=d.y-t*150;arr.setXYZ(j,x-f*d.length,y+f*d.length*1.3,-700);}
    arr.needsUpdate=true;streak.geometry.computeBoundingSphere();streak.material.opacity=Math.sin(t*Math.PI)*.95;
   }
  }else if(active==='aurora'){
   const b=bodies.find(b=>b.def.id==='lingxi');group.position.copy(b.root.position);group.quaternion.copy(b.tilt.quaternion);group.scale.setScalar(b.def.radius);
   for(const curtain of group.children)curtain.material.uniforms.uTime.value=age;
  }else if(active==='signal'){
   const b=bodies.find(b=>b.def.id==='suxian');group.position.copy(b.root.position);group.quaternion.copy(b.tilt.quaternion);
   group.children.forEach((ring,i)=>{const t=(age*.11+i/4)%1;ring.scale.setScalar(b.def.radius*(1.3+t*3.2));ring.material.opacity=(1-t)*.75;ring.position.y=.13;});
  }
  if(age>27)stop();
 }
 return{start,stop,update,get active(){return active;},queue(id){queued=id;},dispose(){stop();scene.remove(root);root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}
