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
