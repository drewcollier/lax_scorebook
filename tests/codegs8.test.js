// Script v8: TEST copy, Drive backup per game, Restore a game / season.
const { makeEnv, seedLiveWorkbook } = require('./gas_mock');
const CODE = require('path').join(__dirname, '..', 'Code.gs');
const LIVE = '18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64';
let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(JSON.stringify(extra)).slice(0, 500)));
  if (!cond) failures++;
}
const post = (env, p) => JSON.parse(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(p) } }).content);
const getv = (env) => JSON.parse(env.ctx.doGet({ parameter: { action: 'version' } }).content);
let n = 0;
const ev = (period, type, pid, extra) => Object.assign({ Timestamp: '2026-04-15T19:00:' + ('0' + (n++ % 60)).slice(-2) + '.000Z', Period: period, Action_Type: type, Primary_Player_ID: pid || '', Secondary_Player_ID: '', Strength: 'Even', Pen_Duration: '', Game_Clock: '', Penalty_Type: '', Penalty_Name: '', Zone_ID: '' }, extra || {});
const G = (id, date, opp, loc, events) => ({ action: 'exportGame', pin: '1234', gameData: { game: { Game_ID: id, Date: date, Opponent: opp, Location: loc, Score: '3-2', Weather_Temp: '55°F', Head_Official: 'Ref A' }, events } });
const files = (env) => Object.values(env.drive.files).filter((f) => /\.json$/.test(f.name));
const pathOf = (env, f) => { const p = []; let id = f.parent; while (id && id !== 'root') { const d = env.drive.folders[id]; p.unshift(d.name); id = d.parent; } return p.join(' / '); };
const evCount = (env, id) => env.sheets['Events'].getDataRange().getValues().slice(1).filter((r) => r[1] === id).length;
const season = (env) => JSON.stringify(env.sheets['Season Totals'].getDataRange().getValues());
const gameLog = (env) => JSON.stringify(env.sheets['Game Log'].getDataRange().getValues());

let env = seedLiveWorkbook(makeEnv({ codePath: CODE }));
env.ctx.rebuildStats();
check('script version 9; live copy reports test: false', post(env, { test: true }).version === 9 && getv(env).test === false && post(env, { test: true }).test === false);
check('Test Connection names the workbook', post(env, { test: true }).sheet === 'Tigers Lacrosse');

// --- backup on every save ---
const g1 = G('G1', '2026-04-15', 'Carmel', 'Home', [ev('Q1', 'Goal', 'P001'), ev('Q1', 'GB', 'P002'), ev('Q2', 'Save', 'P003')]);
let r = post(env, g1);
let fs1 = files(env);
check('saving a game writes a backup file', r.success && fs1.length === 1 && r.backup === '2026-04-15 vs Carmel [G1].json', [r, fs1.map((f) => f.name)]);
check('in Drive: Lacrosse Scorebook Backups / <workbook> / <year>', pathOf(env, fs1[0]) === 'Lacrosse Scorebook Backups / Tigers Lacrosse / 2026', pathOf(env, fs1[0]));
const b1 = JSON.parse(fs1[0].content);
check('the file holds exactly the upload (game + plays)', b1.kind === 'lax-scorebook-game' && b1.gameData.events.length === 3 && b1.gameData.game.Head_Official === 'Ref A' && b1.gameData.game.Opponent === 'Carmel');
check('the PIN is never in the backup', fs1[0].content.indexOf('1234') < 0 && !('pin' in b1));
g1.gameData.events.push(ev('Q3', 'Goal', 'P002'));
g1.gameData.game.Opponent = 'Carmel Greyhounds';
post(env, g1);
fs1 = files(env);
check('re-saving updates the same file (renamed if the opponent changed)', fs1.length === 1 && fs1[0].name === '2026-04-15 vs Carmel Greyhounds [G1].json' && JSON.parse(fs1[0].content).gameData.events.length === 4, fs1.map((f) => f.name));
post(env, G('G2', '2026-04-20', 'Zionsville', 'Away', [ev('Q1', 'Goal', 'P001'), ev('Q1', 'Shot', 'P001')]));
check('away game file says "at"', files(env).some((f) => f.name === '2026-04-20 at Zionsville [G2].json'));
check('one folder per season, reused', Object.values(env.drive.folders).filter((d) => d.name === '2026').length === 1 && Object.values(env.drive.folders).filter((d) => d.name === 'Lacrosse Scorebook Backups').length === 1);
const saveDA = env.ctx.DriveApp; env.ctx.DriveApp = { getFolderById: () => { throw new Error('Drive down'); }, getFoldersByName: () => { throw new Error('Drive down'); } };
env.props['BACKUP_FOLDER_' + LIVE] = 'nope';
r = post(env, G('G3', '2026-05-01', 'Noblesville', 'Home', [ev('Q1', 'GB', 'P001')]));
check('if Drive fails, the game still saves (just no backup)', r.success && r.backup === '' && evCount(env, 'G3') === 1, r);
env.ctx.DriveApp = saveDA; delete env.props['BACKUP_FOLDER_' + LIVE];
const folderGone = Object.values(env.drive.folders).find((d) => d.name === 'Tigers Lacrosse');
r = post(env, G('G3', '2026-05-01', 'Noblesville', 'Home', [ev('Q1', 'GB', 'P001')]));
check('backup folder found again by name if its saved ID is lost', files(env).length === 3 && Object.values(env.drive.folders).filter((d) => d.name === 'Lacrosse Scorebook Backups').length === 1, files(env).map((f) => pathOf(env, f)));

