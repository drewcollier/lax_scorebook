// js/settings.js - Settings screen: script link override and Test Connection.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// SETTINGS
// ============================================================

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
  scriptInfo = { url: '', version: 0 }; // always ask fresh
  getScriptVersion().then(function(version) {
    if (version < 2) {
      status.textContent = 'Connected, but the Apps Script is an older version. Update it (see the guide) so saves can be confirmed.';
      status.style.color = '#fd7e14';
      return;
    }
    return postJson({ test: true }).then(function(resp) {
      if (resp && resp.success) {
        status.textContent = 'Connected! Script version ' + version + '. Saves will be confirmed.';
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
