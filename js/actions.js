// js/actions.js - Team and opponent actions, the penalty pop-up, goal clock, assist prompt, ejections.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// TEAM ACTIONS
// ============================================================

function logTeamAction(action) {
  if (!state.activeGame) return;

  var evt = {
    id: newEventId(),
    type: 'team_action',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: '',
    playerName: '',
    playerJersey: '',
    metric: action,
    strength: state.currentStrength,
    penDuration: ''
  };

  state.activeGame.events.push(evt);

  if (action === 'Opp_Goal') {
    state.activeGame.awayScore++;
    document.getElementById('awayScore').textContent = state.activeGame.awayScore;
  }

  saveState();
  renderEventLog();
  
  var displayName = action.replace(/_/g, ' ');
  showToast(displayName + ' recorded', 'info');
}

function logOpponentAction(action) {
  if (!state.activeGame) return;
  var now = new Date().toISOString();
  var oppStartIndex = state.activeGame.events.length;

  var evt = opponentEvent(action, now);
  var oppPrimaryId = evt.id;
  state.activeGame.events.push(evt);
  // Opp_Goal also records Opp_SOG + Opp_Shot; Opp_SOG also records Opp_Shot.
  if (action === 'Opp_Goal') {
    state.activeGame.awayScore++;
    document.getElementById('awayScore').textContent = state.activeGame.awayScore;
    state.activeGame.events.push(opponentEvent('Opp_SOG', now), opponentEvent('Opp_Shot', now));
  } else if (action === 'Opp_SOG') {
    state.activeGame.events.push(opponentEvent('Opp_Shot', now));
  }

  tagEventGroup(oppStartIndex);
  saveState();
  renderEventLog();
  var displayName = action.replace(/_/g, ' ');
  showToast(displayName + ' recorded', 'info');

  // v3.6: an opponent goal captures the game clock (no zone — heatmap is Tigers-only).
  if (action === 'Opp_Goal') {
    openGoalClock([oppPrimaryId], 'Opponent Goal');
  }
}

// ============================================================
// PENALTY SYSTEM
// ============================================================

// Penalty name catalog
var PENALTY_NAMES = {
  Technical: ['Holding', 'Interference', 'Off Sides', 'Push', 'Screen', 'Stalling', 'Ward', 'Mouth Guard'],
  Personal: ['Slashing', 'Tripping', 'Cross Check', 'Unsportsmanlike', 'Unnecessary Roughness', 'Illegal Crosse', 'Illegal Body Checking', 'Illegal Gloves']
};

function penaltyShowStep(which) {
  ['penaltyStep1', 'penaltyStepTigersPlayer', 'penaltyStepOppJersey', 'penaltyStepClock', 'penaltyStepName', 'penaltyStepDuration', 'penaltyStepOppInHome'].forEach(function(id) {
    document.getElementById(id).style.display = (id === which) ? 'block' : 'none';
  });
}

function openPenaltyModal() {
  state.selectedPenaltyPlayer = null;
  state.penaltyTeam = null;
  state.penaltyClock = '';
  state.penaltyName = '';
  state.penaltyType = '';
  state.penaltyInHome = false;
  state.oppPenaltyJersey = '';
  state.penaltyDuration = 0;
  penaltyShowStep('penaltyStep1');
  document.getElementById('penaltyModal').classList.add('show');
}

function closePenaltyModal() {
  document.getElementById('penaltyModal').classList.remove('show');
}

// ============================================================
// GOAL CLOCK (game time for goals) — mandatory, appears after zone
// ============================================================
// openGoalClock stamps the given event ids with the entered MM:SS.
// contextLabel is shown at the top (e.g. "#12 Goal" or "Opponent Goal").
// scorerId (optional): when set, a Tigers goal — after the clock we prompt
// "Was there an assist?". Omitted/empty (opponent/GA goals) skips the assist step.
function openGoalClock(eventIds, contextLabel, scorerId) {
  state.goalClock = '';
  state.goalClockTargetIds = eventIds || [];
  state.assistGoalIds = (scorerId ? (eventIds || []) : []);
  state.assistScorerId = scorerId || '';
  document.getElementById('goalClockContext').textContent =
    (state.currentQuarter + ' \u00b7 ' + (contextLabel || 'Goal'));
  updateGoalClockDisplay();
  document.getElementById('goalClockModal').classList.add('show');
}

