// js/exports.js - The per-game MaxPreps file, built on the device.
// (The printable scoresheet lives in the Sheet only: Lacrosse Tools >
// Generate Printable Scoresheet. The app's copy was removed in V3.38.)
// Part of the Fishers Tigers Lacrosse Scorebook (index.html loads these in order).

// ============================================================
// GAME EXPORTS: MaxPreps per-game CSV, built on this device from the game's
// events in History, so it works offline and doesn't need the PIN.
// ============================================================
var SS_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2'];
var SS_POS_ORDER = ['Attack', 'Midfield', 'FOGO', 'LSM', 'Defense', 'Goalie'];
var REG_MINUTES = 48, OT_MINUTES = 4; // NFHS boys: 4 x 12:00, OT 4:00

function findHistoryGame(gameId) {
  for (var i = 0; i < state.gameHistory.length; i++) {
    if (state.gameHistory[i].id === gameId) return state.gameHistory[i];
  }
  return null;
}

// Tally one game: per-player numbers and per-quarter team boxes.
function computeGameStats(entry) {
  function zeroQ() { return { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OT1: 0, OT2: 0 }; }
  var g = {
    players: {}, goals: [], penalties: [],
    tigersQ: zeroQ(), oppQ: zeroQ(), gbQ: zeroQ(), shotQ: zeroQ(),
    clearGoodQ: zeroQ(), clearFailQ: zeroQ(), rideGoodQ: zeroQ(), rideFailQ: zeroQ(), emoScoredQ: zeroQ(), emoFailQ: zeroQ(),
    fowQ: zeroQ(), folQ: zeroQ(), timeouts: { h1: 0, h2: 0, ot1: 0, ot2: 0 }, otPlayed: 0
  };
  function P(id) {
    if (!g.players[id]) g.players[id] = { goals: 0, assists: 0, shots: 0, sog: 0, gbs: 0, int: 0, cto: 0, to: 0,
      fow: 0, fol: 0, saves: 0, ga: 0, savesQ: zeroQ(), pens: 0, penSecs: 0 };
    return g.players[id];
  }
  var ot = {};
  (entry.events || []).forEach(function(e) {
    var per = e.quarter, type = e.metric, prim = e.playerId || '', sec = e.linkedPlayerId || '';
    var inQ = SS_PERIODS.indexOf(per) !== -1;
    if (per === 'OT1' || per === 'OT2') ot[per] = true;
    if (type === 'Goal') {
      P(prim).goals++;
      if (sec) P(sec).assists++;
      if (inQ) g.tigersQ[per]++;
      g.goals.push({ scorer: prim, assist: sec, clock: e.gameClock || '', period: per });
    } else if (type === 'Opp_Goal') { if (inQ) g.oppQ[per]++; }
    else if (type === 'Shot') { P(prim).shots++; if (inQ) g.shotQ[per]++; }
    else if (type === 'SOG') { P(prim).sog++; }
    else if (type === 'GB') { P(prim).gbs++; if (inQ) g.gbQ[per]++; }
    else if (type === 'INT') { P(prim).int++; }
    else if (type === 'CTO') { P(prim).cto++; }
    else if (type === 'TO') { P(prim).to++; }
    else if (type === 'FOW') { P(prim).fow++; if (inQ) g.fowQ[per]++; }
    else if (type === 'FOL') { P(prim).fol++; if (inQ) g.folQ[per]++; }
    else if (type === 'Save') { var s = P(prim); s.saves++; if (inQ) s.savesQ[per]++; }
    else if (type === 'GA') { P(prim).ga++; }
    else if (type === 'Clear_Good') { if (inQ) g.clearGoodQ[per]++; }
    else if (type === 'Clear_Fail') { if (inQ) g.clearFailQ[per]++; }
    else if (type === 'Ride_Good') { if (inQ) g.rideGoodQ[per]++; }
    else if (type === 'Ride_Fail') { if (inQ) g.rideFailQ[per]++; }
    else if (type === 'EMO_Success') { if (inQ) g.emoScoredQ[per]++; }
    else if (type === 'EMO_Fail') { if (inQ) g.emoFailQ[per]++; }
    else if (type === 'TIMEOUT') {
      if (prim === 'TEAM') {
        if (per === 'Q1' || per === 'Q2') g.timeouts.h1++;
        else if (per === 'Q3' || per === 'Q4') g.timeouts.h2++;
        else if (per === 'OT1') g.timeouts.ot1++;
        else if (per === 'OT2') g.timeouts.ot2++;
      }
    } else if (type === 'Penalty') {
      if (String(prim).indexOf('Opp') === 0) return; // opponent penalty
      var p = P(prim);
      p.pens++;
      p.penSecs += Number(e.penDuration) || 0;
      g.penalties.push({ type: e.penType || '', who: prim, name: e.penName || 'Foul', period: per || '', clock: e.penClock || '' });
    }
  });
  function sumQ(o) { return o.Q1 + o.Q2 + o.Q3 + o.Q4 + o.OT1 + o.OT2; }
  g.sumQ = sumQ;
  g.us = sumQ(g.tigersQ);
  g.them = sumQ(g.oppQ);
  g.otPlayed = Object.keys(ot).length;
  return g;
}

