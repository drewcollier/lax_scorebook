// js/exports.js - Printable scoresheet and the per-game MaxPreps file, built on the device.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// GAME EXPORTS (V3.26): printable scoresheet + MaxPreps per-game CSV.
// Both are built on this device from the game's events in History, so they
// work offline and don't need the PIN.
// ============================================================
var SS_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2'];
var SS_POS_ORDER = ['Attack', 'Midfield', 'FOGO', 'LSM', 'Defense', 'Goalie'];
var REG_MINUTES = 48, OT_MINUTES = 4; // NFHS boys: 4 x 12:00, OT 4:00

function findHistoryGame(gameId) {
  for (var i = 0; i < state.gameHistory.length; i++) {
    if (state.gameHistory[i].id === gameId) return state.gameHistory[i];
  }
  return null;
}

// Tally one game: per-player numbers and per-quarter team boxes.
function computeGameStats(entry) {
  function zeroQ() { return { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OT1: 0, OT2: 0 }; }
  var g = {
    players: {}, goals: [], penalties: [],
    tigersQ: zeroQ(), oppQ: zeroQ(), gbQ: zeroQ(), shotQ: zeroQ(),
    clearGoodQ: zeroQ(), clearFailQ: zeroQ(), rideGoodQ: zeroQ(), rideFailQ: zeroQ(), emoScoredQ: zeroQ(), emoFailQ: zeroQ(),
    fowQ: zeroQ(), folQ: zeroQ(), timeouts: { h1: 0, h2: 0, ot1: 0, ot2: 0 }, otPlayed: 0
  };
  function P(id) {
    if (!g.players[id]) g.players[id] = { goals: 0, assists: 0, shots: 0, sog: 0, gbs: 0, int: 0, cto: 0, to: 0,
      fow: 0, fol: 0, saves: 0, ga: 0, savesQ: zeroQ(), pens: 0, penSecs: 0 };
    return g.players[id];
  }
  var ot = {};
  (entry.events || []).forEach(function(e) {
    var per = e.quarter, type = e.metric, prim = e.playerId || '', sec = e.linkedPlayerId || '';
    var inQ = SS_PERIODS.indexOf(per) !== -1;
    if (per === 'OT1' || per === 'OT2') ot[per] = true;
    if (type === 'Goal') {
      P(prim).goals++;
      if (sec) P(sec).assists++;
      if (inQ) g.tigersQ[per]++;
      g.goals.push({ scorer: prim, assist: sec, clock: e.gameClock || '', period: per });
    } else if (type === 'Opp_Goal') { if (inQ) g.oppQ[per]++; }
    else if (type === 'Shot') { P(prim).shots++; if (inQ) g.shotQ[per]++; }
    else if (type === 'SOG') { P(prim).sog++; }
    else if (type === 'GB') { P(prim).gbs++; if (inQ) g.gbQ[per]++; }
    else if (type === 'INT') { P(prim).int++; }
    else if (type === 'CTO') { P(prim).cto++; }
    else if (type === 'TO') { P(prim).to++; }
    else if (type === 'FOW') { P(prim).fow++; if (inQ) g.fowQ[per]++; }
    else if (type === 'FOL') { P(prim).fol++; if (inQ) g.folQ[per]++; }
    else if (type === 'Save') { var s = P(prim); s.saves++; if (inQ) s.savesQ[per]++; }
    else if (type === 'GA') { P(prim).ga++; }
    else if (type === 'Clear_Good') { if (inQ) g.clearGoodQ[per]++; }
    else if (type === 'Clear_Fail') { if (inQ) g.clearFailQ[per]++; }
    else if (type === 'Ride_Good') { if (inQ) g.rideGoodQ[per]++; }
    else if (type === 'Ride_Fail') { if (inQ) g.rideFailQ[per]++; }
    else if (type === 'EMO_Success') { if (inQ) g.emoScoredQ[per]++; }
    else if (type === 'EMO_Fail') { if (inQ) g.emoFailQ[per]++; }
    else if (type === 'TIMEOUT') {
      if (prim === 'TEAM') {
        if (per === 'Q1' || per === 'Q2') g.timeouts.h1++;
        else if (per === 'Q3' || per === 'Q4') g.timeouts.h2++;
        else if (per === 'OT1') g.timeouts.ot1++;
        else if (per === 'OT2') g.timeouts.ot2++;
      }
    } else if (type === 'Penalty') {
      if (String(prim).indexOf('Opp') === 0) return; // opponent penalty
      var p = P(prim);
      p.pens++;
      p.penSecs += Number(e.penDuration) || 0;
      g.penalties.push({ type: e.penType || '', who: prim, name: e.penName || 'Foul', period: per || '', clock: e.penClock || '' });
    }
  });
  function sumQ(o) { return o.Q1 + o.Q2 + o.Q3 + o.Q4 + o.OT1 + o.OT2; }
  g.sumQ = sumQ;
  g.us = sumQ(g.tigersQ);
  g.them = sumQ(g.oppQ);
  g.otPlayed = Object.keys(ot).length;
  return g;
}

