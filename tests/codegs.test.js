// Step 2 Code.gs tests: node codegs.test.js
const path = require('path');
const { makeEnv, seedLiveWorkbook, GAME_LOG_HEADERS } = require('./gas_mock');
const CODE = path.resolve(process.env.CODE || require('path').join(__dirname, '..', 'Code.gs'));
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) failures++;
}
function post(env, payload) { return env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(payload), type: 'text/plain' } }); }
function postForm(env, payload) { return env.ctx.doPost({ parameter: { payload: JSON.stringify(payload) }, postData: { contents: 'payload=' + encodeURIComponent(JSON.stringify(payload)) } }); }
function J(out) { return JSON.parse(out.content); }

function ev(period, type, pid, extra) {
  return Object.assign({ Timestamp: '2026-04-15T22:00:00Z', Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
}
function sampleGame(id, opp, n) {
  const events = [
    ev('Q1', 'Shot', '113'), ev('Q1', 'SOG', '113'), ev('Q1', 'Goal', '113', { Secondary_Player_ID: '114', Game_Clock: '05:00' }),
    ev('Q2', 'Opp_Goal', 'OPPONENT'), ev('Q2', 'GB', '114'), ev('Q2', 'GB', '113'),
    ev('Q3', 'FOW', '113'), ev('Q3', 'FOW', '113'), ev('Q3', 'FOL', '113'),
    ev('Q4', 'Clear_Good'), ev('Q4', 'Clear_Fail'), ev('Q4', 'Save', '1157'),
    ev('Q4', 'Penalty', '113', { Pen_Duration: 60, Penalty_Type: 'Personal' }),
    ev('Q4', 'Penalty', 'In-Home', { Pen_Duration: 30, Penalty_Type: 'Technical' }),
    ev('Q4', 'Penalty', 'Opp #22', { Pen_Duration: 90, Penalty_Type: 'Personal' }),
    ev('Q4', 'EMO_Success', 'TEAM'), ev('Q4', 'EMO_Fail', 'TEAM'), ev('Q4', 'EMO_Fail', 'TEAM'),
    ev('OT1', 'Goal', '114'),
  ];
  for (let i = 0; i < (n || 0); i++) events.push(ev('Q2', 'GB', '114'));
  return { action: 'exportGame', pin: '1234', gameData: {
    events: events.map((e) => Object.assign({ Game_ID: id }, e)),
    game: { Game_ID: id, Date: '2026-04-15', Opponent: opp, Location: 'Home', Score: '2-1', Weather_Temp: '60°F', Head_Official: 'Ref One' } } };
}
function eventRowsFor(env, id) { return env.sheets['Events'].getDataRange().getValues().slice(1).filter((r) => r[1] === id); }
function glRow(env, id) {
  const vals = env.sheets['Game Log'].getDataRange().getValues();
  const idCol = vals[0].indexOf('Game_ID');
  const row = vals.slice(1).find((r) => r[idCol] === id);
  if (!row) return null;
  const o = {}; vals[0].forEach((h, i) => (o[h] = row[i])); return o;
}

// ---------- version + old-app compatibility ----------
let env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
let out = env.ctx.doGet({ parameter: { action: 'version' } });
check('version endpoint answers JSON version 9', out.mime === 'application/json' && J(out).version === 9, out);
out = env.ctx.doGet({ parameter: {} });
check('plain GET still answers the text banner', /Apps Script Active/.test(out.content), out);
out = post(env, { test: true });
check('Test Connection (JSON) answers success + version', J(out).success === true && J(out).version === 9, out);
out = postForm(env, { test: true });
check('old app (form post) still gets the HTML reply', out.kind === 'html' && /scorebook_response/.test(out.content), out.kind);

// ---------- PIN ----------
const bad = sampleGame('G1', 'Carmel'); bad.pin = '9999';
out = post(env, bad);
check('wrong PIN is refused and nothing is written', J(out).error === 'INVALID_PIN' && eventRowsFor(env, 'G1').length === 0, J(out));

// ---------- first save ----------
out = post(env, sampleGame('G1', 'Carmel'));
let r = J(out);
check('save succeeds with a JSON confirmation', r.success === true && r.eventsWritten === 19 && r.replaced === false, r);
check('19 Events rows written', eventRowsFor(env, 'G1').length === 19);
let games = env.sheets['Games'].getDataRange().getValues();
check('Games row written with Game_Label for the scoresheet dropdown', games.length === 2 && games[1][5] === '2026-04-15 - Carmel (Home)' && games[1][9] === 'Ref One', games[1]);

// ---------- Game Log ----------
const gl = glRow(env, 'G1');
check('old Game Log formulas cleared (one-time switch-over)', env.sheets['Game Log'].getRange(3, 1, 1, 5).getFormulas()[0].join('') === '', env.sheets['Game Log'].getRange(3, 1, 1, 5).getFormulas());
check('Game Log row written for the game', !!gl, gl);
if (gl) {
  check('Game Log: goals by period + result', gl.Tigers_Q1 === 1 && gl.Tigers_OT1 === 1 && gl.Tigers_Final === 2 && gl.Opp_Q2 === 1 && gl.Opp_Final === 1 && gl.Result === 'W', gl);
  check('Game Log: GB / shots / SOG', gl.GB_Q2 === 2 && gl.GB_Tot === 2 && gl.Shots_Tot === 1 && gl.SOG_Q1 === 1, gl);
  check('Game Log: clears + faceoffs + %', gl.ClearSucc_Tot === 1 && gl.ClearFail_Tot === 1 && gl.Clear_Pct === 0.5 && gl.FOWon_Q3 === 2 && gl.FOLost_Tot === 1 && Math.abs(gl.FO_Pct - 2 / 3) < 1e-9, gl);
  check('Game Log: saves + EMO', gl.Sv_Q4 === 1 && gl.Sv_Tot === 1 && gl.EMO_Success === 1 && gl.EMO_Fail === 2 && Math.abs(gl.EMO_Pct - 1 / 3) < 1e-9, gl);
  check('Game Log: penalties split Tigers vs Opp (In-Home counts as Tigers)', gl.Pen_Count_Tigers === 2 && gl.Pen_Min_Tigers === 1.5 && gl.Personal_Count_Tigers === 1 && gl.Pen_Count_Opp === 1 && gl.Pen_Min_Opp === 1.5, gl);
  check('Game Log: unused % columns are blank, not errors', glRow(env, 'G1').Ejections_Tigers === 0, gl);
}
check('Game Log has exactly one data row', env.sheets['Game Log'].getLastRow() === 2, env.sheets['Game Log'].getLastRow());

// ---------- re-sync replaces instead of doubling ----------
const resend = sampleGame('G1', 'Carmel');
resend.gameData.events = resend.gameData.events.slice(0, 10); // e.g. corrected game, fewer rows
resend.gameData.game.Score = '1-1';
r = J(post(env, resend));
check('re-sync of the same game says "replaced"', r.success && r.replaced === true, r);
check('re-sync leaves only the new copy of Events rows', eventRowsFor(env, 'G1').length === 10, eventRowsFor(env, 'G1').length);
games = env.sheets['Games'].getDataRange().getValues();
check('re-sync updates the Games row in place (no duplicate)', games.length === 2 && games[1][4] === '1-1', games);
check('re-sync updates the Game Log row in place', env.sheets['Game Log'].getLastRow() === 2 && glRow(env, 'G1').Tigers_Final === 1, glRow(env, 'G1'));

// second game, then re-sync the FIRST game: second game's rows must be untouched
post(env, sampleGame('G2', 'Zionsville'));
post(env, sampleGame('G1', 'Carmel'));
check('re-syncing game 1 does not touch game 2', eventRowsFor(env, 'G2').length === 19 && eventRowsFor(env, 'G1').length === 19, [eventRowsFor(env, 'G1').length, eventRowsFor(env, 'G2').length]);
check('Games has exactly 2 rows of data', env.sheets['Games'].getLastRow() === 3);

// ---------- Events grows past 1,000 rows ----------
env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
let allOk = true;
for (let g = 1; g <= 6; g++) { const res = J(post(env, sampleGame('B' + g, 'Opp' + g, 300))); if (!res.success) { allOk = false; console.log(res); } }
check('six 319-row games save fine (Events grows past its 1,000 rows)', allOk && env.sheets['Events'].getLastRow() === 1 + 6 * 319, env.sheets['Events'].getLastRow());

// the ORIGINAL Code.gs fails here - proves the test catches the bug
if (!process.env.CODE) {
  const old = seedLiveWorkbook(makeEnv({ codePath: '/tmp/orig/Code.gs' }));
  let oldFail = false;
  for (let g = 1; g <= 6; g++) {
    const o = old.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(sampleGame('B' + g, 'X', 300)) } });
    if (/outside the dimensions/.test(o.content)) oldFail = true;
  }
  check('(control) the current main Code.gs DOES fail past 1,000 rows', oldFail);
}

