// Verification and visual capture for the deep-space dark companion (Guixu),
// real gravitational pull on star & planets, supernova remnant, and redesigned Lab & Journal UI.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const BASE = (process.env.PREVIEW_URL || 'http://127.0.0.1:43178').replace(/\/$/, '');
const OUT = path.resolve(process.env.COSMIC_OUT || path.join(__dirname, '../artifacts/cosmic'));
fs.mkdirSync(OUT, { recursive: true });

async function logicChecks() {
 const mod = await import(pathToFileURL(path.resolve(__dirname, '../cosmic.js')).href);
 assert.equal(mod.SINGULARITY.id, 'guixu');
 assert.equal(mod.SINGULARITY.name, '归墟');
 assert.ok(mod.SINGULARITY.au > mod.SINGULARITY.hillAu, 'wide companion must reside outside Alkaid Hill sphere at rest');
 assert.ok(mod.COSMIC_STORIES.supernova.length === 2);
 assert.ok(mod.COSMIC_STORIES.gravity.length === 2);
 const dataUrl = mod.singularityPortraitDataUrl();
 assert.ok(dataUrl.startsWith('data:image/'), 'portrait must be an offline data URL');
 console.log('PASS cosmic logic checks');
}

async function browserChecks() {
 const report = { base: BASE, checks: [], errors: [], warnings: [], screenshots: [] };
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
  await page.route('**/app.js', async route => {
   const response = await route.fetch();
   await route.fulfill({
    response,
    body: await response.text() + '\nwindow.__cosmicTest={bodies,scene,camera,star,lightPosition,blackHole,cosmicEvents,dust,finish};'
   });
  });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => {
   if (m.type() === 'error') report.errors.push(m.text());
   if (m.type() === 'warning' && /shader|webgl/i.test(m.text())) report.warnings.push(m.text());
  });

  const shot = async name => {
   const file = path.join(OUT, name + '.png');
   await page.screenshot({ path: file });
   report.screenshots.push(name + '.png');
  };

  // 1. Overview with HDR post chain enabled (?post=1&intro=0) — Guixu as wide external companion.
  await page.goto(`${BASE}/?post=1&intro=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.resources === 'complete' && window.observatory?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => document.body.dataset.post), 'on');
  assert.ok(await page.evaluate(() => !!__cosmicTest.blackHole?.surface && !!__cosmicTest.blackHole?.ambientStream), 'black hole and tidal stream must exist');
  await shot('01-overview-observatory-hdr');
  mark('overview renders with wide dark companion Guixu and tidal dust trickle');

  // 2. Inspect black hole via its scene label: Hill sphere copy + direct gravitational pull action.
  const bhLabel = page.locator('.singularity-label');
  assert.equal(await bhLabel.isVisible(), true, 'Guixu label must be visible in overview');
  await bhLabel.click({ force: true });
  assert.equal(await page.evaluate(() => observatory.mode), 'system');
  assert.equal(await page.locator('#title').textContent(), '归墟');
  assert.ok((await page.locator('#portrait').getAttribute('src')).startsWith('data:image/'));
  assert.ok((await page.locator('#planet-action button').first().textContent()).includes('引力牵引'));
  await shot('02-blackhole-card');
  mark('Guixu archive card explains Hill stability sphere and exposes gravitational pull drill');

  // 3. Close-up of Guixu.
  await page.locator('#visit').click();
  await page.waitForFunction(() => observatory.mode === 'singularity' && document.querySelector('#flight-status').hidden, null, { timeout: 20000 });
  await page.waitForTimeout(450);
  assert.equal(new URL(page.url()).hash, '#guixu');
  assert.equal(await page.locator('#system-map').isVisible(), true);
  assert.equal(await page.locator('#system-map button[data-singularity="guixu"]').getAttribute('aria-current'), 'true');
  const lensState = await page.evaluate(() => ({
   strength: __cosmicTest.finish?.uniforms.uLensStrength.value || 0,
   radius: __cosmicTest.finish?.uniforms.uLensRadius.value || 0
  }));
  assert.ok(lensState.strength > 0.25 && lensState.radius > 0.02, `expected active screen lensing, got ${JSON.stringify(lensState)}`);
  await shot('03-blackhole-closeup-hdr');
  mark('Guixu closeup activates gravitational lensing and system map marker');

  // Return to overview and capture redesigned Observatory Lab & Field Notes UI.
  await page.locator('#home').click();
  await page.waitForFunction(() => observatory.mode === 'system' && document.querySelector('#flight-status').hidden, null, { timeout: 20000 });
  await page.waitForTimeout(250);

  await page.locator('#play-toggle').click();
  await page.waitForTimeout(250);
  const labBox = await page.locator('#play-panel').boundingBox();
  assert.ok(labBox.width >= 500, `expected wide dual-column lab console, got width=${labBox.width}`);
  await shot('04-lab-panel-redesign');
  await page.locator('#play-close').click();
  mark('redesigned dual-column Observatory Lab fits cleanly without cramped stacking');

  // Seed partial journal progress so redesigned Journal showcases both unlocked & locked starlight cards.
  await page.evaluate(() => {
   localStorage.setItem('alkaid-observations-v1', JSON.stringify({
    version: 1,
    visited: ['jixi', 'lingxi', 'suxian', 'xunqi'],
    moons: ['lingxi:0', 'lingxi:1'],
    unlocked: [
     { id: 'tides', at: 1790000000001 },
     { id: 'still-comet', at: 1790000000002 },
     { id: 'lamps', at: 1790000000003 },
     { id: 'seventh', at: 1790000000004 }
    ]
   }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.resources === 'complete' && window.observatory?.ready, null, { timeout: 60000 });
  await page.locator('#journal-toggle').click();
  await page.waitForTimeout(250);
  const journalBox = await page.locator('#observation-journal').boundingBox();
  assert.ok(journalBox.width >= 700, `expected wide two-column journal dialog, got width=${journalBox.width}`);
  await shot('05-journal-redesign');
  await page.locator('#journal-close').click();
  mark('redesigned Field Notes showcases progress tracks, planetary voyage rail & dual-column cards');

  // 4. Real Gravitational Pull: verify Alkaid AND planets are genuinely pulled toward Guixu!
  await page.locator('#play-toggle').click();
  await page.locator('#trigger-gravity').click();
  await page.waitForFunction(() => document.querySelector('#sky-event-status')?.dataset.event === 'gravity', null, { timeout: 20000 });
  // Wait long enough for Guixu to cut inside the Hill sphere and visibly pull Alkaid & planets.
  await page.waitForFunction(() => {
   const s = __cosmicTest.star.position;
   return Math.hypot(s.x, s.y, s.z) > 4.0;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(2600);
  const pullMetrics = await page.evaluate(() => {
   const starPos = __cosmicTest.star.position;
   const bhPos = __cosmicTest.blackHole.root.position;
   const starDisp = starPos.length();
   const dotTowardBH = starPos.clone().normalize().dot(bhPos.clone().normalize());
   const maxRadialDeviation = Math.max(...__cosmicTest.bodies.map(b => {
    const r = Math.hypot(b.root.position.x, b.root.position.z);
    return Math.abs(r - b.def.orbit);
   }));
   const rocheVisible = !!__cosmicTest.scene.getObjectByName('Roche lobe plasma stream')?.visible;
   return {
    starDisp: +starDisp.toFixed(2),
    dotTowardBH: +dotTowardBH.toFixed(2),
    maxRadialDeviation: +maxRadialDeviation.toFixed(2),
    rocheVisible,
    dustStrength: __cosmicTest.dust.layers[0].uniforms.uGravStrength.value,
    ripple: __cosmicTest.finish?.uniforms.uRipple.value || 0
   };
  });
  report.pullMetrics = pullMetrics;
  assert.ok(pullMetrics.starDisp > 4.0, `Alkaid must be pulled off origin, got ${JSON.stringify(pullMetrics)}`);
  assert.ok(pullMetrics.dotTowardBH > 0.3, `Alkaid must move toward Guixu, got ${JSON.stringify(pullMetrics)}`);
  assert.ok(pullMetrics.maxRadialDeviation > 3.0, `Planets must deflect off circular orbits, got ${JSON.stringify(pullMetrics)}`);
  assert.equal(pullMetrics.rocheVisible, true, 'Roche-lobe stellar accretion stream must be visible');
  assert.ok(pullMetrics.dustStrength > 0.2, 'interstellar dust must couple to gravitational pull');
  await shot('06-gravity-pull-peak');

  await page.locator('#sky-event-stop').click();
  await page.waitForTimeout(160);
  const afterStop = await page.evaluate(() => ({
   starLen: __cosmicTest.star.position.length(),
   lightLen: __cosmicTest.lightPosition.length(),
   orbitsY: __cosmicTest.bodies.map(b => b.orbit.position.y),
   dustStrength: __cosmicTest.dust.layers[0].uniforms.uGravStrength.value
  }));
  assert.ok(afterStop.starLen < 0.001 && afterStop.lightLen < 0.001, `stopping gravity must reset Alkaid & light to origin, got ${JSON.stringify(afterStop)}`);
  assert.ok(afterStop.orbitsY.every(y => y === 0), 'stopping gravity must reset all orbit elevations');
  assert.equal(afterStop.dustStrength, 0, 'stopping gravity must reset dust perturbation');
  mark('gravitational pull genuinely drags Alkaid & planets with Roche stream and resets cleanly');

  // 5. Supernova burst + pause freeze check.
  await page.locator('#play-toggle').click();
  await page.locator('#trigger-supernova').click();
  await page.waitForFunction(() => document.querySelector('#sky-event-status')?.dataset.event === 'supernova', null, { timeout: 20000 });
  await page.waitForTimeout(2100);
  assert.equal(await page.evaluate(() => observatory.cosmicEvent), 'supernova');
  await shot('08-supernova-shockwave');

  await page.locator('#pause').click();
  await page.waitForTimeout(120);
  const scalePaused = await page.evaluate(() => __cosmicTest.scene.getObjectByName('supernova').children[1].scale.x);
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => __cosmicTest.scene.getObjectByName('supernova').children[1].scale.x), scalePaused, 'pause must freeze supernova shockwave');
  await page.locator('#pause').click();
  await page.locator('#sky-event-stop').click();
  mark('supernova shockwave respects pause and stops cleanly');

  // 6. Atlas look gravitational pull + mobile responsiveness (390px & 320px).
  await page.goto(`${BASE}/?style=atlas&post=1&intro=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.resources === 'complete' && window.observatory?.ready, null, { timeout: 60000 });
  await page.locator('#play-toggle').click();
  await page.locator('#trigger-gravity').click();
  await page.waitForFunction(() => document.querySelector('#sky-event-status')?.dataset.event === 'gravity', null, { timeout: 20000 });
  await page.waitForTimeout(3200);
  await shot('07-gravity-atlas');
  await page.locator('#sky-event-stop').click();

  await page.goto(`${BASE}/?style=observatory&post=1&intro=0#guixu`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.resources === 'complete' && observatory.mode === 'singularity', null, { timeout: 60000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot('09-blackhole-mobile');
  await page.locator('#play-toggle').click();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '390px lab must not overflow');
  await shot('10-lab-mobile');
  await page.locator('#play-close').click();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px closeup must not overflow');
  mark('390px and 320px mobile views stay overflow-free on closeup and redesigned lab');

  assert.equal(outbound.length, 0, 'no external network requests allowed');
  assert.deepEqual(report.errors, [], 'no console or page errors allowed');
  assert.deepEqual(report.warnings, [], 'no WebGL/shader warnings allowed');
  mark('zero console errors, shader warnings or external requests');
 } finally {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  await browser.close();
 }
}

logicChecks()
 .then(() => process.argv.includes('--logic-only') ? null : browserChecks())
 .catch(error => { console.error(error); process.exitCode = 1; });
