// js/viewer.js - the read-only stats viewer (viewer.html).

// ---------- Config / state ----------
// The built-in link (DEFAULT_SCRIPT_URL) comes from js/config.js, shared with the scorebook.
// "URL" (coach view) can override it on this device.
//
// Two ways in:
//  - Families sign in with their email + a 6-digit emailed code and see ONLY their
//    own player (the script decides which player; it never sends anyone else's data).
//    The sign-in token is kept on this device for 30 days; Sign out removes it.
//  - Coaches use a PIN for the whole team: their own view-only coach PIN (VIEW_PINS
//    in the script) or the scorebook's Stats PIN. The PIN is asked for each
//    visit, kept only in memory, never stored and never put in a URL.
var URL_KEY = 'lax_viewer_scriptUrl';
var SESSION_KEY = 'lax_viewer_session';
var V = { url: '', pin: '', mode: '', games: [], players: {}, events: [], gameId: '', gameRec: null,
          active: { goal:true, sog:true, shot:true }, dots: [],
          fam: null, famPid: '', allEvents: [], signEmail: '' };

function $(id){ return document.getElementById(id); }
function show(id, on){ $(id).classList.toggle('hide', !on); }
function setStatus(m){ $('setupStatus').textContent = m || ''; }
function setSignStatus(m, isErr){ var el = $('signStatus'); el.textContent = m || ''; el.classList.toggle('err', !!isErr); }
// Escape text before it goes into innerHTML (names always show exactly as typed).
function esc(x){
  if (x === null || x === undefined) return '';
  return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function getSession(){ try { return JSON.parse(lsGet(SESSION_KEY) || 'null'); } catch (e) { return null; } }

// ---------- Talking to the Apps Script ----------
// POST a JSON body (never a URL parameter). onOk gets the parsed reply;
// onErr('network'|'reply') when the script can't be reached or answers oddly.
function post(body, onOk, onErr) {
  if (!V.url) { if (onErr) onErr('nourl'); return; }
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function(){ if (ctrl) ctrl.abort(); }, 20000);
  fetch(V.url, { method: 'POST', body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
    .then(function(r){ return r.text(); })
    .then(function(t){
      clearTimeout(timer);
      var d; try { d = JSON.parse(t); } catch (e) { if (onErr) onErr('reply'); return; }
      onOk(d);
    })
    .catch(function(){ clearTimeout(timer); if (onErr) onErr('network'); });
}

// Coach view: every read carries the PIN (asked once per visit, memory only).
function api(action, params, onOk, onErr) {
  if (!V.url) { showUrl(); setStatus('Enter the Apps Script URL first.'); return; }
  if (!V.pin) {
    V.pin = (window.prompt('Enter your coach PIN to view the whole team:') || '').trim();
    if (!V.pin) { setStatus('A PIN is needed for the coach view. Tap Refresh to try again.'); return; }
  }
  var body = { action: action, pin: V.pin };
  for (var k in params) body[k] = params[k];
  post(body, function(d){
    if (d && d.error === 'INVALID_PIN') { V.pin = ''; setStatus('Incorrect PIN. Tap Refresh to try again.'); return; }
    if (d && d.error === 'PIN_LOCKED') { V.pin = ''; setStatus(d.message); return; }
    if (d && d.success === false && d.message) { setStatus(d.message); return; }
    onOk(d);
  }, onErr);
}

// ---------- Screens ----------
function showSignIn(msg, isErr){
  V.mode = ''; V.pin = '';
  ['whoCard','famCards','setupCard','content'].forEach(function(id){ show(id, false); });
  show('signInCard', true);
  showEmailStep();
  setSignStatus(msg || '', isErr);
}
function showEmailStep(){
  show('emailStep', true); show('codeStep', false);
  $('signEmail').value = V.signEmail || '';
  setSignStatus('');
}

// ---------- Family sign-in ----------
function requestCode(){
  var email = $('signEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setSignStatus('Please enter a valid email address.', true); return; }
  V.signEmail = email;
  $('sendCodeBtn').disabled = true;
  setSignStatus('Sending…');
  post({ action: 'requestCode', email: email }, function(d){
    $('sendCodeBtn').disabled = false;
    if (!d.success) { setSignStatus(d.message || 'Something went wrong. Try again.', true); return; }
    $('codeEmail').textContent = email;
    show('emailStep', false); show('codeStep', true);
    $('signCode').value = '';
    setSignStatus('');
    $('signCode').focus();
  }, function(){ $('sendCodeBtn').disabled = false; setSignStatus('Could not reach the stats server. Check your connection and try again.', true); });
}

function verifyCode(){
  var code = $('signCode').value.replace(/\D/g, '');
  if (code.length !== 6) { setSignStatus('The code is 6 digits.', true); return; }
  $('verifyBtn').disabled = true;
  setSignStatus('Checking…');
  post({ action: 'verifyCode', email: V.signEmail, code: code }, function(d){
    $('verifyBtn').disabled = false;
    if (!d.success) { setSignStatus(d.message || 'That code didn\'t work.', true); return; }
    lsSet(SESSION_KEY, JSON.stringify({ token: d.token, email: d.email }));
    setSignStatus('');
    loadFamily();
  }, function(){ $('verifyBtn').disabled = false; setSignStatus('Could not reach the stats server. Try again.', true); });
}

function signOut(){
  var s = getSession();
  lsSet(SESSION_KEY, null);
  if (s && s.token) post({ action: 'signOut', token: s.token }, function(){}, function(){});
  V.fam = null; V.famPid = '';
  showSignIn('You are signed out.');
}

// ---------- Family view (own player only) ----------
function loadFamily(){
  var s = getSession();
  if (!s || !s.token) { showSignIn(); return; }
  V.mode = 'family';
  show('signInCard', false);
  show('whoCard', true); show('setupCard', true);
  show('urlBtn', false); show('urlRow', false);
  $('whoText').textContent = 'Signed in as ' + (s.email || '');
  $('signOutBtn').textContent = 'Sign out';
  setStatus('Loading your stats…');
  post({ action: 'myStats', token: s.token }, function(d){
    if (!d.success) {
      if (d.error === 'NOT_SIGNED_IN' || d.error === 'NOT_APPROVED') {
        lsSet(SESSION_KEY, null);
        showSignIn(d.error === 'NOT_APPROVED' ? 'This email is no longer approved to view stats. Contact the coach.' : 'Please sign in again.', true);
      } else setStatus(d.message || 'Could not load stats.');
      return;
    }
    V.fam = d;
    V.allEventsAll = d.events || [];
    V.games = d.games || [];
    var sel = $('famPlayer');
    sel.innerHTML = '';
    d.players.forEach(function(p){
      var o = document.createElement('option'); o.value = p.Player_ID;
      o.textContent = '#' + p.Jersey + ' ' + p.Name; sel.appendChild(o);
    });
    if (!d.players.some(function(p){ return p.Player_ID === V.famPid; })) V.famPid = d.players[0].Player_ID;
    sel.value = V.famPid;
    show('famPlayer', d.players.length > 1);
    var gp = $('gamePick');
    gp.innerHTML = '<option value="__all">All games (season)</option>';
    V.games.forEach(function(g){
      var o = document.createElement('option'); o.value = g.Game_ID;
      o.textContent = (g.Game_Label || (g.Date + ' vs ' + g.Opponent)) + (g.Score ? '  (' + g.Score + ')' : '');
      gp.appendChild(o);
    });
    if (V.gameId !== '__all' && !V.games.some(function(g){ return g.Game_ID === V.gameId; })) V.gameId = '__all';
    gp.value = V.gameId || '__all';
    setStatus(V.games.length + ' game' + (V.games.length === 1 ? '' : 's') + '.');
    applyFamPlayer();
  }, function(){ setStatus('Could not reach the stats server. Tap Refresh to try again.'); });
}

function onFamPlayerChange(){ V.famPid = $('famPlayer').value; applyFamPlayer(); }

// Narrow everything to the chosen player (siblings share one sign-in).
function applyFamPlayer(){
  var pid = V.famPid, d = V.fam;
  V.players = {};
  d.players.forEach(function(p){ if (p.Player_ID === pid) V.players[pid] = p; });
  V.allEvents = V.allEventsAll.filter(function(e){ return e.Primary_Player_ID === pid || e.Secondary_Player_ID === pid; });
  show('famCards', true);
  renderSeason();
  renderGameByGame();
  onGameChange();
}

function pct(x){ return (x === '' || x === null || x === undefined || isNaN(Number(x))) ? '–' : Math.round(Number(x) * 1000) / 10 + '%'; }
function num(x){ return (x === '' || x === null || x === undefined) ? '–' : esc(x); }
function penTime(x){ // Season Totals stores penalty time as a fraction of a day
  var secs = Math.round(Number(x || 0) * 86400); if (!secs) return '0:00';
  return Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
}
function isGoalie(p, s){ return (p && p.Position === 'Goalie') || (s && (Number(s.SV) > 0 || Number(s.GA) > 0)); }

function renderSeason(){
  var p = V.players[V.famPid], s = (V.fam.season || {})[V.famPid];
  if (!s) { $('seasonTable').innerHTML = '<div class="empty">No season totals yet.</div>'; return; }
  var cols = [['GP','GP'],['G','G'],['A','A'],['Pts','PTS'],['S','SH'],['SOG','SOG'],['Shooting %','SH%'],['GB','GB'],
    ['CT','CT'],['TO','TO']];
  if (Number(s.FW) + Number(s.FL) > 0) cols.push(['FW','FOW'],['FL','FOL'],['FO Win %','FO%']);
  cols.push(['PEN','PEN'],['Pen Min','PIM']);
  if (isGoalie(p, s)) cols.push(['SV','SV'],['GA','GA'],['Save %','SV%']);
  if (Number(s.INT) > 0) cols.push(['INT','INT']);
  var h = '<div class="scroll"><table><thead><tr>', b = '<tr>';
  cols.forEach(function(c){
    h += '<th>' + c[1] + '</th>';
    var v = s[c[0]];
    b += '<td>' + (/%$/.test(c[0]) ? pct(v) : c[0] === 'Pen Min' ? penTime(v) : num(v)) + '</td>';
  });
  $('seasonTable').innerHTML = h + '</tr></thead><tbody>' + b + '</tr></tbody></table></div>';
}

function renderGameByGame(){
  var pid = V.famPid, p = V.players[pid];
  var by = {};
  V.allEvents.forEach(function(e){
    var g = by[e.Game_ID] || (by[e.Game_ID] = { G:0, A:0, SH:0, SOG:0, GB:0, CT:0, TO:0, SV:0, GA:0, PEN:0 });
    var a = e.Action_Type;
    if (e.Primary_Player_ID === pid) {
      if (a === 'Goal') g.G++; else if (a === 'Shot') g.SH++; else if (a === 'SOG') g.SOG++;
      else if (a === 'GB') g.GB++; else if (a === 'CTO') g.CT++; else if (a === 'TO') g.TO++;
      else if (a === 'Save') g.SV++; else if (a === 'GA') g.GA++; else if (a === 'Penalty') g.PEN++;
    }
    if (e.Secondary_Player_ID === pid && a === 'Goal') g.A++;
  });
  var goalie = isGoalie(p, (V.fam.season || {})[pid]);
  var keys = ['G','A','SH','SOG','GB','CT','TO','PEN'].concat(goalie ? ['SV','GA'] : []);
  var html = '<div class="scroll"><table><thead><tr><th class="l">Game</th><th>Result</th>';
  keys.forEach(function(k){ html += '<th>' + k + '</th>'; });
  html += '</tr></thead><tbody>';
  if (!V.games.length) html += '<tr><td colspan="' + (keys.length + 2) + '" class="empty">No games yet</td></tr>';
  V.games.forEach(function(g){
    var s = by[g.Game_ID];
    html += '<tr class="clickable' + (V.gameId === g.Game_ID ? ' sel' : '') + '" data-gid="' + esc(g.Game_ID) + '">' +
      '<td class="l">' + esc(g.Date) + ' ' + (g.Location === 'Away' ? '@ ' : 'vs ') + esc(g.Opponent) + '</td>' +
      '<td>' + esc(g.Score) + '</td>';
    keys.forEach(function(k){ html += '<td>' + (s ? s[k] : '–') + '</td>'; });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  $('gameByGame').innerHTML = html;
  Array.prototype.forEach.call($('gameByGame').querySelectorAll('tr.clickable'), function(tr){
    tr.addEventListener('click', function(){ $('gamePick').value = tr.getAttribute('data-gid'); onGameChange(); });
  });
}

// ---------- Coach view (Stats PIN, whole team) ----------
function startCoach(){
  V.mode = 'coach';
  show('signInCard', false); show('famCards', false);
  show('whoCard', true); show('setupCard', true); show('urlBtn', true); show('famPlayer', false);
  $('whoText').textContent = 'Coach view (whole team)';
  $('signOutBtn').textContent = 'Exit coach view';
  bootstrap();
}

// ---------- URL handling (coach view) ----------
function showUrl(){ $('urlRow').classList.remove('hide'); $('scriptUrl').value = V.url; }
function saveUrl(){
  var u = $('scriptUrl').value.trim();
  if (!u) { setStatus('Please paste a URL.'); return; }
  V.url = u; lsSet(URL_KEY, u);
  $('urlRow').classList.add('hide');
  bootstrap();
}

// ---------- Bootstrap: roster + games ----------
function bootstrap(){
  if (V.mode === 'family') { loadFamily(); return; }
  setStatus('Loading roster…');
  api('getRoster', {}, function(d){
    if (d.success && d.players) {
      V.players = {};
      d.players.forEach(function(p){ V.players[String(p.Player_ID)] = p; });
    }
    reloadGames();
  }, function(){ setStatus('Could not reach the script. Check the URL (tap “URL”).'); showUrl(); });
}

function reloadGames(){
  setStatus('Loading games…');
  api('getGames', {}, function(d){
    if (d.success && d.games) {
      V.games = d.games;
      var sel = $('gamePick');
      sel.innerHTML = '<option value="">— select a game —</option>';
      d.games.forEach(function(g){
        var label = (g.Game_Label || (g.Date + ' vs ' + g.Opponent)) + (g.Score ? '  (' + g.Score + ')' : '');
        var o = document.createElement('option'); o.value = g.Game_ID; o.textContent = label;
        sel.appendChild(o);
      });
      setStatus(d.games.length + ' games available.');
    } else { setStatus('No games returned.'); }
  }, function(){ setStatus('Failed to load games.'); });
}

function onGameChange(){
  var gid = $('gamePick').value;
  if (V.mode === 'family') {
    V.gameId = gid || '__all';
    V.gameRec = null;
    for (var j=0;j<V.games.length;j++) if (V.games[j].Game_ID === V.gameId) { V.gameRec = V.games[j]; break; }
    V.events = V.gameId === '__all' ? V.allEvents
      : V.allEvents.filter(function(e){ return e.Game_ID === V.gameId; });
    renderAll();
    Array.prototype.forEach.call($('gameByGame').querySelectorAll('tr.clickable'), function(tr){
      tr.classList.toggle('sel', tr.getAttribute('data-gid') === V.gameId);
    });
    return;
  }
  if (!gid) { $('content').classList.add('hide'); return; }
  V.gameId = gid;
  V.gameRec = null;
  for (var i=0;i<V.games.length;i++) if (V.games[i].Game_ID === gid) { V.gameRec = V.games[i]; break; }
  setStatus('Loading events…');
  api('getEvents', { gameId: gid }, function(d){
    if (d.success && d.events) { V.events = d.events; renderAll(); setStatus(''); }
    else { setStatus('No events returned for this game.'); }
  }, function(){ setStatus('Failed to load events.'); });
}

// ---------- Cascade collapse: group rows into physical shots ----------
// Exported rows have no event id, but a cascade shares identical (Player, Timestamp).
// One physical shot = one group. Outcome = Goal > SOG > Shot. Zone from Shot/Goal row.
function buildShots(){
  var groups = {};
  V.events.forEach(function(e){
    var a = e.Action_Type;
    if (a !== 'Goal' && a !== 'SOG' && a !== 'Shot') return;
    if (!e.Primary_Player_ID) return; // a family's assist on someone else's goal: not their shot
    var key = e.Primary_Player_ID + '|' + e.Timestamp;
    if (!groups[key]) groups[key] = { player: e.Primary_Player_ID, period: e.Period,
      hasGoal:false, hasSOG:false, hasShot:false, zone:'' };
    var g = groups[key];
    if (a === 'Goal') { g.hasGoal = true; if (e.Zone_ID) g.zone = e.Zone_ID; }
    else if (a === 'SOG') { g.hasSOG = true; }
    else if (a === 'Shot') { g.hasShot = true; if (e.Zone_ID && !g.zone) g.zone = e.Zone_ID; }
  });
  var shots = [];
  for (var k in groups){
    var g = groups[k];
    var kind = g.hasGoal ? 'goal' : (g.hasSOG ? 'sog' : 'shot');
    shots.push({ player: g.player, kind: kind, zone: g.zone, period: g.period });
  }
  return shots;
}

// ---------- Heatmap geometry (matches the scorer's picker) ----------
var NS='http://www.w3.org/2000/svg', W=400,H=236, gle=40, cx=W/2, cy=gle, creaseR=26;
var RADII=[creaseR,96,150,214], BOUNDS=[-90,-30,30,90], SIDES=['R','C','L'];
function pt(ang,r){ var a=(90+ang)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; }
function arcPath(ri,ro,a0,a1){
  var p1=pt(a0,ri),p2=pt(a1,ri),p3=pt(a1,ro),p4=pt(a0,ro), lg=(a1-a0)>180?1:0;
  return 'M '+p1[0]+' '+p1[1]+' A '+ri+' '+ri+' 0 '+lg+' 1 '+p2[0]+' '+p2[1]+
         ' L '+p3[0]+' '+p3[1]+' A '+ro+' '+ro+' 0 '+lg+' 0 '+p4[0]+' '+p4[1]+' Z';
}
function mkel(tag,at){ var e=document.createElementNS(NS,tag); for(var k in at) e.setAttribute(k,at[k]); return e; }
function zoneIndex(zone){
  // zone like "2R" -> ring 2, side R. Returns {ri,ro,a0,a1} or null.
  if (!zone || zone.length < 2) return null;
  var ring = parseInt(zone.charAt(0),10), side = zone.charAt(1);
  var si = SIDES.indexOf(side);
  if (!(ring>=1 && ring<=3) || si<0) return null;
  return { ri: RADII[ring-1], ro: RADII[ring], a0: BOUNDS[si], a1: BOUNDS[si+1] };
}
function randIn(z){ var r=z.ri+7+Math.random()*(z.ro-z.ri-14), a=z.a0+5+Math.random()*(z.a1-z.a0-10); return pt(a,r); }

function computeDots(){
  var shots = buildShots();
  var pf = $('playerFilter').value;
  V.dots = [];
  V._noZone = 0; V._counts = { goal:0, sog:0, shot:0 };
  shots.forEach(function(s){
    if (pf && s.player !== pf) return;
    V._counts[s.kind]++;
    var z = zoneIndex(s.zone);
    if (!z) { V._noZone++; return; }           // shot with no captured zone — counted, not plotted
    var p = randIn(z);
    V.dots.push({ kind:s.kind, x:p[0], y:p[1] });
  });
}

function drawField(){
  var svg = $('hm'); while(svg.firstChild) svg.removeChild(svg.firstChild);
  var line = '#333';
  svg.appendChild(mkel('rect',{x:2,y:gle,width:W-4,height:H-gle-2,fill:'none',stroke:line,'stroke-width':1.5}));
  for (var ring=3;ring>=1;ring--) for (var s=0;s<3;s++)
    svg.appendChild(mkel('path',{d:arcPath(RADII[ring-1],RADII[ring],BOUNDS[s],BOUNDS[s+1]),fill:'none',stroke:line,'stroke-width':1}));
  svg.appendChild(mkel('circle',{cx:cx,cy:cy,r:creaseR,fill:'none',stroke:line,'stroke-width':1.5}));
  var tw=18,th=20;
  svg.appendChild(mkel('path',{d:'M '+(cx-tw/2)+' '+cy+' L '+cx+' '+(cy-th)+' L '+(cx+tw/2)+' '+cy+' Z',fill:'none',stroke:line,'stroke-width':1.5}));
  var COL={ goal:['var(--goal-f)','var(--goal-s)'], sog:['var(--sog-f)','var(--sog-s)'], shot:['var(--shot-f)','var(--shot-s)'] };
  V.dots.forEach(function(d){
    if (!V.active[d.kind]) return;
    svg.appendChild(mkel('circle',{cx:d.x.toFixed(1),cy:d.y.toFixed(1),r:6,fill:COL[d.kind][0],stroke:COL[d.kind][1],'stroke-width':1}));
  });
}

function renderHeatmap(){
  computeDots();
  drawField();
  var c = V._counts, total = c.goal + c.sog + c.shot;
  var pct = total ? Math.round((c.goal/total)*100) : 0;
  var noZoneMsg = V._noZone ? ' &nbsp;|&nbsp; <em>' + V._noZone + ' shot(s) had no zone captured (counted, not plotted)</em>' : '';
  $('hmTally').innerHTML =
    '<b>'+total+'</b> total shots &nbsp;|&nbsp; '+
    '<span style="color:#15803d">'+c.goal+' Goals</span>, '+
    '<span style="color:#a16207">'+c.sog+' SOG</span>, '+
    '<span style="color:#991b1b">'+c.shot+' Shots</span> &nbsp;|&nbsp; shooting '+pct+'%'+noZoneMsg;
}

function toggleType(t){
  V.active[t] = !V.active[t];
  var btn = document.querySelector('.hm-tog[data-type="'+t+'"]');
  btn.classList.toggle('off', !V.active[t]);
  drawField();
}

// ---------- Stats tables ----------
function playerStats(){
  var st = {};
  function ens(pid){ if(!st[pid]) st[pid]={shots:0,sog:0,goals:0,assists:0,gbs:0,saves:0}; return st[pid]; }
  V.events.forEach(function(e){
    var a=e.Action_Type, prim=e.Primary_Player_ID, sec=e.Secondary_Player_ID;
    if (prim){
      if (a==='Shot') ens(prim).shots++;
      else if (a==='SOG') ens(prim).sog++;
      else if (a==='Goal') ens(prim).goals++;
      else if (a==='GB') ens(prim).gbs++;
      else if (a==='Save') ens(prim).saves++;
    }
    if (sec && a==='Goal') ens(sec).assists++;
  });
  return st;
}

var POS_ORDER=['Attack','Midfield','FOGO','Defense','Goalie'];
function renderRoster(){
  var st = playerStats();
  var groups={}; POS_ORDER.forEach(function(p){groups[p]=[];}); groups.Other=[];
  for (var pid in V.players){
    var p=V.players[pid]; var s=st[pid]||{shots:0,sog:0,goals:0,assists:0,gbs:0,saves:0};
    var row={jersey:p.Jersey,name:p.Name,pos:p.Position, s:s};
    var key = POS_ORDER.indexOf(p.Position)>=0 ? p.Position : 'Other';
    groups[key].push(row);
  }
  function byJ(a,b){ return (parseInt(a.jersey)||999)-(parseInt(b.jersey)||999); }
  var html='<table><thead><tr><th>#</th><th class="l">Player</th><th>SH</th><th>SOG</th><th>G</th><th>A</th><th>GB</th><th>SV</th></tr></thead><tbody>';
  POS_ORDER.concat(['Other']).forEach(function(g){
    var rows=groups[g]; if(!rows.length) return; rows.sort(byJ);
    html += '<tr class="pos-head"><td colspan="8">'+(g==='Other'?'OTHER':g.toUpperCase())+'</td></tr>';
    rows.forEach(function(r){
      html += '<tr><td><b>'+esc(r.jersey)+'</b></td><td class="l">'+esc(r.name)+'</td>'+
        '<td>'+r.s.shots+'</td><td>'+r.s.sog+'</td><td>'+r.s.goals+'</td>'+
        '<td>'+r.s.assists+'</td><td>'+r.s.gbs+'</td><td>'+(r.s.saves||'')+'</td></tr>';
    });
  });
  html+='</tbody></table>';
  $('rosterTable').innerHTML = html;
  // Player filter for heatmap
  var pf=$('playerFilter'); var cur=pf.value;
  pf.innerHTML='<option value="">All players</option>';
  var scorers=[];
  for (var pid2 in V.players){ var p2=V.players[pid2];
    scorers.push({id:pid2, label:'#'+p2.Jersey+' '+p2.Name}); }
  scorers.sort(function(a,b){ return (parseInt(V.players[a.id].Jersey)||999)-(parseInt(V.players[b.id].Jersey)||999); });
  scorers.forEach(function(s){ var o=document.createElement('option'); o.value=s.id; o.textContent=s.label; pf.appendChild(o); });
  pf.value = V.mode === 'family' ? '' : cur;
}

function renderScoring(){
  var st=playerStats(); var rows=[];
  for (var pid in st){ var s=st[pid]; if ((s.goals+s.assists)>0 && V.players[pid])
    rows.push({j:V.players[pid].Jersey,n:V.players[pid].Name,g:s.goals,a:s.assists,p:s.goals+s.assists}); }
  rows.sort(function(a,b){ return b.p-a.p || b.g-a.g; });
  var html='<table><thead><tr><th>#</th><th class="l">Name</th><th>G</th><th>A</th><th>PTS</th></tr></thead><tbody>';
  if(!rows.length) html+='<tr><td colspan="5" class="empty">No scoring recorded</td></tr>';
  rows.forEach(function(r){ html+='<tr><td><b>'+esc(r.j)+'</b></td><td class="l">'+esc(r.n)+'</td><td>'+r.g+'</td><td>'+r.a+'</td><td><b>'+r.p+'</b></td></tr>'; });
  html+='</tbody></table>'; $('scoringTable').innerHTML=html;
}

function renderSummary(){
  var q={Q1:0,Q2:0,Q3:0,Q4:0,OT1:0,OT2:0}, oppQ={Q1:0,Q2:0,Q3:0,Q4:0,OT1:0,OT2:0};
  var fw=0,fl=0,cg=0,cf=0,gb=0;
  V.events.forEach(function(e){ var a=e.Action_Type,per=e.Period;
    if(a==='Goal'){ if(q[per]!==undefined)q[per]++; }
    else if(a==='Opp_Goal'){ if(oppQ[per]!==undefined)oppQ[per]++; }
    else if(a==='FOW')fw++; else if(a==='FOL')fl++;
    else if(a==='Clear_Good')cg++; else if(a==='Clear_Fail')cf++;
    else if(a==='GB')gb++;
  });
  function sum(o){return o.Q1+o.Q2+o.Q3+o.Q4+o.OT1+o.OT2;}
  var us=sum(q), them=sum(oppQ), foT=fw+fl, clT=cg+cf;
  var html='<table><thead><tr><th class="l">Team</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>OT</th><th>Final</th></tr></thead><tbody>'+
    '<tr><td class="l"><b>US</b></td><td>'+q.Q1+'</td><td>'+q.Q2+'</td><td>'+q.Q3+'</td><td>'+q.Q4+'</td><td>'+(q.OT1+q.OT2)+'</td><td><b>'+us+'</b></td></tr>'+
    '<tr><td class="l">THEM</td><td>'+oppQ.Q1+'</td><td>'+oppQ.Q2+'</td><td>'+oppQ.Q3+'</td><td>'+oppQ.Q4+'</td><td>'+(oppQ.OT1+oppQ.OT2)+'</td><td><b>'+them+'</b></td></tr>'+
    '</tbody></table>'+
    '<table style="margin-top:8px;"><thead><tr><th>Face-offs</th><th>Clears</th><th>GBs</th></tr></thead><tbody>'+
    '<tr><td>'+fw+'/'+foT+(foT?' ('+Math.round(fw/foT*100)+'%)':'')+'</td>'+
    '<td>'+cg+'/'+clT+(clT?' ('+Math.round(cg/clT*100)+'%)':'')+'</td>'+
    '<td><b>'+gb+'</b></td></tr></tbody></table>';
  $('summaryTable').innerHTML=html;
}

function renderMeta(){
  if (V.mode === 'family' && !V.gameRec) {
    $('gameMeta').innerHTML = '<div>All games this season (' + V.games.length + ')</div>';
    return;
  }
  var g=V.gameRec||{};
  $('gameMeta').innerHTML =
    '<div>Date: '+esc(g.Date)+'</div>'+
    '<div>Opponent: '+esc(g.Opponent)+'</div>'+
    '<div>Site: '+esc(g.Location)+'</div>'+
    '<div class="big">'+esc(g.Score)+'</div>';
}

function renderAll(){
  $('content').classList.remove('hide');
  // Families see only their player: no team scoring or team summary.
  show('teamCards', V.mode !== 'family');
  $('playerFilter').classList.toggle('hide', V.mode === 'family');
  if (V.mode === 'family') $('playerFilter').value = '';
  renderMeta();
  renderRoster();
  renderHeatmap();
  renderScoring();
  renderSummary();
}

function showToast(){} // no-op (viewer has inline status)

// ---------- Init ----------
(function init(){
  V.url = lsGet(URL_KEY) || (/^https?:\/\//.test(DEFAULT_SCRIPT_URL) ? DEFAULT_SCRIPT_URL : '');
  ['goal','sog','shot'].forEach(function(t){
    var b=document.querySelector('.hm-tog[data-type="'+t+'"]'); if(b) b.classList.remove('off');
  });
  if (typeof SIGNUP_FORM_URL === 'string' && /^https:\/\//.test(SIGNUP_FORM_URL)) {
    $('signupNote').innerHTML = 'Not signed up yet? <a href="' + esc(SIGNUP_FORM_URL) + '" target="_blank" rel="noopener">Fill out the sign-up form</a>. ' +
      'Each player can have up to two emails (for example, the player and one parent).';
  }
  // "Exit coach view" and "Sign out" share one button.
  $('signOutBtn').onclick = function(){
    if (V.mode === 'coach') { $('signOutBtn').textContent = 'Sign out'; showSignIn(); }
    else signOut();
  };
  if (!V.url) { show('setupCard', true); showUrl(); setStatus('Paste the Apps Script web app URL to begin.'); return; }
  if (getSession()) loadFamily(); else showSignIn();
})();
