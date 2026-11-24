// Sun mode (app V3.40): Settings → Display switches between the normal dark look and two light looks.
// Not saved: the app always opens in the normal look.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8769/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => typeof setTheme === 'function');
  const look = () => page.evaluate(() => {
    const cs = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
    return { theme: document.documentElement.getAttribute('data-theme'), body: cs('body', 'backgroundColor'), text: cs('body', 'color'),
      primaryText: cs('.btn-primary', 'color'), selected: Array.from(document.querySelectorAll('[data-theme-btn].selected')).map((b) => b.getAttribute('data-theme-btn')) };
  });
  let l = await look();
  check('opens in the normal dark look with Normal selected', l.theme === null && l.body === 'rgb(26, 26, 46)' && l.selected.join() === '', l);
  check('Settings has a Display section with 3 choices', (await page.locator('#themeChoice button').count()) === 3);
  await page.evaluate(() => document.querySelector('[data-tab="settings"]').click());
  await page.click('[data-theme-btn="sun"]');
  l = await look();
  check('Sun: max contrast = white background, black text', l.theme === 'sun' && l.body === 'rgb(255, 255, 255)' && l.text === 'rgb(0, 0, 0)' && l.selected.join() === 'sun', l);
  check('…red buttons keep white text', l.primaryText === 'rgb(255, 255, 255)', l);
  const sb = await page.evaluate(() => getComputedStyle(document.querySelector('.btn-secondary')).borderTopWidth);
  check('…buttons get thick black outlines', sb === '3px', sb);
  await page.click('[data-theme-btn="sun-light"]');
  l = await look();
  check('Sun: light = white background, dark navy text', l.theme === 'sun-light' && l.body === 'rgb(255, 255, 255)' && l.text === 'rgb(18, 18, 42)' && l.selected.join() === 'sun-light', l);
  // a game works the same in Sun mode
  await page.evaluate(() => {
    state.players = [{ Player_ID: 'P001', Jersey: '3', Name: 'Truman Collier', Position: 'Attack' }]; saveState();
    document.getElementById('setupOpponent').value = 'Carmel'; openGameMetaModal(); finalizeStartGame();
    logStat('Goal', state.players[0]);
  });
  const ev = await page.evaluate(() => state.activeGame.events.map((e) => e.metric).join());
  check('recording still works in Sun mode', ev === 'Shot,SOG,Goal', ev);
  const toast = await page.evaluate(() => { const t = document.querySelector('.toast'); return t ? [getComputedStyle(t).color, getComputedStyle(t).backgroundColor] : null; });
  check('pop-up messages stay readable (white on black)', toast && toast[0] === 'rgb(255, 255, 255)' && toast[1] === 'rgb(18, 18, 42)', toast);
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => /theme|sun/i.test(k) || /sun-light|"sun"/.test(localStorage.getItem(k))));
  check('Sun mode is not saved anywhere', saved.length === 0, saved);
  await page.reload(); await page.waitForFunction(() => typeof setTheme === 'function');
  l = await look();
  check('after reopening: back to the normal look, game still there', l.theme === null && l.body === 'rgb(26, 26, 46)' && (await page.evaluate(() => !!state.activeGame)), l);
  await page.evaluate(() => setTheme('bogus'));
  check('unknown look name falls back to normal', (await look()).theme === null);
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
