#!/bin/bash
# run_all.sh: start the servers, run every suite, print PASS counts and any FAIL lines.
# Needs: node, python3, git, Playwright (npm i playwright, or PLAYWRIGHT=/path/to/playwright),
# Chrome/Chromium (CHROME=/path/to/chrome if Playwright's own browser isn't installed).
cd "$(dirname "$0")"
./servers.sh
tot=0; bad=0
for t in codegs.test.js codegs3.test.js codegs4.test.js codegs5.test.js codegs6.test.js codegs7.test.js codegs8.test.js codegs9.test.js \
         step1.test.js step2_app.test.js step3_app.test.js step5_app.test.js step6_app.test.js step7_viewer.test.js step8_app.test.js \
         step9_app.test.js step10_coach.test.js step11_jersey.test.js step12_discard.test.js step13_int.test.js step14_sun.test.js; do
  out=$(timeout 300 node "$t" 2>&1); n=$(echo "$out" | grep -c '^PASS'); tot=$((tot+n))
  last=$(echo "$out" | grep -E 'ALL PASSED|FAILED|Error' | tail -1)
  printf "%-24s %4s  %s\n" "$t" "$n" "$last"
  echo "$out" | grep '^FAIL' | head -5
  echo "$last" | grep -q 'ALL PASSED' || bad=$((bad+1))
done
echo "TOTAL PASS: $tot   suites not all-passing: $bad"
