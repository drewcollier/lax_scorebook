// js/sync.js - The stats PIN, talking to the Apps Script, and sending games to the workbook (confirmed saves, retries).
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// SENDING GAMES TO THE WORKBOOK
// ============================================================

// --- Stats PIN ---
// One PIN is needed to pull the roster/officials and to save a game.
// By default it is NOT remembered: the app asks every time and keeps it only
// long enough to send that one request, so a scorekeeper can hand the tablet to
// the coach to push the game. Settings > "Remember the PIN on this device" turns
// remembering on (useful on a coach's own phone).
var PIN_KEY = 'scorebook_write_pin';
var REMEMBER_PIN_KEY = 'scorebook_remember_pin';

function rememberPinOn() {
  try { return localStorage.getItem(REMEMBER_PIN_KEY) === '1'; } catch (e) { return false; }
}

// Ask for the PIN (or use the remembered one). Returns '' if cancelled.
function getWritePin(promptText) {
  var pin = getSavedPin();
  if (pin) return pin;
  pin = (window.prompt(promptText || 'Enter the stats PIN:') || '').trim();
  if (pin && rememberPinOn()) {
    try { localStorage.setItem(PIN_KEY, pin); } catch (e) {}
  }
  return pin;
}

// The remembered PIN, or '' when remembering is off. Never prompts.
function getSavedPin() {
  if (!rememberPinOn()) return '';
  try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; }
}

function clearWritePin() {
  try { localStorage.removeItem(PIN_KEY); } catch (e) {}
}

// Settings checkbox.
function setRememberPin(on) {
  try {
    if (on) localStorage.setItem(REMEMBER_PIN_KEY, '1');
    else localStorage.removeItem(REMEMBER_PIN_KEY);
  } catch (e) {}
  applyPinSetting();
  showToast(on ? 'The PIN will be remembered on this device after you next enter it.'
               : 'The PIN will be asked for every time and is not stored on this device.', 'info');
}

// Sync the Settings screen with the setting. With remembering off, any PIN an
// older version saved on this device is deleted.
function applyPinSetting() {
  var on = rememberPinOn();
  if (!on) clearWritePin();
  var cb = document.getElementById('rememberPinCheck');
  if (cb) cb.checked = on;
  var btn = document.getElementById('changePinBtn');
  if (btn) btn.style.display = on ? '' : 'none';
  var statusEl = document.getElementById('pinStatus');
  if (statusEl) {
    statusEl.textContent = on
      ? (getSavedPin() ? 'A PIN is saved on this device.' : 'No PIN saved yet; it will be saved the next time you enter it.')
      : 'Not remembered: you will be asked for the PIN each time.';
  }
}

// Settings action (only shown when remembering is on): set or clear the saved PIN.
function changeWritePin() {
  var entered = window.prompt('Enter the stats PIN for this device (leave blank to clear it):', '');
  if (entered === null) return; // cancelled
  entered = entered.trim();
  if (!entered) {
    clearWritePin();
    showToast('Stats PIN cleared on this device.', 'info');
  } else {
    try { localStorage.setItem(PIN_KEY, entered); } catch (e) {}
    showToast('Stats PIN saved on this device.', 'success');
  }
  applyPinSetting();
}


// ------------------------------------------------------------
// TALKING TO THE APPS SCRIPT (V3.24)
// Games are sent with fetch() and the script's JSON reply is read, so a game
// is only marked "Synced" when Google confirms it was saved. Re-sending a game
// is always safe: the script (version 2+) replaces that game instead of adding
// it twice. Unsynced games are retried automatically when the app opens and
// whenever the device comes back online.
// Scripts older than version 2 can't send a readable reply; for those the app
// falls back to the original hidden-form method (unconfirmed) and asks you to
// update the script.
// ------------------------------------------------------------
var scriptInfo = { url: '', version: 0 };
var syncInFlight = {};

