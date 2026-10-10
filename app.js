import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {PLANETS,STAR,orbitalDays,orbitSeconds,formatPeriod} from './data.js';
import {LOOK,LOOK_ID,LOOKS} from './looks.js';
import {surfaceMaterial,cloudMaterial,atmosphereMaterial,ringMaterial,starMaterial,coronaMaterial,hdrBoost} from './materials.js';
import {createDiscoveries,createSkyPhenomena,JOURNAL_ENTRIES} from './discoveries.js';
import {createEggs} from './eggs.js';
import {EffectComposer} from './vendor/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from './vendor/postprocessing/ShaderPass.js';
import {OutputPass} from './vendor/postprocessing/OutputPass.js';
import {createDust} from './dust.js';
import {createIntro,createDrift,DRIFT} from './intro.js';

const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const state={mode:'system',planet:null,selected:null,moon:null,paused:reduced.matches,time:0,lastActivity:performance.now()};
let scene,camera,renderer,controls,transition,ready=false,failed=false,star,corona,starLabel,halo,comet,echo,discoveries,skyEvents,eggs;
// HDR post chain: scene → bloom → finish (chromatic aberration, grain, vignette) → tone map.
// `post` flips to false on `?post=0`, missing float render targets, or sustained slow frames.
let composer=null,bloom=null,finish=null,post=false,frameCount=0,frameCap=0,gpuName='',dust=null;
const POST_PARAM=new URLSearchParams(location.search).get('post');
// Opening sequence plays only on a plain first visit to the overview.
const INTRO_WANTED=!location.hash&&!reduced.matches&&new URLSearchParams(location.search).get('intro')!=='0';
const BASE_FOV=40;
let intro=null,drift=null,starField=null,flightTimer=0;
// Overview-only props (orbits, ticks, belt, comet, echo) ease out over ~0.6s when a
// flight departs instead of vanishing on the frame `mode` changes.
let systemFade=1;
const FINISH_SHADER={uniforms:{tDiffuse:{value:null},uTime:{value:0},uAberration:{value:.0022},uGrain:{value:.018},uVignette:{value:.35}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime,uAberration,uGrain,uVignette;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec2 d=vUv-.5;float r2=dot(d,d);vec2 shift=d*r2*uAberration*4.;
vec3 c=vec3(texture2D(tDiffuse,vUv+shift).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-shift).b);
float g=hash(floor(vUv*vec2(1920.,1080.))+fract(uTime*.37)*17.)-.5;c+=g*uGrain*(.25+c);
c*=1.-r2*uVignette;gl_FragColor=vec4(c,1.);}`};
const defaults=()=>({speed:1,sky:1,orbits:true,labels:true,comets:true,moonScale:1,worlds:{}});
let settings=defaults(),cometAge=-1,effectTime=0,nextComet=38,echoUntil=0;
try{
 const saved=JSON.parse(localStorage.getItem('alkaid-lab-v1')||'null');
 if(saved){
  for(const [key,min,max] of [['speed',.1,8],['sky',0,1.8],['moonScale',.5,1.4]])if(Number.isFinite(saved[key]))settings[key]=Math.max(min,Math.min(max,saved[key]));
  for(const key of ['orbits','labels','comets'])if(typeof saved[key]==='boolean')settings[key]=saved[key];
  for(const p of PLANETS){const s=saved.worlds?.[p.id];if(s)settings.worlds[p.id]={au:Number.isFinite(s.au)?Math.max(.25,Math.min(6,s.au)):p.au,cloud:Number.isFinite(s.cloud)?Math.max(0,Math.min(1,s.cloud)):p.cloud};}
 }
}catch{/* Private browsing can disable storage; the controls still work. */}
function saveSettings(){try{localStorage.setItem('alkaid-lab-v1',JSON.stringify(settings));}catch{}}
let frameSamples=[],intervalSamples=[],lastPaint=0,previous=0,lastMovement=new THREE.Vector3();
const bodies=[],pickables=[];
const lightPosition=new THREE.Vector3(0,0,0);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const sphere=new THREE.SphereGeometry(1,80,48),smallSphere=new THREE.SphereGeometry(1,40,24);
const mobile=()=>innerWidth<=760;
document.body.dataset.mode='system';
document.body.dataset.look=LOOK_ID;
document.querySelector('.header-caption').textContent=LOOK.caption;
document.title=`瑶光星系 · ${LOOK.name}`;
for(const [id,look] of Object.entries(LOOKS)){
 const a=document.createElement('a');a.href=`${location.pathname}?style=${id}${location.hash}`;a.textContent=look.name;a.dataset.style=id;a.setAttribute('aria-current',String(id===LOOK_ID));$('look-links').append(a);
}
$('look-toggle').onclick=()=>{const open=$('look-menu').hidden;$('look-menu').hidden=!open;$('look-toggle').setAttribute('aria-expanded',String(open));};

// HTML navigation is independent of WebGL and is always available.
$('service-links').replaceChildren();
for(const p of PLANETS){
 const b=document.createElement('button');b.dataset.id=p.id;b.setAttribute('aria-label',`探索${p.name}`);b.setAttribute('aria-current','false');
 b.innerHTML=`<span class="planet-thumb ${p.ring?'ring':''}" style="--c:${p.color}" aria-hidden="true"><img src="./vendor/portraits/${p.id}.webp" alt="" width="60" height="40"></span><span><strong>${p.name}</strong><small>${p.service}</small></span>`;
 b.onclick=()=>state.mode==='system'?selectBody(p.id):navigate(p.id);$('planet-nav').append(b);
 if(p.url){const a=document.createElement('a');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',`${p.name} · ${p.service}${p.local?' · 本机':''}`);a.innerHTML=`<span class="rail-orb" style="--c:${p.color}" aria-hidden="true"></span><span class="rail-name">${p.name}<small>${p.service}${p.local?' · 本机':''}</small></span><span class="rail-arrow">↗</span>`;$('service-links').append(a);}
}
// Keep a legible view of the whole system while the camera is near a planet.
const systemMap=document.createElement('aside');systemMap.id='system-map';systemMap.hidden=true;
systemMap.setAttribute('aria-label','星系位置图');
systemMap.innerHTML='<div class="map-heading"><span>同一片星系</span><button type="button">返回全景</button></div><div class="map-field" aria-hidden="true"><span class="map-star"></span></div><nav aria-label="从星图前往行星"></nav><p>随公转更新 · 距离按画面缩放</p>';
systemMap.querySelector('.map-heading button').onclick=()=>navigate();
for(const p of PLANETS){
 const marker=document.createElement('i');marker.dataset.marker=p.id;marker.style.setProperty('--c',p.color);systemMap.querySelector('.map-field').append(marker);
 const button=document.createElement('button');button.type='button';button.dataset.world=p.id;button.textContent=p.name;button.style.setProperty('--c',p.color);button.onclick=()=>navigate(p.id);systemMap.querySelector('nav').append(button);
}
document.body.append(systemMap);
function updateSystemMap(){
 systemMap.hidden=state.mode==='system';
 if(systemMap.hidden)return;
 const extent=Math.max(...PLANETS.map(p=>p.orbit));
 for(const b of bodies){
  const marker=systemMap.querySelector(`[data-marker="${b.def.id}"]`);
  marker.style.left=(50+b.root.position.x/extent*43)+'%';marker.style.top=(50+b.root.position.z/extent*40)+'%';
  marker.dataset.current=String(state.planet===b.def.id);
  systemMap.querySelector(`[data-world="${b.def.id}"]`).setAttribute('aria-current',String(state.planet===b.def.id));
 }
}
$('nav-toggle').onclick=()=>{const open=$('services').classList.toggle('expanded');$('nav-toggle').setAttribute('aria-expanded',String(open));};
$('home').onclick=()=>navigate();$('explore').onclick=()=>selectBody('lingxi');
$('star-info').onclick=()=>selectBody('yaoguang');
$('close-card').onclick=()=>{const id=state.selected||state.planet;navigate();(id==='yaoguang'?$('star-info'):$('planet-nav').querySelector(`[data-id="${id}"]`))?.focus();};
$('visit').onclick=()=>navigate(state.selected);
$('back').onclick=()=>navigate(state.mode==='moon'?state.planet:null);
$('reset').onclick=()=>focusCamera(true);
$('pause').onclick=()=>{state.paused=!state.paused;updatePause();};
$('clean').onclick=()=>{const clean=document.body.classList.toggle('clean');$('clean').setAttribute('aria-pressed',String(clean));$('details').inert=clean;if(clean&&!$('play-panel').hidden)setLab(false);};
function updatePause(){$('pause').setAttribute('aria-pressed',String(state.paused));$('pause').innerHTML=state.paused?'▷ <span>继续</span>':'Ⅱ <span>暂停</span>';}
updatePause();reduced.addEventListener('change',e=>{state.paused=e.matches;updatePause();});
document.addEventListener('keydown',e=>{state.lastActivity=performance.now();if(e.key==='Escape'){
 if(!$('play-panel').hidden){setLab(false);return;}
 if(!$('look-menu').hidden){$('look-menu').hidden=true;$('look-toggle').setAttribute('aria-expanded','false');return;}
 if($('services').classList.contains('expanded')){$('services').classList.remove('expanded');$('nav-toggle').setAttribute('aria-expanded','false');return;}
 if(document.body.classList.contains('clean')){$('clean').click();return;}
 if(state.mode==='moon')navigate(state.planet);else if(state.mode!=='system'||state.selected)$('close-card').click();
 }});
document.addEventListener('pointermove',()=>state.lastActivity=performance.now(),{passive:true});
document.addEventListener('pointerdown',()=>state.lastActivity=performance.now(),{passive:true});
document.addEventListener('wheel',()=>state.lastActivity=performance.now(),{passive:true});
// Close-up modes tuck secondary controls away; they return when the pointer comes near.
const tucked=['system-map','play-toggle','journal-toggle','look-switch','planet-nav'];let nearFrame=0,nearX=-1e4,nearY=-1e4;
function updateNear(){nearFrame=0;const close=state.mode!=='system';for(const id of tucked){const el=$(id);if(!el)continue;let near=false;if(close){const r=el.getBoundingClientRect(),dx=Math.max(r.left-nearX,0,nearX-r.right),dy=Math.max(r.top-nearY,0,nearY-r.bottom);near=Math.hypot(dx,dy)<72;}if(el.dataset.near!==String(near))el.dataset.near=String(near);}}
document.addEventListener('pointermove',e=>{nearX=e.clientX;nearY=e.clientY;if(!nearFrame)nearFrame=requestAnimationFrame(updateNear);},{passive:true});
window.addEventListener('popstate',()=>readHash());
function readHash(){const [p,m]=location.hash.slice(1).split('/');if(p==='inspect')navigate(m,null,false,true);else navigate(p,m===undefined?null:Number(m),false);}
function selectBody(id){navigate(id,null,true,true);}
function navigate(id=null,moon=null,push=true,inspect=false){
 const def=id==='yaoguang'?STAR:PLANETS.find(p=>p.id===id);if(!def)id=null;
 if(moon!==null&&(!Number.isInteger(moon)||!def?.moons?.[moon]))moon=null;
 const previousMode=state.mode;
 state.selected=inspect?id:null;state.planet=inspect?null:id;state.moon=moon;state.mode=inspect||!id?'system':id==='yaoguang'?'star':moon===null?'planet':'moon';state.lastActivity=performance.now();
 document.body.dataset.mode=state.mode;
 document.body.dataset.inspect=String(inspect&&!!id);
 if(push){const hash=id?inspect?`#inspect/${id}`:`#${id}${moon!==null?'/'+moon:''}`:'';if(location.hash!==hash)history.pushState(null,'',location.pathname+location.search+hash);}
 for(const link of $('look-links').querySelectorAll('a'))link.href=`${location.pathname}?style=${link.dataset.style}${location.hash}`;
 if(!inspect&&id&&id!=='yaoguang')discoveries?.visit(id,moon);
 updateDetails();updateNear();if(push&&inspect&&id)$('visit').focus({preventScroll:true});if(ready&&(state.mode!=='system'||previousMode!=='system'))focusCamera();
}
function action(item,root){
 root.replaceChildren();
 if(item.url){const a=document.createElement('a');a.className='primary-link';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=(item.local?'打开本机服务':'进入服务')+' ↗';root.append(a);}
 else if(item.copy){const b=document.createElement('button');b.className='primary-link';b.textContent='复制 API 地址';b.onclick=async()=>{try{await navigator.clipboard.writeText(item.copy);toast('API 地址已复制');}catch{toast('无法自动复制：'+item.copy);}};root.append(b);}
 else {const p=document.createElement('p');p.className='note';p.textContent='尚未接入 · 保留席位';root.append(p);}
 if(item.base){const copy=document.createElement('button');copy.className='primary-link';copy.style.marginLeft='16px';copy.textContent='复制 API 地址';copy.onclick=async()=>{try{await navigator.clipboard.writeText(item.base);toast('API 地址已复制');}catch{toast('无法自动复制：'+item.base);}};root.append(copy);}
}
function updateDetails(){
 const id=state.selected||state.planet,isStar=id==='yaoguang',def=isStar?STAR:PLANETS.find(p=>p.id===id),inspect=!!state.selected;
 $('details').hidden=!def;
 $('back').hidden=!def;$('eyebrow').hidden=!!def;$('explore').hidden=!!def;$('planet-action').hidden=!def;
 $('moon-section').hidden=!def||isStar||inspect;$('moon-card').hidden=state.mode!=='moon';
 $('visit').hidden=!inspect;$('world-note').hidden=!def;$('portrait-wrap').hidden=!def||state.mode==='moon';
 for(const b of $('planet-nav').children)b.setAttribute('aria-current',String(b.dataset.id===id));
 if(!def){
 $('title').textContent='瑶光星系';$('subtitle').textContent='循光而行，万象有栖。';$('description').innerHTML='六颗行星，环绕同一束光。<br>选择一颗星球，走近它的世界。';
 $('facts').innerHTML='<div><span>母恒星</span><strong>瑶光 Alkaid</strong></div><div><span>表面温度</span><strong>16,800 <small>K</small></strong></div><div><span>行星系统</span><strong>06 <small>颗行星</small></strong></div>';
 $('view-label').textContent='星系全景';$('scale-label').textContent='示意比例';$('hint').textContent='拖动环绕 · 滚轮缩放 · 点选查看档案';return;
 }
 $('details').scrollTop=0;
 $('portrait').src=`./vendor/portraits/${id}.webp`;$('portrait').alt=`${def.name}的场景肖像`;$('portrait-caption').textContent=isStar?'蓝白光球 · 艺术演绎':'星球肖像 · 场景渲染';
 $('visit').innerHTML=`前往${def.name} <span>→</span>`;
 $('world-note').textContent=isStar?'恒星参数沿用 Alkaid 参考设定；周围六颗行星为虚构世界。':'虚构星系设定 · 公转按 6.1 个太阳质量推算；光照、气候与画面尺度均为艺术处理。';
 if(isStar){
  $('title').textContent='瑶光';$('subtitle').textContent='Alkaid / 蓝白主序星 · B3V';$('description').textContent=STAR.description;
  $('facts').innerHTML='<div><span>表面温度</span><strong>16,800 <small>K</small></strong></div><div><span>恒星质量</span><strong>6.1 <small>M☉</small></strong></div><div><span>恒星半径</span><strong>3.4 <small>R☉</small></strong></div>';
  $('planet-action').hidden=true;$('back').textContent=inspect?'‹ 收起档案':'‹ 返回星系';$('view-label').textContent=inspect?'星系全景':'瑶光近景';$('scale-label').textContent='蓝白色的第七星';return;
 }
 $('title').textContent=state.mode==='moon'?def.moons[state.moon].title:def.name;
 $('subtitle').textContent=state.mode==='moon'?`${def.name} · 随行卫星`:`${def.roman} / ${def.type}`;
 $('description').textContent=def.description;
 $('facts').innerHTML=`<div><span>轨道半长轴</span><strong>${def.au.toFixed(2)} <small>AU</small></strong><small>${(def.au*1.495978707).toFixed(2)} 亿 km</small></div><div><span>公转周期</span><strong>${def.periodDays.toFixed(1)} <small>天</small></strong><small>${(def.periodDays/365.25).toFixed(2)} 地球年</small></div><div><span>行星半径</span><strong>${def.radiusEarth.toFixed(2)} <small>R⊕</small></strong><small>${Math.round(def.radiusEarth*6371).toLocaleString()} km</small></div>`;
 action(def,$('planet-action'));$('back').textContent=state.mode==='moon'?`‹ 返回${def.name}`:inspect?'‹ 收起档案':'‹ 返回星系';
 $('satellites').replaceChildren();def.moons.forEach((m,i)=>{const b=document.createElement('button');b.textContent=m.title;b.setAttribute('aria-pressed',String(state.moon===i));b.onclick=()=>navigate(def.id,i);$('satellites').append(b);});
 $('moon-count').textContent=String(def.moons.length).padStart(2,'0');
 if(state.mode==='moon'){const m=def.moons[state.moon];$('moon-description').textContent=m.desc;action({...m,local:def.local},$('moon-action'));}
 $('view-label').textContent=inspect?'星系全景':state.mode==='moon'?'卫星近景':'行星近景';$('scale-label').textContent=def.service+(def.local?' · 仅本机':'');$('hint').textContent='拖动环绕 · 滚轮缩放 · Esc 返回';
}
let toastTimer;function toast(message,ms=3000){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),ms);}