function updateGoalClockDisplay() {
  var d = state.goalClock;
  var disp = document.getElementById('goalClockDisplay');
  var okBtn = document.getElementById('goalClockOk');
  if (d.length === 0) {
    disp.innerHTML = '<span class="pen-clock-empty">--:--</span>';
  } else {
    var padded = (d + '____').slice(0, 4);
    var mm = padded.slice(0, 2).replace(/_/g, '\u2013');
    var ss = padded.slice(2, 4).replace(/_/g, '\u2013');
    disp.textContent = mm + ':' + ss;
  }
  if (okBtn) okBtn.style.opacity = (d.length === 4) ? '1' : '0.4';
}

function goalClockDigit(n) {
  if (state.goalClock.length >= 4) return;
  var next = state.goalClock + n;
  if (next.length === 2 && parseInt(next, 10) > 12) {
    showToast('Minutes cannot exceed 12', 'error');
    return;
  }
  if (next.length === 4 && parseInt(next.slice(2, 4), 10) > 59) {
    showToast('Seconds cannot exceed 59', 'error');
    return;
  }
  state.goalClock = next;
  updateGoalClockDisplay();
}

function goalClockBack() {
  state.goalClock = state.goalClock.slice(0, -1);
  updateGoalClockDisplay();
}

function goalClockConfirm() {
  if (state.goalClock.length !== 4) {
    showToast('Enter all 4 digits', 'error');
    return;
  }
  var clock = state.goalClock.slice(0, 2) + ':' + state.goalClock.slice(2, 4);
  var goalEvt = findGoalEventById(state.goalClockTargetIds);
  stampGoalClock(clock);
  document.getElementById('goalClockModal').classList.remove('show');
  showToast('Goal time recorded: ' + state.currentQuarter + ' ' + clock, 'success');
  if (goalEvt) resolveGoalAgainstPenalties(goalEvt.metric === 'Opp_Goal' ? 'opponent' : 'tigers', goalEvt, clock);
  maybePromptAssist();
}

function goalClockCancel() {
  // Goal is already logged; cancel just leaves Game_Clock blank. Without a
  // clock no penalty can be released or expired, but a Tigers man-up goal still
  // counts for the extra-man tracking.
  var goalEvt = findGoalEventById(state.goalClockTargetIds);
  document.getElementById('goalClockModal').classList.remove('show');
  state.goalClockTargetIds = [];
  if (goalEvt) resolveGoalAgainstPenalties(goalEvt.metric === 'Opp_Goal' ? 'opponent' : 'tigers', goalEvt, '');
  maybePromptAssist();
}

function findGoalEventById(ids) {
  if (!state.activeGame || !ids || !ids.length) return null;
  return state.activeGame.events.filter(function(e) {
    return ids.indexOf(e.id) !== -1 && (e.metric === 'Goal' || e.metric === 'Opp_Goal');
  })[0] || null;
}

function stampGoalClock(clock) {
  if (!state.activeGame) return;
  var ids = state.goalClockTargetIds || [];
  state.activeGame.events.forEach(function(evt) {
    if (ids.indexOf(evt.id) !== -1) {
      evt.gameClock = clock;
    }
  });
  state.goalClockTargetIds = [];
  saveState();
  renderEventLog();
}

