# lax_scorebook

The Fishers Tigers boys lacrosse scorebook: a web app scorekeepers use on a
tablet or phone during games, plus a Google Sheet (and its Apps Script) that
collects every game and builds season stats.

- **App:** https://drewcollier.github.io/lax_scorebook/ (works offline; add it to
  the home screen). The stats viewer is `viewer.html`.
- **For scorekeepers:** [Scorekeeper Startup Guide](SCOREKEEPER-STARTUP-GUIDE.md)
  ([PDF](SCOREKEEPER-STARTUP-GUIDE.pdf)) and the one-page
  [Game-Day Checklist](GAME-DAY-CHECKLIST.pdf).
- **How it fits together:** the app records every play on the device, then sends
  the finished game to the Apps Script (with the Stats PIN), which writes it to
  the workbook and rebuilds Game Log, Season Totals and MaxPreps Export.
  Scoresheets and per-game MaxPreps files are made right in the app.

## Updating the Apps Script (Code.gs) without changing the link

The app talks to the team workbook through the Apps Script web app. To change
the script **and keep the same Script Link** (so nobody has to re-paste it):

**With clasp** (from this folder):
1. `clasp push` - uploads `Code.gs` and `appsscript.json`.
2. `clasp deployments` - note the ID of the existing web-app deployment
   (the long `AKfy...` one, not `@HEAD`).
3. `clasp deploy -i <that ID> -d "short description"` - points the existing
   link at the new code.

**In the browser** (script.google.com):
1. Paste the new `Code.gs`, click **Save**.
2. **Deploy -> Manage deployments**, select the active deployment, click the
   **pencil (Edit)**.
3. **Version: New version**, then **Deploy**.

Never use **Deploy -> New deployment** for an update: that creates a brand-new
link. To check it worked, open the app: **Settings -> Test Connection** shows
the script version.

## The Stats PIN and coach PINs

There are two kinds of PIN, both kept in the Apps Script (editor -> **Project
Settings** -> **Script Properties**). Changes work immediately, no redeploy.

| Script Property | What it can do | Who has it |
|---|---|---|
| `WRITE_PIN` | Everything: save games, pull roster/officials, the viewer's coach view | Scorekeepers / you |
| `VIEW_PINS` | **Look only**: the viewer's coach view (whole team) and pulling the roster. **Can't save games.** | Coaches |

- `VIEW_PINS` can hold one PIN per coach, separated by commas (`4821, 7735`).
  To cut one coach off, delete just their PIN. Leave `VIEW_PINS` out if unused.
- **Lockout:** after 10 wrong PINs in a row, every PIN (even a right one) is
  refused for 15 minutes, so nobody can guess PINs by trying thousands. A right
  PIN resets the count. **Lacrosse Tools -> Clear PIN lockout** ends it early.
  A game that couldn't save stays on the device; sync it afterwards.
- Use PINs of 6+ digits, and don't reuse one PIN for two people.
- **If `WRITE_PIN` is missing, the script refuses everything** (error
  `PIN_NOT_SET`), so a missing setting can never leave the stats open.
- **On devices:** the app asks for the PIN every time and does not store it,
  unless "Remember the PIN on this device" is ticked in Settings. The viewer
  never stores a PIN.
- Family email sign-in (below) doesn't use PINs and isn't affected by the lockout.

## The built-in script link

`DEFAULT_SCRIPT_URL` in **`js/config.js`** holds the team's web-app link
(`https://script.google.com/macros/s/.../exec`); both the scorebook and the
viewer read it from there, so scorekeepers don't paste anything. It is safe to
have in this public repo because every request also needs the PIN. It only
changes if a *new* deployment is created (updating with "New version" keeps
it). Settings -> Google Apps Script URL on a device overrides it for that
device only.

## Code layout

| File | What's in it |
|---|---|
| `index.html` | The scorebook's screens and pop-ups (markup only) |
| `css/app.css` | All scorebook styles, including the printable scoresheet |
| `js/config.js` | The built-in script link (shared with the viewer), the TEST copy's link and the sign-up form link |
| `js/boot.js` | Offline support start-up, "new version" bar, storage protection |
| `js/state.js` | App state, saving it on the device, helpers, tab switching |
| `js/game.js` | Start/end game, Start-Game details, quarters, timeouts, EMO |
| `js/active-penalties.js` | Active penalties box and what goals do to penalties |
| `js/stat-entry.js` | Player grid, By Stat entry, shot zones, `logStat()` |
| `js/actions.js` | Team/opponent actions, penalty pop-up, goal clock, assists, ejections |
| `js/event-log.js` | Event Log and Undo |
| `js/penalties.js` | Penalties tab, foul-out strip on the game screen, one player's penalties |
| `js/roster.js` | Roster screen and pulling roster/officials |
| `js/sync.js` | The PIN and sending games to the workbook |
| `js/settings.js` | Settings screen, Test Connection |
| `js/exports.js` | Printable scoresheet, MaxPreps file |
| `js/history.js` | History screen, Reset All Local Data |
| `js/main.js` | Start-up (loaded last) |
| `viewer.html`, `css/viewer.css`, `js/viewer.js` | The stats viewer |
| `coach.html`, `css/coach.css`, `js/coach.js` | The coaches' page (every stat, every game; coach PIN) |
| `sw.js` | Offline support (list every file the app needs in `ASSETS`) |
| `Code.gs` | The Google Apps Script (paste into the script editor) |

