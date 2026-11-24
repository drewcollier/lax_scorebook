// Penalties tab + foul-out strip (app V3.34). Scoresheet % checks moved to codegs9 (the Sheet's scoresheet).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const APP = 'http://localhost:8769/index.html';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await browser.newContext({ viewport: { width: 500, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '1234' : undefined));
  await page.goto(APP);
  await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined');
  await page.evaluate(() => {
    state.players = [{ Player_ID: 'P001', Jersey: '3', Name: 'Truman Collier', Position: 'Attack' },
      { Player_ID: 'P002', Jersey: '15', Name: 'Henry Fox', Position: 'Defense' },
      { Player_ID: 'P003', Jersey: '1', Name: 'Kyle Grant', Position: 'Goalie' }];
    saveState();
  });
  const tabs = await page.$$eval('.tab-btn', (b) => b.map((x) => x.textContent));
  check('a Penalties tab sits next to Game', tabs.join() === 'Game,Penalties,Roster,History,Settings', tabs);
  await page.click('.tab-btn[data-tab="penalties"]');
  check('no game: says so', /No game in progress/.test(await page.textContent('#penaltiesView')));
  await page.click('.tab-btn[data-tab="game"]');

  await page.evaluate(() => {
    document.getElementById('setupOpponent').value = 'Carmel'; openGameMetaModal(); finalizeStartGame();
  });
  const P = (j) => `state.players.filter(function(p){return p.Jersey==='${j}'})[0]`;
  const tig = (j, type, name, clock, secs) => page.evaluate(`state.penaltyTeam='tigers'; state.penaltyInHome=false; state.selectedPenaltyPlayer=${P(j)}; state.penaltyType='${type}'; state.penaltyName='${name}'; state.penaltyClock='${clock}'; logTigersPenalty(${secs});`);
  const opp = (j, type, name, clock, secs) => page.evaluate(`state.penaltyTeam='opponent'; state.penaltyInHome=false; state.oppPenaltyJersey='${j}'; state.penaltyType='${type}'; state.penaltyName='${name}'; state.penaltyClock='${clock}'; logOpponentPenalty(false, ${secs});`);
  const strip = () => page.evaluate(() => { const e = document.getElementById('foulWatch'); return e.style.display === 'none' ? '' : e.textContent; });

  await tig('3', 'Personal', 'Slash', '10:00', 90);
  await tig('3', 'Technical', 'Offsides', '08:12', 60);
  await opp('22', 'Personal', 'Cross Check', '07:30', 60);
  await opp('22', 'Personal', 'Tripping', '05:00', 60);
  check('under 3:00 of personal fouls: no strip on the game screen', (await strip()) === '');
  await page.evaluate(() => { closePenaltyNotice && closePenaltyNotice(); });
  await page.evaluate(() => { state.currentQuarter = 'Q2'; });
  await opp('22', 'Personal', 'Slash', '11:45', 60);
  let st = await strip();
  check('strip appears at 3:00: "Opp #22 3:00"', /Opp #22 3:00/.test(st), st);
  check('…without opening anything (the Penalty button flow is untouched)', !(await page.isVisible('#penaltyModal.show')) && !(await page.isVisible('#foulDetailModal.show')));
  await opp('22', 'Technical', 'Delay of Game', '10:00', 30);
  st = await strip();
  check('technical fouls don\'t add to foul-out time', /Opp #22 3:00/.test(st), st);
  await opp('22', 'Personal', 'Unnecessary Roughness', '09:00', 60);
  check('at 4:00 the chip turns orange', (await page.getAttribute('.fw-chip', 'class')).indexOf('danger') >= 0 && /4:00/.test(await strip()));
  await page.evaluate(() => { state.penaltyTeam = 'tigers'; state.penaltyInHome = true; state.penaltyName = 'Illegal Procedure'; state.penaltyClock = '06:00'; logTigersPenalty(30); });

  // Penalties tab
  await page.click('.tab-btn[data-tab="penalties"]');
  const rows = await page.$$eval('.pen-team', (t) => t.map((x) => x.querySelector('h3').textContent + ' ' + Array.from(x.querySelectorAll('td')).map((c) => c.textContent.trim()).join(' ')));
  check('Tigers list: #3 Truman Collier, 1 personal 1:30, 1 tech, 2:30 total', /#3 Truman Collier 1 1:30 1 2:30/.test(rows[0]), rows[0]);
  check('opponent list headed by the opponent\'s name: #22 4 personal 4:00, 1 tech, 4:30', /^Carmel/.test(rows[1].trim()) && /#22\s+4 4:00 1 4:30/.test(rows[1]), rows[1]);
  check('In-Home team fouls listed separately, not charged to a player', /Tigers In-Home \(team fouls, not charged to a player\): 1 · 0:30/.test(await page.textContent('#penaltiesView')));
  check('the 4:00 row is highlighted', (await page.getAttribute('.pen-row[data-key="Opp #22"]', 'class')).indexOf('danger') >= 0);
  await page.click('.pen-row[data-key="Opp #22"]');
  await page.waitForSelector('#foulDetailModal.show');
  let detail = await page.textContent('#foulDetailModal');
  check('tap a player: title + time left before fouling out', /#22 \(Carmel\)/.test(detail) && /1:00 of personal fouls left before fouling out/.test(detail), detail.slice(0, 200));
  const lines = await page.$$eval('#foulDetailBody tbody tr', (r) => r.map((x) => Array.from(x.children).map((c) => c.textContent).join('|')));
  check('every penalty listed in order with quarter, clock, name, type, time', lines.length === 5 && lines[0] === 'Q1|07:30|Cross Check|Personal|1:00' && lines[2] === 'Q2|11:45|Slash|Personal|1:00' && lines[3] === 'Q2|10:00|Delay of Game|Technical|0:30', lines);
  await page.click('#foulDetailModal >> text=Close');

  // foul out
  await page.click('.tab-btn[data-tab="game"]');
  await opp('22', 'Personal', 'Slash', '04:00', 60);
  await sleep(200);
  check('5:00: the existing foul-out alert still pops up', await page.isVisible('#ejectAlertModal.show'));
  await page.evaluate(() => closeEjectAlert());
  st = await strip();
  check('strip shows "OUT Opp #22 5:00" in red', /OUT Opp #22 5:00/.test(st) && (await page.getAttribute('.fw-chip', 'class')).indexOf('out') >= 0, st);
  await page.click('.fw-chip');
  await page.waitForSelector('#foulDetailModal.show');
  check('tapping the chip opens the breakdown: FOULED OUT', /FOULED OUT/.test(await page.textContent('#foulDetailModal')));
  await page.click('#foulDetailModal >> text=Close');

  // undo
  await page.evaluate(() => { const evs = state.activeGame.events.filter((e) => e.metric === 'Penalty'); undoEvent(evs[evs.length - 1].id); });
  st = await strip();
  check('Undo is reflected at once (back to 4:00)', /Opp #22 4:00/.test(st) && !/OUT/.test(st), st);

  // two players over 3:00, ordering
  await tig('15', 'Personal', 'Push', '03:00', 180);
  st = await strip();
  check('several players: most time first, Tigers shown by jersey', /Opp #22 4:00.*#15 3:00/.test(st), st);
  await page.addStyleTag({ content: '.toast, #toastContainer, .toast-container { display: none !important; }' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '/tmp/pen_game.png' });
  await page.click('.tab-btn[data-tab="penalties"]');
  await page.click('.pen-row[data-key="Opp #22"]'); await page.waitForSelector('#foulDetailModal.show');
  await page.screenshot({ path: '/tmp/pen_detail.png' });
  await page.click('#foulDetailModal >> text=Close');
  await page.screenshot({ path: '/tmp/pen_tab.png' });
  await page.click('.tab-btn[data-tab="game"]');

  // game over: strip goes away
  await page.evaluate(() => endGame());
  await sleep(1500);
  check('game over: strip hidden', (await strip()) === '');
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
