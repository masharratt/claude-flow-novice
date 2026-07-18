# docker/ — Docker-based CFN Loop execution

Coordinator + agent containers that run CFN Loop 3/2 with autonomous iteration. Full patterns and code live in the reference (below); this file is the delta.

## Rules (local only)

- **Env contract is the source of truth.** All container env vars (names, types, defaults, legacy aliases) are defined in `docker/runtime/cfn-runtime.contract.yml`. Do not hardcode defaults that contradict it. `CFN_REDIS_PASSWORD` is REQUIRED in production. Legacy aliases (`TASK_ID`, `MEMORY_BUDGET`, `REDIS_HOST`) still resolve but warn.
- **Inside a Docker network use service names, never container names.** `redis` not `cfn-redis-feature-branch`, `postgres` not `cfn-postgres-xyz`, `orchestrator` not `cfn-orchestrator-xyz`. Mixing the two is the top multi-worktree failure.
- **Multi-worktree isolation:** one worktree per branch, isolated via `COMPOSE_PROJECT_NAME=cfn-${BRANCH}`. Start stack with `./scripts/docker/run-in-worktree.sh up -d` (auto-calculates port offsets); export `COMPOSE_PROJECT_NAME`, `CFN_REDIS_PORT`, `CFN_POSTGRES_PORT`, `WORKTREE_BRANCH` before spawning agents. Isolate Redis keys by task ID; no shared volumes between worktrees.

## Memory tiers (strategic batching)

Cluster size drives memory allocation; naive 1GB/file blows the 40GB budget.

| Tier | Cluster | Memory | Use |
|------|---------|--------|-----|
| 1 | 1 file | 512MB | independent files |
| 2 | 2-3 | 600MB | small feature cluster |
| 3 | 4-8 | 800MB | medium module |
| 4 | 9+ | 1GB | large interconnected module |

## References (load on demand)

| Topic | Path | Load when |
|-------|------|-----------|
| Coordinator/agent code, spawning, Redis schema, clustering, build, troubleshooting | `docs/docker-orchestration.md` | implementing or debugging containers |
| Env var contract | `docker/runtime/cfn-runtime.contract.yml` | wiring any container env var |
| Fast image build | `.claude/skills/docker-build/SKILL.md` | building agent/coordinator images |
