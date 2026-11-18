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

## The Stats PIN

One PIN protects everything the app reads from or saves to the workbook
(roster, officials, games, play-by-play, saving a game). Only the version
check and Test Connection answer without it.

- **Where it lives:** Apps Script editor -> **Project Settings** -> **Script
  Properties** -> `WRITE_PIN`. Change it there; it works immediately, no redeploy.
- **If `WRITE_PIN` is missing, the script refuses everything** (error
  `PIN_NOT_SET`), so a missing setting can never leave the stats open.
- **On devices:** the app asks for the PIN every time and does not store it,
  unless "Remember the PIN on this device" is ticked in Settings.

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
| `js/config.js` | The built-in script link (shared with the viewer) and the sign-up form link |
| `js/boot.js` | Offline support start-up, "new version" bar, storage protection |
| `js/state.js` | App state, saving it on the device, helpers, tab switching |
| `js/game.js` | Start/end game, Start-Game details, quarters, timeouts, EMO |
| `js/active-penalties.js` | Active penalties box and what goals do to penalties |
| `js/stat-entry.js` | Player grid, By Stat entry, shot zones, `logStat()` |
| `js/actions.js` | Team/opponent actions, penalty pop-up, goal clock, assists, ejections |
| `js/event-log.js` | Event Log and Undo |
| `js/roster.js` | Roster screen and pulling roster/officials |
| `js/sync.js` | The PIN and sending games to the workbook |
| `js/settings.js` | Settings screen, Test Connection |
| `js/exports.js` | Printable scoresheet, MaxPreps file |
| `js/history.js` | History screen, Reset All Local Data |
| `js/main.js` | Start-up (loaded last) |
| `viewer.html`, `css/viewer.css`, `js/viewer.js` | The stats viewer |
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
