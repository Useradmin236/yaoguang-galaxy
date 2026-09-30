const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';
// Catches accidental fly-on-select, incorrect physical periods, and dead controls.

const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(BASE);await page.locator('#loading.done').waitFor();
  await page.locator('#planet-nav [data-id="lingxi"]').click();
  assert.equal(await page.evaluate(()=>observatory.mode),'system','selecting a planet must keep the system view');
  assert.equal(await page.locator('#details').isVisible(),true);
  assert.match(await page.locator('#facts').innerText(),/159\.1/);
  assert.match(await page.locator('#facts').innerText(),/1\.05/);
  await page.locator('#visit').click();assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  await page.locator('#satellites button').nth(1).click();assert.equal(await page.evaluate(()=>observatory.mode),'moon');
  await page.goBack();assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  await page.goBack();assert.equal(await page.evaluate(()=>observatory.mode),'system');
  assert.equal(await page.locator('#title').innerText(),'聆汐');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#details').isVisible(),false);
  await page.locator('#star-info').click();assert.equal(await page.locator('#title').innerText(),'瑶光');
  assert.match(await page.locator('#facts').innerText(),/16,800/);
  await page.locator('#visit').click();assert.equal(await page.evaluate(()=>observatory.mode),'star');
  await page.locator('#home').click();
  await page.locator('#clean').click();await page.locator('#play-toggle').click();
  assert.equal(await page.locator('#play-panel').isVisible(),true,'lab must be usable from immersion');
  await page.locator('#play-close').click();
  await page.locator('#play-toggle').click();
  await page.locator('#time-scale').fill('4');await page.locator('#pause').click();
  const t=await page.evaluate(()=>observatory.time);await page.waitForTimeout(450);
  assert.ok(await page.evaluate(()=>observatory.time)>t,'explicit play works even with reduced motion');
  await page.locator('#pause').click();
  await page.locator('#tune-planet').selectOption('lingxi');
  await page.locator('#orbit-radius').fill('2.1');
  await page.locator('#cloud-cover').fill('0');
  await page.reload();await page.locator('#loading.done').waitFor();
  await page.locator('#play-toggle').click();await page.locator('#tune-planet').selectOption('lingxi');
  assert.equal(await page.locator('#orbit-radius').inputValue(),'2.1');assert.equal(await page.locator('#cloud-cover').inputValue(),'0');
  await page.locator('#cloud-cover').fill('0.7');assert.equal(await page.locator('#cloud-cover').isEnabled(),true);
  await page.locator('#play-close').click();await page.locator('#planet-nav [data-id="lingxi"]').click();
  assert.match(await page.locator('#facts').innerText(),/450\.0/);
  await page.locator('#play-toggle').click();await page.locator('#reset-settings').click();
  await page.locator('#play-close').click();
  assert.match(await page.locator('#facts').innerText(),/159\.1/);
  for(const id of ['jixi','mingai','lingxi','suxian','xunqi','qitang']){
   await page.locator(`#planet-nav [data-id="${id}"]`).click();
   if(await page.locator('#visit').isVisible())await page.locator('#visit').click();await page.waitForTimeout(150);
   assert.equal(await page.locator('#portrait').evaluate(e=>e.complete&&e.naturalWidth>0),true);
   await page.screenshot({path:`artifacts/refinement/${id}.png`});
  }
  await page.locator('#home').click();await page.screenshot({path:'artifacts/refinement/system.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#planet-nav [data-id="lingxi"]').click();await page.screenshot({path:'artifacts/refinement/mobile-card.png'});
  await page.locator('#visit').click();await page.screenshot({path:'artifacts/refinement/mobile-planet.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#play-toggle').click();await page.screenshot({path:'artifacts/refinement/mobile-controls.png'});
  assert.equal(await page.locator('#reset-settings').isVisible(),true);
  await page.setViewportSize({width:320,height:720});await page.locator('#reset-settings').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('artifacts/refinement/results.json',JSON.stringify({passed:true,errors,checks:['select before flight','Kepler periods','star description and close view','history and Escape','explicit play','orbit tuning recalculates period','restore defaults','six portraits','mobile cards and controls']},null,2));
  console.log('PASS refinement');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