function fetchWithTimeout(url, opts, ms) {
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  if (ctrl) opts.signal = ctrl.signal;
  var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, ms);
  return fetch(url, opts).then(function(r) {
    clearTimeout(timer);
    return r;
  }, function(err) {
    clearTimeout(timer);
    throw err;
  });
}

// Resolves to the script's version (1 = original script). Rejects when the
// script can't be reached (no signal, bad URL).
function getScriptVersion() {
  var url = getScriptUrl();
  if (scriptInfo.url === url && scriptInfo.version) return Promise.resolve(scriptInfo.version);
  var sep = url.indexOf('?') === -1 ? '?' : '&';
  return fetchWithTimeout(url + sep + 'action=version', {}, 15000)
    .then(function(r) { return r.text(); })
    .then(function(text) {
      var v = 1;
      try {
        var j = JSON.parse(text);
        if (j && j.version) v = Number(j.version) || 1;
      } catch (e) { /* plain-text reply = original script */ }
      scriptInfo = { url: url, version: v };
      return v;
    });
}

// POST a JSON payload and return the script's parsed JSON reply.
// (A plain string body is sent as text/plain, which Apps Script accepts
// without a CORS pre-flight.)
function postJson(payload) {
  return fetchWithTimeout(getScriptUrl(), {
    method: 'POST',
    body: JSON.stringify(payload)
  }, 45000)
    .then(function(r) { return r.text(); })
    .then(function(text) {
      try { return JSON.parse(text); } catch (e) { throw new Error('BAD_REPLY'); }
    });
}

// Original method for scripts older than version 2: submit a hidden form into
// the hidden iframe. The reply usually can't be read, so the save is unconfirmed.
function legacyPostToScript(payload, callback) {
  var url = getScriptUrl();
  if (!url) return;
  var handler = function(event) {
    if (event.data && event.data.type === 'scorebook_response') {
      window.removeEventListener('message', handler);
      if (callback) callback(event.data.data);
    }
  };
  window.addEventListener('message', handler);
  setTimeout(function() { window.removeEventListener('message', handler); }, 15000);

  var form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.target = 'postFrame';
  form.style.display = 'none';
  var input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify(payload);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  setTimeout(function() { if (form.parentNode) form.parentNode.removeChild(form); }, 1000);
}

// Turn a History entry into the script's exportGame payload.
function buildExportPayload(entry, pin) {
  var meta = entry.meta || {};
  return {
    action: 'exportGame',
    pin: pin,
    gameData: {
      events: entry.events.map(function(evt) {
        return {
          Timestamp: evt.timestamp,
          Game_ID: entry.id,
          Period: evt.quarter,
          Action_Type: evt.metric,
          Primary_Player_ID: evt.playerId || '',
          Secondary_Player_ID: evt.linkedPlayerId || '',
          Strength: evt.strength,
          Pen_Duration: evt.penDuration || '',
          Game_Clock: evt.gameClock || evt.penClock || '',
          Penalty_Type: evt.penType || '',
          Penalty_Name: evt.penName || '',
          Zone_ID: evt.zoneId || ''
        };
      }),
      game: {
        Game_ID: entry.id,
        Date: entry.date,
        Opponent: entry.opponent,
        Location: entry.location,
        Score: entry.score,
        Weather_Temp: meta.weatherTemp || '',
        Weather_Cond: meta.weatherCond || '',
        Game_Start: meta.gameStart || '',
        Head_Official: meta.headOfficial || '',
        Umpire: meta.umpire || '',
        Field_Judge: meta.fieldJudge || '',
        Tigers_Scorer: meta.tigersScorer || '',
        Tigers_Timer: meta.tigersTimer || '',
        Opp_Scorer: meta.oppScorer || ''
      }
    }
  };
}

