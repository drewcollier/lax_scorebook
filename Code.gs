/**
 * Fishers Tigers Lacrosse Scorebook - Google Apps Script
 * Complete, corrected version.
 *
 * Deploy as Web App:
 *   - Execute as: Me
 *   - Who has access: Anyone
 *
 * Sheet ID: 18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64
 * Tabs used: Players, Officials, Games, Events, Game Log, Season Totals,
 *   MaxPreps Export, Scoresheet Template, Viewers (+ the sign-up form's tab)
 */

var SHEET_ID = '18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64';

// Which workbook the web app writes to. The live script uses SHEET_ID above.
// A TEST copy of the workbook records its own ID in Script Properties
// (Lacrosse Tools > Make this the TEST copy), so it can never write to the
// live Sheet. (A script running as a web app can't ask "which Sheet am I
// attached to?", so the ID has to be written down.)
function sheetId_() {
  var p = PropertiesService.getScriptProperties();
  var own = p.getProperty('SHEET_ID');
  if (p.getProperty('IS_TEST') === '1') {
    if (!own || own === SHEET_ID) throw new Error('This TEST copy is not set up yet (Lacrosse Tools > Make this the TEST copy).');
    return own;
  }
  return own || SHEET_ID;
}
function book_() { return SpreadsheetApp.openById(sheetId_()); }
function isTest_() { return PropertiesService.getScriptProperties().getProperty('IS_TEST') === '1'; }

/**
 * Script version. The app asks for it (?action=version) to know it can use
 * confirmed (JSON) saves. Bump it when the app<->script protocol changes.
 *   1 = original (form post, unconfirmed)
 *   2 = JSON replies, re-sync replaces the game, Game Log written by the script
 *   3 = every data read needs the PIN too (sent in a POST body, never in a URL)
 *   4 = Season Totals written by the script; permanent player IDs (P001...)
 *   5 = MaxPreps Export tab written by the script (season to date)
 *   6 = family sign-in for the stats viewer (email code, own player only)
 *   7 = view-only coach PINs (VIEW_PINS) + lockout after too many wrong PINs
 *   8 = TEST copy support, a backup file in Drive for every saved game,
 *       Lacrosse Tools > Restore a game / Restore a season
 */
var SCRIPT_VERSION = 8;

/**
 * The scorekeeper PIN.
 * The secret lives in Script Properties (Project Settings > Script Properties),
 * key WRITE_PIN, so it is NOT in the public app code. Change it there and the
 * new PIN works immediately -- no redeploy needed.
 *
 * The same PIN is needed to SAVE a game and to READ anything (roster,
 * officials, games, play-by-play). Only the version check and the connection
 * test answer without it; they reveal nothing.
 *
 * If WRITE_PIN is not set, everything is REFUSED (fail closed) with the error
 * PIN_NOT_SET, so a missing setting can never leave the stats open.
 */
function getWritePin_() {
  var p = PropertiesService.getScriptProperties().getProperty('WRITE_PIN');
  return (p === null || p === undefined) ? '' : String(p).trim();
}

/**
 * View-only coach PINs.
 * Script Properties key VIEW_PINS: one or more PINs separated by commas, e.g.
 * "4821, 7735" (one per coach, so one can be removed without touching the
 * others). A coach PIN can READ everything (the viewer's coach view, pulling
 * the roster) but can never SAVE a game. Leave it out if you don't use it.
 */
function getViewPins_() {
  var p = PropertiesService.getScriptProperties().getProperty('VIEW_PINS');
  return String(p === null || p === undefined ? '' : p).split(/[,\s]+/)
    .map(function(x) { return x.trim(); }).filter(function(x) { return x !== ''; });
}

/**
 * PIN lockout: after PIN_MAX_FAILS wrong PINs in a row (within 15 minutes),
 * every PIN - right or wrong - is refused for PIN_LOCK_MINUTES. That stops
 * anyone guessing PINs by trying thousands of them. A right PIN resets the
 * count. Lacrosse Tools > Clear PIN lockout ends a lockout early.
 * (Family email sign-in has its own limits and is not affected.)
 */
var PIN_MAX_FAILS = 10;
var PIN_LOCK_MINUTES = 15;

// Returns null when the PIN is right (and allowed for this action),
// otherwise the error reply to send back. needWrite: saving a game.
function pinError_(payload, needWrite) {
  var required = getWritePin_();
  if (required === '') {
    return { success: false, error: 'PIN_NOT_SET',
      message: 'The PIN has not been set up in the Apps Script (Project Settings > Script Properties > WRITE_PIN).' };
  }
  var cache = CacheService.getScriptCache();
  if (cache.get('PIN_LOCK')) {
    return { success: false, error: 'PIN_LOCKED',
      message: 'Too many wrong PINs, so PIN entry is paused for up to ' + PIN_LOCK_MINUTES +
        ' minutes. Try again later (a game stays saved on the device until then).' };
  }
  var supplied = (payload && payload.pin !== undefined && payload.pin !== null) ? String(payload.pin).trim() : '';
  var role = '';
  if (supplied !== '' && supplied === required) role = 'write';
  else if (supplied !== '' && getViewPins_().indexOf(supplied) >= 0) role = 'view';
  if (!role) {
    var fails = parseInt(cache.get('PIN_FAILS') || '0', 10) + 1;
    if (fails >= PIN_MAX_FAILS) {
      cache.put('PIN_LOCK', '1', PIN_LOCK_MINUTES * 60);
      cache.remove('PIN_FAILS');
    } else {
      cache.put('PIN_FAILS', String(fails), 15 * 60);
    }
    return { success: false, error: 'INVALID_PIN', message: 'Incorrect or missing PIN.' };
  }
  cache.remove('PIN_FAILS');
  if (needWrite && role !== 'write') {
    return { success: false, error: 'INVALID_PIN',
      message: 'That is a view-only coach PIN; it can\'t save games. Use the scorebook PIN.' };
  }
  return null;
}

// Lacrosse Tools > Clear PIN lockout.
function clearPinLockout() {
  var cache = CacheService.getScriptCache();
  cache.remove('PIN_LOCK');
  cache.remove('PIN_FAILS');
  SpreadsheetApp.getUi().alert('PIN lockout cleared. PINs work again now.');
}

// ============================================================
// WEB APP ENTRY POINTS
// ============================================================

function doGet(e) {
  var action = e.parameter.action || '';
  var callback = e.parameter.callback || '';

  // Data used to be readable here by anyone with the link. It now needs the PIN,
  // which must never travel in a URL, so these ask older apps to update.
  if (action === 'getRoster' || action === 'getOfficials' || action === 'getGames' || action === 'getEvents') {
    var msg = JSON.stringify({ success: false, error: 'UPDATE_APP',
      message: 'This version of the app is out of date. Reload it to update.' });
    return ContentService.createTextOutput(/^[A-Za-z0-9_.]+$/.test(callback) ? callback + '(' + msg + ')' : msg)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (action === 'version') {
    // test: true only in a TEST copy; the app checks it so a test game can't
    // go to the live Sheet and a real game can't go to the TEST copy.
    return jsonResponse({ success: true, version: SCRIPT_VERSION, test: isTest_() });
  }

  var output = ContentService.createTextOutput('Fishers Tigers Lacrosse Scorebook - Apps Script Active');
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

// Two kinds of caller:
//  - App V3.24+ sends the JSON straight in the request body (fetch) and gets a
//    JSON reply it can read, so it knows for sure whether the game saved.
//  - Older app versions submit a hidden form (payload=...) and get the old HTML
//    reply. Kept so devices that haven't updated yet keep working.
function doPost(e) {
  var payload;
  var legacy = false;
  try {
    if (e.parameter && e.parameter.payload) {
      legacy = true;
      payload = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      var contents = e.postData.contents;
      if (contents.indexOf('payload=') === 0) {
        legacy = true;
        var decoded = decodeURIComponent(contents.substring(8).replace(/\+/g, ' '));
        payload = JSON.parse(decoded);
      } else {
        payload = JSON.parse(contents);
      }
    } else {
      return buildResponse({ success: false, error: 'No payload received' });
    }
  } catch (err) {
    var bad = { success: false, error: 'Failed to parse payload: ' + err.message };
    return legacy ? buildResponse(bad) : jsonResponse(bad);
  }

  var result = routePost_(payload);
  return legacy ? buildResponse(result) : jsonResponse(result);
}

var PIN_ACTIONS = { exportGame: true, getRoster: true, getOfficials: true, getGames: true, getEvents: true };

function routePost_(payload) {
  if (payload.test === true) {
    var name = '';
    try { name = book_().getName(); } catch (e) { name = ''; }
    return { success: true, version: SCRIPT_VERSION, test: isTest_(), sheet: name,
      message: 'Connection successful! Scorebook is linked.' };
  }
  // Family sign-in (stats viewer). These don't use the PIN; see FAMILY SIGN-IN.
  // It is turned off in a TEST copy.
  if (isTest_() && { requestCode: 1, verifyCode: 1, myStats: 1, signOut: 1 }[payload.action]) {
    return { success: false, error: 'TEST_COPY', message: 'Family sign-in is turned off in the TEST copy.' };
  }
  if (payload.action === 'requestCode') return requestCode_(payload);
  if (payload.action === 'verifyCode') return verifyCode_(payload);
  if (payload.action === 'myStats') return myStats_(payload);
  if (payload.action === 'signOut') return signOut_(payload);
  if (!PIN_ACTIONS[payload.action]) return { success: false, error: 'Unknown action' };

  var bad = pinError_(payload, payload.action === 'exportGame');
  if (bad) {
    if (payload.action === 'exportGame') bad.message += ' Stats were not saved.';
    return bad;
  }
  if (payload.action === 'exportGame') return handleExportGame(payload.gameData);
  if (payload.action === 'getRoster') return getRoster_();
  if (payload.action === 'getOfficials') return getOfficials_();
  if (payload.action === 'getGames') return getGames_();
  if (payload.action === 'getEvents') return getEvents_(payload.gameId || '');
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// DATA READS (PIN required - see routePost_)
// ============================================================

function getRoster_() {
  var sheet = book_().getSheetByName('Players');
  if (!sheet) return { success: false, error: 'Players tab not found' };
  var data = sheet.getDataRange().getValues();
  var players = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[2]) continue;
    players.push({
      Player_ID: String(row[0]),
      Jersey: String(row[1]),
      Name: String(row[2]),
      Position: String(row[3]),
      isStarter: isStarterFlag_(row[4])
    });
  }
  return { success: true, players: players };
}

// Starter column (E, header "isStarter"): a real checkbox (TRUE) or any of
// X, Y, Yes, True, 1 (any capitalization, spaces ignored) marks a starter.
// Blank, N, No, False, 0 or anything else is not a starter.
function isStarterFlag_(v) {
  if (v === true || v === 1) return true;
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return s === 'x' || s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

function getOfficials_() {
  var sheet = book_().getSheetByName('Officials');
  if (!sheet) return { success: false, error: 'Officials tab not found' };
  var data = sheet.getDataRange().getValues();
  var officials = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0] && !data[i][1]) continue;
    officials.push({ Role: String(data[i][0]), Name: String(data[i][1]) });
  }
  return { success: true, officials: officials };
}

