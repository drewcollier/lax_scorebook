// Minimal in-memory stand-in for the Google Apps Script services Code.gs uses.
// Mirrors the real behaviours that matter here: writing past the bottom of the
// grid throws, formulas count as content, deleteRows shifts rows up.
const fs = require('fs');
const vm = require('vm');

class Sheet {
  constructor(name, maxRows, maxCols) {
    this.name = name; this.maxRows = maxRows || 1000; this.maxCols = maxCols || 26;
    this.cells = []; // cells[r][c] = { v, f }  (0-based)
  }
  _cell(r, c) { return (this.cells[r] && this.cells[r][c]) || null; }
  _set(r, c, v, f) {
    if (r >= this.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    if (c >= this.maxCols) this.maxCols = c + 1;
    this.cells[r] = this.cells[r] || [];
    this.cells[r][c] = { v: v, f: f || '' };
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getLastRow() {
    for (let r = this.cells.length - 1; r >= 0; r--) {
      const row = this.cells[r] || [];
      if (row.some((x) => x && ((x.v !== '' && x.v !== null && x.v !== undefined) || x.f))) return r + 1;
    }
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.cells.forEach((row) => (row || []).forEach((x, c) => { if (x && ((x.v !== '' && x.v != null) || x.f)) m = Math.max(m, c + 1); }));
    return m;
  }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') {
      const m = /^([A-Z]+)(\d+)$/.exec(r);
      c = m[1].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0); r = Number(m[2]);
    }
    return new Range(this, r, c, nr || 1, nc || 1);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(arr) {
    const r = this.getLastRow();
    if (r >= this.maxRows) this.maxRows = r + 1; // appendRow grows the sheet in real Sheets
    arr.forEach((v, c) => this._set(r, c, v));
  }
  deleteRows(start, count) { this.cells.splice(start - 1, count); this.maxRows -= count; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  setFrozenRows() { return this; }
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const x = this.sheet._cell(this.r - 1 + i, this.c - 1 + j); row.push(x ? x.v : ''); }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  getSheet() { return this.sheet; }
  getRow() { return this.r; }
  insertCheckboxes() { return this; }
  setFontWeight() { return this; }
  setNumberFormat(f) { this.sheet.formats = this.sheet.formats || {}; this.sheet.formats[this.c] = f; return this; }
  getFormulas() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const x = this.sheet._cell(this.r - 1 + i, this.c - 1 + j); row.push(x ? x.f : ''); }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error('The number of rows/columns in the data does not match the range.');
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._set(this.r - 1 + i, this.c - 1 + j, vals[i][j]);
    return this;
  }
  clearContent() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
      if (this.sheet._cell(this.r - 1 + i, this.c - 1 + j)) this.sheet.cells[this.r - 1 + i][this.c - 1 + j] = { v: '', f: '' };
    }
    return this;
  }
}

