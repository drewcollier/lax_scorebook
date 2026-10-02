/**
 * Fishers Tigers Lacrosse Scorebook - Google Apps Script
 * Complete, corrected version.
 *
 * Deploy as Web App:
 *   - Execute as: Me
 *   - Who has access: Anyone
 *
 * Sheet ID: 18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64
 * Tabs used: Players, Officials, Games, Events, Game Log, Scoresheet Template
 */

var SHEET_ID = '18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64';

// ============================================================
// WEB APP ENTRY POINTS
// ============================================================

function doGet(e) {
  var action = e.parameter.action || '';
  var callback = e.parameter.callback || '';

  if (action === 'getRoster') {
    return handleGetRoster(callback);
  }
  if (action === 'getOfficials') {
    return handleGetOfficials(callback);
  }
  if (action === 'getGames') {
    return handleGetGames(callback);
  }
  if (action === 'getEvents') {
    return handleGetEvents(callback, e.parameter.gameId || '');
  }

  var output = ContentService.createTextOutput('Fishers Tigers Lacrosse Scorebook - Apps Script Active');
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
}

function doPost(e) {
  var payload;
  try {
    if (e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      var contents = e.postData.contents;
      if (contents.indexOf('payload=') === 0) {
        var decoded = decodeURIComponent(contents.substring(8));
        payload = JSON.parse(decoded);
      } else {
        payload = JSON.parse(contents);
      }
    } else {
      return buildResponse({ success: false, error: 'No payload received' });
    }
  } catch (err) {
    return buildResponse({ success: false, error: 'Failed to parse payload: ' + err.message });
  }

  if (payload.test === true) {
    return buildResponse({ success: true, message: 'Connection successful! Scorebook is linked.' });
  }
  if (payload.action === 'exportGame') {
    return handleExportGame(payload.gameData);
  }
  return buildResponse({ success: false, error: 'Unknown action' });
}

// ============================================================
// ROSTER PULL (JSONP)
// ============================================================