// The list of games (newest first) for the viewer's picker.
function getGames_() {
  var sheet = book_().getSheetByName('Games');
  if (!sheet) return { success: false, error: 'Games tab not found' };
  var data = sheet.getDataRange().getValues();
  var games = [];
  // Columns: 0 Game_ID,1 Date,2 Opponent,3 Location,4 Score,5 Game_Label, 6-14 meta.
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var raw = data[i][1];
    var dateStr = '';
    if (raw) {
      try { dateStr = Utilities.formatDate(new Date(raw), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
      catch (e) { dateStr = String(raw); }
    }
    games.push({
      Game_ID: String(data[i][0]),
      Date: dateStr,
      Opponent: String(data[i][2] || ''),
      Location: String(data[i][3] || ''),
      Score: String(data[i][4] || ''),
      Game_Label: String(data[i][5] || '')
    });
  }
  games.reverse(); // newest first
  return { success: true, games: games };
}

// All Event rows for one Game_ID (or every event if gameId is blank).
function getEvents_(gameId, ss) {
  var sheet = (ss || book_()).getSheetByName('Events');
  if (!sheet) return { success: false, error: 'Events tab not found' };
  var data = sheet.getDataRange().getValues();
  var tz = Session.getScriptTimeZone();
  function clock(v) {
    if (v === null || v === undefined || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return Utilities.formatDate(v, tz, 'HH:mm');
    }
    var m = String(v).match(/(\d{1,2}):(\d{2})/);
    return m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : String(v);
  }
  var events = [];
  // Events cols: 0 Timestamp,1 Game_ID,2 Period,3 Action_Type,4 Primary,5 Secondary,
  // 6 Strength,7 Pen_Duration,8 Game_Clock,9 Penalty_Type,10 Penalty_Name,11 Zone_ID
  for (var i = 1; i < data.length; i++) {
    var gid = String(data[i][1]);
    if (!gid) continue;
    if (gameId && gid !== String(gameId)) continue;
    events.push({
      Timestamp: String(data[i][0] || ''),
      Game_ID: gid,
      Period: String(data[i][2] || ''),
      Action_Type: String(data[i][3] || ''),
      Primary_Player_ID: String(data[i][4] || ''),
      Secondary_Player_ID: String(data[i][5] || ''),
      Strength: String(data[i][6] || ''),
      Pen_Duration: String(data[i][7] || ''),
      Game_Clock: clock(data[i][8]),
      Penalty_Type: String(data[i][9] || ''),
      Penalty_Name: String(data[i][10] || ''),
      Zone_ID: String(data[i][11] || '')
    });
  }
  return { success: true, events: events };
}

// ============================================================
// GAME EXPORT (events + game meta)
// ============================================================

var EVENT_HEADERS = ['Timestamp', 'Game_ID', 'Period', 'Action_Type', 'Primary_Player_ID',
  'Secondary_Player_ID', 'Strength', 'Pen_Duration', 'Game_Clock', 'Penalty_Type', 'Penalty_Name', 'Zone_ID'];

// Saves one game. Safe to call again for the same game (a re-sync, or a game
// edited and sent again): that game's old Events rows are removed first and its
// Games / Game Log rows are updated in place, so nothing is ever doubled.
function handleExportGame(gameData) {
  if (!gameData || !gameData.game || !gameData.game.Game_ID) {
    return { success: false, error: 'No game data provided' };
  }
  // Only one save at a time, so two scorers syncing together can't overwrite
  // each other's rows.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, error: 'BUSY', message: 'Another game is being saved right now. Try again in a moment.' };
  }
  try {
    var ss = book_();
    var game = gameData.game;
    var gameId = String(game.Game_ID);
    var events = gameData.events || [];

    var removed = writeEvents_(ss, gameId, events);
    writeGameRow_(ss, game);
    writeGameLogRow_(ss, game, events);
    rebuildSeasonTotals_(ss);
    rebuildMaxPreps_(ss);
    SpreadsheetApp.flush();

    // Keep a copy of exactly what was uploaded, as a file in Drive (see BACKUPS).
    // A problem here never undoes the save itself.
    var backup = '';
    try { backup = backupGame_(ss, gameData).getName(); } catch (err) { backup = ''; }

    return {
      success: true,
      message: removed > 0 ? 'Game updated (replaced the earlier copy).' : 'Game exported successfully!',
      gameId: gameId,
      eventsWritten: events.length,
      replaced: removed > 0,
      backup: backup
    };
  } catch (err) {
    return { success: false, error: 'Export failed: ' + err.message };
  } finally {
    lock.releaseLock();
  }
}

// Make sure the sheet has at least `lastRowNeeded` rows (Sheets refuses to
// write past the bottom of the grid, and Events outgrows 1,000 rows by the
// 3rd or 4th game).
function ensureRows_(sheet, lastRowNeeded) {
  var max = sheet.getMaxRows();
  if (lastRowNeeded > max) sheet.insertRowsAfter(max, lastRowNeeded - max);
}