// --- back up all games now ---
post(env, G('G0', '2025-04-10', 'Old Rival', 'Home', [ev('Q1', 'Goal', 'P001')]));
Object.keys(env.drive.files).forEach((k) => delete env.drive.files[k]);
env.ctx.backupAllGames();
const all = files(env);
check('Back up all games now: one file per game, by season', all.length === 4 && all.filter((f) => pathOf(env, f).endsWith('2025')).length === 1, all.map((f) => pathOf(env, f) + ' / ' + f.name));
const bAll = JSON.parse(all.find((f) => f.name.indexOf('[G1]') > 0).content).gameData;
check('…with the plays and details read back from the workbook', bAll.events.length === 4 && bAll.game.Date === '2026-04-15' && bAll.game.Head_Official === 'Ref A' && bAll.events[0].Action_Type === 'Goal', bAll.game);
check('…and tells you where the files are', /Backed up 4 games/.test(env.ctx.__alerts.pop()));

// --- restore a game ---
const goodSeason = season(env), goodLog = gameLog(env), g1Events = evCount(env, 'G1');
// damage G1: delete its plays by hand
const E = env.sheets['Events'];
const rows = E.getDataRange().getValues();
for (let i = rows.length - 1; i >= 1; i--) if (rows[i][1] === 'G1') E.deleteRows(i + 1, 1);
env.ctx.rebuildStats();
check('(G1 damaged)', evCount(env, 'G1') === 0 && season(env) !== goodSeason);
env.uiAnswers.push({ button: 'CANCEL', text: '' });
env.ctx.restoreGame();
check('Restore a game: Cancel changes nothing', evCount(env, 'G1') === 0 && env.drive.copies.length === 0);
env.uiAnswers.push({ button: 'OK', text: '9' });
env.ctx.restoreGame();
check('a number not on the list changes nothing', evCount(env, 'G1') === 0 && /not a number from the list/.test(env.ctx.__alerts.pop()));
env.ctx.__alerts.length = 0;
env.uiAnswers.push({ button: 'OK', text: '2' }, 'NO');
env.ctx.restoreGame();
const listing = env.ctx.__alerts[0];
check('the list is numbered, oldest first', /1\.  2025-04-10 vs Old Rival\n2\.  2026-04-15 vs Carmel Greyhounds\n3\.  2026-04-20 at Zionsville/.test(listing), listing);
check('answering No at "Restore …?" changes nothing', evCount(env, 'G1') === 0 && env.drive.copies.length === 0);
env.uiAnswers.push({ button: 'OK', text: '2' }, 'YES');
env.ctx.restoreGame();
check('Restore a game puts the plays back', evCount(env, 'G1') === g1Events, evCount(env, 'G1'));
check('…and Season Totals + Game Log match the original again', season(env) === goodSeason && gameLog(env) === goodLog);
check('…after saving a copy of the whole workbook first', env.drive.copies.length === 1 && /before restoring 2026-04-15 vs Carmel Greyhounds/.test(env.drive.copies[0].name) && env.drive.folders[env.drive.copies[0].folder].name === 'Workbook copies');
check('…and the copy was taken BEFORE the restore (still damaged)', env.drive.copies[0].snapshot.indexOf('"G1"') < 0 || JSON.parse(env.drive.copies[0].snapshot).find((s) => s[0] === 'Events')[1].filter((r) => r && r[1] === 'G1').length === 0);
env.uiAnswers.push({ button: 'OK', text: '2' }, 'YES');
env.ctx.restoreGame();
check('restoring the same game twice never doubles it', evCount(env, 'G1') === g1Events && season(env) === goodSeason);

