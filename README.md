# lax_scorebook
standalone scorebook for lacrosse stat tracking.

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

`DEFAULT_SCRIPT_URL` near the top of the `<script>` in `index.html` and in
`viewer.html` holds the team's web-app link (`https://script.google.com/macros/s/.../exec`),
so scorekeepers don't paste anything. It is safe to have in this public repo
because every request also needs the PIN. If the link ever changes (only if a
*new* deployment is created), update it in both files. Settings -> Google Apps
Script URL on a device overrides it for that device only.

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
| **MaxPreps Export**, **Definitions** | - | Unchanged for now. |

Don't type into the script-filled tabs: your changes would be overwritten.
After editing **Events** by hand, run **Lacrosse Tools -> Rebuild Stats
(Game Log + Season Totals)**.

Add players on the **Players** tab, then **Pull Roster** in the app. A player
added only inside the app (Roster screen -> add player) still has their plays
saved to Events, but they won't appear in Season Totals.