// Row number (1-based) of the first data row whose `col` equals `value`, or -1.
function findRow_(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var vals = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

// Replace this game's rows on the Events tab. Returns how many old rows were removed.
function writeEvents_(ss, gameId, events) {
  var sheet = ss.getSheetByName('Events');
  if (!sheet) {
    sheet = ss.insertSheet('Events');
    sheet.appendRow(EVENT_HEADERS);
  }
  // Remove any earlier copy of this game (bottom-up, in contiguous blocks).
  var removed = 0;
  var last = sheet.getLastRow();
  if (last >= 2) {
    var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
    var i = ids.length - 1;
    while (i >= 0) {
      if (String(ids[i][0]) === gameId) {
        var end = i;
        while (i - 1 >= 0 && String(ids[i - 1][0]) === gameId) i--;
        sheet.deleteRows(i + 2, end - i + 1);
        removed += end - i + 1;
      }
      i--;
    }
  }
  if (!events.length) return removed;

  var rows = events.map(function(evt) {
    return [
      evt.Timestamp || '', gameId, evt.Period || '', evt.Action_Type || '',
      evt.Primary_Player_ID || '', evt.Secondary_Player_ID || '', evt.Strength || '',
      evt.Pen_Duration || '', evt.Game_Clock || '', evt.Penalty_Type || '',
      evt.Penalty_Name || '', evt.Zone_ID || ''
    ];
  });
  var start = sheet.getLastRow() + 1;
  ensureRows_(sheet, start + rows.length - 1);
  sheet.getRange(start, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
  return removed;
}

// "2026-04-15 - Carmel (Home)": the label the Scoresheet Template dropdown lists.
function gameLabel_(g) {
  var d = String(g.Date || '');
  if (Object.prototype.toString.call(g.Date) === '[object Date]') {
    d = Utilities.formatDate(g.Date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return d + ' - ' + (g.Opponent || '') + ' (' + (g.Location || '') + ')';
}

// Add or update this game's row on the Games tab (A-O, including the label in F).
function writeGameRow_(ss, g) {
  var sheet = ss.getSheetByName('Games');
  if (!sheet) {
    sheet = ss.insertSheet('Games');
    sheet.appendRow(['Game_ID', 'Date', 'Opponent', 'Location', 'Score', 'Game_Label',
      'Weather_Temp', 'Weather_Cond', 'Game_Start', 'Head_Official', 'Umpire', 'Field_Judge',
      'Tigers_Scorer', 'Tigers_Timer', 'Opp_Scorer']);
  }
  var row = findRow_(sheet, 1, g.Game_ID);
  if (row === -1) {
    row = sheet.getLastRow() + 1;
    ensureRows_(sheet, row);
  }
  sheet.getRange(row, 1, 1, 15).setValues([[
    g.Game_ID || '', g.Date || '', g.Opponent || '', g.Location || '', g.Score || '',
    gameLabel_(g),
    g.Weather_Temp || '', g.Weather_Cond || '', g.Game_Start || '', g.Head_Official || '',
    g.Umpire || '', g.Field_Judge || '', g.Tigers_Scorer || '', g.Tigers_Timer || '',
    g.Opp_Scorer || ''
  ]]);
}

// ============================================================
// GAME LOG (one row of team totals per game)
// Written as plain numbers when a game is saved, instead of ~2,500 live
// COUNTIFS formulas that recalculated on every edit. Columns are matched by
// their header names in row 1, so the tab's column order can change safely.
// Lacrosse Tools > Rebuild Stats recalculates every game from the Events tab
// (use it after editing Events by hand).
// ============================================================
var GL_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2'];

function gameLogValues_(g, events) {
  var v = {};
  function countBy(actionType, prefix, totalName) {
    var tot = 0;
    GL_PERIODS.forEach(function(p) {
      var n = 0;
      events.forEach(function(e) { if (e.Action_Type === actionType && e.Period === p) n++; });
      v[prefix + '_' + p] = n;
      tot += n;
    });
    v[totalName || (prefix + '_Tot')] = tot;
    return tot;
  }
  function pct(a, b) { return (a + b) > 0 ? a / (a + b) : ''; }
  function isOpp(e) { return String(e.Primary_Player_ID || '').indexOf('Opp') === 0; }
  function count(fn) { var n = 0; events.forEach(function(e) { if (fn(e)) n++; }); return n; }
  function sumMin(fn) {
    var s = 0;
    events.forEach(function(e) { if (fn(e)) s += Number(e.Pen_Duration) || 0; });
    return s / 60;
  }

  v.Date = g.Date || '';
  v.Opponent = g.Opponent || '';
  v.Location = g.Location || '';
  v.Game_ID = g.Game_ID || '';
  var us = countBy('Goal', 'Tigers', 'Tigers_Final');
  var them = countBy('Opp_Goal', 'Opp', 'Opp_Final');
  v.Result = us > them ? 'W' : (us < them ? 'L' : 'T');
  countBy('GB', 'GB');
  countBy('Shot', 'Shots');
  countBy('SOG', 'SOG');
  var cg = countBy('Clear_Good', 'ClearSucc');
  var cf = countBy('Clear_Fail', 'ClearFail');
  v.Clear_Pct = pct(cg, cf);
  var fw = countBy('FOW', 'FOWon');
  var fl = countBy('FOL', 'FOLost');
  v.FO_Pct = pct(fw, fl);
  countBy('Save', 'Sv');
  v.EMO_Success = count(function(e) { return e.Action_Type === 'EMO_Success'; });
  v.EMO_Fail = count(function(e) { return e.Action_Type === 'EMO_Fail'; });
  v.EMO_Pct = pct(v.EMO_Success, v.EMO_Fail);
  function pen(e) { return e.Action_Type === 'Penalty'; }
  v.Pen_Count_Tigers = count(function(e) { return pen(e) && !isOpp(e); });
  v.Pen_Min_Tigers = sumMin(function(e) { return pen(e) && !isOpp(e); });
  v.Personal_Count_Tigers = count(function(e) { return pen(e) && !isOpp(e) && e.Penalty_Type === 'Personal'; });
  v.Ejections_Tigers = count(function(e) { return e.Action_Type === 'Ejection' && !isOpp(e); });
  v.Pen_Count_Opp = count(function(e) { return pen(e) && isOpp(e); });
  v.Pen_Min_Opp = sumMin(function(e) { return pen(e) && isOpp(e); });
  return v;
}

function gameLogHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

// One-time switch-over: the old Game Log held a formula in every row. Clear
// them, then rebuild every game already on the Events tab as plain numbers.
function migrateGameLogIfNeeded_(ss, sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var f = sheet.getRange(2, 1, 1, Math.min(5, sheet.getLastColumn())).getFormulas()[0];
  if (f.join('') === '') return;
  rebuildGameLog_(ss);
}

function writeGameLogRow_(ss, g, events) {
  var sheet = ss.getSheetByName('Game Log');
  if (!sheet) return; // tab is optional
  migrateGameLogIfNeeded_(ss, sheet);
  var headers = gameLogHeaders_(sheet);
  var idCol = headers.indexOf('Game_ID') + 1;
  if (idCol === 0) return;
  var v = gameLogValues_(g, events);
  var rowVals = headers.map(function(h) { return v.hasOwnProperty(h) ? v[h] : ''; });
  var row = findRow_(sheet, idCol, g.Game_ID);
  if (row === -1) {
    row = Math.max(sheet.getLastRow(), 1) + 1;
    ensureRows_(sheet, row);
  }
  sheet.getRange(row, 1, 1, headers.length).setValues([rowVals]);
}

// Recalculate the whole Game Log from the Games + Events tabs.
function rebuildGameLog_(ss) {
  var sheet = ss.getSheetByName('Game Log');
  var gamesSheet = ss.getSheetByName('Games');
  var eventsSheet = ss.getSheetByName('Events');
  if (!sheet || !gamesSheet) return 0;
  var headers = gameLogHeaders_(sheet);
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
  }
  var tz = Session.getScriptTimeZone();
  var byGame = {};
  if (eventsSheet && eventsSheet.getLastRow() >= 2) {
    eventsSheet.getRange(2, 1, eventsSheet.getLastRow() - 1, EVENT_HEADERS.length).getValues().forEach(function(r) {
      var id = String(r[1]);
      if (!id) return;
      (byGame[id] = byGame[id] || []).push({
        Period: String(r[2]), Action_Type: String(r[3]), Primary_Player_ID: String(r[4]),
        Pen_Duration: r[7], Penalty_Type: String(r[9])
      });
    });
  }
  var rows = [];
  if (gamesSheet.getLastRow() >= 2) {
    gamesSheet.getRange(2, 1, gamesSheet.getLastRow() - 1, 5).getValues().forEach(function(r) {
      if (!r[0]) return;
      var date = r[1];
      if (Object.prototype.toString.call(date) === '[object Date]') date = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
      var g = { Game_ID: String(r[0]), Date: date, Opponent: r[2], Location: r[3] };
      var v = gameLogValues_(g, byGame[g.Game_ID] || []);
      rows.push(headers.map(function(h) { return v.hasOwnProperty(h) ? v[h] : ''; }));
    });
  }
  if (rows.length) {
    ensureRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return rows.length;
}

// Menu item: Lacrosse Tools > Rebuild Stats
// Assigns any missing player IDs, then recalculates Game Log and Season Totals
// from the Events tab. Use it after editing Events or Players by hand.
function rebuildStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ids = assignPlayerIds_(ss);
  var games = rebuildGameLog_(ss);
  var players = rebuildSeasonTotals_(ss);
  rebuildMaxPreps_(ss);
  SpreadsheetApp.getUi().alert('Stats rebuilt (Game Log, Season Totals, MaxPreps Export): ' + games + ' game(s), ' + players + ' player(s)'
    + (ids ? ', ' + ids + ' new player ID(s) assigned.' : '.'));
}
// ============================================================
// MAXPREPS EXPORT (season to date, MaxPreps boys lacrosse stat-sheet columns)
// Same rules as the app's per-game MaxPreps file:
//  TA = caused turnovers, UE = turnovers, FA = faceoffs won + lost.
//  Goalie MIN / W / L / T / Shut Out come only from games where exactly one
//  goalie recorded saves or goals allowed: that goalie played the whole game
//  (48 min + 4 per overtime) and gets the decision. Games with two goalies add
//  their GA/SV but leave minutes and decisions for the coach to enter.
//  P = penalties, PM/PS = total penalty time as minutes + leftover seconds.
// Columns are matched by the header names in row 1.
// ============================================================
function rebuildMaxPreps_(ss) {
  var sheet = ss.getSheetByName('MaxPreps Export');
  var players = ss.getSheetByName('Players');
  if (!sheet || !players) return 0;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);

  var st = {};
  function P(id) {
    if (!st[id]) st[id] = { G: 0, A: 0, SOG: 0, GB: 0, INT: 0, TA: 0, UE: 0, FW: 0, FL: 0,
      GA: 0, SV: 0, inGoal: false, MIN: 0, SO: 0, W: 0, L: 0, T: 0, decided: false, P: 0, secs: 0 };
    return st[id];
  }
  var games = {};
  var ev = ss.getSheetByName('Events');
  if (ev && ev.getLastRow() >= 2) {
    ev.getRange(2, 1, ev.getLastRow() - 1, EVENT_HEADERS.length).getValues().forEach(function(r) {
      var gid = String(r[1]), per = String(r[2]), type = String(r[3]), prim = String(r[4]), sec = String(r[5]);
      if (!gid) return;
      var gm = games[gid] = games[gid] || { us: 0, them: 0, ot: {}, goalies: {} };
      if (per === 'OT1' || per === 'OT2') gm.ot[per] = true;
      if (type === 'Goal') { gm.us++; if (prim) P(prim).G++; if (sec) P(sec).A++; }
      else if (type === 'Opp_Goal') gm.them++;
      else if (!prim || prim.indexOf('Opp') === 0) return;
      else if (type === 'SOG') P(prim).SOG++;
      else if (type === 'GB') P(prim).GB++;
      else if (type === 'INT') P(prim).INT++;
      else if (type === 'CTO') P(prim).TA++;
      else if (type === 'TO') P(prim).UE++;
      else if (type === 'FOW') P(prim).FW++;
      else if (type === 'FOL') P(prim).FL++;
      else if (type === 'Save') { P(prim).SV++; P(prim).inGoal = true; gm.goalies[prim] = true; }
      else if (type === 'GA') { P(prim).GA++; P(prim).inGoal = true; gm.goalies[prim] = true; }
      else if (type === 'Penalty') { P(prim).P++; P(prim).secs += Number(r[7]) || 0; }
    });
  }
  Object.keys(games).forEach(function(gid) {
    var gm = games[gid];
    var gs = Object.keys(gm.goalies);
    if (gs.length !== 1) return;
    var s = P(gs[0]);
    s.decided = true;
    s.MIN += 48 + 4 * Object.keys(gm.ot).length;
    if (gm.them === 0) s.SO++;
    if (gm.us > gm.them) s.W++; else if (gm.us < gm.them) s.L++; else s.T++;
  });

  var rows = [];
  if (players.getLastRow() >= 2) {
    var list = players.getRange(2, 1, players.getLastRow() - 1, 3).getValues().filter(function(r) { return String(r[0]).trim(); });
    list.sort(function(a, b) { return (parseInt(a[1], 10) || 999) - (parseInt(b[1], 10) || 999); });
    list.forEach(function(r) {
      var s = st[String(r[0]).trim()] || P(String(r[0]).trim());
      var v = {
        '#': r[1], 'Player Name': r[2], 'Goals': s.G, 'Asst': s.A, 'SOG': s.SOG, 'GB': s.GB, 'INT': s.INT,
        'TA': s.TA, 'UE': s.UE, 'FW': s.FW, 'FA': s.FW + s.FL,
        'MIN': s.decided ? s.MIN : '', 'GA': s.inGoal ? s.GA : '', 'SV': s.inGoal ? s.SV : '',
        'Shut Out': s.decided ? s.SO : '', 'W': s.decided ? s.W : '', 'L': s.decided ? s.L : '', 'T': s.decided ? s.T : '',
        'P': s.P, 'PM': Math.floor(s.secs / 60), 'PS': s.secs % 60
      };
      rows.push(headers.map(function(h) { return v.hasOwnProperty(h) ? v[h] : ''; }));
    });
  }
  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, headers.length).clearContent();
  if (rows.length) {
    ensureRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange(2, 1, rows.length, headers.length).setNumberFormat('0');
    var nameCol = headers.indexOf('Player Name');
    if (nameCol !== -1) sheet.getRange(2, nameCol + 1, rows.length, 1).setNumberFormat('@');
  }
  return rows.length;
}

// Older menu name, kept so a bookmarked/assigned run still works.
function rebuildGameLog() { rebuildStats(); }

// ============================================================
// PLAYERS: permanent IDs
// Every player gets an ID like P001 the first time their row is filled in.
// It never changes - not when the jersey number changes, not when the sheet is
// sorted - so stats (and, later, family logins) always follow the right player.
// Never type in column A; leave it blank and the ID appears by itself.
// ============================================================
var PLAYER_ID_RE = /^P(\d+)$/;

// Give an ID to every Players row that has a jersey or name but no proper ID,
// and to the second copy of any duplicated ID (e.g. a copied row).
// Returns how many IDs were assigned.
function assignPlayerIds_(ss) {
  var sheet = ss.getSheetByName('Players');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var n = sheet.getLastRow() - 1;
  var rows = sheet.getRange(2, 1, n, 3).getValues();
  var formulas = sheet.getRange(2, 1, n, 1).getFormulas();
  var max = 0;
  rows.forEach(function(r, i) {
    var m = PLAYER_ID_RE.exec(String(r[0]).trim());
    if (m && !formulas[i][0]) max = Math.max(max, parseInt(m[1], 10));
  });
  var seen = {};
  var out = [];
  var changed = 0;
  rows.forEach(function(r, i) {
    var id = String(r[0]).trim();
    var filled = String(r[1]).trim() !== '' || String(r[2]).trim() !== '';
    var valid = PLAYER_ID_RE.test(id) && !formulas[i][0] && !seen[id];
    if (filled && !valid) {
      max++;
      id = String(max);
      while (id.length < 3) id = '0' + id;
      id = 'P' + id;
      changed++;
    } else if (!filled && !valid) {
      id = '';
    }
    if (id) seen[id] = true;
    out.push([id]);
  });
  if (changed) sheet.getRange(2, 1, n, 1).setValues(out);
  return changed;
}

// Runs by itself whenever someone edits the Sheet. When the Players tab is
// changed, new players get their ID and Season Totals is refreshed.
// (Simple triggers may only use the spreadsheet they're attached to, so this
// uses e.source rather than SHEET_ID.)
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var ss = e.source || SpreadsheetApp.getActiveSpreadsheet();
  if (sheet.getName() === 'Viewers') { refreshViewers_(ss); return; }
  if (sheet.getName() !== 'Players') return;
  assignPlayerIds_(ss);
  rebuildSeasonTotals_(ss);
  rebuildMaxPreps_(ss);
}

// ============================================================
// SEASON TOTALS (one row per player, written as plain numbers)
// Rebuilt from the Players + Events tabs every time a game is saved, whenever
// the Players tab is edited, and by Lacrosse Tools > Rebuild Stats. Replaces
// the per-row formulas, which had to be copied by hand for every player and
// had a wrong penalty count for #3, #4 and #9 and showed GP 1 for players
// with no games. Columns are matched by their header names in row 1.
// ============================================================
function rebuildSeasonTotals_(ss) {
  var sheet = ss.getSheetByName('Season Totals');
  var players = ss.getSheetByName('Players');
  if (!sheet || !players) return 0;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);

  // Tally every event once.
  var st = {};
  function P(id) {
    if (!st[id]) st[id] = { games: {}, G: 0, A: 0, S: 0, SOG: 0, GB: 0, CT: 0, TO: 0, FW: 0, FL: 0,
      PEN: 0, penSecs: 0, SV: 0, GA: 0, INT: 0 };
    return st[id];
  }
  var ev = ss.getSheetByName('Events');
  if (ev && ev.getLastRow() >= 2) {
    ev.getRange(2, 1, ev.getLastRow() - 1, EVENT_HEADERS.length).getValues().forEach(function(r) {
      var game = String(r[1]), type = String(r[3]), prim = String(r[4]), sec = String(r[5]);
      if (!game) return;
      if (prim) {
        var p = P(prim);
        p.games[game] = true;
        if (type === 'Goal') p.G++;
        else if (type === 'Shot') p.S++;
        else if (type === 'SOG') p.SOG++;
        else if (type === 'GB') p.GB++;
        else if (type === 'CTO') p.CT++;
        else if (type === 'TO') p.TO++;
        else if (type === 'FOW') p.FW++;
        else if (type === 'FOL') p.FL++;
        else if (type === 'Save') p.SV++;
        else if (type === 'GA') p.GA++;
        else if (type === 'INT') p.INT++;
        else if (type === 'Penalty') { p.PEN++; p.penSecs += Number(r[7]) || 0; }
      }
      if (sec) {
        var s2 = P(sec);
        s2.games[game] = true;
        if (type === 'Goal') s2.A++;
      }
    });
  }

  // One row per player, in Players-tab order.
  var rows = [];
  if (players.getLastRow() >= 2) {
    players.getRange(2, 1, players.getLastRow() - 1, 4).getValues().forEach(function(r) {
      var id = String(r[0]).trim();
      if (!id) return;
      var s = st[id] || P(id);
      var goalie = String(r[3]) === 'Goalie' || (s.SV + s.GA) > 0;
      var v = {
        'Player_ID': id, 'Player #': r[1], 'Player Name': r[2], 'Position': r[3],
        'GP': Object.keys(s.games).length,
        'G': s.G, 'A': s.A, 'Pts': s.G + s.A, 'S': s.S, 'SOG': s.SOG,
        'Shooting %': s.S > 0 ? s.G / s.S : '',
        'GB': s.GB, 'CT': s.CT, 'TO': s.TO, 'FW': s.FW, 'FL': s.FL,
        'FO Win %': (s.FW + s.FL) > 0 ? s.FW / (s.FW + s.FL) : '',
        'PEN': s.PEN, 'Pen Min': s.penSecs / 86400, // shown as [h]:mm:ss
        'SV': goalie ? s.SV : '', 'GA': goalie ? s.GA : '',
        'Save %': (s.SV + s.GA) > 0 ? s.SV / (s.SV + s.GA) : '',
        'INT': s.INT
      };
      rows.push(headers.map(function(h) { return v.hasOwnProperty(h) ? v[h] : ''; }));
    });
  }

  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, headers.length).clearContent();
  if (rows.length) {
    ensureRows_(sheet, rows.length + 1);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    // Number formats (INT was formatted as a percentage).
    var fmt = { 'Shooting %': '0.0%', 'FO Win %': '0.0%', 'Save %': '0.0%', 'Pen Min': '[h]:mm:ss', 'INT': '0' };
    headers.forEach(function(h, i) {
      if (fmt[h]) sheet.getRange(2, i + 1, rows.length, 1).setNumberFormat(fmt[h]);
    });
  }
  return rows.length;
}