// --- restore a season ---
// G4 is only in the workbook (no backup); G2 is damaged
post(env, G('G4', '2026-05-05', 'Hamilton SE', 'Home', [ev('Q1', 'Goal', 'P001')]));
const g4file = files(env).find((f) => f.name.indexOf('[G4]') > 0); delete env.drive.files[g4file.id];
env.sheets['Games'].getRange(3, 3).setValues([['TYPO']]);
env.ctx.__alerts.length = 0;
env.uiAnswers.push({ button: 'OK', text: '2026' }, 'NO');
env.ctx.restoreSeason();
const warn = env.ctx.__alerts.join('\n');
check('Restore a season warns about games with no backup, by name', /WARNING: 1 game\(s\) in the workbook have NO backup file/.test(warn) && /2026-05-05 Hamilton SE/.test(warn) && /Back up all games now/.test(warn), warn);
check('…and No changes nothing', evCount(env, 'G4') === 1 && env.drive.copies.length === 2);
env.uiAnswers.push({ button: 'OK', text: '2031' });
env.ctx.restoreSeason();
check('a season with no backups changes nothing', /no backup files for "2031"/.test(env.ctx.__alerts.pop()));
env.ctx.backupAllGames();
env.ctx.__alerts.length = 0;
const typoFixedFile = files(env).find((f) => f.name.indexOf('[G2]') > 0);
const g2 = JSON.parse(typoFixedFile.content); g2.gameData.game.Opponent = 'Zionsville'; typoFixedFile.content = JSON.stringify(g2); // the good copy
env.sheets['Games'].getRange(3, 3).setValues([['TYPO']]);
env.uiAnswers.push({ button: 'OK', text: '2026' }, 'YES');
env.ctx.restoreSeason();
const games = env.ctx.gamesInWorkbook_(env.ss);
check('Restore a season: the season is rebuilt from the files', !/WARNING/.test(env.ctx.__alerts.join('')) && games.filter((g) => g.Date.slice(0, 4) === '2026').length === 4 && games.find((g) => g.Game_ID === 'G2').Opponent === 'Zionsville', games.map((g) => g.Game_ID + ' ' + g.Opponent));
check('…other seasons are left alone', games.some((g) => g.Game_ID === 'G0') && evCount(env, 'G0') === 1);
check('…plays match the files, nothing doubled', evCount(env, 'G1') === g1Events && evCount(env, 'G2') === 2 && evCount(env, 'G4') === 1);
check('…workbook copied first', env.drive.copies.length === 3 && /before restoring 2026 season/.test(env.drive.copies[2].name));
const bad = files(env)[0]; const keep = bad.content; bad.content = '{"not":"a game"}';
const before = JSON.stringify(env.sheets['Events'].cells);
env.uiAnswers.push({ button: 'OK', text: bad.name.slice(0, 4) }, 'YES');
env.ctx.restoreSeason();
check('a damaged backup file stops the restore before anything changes', JSON.stringify(env.sheets['Events'].cells) === before && /could not be read/.test(env.ctx.__alerts.pop()));
bad.content = keep;

// --- TEST copy ---
env.ctx.makeTestCopy();
check('Make this the TEST copy refuses in the live workbook', /live team workbook/.test(env.ctx.__alerts.pop()) && !env.props.IS_TEST);
check('Clear all games refuses outside a TEST copy', (env.ctx.clearTestGames(), /only works in the TEST copy/.test(env.ctx.__alerts.pop())) && evCount(env, 'G1') === g1Events);

