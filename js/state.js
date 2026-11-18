// js/state.js - App state, saving/loading it on the device, small helpers (escapeHtml, toasts) and tab switching.
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// STATE MANAGEMENT
// ============================================================

// The link actually used: the device override if one is set, else the built-in one.
function getScriptUrl() {
  var u = (state.settings && state.settings.scriptUrl) || '';
  if (u) return u;
  return /^https?:\/\//.test(DEFAULT_SCRIPT_URL) ? DEFAULT_SCRIPT_URL : '';
}

var state = {
  players: [],
  activeGame: null,
  gameHistory: [],
  settings: { scriptUrl: '' },
  currentQuarter: 'Q1',
  currentStrength: 'Even',
  currentFilter: 'All',
  ejectedPlayers: [],
  penaltyMinutes: {}, // playerId -> total seconds (all penalties, for man-down accounting)
  penaltyPersonalCount: {},   // key (Tigers Player_ID or "Opp #22") -> count of PERSONAL fouls
  penaltyPersonalSeconds: {}, // same key -> total PERSONAL-foul seconds (for the 5:00 trigger)
  ejectedKeys: [],            // ejection keys already recorded (incl. "Opp #22") to avoid dupes
  oppInHomeJersey: '',        // remembered opponent In-Home jersey number
  oppPenaltyJersey: '',       // opponent jersey entered for the penalty in progress
  penaltyDuration: 0,         // duration (s) chosen for the penalty in progress
  selectedPenaltyPlayer: null,
  penaltyTeam: null,   // team for penalty in progress
  penaltyClock: '',    // MM:SS entered for penalty in progress
  penaltyName: '',     // selected penalty name
  penaltyType: '',     // 'Technical' or 'Personal'
  goalClock: '',       // digits entered for goal clock in progress
  goalClockTargetIds: [], // event ids to stamp with the goal clock
  assistGoalIds: [],   // Goal event ids awaiting an optional assist link
  assistScorerId: '',  // scorer's Player_ID (an assister can't be the scorer)
  timeoutsTigers: 3,   // remaining Tigers timeouts (per half; reset at Q3/OT)
  timeoutsOpp: 3,      // remaining Opponent timeouts
  officials: [],       // [{Role, Name}] pulled from the Officials tab
  gsDigits: '',        // Game Start keypad digits (HHMM) in progress
  gsAmPm: 'PM',        // Game Start AM/PM selection
  emoOpen: false       // an extra-man opportunity (man-up) is currently open & unscored
};

// Load from localStorage
function loadState() {
  try {
    var saved = localStorage.getItem('scorebook_v2_state');
    if (saved) {
      var parsed = JSON.parse(saved);
      state.players = parsed.players || [];
      state.activeGame = parsed.activeGame || null;
      state.gameHistory = parsed.gameHistory || [];
      state.settings = parsed.settings || { scriptUrl: '' };
      state.officials = parsed.officials || [];
      // Restore the in-game state (quarter, timeouts, penalties/ejections, man-up)
      // so a page reload in the middle of a game picks up exactly where it left off.
      if (parsed.live && state.activeGame) {
        LIVE_KEYS.forEach(function(k) {
          if (parsed.live[k] !== undefined) state[k] = parsed.live[k];
        });
      }
    }
  } catch(e) {
    console.error('Failed to load state:', e);
  }
  // Apply settings to UI
  document.getElementById('scriptUrl').value = state.settings.scriptUrl || '';
}

// In-game values that must survive a page reload during a game.
var LIVE_KEYS = [
  'currentQuarter', 'currentStrength', 'timeoutsTigers', 'timeoutsOpp', 'emoOpen',
  'ejectedPlayers', 'ejectedKeys', 'penaltyMinutes', 'penaltyPersonalCount',
  'penaltyPersonalSeconds', 'oppInHomeJersey'
];

function saveState() {
  try {
    var live = {};
    LIVE_KEYS.forEach(function(k) { live[k] = state[k]; });
    localStorage.setItem('scorebook_v2_state', JSON.stringify({
      players: state.players,
      activeGame: state.activeGame,
      gameHistory: state.gameHistory,
      settings: state.settings,
      officials: state.officials,
      live: live
    }));
  } catch(e) {
    console.error('Failed to save state:', e);
  }
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

// Escape text before putting it into innerHTML, so a name like O'Brien, or one
// containing <, > or &, always shows exactly as typed and can't break the page.
function escapeHtml(x) {
  if (x === null || x === undefined) return '';
  return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}

// ============================================================
// TAB NAVIGATION
// ============================================================

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var tab = this.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
    this.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'roster') renderRoster();
    if (tab === 'history') renderHistory();
    if (tab === 'settings') {
      var ss = document.getElementById('storageStatus');
      if (ss) ss.textContent = window.storageProtected ? 'Saved games are protected on this device.'
        : 'Tip: add the app to your home screen so the device keeps its saved games.';
    }
    if (tab === 'game') renderGameUI();
  });
});
