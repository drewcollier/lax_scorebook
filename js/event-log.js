// js/event-log.js - The Event Log list and Undo (removes everything one tap recorded).
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// EVENT LOG
// ============================================================

function renderEventLog() {
  var list = document.getElementById('eventLogList');
  if (!list || !state.activeGame) return;
  list.innerHTML = '';

  var events = state.activeGame.events.filter(function(e) {
    return e.quarter === state.currentQuarter;
  });

  // Show most recent first
  events.reverse().forEach(function(evt) {
    var item = document.createElement('div');
    item.className = 'event-item';
    
    var text = '';
    if (evt.playerId === 'OPPONENT') {
      text = evt.metric.replace(/_/g, ' ');
    } else {
      var statLabel = (typeof SF_LABELS !== 'undefined' && SF_LABELS[evt.metric]) ? SF_LABELS[evt.metric] : evt.metric;
      text = statLabel;
      if (evt.playerJersey) {
        text += ' #' + evt.playerJersey;
      }
      if (evt.penDuration) {
        var dur = evt.penDuration >= 60 ? (evt.penDuration / 60) + 'min' : evt.penDuration + 's';
        text += ' (' + dur + ')';
      }
    }
    if (evt.team === 'opponent' && evt.metric === 'Penalty') {
      text = (evt.playerName || 'OPP') + ' Penalty';
      if (evt.penDuration) {
        var odur = evt.penDuration >= 60 ? (evt.penDuration / 60) + 'min' : evt.penDuration + 's';
        text += ' (' + odur + ')';
      }
    }
    if (evt.metric === 'EMO_Success') {
      text = 'EMO: Success';
    }
    if (evt.metric === 'Penalty' && evt.locked) {
      text += ' - LOCKED IN';
    }
    if (evt.metric === 'EMO_Fail') {
      text = 'EMO: Fail';
    }
    if (evt.metric === 'Ejection') {
      text = 'EJECTION: ' + (evt.playerJersey ? '#' + evt.playerJersey : (evt.playerName || evt.playerId)) + (evt.penName ? ' (' + evt.penName + ')' : '');
    }

    var time = new Date(evt.timestamp);
    var timeStr = time.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

    item.innerHTML = '<span class="event-text">' + escapeHtml(text) + '</span>'
      + '<span class="event-time">' + escapeHtml(timeStr) + '</span>'
      + '<button class="undo-btn" data-id="' + escapeHtml(evt.id) + '">Undo</button>';

    item.querySelector('.undo-btn').addEventListener('click', function() {
      undoEvent(evt.id);
    });

    list.appendChild(item);
  });
}

// Events recorded by one tap (e.g. Goal + its Shot + its Shot on Goal, or a
// Goal Allowed + the opponent's Goal/SOG/Shot) share a groupId, so Undo on any
// one of them removes the whole set and the stats stay consistent.
var undoInProgress = false;

function tagEventGroup(startIndex) {
  var events = state.activeGame.events;
  if (events.length - startIndex < 2) return; // a single row needs no group
  var groupId = 'G' + Date.now() + Math.random().toString(36).substr(2, 4);
  for (var i = startIndex; i < events.length; i++) events[i].groupId = groupId;
}

// Put back whatever recording this one event changed (score, penalties,
// foul counts toward ejection, ejections).
function reverseEventEffects(evt) {
  if (evt.metric === 'Goal') {
    state.activeGame.homeScore = Math.max(0, state.activeGame.homeScore - 1);
  }
  if (evt.metric === 'Opp_Goal') {
    state.activeGame.awayScore = Math.max(0, state.activeGame.awayScore - 1);
  }
  if (evt.metric === 'Penalty') {
    if (evt.penDuration && evt.playerId && state.penaltyMinutes[evt.playerId] !== undefined) {
      state.penaltyMinutes[evt.playerId] = Math.max(0, state.penaltyMinutes[evt.playerId] - evt.penDuration);
    }
    // Take this personal foul back off the count toward ejection.
    if (evt.foulKey) {
      var k = evt.foulKey;
      state.penaltyPersonalCount[k] = Math.max(0, (state.penaltyPersonalCount[k] || 0) - 1);
      state.penaltyPersonalSeconds[k] = Math.max(0, (state.penaltyPersonalSeconds[k] || 0) - (evt.penDuration || 0));
    }
    removeActivePenalty(evt.id);
  }
  if (evt.penaltyEffects) restorePenaltiesFromGoal(evt);
  if (evt.metric === 'Ejection' && evt.playerId) {
    var ejIdx = state.ejectedPlayers.indexOf(evt.playerId);
    if (ejIdx !== -1) state.ejectedPlayers.splice(ejIdx, 1);
    var keyIdx = state.ejectedKeys.indexOf(evt.playerId);
    if (keyIdx !== -1) state.ejectedKeys.splice(keyIdx, 1);
  }
}

function undoEvent(eventId) {
  if (!state.activeGame) return;
  var events = state.activeGame.events;
  var evt = events.filter(function(e) { return e.id === eventId; })[0];
  if (!evt) return;

  // 1. The tapped row, or its whole group.
  var ids = [];
  events.forEach(function(e) {
    if (e.id === eventId || (evt.groupId && e.groupId === evt.groupId)) ids.push(e.id);
  });
  // 2. Rows this set caused later: the man-up (EMO) success a goal triggered,
  //    and the ejection a 5th personal foul triggered.
  events.forEach(function(e) {
    if (ids.indexOf(e.id) === -1) return;
    [e.emoEventId, e.ejectionEventId].forEach(function(linked) {
      if (linked && ids.indexOf(linked) === -1) ids.push(linked);
    });
  });

  var removed = events.filter(function(e) { return ids.indexOf(e.id) !== -1; });
  var reopenEmo = false;
  undoInProgress = true;
  try {
    removed.forEach(function(e) {
      reverseEventEffects(e);
      if (e.metric === 'EMO_Success') reopenEmo = true;
    });
  } finally {
    undoInProgress = false;
  }
  state.activeGame.events = events.filter(function(e) { return ids.indexOf(e.id) === -1; });

  // The man-up chance that goal "used" is open again if the Tigers are still man-up.
  if (reopenEmo && state.currentStrength === 'Man-Up') state.emoOpen = true;

  document.getElementById('homeScore').textContent = state.activeGame.homeScore;
  document.getElementById('awayScore').textContent = state.activeGame.awayScore;
  saveState();
  renderPlayerGrid();
  renderEventLog();

  var labels = removed.map(function(e) {
    var l = SF_LABELS[e.metric] || e.metric.replace(/_/g, ' ');
    return l + (e.playerJersey ? ' #' + e.playerJersey : '');
  });
  showToast('Undone: ' + labels.join(', '), 'info');
}
