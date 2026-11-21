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
  assert.equal(nbodyStats.alivePlanets, 6, 'all 6 planets must remain alive without spontaneous collisions');
  assert.equal(nbodyStats.impacts, 0, 'calm wide startup must have zero spontaneous impacts');
  assert.equal(nbodyStats.disrupted, 0, 'calm wide startup must have zero spontaneous disruptions');

  // Verify true 100x fast-forward advances simTime smoothly without tunneling/exploding
  const tBefore = nbodyStats.simTime;
  await page.evaluate(() => window.observatory.sandbox.setSpeed(100));
  await page.waitForTimeout(700);
  const fastStats = await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   const st = sb.stats();
   sb.setSpeed(1);
   return st;
  });
  report.metrics.fast100x = { tBefore, tAfter: fastStats.simTime, alivePlanets: fastStats.alivePlanets, impacts: fastStats.impacts };
  assert.ok(fastStats.simTime - tBefore > 6, `100x speed must advance simTime rapidly (delta=${(fastStats.simTime - tBefore).toFixed(2)})`);
  assert.equal(fastStats.alivePlanets, 6, 'wide calm system must stay intact even during 100x burst');

  await page.screenshot({ path: path.join(OUT, '02-sandbox-active-overlays.png') });
  report.screenshots.push('02-sandbox-active-overlays.png');
  mark('nbody-verlet-calm-wide-startup-and-100x-speed');

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
   sb.spawnBody('neutron', [16, 10, 44], [9, 0, 0]);
   sb.spawnBody('neutron', [32, 10, 44], [-9, 0, 0]);
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

  // 13. NEW Phase 3A: Global Physics Laws Drawer, Stationary 0 km/s Spawn, Planet-Planet Moon Capture, Pin Anchor & Snapshot!
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  await page.click('#sb-laws-btn');
  await page.waitForSelector('#sb-laws-bar', { state: 'visible' });
  const phase3aSetup = await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setSpeed(0);
   sb.setPlanetGravityBoost(8.0);
   // 1) Stationary spawn check
   const stillBody = sb.spawnBody('rocky', [58, 0, -34], null, { stationary: true, name: '静止测试星' });
   const stillSpd = stillBody.vel.length();
   // 2) Moon capture around gas giant Suxian using upgraded dominantAttractorNear!
   const sux = sb.stats().entities.find(e => e.id === 'suxian');
   sb.setEntityPinned('suxian', true);
   const moon = sb.spawnBody('moon-ice', [sux.pos[0] + 10.5, 0, sux.pos[2]], null, { name: '苏仙冰月' });
   const moonInitDist = Math.hypot(moon.pos.x - sux.pos[0], moon.pos.z - sux.pos[2]);
   sb.saveSnapshot();
   return { stillId: stillBody.id, stillSpd, moonId: moon.id, moonInitDist, suxInitPos: sux.pos, hasSnap: sb.stats().hasSnapshot };
  });
  assert.ok(phase3aSetup.stillSpd < 0.01, `stationary spawn must have 0 speed (got ${phase3aSetup.stillSpd})`);
  assert.equal(phase3aSetup.hasSnap, true, 'snapshot must be saved');

  await page.evaluate(() => window.observatory.sandbox.setSpeed(1.8));
  await page.waitForTimeout(1100);
  const phase3aMid = await page.evaluate(({ moonId, suxInitPos }) => {
   const sb = window.observatory.sandbox;
   const ents = sb.stats().entities;
   const sux = ents.find(e => e.id === 'suxian');
   const moon = ents.find(e => e.id === moonId);
   const suxMove = sux ? Math.hypot(sux.pos[0] - suxInitPos[0], sux.pos[2] - suxInitPos[2]) : 999;
   const moonDist = (sux && moon) ? Math.hypot(moon.pos[0] - sux.pos[0], moon.pos[2] - sux.pos[2]) : 999;
   return { suxMove, moonDist, moonAlive: !!moon };
  }, { moonId: phase3aSetup.moonId, suxInitPos: phase3aSetup.suxInitPos });
  report.metrics.phase3aLaws = { phase3aSetup, phase3aMid };
  assert.ok(phase3aMid.suxMove < 0.05, `pinned spatial anchor must not move (moved ${phase3aMid.suxMove})`);
  assert.ok(phase3aMid.moonAlive && phase3aMid.moonDist < 22, `ice moon must stay bound orbiting Suxian (dist=${phase3aMid.moonDist.toFixed(1)})`);
  await page.screenshot({ path: path.join(OUT, '13-phase3a-laws-moon-capture.png') });
  report.screenshots.push('13-phase3a-laws-moon-capture.png');

  // Verify Snapshot Restore recovers deleted planets & saved laws cleanly
  const snapRestore = await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.deleteEntity('jixi');
   const afterDel = sb.stats().alivePlanets;
   sb.restoreSnapshot();
   const afterRest = sb.stats().alivePlanets;
   return { afterDel, afterRest };
  });
  assert.equal(snapRestore.afterDel, 5, 'deleteEntity should reduce alive planets to 5');
  assert.equal(snapRestore.afterRest, 6, 'restoreSnapshot must recover all 6 planets');
  mark('phase3a-laws-stationary-moon-capture-pin-snapshot');

  // 14. NEW Phase 3A: Critical Spin Breakup vs Breakup-Lock + Upgraded Inspector + White Dwarf Type Ia + Elastic Bounce!
  await page.click('#sb-laws-btn'); // close laws drawer so inspector screenshot is super clean
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.reset();
   sb.setSpeed(1.5);
   sb.selectEntity('lingxi');
   sb.followBody('lingxi');
   const ent = sb.stats().entities.find(e => e.id === 'lingxi');
   sb.setEntityNoBreakup('lingxi', true);
   sb.setEntitySpin('lingxi', (ent.criticalSpin || 1.2) * 1.75);
   sb.setEntityTemp('lingxi', 2800);
  });
  await page.waitForTimeout(900);
  const spinProtected = await page.evaluate(() => {
   const st = window.observatory.sandbox.stats();
   const lx = st.planets.find(p => p.id === 'lingxi');
   return {
    alive: lx?.alive,
    spinRatio: lx?.spinRatio,
    temp: lx?.temperature,
    noBreakup: lx?.noBreakup,
    inspHidden: document.getElementById('sb-inspector').hidden
   };
  });
  assert.equal(spinProtected.alive, true, 'breakup-locked body must survive supercritical spin without disintegrating');
  assert.ok(spinProtected.spinRatio >= 1.4, `spinRatio must exceed critical 1.0 (got ${spinProtected.spinRatio})`);
  assert.equal(spinProtected.inspHidden, false, 'upgraded inspector must be visible');
  await page.screenshot({ path: path.join(OUT, '14-phase3a-inspector-spin-lock.png') });
  report.screenshots.push('14-phase3a-inspector-spin-lock.png');

  // Unlock breakup -> supercritical spin must tear the body apart!
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setEntityNoBreakup('lingxi', false);
   sb.setSpeed(2.0);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().spinBreakups >= 1, null, { timeout: 8000 });

  // White Dwarf Chandrasekhar >= 1.44 M☉ -> Type Ia Supernova + Elastic Billiard Mode Bounce!
  const wdAndElastic = await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   const wd = sb.spawnBody('white-dwarf', [30, 0, -20], [0, 0, 0], { name: '钱德拉白矮星' });
   sb.setEntityMass(wd.id, 1.5);
   sb.setCollisionMode('elastic');
   const rA = sb.spawnBody('rocky', [10, 0, 40], [10, 0, 0], { name: '台球甲' });
   const rB = sb.spawnBody('rocky', [20, 0, 40], [-10, 0, 0], { name: '台球乙' });
   return { typeIa: sb.stats().typeIaSupernovae, idA: rA.id, idB: rB.id };
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().elasticBounces >= 1, null, { timeout: 8000 });
  const elasticAfter = await page.evaluate(({ idA, idB }) => {
   const st = window.observatory.sandbox.stats();
   return {
    bounces: st.elasticBounces,
    spinBreakups: st.spinBreakups,
    typeIa: st.typeIaSupernovae,
    bothAlive: st.entities.some(e => e.id === idA) && st.entities.some(e => e.id === idB)
   };
  }, { idA: wdAndElastic.idA, idB: wdAndElastic.idB });
  report.metrics.phase3aSpinAndIa = { spinProtected, elasticAfter };
  assert.ok(elasticAfter.spinBreakups >= 1, 'unlocking breakup must trigger centrifugal spin disintegration');
  assert.ok(elasticAfter.typeIa >= 1, 'white dwarf >= 1.44 M☉ must trigger Type Ia supernova');
  assert.ok(elasticAfter.bounces >= 1 && elasticAfter.bothAlive, 'elastic mode must bounce planets intact');
  mark('phase3a-spin-breakup-lock-typeIa-elastic');

  // 15. NEW Phase 3B: Oblique Grazing Hit-and-Run Mass Stripping -> Persistent 3D Debris Ring + Newborn Impact Moonlet + Event Log!
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  const grazingInit = await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setCollisionMode('realistic');
   sb.setAllowBreakup(true);
   sb.setSpeed(1.5);
   // Oblique offset in Z (3.4 units vs sumR=4.8) above ecliptic (y=12) -> clean Hit-and-Run Stripping!
   const gA = sb.spawnBody('rocky', [14, 12, -48], [5.8, 0, 0], { mass: 0.22, radius: 2.55, name: '擦撞主星' });
   const gB = sb.spawnBody('rocky', [26, 12, -44.6], [-5.8, 0, 0], { mass: 0.14, radius: 2.25, name: '擦撞客星' });
   return { idA: gA.id, idB: gB.id, massA: gA.mass, massB: gB.mass };
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().grazingStrips >= 1, null, { timeout: 10000 });
  await page.evaluate(({ idA }) => {
   const sb = window.observatory.sandbox;
   sb.selectEntity(idA);
   sb.followBody(idA);
   sb.setLogOpen(true);
  }, { idA: grazingInit.idA });
  await page.waitForTimeout(650);
  const grazingAfter = await page.evaluate(({ idA, idB }) => {
   const st = window.observatory.sandbox.stats();
   const eA = st.entities.find(e => e.id === idA);
   const eB = st.entities.find(e => e.id === idB);
   return {
    grazingStrips: st.grazingStrips,
    ringsFormed: st.ringsFormed,
    moonsBorn: st.moonsBorn,
    eventLogCount: st.eventLogCount,
    logVisible: !document.getElementById('sb-log-panel').hidden,
    eA,
    eB
   };
  }, { idA: grazingInit.idA, idB: grazingInit.idB });
  report.metrics.phase3bGrazing = { grazingInit, grazingAfter };
  assert.ok(grazingAfter.grazingStrips >= 1, 'oblique impact must trigger grazing hit-and-run stripping');
  assert.ok(grazingAfter.eA && grazingAfter.eB, 'both planets must survive a grazing hit-and-run');
  assert.ok(grazingAfter.eA.mass < grazingInit.massA * 0.93 && grazingAfter.eB.mass < grazingInit.massB * 0.88, 'both bodies must experience real mass loss');
  assert.equal(grazingAfter.eA.hasImpactRing, true, 'heavier survivor must gain persistent 3D debris ring');
  assert.ok(grazingAfter.moonsBorn >= 1, 'grazing stripping must condense at least 1 newborn impact moonlet');
  assert.ok(grazingAfter.eventLogCount >= 1 && grazingAfter.logVisible, 'physics event log must record events and open cleanly');
  await page.screenshot({ path: path.join(OUT, '15-phase3b-grazing-ring-moon-log.png') });
  report.screenshots.push('15-phase3b-grazing-ring-moon-log.png');
  mark('phase3b-grazing-mass-loss-ring-moon-and-log');

  // 16. NEW Phase 3B: Anti-Dizzy Spatial Reference Frame (Polar AU Grid, Star-Map Radar, Body List & Off-Screen Edge Indicators)
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setRadarOpen(true);
   sb.selectEntity('qitang');
   sb.followBody('qitang');
   sb.addEntityRing('qitang');
  });
  await page.waitForTimeout(750);
  const navCheck = await page.evaluate(() => ({
   radarVisible: !document.getElementById('sb-radar-panel').hidden,
   radarListItems: document.querySelectorAll('#sb-radar-list .sb-rl-item').length,
   compassActive: !document.getElementById('sandbox-compass').hidden,
   visibleEdgeArrows: [...document.querySelectorAll('#sb-edge-markers .sb-edge-btn')].filter(b => !b.hidden).length,
   qitangRing: window.observatory.sandbox.stats().planets.find(p => p.id === 'qitang')?.hasImpactRing
  }));
  report.metrics.phase3bSpatialNav = navCheck;
  assert.equal(navCheck.radarVisible, true, 'live star-map radar panel must be visible');
  assert.ok(navCheck.radarListItems >= 8, `radar alive body list must list active bodies (got ${navCheck.radarListItems})`);
  assert.equal(navCheck.compassActive, true, 'polar AU compass reference layer must be active');
  assert.ok(navCheck.visibleEdgeArrows >= 1, `off-screen edge indicators must point to out-of-view stars/BHs (got ${navCheck.visibleEdgeArrows})`);
  assert.equal(navCheck.qitangRing, true, 'addEntityRing must attach persistent debris ring');
  await page.screenshot({ path: path.join(OUT, '16-phase3b-radar-compass-edge-ring.png') });
  report.screenshots.push('16-phase3b-radar-compass-edge-ring.png');
  mark('phase3b-polar-au-radar-edge-indicators-and-ring');

  // 17. Grab tool state & Clean Exit back to Observatory (restoring pan=false & hiding all sandbox chrome)
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
   compassHidden: document.getElementById('sandbox-compass').hidden,
   edgeHidden: document.getElementById('sb-edge-markers').hidden,
   enablePan: window.observatory.sandbox.stats().enablePan,
   dataAttr: document.body.dataset.sandbox,
   viewLabel: document.getElementById('view-label').textContent
  }));
  assert.equal(afterExit.active, false);
  assert.equal(afterExit.dockHidden, true);
  assert.equal(afterExit.camBarHidden, true);
  assert.equal(afterExit.inspHidden, true);
  assert.equal(afterExit.compassHidden, true);
  assert.equal(afterExit.edgeHidden, true);
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