// Roster lookup that also covers players who are in the game but no longer on
// the device's roster.
function exportRoster(entry) {
  var map = {};
  state.players.forEach(function(p) { map[p.Player_ID] = p; });
  (entry.events || []).forEach(function(e) {
    if (e.playerId && !map[e.playerId] && e.type === 'player_stat') {
      map[e.playerId] = { Player_ID: e.playerId, Jersey: e.playerJersey || '', Name: e.playerName || '', Position: '' };
    }
  });
  return map;
}
function byJersey(a, b) { return (parseInt(a.Jersey, 10) || 999) - (parseInt(b.Jersey, 10) || 999); }

// ---------- MaxPreps (boys lacrosse stat sheet columns, in MaxPreps' order) ----------
var MAXPREPS_HEADERS = ['#', 'Player Name', 'Goals', 'Asst', 'SOG', 'GB', 'INT', 'TA', 'UE', 'FW', 'FA',
  'MIN', 'GA', 'SV', 'Shut Out', 'W', 'L', 'T', 'P', 'PM', 'PS'];

// Goalie minutes and decision: if exactly one goalie recorded saves/goals
// allowed, they played the whole game (48 + 4 per overtime) and get the
// W/L/T (and shutout). If two or more did, those columns are left blank for
// the coach to fill in.
function maxPrepsRows(entry) {
  var g = computeGameStats(entry);
  var roster = exportRoster(entry);
  var goalies = Object.keys(g.players).filter(function(id) { var s = g.players[id]; return (s.saves + s.ga) > 0; });
  var soleGoalie = goalies.length === 1 ? goalies[0] : '';
  var list = Object.keys(roster).map(function(id) { return roster[id]; }).sort(byJersey);
  return list.map(function(p) {
    var s = g.players[p.Player_ID] ||
      { goals: 0, assists: 0, sog: 0, gbs: 0, int: 0, cto: 0, to: 0, fow: 0, fol: 0, saves: 0, ga: 0, pens: 0, penSecs: 0 };
    var isGoalie = (s.saves + s.ga) > 0;
    var sole = p.Player_ID === soleGoalie;
    return [
      p.Jersey, p.Name, s.goals, s.assists, s.sog, s.gbs, s.int, s.cto, s.to, s.fow, s.fow + s.fol,
      sole ? REG_MINUTES + OT_MINUTES * g.otPlayed : '',
      isGoalie ? s.ga : '', isGoalie ? s.saves : '',
      sole ? (g.them === 0 ? 1 : 0) : '',
      sole ? (g.us > g.them ? 1 : 0) : '', sole ? (g.us < g.them ? 1 : 0) : '', sole ? (g.us === g.them ? 1 : 0) : '',
      s.pens, Math.floor(s.penSecs / 60), s.penSecs % 60
    ];
  });
}

function csvCell(v) {
  var t = String(v === null || v === undefined ? '' : v);
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function downloadMaxPrepsCsv(gameId) {
  var entry = findHistoryGame(gameId);
  if (!entry) return;
  var lines = [MAXPREPS_HEADERS].concat(maxPrepsRows(entry)).map(function(r) { return r.map(csvCell).join(','); });
  var name = 'MaxPreps_' + entry.date + '_' + String(entry.opponent).replace(/[^A-Za-z0-9]+/g, '_') + '.csv';
  var blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1000);
  showToast('MaxPreps file downloaded: ' + name, 'success');
}
