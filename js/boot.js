// js/boot.js - runs first (from <head>): offline support (sw.js), the "new version ready" bar,
// and asking the browser to keep the app's saved data.

// Offline support + "new version ready" bar (see sw.js).
if ('serviceWorker' in navigator) {
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(function(reg) {
    // Check for a new version whenever the app comes back to the screen.
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') reg.update().catch(function() {});
    });
  }).catch(function() {});
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (!hadController) return; // first install, nothing to announce
    var bar = document.getElementById('updateBar');
    if (bar) bar.style.display = 'flex';
  });
}
// Ask the browser to keep this app's saved data (games, roster) even when the
// device is low on space or the app hasn't been opened for a while (iPads
// otherwise clear it after a few weeks unused).
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then(function(already) {
    return already || navigator.storage.persist();
  }).then(function(ok) {
    window.storageProtected = !!ok;
  }).catch(function() {});
}
