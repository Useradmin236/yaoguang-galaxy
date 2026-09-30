
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const errors=[],failed=[],outbound=[],checked=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()})});
  await page.route('**/*',route=>{
   if(new URL(route.request().url()).origin!==BASE){outbound.push(route.request().url());return route.abort();}
   return route.continue();
  });
  await page.goto(BASE+'/gallery.html');
  for(const view of ['system','lingxi','suxian','mobile']){
   await page.locator(`[data-view="${view}"]`).click();
   await page.locator('.preview img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
   assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
   for(const card of await page.locator('.look').all()){
    const style=await card.getAttribute('data-style');
    const im=card.locator('img');
    assert.ok(await im.evaluate(img=>img.naturalWidth>300));
    assert.equal(await im.getAttribute('src'),`vendor/previews/${style}-${view}.webp`);
    assert.equal(await card.locator('.preview').getAttribute('href'),await im.getAttribute('src'));
    checked.push(`${style}-${view}`);
   }
   const comparison=await page.locator('#comparison').getAttribute('href');
   assert.equal((await page.request.get(BASE+'/'+comparison)).status(),200);
  }
  await page.locator('[data-view="suxian"]').click();
  await page.locator('.preview img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  await page.screenshot({path:'artifacts/looks/gallery-desktop.png',fullPage:true});
  await page.reload();assert.equal(await page.locator('[data-view="suxian"]').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Tab');
  for(let i=0;i<8&&(await page.evaluate(()=>document.activeElement.dataset.view))!=='lingxi';i++)await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.view),'lingxi');
  await page.keyboard.press('Enter');assert.equal(await page.locator('[data-view="lingxi"]').getAttribute('aria-pressed'),'true');
  await page.locator('.look[data-style="cinema"] .enter').click();
  await page.waitForFunction(()=>window.observatory?.ready===true);
  assert.equal(await page.locator('body').getAttribute('data-look'),'cinema');
  assert.equal(new URL(page.url()).hash,'#lingxi');
  assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  await page.locator('#satellites button').first().click();
  const moonHash=new URL(page.url()).hash;
  await page.locator('#look-toggle').click();
  await page.locator('#look-links a[data-style="nebula"]').click();
  await page.waitForFunction(()=>window.observatory?.ready===true);
  assert.equal(await page.evaluate(()=>observatory.mode),'moon');
  assert.equal(new URL(page.url()).hash,moonHash);
  assert.equal(await page.locator('body').getAttribute('data-look'),'nebula');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  await page.locator('#look-toggle').click();await page.locator('.gallery-link').click();
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   await page.locator('[data-view="mobile"]').click();
   await page.locator('.preview img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`artifacts/looks/gallery-mobile-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(outbound,[]);
  fs.writeFileSync('artifacts/looks/gallery-results.json',JSON.stringify({date:new Date().toISOString(),passed:true,images:checked.length,comparisons:4,checks:['16 images decoded','four comparison images HTTP 200','gallery keyboard and hash restore','enter selected 3D view','actual style switch preserves moon selection','return to gallery','390px and 320px no overflow','no external runtime requests'],errors,failed},null,2));
  console.log('PASS gallery: 16 images, 4 comparison sheets, keyboard, actual style switch, mobile, no 404 or console errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