function makeEnv(opts) {
  opts = opts || {};
  const sheets = {};
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new Sheet(n, 1000, 26)),
    getSheets: () => Object.keys(sheets).map((n) => sheets[n]),
    getId: () => opts.sheetId || '18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64',
    getName: () => opts.sheetName || 'Tigers Lacrosse',
  };
  // --- a tiny Google Drive ---
  let nextId = 1;
  const drive = { folders: {}, files: {}, copies: [] };
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  function mkFile(name, content, parent) {
    const f = { id: 'f' + nextId++, name, content, parent,
      getId() { return this.id; }, getName() { return this.name; }, setName(n) { this.name = n; return this; },
      setContent(c) { this.content = c; return this; }, getBlob() { const c = this.content; return { getDataAsString: () => c }; } };
    drive.files[f.id] = f; return f;
  }
  function mkFolder(name, parent) {
    const fo = { id: 'd' + nextId++, name, parent, trashed: false,
      getId() { return this.id; }, getName() { return this.name; }, isTrashed() { return this.trashed; },
      getUrl() { return 'https://drive/' + this.id; },
      createFolder(n) { return mkFolder(n, this.id); },
      getFolders() { return iter(Object.values(drive.folders).filter((x) => x.parent === this.id)); },
      getFoldersByName(n) { return iter(Object.values(drive.folders).filter((x) => x.parent === this.id && x.name === n)); },
      getFiles() { return iter(Object.values(drive.files).filter((x) => x.parent === this.id)); },
      createFile(n, c) { return mkFile(n, c, this.id); } };
    drive.folders[fo.id] = fo; return fo;
  }
  const DriveApp = {
    getFolderById: (id) => { if (!drive.folders[id]) throw new Error('no folder'); return drive.folders[id]; },
    getFoldersByName: (n) => iter(Object.values(drive.folders).filter((x) => x.parent === 'root' && x.name === n)),
    createFolder: (n) => mkFolder(n, 'root'),
    getFileById: (id) => ({ makeCopy: (name, folder) => { if (opts.copyFails) throw new Error('copy failed'); drive.copies.push({ id, name, folder: folder.id, snapshot: JSON.stringify(Object.keys(sheets).map((k) => [k, sheets[k].cells])) }); return mkFile(name, '', folder.id); } }),
  };
  const uiAnswers = []; // queued answers for prompt()/alert(buttons): 'YES' | 'NO' | {button, text}
  const cache = {}; // key -> { v, exp }
  const mail = [];
  let clock = opts.now || null; // tests can move time forward
  const now = () => (clock === null ? Date.now() : clock);
  let locked = false;
  const props = { WRITE_PIN: opts.pin === undefined ? '1234' : opts.pin };
  const ctx = {
    console,
    SpreadsheetApp: {
      openById: () => ss, getActiveSpreadsheet: () => ss, flush: () => {},
      getUi: () => ({
        ButtonSet: { OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' }, Button: { OK: 'OK', CANCEL: 'CANCEL', YES: 'YES', NO: 'NO' },
        alert: (a, b, c) => { ctx.__alerts.push(b === undefined ? a : a + '\n' + b); if (c) { const x = uiAnswers.shift(); return x === undefined ? 'NO' : x; } return 'OK'; },
        prompt: (title, msg) => { ctx.__alerts.push(title + '\n' + msg); const x = uiAnswers.shift() || { button: 'CANCEL', text: '' }; return { getSelectedButton: () => x.button, getResponseText: () => x.text }; },
        showModalDialog: () => {} }),
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (locked || opts.lockBusy) return false; locked = true; return true; },
      waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) },
    ContentService: {
      MimeType: { JSON: 'application/json', JAVASCRIPT: 'application/javascript', TEXT: 'text/plain' },
      createTextOutput: (t) => ({ kind: 'text', content: t, mime: 'text/plain', setMimeType(m) { this.mime = m; return this; } }),
    },
    HtmlService: { createHtmlOutput: (h) => ({ kind: 'html', content: h, mime: 'text/html', setWidth() { return this; }, setHeight() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props[k] === undefined ? null : props[k]),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => Object.assign({}, props) }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache[k] && cache[k].exp > now() ? cache[k].v : null),
      put: (k, v, secs) => { cache[k] = { v: String(v), exp: now() + (secs || 600) * 1000 }; },
      remove: (k) => { delete cache[k]; } }) },
    MailApp: {
      getRemainingDailyQuota: () => (opts.quota === undefined ? 100 : opts.quota) - mail.length,
      sendEmail: (to, subject, body, o) => { mail.push({ to, subject, body, o }); } },
    Session: { getScriptTimeZone: () => 'America/Indiana/Indianapolis',
      getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    Date: new Proxy(Date, { get: (t, k) => (k === 'now' ? now : Reflect.get(t, k)) }),
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(require('crypto').createHash('sha256').update(String(s), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => require('crypto').randomUUID(),
      formatDate: (d, tz, fmt) => {
      const p = (n) => ('0' + n).slice(-2);
      return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
        .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()));
    } },
    __alerts: [],
    DriveApp,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(opts.codePath, 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, ss, sheets, props, Sheet, cache, mail, drive, uiAnswers, setNow: (t) => { clock = t; } };
}

