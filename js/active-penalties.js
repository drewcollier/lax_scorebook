// js/active-penalties.js - The Active penalties box (single source of truth for strength) and what a goal does to running penalties.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ------------------------------------------------------------
// ACTIVE PENALTIES (V3.22). The penalty list is the single source of truth:
// strength (Even / Man-Up / Man-Down) is worked out from it, and each penalty
// is cleared one at a time with its own "Served" button.
// Stored on the game: activeGame.activePenalties = [{
//   id, team ('tigers'|'opponent'), label, locked (never releasable),
//   duration (s), startQ, startClock (s left on the game clock, or null),
//   lockedSecs (overlap with the other team's simultaneous foul) }]
// ------------------------------------------------------------
var PERIOD_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2'];

function periodLength(q) {
  return (q === 'OT1' || q === 'OT2') ? 240 : 720; // 12:00 quarters, 4:00 overtime
}

// "MM:SS" -> seconds, or null if it isn't a clock.
function clockToSeconds(str) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
}

// Game time served between two clock readings (the clock counts DOWN, and
// penalties carry across quarters and half-time). Returns null when the
// readings can't be compared (missing clock, or "now" is before "start").
function elapsedBetween(startQ, startSec, nowQ, nowSec) {
  var i1 = PERIOD_ORDER.indexOf(startQ), i2 = PERIOD_ORDER.indexOf(nowQ);
  if (i1 === -1 || i2 === -1 || i2 < i1 || startSec === null || nowSec === null) return null;
  if (nowSec > periodLength(nowQ) || startSec > periodLength(startQ)) return null;
  if (i1 === i2) {
    return startSec >= nowSec ? (startSec - nowSec) : null;
  }
  var total = startSec;
  for (var k = i1 + 1; k < i2; k++) total += periodLength(PERIOD_ORDER[k]);
  total += periodLength(nowQ) - nowSec;
  return total;
}

function activePenaltyList() {
  return (state.activeGame && state.activeGame.activePenalties) || [];
}

function penaltyCounts() {
  var c = { tigers: 0, opponent: 0 };
  activePenaltyList().forEach(function(p) { if (c[p.team] !== undefined) c[p.team]++; });
  return c;
}

function strengthFromPenalties() {
  var c = penaltyCounts();
  if (c.opponent > c.tigers) return 'Man-Up';
  if (c.tigers > c.opponent) return 'Man-Down';
  return 'Even';
}

// Make the strength indicator match the list. setStrength keeps the
// extra-man (EMO) tracking in step.
function syncStrengthFromPenalties() {
  var s = strengthFromPenalties();
  if (s !== state.currentStrength) setStrength(s);
  else renderStrengthBar();
}

function penaltyDurLabel(sec) {
  return sec >= 60 ? (sec / 60) + ' min' : sec + 's';
}

function addActivePenalty(evt) {
  if (!state.activeGame || !evt) return;
  if (!state.activeGame.activePenalties) state.activeGame.activePenalties = [];
  var list = state.activeGame.activePenalties;
  var who = evt.playerJersey ? ('#' + evt.playerJersey)
          : (evt.team === 'opponent' ? 'Opp In-Home' : 'In-Home');
  var entry = {
    id: evt.id,
    team: evt.team,
    label: who + ' ' + (evt.penName || 'Penalty') + ' ' + penaltyDurLabel(evt.penDuration || 0),
    locked: !!evt.locked,
    duration: evt.penDuration || 0,
    startQ: evt.quarter,
    startClock: clockToSeconds(evt.penClock),
    lockedSecs: 0
  };
  // Simultaneous fouls (both teams, same quarter, same clock reading): the
  // overlapping time cannot be released by a goal, for either team's player.
  if (entry.startClock !== null) {
    list.forEach(function(o) {
      if (o.team !== entry.team && o.startQ === entry.startQ && o.startClock === entry.startClock) {
        var overlap = Math.min(o.duration, entry.duration);
        o.lockedSecs = Math.max(o.lockedSecs || 0, overlap);
        entry.lockedSecs = Math.max(entry.lockedSecs, overlap);
      }
    });
  }
  list.push(entry);
  syncStrengthFromPenalties();
}

