# BUG #10: Orphaned `dist/cli` compiled output executed by Docker agent path

**Status:** open (candidate audit finding, surfaced during #9 plan review)
**Severity:** unknown (depends on whether the Docker agent path is live)
**Discovered:** 2026-07-26, during deletion of the Sprint-4 TS stub layer (#9)

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

1. **Confirm the Docker agent path is dead** (docker-compose does not build it, no CI builds it). If dead, remove `docker/agent/Dockerfile`, `docker-agent-init.sh`, and the `require()` in `scripts/verify-redis-cleanup.sh`, then delete the two orphaned dist files. Trace all references first.
2. **If the path is live**, recover the real `src/cli/index.ts` and `src/cli/conversation-fork-cleanup.ts` from `git show 21fca067d:<path>` so the dist is reproducible from source, then rebuild.

Either way, the current state (load-bearing compiled output with no source) is a build-reproducibility landmine.

## Related

- Finding #9 (deleted the Sprint-4 stub layer; this is the dist-side residue)
- `readme/feature-status.md` Legacy Code Removals section