// ============================================================
// GOAL ASSIST (optional) — asked after the goal clock, Tigers goals only.
// ============================================================
// If there was an assist, we stamp the assister's Player_ID into the Goal
// event's linkedPlayerId (exported as Secondary_Player_ID). No separate
// Assist event row is created.
function maybePromptAssist() {
  if (!state.assistScorerId || !state.assistGoalIds.length) {
    state.assistGoalIds = [];
    state.assistScorerId = '';
    return;
  }
  document.getElementById('assistStepQuestion').style.display = 'block';
  document.getElementById('assistStepPlayer').style.display = 'none';
  document.getElementById('assistModal').classList.add('show');
}

function assistAnswer(hadAssist) {
  if (!hadAssist) {
    document.getElementById('assistModal').classList.remove('show');
    state.assistGoalIds = [];
    state.assistScorerId = '';
    return;
  }
  // Yes — show the jersey list (everyone except the scorer).
  var list = document.getElementById('assistPlayerList');
  fillJerseyList(list, state.players.filter(function(p) {
    return state.ejectedPlayers.indexOf(p.Player_ID) === -1 &&
      p.Player_ID !== state.assistScorerId; // can't assist yourself
  }), assistSelectPlayer);
  document.getElementById('assistStepQuestion').style.display = 'none';
  document.getElementById('assistStepPlayer').style.display = 'block';
}

function assistSelectPlayer(assister) {
  var ids = state.assistGoalIds || [];
  state.activeGame.events.forEach(function(evt) {
    if (ids.indexOf(evt.id) !== -1) {
      evt.linkedPlayerId = assister.Player_ID;
    }
  });
  saveState();
  renderEventLog();
  document.getElementById('assistModal').classList.remove('show');
  showToast('Assist: #' + assister.Jersey, 'success');
  state.assistGoalIds = [];
  state.assistScorerId = '';
}

function closeAssistModal() {
  // Treated as "no assist" — goal already logged.
  document.getElementById('assistModal').classList.remove('show');
  state.assistGoalIds = [];
  state.assistScorerId = '';
}

function penaltySelectTeam(team) {
  state.penaltyTeam = team;
  state.penaltyClock = '';
  if (team === 'opponent') {
    state.oppPenaltyJersey = '';
    updateOppJerseyDisplay();
    penaltyShowStep('penaltyStepOppJersey');
  } else {
    // Tigers: player selection comes first now.
    renderPenaltyPlayerList();
    penaltyShowStep('penaltyStepTigersPlayer');
  }
}

// --- Opponent jersey entry (1-2 digits) ---
function updateOppJerseyDisplay() {
  var d = state.oppPenaltyJersey;
  var disp = document.getElementById('oppJerseyDisplay');
  var okBtn = document.getElementById('oppJerseyNext');
  disp.textContent = d.length ? ('#' + d) : '';
  if (!d.length) disp.innerHTML = '<span class="pen-clock-empty">--</span>';
  if (okBtn) okBtn.style.opacity = (d.length >= 1) ? '1' : '0.4';
}

function oppJerseyDigit(n) {
  if (state.oppPenaltyJersey.length >= 2) return;
  state.oppPenaltyJersey += n;
  updateOppJerseyDisplay();
}

function oppJerseyBack() {
  state.oppPenaltyJersey = state.oppPenaltyJersey.slice(0, -1);
  updateOppJerseyDisplay();
}

function oppJerseyConfirm() {
  if (state.oppPenaltyJersey.length < 1) {
    showToast('Enter the jersey number', 'error');
    return;
  }
  // Strip a leading zero for display consistency (06 -> 6), keep single 0 if typed alone.
  state.oppPenaltyJersey = String(parseInt(state.oppPenaltyJersey, 10));
  state.penaltyClock = '';
  updatePenClockDisplay();
  penaltyShowStep('penaltyStepClock');
}

// --- Tigers player selection advances to the clock ---
function penaltyPlayerChosen() {
  state.penaltyClock = '';
  updatePenClockDisplay();
  penaltyShowStep('penaltyStepClock');
}

