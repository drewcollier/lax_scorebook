// js/history.js - History screen (sync status, MaxPreps / game file buttons) and Reset All Local Data.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// HISTORY
// ============================================================

function renderHistory() {
  var list = document.getElementById('historyList');
  list.innerHTML = '';

  if (state.gameHistory.length === 0) {
    list.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:20px;">No past games recorded yet.</p>';
    return;
  }

  // Show newest first
  var sorted = state.gameHistory.slice().reverse();
  sorted.forEach(function(g) {
    var item = document.createElement('div');
    item.className = 'game-history-item';

    var synced = g.synced === true;
    var hasEvents = g.events && g.events.length > 0;

    var info = '<div class="ghi-info">'
      + '<div class="opponent">vs ' + escapeHtml(g.opponent) + (g.isTest ? ' <span class="test-tag">TEST</span>' : '') + '</div>'
      + '<div class="meta">' + escapeHtml(g.date) + ' | ' + escapeHtml(g.location) + ' | ' + (g.eventCount || 0) + ' events</div>'
      + '<div class="score">' + escapeHtml(g.score) + '</div>'
      + '</div>';

    var control;
    if (synced || !hasEvents) {
      control = '<span class="sync-control is-synced">' + (g.isTest ? 'Synced to TEST' : 'Synced') + ' &#10003;</span>';
    } else if (syncInFlight[g.id]) {
      control = '<span class="sync-control needs-sync">Saving&hellip;</span>';
    } else {
      control = '<button class="sync-control needs-sync push-game-btn" data-game="' + escapeHtml(g.id) + '">Press to sync</button>';
    }

    item.innerHTML = info + control;

    // Why it hasn't synced yet (no connection, wrong PIN, ...).
    if (!synced && hasEvents && g.syncError && !syncInFlight[g.id]) {
      var why = document.createElement('div');
      why.className = 'sync-why';
      why.style.cssText = 'font-size:0.72rem; color:#fd7e14; margin-top:4px;';
      why.textContent = g.syncError;
      item.querySelector('.ghi-info').appendChild(why);
    }

    // MaxPreps file + game file (built on this device; no PIN or signal needed).
    // The printable scoresheet is in the Sheet (Lacrosse Tools).
    if (hasEvents) {
      var ex = document.createElement('div');
      ex.className = 'ghi-exports';
      var b2 = document.createElement('button');
      b2.textContent = 'MaxPreps file';
      b2.addEventListener('click', function() { downloadMaxPrepsCsv(g.id); });
      var b3 = document.createElement('button');
      b3.textContent = 'Save game file';
      b3.addEventListener('click', function() { downloadGameFile(g.id); });
      ex.appendChild(b2);
      ex.appendChild(b3);
      item.querySelector('.ghi-info').appendChild(ex);
    }

    // TEST games can be thrown away (real games never get this button).
    if (g.isTest) {
      var row = item.querySelector('.ghi-exports');
      if (!row) {
        row = document.createElement('div');
        row.className = 'ghi-exports';
        item.querySelector('.ghi-info').appendChild(row);
      }
      var bd = document.createElement('button');
      bd.textContent = 'Discard';
      bd.className = 'discard-test';
      bd.addEventListener('click', function() { discardTestGame(g.id); });
      row.appendChild(bd);
    }

    var btn = item.querySelector('.push-game-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        pushGameFromHistory(this.getAttribute('data-game'), 'manual');
      });
    }
    list.appendChild(item);
  });
}

// Removes a TEST game from this device's History. Only TEST games: a real game
// can't be discarded this way. Anything already sent to the TEST workbook stays
// there (Lacrosse Tools > Clear all games in the TEST copy empties it).
function discardTestGame(gameId) {
  var idx = -1;
  for (var i = 0; i < state.gameHistory.length; i++) if (state.gameHistory[i].id === gameId) idx = i;
  if (idx < 0) return;
  var g = state.gameHistory[idx];
  if (!g.isTest) return;
  if (syncInFlight[gameId]) { showToast('This game is being saved right now. Try again in a moment.', 'warning'); return; }
  if (!confirm('Discard the TEST game vs ' + g.opponent + ' from this device?' +
      (g.synced ? '\n\n(It stays in the TEST workbook; nothing changes in the team workbook.)' : '\n\n(It was never sent anywhere.)'))) return;
  state.gameHistory.splice(idx, 1);
  saveState();
  renderHistory();
  showToast('TEST game discarded', 'info');
}

function clearHistory() {
  if (!confirm('Clear all game history? This cannot be undone.')) return;
  state.gameHistory = [];
  saveState();
  renderHistory();
  showToast('History cleared', 'info');
}

// ============================================================
// DATA MANAGEMENT
// ============================================================

function resetAllData() {
  if (!confirm('This will delete ALL local data including roster, game history, and settings. Are you sure?')) return;
  if (!confirm('FINAL WARNING: All data will be permanently lost. Continue?')) return;
  // Remove everything this app keeps on the device (game data, saved PIN and
  // its setting, view/keypad preferences), then start fresh with a reload, so
  // every setting returns to its default.
  try {
    Object.keys(localStorage).forEach(function(k) {
      if (k.indexOf('scorebook_') === 0) localStorage.removeItem(k);
    });
  } catch (e) {}
  location.reload();
}

// "Save game file": the same file the script keeps in Drive for every saved
// game (Lacrosse Scorebook Backups). Keep it as a spare copy; to restore from
// it, put it in the season's backup folder in Drive and use
// Lacrosse Tools > Restore a game. Holds no PIN.
function downloadGameFile(gameId) {
  var entry = null;
  for (var i = 0; i < state.gameHistory.length; i++) if (state.gameHistory[i].id === gameId) entry = state.gameHistory[i];
  if (!entry) return;
  var data = buildExportPayload(entry, '').gameData;
  var file = { kind: 'lax-scorebook-game', backupVersion: 1, savedAt: new Date().toISOString(),
    from: 'scorebook app' + (entry.isTest ? ' (TEST game)' : ''), gameData: data };
  var name = (String(entry.date || '') + ' ' + (entry.location === 'Away' ? 'at' : 'vs') + ' ' + (entry.opponent || 'Opponent')
    + ' [' + entry.id + '].json').replace(/[\/\\:*?"<>|]+/g, '-');
  if (entry.isTest) name = 'TEST ' + name;
  var blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  showToast('Game file saved: ' + name, 'success');
}