// The live workbook's layout (headers copied from the real Sheet on 2026-11-18).
const GAME_LOG_HEADERS = ['Date','Opponent','Location','Result','Game_ID','Tigers_Q1','Tigers_Q2','Tigers_Q3','Tigers_Q4','Tigers_OT1','Tigers_OT2','Tigers_Final','Opp_Q1','Opp_Q2','Opp_Q3','Opp_Q4','Opp_OT1','Opp_OT2','Opp_Final','GB_Q1','GB_Q2','GB_Q3','GB_Q4','GB_OT1','GB_OT2','GB_Tot','Shots_Q1','Shots_Q2','Shots_Q3','Shots_Q4','Shots_OT1','Shots_OT2','Shots_Tot','SOG_Q1','SOG_Q2','SOG_Q3','SOG_Q4','SOG_OT1','SOG_OT2','SOG_Tot','ClearSucc_Q1','ClearSucc_Q2','ClearSucc_Q3','ClearSucc_Q4','ClearSucc_OT1','ClearSucc_OT2','ClearSucc_Tot','ClearFail_Q1','ClearFail_Q2','ClearFail_Q3','ClearFail_Q4','ClearFail_OT1','ClearFail_OT2','ClearFail_Tot','Clear_Pct','FOWon_Q1','FOWon_Q2','FOWon_Q3','FOWon_Q4','FOWon_OT1','FOWon_OT2','FOWon_Tot','FOLost_Q1','FOLost_Q2','FOLost_Q3','FOLost_Q4','FOLost_OT1','FOLost_OT2','FOLost_Tot','FO_Pct','Sv_Q1','Sv_Q2','Sv_Q3','Sv_Q4','Sv_OT1','Sv_OT2','Sv_Tot','EMO_Success','EMO_Fail','EMO_Pct','Pen_Count_Tigers','Pen_Min_Tigers','Personal_Count_Tigers','Ejections_Tigers','Pen_Count_Opp','Pen_Min_Opp'];

const MAXPREPS_HEADERS = ['#','Player Name','Goals','Asst','SOG','GB','INT','TA','UE','FW','FA','MIN','GA','SV','Shut Out','W','L','T','P','PM','PS'];
const SEASON_HEADERS = ['Player_ID','Player #','Player Name','Position','GP','G','A','Pts','S','SOG','Shooting %','GB','CT','TO','FW','FL','FO Win %','PEN','Pen Min','SV','GA','Save %','INT'];

function seedLiveWorkbook(env) {
  const { ss, sheets, Sheet } = env;
  sheets['Events'] = new Sheet('Events', 1000, 28);
  sheets['Events'].appendRow(['Timestamp','Game_ID','Period','Action_Type','Primary_Player_ID','Secondary_Player_ID','Strength','Pen_Duration','Game_Clock','Penalty_Type','Penalty_Name','Zone_ID']);
  sheets['Games'] = new Sheet('Games', 981, 26);
  sheets['Games'].appendRow(['Game_ID','Date','Opponent','Location','Score','Game_Label','Weather_Temp','Weather_Cond','Game_Start','Head_Official','Umpire','Field_Judge','Tigers_Scorer','Tigers_Timer','Opp_Scorer']);
  sheets['Players'] = new Sheet('Players', 1000, 26);
  sheets['Players'].appendRow(['Player_ID','Jersey_#','Name','Position','isStarter']);
  [['113', 3, 'Truman Collier', 'Midfield'], ['114', 4, 'Graham Vergara', 'Attack'], ['1157', 57, 'Elijah Dorris', 'Goalie']]
    .forEach((r) => sheets['Players'].appendRow(r));
  // Live layout: column A is a formula (="11"&jersey)
  for (let r = 2; r <= 4; r++) sheets['Players'].cells[r - 1][0].f = '=CONCATENATE("11",B' + r + ')';
  const st = (sheets['Season Totals'] = new Sheet('Season Totals', 1000, 27));
  st.appendRow(SEASON_HEADERS);
  for (let r = 2; r <= 40; r++) for (let c = 0; c < SEASON_HEADERS.length; c++) st._set(r - 1, c, c === 4 ? 1 : '', '=old formula');
  const mp = (sheets['MaxPreps Export'] = new Sheet('MaxPreps Export', 1000, 26));
  mp.appendRow(MAXPREPS_HEADERS);
  for (let r = 2; r <= 40; r++) for (let c = 0; c < MAXPREPS_HEADERS.length; c++) mp._set(r - 1, c, '', "='Season Totals'!X" + r);
  if (process.env.EVIL) sheets['Players'].appendRow(['1199', 99, '<img src=x onerror="window.__xss=1"> O\'Brien & Sons', 'Attack']);
  const gl = (sheets['Game Log'] = new Sheet('Game Log', 1000, 86));
  gl.appendRow(GAME_LOG_HEADERS);
  for (let r = 2; r <= 31; r++) { // the old formula rows (show blank while Games is empty)
    for (let c = 0; c < GAME_LOG_HEADERS.length; c++) gl._set(r - 1, c, '', '=IF(Games!A' + r + '="","",Games!A' + r + ')');
  }
  return env;
}

module.exports = { makeEnv, seedLiveWorkbook, GAME_LOG_HEADERS, SEASON_HEADERS, MAXPREPS_HEADERS };
