// js/stat-entry.js - Recording player stats: player grid, By Stat entry (stat -> jersey -> clock -> zone), shot-zone picker, logStat() and its cascades.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// PLAYER GRID (GAME TAB)
// ============================================================

function renderPlayerGrid() {
  var grid = document.getElementById('playerGrid');
  if (!grid) return;
  grid.innerHTML = '';

  var oppPanel = document.getElementById('opponentPanel');

  // If Opponent filter is active, show opponent panel and hide player grid content.
  // In By Stat view the opponent panel is always shown (no filter bar there).
  if (state.currentFilter === 'Opponent') {
    if (oppPanel) oppPanel.style.display = 'block';
    return;
  } else {
    if (oppPanel) oppPanel.style.display = (sfGetView() === 'stat') ? 'block' : 'none';
  }

  var filtered = getFilteredPlayers();
  var starters = filtered.filter(function(p) { return p.isStarter; });
  var bench = filtered.filter(function(p) { return !p.isStarter; });

  starters.forEach(function(p) {
    grid.appendChild(createPlayerCard(p, true));
  });

  if (bench.length > 0 && starters.length > 0) {
    var divider = document.createElement('div');
    divider.className = 'player-divider';
    divider.textContent = 'Bench';
    grid.appendChild(divider);
  }

  bench.forEach(function(p) {
    grid.appendChild(createPlayerCard(p, false));
  });
}

function createPlayerCard(player, isStarter) {
  var card = document.createElement('div');
  card.className = 'player-card' + (isStarter ? ' starter' : '');
  
  if (state.ejectedPlayers.indexOf(player.Player_ID) !== -1) {
    card.classList.add('ejected');
  }

  card.innerHTML = '<div class="jersey">#' + escapeHtml(player.Jersey) + '</div>'
    + '<div class="name">' + escapeHtml(player.Name) + '</div>'
    + '<div class="pos">' + escapeHtml(player.Position) + '</div>';

  card.addEventListener('click', function() {
    if (state.ejectedPlayers.indexOf(player.Player_ID) !== -1) return;
    openStatModal(player);
  });

  return card;
}

function getFilteredPlayers() {
  var filter = state.currentFilter;
  return playersByJersey(state.players.filter(function(p) {
    if (filter === 'All') return true;
    if (filter === 'Starters') return p.isStarter;
    return p.Position === filter;
  }));
}

function setFilter(f) {
  state.currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === f);
  });
  renderPlayerGrid();
}

// ============================================================
// STAT RECORDING
// ============================================================

var selectedPlayer = null;

function openStatModal(player) {
  selectedPlayer = player;
  document.getElementById('statModalTitle').textContent = '#' + player.Jersey + ' ' + player.Name;
  // Show/hide goalie-only buttons based on player position
  var isGoalie = (player.Position === 'Goalie');
  document.querySelectorAll('.stat-btn.goalie-only').forEach(function(btn) {
    if (isGoalie) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });
  document.getElementById('statModal').classList.add('show');
}

function closeStatModal() {
  document.getElementById('statModal').classList.remove('show');
  selectedPlayer = null;
}

// ============================================================
// STAT-FIRST ENTRY (V3.20): Stat -> Jersey -> (Time) -> (Zone)
// ============================================================
// The spotter calls "Ground Ball, #3": tap the stat, key the jersey, OK.
// Jersey entry is max 2 digits and must match the downloaded roster.
var SF_LABELS = {
  GB: 'Ground Ball', TO: 'Turnover', CTO: 'Caused Turnover', INT: 'Interception',
  FOW: 'Face Off Won', FOL: 'Face Off Lost', Save: 'Save', GA: 'Goal Allowed',
  Shot: 'Shot', SOG: 'Shot on Goal', Goal: 'Goal'
};
var SF_GOALIE_ONLY = { Save: true, GA: true };
// step: 'player' (any stat), then for Goal: 'assist' -> 'clock' -> zone picker.
// A Goal is recorded only after the zone screen, so Cancel at any earlier
// step leaves nothing behind.
var sfState = { metric: null, step: 'player', digits: '', clock: '', scorer: null, assister: null };

