// Step 3 end-to-end: built-in link, PIN asked every time (not stored by default),
// PIN for pulls, safe names, viewer with PIN.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const APP = 'http://localhost:8768/index.html'; // test copy with the mock link built in
const VIEWER = 'http://localhost:8768/viewer.html';
const NEW = 'http://localhost:8770/exec';   // step-3 script (version 5), roster includes an HTML-y name
const V2 = 'http://localhost:8772/exec';    // step-2 script (version 2) - "not updated yet"
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await fetch(NEW.replace('/exec', '/__reset'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ timezoneId: 'America/Indiana/Indianapolis', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let prompts = [];
  let answer = '1234';
  page.on('dialog', (d) => { if (d.type() === 'prompt') { prompts.push(d.message()); d.accept(answer); } else d.accept(); });

  const H = () => page.evaluate(() => state.gameHistory.map((g) => ({ id: g.id, synced: g.synced, err: g.syncError || '' })));
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 8000)) { if (await fn()) return true; await sleep(150); } return false; };
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
  const savedPin = () => page.evaluate(() => localStorage.getItem('scorebook_write_pin'));
  const eventsFor = async (id) => (await (await fetch(NEW.replace('/exec', '/__state'))).json()).Events.slice(1).filter((r) => r[1] === id).length;

  // A device that used an older version and has a PIN saved, no URL in Settings.
  await page.goto(APP);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('scorebook_v2_state', JSON.stringify({ players: [], activeGame: null, gameHistory: [], settings: { scriptUrl: '' } }));
    localStorage.setItem('scorebook_write_pin', '1234');
  });
  await page.reload();
  check('a PIN saved by an older version is deleted on update (not remembered by default)', (await savedPin()) === null, await savedPin());
  check('Settings: "Remember the PIN" is unticked by default', (await page.evaluate(() => document.getElementById('rememberPinCheck').checked)) === false);

  // ---------- built-in link ----------
  check('built-in link is used when Settings is blank', (await page.evaluate(() => getScriptUrl())) === NEW, await page.evaluate(() => [getScriptUrl(), DEFAULT_SCRIPT_URL]));
  await page.evaluate(() => testConnection());
  await waitFor(async () => /Connected!/.test(await page.evaluate(() => document.getElementById('connectionStatus').textContent)));
  check('Test Connection works with no link pasted (version 9)', /Script version 9/.test(await page.evaluate(() => document.getElementById('connectionStatus').textContent)));

  // ---------- pull roster needs the PIN, asked every time ----------
  prompts = []; answer = '0000';
  await page.evaluate(() => pullRoster());
  check('wrong PIN: roster not loaded', (await page.evaluate(() => state.players.length)) === 0 && /Wrong PIN/.test(await page.evaluate(() => document.getElementById('rosterStatus').textContent)));
  answer = '';
  await page.evaluate(() => pullRoster());
  check('cancelling the PIN prompt loads nothing', (await page.evaluate(() => state.players.length)) === 0);
  answer = '1234'; prompts = [];
  await page.evaluate(() => pullRoster());
  check('right PIN: roster loaded', (await page.evaluate(() => state.players.length)) === 4, await page.evaluate(() => state.players.length));
  await page.evaluate(() => pullOfficials());
  check('PIN asked again for the officials (not remembered)', prompts.length === 2 && (await savedPin()) === null, prompts);

  // ---------- names with HTML show as text and can't run ----------
  await page.evaluate(() => { document.querySelector('[data-tab="roster"]').click(); });
  const rosterText = await page.evaluate(() => document.getElementById('rosterList').innerText);
  check('roster shows the odd name exactly as typed', rosterText.includes('<img src=x onerror="window.__xss=1"> O\'Brien & Sons'), rosterText.slice(0, 300));
  await page.evaluate(() => { document.querySelector('[data-tab="game"]').click(); document.getElementById('setupOpponent').value = '<b onmouseover=x>Carmel</b>'; openGameMetaModal(); finalizeStartGame(); sfSetView('player'); setFilter('All'); });
  const cardText = await page.evaluate(() => document.getElementById('playerGrid').innerText);
  check('player cards show the odd name as text', cardText.includes("O'Brien & Sons") && cardText.includes('<img'), cardText.slice(0, 200));
  await page.evaluate(() => { state.officials = [{ Role: 'Official', Name: '"><img src=x onerror=window.__xss=2>' }]; buildOfficialDropdowns(); });
  const optText = await page.evaluate(() => [...document.getElementById('metaHeadOfficial').options].map((o) => o.value));
  check('officials dropdown keeps an odd name intact', optText.includes('"><img src=x onerror=window.__xss=2>'), optText);

  // ---------- End Game: PIN asked; Cancel leaves it for the coach ----------
  answer = ''; prompts = [];
  const gid = await page.evaluate(() => { logStat('Goal', state.players[0], { zone: '1C', clock: '05:00', assister: null }); const id = state.activeGame.id; endGame(); return id; });
  await sleep(500);
  check('End Game asks for the PIN, mentioning it can be left for later', prompts.length === 1 && /Cancel to leave it in History/.test(prompts[0]), prompts);
  let h = (await H()).find((g) => g.id === gid);
  check('scorekeeper taps Cancel: game kept in History, not synced', h.synced === false, h);
  let t = await toasts();
  check('...with a message saying it is kept for later', t.some((x) => /kept in History/.test(x)), t);
  const histText = await page.evaluate(() => { renderHistory(); return document.getElementById('historyList').innerText; });
  check('History shows the odd opponent name as text', histText.includes('<b onmouseover=x>Carmel</b>'), histText.slice(0, 200));

  // background retry never fires without a remembered PIN
  prompts = [];
  await page.evaluate(() => syncPendingGames());
  await sleep(800);
  check('no automatic retry and no prompt when the PIN is not remembered', prompts.length === 0 && (await eventsFor(gid)) === 0);

  // coach presses sync and types the PIN
  answer = '1234';
  await page.evaluate((id) => pushGameFromHistory(id, 'manual'), gid);
  check('coach taps Press to sync + PIN: game saved and confirmed', await waitFor(async () => (await H()).find((g) => g.id === gid).synced === true));
  check('...the workbook has its 3 rows, and the PIN was not stored', (await eventsFor(gid)) === 3 && (await savedPin()) === null);

  // ---------- Remember PIN turned on ----------
  await page.evaluate(() => { document.querySelector('[data-tab="settings"]').click(); });
  await page.evaluate(() => { const cb = document.getElementById('rememberPinCheck'); cb.checked = true; cb.dispatchEvent(new Event('change')); });
  prompts = [];
  await page.evaluate(() => pullRoster());
  await page.evaluate(() => pullOfficials());
  check('with Remember on: asked once, then remembered', prompts.length === 1 && (await savedPin()) === '1234', [prompts, await savedPin()]);
  await page.evaluate(() => { const cb = document.getElementById('rememberPinCheck'); cb.checked = false; cb.dispatchEvent(new Event('change')); });
  check('turning Remember off deletes the saved PIN', (await savedPin()) === null);

  // ---------- an override link in Settings still wins ----------
  await page.evaluate((u) => { document.getElementById('scriptUrl').value = u; saveSettings(); scriptInfo = { url: '', version: 0 }; }, V2);
  check('a link typed in Settings overrides the built-in one', (await page.evaluate(() => getScriptUrl())) === V2);
  answer = '1234';
  await page.evaluate(() => pullRoster());
  t = await toasts();
  check('against a not-yet-updated (v2) script, Pull Roster says the script is out of date', t.some((x) => /Apps Script is out of date/.test(x)), t);
  await page.evaluate(() => { document.getElementById('scriptUrl').value = ''; saveSettings(); });

  check('nothing injected ever ran', (await page.evaluate(() => window.__xss)) === undefined);

  // ---------- Viewer ----------
  const v = await ctx.newPage();
  const vErrors = []; v.on('pageerror', (e) => vErrors.push(e.message));
  let vAnswer = '0000'; let vPrompts = 0;
  v.on('dialog', (d) => { vPrompts++; d.accept(vAnswer); });
  await v.goto(VIEWER);
  await v.click('text=Use a coach PIN'); // the viewer now opens on family sign-in
  await v.waitForTimeout(800);
  const vs = await v.evaluate(() => document.getElementById('setupStatus').textContent);
  check('viewer: wrong PIN -> "Incorrect PIN", nothing shown', /Incorrect PIN/.test(vs) && (await v.evaluate(() => Object.keys(V.players).length)) === 0, vs);
  vAnswer = '1234';
  await v.evaluate(() => bootstrap());
  await v.waitForTimeout(800);
  const opts = await v.evaluate(() => [...document.getElementById('gamePick').options].map((o) => o.textContent));
  check('viewer: right PIN -> games listed', opts.some((o) => /Carmel/.test(o)), opts);
  await v.evaluate((id) => { document.getElementById('gamePick').value = id; onGameChange(); }, gid);
  await v.waitForTimeout(800);
  const vText = await v.evaluate(() => document.getElementById('content').innerText);
  check('viewer: game shows, odd names displayed as text', vText.includes("O'Brien & Sons") && vText.includes('<b onmouseover=x>Carmel</b>'), vText.slice(0, 300));
  check('viewer: PIN asked once per visit, never stored', vPrompts === 2 && (await v.evaluate(() => JSON.stringify(localStorage).indexOf('1234'))) === -1, vPrompts);
  check('viewer: nothing injected ran', (await v.evaluate(() => window.__xss)) === undefined);

  check('no JavaScript errors (app)', errors.length === 0, errors);
  check('no JavaScript errors (viewer)', vErrors.length === 0, vErrors);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