function handleGetRoster(callback) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Players');
  if (!sheet) {
    return ContentService.createTextOutput(callback + '({"error":"Players tab not found"})')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

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
      isStarter: row[4] === true || row[4] === 'TRUE' || row[4] === 'true' || row[4] === 1
    });
  }

  var json = JSON.stringify({ success: true, players: players });
  return ContentService.createTextOutput(callback + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ============================================================
// OFFICIALS PULL (JSONP) - top-level function
// ============================================================

function handleGetOfficials(callback) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Officials');
  if (!sheet) {
    return ContentService.createTextOutput(callback + '({"success":false,"error":"Officials tab not found"})')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  var data = sheet.getDataRange().getValues();
  var officials = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0] && !data[i][1]) continue;
    officials.push({ Role: String(data[i][0]), Name: String(data[i][1]) });
  }
  var json = JSON.stringify({ success: true, officials: officials });
  return ContentService.createTextOutput(callback + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ============================================================
// READ ENDPOINTS FOR THE READ-ONLY VIEWER APP
// ============================================================

// Returns the list of games (newest first) so the viewer can populate a picker.
function handleGetGames(callback) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Games');
  if (!sheet) {
    return ContentService.createTextOutput(callback + '({"success":false,"error":"Games tab not found"})')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
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
  var json = JSON.stringify({ success: true, games: games });
  return ContentService.createTextOutput(callback + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// Returns all Event rows for one Game_ID (or all events if gameId is blank).
function handleGetEvents(callback, gameId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Events');
  if (!sheet) {
    return ContentService.createTextOutput(callback + '({"success":false,"error":"Events tab not found"})')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
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
  var json = JSON.stringify({ success: true, events: events });
  return ContentService.createTextOutput(callback + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ============================================================
// GAME EXPORT (events + game meta)
// ============================================================

function handleExportGame(gameData) {
  if (!gameData) {
    return buildResponse({ success: false, error: 'No gameData provided' });
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var eventsWritten = 0;
  var gameWritten = false;

  try {
    // --- Events ---
    if (gameData.events && gameData.events.length > 0) {
      var eventsSheet = ss.getSheetByName('Events');
      if (!eventsSheet) {
        eventsSheet = ss.insertSheet('Events');
        eventsSheet.appendRow(['Timestamp', 'Game_ID', 'Period', 'Action_Type', 'Primary_Player_ID', 'Secondary_Player_ID', 'Strength', 'Pen_Duration', 'Game_Clock', 'Penalty_Type', 'Penalty_Name', 'Zone_ID']);
      }

      var eventRows = [];
      for (var i = 0; i < gameData.events.length; i++) {
        var evt = gameData.events[i];
        eventRows.push([
          evt.Timestamp || '',
          evt.Game_ID || '',
          evt.Period || '',
          evt.Action_Type || '',
          evt.Primary_Player_ID || '',
          evt.Secondary_Player_ID || '',
          evt.Strength || '',
          evt.Pen_Duration || '',
          evt.Game_Clock || '',
          evt.Penalty_Type || '',
          evt.Penalty_Name || '',
          evt.Zone_ID || ''
        ]);
      }

      var lastRow = eventsSheet.getLastRow();
      eventsSheet.getRange(lastRow + 1, 1, eventRows.length, 12).setValues(eventRows);
      eventsWritten = eventRows.length;
    }

    // --- Games (A-E identity/score, skip F=Game_Label formula, G-O meta) ---
    if (gameData.game) {
      var gamesSheet = ss.getSheetByName('Games');
      if (!gamesSheet) {
        gamesSheet = ss.insertSheet('Games');
        gamesSheet.appendRow(['Game_ID', 'Date', 'Opponent', 'Location', 'Score', 'Game_Label',
          'Weather_Temp', 'Weather_Cond', 'Game_Start', 'Head_Official', 'Umpire', 'Field_Judge',
          'Tigers_Scorer', 'Tigers_Timer', 'Opp_Scorer']);
      }

      var g = gameData.game;
      var newRow = gamesSheet.getLastRow() + 1;
      // A-E: identity + score. Column F (Game_Label) is a formula - do NOT touch it.
      gamesSheet.getRange(newRow, 1, 1, 5).setValues([[
        g.Game_ID || '',
        g.Date || '',
        g.Opponent || '',
        g.Location || '',
        g.Score || ''
      ]]);
      // G-O: 9 meta columns, leaving F untouched.
      gamesSheet.getRange(newRow, 7, 1, 9).setValues([[
        g.Weather_Temp || '',
        g.Weather_Cond || '',
        g.Game_Start || '',
        g.Head_Official || '',
        g.Umpire || '',
        g.Field_Judge || '',
        g.Tigers_Scorer || '',
        g.Tigers_Timer || '',
        g.Opp_Scorer || ''
      ]]);
      gameWritten = true;
    }

    return buildResponse({
      success: true,
      message: 'Game exported successfully!',
      eventsWritten: eventsWritten,
      gameWritten: gameWritten
    });

  } catch (err) {
    return buildResponse({ success: false, error: 'Export failed: ' + err.message });
  }
}

function buildResponse(data) {
  var jsonString = JSON.stringify(data);
  var html = '<!DOCTYPE html><html><head><title>Response</title></head><body>'
    + '<script>'
    + 'var data = ' + jsonString + ';'
    + 'if (window.parent && window.parent !== window) {'
    + '  window.parent.postMessage({type: "scorebook_response", data: data}, "*");'
    + '}'
    + '</script>'
    + '<p>' + (data.success ? 'Success' : 'Error: ' + (data.error || 'Unknown')) + '</p>'
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
    .addToUi();
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
      if (sec && playerMap[sec]) ensure(sec).assists++;
      else if (sec && sec !== 'undefined' && sec !== '' && sec !== 'null') ensure(sec).assists++;
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
  var ORDER = ['Attack','Midfield','FOGO','Defense','Goalie'];
  var LABEL = { Attack:'ATTACK', Midfield:'MIDFIELD', FOGO:'FOGO', Defense:'DEFENSE', Goalie:'GOALIE' };
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
  function esc(x){ return (x===null||x===undefined)?'':String(x); }

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
    ORDER.indexOf('Goalie');
    var any = false;
    for (var pid3 in stat) {
      if (!playerMap[pid3] || playerMap[pid3].position !== 'Goalie') continue;
      var q = stat[pid3].savesQ, tot = stat[pid3].saves;
      if (tot === 0 && !playerMap[pid3]) continue;
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
      var showPer = (per === 'OT1') ? 'OT1' : (per === 'OT2') ? 'OT2' : per;
      body += '<tr><td class="qh">' + showPer + '</td><td>' + qa[per] + '</td><td>' + qb[per] + '</td></tr>';
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
  for (var t = 0; t < 27; t++) {
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
    +   '<div>Date: ' + gameDate + '</div><div>Opponent: ' + esc(opponent) + '</div>'
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
    +   '<div>Date: ' + gameDate + '</div><div>Site: ' + esc(location) + '</div>'
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
