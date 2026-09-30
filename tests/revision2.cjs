const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';

const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PNG}=require('pngjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>requests.push(r.url()));
 await page.goto(BASE);await page.locator('#loading.done').waitFor();await page.waitForTimeout(1000);
 assert.equal(await page.locator('#details').isVisible(),false);
 assert.ok((await page.locator('#services').boundingBox()).width<80);
 assert.ok((await page.locator('#planet-nav').boundingBox()).height<65);
 await page.screenshot({path:'artifacts/revision2/01-system.png'});
 for(const id of ['jixi','lingxi','xunqi','mingai','suxian','qitang']){
  await page.locator(`#planet-nav button[data-id="${id}"]`).click();if(await page.locator('#visit').isVisible())await page.locator('#visit').click();await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>observatory.mode),'planet');
  await page.screenshot({path:`artifacts/revision2/${id}.png`});
  await page.locator('#satellites button').first().click();await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>observatory.mode),'moon');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>observatory.mode),'planet');
 }
 await page.locator('#planet-nav button[data-id="lingxi"]').click();await page.locator('#satellites button').nth(1).click();await page.locator('#moon-action button').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://example.com/lingxi/v1');
 await page.goBack();assert.equal(await page.evaluate(()=>observatory.mode),'planet');
 const time=await page.evaluate(()=>observatory.time);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>observatory.time),time);
 await page.locator('#home').click();
 await page.locator('#nav-toggle').click();assert.equal(await page.locator('#service-links a').count(),5);await page.mouse.move(600,200);await page.keyboard.press('Escape');
 assert.equal(await page.locator('#services').evaluate(e=>e.classList.contains('expanded')),false);
 await page.setViewportSize({width:390,height:844});await page.mouse.click(180,400);await page.waitForTimeout(300);
 await page.screenshot({path:'artifacts/revision2/mobile-system.png'});
 await page.locator('#planet-nav button[data-id="lingxi"]').click();await page.locator('#visit').click();await page.waitForTimeout(500);await page.screenshot({path:'artifacts/revision2/mobile-lingxi.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#planet-nav button[data-id="suxian"]').click();await page.waitForTimeout(500);await page.screenshot({path:'artifacts/revision2/mobile-suxian.png'});
 assert.ok(!requests.some(x=>x.includes('earth')),'no Earth textures requested');assert.deepEqual(errors,[]);
 const textureStats=[];for(const id of ['jixi','lingxi','xunqi','mingai','suxian','qitang']){const im=PNG.sync.read(fs.readFileSync(`vendor/textures/worlds/${id}-albedo.png`));let seam=0;for(let y=0;y<im.height;y++)for(let c=0;c<3;c++)seam=Math.max(seam,Math.abs(im.data[(y*im.width)*4+c]-im.data[(y*im.width+im.width-1)*4+c]));assert.equal(seam,0);textureStats.push({id,seamMax:seam});}
 fs.writeFileSync('artifacts/revision2/results.json',JSON.stringify({passed:true,errors,textureStats,checks:['no Earth texture requests','original six maps with exact longitude seams','six planets and functional moons','API copy','history','reduced motion','compact overview UI','390px no overflow']},null,2));console.log('PASS revision2 checks');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
