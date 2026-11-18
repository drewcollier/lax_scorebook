// js/game.js - Start / end a game, the Start-Game details pop-up, quarters, timeouts, and the man-up/man-down (EMO) indicator.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// GAME LIFECYCLE
// ============================================================

function startGame() {
  var opponent = document.getElementById('setupOpponent').value.trim();
  if (!opponent) {
    showToast('Please enter opponent name', 'error');
    return;
  }
  // Collect optional game meta first (never blocks the start).
  openGameMetaModal();
}

// Build the game once meta is entered (or skipped).
function finalizeStartGame() {
  var opponent = document.getElementById('setupOpponent').value.trim();
  var date = document.getElementById('setupDate').value;
  var location = document.getElementById('setupLocation').value;

  if (!opponent) {
    showToast('Please enter opponent name', 'error');
    return;
  }
  if (!date) {
    date = localDateStr();
  }

  // Validate weather temp if provided: 32-95 (°F). Blank is allowed (optional).
  var tempRaw = (document.getElementById('metaWeatherTemp').value || '').trim();
  var tempDigits = tempRaw.replace(/[^0-9]/g, '');
  if (tempDigits !== '') {
    var t = parseInt(tempDigits, 10);
    if (t < 32 || t > 95) {
      showToast('Temp must be between 32 and 95°F', 'error');
      return;
    }
  }

  var meta = {
    weatherTemp: tempDigits ? (tempDigits + '\u00b0F') : '',
    weatherCond: document.getElementById('metaWeatherCond').value || '',
    gameStart: (document.getElementById('metaGameStart').value || '').trim(),
    headOfficial: metaPersonValue('metaHeadOfficial'),
    umpire: metaPersonValue('metaUmpire'),
    fieldJudge: metaPersonValue('metaFieldJudge'),
    tigersScorer: metaPersonValue('metaScorer'),
    tigersTimer: metaPersonValue('metaTimer'),
    oppScorer: (document.getElementById('metaOppScorer').value || '').trim()
  };

  state.activeGame = {
    id: 'G' + Date.now(),
    opponent: opponent,
    date: date,
    location: location,
    homeScore: 0,
    awayScore: 0,
    meta: meta,
    events: []
  };
  state.currentQuarter = 'Q1';
  state.currentStrength = 'Even';
  state.ejectedPlayers = [];
  state.penaltyMinutes = {};
  state.penaltyPersonalCount = {};
  state.penaltyPersonalSeconds = {};
  state.ejectedKeys = [];
  state.oppInHomeJersey = '';
  state.timeoutsTigers = 3;
  state.timeoutsOpp = 3;
  state.emoOpen = false;
  
  saveState();
  document.getElementById('gameMetaModal').classList.remove('show');
  renderGameUI();
  showToast('Game started vs ' + opponent, 'success');
}

// ============================================================
// GAME META (Start-Game pop-up: weather, officials, scorer/timer)
// ============================================================
function openGameMetaModal() {
  // Default Game Start to the current local time (editable; admin-only field).
  var now = new Date();
  var hh = now.getHours(), mm = now.getMinutes();
  var ampm = hh >= 12 ? 'PM' : 'AM';
  var h12 = ((hh + 11) % 12) + 1;
  var startStr = h12 + ':' + (mm < 10 ? '0' + mm : mm) + ' ' + ampm;
  document.getElementById('metaGameStart').value = startStr;
  // Reset the optional fields.
  document.getElementById('metaWeatherTemp').value = '';
  document.getElementById('metaWeatherCond').value = '';
  document.getElementById('metaOppScorer').value = '';
  buildOfficialDropdowns();
  document.getElementById('gameMetaModal').classList.add('show');
}

function closeGameMetaModal() {
  document.getElementById('gameMetaModal').classList.remove('show');
}

// --- Game Start time keypad (HH:MM AM/PM, validated) ---
function openGameStartKeypad() {
  // Seed from the current field value if parseable, else blank.
  state.gsDigits = '';
  var cur = (document.getElementById('metaGameStart').value || '');
  var m = cur.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    var hh = ('0' + m[1]).slice(-2);
    state.gsDigits = hh + m[2];
    state.gsAmPm = m[3].toUpperCase();
  } else {
    state.gsAmPm = 'PM';
  }
  updateGameStartDisplay();
  gameStartRenderAmPm();
  document.getElementById('gameStartModal').classList.add('show');
}

