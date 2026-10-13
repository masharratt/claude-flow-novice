# PLAN: sandbox server (--host) fleet workers

Status: waiting on user's server setup (AppArmor bwrap profile + enable-linger, `bwrap --ro-bind / / true` must succeed).
User decision 2026-10-13: fix Claude's own sandbox on the server (not a separate account, not containers).

## Why
- Claude's Bash sandbox fails on the VPS: Ubuntu 24.04 `kernel.apparmor_restrict_unprivileged_userns=1` blocks bwrap (worker WS9001 then ran commands unsandboxed via dangerouslyDisableSandbox).
- Workers run as `michael`, who is in the `docker` group (root-equivalent via docker.sock).
- MDTWII wants code lanes on the server only once workers cannot touch gates, build slots or main.

## Steps (TDD, stub ssh)
1. Remote launch passes `--settings` JSON (like zai-fence): `sandbox.enabled=true`, `sandbox.allowUnsandboxedCommands=false`, filesystem write allow = worker worktree, `~/fleet-repos/<project>` (.git for commits), outbox; no unix sockets (docker.sock blocked).
2. `permissions.deny` Edit/Write/MultiEdit/NotebookEdit on the deny list below (deny rules apply in bypass mode). Read stays allowed (game data read is wanted).
3. CPU/memory caps: wrap remote claude in `systemd-run --user --scope -p MemoryMax=$FLEET_REMOTE_MEM -p CPUQuota=$FLEET_REMOTE_CPU` (defaults TBD from 12 cores / 47 GB, gates need headroom). Refuse if systemd-run --user unusable.
4. Workers stop pushing to `~/git/<project>.git`: remote-worker.sh `commit` commits only; `fleet land` fetches `fleet/WSxx` from the server fleet clone over ssh, keeps the claims-diff gate, records the lane sha (tip of fleet/WSxx) in the roster.
5. Spawn preflight: probe the sandbox on the host (bwrap smoke); refuse (66) with the setup commands if it fails, unless `FLEET_REMOTE_UNSANDBOXED=1`.
6. Docs: SKILL.md remote section, BRIEF_REMOTE.md (no push; sandbox on), CHANGELOG, capability record status.

## Server deny list (writes), from MDTWII (tools/vps/gate.sh, suite.sh, promote.sh)
- `/home/michael/Projects/**` (main server checkouts incl. MDTWII; game data under it stays readable)
- `/home/michael/git/**` (bare repos; MDTWII main promoted there by promote.sh; gate refs refs/heads/gate/*)
- `/tmp/gate-*`, `/tmp/cand-*` (gate worktrees), `/tmp/mdtwii-*` (suite scripts, change lists, slot locks `/tmp/mdtwii-slot-{1,2}.lock`)
- `/home/michael/.cache/mdtwii-target-*` (build slots)
- `/home/michael/.cache/cfn-vps/**` (vps.sh job runner state: pid, exit, log, cmd)
- `/home/michael/.claude/**` except what Claude Code itself must write (settings, hooks, skills read-only)
- `/home/michael/.ssh/**`, `/home/michael/.config/gh/**`, `/home/michael/opt/**`

## Limits (accepted)
- Bash sandbox fences shell commands; Edit/Write are fenced only by the deny list above.
- Weaker than a separate account; user chose this.