function buildResponse(data) {
  var jsonString = JSON.stringify(data);
  var html = '<!DOCTYPE html><html><head><title>Response</title></head><body>'
    + '<script>'
    + 'var data = ' + jsonString.replace(/</g, '\\u003c') + ';'
    + 'if (window.parent && window.parent !== window) {'
    + '  window.parent.postMessage({type: "scorebook_response", data: data}, "*");'
    + '}'
    + '</script>'
    + '<p>' + (data.success ? 'Success' : 'Error: ' + String(data.error || 'Unknown').replace(/</g, '&lt;')) + '</p>'
    + '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

// ============================================================
// PRINTABLE SCORESHEET (menu-driven, computed from Events)
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Lacrosse Tools')
    .addItem('Generate Printable Scoresheet', 'generateScoresheetPDF')
    .addItem('Rebuild Stats (Game Log, Season Totals, MaxPreps)', 'rebuildStats')
    .addSeparator()
    .addItem('Check for new sign-ups (Viewers)', 'checkNewSignUps')
    .addItem('Set up family sign-in', 'setupFamilySignIn')
    .addItem('Clear PIN lockout', 'clearPinLockout')
    .addSeparator()
    .addItem('Back up all games now', 'backupAllGames')
    .addItem('Restore a game...', 'restoreGame')
    .addItem('Restore a season...', 'restoreSeason')
    .addSeparator()
    .addItem('Make this the TEST copy', 'makeTestCopy')
    .addItem('Clear all games (TEST copy only)', 'clearTestGames')
    .addToUi();
  // New sign-ups from the form show up in Viewers whenever the Sheet is opened.
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName('Viewers') && !isTest_()) syncFormResponses_(ss);
  } catch (err) {}
}

