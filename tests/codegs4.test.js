// Step 4 Code.gs tests: permanent player IDs + Season Totals written by the script.
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);
function totals(env) {
  const v = env.sheets['Season Totals'].getDataRange().getValues();
  const out = {};
  v.slice(1).forEach((r) => { const o = {}; v[0].forEach((h, i) => (o[h] = r[i])); out[o.Player_ID] = o; });
  return out;
}
const players = (env) => env.sheets['Players'].getDataRange().getValues().slice(1);
function ev(period, type, pid, extra) {
  return Object.assign({ Timestamp: 't', Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
}
function game(id, events) {
  return { action: 'exportGame', pin: '1234', gameData: { events, game: { Game_ID: id, Date: '2026-04-15', Opponent: 'Opp ' + id, Location: 'Home', Score: '1-0' } } };
}

const env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
check('script reports version 9', JSON.parse(env.ctx.doGet({ parameter: { action: 'version' } }).content).version === 9);

// ---------- One-time switch-over via the menu ----------
env.ctx.rebuildStats();
let alert = env.ctx.__alerts.pop();
let pl = players(env);
check('Rebuild Stats gives every player a permanent ID (P001...)', JSON.stringify(pl.map((r) => r[0])) === '["P001","P002","P003"]', pl);
check('...replacing the ="11"&jersey formulas with fixed values', env.sheets['Players'].getRange(2, 1, 3, 1).getFormulas().every((f) => f[0] === ''));
check('...and says what it did', /0 game\(s\), 3 player\(s\), 3 new player ID\(s\)/.test(alert), alert);
let t = totals(env);
check('Season Totals now has exactly one row per player (old formula rows gone)', Object.keys(t).join() === 'P001,P002,P003' && env.sheets['Season Totals'].getLastRow() === 4, Object.keys(t));
check('Season Totals has no formulas left', env.sheets['Season Totals'].getRange(2, 1, 3, 23).getFormulas().every((r) => r.every((f) => !f)));
check('GP is 0 for players with no games (was 1)', t.P001.GP === 0 && t.P002.GP === 0, t.P001);

// ---------- A saved game updates Season Totals by itself ----------
post(env, game('G1', [
  ev('Q1', 'Shot', 'P001'), ev('Q1', 'SOG', 'P001'), ev('Q1', 'Goal', 'P001', { Secondary_Player_ID: 'P002' }),
  ev('Q1', 'Shot', 'P001'), ev('Q2', 'GB', 'P001'), ev('Q2', 'CTO', 'P001'), ev('Q2', 'TO', 'P002'), ev('Q2', 'INT', 'P002'),
  ev('Q3', 'FOW', 'P001'), ev('Q3', 'FOW', 'P001'), ev('Q3', 'FOL', 'P001'),          // midfielder taking faceoffs
  ev('Q3', 'Save', 'P003'), ev('Q3', 'Save', 'P003'), ev('Q3', 'GA', 'P003'),
  ev('Q4', 'Save', 'P002'),                                                          // attackman who went in goal
  ev('Q4', 'Penalty', 'P001', { Pen_Duration: 60, Penalty_Type: 'Personal' }),        // #3 - formula bug row
  ev('Q4', 'Penalty', 'P001', { Pen_Duration: 30, Penalty_Type: 'Technical' }),
  ev('Q4', 'Penalty', 'Opp #22', { Pen_Duration: 60 }),
]));
t = totals(env);
const a = t.P001, b = t.P002, g = t.P003;
check('goals / assists / points', a.G === 1 && a.A === 0 && a.Pts === 1 && b.A === 1 && b.Pts === 1, [a, b]);
check('shots, SOG and shooting %', a.S === 2 && a.SOG === 1 && a['Shooting %'] === 0.5, a);
check('GB / CT / TO / INT', a.GB === 1 && a.CT === 1 && b.TO === 1 && b.INT === 1, [a, b]);
check('penalty COUNT for #3 is right (old formula always showed 0)', a.PEN === 2, a.PEN);
check('penalty time 1:30 stored as time', Math.abs(a['Pen Min'] - 90 / 86400) < 1e-12, a['Pen Min']);
check('faceoff % shows for a MIDFIELDER who took faceoffs', a.FW === 2 && a.FL === 1 && Math.abs(a['FO Win %'] - 2 / 3) < 1e-9, a);
check('goalie saves / GA / save %', g.SV === 2 && g.GA === 1 && Math.abs(g['Save %'] - 2 / 3) < 1e-9, g);
check('saves show for a NON-goalie who made one', b.SV === 1 && b['Save %'] === 1, b);
check('save columns stay blank for players who never played goal', a.SV === '' && a.GA === '' && a['Save %'] === '', a);
check('GP counts the game (as scorer or assister)', a.GP === 1 && b.GP === 1 && g.GP === 1);
post(env, game('G2', [ev('Q1', 'Goal', 'P002', { Secondary_Player_ID: 'P001' })]));
t = totals(env);
check('second game adds on; GP 2 for both', t.P001.GP === 2 && t.P001.A === 1 && t.P002.G === 1 && t.P002.GP === 2, [t.P001, t.P002]);
post(env, game('G2', [ev('Q1', 'Goal', 'P002')])); // re-sync corrected game (no assist)
t = totals(env);
check('re-syncing a corrected game updates totals (no double count)', t.P001.A === 0 && t.P001.GP === 1 && t.P002.G === 1, t.P001);
const f = env.sheets['Season Totals'].formats || {};
check('number formats: % columns, Pen Min as time, INT as a plain number', f[11] === '0.0%' && f[17] === '0.0%' && f[22] === '0.0%' && f[19] === '[h]:mm:ss' && f[23] === '0', f);

// ---------- Editing the Players tab ----------
const P = env.sheets['Players'];
P.getRange(5, 2, 1, 3).setValues([[77, 'New Kid', 'Defense']]);
env.ctx.onEdit({ range: P.getRange(5, 2, 1, 3), source: env.ss });
pl = players(env);
check('typing a new player gets the next ID automatically', pl[3][0] === 'P004', pl[3]);
check('...and they appear in Season Totals right away', !!totals(env).P004 && totals(env).P004['Player Name'] === 'New Kid');

P.getRange(2, 2).setValues([[33]]); // #3 switches to #33
env.ctx.onEdit({ range: P.getRange(2, 2), source: env.ss });
t = totals(env);
check('jersey change: same ID, stats stay with the player', players(env)[0][0] === 'P001' && t.P001['Player #'] === 33 && t.P001.G === 1, t.P001);

P.getRange(6, 1, 1, 4).setValues([['P002', 4, 'Graham Vergara (copy)', 'Attack']]); // a copied row
env.ctx.onEdit({ range: P.getRange(6, 1, 1, 4), source: env.ss });
pl = players(env);
check('a copied row with a duplicate ID gets its own new ID', pl[1][0] === 'P002' && pl[4][0] === 'P005', pl.map((r) => r[0]));

P.getRange(6, 1, 1, 4).clearContent();
env.ctx.onEdit({ range: P.getRange(6, 1, 1, 4), source: env.ss });
check('deleting a player row removes them from Season Totals', !totals(env).P005 && Object.keys(totals(env)).length === 4, Object.keys(totals(env)));

const before = JSON.stringify(totals(env));
env.ctx.onEdit({ range: env.sheets['Games'].getRange(2, 3), source: env.ss });
check('edits on other tabs are ignored', JSON.stringify(totals(env)) === before);

check('roster pull returns the new IDs', post(env, { action: 'getRoster', pin: '1234' }).players.map((p) => p.Player_ID).join() === 'P001,P002,P003,P004');

// ---------- Printable scoresheet still works with P-IDs ----------
const { Sheet } = env;
env.sheets['Scoresheet Template'] = new Sheet('Scoresheet Template');
env.sheets['Scoresheet Template'].getRange(2, 2).setValues([['2026-04-15 - Opp G1 (Home)']]);
let html = '';
env.ctx.SpreadsheetApp.getUi = () => ({ alert: (m) => { html = 'ALERT ' + m; }, showModalDialog: (h) => { html = h.content; } });
env.ctx.generateScoresheetPDF();
check('printable scoresheet lists scorers by jersey with the new IDs', /Truman Collier/.test(html) && /<b>33<\/b>/.test(html), html.slice(0, 100));

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
