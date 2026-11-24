#!/bin/bash
# make_copy.sh DIR : copy the app into DIR with the mock script link (localhost:8770) built in
set -e
D=$1; rm -rf "$D"; mkdir -p "$D"
cd "$(dirname "$0")/.."
cp -r index.html viewer.html coach.html sw.js manifest.json logo.png icons css js "$D"/
sed -i "s|var DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/[^']*';|var DEFAULT_SCRIPT_URL = 'http://localhost:8770/exec';|" "$D/js/config.js"
grep -q "localhost:8770" "$D/js/config.js"