// --- Clock entry (4-digit MM:SS) ---
function updatePenClockDisplay() {
  var d = state.penaltyClock;
  var disp = document.getElementById('penClockDisplay');
  var okBtn = document.getElementById('penClockNext');
  if (d.length === 0) {
    disp.innerHTML = '<span class="pen-clock-empty">--:--</span>';
  } else {
    var padded = (d + '____').slice(0, 4);
    var mm = padded.slice(0, 2).replace(/_/g, '\u2013');
    var ss = padded.slice(2, 4).replace(/_/g, '\u2013');
    disp.textContent = mm + ':' + ss;
  }
  if (okBtn) okBtn.style.opacity = (d.length === 4) ? '1' : '0.4';
}

function penClockDigit(n) {
  if (state.penaltyClock.length >= 4) return;
  var next = state.penaltyClock + n;
  // Validate progressively: minutes 00-12, seconds 00-59
  if (next.length === 2 && parseInt(next, 10) > 12) {
    showToast('Minutes cannot exceed 12', 'error');
    return;
  }
  if (next.length === 4 && parseInt(next.slice(2, 4), 10) > 59) {
    showToast('Seconds cannot exceed 59', 'error');
    return;
  }
  state.penaltyClock = next;
  updatePenClockDisplay();
}

function penClockBack() {
  state.penaltyClock = state.penaltyClock.slice(0, -1);
  updatePenClockDisplay();
}

function penClockConfirm() {
  if (state.penaltyClock.length !== 4) {
    showToast('Enter all 4 digits', 'error');
    return;
  }
  var mm = state.penaltyClock.slice(0, 2);
  var ss = state.penaltyClock.slice(2, 4);
  state.penaltyClock = mm + ':' + ss; // store as MM:SS
  var whoLabel = penaltyWhoLabel();
  document.getElementById('penNameWhoLabel').textContent = whoLabel;
  document.getElementById('penNameClockLabel').textContent = state.currentQuarter + ' ' + state.penaltyClock;
  renderPenaltyNameGrids();
  penaltyShowStep('penaltyStepName');
}

// Human-readable "who" for the penalty in progress (used on name/duration steps).
function penaltyWhoLabel() {
  if (state.penaltyTeam === 'opponent') {
    return 'Opp #' + state.oppPenaltyJersey;
  }
  if (state.penaltyInHome) return 'In-Home';
  var p = state.selectedPenaltyPlayer;
  return p ? ('#' + p.Jersey) : 'Tigers';
}

// --- Penalty name selection ---
function renderPenaltyNameGrids() {
  buildPenNameGrid('penTechnicalGrid', PENALTY_NAMES.Technical, 'Technical', 'technical');
  buildPenNameGrid('penPersonalGrid', PENALTY_NAMES.Personal, 'Personal', 'personal');
}

function buildPenNameGrid(elId, names, type, cssClass) {
  var grid = document.getElementById(elId);
  grid.innerHTML = '';
  names.forEach(function(name) {
    var btn = document.createElement('button');
    btn.className = 'pen-name-btn ' + cssClass;
    btn.textContent = name;
    btn.addEventListener('click', function() { penaltySelectName(name, type); });
    grid.appendChild(btn);
  });
}

function penaltySelectName(name, type) {
  state.penaltyName = name;
  state.penaltyType = type;
  // Lock-in only applies to Personal fouls. Reset it every time.
  var lockCheck = document.getElementById('penLockCheck');
  if (lockCheck) lockCheck.checked = false;
  var lockRow = document.getElementById('penLockRow');
  if (lockRow) lockRow.style.display = (type === 'Personal') ? 'flex' : 'none';
  // Both teams now go to the duration step.
  document.getElementById('penDurationLabel').textContent =
    penaltyWhoLabel() + ' \u00b7 ' + name + ' (' + type + ') \u00b7 ' + state.currentQuarter + ' ' + state.penaltyClock;
  penaltyShowStep('penaltyStepDuration');
}

