// Step 2 end-to-end: app (8765) <-> mock Apps Script running the NEW Code.gs (8770)
// and the ORIGINAL Code.gs (8771).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const APP = 'http://localhost:8765/index.html';
const NEW = 'http://localhost:8770/exec';
const OLD = 'http://localhost:8771/exec';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLAYERS = [
  { Player_ID: '113', Jersey: '3', Name: 'A', Position: 'Midfield', isStarter: true },
  { Player_ID: '1157', Jersey: '57', Name: 'G', Position: 'Goalie', isStarter: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ timezoneId: 'America/Indiana/Indianapolis', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let promptAnswer = '1234';
  page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(promptAnswer) : d.accept()));

  const workbook = async (base) => (await (await fetch(base.replace('/exec', '/__state'))).json());
  const eventsFor = async (base, id) => (await workbook(base)).Events.slice(1).filter((r) => r[1] === id).length;
  const H = () => page.evaluate(() => state.gameHistory.map((g) => ({ id: g.id, synced: g.synced, err: g.syncError || '' })));
  const historyText = () => page.evaluate(() => { renderHistory(); return document.getElementById('historyList').innerText; });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 8000)) { if (await fn()) return true; await sleep(150); } return false; };
  const playGame = async (opp, goals) => page.evaluate(([opp, goals]) => {
    document.getElementById('setupOpponent').value = opp;
    openGameMetaModal(); finalizeStartGame();
    for (let i = 0; i < goals; i++) logStat('Goal', state.players[0], { zone: '1C', clock: '05:00', assister: null });
    logStat('Save', state.players[1]);
    const id = state.activeGame.id;
    endGame();
    return id;
  }, [opp, goals]);

  await fetch(NEW.replace('/exec', '/__reset')); await fetch(OLD.replace('/exec', '/__reset'));
  await page.goto(APP);
  await page.evaluate(([players, url]) => {
    localStorage.clear();
    localStorage.setItem('scorebook_v2_state', JSON.stringify({ players, activeGame: null, gameHistory: [], settings: { scriptUrl: url } }));
    localStorage.setItem('scorebook_write_pin', '1234');
    localStorage.setItem('scorebook_remember_pin', '1'); // step 3: remembering is opt-in
  }, [PLAYERS, NEW]);
  await page.reload();

  // ---------- Test Connection ----------
  await page.evaluate(() => testConnection());
  await waitFor(async () => /Connected!/.test(await page.evaluate(() => document.getElementById('connectionStatus').textContent)));
  let status = await page.evaluate(() => document.getElementById('connectionStatus').textContent);
  check('Test Connection reports "Connected! Script version 9"', /Connected! Script version 9/.test(status), status);

  // ---------- End Game saves and is CONFIRMED ----------
  const g1 = await playGame('Carmel', 2);
  check('End Game saves the game and it shows Synced only after Google confirms', await waitFor(async () => (await H())[0].synced === true), await H());
  check('the workbook has all 9 of the game\'s rows', (await eventsFor(NEW, g1)) === 9, await eventsFor(NEW, g1));
  let t = await toasts();
  check('success toast says it was saved to the workbook', t.some((x) => /Saved "Carmel" to the workbook/.test(x)), t);
  let wb = await workbook(NEW);
  check('Games row + label written', wb.Games.length === 2 && wb.Games[1][5] === wb.Games[1][1] + ' - Carmel (Home)', wb.Games[1]);

  // ---------- Re-sync never doubles ----------
  await page.evaluate(() => { state.gameHistory[0].synced = false; renderHistory(); });
  await page.evaluate((id) => pushGameFromHistory(id, 'manual'), g1);
  await waitFor(async () => (await H())[0].synced === true);
  check('pressing sync again on the same game keeps ONE copy in the workbook', (await eventsFor(NEW, g1)) === 9 && (await workbook(NEW)).Games.length === 2, await eventsFor(NEW, g1));

  // ---------- No signal at End Game -> kept, then auto-sync when back online ----------
  await ctx.setOffline(true);
  const g2 = await playGame('Zionsville', 1);
  await waitFor(async () => (await H()).find((g) => g.id === g2).err !== '');
  let h2 = (await H()).find((g) => g.id === g2);
  check('offline End Game: game kept, not marked Synced', h2.synced === false && /No connection/.test(h2.err), h2);
  t = await toasts();
  check('offline toast explains it will sync automatically', t.some((x) => /No connection\. The game is kept on this device/.test(x)), t);
  let ht = await historyText();
  check('History shows "Press to sync" and the reason', /Press to sync/.test(ht) && /No connection - will retry automatically/.test(ht), ht);
  await ctx.setOffline(false); // fires the browser's "online" event
  check('back online: the game syncs by itself', await waitFor(async () => (await H()).find((g) => g.id === g2).synced === true, 10000), await H());
  check('...and the workbook has it once', (await eventsFor(NEW, g2)) === 6, await eventsFor(NEW, g2));

  // ---------- Unsynced game retried when the app is reopened ----------
  await ctx.setOffline(true);
  const g3 = await playGame('Fishers JV', 1);
  await waitFor(async () => (await H()).find((g) => g.id === g3).err !== '');
  await ctx.setOffline(false);
  await page.evaluate(() => { window.removeEventListener('online', syncPendingGames); });
  await page.reload(); // reopen the app
  check('reopening the app syncs games left unsynced', await waitFor(async () => (await H()).find((g) => g.id === g3).synced === true, 10000), await H());

  // ---------- Wrong PIN ----------
  await page.evaluate(() => localStorage.setItem('scorebook_write_pin', '0000'));
  promptAnswer = '';
  await ctx.setOffline(true);
  const g4 = await playGame('Wrong PIN', 1);
  await waitFor(async () => (await H()).find((g) => g.id === g4).err !== '');
  await ctx.setOffline(false);
  await page.evaluate((id) => pushGameFromHistory(id, 'manual'), g4);
  await waitFor(async () => (await H()).find((g) => g.id === g4).err === 'Wrong PIN - tap to try again');
  h2 = (await H()).find((g) => g.id === g4);
  check('wrong PIN: not synced, reason shown, saved PIN forgotten', h2.synced === false && h2.err === 'Wrong PIN - tap to try again' && (await page.evaluate(() => localStorage.getItem('scorebook_write_pin'))) === null, h2);
  check('wrong PIN: nothing written to the workbook', (await eventsFor(NEW, g4)) === 0);
  promptAnswer = '1234';
  await page.evaluate((id) => pushGameFromHistory(id, 'manual'), g4);
  check('re-entering the right PIN then syncs it', await waitFor(async () => (await H()).find((g) => g.id === g4).synced === true), await H());

  // ---------- Older (version 1) script: still works, never auto-retries ----------
  await page.evaluate((url) => { state.settings.scriptUrl = url; saveState(); scriptInfo = { url: '', version: 0 }; }, OLD);
  await page.evaluate(() => testConnection());
  await waitFor(async () => /older version/.test(await page.evaluate(() => document.getElementById('connectionStatus').textContent)));
  status = await page.evaluate(() => document.getElementById('connectionStatus').textContent);
  check('Test Connection against the old script says it needs updating', /older version/.test(status), status);
  const g5 = await playGame('Old Script', 1);
  await waitFor(async () => (await eventsFor(OLD, g5)) > 0);
  check('old script: End Game still saves (original form method)', (await eventsFor(OLD, g5)) === 6, await eventsFor(OLD, g5));
  t = await toasts();
  check('old script: warns the save can\'t be confirmed', t.some((x) => /out of date/.test(x)), t);
  await page.evaluate(() => { state.gameHistory.forEach((g) => (g.synced = false)); saveState(); });
  await page.evaluate(() => syncPendingGames());
  await sleep(1500);
  check('old script: background retry does NOT re-send (would double the game)', (await eventsFor(OLD, g5)) === 6, await eventsFor(OLD, g5));

  // ---------- no script URL ----------
  await page.evaluate(() => { state.settings.scriptUrl = ''; saveState(); });
  const g6 = await playGame('No URL', 1);
  h2 = (await H()).find((g) => g.id === g6);
  check('no Script URL: game kept unsynced, no error', h2 && h2.synced === false, h2);

  check('History never dropped an unsynced game', (await H()).filter((g) => g.synced !== true).every((g) => !!g), await H());
  check('no JavaScript errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
