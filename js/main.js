// js/main.js - Start-up: load saved data and draw the screen. Loaded last.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  loadState();
  applyPinSetting();
  setTheme('');   // always open in the normal look (V3.40)
  renderGameUI();
  // Quietly retry any games that didn't reach the workbook last time.
  setTimeout(syncPendingGames, 2000);
});
