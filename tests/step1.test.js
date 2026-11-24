// Step 1 verification: run with  node step1.test.js  (server on :8765 serving the repo)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = 'http://localhost:8765/index.html';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) failures++;
}

const PLAYERS = [
  { Player_ID: '113', Jersey: '3', Name: 'Test Middie', Position: 'Midfield', isStarter: true },
  { Player_ID: '114', Jersey: '4', Name: 'Test Attack', Position: 'Attack', isStarter: true },
  { Player_ID: '1157', Jersey: '57', Name: 'Test Goalie', Position: 'Goalie', isStarter: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext({ timezoneId: 'America/Indiana/Indianapolis', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept()); // auto-OK confirm() prompts

  await page.goto(BASE);
  await page.evaluate((players) => {
    localStorage.clear();
    localStorage.setItem('scorebook_v2_state', JSON.stringify({ players, activeGame: null, gameHistory: [], settings: { scriptUrl: '' } }));
  }, PLAYERS);
  await page.reload();

  const newGame = async (opp) => page.evaluate((opp) => {
    document.getElementById('setupOpponent').value = opp;
    openGameMetaModal();
    finalizeStartGame();
  }, opp);
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify({
    q: state.currentQuarter, str: state.currentStrength, emo: state.emoOpen,
    toT: state.timeoutsTigers, toO: state.timeoutsOpp, ej: state.ejectedPlayers, ejk: state.ejectedKeys,
    pc: state.penaltyPersonalCount, ps: state.penaltyPersonalSeconds,
    home: state.activeGame && state.activeGame.homeScore, away: state.activeGame && state.activeGame.awayScore,
    metrics: state.activeGame ? state.activeGame.events.map((e) => e.metric) : [],
    pens: state.activeGame ? (state.activeGame.activePenalties || []).length : 0,
    officials: state.officials, hist: state.gameHistory.map((g) => ({ id: g.id, synced: g.synced, opp: g.opponent })),
  })));
  const tigersPenalty = (pid, type, secs) => page.evaluate(([pid, type, secs]) => {
    state.penaltyTeam = 'tigers'; state.penaltyInHome = false;
    state.selectedPenaltyPlayer = state.players.filter((p) => p.Player_ID === pid)[0];
    state.penaltyType = type; state.penaltyName = 'Slash'; state.penaltyClock = '10:00';
    logTigersPenalty(secs);
  }, [pid, type, secs]);
  const oppPenalty = (jersey, secs) => page.evaluate(([j, secs]) => {
    state.penaltyTeam = 'opponent'; state.oppPenaltyJersey = j;
    state.penaltyType = 'Personal'; state.penaltyName = 'Slash'; state.penaltyClock = '10:00';
    logOpponentPenalty(false, secs);
  }, [jersey, secs]);
  const undoMetric = (metric, nth) => page.evaluate(([m, n]) => {
    const ev = state.activeGame.events.filter((e) => e.metric === m)[n || 0];
    undoEvent(ev.id);
  }, [metric, nth]);

  // ---------- #5 default date uses the local day ----------
  await page.clock.setFixedTime(new Date('2026-04-15T21:30:00-04:00')); // 9:30 pm EDT = next day in UTC
  await page.reload();
  const fieldDate = await page.evaluate(() => document.getElementById('setupDate').value);
  check('#5 setup screen shows today at 9:30 pm', fieldDate === '2026-04-15', fieldDate);
  const d = await page.evaluate(() => localDateStr());
  check('#5 date at 9:30 pm local is still the same day', d === '2026-04-15', d);
  await newGame('Date Test');
  const gd = await page.evaluate(() => state.activeGame.date);
  check('#5 game started at 9:30 pm gets today\'s date', gd === '2026-04-15', gd);
  await page.evaluate(() => { state.activeGame = null; saveState(); });

  // ---------- #1 state survives a reload mid-game ----------
  await newGame('Reload Test');
  await page.evaluate(() => {
    state.officials = [{ Role: 'Official', Name: 'Ref One' }];
    setQuarter('Q2'); chargeTimeout('tigers'); chargeTimeout('opp'); chargeTimeout('opp');
  });
  await tigersPenalty('113', 'Personal', 60);
  await oppPenalty('22', 30);
  await page.evaluate(() => ejectPlayer('114', false));
  const before = await S();
  await page.reload();
  const after = await S();
  check('#1 quarter kept after reload', after.q === 'Q2', after.q);
  check('#1 timeouts kept after reload', after.toT === 2 && after.toO === 1, [after.toT, after.toO]);
  check('#1 ejected player kept after reload', after.ej.indexOf('114') !== -1, after.ej);
  check('#1 personal-foul counts kept after reload', JSON.stringify(after.pc) === JSON.stringify(before.pc) && after.pc['113'] === 1 && after.pc['Opp #22'] === 1, after.pc);
  check('#1 strength + man-up state kept after reload', after.str === before.str && after.emo === before.emo, [before.str, after.str, before.emo, after.emo]);
  check('#1 officials list kept after reload', after.officials.length === 1, after.officials);
  const qBtn = await page.evaluate(() => document.querySelector('.quarter-btn.active').getAttribute('data-q'));
  check('#1 Q2 button highlighted after reload', qBtn === 'Q2', qBtn);
  const card = await page.evaluate(() => [...document.querySelectorAll('.player-card.ejected .jersey')].map((e) => e.textContent));
  // By-stat view may hide the grid; check state-level eject list drives the card class when grid renders
  await page.evaluate(() => { sfSetView('player'); });
  const card2 = await page.evaluate(() => [...document.querySelectorAll('.player-card.ejected .jersey')].map((e) => e.textContent));
  check('#1 ejected player still greyed out after reload', card2.indexOf('#4') !== -1, card2);
  await page.evaluate(() => { state.activeGame = null; saveState(); });

  // ---------- #6 undo removes the whole tap ----------
  await newGame('Undo Test');
  // Goal entered through the stat-first flow (scorer, no assist, clock, zone)
  await page.evaluate(() => logStat('Goal', state.players[0], { zone: '1C', clock: '05:00', assister: null }));
  let s = await S();
  check('#6 goal records Shot+SOG+Goal', JSON.stringify(s.metrics) === '["Shot","SOG","Goal"]', s.metrics);
  await undoMetric('Shot');
  s = await S();
  check('#6 undo on the goal\'s Shot row removes all three', s.metrics.length === 0 && s.home === 0, s);
  const score = await page.evaluate(() => document.getElementById('homeScore').textContent);
  check('#6 scoreboard back to 0', score === '0', score);

  // Goal Allowed: 4 rows, opponent score
  await page.evaluate(() => { logStat('GA', state.players[2]); goalClockCancel(); });
  s = await S();
  check('#6 GA records 4 rows', s.metrics.length === 4 && s.away === 1, s.metrics);
  await undoMetric('Opp_Goal');
  s = await S();
  check('#6 undo GA removes all 4 rows and the opponent goal', s.metrics.length === 0 && s.away === 0, s);

  // Save: 3 rows
  await page.evaluate(() => logStat('Save', state.players[2]));
  await undoMetric('Save');
  s = await S();
  check('#6 undo Save removes its opponent SOG/Shot too', s.metrics.length === 0, s.metrics);

  // Opponent goal from opponent panel
  await page.evaluate(() => { logOpponentAction('Opp_Goal'); goalClockCancel(); });
  await undoMetric('Opp_SOG');
  s = await S();
  check('#6 undo opponent goal group', s.metrics.length === 0 && s.away === 0, s);

  // Single Shot stays a single row
  await page.evaluate(() => { logStat('Shot', state.players[0]); skipZone(); logStat('Shot', state.players[1]); skipZone(); });
  await undoMetric('Shot', 0);
  s = await S();
  check('#6 undo one plain Shot leaves the other', JSON.stringify(s.metrics) === '["Shot"]', s.metrics);
  await undoMetric('Shot', 0);

  // EMO: opponent penalty -> man-up -> goal = EMO success; undo goal reopens chance
  await oppPenalty('22', 60);
  s = await S();
  check('#6 opponent penalty puts Tigers man-up', s.str === 'Man-Up' && s.emo === true, s);
  await page.evaluate(() => logStat('Goal', state.players[0], { zone: '1C', clock: '09:30', assister: null }));
  s = await S();
  check('#6 man-up goal records EMO success', s.metrics.indexOf('EMO_Success') !== -1, s.metrics);
  await undoMetric('Goal');
  s = await S();
  check('#6 undo man-up goal removes EMO success', s.metrics.indexOf('EMO_Success') === -1 && s.metrics.indexOf('Goal') === -1, s.metrics);
  check('#6 undo man-up goal restores the released penalty + reopens man-up chance', s.str === 'Man-Up' && s.emo === true && s.pens === 1, s);
  // Undo the opponent penalty itself: must NOT log a bogus EMO fail
  await undoMetric('Penalty');
  s = await S();
  check('#6 undo opponent penalty does not record EMO fail', s.metrics.length === 0 && s.str === 'Even', s);

  // 5th personal foul ejects; undoing it takes back the ejection and the count
  for (let i = 0; i < 5; i++) await tigersPenalty('113', 'Personal', 30);
  await page.evaluate(() => closeEjectAlert());
  s = await S();
  check('#6 5th personal foul ejects #3', s.ej.indexOf('113') !== -1 && s.metrics.indexOf('Ejection') !== -1 && s.pc['113'] === 5, s);
  await undoMetric('Penalty', 4);
  s = await S();
  check('#6 undo 5th foul removes ejection + lowers count', s.ej.indexOf('113') === -1 && s.ejk.indexOf('113') === -1 && s.metrics.indexOf('Ejection') === -1 && s.pc['113'] === 4, s);
  await tigersPenalty('113', 'Personal', 30);
  await page.evaluate(() => closeEjectAlert());
  s = await S();
  check('#6 re-entering the 5th foul ejects again', s.ej.indexOf('113') !== -1, s.ej);

  // Undo toast wording
  await page.evaluate(() => { state.activeGame.events = []; state.activeGame.homeScore = 0; logStat('Goal', state.players[0], { zone: '', clock: '01:00', assister: null }); });
  await undoMetric('Goal');
  const toast = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).pop());
  check('#6 undo toast lists what was removed', /Undone: Shot #3, Shot on Goal #3, Goal #3/.test(toast), toast);
  await page.evaluate(() => { state.activeGame = null; saveState(); });

  // ---------- #2 unsynced games are never trimmed ----------
  for (let i = 1; i <= 5; i++) {
    await newGame('Opp' + i);
    await page.evaluate(() => logStat('GB', state.players[0]));
    await page.evaluate(() => endGame());
  }
  s = await S();
  check('#2 five unsynced games are all kept', s.hist.length === 5, s.hist);
  await page.evaluate(() => { state.gameHistory[0].synced = true; state.gameHistory[1].synced = true; trimHistory(); saveState(); });
  s = await S();
  check('#2 trimming removes only synced games (oldest first)', s.hist.length === 3 && s.hist.every((g) => g.synced !== true) && s.hist[0].opp === 'Opp3', s.hist);
  await page.evaluate(() => { state.gameHistory.forEach((g) => (g.synced = true)); });
  await newGame('Opp6');
  await page.evaluate(() => { logStat('GB', state.players[0]); endGame(); });
  s = await S();
  check('#2 once synced, history is capped at 3 again', s.hist.length === 3 && s.hist[2].opp === 'Opp6' && s.hist[2].synced === false, s.hist);

  // ---------- legacy saved data (pre-3.23) still loads ----------
  await page.evaluate(() => {
    localStorage.setItem('scorebook_v2_state', JSON.stringify({
      players: state.players, settings: { scriptUrl: '' }, gameHistory: [],
      activeGame: { id: 'Gold', opponent: 'Old', date: '2026-01-01', location: 'Home', homeScore: 1, awayScore: 0, meta: {},
        events: [{ id: 'E1', metric: 'Shot', playerId: '113', quarter: 'Q1', timestamp: new Date().toISOString() },
                 { id: 'E2', metric: 'Goal', playerId: '113', quarter: 'Q1', timestamp: new Date().toISOString() }] }
    }));
  });
  await page.reload();
  await undoMetric('Goal');
  s = await S();
  check('legacy game (no live block / no groups) loads and undo works', s.q === 'Q1' && JSON.stringify(s.metrics) === '["Shot"]' && s.home === 0, s);

  check('no JavaScript errors on the page', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