function setLab(open){if(open&&document.body.classList.contains('clean'))$('clean').click();$('play-panel').hidden=!open;$('play-toggle').setAttribute('aria-expanded',String(open));if(open){$('look-menu').hidden=true;$('look-toggle').setAttribute('aria-expanded','false');$('play-close').focus();}else $('play-toggle').focus();}
$('play-toggle').onclick=()=>setLab($('play-panel').hidden);$('play-close').onclick=()=>setLab(false);
for(const p of PLANETS){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('tune-planet').append(o);}
function tuningPlanet(){return PLANETS.find(p=>p.id===$('tune-planet').value)||PLANETS[0];}
function syncLab(){
 const p=tuningPlanet();
 $('time-scale').value=settings.speed;$('time-output').value=settings.speed.toFixed(1)+'×';
 $('sky-strength').value=settings.sky;$('sky-output').value=Math.round(settings.sky*100)+'%';
 $('show-orbits').checked=settings.orbits;$('show-labels').checked=settings.labels;$('show-comets').checked=settings.comets;
 $('orbit-radius').value=p.au;$('orbit-output').value=p.au.toFixed(2)+' AU';$('period-output').textContent='公转周期 '+formatPeriod(p.periodDays)+' · 随轨道同步计算';
 $('cloud-cover').value=p.cloud;$('cloud-cover').disabled=!p.original.cloud;$('cloud-output').value=p.original.cloud?Math.round(p.cloud*100)+'%':'无独立云层';
 $('moon-size').value=settings.moonScale;$('moon-output').value=Math.round(settings.moonScale*100)+'%';
}
function applySettings(){
 for(const p of PLANETS){
  const s=settings.worlds[p.id]||p.original,nextPeriod=orbitSeconds(s.au);
  p.phase+=state.time*(1/p.period-1/nextPeriod)*Math.PI*2;
  p.au=s.au;p.cloud=s.cloud;p.period=nextPeriod;p.periodDays=orbitalDays(p.au);
  // Preserve original layout at default values and reserve clear space around
  // the stellar surface at the smallest AU. AU remains the physical setting.
  const inner=7+p.radius*(p.ring?2.5:1.2);
  p.orbit=inner+(p.original.orbit-inner)*Math.pow(p.au/p.original.au,.75);
  const b=bodies.find(b=>b.def===p);if(!b)continue;
  b.orbit.scale.setScalar(p.orbit/p.original.orbit);b.ticks.scale.setScalar(p.orbit/p.original.orbit);
  b.label.innerHTML=`${p.name} <small>${p.au.toFixed(2)} AU</small>`;
  if(b.clouds)b.clouds.material.uniforms.uDensity.value=p.cloud;
  for(const m of b.moons){m.radius=m.baseRadius*settings.moonScale;m.mesh.scale.setScalar(m.radius);}
 }
 if(scene)scene.backgroundIntensity=LOOK.skyIntensity*settings.sky;
 syncLab();if(state.selected||state.planet)updateDetails();
}
$('tune-planet').onchange=syncLab;
for(const [id,key] of [['time-scale','speed'],['sky-strength','sky'],['moon-size','moonScale']])$(id).oninput=()=>{settings[key]=Number($(id).value);applySettings();saveSettings();if(key==='moonScale'&&state.mode==='moon')focusCamera(true);};
for(const [id,key] of [['show-orbits','orbits'],['show-labels','labels'],['show-comets','comets']])$(id).onchange=()=>{settings[key]=$(id).checked;saveSettings();};
for(const [id,key] of [['orbit-radius','au'],['cloud-cover','cloud']])$(id).oninput=()=>{
 const p=tuningPlanet();settings.worlds[p.id]={au:p.au,cloud:p.cloud,...settings.worlds[p.id],[key]:Number($(id).value)};applySettings();saveSettings();
 if(key==='au'&&ready){moveBodies();if(state.planet)focusCamera(true);}
};
$('reset-settings').onclick=()=>{settings=defaults();applySettings();saveSettings();cometAge=-1;echoUntil=0;if(ready){moveBodies();focusCamera(true);}toast('已恢复最初的星系设定');};
$('summon-comet').onclick=()=>{settings.comets=true;$('show-comets').checked=true;cometAge=5;nextComet=effectTime+70;saveSettings();if(state.mode!=='system')navigate();$('discovery-note').textContent='彗尾始终背向瑶光：蓝色离子尾细长，尘埃尾微微弯曲。';toast(state.paused?'彗星已抵达 · 点「继续」看它掠过':'一颗彗星正从星系边缘掠过');};
$('sister-stars').onclick=()=>{navigate();echoUntil=effectTime+18;$('discovery-note').textContent='蒹葭萋萋，白露未晞。浔萋与霁晞的名字同出一篇《诗经》；这道微光，是诗句的回响。';toast('蒹葭萋萋，白露未晞');};
$('top-view').onclick=()=>{navigate();if(!ready)return;focusCamera(true);camera.position.set(0,systemDistance(),.1);controls.target.set(0,0,0);controls.update();resetLens();};
function showSkyEvent(id){
 if(!skyEvents)return;
 navigate(id==='aurora'?'lingxi':id==='signal'?'suxian':null);
 if(!$('play-panel').hidden)setLab(false);
 skyEvents.queue(id);
}
function replayDiscovery(id){
 if(eggs?.replay(id))return;
 if(id==='still-comet'){$('summon-comet').click();showSkyEvent('meteors');return;}
 showSkyEvent(id==='tides'?'aurora':id==='old-signal'?'signal':'constellation');
}
for(const [button,id] of [['meteor-shower','meteors'],['trace-constellation','constellation'],['polar-lights','aurora'],['ice-signal','signal']])$(button).onclick=()=>showSkyEvent(id);
$('sky-event-stop').onclick=()=>skyEvents?.stop();
applySettings();