// Duration chosen — route to the correct logger.
// Lock-in: only a Personal foul can be locked in, and only if the box is ticked.
function penaltyLockedFlag() {
  var cb = document.getElementById('penLockCheck');
  return state.penaltyType === 'Personal' && !!(cb && cb.checked);
}

function penaltySelectDuration(durationSeconds) {
  state.penaltyDuration = durationSeconds;
  if (state.penaltyTeam === 'opponent') {
    // Decide whether to ask the In-Home challenge:
    //  - always ask the first time (no In-Home jersey remembered yet), OR
    //  - ask when the entered jersey matches the remembered opponent In-Home.
    var ask = (!state.oppInHomeJersey) ||
              (state.oppInHomeJersey === state.oppPenaltyJersey);
    if (ask) {
      penaltyShowStep('penaltyStepOppInHome');
    } else {
      logOpponentPenalty(false, durationSeconds);
    }
  } else {
    logTigersPenalty(durationSeconds);
  }
}

// Opponent In-Home Yes/No answer.
function oppInHomeAnswer(isInHome) {
  if (isInHome) {
    // Remember this jersey as the opponent's In-Home for the rest of the game.
    state.oppInHomeJersey = state.oppPenaltyJersey;
  }
  logOpponentPenalty(isInHome, state.penaltyDuration);
}

function logOpponentPenalty(isInHome, durationSeconds) {
  var jersey = state.oppPenaltyJersey;
  // In-Home-served opponent penalties are recorded as Technical TEAM fouls,
  // not attributed to a jersey and NOT accumulated toward ejection.
  var pid = isInHome ? 'Opp In-Home' : ('Opp #' + jersey);
  var evt = {
    id: newEventId(),
    type: 'penalty',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: pid,
    playerName: pid,
    playerJersey: isInHome ? '' : jersey,
    metric: 'Penalty',
    strength: state.currentStrength,
    penDuration: durationSeconds,
    penClock: state.penaltyClock,
    penName: state.penaltyName,
    penType: isInHome ? 'Technical' : state.penaltyType,
    locked: !isInHome && penaltyLockedFlag(),
    team: 'opponent'
  };
  state.activeGame.events.push(evt);
  addActivePenalty(evt);

  // Accumulate PERSONAL fouls for the opponent jersey (not In-Home team fouls).
  if (!isInHome && state.penaltyType === 'Personal') {
    accumulatePersonalFoul('Opp #' + jersey, durationSeconds);
    evt.foulKey = 'Opp #' + jersey; // so Undo can take the foul back off the count
  }

  closePenaltyModal();
  var who = isInHome ? 'Opp In-Home ' : ('Opp #' + jersey + ' ');
  var durLabel = durationSeconds >= 60 ? (durationSeconds / 60) + ' min' : durationSeconds + 's';
  showToast(who + state.penaltyName + ' (' + durLabel + ', ' + state.currentQuarter + ' ' + state.penaltyClock + (evt.locked ? ', locked in' : '') + ') - ' + state.currentStrength, 'warning');
  var ejId = maybeEject('Opp #' + jersey, isInHome);
  if (ejId) evt.ejectionEventId = ejId; // Undo of this penalty also undoes the ejection
  saveState();
  renderEventLog();
}

function renderPenaltyPlayerList() {
  var list = document.getElementById('penaltyPlayerList');
  fillJerseyList(list, state.players.filter(function(p) {
    return state.ejectedPlayers.indexOf(p.Player_ID) === -1;
  }), function(p) {
    state.selectedPenaltyPlayer = p;
    state.penaltyInHome = false;
    penaltyPlayerChosen();
  });
}

function selectPenaltyInHome() {
  // In-Home will serve this Tigers penalty; advance to the clock.
  state.penaltyInHome = true;
  state.selectedPenaltyPlayer = null;
  penaltyPlayerChosen();
}

