// TEST game wording + Discard button for TEST games (app V3.37).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await browser.newContext({ viewport: { width: 700, height: 900 } })).newPage();
  const errors = [], dialogs = [];
  let pinAnswer = null; // null = Cancel at the PIN prompt
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); if (d.type() === 'prompt') { if (pinAnswer === null) d.dismiss(); else d.accept(pinAnswer); } else d.accept(); });
  await page.goto('http://localhost:8769/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => {
    state.players = [{ Player_ID: 'P001', Jersey: '3', Name: 'Truman Collier', Position: 'Attack' }];
    state.settings.testScriptUrl = 'http://localhost:8773/exec'; state.settings.testMode = true; saveState(); applyTestMode();
    document.getElementById('testModeCheck').checked = true; document.getElementById('testScriptUrl').value = state.settings.testScriptUrl;
  });
  const banner = () => page.evaluate(() => { const b = document.getElementById('testBanner'); return getComputedStyle(b).display !== 'none' ? b.textContent : ''; });
  const toast = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent).join(' | '));
  async function play(opp) {
    await page.evaluate((opp) => { document.querySelector('.tab-btn[data-tab="game"]').click(); document.getElementById('setupOpponent').value = opp; openGameMetaModal(); finalizeStartGame(); logStat('GB', state.players[0]); }, opp);
  }
  await play('Scrimmage');
  check('banner during a TEST game says how to finish it', /TEST GAME in progress - tap END GAME on the Game tab to finish it\. It only goes to the TEST workbook\./.test(await banner()), await banner());
  // what happened: Test mode unticked while the TEST game is still going
  await page.click('.tab-btn[data-tab="settings"]');
  await page.click('#testModeCheck');
  await sleep(200);
  check('unticking Test mode mid-game explains the game stays a TEST game', /TEST game in progress stays a TEST game until you end it/.test(await toast()), await toast());
  await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined');
  check('…after a reload the banner is still there (the game is still going)', /TEST GAME in progress/.test(await banner()));
  // the way out: END GAME, Cancel at the PIN
  await page.evaluate(() => endGame());
  await sleep(800);
  check('END GAME + Cancel at the PIN: banner gone', (await banner()) === '');
  await page.click('.tab-btn[data-tab="history"]');
  const items = await page.$$eval('.game-history-item', (d) => d.map((x) => x.textContent));
  check('the TEST game waits in History, tagged TEST, with a Discard button', items.length === 1 && /Scrimmage\s*TEST/.test(items[0]) && /Discard/.test(items[0]), items);
  // a real game: no Discard
  await play('Carmel');
  await page.evaluate(() => endGame());
  await sleep(800);
  await page.click('.tab-btn[data-tab="history"]');
  const real = await page.$$eval('.game-history-item', (d) => d.map((x) => x.textContent));
  check('a real game never gets a Discard button', real.length === 2 && /Carmel/.test(real[0]) && !/Discard/.test(real[0]), real);
  // discard: No keeps it
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.click('.game-history-item:has-text("Scrimmage") >> button.discard-test');
  check('Discard asks first; answering Cancel keeps it', (await page.$$('.game-history-item')).length === 2 && /Discard the TEST game vs Scrimmage/.test(dialogs[dialogs.length - 1]) && /never sent anywhere/.test(dialogs[dialogs.length - 1]));
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await page.click('.game-history-item:has-text("Scrimmage") >> button.discard-test');
  await sleep(200);
  const left = await page.$$eval('.game-history-item', (d) => d.map((x) => x.textContent));
  check('OK removes the TEST game; the real game stays', left.length === 1 && /Carmel/.test(left[0]), left);
  check('…and it is gone after a reload too', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('scorebook_v2_state')); return s.gameHistory.length === 1 && s.gameHistory[0].opponent === 'Carmel'; }));
  check('the function itself refuses real games', await page.evaluate(() => { const id = state.gameHistory[0].id; discardTestGame(id); return state.gameHistory.length === 1; }));
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
