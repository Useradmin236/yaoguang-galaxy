const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';
// Export portraits of the actual fictional worlds, never borrowed planet photos.

const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const id of ['jixi','mingai','lingxi','suxian','xunqi','qitang','yaoguang']){
   await page.goto(`${BASE}/?style=observatory&portrait=${id}#${id}`);await page.waitForFunction(()=>window.observatory?.ready,null,{timeout:60000});await page.locator('#loading.done').waitFor();
   await page.waitForTimeout(350);
   assert.equal(await page.evaluate(()=>observatory.mode),id==='yaoguang'?'star':'planet');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`artifacts/refinement/${id}-detail.png`});
   await page.addStyleTag({content:'header,footer,#details,#labels,.view-meta,#look-switch,#services,#play-toggle,#toast,#fallback,#journal-toggle,#observation-journal,#discovery-notice{visibility:hidden!important}'});
   await page.screenshot({path:`artifacts/refinement/${id}-portrait.png`,clip:id==='yaoguang'?{x:465,y:280,width:770,height:420}:{x:690,y:215,width:650,height:530}});
  }
  await page.goto(BASE);await page.locator('#loading.done').waitFor();
  await page.locator('#play-toggle').click();await page.locator('#summon-comet').click();await page.locator('#play-close').click();await page.waitForTimeout(200);await page.screenshot({path:'artifacts/refinement/comet.png'});
  await page.locator('#play-toggle').click();await page.locator('#sister-stars').click();await page.locator('#play-close').click();await page.waitForTimeout(200);await page.screenshot({path:'artifacts/refinement/echo.png'});
  assert.deepEqual(errors,[]);
  console.log('Captured seven world portraits and two Easter eggs');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
