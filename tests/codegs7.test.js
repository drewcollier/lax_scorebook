// Script v7: view-only coach PINs (VIEW_PINS) and the wrong-PIN lockout.
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 400)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);
const game = (pin) => ({ action: 'exportGame', pin, gameData: { events: [], game: { Game_ID: 'G1', Date: '2026-04-15', Opponent: 'Carmel', Location: 'Home', Score: '' } } });

let env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
env.ctx.rebuildStats();
check('script version is 9', post(env, { test: true }).version === 9);
check('no VIEW_PINS set: works as before', post(env, { action: 'getRoster', pin: '1234' }).success && post(env, { action: 'getRoster', pin: '4821' }).error === 'INVALID_PIN');

env.props.VIEW_PINS = ' 4821, 7735 ,  990011';
for (const p of ['4821', '7735', '990011']) {
  check('coach PIN ' + p + ' can read roster, games and plays', ['getRoster', 'getOfficials', 'getGames', 'getEvents'].every((a) => post(env, { action: a, pin: p }).error !== 'INVALID_PIN'));
}
let r = post(env, game('4821'));
check('coach PIN cannot save a game', r.error === 'INVALID_PIN' && /view-only/.test(r.message) && env.sheets['Games'].getLastRow() === 1, r);
check('scorebook PIN still saves games', post(env, game('1234')).success && env.sheets['Games'].getLastRow() === 2);
check('scorebook PIN still reads', post(env, { action: 'getGames', pin: '1234' }).success);
check('a fragment of the list is not a PIN', ['48', '4821,7735', '', ' '].every((p) => post(env, { action: 'getGames', pin: p }).error === 'INVALID_PIN'));
env.props.VIEW_PINS = '7735';
check('removing one coach PIN cuts off just that coach', post(env, { action: 'getGames', pin: '4821' }).error === 'INVALID_PIN' && post(env, { action: 'getGames', pin: '7735' }).success);
delete env.props.WRITE_PIN;
check('WRITE_PIN missing: coach PINs refused too (fail closed)', post(env, { action: 'getGames', pin: '7735' }).error === 'PIN_NOT_SET');

// lockout
env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
env.props.VIEW_PINS = '7735';
const T0 = Date.now(); env.setNow(T0);
for (let i = 0; i < 9; i++) post(env, { action: 'getGames', pin: '000' + i });
check('9 wrong PINs: not locked yet', post(env, { action: 'getGames', pin: '1234' }).success);
for (let i = 0; i < 9; i++) post(env, { action: 'getGames', pin: 'x' + i });
check('a right PIN in between resets the count', post(env, { action: 'getGames', pin: '7735' }).success);
for (let i = 0; i < 10; i++) post(env, { action: 'getGames', pin: 'y' + i });
r = post(env, { action: 'getGames', pin: '1234' });
check('10 wrong in a row: even the right PIN is refused', r.error === 'PIN_LOCKED' && /15 minutes/.test(r.message), r);
r = post(env, game('1234'));
check('saving a game during a lockout is refused (nothing written)', r.error === 'PIN_LOCKED' && env.sheets['Games'].getLastRow() === 1, r);
check('coach PIN refused during a lockout', post(env, { action: 'getGames', pin: '7735' }).error === 'PIN_LOCKED');
check('Test Connection and version still answer during a lockout', post(env, { test: true }).success && JSON.parse(env.ctx.doGet({ parameter: { action: 'version' } }).content).version === 9);
env.setNow(T0 + 14 * 60000);
check('still locked after 14 minutes', post(env, { action: 'getGames', pin: '1234' }).error === 'PIN_LOCKED');
env.setNow(T0 + 16 * 60000);
check('unlocked after 15 minutes', post(env, { action: 'getGames', pin: '1234' }).success);
for (let i = 0; i < 10; i++) post(env, { action: 'getGames', pin: 'z' + i });
check('locked again', post(env, { action: 'getGames', pin: '1234' }).error === 'PIN_LOCKED');
env.ctx.clearPinLockout();
check('Lacrosse Tools > Clear PIN lockout ends it at once', post(env, { action: 'getGames', pin: '1234' }).success && /cleared/.test(env.ctx.__alerts.pop()));
env.setNow(T0 + 40 * 60000);
for (let i = 0; i < 5; i++) post(env, { action: 'getGames', pin: 'a' + i });
env.setNow(T0 + 60 * 60000);
for (let i = 0; i < 5; i++) post(env, { action: 'getGames', pin: 'b' + i });
check('wrong PINs spread out (more than 15 min apart) do not add up', post(env, { action: 'getGames', pin: '1234' }).success);
// family sign-in is separate
env.ctx.rebuildStats();
env.ctx.viewersSheet_(env.ss).appendRow(['mom@example.com', '', '', '', 'P001', true, '', '', '']);
for (let i = 0; i < 10; i++) post(env, { action: 'getGames', pin: 'c' + i });
check('family code requests still work during a PIN lockout', post(env, { action: 'requestCode', email: 'mom@example.com' }).success && env.mail.length === 1);
check('menu has Clear PIN lockout', (() => { const items = []; env.ctx.SpreadsheetApp.getUi = () => ({ createMenu: () => { const m = { addItem: (a, f) => { items.push(f); return m; }, addSeparator: () => m, addToUi: () => {} }; return m; } }); env.ctx.onOpen(); return items.indexOf('clearPinLockout') >= 0; })());

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
