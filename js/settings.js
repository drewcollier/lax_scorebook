// js/settings.js - Settings screen: script link override and Test Connection.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// SETTINGS
// ============================================================

// ---- Test mode: games go to the TEST copy of the workbook ----
function applyTestMode() {
  var on = !!(state.settings && state.settings.testMode);
  var testGame = !!(state.activeGame && state.activeGame.isTest);
  var bar = document.getElementById('testBanner');
  if (bar) {
    bar.classList.toggle('show', on || testGame);
    bar.textContent = testGame ? 'TEST GAME - this game goes to the TEST workbook'
      : 'TEST MODE - new games go to the TEST workbook';
  }
  document.body.classList.toggle('test-mode', on || testGame);
}

function setTestMode(on) {
  if (on && !getScriptUrl(true)) {
    document.getElementById('testModeCheck').checked = false;
    showToast('Paste the TEST script link first, then tap Save.', 'error');
    return;
  }
  state.settings.testMode = !!on;
  scriptInfoCache = {};
  saveState();
  applyTestMode();
  showToast(on ? 'Test mode ON: new games go to the TEST workbook.' : 'Test mode off: new games go to the team workbook.', on ? 'warning' : 'success');
}

function saveTestUrl() {
  state.settings.testScriptUrl = document.getElementById('testScriptUrl').value.trim();
  scriptInfoCache = {};
  saveState();
  showToast('TEST script link saved', 'success');
}

function saveSettings() {
  state.settings.scriptUrl = document.getElementById('scriptUrl').value.trim();
  saveState();
  showToast('Settings saved', 'success');
}

function testConnection() {
  var url = getScriptUrl();
  var status = document.getElementById('connectionStatus');
  if (!url) {
    showToast('No Apps Script link is set up', 'error');
    return;
  }
  status.textContent = 'Testing...';
  status.style.color = '';
  scriptInfoCache = {}; // always ask fresh
  var testMode = !!state.settings.testMode;
  getScriptVersion().then(function(version) {
    if (version < 2) {
      status.textContent = 'Connected, but the Apps Script is an older version. Update it (see the guide) so saves can be confirmed.';
      status.style.color = '#fd7e14';
      return;
    }
    return postJson({ test: true }).then(function(resp) {
      if (resp && resp.success) {
        var where = resp.sheet ? ' Workbook: "' + resp.sheet + '".' : '';
        if (!!resp.test !== testMode) {
          status.textContent = (testMode ? 'Test mode is on, but this link is the team\'s LIVE Sheet. Test games will not be sent.'
            : 'This link is the TEST copy, not the team Sheet. Games will not be sent.') + where;
          status.style.color = '#dc3545';
          return;
        }
        status.textContent = 'Connected! Script version ' + version + (resp.test ? ' (TEST copy)' : '') + '. Saves will be confirmed.' + where;
        status.style.color = '#28a745';
        showToast('Connection successful!', 'success');
      } else {
        status.textContent = 'The script answered, but with an error: ' + ((resp && (resp.message || resp.error)) || 'unknown');
        status.style.color = '#dc3545';
      }
    });
  }).catch(function() {
    status.textContent = 'Could not reach the script. Check the URL and your connection.';
    status.style.color = '#dc3545';
  });
}