// Roster lookup that also covers players who are in the game but no longer on
// the device's roster.
function exportRoster(entry) {
  var map = {};
  state.players.forEach(function(p) { map[p.Player_ID] = p; });
  (entry.events || []).forEach(function(e) {
    if (e.playerId && !map[e.playerId] && e.type === 'player_stat') {
      map[e.playerId] = { Player_ID: e.playerId, Jersey: e.playerJersey || '', Name: e.playerName || '', Position: '' };
    }
  });
  return map;
}
function byJersey(a, b) { return (parseInt(a.Jersey, 10) || 999) - (parseInt(b.Jersey, 10) || 999); }

// ---------- MaxPreps (boys lacrosse stat sheet columns, in MaxPreps' order) ----------
var MAXPREPS_HEADERS = ['#', 'Player Name', 'Goals', 'Asst', 'SOG', 'GB', 'INT', 'TA', 'UE', 'FW', 'FA',
  'MIN', 'GA', 'SV', 'Shut Out', 'W', 'L', 'T', 'P', 'PM', 'PS'];

// Goalie minutes and decision: if exactly one goalie recorded saves/goals
// allowed, they played the whole game (48 + 4 per overtime) and get the
// W/L/T (and shutout). If two or more did, those columns are left blank for
// the coach to fill in.
function maxPrepsRows(entry) {
  var g = computeGameStats(entry);
  var roster = exportRoster(entry);
  var goalies = Object.keys(g.players).filter(function(id) { var s = g.players[id]; return (s.saves + s.ga) > 0; });
  var soleGoalie = goalies.length === 1 ? goalies[0] : '';
  var list = Object.keys(roster).map(function(id) { return roster[id]; }).sort(byJersey);
  return list.map(function(p) {
    var s = g.players[p.Player_ID] ||
      { goals: 0, assists: 0, sog: 0, gbs: 0, int: 0, cto: 0, to: 0, fow: 0, fol: 0, saves: 0, ga: 0, pens: 0, penSecs: 0 };
    var isGoalie = (s.saves + s.ga) > 0;
    var sole = p.Player_ID === soleGoalie;
    return [
      p.Jersey, p.Name, s.goals, s.assists, s.sog, s.gbs, s.int, s.cto, s.to, s.fow, s.fow + s.fol,
      sole ? REG_MINUTES + OT_MINUTES * g.otPlayed : '',
      isGoalie ? s.ga : '', isGoalie ? s.saves : '',
      sole ? (g.them === 0 ? 1 : 0) : '',
      sole ? (g.us > g.them ? 1 : 0) : '', sole ? (g.us < g.them ? 1 : 0) : '', sole ? (g.us === g.them ? 1 : 0) : '',
      s.pens, Math.floor(s.penSecs / 60), s.penSecs % 60
    ];
  });
}

function csvCell(v) {
  var t = String(v === null || v === undefined ? '' : v);
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function downloadMaxPrepsCsv(gameId) {
  var entry = findHistoryGame(gameId);
  if (!entry) return;
  var lines = [MAXPREPS_HEADERS].concat(maxPrepsRows(entry)).map(function(r) { return r.map(csvCell).join(','); });
  var name = 'MaxPreps_' + entry.date + '_' + String(entry.opponent).replace(/[^A-Za-z0-9]+/g, '_') + '.csv';
  var blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1000);
  showToast('MaxPreps file downloaded: ' + name, 'success');
}