function closeGameStartKeypad() {
  document.getElementById('gameStartModal').classList.remove('show');
}

function gameStartSetAmPm(v) {
  state.gsAmPm = v;
  gameStartRenderAmPm();
}

function gameStartRenderAmPm() {
  var am = document.getElementById('gsAM'), pm = document.getElementById('gsPM');
  if (am) am.classList.toggle('btn-primary', state.gsAmPm === 'AM');
  if (pm) pm.classList.toggle('btn-primary', state.gsAmPm === 'PM');
}

function updateGameStartDisplay() {
  var d = state.gsDigits;
  var disp = document.getElementById('gameStartDisplay');
  var ok = document.getElementById('gameStartOk');
  if (d.length === 0) {
    disp.innerHTML = '<span class="pen-clock-empty">--:--</span>';
  } else {
    var padded = (d + '____').slice(0, 4);
    var hh = padded.slice(0, 2).replace(/_/g, '\u2013');
    var mm = padded.slice(2, 4).replace(/_/g, '\u2013');
    disp.textContent = hh + ':' + mm + ' ' + state.gsAmPm;
  }
  if (ok) ok.style.opacity = (d.length === 4) ? '1' : '0.4';
}

function gameStartDigit(n) {
  if (state.gsDigits.length >= 4) return;
  var next = state.gsDigits + n;
  // Validate: hours 01-12 (first two digits), minutes 00-59 (last two).
  if (next.length === 2 && (parseInt(next, 10) < 1 || parseInt(next, 10) > 12)) {
    showToast('Hour must be 1-12', 'error');
    return;
  }
  if (next.length === 4 && parseInt(next.slice(2, 4), 10) > 59) {
    showToast('Minutes cannot exceed 59', 'error');
    return;
  }
  state.gsDigits = next;
  updateGameStartDisplay();
}

function gameStartBack() {
  state.gsDigits = state.gsDigits.slice(0, -1);
  updateGameStartDisplay();
}

function gameStartConfirm() {
  if (state.gsDigits.length !== 4) {
    showToast('Enter all 4 digits', 'error');
    return;
  }
  var hh = parseInt(state.gsDigits.slice(0, 2), 10); // drop leading zero for display
  var mm = state.gsDigits.slice(2, 4);
  var out = hh + ':' + mm + ' ' + state.gsAmPm;
  document.getElementById('metaGameStart').value = out;
  closeGameStartKeypad();
}

// Populate the people dropdowns from state.officials, filtered by role.
// Each dropdown gets a blank first option and an "Other…" option (free-text).
function buildOfficialDropdowns() {
  fillPeopleSelect('metaHeadOfficial', 'Official');
  fillPeopleSelect('metaUmpire', 'Official');
  fillPeopleSelect('metaFieldJudge', 'Official');
  fillPeopleSelect('metaScorer', 'Scorer');
  fillPeopleSelect('metaTimer', 'Timer');
}

function fillPeopleSelect(selectId, role) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var names = (state.officials || [])
    .filter(function(o) { return String(o.Role).toLowerCase() === role.toLowerCase(); })
    .map(function(o) { return o.Name; });
  var html = '<option value="">— select —</option>';
  names.forEach(function(n) { html += '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>'; });
  html += '<option value="__OTHER__">Other… (type)</option>';
  sel.innerHTML = html;
  // Toggle the paired free-text box when "Other…" is chosen.
  sel.onchange = function() {
    var other = document.getElementById(selectId + 'Other');
    if (other) other.style.display = (sel.value === '__OTHER__') ? 'block' : 'none';
  };
}

// Resolve a people field: the free-text box wins when "Other…" is selected.
function metaPersonValue(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === '__OTHER__') {
    var other = document.getElementById(selectId + 'Other');
    return other ? (other.value || '').trim() : '';
  }
  return sel.value || '';
}

