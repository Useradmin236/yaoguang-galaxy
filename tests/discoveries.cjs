const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';
// Discovery progression is tested without a renderer; --browser verifies real UI wiring.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

async function logicChecks(){
 const source=path.resolve(__dirname,'../discoveries.js');
 assert.ok(fs.existsSync(source),'the discovery system must exist');
 const {createDiscoveryTracker,createDiscoveries,DISCOVERIES,DISCOVERY_STORAGE_KEY}=await import('data:text/javascript;base64,'+fs.readFileSync(source).toString('base64'));
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const unlocked=[],tracker=createDiscoveryTracker({storage,onUnlock:d=>unlocked.push(d.id)});
 assert.equal(DISCOVERIES.length,4);
 tracker.visit('yaoguang');tracker.visit('unknown');tracker.visit('lingxi',99);
 assert.deepEqual(tracker.getState().visited,[],'invalid visits cannot complete exploration');
 tracker.visit('lingxi');tracker.visit('lingxi',0);tracker.visit('lingxi',0);
 assert.equal(unlocked.includes('tides'),false,'revisiting one moon is not a pair');
 tracker.visit('lingxi',1);assert.equal(unlocked.filter(x=>x==='tides').length,1);
 tracker.visit('lingxi',0);assert.equal(unlocked.filter(x=>x==='tides').length,1,'discoveries unlock only once');
 for(const id of ['jixi','mingai','suxian','xunqi'])tracker.visit(id);
 assert.equal(unlocked.includes('voyager'),false,'five planets are not a complete voyage');
 tracker.visit('qitang');assert.equal(unlocked.includes('voyager'),true);
 tracker.update({dt:10,mode:'system',paused:false,cometVisible:true});
 tracker.update({dt:10,mode:'planet',paused:true,cometVisible:true});
 tracker.update({dt:10,mode:'system',paused:true,cometVisible:false});
 assert.equal(unlocked.includes('still-comet'),false,'the visible comet and a paused wide view must coincide');
 for(let i=0;i<20;i++)tracker.update({dt:.1,mode:'system',paused:true,cometVisible:true});
 assert.equal(unlocked.includes('still-comet'),true);
 tracker.visit('suxian',1);tracker.visit('suxian',4);tracker.visit('suxian',2);
 assert.equal(unlocked.includes('old-signal'),false,'a wrong sequence must not unlock the old signal');
 tracker.visit('qitang');tracker.visit('suxian',2);tracker.visit('suxian',1);tracker.visit('suxian',4);
 assert.equal(unlocked.includes('old-signal'),true);
 const restored=createDiscoveryTracker({storage});
 assert.equal(restored.getState().unlocked.length,4,'all discoveries survive a new instance');
 assert.equal(restored.getState().visited.length,6);
 const snapshot=restored.getState();snapshot.visited.length=0;
 assert.equal(restored.getState().visited.length,6,'callers cannot mutate progress');
 values.set(DISCOVERY_STORAGE_KEY,'not json');
 assert.doesNotThrow(()=>createDiscoveryTracker({storage}).visit('lingxi'));
 const blocked={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
 const privateTracker=createDiscoveryTracker({storage:blocked});
 assert.equal(privateTracker.getState().storageAvailable,false,'blocked storage is disclosed before the first visit');
 privateTracker.visit('lingxi',0);privateTracker.visit('lingxi',1);
 assert.equal(privateTracker.getState().unlocked[0].id,'tides','storage failures cannot prevent discoveries');
 values.set(DISCOVERY_STORAGE_KEY,JSON.stringify({visited:['unknown','lingxi','lingxi'],moons:['lingxi:99'],unlocked:[{id:'unknown',at:1},{id:'tides',at:'invalid'}]}));
 const sanitized=createDiscoveryTracker({storage});
 assert.deepEqual(sanitized.getState().visited,['lingxi']);
 assert.equal(sanitized.getState().unlocked.length,0);
 assert.doesNotThrow(()=>createDiscoveries({storage:null}).dispose(),'the discovery API also works without a document or renderer');
 const readModule=filename=>import('data:text/javascript;base64,'+fs.readFileSync(filename).toString('base64'));
 const {PLANETS:now}=await readModule(path.resolve(__dirname,'../data.js'));
 assert.deepEqual(now.map(p=>p.name),['霁晞','暝霭','聆汐','素霰','浔萋','栖棠']);
 for(const item of [...now,...now.flatMap(p=>p.moons)]){
  for(const field of ['url','base','copy'])if(item[field]){
   const url=new URL(item[field]);
   assert.equal(url.protocol,'https:');
   assert.equal(url.hostname,'example.com','the public demo may only contain example service addresses');
   assert.equal(url.username+url.password,'','example links must contain no credentials');
  }
 }
 assert.equal(now.flatMap(p=>p.moons).length,14);
 assert.equal(new Set(now.flatMap(p=>p.moons.map(m=>m.title))).size,14,'the fourteen moon names are distinct');
 console.log('PASS discovery logic: prerequisites, persistence, corrupt storage, defensive snapshots');
}

async function browserChecks(){

 const {chromium}=require('@playwright/test');
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const artifacts=path.resolve(__dirname,'../artifacts/discoveries');fs.mkdirSync(artifacts,{recursive:true});
 const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.env.ALKAID_TEST_URL||BASE);
  await page.locator('#loading.done').waitFor();
  await page.locator('#journal-toggle').click();
  assert.equal(await page.locator('#observation-journal').isVisible(),true);
  assert.equal(await page.locator('#journal-progress').innerText(),'0 / 4');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#observation-journal').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'journal-toggle');
  const visit=async id=>{await page.locator(`#planet-nav [data-id="${id}"]`).click();if(await page.locator('#visit').isVisible())await page.locator('#visit').click();};
  await page.locator('#planet-nav [data-id="lingxi"]').click();
  await page.locator('#journal-toggle').click();
  assert.equal(await page.locator('#journal-voyage [data-visited="true"]').count(),0,'reading a card is not a visit');
  await page.locator('#journal-close').click();await page.locator('#visit').click();
  await page.locator('#satellites button').nth(0).click();
  await page.locator('#satellites button').nth(1).click();
  await page.locator('#journal-toggle').click();
  assert.equal(await page.locator('[data-discovery="tides"]').getAttribute('data-unlocked'),'true');
  await page.locator('#journal-close').click();
  for(const id of ['jixi','mingai','suxian','xunqi','qitang'])await visit(id);
  await visit('suxian');
  for(const i of [2,1,4])await page.locator('#satellites button').nth(i).click();
  await page.locator('#home').click();await page.locator('#play-toggle').click();
  await page.locator('#summon-comet').click();await page.locator('#play-close').click();
  await page.waitForTimeout(3000);
  await page.locator('#journal-toggle').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-discovery][data-unlocked="true"]').length===4);
  assert.equal(await page.locator('#journal-progress').innerText(),'4 / 4');
  await page.screenshot({path:path.join(artifacts,'journal-desktop.png')});
  await page.reload();await page.locator('#loading.done').waitFor();await page.locator('#journal-toggle').click();
  assert.equal(await page.locator('#journal-progress').innerText(),'4 / 4','real localStorage persists over reload');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(artifacts,'journal-mobile.png')});
  await page.locator('#journal-close').click();await visit('suxian');
  const journalButton=await page.locator('#journal-toggle').boundingBox(),serviceRail=await page.locator('#services').boundingBox();
  assert.ok(journalButton.x+journalButton.width<serviceRail.x,'mobile journal must not overlap the service rail');
  await page.screenshot({path:path.join(artifacts,'moon-names-mobile.png')});
  await page.setViewportSize({width:320,height:720});
  const narrowButton=await page.locator('#journal-toggle').boundingBox(),narrowRail=await page.locator('#services').boundingBox();
  assert.ok(narrowButton.x+narrowButton.width<narrowRail.x,'320px journal must stay clear of service navigation');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(artifacts,'moon-names-narrow.png')});
  await page.locator('#journal-toggle').click();await page.locator('#journal-return').click();
  assert.equal(await page.locator('#observation-journal').isVisible(),false,'the continue action remains reachable in a scrolling mobile journal');
  await page.locator('#journal-toggle').click();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'journal-close');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify({passed:true,errors,checks:['real navigation prerequisite','all four real discoveries','journal Escape/focus','persistent reload','390px and 320px navigation does not overlap','scrolling journal return action','moon names']},null,2));
  console.log('PASS discovery browser: all four real triggers, persistent journal, responsive layout, zero console errors');
 }finally{await browser.close();}
}
logicChecks().then(()=>process.argv.includes('--browser')?browserChecks():null).catch(e=>{console.error(e);process.exitCode=1;});