The `js/` files are loaded in the order listed at the bottom of `index.html`.

## The workbook tabs

| Tab | Filled by | Notes |
|---|---|---|
| **Players** | You | Jersey, Name, Position, isStarter. **Leave column A (Player_ID) blank** - each new player gets a permanent ID (P001, P002...) automatically. The ID never changes, even if the jersey number does, so stats always follow the right player. |
| **Officials** | You | Role + Name, for the Start-Game dropdowns. |
| **Events** | Script | Every recorded play. Re-syncing a game replaces its rows. |
| **Games** | Script | One row per game, including the Game_Label used by the Scoresheet dropdown. |
| **Game Log** | Script | Team totals per game (plain numbers). |
| **Season Totals** | Script | One row per player, rebuilt every time a game is saved and whenever Players is edited. |
| **Scoresheet Template** | You | Pick a game in B2, then **Lacrosse Tools -> Generate Printable Scoresheet**. |
| **MaxPreps Export** | Script | Season-to-date stats in MaxPreps' boys lacrosse stat-sheet columns (TA = caused turnovers, UE = turnovers, FA = faceoffs won + lost, PM/PS = penalty minutes + leftover seconds). Goalie MIN/W/L/T/Shut Out only from games where one goalie played the whole game (48 min + 4 per OT). |
| **Definitions** | You | Stat glossary. |
| **Viewers** | Form + you | Who may sign in to the stats viewer. See *Family sign-in* below. |
| **Form Responses 1** | Google Form | Answers to the family sign-up form. The script adds a **Copied** column; leave it alone. |

Don't type into the script-filled tabs: your changes would be overwritten.
After editing **Events** by hand, run **Lacrosse Tools -> Rebuild Stats
(Game Log, Season Totals, MaxPreps)**.

Add players on the **Players** tab, then **Pull Roster** in the app. A player
added only inside the app (Roster screen -> add player) still has their plays
saved to Events, but they won't appear in Season Totals.

## Family sign-in (stats viewer)

Families open `viewer.html`, type their email, get a 6-digit code by email, and
then see **only their own player's** stats (season totals, game by game, shot
map). The script decides which player; nothing about other players is sent to
their device. The coach can still see the whole team with **Use the Stats PIN**.