function endGame() {
  if (!state.activeGame) return;
  if (!confirm('End this game and export data?')) return;

  var game = state.activeGame;
  var finalScore = game.homeScore + '-' + game.awayScore;

  // Archive FULL game to history (events + metadata) so it can always be re-pushed.
  state.gameHistory.push({
    id: game.id,
    opponent: game.opponent,
    date: game.date,
    location: game.location,
    score: finalScore,
    eventCount: game.events.length,
    events: game.events,      // v3: keep full event data for manual re-push
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    meta: game.meta || {},    // v3.13: carry game meta (weather/officials/etc.) so re-push includes it
    synced: false             // v3: set true only when a push confirms success
  });

  // Keep the History list short, but never remove a game that hasn't synced.
  trimHistory();

  // Attempt an immediate push (Option A). It always keeps the data either way;
  // pushGameFromHistory marks synced=true only on a confirmed success.
  pushGameFromHistory(game.id, 'auto');

  // Clear active game
  state.activeGame = null;
  state.ejectedPlayers = [];
  state.penaltyMinutes = {};
  state.penaltyPersonalCount = {};
  state.penaltyPersonalSeconds = {};
  state.ejectedKeys = [];
  state.oppInHomeJersey = '';

  // v3: clear the setup fields so the previous opponent isn't reused by mistake.
  var oppEl = document.getElementById('setupOpponent');
  var locEl = document.getElementById('setupLocation');
  var dateEl = document.getElementById('setupDate');
  if (oppEl) oppEl.value = '';
  if (locEl) locEl.value = '';
  if (dateEl) dateEl.value = '';

  saveState();
  renderGameUI();
  renderHistory();
}

// History keeps up to MAX_HISTORY games. Only games already SYNCED to the
// workbook are removed (oldest first); unsynced games are always kept so their
// stats can never be lost before they reach the Sheet.
var MAX_HISTORY = 3;
function trimHistory() {
  while (state.gameHistory.length > MAX_HISTORY) {
    var idx = -1;
    for (var i = 0; i < state.gameHistory.length; i++) {
      if (state.gameHistory[i].synced === true) { idx = i; break; }
    }
    if (idx === -1) break; // everything left is unsynced -> keep it all
    state.gameHistory.splice(idx, 1);
  }
}

// Today's date (YYYY-MM-DD) on this device's own clock. toISOString() uses UTC,
// which is already tomorrow in Indiana after about 7-8 pm.
function localDateStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function renderGameUI() {
  var setup = document.getElementById('gameSetup');
  var active = document.getElementById('activeGameUI');

  if (state.activeGame) {
    setup.style.display = 'none';
    active.style.display = 'block';
    document.getElementById('homeScore').textContent = state.activeGame.homeScore;
    document.getElementById('awayScore').textContent = state.activeGame.awayScore;
    document.getElementById('oppName').textContent = state.activeGame.opponent.toUpperCase();
    renderQuarterBar();
    syncStrengthFromPenalties();
    renderTimeouts();
    renderPlayerGrid();
    sfApplyView();
    renderEventLog();
  } else {
    setup.style.display = 'block';
    active.style.display = 'none';
    // Set default date to today
    document.getElementById('setupDate').value = localDateStr();
  }
}

// ============================================================
// QUARTER MANAGEMENT
// ============================================================

function setQuarter(q) {
  var prevQuarter = state.currentQuarter;
  state.currentQuarter = q;
  // Timeouts reset per half / OT (no carry-over): entering Q3 -> 3 each,
  // entering OT1 or OT2 -> 1 each. Only reset when actually CHANGING into that period.
  if (q !== prevQuarter) {
    if (q === 'Q3') { state.timeoutsTigers = 3; state.timeoutsOpp = 3; }
    else if (q === 'OT1' || q === 'OT2') { state.timeoutsTigers = 1; state.timeoutsOpp = 1; }
    renderTimeouts();
    saveState();
  }
  renderQuarterBar();
  renderEventLog();
}

// --- Timeouts ---
// 3 per half (reset at Q3), 1 per OT; no carry-over. Dot indicators like a scoreboard.
function chargeTimeout(team) {
  if (!state.activeGame) return;
  var key = (team === 'tigers') ? 'timeoutsTigers' : 'timeoutsOpp';
  if (state[key] <= 0) return; // none left
  state[key] -= 1;
  state.activeGame.events.push({
    id: newEventId(),
    type: 'timeout',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: (team === 'tigers') ? 'TEAM' : 'Opp',
    playerName: (team === 'tigers') ? 'Tigers' : 'Opponent',
    playerJersey: '',
    metric: 'TIMEOUT',
    strength: state.currentStrength,
    penDuration: ''
  });
  saveState();
  renderTimeouts();
  renderEventLog();
  showToast((team === 'tigers' ? 'Tigers' : 'Opponent') + ' timeout (' + state.currentQuarter + ')', 'info');
}