let t = seedLiveWorkbook(makeEnv({ codePath: CODE, sheetId: 'COPY123', sheetName: 'Copy of Tigers Lacrosse' }));
t.ctx.rebuildStats();
t.ctx.makeTestCopy();
check('TEST copy must be renamed to start with TEST', /starts with TEST/.test(t.ctx.__alerts.pop()) && !t.props.IS_TEST);
t = seedLiveWorkbook(makeEnv({ codePath: CODE, sheetId: 'COPY123', sheetName: 'TEST - Tigers Lacrosse' }));
t.ctx.rebuildStats();
t.ctx.viewersSheet_(t.ss).appendRow(['mom@example.com', '', '', '', 'P001', true, '', '', '']);
const F = new t.Sheet('Form Responses 1', 1000, 26); t.sheets['Form Responses 1'] = F;
F.appendRow(['Timestamp', 'Email Address']); F.appendRow([new Date(), 'dad@example.com']);
t.props.S_abc = '{"e":"mom@example.com","x":99999999999999}';
t.props['BACKUP_FOLDER_' + LIVE] = 'd1';
t.uiAnswers.push('NO');
t.ctx.makeTestCopy();
check('answering No leaves the copy as it was', !t.props.IS_TEST && t.sheets['Viewers'].getLastRow() === 2);
t.uiAnswers.push('YES');
t.ctx.makeTestCopy();
check('TEST copy: script now points at the copy itself', t.props.IS_TEST === '1' && t.props.SHEET_ID === 'COPY123' && t.ctx.sheetId_() === 'COPY123');
check('TEST copy: family emails and sign-ins removed', t.sheets['Viewers'].getLastRow() === 1 && F.getLastRow() === 1 && !t.props.S_abc && !t.props['BACKUP_FOLDER_' + LIVE]);
check('TEST copy reports test: true', getv(t).test === true && post(t, { test: true }).test === true && post(t, { test: true }).sheet === 'TEST - Tigers Lacrosse');
check('TEST copy: family sign-in is off', post(t, { action: 'requestCode', email: 'mom@example.com' }).error === 'TEST_COPY' && t.mail.length === 0);
r = post(t, G('T1', '2026-06-01', 'Practice', 'Home', [ev('Q1', 'Goal', 'P001')]));
const tf = files(t);
check('TEST copy saves games, backups go to its own folder', r.success && tf.length === 1 && pathOf(t, tf[0]) === 'Lacrosse Scorebook Backups / TEST - Tigers Lacrosse / 2026', tf.map((f) => pathOf(t, f)));
t.uiAnswers.push('YES');
t.ctx.clearTestGames();
check('Clear all games (TEST copy) empties Events, Games, Game Log', t.sheets['Events'].getLastRow() === 1 && t.sheets['Games'].getLastRow() === 1 && t.sheets['Game Log'].getLastRow() <= 1, [t.sheets['Events'].getLastRow(), t.sheets['Games'].getLastRow(), t.sheets['Game Log'].getLastRow()]);

// safety: a script marked TEST but not pointing at its own copy refuses to write
const w = seedLiveWorkbook(makeEnv({ codePath: CODE }));
w.props.IS_TEST = '1';
r = post(w, G('X1', '2026-06-01', 'X', 'Home', [ev('Q1', 'Goal', 'P001')]));
check('marked TEST with no Sheet ID: refuses to save (never falls back to live)', !r.success && /not set up/.test(r.error) && w.sheets['Games'].getLastRow() === 1, r);
w.props.SHEET_ID = LIVE;
r = post(w, G('X1', '2026-06-01', 'X', 'Home', [ev('Q1', 'Goal', 'P001')]));
check('marked TEST but pointing at the live ID: refuses', !r.success && w.sheets['Games'].getLastRow() === 1, r);
check('menu has the new items', (() => { const items = []; env.ctx.SpreadsheetApp.getUi = () => ({ createMenu: () => { const m = { addItem: (a, f) => { items.push(f); return m; }, addSeparator: () => m, addToUi: () => {} }; return m; } }); env.ctx.onOpen(); return ['backupAllGames', 'restoreGame', 'restoreSeason', 'makeTestCopy', 'clearTestGames'].every((f) => items.indexOf(f) >= 0); })());

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