// Send (or re-send) a game from History to the workbook.
//   mode 'manual'     - "Press to sync" button (may ask for the PIN)
//   mode 'auto'       - right after End Game (may ask for the PIN)
//   mode 'background' - automatic retry; never prompts, stays quiet unless it succeeds
// Resolves to 'synced', 'offline', 'pin', 'error', 'legacy' or 'skipped'.
function pushGameFromHistory(gameId, mode) {
  mode = mode || 'manual';
  var loud = (mode !== 'background');
  var entry = null;
  for (var i = 0; i < state.gameHistory.length; i++) {
    if (state.gameHistory[i].id === gameId) { entry = state.gameHistory[i]; break; }
  }
  if (!entry) { showToast('Game not found in history.', 'error'); return Promise.resolve('skipped'); }
  if (!getScriptUrl()) {
    if (mode === 'manual') showToast('No Apps Script link is set up. Ask the coach.', 'warning');
    return Promise.resolve('skipped');
  }
  if (!entry.events || entry.events.length === 0) {
    if (loud) showToast('This game has no event data to push.', 'warning');
    return Promise.resolve('skipped');
  }
  if (syncInFlight[gameId]) return Promise.resolve('skipped');

  var pin = loud ? getWritePin('Enter the stats PIN to save "' + entry.opponent + '" to the workbook.\n(Cancel to leave it in History and save it later.)') : getSavedPin();
  if (!pin) {
    if (loud) showToast('Not saved yet. It\'s kept in History: tap Press to sync and enter the PIN when ready.', 'info');
    return Promise.resolve('skipped');
  }

  syncInFlight[gameId] = true;
  renderHistory();
  if (mode === 'manual') showToast('Saving "' + entry.opponent + '" to the workbook...', 'info');
  var payload = buildExportPayload(entry, pin);

  function done(result, message) {
    delete syncInFlight[gameId];
    entry.syncError = (result === 'synced' || result === 'legacy') ? '' : (message || '');
    saveState();
    renderHistory();
    return result;
  }

  return getScriptVersion().then(function(version) {
    if (version < 2) {
      // Original script: can't confirm, and re-sending would add the game twice,
      // so never retry in the background.
      if (!loud) return done('skipped', entry.syncError);
      legacyPostToScript(payload);
      entry.synced = true;
      trimHistory();
      showToast('Sent to the workbook, but the Apps Script is out of date so the save can\'t be confirmed. Update the script (see the guide).', 'warning');
      return done('legacy');
    }
    return postJson(payload).then(function(resp) {
      if (resp && resp.success) {
        entry.synced = true;
        trimHistory();
        showToast('Saved "' + entry.opponent + '" to the workbook ✓ (' + (resp.eventsWritten || 0) + ' events)', 'success');
        return done('synced');
      }
      if (resp && resp.error === 'INVALID_PIN') {
        clearWritePin();
        if (loud) showToast('Incorrect PIN -- stats were NOT saved. Try again.', 'error');
        return done('pin', 'Wrong PIN - tap to try again');
      }
      if (resp && resp.error === 'PIN_NOT_SET') {
        if (loud) showToast(resp.message, 'error');
        return done('error', 'The PIN is not set up in the Apps Script');
      }
      var msg = (resp && (resp.message || resp.error)) || 'The script did not save the game.';
      if (loud) showToast('Not saved: ' + msg, 'error');
      return done('error', msg);
    });
  }).catch(function() {
    if (loud) showToast('No connection. The game is kept on this device and will sync automatically when you\'re back online.', 'warning');
    return done('offline', 'No connection - will retry automatically');
  });
}

// Retry every unsynced game, one at a time, without prompting. Runs when the
// app opens and when the device comes back online.
function syncPendingGames() {
  if (!getScriptUrl() || !getSavedPin()) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
  var pending = state.gameHistory.filter(function(g) {
    return g.synced !== true && g.events && g.events.length;
  }).map(function(g) { return g.id; });
  return pending.reduce(function(p, id) {
    return p.then(function() { return pushGameFromHistory(id, 'background'); });
  }, Promise.resolve());
}
window.addEventListener('online', function() { syncPendingGames(); });
