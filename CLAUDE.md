# Instructions for AI agents working in this repo

**Read `AGENT_HANDOFF.md` first.** It is the single, living handoff for this project:
state, links/IDs, architecture, the owner's workflow, history, tests and backlog.

Mandatory:
- Never create a new handoff or summary document. Update `AGENT_HANDOFF.md` in place.
- Every PR that changes anything updates `AGENT_HANDOFF.md` in the same PR
  (see the rules at the top of that file) and says "AGENT_HANDOFF.md updated".
- PRs always target `main`. Run `tests/run_all.sh` before opening one.
- Never write to the live Google Sheet. The owner merges PRs and deploys the Apps Script.
