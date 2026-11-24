# AGENT_HANDOFF.md — lax_scorebook (Fishers Tigers boys lacrosse)

Purpose: everything an AI agent needs to continue work on this project. Dense on purpose; not for humans.

## LIVING DOCUMENT — MANDATORY RULES FOR EVERY AGENT
This file is the ONE permanent handoff for this project. The owner pulls from it instead of re-creating handoffs.
1. **Never create a new handoff/summary/context document** (no HANDOFF2.md, no "session summary" files, no Word docs). Edit THIS file in place. Don't rename or move it.
2. **Every PR that changes anything** (code, behavior, versions, IDs/links, workflow, decisions, backlog, bugs found) **includes the matching edits to this file in the same PR**:
   - §0 TL;DR (versions, date, state)
   - the affected sections (architecture, event model, gotchas, …)
   - a row in §7 History (PR #, date, one-line change)
   - §11 Backlog (add new requests/bugs; remove done items)
   - a line in §13 Doc log
   Add "AGENT_HANDOFF.md updated" to the PR body. A PR without it is incomplete.
3. **Edit, don't pile up:** replace stale facts instead of appending contradictions. History lives in §7/§13 only.
4. **When the owner asks for a handoff, or a session is ending / running out of context:** bring this file fully current (PR it if anything changed) and tell the owner "AGENT_HANDOFF.md is current as of PR #N". Do not produce a separate document.
5. Decisions or facts learned in chat that aren't code (owner preferences, setup done in Google/GitHub, rules confirmed) still go here (§1, §2, §10 or §11) via the next PR.
6. Mark anything uncertain "(verify)". Never put PIN values, family emails or other personal data here (public repo).

Last full rewrite: 2026-11-24 (after PR #29, app V3.39, script v9).

---
## 0. TL;DR state (2026-11-24)
- App **V3.39** live on GitHub Pages; Apps Script **SCRIPT_VERSION 9** deployed by owner. `main` == all work; old branches deleted by owner. Latest PR: #31.
- 472 automated checks (20 suites) pass, in `tests/` (added by the PR that adds this file).
- Season not started; one real game in the live workbook (exhibition vs North Central, 2026-11-21). Owner is testing over several games, then reports bugs.
- Open backlog: §11.

## 1. Owner + working agreement (follow exactly)
- Owner: Drew Collier, GitHub `drewcollier`. Not a developer. Role here = **gatekeeper/verifier**: agent does all code on branches, opens PRs; owner reviews, merges, deploys Apps Script, tests on devices.
- Owner's devices: Android phone + tablet, iPad, Windows laptop, Mac (Firefox). Owner's desktop browser in screenshots: Firefox.
- **Saved preference:** for code changes give clear step-by-step instructions and clearly identify code to be added/replaced/removed. In practice every PR body ends with a **"Your steps"** section: numbered, click-by-click (merge → Reload on blue bar → check version → what to try). Script changes include the paste/deploy procedure (§7).
- Ask before building only when a choice is genuinely the owner's (layout options, scope); otherwise build, test, PR. Offer 2–3 options with a recommendation when design is open (owner likes "A/B/C, my suggestion is …").
- **Live data rule:** the live workbook holds real game data. Never write to it. Reading is OK but say so in the reply ("I checked … read only"). All testing runs on the mock (§9) or the owner's TEST copy.
- Before a script change that touches stored data: tell owner to name a version (File → Version history → Name current version) first.
- Owner does NOT use clasp (repo has `.clasp.json`/`.claspignore` from an earlier setup; ignore). Owner updates Code.gs by browser paste.
- PR creation: `gh pr create` fails (GraphQL blocked by proxy). Use REST: `gh api repos/drewcollier/lax_scorebook/pulls -f title=… -f head=<branch> -f base=main -F body=@file --jq .html_url`.
- **Always base PRs on `main`.** (Lesson: PR #17 was based on another branch; GitHub only retargets when the base branch is deleted → V3.29 never reached main; fixed by #18.)
- The agent proxy **cannot delete branches** (REST DELETE ref and `git push --delete` → 403). Owner deletes branches in the GitHub UI. Don't try to work around it.
- Branch protection: ruleset "Protecting the repo", target `~DEFAULT_BRANCH` (main only), rules: `deletion`, `non_fast_forward`. No required reviews/status checks (owner can't approve own PRs; no CI). Setting "Automatically delete head branches" was OFF at last check (suggested to owner).
- Commit/PR attribution: follow the session's system-reminder lines (commit trailer `Co-Authored-By: …` + session link; PR body ends with the "Generated with Claude Code" line + link).
- Owner's GitHub also has other projects (election_tracking — abandoned). Not related.

## 2. Resources / IDs
| Thing | Value |
|---|---|
| Repo | https://github.com/drewcollier/lax_scorebook (public; GitHub Pages from `main` root) |
| Scorebook (scorekeepers) | https://drewcollier.github.io/lax_scorebook/ (index.html, PWA) |
| Stats viewer (families; coach view) | …/viewer.html |
| Coaches' page | …/coach.html |
| Live workbook | Google Sheet "Fishers Tigers Lacrosse-Stats-2027", ID `18VB2z8FmSvacq5E1XiwDEgxjcub99xk-xFz937I3h64` (= `SHEET_ID` in Code.gs), tz America/New_York, private (owner only). Owner's Google Sheets/Drive connector can read it. |
| Live web app URL | in `js/config.js` `DEFAULT_SCRIPT_URL` (…AKfycbxd7sWlkDhDcL4Sgs01lspwPrBOBodRsyH3hfJ5CHXWvZWffzYgrPnFbhu8oQpG6-Sn3g/exec). Deployed "Execute as: Me, Who has access: Anyone". Same URL across "New version" deploys. |
| Apps Script project | bound to the live Sheet (Extensions → Apps Script). Linked to a **standard GCP project 791676404627**; Google Drive API was enabled there by owner (needed for DriveApp backups — default auto-enable failed with "Permission denied while enabling APIs: drive"). |
| TEST copy | Owner made "TEST - …" copy of the workbook, ran Lacrosse Tools → Make this the TEST copy, deployed its own web app. Its URL lives in the app's Settings → Test mode on owner's device (config `TEST_SCRIPT_URL` is still `''`; owner can send it to be built in). |
| Family sign-up Google Form | https://forms.gle/JwJAM6w6zq8VPtK4A (linked to live Sheet → tab "Form Responses 1"; questions: Timestamp, "Player's First and Last Name", "Email Address", "Jersey Number", "Select Player or Parent/Guardian"). In config `SIGNUP_FORM_URL`. |
| Drive backups | My Drive / Lacrosse Scorebook Backups / <workbook name> / <year> / `YYYY-MM-DD vs|at Opp [Game_ID].json`; restore safety copies in …/Workbook copies |
| Script Properties (live) | `WRITE_PIN` (scorebook PIN; required, fail-closed), `VIEW_PINS` (comma list of view-only coach PINs), `S_<sha256(token)>` (family sessions JSON {e,x}), `BACKUP_FOLDER_<sheetId>`; TEST copy also has `SHEET_ID`, `IS_TEST=1`. PIN values are NOT known to the agent; never ask to see them. |

## 3. Architecture
Static PWA (no build step, plain ES5-ish JS, global functions, loaded in order by index.html) + Google Apps Script web app (Code.gs) bound to the Sheet.

### 3.1 Files
| Path | Role |
|---|---|
| index.html | scorebook markup only; loads css/app.css, js/boot.js (head), then js/config.js, state.js, game.js, active-penalties.js, stat-entry.js, actions.js, event-log.js, penalties.js, roster.js, sync.js, settings.js, exports.js, history.js, main.js. Header + Settings→About show version `V3.xx` (2 places). Contains #updateBar, #testBanner, modals. |
| js/config.js | `DEFAULT_SCRIPT_URL`, `TEST_SCRIPT_URL` (''), `SIGNUP_FORM_URL`. Shared by app, viewer, coach page. |
| js/state.js | `state` object + persistence (localStorage `scorebook_v2_state`; LIVE_KEYS), tabs, escapeHtml, localDateStr, `getScriptUrl(forTest)`, jersey ordering helpers `jerseyText/compareJersey/playersByJersey/fillJerseyList` (V3.36). |
| js/game.js | start/end game (`finalizeStartGame`, `endGame`), `renderGameUI` (also calls applyTestMode, renderFoulWatch), activeGame.isTest, `trimHistory` (`MAX_HISTORY = 3` synced games kept; unsynced never trimmed). |
| js/stat-entry.js | By Player grid + By Stat (stat→jersey keypad→clock→zone) entry, `logStat(metric, player, opts)` with cascades, `playerEvent`/`opponentEvent`, zone picker, goal clock. |
| js/actions.js | team actions (Clear/Ride/EMO/timeouts), penalties (`openPenaltyModal`, `renderPenaltyPlayerList`, `logTigersPenalty(secs)`, `logOpponentPenalty(inHome, secs)`), personal-foul accumulation + foul-out alert (`maybeEject`, eject modal), assist picker, ejection modal. |
| js/active-penalties.js | running penalty clocks/box, man-up/down strength, EMO resolution on goals. |
| js/event-log.js | Event Log, `undoEvent(id)` (removes whole groupId), `tagEventGroup(startIdx)`, `reverseEventEffects`. Calls renderFoulWatch. |
| js/penalties.js | (V3.34) Penalties tab (`renderPenaltiesTab`), game-screen "Fouls" strip (`renderFoulWatch`, players ≥3:00 personal), breakdown modal (`openFoulDetail`). Totals recomputed from events each render. |
| js/roster.js | Roster tab, Pull Roster/Officials (PIN), starters. |
| js/sync.js | PIN helpers (`getWritePin`, `getSavedPin`, remember-PIN off by default; keys `scorebook_write_pin`, `scorebook_remember_pin`), `getScriptInfo(url)` (GET ?action=version → {version,test}, cached per URL in `scriptInfoCache`), `postJson(payload,url)`, `buildExportPayload(entry,pin)`, `pushGameFromHistory(id, mode)` (refuses if script `test` flag ≠ game.isTest), `syncPendingGames`, legacy form POST for script v1. |
| js/settings.js | Settings (script URL override, Test Connection — shows workbook name + TEST mismatch warnings), Test mode (`setTestMode`, `saveTestUrl`, `applyTestMode` banner), PIN setting. |
| js/exports.js | `computeGameStats`, MaxPreps per-game CSV (`MAXPREPS_HEADERS`, `maxPrepsRows`, `downloadMaxPrepsCsv`). (In-app scoresheet REMOVED in V3.38.) |
| js/history.js | History list: sync status / Press to sync, buttons MaxPreps file, Save game file (`downloadGameFile`, same JSON format as Drive backups), Discard (TEST games only, `discardTestGame`). Reset all data. |
| js/main.js, js/boot.js | startup, SW registration + update bar ("new version" → Reload), storage persist. |
| sw.js | service worker; `CACHE_VERSION = 'lax-scorebook-vNN'` (currently v42); ASSETS list (pages, css, every js incl. penalties.js, viewer/coach files, icons); install with `cache:'reload'`; stale-while-revalidate with `fetch(url,{cache:'no-cache'})`; non-GET/cross-origin untouched. **Bump CACHE_VERSION on every app release** (triggers blue update bar). Add new files to ASSETS. |
| viewer.html + css/viewer.css + js/viewer.js | Families: email → 6-digit code → own player only (season totals, game-by-game, shot heatmap; sibling picker). Session token in localStorage `lax_viewer_session` (30 days). Coach link "Use a coach PIN" = whole-team view (PIN in memory only). Link to coach.html. |
| coach.html + css/coach.css + js/coach.js | (V3.35) PIN box (coach or write PIN, memory only, Lock clears). Loads getRoster/getGames/getEvents('') once, computes everything client-side. Views: Game (score by quarter, Tigers-vs-opponent team table, sortable player table, both teams' penalty lists w/ OUT tag), Season (record, game-by-game + season row, team vs all opponents), Players (season, sortable, GP). |
| Code.gs | Apps Script (see 3.3). |
| appsscript.json | tz America/New_York, V8, webapp USER_DEPLOYING / ANYONE_ANONYMOUS. |
| manifest.json, icons/, logo.png | PWA. |
| SCOREKEEPER-STARTUP-GUIDE.md (+ .html, .pdf generated), GAME-DAY-CHECKLIST.html (+ .pdf), guide-images/*.png | scorekeeper docs. Edit the .md and checklist .html; regenerate with tools/. |
| tools/screenshots.js, tools/build_docs.py, tools/guide-style.css, tools/make_pdfs.js | doc pipeline (README "Updating the guide"): serve repo on :8765 → `CHROME=… node tools/screenshots.js` (demo players only) → `python3 tools/build_docs.py` (python-markdown) → `node tools/make_pdfs.js`. Checklist must stay 1 page; guide ~11 pages. |
| tests/ | test suite (§9). Not used by the app. |
| README.md | human docs (code layout, tabs, PINs, family sign-in, backups, TEST copy, penalties tab, coaches' page, scoresheet/MaxPreps, releasing). Keep in sync. |

### 3.2 Data flow
Scorekeeper records plays on device (all offline, localStorage). END GAME → History entry → PIN prompt (or Cancel → coach later taps "Press to sync") → POST `exportGame` JSON (text/plain body, no CORS preflight) → script (LockService) replaces that Game_ID's Events rows, writes Games row (+Game_Label), Game Log row, rebuilds Season Totals + MaxPreps Export, writes Drive backup → JSON reply; app marks synced only on confirmed success. Re-sync of a game replaces (idempotent). PIN never in URLs. Unsynced games stay on device (never trimmed).

### 3.3 Code.gs (script v9)
- `doGet`: `?action=version` → `{success, version, test}`; other data GETs return UPDATE_APP (reads moved to POST in v3). Legacy form POST + HtmlService reply kept for very old apps.
- `doPost` → `routePost_(payload)`:
  - `{test:true}` → `{version, test, sheet:<workbook name>}` (no PIN)
  - family (no PIN; refused with TEST_COPY in a TEST copy): `requestCode {email}`, `verifyCode {email, code}` → `{token}`, `myStats {token}` → own players/games/filtered events/season, `signOut {token}`
  - PIN actions (`PIN_ACTIONS`): `exportGame {pin, gameData:{game, events}}` (needs WRITE_PIN), `getRoster`, `getOfficials`, `getGames`, `getEvents {gameId|''}` (WRITE_PIN or any VIEW_PINS)
  - `pinError_(payload, needWrite)`: PIN_NOT_SET (fail closed), PIN_LOCKED (10 wrong in a row within 15 min → all PINs refused 15 min; CacheService keys PIN_FAILS/PIN_LOCK; right PIN resets), INVALID_PIN (also for view PIN on save, message says view-only).
- Workbook resolution: `sheetId_()` = Script Property SHEET_ID if set else `SHEET_ID` const; if IS_TEST=1 it MUST have own SHEET_ID ≠ live (else throws, never falls back). `book_()` = openById(sheetId_()). (Web apps can't use getActiveSpreadsheet — official docs; menu functions do use getActiveSpreadsheet.)
- Writes are header-name mapped; `ensureRows_` (insertRowsAfter) avoids the 1000-row limit; `onEdit(e)` simple trigger (uses e.source): Players edits → `assignPlayerIds_` (P001…, permanent), Viewers edits → `refreshViewers_`.
- `onOpen` menu **Lacrosse Tools**: Generate Printable Scoresheet (`generateScoresheetPDF`, from Scoresheet Template!B2 game label; HTML dialog, fit-to-one-page zoom on print, % lines, Clears/Rides box, SV%, LSM group, no 27-goal cap), Rebuild Stats (Game Log, Season Totals, MaxPreps), Check for new sign-ups (Viewers), Set up family sign-in (creates Viewers, MailApp auth, test email to owner), Clear PIN lockout, Back up all games now, Restore a game..., Restore a season..., Make this the TEST copy, Clear all games (TEST copy only). onOpen also syncs form responses into Viewers (not in TEST).
- Family sign-in: Viewers tab `Email | Player Name | Jersey | Who | Player_ID | Approved | Status | Notes | Submitted`. Form rows copied (marks "Copied"=Yes column on form tab; deleted Viewers rows don't come back), Player_ID matched by jersey+name (flags mismatches in Status), max 2 approved emails per player (3rd tick auto-unchecked), siblings allowed, untick = immediate revoke. Codes: 6 digits, 10 min, 5 tries, 3 per 15 min per email, same reply for unknown emails, MailApp (≈100/day consumer quota). Sessions 30 days, 4 devices/email, only token hashes stored.
- Backups/restore: `backupGame_` after every export (failure never fails the save); `restoreGame`/`restoreSeason` via ui.prompt numbered list / year; `safetyCopy_` of whole workbook first; season restore removes that year's games then imports files, warns by name about games with no backup; bad file aborts before changes. Restores are idempotent.
- Script scopes in use: Sheets, Properties, MailApp (send email), DriveApp (full Drive), Cache, Lock, Ui.

### 3.4 Sheet tabs (live)
Players (A Player_ID P###, B Jersey, C Name, D Position, E isStarter — X/Y/Yes/TRUE/1/checkbox), Officials (Role, Name), Games (`Game_ID, Date, Opponent, Location, Score, Game_Label, Weather_Temp, Weather_Cond, Game_Start, Head_Official, Umpire, Field_Judge, Tigers_Scorer, Tigers_Timer, Opp_Scorer`; Date stored as real date, Game_Start as time value), Events (`Timestamp, Game_ID, Period, Action_Type, Primary_Player_ID, Secondary_Player_ID, Strength, Pen_Duration, Game_Clock, Penalty_Type, Penalty_Name, Zone_ID`), Game Log / Season Totals / MaxPreps Export (plain values written by script; Season Totals keys incl. GP G A Pts S SOG Shooting% GB CT TO FW FL FO Win% PEN Pen Min(fraction of day) SV GA Save% INT), Scoresheet Template (B2 = game label to print), Definitions (owner's glossary — may need an INT note, owner's call), Viewers, Form Responses 1. Old Roster/Player Stats tabs deleted.

### 3.5 Event model (app → Events)
- App event: `{id, type, quarter, timestamp(ISO), playerId, playerName, playerJersey, metric, strength(Even|Man-Up|Man-Down), penDuration(sec), groupId?, gameClock?, linkedPlayerId?(assist→Secondary), zone?, penType?(Personal|Technical), penName?, penClock?, locked?(non-releasable), team?}`; exported via `buildExportPayload` to EVENT_HEADERS names.
- Player IDs: Tigers `P###`; opponent player penalties `Opp #22`; team fouls `In-Home` / `Opp In-Home`; opponent shots `OPPONENT`; team actions `TEAM` or blank.
- Metrics: Goal, Shot, SOG, GB, TO, CTO, INT, FOW, FOL, Save, GA, Penalty, Ejection, Clear_Good, Clear_Fail, Ride_Good, Ride_Fail, EMO_Success, EMO_Fail, TIMEOUT, Opp_Goal, Opp_SOG, Opp_Shot.
- **Cascades (one tap = one groupId, same timestamp; Undo removes all):** Goal = Shot+SOG+Goal; SOG = Shot+SOG; Save = Save+Opp_SOG+Opp_Shot; GA = GA+Opp_Goal+Opp_SOG+Opp_Shot; **INT = CTO+GB+INT (V3.39, NCAA rule: intercepted pass credited as caused turnover AND ground ball)**. So shot counts include goals; shooting% = goals/shots.
- Penalty rule: foul out at **5:00 of personal fouls** regardless of count (NFHS scorer guidelines); technicals don't count; In-Home not charged to a player.
- Goalie MIN in MaxPreps: automatic, blank if 2 goalies played. MaxPreps cols: `#, Player Name, Goals, Asst, SOG, GB, INT, TA, UE, FW, FA, MIN, GA, SV, Shut Out, W, L, T, P, PM, PS` (TA = caused turnovers).

### 3.6 Test mode (app)
Settings → Test mode (needs TEST link). New games while on get `isTest:true` + start-game confirm; orange #testBanner ("TEST MODE…" / "TEST GAME in progress - tap END GAME…"). A game syncs only to the workbook it was started for (`getScriptUrl(!!entry.isTest)`), regardless of later toggle. App refuses send if script's `test` flag mismatches. History: TEST tag, "Synced to TEST", Discard. Turning Test mode off mid-game keeps the active game TEST (by design).

## 4. Versioning / release checklist
- App version string `V3.xx` in index.html (header + About) — bump on every app release; `sw.js CACHE_VERSION` +1; tests/step6_app.test.js checks the version string (`=== 'V3.xx'` twice) — update it.
- Script: bump `SCRIPT_VERSION` in Code.gs header comment list + const; update every test that asserts the version (`grep -rn "version === 9\|version 9\|Script version 9" tests/`).
- New JS/CSS/HTML file → add to sw.js ASSETS (and index.html script order if app), tests/make_copy.sh copy list if a new top-level page.
- Docs touched → regenerate (tools/) and check page counts.
- **Update AGENT_HANDOFF.md** per the rules at the top (§0, affected sections, §7 row, §11, §13).
- Run `tests/run_all.sh` → all pass → commit → push branch → REST PR to main with "Your steps" and "AGENT_HANDOFF.md updated".

## 5. Owner's Apps Script update procedure (put in every script PR)
1. PR → Files changed → Code.gs → ⋯ → View file → **Copy raw file** button (NOT raw.githubusercontent — it served a stale cache once).
2. Apps Script editor: Ctrl+A, Ctrl+V, Ctrl+S; check `var SCRIPT_VERSION = N;`.
3. Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL unchanged).
4. New scopes → owner runs a menu item once to authorize ("Advanced → Go to … (unsafe)" is normal).
5. Optionally paste into the TEST copy's script too.
Menu-only changes work after save; web app changes need the deploy.

## 6. Security / privacy decisions (don't regress)
- No PIN in URLs, ever. PIN not stored on device by default ("Remember the PIN" opt-in). Viewer/coach page keep PIN in memory only.
- Fail closed when WRITE_PIN missing. Lockout after 10 wrong PINs.
- Families see only their own player; server filters (other players' IDs blanked in shared plays). Same reply for unknown emails.
- Sheet private. Owner does not want responsibility for other schools'/students' data (team edition = export-only, no server).
- Escape all names (esc/escapeHtml); tests include an HTML-named player (EVIL=1).

## 7. History of changes (PRs; all merged to main)
| PR | Date | Change |
|---|---|---|
| #1–#9 | Oct–Nov 16 | pre-agent: appsscript ref, write PIN, clasp setup, startup guide, stat-first entry, guide screenshots, starters from Sheet col E, penalty lock-in, game-day checklist |
| #10 | 11-18 | Step 1 data-safety fixes (V3.23) |
| #11 | 11-18 | Step 2 confirmed saves: fetch POST JSON, script replies JSON (app V3.24, script v2) |
| #12 | 11-18 | Step 3 PIN for every read, built-in script link, safe names (V3.25, v3) |
| #13 | 11-18 | Step 4 permanent player IDs P###, Season Totals/Game Log/Game_Label written by script; removed Roster/Player Stats tabs (v4) |
| #14 | 11-18 | Step 5 in-app scoresheet + MaxPreps per-game file; MaxPreps Export tab (V3.26, v5) |
| #15 | 11-18 | Step 6 speed/cleanup: logo/icons files, SW fixes, persistence, undo fixes (V3.27) |
| #16 | 11-18 | split 4800-line index.html into html/css/js files (V3.28) |
| #17 | 11-18 | Step 7 docs refresh, screenshots tooling (V3.29) — merged into split branch by mistake |
| #18 | 11-18 | release V3.29 to main |
| #19 | 11-18 | family email-code sign-in for viewer, Viewers tab, form sync (V3.30, v6) |
| #20 | 11-18 | viewer sign-up form link (V3.31) |
| #21 | 11-18 | view-only coach PINs + wrong-PIN lockout (V3.32, v7) |
| #22 | 11-21 | TEST copy + Test mode, Drive backups, Restore game/season (V3.33, v8) |
| #23 | 11-21 | Penalties tab + foul-out strip; scoresheet % and Rides (V3.34) |
| #24 | 11-21 | coaches' page (V3.35) |
| #25 | 11-22 | player pickers in jersey order, no-number players last by name (V3.36) |
| #26 | 11-22 | TEST game banner wording + Discard for TEST games (V3.37) |
| #27 | 11-22 | Sheet's printable scoresheet: % lines, Clears/Rides, SV%, start time "11:00", weather °F once, fit one page (v9) |
| #28 | 11-22 | removed app's printable scoresheet (Sheet's is the only one) (V3.38) |
| #29 | 11-22 | Interception = CT + GB + INT (V3.39) |
| #30 | 11-24 | AGENT_HANDOFF.md + tests/ added to repo |
| #31 | 11-24 | handoff made a mandatory living document (rules at top), CLAUDE.md + AGENTS.md pointers |
Non-PR events: owner enabled Drive API in GCP 791676404627; created TEST copy; branch protection ruleset; all old branches deleted (owner).

## 8. Lessons / gotchas
- Apps Script web app: no getActiveSpreadsheet; DriveApp may need Drive API enabled in a linked standard GCP project; MailApp needs owner auth via menu run; simple triggers use `e.source`.
- Two copies of the same feature drift (scoresheet) — keep one source of truth. When changing a stat, check every consumer: app MaxPreps file, Code.gs Season Totals/MaxPreps/Game Log/scoresheet, viewer.js, coach.js, myStats_.
- Mock dates: gas_mock keeps dates as strings → tests may show a date one day early; live Sheet stores real dates (verified). Test regexes accept either day.
- Service worker: always bump CACHE_VERSION, else devices keep old JS.
- index.html is LF now (was CRLF pre-split).
- History trims synced games beyond MAX_HISTORY=3 (js/game.js); unsynced kept.
- The owner's first instinct to "refresh/clear history" won't clear localStorage; explain where state lives.
- Background processes in the agent sandbox die between turns → run `tests/servers.sh` at the start of each test run (run_all.sh does).

## 9. Tests (tests/)
- Requirements: node, python3, git (servers.sh rebuilds old scripts from history: `0509f5a:Code.gs` = Step-1 era, `7a311f7:Code.gs` = v2), Playwright (`npm i playwright` or env `PLAYWRIGHT=/path/node_modules/playwright`), Chrome (`CHROME=/usr/bin/google-chrome` if Playwright browser not installed). In the original sandbox: `PLAYWRIGHT=/opt/npm-tools/node_modules/playwright CHROME=/usr/bin/google-chrome tests/run_all.sh` (~10–12 min).
- `gas_mock.js`: fake SpreadsheetApp/Properties/Cache/Lock/MailApp/DriveApp/Utilities/Session/Ui (queued answers via `env.uiAnswers`), `seedLiveWorkbook` (live-like layout; 3 players → P001 Truman Collier #3 Midfield, P002 Graham Vergara #4 Attack, P003 Elijah Dorris #57 Goalie; EVIL adds P004 with HTML name), `setNow` clock.
- `mock_script_server.js <port> <Code.gs>`: Code.gs over HTTP; hooks `/__reset`, `/__state`, `/__mail`, `/__run` (POST JS evaluated in script context). Ports: 8770 current (EVIL), 8773 current as TEST copy, 8771 orig, 8772 v2; static 8765 repo, 8768 /tmp/s3, 8769 /tmp/s6 (copies via make_copy.sh with DEFAULT_SCRIPT_URL → :8770). Test PIN in mock = `1234`.
- Suites: codegs*.test.js = script unit tests per version (codegs6 family sign-in, codegs7 PINs/lockout, codegs8 TEST copy/backups/restore, codegs9 Sheet scoresheet); step*.test.js = Playwright app/viewer/coach tests (step8 Test mode, step9 penalties tab, step10 coach page, step11 jersey order, step12 discard, step13 interception). Size budget test: app files < 260 KB (step6).
- Add a new suite per feature; add it to run_all.sh list.

## 10. Owner context for future decisions
- Uses app at games on Android tablet; scorekeeper hands tablet to coach to sync with PIN. Can't print at the field.
- Coaches asked for the stats (coach page done) and a goal-face grid (backlog).
- Families: ≤2 logins per player; emails collected via the form before the season (~3 months out from Nov 2026).

## 11. Backlog / open items
1. **Goal-face placement grid** (coaches): 9-section view of the goal (High/Center/Low × Left/Center/Right) for where a shot went, alongside existing field Zone_ID. Agent's earlier proposal: second tap after zone with Skip; only shots on goal (goals + saves), maybe an "over/wide" option; new Events column (blank for old games); goal-face chart in viewer/coach page per player/team and for opponent shots vs our goalie. Not started.
2. **Team edition** for other schools (separate project/repo; Tigers app stays separate): export-only (finished game → CSV/PDF; optional preformatted MaxPreps file), no shared server, no responsibility for other schools' data; first-run setup (team name, colors, boys/girls rules, logo); identical CSV for all teams + column-mapping doc; Android first then Apple stores; free for under-resourced schools; owner will get a girls' scoresheet and has a scorekeeper to QA girls rules. Not started.
3. Girls rules support (part of team edition).
4. Optional: build TEST link into config (`TEST_SCRIPT_URL`) if owner sends it; owner may enable "Automatically delete head branches"; owner may add an INT note to the Definitions tab.
5. Watch-list from live games: owner is testing over several games and will report bugs/missed details.

## 12. How to start in a new session
1. `git clone`/pull repo (attach via add_repo if needed), read this file + README.
2. Re-read §1. Check `gh api repos/drewcollier/lax_scorebook/pulls?state=open` and branches.
3. Run `tests/run_all.sh` to confirm a green baseline before changing anything.
4. Work on a new branch from main; PR to main; update this file in the same PR (rules at top).
5. Repo root `CLAUDE.md` / `AGENTS.md` point here so tools that auto-load those files find this one.

## 13. Doc log
- 2026-11-24: created (covers PRs #1–#29, app V3.39, script v9); tests/ added to repo (PR #30).
- 2026-11-24: living-document rules added at top; CLAUDE.md + AGENTS.md pointers (PR #31).
