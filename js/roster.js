// js/roster.js - Roster screen, adding players, and pulling the roster/officials from the workbook (needs the PIN).
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// ROSTER MANAGEMENT
// ============================================================

function renderRoster() {
  var list = document.getElementById('rosterList');
  list.innerHTML = '';

  var sorted = state.players.slice().sort(function(a, b) {
    // In-Home player sorts to the very top; everyone else by jersey number.
    if (a.isInHome && !b.isInHome) return -1;
    if (b.isInHome && !a.isInHome) return 1;
    return compareJersey(a, b);
  });

  sorted.forEach(function(p) {
    var item = document.createElement('div');
    item.className = 'roster-item';
    item.innerHTML = '<div class="jersey-num">#' + escapeHtml(p.Jersey) + '</div>'
      + '<div class="player-info"><div class="player-name">' + escapeHtml(p.Name) + (p.isInHome ? ' \u2605 In-Home' : '') + '</div>'
      + '<div class="player-pos">' + escapeHtml(p.Position) + ' | ID: ' + escapeHtml(p.Player_ID) + '</div></div>'
      + '<div class="roster-check-group"><span class="check-label">START</span>'
      + '<input type="checkbox" class="starter-check" ' + (p.isStarter ? 'checked' : '') + ' title="Starter"></div>'
      + '<div class="roster-check-group"><span class="check-label">IN-HOME</span>'
      + '<button class="ih-toggle ' + (p.isInHome ? 'active' : '') + '" ' + (p.isStarter ? '' : 'disabled') + ' title="In-Home (must be a starter)">IH</button></div>'
      + '<button class="remove-btn">X</button>';

    item.querySelector('.starter-check').addEventListener('change', function() {
      p.isStarter = this.checked;
      // A player removed from the starting lineup cannot remain In-Home.
      if (!p.isStarter && p.isInHome) p.isInHome = false;
      saveState();
      renderRoster();
    });

    var ihBtn = item.querySelector('.ih-toggle');
    if (ihBtn) {
      ihBtn.addEventListener('click', function() {
        if (!p.isStarter) {
          showToast('In-Home must be a starter first', 'error');
          return;
        }
        if (p.isInHome) {
          p.isInHome = false;
        } else {
          // Only one In-Home per team: clear any existing one.
          state.players.forEach(function(pl) { pl.isInHome = false; });
          p.isInHome = true;
          if (p.Position !== 'Attack') {
            showToast('Set In-Home (note: usually a starting Attackman)', 'warning');
          }
        }
        saveState();
        renderRoster();
      });
    }

    item.querySelector('.remove-btn').addEventListener('click', function() {
      if (confirm('Remove ' + p.Name + '?')) {
        state.players = state.players.filter(function(pl) { return pl.Player_ID !== p.Player_ID; });
        saveState();
        renderRoster();
      }
    });

    list.appendChild(item);
  });
}

function addPlayer() {
  var jersey = document.getElementById('addJersey').value.trim();
  var name = document.getElementById('addName').value.trim();
  var position = document.getElementById('addPosition').value;

  if (!jersey || !name) {
    showToast('Jersey number and name required', 'error');
    return;
  }

  var playerId = '11' + jersey;

  // Check for duplicate
  if (state.players.find(function(p) { return p.Player_ID === playerId; })) {
    showToast('Player with that jersey already exists', 'error');
    return;
  }

  state.players.push({
    Player_ID: playerId,
    Jersey: jersey,
    Name: name,
    Position: position,
    isStarter: false,
    isInHome: false
  });

  saveState();
  renderRoster();
  document.getElementById('addJersey').value = '';
  document.getElementById('addName').value = '';
  showToast(name + ' added to roster', 'success');
}

// ============================================================
// ROSTER / OFFICIALS PULL (needs the PIN; sent in the request body, never in a URL)
// ============================================================

// Ask the script for data. Resolves with the reply, or null after showing why
// it failed (cancelled, wrong PIN, out-of-date script, no connection).
function pullFromScript(action, statusEl, label) {
  if (!getScriptUrl()) {
    showToast('No Apps Script link is set up. Ask the coach.', 'error');
    return Promise.resolve(null);
  }
  var pin = getWritePin('Enter the stats PIN to pull the ' + label + ' from the workbook:');
  if (!pin) {
    if (statusEl) statusEl.textContent = '';
    return Promise.resolve(null);
  }
  if (statusEl) statusEl.textContent = 'Loading...';
  return getScriptVersion().then(function(version) {
    if (version < 3) {
      if (statusEl) statusEl.textContent = 'The Apps Script needs updating';
      showToast('The team\'s Apps Script is out of date, so the ' + label + ' can\'t be pulled. Let the coach know.', 'error');
      return null;
    }
    return postJson({ action: action, pin: pin }).then(function(data) {
      if (data && data.success) return data;
      if (data && data.error === 'INVALID_PIN') {
        clearWritePin();
        if (statusEl) statusEl.textContent = 'Wrong PIN';
        showToast('Incorrect PIN. Nothing was loaded.', 'error');
      } else {
        if (statusEl) statusEl.textContent = 'Error loading ' + label;
        showToast((data && (data.message || data.error)) || ('Failed to load ' + label), 'error');
      }
      return null;
    });
  }).catch(function() {
    if (statusEl) statusEl.textContent = 'Connection failed';
    showToast('Could not reach the workbook. Check your connection.', 'error');
    return null;
  });
}

function pullRoster() {
  var statusEl = document.getElementById('rosterStatus');
  return pullFromScript('getRoster', statusEl, 'roster').then(function(data) {
    if (!data || !data.players) return;
    // The Players sheet is the source of truth: starters always match
    // column E (isStarter) on every pull. Starters tapped in the app are
    // replaced.
    state.players = data.players.map(function(p) {
      return {
        Player_ID: String(p.Player_ID),
        Jersey: String(p.Jersey),
        Name: String(p.Name),
        Position: String(p.Position),
        isStarter: p.isStarter === true
      };
    });
    saveState();
    renderRoster();
    statusEl.textContent = state.players.length + ' players loaded';
    showToast('Roster updated: ' + state.players.length + ' players', 'success');
  });
}

// The Officials reference list (feeds the Start-Game dropdowns).
function pullOfficials() {
  var statusEl = document.getElementById('officialsStatus');
  return pullFromScript('getOfficials', statusEl, 'officials list').then(function(data) {
    if (!data || !data.officials) return;
    state.officials = data.officials.map(function(o) {
      return { Role: String(o.Role || ''), Name: String(o.Name || '') };
    });
    saveState();
    if (statusEl) statusEl.textContent = state.officials.length + ' officials loaded';
    showToast('Officials updated: ' + state.officials.length, 'success');
  });
}
