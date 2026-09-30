const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';

const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const results=[];
 for(const style of ['observatory','cinema','atlas','nebula']){
  await page.setViewportSize({width:1440,height:960});await page.goto(`${BASE}/?style=${style}`);await page.locator('#loading.done').waitFor();await page.waitForTimeout(750);
  assert.equal(await page.locator('body').getAttribute('data-look'),style);assert.equal(await page.locator('#details').isVisible(),false);
  await page.screenshot({path:`artifacts/looks/${style}-system.png`});
  for(const planet of ['lingxi','suxian']){
   await page.locator(`#planet-nav button[data-id="${planet}"]`).click();if(await page.locator('#visit').isVisible())await page.locator('#visit').click();await page.waitForTimeout(500);
   assert.ok(page.url().includes(`style=${style}`));
   await page.screenshot({path:`artifacts/looks/${style}-${planet}.png`});
   await page.locator('#satellites button').first().click();assert.equal(await page.evaluate(()=>observatory.mode),'moon');
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  }
  await page.locator('#look-toggle').click();assert.equal(await page.locator('#look-links a').count(),4);
  for(const a of await page.locator('#look-links a').all())assert.ok((await a.getAttribute('href')).includes('#suxian'));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#look-menu').isVisible(),false);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await page.screenshot({path:`artifacts/looks/${style}-mobile.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const nav=await page.locator('#planet-nav').boundingBox();assert.ok(nav.x>=0&&nav.x+nav.width<=391);
  await page.locator('#home').click();assert.equal(await page.evaluate(()=>observatory.mode),'system');assert.ok(page.url().includes(`style=${style}`));
  results.push({style,passed:true});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/looks/results.json',JSON.stringify({passed:true,results,errors},null,2));console.log('PASS four styles: screenshot, moon navigation, URL persistence, mobile, console');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