function sfStartStat(metric) {
  if (!state.activeGame) {
    showToast('Start a game first', 'error');
    return;
  }
  sfState.metric = metric;
  sfState.scorer = null;
  sfState.assister = null;
  sfState.clock = '';
  document.getElementById('sfJerseyTitle').textContent = SF_LABELS[metric] || metric;
  sfGoToStep('player');
  document.getElementById('sfJerseyModal').classList.add('show');
}

function sfGoToStep(step) {
  sfState.step = step;
  sfState.digits = '';
  var prompt = document.getElementById('sfJerseyPrompt');
  if (step === 'player') {
    if (sfState.metric === 'Goal') prompt.textContent = 'Scorer jersey # (tap digits, then OK):';
    else if (SF_GOALIE_ONLY[sfState.metric]) prompt.textContent = 'Goalie jersey # (tap digits, then OK):';
    else prompt.textContent = 'Jersey # (tap digits, then OK):';
  } else if (step === 'assist') {
    prompt.textContent = 'Assisted by jersey # (tap digits, then OK), or No Assist:';
  } else if (step === 'clock') {
    prompt.textContent = 'Time on the clock (tap 4 digits, e.g. 0 9 3 4 = 09:34):';
  }
  document.getElementById('sfNoAssistBtn').style.display = (step === 'assist') ? 'block' : 'none';
  sfUpdateSummary();
  sfShowEntry();
}

function sfUpdateSummary() {
  var el = document.getElementById('sfGoalSummary');
  if (sfState.metric !== 'Goal' || !sfState.scorer) {
    el.style.display = 'none';
    return;
  }
  var txt = 'Goal #' + sfState.scorer.Jersey;
  if (sfState.step === 'clock') {
    txt += sfState.assister ? ', assisted by #' + sfState.assister.Jersey : ', no assist';
  }
  el.textContent = txt;
  el.style.display = 'block';
}

function sfShowEntry() {
  var isClock = (sfState.step === 'clock');
  var useGrid = (sfGetEntry() === 'grid');
  document.getElementById('sfJerseyError').style.display = 'none';
  document.getElementById('sfJerseyEntry').style.display = isClock ? 'none' : 'block';
  document.getElementById('sfClockEntry').style.display = isClock ? 'block' : 'none';
  document.getElementById('sfKeypadWrap').style.display = useGrid ? 'none' : 'block';
  document.getElementById('sfJerseyGrid').style.display = useGrid ? 'grid' : 'none';
  document.querySelectorAll('#sfEntryToggle .filter-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-entry') === sfGetEntry());
  });
  if (useGrid && !isClock) sfRenderGrid();
  sfUpdateJerseyDisplay();
  sfUpdateClockDisplay();
}

// ------------------------------------------------------------
// Per-device preferences: view (By Stat / By Player) and jersey
// entry (Keypad / Jersey Grid). Stored on this device only.
// ------------------------------------------------------------
var SF_VIEW_KEY = 'scorebook_view_mode';
var SF_ENTRY_KEY = 'scorebook_entry_mode';

function sfGetPref(key, def, allowed) {
  var v = '';
  try { v = localStorage.getItem(key) || ''; } catch (e) {}
  return allowed.indexOf(v) !== -1 ? v : def;
}
function sfSetPref(key, v) {
  try { localStorage.setItem(key, v); } catch (e) {}
}
function sfGetView() { return sfGetPref(SF_VIEW_KEY, 'stat', ['stat', 'player']); }
function sfGetEntry() { return sfGetPref(SF_ENTRY_KEY, 'keypad', ['keypad', 'grid']); }

function sfSetView(v) {
  sfSetPref(SF_VIEW_KEY, v);
  renderPlayerGrid();
  sfApplyView();
}

