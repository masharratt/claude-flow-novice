# Status: fleet remote host workers (2026-10-13 11:25, usage limit hit)

Done (uncommitted, tests green): lanes 1 (roster host column, claim lock: roster 116/116),
2 (lib/host.sh: 34/34), 3 (remote-worker.sh + BRIEF_REMOTE.md: 46/46), 6 (land remote: 30/30),
7 (host-setup: 33/33). Engine tests updated to 12 columns (green).

Not done:
- Lane 4 (cmd-spawn.sh --host): agent died at start (spend limit). Check for a partial
  tests/test-cfn-fleet-spawn-host.sh; respawn lane 4.
- Lane 5 (cmd-sync.sh, cmd-peek.sh, watch/dashboard states): agent died after writing a partial
  tests/test-cfn-fleet-sync.sh (no code yet); respawn lane 5, it may keep or rewrite that file.
- Lane 8 (docs, cli usage), then full suites, commit, live smoke on the real server, then
  message session mdtwii-97 (user asked) so they can test.
Lane prompts: same as wave 2 (see LANE_CONTEXT.md, PLAN Phase 4/5/8). Note for host-setup:
it pushes `main`; check projects whose default branch is not main.
