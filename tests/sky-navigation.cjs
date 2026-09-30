// Real scene + pointer navigation regression for the September 24 feedback.

const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';
const OUT=path.resolve(process.env.SKY_OUT||'artifacts/sky-navigation');
fs.mkdirSync(OUT,{recursive:true});
const report={base:BASE,checks:[],errors:[],screenshots:[]};
const mark=name=>{report.checks.push(name);console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});

  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  // Inspect the actual scene without adding test hooks to the shipped app.
  await page.route('**/app.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__skyTest={bodies,scene,camera};'});});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.resources==='complete',null,{timeout:60000});
  const shot=async name=>{await page.screenshot({path:path.join(OUT,name+'.png')});report.screenshots.push(name+'.png');};
  await page.locator('#planet-nav [data-id="lingxi"]').click();
  assert.equal(await page.evaluate(()=>observatory.mode),'system');
  await page.locator('#visit').click();
  await page.waitForFunction(()=>observatory.mode==='planet'&&document.querySelector('#flight-status').hidden);
  await page.waitForTimeout(250);
  await shot('desktop-closeup');
  report.visiblePlanets=await page.evaluate(()=>__skyTest.bodies.filter(b=>b.root.visible).map(b=>b.def.id));
  assert.equal(report.visiblePlanets.length,6,'entering a closeup must not remove the other five planets from the scene');
  mark('all six physical planets remain in the closeup scene');
  assert.equal(await page.locator('#planet-nav img').count(),6);
  assert.equal(await page.locator('#planet-nav img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),true);
  assert.equal(await page.locator('#system-map').isVisible(),true);
  await page.locator('#system-map [data-world="suxian"]').click();
  assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  assert.equal(new URL(page.url()).hash,'#suxian');
  await page.locator('#planet-nav [data-id="qitang"]').click();
  assert.equal(new URL(page.url()).hash,'#qitang');
  assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  await page.goBack();assert.equal(new URL(page.url()).hash,'#suxian');
  mark('map and planet thumbnails switch closeups directly, with history');
  await page.locator('#satellites button').first().click();
  assert.equal(await page.evaluate(()=>observatory.mode),'moon');
  await page.locator('#planet-nav [data-id="lingxi"]').click();
  assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  mark('a satellite closeup can also switch directly to another planet');
  await page.locator('#satellites button').nth(0).click();await page.locator('#satellites button').nth(1).click();
  await page.locator('#journal-toggle').click();
  await page.locator('[data-discovery="tides"] .journal-replay').click();
  await page.waitForFunction(()=>document.querySelector('#sky-event-status').dataset.event==='aurora');
  assert.equal(new URL(page.url()).hash,'#lingxi');mark('an earned journal entry replays its celestial effect');
  await page.locator('#sky-event-stop').click();
  for(const [button,event] of [['meteor-shower','meteors'],['trace-constellation','constellation'],['polar-lights','aurora'],['ice-signal','signal']]){
   await page.locator('#play-toggle').click();await page.locator('#'+button).click();
   if(await page.locator('#play-panel').isVisible())await page.locator('#play-close').click();
   await page.waitForFunction(id=>document.querySelector('#sky-event-status')?.dataset.event===id,event);
   await page.waitForTimeout(350);
   assert.equal(await page.locator('#sky-event-status').isVisible(),true);
   report[event]=await page.evaluate(()=>__skyTest.scene.getObjectByName('Sky phenomena')?.children.filter(o=>o.visible).map(o=>o.name));
   assert.ok(report[event]?.includes(event),'the effect must be rendered in the scene');
   await shot('desktop-'+event);mark(event+' renders a real celestial effect');
   await page.locator('#sky-event-stop').click();
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#play-toggle').click();await page.locator('#meteor-shower').click();
  await page.locator('#flight-status').waitFor({state:'hidden'});
  const meteorPosition=()=>page.evaluate(()=>Array.from(__skyTest.scene.getObjectByName('meteors').children[0].geometry.attributes.position.array).slice(0,3));
  await page.waitForTimeout(250);const moving=await meteorPosition();await page.waitForTimeout(450);
  assert.notDeepEqual(await meteorPosition(),moving,'a meteor must travel when time runs');
  await page.locator('#pause').click();await page.waitForTimeout(150);const stopped=await meteorPosition();await page.waitForTimeout(300);
  assert.deepEqual(await meteorPosition(),stopped,'pause must freeze the visible meteor');
  await page.locator('#sky-event-stop').click();await page.emulateMedia({reducedMotion:'reduce'});
  mark('celestial motion advances and the pause control freezes it');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#home').click();
  await page.locator('#planet-nav [data-id="lingxi"]').click();
  if(await page.locator('#visit').isVisible())await page.locator('#visit').click();
  await shot('mobile-closeup');
  for(const button of await page.locator('#planet-nav button').all()){
   assert.equal(await button.isVisible(),true);await button.click();assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:320,height:740});await shot('mobile-320');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  mark('390px and 320px screens retain all six clickable planet thumbnails');
  assert.deepEqual(report.errors,[]);mark('no application errors');
 }catch(error){report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