- **Signing up:** families fill out the sign-up Google Form (email, player's name,
  jersey #, player or parent). New answers are copied into the **Viewers** tab
  unapproved, whenever the Sheet is opened, when anyone asks for a code, or with
  **Lacrosse Tools -> Check for new sign-ups**.
- **Approving:** tick **Approved**. The script fills **Player_ID** by matching the
  jersey and name, and **Status** says what's going on ("Active - can sign in",
  "Check the player...", etc.). If the match is wrong or missing, type the right
  Player_ID (P###) yourself. **Notes** is yours.
- **Limit:** 2 approved emails per player. A 3rd tick is undone and explained in
  Status. One email can be approved for two players (brothers); they get a picker.
- **Cutting off access:** untick Approved (or delete the row). It takes effect at
  once, even on a phone that's already signed in.
- **Limits built in:** codes last 10 minutes, 5 wrong tries, 3 codes per 15
  minutes per email; a device stays signed in 30 days; 4 devices per email.
  A personal Gmail account can send about 100 code emails a day.
- **Sign-up link on the viewer:** put the form's link in `SIGNUP_FORM_URL` in
  `js/config.js`.
- Sign-ins are kept in Script Properties as `S_...` entries (fingerprints only,
  never the real token). They clean themselves up; don't edit them.

## Backups and restoring

Every time a game is saved, the script also writes exactly what was uploaded
(the game and every play; never the PIN) to a file in your Google Drive:

`My Drive / Lacrosse Scorebook Backups / <workbook name> / <year> / 2026-04-15 vs Carmel [G...].json`

Re-saving a game updates its file. **Lacrosse Tools** has:

| Menu item | What it does |
|---|---|
| **Back up all games now** | Writes a file for every game already in the workbook (run it once to cover games saved before backups existed). |
| **Restore a game...** | Lists the backup files, you type a number, it puts that game back (plays, Games row) and rebuilds the stats. |
| **Restore a season...** | You type the year; it removes that year's games from the workbook and loads every backup file for that year, one at a time, then rebuilds the stats. It warns you first, by name, about any game that has no backup file. |

- Before any restore, a **copy of the whole workbook** is saved to
  `.../<workbook name>/Workbook copies`, so a restore can always be undone.
- Restoring the same game twice never doubles it.
- **Save game file** (History, in the app) downloads the same kind of file to the
  device. To restore from it, put it in the right year folder in Drive and use
  **Restore a game**.
- Google Sheets also keeps its own **File -> Version history**. Name a version
  (**File -> Version history -> Name current version**) before big changes.
- The first save after updating the script asks Google for permission to use
  your Drive (it creates the backup folder and files).

## The TEST copy and Test mode

For trying things out without touching the real data:

1. In the team workbook: **File -> Make a copy**. Name it so it **starts with TEST**
   (for example `TEST - Tigers Lacrosse`). Open the copy.
2. In the copy: **Lacrosse Tools -> Make this the TEST copy**. This points the
   copy's script at the copy (it can never write to the team workbook), clears the
   families' emails out of the copy, and turns family sign-in off there.
3. In the copy: **Extensions -> Apps Script -> Deploy -> New deployment -> Web app**
   (Execute as: Me, Who has access: Anyone). Copy the web app URL.
4. In the scorebook: **Settings -> Test mode**, paste the link, **Save link**, tick
   **Test mode**. An orange bar shows at the top.

While Test mode is on, every new game is a **TEST game**: it asks first, carries
an orange TEST tag in History, and only ever goes to the TEST copy, even if Test
mode is switched off before it syncs. Real games only ever go to the team
workbook. The app checks with the script before sending and refuses (keeping the
game on the device) if a link points at the wrong workbook. **Test Connection**
says which workbook a link reaches.

In the TEST copy, **Lacrosse Tools -> Clear all games (TEST copy only)** empties it.

## Penalties tab (foul-out tracking)

- **Penalties** tab (next to Game): every player on both teams who has a
  penalty, with personal fouls (count and time), technical fouls and total
  time, most personal time first. Rows turn yellow at 3:00, orange at 4:00 and
  red when fouled out. In-Home (team) fouls are listed separately.
- **Tap a player** for every penalty: quarter, clock, penalty, personal or
  technical, time, and how much personal time is left before fouling out.
- **Game screen:** a small "Fouls" strip appears only once someone reaches 3:00
  of personal fouls (e.g. "Opp #22 4:00"); tap a name for the breakdown. It
  never gets in the way of the Penalty button.
- Rule used: 5:00 of personal fouls = fouled out, however many fouls; technical
  fouls don't count. Totals are worked out from the recorded penalties every
  time, so Undo is reflected straight away.

## Coaches' page

`coach.html` (linked from the viewer's sign-in screen) opens with a **coach PIN**
(`VIEW_PINS`) or the scorebook PIN. The PIN is typed on the page, kept only in
memory, and **Lock** forgets it. Read only; no script change needed.

- **Game:** result and score by quarter; Tigers vs opponent team stats (goals,
  shots, shots on goal, shooting %, saves/save %, faceoffs, ground balls,
  turnovers, caused turnovers, interceptions, clears, rides, extra man, man-up
  goals, penalties and penalty time); every player's stats (tap a heading to
  sort); both teams' penalty lists with totals, opponents by jersey.
- **Season:** record, game by game (tap a game to open it) with a season row,
  and season team stats vs all opponents.
- **Players:** every player's season stats, sortable.

Opponent numbers are only what the scorekeeper records about them: goals,
shots, shots on goal, faceoffs (our losses) and penalties. Everything is worked
out from the recorded plays, so it always matches the Events tab.

## Scoresheet and MaxPreps file in the app

History -> **Scoresheet** builds the one-page landscape scoresheet on the device
(print or Save as PDF; it scales itself to fit one page). History ->
**MaxPreps file** downloads that game's stats as a CSV in MaxPreps' column
order. Both work offline. The Sheet's own *Lacrosse Tools -> Generate Printable
Scoresheet* still works too.

## Releasing a new version of the app

1. Make the change, bump the version shown in the header and in Settings ->
   About (`index.html`, e.g. `V3.28`), and bump `CACHE_VERSION` in `sw.js`
   (e.g. `lax-scorebook-v31` -> `v32`). Forgetting the bump is not harmful
   (devices still update on the next open) but the blue bar won't appear.
2. Merge to `main`. GitHub Pages publishes it in a minute or two.
3. Devices open the app instantly from their saved copy, download the new
   version in the background, and show a blue **"A new version ... is ready -
   Reload"** bar. Nothing reloads by itself, so a game in progress is never
   interrupted.

If you add a new file the app needs offline (a script, an image), add it to
`ASSETS` in `sw.js`.

## Updating the guide, checklist and screenshots

Edit **`SCOREKEEPER-STARTUP-GUIDE.md`** (the HTML and PDF are generated from it)
and **`GAME-DAY-CHECKLIST.html`**. Then, with Python 3 (`pip install markdown`),
Node.js and Playwright (`npm install playwright`):

1. `python3 -m http.server 8765` (in the repo folder; leave it running)
2. `node tools/screenshots.js` - retakes every picture in `guide-images/` from the
   current app, using made-up demo players
3. `python3 tools/build_docs.py` - Markdown guide -> `SCOREKEEPER-STARTUP-GUIDE.html`
4. `node tools/make_pdfs.js` - prints the guide and checklist to PDF

The `tools/` folder is only for this; the app doesn't use it.
