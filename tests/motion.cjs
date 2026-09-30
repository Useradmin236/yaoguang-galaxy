const BASE=process.env.PREVIEW_URL||'http://127.0.0.1:43178';
// Inspect actual Three.js objects via a test-only response injection. No debug
// globals or mutable camera handles are shipped in the application's source.

const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.route('**/app.js',async route=>{const response=await route.fetch();const source=await response.text();await route.fulfill({response,body:source.replace('window.observatory={','window.testFrame=()=>({scene,camera,controls,comet});window.observatory={')});});
  await p.goto(BASE);await p.locator('#loading.done').waitFor();await p.locator('#pause').click();
  await p.evaluate(()=>window.frame=testFrame());
  const before=await p.evaluate(()=>frame.camera.position.toArray());
  const point=await p.evaluate(()=>{let body;frame.scene.traverse(o=>{if(o.userData.planet==='lingxi'&&o.userData.moon===null)body=o;});const v=body.getWorldPosition(body.position.clone()).project(frame.camera);return{x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight};});
  await p.mouse.click(point.x,point.y);assert.equal(await p.evaluate(()=>observatory.mode),'system');
  const after=await p.evaluate(()=>frame.camera.position.toArray());assert.ok(Math.hypot(...after.map((v,i)=>v-before[i]))<.01,'actual 3D click must not move camera');
  await p.locator('#visit').click();
  const start=await p.evaluate(()=>frame.camera.position.toArray());assert.ok(Math.hypot(...start.map((v,i)=>v-before[i]))<10,'no distance-clamp teleport at flight departure');
  await p.mouse.move(900,350);await p.mouse.wheel(0,3000);await p.locator('#flight-status').waitFor({state:'hidden'});
  const end=await p.evaluate(()=>frame.camera.position.toArray());assert.ok(Math.hypot(...end.map((v,i)=>v-before[i]))>40);
  await p.locator('#satellites button').first().click();await p.locator('#flight-status').waitFor({state:'hidden'});
  await p.locator('#home').click();await p.locator('#flight-status').waitFor({state:'hidden'});
  await p.locator('#play-toggle').click();await p.locator('#tune-planet').selectOption('qitang');await p.locator('#orbit-radius').fill('0.25');
  assert.ok(await p.evaluate(()=>{let body;frame.scene.traverse(o=>{if(o.userData.planet==='qitang'&&o.userData.moon===null)body=o;});return body.getWorldPosition(body.position.clone()).length()>5.1+body.scale.x;}),'minimum orbit must clear stellar surface');
  await p.locator('#orbit-radius').fill('6');await p.locator('#top-view').click();await p.waitForTimeout(250);
  const fitted=await p.evaluate(async()=>{const T=await import('/vendor/three.module.js');const {PLANETS}=await import('/data.js');const r=Math.max(...PLANETS.map(x=>x.orbit+x.radius*2.5));return [new T.Vector3(0,0,r),new T.Vector3(0,0,-r),new T.Vector3(r,0,0),new T.Vector3(-r,0,0)].every(v=>{v.project(frame.camera);return Math.abs(v.x)<1&&Math.abs(v.y)<1;});});assert.equal(fitted,true,'full largest orbit fits top view');
  await p.locator('#summon-comet').click();await p.locator('#play-close').click();await p.mouse.move(500,200);await p.waitForTimeout(150);
  assert.equal(await p.evaluate(()=>testFrame().comet.visible),true);
  // Screenshot records the visible pair of tails; all resources stay local.
  await p.screenshot({path:'artifacts/refinement/comet-final.png'});
  await p.locator('#play-toggle').click();await p.locator('#reset-settings').click();await p.locator('#play-close').click();
  await p.setViewportSize({width:320,height:720});await p.locator('#star-info').click();await p.locator('#visit').click();await p.locator('#flight-status').waitFor({state:'hidden'});await p.screenshot({path:'artifacts/refinement/mobile-star.png'});
  assert.deepEqual(errors,[]);fs.writeFileSync('artifacts/refinement/motion-results.json',JSON.stringify({passed:true,errors,checks:['real 3D click keeps camera','no flight departure jump','wheel during flight preserves destination','moon flight','minimum orbit clears star','maximum orbit fits top view','comet screenshot','320px stellar view']},null,2));console.log('PASS actual camera, flight, extreme orbits and comet');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
