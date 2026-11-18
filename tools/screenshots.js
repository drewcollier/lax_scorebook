// tools/screenshots.js - recreate the guide's screenshots (guide-images/*.png)
// from the current app, with made-up demo players (never real names).
//
// Developer tool, not part of the app. Needs Node.js + Playwright + Chrome:
//   npm install playwright      (once)
//   python3 -m http.server 8765 (from the repo folder, in another window)
//   node tools/screenshots.js
// Optional env: APP_URL (default http://localhost:8765/index.html),
//               CHROME (path to Chrome if Playwright's own browser isn't installed)
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const APP = process.env.APP_URL || 'http://localhost:8765/index.html';
const OUT = path.join(__dirname, '..', 'guide-images');

const DEMO_PLAYERS = [
  ['P001', '1', 'Kyle Grant', 'Goalie', true], ['P002', '3', 'Alex Ward', 'Attack', true],
  ['P003', '9', 'Ben Carter', 'Attack', true], ['P004', '12', 'Chris Lee', 'FOGO', true],
  ['P005', '27', 'Dan Ortiz', 'Midfield', true], ['P006', '33', 'Evan Price', 'Defense', true],
  ['P007', '44', 'Finn Moore', 'Defense', true], ['P008', '7', 'Gabe Hall', 'Midfield', false],
  ['P009', '15', 'Henry Fox', 'LSM', false], ['P010', '22', 'Ian Brooks', 'Midfield', false],
].map(([id, j, n, pos, st]) => ({ Player_ID: id, Jersey: j, Name: n, Position: pos, isStarter: st }));

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 500, height: 1100 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(APP);
  await page.evaluate((players) => {
    localStorage.clear();
    localStorage.setItem('scorebook_v2_state', JSON.stringify({ players, activeGame: null, gameHistory: [], settings: { scriptUrl: '' } }));
  }, DEMO_PLAYERS);
  await page.reload();
  await page.addStyleTag({ content: '.toast-container{display:none!important}' }); // no pop-up notices in shots

  const tab = async (t) => { await page.evaluate((t) => document.querySelector('[data-tab="' + t + '"]').click(), t); await page.waitForTimeout(400); }; // let the tab highlight finish fading
  const shotRegion = async (file, topSel, bottomSel, pad) => {
    const box = await page.evaluate(([a, b]) => {
      const top = a ? document.querySelector(a).getBoundingClientRect().top : 0;
      const bottom = document.querySelector(b).getBoundingClientRect().bottom;
      return { top: top + window.scrollY, bottom: bottom + window.scrollY };
    }, [topSel, bottomSel]);
    const y = Math.max(0, box.top - (topSel ? 10 : 0));
    await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y, width: 500, height: Math.round(box.bottom - y + (pad || 16)) }, fullPage: true });
    console.log('wrote', file);
  };
  const shotModal = async (file, modalId, maxHeight) => {
    const el = await page.$('#' + modalId + ' .modal');
    const b = await el.boundingBox();
    await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: Math.max(0, b.y - 12), width: 500, height: Math.min(maxHeight || 2000, b.height + 24) } });
    console.log('wrote', file);
  };

  // Settings
  await tab('settings');
  await shotRegion('settings.png', null, '#tab-settings .settings-section:nth-of-type(2)');
  // Roster
  await tab('roster');
  await page.screenshot({ path: path.join(OUT, 'roster.png'), clip: { x: 0, y: 0, width: 500, height: 500 } });
  console.log('wrote roster.png');
  // Game setup
  await tab('game');
  await page.evaluate(() => { document.getElementById('setupOpponent').value = 'Demo Opponent'; });
  await shotRegion('setup.png', null, '#gameSetup', 20);

  // Start a demo game
  await page.evaluate(() => {
    openGameMetaModal(); finalizeStartGame();
    sfSetView('stat'); sfSetEntry('keypad');
    logStat('Goal', state.players[4], { zone: '1C', clock: '11:15', assister: state.players[2] });
  });
  await shotRegion('bystat.png', null, '#opponentPanel', 12);

  // Stat-first keypad: Ground Ball #3
  await page.evaluate(() => { sfStartStat('GB'); sfJerseyDigit(3); });
  await shotModal('keypad.png', 'sfJerseyModal');
  // Jersey grid
  await page.evaluate(() => { sfSetEntry('grid'); });
  await shotModal('grid.png', 'sfJerseyModal', 420);
  await page.evaluate(() => { sfSetEntry('keypad'); sfCancel(); });

  // Error: #55 isn't on the roster
  await page.evaluate(() => { sfStartStat('GB'); sfJerseyDigit(5); sfJerseyDigit(5); sfJerseyConfirm(); });
  await shotRegion('error.png', '#sfJerseyModal .modal', '#sfJerseyError', 14);
  await page.evaluate(() => sfCancel());

  // Goal: scorer 27 -> assist step; assist 9 -> clock step (09:34); -> zone step
  await page.evaluate(() => { sfStartStat('Goal'); sfJerseyDigit(2); sfJerseyDigit(7); sfJerseyConfirm(); });
  await shotModal('goal-assist.png', 'sfJerseyModal');
  await page.evaluate(() => { sfJerseyDigit(9); sfJerseyConfirm(); [0, 9, 3, 4].forEach((d) => sfClockDigit(d)); });
  await shotModal('goal-clock.png', 'sfJerseyModal');
  await page.evaluate(() => sfClockConfirm());
  const zoneModal = await page.evaluate(() => document.querySelector('.modal-overlay.show').id);
  await shotModal('zone.png', zoneModal);
  await page.evaluate(() => skipZone());

  // Active penalties: #33 locked; #44 and Opp #22 at the same time (overlap)
  await page.evaluate(() => {
    const P = (j) => state.players.filter((p) => p.Jersey === String(j))[0];
    function tig(j, name, type, secs, clock, locked) {
      state.penaltyTeam = 'tigers'; state.penaltyInHome = false; state.selectedPenaltyPlayer = P(j);
      state.penaltyType = type; state.penaltyName = name; state.penaltyClock = clock;
      const cb = document.getElementById('penLockCheck'); if (cb) cb.checked = !!locked;
      logTigersPenalty(secs);
    }
    tig(33, 'Slashing', 'Personal', 60, '08:45', true);
    tig(44, 'Holding', 'Technical', 30, '06:10', false);
    state.penaltyTeam = 'opponent'; state.oppPenaltyJersey = '22'; state.oppInHomeJersey = '9';
    state.penaltyType = 'Personal'; state.penaltyName = 'Cross-check'; state.penaltyClock = '06:10';
    const cb = document.getElementById('penLockCheck'); if (cb) cb.checked = false;
    logOpponentPenalty(false, 120);
    document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show'));
  });
  await shotRegion('penalties.png', '.quarter-bar', '.team-actions', 12);

  // By Player view
  await page.evaluate(() => { sfSetView('player'); setFilter('All'); });
  await shotRegion('byplayer.png', '#viewToggle', '#playerGrid', 12);
  await page.evaluate(() => sfSetView('stat'));

  // History: one game synced, one waiting to sync
  await page.evaluate(() => {
    const ev = state.activeGame.events;
    state.gameHistory = [
      { id: 'G1', opponent: 'Demo Opponent', date: '2027-03-14', location: 'Home', score: '9-6', eventCount: 142, events: ev, meta: {}, synced: true },
      { id: 'G2', opponent: 'Sample Prep', date: '2027-03-18', location: 'Away', score: '7-5', eventCount: 131, events: ev, meta: {}, synced: false, syncError: 'No connection - tap Press to sync when back online' },
    ];
    state.activeGame = null; saveState();
  });
  await tab('history');
  await shotRegion('history.png', null, '#historyList', 16);

  await browser.close();
})();
