// Script v9: the Sheet's printable scoresheet matches the app's (Clears/Rides, % lines, SV%),
// start time and weather print correctly.
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);
let n = 0;
const ev = (q, type, pid, extra) => Object.assign({ Timestamp: 't' + (n++), Period: q, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
const goal = (q, pid) => { const ts = 'g' + (n++); return [ev(q, 'Shot', pid, { Timestamp: ts }), ev(q, 'SOG', pid, { Timestamp: ts }), ev(q, 'Goal', pid, { Timestamp: ts, Game_Clock: '08:28' })]; };

const env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
env.ctx.rebuildStats();
check('script version 9', post(env, { test: true }).version === 9);
const events = [].concat(goal('Q1', 'P001'), [ev('Q1', 'Shot', 'P001'), ev('Q2', 'Shot', 'P002'), ev('Q2', 'Shot', 'P002'),
  ev('Q1', 'Clear_Good'), ev('Q1', 'Clear_Good'), ev('Q2', 'Clear_Good'), ev('Q3', 'Clear_Fail'),
  ev('Q1', 'Ride_Good'), ev('Q2', 'Ride_Fail'), ev('Q2', 'Ride_Fail'),
  ev('Q1', 'FOW', 'P002'), ev('Q1', 'FOW', 'P002'), ev('Q2', 'FOL', 'P002'),
  ev('Q2', 'EMO_Success'), ev('Q3', 'EMO_Fail'), ev('Q4', 'EMO_Fail'), ev('Q4', 'EMO_Fail'),
  ev('Q1', 'Save', 'P003'), ev('Q2', 'Save', 'P003'), ev('Q3', 'Save', 'P003'), ev('Q3', 'GA', 'P003')]);
post(env, { action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G1', Date: '2026-11-21', Opponent: 'North Central', Location: 'Home', Score: '1-1',
  Weather_Temp: '60°F', Weather_Cond: 'Sunny', Game_Start: '11:00' }, events } });
// how the live Sheet actually stores the start time: a time value (a Date on 30 Dec 1899)
const G = env.sheets['Games'];
const hdr = G.getRange(1, 1, 1, G.getLastColumn()).getValues()[0];
G.getRange(2, hdr.indexOf('Game_Start') + 1).setValues([[new Date(1899, 11, 30, 11, 0, 0)]]);
const label = G.getRange(2, hdr.indexOf('Game_Label') + 1).getValues()[0][0];
const { Sheet } = env;
env.sheets['Scoresheet Template'] = new Sheet('Scoresheet Template');
env.sheets['Scoresheet Template'].getRange(2, 2).setValues([[label]]);
let html = '';
env.ctx.SpreadsheetApp.getUi = () => ({ alert: (m) => { html = 'ALERT ' + m; }, showModalDialog: (h) => { html = h.content; } });
env.ctx.generateScoresheetPDF();
check('scoresheet built', /OFFICIAL GAME SCORESHEET|PLAYER ROSTER/.test(html), html.slice(0, 200));
const box = (t) => { const i = html.indexOf('>' + t + '<'); return i < 0 ? '' : html.slice(i, html.indexOf('</table>', i)); };
const cr = box('CLEARS / RIDES');
check('one Clears / Rides box with grouped headings', /<th colspan="2">Clears<\/th><th colspan="2">Rides<\/th>/.test(cr) && /<th>Clears<\/th><th>Fail<\/th><th>Ride<\/th><th>Fail<\/th>/.test(cr), cr.slice(0, 300));
check('…TOT 3 | 1 | 1 | 2 and % line 75.0% / 33.3%', /TOT<\/td><td><b>3<\/b><\/td><td><b>1<\/b><\/td><td><b>1<\/b><\/td><td><b>2<\/b><\/td>/.test(cr) && /<td colspan="2"><b>75.0%<\/b><\/td><td colspan="2"><b>33.3%<\/b><\/td>/.test(cr), cr.slice(-300));
check('Faceoffs 66.7%', /<b>66.7%<\/b>/.test(box('FACEOFFS')));
check('Extra Man 25.0% (1 of 4)', /<b>25.0%<\/b>/.test(box('EXTRA MAN')));
check('Shots: 1 goal on 4 shots = 25.0% scored', /<b>25.0% scored<\/b>/.test(box('SHOTS')), box('SHOTS').slice(-150));
check('Saves table: SV% column, 3 saves 1 GA = 75.0%', /<th>SV%<\/th>/.test(html) && /<td><b>3<\/b><\/td><td><b>75.0%<\/b><\/td>/.test(html));
check('start time prints as 11:00, not "Sat Dec 30 1899 …"', html.indexOf('1899') < 0 && /Game Start: 11:00/.test(html), (html.match(/Game Start:[^<]*/) || [])[0]);
check('weather prints 60°F once, not 60°F°F', /60°F Sunny/.test(html) && html.indexOf('°F°F') < 0, (html.match(/Weather:[^<]*/) || [])[0]);
// a bare number still gets its unit
G.getRange(2, hdr.indexOf('Weather_Temp') + 1).setValues([['58']]);
env.ctx.generateScoresheetPDF();
check('a bare temperature (58) still prints as 58°F', /58°F Sunny/.test(html), (html.match(/Weather:[^<]*/) || [])[0]);
check('fits itself to one page when printed (fitSheet on print, button calls it)', /function fitSheet\(\)/.test(html) && /addEventListener\("beforeprint",fitSheet\)/.test(html) && /onclick="printSheet\(\)"/.test(html) && /<div id="sheet">/.test(html));
require('fs').writeFileSync('/tmp/sheet_ss.html', html);
console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
