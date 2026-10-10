// Late field notes + "seventh star" egg: pure logic in node, then real wiring in SwiftShader.
// Run: node tests/eggs.cjs            (logic only)
//      node tests/eggs.cjs --browser  (logic + browser, needs the local server on 43178)
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
// File URLs, not data: URLs: eggs.js imports intro.js and discoveries.js imports eggs.js.
const load=file=>import(pathToFileURL(path.resolve(__dirname,'..',file)).href);

async function logicChecks(){
 const {createEggWatch,createTapStreak,EGG_TIMING,DIPPER,DIPPER_EDGES,closeYawFor}=await load('eggs.js');
 const {DRIFT,COARSE_POINTER}=await load('intro.js');
 const {createDiscoveryTracker,DISCOVERIES,LATE_DISCOVERIES,JOURNAL_ENTRIES,DISCOVERY_STORAGE_KEY,skyStory}=await load('discoveries.js');
 assert.equal(DISCOVERIES.length,4,'the first four notes keep their own list');
 assert.equal(LATE_DISCOVERIES.length,4);assert.equal(JOURNAL_ENTRIES.length,8);
 assert.equal(new Set(JOURNAL_ENTRIES.map(d=>d.id)).size,8,'ids are unique');
 for(const d of JOURNAL_ENTRIES)for(const key of ['id','number','title','hint','body','after'])assert.ok(typeof d[key]==='string'&&d[key].length,`${d.id}.${key}`);
 assert.deepEqual(LATE_DISCOVERIES.map(d=>d.title),['灯火','晨昏线','漂流','第七星']);
 assert.equal(DIPPER.length,7);assert.equal(DIPPER[6].name,'瑶光');assert.equal(DIPPER_EDGES.length,7);
 // Copy: the 02 note leaves the breadcrumb, 08 answers it; no "one minute", one pronoun.
 const entry=id=>JOURNAL_ENTRIES.find(d=>d.id===id);
 assert.ok(entry('voyager').body.includes('第七颗星，要你亲口唤它'));assert.ok(entry('seventh').hint.includes('连唤它七声'));
 assert.ok(entry('seventh').body.includes('古称摇光'));assert.equal(JOURNAL_ENTRIES.some(d=>/一分钟|她/.test(d.body+d.hint+d.after)),false);
 assert.deepEqual(skyStory('constellation'),['斗柄所指','北斗七星横在银河上方。斗柄尽头那一颗，光还很淡。']);
 assert.deepEqual(skyStory('constellation',{seventh:true}),['斗柄所指','斗柄尽头，是瑶光。']);
 assert.equal(skyStory('signal')[0],'冰下的信号');
 // Replay yaw: rebuild app.js focusCamera's close-up and check the view meets sunlight at the asked cosine.
 for(const rig of [{height:.36,distance:5.8,offset:1.12,drop:0},{height:.95,distance:7.1,offset:1.12,drop:0},{height:.36,distance:9.5,offset:0,drop:1.05}])for(const d of [-.62,0]){
  const yaw=closeYawFor({...rig,d}),P=[30,0,-50],len=Math.hypot(...P),l=P.map(x=>-x/len);
  const a=Math.atan2(l[2],l[0])-yaw,s=Math.hypot(1,rig.height),h=[Math.cos(a),0,Math.sin(a)],right=[Math.sin(a),0,-Math.cos(a)];
  const dir=[h[0]/s,rig.height/s,h[2]/s],up=[-rig.height*h[0]/s,1/s,-rig.height*h[2]/s];
  const v=[0,1,2].map(i=>-right[i]*rig.offset+dir[i]*rig.distance-up[i]*rig.drop),n=Math.hypot(...v);
  assert.ok(Math.abs(v[0]/n*l[0]+v[2]/n*l[2]-d)<1e-9,`closeYawFor reaches cos ${d}`);
  assert.ok(Math.sin(Math.atan2(v[2],v[0])-Math.atan2(l[2],l[0]))>0,'Alkaid sits on the right of the frame');
 }
 // Dwell timers: continuous condition only.
 const fired=[],watch=createEggWatch({onFire:id=>fired.push(id)});
 const run=(from,to,flags,step=100)=>{for(let t=from;t<=to;t+=step)watch.update(t,flags);};
 run(0,3900,{lamps:true});assert.deepEqual(fired,[],'3.9 s of lamplight is not enough');
 watch.update(4000,{});run(4100,7900,{lamps:true});assert.deepEqual(fired,[],'a break restarts the lamp dwell');
 run(8000,8200,{lamps:true});assert.deepEqual(fired,['lamps']);
 run(8300,20000,{lamps:true});assert.deepEqual(fired,['lamps'],'one continuous dwell fires once');
 run(0,2900,{terminator:true});assert.equal(fired.includes('terminator'),false);
 run(3000,3100,{terminator:true});assert.equal(fired.includes('terminator'),true);
 // Node has no coarse pointer, so the desktop values apply: 12 s idle + 40 s drift.
 assert.equal(COARSE_POINTER,false);assert.equal(DRIFT.idleMs,12000);
 run(0,39000,{drift:true},1000);assert.equal(fired.includes('drift'),false,'39 s of drift is not enough');
 watch.update(39500,{});run(40000,79000,{drift:true},1000);assert.equal(fired.includes('drift'),false,'an interrupted drift restarts');
 run(80000,80000,{drift:true});assert.equal(fired.includes('drift'),true);
 assert.equal(EGG_TIMING.drift,40);assert.equal(EGG_TIMING.lamps,4);assert.equal(EGG_TIMING.terminator,3);
 const rewound=[],w2=createEggWatch({onFire:id=>rewound.push(id)});w2.update(0,{drift:true});w2.rewind(41);w2.update(1,{drift:true});assert.deepEqual(rewound,['drift'],'rewind is equivalent to waiting');
 // Tap streak: seven taps, each under 1.2 s apart.
 const s=createTapStreak();let hits=0;
 for(let i=0;i<6;i++)hits+=s.tap(i*1100);assert.equal(hits,0);
 hits+=s.tap(6*1100+50);assert.equal(hits,1,'seventh tap within the gap triggers');
 for(let i=0;i<6;i++)hits+=s.tap(20000+i*300);hits+=s.tap(20000+5*300+1300);assert.equal(hits,1,'a slow seventh tap restarts the streak');
 for(let i=0;i<7;i++)hits+=s.tap(40000+i*200,i!==3);assert.equal(hits,1,'a tap outside the overview breaks the streak');
 // Unlocks persist, count once and validate late ids from storage.
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const unlocked=[],tracker=createDiscoveryTracker({storage,onUnlock:d=>unlocked.push(d.id)});
 tracker.unlock('seventh');tracker.unlock('seventh');tracker.unlock('nope');
 assert.deepEqual(unlocked,['seventh']);assert.equal(tracker.has('seventh'),true);
 for(const id of ['lamps','terminator','drift'])tracker.unlock(id);
 assert.equal(createDiscoveryTracker({storage}).getState().unlocked.length,4,'late notes survive a new instance');
 assert.ok(JSON.parse(values.get(DISCOVERY_STORAGE_KEY)).unlocked.some(e=>e.id==='drift'));
 console.log('PASS eggs logic: dwell timers (drift 40 s), tap streak, replay yaw, copy, late notes persist and count once');
}