// ---------- Printable scoresheet ----------
function scoresheetHtml(entry) {
  var esc = escapeHtml;
  var g = computeGameStats(entry);
  var roster = exportRoster(entry);
  var meta = entry.meta || {};
  function jersey(id) { return roster[id] ? roster[id].Jersey : id; }

  // Roster grouped by position.
  var groups = {};
  SS_POS_ORDER.concat(['Other']).forEach(function(k) { groups[k] = []; });
  Object.keys(roster).forEach(function(id) {
    var p = roster[id];
    var key = SS_POS_ORDER.indexOf(p.Position) !== -1 ? p.Position : 'Other';
    groups[key].push(p);
  });
  var rosterRows = '';
  SS_POS_ORDER.concat(['Other']).forEach(function(k) {
    var rows = groups[k].sort(byJersey);
    rows.forEach(function(p, i) {
      var s = g.players[p.Player_ID] || {};
      rosterRows += '<tr>' + (i === 0 ? '<td class="pos" rowspan="' + rows.length + '"><span>' + esc(k.toUpperCase()) + '</span></td>' : '')
        + '<td class="num"><b>' + esc(p.Jersey) + '</b></td><td class="nm left">' + esc(p.Name) + '</td>'
        + '<td>' + (s.shots || 0) + '</td><td>' + (s.sog || 0) + '</td><td>' + (s.goals || 0) + '</td>'
        + '<td>' + (s.assists || 0) + '</td><td>' + (s.gbs || 0) + '</td></tr>';
    });
  });

  var saveRows = '';
  Object.keys(g.players).forEach(function(id) {
    var s = g.players[id];
    var isG = (roster[id] && roster[id].Position === 'Goalie') || (s.saves + s.ga) > 0;
    if (!isG) return;
    saveRows += '<tr><td><b>' + esc(jersey(id)) + '</b></td>' + SS_PERIODS.map(function(q) { return '<td>' + s.savesQ[q] + '</td>'; }).join('')
      + '<td><b>' + s.saves + '</b></td><td><b>' + pct(s.saves, s.saves + s.ga) + '</b></td></tr>';
  });
  if (!saveRows) saveRows = '<tr><td colspan="9">&nbsp;</td></tr>';

  // "XX.X%" (or a dash when nothing was attempted).
  function pct(made, tries) { return tries > 0 ? (Math.round(made / tries * 1000) / 10).toFixed(1) + '%' : '&ndash;'; }

  // A quarter-by-quarter box. groups (optional): [[label, columns spanned], ...]
  // for a second header row (Clears | Rides). pcts (optional): [[text, columns
  // spanned], ...] for a percentage line under TOT.
  function qBox(title, cols, series, pcts, groups) {
    var head = '';
    if (groups) head += '<tr><th></th>' + groups.map(function(x) { return '<th colspan="' + x[1] + '">' + x[0] + '</th>'; }).join('') + '</tr>';
    if (cols.length) head += '<tr><th></th>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
    if (head) head = '<thead>' + head + '</thead>';
    var body = SS_PERIODS.map(function(q) {
      return '<tr><td class="qh">' + q + '</td>' + series.map(function(o) { return '<td>' + o[q] + '</td>'; }).join('') + '</tr>';
    }).join('');
    body += '<tr class="tot"><td class="qh">TOT</td>' + series.map(function(o) { return '<td><b>' + g.sumQ(o) + '</b></td>'; }).join('') + '</tr>';
    if (pcts) body += '<tr class="pct"><td class="qh">%</td>' + pcts.map(function(x) { return '<td colspan="' + x[1] + '"><b>' + x[0] + '</b></td>'; }).join('') + '</tr>';
    return '<div class="box"><div class="box-t">' + title + '</div><table class="qt">' + head + '<tbody>' + body + '</tbody></table></div>';
  }
  var S = g.sumQ;

  // Scoring timeline: every goal, in order (wraps to more rows as needed).
  var cells = Math.max(28, Math.ceil(g.goals.length / 14) * 14);
  var timeline = '';
  for (var t = 0; t < cells; t++) {
    var gl = g.goals[t];
    timeline += '<div class="tl-cell"><div class="tl-n">' + (t + 1) + '</div><div class="tl-v">'
      + (gl ? '<b>#' + esc(jersey(gl.scorer)) + (gl.assist ? '/' + esc(jersey(gl.assist)) : '') + '</b><br><span>'
        + esc(gl.period) + ' ' + esc(gl.clock) + '</span>' : '&nbsp;') + '</div></div>';
  }

  var penRows = g.penalties.length ? g.penalties.map(function(p) {
    var who = p.who === 'In-Home' ? 'In-Home' : '#' + jersey(p.who);
    return '<tr><td>' + esc(String(p.type).charAt(0)) + '</td><td><b>' + esc(who) + '</b></td><td class="left">' + esc(p.name)
      + '</td><td>' + esc(p.period) + '</td><td>' + esc(p.clock) + '</td></tr>';
  }).join('') : '<tr><td colspan="5">No penalties recorded</td></tr>';

  var scorers = Object.keys(g.players).filter(function(id) { return (g.players[id].goals + g.players[id].assists) > 0; })
    .map(function(id) { var s = g.players[id]; return { id: id, g: s.goals, a: s.assists, pts: s.goals + s.assists }; })
    .sort(function(x, y) { return y.pts - x.pts || y.g - x.g; });
  var scoringRows = scorers.length ? scorers.map(function(s) {
    return '<tr><td><b>' + esc(jersey(s.id)) + '</b></td><td class="left">' + esc(roster[s.id] ? roster[s.id].Name : '') + '</td><td>'
      + s.g + '</td><td>' + s.a + '</td><td><b>' + s.pts + '</b></td></tr>';
  }).join('') : '<tr><td colspan="5">&nbsp;</td></tr>';

  var weather = [meta.weatherTemp, meta.weatherCond].filter(function(x) { return x; }).join(' ');
  function finalRow(label, q, total) {
    return '<tr><td class="left">' + label + '</td><td>' + q.Q1 + '</td><td>' + q.Q2 + '</td><td>' + q.Q3 + '</td><td>' + q.Q4
      + '</td><td>' + (q.OT1 + q.OT2) + '</td><td class="fin"><b>' + total + '</b></td></tr>';
  }

  return '<div class="title-bar">FISHERS TIGERS LACROSSE &mdash; OFFICIAL GAME SCORESHEET</div>'
    + '<div class="meta"><div>Date: ' + esc(entry.date) + '</div><div>Opponent: ' + esc(entry.opponent) + '</div>'
    + '<div>Site: ' + esc(entry.location) + '</div><div>Start: ' + esc(meta.gameStart) + '</div>'
    + '<div>Weather: ' + esc(weather) + '</div><div style="margin-left:auto;">Final: <b>' + g.us + ' - ' + g.them + '</b></div></div>'
    + '<div class="section-title left">PROGRESSIVE SCORING TIMELINE</div><div class="tl">' + timeline + '</div>'
    + '<div class="cols"><div class="c-left">'
    + '<div class="section-title left">PLAYER ROSTER &amp; GAME STATS</div>'
    + '<table class="roster"><thead><tr><th class="pos"></th><th class="num">#</th><th class="nm left">PLAYER</th>'
    + '<th>SH</th><th>SOG</th><th>G</th><th>A</th><th>GB</th></tr></thead><tbody>' + rosterRows + '</tbody></table>'
    + '<div class="box-t">SAVES BY QUARTER</div><table class="saves"><thead><tr><th>#</th>'
    + SS_PERIODS.map(function(q) { return '<th>' + q + '</th>'; }).join('') + '<th>TOT</th><th>SV%</th></tr></thead><tbody>' + saveRows + '</tbody></table>'
    + '</div><div class="c-mid">'
    + '<div class="section-title">PENALTIES / FOULS</div><table><thead><tr><th>P/T</th><th>#</th><th class="left">PENALTY</th><th>QTR</th><th>TIME</th></tr></thead><tbody>' + penRows + '</tbody></table>'
    + '<div class="section-title">INDIVIDUAL SCORING</div><table><thead><tr><th>#</th><th class="left">NAME</th><th>G</th><th>A</th><th>PTS</th></tr></thead><tbody>' + scoringRows + '</tbody></table>'
    + '<div class="section-title">TIMEOUTS</div><table><thead><tr><th>1st HALF</th><th>2nd HALF</th><th>1 OT</th><th>2 OT</th></tr></thead><tbody><tr><td>'
    + g.timeouts.h1 + '</td><td>' + g.timeouts.h2 + '</td><td>' + g.timeouts.ot1 + '</td><td>' + g.timeouts.ot2 + '</td></tr></tbody></table>'
    + '<div class="section-title">SCORE BY PERIOD</div><table class="final"><thead><tr><th class="left">Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>OT</th><th>FINAL</th></tr></thead><tbody>'
    + finalRow('<b>US (Tigers)</b>', g.tigersQ, g.us) + finalRow('THEM (' + esc(entry.opponent) + ')', g.oppQ, g.them) + '</tbody></table>'
    + '<div class="section-title">OFFICIALS &amp; CREW</div><table><tbody>'
    + '<tr><td class="left"><b>Head Official</b></td><td class="left">' + esc(meta.headOfficial) + '</td></tr>'
    + '<tr><td class="left"><b>Umpire</b></td><td class="left">' + esc(meta.umpire) + '</td></tr>'
    + '<tr><td class="left"><b>Field Judge</b></td><td class="left">' + esc(meta.fieldJudge) + '</td></tr>'
    + '<tr><td class="left"><b>Opp Scorer</b></td><td class="left">' + esc(meta.oppScorer) + '</td></tr></tbody></table>'
    + '</div><div class="c-right">'
    + qBox('GROUNDBALLS', [], [g.gbQ]) + qBox('SHOTS', [], [g.shotQ], [[pct(g.us, S(g.shotQ)) + ' scored', 1]])
    + qBox('CLEARS / RIDES', ['Clears', 'Fail', 'Ride', 'Fail'], [g.clearGoodQ, g.clearFailQ, g.rideGoodQ, g.rideFailQ],
      [[pct(S(g.clearGoodQ), S(g.clearGoodQ) + S(g.clearFailQ)), 2], [pct(S(g.rideGoodQ), S(g.rideGoodQ) + S(g.rideFailQ)), 2]],
      [['Clears', 2], ['Rides', 2]])
    + qBox('EXTRA MAN', ['Scrd', 'Fail'], [g.emoScoredQ, g.emoFailQ], [[pct(S(g.emoScoredQ), S(g.emoScoredQ) + S(g.emoFailQ)), 2]])
    + qBox('FACEOFFS', ['Won', 'Lost'], [g.fowQ, g.folQ], [[pct(S(g.fowQ), S(g.fowQ) + S(g.folQ)), 2]])
    + '</div></div>'
    + '<div class="footer"><div>Date: ' + esc(entry.date) + '</div><div>Site: ' + esc(entry.location) + '</div>'
    + '<div>Weather: ' + esc(weather) + '</div><div>Game Start: ' + esc(meta.gameStart) + '</div>'
    + '<div>Scorer: ' + esc(meta.tigersScorer) + '</div><div>Timer: ' + esc(meta.tigersTimer) + '</div></div>';
}

