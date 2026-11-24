// Step 5 Code.gs: MaxPreps Export tab (season to date) + scoresheet fixes.
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);
function ev(period, type, pid, extra) {
  return Object.assign({ Timestamp: 't', Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
}
const game = (id, events) => ({ action: 'exportGame', pin: '1234', gameData: { events, game: { Game_ID: id, Date: '2026-04-15', Opponent: 'Opp ' + id, Location: 'Home', Score: '' } } });
function mp(env) {
  const v = env.sheets['MaxPreps Export'].getDataRange().getValues();
  const o = {}; v.slice(1).forEach((r) => { const x = {}; v[0].forEach((h, i) => (x[h] = r[i])); o[x['Player Name']] = x; }); return { rows: v.slice(1), by: o };
}

const env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
env.ctx.rebuildStats(); // P001 Truman (#3 Mid), P002 Graham (#4 Att), P003 Elijah (#57 Goalie)
let m = mp(env);
check('MaxPreps Export switched to plain values, one row per player, jersey order', m.rows.length === 3 && m.rows.map((r) => r[0]).join() === '3,4,57' && env.sheets['MaxPreps Export'].getRange(2, 1, 3, 21).getFormulas().every((r) => r.every((f) => !f)), m.rows);

// Game 1: single goalie, 3-0 shutout win, in regulation.
post(env, game('G1', [
  ev('Q1', 'Shot', 'P001'), ev('Q1', 'SOG', 'P001'), ev('Q1', 'Goal', 'P001', { Secondary_Player_ID: 'P002' }),
  ev('Q1', 'Shot', 'P002'), ev('Q1', 'SOG', 'P002'), ev('Q1', 'Goal', 'P002'),
  ev('Q2', 'Goal', 'P002'), ev('Q2', 'GB', 'P001'), ev('Q2', 'INT', 'P001'), ev('Q2', 'CTO', 'P001'), ev('Q2', 'TO', 'P001'),
  ev('Q3', 'FOW', 'P001'), ev('Q3', 'FOL', 'P001'), ev('Q3', 'FOW', 'P001'),
  ev('Q3', 'Save', 'P003'), ev('Q3', 'Save', 'P003'), ev('Q3', 'Opp_SOG', 'OPPONENT'),
  ev('Q4', 'Penalty', 'P001', { Pen_Duration: 90, Penalty_Type: 'Personal' }),
  ev('Q4', 'Penalty', 'P001', { Pen_Duration: 60, Penalty_Type: 'Personal' }),
  ev('Q4', 'Penalty', 'Opp #9', { Pen_Duration: 60 }),
]));
m = mp(env).by;
const t = m['Truman Collier'], gr = m['Graham Vergara']; let el = m['Elijah Dorris'];
check('Goals / Asst / SOG / GB / INT', t.Goals === 1 && t.Asst === 0 && t.SOG === 1 && t.GB === 1 && t.INT === 1 && gr.Goals === 2 && gr.Asst === 1, [t, gr]);
check('TA = caused turnovers, UE = turnovers', t.TA === 1 && t.UE === 1, t);
check('FW and FA (= won + lost)', t.FW === 2 && t.FA === 3, t);
check('P / PM / PS: 2:30 of penalties = 2 penalties, PM 2, PS 30 (opponent penalty not counted)', t.P === 2 && t.PM === 2 && t.PS === 30, t);
check('sole goalie: MIN 48, W 1, shutout 1, SV 2, GA 0', el.MIN === 48 && el.W === 1 && el.L === 0 && el.T === 0 && el['Shut Out'] === 1 && el.SV === 2 && el.GA === 0, el);
check('non-goalies: goalie columns blank', t.MIN === '' && t.GA === '' && t.SV === '' && t.W === '' && t['Shut Out'] === '', t);

// Game 2: single goalie, 1-2 loss in OT1.
post(env, game('G2', [ev('Q1', 'Goal', 'P001'), ev('Q2', 'GA', 'P003'), ev('Q3', 'Save', 'P003'), ev('OT1', 'GA', 'P003'), ev('Q2', 'Opp_Goal', 'OPPONENT'), ev('OT1', 'Opp_Goal', 'OPPONENT')]));
el = mp(env).by['Elijah Dorris'];
check('season adds up: MIN 48 + 52 (OT) = 100, 1 W, 1 L, 1 shutout, SV 3, GA 2', el.MIN === 100 && el.W === 1 && el.L === 1 && el['Shut Out'] === 1 && el.SV === 3 && el.GA === 2, el);

// Game 3: two goalies (Graham went in) -> GA/SV add, no minutes or decision
post(env, game('G3', [ev('Q1', 'Save', 'P003'), ev('Q4', 'Save', 'P002'), ev('Q4', 'GA', 'P002'), ev('Q4', 'Opp_Goal', 'OPPONENT')]));
m = mp(env).by;
check('two-goalie game: saves/GA counted, minutes and W/L not credited to either', m['Elijah Dorris'].MIN === 100 && m['Elijah Dorris'].SV === 4 && m['Elijah Dorris'].L === 1 && m['Graham Vergara'].SV === 1 && m['Graham Vergara'].GA === 1 && m['Graham Vergara'].MIN === '', [m['Elijah Dorris'], m['Graham Vergara']]);

// Re-sync replaces
post(env, game('G3', [ev('Q1', 'Save', 'P003')])); // corrected: only Elijah in goal, 0-0 tie
m = mp(env).by;
check('re-sync of a corrected game: Graham back to no goalie stats; Elijah gets the tie + minutes', m['Graham Vergara'].SV === '' && m['Elijah Dorris'].MIN === 148 && m['Elijah Dorris'].T === 1 && m['Elijah Dorris']['Shut Out'] === 2, [m['Graham Vergara'], m['Elijah Dorris']]);

// Players edit keeps MaxPreps in step
const P = env.sheets['Players'];
P.getRange(5, 2, 1, 3).setValues([[1, 'Zed First', 'LSM']]);
env.ctx.onEdit({ range: P.getRange(5, 2, 1, 3), source: env.ss });
check('a new player on Players appears in MaxPreps Export (jersey order)', mp(env).rows[0][1] === 'Zed First', mp(env).rows.map((r) => r[1]));

// Sheet scoresheet: LSM listed and more than 27 goals shown
const many = []; for (let i = 0; i < 30; i++) many.push(ev('Q1', 'Goal', i % 2 ? 'P001' : 'P002'));
post(env, game('G4', many.concat([ev('Q1', 'GB', 'P004')])));
const { Sheet } = env;
env.sheets['Scoresheet Template'] = new Sheet('Scoresheet Template');
env.sheets['Scoresheet Template'].getRange(2, 2).setValues([['2026-04-15 - Opp G4 (Home)']]);
let html = '';
env.ctx.SpreadsheetApp.getUi = () => ({ alert: (x) => { html = 'ALERT ' + x; }, showModalDialog: (h) => { html = h.content; } });
env.ctx.generateScoresheetPDF();
check('Sheet scoresheet: LSM group listed', />LSM</.test(html) && /Zed First/.test(html), html.slice(0, 80));
check('Sheet scoresheet: goal 30 is shown (was cut off at 27)', /tl-n">30</.test(html) && (html.match(/<b>#/g) || []).length >= 30);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