function sfApplyView() {
  var statView = (sfGetView() === 'stat');
  document.querySelectorAll('#viewToggle .filter-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-view') === sfGetView());
  });
  var panel = document.getElementById('byStatPanel');
  var filterBar = document.getElementById('filterBar');
  var grid = document.getElementById('playerGrid');
  if (panel) panel.style.display = statView ? 'block' : 'none';
  if (filterBar) filterBar.style.display = statView ? 'none' : 'flex';
  if (grid) grid.style.display = statView ? 'none' : '';
}

function sfSetEntry(m) {
  sfSetPref(SF_ENTRY_KEY, m);
  sfState.digits = '';
  sfShowEntry();
}

// Jersey grid: only players who can be credited at this step.
function sfRenderGrid() {
  var gridEl = document.getElementById('sfJerseyGrid');
  gridEl.innerHTML = '';
  var list = state.players.filter(function(p) {
    if (state.ejectedPlayers.indexOf(p.Player_ID) !== -1) return false;
    if (sfState.step === 'assist') return !sfState.scorer || p.Player_ID !== sfState.scorer.Player_ID;
    if (SF_GOALIE_ONLY[sfState.metric]) return p.Position === 'Goalie';
    return true;
  });
  list.sort(compareJersey);
  if (!list.length) {
    var empty = document.createElement('div');
    empty.className = 'sf-grid-empty';
    empty.textContent = 'No eligible players on the roster.';
    gridEl.appendChild(empty);
    return;
  }
  list.forEach(function(p) {
    var item = document.createElement('div');
    item.className = 'sf-grid-item';
    var j = document.createElement('div');
    j.className = 'sf-grid-jersey';
    j.textContent = jerseyText(p) ? '#' + jerseyText(p) : 'No #';
    var n = document.createElement('div');
    n.className = 'sf-grid-name';
    n.textContent = p.Name || '';
    item.appendChild(j);
    item.appendChild(n);
    item.addEventListener('click', function() {
      sfAcceptPlayer(p, String(p.Jersey).trim());
    });
    gridEl.appendChild(item);
  });
}

function sfShowError(msg) {
  document.getElementById('sfJerseyErrorMsg').textContent = msg;
  document.getElementById('sfJerseyEntry').style.display = 'none';
  document.getElementById('sfClockEntry').style.display = 'none';
  document.getElementById('sfJerseyError').style.display = 'block';
}

function sfUpdateJerseyDisplay() {
  var disp = document.getElementById('sfJerseyDisplay');
  if (sfState.digits) {
    disp.textContent = '#' + sfState.digits;
  } else {
    disp.innerHTML = '<span class="pen-clock-empty">--</span>';
  }
  document.getElementById('sfJerseyOk').style.opacity = sfState.digits ? '1' : '0.4';
}

function sfJerseyDigit(n) {
  if (sfState.digits.length >= 2) return; // no 3-digit jerseys
  sfState.digits += n;
  sfUpdateJerseyDisplay();
}

function sfJerseyBack() {
  sfState.digits = sfState.digits.slice(0, -1);
  sfUpdateJerseyDisplay();
}

// Re-enter keeps the current step (scorer, assist or clock).
function sfJerseyReenter() {
  sfState.digits = '';
  sfShowEntry();
}

// Exact match on the roster jersey (so #0 and #00 stay distinct).
function sfFindPlayerByJersey(jersey) {
  for (var i = 0; i < state.players.length; i++) {
    if (String(state.players[i].Jersey).trim() === jersey) return state.players[i];
  }
  return null;
}

function sfJerseyConfirm() {
  var jersey = sfState.digits;
  if (!jersey) return;
  var player = sfFindPlayerByJersey(jersey);
  if (!player) {
    sfShowError('Jersey #' + jersey + " doesn't exist on the roster. Re-enter or cancel.");
    return;
  }
  sfAcceptPlayer(player, jersey);
}