// Shrink the scoresheet so it always prints on ONE landscape letter page,
// whatever the roster size (printable area at 0.3in margins ~ 998 x 758 px).
function fitScoresheetToPage() {
  var body = document.getElementById('scoresheetBody');
  if (!body) return;
  body.style.zoom = '';
  var z = Math.min(1, 990 / body.scrollWidth, 740 / body.scrollHeight);
  body.style.zoom = String(Math.floor(z * 100) / 100);
}
function unfitScoresheet() {
  var body = document.getElementById('scoresheetBody');
  if (body) body.style.zoom = '';
}
function printScoresheet() {
  fitScoresheetToPage();
  window.print();
}
window.addEventListener('beforeprint', function() {
  if (document.body.classList.contains('printing-scoresheet')) fitScoresheetToPage();
});
window.addEventListener('afterprint', unfitScoresheet);

function openScoresheet(gameId) {
  var entry = findHistoryGame(gameId);
  if (!entry) return;
  document.getElementById('scoresheetBody').innerHTML = scoresheetHtml(entry);
  document.getElementById('scoresheetOverlay').classList.add('show');
  document.body.classList.add('printing-scoresheet');
}

function closeScoresheet() {
  document.getElementById('scoresheetOverlay').classList.remove('show');
  document.body.classList.remove('printing-scoresheet');
}