function generateScoresheetPDF() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var templateSheet = ss.getSheetByName('Scoresheet Template');
  var gamesSheet = ss.getSheetByName('Games');
  var eventsSheet = ss.getSheetByName('Events');
  var playersSheet = ss.getSheetByName('Players');

  if (!templateSheet) {
    SpreadsheetApp.getUi().alert("Error: 'Scoresheet Template' tab not found.");
    return;
  }
  var selectedGameLabel = templateSheet.getRange('B2').getValue();
  if (!selectedGameLabel) {
    SpreadsheetApp.getUi().alert('Please select a game from the dropdown first.');
    return;
  }

  // Locate game by Game_Label (Games col F = index 5).
  var gamesData = gamesSheet.getDataRange().getValues();
  var gameRecord = null, gameID = '';
  for (var i = 1; i < gamesData.length; i++) {
    if (gamesData[i][5] === selectedGameLabel) {
      gameID = gamesData[i][0]; gameRecord = gamesData[i]; break;
    }
  }
  if (!gameID) {
    SpreadsheetApp.getUi().alert('Could not locate the Game ID for: ' + selectedGameLabel);
    return;
  }

  var rawDate = gameRecord[1];
  var gameDate = rawDate ? Utilities.formatDate(new Date(rawDate), Session.getScriptTimeZone(), 'MM/dd/yyyy') : '';
  var opponent = gameRecord[2] || '';
  var location = gameRecord[3] || '';
  // Meta G-O: 6 Weather_Temp,7 Weather_Cond,8 Game_Start,9 Head_Official,
  // 10 Umpire,11 Field_Judge,12 Tigers_Scorer,13 Tigers_Timer,14 Opp_Scorer
  var weatherTemp = gameRecord[6]  || '';
  var weatherCond = gameRecord[7]  || '';
  var gameStart   = gameRecord[8]  || '';
  var headOff     = gameRecord[9]  || '';
  var umpire      = gameRecord[10] || '';
  var fieldJudge  = gameRecord[11] || '';
  var scorer      = gameRecord[12] || '';
  var timer       = gameRecord[13] || '';
  var oppScorer   = gameRecord[14] || '';
  var weather = [weatherTemp ? weatherTemp + '\u00B0F' : '', weatherCond].filter(function(x){return x;}).join(' ');

  var eventsData = eventsSheet.getDataRange().getValues();

  // Player map.
  var playersData = playersSheet.getDataRange().getValues();
  var playerMap = {};
  for (var p = 1; p < playersData.length; p++) {
    var pid = String(playersData[p][0]);
    if (!playersData[p][1] && !playersData[p][2]) continue;
    playerMap[pid] = {
      id: pid, jersey: playersData[p][1], name: playersData[p][2],
      position: String(playersData[p][3] || '')
    };
  }

  // Events indices: 1 Game_ID,2 Period,3 Action_Type,4 Primary,5 Secondary,8 Game_Clock,9 Pen_Type,10 Pen_Name
  var PERIODS = ['Q1','Q2','Q3','Q4','OT1','OT2'];
  function zeroQ() { return { Q1:0,Q2:0,Q3:0,Q4:0,OT1:0,OT2:0 }; }

  // Normalize a Game_Clock value to zero-padded HH:MM.
  // Sheets stores a bare time (e.g. 7:44) as a Date on the 1899 epoch, which
  // otherwise renders as "Sat Dec 30 1899 07:44:00 GMT-0500 ...". We only want HH:MM.
  function formatClock(v) {
    if (v === null || v === undefined || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    }
    if (typeof v === 'number') {
      // Fractional day -> minutes since midnight.
      var mins = Math.round((v - Math.floor(v)) * 24 * 60);
      var hh = Math.floor(mins / 60), mm = mins % 60;
      return ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2);
    }
    var str = String(v).trim();
    // Pull an H:MM or HH:MM out of whatever string form it takes.
    var m = str.match(/(\d{1,2}):(\d{2})/);
    if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
    return str;
  }

  // Per-player stats + per-quarter team boxes, single pass.
  var stat = {}; // pid -> stat obj
  function ensure(pid) {
    if (!stat[pid]) stat[pid] = { shots:0,sog:0,goals:0,assists:0,gbs:0,saves:0,savesQ:zeroQ() };
    return stat[pid];
  }
  var gbQ = zeroQ(), shotQ = zeroQ(), clearGoodQ = zeroQ(), clearFailQ = zeroQ();
  var emoScoredQ = zeroQ(), emoFailQ = zeroQ(), fowQ = zeroQ(), folQ = zeroQ();
  var tigersGoalQ = zeroQ(), oppGoalQ = zeroQ();
  var goals = [], penalties = [], timeouts = { h1:0, h2:0, ot1:0, ot2:0 };

  for (var e = 1; e < eventsData.length; e++) {
    if (eventsData[e][1] !== gameID) continue;
    var per = eventsData[e][2];
    var action = eventsData[e][3];
    var prim = String(eventsData[e][4]);
    var sec = String(eventsData[e][5]);
    var inQ = (zeroQ()[per] !== undefined);

    if (action === 'Goal') {
      ensure(prim).goals++;
      if (inQ) tigersGoalQ[per]++;
      if (sec && sec !== 'undefined' && sec !== 'null') ensure(sec).assists++;
      var sj = playerMap[prim] ? playerMap[prim].jersey : prim;
      var aj = playerMap[sec] ? playerMap[sec].jersey : '';
      goals.push({ clock: formatClock(eventsData[e][8]), scorer: sj, assist: aj });
    } else if (action === 'Shot') { ensure(prim).shots++; if (inQ) shotQ[per]++; }
    else if (action === 'SOG') { ensure(prim).sog++; }
    else if (action === 'GB') { ensure(prim).gbs++; if (inQ) gbQ[per]++; }
    else if (action === 'Save') { var s = ensure(prim); s.saves++; if (inQ) s.savesQ[per]++; }
    else if (action === 'Clear_Good') { if (inQ) clearGoodQ[per]++; }
    else if (action === 'Clear_Fail') { if (inQ) clearFailQ[per]++; }
    else if (action === 'FOW') { if (inQ) fowQ[per]++; }
    else if (action === 'FOL') { if (inQ) folQ[per]++; }
    else if (action === 'EMO_Success') { if (inQ) emoScoredQ[per]++; }
    else if (action === 'EMO_Fail') { if (inQ) emoFailQ[per]++; }
    else if (action === 'Opp_Goal') { if (inQ) oppGoalQ[per]++; }
    else if (action === 'TIMEOUT') {
      if (prim === 'TEAM' || prim === 'Tigers') {
        if (per === 'Q1' || per === 'Q2') timeouts.h1++;
        else if (per === 'Q3' || per === 'Q4') timeouts.h2++;
        else if (per === 'OT1') timeouts.ot1++;
        else if (per === 'OT2') timeouts.ot2++;
      }
    } else if (action === 'Penalty') {
      if (prim.indexOf('Opp') === 0) continue;
      var who = (prim === 'In-Home') ? 'In-Home' : (playerMap[prim] ? ('#' + playerMap[prim].jersey) : prim);
      penalties.push({
        type: eventsData[e][9] || '', player: who,
        name: eventsData[e][10] || 'Foul', period: per || '', clock: formatClock(eventsData[e][8])
      });
    }
  }

  // Totals.
  function sumQ(o){ return o.Q1+o.Q2+o.Q3+o.Q4+o.OT1+o.OT2; }
  var tigersGoals = sumQ(tigersGoalQ);
  var oppGoals = sumQ(oppGoalQ);
  var otTigers = tigersGoalQ.OT1 + tigersGoalQ.OT2;
  var otOpp = oppGoalQ.OT1 + oppGoalQ.OT2;

  // Roster grouped by position, field order.
  var ORDER = ['Attack','Midfield','FOGO','LSM','Defense','Goalie'];
  var LABEL = { Attack:'ATTACK', Midfield:'MIDFIELD', FOGO:'FOGO', LSM:'LSM', Defense:'DEFENSE', Goalie:'GOALIE' };
  var groups = {}; ORDER.forEach(function(g){ groups[g] = []; }); groups['Other'] = [];
  for (var pid in playerMap) {
    var pl = playerMap[pid];
    var st = stat[pid] || { shots:0,sog:0,goals:0,assists:0,gbs:0,saves:0,savesQ:zeroQ() };
    var row = { jersey: pl.jersey, name: pl.name, position: pl.position,
      shots: st.shots, sog: st.sog, goals: st.goals, assists: st.assists, gbs: st.gbs, saves: st.saves, savesQ: st.savesQ };
    var key = ORDER.indexOf(pl.position) >= 0 ? pl.position : 'Other';
    groups[key].push(row);
  }
  function byJersey(a,b){ return (parseInt(a.jersey)||999) - (parseInt(b.jersey)||999); }
  ORDER.concat(['Other']).forEach(function(g){ groups[g].sort(byJersey); });

  // Individual scoring (scorers only), sorted by PTS desc.
  var scorers = [];
  for (var pid2 in stat) {
    var st2 = stat[pid2];
    if ((st2.goals + st2.assists) > 0 && playerMap[pid2]) {
      scorers.push({ jersey: playerMap[pid2].jersey, name: playerMap[pid2].name,
        g: st2.goals, a: st2.assists, pts: st2.goals + st2.assists });
    }
  }
  scorers.sort(function(a,b){ return b.pts - a.pts || b.g - a.g; });

  // ---------- HTML builders ----------
  // Escape text before it goes into the scoresheet HTML, so a name like
  // O'Brien or one containing < or & always displays as typed.
  function esc(x){
    if (x === null || x === undefined) return '';
    return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Roster block (one position band = header row + player rows).
  function rosterBlock() {
    var html = '<table class="roster"><thead><tr>'
      + '<th class="pos"></th><th class="num">#</th><th class="nm left">PLAYER</th>'
      + '<th>SH</th><th>SOG</th><th>G</th><th>A</th><th>GB</th></tr></thead><tbody>';
    ORDER.forEach(function(g){
      var rows = groups[g];
      if (!rows.length) return;
      for (var r = 0; r < rows.length; r++) {
        var pr = rows[r];
        html += '<tr>';
        html += (r === 0)
          ? '<td class="pos" rowspan="' + rows.length + '"><span>' + LABEL[g] + '</span></td>'
          : '';
        html += '<td class="num"><b>' + esc(pr.jersey) + '</b></td>'
          + '<td class="nm left">' + esc(pr.name) + '</td>'
          + '<td>' + pr.shots + '</td><td>' + pr.sog + '</td><td>' + pr.goals + '</td>'
          + '<td>' + pr.assists + '</td><td>' + pr.gbs + '</td></tr>';
      }
    });
    if (groups['Other'].length) {
      var orows = groups['Other'];
      for (var o = 0; o < orows.length; o++) {
        var orp = orows[o];
        html += '<tr>' + (o === 0 ? '<td class="pos" rowspan="' + orows.length + '"><span>OTHER</span></td>' : '')
          + '<td class="num"><b>' + esc(orp.jersey) + '</b></td><td class="nm left">' + esc(orp.name) + '</td>'
          + '<td>' + orp.shots + '</td><td>' + orp.sog + '</td><td>' + orp.goals + '</td>'
          + '<td>' + orp.assists + '</td><td>' + orp.gbs + '</td></tr>';
      }
    }
    html += '</tbody></table>';
    return html;
  }

  // Saves-by-quarter (goalies only).
  function savesBlock() {
    var rows = '';
    var any = false;
    for (var pid3 in stat) {
      if (!playerMap[pid3] || playerMap[pid3].position !== 'Goalie') continue;
      var q = stat[pid3].savesQ, tot = stat[pid3].saves;
      any = true;
      rows += '<tr><td><b>' + esc(playerMap[pid3].jersey) + '</b></td>'
        + '<td>' + q.Q1 + '</td><td>' + q.Q2 + '</td><td>' + q.Q3 + '</td><td>' + q.Q4 + '</td>'
        + '<td>' + q.OT1 + '</td><td>' + q.OT2 + '</td><td><b>' + tot + '</b></td></tr>';
    }
    if (!any) rows = '<tr><td colspan="8">&nbsp;</td></tr>';
    return '<table class="saves"><thead><tr><th>#</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th>'
      + '<th>OT1</th><th>OT2</th><th>TOT</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // Generic per-quarter 2-value box (e.g. Cleared/Failed, Scored/Failed, Won/Lost).
  function qBox2(title, c1, c2, qa, qb) {
    var body = '';
    PERIODS.forEach(function(per){
      body += '<tr><td class="qh">' + per + '</td><td>' + qa[per] + '</td><td>' + qb[per] + '</td></tr>';
    });
    body += '<tr class="tot"><td class="qh">TOT</td><td><b>' + sumQ(qa) + '</b></td><td><b>' + sumQ(qb) + '</b></td></tr>';
    return '<div class="box"><div class="box-t">' + title + '</div><table class="qt">'
      + '<thead><tr><th></th><th>' + c1 + '</th><th>' + c2 + '</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  // Single-value per-quarter box (Groundballs, Shots).
  function qBox1(title, qa) {
    var body = '';
    PERIODS.forEach(function(per){ body += '<tr><td class="qh">' + per + '</td><td>' + qa[per] + '</td></tr>'; });
    body += '<tr class="tot"><td class="qh">TOT</td><td><b>' + sumQ(qa) + '</b></td></tr>';
    return '<div class="box"><div class="box-t">' + title + '</div><table class="qt">'
      + '<tbody>' + body + '</tbody></table></div>';
  }

  // Scoring timeline (27 cells, wraps in CSS grid).
  var timelineCells = '';
  var cells = Math.max(28, Math.ceil(goals.length / 14) * 14); // every goal, wrapping to more rows
  for (var t = 0; t < cells; t++) {
    var gl = goals[t];
    timelineCells += '<div class="tl-cell"><div class="tl-n">' + (t+1) + '</div><div class="tl-v">'
      + (gl ? ('<b>#' + esc(gl.scorer) + (gl.assist ? '/' + esc(gl.assist) : '') + '</b><br><span>' + esc(gl.clock) + '</span>') : '&nbsp;')
      + '</div></div>';
  }

  var penaltyRows = penalties.length
    ? penalties.map(function(pen){
        return '<tr><td>' + esc(pen.type).charAt(0) + '</td><td><b>' + esc(pen.player) + '</b></td>'
          + '<td class="left">' + esc(pen.name) + '</td><td>' + esc(pen.period) + '</td><td>' + esc(pen.clock) + '</td></tr>';
      }).join('')
    : '<tr><td colspan="5">No penalties recorded</td></tr>';

  var scoringRows = scorers.length
    ? scorers.map(function(s){
        return '<tr><td><b>' + esc(s.jersey) + '</b></td><td class="left">' + esc(s.name) + '</td>'
          + '<td>' + s.g + '</td><td>' + s.a + '</td><td><b>' + s.pts + '</b></td></tr>';
      }).join('')
    : '<tr><td colspan="5">&nbsp;</td></tr>';

  function finalCell(v){ return '<td>' + v + '</td>'; }
  var finalRow = '<tr><td class="left"><b>US (Tigers)</b></td>'
    + finalCell(tigersGoalQ.Q1) + finalCell(tigersGoalQ.Q2) + finalCell(tigersGoalQ.Q3)
    + finalCell(tigersGoalQ.Q4) + finalCell(otTigers) + '<td class="fin"><b>' + tigersGoals + '</b></td></tr>'
    + '<tr><td class="left">THEM (' + esc(opponent) + ')</td>'
    + finalCell(oppGoalQ.Q1) + finalCell(oppGoalQ.Q2) + finalCell(oppGoalQ.Q3)
    + finalCell(oppGoalQ.Q4) + finalCell(otOpp) + '<td class="fin"><b>' + oppGoals + '</b></td></tr>';

  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
    + '@page { size: letter landscape; margin: 0.3in; }'
    + 'body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color:#000; margin:0; padding:0; }'
    + '.title-bar { background:#000; color:#fff; font-weight:bold; padding:4px; text-align:center; font-size:11pt; letter-spacing:1px; }'
    + '.us { font-style:italic; font-weight:bold; font-size:12pt; margin:4px 0 2px 2px; }'
    + '.meta { display:flex; flex-wrap:wrap; gap:12px; font-size:8pt; font-weight:bold; border-bottom:1.5px solid #000; padding:3px 2px; margin-bottom:4px; }'
    + '.cols { display:flex; gap:6px; align-items:flex-start; }'
    + '.c-left { flex: 2.0; } .c-mid { flex: 1.2; } .c-right { flex: 0.9; }'
    + '.box-t, .section-title { background:#000; color:#fff; font-weight:bold; font-size:8pt; padding:2px 5px; text-align:center; margin-top:5px; }'
    + '.section-title.left { text-align:left; }'
    + 'table { width:100%; border-collapse:collapse; }'
    + 'th,td { border:1px solid #000; padding:1px 3px; text-align:center; font-size:7pt; }'
    + 'th { background:#e6e6e6; font-weight:bold; }'
    + '.left { text-align:left; }'
    + 'table.roster td.pos { writing-mode:vertical-rl; transform:rotate(180deg); background:#f2f2f2; font-weight:bold; font-size:7pt; width:14px; letter-spacing:1px; }'
    + 'table.roster td.num, table.roster th.num { width:22px; }'
    + 'table.roster td.nm { width:40%; }'
    + '.saves td, .saves th { font-size:6.5pt; padding:1px 2px; }'
    + '.box { margin-bottom:3px; } .box table.qt td.qh { background:#f2f2f2; font-weight:bold; width:30px; }'
    + '.box table.qt tr.tot td { background:#eee; }'
    + '.tl { display:grid; grid-template-columns:repeat(14,1fr); gap:0; border:1px solid #000; }'
    + '.tl-cell { border:1px solid #000; min-height:26px; }'
    + '.tl-n { background:#e6e6e6; font-weight:bold; font-size:6.5pt; border-bottom:1px solid #000; }'
    + '.tl-v { font-size:6.5pt; padding:1px; } .tl-v span { color:#444; }'
    + '.final td.fin { background:#dbe5f1; } .final td.left { text-align:left; }'
    + '.footer { display:flex; gap:14px; border:1.5px solid #000; margin-top:6px; padding:3px 5px; font-size:8pt; font-weight:bold; }'
    + '@media print { .no-print { display:none; } }'
    + '</style></head><body>'
    + '<div class="title-bar">FISHERS TIGERS LACROSSE &mdash; OFFICIAL GAME SCORESHEET</div>'
    + '<div class="us">US</div>'
    + '<div class="meta">'
    +   '<div>Date: ' + esc(gameDate) + '</div><div>Opponent: ' + esc(opponent) + '</div>'
    +   '<div>Site: ' + esc(location) + '</div><div>Start: ' + esc(gameStart) + '</div>'
    +   '<div>Weather: ' + esc(weather) + '</div>'
    +   '<div style="margin-left:auto;">Final: <b>' + tigersGoals + ' - ' + oppGoals + '</b></div>'
    + '</div>'

    // Scoring timeline (full width).
    + '<div class="section-title left">PROGRESSIVE SCORING TIMELINE</div>'
    + '<div class="tl">' + timelineCells + '</div>'

    + '<div class="cols">'
    // LEFT: roster + saves.
    +   '<div class="c-left">'
    +     '<div class="section-title left">PLAYER ROSTER &amp; GAME STATS</div>'
    +     rosterBlock()
    +     '<div class="box-t">SAVES BY QUARTER</div>' + savesBlock()
    +   '</div>'
    // MID: penalties, individual scoring, timeouts, final, officials.
    +   '<div class="c-mid">'
    +     '<div class="section-title">PENALTIES / FOULS</div>'
    +     '<table><thead><tr><th style="width:10%;">P/T</th><th style="width:14%;">#</th>'
    +       '<th class="left" style="width:46%;">PENALTY</th><th style="width:16%;">QTR</th><th style="width:14%;">TIME</th></tr></thead>'
    +       '<tbody>' + penaltyRows + '</tbody></table>'
    +     '<div class="section-title">INDIVIDUAL SCORING</div>'
    +     '<table><thead><tr><th style="width:12%;">#</th><th class="left" style="width:52%;">NAME</th>'
    +       '<th style="width:12%;">G</th><th style="width:12%;">A</th><th style="width:12%;">PTS</th></tr></thead>'
    +       '<tbody>' + scoringRows + '</tbody></table>'
    +     '<div class="section-title">TIMEOUTS</div>'
    +     '<table><thead><tr><th>1st HALF</th><th>2nd HALF</th><th>1 OT</th><th>2 OT</th></tr></thead>'
    +       '<tbody><tr><td>' + timeouts.h1 + '</td><td>' + timeouts.h2 + '</td><td>' + timeouts.ot1 + '</td><td>' + timeouts.ot2 + '</td></tr></tbody></table>'
    +     '<div class="section-title">SCORE BY PERIOD</div>'
    +     '<table class="final"><thead><tr><th class="left" style="width:30%;">Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>OT</th><th>FINAL</th></tr></thead>'
    +       '<tbody>' + finalRow + '</tbody></table>'
    +     '<div class="section-title">OFFICIALS &amp; CREW</div>'
    +     '<table><tbody>'
    +       '<tr><td class="left" style="width:40%;"><b>Head Official</b></td><td class="left">' + esc(headOff) + '</td></tr>'
    +       '<tr><td class="left"><b>Umpire</b></td><td class="left">' + esc(umpire) + '</td></tr>'
    +       '<tr><td class="left"><b>Field Judge</b></td><td class="left">' + esc(fieldJudge) + '</td></tr>'
    +       '<tr><td class="left"><b>Opp Scorer</b></td><td class="left">' + esc(oppScorer) + '</td></tr>'
    +     '</tbody></table>'
    +   '</div>'
    // RIGHT: per-quarter stat boxes.
    +   '<div class="c-right">'
    +     qBox1('GROUNDBALLS', gbQ)
    +     qBox1('SHOTS', shotQ)
    +     qBox2('CLEARS', 'Clrd', 'Fail', clearGoodQ, clearFailQ)
    +     qBox2('EXTRA MAN', 'Scrd', 'Fail', emoScoredQ, emoFailQ)
    +     qBox2('FACEOFFS', 'Won', 'Lost', fowQ, folQ)
    +   '</div>'
    + '</div>'

    + '<div class="footer">'
    +   '<div>Date: ' + esc(gameDate) + '</div><div>Site: ' + esc(location) + '</div>'
    +   '<div>Weather: ' + esc(weather) + '</div><div>Game Start: ' + esc(gameStart) + '</div>'
    +   '<div>Scorer: ' + esc(scorer) + '</div><div>Timer: ' + esc(timer) + '</div>'
    + '</div>'

    + '<div class="no-print" style="position:fixed; top:8px; right:8px; background:#fff; padding:6px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border-radius:4px; z-index:1000;">'
    +   '<button onclick="window.print()" style="padding:8px 16px; background:#1a73e8; color:#fff; border:none; border-radius:4px; font-size:9.5pt; cursor:pointer; font-weight:bold;">Print / Save PDF</button>'
    + '</div>'
    + '</body></html>';

  var htmlOutput = HtmlService.createHtmlOutput(html).setWidth(1180).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Fishers Tigers Lacrosse - Scoresheet Preview');
}

// ============================================================
// FAMILY SIGN-IN (stats viewer)
//
// A family signs in with their email: the script emails a 6-digit code, and
// once they type it in they see ONLY their own player's stats. Nothing else
// about other players is ever sent to their device.
//
// Who may sign in is decided by the Viewers tab:
//   Email | Player Name | Jersey | Who | Player_ID | Approved | Status | Notes | Submitted
// Rows come from the sign-up Google Form (copied in by the script) or can be
// typed by hand. The script fills Player_ID by matching the jersey and name to
// the Players tab, and writes Status. Only rows with Approved checked count,
// and at most 2 approved emails per player (a 3rd is unchecked automatically).
// Unchecking Approved cuts that email off at once, even on a signed-in device.
// ============================================================
var VIEWER_HEADERS = ['Email', 'Player Name', 'Jersey', 'Who', 'Player_ID', 'Approved', 'Status', 'Notes', 'Submitted'];
var MAX_VIEWERS_PER_PLAYER = 2;
var CODE_MINUTES = 10;          // a code works this long
var CODE_TRIES = 5;             // wrong guesses allowed per code
var CODES_PER_15_MIN = 3;       // codes one email can ask for in 15 minutes
var SESSION_DAYS = 30;          // a device stays signed in this long
var SESSIONS_PER_EMAIL = 4;     // devices one email can have signed in at once
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normEmail_(e) { return String(e === null || e === undefined ? '' : e).trim().toLowerCase(); }
function normName_(n) { return String(n === null || n === undefined ? '' : n).toLowerCase().replace(/[^a-z]+/g, ' ').trim(); }
function normJersey_(j) { var m = String(j === null || j === undefined ? '' : j).match(/\d+/); return m ? String(parseInt(m[0], 10)) : ''; }

function sha256_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function randomHex_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function randomCode_() {
  var n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000;
  var s = String(n);
  while (s.length < 6) s = '0' + s;
  return s;
}

// The Viewers tab (created with its headers if missing).
function viewersSheet_(ss) {
  var sh = ss.getSheetByName('Viewers');
  if (!sh) {
    sh = ss.insertSheet('Viewers');
    sh.getRange(1, 1, 1, VIEWER_HEADERS.length).setValues([VIEWER_HEADERS]);
    try { sh.setFrozenRows(1); sh.getRange(1, 1, 1, VIEWER_HEADERS.length).setFontWeight('bold'); } catch (e) {}
  }
  return sh;
}

// Reads the Viewers tab as objects (header names in row 1, any column order).
function readViewers_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  var col = {};
  headers.forEach(function(h, i) { if (h) col[h] = i; });
  var rows = [];
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues().forEach(function(r, i) {
      var o = { row: i + 2 };
      VIEWER_HEADERS.forEach(function(h) { o[h] = col.hasOwnProperty(h) ? r[col[h]] : ''; });
      rows.push(o);
    });
  }
  return { headers: headers, col: col, rows: rows };
}