function createEffects(){
 const rand=seeded(2109),dust=[];
 for(let i=0;i<1100;i++){const a=rand()*Math.PI*2,r=52+rand()*3.2;dust.push(Math.cos(a)*r,(rand()-.5)*.6,Math.sin(a)*r);}
 const belt=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(dust,3)),new THREE.PointsMaterial({color:0x8aa6bd,size:.12,transparent:true,opacity:.28,depthWrite:false}));scene.add(belt);
 comet=new THREE.Group();
 const nucleus=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0xb7e3ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));nucleus.scale.set(2.4,2.4,1);comet.add(nucleus);
 for(let tail=0;tail<2;tail++){
  const positions=new Float32Array(90*3),colors=[];
  for(let i=0;i<90;i++){const fade=(1-i/89)**1.4;colors.push((tail?.57:.23)*fade,(tail?.62:.59)*fade,(tail?.64:1)*fade);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  comet.add(new THREE.Line(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending})));
 }
 scene.add(comet);comet.visible=false;
 const points=Array.from({length:70},()=>new THREE.Vector3());echo=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x9fd5ce,transparent:true,opacity:.24,depthWrite:false}));scene.add(echo);echo.visible=false;
 comet.userData.belt=belt;
}
function updateEffects(dt){
 if(!comet)return;
 corona.material.uniforms.uTime.value=state.time;star.rotation.y=state.time*.004;corona.rotation.y=state.time*.003;
 const system=state.mode==='system',shown=systemFade>.01,belt=comet.userData.belt;
 belt.visible=shown;if(!intro?.active)belt.material.opacity=.28*systemFade;
 if(settings.comets&&system&&dt&&effectTime>nextComet&&cometAge<0){cometAge=0;nextComet=effectTime+100;}
 if(cometAge>=0){cometAge+=dt;if(cometAge>36)cometAge=-1;}
 comet.visible=settings.comets&&shown&&cometAge>=0;
 if(comet.visible){
  const u=cometAge/36;comet.position.set(-106+212*u,14+Math.sin(u*Math.PI)*13,-43+u*88);
  const away=comet.position.clone().normalize(),side=new THREE.Vector3(-away.z,0,away.x);
  comet.children[0].material.opacity=systemFade;
  for(let tail=0;tail<2;tail++){const line=comet.children[tail+1],a=line.geometry.attributes.position;
   for(let i=0;i<a.count;i++){const t=i/(a.count-1),v=away.clone().multiplyScalar(t*(tail?19:28)).addScaledVector(side,tail?t*t*9:0);a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;line.geometry.computeBoundingSphere();
   line.material.opacity=Math.min(1,cometAge/3,(36-cometAge)/4)*.85*systemFade;
  }
 }
 echo.visible=shown&&effectTime<echoUntil;
 if(echo.visible){const a=bodies[0].root.position,b=bodies[4].root.position,arr=echo.geometry.attributes.position;
  for(let i=0;i<arr.count;i++){const t=i/(arr.count-1),p=a.clone().lerp(b,t);p.y=Math.sin(t*Math.PI)*12;arr.setXYZ(i,p.x,p.y,p.z);}arr.needsUpdate=true;echo.geometry.computeBoundingSphere();echo.material.opacity=(.18+.07*Math.sin(effectTime*.6))*systemFade;
 }
}

function seeded(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function addStars(){
 const rand=seeded(713),positions=[],colors=[],sizes=[];
 const bandNormal=new THREE.Vector3(.24,.87,.43).normalize();
 const bandRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),bandNormal);
 for(let i=0;i<LOOK.starCount;i++){
  const inBand=i>=LOOK.starCount*.46,a=rand()*Math.PI*2,z=!inBand?rand()*2-1:(rand()+rand()+rand()-1.5)*.21,r=350+rand()*160,s=Math.sqrt(1-z*z);
  const pos=new THREE.Vector3(Math.cos(a)*s*r,z*r,Math.sin(a)*s*r);if(inBand)pos.applyQuaternion(bandRotation);positions.push(...pos.toArray());
  const light=.15+Math.pow(rand(),5)*.7,warm=rand()>.81;
  // Colors are authored in sRGB; store them linear so the shader's output chunks
  // (and the HDR composer) reproduce the original brightness.
  const lin=v=>Math.pow(v,2.2);
  colors.push(lin(light*(warm?1:.78)*LOOK.starTint[0]),lin(light*(warm?.84:.88)*LOOK.starTint[1]),lin(light*(warm?.67:1)*LOOK.starTint[2]));sizes.push(.65+Math.pow(rand(),7)*2.9);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));
 const mat=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,uniforms:{uFade:{value:1}},vertexShader:'attribute float size; varying vec3 vColor; void main(){vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}',fragmentShader:'uniform float uFade;varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vColor,(1.-smoothstep(.05,.5,d))*uFade);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});starField=new THREE.Points(g,mat);scene.add(starField);
 const field=new THREE.TextureLoader().load('./vendor/textures/worlds/'+LOOK.sky);field.mapping=THREE.EquirectangularReflectionMapping;field.colorSpace=THREE.SRGBColorSpace;scene.background=field;scene.backgroundIntensity=LOOK.skyIntensity;scene.backgroundRotation.set(...LOOK.skyRotation);
}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(180,216,255,.9)');g.addColorStop(.14,'rgba(124,183,255,.45)');g.addColorStop(.3,'rgba(79,142,238,.14)');g.addColorStop(.6,'rgba(45,100,200,.035)');g.addColorStop(1,'rgba(25,65,150,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);return new THREE.CanvasTexture(c);}
function addOrbit(radius,opacity=.18){const points=[];for(let i=0;i<=256;i++){const a=i/256*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x66839d,transparent:true,opacity}));}
function makeLabel(text,onClick,cls=''){const label=document.createElement('button');label.className='planet-label '+cls;label.innerHTML=text;label.tabIndex=-1;label.onclick=onClick;$('labels').append(label);return label;}
function createBody(def,index){
 const root=new THREE.Group();scene.add(root);
 const tilt=new THREE.Group();tilt.rotation.z=def.tilt;root.add(tilt);
 const surface=new THREE.Mesh(sphere,surfaceMaterial(def,lightPosition));surface.scale.setScalar(def.radius);tilt.add(surface);
 surface.userData={planet:def.id,moon:null};pickables.push(surface);
 let clouds,atmosphere,ring;
 if(def.original.cloud){clouds=new THREE.Mesh(sphere,cloudMaterial(def,lightPosition));clouds.scale.setScalar(def.radius*1.012);tilt.add(clouds);}
 if(def.atmosphere){atmosphere=new THREE.Mesh(sphere,atmosphereMaterial(def.atmosphere,lightPosition,1.06));atmosphere.scale.setScalar(def.radius*1.06);root.add(atmosphere);}
 if(def.ring){ring=new THREE.Mesh(new THREE.RingGeometry(def.radius*1.28,def.radius*2.43,220),ringMaterial(def.radius,def.ring,lightPosition));ring.rotation.x=-Math.PI/2;tilt.add(ring);}
 const orbit=addOrbit(def.original.orbit,LOOK.orbitOpacity);scene.add(orbit);
 const ticks=new THREE.Group();
 if(LOOK.diagram){
  const pts=[];for(let i=0;i<72;i++){const a=i/72*Math.PI*2;for(const r of [def.original.orbit,def.original.orbit+(i%6===0?.9:.4)])pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));}
  ticks.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x779eb9,transparent:true,opacity:.34})));scene.add(ticks);
 }
 const label=makeLabel(`${def.name} <small>${def.au.toFixed(2)} AU</small>`,()=>state.mode==='system'?selectBody(def.id):navigate(def.id));
 const moons=[];
 def.moons.forEach((m,i)=>{
  const moonRadius=def.radius*(.075+(i%3)*.014),orbitRadius=def.radius*((def.ring?3.0:1.9)+i*.62);
  const mesh=new THREE.Mesh(smallSphere,surfaceMaterial({kind:m.kind,seed:def.seed+11+i*17},lightPosition));mesh.scale.setScalar(moonRadius);root.add(mesh);mesh.userData={planet:def.id,moon:i};pickables.push(mesh);
  const track=addOrbit(orbitRadius,.075);track.rotation.z=.1+i*.12;root.add(track);
  const moonLabel=makeLabel(m.title,()=>navigate(def.id,i),'moon');
  moons.push({mesh,track,radius:moonRadius,baseRadius:moonRadius,orbitRadius,phase:i*2.399+index,period:42+i*19,label:moonLabel});
 });
 const b={def,root,tilt,surface,clouds,atmosphere,ring,orbit,ticks,label,moons};bodies.push(b);return b;
}
function moveBodies(){
 for(const b of bodies){const d=b.def,a=d.phase+state.time/d.period*Math.PI*2;b.root.position.set(Math.cos(a)*d.orbit,0,Math.sin(a)*d.orbit);b.surface.rotation.y=state.time*.015;if(b.clouds)b.clouds.rotation.y=state.time*.019;
 b.surface.material.uniforms.uTime.value=state.time;
 if(b.ring)b.ring.material.uniforms.uCenter.value.copy(b.root.position);
 for(const m of b.moons){const t=m.phase+state.time/m.period*Math.PI*2;m.mesh.position.set(Math.cos(t)*m.orbitRadius,0,Math.sin(t)*m.orbitRadius).applyEuler(m.track.rotation);m.mesh.rotation.y=state.time*.025;}
 }
 if(star)star.material.uniforms.uTime.value=state.time;
}
function currentBody(){return bodies.find(b=>b.def.id===state.planet);}
function targetPosition(){const b=currentBody();if(!b)return new THREE.Vector3();if(state.mode==='moon')return b.moons[state.moon].mesh.getWorldPosition(new THREE.Vector3());return b.root.position.clone();}
function systemDistance(){const extent=Math.max(...PLANETS.map(p=>p.orbit+p.radius*2.5));return Math.max(mobile()?330:230,extent/(Math.tan(THREE.MathUtils.degToRad(20))*Math.min(1,innerWidth/innerHeight)))*1.05;}
function focusCamera(immediate=false){
 if(!ready)return;
 let position,target,min,max;
 // Journal replays (eggs.js) may pre-set a one-shot yaw replacing LOOK.closeYaw; read and clear it on every call.
 const yawOverride=state.yawOverride;state.yawOverride=null;
 if(state.mode==='system'){
  target=new THREE.Vector3(...(mobile()?[0,0,0]:LOOK.systemTarget));position=new THREE.Vector3(...(mobile()?LOOK.mobileCamera:LOOK.systemCamera));
  const extent=Math.max(...PLANETS.map(p=>p.orbit+p.radius*2.5)),originalExtent=Math.max(...PLANETS.map(p=>p.original.orbit+p.radius*2.5));
  position.sub(target).multiplyScalar(Math.max(1,extent/originalExtent)).add(target);min=95;max=Math.max(400,systemDistance()*1.5);
 }else if(state.mode==='star'){
  target=new THREE.Vector3(mobile()?0:-4,mobile()?-4:0,0);position=target.clone().add(new THREE.Vector3(15,8,mobile()?66:36));min=13;max=110;
 }else{
  const b=currentBody(),center=targetPosition(),radius=state.mode==='moon'?b.moons[state.moon].radius:b.def.radius;
  const yaw=state.mode==='planet'&&Number.isFinite(yawOverride)?yawOverride:LOOK.closeYaw;
  let dir=b.root.position.clone().negate().normalize().applyAxisAngle(new THREE.Vector3(0,1,0),yaw);dir.y=LOOK.closeHeight;dir.normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();
  const offset=right.multiplyScalar(mobile()?0:-radius*1.12);
  target=center.clone().add(offset);
  const distance=radius*(mobile()?9.5:LOOK.closeDistance)*(b.def.ring&&state.mode==='planet'?1.42:1);
  position=target.clone().addScaledVector(dir,distance);
  if(mobile()){const up=new THREE.Vector3().crossVectors(dir,new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize()).normalize();target.addScaledVector(up,-radius*1.05);position.addScaledVector(up,-radius*1.05);}
  min=radius*2.5;max=radius*22;
 }
 controls.enablePan=false;
 const duration=(immediate||reduced.matches)?0:2200;controls.enabled=!duration;
 // Keep current distance legal throughout flight; clamping to the destination
 // limits at departure made the old camera jump before its interpolation began.
 controls.minDistance=duration?.025:min;controls.maxDistance=duration?600:max;
 // Destination is stored relative to the target body's departure position (anchor);
 // the loop shifts it by the body's movement so time keeps running during flight.
 transition={start:performance.now(),duration,from:camera.position.clone(),to:position,targetFrom:controls.target.clone(),targetTo:target,min,max,anchor:targetPosition()};
 if(duration)showFlightStatus(state.mode==='system'?'正在返回星系':`正在接近${state.mode==='star'?'瑶光':state.mode==='moon'?currentBody()?.def.moons[state.moon]?.title||'卫星':currentBody()?.def.name||'天体'}`);else hideFlightStatus(true);
 if(!duration){camera.position.copy(position);controls.target.copy(target);controls.update();transition=null;resetLens();}
 lastMovement.copy(targetPosition());
}
// Base lens plus fresh world matrices, so projections taken before the next
// frame (slow software GL can skip several) already see the new framing.
function resetLens(){camera.fov=BASE_FOV;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
// Flight status fades out instead of cutting; `hidden` still lands at the end so
// callers (and tests) that wait for it keep the old contract.
function showFlightStatus(text){const el=$('flight-status');clearTimeout(flightTimer);el.classList.remove('leaving');el.textContent=text;el.hidden=false;}
function hideFlightStatus(now=false){const el=$('flight-status');clearTimeout(flightTimer);if(el.hidden){el.classList.remove('leaving');return;}if(now||reduced.matches){el.hidden=true;el.classList.remove('leaving');return;}el.classList.add('leaving');flightTimer=setTimeout(()=>{el.hidden=true;el.classList.remove('leaving');},360);}
function projected(object){const world=object.getWorldPosition(new THREE.Vector3());const v=world.clone().project(camera);return{x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,z:v.z,world};}
function updateLabels(){
 const clean=document.body.classList.contains('clean')||!settings.labels;
 if(starLabel){const s=projected(star);starLabel.hidden=state.mode==='star'||clean||s.z>1||s.z<-1||s.x<30||s.x>innerWidth-75||s.y<130||s.y>innerHeight-140;
  // Clear the disc on approach: offset by the projected stellar radius like planet labels.
  const starRadius=5.1/camera.position.distanceTo(star.position)*innerHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  starLabel.style.left=s.x+'px';starLabel.style.top=(s.y+Math.max(42,starRadius+18))+'px';}
 for(const b of bodies){
  const show=!clean&&(state.mode==='system'||state.planet!==b.def.id);const pos=projected(b.surface);
  const foreground=currentBody(),towards=pos.world.clone().sub(camera.position).normalize(),delta=foreground?.root.position.clone().sub(camera.position),along=delta?.dot(towards);
  const occluded=foreground&&foreground!==b&&along>0&&along<pos.world.distanceTo(camera.position)&&delta.addScaledVector(towards,-along).length()<foreground.def.radius*1.05;
  const screenRadius=b.def.radius/camera.position.distanceTo(b.root.position)*innerHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  b.label.hidden=!show||occluded||pos.z>1||pos.z<-1||pos.x<25||pos.x>innerWidth-85||pos.y<150||pos.y>innerHeight-145;
  b.label.style.left=pos.x+'px';b.label.style.top=(pos.y+screenRadius+18)+'px';
  b.orbit.visible=settings.orbits&&systemFade>.01;
  b.ticks.visible=systemFade>.01;
  b.root.visible=true;
  b.orbit.material.opacity=LOOK.orbitOpacity*(state.selected===b.def.id?2.3:1)*systemFade;
  for(const t of b.ticks.children)t.material.opacity=.34*systemFade;
  for(const m of b.moons){
   m.track.visible=state.planet===b.def.id&&state.mode==='planet'&&settings.orbits;
   const q=projected(m.mesh);const towards=q.world.clone().sub(camera.position).normalize();const toPlanet=b.root.position.clone().sub(camera.position);const along=toPlanet.dot(towards);const occluded=along>0&&along<q.world.distanceTo(camera.position)&&toPlanet.clone().addScaledVector(towards,-along).length()<b.def.radius*1.02;
   m.label.hidden=state.planet!==b.def.id||state.mode!=='planet'||clean||occluded||q.z>1||q.z<-1||q.y<100||q.y>innerHeight-(mobile()?390:210)||q.x<(mobile()?25:340)||q.x>innerWidth-50;
   m.label.style.left=q.x+'px';m.label.style.top=(q.y+18)+'px';
  }
 }
}
function resize(){if(!renderer)return;if(intro?.active)intro.finish();camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();const ratio=Math.min(devicePixelRatio,mobile()?1.25:1.5);renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);if(composer){composer.setPixelRatio(ratio);composer.setSize(innerWidth,innerHeight);}if(finish)finish.uniforms.uAberration.value=mobile()?.0012:.0022;focusCamera(true);}
function render(){if(post)composer.render();else renderer.render(scene,camera);}
function setPost(on){
 post=on&&!!composer;hdrBoost.value=post?1:0;document.body.dataset.post=post?'on':'off';
 if(halo)halo.material.opacity=LOOK.haloOpacity*(post?.13:.24);
}
function setupPost(){
 const gl=renderer.getContext(),debugInfo=gl.getExtension('WEBGL_debug_renderer_info');
 gpuName=debugInfo?String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)):'';
 // Software GL (SwiftShader, llvmpipe) falls behind the compositor when fed every
 // frame and eventually stops delivering animation frames; pace it at ~30fps and
 // skip the post chain unless ?post=1 forces it (used by the capture scripts).
 const software=/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);
 if(software)frameCap=32;
 // UnrealBloom needs a float render target; without it, or when asked, keep the direct path.
 if(POST_PARAM==='0'||!renderer.capabilities.isWebGL2||!gl.getExtension('EXT_color_buffer_float')||(software&&POST_PARAM!=='1'))return setPost(false);
 composer=new EffectComposer(renderer);
 composer.addPass(new RenderPass(scene,camera));
 const b=LOOK.bloom||{strength:.55,radius:.32,threshold:.95};
 bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),b.strength,b.radius,b.threshold);composer.addPass(bloom);
 finish=new ShaderPass(FINISH_SHADER);composer.addPass(finish);
 composer.addPass(new OutputPass());
 setPost(POST_PARAM!=='0');
}
function loop(now){
 requestAnimationFrame(loop);if(!ready||failed||document.hidden)return;
 if(frameCap&&now-lastPaint<frameCap)return;
 const dt=previous?Math.min((now-previous)/1000,.12):0;previous=now;frameCount++;
 if(lastPaint)intervalSamples.push(now-lastPaint);if(intervalSamples.length>180)intervalSamples.shift();lastPaint=now;
 // Sustained sub-24fps: drop the post chain and pace the loop, quietly.
 if((post||!frameCap)&&frameCount>=300&&frameCount%300===0&&intervalSamples.length===180){const mean=intervalSamples.reduce((a,b)=>a+b,0)/180;if(mean>42){setPost(false);frameCap=32;}}
 // Overview idle drift keeps the bodies moving past the 180s stillness timeout.
 const moving=!state.paused&&(now-state.lastActivity<180000||!!drift?.active);
 const fadeTarget=state.mode==='system'?1:0;systemFade+=(fadeTarget-systemFade)*(1-Math.exp(-(dt||1/30)*5));if(Math.abs(fadeTarget-systemFade)<.005)systemFade=fadeTarget;
 if(moving){state.time+=dt*settings.speed;effectTime+=dt;}moveBodies();updateEffects(moving?dt:0);
 discoveries?.update({time:effectTime,dt,mode:state.mode,paused:state.paused,cometVisible:!!comet?.visible,sky:settings.sky,reducedMotion:reduced.matches});
 eggs?.update(now);
 if(intro?.phase==='primed'&&$('loading').classList.contains('done'))intro.finish();
 if(intro?.active&&(transition||state.mode!=='system'||reduced.matches))intro.finish(false);
 if(transition){const t=Math.min((now-transition.start)/(transition.duration||1),1),ease=t*t*t*(t*(t*6-15)+10);const shift=targetPosition().sub(transition.anchor),to=transition.to.clone().add(shift),targetTo=transition.targetTo.clone().add(shift);camera.position.lerpVectors(transition.from,to,ease);camera.position.y+=Math.sin(Math.PI*ease)*Math.min(20,transition.from.distanceTo(to)*.11);controls.target.lerpVectors(transition.targetFrom,targetTo,ease);
  // Slight wide-angle on departure that settles back as the camera lands.
  camera.fov=BASE_FOV+3.5*Math.sin(Math.PI*Math.min(1,ease*1.15))*(1-ease*.35);camera.updateProjectionMatrix();
  if(t===1){controls.minDistance=transition.min;controls.maxDistance=transition.max;controls.enabled=true;transition=null;hideFlightStatus();lastMovement.copy(targetPosition());camera.fov=BASE_FOV;camera.updateProjectionMatrix();}}
 else if(state.planet){const pos=targetPosition(),delta=pos.clone().sub(lastMovement);camera.position.add(delta);controls.target.add(delta);lastMovement.copy(pos);}
 if(!transition&&camera.fov!==BASE_FOV){camera.fov+=(BASE_FOV-camera.fov)*Math.min(1,dt*5);if(Math.abs(camera.fov-BASE_FOV)<.02)camera.fov=BASE_FOV;camera.updateProjectionMatrix();}
 drift?.update(dt,state.mode==='system'&&!transition&&!intro?.active&&!reduced.matches&&now-state.lastActivity>DRIFT.idleMs);
 controls.update();updateLabels();intro?.update(now);updateSystemMap();dust?.update({camera,mode:state.mode,dt:moving?dt:0,time:effectTime,sky:settings.sky});skyEvents?.update({dt:moving?dt:0,paused:state.paused,reducedMotion:reduced.matches,transitioning:!!transition,mode:state.mode,planet:state.planet,follow:!!drift?.active,hold:!!intro?.active});if(finish&&!reduced.matches)finish.uniforms.uTime.value=now*.001;if(post)bloom.strength=(LOOK.bloom?.strength??.55)*(state.mode==='star'?.5:1)*(intro?.bloomGain??1);const start=performance.now();render();frameSamples.push(performance.now()-start);if(frameSamples.length>180)frameSamples.shift();
}
function init(){
 try{
  let resourceErrors=0;
  const loadingCopy=$('loading').lastElementChild;
  THREE.DefaultLoadingManager.onProgress=(_url,loaded,total)=>{loadingCopy.textContent=`正在展开星图 ${loaded} / ${total}`;};
  THREE.DefaultLoadingManager.onError=()=>{resourceErrors++;document.body.dataset.resources='partial';};
  THREE.DefaultLoadingManager.onLoad=()=>{renderer.compile(scene,camera);render();$('loading').classList.add('done');document.body.dataset.resources=resourceErrors?'partial':'complete';$('asset-warning').hidden=!resourceErrors;intro?.start(performance.now());};
  renderer=new THREE.WebGLRenderer({canvas:$('universe'),antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=LOOK.exposure;renderer.setClearColor(0x03060b);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.025,3000);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.rotateSpeed=.4;controls.zoomSpeed=.65;controls.enablePan=false;controls.maxPolarAngle=Math.PI*.86;controls.minPolarAngle=.1;
  controls.addEventListener('start',()=>{if(transition){controls.minDistance=Math.min(transition.min,camera.position.distanceTo(controls.target));controls.maxDistance=Math.max(transition.max,camera.position.distanceTo(controls.target));}transition=null;resetLens();hideFlightStatus();state.lastActivity=performance.now();lastMovement.copy(targetPosition());});
  addStars();star=new THREE.Mesh(sphere,starMaterial());star.scale.set(5.1,4.85,5.1);scene.add(star);star.userData={planet:'yaoguang',moon:null};pickables.push(star);
  starLabel=makeLabel('瑶光 <small>B3V</small>',()=>selectBody('yaoguang'),'stellar-label');
  corona=new THREE.Mesh(sphere,coronaMaterial());corona.scale.setScalar(5.75);scene.add(corona);
  halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0x458fff,transparent:true,opacity:LOOK.haloOpacity*.24,depthWrite:false,blending:THREE.AdditiveBlending}));halo.scale.set(LOOK.haloScale*.92,LOOK.haloScale*.92,1);scene.add(halo);
  PLANETS.forEach(createBody);createEffects();dust=createDust({THREE,scene,LOOK,seeded});
  skyEvents=createSkyPhenomena({THREE,scene,camera,bodies,seventhLit:()=>!!discoveries?.has('seventh'),onChange:(id,story)=>{const status=$('sky-event-status');status.hidden=!id;status.dataset.event=id||'';if(id&&story){status.querySelector('strong').textContent=story[0];status.querySelector('p').textContent=story[1];}}});
  discoveries=createDiscoveries({THREE,scene,planets:PLANETS,onReplay:replayDiscovery,onProgress:s=>eggs?.progress(s),onDiscovery:entry=>{$('discovery-note').textContent='观测手记已收录：'+entry.title;const event={'voyager':'constellation','still-comet':'meteors','tides':'aurora','old-signal':'signal'}[entry.id];if(event)skyEvents.queue(event);}});applySettings();moveBodies();ready=true;setupPost();resize();
  drift=createDrift({THREE,camera,controls});
  eggs=createEggs({THREE,scene,camera,controls,bodies,state,discoveries,skyEvents,navigate,toast,reduced,journalSize:JOURNAL_ENTRIES.length,isTransitioning:()=>!!transition,isDrifting:()=>!!drift?.active,pixelRatio:()=>renderer.getPixelRatio(),closeRig:()=>({height:LOOK.closeHeight,distance:mobile()?9.5:LOOK.closeDistance,offset:mobile()?0:1.12,drop:mobile()?1.05:0})});
  if(INTRO_WANTED){
   intro=createIntro({THREE,scene,camera,controls,renderer,star,corona,halo,bodies,starField,belt:comet.userData.belt,LOOK,skyIntensity:()=>LOOK.skyIntensity*settings.sky,haloOpacity:()=>LOOK.haloOpacity*(post?.13:.24),
    onEnd:()=>{if(!transition)controls.enabled=true;state.lastActivity=performance.now();}});
   intro.prime();
  }
  // Compile all materials before dismissing the loading screen.
  renderer.compile(scene,camera);render();
  window.addEventListener('resize',resize);readHash();requestAnimationFrame(loop);
  let down;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);const available=pickables.filter(o=>o.userData.moon===null||state.mode==='system'||o.userData.planet===state.planet);const hits=raycaster.intersectObjects(available);if(hits.length){const d=hits[0].object.userData;if(state.mode==='system')selectBody(d.planet);else if(d.moon!==null&&state.planet===d.planet)navigate(d.planet,d.moon);else navigate(d.planet);}});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;$('fallback').hidden=false;});
  renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
 }catch(e){console.error(e);failed=true;$('loading').classList.add('done');$('fallback').hidden=false;discoveries ||= createDiscoveries({planets:PLANETS});}
}
window.observatory={get ready(){return ready},get mode(){return state.mode},get time(){return state.time},get failed(){return failed},get intro(){return intro?.phase||'off'},get drifting(){return !!drift?.active},metrics(){const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{samples:a.length,meanMs:+(a.reduce((x,y)=>x+y,0)/(a.length||1)).toFixed(2),p95Ms:+(s[Math.floor(s.length*.95)]||0).toFixed(2)}};return{renderSubmission:stats(frameSamples),frameInterval:stats(intervalSamples),pixelRatio:renderer?.getPixelRatio(),drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles,post,bloom:post?{strength:bloom.strength,radius:bloom.radius,threshold:bloom.threshold}:null,frameCap,gpu:gpuName,renderer:renderer?.getContext().getParameter(renderer.getContext().RENDERER),note:'CPU render submission, not GPU completion; frame interval depends on hardware.'};}};
init();
$('retry-assets').onclick=()=>location.reload();