async function browserChecks(){
 const {chromium}=require('@playwright/test');
 const {DISCOVERY_STORAGE_KEY}=await load('discoveries.js');
 const BASE=(process.env.PREVIEW_URL||process.env.ALKAID_TEST_URL||'http://127.0.0.1:43178').replace(/\/$/,'');
 const OUT=path.resolve(__dirname,'../artifacts/eggs-20261007');fs.mkdirSync(OUT,{recursive:true});
 const report={url:BASE+'/?post=1&intro=0',checks:[],errors:[],screenshots:[]};
 const mark=name=>{report.checks.push(name);console.log('PASS '+name);};
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  // The first four notes are already collected, so all eight can be completed here.
  const seed=JSON.stringify({version:1,visited:[],moons:[],unlocked:['tides','voyager','still-comet','old-signal'].map((id,i)=>({id,at:1790000000000+i}))});
  await context.addInitScript(([key,value])=>{try{if(!localStorage.getItem(key))localStorage.setItem(key,value);}catch{}},[DISCOVERY_STORAGE_KEY,seed]);
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  // Inspect live module state without shipping a test hook.
  await page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__eggs={get eggs(){return eggs},state,camera,controls,bodies,scene,discoveries,get drifting(){return !!drift?.active},get transition(){return !!transition}};'});});
  await page.goto(report.url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.resources==='complete'&&window.observatory?.ready,null,{timeout:90000});
  const unlocked=()=>page.evaluate(()=>__eggs.discoveries.getState().unlocked.map(e=>e.id));
  const has=async id=>(await unlocked()).includes(id);
  // The total lives in the journal now (third summary row); read it even while the dialog is closed.
  const tally=()=>page.locator('#observation-journal #journal-tally .journal-tally-count').textContent();
  const shot=async name=>{await page.screenshot({path:path.join(OUT,name)});report.screenshots.push(name);};
  const taps=(ids,gap)=>page.evaluate(async([ids,gap])=>{for(const id of ids){document.getElementById(id).click();await new Promise(r=>setTimeout(r,gap));}},[ids,gap]);
  const settle=()=>page.waitForFunction(()=>!__eggs.transition&&document.querySelector('#flight-status').hidden,null,{timeout:30000});

  assert.equal(await tally(),'04 / 08');
  assert.equal(await page.locator('#play-panel #journal-tally').count(),0,'the lab keeps only #discovery-note');
  assert.equal(await page.locator('#journal-tally .journal-tally-mark').evaluate(e=>e.hidden),true);
  assert.equal(await page.locator('#seventh-star').evaluate(e=>e.hidden),true,'the replay button stays hidden until earned');
  mark('journal tally (third summary row) counts all eight notes');

  // A slow seventh tap must not count.
  await taps(['home','home','home','home','home','home'],120);await page.waitForTimeout(1500);await taps(['home'],50);
  assert.equal(await has('seventh'),false,'a broken streak does not unlock');
  await page.waitForTimeout(1500);
  // Real streak under reduced motion: toast + unlock, no constellation animation.
  await taps(['star-info','title','title','title','title','title','title'],150);
  await page.waitForFunction(()=>__eggs.discoveries.has('seventh'),null,{timeout:10000});
  assert.equal(await page.locator('#toast').innerText(),'北斗第七星，开阳之外，瑶光所在');
  assert.equal(await page.locator('#toast').evaluate(e=>e.classList.contains('show')),true);
  assert.equal(await page.evaluate(()=>__eggs.eggs.seventh.playing),false,'reduced motion skips the constellation animation');
  assert.equal(await tally(),'05 / 08');
  mark('seven taps on the star name unlock 第七星 with a toast (reduced motion: no animation)');

  // Full animation with motion allowed; a replay does not count twice.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await taps(['home','home','home','home','home','home','home'],150);
  await page.waitForFunction(()=>__eggs.eggs.seventh.playing,null,{timeout:10000});
  const sky=await page.evaluate(()=>{const g=__eggs.scene.getObjectByName('Seventh star'),p=g.getObjectByName('Seventh star points');return{visible:g.visible,points:p.geometry.attributes.position.count,alkaidGain:p.geometry.attributes.alk.array[6]};});
  assert.deepEqual(sky,{visible:true,points:7,alkaidGain:1});
  assert.equal((await unlocked()).filter(id=>id==='seventh').length,1);assert.equal(await tally(),'05 / 08','a replay does not add to the count');
  await page.waitForFunction(()=>{const p=__eggs.scene.getObjectByName('Seventh star points');return p.material.uniforms.uPulse.value>.3;},null,{timeout:15000});
  report.seventhPulse=await page.evaluate(()=>__eggs.scene.getObjectByName('Seventh star points').material.uniforms.uPulse.value);
  await shot('seventh-system.png');
  assert.equal(await page.locator('#seventh-star').evaluate(e=>e.hidden),false,'the earned replay button appears in the lab');
  await page.waitForFunction(()=>!__eggs.eggs.seventh.playing,null,{timeout:20000});
  assert.equal(await page.evaluate(()=>__eggs.scene.getObjectByName('Seventh star').visible),false,'the constellation fades out on its own');
  await page.emulateMedia({reducedMotion:'reduce'});
  mark('seven taps replay seven new dipper stars, Alkaid pulses, then it fades; count unchanged');

  // 灯火: default close-up faces the day side; turning to the night hemisphere for 4 s unlocks.
  await page.locator('#planet-nav [data-id="xunqi"]').click();await page.locator('#visit').click();
  await page.waitForFunction(()=>observatory.mode==='planet');await settle();
  await page.waitForTimeout(4600);
  assert.equal(await has('lamps'),false,'the day-side default view is not the night side');
  assert.equal(await page.evaluate(()=>__eggs.eggs.frame('xunqi',-.62)),true);
  await page.waitForFunction(()=>__eggs.discoveries.has('lamps'),null,{timeout:30000});
  await page.waitForTimeout(400);await shot('lamps-xunqi.png');
  mark('灯火 unlocks after dwelling on the night hemisphere of 浔萋');

  // 晨昏线: lingxi with the view perpendicular to sunlight for 3 s.
  await page.locator('#planet-nav [data-id="lingxi"]').click();
  await page.waitForFunction(()=>observatory.mode==='planet'&&__eggs.state.planet==='lingxi');await settle();
  await page.waitForTimeout(3600);
  assert.equal(await has('terminator'),false,'the default lingxi framing is not on the terminator');
  assert.equal(await page.evaluate(()=>__eggs.eggs.frame('lingxi',0)),true);
  await page.waitForFunction(()=>__eggs.discoveries.has('terminator'),null,{timeout:30000});
  mark('晨昏线 unlocks when the day/night line crosses lingxi near mid-screen');

  // 漂流: idle drift for 60 s uninterrupted (dwell start rewound instead of waiting a minute).
  await page.locator('#home').click();await settle();
  await page.emulateMedia({reducedMotion:'no-preference'});
  const idle=()=>page.evaluate(()=>{__eggs.state.lastActivity=performance.now()-20000;});
  await idle();await page.waitForFunction(()=>__eggs.drifting,null,{timeout:20000});
  await page.waitForFunction(()=>__eggs.eggs.held().drift>0,null,{timeout:10000});
  await page.evaluate(()=>__eggs.eggs.rewind(30));
  await page.mouse.move(700,500);await page.mouse.move(720,520);
  await page.waitForFunction(()=>!__eggs.drifting&&__eggs.eggs.held().drift===0,null,{timeout:10000});
  assert.equal(await has('drift'),false,'moving the pointer interrupts the drift');
  await idle();await page.waitForFunction(()=>__eggs.drifting&&__eggs.eggs.held().drift>0,null,{timeout:20000});
  await page.waitForTimeout(600);assert.equal(await has('drift'),false);
  await page.evaluate(()=>__eggs.eggs.rewind(39.5));
  await page.waitForFunction(()=>__eggs.discoveries.has('drift'),null,{timeout:20000});
  await page.emulateMedia({reducedMotion:'reduce'});
  mark('漂流 unlocks only after an uninterrupted 40 s drift');
  // Reduced motion: no camera drift, but sitting still in the overview runs the same dwell.
  await page.evaluate(()=>{__eggs.state.lastActivity=performance.now();});
  await page.waitForFunction(()=>!__eggs.drifting&&__eggs.eggs.held().drift===0,null,{timeout:10000});
  await idle();await page.waitForFunction(()=>__eggs.eggs.held().drift>0,null,{timeout:10000});
  assert.equal(await page.evaluate(()=>__eggs.drifting),false,'reduced motion never moves the camera');
  await page.evaluate(()=>{__eggs.state.lastActivity=performance.now();});await page.waitForFunction(()=>__eggs.eggs.held().drift===0,null,{timeout:10000});
  assert.equal(await page.evaluate(()=>{__eggs.eggs.replay('drift');return document.querySelector('#toast').textContent;}),'静候片刻，什么都不用做。');
  mark('reduced motion: stillness counts toward 漂流, replay toast says so');

  // Completion mark, journal chapters, persistence.
  assert.equal(await tally(),'08 / 08');
  assert.equal(await page.locator('#journal-tally .journal-tally-mark').evaluate(e=>e.hidden),false);
  assert.equal(await page.locator('#journal-tally').getAttribute('data-complete'),'true');
  assert.equal(await page.locator('#journal-toggle').getAttribute('data-complete'),'true');
  await page.locator('#play-toggle').click();await page.locator('#seventh-star').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#seventh-star').isVisible(),true);
  await shot('lab-tally.png');await page.locator('#play-close').click();
  await page.locator('#journal-toggle').click();
  assert.equal(await page.locator('#observation-journal').getAttribute('data-complete'),'true');
  assert.equal(await page.locator('.journal-intro').innerText(),'八则手记，都已写下。光还在走；下次来时，星海仍在原处。');
  assert.equal((await page.locator('#journal-tally').innerText()).replace(/\s+/g,' ').trim(),'合计 08 / 08 ✦');
  assert.equal(await page.locator('#journal-tally .journal-tally-mark').isVisible(),true);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#journal-title'),'::before').content),'"✦"');
  assert.deepEqual(await page.locator('.journal-summary > span').allInnerTexts(),['卷一 · 远航','卷二 · 静观','合计']);
  assert.equal(await page.locator('.journal-chapter').innerText(),'卷二 · 静观');
  assert.equal(await page.locator('#journal-progress').innerText(),'4 / 4');
  assert.equal(await page.locator('#journal-late-progress').innerText(),'4 / 4');
  assert.equal(await page.locator('[data-discovery][data-unlocked="true"]').count(),8);
  assert.equal(await page.locator('[data-discovery="seventh"] h3').innerText(),'第七星');
  await shot('journal-complete.png');
  await page.locator('#journal-close').click();
  await page.reload();await page.waitForFunction(()=>window.observatory?.ready&&document.body.dataset.resources==='complete',null,{timeout:90000});
  assert.equal(await tally(),'08 / 08','unlocks persist across reload');
  mark('all eight collected: journal closing line, ✦ title, 合计 08 / 08 ✦, two chapters, persisted');
  assert.deepEqual(report.errors,[]);mark('no page or console errors');
  report.passed=true;
 }catch(error){report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));await browser.close();}
}
logicChecks().then(()=>process.argv.includes('--browser')?browserChecks():null).catch(e=>{console.error(e);process.exitCode=1;});