function logTigersPenalty(durationSeconds) {
  var inHome = state.penaltyInHome;
  if (!inHome && !state.selectedPenaltyPlayer) {
    showToast('Select a player (or In-Home) first', 'error');
    return;
  }

  if (inHome) {
    // In-Home serves a coach/bench (or goalie-no-backup) penalty:
    // recorded as a Technical TEAM foul; no individual accumulation, no eject.
    var evtIH = {
      id: newEventId(),
      type: 'penalty',
      quarter: state.currentQuarter,
      timestamp: new Date().toISOString(),
      playerId: 'In-Home',
      playerName: 'In-Home',
      playerJersey: '',
      metric: 'Penalty',
      strength: state.currentStrength,
      penDuration: durationSeconds,
      penClock: state.penaltyClock,
      penName: state.penaltyName,
      penType: 'Technical',
      team: 'tigers'
    };
    state.activeGame.events.push(evtIH);
    addActivePenalty(evtIH);
    saveState();
    renderEventLog();
    closePenaltyModal();
    var durLabelIH = durationSeconds >= 60 ? (durationSeconds / 60) + ' min' : durationSeconds + 's';
    showToast('In-Home ' + state.penaltyName + ' (' + durLabelIH + ', ' + state.currentQuarter + ' ' + state.penaltyClock + ') - ' + state.currentStrength, 'warning');
    return;
  }

  var player = state.selectedPenaltyPlayer;
  var evt = {
    id: newEventId(),
    type: 'penalty',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: player.Player_ID,
    playerName: player.Name,
    playerJersey: player.Jersey,
    metric: 'Penalty',
    strength: state.currentStrength,
    penDuration: durationSeconds,
    penClock: state.penaltyClock,
    penName: state.penaltyName,
    penType: state.penaltyType,
    locked: penaltyLockedFlag(),
    team: 'tigers'
  };

  state.activeGame.events.push(evt);
  addActivePenalty(evt);

  // Accumulate total penalty minutes (all penalties).
  if (!state.penaltyMinutes[player.Player_ID]) {
    state.penaltyMinutes[player.Player_ID] = 0;
  }
  state.penaltyMinutes[player.Player_ID] += durationSeconds;

  // Accumulate PERSONAL fouls separately (ejection is personal-fouls only).
  if (state.penaltyType === 'Personal') {
    accumulatePersonalFoul(player.Player_ID, durationSeconds);
    evt.foulKey = player.Player_ID; // so Undo can take the foul back off the count
  }

  closePenaltyModal();

  var durLabel = durationSeconds >= 60 ? (durationSeconds / 60) + ' min' : durationSeconds + 's';
  showToast('#' + player.Jersey + ' ' + state.penaltyName + ' (' + durLabel + ', ' + state.currentQuarter + ' ' + state.penaltyClock + (evt.locked ? ', locked in' : '') + ') - ' + state.currentStrength, 'warning');

  var ejId = maybeEject(player.Player_ID, false);
  if (ejId) evt.ejectionEventId = ejId; // Undo of this penalty also undoes the ejection
  // Strength is worked out from the active penalty list (see addActivePenalty).
  saveState();
  renderEventLog();
}

// --- Personal-foul accumulation + ejection (both teams) ---
// Ejection triggers on PERSONAL fouls only: >= 5:00 (300s) OR >= 5 fouls.
function accumulatePersonalFoul(key, durationSeconds) {
  if (!state.penaltyPersonalCount[key]) state.penaltyPersonalCount[key] = 0;
  if (!state.penaltyPersonalSeconds[key]) state.penaltyPersonalSeconds[key] = 0;
  state.penaltyPersonalCount[key] += 1;
  state.penaltyPersonalSeconds[key] += durationSeconds;
}