function removeActivePenalty(eventId) {
  if (!state.activeGame || !state.activeGame.activePenalties) return;
  state.activeGame.activePenalties = state.activeGame.activePenalties.filter(function(p) {
    return p.id !== eventId;
  });
  syncStrengthFromPenalties();
}

// Scorekeeper taps "Served" on one penalty.
function servePenalty(eventId) {
  removeActivePenalty(eventId);
  saveState();
}

function clearAllPenalties() {
  if (!activePenaltyList().length) return;
  if (!window.confirm('Clear ALL active penalties, including locked ones?')) return;
  state.activeGame.activePenalties = [];
  syncStrengthFromPenalties();
  saveState();
}

// ------------------------------------------------------------
// GOAL vs PENALTIES (V3.22). Runs once a goal's game clock is known.
//  1. Penalties that have fully run out are cleared. A goal after that is NOT
//     a man-up / man-down goal (strength falls back to what is really left).
//  2. A Tigers goal while still Man-Up counts as an extra-man success.
//  3. The SCORING team's own penalties are never touched. On the team that was
//     scored on, each releasable penalty is released: not locked, and its
//     simultaneous-foul (overlap) time has been served.
// Everything removed is saved on the goal event so Undo can put it back.
// ------------------------------------------------------------
function penaltyServedSeconds(p, q, nowSec) {
  return elapsedBetween(p.startQ, p.startClock, q, nowSec);
}

function expireFinishedPenalties(q, nowSec) {
  var expired = [], keep = [];
  activePenaltyList().forEach(function(p) {
    var served = penaltyServedSeconds(p, q, nowSec);
    if (served !== null && served >= p.duration) {
      var copy = {};
      for (var k in p) copy[k] = p[k];
      copy.servedSecs = served;
      expired.push(copy);
    } else {
      keep.push(p);
    }
  });
  if (expired.length) {
    state.activeGame.activePenalties = keep;
    syncStrengthFromPenalties();
  }
  return expired;
}

function releasePenaltiesForGoal(scoringTeam, q, nowSec) {
  var defending = (scoringTeam === 'tigers') ? 'opponent' : 'tigers';
  var released = [], keep = [];
  activePenaltyList().forEach(function(p) {
    if (p.team !== defending) { keep.push(p); return; }
    var served = penaltyServedSeconds(p, q, nowSec);
    var releasable = !p.locked && served !== null && served >= (p.lockedSecs || 0);
    if (releasable) released.push(p); else keep.push(p);
  });
  if (released.length) {
    state.activeGame.activePenalties = keep;
    syncStrengthFromPenalties();
  }
  return released;
}

// team = who SCORED ('tigers' | 'opponent'); goalEvt = the Goal / Opp_Goal
// event; clockStr = 'MM:SS' or '' when the clock was left blank.
function resolveGoalAgainstPenalties(team, goalEvt, clockStr) {
  if (!state.activeGame) return;
  var nowSec = clockToSeconds(clockStr);
  var q = goalEvt ? goalEvt.quarter : state.currentQuarter;
  var fx = { expired: [], released: [] };

  if (nowSec !== null) fx.expired = expireFinishedPenalties(q, nowSec);

  // Extra-man success only if the Tigers are STILL man-up after expiry.
  if (team === 'tigers' && state.emoOpen && state.currentStrength === 'Man-Up') {
    var emoId = recordEmoResult('EMO_Success');
    if (goalEvt) goalEvt.emoEventId = emoId; // Undo of this goal also removes the EMO success
    state.emoOpen = false;
  }

  if (nowSec !== null) fx.released = releasePenaltiesForGoal(team, q, nowSec);

  if (goalEvt && (fx.expired.length || fx.released.length)) goalEvt.penaltyEffects = fx;
  saveState();
  renderEventLog();

  if (fx.released.length) {
    showToast('Goal released: ' + fx.released.map(function(p) { return p.label; }).join(', '), 'info');
  }
  if (fx.expired.length) {
    showPenaltyNotice(fx.expired);
  }
}