function playersIndex_(ss) {
  var sh = ss.getSheetByName('Players');
  var list = [];
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function(r) {
      var id = String(r[0]).trim();
      if (PLAYER_ID_RE.test(id)) list.push({ id: id, jersey: normJersey_(r[1]), name: normName_(r[2]),
        Name: String(r[2]), Jersey: String(r[1]), Position: String(r[3]) });
    });
  }
  var byId = {};
  list.forEach(function(p) { byId[p.id] = p; });
  return { list: list, byId: byId };
}

// Finds the player a sign-up is for. Jersey + name must agree; if only one of
// them matches a single player, that is used too but flagged for a look.
function matchPlayer_(players, name, jersey) {
  var n = normName_(name), j = normJersey_(jersey);
  var last = n.split(' ').pop();
  function nameOk(p) { return n && (p.name === n || (last && p.name.split(' ').pop() === last)); }
  var byJ = players.list.filter(function(p) { return j && p.jersey === j; });
  var both = byJ.filter(nameOk);
  if (both.length === 1) return { id: both[0].id, sure: true };
  var byN = players.list.filter(function(p) { return n && p.name === n; });
  if (byN.length === 1) return { id: byN[0].id, sure: false, why: 'matched by name only - jersey #' + (j || '?') + ' did not match' };
  if (byJ.length === 1 && !n) return { id: byJ[0].id, sure: false, why: 'matched by jersey only' };
  return null;
}

// Works out every row's status. Pure: used both to update the tab and, without
// writing anything, to decide who may sign in.
function evaluateViewers_(rows, players) {
  var approvedCount = {};
  return rows.map(function(r) {
    var email = normEmail_(r.Email);
    var pid = String(r.Player_ID || '').trim();
    var approved = r.Approved === true || String(r.Approved).toUpperCase() === 'TRUE';
    var out = { row: r.row, email: email, pid: pid, approved: approved, active: false, uncheck: false, status: '' };
    if (!email && !pid && !String(r['Player Name']).trim()) { out.status = ''; return out; }
    if (!EMAIL_RE.test(email)) { out.status = 'Check the email address'; return out; }
    if (!players.byId[pid]) {
      out.status = 'Check the player: no match for ' + (r.Jersey ? '#' + r.Jersey + ' ' : '') + String(r['Player Name'] || '').trim() +
        '. Fix Player Name/Jersey, or type the Player_ID (P###).';
      return out;
    }
    if (!approved) { out.status = 'Waiting for approval'; return out; }
    approvedCount[pid] = approvedCount[pid] || {};
    if (!approvedCount[pid][email] && Object.keys(approvedCount[pid]).length >= MAX_VIEWERS_PER_PLAYER) {
      out.uncheck = true; out.approved = false;
      out.status = 'Not approved: ' + players.byId[pid].Name + ' already has ' + MAX_VIEWERS_PER_PLAYER + ' approved emails';
      return out;
    }
    approvedCount[pid][email] = true;
    out.active = true;
    out.status = 'Active - can sign in';
    return out;
  });
}

// Fills missing Player_IDs and rewrites the Status column (and unchecks any
// approval past the per-player limit). Runs when the Viewers tab is edited,
// after new sign-ups are copied in, and when the Sheet is opened.
function refreshViewers_(ss) {
  var sh = viewersSheet_(ss);
  var v = readViewers_(sh);
  if (!v.rows.length || !v.col.hasOwnProperty('Player_ID') || !v.col.hasOwnProperty('Status')) return 0;
  var players = playersIndex_(ss);
  var notes = {};
  v.rows.forEach(function(r) {
    if (!players.byId[String(r.Player_ID || '').trim()]) {
      var m = matchPlayer_(players, r['Player Name'], r.Jersey);
      if (m) r.Player_ID = m.id;
    }
    var p = players.byId[String(r.Player_ID || '').trim()];
    if (p) { // say so when the sign-up's jersey or name doesn't fit the player it's linked to
      var j = normJersey_(r.Jersey), n = normName_(r['Player Name']);
      var lastOk = n && p.name.split(' ').pop() === n.split(' ').pop();
      if (j && j !== p.jersey) notes[r.row] = 'form said #' + j + ', ' + p.Name + ' is #' + p.jersey;
      else if (n && !lastOk) notes[r.row] = 'form said ' + String(r['Player Name']).trim() + ', linked to ' + p.Name;
    }
  });
  var ev = evaluateViewers_(v.rows, players);
  var n = v.rows.length;
  var pidCol = [], stCol = [], apCol = [];
  ev.forEach(function(e, i) {
    pidCol.push([v.rows[i].Player_ID || '']);
    stCol.push([e.status + (notes[e.row] && e.status ? ' (' + notes[e.row] + ')' : '')]);
    apCol.push([e.uncheck ? false : v.rows[i].Approved]);
  });
  sh.getRange(2, v.col.Player_ID + 1, n, 1).setValues(pidCol);
  sh.getRange(2, v.col.Status + 1, n, 1).setValues(stCol);
  if (v.col.hasOwnProperty('Approved')) {
    var apRange = sh.getRange(2, v.col.Approved + 1, n, 1);
    if (ev.some(function(e) { return e.uncheck; })) apRange.setValues(apCol);
    try { apRange.insertCheckboxes(); } catch (e) {}
  }
  return n;
}

// Copies new answers from the sign-up Google Form (its "Form Responses" tab)
// into Viewers, unapproved. Each copied answer is marked in a "Copied" column
// on the form tab, so deleting a row from Viewers does not bring it back.
// The form's questions are found by words in their titles: email, name,
// jersey, and "player or parent".
function syncFormResponses_(ss) {
  var sheets = ss.getSheets ? ss.getSheets() : [];
  var added = 0;
  sheets.forEach(function(fs) {
    if (!/^Form Responses/i.test(fs.getName()) || fs.getLastRow() < 2) return;
    var lastCol = fs.getLastColumn();
    var heads = fs.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    var copiedCol = heads.indexOf('Copied');
    if (copiedCol < 0) { copiedCol = lastCol; fs.getRange(1, copiedCol + 1).setValues([['Copied']]); }
    function find(test) { for (var i = 0; i < heads.length; i++) if (i !== copiedCol && test(heads[i].toLowerCase())) return i; return -1; }
    var cEmail = find(function(h) { return h.indexOf('email') >= 0; });
    var cJersey = find(function(h) { return h.indexOf('jersey') >= 0 || h.indexOf('number') >= 0; });
    var cWho = find(function(h) { return h.indexOf('parent') >= 0 || h.indexOf('who') >= 0 || h.indexOf('relationship') >= 0; });
    var cName = -1;
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i].toLowerCase();
      if (i !== copiedCol && i !== cEmail && i !== cJersey && i !== cWho && h.indexOf('name') >= 0) { cName = i; break; }
    }
    var cTime = find(function(h) { return h.indexOf('timestamp') >= 0; });
    if (cEmail < 0) return;
    var n = fs.getLastRow() - 1;
    var data = fs.getRange(2, 1, n, Math.max(lastCol, copiedCol + 1)).getValues();
    var sh = viewersSheet_(ss);
    var v = readViewers_(sh);
    var marks = [], newRows = [];
    data.forEach(function(r) {
      var done = String(r[copiedCol] || '').trim() !== '';
      if (!done && normEmail_(r[cEmail])) {
        var row = {};
        row.Email = normEmail_(r[cEmail]);
        row['Player Name'] = cName >= 0 ? String(r[cName]).trim() : '';
        row.Jersey = cJersey >= 0 ? normJersey_(r[cJersey]) : '';
        row.Who = cWho >= 0 ? String(r[cWho]).trim() : '';
        row.Submitted = cTime >= 0 ? r[cTime] : new Date();
        row.Approved = false;
        newRows.push(row);
        done = true;
      }
      marks.push([done ? 'Yes' : '']);
    });
    if (newRows.length) {
      var width = v.headers.length;
      var start = sh.getLastRow() + 1;
      ensureRows_(sh, start + newRows.length - 1);
      sh.getRange(start, 1, newRows.length, width).setValues(newRows.map(function(o) {
        return v.headers.map(function(h) { return o.hasOwnProperty(h) ? o[h] : ''; });
      }));
      added += newRows.length;
    }
    fs.getRange(2, copiedCol + 1, n, 1).setValues(marks);
  });
  if (added) refreshViewers_(ss);
  return added;
}

