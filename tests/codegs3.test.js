// Step 3 Code.gs tests: PIN on every read, fail closed, escaping.
process.env.EVIL = '1';
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 300)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);

let env = seedLiveWorkbook(makeEnv({ codePath: CODE }));

// Reads need the PIN
for (const action of ['getRoster', 'getOfficials', 'getGames', 'getEvents']) {
  const noPin = post(env, { action });
  const wrong = post(env, { action, pin: '0000' });
  check(action + ' without / with wrong PIN is refused', noPin.error === 'INVALID_PIN' && wrong.error === 'INVALID_PIN' && !noPin.players && !noPin.events, [noPin, wrong]);
}
let r = post(env, { action: 'getRoster', pin: '1234' });
check('getRoster with the PIN returns the roster', r.success && r.players.length === 4 && r.players[0].Name === 'Truman Collier', r);

// The old open GET endpoints no longer hand out data
for (const action of ['getRoster', 'getOfficials', 'getGames', 'getEvents']) {
  const out = env.ctx.doGet({ parameter: { action, callback: 'cb1' } }).content;
  check('GET ?action=' + action + ' no longer returns data (asks old apps to update)', /UPDATE_APP/.test(out) && !/Truman|players|events/.test(out) && /^cb1\(/.test(out), out);
}
const evilCb = env.ctx.doGet({ parameter: { action: 'getRoster', callback: 'alert(1);x' } }).content;
check('a crafted callback name is not echoed back as code', !/alert/.test(evilCb), evilCb);

// Version + test stay open (they reveal nothing)
check('version check still answers without a PIN (version 9)', JSON.parse(env.ctx.doGet({ parameter: { action: 'version' } }).content).version === 9);
check('Test Connection still answers without a PIN', post(env, { test: true }).success === true);

// Fail closed
env = seedLiveWorkbook(makeEnv({ codePath: CODE, pin: null }));
r = post(env, { action: 'getRoster', pin: '' });
check('no WRITE_PIN configured: reads refused with PIN_NOT_SET', r.error === 'PIN_NOT_SET' && !r.players, r);
r = post(env, { action: 'getRoster', pin: 'anything' });
check('no WRITE_PIN configured: any guessed PIN refused', r.error === 'PIN_NOT_SET', r);
env = seedLiveWorkbook(makeEnv({ codePath: CODE, pin: '   ' }));
check('WRITE_PIN of only spaces counts as not set', post(env, { action: 'getGames', pin: '' }).error === 'PIN_NOT_SET');

// Unknown actions
env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
check('unknown action refused', post(env, { action: 'deleteEverything', pin: '1234' }).error === 'Unknown action');

// Escaping in the printable scoresheet
const game = { Game_ID: 'X1', Date: '2026-04-15', Opponent: '<script>bad()</script> Prep', Location: 'Home', Score: '1-0' };
post(env, { action: 'exportGame', pin: '1234', gameData: { game, events: [
  { Timestamp: 't', Period: 'Q1', Action_Type: 'Goal', Primary_Player_ID: '1199', Secondary_Player_ID: '', Game_Clock: '05:00' }] } });
const { Sheet } = env;
env.sheets['Scoresheet Template'] = new Sheet('Scoresheet Template');
env.sheets['Scoresheet Template'].getRange(2, 2).setValues([['2026-04-15 - <script>bad()</script> Prep (Home)']]);
let html = '';
env.ctx.SpreadsheetApp.getUi = () => ({ alert: (m) => { html = 'ALERT ' + m; }, showModalDialog: (h) => { html = h.content; } });
env.ctx.generateScoresheetPDF();
check('scoresheet escapes the opponent name', /&lt;script&gt;bad\(\)&lt;\/script&gt; Prep/.test(html) && !/<script>bad/.test(html), html.slice(0, 200));
check('scoresheet escapes player names', /&lt;img src=x onerror=&quot;window.__xss=1&quot;&gt; O&#39;Brien &amp; Sons/.test(html) && !/<img src=x/.test(html), (html.match(/O.{0,10}Brien.{0,20}/) || [''])[0]);

// Old-style (form) reply can't break out of its <script>
const legacy = env.ctx.doPost({ parameter: { payload: JSON.stringify({ action: 'nope</script><script>x()' }) }, postData: {} });
check('old-style HTML reply cannot be broken out of', !/<\/script><script>x/.test(legacy.content), legacy.content);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
