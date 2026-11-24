// Interception = Caused Turnover + Ground Ball + Interception (app V3.39), through to the Sheet.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const S = 'http://localhost:8770';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (src) => (await fetch(S + '/__run', { method: 'POST', body: src })).json();
(async () => {
  await fetch(S + '/__reset');
  await run('rebuildStats(); 1');
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await browser.newContext({ viewport: { width: 700, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '1234' : undefined));
  await page.goto('http://localhost:8769/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => {
    state.players = [{ Player_ID: 'P001', Jersey: '3', Name: 'Truman Collier', Position: 'Attack' },
      { Player_ID: 'P002', Jersey: '4', Name: 'Graham Vergara', Position: 'Defense' }];
    saveState();
    document.getElementById('setupOpponent').value = 'Carmel'; openGameMetaModal(); finalizeStartGame();
  });
  // By Player: tap INT for #4
  await page.evaluate(() => { state.selectedPlayer = state.players[1]; logStat('INT', state.players[1]); });
  let ev = await page.evaluate(() => state.activeGame.events.filter((e) => e.playerId === 'P002').map((e) => [e.metric, e.groupId, e.timestamp]));
  check('one INT tap records Caused Turnover + Ground Ball + Interception', ev.map((e) => e[0]).join() === 'CTO,GB,INT', ev);
  check('…as one tap (same group and time)', ev[0][1] && ev.every((e) => e[1] === ev[0][1] && e[2] === ev[0][2]), ev);
  check('…and the message says so', /Interception #4 \(\+ caused turnover, ground ball\)/.test(await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent).join('|'))));
  // Undo the INT -> all three go
  await page.evaluate(() => { const e = state.activeGame.events.filter((x) => x.metric === 'INT')[0]; undoEvent(e.id); });
  check('Undo removes all three', (await page.evaluate(() => state.activeGame.events.filter((e) => e.playerId === 'P002').length)) === 0);
  // By Stat: Interception -> jersey 4
  await page.evaluate(() => { sfStartStat('INT'); });
  await page.evaluate(() => { const p = state.players[1]; sfAcceptPlayer(p, '4'); });
  await sleep(200);
  ev = await page.evaluate(() => state.activeGame.events.filter((e) => e.playerId === 'P002').map((e) => e.metric));
  check('By Stat Interception records the same three', ev.join() === 'CTO,GB,INT', ev);
  // other stats unchanged
  await page.evaluate(() => { logStat('CTO', state.players[0]); logStat('GB', state.players[0]); });
  ev = await page.evaluate(() => state.activeGame.events.filter((e) => e.playerId === 'P001').map((e) => e.metric));
  check('Caused Turnover and Ground Ball on their own still record just themselves', ev.join() === 'CTO,GB', ev);
  // MaxPreps file for the game
  const gid = await page.evaluate(() => state.activeGame.id);
  await page.evaluate(() => endGame());
  await page.waitForFunction((id) => findHistoryGame(id) && findHistoryGame(id).synced === true, gid, { timeout: 15000 });
  const mp = await page.evaluate((id) => { const h = MAXPREPS_HEADERS; const r = maxPrepsRows(findHistoryGame(id)).find((x) => x[1] === 'Graham Vergara'); const o = {}; h.forEach((k, i) => (o[k] = r[i])); return o; }, gid);
  check('MaxPreps file: #4 GB 1, INT 1, TA (caused turnovers) 1', mp.GB === 1 && mp.INT === 1 && mp.TA === 1, mp);
  // the Sheet
  const st = await run(`var v=SpreadsheetApp.openById('').getSheetByName('Season Totals').getDataRange().getValues(); var h=v[0]; var r=v.filter(function(x){return x[h.indexOf('Player_ID')]==='P002'})[0]; ({GB:r[h.indexOf('GB')],CT:r[h.indexOf('CT')],INT:r[h.indexOf('INT')]})`);
  check('Season Totals in the Sheet: #4 GB 1, CT 1, INT 1', st.GB === 1 && st.CT === 1 && st.INT === 1, st);
  const mps = await run(`var v=SpreadsheetApp.openById('').getSheetByName('MaxPreps Export').getDataRange().getValues(); var h=v[0]; var r=v.filter(function(x){return x[h.indexOf('Player Name')]==='Graham Vergara'})[0]; ({GB:r[h.indexOf('GB')],INT:r[h.indexOf('INT')],TA:r[h.indexOf('TA')]})`);
  check('MaxPreps Export tab: #4 GB 1, INT 1, TA 1', mps.GB === 1 && mps.INT === 1 && mps.TA === 1, mps);
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
