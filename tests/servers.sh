#!/bin/bash
# servers.sh: (re)start every mock Apps Script + static web server the tests use.
#   8770 = current Code.gs (EVIL=1 adds a player with HTML in the name)
#   8773 = current Code.gs, used as the TEST copy (tests mark it IS_TEST)
#   8771 = original Code.gs (before Step 1), 8772 = script v2   (rebuilt from git history)
#   8765 = the repo, 8768 = /tmp/s3 copy, 8769 = /tmp/s6 copy (copies point at :8770)
T="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$T/.." && pwd)"
cd "$T"
pkill -f mock_script_server; pkill -f "http.server 87"; sleep 0.5
mkdir -p /tmp/oldgs
git -C "$REPO" show 0509f5a:Code.gs > /tmp/oldgs/orig.gs   # the script as it was at Step 1
git -C "$REPO" show 7a311f7:Code.gs > /tmp/oldgs/v2.gs
(EVIL=1 setsid nohup node mock_script_server.js 8770 "$REPO/Code.gs" >/tmp/m8770.log 2>&1 &)
(setsid nohup node mock_script_server.js 8773 "$REPO/Code.gs" >/tmp/m8773.log 2>&1 &)
(setsid nohup node mock_script_server.js 8771 /tmp/oldgs/orig.gs >/tmp/m8771.log 2>&1 &)
(EVIL=1 setsid nohup node mock_script_server.js 8772 /tmp/oldgs/v2.gs >/tmp/m8772.log 2>&1 &)
./make_copy.sh /tmp/s3 >/dev/null; ./make_copy.sh /tmp/s6 >/dev/null
(cd /tmp/s3 && setsid nohup python3 -m http.server 8768 >/dev/null 2>&1 &)
(cd /tmp/s6 && setsid nohup python3 -m http.server 8769 >/dev/null 2>&1 &)
(cd "$REPO" && setsid nohup python3 -m http.server 8765 >/dev/null 2>&1 &)
sleep 1.5
