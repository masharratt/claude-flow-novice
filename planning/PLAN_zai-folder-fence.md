# PLAN: Z.ai worker folder fence

Goal: every `glm` (z.ai) worker, in every project, can read/write only its own project
folder plus what Claude Code needs to run. Kernel-enforced via macOS `sandbox-exec`.
Airtable/live-data hook stays gg-all-projects only (out of scope, unchanged).

## Evidence (spike, 2026-10-09)
- Profile `(allow default)(deny file-read-data file-write* (subpath HOME))` + re-allow fence:
  reading ~/.zshrc blocked, `ls ~/Projects` blocked, write to another project blocked,
  write in fence OK, `claude --version` runs.
- Nested `sandbox-exec` fails (`sandbox_apply: Operation not permitted`). Global
  ~/.claude/settings.json has `sandbox.enabled: true`, so Claude's own Bash sandbox must
  be turned off inside the fence or every Bash call breaks.

## Design
1. New `.claude/cfn-scripts/zai-fence.sh` — usage `zai-fence.sh <cmd> [args...]`.
   - Fence root = main repo toplevel of cwd (`git rev-parse --path-format=absolute
     --git-common-dir` -> parent), so worktrees under `$repo/.claude/worktrees/` and the
     fleet run dir `$repo/planning/fleet-*` and `$repo/.git` are all inside. Not a git
     repo -> cwd. Refuse if root is `$HOME`, `/`, or a parent of `$HOME`.
   - Profile generated per launch into `$TMPDIR`, paths realpath'd (Seatbelt matches real
     paths; ~/.claude/* are symlinks into claude-flow-novice-src).
   - Read+write: fence root; `~/.claude.json*`; `~/.claude/{projects,todos,shell-snapshots,
     session-env,statsig,debug,file-history,logs,state}`; `~/.cache`;
     `~/Library/Caches`; `~/.npm` (not ~/.npmrc); `~/Library/pnpm`; `$TMPDIR`; /private/tmp,
     /private/var/folders.
   - Read-only: `~/.claude` (+ realpath targets of its symlinks), `~/.local/share/claude`,
     `~/.gitconfig`, `~/.config/git`.
   - Always denied, even if under an allow: `~/.ssh ~/.aws ~/.gnupg ~/Library/Keychains
     ~/.npmrc` and any `settings.local.json` / `.env*` outside the fence root.
   - Outside $HOME unchanged (system dirs, /opt/homebrew readable; OS perms guard writes).
   - Passes `--settings '{"sandbox":{"enabled":false}}'` when `<cmd>` is claude.
   - Fail closed: no sandbox-exec, profile write fails, or root refused -> exit 70 with a
     message; never execs unfenced.
2. `engines.env` glm line: `bin` -> `$HOME/.claude/cfn-scripts/zai-fence.sh`, args prefixed
   `claude `. One change covers cfn-fleet and cfn-tmux-agents.
3. cfn-fleet `cmd-spawn.sh:331` trust-prompt detection keys on `bin == claude`; teach it the
   wrapper (match on first arg / basename). Check cfn-tmux-agents equivalent.
4. Docs: cfn-fleet + cfn-tmux-agents SKILL.md engine tables, readme/feature-status.md.

## Advisor revisions (2026-10-09) — supersede the allow-lists above where they conflict
- Sockets are `network-outbound`, not file reads: deny connect + write on
  `/private/tmp/tmux-*` (worker could send-keys into unfenced panes), `~/.orbstack/run`,
  `/var/run/docker.sock`; unset `SSH_AUTH_SOCK` (else `ssh vps` works).
- Persistence: deny writes inside fence to `.git/config`, `.git/hooks`,
  `.claude/settings*.json`, `.claude/hooks` (run unfenced later by master/user). Opt-in
  `ZAI_FENCE_ALLOW_CONFIG=1` for repos whose job is editing those (this one).
- `~/.claude/projects` rw scoped to this repo's slug prefix only. Deny read of
  `~/.claude/settings.json` env secrets? (claude must read it: instead deny
  `history.jsonl`, `file-history`, other projects' dirs; accept settings.json read, note
  it holds an API key — move that key out as follow-up).
- No blanket `/private/tmp`, `~/Library/Caches`, `~/.cache`: enumerate
  (`claude-cli-nodejs`, Homebrew, pnpm, ms-playwright, uv, puppeteer); deny
  `~/.cache/huggingface`. Per-worker `$TMPDIR` under the fence-owned temp dir.
- Add Claude/CFN write paths: `~/.claude/{history.jsonl?,paste-cache,sessions,cache,
  telemetry,plugins/*.json,.last-update-result.json,policy-limits.json,
  mcp-needs-auth-cache.json,hook-selfcheck.log,brief-size-warn.log,decision-log,
  current-task.txt}`, `~/.claude-tmp`. `DISABLE_AUTOUPDATER=1`.
- `(deny appleevent-send)`, mach-lookup deny for launchservicesd. Keychain/gh/push: see
  decision below. Verify Node TLS still works if securityd is touched.
- Network egress stays open (z.ai API needed); loopback deny is a follow-up.

## Tests (TDD, red first)
- Smoke additions: tmux send-keys to master socket, `docker ps`, `ssh vps`,
  `security find-generic-password -s "Claude Code-credentials"` all refused.
- `tests/test-zai-fence.sh`: wrapper around a fake command that attempts: read a file in a
  sibling temp "other project", list it, write it, read ~/.ssh, write in fence, write in
  fleet run dir + worktree, git commit in fence. Assert each outcome. Fail-closed cases:
  sandbox-exec missing (PATH stub), cwd = $HOME. Settings flag injected only for claude.
- Extend `test-cfn-fleet-engines.sh` / spawn test: wrapper bin still answers trust prompt.
- Live smoke: one real glm worker via cfn-tmux-agents, asks it to `cat ~/.zshrc` and
  `ls ~/Projects` -> both refused; edit a file in its folder -> works.

## Assumptions (testable)
- A1 Claude Code 2.1.296 runs with only the read/write set above (smoke proves).
- A2 Fleet workers never need paths outside the main repo root (explorer: run dir, roster,
  worktrees, .git all under repo).
- A3 `--settings` JSON merges over user settings and disables the inner sandbox.
- A4 Heartbeat ticker runs outside the fence (pane shell, not under exec) — acceptable.
- A5 Nothing else consumes the glm `bin` field by name (grep).

## Blast radius
- All glm workers in all projects (that is the intent). claude-sub and codex untouched.
- Run-dir copies of engines.env made before this change keep the old unfenced line until
  re-init; note in RUNBOOK.
- Risk: a worker legitimately needing a path outside the list (e.g. a global toolchain
  cache) fails with "Operation not permitted"; fix by adding the cache path, never the home.

## Decisions (user, 2026-10-10)
- D1 Fence applies to glm workers in ALL projects. Airtable/live-data hook stays gg-all-projects only.
- D2 Block GitHub push and Keychain for glm workers: unset SSH_AUTH_SOCK, GH_TOKEN, GITHUB_TOKEN;
  deny read of ~/.config/gh; deny Keychain access (mach-lookup com.apple.SecurityServer /
  securityd — verify `security find-generic-password` fails while HTTPS to api.z.ai still works,
  e.g. `curl -sI https://api.z.ai` and node fetch). Local `git commit` must still work.

## Build steps
1. tests/test-zai-fence.sh (red) — probes via a fake command, no real claude/z.ai calls.
2. .claude/cfn-scripts/zai-fence.sh — generates profile, sets env, execs sandbox-exec.
3. engines.env glm line -> wrapper; cfn-fleet cmd-spawn.sh:331 trust detection + tmux-agents check;
   extend tests/test-cfn-fleet-engines.sh.
4. SKILL.md engine tables, readme/feature-status.md, readme/CHANGELOG.md.
5. Coordinator: run suites, then a live glm smoke via cfn-tmux-agents.

## Status 2026-10-10 (stopped: usage limit)
- Done: tests/test-zai-fence.sh (red confirmed 29/29), .claude/cfn-scripts/zai-fence.sh. Suite: 26 pass, 3 fail.
- Open 1 git_commit_in_fence_allowed: /usr/bin/git xcrun shim fails replacing $DARWIN_USER_TEMP_DIR/xcrun_db
  (rename of xcrun_db-* onto xcrun_db denied). Real fatal line still hidden; reproduce with a probe script INSIDE the fence root.
- Open 2+3 claude_gets_settings_flag / non_claude_no_settings_flag: rc=126, fake bin at <fixture>/proj/.fakebin is
  exec-denied ("Operation not permitted") even though it is inside the fixture fence. Check fence root resolution
  (/var vs /private/var realpath) for the fixture.
- Not started: engines.env glm switch, cfn-fleet trust-prompt fix (cmd-spawn.sh:331), docs, live glm smoke, commit.
- Stray .claude/.claude/ (session artefacts from cwd change) — not part of this work; do not commit.
