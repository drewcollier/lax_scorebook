// The coaches' page (coach.html) against the mock workbook (8770).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PAGE = 'http://localhost:8768/coach.html', S = 'http://localhost:8770';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (src) => (await fetch(S + '/__run', { method: 'POST', body: src })).json();
const postS = async (b) => (await fetch(S + '/exec', { method: 'POST', body: JSON.stringify(b) })).json();
let n = 0;
const ev = (period, type, pid, extra) => Object.assign({ Timestamp: 't' + (n++), Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
const goal = (q, pid, ast, str) => { const ts = 'g' + (n++); return [ev(q, 'Shot', pid, { Timestamp: ts, Strength: str || 'Even' }), ev(q, 'SOG', pid, { Timestamp: ts, Strength: str || 'Even' }), ev(q, 'Goal', pid, { Timestamp: ts, Secondary_Player_ID: ast || '', Strength: str || 'Even' })]; };
const oppGoal = (q, str) => { const ts = 'o' + (n++); return [ev(q, 'Opp_Shot', 'OPPONENT', { Timestamp: ts, Strength: str || 'Even' }), ev(q, 'Opp_SOG', 'OPPONENT', { Timestamp: ts, Strength: str || 'Even' }), ev(q, 'Opp_Goal', 'OPPONENT', { Timestamp: ts, Strength: str || 'Even' })]; };
const pen = (q, pid, type, name, secs, clock) => ev(q, 'Penalty', pid, { Penalty_Type: type, Penalty_Name: name, Pen_Duration: String(secs), Game_Clock: clock });

(async () => {
  await fetch(S + '/__reset');
  await run("PropertiesService.getScriptProperties().setProperty('VIEW_PINS','7735'); rebuildStats(); 1");
  // G1: Tigers 3-2 vs Carmel
  const g1 = [].concat(goal('Q1', 'P001', 'P002'), goal('Q2', 'P002', '', 'Man-Up'), goal('Q4', 'P001', 'P002'), oppGoal('Q1'), oppGoal('Q3', 'Man-Down'),
    [ev('Q1', 'Shot', 'P001'), ev('Q1', 'Opp_Shot', 'OPPONENT'), ev('Q1', 'Opp_SOG', 'OPPONENT', { Timestamp: 'x1' }), ev('Q1', 'Opp_Shot', 'OPPONENT', { Timestamp: 'x1' }),
     ev('Q1', 'GB', 'P001'), ev('Q1', 'GB', 'P002'), ev('Q2', 'GB', 'P002'), ev('Q2', 'TO', 'P001'), ev('Q2', 'CTO', 'P002'), ev('Q2', 'INT', 'P002'),
     ev('Q1', 'FOW', 'P002'), ev('Q1', 'FOW', 'P002'), ev('Q2', 'FOL', 'P002'),
     ev('Q1', 'Save', 'P003'), ev('Q2', 'Save', 'P003'), ev('Q2', 'Save', 'P003'), ev('Q1', 'GA', 'P003'), ev('Q3', 'GA', 'P003'),
     ev('Q1', 'Clear_Good'), ev('Q1', 'Clear_Good'), ev('Q2', 'Clear_Good'), ev('Q2', 'Clear_Fail'), ev('Q2', 'Ride_Good'), ev('Q3', 'Ride_Fail'),
     ev('Q2', 'EMO_Success'), ev('Q3', 'EMO_Fail'),
     pen('Q1', 'P001', 'Personal', 'Slash', 60, '09:30'), pen('Q3', 'P001', 'Technical', 'Offsides', 30, '04:00'), pen('Q2', 'In-Home', 'Technical', 'Illegal Procedure', 30, '06:00'),
     pen('Q1', 'Opp #22', 'Personal', 'Cross Check', 60, '07:30'), pen('Q2', 'Opp #22', 'Personal', 'Slash', 120, '11:00'), pen('Q2', 'Opp #22', 'Personal', 'Unnecessary Roughness', 180, '03:00'),
     pen('Q3', 'Opp #9', 'Technical', 'Holding', 30, '10:00'), ev('Q2', 'Ejection', 'Opp #22')]);
  await postS({ action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G1', Date: '2026-04-15', Opponent: 'Carmel', Location: 'Home', Score: '3-2' }, events: g1 } });
  // G2: Tigers 1-4 @ Zionsville; the HTML-named player (P004) plays
  const g2 = [].concat(goal('Q1', 'P004'), oppGoal('Q1'), oppGoal('Q2'), oppGoal('Q3'), oppGoal('Q4'), [ev('Q1', 'GB', 'P001'), ev('Q1', 'FOL', 'P002'), ev('Q2', 'FOL', 'P002')]);
  await postS({ action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G2', Date: '2026-04-20', Opponent: 'Zionsville', Location: 'Away', Score: '1-4' }, events: g2 } });

  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 900 } })).newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().indexOf(':8770') >= 0) reqs.push(r.url() + ' ' + (r.postData() || '')); });
  await page.goto(PAGE);
  check('opens on the PIN box, nothing loaded yet', await page.isVisible('#pinCard') && !(await page.isVisible('#main')) && reqs.length === 0);
  await page.fill('#pinInput', '0000'); await page.click('#unlockBtn');
  await page.waitForFunction(() => /not right/.test(document.getElementById('pinStatus').textContent));
  check('wrong PIN: says so, stays locked', !(await page.isVisible('#main')));
  await page.fill('#pinInput', '7735'); await page.click('#unlockBtn');
  await page.waitForSelector('#main:not(.hide)');
  check('a view-only coach PIN opens it; 2 games loaded', /2 games loaded/.test(await page.textContent('#loadStatus')));
  check('the PIN only travels in the request body, never the URL', reqs.every((r) => r.split(' ')[0].indexOf('7735') < 0));
  check('newest game first in the picker', (await page.$$eval('#gamePick option', (o) => o.map((x) => x.textContent)))[0].indexOf('Zionsville') >= 0);

  // ---- game view ----
  await page.selectOption('#gamePick', 'G1');
  const head = (await page.textContent('#gameHead')).replace(/\s+/g, ' ');
  check('game header: W Tigers 3 – 2 Carmel, date, location', /W Tigers 3 – 2 Carmel/.test(head) && /2026-04-1[45] · Home/.test(head), head);
  const q = await page.$$eval('#gameHead tbody tr', (r) => r.map((x) => Array.from(x.children).map((c) => c.textContent).join(',')));
  check('score by quarter', q[0] === 'Tigers,1,1,0,1,3' && q[1] === 'Carmel,1,0,1,0,2', q);
  const team = await page.$$eval('#gameTeam tbody tr', (r) => r.reduce((o, x) => { const c = Array.from(x.children).map((y) => y.textContent); if (c.length === 3) o[c[0]] = c[1] + ' | ' + c[2]; return o; }, {}));
  check('goals / shots / SOG both teams', team['Goals'] === '3 | 2' && team['Shots'] === '4 | 4' && team['Shots on goal'] === '3 | 3', team);
  check('shooting % both teams', team['Shooting % (goals ÷ shots)'] === '75.0% | 50.0%', team);
  check('saves / save %', team['Saves / save %'] === '3 / 60.0% | –', team);
  check('faceoffs both sides', team['Faceoffs won'] === '2 of 3 (66.7%) | 1 of 3 (33.3%)', team);
  check('GB / TO / CT / INT', team['Ground balls'] === '3 | –' && team['Turnovers'] === '1 | –' && team['Caused turnovers'] === '1 | –' && team['Interceptions'] === '1 | –', team);
  check('clears and rides with %', team['Clears'] === '3 of 4 (75.0%) | –' && team['Rides'] === '1 of 2 (50.0%) | –', team);
  check('extra man, and man-up goals for both sides', team['Extra man (scored / chances)'] === '1 of 2 (50.0%) | –' && team['Man-up goals'] === '1 | 1', team);
  check('penalties both teams: count, time, personal/technical, fouled out', team['Penalties'] === '3 | 4' && team['Penalty time'] === '2:00 | 6:30' && team['Personal / technical'] === '1 / 2 | 3 / 1' && team['Ejections / fouled out'] === '0 | 1', team);
  const pl = await page.$$eval('#gamePlayers tbody tr', (r) => r.map((x) => Array.from(x.children).map((c) => c.textContent).join(',')));
  check('player table, most points first (Graham 1G 2A = 3, then Truman 2G = 2)', /^4,Graham Vergara,Attack,1,2,3,1,1,100.0%,2,1,0,1,2,1,66.7%,0,0,–,0,0:00$/.test(pl[0]) && /^3,Truman Collier,Midfield,2,0,2,3,2,66.7%,1,0,1,0,0,0,–,0,0,–,2,1:30$/.test(pl[1]), pl.slice(0, 3));
  check('goalie row: saves, GA, SV%', pl.some((r) => /^57,Elijah Dorris,Goalie,0,0,0,0,0,–,0,0,0,0,0,0,–,3,2,60.0%,0,0:00$/.test(r)), pl);
  await page.click('#gamePlayers th[data-by="GB"]');
  let first = (await page.$$eval('#gamePlayers tbody tr', (r) => r.map((x) => x.children[1].textContent)))[0];
  check('tap a heading to sort (GB: Graham 2 first)', first === 'Graham Vergara', first);
  await page.click('#gamePlayers th[data-by="GB"]');
  first = (await page.$$eval('#gamePlayers tbody tr', (r) => r.map((x) => x.children[1].textContent)))[0];
  check('tap again to reverse', first !== 'Graham Vergara');
  const pens = await page.$$eval('#gamePens .pens > div', (d) => d.map((x) => x.querySelector('h3').textContent + ' ' + Array.from(x.querySelectorAll('tr')).map((r) => Array.from(r.children).map((c) => c.textContent.trim()).join(' ')).join(' | ') + ' ' + x.querySelector('.pen-sum').textContent).join(' || '));
  check('Tigers penalties listed with player names, quarter, clock, type', /#3 Truman Collier Q1 09:30 Slash Personal 1:00/.test(pens) && /In-Home \(team\) Q2 06:00 Illegal Procedure Technical 0:30/.test(pens), pens.slice(0, 300));
  check('opponent penalties listed by jersey, with OUT on the ejected player', /Carmel/.test(pens) && /#22 OUT Q1 07:30 Cross Check Personal 1:00/.test(pens) && /#9 Q3 10:00 Holding Technical 0:30/.test(pens), pens);
  check('totals under each list', /3 penalties, 2:00 · personal: 1 \(1:00\) · technical: 2 \(1:00\)/.test(pens) && /4 penalties, 6:30 · personal: 3 \(6:00\) · technical: 1 \(0:30\)/.test(pens), pens);
  await page.screenshot({ path: '/tmp/coach_game.png', fullPage: true });

  // ---- season ----
  await page.click('.ctab[data-view="season"]');
  const sh = (await page.textContent('#seasonHead')).replace(/\s+/g, ' ');
  check('season record 1–1, goals for 4 against 6', /1–1/.test(sh) && /goals for 4 · goals against 6/.test(sh), sh);
  const sg = await page.$$eval('#seasonGames tbody tr', (r) => r.map((x) => Array.from(x.children).map((c) => c.textContent).join(',')));
  check('game by game, oldest first, with results', /^2026-04-1[45],vs Carmel,W 3–2,4,75.0%,3,1,1,66.7%,75.0%,50.0%,1\/2,60.0%,3 \(2:00\),4 \(6:30\)$/.test(sg[0]) && /^2026-04-(19|20),@ Zionsville,L 1–4,1,100.0%/.test(sg[1]), sg);
  check('season totals row', /^Season,,1–1,5,80.0%,4,1,1,40.0%,75.0%,50.0%,1\/2,60.0%,3 \(2:00\),4 \(6:30\)$/.test(sg[2]), sg[2]);
  await page.click('#seasonGames tr[data-gid="G2"]');
  check('tap a game row: opens that game', await page.isVisible('#view-game') && /L Tigers 1 – 4 Zionsville/.test((await page.textContent('#gameHead')).replace(/\s+/g, ' ')));
  // ---- players ----
  await page.click('.ctab[data-view="players"]');
  const sp = await page.$$eval('#seasonPlayers tbody tr', (r) => r.map((x) => Array.from(x.children).map((c) => c.textContent).join(',')));
  check('season players with games played', sp.some((r) => /^3,Truman Collier,Midfield,2,2,0,2,/.test(r)) && sp.some((r) => /^4,Graham Vergara,\w*,2,1,2,3,/.test(r)), sp);
  check('a name with HTML in it shows as text', (await page.evaluate(() => window.__xss)) === undefined && /O'Brien & Sons/.test(await page.textContent('#seasonPlayers')));
  await page.screenshot({ path: '/tmp/coach_players.png', fullPage: true });
  await page.click('.ctab[data-view="season"]');
  await page.screenshot({ path: '/tmp/coach_season.png', fullPage: true });
  // ---- refresh / lock ----
  await postS({ action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G3', Date: '2026-04-25', Opponent: 'Fishers South', Location: 'Home', Score: '0-0' }, events: [ev('Q1', 'GB', 'P001')] } });
  await page.click('#refreshBtn');
  await page.waitForFunction(() => /3 games loaded/.test(document.getElementById('loadStatus').textContent));
  check('Refresh picks up a newly saved game', true);
  await page.click('#lockBtn');
  check('Lock hides everything and forgets the PIN', await page.isVisible('#pinCard') && !(await page.isVisible('#main')) && (await page.evaluate(() => C.pin === '' && C.events.length === 0)));
  for (let i = 0; i < 10; i++) await postS({ action: 'getGames', pin: 'bad' + i });
  await page.fill('#pinInput', '7735'); await page.click('#unlockBtn');
  await page.waitForFunction(() => { const t = document.getElementById('pinStatus').textContent; return t.length > 12 && !/Opening|Loading/.test(t); });
  check('during a PIN lockout it shows the lockout message', /Too many wrong PINs/.test(await page.textContent('#pinStatus')), await page.textContent('#pinStatus'));
  await run("CacheService.getScriptCache().remove('PIN_LOCK'); 1");
  // viewer link
  await page.goto('http://localhost:8768/viewer.html');
  await page.waitForSelector('#signInCard:not(.hide)');
  check('the viewer sign-in screen links to the coaches\' page', (await page.getAttribute('#signInCard a[href="coach.html"]', 'href')) === 'coach.html');
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
