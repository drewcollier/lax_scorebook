// Script v6: family sign-in for the stats viewer.
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 600)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);
const ev = (period, type, pid, extra) => Object.assign({ Timestamp: 't' + Math.random(), Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
const viewers = (env) => { const v = env.sheets['Viewers'].getDataRange().getValues(); return v.slice(1).map((r) => { const o = {}; v[0].forEach((h, i) => (o[h] = r[i])); return o; }); };
function setCell(env, row, header, value) {
  const sh = env.sheets['Viewers']; const col = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf(header) + 1;
  const range = sh.getRange(row, col); range.setValues([[value]]);
  env.ctx.onEdit({ range, source: env.ss });
}
const codeFrom = (env) => /:\s*(\d{6})$/.exec(env.mail[env.mail.length - 1].subject)[1];
function signIn(env, email) {
  const before = env.mail.length;
  post(env, { action: 'requestCode', email });
  if (env.mail.length === before) return null;
  return post(env, { action: 'verifyCode', email, code: codeFrom(env) }).token;
}

const env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
env.ctx.rebuildStats(); // P001 Truman #3, P002 Graham #4, P003 Elijah #57
check('script version is 9', post(env, { test: true }).version === 9);

// --- setup ---
env.ctx.setupFamilySignIn();
check('setup makes the Viewers tab with its headers', env.sheets['Viewers'] && env.sheets['Viewers'].getRange(1, 1, 1, 9).getValues()[0].join() === 'Email,Player Name,Jersey,Who,Player_ID,Approved,Status,Notes,Submitted');
check('setup sends a test email to the owner', env.mail.length === 1 && env.mail[0].to === 'owner@example.com', env.mail);

// --- form sync ---
const F = new env.Sheet('Form Responses 1', 1000, 26);
env.sheets['Form Responses 1'] = F;
F.appendRow(['Timestamp', 'Email Address', "Player's first and last name", "Player's jersey number", 'Are you the player or a parent/guardian?']);
F.appendRow([new Date(), ' Mom@Example.com ', 'Truman Collier', '#3', 'Parent/guardian']);
F.appendRow([new Date(), 'truman@example.com', 'truman collier', '3', 'Player']);
F.appendRow([new Date(), 'aunt@example.com', 'Truman Collier', '3', 'Parent/guardian']);
F.appendRow([new Date(), 'gv@example.com', 'Graham Vergara', '40', 'Parent/guardian']);
F.appendRow([new Date(), 'who@example.com', 'Nobody Here', '77', 'Player']);
env.ctx.checkNewSignUps();
let v = viewers(env);
check('5 sign-ups copied in, emails cleaned up', v.length === 5 && v[0].Email === 'mom@example.com' && v[0].Jersey === '3', v);
check('players matched by jersey + name', v[0].Player_ID === 'P001' && v[1].Player_ID === 'P001' && v[2].Player_ID === 'P001', v.map((r) => r.Player_ID));
check('wrong jersey: matched by name, flagged', v[3].Player_ID === 'P002' && /form said #40, Graham Vergara is #4/.test(v[3].Status), v[3]);
check('no match: Player_ID blank, status says check the player', v[4].Player_ID === '' && /Check the player/.test(v[4].Status), v[4]);
check('new sign-ups start unapproved', v.slice(0, 4).every((r) => r.Approved === false && /Waiting/.test(r.Status)), v.map((r) => r.Status));
check('form rows marked Copied', F.getRange(2, 6, 5, 1).getValues().every((r) => r[0] === 'Yes') && F.getRange(1, 6).getValue() === 'Copied');
env.ctx.checkNewSignUps();
check('running again copies nothing new', viewers(env).length === 5);
env.sheets['Viewers'].deleteRows(6, 1); // owner deletes the "Nobody" row
F.appendRow([new Date(), 'dad@example.com', 'Elijah Dorris', '57', 'Parent/guardian']);
env.ctx.checkNewSignUps();
v = viewers(env);
check('a deleted row stays deleted; only the new sign-up is added', v.length === 5 && v[4].Email === 'dad@example.com' && v[4].Player_ID === 'P003', v.map((r) => r.Email));

// --- approval + 2 per player ---
setCell(env, 2, 'Approved', true);
setCell(env, 3, 'Approved', true);
setCell(env, 4, 'Approved', true); // 3rd for Truman
v = viewers(env);
check('first two for a player are Active', /Active/.test(v[0].Status) && /Active/.test(v[1].Status), v.map((r) => r.Status));
check('3rd approval for the same player is unchecked and explained', v[2].Approved === false && /already has 2/.test(v[2].Status), v[2]);
setCell(env, 4, 'Player_ID', 'P002'); // owner fixes it by hand: aunt actually for Graham
setCell(env, 4, 'Approved', true);
check('typing a Player_ID by hand is kept', viewers(env)[2].Player_ID === 'P002' && /Active/.test(viewers(env)[2].Status), viewers(env)[2]);

// --- request code ---
let m0 = env.mail.length;
let r = post(env, { action: 'requestCode', email: 'gv@example.com' }); // not approved
check('unapproved email: same reply, no email sent', r.success && /If that email is approved/.test(r.message) && env.mail.length === m0, r);
r = post(env, { action: 'requestCode', email: 'stranger@example.com' });
check('unknown email: same reply, no email sent', r.success && r.message === 'If that email is approved, a code is on its way.' && env.mail.length === m0);
check('bad email address refused', post(env, { action: 'requestCode', email: 'nope' }).error === 'BAD_EMAIL');
r = post(env, { action: 'requestCode', email: 'MOM@example.com' });
check('approved email: a 6-digit code is emailed', r.success && env.mail.length === m0 + 1 && env.mail[m0].to === 'mom@example.com' && /^\d{6}$/.test(codeFrom(env)) && env.mail[m0].body.indexOf(codeFrom(env)) > 0, env.mail[m0]);
check('requestCode needs no PIN and the code is not in the reply', JSON.stringify(r).indexOf(codeFrom(env)) < 0);

// --- verify ---
let code = codeFrom(env);
const wrong = code === '000000' ? '111111' : '000000';
check('wrong code refused', post(env, { action: 'verifyCode', email: 'mom@example.com', code: wrong }).error === 'BAD_CODE');
for (let i = 0; i < 4; i++) post(env, { action: 'verifyCode', email: 'mom@example.com', code: wrong });
check('after 5 wrong tries the code stops working', post(env, { action: 'verifyCode', email: 'mom@example.com', code }).error === 'BAD_CODE');
post(env, { action: 'requestCode', email: 'mom@example.com' });
code = codeFrom(env);
r = post(env, { action: 'verifyCode', email: 'mom@example.com', code: ' ' + code.slice(0, 3) + ' ' + code.slice(3) });
check('right code (spaces ignored) gives a 64-char token', r.success && /^[0-9a-f]{64}$/.test(r.token), r);
const tokenMom = r.token;
check('a code works only once', post(env, { action: 'verifyCode', email: 'mom@example.com', code }).error === 'BAD_CODE');
check('the token itself is not stored, only its fingerprint', !Object.keys(env.props).some((k) => k.indexOf(tokenMom) >= 0) && !Object.values(env.props).some((x) => String(x).indexOf(tokenMom) >= 0));
post(env, { action: 'requestCode', email: 'mom@example.com' });
r = post(env, { action: 'requestCode', email: 'mom@example.com' });
check('4th code within 15 minutes is refused', r.error === 'TOO_MANY', r);
const T = Date.now() + 16 * 60000;
env.setNow(T);
let mm = env.mail.length;
check('after 15 minutes codes can be asked for again', post(env, { action: 'requestCode', email: 'mom@example.com' }).success && env.mail.length === mm + 1);
const c2 = codeFrom(env);
env.setNow(T + 11 * 60000);
check('a code expires after 10 minutes', post(env, { action: 'verifyCode', email: 'mom@example.com', code: c2 }).error === 'BAD_CODE');
env.setNow(null);

// --- stats: own player only ---
post(env, { action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: 'G1', Date: '2026-04-15', Opponent: 'Carmel', Location: 'Home', Score: '2-1' }, events: [
  ev('Q1', 'Shot', 'P002', { Zone_ID: '2C' }), ev('Q1', 'SOG', 'P002'), ev('Q1', 'Goal', 'P002', { Secondary_Player_ID: 'P001', Zone_ID: '2C' }),
  ev('Q1', 'Shot', 'P001', { Zone_ID: '1L' }), ev('Q1', 'Goal', 'P001', { Zone_ID: '1L' }), ev('Q2', 'GB', 'P001'), ev('Q2', 'GB', 'P002'),
  ev('Q3', 'Save', 'P003'), ev('Q3', 'Opp_Goal', 'OPPONENT'), ev('Q4', 'Penalty', 'P001', { Pen_Duration: 60, Penalty_Type: 'Personal', Penalty_Name: 'Slash' }),
] } });
r = post(env, { action: 'myStats', token: tokenMom });
const js = JSON.stringify(r);
check('myStats: signed-in family gets their player', r.success && r.players.length === 1 && r.players[0].Name === 'Truman Collier' && r.email === 'mom@example.com', r);
check('only plays involving their player', r.events.length === 5 && r.events.every((e) => e.Primary_Player_ID === 'P001' || e.Secondary_Player_ID === 'P001'), r.events);
check('the assisted goal keeps the assist but hides the scorer', r.events.some((e) => e.Action_Type === 'Goal' && e.Secondary_Player_ID === 'P001' && e.Primary_Player_ID === ''));
check('no other player appears anywhere in the reply', js.indexOf('P002') < 0 && js.indexOf('P003') < 0 && js.indexOf('Graham') < 0 && js.indexOf('Elijah') < 0 && js.indexOf('OPPONENT') < 0, js.slice(0, 300));
check('season totals for their player', r.season.P001 && r.season.P001.G === 1 && r.season.P001.A === 1 && r.season.P001.GP === 1 && Object.keys(r.season).length === 1, r.season);
check('games list (team-level: date, opponent, score)', r.games.length === 1 && r.games[0].Opponent === 'Carmel' && r.games[0].Score === '2-1', r.games);

// --- siblings ---
setCell(env, 2, 'Approved', true);
const sh = env.sheets['Viewers'];
sh.appendRow(['mom@example.com', 'Elijah Dorris', '57', 'Parent/guardian', '', true, '', '', '']);
env.ctx.onEdit({ range: sh.getRange(sh.getLastRow(), 1), source: env.ss });
r = post(env, { action: 'myStats', token: tokenMom });
check('one email approved for two players (siblings) sees both', r.success && r.players.map((p) => p.Player_ID).sort().join() === 'P001,P003', r.players);

// --- revoke, bad tokens, expiry, sign out ---
setCell(env, 2, 'Approved', false);
r = post(env, { action: 'myStats', token: tokenMom });
check('unchecking one row removes just that player', r.success && r.players.map((p) => p.Player_ID).join() === 'P003', r.players);
setCell(env, sh.getLastRow(), 'Approved', false);
check('unchecking all of them cuts the email off at once', post(env, { action: 'myStats', token: tokenMom }).error === 'NOT_APPROVED');
setCell(env, 2, 'Approved', true);
check('re-approving restores it (same device, no new sign-in)', post(env, { action: 'myStats', token: tokenMom }).success);
check('made-up token refused', post(env, { action: 'myStats', token: 'a'.repeat(64) }).error === 'NOT_SIGNED_IN' && post(env, { action: 'myStats' }).error === 'NOT_SIGNED_IN');
env.setNow(Date.now() + 31 * 86400000);
check('sign-in expires after 30 days', post(env, { action: 'myStats', token: tokenMom }).error === 'NOT_SIGNED_IN');
env.setNow(null);
const t2 = signIn(env, 'truman@example.com');
check('player signs in on their own', t2 && post(env, { action: 'myStats', token: t2 }).players[0].Player_ID === 'P001');
post(env, { action: 'signOut', token: t2 });
check('sign out ends that device', post(env, { action: 'myStats', token: t2 }).error === 'NOT_SIGNED_IN');
const toks = [];
for (let i = 0; i < 5; i++) { env.cache && Object.keys(env.cache).forEach((k) => { if (k.indexOf('R_') === 0) delete env.cache[k]; }); toks.push(signIn(env, 'truman@example.com')); }
const live = toks.filter((t) => post(env, { action: 'myStats', token: t }).success).length;
check('at most 4 devices per email (oldest signed out)', live === 4 && !post(env, { action: 'myStats', token: toks[0] }).success, live);

// --- coach (PIN) side untouched; mail limit ---
check('PIN reads still need the PIN', post(env, { action: 'getRoster' }).error === 'INVALID_PIN' && post(env, { action: 'getRoster', pin: '1234' }).success);
check('a family token is not a PIN', post(env, { action: 'getRoster', pin: tokenMom }).error === 'INVALID_PIN');
const env2 = seedLiveWorkbook(makeEnv({ codePath: CODE, quota: 0 }));
env2.ctx.rebuildStats();
const s2 = env2.ctx.viewersSheet_(env2.ss);
s2.appendRow(['x@example.com', '', '', '', 'P001', true, '', '', '']);
check('daily email limit reached: clear message', post(env2, { action: 'requestCode', email: 'x@example.com' }).error === 'MAIL_LIMIT');
check('unknown action still refused', post(env, { action: 'nope' }).error === 'Unknown action');

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
