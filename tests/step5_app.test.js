// Step 5 end-to-end: per-game MaxPreps file (the in-app scoresheet was removed in V3.38), checked
// against the Sheet's MaxPreps Export tab for the same game.
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const APP = 'http://localhost:8768/index.html';
const NEW = 'http://localhost:8770/exec';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parseCsv(text) {
  return text.replace(/^﻿/, '').trim().split(/\r\n/).map((line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  });
}

(async () => {
  await fetch(NEW.replace('/exec', '/__reset'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ timezoneId: 'America/Indiana/Indianapolis', serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '1234' : undefined));
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 8000)) { if (await fn()) return true; await sleep(150); } return false; };

  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('scorebook_v2_state', JSON.stringify({ players: [], activeGame: null, gameHistory: [], settings: { scriptUrl: '' } })); });
  await page.reload();
  // Workbook: switch to permanent IDs first (as you did with Rebuild Stats).
  await page.evaluate(() => pullRoster());
  let ids = await page.evaluate(() => state.players.map((p) => p.Player_ID));
  check('roster pulled', ids.length === 4, ids);

  // ---------- Play a full game ----------
  const gid = await page.evaluate(() => {
    const P = (j) => state.players.filter((p) => p.Jersey === String(j))[0];
    document.getElementById('setupOpponent').value = 'Carmel';
    openGameMetaModal();
    document.getElementById('metaWeatherTemp').value = '61';
    finalizeStartGame();
    state.activeGame.meta.headOfficial = 'Ref One'; state.activeGame.meta.tigersScorer = 'Score Keeper';
    logStat('Goal', P(3), { zone: '1C', clock: '10:15', assister: P(4) });
    logStat('Goal', P(4), { zone: '2L', clock: '03:02', assister: null });
    logStat('Shot', P(4)); skipZone();
    logStat('GB', P(3)); logStat('INT', P(3)); logStat('CTO', P(3)); logStat('TO', P(4));
    logStat('FOW', P(3)); logStat('FOW', P(3)); logStat('FOL', P(3));
    logStat('Save', P(57)); logStat('Save', P(57));
    logStat('GA', P(57)); goalClockCancel();
    state.penaltyTeam = 'tigers'; state.penaltyInHome = false; state.selectedPenaltyPlayer = P(3);
    state.penaltyType = 'Personal'; state.penaltyName = 'Slash'; state.penaltyClock = '06:00'; logTigersPenalty(90);
    state.selectedPenaltyPlayer = P(3); state.penaltyType = 'Technical'; state.penaltyName = 'Offsides'; logTigersPenalty(60);
    chargeTimeout('tigers');
    setQuarter('OT1');
    logStat('Goal', P(99), { zone: '', clock: '02:00', assister: null });
    closePenaltyNotice(); // scorekeeper taps OK on "Penalty already expired"
    const id = state.activeGame.id;
    endGame();
    return id;
  });
  check('game synced to the workbook', await waitFor(async () => (await page.evaluate((id) => findHistoryGame(id).synced, gid)) === true));

  // ---------- MaxPreps file ----------
  await page.evaluate(() => { document.querySelector('[data-tab="history"]').click(); });
  const btns = await page.evaluate(() => [...document.querySelectorAll('.ghi-exports button')].map((b) => b.textContent));
  check('History shows "MaxPreps file" and "Save game file" buttons', btns.join() === 'MaxPreps file,Save game file', btns);
  await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('.toast').length)) === 0, 6000); // let notices fade
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('.ghi-exports button:has-text("MaxPreps file")')]);
  const fname = dl.suggestedFilename();
  check('file name has the date and opponent', /^MaxPreps_\d{4}-\d{2}-\d{2}_Carmel\.csv$/.test(fname), fname);
  const csv = parseCsv(fs.readFileSync(await dl.path(), 'utf8'));
  check('columns are exactly MaxPreps\' stat sheet', csv[0].join('|') === '#|Player Name|Goals|Asst|SOG|GB|INT|TA|UE|FW|FA|MIN|GA|SV|Shut Out|W|L|T|P|PM|PS', csv[0]);
  const row = (name) => csv.find((r) => r[1] === name);
  const tr = row('Truman Collier'), el = row('Elijah Dorris'), gv = row('Graham Vergara');
  check('#3: 1 G, 0 A, SOG 1, GB 2 / INT 1 / TA 2 (the interception also counts a ground ball and a caused turnover), UE 0, FW 2 FA 3', tr && tr.slice(2, 11).join() === '1,0,1,2,1,2,0,2,3', tr);
  check('#3 penalties: P 2, PM 2, PS 30', tr && tr.slice(18).join() === '2,2,30', tr);
  check('#4: 1 G, 1 A, UE 1', gv && gv[2] === '1' && gv[3] === '1' && gv[8] === '1', gv);
  check('goalie: OT game = MIN 52, GA 1, SV 2, no shutout, W', el && el.slice(11, 18).join() === '52,1,2,0,1,0,0', el);
  check('odd name kept intact in the CSV', csv.some((r) => r[1] === '<img src=x onerror="window.__xss=1"> O\'Brien & Sons' && r[2] === '1'), csv.map((r) => r[1]));

  // ---------- App file == Sheet tab for the same (single) game ----------
  const wb = await (await fetch(NEW.replace('/exec', '/__state'))).json();
  const sheetRows = wb['MaxPreps Export'];
  check('Sheet tab has the same header', sheetRows[0].join('|') === csv[0].join('|'));
  const norm = (r) => r.map((x) => String(x)).join('|');
  const appRows = csv.slice(1).map(norm).sort();
  const sRows = sheetRows.slice(1).map(norm).sort();
  check('app per-game file and Sheet season-to-date tab agree cell for cell (one game played)', JSON.stringify(appRows) === JSON.stringify(sRows), { appRows, sRows });

  // ---------- Two goalies -> blank minutes/decision ----------
  const gid2 = await page.evaluate(() => {
    const P = (j) => state.players.filter((p) => p.Jersey === String(j))[0];
    document.querySelector('[data-tab="game"]').click();
    document.getElementById('setupOpponent').value = 'Zionsville'; openGameMetaModal(); finalizeStartGame();
    logStat('Save', P(57));
    P(4).Position = 'Goalie'; logStat('Save', P(4)); P(4).Position = 'Attack';
    const id = state.activeGame.id; endGame(); return id;
  });
  await waitFor(async () => (await page.evaluate((id) => findHistoryGame(id).synced, gid2)) === true);
  const rows2 = await page.evaluate((id) => maxPrepsRows(findHistoryGame(id)), gid2);
  const e2 = rows2.find((r) => r[1] === 'Elijah Dorris'), g2 = rows2.find((r) => r[1] === 'Graham Vergara');
  check('two goalies: SV filled, MIN/W/L/T/Shut Out blank for both', e2[13] === 1 && g2[13] === 1 && [11, 14, 15, 16, 17].every((i) => e2[i] === '' && g2[i] === ''), [e2, g2]);

  // ---------- The printable scoresheet now lives only in the Sheet (V3.38) ----------
  await page.evaluate(() => { document.querySelector('[data-tab="history"]').click(); });
  const gone = await page.evaluate(() => ({ overlay: !!document.getElementById('scoresheetOverlay'),
    fn: typeof openScoresheet, btn: Array.from(document.querySelectorAll('.ghi-exports button')).some((b) => /Scoresheet/.test(b.textContent)) }));
  check('the app has no scoresheet any more (no button, no screen): it is in the Sheet', !gone.overlay && gone.fn === 'undefined' && !gone.btn, gone);

  check('no JavaScript errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