// Decide whether `key` crossed an ejection threshold; if so, record + alert.
// isInHome: In-Home team fouls never trigger an ejection.
// Returns the new Ejection event's id, or '' if no ejection happened.
function maybeEject(key, isInHome) {
  if (isInHome) return '';
  if (state.ejectedKeys.indexOf(key) !== -1) return ''; // already ejected
  var count = state.penaltyPersonalCount[key] || 0;
  var secs = state.penaltyPersonalSeconds[key] || 0;
  var reason = '';
  if (secs >= 300) reason = '5:00 of personal fouls';
  else if (count >= 5) reason = '5th personal foul';
  if (!reason) return '';

  state.ejectedKeys.push(key);

  var isTigers = (key.indexOf('Opp #') !== 0);
  if (isTigers) {
    // Tigers: use the existing eject path (also removes from field),
    // but pass a custom reason via the alert.
    return ejectPlayer(key, true, reason);
  } else {
    // Opponent: no field removal; record an Ejection data point + acknowledged alert.
    var ejId = recordEjectionEvent(key, reason);
    showEjectAlert(key + ' should be ejected — ' + reason);
    return ejId;
  }
}

// Write a standalone Ejection event (used for opponents and manual ejects).
// Returns the new event's id.
function recordEjectionEvent(key, reason) {
  var ejId = newEventId();
  state.activeGame.events.push({
    id: ejId,
    type: 'ejection',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: key,
    playerName: key,
    playerJersey: '',
    metric: 'Ejection',
    strength: state.currentStrength,
    penDuration: '',
    penName: reason || ''
  });
  saveState();
  renderEventLog();
  return ejId;
}

// --- Acknowledged ejection alert ---
function showEjectAlert(msg) {
  document.getElementById('ejectAlertMsg').textContent = msg;
  document.getElementById('ejectAlertModal').classList.add('show');
}

function closeEjectAlert() {
  document.getElementById('ejectAlertModal').classList.remove('show');
}


// ============================================================
// EJECTION SYSTEM
// ============================================================

function openEjectionModal() {
  var list = document.getElementById('ejectionPlayerList');
  list.innerHTML = '';
  playersByJersey().forEach(function(p) {
    if (state.ejectedPlayers.indexOf(p.Player_ID) !== -1) return;
    var item = document.createElement('div');
    item.className = 'ejection-player-item';
    item.textContent = (jerseyText(p) ? '#' + jerseyText(p) + ' ' : '(no #) ') + p.Name;
    item.addEventListener('click', function() {
      if (confirm('Eject #' + p.Jersey + ' ' + p.Name + '?')) {
        ejectPlayer(p.Player_ID, false);
        closeEjectionModal();
      }
    });
    list.appendChild(item);
  });
  document.getElementById('ejectionModal').classList.add('show');
}

function closeEjectionModal() {
  document.getElementById('ejectionModal').classList.remove('show');
}

// Returns the new Ejection event's id ('' if the player was already ejected).
function ejectPlayer(playerId, isAutoEject, reason) {
  if (state.ejectedPlayers.indexOf(playerId) !== -1) return '';
  state.ejectedPlayers.push(playerId);
  if (state.ejectedKeys.indexOf(playerId) === -1) state.ejectedKeys.push(playerId);

  var player = state.players.find(function(p) { return p.Player_ID === playerId; });
  var playerName = player ? ('#' + player.Jersey + ' ' + player.Name) : playerId;

  // Log ejection event
  var evt = {
    id: newEventId(),
    type: 'ejection',
    quarter: state.currentQuarter,
    timestamp: new Date().toISOString(),
    playerId: playerId,
    playerName: player ? player.Name : '',
    playerJersey: player ? player.Jersey : '',
    metric: 'Ejection',
    strength: state.currentStrength,
    penDuration: '',
    penName: reason || ''
  };
  state.activeGame.events.push(evt);

  saveState();
  renderPlayerGrid();
  renderEventLog();

  if (isAutoEject) {
    showEjectAlert(playerName + ' should be ejected — ' + (reason || '5:00 of personal fouls'));
  } else {
    showToast(playerName + ' EJECTED', 'error');
  }
  return evt.id;
}
