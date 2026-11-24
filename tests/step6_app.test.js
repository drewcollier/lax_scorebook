// Step 6: logo file, icons, offline start, background refresh, "new version" bar,
// storage persistence, event helpers, reset. Serves a copy from /tmp/s6 on :8769
// (service worker ON) so the test can publish a "new release" mid-test.
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const DIR = '/tmp/s6', APP = 'http://localhost:8769/index.html';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function publish(versionLabel, cacheVersion) {
  execSync('sleep 1.2'); // the test server's "changed?" check has 1-second resolution
  let html = fs.readFileSync(DIR + '/index.html', 'utf8').replace(/<div class="version">[^<]*<\/div>/, '<div class="version">' + versionLabel + '</div>');
  fs.writeFileSync(DIR + '/index.html', html);
  if (cacheVersion) fs.writeFileSync(DIR + '/sw.js', fs.readFileSync(DIR + '/sw.js', 'utf8').replace(/lax-scorebook-v\d+[a-z]*/, cacheVersion));
}

function freshCopy() {
  execSync(require('path').join(__dirname, 'make_copy.sh') + " /tmp/s6", { shell: "/bin/bash" });
}

(async () => {
  freshCopy();
  const size = ['index.html', 'css/app.css'].concat(fs.readdirSync(require('path').join(__dirname, '..', 'js')).filter((f) => f !== 'viewer.js').map((f) => 'js/' + f))
    .reduce((t, f) => t + fs.statSync(require('path').join(__dirname, '..', f)).size, 0);
  check('the whole app (page + styles + scripts) is under 260 KB (was 381 KB with the embedded logo; budget raised from 200 KB for the V3.33-34 features)', size < 260 * 1024, size);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ timezoneId: 'America/Indiana/Indianapolis' }); // service workers allowed
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '1234' : undefined));
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  // ---------- logo + icons ----------
  const logo = await page.evaluate(() => { const i = document.querySelector('.header img'); return [i.getAttribute('src'), i.naturalWidth, i.complete]; });
  check('header logo loads from logo.png', logo[0] === 'logo.png' && logo[1] > 100 && logo[2], logo);
  const man = await page.evaluate(async () => (await (await fetch('manifest.json')).json()).icons.map((i) => i.src + '|' + i.sizes + '|' + i.purpose));
  check('manifest lists local 192, 512 and maskable icons', man.join() === 'icons/icon-192.png|192x192|any,icons/icon-512.png|512x512|any,icons/icon-maskable-512.png|512x512|maskable', man);
  const iconOk = await page.evaluate(async (list) => {
    const out = [];
    for (const src of list.concat(['icons/apple-touch-icon.png'])) {
      const r = await fetch(src); const b = await createImageBitmap(await r.blob()); out.push(src + ':' + b.width);
    }
    return out;
  }, man.map((x) => x.split('|')[0]));
  check('every icon file loads with the right size', iconOk.join() === 'icons/icon-192.png:192,icons/icon-512.png:512,icons/icon-maskable-512.png:512,icons/apple-touch-icon.png:180', iconOk);
  check('apple-touch-icon is linked for iPad/iPhone home screens', await page.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"][href="icons/apple-touch-icon.png"]')));

  // ---------- works with the service worker in the way ----------
  await page.evaluate(() => { localStorage.setItem('scorebook_v2_state', JSON.stringify({ players: [], activeGame: null, gameHistory: [], settings: { scriptUrl: '' } })); });
  await page.reload();
  await page.evaluate(() => pullRoster());
  check('roster pull to the Apps Script still works with the offline helper active', (await page.evaluate(() => state.players.length)) > 0);

  // ---------- opens with no connection ----------
  await ctx.setOffline(true);
  await page.reload();
  const off = await page.evaluate(() => [document.querySelector('.version').textContent, document.querySelector('.header img').naturalWidth, state.players.length]);
  check('no signal: app opens from the saved copy, logo and roster intact', off[0] === 'V3.39' && off[1] > 100 && off[2] > 0, off);
  const vpage = await ctx.newPage();
  await vpage.goto('http://localhost:8769/viewer.html').catch(() => {});
  check('no signal: the stats viewer page also opens', /Stats Viewer/.test(await vpage.evaluate(() => document.body.innerText).catch(() => '')));
  await vpage.close();
  await ctx.setOffline(false);

  // ---------- quick start: saved copy first, fresh copy for next time ----------
  publish('V3.27-test-a');              // a content change without a cache bump
  await page.reload();
  const v1 = await page.evaluate(() => document.querySelector('.version').textContent);
  await sleep(800);
  await page.reload();
  const v2 = await page.evaluate(() => document.querySelector('.version').textContent);
  check('opens instantly from the saved copy, then picks up the update on the next open', v1 === 'V3.39' && v2 === 'V3.27-test-a', [v1, v2]);

  // ---------- new release -> "new version ready" bar ----------
  publish('V3.27-test-b', 'lax-scorebook-v99');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  const barShown = await page.waitForFunction(() => getComputedStyle(document.getElementById('updateBar')).display === 'flex', null, { timeout: 10000 }).then(() => true, () => false);
  check('a new release shows the "new version is ready" bar', barShown);
  check('...and does not reload by itself (a game may be in progress)', (await page.evaluate(() => document.querySelector('.version').textContent)) === 'V3.27-test-a');
  await Promise.all([page.waitForNavigation(), page.click('#updateBar button')]);
  check('tapping Reload shows the new version', (await page.evaluate(() => document.querySelector('.version').textContent)) === 'V3.27-test-b');
  check('old saved copies are cleaned up', JSON.stringify(await page.evaluate(() => caches.keys())) === '["lax-scorebook-v99"]', await page.evaluate(() => caches.keys()));

  // ---------- storage protection ----------
  await page.evaluate(() => { document.querySelector('[data-tab="settings"]').click(); });
  const st = await page.evaluate(() => [typeof window.storageProtected, document.getElementById('storageStatus').textContent]);
  check('asks the browser to protect saved games and reports it in Settings', st[0] === 'boolean' && st[1].length > 10, st);

  // ---------- event helpers ----------
  const ev = await page.evaluate(() => {
    document.querySelector('[data-tab="game"]').click();
    document.getElementById('setupOpponent').value = 'Helpers'; openGameMetaModal(); finalizeStartGame();
    logStat('Goal', state.players[0], { zone: '1C', clock: '05:00', assister: null });
    const g = state.players.filter((p) => p.Position === 'Goalie')[0];
    logStat('GA', g); goalClockCancel();
    logOpponentAction('Opp_SOG');
    return state.activeGame.events.map((e) => [e.metric, e.type, e.timestamp, e.id, e.groupId || '']);
  });
  const metrics = ev.map((e) => e[0]).join();
  check('cascades unchanged: Shot,SOG,Goal | GA,Opp_Goal,Opp_SOG,Opp_Shot | Opp_SOG,Opp_Shot', metrics === 'Shot,SOG,Goal,GA,Opp_Goal,Opp_SOG,Opp_Shot,Opp_SOG,Opp_Shot', metrics);
  check('rows from one tap share one timestamp and one group', ev[0][2] === ev[2][2] && ev[0][4] && ev[0][4] === ev[2][4] && ev[3][2] === ev[6][2] && ev[3][4] === ev[6][4] && ev[3][4] !== ev[0][4]);
  check('every row has its own id', new Set(ev.map((e) => e[3])).size === ev.length);
  check('row types correct (player_stat / opponent_stat)', ev[0][1] === 'player_stat' && ev[3][1] === 'player_stat' && ev[4][1] === 'opponent_stat');

  // ---------- Reset All Local Data ----------
  await page.evaluate(() => { localStorage.setItem('scorebook_remember_pin', '1'); localStorage.setItem('scorebook_write_pin', '1234'); localStorage.setItem('scorebook_view_mode', 'player'); localStorage.setItem('other_site_key', 'keep'); });
  await Promise.all([page.waitForNavigation(), page.evaluate(() => resetAllData())]);
  const after = await page.evaluate(() => [Object.keys(localStorage).sort(), state.players.length, state.timeoutsTigers, document.getElementById('rememberPinCheck').checked]);
  check('Reset clears every scorebook setting, starts fresh with defaults', JSON.stringify(after[0]) === '["other_site_key","scorebook_v2_state"]' || JSON.stringify(after[0]) === '["other_site_key"]', after);
  check('...roster empty, timeouts back to 3, Remember PIN off', after[1] === 0 && after[2] === 3 && after[3] === false, after);

  check('no JavaScript errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