function renderTimeouts() {
  renderTimeoutSide('tigers', state.timeoutsTigers, 'toDotsTigers', 'toTigersBtn');
  renderTimeoutSide('opp', state.timeoutsOpp, 'toDotsOpp', 'toOppBtn');
}

function renderTimeoutSide(team, remaining, dotsId, btnId) {
  // Max dots: 3 in regulation, 1 in OT.
  var isOT = (state.currentQuarter === 'OT1' || state.currentQuarter === 'OT2');
  var maxDots = isOT ? 1 : 3;
  var dots = document.getElementById(dotsId);
  var btn = document.getElementById(btnId);
  if (dots) {
    var html = '';
    for (var i = 0; i < maxDots; i++) {
      var used = (i >= remaining) ? ' used' : '';
      html += '<span class="dot' + used + '">\u25cf</span>';
    }
    dots.innerHTML = html;
  }
  if (btn) {
    if (remaining <= 0) btn.classList.add('spent');
    else btn.classList.remove('spent');
    btn.disabled = (remaining <= 0);
  }
}

function renderQuarterBar() {
  document.querySelectorAll('.quarter-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-q') === state.currentQuarter);
  });
  var label = document.getElementById('logQuarterLabel');
  if (label) label.textContent = state.currentQuarter;
}

// ============================================================
// STRENGTH MANAGEMENT
// ============================================================

function setStrength(str) {
  var prev = state.currentStrength;
  // EMO (extra-man) tracking (A1): entering Man-Up opens an opportunity;
  // leaving Man-Up without a score closes it as Failed.
  if (str === 'Man-Up' && prev !== 'Man-Up') {
    state.emoOpen = true;
  } else if (prev === 'Man-Up' && str !== 'Man-Up') {
    // Left man-up with an opportunity still open (no goal was logged) -> Fail.
    // Not when Undo removed the penalty: that man-up never really happened.
    if (state.emoOpen) {
      if (!undoInProgress) recordEmoResult('EMO_Fail');
      state.emoOpen = false;
    }
  }
  state.currentStrength = str;
  renderStrengthBar();
}

// Write an EMO outcome event. The outcome lives in Action_Type itself:
// 'EMO_Success' (scored on the man-up) or 'EMO_Fail' (opportunity missed).
// Returns the new EMO event's id.
function recordEmoResult(metricName) {
  if (!state.activeGame) return '';
  var emoId = newEventId();
  state.activeGame.events.push({
    id: emoId,
    type: 'emo',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: 'TEAM',
    playerName: 'EMO',
    playerJersey: '',
    metric: metricName,   // 'EMO_Success' or 'EMO_Fail'
    strength: state.currentStrength,
    penDuration: ''
  });
  saveState();
  renderEventLog();
  return emoId;
}

function renderStrengthBar() {
  var c = penaltyCounts();
  var gap = Math.abs(c.opponent - c.tigers);
  var base = { 'Even': 'EVEN', 'Man-Up': 'MAN-UP', 'Man-Down': 'MAN-DOWN' };
  document.querySelectorAll('.strength-btn').forEach(function(btn) {
    var str = btn.getAttribute('data-str');
    btn.className = 'strength-btn';
    var text = base[str] || str;
    if (str === state.currentStrength) {
      if (str === 'Even') {
        btn.classList.add('active-even');
        if (c.tigers > 0) text += ' (' + c.tigers + ' v ' + c.opponent + ')';
      } else if (str === 'Man-Up') {
        btn.classList.add('active-up');
        if (gap > 1) text += ' (' + gap + ')';
      } else if (str === 'Man-Down') {
        btn.classList.add('active-down');
        if (gap > 1) text += ' (' + gap + ')';
      }
    }
    btn.textContent = text;
  });
  renderActivePenalties();
}
