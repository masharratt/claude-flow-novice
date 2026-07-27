# BUG #10: Orphaned `dist/cli` compiled output executed by Docker agent path

**Status:** RESOLVED 2026-07-26 (option 1: dead scaffolding removed; dist left frozen)
**Severity:** low (dead scaffolding) with a blast-radius caveat on dist/cli/index.js
**Discovered:** 2026-07-26, during deletion of the Sprint-4 TS stub layer (#9)
**Resolved:** 2026-07-26, deleted docker/agent/Dockerfile + 4 dead scripts; both dist files left frozen

## Resolution (2026-07-26)

Per audit finding #10, chose option 1 (remove dead scaffolding only). Deleted:
- `docker/agent/Dockerfile` (the dead agent image definition)
- `scripts/docker-agent-init.sh` (referenced only by the Dockerfile)
- `scripts/build-agent-image.sh` (no live caller)
- `scripts/docker-rebuild-all-agents.sh` (no live caller)
- `scripts/verify-redis-cleanup.sh` (no live caller; was sole consumer of `dist/cli/conversation-fork-cleanup.js`)

Coupling cleanup: trimmed Test 12 from `tests/docker/validation/validate-bug6-redis-vars.sh` (removed the `docker-agent-init.sh` grep; Test 13 coordinator.js check and the runtime contract/env checks remain). Removed the stale `cat scripts/docker-agent-init.sh` troubleshooting hint from `tests/docker/redis/validate-redis-connection.sh`. Trimmed dead build-script refs from `readme/logs-test-suite.md`.

Left frozen (NOT deleted):
- `dist/cli/index.js` — TypeScript source gone (deleted in `ec6203a3b`), but compiled file still has live consumers: `tests/docker/`, `tests/integration/`, `docker/Dockerfile.optimized`, `docker/scripts/monitor-wrapper.sh`, analytics skill. Recoverable from `ec6203a3b~1:src/cli/index.ts`.
- `dist/cli/conversation-fork-cleanup.js` — now a TRUE orphan (sole consumer `verify-redis-cleanup.sh` deleted). Real BUG #19 Redis leak fix. Recoverable from `ec6203a3b~1:src/cli/conversation-fork-cleanup.ts`. Left frozen rather than purged; sources recoverable if reproducibility is later required (option 2).

## Investigation verdict (2026-07-26)

- **Docker agent path is DEAD.** Nothing live builds `docker/agent/Dockerfile`: no `docker-compose*.yml`, no `.github/workflows/*`, no `npm run` script, no hook, no Makefile/fly.toml. The only builders are two standalone shell scripts (`scripts/build-agent-image.sh`, `scripts/docker-rebuild-all-agents.sh`) that nothing calls.
- **`scripts/docker-agent-init.sh`** is referenced only by the Dockerfile itself.
- **`scripts/verify-redis-cleanup.sh`** has ZERO live callers (docs only). Its `require()` of `conversation-fork-cleanup.js` is inside echo-string remediation hints that fire only on manual invocation.
- **`dist/cli/index.js` has LIVE blast radius beyond the docker-agent path**: also used by `tests/docker/`, `tests/integration/`, `docker/Dockerfile.optimized`, `docker/scripts/monitor-wrapper.sh`, `.claude/cfn-extras/skills/analytics/cfn-memory-monitoring/SKILL.md`. Deleting it breaks those. It is the real CFN Loop agent-spawner CLI.
- **`dist/cli/conversation-fork-cleanup.js`** is the real BUG #19 Redis memory-leak fix. Used ONLY by the dead `verify-redis-cleanup.sh`. No live callers.
- **No enterprise connection.** `docker/agent/Dockerfile` describes itself as the standard CFN agent container, not an enterprise sandbox. The "isolated agents for enterprise" recollection maps to the separate tiered `cfn-docker-loop` system at `.claude/cfn-extras/commands/cfn-docker/`, not this Dockerfile.
- **Sources recoverable** at `ec6203a3b~1` (both `src/cli/index.ts` and `src/cli/conversation-fork-cleanup.ts`).

## Summary

`docker/agent/Dockerfile` and `docker-agent-init.sh` exec `dist/cli/index.js`, and `scripts/verify-redis-cleanup.sh` `require()`s `dist/cli/conversation-fork-cleanup.js`. Both dist files are real compiled output (166 lines and 8553 bytes respectively, exporting real `setMessageListTTL`/`emergencyCleanupAll`/CLI behavior), but their TypeScript sources do not exist anywhere in HEAD. The sources were deleted in `ec6203a3b` (Trigger.dev migration Phase 4) along with the rest of the Sprint-4 TS app layer.

The compiled artifacts survive only because `npm run build` is bare `tsc` with no clean step, so it never deletes orphaned dist files. From a fresh clone with a clean build, these dist files would not exist and the Docker/verify-redis paths would break.

## Evidence

- `dist/cli/index.js` sha256 `6de6b2c5...` (166 lines), executed via `exec node dist/cli/index.js`
- `dist/cli/conversation-fork-cleanup.js` sha256 `10f44c62...` (8553 bytes), `require()`'d at `scripts/verify-redis-cleanup.sh:160,165`
- No `src/cli/index.ts` or `src/cli/conversation-fork-cleanup.ts` in HEAD (confirmed during #9)
- `docker-compose.yml` references only a redis service, not this Dockerfile
- No `.github/` workflow builds `docker/agent/Dockerfile`

## Why it was not fixed in #9

#9 deleted the dead source stubs but deliberately left `dist/` byte-identical (verified: sha256 unchanged before/after). Rebuilding dist would not have removed these files (bare `tsc` is non-destructive to orphans), but a future `clean` step would, and the dist is the only surviving copy of behavior the Docker/redis-cleanup paths depend on. Touching it was out of scope for the stub-layer deletion.

## Resolution options (decision needed)

Path is confirmed dead. The remaining decision is how much to remove and whether to make dist reproducible:

1. **Remove dead scaffolding only (safe minimum).** Delete `docker/agent/Dockerfile`, `scripts/docker-agent-init.sh`, `scripts/build-agent-image.sh`, `scripts/docker-rebuild-all-agents.sh`, `scripts/verify-redis-cleanup.sh`. Leave both dist files frozen (index.js has live consumers; conversation-fork-cleanup.js is a harmless orphan).
2. **Remove scaffolding + recover sources (reproducibility).** Same deletions as (1), plus `git checkout ec6203a3b~1 -- src/cli/index.ts src/cli/conversation-fork-cleanup.ts` so dist/cli is rebuildable from source. (`ec6203a3b~1` is the immediate pre-deletion state and has both files. `21fca067d` is the older Sprint-4 checkpoint and has `src/cli/index.ts` but not `conversation-fork-cleanup.ts`, which was added later in the BUG #19 fix.)
3. **Full purge.** Delete scaffolding AND both dist files. Requires first re-pointing the live `dist/cli/index.js` consumers (tests/docker/, tests/integration/, docker/Dockerfile.optimized, docker/scripts/monitor-wrapper.sh, analytics skill) or confirming they are also dead. Higher blast radius; needs its own trace.

The current state (load-bearing compiled output with no source) is a build-reproducibility landmine; option 2 resolves it cleanly.

## Related

- Finding #9 (deleted the Sprint-4 stub layer; this is the dist-side residue)
- `readme/feature-status.md` Legacy Code Removals section