function servedLabel(sec) {
  sec = Math.round(sec);
  return sec < 60 ? (sec + 's') : (Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2));
}

function showPenaltyNotice(expired) {
  var body = document.getElementById('penaltyNoticeBody');
  if (!body) return;
  body.innerHTML = '';
  expired.forEach(function(p) {
    var line = document.createElement('div');
    line.style.marginBottom = '6px';
    line.textContent = (p.team === 'tigers' ? 'Tigers ' : 'Opponent ') + p.label
      + ' (' + servedLabel(p.servedSecs || p.duration) + ' served)';
    body.appendChild(line);
  });
  var tip = document.createElement('div');
  tip.style.cssText = 'margin-top:10px; font-size:0.8rem; color:var(--text-secondary); font-weight:400;';
  tip.textContent = 'These penalties had already run out and were cleared. That goal was not counted as a man-up or man-down goal. Tap Served when a penalty ends to keep the box up to date.';
  body.appendChild(tip);
  document.getElementById('penaltyNoticeModal').classList.add('show');
}

function closePenaltyNotice() {
  document.getElementById('penaltyNoticeModal').classList.remove('show');
}

// Undo on a goal puts back every penalty that goal cleared or released.
function restorePenaltiesFromGoal(evt) {
  var fx = evt && evt.penaltyEffects;
  if (!fx || !state.activeGame) return;
  if (!state.activeGame.activePenalties) state.activeGame.activePenalties = [];
  (fx.expired || []).concat(fx.released || []).forEach(function(p) {
    var copy = {};
    for (var k in p) if (k !== 'servedSecs') copy[k] = p[k];
    state.activeGame.activePenalties.push(copy);
  });
  syncStrengthFromPenalties();
}

function renderActivePenalties() {
  var box = document.getElementById('activePenalties');
  if (!box) return;
  var list = activePenaltyList();
  if (!list.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = '';

  var head = document.createElement('div');
  head.className = 'ap-head';
  var title = document.createElement('span');
  title.className = 'ap-title';
  title.textContent = 'Active penalties';
  head.appendChild(title);
  var clearAll = document.createElement('button');
  clearAll.className = 'ap-clear-all';
  clearAll.textContent = 'Clear all';
  clearAll.addEventListener('click', clearAllPenalties);
  head.appendChild(clearAll);
  box.appendChild(head);

  [['tigers', 'Tigers'], ['opponent', 'Opponent']].forEach(function(t) {
    var mine = list.filter(function(p) { return p.team === t[0]; });
    if (!mine.length) return;
    var line = document.createElement('div');
    line.className = 'ap-line';
    var team = document.createElement('div');
    team.className = 'ap-team';
    team.textContent = t[1];
    line.appendChild(team);
    mine.forEach(function(p) {
      var chip = document.createElement('div');
      chip.className = 'ap-chip' + (p.locked ? ' is-locked' : '');
      var txt = document.createElement('span');
      txt.className = 'ap-chip-text';
      var note = '';
      if (p.locked) note = ' (LOCKED)';
      else if (p.lockedSecs > 0) note = ' (overlap ' + p.lockedSecs + 's locked)';
      txt.textContent = p.label + note;
      chip.appendChild(txt);
      var served = document.createElement('button');
      served.className = 'ap-served';
      served.textContent = 'Served';
      served.addEventListener('click', function() { servePenalty(p.id); });
      chip.appendChild(served);
      line.appendChild(chip);
    });
    box.appendChild(line);
  });
}