// Shared by the keypad and the jersey grid.
function sfAcceptPlayer(player, jersey) {
  if (state.ejectedPlayers.indexOf(player.Player_ID) !== -1) {
    sfShowError('#' + jersey + ' has been ejected and can\u2019t be credited. Re-enter or cancel.');
    return;
  }
  if (sfState.step === 'assist') {
    if (player.Player_ID === sfState.scorer.Player_ID) {
      sfShowError('#' + jersey + ' scored the goal and can\u2019t assist it. Re-enter or cancel.');
      return;
    }
    sfState.assister = player;
    sfGoToStep('clock');
    return;
  }
  if (SF_GOALIE_ONLY[sfState.metric] && player.Position !== 'Goalie') {
    sfShowError('#' + jersey + ' is not a goalie. ' + (SF_LABELS[sfState.metric]) + ' is for goalies only. Re-enter or cancel.');
    return;
  }
  if (sfState.metric === 'Goal') {
    sfState.scorer = player;
    sfGoToStep('assist');
    return;
  }
  var metric = sfState.metric;
  sfClose();
  logStat(metric, player);
}

function sfNoAssist() {
  if (sfState.step !== 'assist') return;
  sfState.assister = null;
  sfGoToStep('clock');
}

// --- Goal clock (mandatory). Same rules as the existing goal clock. ---
function sfUpdateClockDisplay() {
  var d = sfState.clock;
  var disp = document.getElementById('sfClockDisplay');
  if (d.length === 0) {
    disp.innerHTML = '<span class="pen-clock-empty">--:--</span>';
  } else {
    var padded = (d + '____').slice(0, 4);
    disp.textContent = padded.slice(0, 2).replace(/_/g, '\u2013') + ':' + padded.slice(2, 4).replace(/_/g, '\u2013');
  }
  document.getElementById('sfClockOk').style.opacity = (d.length === 4) ? '1' : '0.4';
}

function sfClockDigit(n) {
  if (sfState.clock.length >= 4) return;
  var next = sfState.clock + n;
  if (next.length === 2 && parseInt(next, 10) > 12) {
    showToast('Minutes cannot exceed 12', 'error');
    return;
  }
  if (next.length === 4 && parseInt(next.slice(2, 4), 10) > 59) {
    showToast('Seconds cannot exceed 59', 'error');
    return;
  }
  sfState.clock = next;
  sfUpdateClockDisplay();
}

function sfClockBack() {
  sfState.clock = sfState.clock.slice(0, -1);
  sfUpdateClockDisplay();
}

function sfClockConfirm() {
  if (sfState.clock.length !== 4) {
    showToast('Enter all 4 digits', 'error');
    return;
  }
  // Capture everything, close the keypad, then ask for the zone (last).
  var scorer = sfState.scorer;
  var assister = sfState.assister;
  var clock = sfState.clock.slice(0, 2) + ':' + sfState.clock.slice(2, 4);
  sfClose();
  openZonePicker(function(zid) {
    // Zone picked or skipped: now record the whole goal at once.
    logStat('Goal', scorer, { zone: zid || '', clock: clock, assister: assister });
  });
}

function sfCancel() {
  sfClose();
}

function sfClose() {
  document.getElementById('sfJerseyModal').classList.remove('show');
  sfState.metric = null;
  sfState.step = 'player';
  sfState.digits = '';
  sfState.clock = '';
  sfState.scorer = null;
  sfState.assister = null;
}

// ============================================================
// SHOT ZONE PICKER (v3 - radial fan heatmap capture)
// ============================================================
// Goal is at top-center; field fans downward toward the shooter.
// 3 distance rings (1=near, 2=mid, 3=far) x 3 angular wedges (R, C, L) = 9 zones.
// Zone_ID stored as ring+side label, e.g. "1C", "2R", "3L".
var ZONE_STATE = { callback: null, built: false };

