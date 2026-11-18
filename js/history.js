// js/history.js - History screen (sync status, Scoresheet / MaxPreps buttons) and Reset All Local Data.
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
      + '<div class="opponent">vs ' + escapeHtml(g.opponent) + '</div>'
      + '<div class="meta">' + escapeHtml(g.date) + ' | ' + escapeHtml(g.location) + ' | ' + (g.eventCount || 0) + ' events</div>'
      + '<div class="score">' + escapeHtml(g.score) + '</div>'
      + '</div>';

    var control;
    if (synced || !hasEvents) {
      control = '<span class="sync-control is-synced">Synced &#10003;</span>';
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

    // Scoresheet + MaxPreps file (built on this device; no PIN or signal needed).
    if (hasEvents) {
      var ex = document.createElement('div');
      ex.className = 'ghi-exports';
      var b1 = document.createElement('button');
      b1.textContent = 'Scoresheet';
      b1.addEventListener('click', function() { openScoresheet(g.id); });
      var b2 = document.createElement('button');
      b2.textContent = 'MaxPreps file';
      b2.addEventListener('click', function() { downloadMaxPrepsCsv(g.id); });
      ex.appendChild(b1);
      ex.appendChild(b2);
      item.querySelector('.ghi-info').appendChild(ex);
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