// ---------- busy lock ----------
env = seedLiveWorkbook(makeEnv({ codePath: CODE, lockBusy: true }));
r = J(post(env, sampleGame('L1', 'Busy')));
check('two saves at once: the second is told to retry, nothing half-written', r.success === false && r.error === 'BUSY' && eventRowsFor(env, 'L1').length === 0, r);

// ---------- Rebuild Game Log menu ----------
env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
post(env, sampleGame('R1', 'A')); post(env, sampleGame('R2', 'B'));
env.sheets['Game Log'].getRange(2, 1, 2, 86).clearContent();
env.ctx.rebuildGameLog();
check('Rebuild Game Log recreates every game from Events', glRow(env, 'R1') && glRow(env, 'R2') && glRow(env, 'R2').Tigers_Final === 2 && /2 game/.test(env.ctx.__alerts.pop()), glRow(env, 'R2'));

// ---------- PIN not configured -> still open (unchanged until step 3) ----------
env = seedLiveWorkbook(makeEnv({ codePath: CODE, pin: null }));
r = J(post(env, Object.assign(sampleGame('P1', 'NoPin'), { pin: '' })));
check('no WRITE_PIN set: saving is REFUSED (fail closed)', r.success === false && r.error === 'PIN_NOT_SET' && eventRowsFor(env, 'P1').length === 0, r);

// ---------- scoresheet still finds a game by its label ----------
env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
post(env, sampleGame('S1', 'Carmel'));
env.sheets['Scoresheet Template'] = new (require('./gas_mock').makeEnv({ codePath: CODE }).Sheet)('Scoresheet Template');
env.sheets['Scoresheet Template'].getRange(2, 2).setValues([['2026-04-15 - Carmel (Home)']]);
let shown = null;
env.ctx.SpreadsheetApp.getUi = () => ({ alert: (m) => { shown = 'ALERT ' + m; }, showModalDialog: (h) => { shown = h.content; } });
env.ctx.generateScoresheetPDF();
check('printable scoresheet finds the new game via its label', shown && /OFFICIAL GAME SCORESHEET/.test(shown) && /Carmel/.test(shown), (shown || '').slice(0, 120));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
