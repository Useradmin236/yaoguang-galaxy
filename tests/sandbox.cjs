// Verification and visual capture for the Interactive N-Body Cosmic Sandbox:
// Velocity Verlet full mutual gravity, black-hole Roche tidal disruption (TDE),
// planetary giant impacts (molten merger & hypervelocity shatter), physics overlays,
// interactive dock controls, clean reset & zero-pollution exit to Observatory mode.
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

  // 1. Default load: Sandbox must be completely inactive and invisible
  await page.goto(`${BASE}/?intro=0&post=1`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  const initial = await page.evaluate(() => ({
   active: window.observatory.sandbox.active,
   dockHidden: document.getElementById('sandbox-dock').hidden,
   dataAttr: document.body.dataset.sandbox || ''
  }));
  assert.equal(initial.active, false, 'sandbox must be inactive by default');
  assert.equal(initial.dockHidden, true, 'sandbox dock must be hidden by default');
  mark('default-observatory-untouched');

  // 2. Open Lab panel and verify featured #enter-sandbox button
  await page.click('#play-toggle');
  await page.waitForSelector('#enter-sandbox', { state: 'visible' });
  await page.screenshot({ path: path.join(OUT, '01-lab-sandbox-entry.png') });
  report.screenshots.push('01-lab-sandbox-entry.png');
  mark('lab-sandbox-entry-visible');

  // 3. Enter Sandbox via UI click -> verify live N-body motion + Physics Overlays
  await page.click('#enter-sandbox');
  await page.waitForFunction(() => window.observatory.sandbox.active === true, null, { timeout: 5000 });
  await page.waitForSelector('#sandbox-dock', { state: 'visible' });
  const labClosed = await page.evaluate(() => document.getElementById('play-panel').hidden);
  assert.equal(labClosed, true, 'entering sandbox should close lab panel');

  // Turn on physics overlays & let full N-body Verlet run for a bit
  await page.click('#sb-overlay-btn');
  await page.waitForTimeout(1600);
  const nbodyStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.nbody = nbodyStats;
  assert.ok(nbodyStats.starDisp > 0.25, `Alkaid must move via real binary gravity (got ${nbodyStats.starDisp})`);
  assert.ok(nbodyStats.bhDisp > 0.15, `Guixu must move via mutual N-body gravity (got ${nbodyStats.bhDisp})`);
  assert.equal(nbodyStats.alivePlanets, 6, 'all 6 planets alive before collision');
  await page.screenshot({ path: path.join(OUT, '02-sandbox-active-overlays.png') });
  report.screenshots.push('02-sandbox-active-overlays.png');
  mark('nbody-verlet-and-overlays');

  // 4. Black Hole Roche Tidal Disruption (TDE) verification + capture
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(true);
   sb.setBhMass(22);
   sb.setSpeed(1.5);
   // Place Guixu prominently in foreground-left and send Jixi skimming deep into its Roche zone!
   sb.flingBody('guixu', [-24, 1.5, 10], [0.8, 0, -1.2]);
   sb.flingBody('jixi', [-4, 1.5, 22], [-15.5, 0, -9.0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().disrupted >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(750);
  const tdeStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.tde = tdeStats;
  assert.ok(tdeStats.disrupted >= 1, 'TDE must disrupt planet entering Roche limit');
  assert.ok(tdeStats.activeDebris >= 250, `TDE must spawn rich gravity debris stream (got ${tdeStats.activeDebris})`);
  assert.ok(tdeStats.bhFlare > 0.15, `TDE must flare Guixu accretion disk (got ${tdeStats.bhFlare})`);
  await page.screenshot({ path: path.join(OUT, '03-tde-tidal-disruption.png') });
  report.screenshots.push('03-tde-tidal-disruption.png');
  mark('roche-tidal-disruption-tde');

  // 5. Reset cleanly -> Planetary Giant Impact (Molten Merger) verification + capture
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(false);
   sb.setBhMass(12.4);
   sb.setSpeed(1.2);
   // Bring Lingxi & Xunqi into a dramatic moderate-speed accretionary merger near center-right
   sb.flingBody('lingxi', [18, 0, 14], [4.0, 0, -1.5]);
   sb.flingBody('xunqi', [31, 0, 11], [-4.8, 0, 1.2]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().mergers >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(450);
  const mergerStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.merger = mergerStats;
  const survivor = mergerStats.planets.find(p => p.mergedCount >= 1);
  assert.ok(survivor, 'merger must produce a merged survivor planet');
  assert.ok(survivor.lavaHeat > 0.25, `merged planet must glow with molten lava crust (got ${survivor.lavaHeat})`);
  assert.ok(mergerStats.activeDebris >= 180, `merger must eject molten debris (got ${mergerStats.activeDebris})`);
  await page.screenshot({ path: path.join(OUT, '04-giant-impact-merger.png') });
  report.screenshots.push('04-giant-impact-merger.png');
  mark('planetary-giant-impact-merger');

  // 6. Catastrophic Hypervelocity Shatter verification + capture
  await page.click('#sb-reset-btn');
  await page.waitForFunction(() => window.observatory.sandbox.stats().alivePlanets === 6, null, { timeout: 5000 });
  await page.evaluate(() => {
   const sb = window.observatory.sandbox;
   sb.setOverlays(false);
   sb.setSpeed(1.4);
   // Fling Mingai & Suxian head-on at hypervelocity (> 2x escape velocity)
   sb.flingBody('mingai', [8, 0, 26], [19.5, 0, 0]);
   sb.flingBody('suxian', [32, 0, 26], [-19.5, 0, 0]);
  });
  await page.waitForFunction(() => window.observatory.sandbox.stats().shatters >= 1, null, { timeout: 12000 });
  await page.waitForTimeout(450);
  const shatterStats = await page.evaluate(() => window.observatory.sandbox.stats());
  report.metrics.shatter = shatterStats;
  assert.ok(shatterStats.shatters >= 1, 'hypervelocity head-on collision must shatter both worlds');
  assert.equal(shatterStats.alivePlanets, 4, 'both colliding worlds must disintegrate on hypervelocity shatter');
  assert.ok(shatterStats.activeDebris >= 400, `shatter must spawn dense debris cloud (got ${shatterStats.activeDebris})`);
  await page.screenshot({ path: path.join(OUT, '05-hypervelocity-shatter.png') });
  report.screenshots.push('05-hypervelocity-shatter.png');
  mark('planetary-hypervelocity-shatter');

  // 7. Interactive Grab tool state & Clean Exit back to Observatory
  await page.click('[data-tool="grab"]');
  const toolAfter = await page.evaluate(() => window.observatory.sandbox.tool);
  assert.equal(toolAfter, 'grab', 'grab tool button should switch mode');

  await page.click('#sb-exit-btn');
  await page.waitForFunction(() => window.observatory.sandbox.active === false, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const afterExit = await page.evaluate(() => ({
   active: window.observatory.sandbox.active,
   dockHidden: document.getElementById('sandbox-dock').hidden,
   dataAttr: document.body.dataset.sandbox,
   viewLabel: document.getElementById('view-label').textContent
  }));
  assert.equal(afterExit.active, false);
  assert.equal(afterExit.dockHidden, true);
  assert.equal(afterExit.dataAttr, 'false');
  assert.equal(afterExit.viewLabel, '星系全景');
  mark('clean-exit-to-observatory');

  // 8. Mobile layout check (390x844) inside Sandbox
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  const mPage = await mobileCtx.newPage();
  mPage.on('pageerror', e => report.errors.push('mobile pageerror: ' + e.message));
  await mPage.goto(`${BASE}/?intro=0`, { waitUntil: 'domcontentloaded' });
  await waitForReady(mPage);
  await mPage.evaluate(() => window.observatory.sandbox.enter());
  await mPage.waitForSelector('#sandbox-dock', { state: 'visible' });
  await mPage.waitForTimeout(450);
  const mobileLayout = await mPage.evaluate(() => {
   const r = document.getElementById('sandbox-dock').getBoundingClientRect();
   return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    dockLeft: Math.round(r.left),
    dockRight: Math.round(r.right),
    dockBottom: Math.round(r.bottom),
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
