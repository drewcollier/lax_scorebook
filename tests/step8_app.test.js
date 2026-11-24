// Test mode + Save game file (app V3.33) against two mock scripts: 8770 = team (live), 8773 = TEST copy.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const APP = 'http://localhost:8769/index.html', LIVE = 'http://localhost:8770', TEST = 'http://localhost:8773';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (base, src) => (await fetch(base + '/__run', { method: 'POST', body: src })).json();
const games = (base) => run(base, "gamesInWorkbook_(SpreadsheetApp.openById('')).map(function(g){return g.Opponent})");
async function waitFor(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; }

(async () => {
  await fetch(LIVE + '/__reset');
  await run(TEST, "var p=PropertiesService.getScriptProperties(); p.setProperty('IS_TEST','1'); p.setProperty('SHEET_ID','COPY-OF-WORKBOOK'); 1");
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(d.type() === 'prompt' ? '1234' : undefined); });
  await page.goto(APP);
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => { state.players = [{ Player_ID: 'P001', Jersey: '3', Name: 'Truman Collier', Position: 'Attack' }]; saveState(); });
  const toast = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent).join(' | '));
  const banner = () => page.evaluate(() => { const b = document.getElementById('testBanner'); return getComputedStyle(b).display !== 'none' ? b.textContent : ''; });
  check('starts with Test mode off and no orange bar', !(await page.isChecked('#testModeCheck')) && (await banner()) === '');

  await page.click('.tab-btn[data-tab="settings"]');
  await page.click('#testModeCheck');
  await sleep(200);
  check('Test mode needs a TEST link first', !(await page.isChecked('#testModeCheck')) && /TEST script link first/.test(await toast()));
  await page.fill('#testScriptUrl', TEST + '/exec');
  await page.click('text=Save link');
  await page.check('#testModeCheck');
  await sleep(200);
  check('Test mode on: orange bar shows', /TEST MODE/.test(await banner()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('scorebook_v2_state')).settings.testMode)) === true);
  await page.click('text=Test Connection');
  await page.waitForFunction(() => /Connected|LIVE|TEST copy, not/.test(document.getElementById('connectionStatus').textContent));
  check('Test Connection says it reached the TEST copy', /Script version 9 \(TEST copy\)/.test(await page.textContent('#connectionStatus')), await page.textContent('#connectionStatus'));

  async function playGame(opp) {
    return page.evaluate((opp) => {
      document.querySelector('.tab-btn[data-tab="game"]').click();
      document.getElementById('setupOpponent').value = opp; openGameMetaModal(); finalizeStartGame();
      if (!state.activeGame) return null;
      logStat('GB', state.players[0]); logTeamAction('Clear_Good');
      const id = state.activeGame.id; return id;
    }, opp);
  }
  dialogs.length = 0;
  let gid = await playGame('Practice Scrimmage');
  check('starting a game in Test mode asks first', dialogs.some((m) => /TEST MODE is on/.test(m)));
  check('while a TEST game is going, the bar says TEST GAME', /TEST GAME/.test(await banner()));
  // turning test mode off mid-game must not change where this game goes
  await page.evaluate(() => { state.settings.testMode = false; saveState(); applyTestMode(); });
  check('…even with Test mode switched off mid-game, the bar still says TEST GAME', /TEST GAME/.test(await banner()));
  dialogs.length = 0;
  await page.evaluate(() => endGame());
  check('PIN prompt names the TEST workbook', await waitFor(async () => dialogs.some((m) => /TEST GAME/.test(m) && /TEST workbook/.test(m))), dialogs);
  check('TEST game saved to the TEST copy', await waitFor(async () => (await page.evaluate((id) => findHistoryGame(id).synced, gid)) === true));
  check('…and NOT to the team Sheet', (await games(TEST)).indexOf('Practice Scrimmage') >= 0 && (await games(LIVE)).indexOf('Practice Scrimmage') < 0);
  await page.click('.tab-btn[data-tab="history"]');
  const hist = await page.textContent('#historyList');
  check('History tags it TEST and "Synced to TEST"', /Practice Scrimmage\s*TEST/.test(hist) && /Synced to TEST/.test(hist), hist.slice(0, 200));
  check('bar gone after the TEST game ends with Test mode off', (await banner()) === '');

  // real game with Test mode off
  dialogs.length = 0;
  gid = await playGame('Carmel');
  check('real game: no Test-mode question, no bar', !dialogs.some((m) => /TEST MODE/.test(m)) && (await banner()) === '');
  await page.evaluate(() => endGame());
  check('real game saved to the team Sheet only', await waitFor(async () => (await page.evaluate((id) => findHistoryGame(id).synced, gid)) === true) &&
    (await games(LIVE)).indexOf('Carmel') >= 0 && (await games(TEST)).indexOf('Carmel') < 0);

  // guard: TEST link pointing at the live Sheet
  await page.evaluate((u) => { state.settings.testScriptUrl = u; state.settings.testMode = true; scriptInfoCache = {}; saveState(); applyTestMode(); }, LIVE + '/exec');
  gid = await playGame('Wrong Link Test');
  await page.evaluate(() => endGame());
  await sleep(1500);
  const h1 = await page.evaluate((id) => findHistoryGame(id), gid);
  check('TEST game + TEST link pointing at the live Sheet: refused, kept on device', h1.synced === false && /points to the live Sheet/.test(h1.syncError) && (await games(LIVE)).indexOf('Wrong Link Test') < 0, h1.syncError);
  // guard: team link pointing at the TEST copy
  await page.evaluate((u) => { state.settings.testScriptUrl = u; state.settings.testMode = false; state.settings.scriptUrl = u; scriptInfoCache = {}; saveState(); applyTestMode(); }, TEST + '/exec');
  gid = await playGame('Wrong Link Real');
  await page.evaluate(() => endGame());
  await sleep(1500);
  const h2 = await page.evaluate((id) => findHistoryGame(id), gid);
  check('real game + team link pointing at the TEST copy: refused, kept on device', h2.synced === false && /TEST copy - not sent/.test(h2.syncError) && (await games(TEST)).indexOf('Wrong Link Real') < 0, h2.syncError);
  await page.click('.tab-btn[data-tab="settings"]');
  await page.click('text=Test Connection');
  await page.waitForFunction(() => /Connected|LIVE|TEST copy, not/.test(document.getElementById('connectionStatus').textContent));
  check('Test Connection warns when the team link is the TEST copy', /This link is the TEST copy, not the team Sheet/.test(await page.textContent('#connectionStatus')));
  // fix the link: the kept game now syncs to the right place
  await page.evaluate(() => { state.settings.scriptUrl = ''; scriptInfoCache = {}; saveState(); });
  await page.evaluate((id) => pushGameFromHistory(id, 'manual'), gid);
  check('after fixing the link, the kept game goes to the team Sheet', await waitFor(async () => (await page.evaluate((id) => findHistoryGame(id).synced, gid)) === true) && (await games(LIVE)).indexOf('Wrong Link Real') >= 0);

  // Save game file
  await page.click('.tab-btn[data-tab="history"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.game-history-item:has-text("Carmel") >> text=Save game file')]);
  const fs = require('fs'); const pth = await dl.path(); const body = fs.readFileSync(pth, 'utf8'); const j = JSON.parse(body);
  check('Save game file: named like the Drive backups', /^\d{4}-\d{2}-\d{2} vs Carmel \[G\d+\]\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('…same format the restore menu reads, with the plays', j.kind === 'lax-scorebook-game' && j.gameData.game.Opponent === 'Carmel' && j.gameData.events.length === 2);
  check('…and no PIN in it', body.indexOf('1234') < 0 && j.gameData.pin === undefined);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('.game-history-item:has-text("Wrong Link Test") >> text=Save game file')]);
  check('a TEST game file is labelled TEST', /^TEST /.test(dl2.suggestedFilename()));
  // the device file can be restored by the script
  const restored = await run(LIVE, `var ss=SpreadsheetApp.openById(''); var f=backupFolder_(ss,'${j.gameData.game.Date.slice(0, 4)}').createFile(${JSON.stringify(dl.suggestedFilename())}, ${JSON.stringify(body)}); readBackup_(f).gameData.events.length`);
  check('the script accepts a device-saved file as a backup', restored === 2, restored);

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
