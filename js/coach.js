// js/coach.js - The coaches' page (coach.html): every stat from every game,
// for one game, the season game by game, and every player.
//
// Reads the workbook with a coach PIN (VIEW_PINS) or the scorebook PIN, using the
// same requests as the viewer's coach view (getRoster, getGames, getEvents).
// The PIN is typed on the page, kept only in memory for this visit, never stored
// and never put in a URL. Everything is worked out here from the recorded plays.
//
// Opponent numbers come from what the scorekeeper records about them: goals,
// shots, shots on goal, faceoffs (our losses), and their penalties by jersey.

var C = { url: '', pin: '', roster: {}, games: [], events: [], byGame: {}, view: 'game', sort: {} };
var PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2'];

function $(id) { return document.getElementById(id); }
function esc(x) {
  if (x === null || x === undefined) return '';
  return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function pct(made, tries) { return tries > 0 ? (Math.round(made / tries * 1000) / 10).toFixed(1) + '%' : '–'; }
function mss(secs) { secs = Math.round(Number(secs) || 0); return Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2); }
function setStatus(id, msg, err) { var el = $(id); el.textContent = msg || ''; el.classList.toggle('err', !!err); }

// ---------- talking to the script ----------
function api(action, extra) {
  var body = { action: action, pin: C.pin };
  for (var k in extra) body[k] = extra[k];
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, 45000);
  return fetch(C.url, { method: 'POST', body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
    .then(function(r) { return r.text(); })
    .then(function(t) { clearTimeout(timer); return JSON.parse(t); },
          function(e) { clearTimeout(timer); throw e; });
}

function unlock() {
  var pin = $('pinInput').value.trim();
  if (!pin) { setStatus('pinStatus', 'Enter your coach PIN.', true); return; }
  C.pin = pin;
  $('unlockBtn').disabled = true;
  setStatus('pinStatus', 'Opening…');
  loadAll(true);
}

function lockPage() {
  C.pin = ''; C.events = []; C.games = []; C.roster = {}; C.byGame = {};
  $('pinInput').value = '';
  $('main').classList.add('hide'); $('refreshBtn').classList.add('hide'); $('lockBtn').classList.add('hide');
  $('pinCard').classList.remove('hide');
  setStatus('pinStatus', 'Locked. Enter the PIN to open again.');
}

function loadAll(fromPin) {
  var statusId = fromPin ? 'pinStatus' : 'loadStatus';
  setStatus(statusId, 'Loading every game…');
  Promise.all([api('getRoster'), api('getGames'), api('getEvents', { gameId: '' })]).then(function(r) {
    $('unlockBtn').disabled = false;
    var bad = r.filter(function(d) { return !d || !d.success; })[0];
    if (bad) {
      if (bad.error === 'INVALID_PIN') { C.pin = ''; setStatus('pinStatus', 'That PIN is not right.', true); if (!fromPin) lockPage(); return; }
      setStatus(statusId, (bad && (bad.message || bad.error)) || 'The workbook did not answer.', true);
      return;
    }
    C.roster = {};
    (r[0].players || []).forEach(function(p) { C.roster[String(p.Player_ID)] = p; });
    C.games = r[1].games || []; // newest first
    C.events = r[2].events || [];
    C.byGame = {};
    C.events.forEach(function(e) { (C.byGame[e.Game_ID] = C.byGame[e.Game_ID] || []).push(e); });
    $('pinCard').classList.add('hide');
    $('main').classList.remove('hide'); $('refreshBtn').classList.remove('hide'); $('lockBtn').classList.remove('hide');
    setStatus('loadStatus', C.games.length + ' game' + (C.games.length === 1 ? '' : 's') + ' loaded.');
    var pick = $('gamePick'), keep = pick.value;
    pick.innerHTML = C.games.map(function(g) {
      return '<option value="' + esc(g.Game_ID) + '">' + esc(g.Date + ' ' + (g.Location === 'Away' ? '@ ' : 'vs ') + g.Opponent + (g.Score ? '  (' + g.Score + ')' : '')) + '</option>';
    }).join('');
    if (C.games.some(function(g) { return g.Game_ID === keep; })) pick.value = keep;
    renderAll();
  }).catch(function() {
    $('unlockBtn').disabled = false;
    setStatus(statusId, 'Could not reach the workbook. Check your connection and try again.', true);
  });
}

// ---------- adding things up ----------
function blankTeam() {
  return { G: 0, SH: 0, SOG: 0, GB: 0, TO: 0, CT: 0, INT: 0, FOW: 0, FOL: 0, SV: 0, GA: 0,
    CLR: 0, CLRF: 0, RIDE: 0, RIDEF: 0, EMO: 0, EMOF: 0, EMOG: 0,
    OG: 0, OSH: 0, OSOG: 0, OMUG: 0,
    PEN: 0, PENS: 0, PERS: 0, TECH: 0, OPEN: 0, OPENS: 0, OPERS: 0, OTECH: 0, OUT: 0, OOUT: 0 };
}
function addTeam(t, e) {
  var a = e.Action_Type, p = String(e.Primary_Player_ID || ''), secs = Number(e.Pen_Duration) || 0;
  switch (a) {
    case 'Goal': t.G++; if (e.Strength === 'Man-Up') t.EMOG++; break;
    case 'Shot': t.SH++; break; case 'SOG': t.SOG++; break;
    case 'GB': t.GB++; break; case 'TO': t.TO++; break; case 'CTO': t.CT++; break; case 'INT': t.INT++; break;
    case 'FOW': t.FOW++; break; case 'FOL': t.FOL++; break;
    case 'Save': t.SV++; break; case 'GA': t.GA++; break;
    case 'Clear_Good': t.CLR++; break; case 'Clear_Fail': t.CLRF++; break;
    case 'Ride_Good': t.RIDE++; break; case 'Ride_Fail': t.RIDEF++; break;
    case 'EMO_Success': t.EMO++; break; case 'EMO_Fail': t.EMOF++; break;
    case 'Opp_Goal': t.OG++; if (e.Strength === 'Man-Down') t.OMUG++; break;
    case 'Opp_Shot': t.OSH++; break; case 'Opp_SOG': t.OSOG++; break;
    case 'Penalty':
      if (p.indexOf('Opp ') === 0) { t.OPEN++; t.OPENS += secs; if (e.Penalty_Type === 'Personal') t.OPERS++; else t.OTECH++; }
      else { t.PEN++; t.PENS += secs; if (e.Penalty_Type === 'Personal') t.PERS++; else t.TECH++; }
      break;
    case 'Ejection': if (p.indexOf('Opp ') === 0) t.OOUT++; else t.OUT++; break;
  }
}
function teamOf(evs) { var t = blankTeam(); evs.forEach(function(e) { addTeam(t, e); }); return t; }

function blankPlayer() { return { GP: 0, G: 0, A: 0, SH: 0, SOG: 0, GB: 0, CT: 0, TO: 0, INT: 0, FOW: 0, FOL: 0, SV: 0, GA: 0, PEN: 0, PENS: 0, EMOG: 0 }; }
// { Player_ID: stats } for a list of plays (our players only).
function playersOf(evs, countGames) {
  var out = {}, seen = {};
  function P(id) { return out[id] || (out[id] = blankPlayer()); }
  evs.forEach(function(e) {
    var p = String(e.Primary_Player_ID || ''), s = String(e.Secondary_Player_ID || ''), a = e.Action_Type;
    if (p && !/^Opp |^OPPONENT$|^In-Home$/.test(p)) {
      var x = P(p);
      if (countGames) seen[p + '|' + e.Game_ID] = true;
      if (a === 'Goal') { x.G++; if (e.Strength === 'Man-Up') x.EMOG++; }
      else if (a === 'Shot') x.SH++; else if (a === 'SOG') x.SOG++; else if (a === 'GB') x.GB++;
      else if (a === 'CTO') x.CT++; else if (a === 'TO') x.TO++; else if (a === 'INT') x.INT++;
      else if (a === 'FOW') x.FOW++; else if (a === 'FOL') x.FOL++;
      else if (a === 'Save') x.SV++; else if (a === 'GA') x.GA++;
      else if (a === 'Penalty') { x.PEN++; x.PENS += Number(e.Pen_Duration) || 0; }
    }
    if (s && a === 'Goal' && !/^Opp /.test(s)) { P(s).A++; if (countGames) seen[s + '|' + e.Game_ID] = true; }
  });
  if (countGames) Object.keys(seen).forEach(function(k) { out[k.split('|')[0]].GP++; });
  return out;
}

function scoreByPeriod(evs) {
  var us = {}, them = {};
  PERIODS.forEach(function(q) { us[q] = 0; them[q] = 0; });
  evs.forEach(function(e) {
    if (e.Action_Type === 'Goal' && us[e.Period] !== undefined) us[e.Period]++;
    if (e.Action_Type === 'Opp_Goal' && them[e.Period] !== undefined) them[e.Period]++;
  });
  return { us: us, them: them };
}

// ---------- shared tables ----------
// Tigers vs opponent side by side. label = "Opponent" or the opponent's name.
function teamTable(t, oppLabel) {
  function row(name, us, them) { return '<tr><td>' + name + '</td><td class="us">' + us + '</td><td>' + (them === undefined ? '–' : them) + '</td></tr>'; }
  function sec(name) { return '<tr class="sec"><td colspan="3">' + name + '</td></tr>'; }
  return '<div class="scroll"><table class="cmp"><thead><tr><th></th><th>Tigers</th><th>' + esc(oppLabel) + '</th></tr></thead><tbody>'
    + sec('SCORING')
    + row('Goals', t.G, t.OG)
    + row('Shots', t.SH, t.OSH)
    + row('Shots on goal', t.SOG, t.OSOG)
    + row('Shooting % (goals ÷ shots)', pct(t.G, t.SH), pct(t.OG, t.OSH))
    + row('Saves / save %', t.SV + ' / ' + pct(t.SV, t.SV + t.GA), undefined)
    + sec('POSSESSION')
    + row('Faceoffs won', t.FOW + ' of ' + (t.FOW + t.FOL) + ' (' + pct(t.FOW, t.FOW + t.FOL) + ')', t.FOL + ' of ' + (t.FOW + t.FOL) + ' (' + pct(t.FOL, t.FOW + t.FOL) + ')')
    + row('Ground balls', t.GB, undefined)
    + row('Turnovers', t.TO, undefined)
    + row('Caused turnovers', t.CT, undefined)
    + row('Interceptions', t.INT, undefined)
    + row('Clears', t.CLR + ' of ' + (t.CLR + t.CLRF) + ' (' + pct(t.CLR, t.CLR + t.CLRF) + ')', undefined)
    + row('Rides', t.RIDE + ' of ' + (t.RIDE + t.RIDEF) + ' (' + pct(t.RIDE, t.RIDE + t.RIDEF) + ')', undefined)
    + sec('MAN-UP / MAN-DOWN')
    + row('Extra man (scored / chances)', t.EMO + ' of ' + (t.EMO + t.EMOF) + ' (' + pct(t.EMO, t.EMO + t.EMOF) + ')', undefined)
    + row('Man-up goals', t.EMOG, t.OMUG)
    + sec('PENALTIES')
    + row('Penalties', t.PEN, t.OPEN)
    + row('Penalty time', mss(t.PENS), mss(t.OPENS))
    + row('Personal / technical', t.PERS + ' / ' + t.TECH, t.OPERS + ' / ' + t.OTECH)
    + row('Ejections / fouled out', t.OUT, t.OOUT)
    + '</tbody></table></div>';
}

var PLAYER_COLS = [
  ['#', 'jersey'], ['Player', 'name'], ['Pos', 'pos'], ['GP', 'GP'], ['G', 'G'], ['A', 'A'], ['Pts', 'PTS'],
  ['SH', 'SH'], ['SOG', 'SOG'], ['Sh%', 'SHP'], ['GB', 'GB'], ['CT', 'CT'], ['TO', 'TO'], ['INT', 'INT'],
  ['FOW', 'FOW'], ['FOL', 'FOL'], ['FO%', 'FOP'], ['SV', 'SV'], ['GA', 'GA'], ['SV%', 'SVP'], ['PEN', 'PEN'], ['PIM', 'PENS']];

function playerRows(stats) {
  return Object.keys(stats).map(function(id) {
    var s = stats[id], r = C.roster[id] || {};
    return { id: id, jersey: r.Jersey !== undefined ? Number(r.Jersey) : 999, name: r.Name || id, pos: r.Position || '',
      GP: s.GP, G: s.G, A: s.A, PTS: s.G + s.A, SH: s.SH, SOG: s.SOG, SHP: s.SH ? s.G / s.SH : -1,
      GB: s.GB, CT: s.CT, TO: s.TO, INT: s.INT, FOW: s.FOW, FOL: s.FOL, FOP: (s.FOW + s.FOL) ? s.FOW / (s.FOW + s.FOL) : -1,
      SV: s.SV, GA: s.GA, SVP: (s.SV + s.GA) ? s.SV / (s.SV + s.GA) : -1, PEN: s.PEN, PENS: s.PENS };
  });
}

// A table you can sort by tapping a heading. key = which table (remembers its sort).
function playerTable(key, stats, showGP) {
  var cols = PLAYER_COLS.filter(function(c) { return showGP || c[1] !== 'GP'; });
  var st = C.sort[key] || (C.sort[key] = { by: 'PTS', asc: false });
  var rows = playerRows(stats);
  rows.sort(function(a, b) {
    var x = a[st.by], y = b[st.by];
    var c = (typeof x === 'string') ? String(x).localeCompare(String(y)) : (x - y);
    if (!c) c = a.jersey - b.jersey;
    return st.asc ? c : -c;
  });
  if (!rows.length) return '<div class="empty">No player stats recorded.</div>';
  var h = '<div class="scroll"><table class="sortable" data-key="' + key + '"><thead><tr>' + cols.map(function(c) {
    return '<th data-by="' + c[1] + '" class="' + (c[1] === 'name' ? 'nm ' : '') + (st.by === c[1] ? 'sorted' + (st.asc ? ' asc' : '') : '') + '">' + c[0] + '</th>';
  }).join('') + '</tr></thead><tbody>';
  rows.forEach(function(r) {
    h += '<tr>' + cols.map(function(c) {
      var v = r[c[1]];
      if (c[1] === 'jersey') v = v === 999 ? '' : v;
      else if (c[1] === 'SHP' || c[1] === 'FOP' || c[1] === 'SVP') v = v < 0 ? '–' : (Math.round(v * 1000) / 10).toFixed(1) + '%';
      else if (c[1] === 'PENS') v = mss(v);
      return '<td' + (c[1] === 'name' ? ' class="nm"' : '') + '>' + esc(v) + '</td>';
    }).join('') + '</tr>';
  });
  return h + '</tbody></table></div>';
}

function wireSort(container, redraw) {
  Array.prototype.forEach.call(container.querySelectorAll('table.sortable th'), function(th) {
    th.addEventListener('click', function() {
      var key = th.closest('table').getAttribute('data-key'), by = th.getAttribute('data-by');
      var st = C.sort[key];
      if (st.by === by) st.asc = !st.asc; else { st.by = by; st.asc = (by === 'name' || by === 'jersey' || by === 'pos'); }
      redraw();
    });
  });
}

// ---------- GAME ----------
function renderGame() {
  var gid = $('gamePick').value;
  var g = C.games.filter(function(x) { return x.Game_ID === gid; })[0];
  if (!g) { $('gameHead').innerHTML = '<div class="empty">No games yet.</div>'; $('gameTeam').innerHTML = $('gamePlayers').innerHTML = $('gamePens').innerHTML = ''; return; }
  var evs = C.byGame[gid] || [];
  var t = teamOf(evs), q = scoreByPeriod(evs);
  var played = PERIODS.filter(function(p, i) { return i < 4 || q.us[p] || q.them[p] || evs.some(function(e) { return e.Period === p; }); });
  var res = t.G > t.OG ? '<span class="w">W</span>' : t.G < t.OG ? '<span class="l">L</span>' : 'T';
  $('gameHead').innerHTML = '<div class="gh"><div class="score">' + res + ' &nbsp;Tigers ' + t.G + ' – ' + t.OG + ' ' + esc(g.Opponent) + '</div>'
    + '<div class="sub">' + esc(g.Date) + ' · ' + esc(g.Location) + (g.Score && g.Score !== t.G + '-' + t.OG ? ' · scorebook final: ' + esc(g.Score) : '') + '</div>'
    + '<div class="scroll"><table><thead><tr><th class="l">Team</th>' + played.map(function(p) { return '<th>' + p + '</th>'; }).join('') + '<th>Final</th></tr></thead><tbody>'
    + '<tr><td class="l"><b>Tigers</b></td>' + played.map(function(p) { return '<td>' + q.us[p] + '</td>'; }).join('') + '<td><b>' + t.G + '</b></td></tr>'
    + '<tr><td class="l">' + esc(g.Opponent) + '</td>' + played.map(function(p) { return '<td>' + q.them[p] + '</td>'; }).join('') + '<td><b>' + t.OG + '</b></td></tr>'
    + '</tbody></table></div></div>';
  $('gameTeam').innerHTML = teamTable(t, g.Opponent);
  function drawPlayers() { $('gamePlayers').innerHTML = playerTable('game', playersOf(evs, false), false); wireSort($('gamePlayers'), drawPlayers); }
  drawPlayers();
  $('gamePens').innerHTML = penaltyLists(evs, g.Opponent);
}

function penaltyLists(evs, oppName) {
  var pens = evs.filter(function(e) { return e.Action_Type === 'Penalty'; });
  var out = {};
  evs.forEach(function(e) { if (e.Action_Type === 'Ejection') out[e.Primary_Player_ID] = true; });
  function order(a, b) { return PERIODS.indexOf(a.Period) - PERIODS.indexOf(b.Period) || String(b.Game_Clock).localeCompare(String(a.Game_Clock)); }
  function list(items, isOpp) {
    if (!items.length) return '<div class="empty">No penalties.</div>';
    var secs = 0, pers = 0, persSecs = 0, perPlayer = {};
    var h = '<div class="scroll"><table><thead><tr><th class="l">Player</th><th>Qtr</th><th>Clock</th><th class="l">Penalty</th><th>Type</th><th>Time</th></tr></thead><tbody>';
    items.sort(order).forEach(function(e) {
      var id = String(e.Primary_Player_ID), d = Number(e.Pen_Duration) || 0;
      var who = id === 'In-Home' || id === 'Opp In-Home' ? 'In-Home (team)'
        : isOpp ? id.replace(/^Opp /, '') : (C.roster[id] ? '#' + C.roster[id].Jersey + ' ' + C.roster[id].Name : id);
      secs += d;
      if (e.Penalty_Type === 'Personal') { pers++; persSecs += d; if (!/In-Home/.test(id)) perPlayer[id] = (perPlayer[id] || 0) + d; }
      h += '<tr><td class="l">' + esc(who) + (out[id] ? ' <span class="out-tag">OUT</span>' : '') + '</td><td>' + esc(e.Period) + '</td><td>' + esc(e.Game_Clock)
        + '</td><td class="l">' + esc(e.Penalty_Name) + '</td><td>' + esc(e.Penalty_Type || 'Technical') + '</td><td><b>' + mss(d) + '</b></td></tr>';
    });
    h += '</tbody></table></div><p class="pen-sum">' + items.length + ' penalt' + (items.length === 1 ? 'y' : 'ies') + ', ' + mss(secs)
      + ' &middot; personal: ' + pers + ' (' + mss(persSecs) + ') &middot; technical: ' + (items.length - pers) + ' (' + mss(secs - persSecs) + ')</p>';
    return h;
  }
  var ours = pens.filter(function(e) { return String(e.Primary_Player_ID).indexOf('Opp ') !== 0; });
  var theirs = pens.filter(function(e) { return String(e.Primary_Player_ID).indexOf('Opp ') === 0; });
  return '<div class="pens"><div><h3>Tigers</h3>' + list(ours, false) + '</div><div><h3>' + esc(oppName) + '</h3>' + list(theirs, true) + '</div></div>';
}

// ---------- SEASON ----------
function renderSeason() {
  var games = C.games.slice().reverse(); // oldest first
  var w = 0, l = 0, tie = 0, gf = 0, ga = 0;
  var rows = games.map(function(g) {
    var t = teamOf(C.byGame[g.Game_ID] || []);
    gf += t.G; ga += t.OG;
    if (t.G > t.OG) w++; else if (t.G < t.OG) l++; else tie++;
    return { g: g, t: t };
  });
  $('seasonHead').innerHTML = '<div class="gh"><div class="score">' + w + '–' + l + (tie ? '–' + tie : '') + '</div>'
    + '<div class="sub">' + games.length + ' game' + (games.length === 1 ? '' : 's') + ' · goals for ' + gf + ' · goals against ' + ga + '</div></div>';
  var cols = ['Date', 'Opponent', 'Result', 'SH', 'Sh%', 'GB', 'TO', 'CT', 'FO%', 'Clr%', 'Ride%', 'EMO', 'Sv%', 'PEN (time)', 'Opp PEN (time)'];
  function line(t) {
    return '<td>' + t.SH + '</td><td>' + pct(t.G, t.SH) + '</td><td>' + t.GB + '</td><td>' + t.TO + '</td><td>' + t.CT + '</td>'
      + '<td>' + pct(t.FOW, t.FOW + t.FOL) + '</td><td>' + pct(t.CLR, t.CLR + t.CLRF) + '</td><td>' + pct(t.RIDE, t.RIDE + t.RIDEF) + '</td>'
      + '<td>' + t.EMO + '/' + (t.EMO + t.EMOF) + '</td><td>' + pct(t.SV, t.SV + t.GA) + '</td>'
      + '<td>' + t.PEN + ' (' + mss(t.PENS) + ')</td><td>' + t.OPEN + ' (' + mss(t.OPENS) + ')</td>';
  }
  var all = teamOf(C.events);
  var h = '<div class="scroll"><table><thead><tr>' + cols.map(function(c, i) { return '<th' + (i < 2 ? ' class="l"' : '') + '>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
  rows.forEach(function(r) {
    var res = (r.t.G > r.t.OG ? 'W ' : r.t.G < r.t.OG ? 'L ' : 'T ') + r.t.G + '–' + r.t.OG;
    h += '<tr class="click" data-gid="' + esc(r.g.Game_ID) + '"><td class="l">' + esc(r.g.Date) + '</td><td class="l">'
      + (r.g.Location === 'Away' ? '@ ' : 'vs ') + esc(r.g.Opponent) + '</td><td><b>' + res + '</b></td>' + line(r.t) + '</tr>';
  });
  if (rows.length) h += '<tr class="tot"><td class="l">Season</td><td></td><td>' + w + '–' + l + (tie ? '–' + tie : '') + '</td>' + line(all) + '</tr>';
  $('seasonGames').innerHTML = rows.length ? h + '</tbody></table></div>' : '<div class="empty">No games yet.</div>';
  Array.prototype.forEach.call($('seasonGames').querySelectorAll('tr.click'), function(tr) {
    tr.addEventListener('click', function() { $('gamePick').value = tr.getAttribute('data-gid'); showView('game'); });
  });
  $('seasonTeam').innerHTML = teamTable(all, 'Opponents');
}

// ---------- PLAYERS ----------
function renderPlayers() {
  function draw() { $('seasonPlayers').innerHTML = playerTable('season', playersOf(C.events, true), true); wireSort($('seasonPlayers'), draw); }
  draw();
}

// ---------- views ----------
function renderAll() { renderGame(); renderSeason(); renderPlayers(); }
function showView(v) {
  C.view = v;
  ['game', 'season', 'players'].forEach(function(x) { $('view-' + x).classList.toggle('hide', x !== v); });
  Array.prototype.forEach.call(document.querySelectorAll('.ctab'), function(b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
  if (v === 'game') renderGame();
  window.scrollTo(0, 0);
}
Array.prototype.forEach.call(document.querySelectorAll('.ctab'), function(b) {
  b.addEventListener('click', function() { showView(b.getAttribute('data-view')); });
});

(function init() {
  C.url = /^https?:\/\//.test(DEFAULT_SCRIPT_URL) ? DEFAULT_SCRIPT_URL : '';
  if (!C.url) setStatus('pinStatus', 'The script link is missing from js/config.js.', true);
  $('pinInput').focus();
})();