// Player_IDs this email may see right now ([] if none).
function playersForEmail_(ss, email) {
  email = normEmail_(email);
  if (!email) return [];
  var sh = ss.getSheetByName('Viewers');
  if (!sh) return [];
  var players = playersIndex_(ss);
  var ids = [];
  evaluateViewers_(readViewers_(sh).rows, players).forEach(function(e) {
    if (e.active && e.email === email && ids.indexOf(e.pid) < 0) ids.push(e.pid);
  });
  return ids;
}

// ---- sign-in steps (called from routePost_; no PIN involved) ----

// Step 1: email a code. The reply is the same whether or not the email is
// approved, so the page can't be used to find out who is on the list.
function requestCode_(payload) {
  var email = normEmail_(payload.email);
  var sent = { success: true, message: 'If that email is approved, a code is on its way.' };
  if (!EMAIL_RE.test(email)) return { success: false, error: 'BAD_EMAIL', message: 'Please enter a valid email address.' };
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = book_();
    try { syncFormResponses_(ss); } catch (e) {}
    var rateKey = 'R_' + sha256_(email);
    var count = parseInt(cache.get(rateKey) || '0', 10);
    if (count >= CODES_PER_15_MIN) {
      return { success: false, error: 'TOO_MANY', message: 'Too many codes asked for. Wait 15 minutes, then try again.' };
    }
    if (!playersForEmail_(ss, email).length) return sent;
    if (MailApp.getRemainingDailyQuota() < 1) {
      return { success: false, error: 'MAIL_LIMIT', message: 'Sign-in emails are paused for today. Please try again tomorrow.' };
    }
    var code = randomCode_();
    cache.put('C_' + sha256_(email), JSON.stringify({ h: sha256_(email + '|' + code), n: 0 }), CODE_MINUTES * 60);
    cache.put(rateKey, String(count + 1), 15 * 60);
    MailApp.sendEmail(email, 'Fishers Tigers stats sign-in code: ' + code,
      'Your sign-in code for the Fishers Tigers Lacrosse stats viewer is:\n\n    ' + code + '\n\n' +
      'It works for ' + CODE_MINUTES + ' minutes. If you didn\'t ask for this, you can ignore this email.\n\n' +
      '- Fishers Tigers Lacrosse', { name: 'Fishers Tigers Lacrosse' });
    return sent;
  } finally {
    lock.releaseLock();
  }
}

// Step 2: check the code and hand back a sign-in token for this device.
// Only a fingerprint (hash) of the token is kept in the script.
function verifyCode_(payload) {
  var email = normEmail_(payload.email);
  var code = String(payload.code || '').replace(/\D/g, '');
  var wrong = { success: false, error: 'BAD_CODE', message: 'That code is not right or has expired. Check it, or ask for a new code.' };
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var key = 'C_' + sha256_(email);
    var rec = cache.get(key);
    if (!rec) return wrong;
    rec = JSON.parse(rec);
    if (rec.h !== sha256_(email + '|' + code)) {
      rec.n++;
      if (rec.n >= CODE_TRIES) cache.remove(key); else cache.put(key, JSON.stringify(rec), CODE_MINUTES * 60);
      return wrong;
    }
    cache.remove(key);
    var ss = book_();
    if (!playersForEmail_(ss, email).length) return { success: false, error: 'NOT_APPROVED', message: 'This email is not approved to view stats.' };
    var token = randomHex_();
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var now = Date.now(), mine = [];
    Object.keys(all).forEach(function(k) {
      if (k.indexOf('S_') !== 0) return;
      var s; try { s = JSON.parse(all[k]); } catch (e) { s = null; }
      if (!s || s.x < now) { props.deleteProperty(k); return; }
      if (s.e === email) mine.push({ k: k, x: s.x });
    });
    mine.sort(function(a, b) { return a.x - b.x; });
    while (mine.length >= SESSIONS_PER_EMAIL) props.deleteProperty(mine.shift().k);
    props.setProperty('S_' + sha256_(token), JSON.stringify({ e: email, x: now + SESSION_DAYS * 86400000 }));
    return { success: true, token: token, email: email };
  } finally {
    lock.releaseLock();
  }
}

// The email a token belongs to, or '' if it is unknown or expired.
function sessionEmail_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return '';
  var raw = PropertiesService.getScriptProperties().getProperty('S_' + sha256_(token));
  if (!raw) return '';
  var s; try { s = JSON.parse(raw); } catch (e) { return ''; }
  return (s && s.x > Date.now()) ? s.e : '';
}

function signOut_(payload) {
  var token = String(payload.token || '');
  if (/^[0-9a-f]{64}$/.test(token)) PropertiesService.getScriptProperties().deleteProperty('S_' + sha256_(token));
  return { success: true };
}

var SEASON_KEYS = ['GP', 'G', 'A', 'Pts', 'S', 'SOG', 'Shooting %', 'GB', 'CT', 'TO', 'FW', 'FL', 'FO Win %',
  'PEN', 'Pen Min', 'SV', 'GA', 'Save %', 'INT'];

// Step 3: the signed-in family's stats - their own player(s) only.
// Other players' IDs are blanked out of the plays (e.g. who scored a goal
// their player assisted), so no one else's data leaves the script.
function myStats_(payload) {
  var email = sessionEmail_(payload.token);
  if (!email) return { success: false, error: 'NOT_SIGNED_IN', message: 'Please sign in again.' };
  var ss = book_();
  var ids = playersForEmail_(ss, email);
  if (!ids.length) return { success: false, error: 'NOT_APPROVED', message: 'This email is no longer approved to view stats.' };
  var mine = {};
  ids.forEach(function(id) { mine[id] = true; });
  var pi = playersIndex_(ss);
  var players = ids.map(function(id) { var p = pi.byId[id]; return { Player_ID: id, Name: p.Name, Jersey: p.Jersey, Position: p.Position }; });

  var all = getEvents_('');
  var events = [];
  (all.events || []).forEach(function(e) {
    var p = mine[e.Primary_Player_ID], s = mine[e.Secondary_Player_ID];
    if (!p && !s) return;
    events.push({ Timestamp: e.Timestamp, Game_ID: e.Game_ID, Period: e.Period, Action_Type: e.Action_Type,
      Primary_Player_ID: p ? e.Primary_Player_ID : '', Secondary_Player_ID: s ? e.Secondary_Player_ID : '',
      Pen_Duration: e.Pen_Duration, Game_Clock: e.Game_Clock, Penalty_Type: e.Penalty_Type,
      Penalty_Name: e.Penalty_Name, Zone_ID: e.Zone_ID });
  });

  var season = {};
  var st = ss.getSheetByName('Season Totals');
  if (st && st.getLastRow() >= 2) {
    var vals = st.getDataRange().getValues();
    var h = vals[0].map(String);
    var idCol = h.indexOf('Player_ID');
    vals.slice(1).forEach(function(r) {
      var id = String(r[idCol]).trim();
      if (!mine[id]) return;
      var o = {};
      SEASON_KEYS.forEach(function(k) { var i = h.indexOf(k); o[k] = i >= 0 ? r[i] : ''; });
      season[id] = o;
    });
  }
  var games = (getGames_().games || []).map(function(g) {
    return { Game_ID: g.Game_ID, Date: g.Date, Opponent: g.Opponent, Location: g.Location, Score: g.Score, Game_Label: g.Game_Label };
  });
  return { success: true, email: email, players: players, games: games, events: events, season: season };
}

// Lacrosse Tools > Set up family sign-in. Run once: makes the Viewers tab and
// asks Google for permission to send the code emails (a test email goes to
// you). Safe to run again.
function setupFamilySignIn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || book_();
  viewersSheet_(ss);
  var added = syncFormResponses_(ss);
  refreshViewers_(ss);
  var me = Session.getEffectiveUser().getEmail();
  var left = MailApp.getRemainingDailyQuota();
  MailApp.sendEmail(me, 'Fishers Tigers stats: family sign-in is set up',
    'This test email shows the scorebook script can send sign-in codes.\n\n' +
    'Emails left today: ' + left + '.', { name: 'Fishers Tigers Lacrosse' });
  SpreadsheetApp.getUi().alert('Family sign-in is set up.\n\n' +
    'The Viewers tab is ready' + (added ? ' (' + added + ' new sign-up' + (added === 1 ? '' : 's') + ' copied in)' : '') + '.\n' +
    'A test email was sent to ' + me + '.');
}

// Lacrosse Tools > Check for new sign-ups.
function checkNewSignUps() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var added = syncFormResponses_(ss);
  refreshViewers_(ss);
  SpreadsheetApp.getUi().alert(added ? added + ' new sign-up' + (added === 1 ? '' : 's') + ' added to the Viewers tab. Check Approved to let them in.'
    : 'No new sign-ups.');
}


// ============================================================
// BACKUPS (a file in Google Drive for every saved game)
//
// Every time a game is saved, the exact upload (the same data the app sent,
// without the PIN) is written to Drive:
//   My Drive / Lacrosse Scorebook Backups / <workbook name> / <year> /
//     2026-04-15 vs Carmel [G1713200000000].json
// Re-saving a game updates its file. Lacrosse Tools has:
//   - Back up all games now:  writes a file for every game already in the workbook
//   - Restore a game...:      puts one game back from its file
//   - Restore a season...:    rebuilds a whole season from its files, one by one
// Before any restore, a copy of the whole workbook is saved to
// ".../<workbook name>/Workbook copies", so a restore can always be undone.
// The History screen in the app can also save the same file on the device
// ("Save game file"); drop such a file into the year folder to restore it.
// ============================================================
var BACKUP_ROOT = 'Lacrosse Scorebook Backups';

function isoDate_(d) {
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : String(d || '');
}

// This workbook's backup folder (or one season's folder inside it).
// Remembered per workbook, so a TEST copy never mixes into the team's backups.
function backupFolder_(ss, year) {
  var props = PropertiesService.getScriptProperties();
  var key = 'BACKUP_FOLDER_' + ss.getId();
  var folder = null;
  var id = props.getProperty(key);
  if (id) {
    try { folder = DriveApp.getFolderById(id); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; }
  }
  if (!folder) {
    var roots = DriveApp.getFoldersByName(BACKUP_ROOT);
    var root = roots.hasNext() ? roots.next() : DriveApp.createFolder(BACKUP_ROOT);
    folder = root.createFolder(ss.getName());
    props.setProperty(key, folder.getId());
  }
  if (!year) return folder;
  var ys = folder.getFoldersByName(String(year));
  return ys.hasNext() ? ys.next() : folder.createFolder(String(year));
}

