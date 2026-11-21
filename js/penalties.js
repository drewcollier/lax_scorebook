// js/penalties.js - Penalty totals for both teams: the Penalties tab, the
// foul-out watch strip on the game screen, and the per-player breakdown.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).
//
// Everything is worked out from the game's recorded penalties each time it is
// shown, so an Undo is reflected straight away.
// Rule (NFHS): 5:00 of PERSONAL fouls = fouled out, however many fouls it took.
// Technical fouls and In-Home (team) fouls don't count toward it.

var FOUL_OUT_SECS = 300;
var FOUL_WARN_SECS = 180; // the game-screen strip shows players from 3:00

function fmtPenSecs(s) {
  s = Math.round(Number(s) || 0);
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

// { tigers: [row], opp: [row], inHome: { tigers: [evt], opp: [evt] } }
// row: { key, team, label, name, personalCount, personalSecs, techCount,
//        techSecs, totalSecs, items: [evt], out }
function penaltyTally(game) {
  var res = { tigers: [], opp: [], inHome: { tigers: [], opp: [] } };
  if (!game || !game.events) return res;
  var byKey = {}, ejected = {};
  game.events.forEach(function(e) {
    if (e.metric === 'Ejection' || e.type === 'ejection') { ejected[e.playerId] = true; return; }
    if (e.metric !== 'Penalty') return;
    var isOpp = e.team === 'opponent' || String(e.playerId).indexOf('Opp ') === 0;
    if (e.playerId === 'In-Home' || e.playerId === 'Opp In-Home') {
      res.inHome[isOpp ? 'opp' : 'tigers'].push(e);
      return;
    }
    var key = e.playerId;
    var row = byKey[key];
    if (!row) {
      var jersey = isOpp ? String(e.playerJersey || String(key).replace(/^Opp #/, '')) : String(e.playerJersey || '');
      row = byKey[key] = { key: key, team: isOpp ? 'opp' : 'tigers', label: '#' + jersey,
        name: isOpp ? '' : (e.playerName || ''), personalCount: 0, personalSecs: 0, techCount: 0,
        techSecs: 0, totalSecs: 0, items: [], out: false };
      res[row.team].push(row);
    }
    var secs = Number(e.penDuration) || 0;
    if (e.penType === 'Personal') { row.personalCount++; row.personalSecs += secs; }
    else { row.techCount++; row.techSecs += secs; }
    row.totalSecs += secs;
    row.items.push(e);
  });
  ['tigers', 'opp'].forEach(function(t) {
    res[t].forEach(function(r) { r.out = r.personalSecs >= FOUL_OUT_SECS || !!ejected[r.key]; });
    res[t].sort(function(a, b) { return b.personalSecs - a.personalSecs || b.totalSecs - a.totalSecs || a.label.localeCompare(b.label); });
  });
  return res;
}

function foulLevel(row) {
  if (row.out) return 'out';
  if (row.personalSecs >= 240) return 'danger';
  if (row.personalSecs >= FOUL_WARN_SECS) return 'warn';
  return '';
}

// ---- Penalties tab ----
function renderPenaltiesTab() {
  var box = document.getElementById('penaltiesView');
  if (!box) return;
  var game = state.activeGame;
  if (!game) {
    box.innerHTML = '<p class="pen-empty">No game in progress. Penalties show here during a game.</p>';
    return;
  }
  var t = penaltyTally(game);
  var oppName = escapeHtml(game.opponent || 'Opponent');
  function table(rows, title) {
    var h = '<div class="pen-team"><h3>' + title + '</h3>';
    if (!rows.length) return h + '<p class="pen-empty">No penalties.</p></div>';
    h += '<table class="pen-table"><thead><tr><th>#</th><th class="l">Player</th><th>Pers.</th><th>Pers. time</th>'
      + '<th>Tech.</th><th>Total</th></tr></thead><tbody>';
    rows.forEach(function(r) {
      var lvl = foulLevel(r);
      h += '<tr class="pen-row ' + lvl + '" data-key="' + escapeHtml(r.key) + '">'
        + '<td><b>' + escapeHtml(r.label) + '</b></td>'
        + '<td class="l">' + escapeHtml(r.name) + (r.out ? ' <span class="pen-out">OUT</span>' : '') + '</td>'
        + '<td>' + r.personalCount + '</td><td><b>' + fmtPenSecs(r.personalSecs) + '</b></td>'
        + '<td>' + r.techCount + '</td><td>' + fmtPenSecs(r.totalSecs) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function inHomeLine(list, who) {
    if (!list.length) return '';
    var secs = list.reduce(function(a, e) { return a + (Number(e.penDuration) || 0); }, 0);
    return '<p class="pen-inhome">' + who + ' In-Home (team fouls, not charged to a player): '
      + list.length + ' &middot; ' + fmtPenSecs(secs) + '</p>';
  }
  box.innerHTML = '<p class="pen-rule">A player fouls out at <b>5:00 of personal fouls</b>. Technical fouls don\'t count. '
    + 'Tap a player for every penalty.</p>'
    + table(t.tigers, 'Tigers') + inHomeLine(t.inHome.tigers, 'Tigers')
    + table(t.opp, oppName) + inHomeLine(t.inHome.opp, oppName);
  Array.prototype.forEach.call(box.querySelectorAll('.pen-row'), function(tr) {
    tr.addEventListener('click', function() { openFoulDetail(tr.getAttribute('data-key')); });
  });
}

// ---- Game screen: players at 3:00+ of personal fouls ----
function renderFoulWatch() {
  var el = document.getElementById('foulWatch');
  if (!el) return;
  var game = state.activeGame;
  if (!game) { el.style.display = 'none'; el.innerHTML = ''; return; }
  var t = penaltyTally(game);
  var rows = t.tigers.concat(t.opp).filter(function(r) { return r.personalSecs >= FOUL_WARN_SECS || r.out; })
    .sort(function(a, b) { return b.personalSecs - a.personalSecs; });
  if (!rows.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = '<span class="fw-title">Fouls</span>' + rows.map(function(r) {
    var who = (r.team === 'opp' ? 'Opp ' : '') + r.label;
    return '<button class="fw-chip ' + foulLevel(r) + '" data-key="' + escapeHtml(r.key) + '">'
      + (r.out ? 'OUT ' : '&#9888; ') + escapeHtml(who) + ' ' + fmtPenSecs(r.personalSecs) + '</button>';
  }).join('');
  el.style.display = '';
  Array.prototype.forEach.call(el.querySelectorAll('.fw-chip'), function(b) {
    b.addEventListener('click', function() { openFoulDetail(b.getAttribute('data-key')); });
  });
}

// ---- One player's penalties ----
function openFoulDetail(key) {
  var t = penaltyTally(state.activeGame);
  var row = t.tigers.concat(t.opp).filter(function(r) { return r.key === key; })[0];
  if (!row) return;
  var team = row.team === 'opp' ? (state.activeGame.opponent || 'Opponent') : 'Tigers';
  document.getElementById('foulDetailTitle').textContent = row.label + (row.name ? ' ' + row.name : '') + ' (' + team + ')';
  var left = FOUL_OUT_SECS - row.personalSecs;
  var status = row.out ? '<div class="fd-status out">FOULED OUT &mdash; tell the nearest official</div>'
    : '<div class="fd-status ' + foulLevel(row) + '">' + fmtPenSecs(left) + ' of personal fouls left before fouling out</div>';
  var items = row.items.slice().sort(function(a, b) { return String(a.timestamp).localeCompare(String(b.timestamp)); });
  var rows = items.map(function(e) {
    return '<tr><td>' + escapeHtml(e.quarter) + '</td><td>' + escapeHtml(e.penClock || '') + '</td>'
      + '<td class="l">' + escapeHtml(e.penName || '') + (e.locked ? ' <span class="fd-nr">NR</span>' : '') + '</td>'
      + '<td>' + (e.penType === 'Personal' ? 'Personal' : 'Technical') + '</td>'
      + '<td><b>' + fmtPenSecs(e.penDuration) + '</b></td></tr>';
  }).join('');
  document.getElementById('foulDetailBody').innerHTML = status
    + '<div class="fd-sum">Personal: <b>' + row.personalCount + '</b> (' + fmtPenSecs(row.personalSecs) + ') &middot; '
    + 'Technical: <b>' + row.techCount + '</b> (' + fmtPenSecs(row.techSecs) + ') &middot; Total ' + fmtPenSecs(row.totalSecs) + '</div>'
    + '<table class="pen-table"><thead><tr><th>Qtr</th><th>Clock</th><th class="l">Penalty</th><th>Type</th><th>Time</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';
  document.getElementById('foulDetailModal').classList.add('show');
}

function closeFoulDetail() {
  document.getElementById('foulDetailModal').classList.remove('show');
}