function buildZoneSvg() {
  if (ZONE_STATE.built) return;
  var svg = document.getElementById('zoneSvg');
  var W = 400, H = 236;
  var gle = 40;                     // Goal Line Extended: the top horizontal field line
  var cx = W / 2, cy = gle;         // goal sits ON the GLE line
  var creaseR = 26;                 // crease circle radius (straddles GLE, encloses the goal)
  var radii = [creaseR, 96, 150, 214]; // fan boundaries: crease edge -> ring1 -> ring2 -> ring3
  // Wedge angles measured from straight-down (90deg). Center wedge spans +/-30deg; sides to +/-90deg.
  var bounds = [-90, -30, 30, 90];  // R-outer, R/C split, C/L split, L-outer
  var sides = ['R', 'C', 'L'];
  var ns = 'http://www.w3.org/2000/svg';

  function pt(angDeg, r) {
    var a = (90 + angDeg) * Math.PI / 180; // 0deg -> straight down
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcPath(rInner, rOuter, aStart, aEnd) {
    var p1 = pt(aStart, rInner), p2 = pt(aEnd, rInner);
    var p3 = pt(aEnd, rOuter), p4 = pt(aStart, rOuter);
    var large = (aEnd - aStart) > 180 ? 1 : 0;
    return 'M ' + p1[0] + ' ' + p1[1] +
      ' A ' + rInner + ' ' + rInner + ' 0 ' + large + ' 1 ' + p2[0] + ' ' + p2[1] +
      ' L ' + p3[0] + ' ' + p3[1] +
      ' A ' + rOuter + ' ' + rOuter + ' 0 ' + large + ' 0 ' + p4[0] + ' ' + p4[1] +
      ' Z';
  }

  // field background rect: top edge is the GLE line, positioned so the crease's
  // upper half sits above it (behind the goal).
  var rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', 2); rect.setAttribute('y', gle);
  rect.setAttribute('width', W - 4); rect.setAttribute('height', H - gle - 2);
  rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', '#ffffff'); rect.setAttribute('stroke-width', 2);
  svg.appendChild(rect);

  // zones (draw far rings first so labels/goal sit on top visually)
  for (var ring = 3; ring >= 1; ring--) {
    for (var s = 0; s < 3; s++) {
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('class', 'zone');
      path.setAttribute('d', arcPath(radii[ring - 1], radii[ring], bounds[s], bounds[s + 1]));
      var zid = ring + sides[s];
      path.setAttribute('data-zone', zid);
      path.addEventListener('click', function() { pickZone(this.getAttribute('data-zone')); });
      svg.appendChild(path);
    }
  }

  // crease: FULL circle centered on GLE (half above / half below), enclosing the goal
  var crease = document.createElementNS(ns, 'circle');
  crease.setAttribute('class', 'crease');
  crease.setAttribute('cx', cx); crease.setAttribute('cy', cy); crease.setAttribute('r', creaseR);
  svg.appendChild(crease);

  // goal net triangle: point at top, sitting inside the crease, base on GLE
  var triH = 20, triW = 18;
  var tri = document.createElementNS(ns, 'path');
  tri.setAttribute('class', 'goal-shape');
  tri.setAttribute('d', 'M ' + (cx - triW / 2) + ' ' + cy +
                        ' L ' + cx + ' ' + (cy - triH) +
                        ' L ' + (cx + triW / 2) + ' ' + cy + ' Z');
  svg.appendChild(tri);

  ZONE_STATE.built = true;
}

// Open the picker. cb receives the chosen zone label, or '' if skipped.
function openZonePicker(cb) {
  buildZoneSvg();
  ZONE_STATE.callback = cb;
  var picked = document.querySelector('#zoneSvg .zone.picked');
  if (picked) picked.classList.remove('picked');
  document.getElementById('zoneModal').classList.add('show');
}

function pickZone(zid) {
  var cb = ZONE_STATE.callback;
  ZONE_STATE.callback = null;
  document.getElementById('zoneModal').classList.remove('show');
  if (cb) cb(zid);
}

function skipZone() {
  var cb = ZONE_STATE.callback;
  ZONE_STATE.callback = null;
  document.getElementById('zoneModal').classList.remove('show');
  if (cb) cb('');
}

// Apply a chosen zone to the Shot and Goal events of the most recent shot cascade.
// SOG is intentionally left blank (a Shot is logged with every SOG, so Shot rows
// carry all shot locations; Goal rows carry scoring-shot locations for overlay).
function applyZoneToLastShot(scorerId, zid, startIndex) {
  if (!zid) return;
  var events = state.activeGame.events;
  for (var i = startIndex; i < events.length; i++) {
    var e = events[i];
    if (e.playerId === scorerId && (e.metric === 'Shot' || e.metric === 'Goal')) {
      e.zoneId = zid;
    }
  }
  saveState();
  renderEventLog();
}

// logStat(metric, playerArg, opts)
// playerArg is optional. The stat-first flow passes the player directly; the
// player-first flow (stat modal) omits it and falls back to selectedPlayer.
// opts (stat-first Goal only): { zone, clock, assister } already collected,
// so the goal is stamped in one pass and no follow-up prompts are shown.
// ------------------------------------------------------------
// Building event rows (one place, instead of a copy per stat).
// Rows recorded by the same tap share one timestamp (the viewer groups a
// shot's Shot/SOG/Goal rows by player + timestamp).
// ------------------------------------------------------------
function newEventId() {
  return 'E' + Date.now() + Math.random().toString(36).substr(2, 6);
}
function playerEvent(player, metric, timestamp) {
  return {
    id: newEventId(), type: 'player_stat', quarter: state.currentQuarter, timestamp: timestamp,
    playerId: player.Player_ID, playerName: player.Name, playerJersey: player.Jersey,
    metric: metric, strength: state.currentStrength, penDuration: ''
  };
}
function opponentEvent(metric, timestamp) {
  return {
    id: newEventId(), type: 'opponent_stat', quarter: state.currentQuarter, timestamp: timestamp,
    playerId: 'OPPONENT', playerName: 'Opponent', playerJersey: '',
    metric: metric, strength: state.currentStrength, penDuration: ''
  };
}

function logStat(metric, playerArg, opts) {
  var player = playerArg || selectedPlayer;
  if (!player || !state.activeGame) return;

  // GA (Goal Allowed) — goalie-only. Replaces the removed "Opp Goal" button.
  // Logs the GA against the specific goalie AND cascades the opponent goal
  // (Opp_Goal + Opp_SOG + Opp_Shot), bumps the opponent score, then prompts
  // for the game clock (stamped on the Opp_Goal event only, no zone).
  if (metric === 'GA') {
    if (player.Position !== 'Goalie') {
      showToast('GA is only for goalies', 'error');
      return;
    }
    var gaNow = new Date().toISOString();
    var gaStartIndex = state.activeGame.events.length;
    // Goalie's GA row (attributes the goal-allowed to this goalie), then the
    // opponent cascade: Opp_Goal (clock target) + Opp_SOG + Opp_Shot.
    var oppGoal = opponentEvent('Opp_Goal', gaNow);
    var gaOppGoalId = oppGoal.id;
    state.activeGame.events.push(playerEvent(player, 'GA', gaNow), oppGoal,
      opponentEvent('Opp_SOG', gaNow), opponentEvent('Opp_Shot', gaNow));
    tagEventGroup(gaStartIndex);
    state.activeGame.awayScore++;
    document.getElementById('awayScore').textContent = state.activeGame.awayScore;
    saveState();
    var gaJersey = player.Jersey;
    closeStatModal();
    renderEventLog();
    showToast('Goal Allowed #' + gaJersey + ' \u2014 Opponent Goal', 'info');
    // Mandatory game clock, stamped on the Opp_Goal event only.
    openGoalClock([gaOppGoalId], 'Opponent Goal');
    return;
  }

  var now = new Date().toISOString();
  var zoneStartIndex = state.activeGame.events.length; // v3: mark cascade start for zone stamping

  // Cascaded rows go FIRST so the primary stat is the last row of the tap:
  // Goal = Shot + SOG + Goal, SOG = Shot + SOG.
  if (metric === 'Goal') {
    state.activeGame.homeScore++;
    document.getElementById('homeScore').textContent = state.activeGame.homeScore;
    // EMO (A1) success for a Tigers goal is decided in resolveGoalAgainstPenalties(),
    // once the goal's game clock is known (a goal after the penalty has run out
    // is not a man-up goal).
    state.activeGame.events.push(playerEvent(player, 'Shot', now), playerEvent(player, 'SOG', now));
  } else if (metric === 'SOG') {
    state.activeGame.events.push(playerEvent(player, 'Shot', now));
  }
  state.activeGame.events.push(playerEvent(player, metric, now));

  // A save also records the opponent's shot on goal (Opp_SOG + Opp_Shot).
  if (metric === 'Save') {
    state.activeGame.events.push(opponentEvent('Opp_SOG', now), opponentEvent('Opp_Shot', now));
  }

  // Goal/SOG/Save rows recorded together are one group, so Undo removes them together.
  tagEventGroup(zoneStartIndex);
  saveState();

  // v3: capture identity before closeStatModal() clears selectedPlayer.
  var isShotFamily = (metric === 'Shot' || metric === 'SOG' || metric === 'Goal');
  var scorerId = player.Player_ID;
  var scorerJersey = player.Jersey;

  closeStatModal();
  renderEventLog();
  showToast((SF_LABELS[metric] || metric) + ' #' + scorerJersey, 'success');

  // Stat-first Goal: everything was collected up front (scorer, assist,
  // clock, zone), so stamp it all now instead of prompting.
  if (opts && metric === 'Goal') {
    applyZoneToLastShot(scorerId, opts.zone, zoneStartIndex);
    var sfGoalIds = goalEventIdsSince(scorerId, zoneStartIndex);
    state.activeGame.events.forEach(function(e) {
      if (sfGoalIds.indexOf(e.id) === -1) return;
      e.gameClock = opts.clock;
      if (opts.assister) e.linkedPlayerId = opts.assister.Player_ID;
    });
    saveState();
    renderEventLog();
    showToast('Goal #' + scorerJersey
      + (opts.assister ? ', assist #' + opts.assister.Jersey : ', no assist')
      + ', ' + state.currentQuarter + ' ' + opts.clock, 'success');
    var sfGoalEvt = state.activeGame.events.filter(function(e) { return sfGoalIds.indexOf(e.id) !== -1 && e.metric === 'Goal'; })[0];
    resolveGoalAgainstPenalties('tigers', sfGoalEvt, opts.clock);
    return;
  }

  // v3: for any shot-family action, prompt once for the shot zone.
  // Applies to the Shot and Goal events in this cascade only (SOG left blank).
  if (isShotFamily) {
    openZonePicker(function(zid) {
      applyZoneToLastShot(scorerId, zid, zoneStartIndex);
      // v3.6: after the zone, a Goal prompts for the game clock (mandatory).
      if (metric === 'Goal') {
        var goalIds = goalEventIdsSince(scorerId, zoneStartIndex);
        openGoalClock(goalIds, '#' + scorerJersey + ' Goal', scorerId);
      }
    });
  }
}

// Collect the Goal event id(s) for a scorer in the current cascade.
function goalEventIdsSince(scorerId, startIndex) {
  var ids = [];
  var events = state.activeGame.events;
  for (var i = startIndex; i < events.length; i++) {
    if (events[i].playerId === scorerId && events[i].metric === 'Goal') {
      ids.push(events[i].id);
    }
  }
  return ids;
}

// Assist automation
// NOTE: The standalone ASSIST button and its handlers (handleAssist /
// showScorerPicker) were removed in V3.10. Assists are now captured inside the
// goal flow via the "Was there an assist?" prompt, stored only as the Goal
// event's linkedPlayerId (exported as Secondary_Player_ID). No separate Assist
// row is created, which eliminates the duplicate Goal/Assist records.

function closeScorerModal() {
  document.getElementById('scorerModal').classList.remove('show');
}