function backupFileName_(g) {
  var name = isoDate_(g.Date) + ' ' + (g.Location === 'Away' ? 'at' : 'vs') + ' ' + String(g.Opponent || 'Opponent') +
    ' [' + g.Game_ID + '].json';
  return name.replace(/[\/\\:*?"<>|]+/g, '-');
}

// Writes (or updates) the backup file for one game. Returns the Drive file.
function backupGame_(ss, gameData) {
  var g = gameData.game;
  var date = isoDate_(g.Date);
  var year = /^\d{4}/.test(date) ? date.slice(0, 4) : 'Undated';
  var folder = backupFolder_(ss, year);
  var content = JSON.stringify({
    kind: 'lax-scorebook-game', backupVersion: 1, savedAt: new Date().toISOString(),
    scriptVersion: SCRIPT_VERSION, workbook: ss.getName(),
    gameData: { game: gameData.game, events: gameData.events || [] }
  }, null, 1);
  var name = backupFileName_(g);
  var tag = '[' + g.Game_ID + ']';
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf(tag) >= 0) {
      f.setContent(content);
      if (f.getName() !== name) f.setName(name);
      return f;
    }
  }
  return folder.createFile(name, content, 'application/json');
}

// One game as it is in the workbook right now (same shape as an upload).
var GAME_FIELDS = ['Game_ID', 'Date', 'Opponent', 'Location', 'Score', 'Game_Label', 'Weather_Temp', 'Weather_Cond',
  'Game_Start', 'Head_Official', 'Umpire', 'Field_Judge', 'Tigers_Scorer', 'Tigers_Timer', 'Opp_Scorer'];
function gamesInWorkbook_(ss) {
  var sh = ss.getSheetByName('Games');
  var out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  var tz = Session.getScriptTimeZone();
  sh.getRange(2, 1, sh.getLastRow() - 1, GAME_FIELDS.length).getValues().forEach(function(r, i) {
    if (!String(r[0]).trim()) return;
    var g = { row: i + 2 };
    GAME_FIELDS.forEach(function(f, k) {
      var v = r[k];
      if (f === 'Date') v = isoDate_(v);
      else if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'HH:mm');
      g[f] = v === null || v === undefined ? '' : String(v);
    });
    delete g.Game_Label;
    out.push(g);
  });
  return out;
}

// Lacrosse Tools > Back up all games now
function backupAllGames() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var games = gamesInWorkbook_(ss);
  var all = getEvents_('', ss).events || [];
  var n = 0;
  games.forEach(function(g) {
    var row = g.row; delete g.row;
    backupGame_(ss, { game: g, events: all.filter(function(e) { return e.Game_ID === g.Game_ID; }) });
    n++;
  });
  SpreadsheetApp.getUi().alert('Backed up ' + n + ' game' + (n === 1 ? '' : 's') + '.\n\nThe files are in Google Drive:\n' +
    BACKUP_ROOT + ' / ' + ss.getName());
}

// Every backup file for this workbook: [{ file, name, year, gameId, date }], oldest first.
function listBackups_(ss) {
  var out = [];
  var years = backupFolder_(ss).getFolders();
  while (years.hasNext()) {
    var y = years.next();
    if (!/^(\d{4}|Undated)$/.test(y.getName())) continue;
    var files = y.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var m = f.getName().match(/\[([^\]]+)\]\.json$/);
      if (m) out.push({ file: f, name: f.getName().replace(/ \[[^\]]+\]\.json$/, ''), year: y.getName(), gameId: m[1] });
    }
  }
  out.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  return out;
}

function readBackup_(file) {
  var d = JSON.parse(file.getBlob().getDataAsString());
  if (!d || d.kind !== 'lax-scorebook-game' || !d.gameData || !d.gameData.game || !d.gameData.game.Game_ID) {
    throw new Error(file.getName() + ' is not a scorebook game file.');
  }
  return d;
}

// Saves a copy of the whole workbook before a restore. Returns the copy's name.
function safetyCopy_(ss, why) {
  var parent = backupFolder_(ss);
  var it = parent.getFoldersByName('Workbook copies');
  var folder = it.hasNext() ? it.next() : parent.createFolder('Workbook copies');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var name = ss.getName() + ' - before ' + why + ' ' + stamp;
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  return name;
}

// Removes these games (Events + Games rows) from the workbook.
function removeGames_(ss, ids) {
  var set = {};
  ids.forEach(function(id) { set[String(id)] = true; });
  [['Events', 2], ['Games', 1]].forEach(function(t) {
    var sh = ss.getSheetByName(t[0]);
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getRange(2, t[1], sh.getLastRow() - 1, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (!set[String(vals[i][0])]) continue;
      var end = i;
      while (i - 1 >= 0 && set[String(vals[i - 1][0])]) i--;
      sh.deleteRows(i + 2, end - i + 1);
    }
  });
}

// Puts games back from backup files, then rebuilds the stats once.
function importBackups_(ss, items) {
  items.forEach(function(d) {
    var g = d.gameData.game, ev = d.gameData.events || [];
    writeEvents_(ss, String(g.Game_ID), ev);
    writeGameRow_(ss, g);
  });
  rebuildGameLog_(ss);
  rebuildSeasonTotals_(ss);
  rebuildMaxPreps_(ss);
  SpreadsheetApp.flush();
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('A game is being saved right now. Try again in a minute.');
    return;
  }
  try { fn(); } finally { lock.releaseLock(); }
}

// Lacrosse Tools > Restore a game...
function restoreGame() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var list = listBackups_(ss);
  if (!list.length) { ui.alert('There are no backup files yet. Use Lacrosse Tools > Back up all games now first.'); return; }
  var lines = list.map(function(b, i) { return (i + 1) + '.  ' + b.name; }).join('\n');
  var r = ui.prompt('Restore a game', 'Backup files:\n\n' + lines + '\n\nType the number of the game to restore:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var n = parseInt(String(r.getResponseText()).trim(), 10);
  if (!(n >= 1 && n <= list.length)) { ui.alert('"' + r.getResponseText() + '" is not a number from the list. Nothing was changed.'); return; }
  var pick = list[n - 1];
  var d;
  try { d = readBackup_(pick.file); } catch (e) { ui.alert('That file could not be read: ' + e.message + '\nNothing was changed.'); return; }
  var ok = ui.alert('Restore ' + pick.name + '?',
    'This replaces that game in the workbook with the backup saved ' + String(d.savedAt).slice(0, 16).replace('T', ' ') +
    ' UTC (' + (d.gameData.events || []).length + ' plays).\n\nA copy of the whole workbook is saved first, so this can be undone.',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  withLock_(function() {
    var copy = safetyCopy_(ss, 'restoring ' + pick.name);
    importBackups_(ss, [d]);
    ui.alert('Restored ' + pick.name + '.\n\nThe workbook as it was before is saved as "' + copy + '" in ' +
      BACKUP_ROOT + ' / ' + ss.getName() + ' / Workbook copies.');
  });
}

// Lacrosse Tools > Restore a season...
function restoreSeason() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var list = listBackups_(ss);
  var years = [];
  list.forEach(function(b) { if (years.indexOf(b.year) < 0) years.push(b.year); });
  if (!years.length) { ui.alert('There are no backup files yet. Use Lacrosse Tools > Back up all games now first.'); return; }
  var r = ui.prompt('Restore a season', 'Seasons with backup files: ' + years.join(', ') + '\n\nType the season (year) to rebuild:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var year = String(r.getResponseText()).trim();
  if (years.indexOf(year) < 0) { ui.alert('There are no backup files for "' + year + '". Nothing was changed.'); return; }
  var files = list.filter(function(b) { return b.year === year; });
  var data = [];
  for (var i = 0; i < files.length; i++) {
    try { data.push(readBackup_(files[i].file)); }
    catch (e) { ui.alert('This file could not be read, so nothing was changed:\n' + files[i].name + '\n' + e.message); return; }
  }
  var inBook = gamesInWorkbook_(ss).filter(function(g) { return String(g.Date).slice(0, 4) === year || (year === 'Undated' && !/^\d{4}/.test(g.Date)); });
  var backedUp = {};
  files.forEach(function(b) { backedUp[b.gameId] = true; });
  var noBackup = inBook.filter(function(g) { return !backedUp[g.Game_ID]; });
  var msg = 'This rebuilds the ' + year + ' season from its ' + files.length + ' backup file' + (files.length === 1 ? '' : 's') + ':\n' +
    '- the ' + inBook.length + ' game' + (inBook.length === 1 ? '' : 's') + ' from ' + year + ' now in the workbook are removed\n' +
    '- then each backup file is loaded, one at a time\n' +
    '- then Game Log, Season Totals and MaxPreps are rebuilt\n';
  if (noBackup.length) {
    msg += '\nWARNING: ' + noBackup.length + ' game(s) in the workbook have NO backup file and would be lost:\n' +
      noBackup.map(function(g) { return '   ' + g.Date + ' ' + g.Opponent; }).join('\n') +
      '\n(Choose No, run "Back up all games now", then try again.)\n';
  }
  msg += '\nA copy of the whole workbook is saved first, so this can be undone. Continue?';
  if (ui.alert('Restore the ' + year + ' season?', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  withLock_(function() {
    var copy = safetyCopy_(ss, 'restoring ' + year + ' season');
    removeGames_(ss, inBook.map(function(g) { return g.Game_ID; }));
    importBackups_(ss, data);
    ui.alert('The ' + year + ' season was rebuilt from ' + data.length + ' backup file' + (data.length === 1 ? '' : 's') + '.\n\n' +
      'The workbook as it was before is saved as "' + copy + '" in ' + BACKUP_ROOT + ' / ' + ss.getName() + ' / Workbook copies.');
  });
}

// ============================================================
// TEST COPY
// A copy of the workbook (File > Make a copy, name starting with "TEST") with
// its own web app, for trying things out. The app's Test mode sends games
// there. Run Lacrosse Tools > Make this the TEST copy IN THE COPY before
// deploying it: that points its script at the copy (never the live Sheet),
// clears the families' emails out of the copy, and turns family sign-in off.
// ============================================================
function makeTestCopy() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getId() === SHEET_ID) {
    ui.alert('This is the live team workbook, so it can\'t be made the TEST copy.\n\n' +
      'Use File > Make a copy, name the copy so it starts with TEST, open the copy, and run this there.');
    return;
  }
  if (!/^test/i.test(ss.getName())) {
    ui.alert('Rename this copy so its name starts with TEST (for example "TEST - Tigers Lacrosse"), then run this again.');
    return;
  }
  var ok = ui.alert('Make this the TEST copy?',
    'This workbook ("' + ss.getName() + '") becomes the TEST copy:\n' +
    '- its script writes only to this workbook, never the team\'s\n' +
    '- the Viewers tab and sign-up form answers are cleared (no family emails in the copy)\n' +
    '- family sign-in is turned off here\n\nContinue?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  props.setProperty('IS_TEST', '1');
  var all = props.getProperties();
  Object.keys(all).forEach(function(k) { if (k.indexOf('S_') === 0 || k.indexOf('BACKUP_FOLDER_') === 0) props.deleteProperty(k); });
  ss.getSheets().forEach(function(sh) {
    if ((sh.getName() === 'Viewers' || /^Form Responses/i.test(sh.getName())) && sh.getLastRow() >= 2) {
      sh.deleteRows(2, sh.getLastRow() - 1);
    }
  });
  ui.alert('Done. This is now the TEST copy.\n\nNext: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), ' +
    'copy its web app URL, and paste it into the scorebook: Settings > Test mode > TEST script link.\n\n' +
    'Check its PIN under Project Settings > Script Properties > WRITE_PIN.');
}

// Lacrosse Tools > Clear all games (TEST copy only)
function clearTestGames() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!isTest_() || ss.getId() === SHEET_ID || PropertiesService.getScriptProperties().getProperty('SHEET_ID') !== ss.getId()) {
    ui.alert('This only works in the TEST copy. Nothing was changed.');
    return;
  }
  if (ui.alert('Clear all games?', 'Remove every game from this TEST copy (Events, Games, Game Log, Season Totals, MaxPreps)?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  withLock_(function() {
    removeGames_(ss, gamesInWorkbook_(ss).map(function(g) { return g.Game_ID; }).concat(
      (getEvents_('', ss).events || []).map(function(e) { return e.Game_ID; })));
    rebuildGameLog_(ss);
    rebuildSeasonTotals_(ss);
    rebuildMaxPreps_(ss);
    ui.alert('All games were cleared from the TEST copy.');
  });
}
