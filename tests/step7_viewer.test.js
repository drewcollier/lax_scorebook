// Family sign-in in the stats viewer (viewer.html) against Code.gs v6 on the mock server.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const VIEW = 'http://localhost:8768/viewer.html', S = 'http://localhost:8770';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (src) => (await fetch(S + '/__run', { method: 'POST', body: src })).json();
const mail = async () => (await fetch(S + '/__mail')).json();
const postS = async (b) => (await fetch(S + '/exec', { method: 'POST', body: JSON.stringify(b) })).json();
const ev = (period, type, pid, extra) => Object.assign({ Timestamp: 't' + Math.random(), Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});

(async () => {
  await fetch(S + '/__reset');
  await run(`PropertiesService.getScriptProperties().setProperty('VIEW_PINS', '7735'); rebuildStats(); var ss = SpreadsheetApp.openById(''); var sh = viewersSheet_(ss);
    sh.appendRow(['mom@example.com','Truman Collier','3','Parent','',true,'','','']);
    sh.appendRow(['sib@example.com','','','','P001',true,'','','']);
    sh.appendRow(['sib@example.com','','','','P003',true,'','','']);
    sh.appendRow(['evil@example.com','','','','P004',true,'','','']);
    sh.appendRow(['wait@example.com','Truman Collier','3','Player','',false,'','','']);
    refreshViewers_(ss); 1`);
  const st = await run(`readViewers_(viewersSheet_(SpreadsheetApp.openById(''))).rows.map(function(r){return r.Player_ID})`);
  check('setup: viewers linked to players', st.join() === 'P001,P001,P003,P004,P001', st);
  await postS({ action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G1', Date: '2026-04-15', Opponent: 'Carmel', Location: 'Home', Score: '2-1' }, events: [
    ev('Q1', 'Shot', 'P002', { Zone_ID: '2C', Timestamp: 'c0' }), ev('Q1', 'Goal', 'P002', { Secondary_Player_ID: 'P001', Zone_ID: '2C', Timestamp: 'c0' }),
    ev('Q1', 'Shot', 'P001', { Zone_ID: '1L', Timestamp: 'c1' }), ev('Q1', 'SOG', 'P001', { Timestamp: 'c1' }), ev('Q1', 'Goal', 'P001', { Zone_ID: '1L', Timestamp: 'c1' }), ev('Q2', 'GB', 'P001'),
    ev('Q3', 'Save', 'P003'), ev('Q3', 'Save', 'P003'), ev('Q4', 'Shot', 'P004', { Zone_ID: '3R' }) ] } });
  await postS({ action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G2', Date: '2026-04-20', Opponent: 'Zionsville', Location: 'Away', Score: '5-6' }, events: [
    ev('Q1', 'Shot', 'P001', { Zone_ID: '3C' }), ev('Q2', 'GB', 'P001'), ev('Q2', 'GB', 'P001') ] } });

  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [], dialogs = [], bodies = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(d.type() === 'prompt' ? '7735' : undefined); }); // a view-only coach PIN
  page.on('response', async (r) => { if (r.url().indexOf(':8770') >= 0) { try { bodies.push(await r.text()); } catch (e) {} } });
  const vis = (sel) => page.isVisible(sel);

  await page.goto(VIEW);
  await page.waitForSelector('#signInCard:not(.hide)');
  check('opens on the family sign-in (no PIN prompt)', dialogs.length === 0 && !(await vis('#setupCard')) && !(await vis('#content')));

  // unknown email: same screen as a real one, no email sent
  await page.fill('#signEmail', 'stranger@example.com');
  await page.click('#sendCodeBtn');
  await page.waitForSelector('#codeStep:not(.hide)');
  check('unknown email: moves to the code step, nothing is sent', (await mail()).length === 0 && /stranger@example.com/.test(await page.textContent('#codeStep')));
  await page.click('text=Use a different email');
  await page.fill('#signEmail', 'not-an-email');
  await page.click('#sendCodeBtn');
  check('bad email: message on screen', /valid email/.test(await page.textContent('#signStatus')));

  await page.fill('#signEmail', 'Mom@Example.com');
  await page.click('#sendCodeBtn');
  await page.waitForSelector('#codeStep:not(.hide)');
  const m = await mail();
  const code = /(\d{6})$/.exec(m[m.length - 1].subject)[1];
  check('approved email gets the code', m.length === 1 && m[0].to === 'mom@example.com');
  await page.fill('#signCode', code === '000000' ? '111111' : '000000');
  await page.click('#verifyBtn');
  await page.waitForFunction(() => /not right/.test(document.getElementById('signStatus').textContent));
  check('wrong code: message, still on the code step', await vis('#codeStep'));
  await page.fill('#signCode', code);
  await page.click('#verifyBtn');
  await page.waitForSelector('#famCards:not(.hide)');
  await page.waitForSelector('#content:not(.hide)');
  const who = await page.textContent('#whoText');
  check('signed in: shows who and the family view', /mom@example.com/.test(who) && !(await vis('#signInCard')));
  const season = await page.textContent('#seasonTable');
  check('season totals card (GP 2, G 1, A 1)', /GP/.test(season), season);
  const sRow = await page.$$eval('#seasonTable td', (t) => t.map((x) => x.textContent));
  check('season numbers right', sRow[0] === '2' && sRow[1] === '1' && sRow[2] === '1' && sRow[3] === '2', sRow);
  const gbg = await page.$$eval('#gameByGame tbody tr', (r) => r.map((x) => x.textContent));
  check('game by game, newest first, with results', gbg.length === 2 && /Zionsville/.test(gbg[0]) && /@ Zionsville/.test(gbg[0]) && /vs Carmel/.test(gbg[1]) && /2-1/.test(gbg[1]), gbg);
  check('team-only cards hidden for families', !(await vis('#teamCards')) && !(await vis('#playerFilter')) && !(await vis('#urlBtn')));
  const roster = await page.textContent('#rosterTable');
  check('player table shows only their player', /Truman Collier/.test(roster) && !/Graham|Elijah/.test(roster), roster);
  const tally = await page.textContent('#hmTally');
  check('season heatmap counts only their shots (2 shots: a goal + a miss; the assist is not a shot)', /^2 total shots/.test(tally.replace(/\s+/g, ' ')) && /1 Goals/.test(tally), tally);
  await page.click('#gameByGame tr[data-gid="G1"]');
  check('tapping a game row picks that game', (await page.inputValue('#gamePick')) === 'G1' && /Carmel/.test(await page.textContent('#gameMeta')));
  check('one-game view counts 1 goal + 1 assist', /1 total shots/.test((await page.textContent('#hmTally')).replace(/\s+/g, ' ')) &&
    (await page.$$eval('#rosterTable tbody tr:not(.pos-head) td', (t) => t.map((x) => x.textContent))).slice(2).join() === '1,1,1,1,1,', await page.$$eval('#rosterTable tbody tr:not(.pos-head) td', (t) => t.map((x) => x.textContent)));
  const all = bodies.join('\n');
  check('nothing about other players reached this device', all.indexOf('Graham') < 0 && all.indexOf('Elijah') < 0 && all.indexOf('P002') < 0 && all.indexOf('P003') < 0, all.slice(0, 300));

  await page.reload();
  await page.waitForSelector('#famCards:not(.hide)');
  check('stays signed in after a reload (no new code)', (await mail()).length === 1 && /mom@example.com/.test(await page.textContent('#whoText')));
  const tok = await page.evaluate(() => JSON.parse(localStorage.getItem('lax_viewer_session')).token);
  check('only a random token is kept on the device', /^[0-9a-f]{64}$/.test(tok));

  // coach revokes
  await run(`var ss=SpreadsheetApp.openById(''); var sh=viewersSheet_(ss); sh.getRange(2,6).setValues([[false]]); refreshViewers_(ss); 1`);
  await page.click('text=Refresh');
  await page.waitForSelector('#signInCard:not(.hide)');
  check('unapproved: signed out with a clear message', /no longer approved/.test(await page.textContent('#signStatus')) && !(await page.evaluate(() => localStorage.getItem('lax_viewer_session'))));

  // siblings
  await page.fill('#signEmail', 'sib@example.com'); await page.click('#sendCodeBtn'); await page.waitForSelector('#codeStep:not(.hide)');
  let mm = await mail(); await page.fill('#signCode', /(\d{6})$/.exec(mm[mm.length - 1].subject)[1]); await page.click('#verifyBtn');
  await page.waitForSelector('#famCards:not(.hide)');
  const opts = await page.$$eval('#famPlayer option', (o) => o.map((x) => x.textContent));
  check('two players on one email: a picker appears', (await vis('#famPlayer')) && opts.length === 2, opts);
  await page.selectOption('#famPlayer', 'P003');
  const gk = await page.textContent('#seasonTable');
  check('switching player shows the goalie columns and his saves', /SV/.test(gk) && /Elijah Dorris/.test(await page.textContent('#rosterTable')) && !/Truman/.test(await page.textContent('#rosterTable')), gk);

  // sign out
  const tok2 = await page.evaluate(() => JSON.parse(localStorage.getItem('lax_viewer_session')).token);
  await page.click('#signOutBtn');
  await page.waitForSelector('#signInCard:not(.hide)');
  await sleep(300);
  check('sign out: back to sign-in, device forgets the token', !(await page.evaluate(() => localStorage.getItem('lax_viewer_session'))) && /signed out/.test(await page.textContent('#signStatus')));
  check('sign out also ends it on the script', (await postS({ action: 'myStats', token: tok2 })).error === 'NOT_SIGNED_IN');

  // a player name with HTML in it shows as text
  await page.fill('#signEmail', 'evil@example.com'); await page.click('#sendCodeBtn'); await page.waitForSelector('#codeStep:not(.hide)');
  mm = await mail(); await page.fill('#signCode', /(\d{6})$/.exec(mm[mm.length - 1].subject)[1]); await page.click('#verifyBtn');
  await page.waitForSelector('#famCards:not(.hide)');
  await sleep(300);
  check('names with HTML are shown as text', (await page.evaluate(() => window.__xss)) === undefined && /O'Brien & Sons/.test(await page.textContent('#rosterTable')));
  await page.click('#signOutBtn'); await page.waitForSelector('#signInCard:not(.hide)');

  // coach view
  await page.click('text=Use a coach PIN');
  await page.waitForFunction(() => document.getElementById('gamePick').options.length >= 3);
  check('coach view: a view-only coach PIN lists the games', dialogs.length === 1 && /coach PIN/.test(dialogs[0]));
  await page.selectOption('#gamePick', 'G1');
  await page.waitForSelector('#content:not(.hide)');
  check('coach view shows the whole team', (await vis('#teamCards')) && /Graham Vergara/.test(await page.textContent('#rosterTable')) && !(await vis('#famCards')));
  await page.click('#signOutBtn');
  await page.waitForSelector('#signInCard:not(.hide)');
  check('exit coach view: back to sign-in, PIN forgotten', (await page.evaluate(() => typeof V !== 'undefined' && V.pin === '')) && !(await vis('#content')));

  check('the coach PIN cannot save a game', (await postS({ action: 'exportGame', pin: '7735', gameData: { events: [], game: { Game_ID: 'GX', Date: '2026-05-01', Opponent: 'X', Location: 'Home', Score: '' } } })).error === 'INVALID_PIN');
  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
