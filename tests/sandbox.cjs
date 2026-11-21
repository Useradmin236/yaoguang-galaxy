// Verification and visual capture for Cosmic Sandbox 2.0 (Phase 1):
// Free 3D camera (pan/follow/quick views), slingshot spawning of dynamic worlds/stars/pulsars/BHs/probes,
// live body inspector & mass-induced self-collapse, Star x Star supernovae + newborn remnants,
// Star x BH real stellar TDE (no bounce wall), BH x BH gravitational-wave ringdown merger,
// NS x NS kilonova, Roche planetary TDE, molten merger, hypervelocity shatter, and clean Observatory exit.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.PREVIEW_URL || 'http://127.0.0.1:43178').replace(/\/$/, '');
const OUT = path.resolve(process.env.SANDBOX_OUT || path.join(__dirname, '../artifacts/sandbox'));
fs.mkdirSync(OUT, { recursive: true });

async function waitForReady(page) {
 await page.waitForFunction(() => window.observatory && window.observatory.ready === true && window.observatory.sandbox, null, { timeout: 25000 });
 await page.waitForFunction(() => document.getElementById('loading').classList.contains('done'), null, { timeout: 15000 });
}

async function runChecks() {
 const report = { base: BASE, checks: [], errors: [], warnings: [], screenshots: [], metrics: {} };
 const mark = name => { report.checks.push(name); console.log('PASS ' + name); };

 const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
 });
 try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const outbound = [];
  await page.route('**/*', route => {
   if (!route.request().url().startsWith(BASE) && !route.request().url().startsWith('data:')) {
    outbound.push(route.request().url());
    return route.abort();
   }
   return route.continue();
  });
  page.on('pageerror', e => report.errors.push('pageerror: ' + e.message));
  page.on('console', m => {
   if (m.type() === 'error') report.errors.push('console.error: ' + m.text());
   if (m.type() === 'warning' && /THREE\.|WebGL|shader|GL_INVALID/i.test(m.text())) report.warnings.push(m.text());
  });

  // 1. Default load: Sandbox inactive, OrbitControls pan locked
  await page.goto(`${BASE}/?intro=0&post=1`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  const initial = await page.evaluate(() => ({
   active: window.observatory.sandbox.active,
   dockHidden: document.getElementById('sandbox-dock').hidden,
   camBarHidden: document.getElementById('sb-cam-bar').hidden,
   enablePan: window.observatory.sandbox.stats().enablePan
  }));
  assert.equal(initial.active, false, 'sandbox must be inactive by default');
  assert.equal(initial.dockHidden, true, 'sandbox dock must be hidden by default');
  assert.equal(initial.camBarHidden, true, 'sandbox cam bar must be hidden by default');
  assert.equal(initial.enablePan, false, 'default observatory pan must remain false');
  mark('default-observatory-untouched');

  // 2. Open Lab panel and verify featured #enter-sandbox button
  await page.click('#play-toggle');
  await page.waitForSelector('#enter-sandbox', { state: 'visible' });
  await page.screenshot({ path: path.join(OUT, '01-lab-sandbox-entry.png') });
  report.screenshots.push('01-lab-sandbox-entry.png');
  mark('lab-sandbox-entry-visible');

  // 3. Enter Sandbox -> verify free 3D camera unlocked, overlays & live N-body Verlet
  await page.click('#enter-sandbox');
  await page.waitForFunction(() => window.observatory.sandbox.active === true, null, { timeout: 5000 });
  await page.waitForSelector('#sandbox-dock', { state: 'visible' });
  await page.waitForSelector('#sb-cam-bar', { state: 'visible' });

  await page.click('#sb-overlay-btn');
  await page.waitForTimeout(1600);
  const nbodyStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.nbody = nbodyStats;
  assert.equal(nbodyStats.enablePan, true, 'sandbox must unlock free 3D camera pan');
  assert.ok(nbodyStats.starDisp > 0.25, `Alkaid must move via real binary gravity (got ${nbodyStats.starDisp})`);
  assert.ok(nbodyStats.bhDisp > 0.15, `Guixu must move via mutual N-body gravity (got ${nbodyStats.bhDisp})`);
  assert.equal(nbodyStats.alivePlanets, 6, 'all 6 planets alive before collision');
  await page.screenshot({ path: path.join(OUT, '02-sandbox-active-overlays.png') });
  report.screenshots.push('02-sandbox-active-overlays.png');
  mark('nbody-verlet-free-camera-and-overlays');

  // 4. Black Hole Roche Planetary Tidal Disruption (TDE)
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(true);
   sb.setBhMass(22);
   sb.setSpeed(1.5);
   sb.flingBody('guixu', [-24, 1.5, 10], [0.8, 0, -1.2]);
   sb.flingBody('jixi', [-4, 1.5, 22], [-15.5, 0, -9.0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().disrupted >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(700);
  const tdeStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.tde = tdeStats;
  assert.ok(tdeStats.disrupted >= 1, 'TDE must disrupt planet entering Roche limit');
  assert.ok(tdeStats.activeDebris >= 250, `TDE must spawn rich gravity debris stream (got ${tdeStats.activeDebris})`);
  await page.screenshot({ path: path.join(OUT, '03-tde-tidal-disruption.png') });
  report.screenshots.push('03-tde-tidal-disruption.png');
  mark('roche-tidal-disruption-tde');

  // 5. Planetary Giant Impact (Molten Merger)
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(false);
   sb.setBhMass(12.4);
   sb.setSpeed(1.2);
   sb.flingBody('lingxi', [18, 0, 14], [4.0, 0, -1.5]);
   sb.flingBody('xunqi', [31, 0, 11], [-4.8, 0, 1.2]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().mergers >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(420);
  const mergerStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.merger = mergerStats;
  const survivor = mergerStats.planets.find(p => p.mergedCount >= 1);
  assert.ok(survivor && survivor.lavaHeat > 0.25, 'merger must produce glowing molten survivor planet');
  await page.screenshot({ path: path.join(OUT, '04-giant-impact-merger.png') });
  report.screenshots.push('04-giant-impact-merger.png');
  mark('planetary-giant-impact-merger');

  // 6. Planetary Hypervelocity Shatter
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(false);
   sb.setSpeed(1.4);
   sb.flingBody('mingai', [8, 0, 26], [19.5, 0, 0]);
   sb.flingBody('suxian', [32, 0, 26], [-19.5, 0, 0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().shatters >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(420);
  const shatterStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.shatter = shatterStats;
  assert.ok(shatterStats.shatters >= 1 && shatterStats.alivePlanets === 4, 'hypervelocity collision must shatter both planets');
  await page.screenshot({ path: path.join(OUT, '05-hypervelocity-shatter.png') });
  report.screenshots.push('05-hypervelocity-shatter.png');
  mark('planetary-hypervelocity-shatter');

  // 7. NEW Phase 1: Star x Star Collision -> Hypernova Supernova Explosion + Newborn Remnant!
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().aliveStars === 1, null, { timeout: 5000 });
  await page.click('[data-tool="spawn"]');
  await page.waitForSelector('#sb-spawn-bar', { state: 'visible' });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setSpeed(1.4);
   sb.flingBody('yaoguang', [-12, 0, 0], [10, 0, 0]);
   sb.spawnBody('star-red', [14, 0, 0], [-12, 0, 0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().supernovae >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(550);
  const snStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.supernova = snStats;
  assert.ok(snStats.supernovae >= 1, 'Star x Star collision must trigger a real Supernova explosion');
  assert.equal(snStats.starAlive, false, 'Alkaid must be consumed by the supernova');
  assert.ok(snStats.activeDebris >= 550, `Supernova must unleash massive plasma ejecta (got ${snStats.activeDebris})`);
  assert.ok(snStats.aliveNeutronStars >= 1 || snStats.aliveBlackHoles >= 2, 'Supernova must birth a newborn pulsar or black hole remnant');
  await page.screenshot({ path: path.join(OUT, '07-star-supernova-remnant.png') });
  report.screenshots.push('07-star-supernova-remnant.png');
  mark('star-star-supernova-and-remnant');

  // 8. NEW Phase 1: Star x BH Real Stellar TDE (no bounce wall!) + BH x BH Gravitational-Wave Merger!
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().starAlive === true, null, { timeout: 5000 });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setTool('orbit');
   sb.setSpeed(1.5);
   sb.setBhMass(14);
   // Fling Alkaid straight into Guixu (proving bounce bumper is gone!)
   sb.flingBody('guixu', [-14, 0, 4], [4, 0, 0]);
   sb.flingBody('yaoguang', [10, 0, 4], [-10, 0, 0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().stellarTdes >= 1, null, { timeout: 12000 });
  const stTdeStats = await page.evaluate(() => window.observatory.sandbox.stats());
  assert.equal(stTdeStats.starAlive, false, 'Star must be torn apart by Black Hole instead of bouncing');
  assert.ok(stTdeStats.bhMass > 16, `Guixu must absorb star mass and grow (got ${stTdeStats.bhMass})`);

  // Now spawn a 2nd Kerr black hole colliding with Guixu -> BH x BH Gravitational-Wave Merger!
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   const gx = sb.stats().entities.find(e => e.id === 'guixu');
   sb.setOverlays(true);
   sb.spawnBody('bh', [gx.pos[0] + 18, gx.pos[1], gx.pos[2]], [-12, 0, 0], { mass: 12.0 });
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().bhMergers >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(480);
  const bhmStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.bhMerger = bhmStats;
  assert.ok(bhmStats.bhMergers >= 1, 'BH x BH collision must merge with gravitational-wave ringdown');
  assert.ok(bhmStats.bhMass > 24, `Merged Guixu mass must reflect both BHs minus 5% GW energy (got ${bhmStats.bhMass})`);
  await page.screenshot({ path: path.join(OUT, '08-stellar-tde-bh-merger.png') });
  report.screenshots.push('08-stellar-tde-bh-merger.png');
  mark('stellar-tde-and-bh-bh-gw-merger');

  // 9. NEW Phase 1: NS x NS Kilonova + Inspector Live Mass Collapse + Follow-Cam & Spawn UI Capture
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(false);
   sb.setTool('spawn');
   sb.setSpawnType('probe');
   sb.setSpeed(1.4);
   // Crank Jixi mass past 1.8 M☉ -> Planet ignites into a Star!
   sb.setEntityMass('jixi', 2.0);
   // Spawn a ringed gas giant, a slingshot probe, and two colliding pulsars for Kilonova!
   sb.spawnBody('gas', [36, 0, -24], null);
   const probe = sb.spawnBody('probe', [-26, 0, -22], [11, 0, 6]);
   sb.selectEntity(probe.id);
   sb.followBody(probe.id);
   sb.spawnBody('neutron', [16, 0, 26], [8, 0, 0]);
   sb.spawnBody('neutron', [32, 0, 26], [-8, 0, 0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().kilonovae >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(420);
  const kStats = await page.evaluate(() => ({
   stats: window.observatory.sandbox.stats(),
   inspHidden: document.getElementById('sb-inspector').hidden,
   followVisible: !document.getElementById('sb-follow-chip').hidden
  }));
  report.metrics.kilonovaAndInspector = kStats;
  assert.ok(kStats.stats.collapses >= 1, 'cranking planet mass >= 1.8 M☉ must ignite it into a star');
  assert.ok(kStats.stats.kilonovae >= 1, 'NS x NS collision must trigger a Kilonova');
  assert.equal(kStats.inspHidden, false, 'selecting a body must display #sb-inspector');
  assert.equal(kStats.followVisible, true, 'following a body must display #sb-follow-chip');
  await page.screenshot({ path: path.join(OUT, '09-spawn-inspector-kilonova.png') });
  report.screenshots.push('09-spawn-inspector-kilonova.png');
  mark('kilonova-self-collapse-inspector-and-follow');

  // 10. NEW Phase 2: Three-Body Chaos Scenario + Real-Time Climate Era Labels + Scenario Drawer UI
  await page.click('#sb-scenario-btn');
  await page.waitForSelector('#sb-scenario-bar', { state: 'visible' });
  await page.click('[data-scenario="threebody"]');
  await page.waitForFunction(() => window.observatory.sandbox.stats().threeBodyActive === true && window.observatory.sandbox.unlockedEggs.includes('three-body'), null, { timeout: 8000 });
  await page.waitForTimeout(700);
  // Open drawer cleanly for capture so we visually verify Scenario/Phenomena drawer + 3 stars + era labels
  await page.click('#sb-scenario-btn');
  await page.waitForSelector('#sb-scenario-bar', { state: 'visible' });
  const tbStats = await page.evaluate(() => ({
   stats: window.observatory.sandbox.stats(),
   eraLabels: [...document.querySelectorAll('#labels .planet-label small')].map(el => el.textContent)
  }));
  report.metrics.threeBody = tbStats;
  assert.equal(tbStats.stats.aliveStars, 3, 'Three-Body scenario must have 3 alive stars');
  assert.ok(tbStats.stats.unlockedEggs.includes('three-body'), 'Three-Body Easter egg must unlock');
  assert.ok(tbStats.eraLabels.some(t => /纪元|三日/.test(t)), `Planet labels must display live Three-Body climate eras (got ${tbStats.eraLabels.join(', ')})`);
  await page.screenshot({ path: path.join(OUT, '10-threebody-chaos-drawer.png') });
  report.screenshots.push('10-threebody-chaos-drawer.png');
  mark('phase2-threebody-scenario-and-era-egg');

  // 11. NEW Phase 2: Gravitational Slingshot Range -> Auto +Δv Boost & Slingshot Easter Egg
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.loadScenario('slingshot');
   sb.setSpeed(1.6);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().slingshots >= 1 && window.observatory.sandbox.unlockedEggs.includes('slingshot-master'), null, { timeout: 14000 });
  await page.waitForTimeout(350);
  const ssStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.slingshot = ssStats;
  assert.ok(ssStats.slingshots >= 1, 'Slingshot range must achieve real gravity-assist boost');
  assert.ok(ssStats.unlockedEggs.includes('slingshot-master'), 'Slingshot Easter egg must unlock');
  await page.screenshot({ path: path.join(OUT, '11-slingshot-range-boost.png') });
  report.screenshots.push('11-slingshot-range-boost.png');
  mark('phase2-slingshot-range-and-egg');

  // 12. NEW Phase 2: Anti-Gravity Fireworks + Comet Storm + Big Bang Rebirth -> All 5/5 Easter Eggs!
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.triggerPhenomenon('anti-gravity');
   sb.triggerPhenomenon('comet-storm');
  });
  await page.waitForTimeout(550);
  const agStats = await page.evaluate(() => window.observatory.sandbox.stats());
  assert.equal(agStats.antiGravityActive, true, 'anti-gravity phenomenon must invert gravity');
  assert.ok(agStats.unlockedEggs.includes('anti-gravity'), 'anti-gravity Easter egg must unlock');

  await page.evaluate(() => {
   window.observatory.sandbox.triggerPhenomenon('big-bang');
  });
  await page.waitForTimeout(550);
  const bbStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.bigBang = bbStats;
  assert.ok(bbStats.bigBangs >= 1, 'Big Bang rebirth must execute');
  assert.equal(bbStats.eggCount, bbStats.totalEggs, `all ${bbStats.totalEggs} sandbox Easter eggs should be unlocked (got ${bbStats.unlockedEggs.join(', ')})`);
  assert.ok(bbStats.activeDebris >= 800, `Big Bang must unleash cosmic dawn debris (got ${bbStats.activeDebris})`);
  assert.ok(bbStats.totalBodies >= 10, `Big Bang must birth newborn central star + proto-planetary disk (got ${bbStats.totalBodies})`);
  await page.screenshot({ path: path.join(OUT, '12-big-bang-rebirth.png') });
  report.screenshots.push('12-big-bang-rebirth.png');
  mark('phase2-antigravity-comet-storm-bigbang-all-5-eggs');

  // 13. Grab tool state & Clean Exit back to Observatory (restoring pan=false & hiding all sandbox chrome)
  await page.click('[data-tool="grab"]');
  const toolAfter = await page.evaluate(() => window.observatory.sandbox.tool);
  assert.equal(toolAfter, 'grab', 'grab tool button should switch mode');

  await page.click('#sb-exit-btn');
  await page.waitForFunction(() => window.observatory.sandbox.active === false, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const afterExit = await page.evaluate(() => ({
   active: window.observatory.sandbox.active,
   dockHidden: document.getElementById('sandbox-dock').hidden,
   camBarHidden: document.getElementById('sb-cam-bar').hidden,
   inspHidden: document.getElementById('sb-inspector').hidden,
   enablePan: window.observatory.sandbox.stats().enablePan,
   dataAttr: document.body.dataset.sandbox,
   viewLabel: document.getElementById('view-label').textContent
  }));
  assert.equal(afterExit.active, false);
  assert.equal(afterExit.dockHidden, true);
  assert.equal(afterExit.camBarHidden, true);
  assert.equal(afterExit.inspHidden, true);
  assert.equal(afterExit.enablePan, false, 'exiting sandbox must restore Observatory pan=false');
  assert.equal(afterExit.dataAttr, 'false');
  assert.equal(afterExit.viewLabel, '星系全景');
  mark('clean-exit-to-observatory');

  // 11. Mobile layout check (390x844) inside Sandbox (with Spawn Drawer open!)
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  const mPage = await mobileCtx.newPage();
  mPage.on('pageerror', e => report.errors.push('mobile pageerror: ' + e.message));
  await mPage.goto(`${BASE}/?intro=0`, { waitUntil: 'domcontentloaded' });
  await waitForReady(mPage);
  await mPage.evaluate(() => {
   window.observatory.sandbox.enter();
   window.observatory.sandbox.setTool('spawn');
  });
  await mPage.waitForSelector('#sb-spawn-bar', { state: 'visible' });
  await mPage.waitForTimeout(450);
  const mobileLayout = await mPage.evaluate(() => {
   const r = document.getElementById('sandbox-dock').getBoundingClientRect();
   const c = document.getElementById('sb-cam-bar').getBoundingClientRect();
   return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    dockLeft: Math.round(r.left),
    dockRight: Math.round(r.right),
    dockBottom: Math.round(r.bottom),
    camRight: Math.round(c.right),
    vw: window.innerWidth,
    vh: window.innerHeight
   };
  });
  report.metrics.mobileLayout = mobileLayout;
  assert.ok(mobileLayout.overflowX <= 1, `mobile sandbox must not overflow horizontally (${mobileLayout.overflowX})`);
  assert.ok(mobileLayout.dockLeft >= 0 && mobileLayout.dockRight <= mobileLayout.vw + 1, 'mobile dock must stay inside viewport');
  await mPage.screenshot({ path: path.join(OUT, '06-sandbox-mobile.png') });
  report.screenshots.push('06-sandbox-mobile.png');
  await mobileCtx.close();
  mark('mobile-sandbox-layout');

  assert.equal(outbound.length, 0, 'zero external requests allowed: ' + outbound.join(', '));
  assert.equal(report.errors.length, 0, 'console/page errors: ' + report.errors.join('; '));
  assert.equal(report.warnings.length, 0, 'Three/WebGL warnings: ' + report.warnings.join('; '));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  console.log('PASS all sandbox checks (' + report.checks.length + ' checks, ' + report.screenshots.length + ' captures)');
 } finally {
  await browser.close();
 }
}

runChecks().catch(err => {
 console.error(err);
 process.exitCode = 1;
});
