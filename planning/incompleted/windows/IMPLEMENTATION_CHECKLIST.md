# Cross-Platform Dockerized Subagents: Implementation Checklist

## Overview

Step-by-step checklist for delivering Dockerized subagents in Claude Flow Novice. Each item lists key artifacts plus verification guidance to keep Windows, macOS, Linux, and CI in sync.

---

## Week 1: Docker Runtime Foundation (Days 1-5)

### Day 1-2: Docker Runtime Detector

- [ ] **Create Docker Runtime Module**
  - [ ] File: `src/runtime/docker-runtime.ts`
  - [ ] Detect Docker Desktop, Docker Engine, containerd-backed CI
  - [ ] Validate API version, disk/memory quotas, TLS socket availability
  - [ ] Gather host traits (Windows/macOS/Linux, WSL backend state)
  - **Verification**: `npm run test:unit -- docker-runtime`

- [ ] **Define Runtime Types**
  - [ ] File: `src/runtime/runtime-types.ts`
  - [ ] Interfaces for `DockerRuntimeInfo`, `RuntimeValidation`, `CapabilityWarning`
  - [ ] Shared enums for host OS, virtualization backend, engine channel
  - **Verification**: TypeScript build passes

- [ ] **Author Unit Tests**
  - [ ] File: `src/runtime/docker-runtime.test.ts`
  - [ ] Mock Docker API responses for each platform
  - [ ] Validate error messaging for missing engine/insufficient memory
  - [ ] Cover WSL detection, Hyper-V disabled state, cgroup version mismatch
  - **Verification**: 100% coverage on docker-runtime module

### Day 3-4: Host Prerequisite Automation

- [ ] **Installer & Validation Scripts**
  - [ ] `scripts/windows/install-docker.ps1` (enables WSL/Hyper-V, installs Docker Desktop, configures memory limits)
  - [ ] `scripts/macos/install-docker.sh` (Homebrew tap fallback, rosetta check)
  - [ ] `scripts/linux/install-docker.sh` (installs Docker Engine + docker-compose-plugin, verifies cgroup v2)
  - **Verification**: Scripts run cleanly on lab machines and emit clear success/failure status

- [ ] **Developer Documentation**
  - [ ] File: `docs/docker-runtime-setup.md`
  - [ ] Screenshots for Windows/macOS installers
  - [ ] Troubleshooting table for common virtualization failures
  - [ ] Checklist for raising Docker Desktop memory/CPU limits
  - **Verification**: Peer review approved

- [ ] **`npm run verify:docker` Task**
  - [ ] File: `package-scripts/verify-docker.ts`
  - [ ] Executes runtime detector, prints actionable remediation steps
  - [ ] Exits non-zero when requirements unmet
  - **Verification**: Task succeeds/fails appropriately on all hosts

### Day 5: CI/CD Container Gate & Documentation

- [ ] **GitHub Actions Updates**
  - [ ] File: `.github/workflows/cross-platform-test.yml`
  - [ ] Add docker sanity step (e.g., `docker info`, `docker run hello-world`)
  - [ ] Fail job early when Docker unavailable
  - [ ] Matrix: ubuntu-latest, macos-latest, windows-latest × node 18/20/22
  - **Verification**: Workflow green across matrix with docker validation logs attached

- [ ] **Baseline Artifact**
  - [ ] File: `.artifacts/docker-baseline.json`
  - [ ] Capture container startup latency, memory use, disk impact on each platform
  - **Verification**: Artifact committed and reviewed

- [ ] **Week 1 Checkpoint**
  - [ ] Runtime detector + installers validated
  - [ ] CI gating merged
  - [ ] Documentation reviewed and signed off
  - **Verification**: `planning/windows/WEEK_1_COMPLETION_REPORT.md`

---

## Week 2: Agent Image & Coordination (Days 6-10)

### Day 6-7: Agent Base Image

- [ ] **Dockerfile & Build Pipeline**
  - [ ] File: `docker/agent/Dockerfile`
  - [ ] Multi-stage build (Node 20 base, production runtime layer)
  - [ ] Includes bash scripts, redis-cli/sqlite3, debugging utilities, health checks
  - [ ] Add GitHub workflow `.github/workflows/agent-image.yml` for automatic builds + signing
  - **Verification**: `docker build` passes locally; workflow publishes `ghcr.io/claude-flow/agent:<sha>`

- [ ] **Entrypoints & Scripts**
  - [ ] Files: `docker/agent/entrypoint.sh`, `docker/agent/scripts/*.sh`
  - [ ] Implement orchestrator, worker, and maintenance entrypoints with env-driven behavior
  - [ ] Document required env vars + volume mounts in `planning/windows/SCRIPT_INVENTORY.md`
  - **Verification**: `docker run claude-agent:local smoke-test` completes

### Day 8: Script Migration Into Image

- [ ] **Top 20 Critical Scripts**
  - [ ] Migrate `.claude/skills/*` bash utilities into `/opt/cfn/scripts`
  - [ ] Parameterize via env vars rather than host CLI flags
  - [ ] Provide shims that call `docker exec` when running on host for backward compatibility
  - **Verification**: `tests/integration/agent-script-smoke.test.ts` passes on Windows/macOS/Linux

### Day 9-10: Redis & SQLite Node Adapters

- [ ] **Redis Coordinator**
  - [ ] File: `src/coordination/redis-coordinator.ts`
  - [ ] Replace 409 redis-cli calls with typed methods (`signal`, `wait`, `store`, `retrieve`)
  - [ ] Connection pooling + retry/backoff + metrics hooks
  - **Verification**: `tests/integration/redis-coordination.test.ts`

- [ ] **SQLite Adapter**
  - [ ] File: `src/coordination/sqlite-adapter.ts`
  - [ ] Replace 122 sqlite3 calls (query, execute, transaction helpers)
  - [ ] Provide migration scripts `migrations/sqlite-coordination-schema-v2.sql`
  - **Verification**: `tests/integration/sqlite-adapter.test.ts`

- [ ] **Containers ↔ Host Bridge**
  - [ ] Expose coordination functionality via Unix socket or HTTP endpoint mounted into containers
  - [ ] Update agent entrypoints to use the bridge
  - **Verification**: End-to-end loop orchestrations succeed across platforms

- [ ] **Week 2 Checkpoint**
  - [ ] Image published, adapters merged, legacy redis-cli/sqlite3 calls removed
  - [ ] Report: `planning/windows/WEEK_2_COMPLETION_REPORT.md`

---

## Week 3: Container Orchestration & Resource Controls (Days 11-15)

### Day 11-12: Docker Worker Runner

- [ ] **Worker Runner Implementation**
  - [ ] File: `src/agents/docker-worker-runner.ts`
  - [ ] Methods: `spawn`, `stop`, `status`, `streamLogs`
  - [ ] Handle Windows/macOS/Linux path translation, bind mounts, named pipes
  - [ ] Ensure cleanup of containers/volumes when tasks end or crash
  - **Verification**: `tests/unit/docker-worker-runner.test.ts`

### Day 13-14: Resource Policies & Telemetry

- [ ] **Resource Policy Definitions**
  - [ ] File: `config/resource-policies.json`
  - [ ] Define per-mode CPU/memory/swap budgets and workspace volume sizes
  - [ ] Validate policies against runtime detector (warn when host quotas insufficient)
  - **Verification**: Policy schema tests `tests/unit/resource-policy.test.ts`

- [ ] **Telemetry Collector**
  - [ ] File: `src/monitoring/docker-telemetry.ts`
  - [ ] Pull `docker stats` data for max RSS, CPU %, exit reasons
  - [ ] Emit structured logs + metrics (Prometheus/OTel)
  - [ ] Trigger alerts on repeated `OOMKilled` or CrashLoop
  - **Verification**: `tests/integration/resource-policy.test.ts` + manual Grafana dashboard review

### Day 15: Developer Experience & Checkpoint

- [ ] **DX Updates**
  - [ ] `.vscode/tasks.json` / `.devcontainer/devcontainer.json` updated for Docker agents
  - [ ] npm scripts: `agent:start`, `agent:logs`, `agent:prune`
  - [ ] Docs: `docs/docker-troubleshooting.md`
  - **Verification**: New scripts exercised on Windows/macOS/Linux

- [ ] **Week 3 Checkpoint**
  - [ ] Docker runner in place, policies enforced, telemetry flowing
  - [ ] Report: `planning/windows/WEEK_3_COMPLETION_REPORT.md`

---

## Week 4: Validation & Rollout (Days 16-20)

### Day 16-17: Cross-Platform & Memory Testing

- [ ] **Full CFN Loop Regression**
  - [ ] Tests: `tests/e2e/cfn-loop-docker.test.ts`
  - [ ] Modes: MVP, Standard, Enterprise on Windows/macOS/Linux/CI
  - [ ] Ensure legacy flag path continues to pass
  - **Verification**: CI matrix green with Docker flag enabled

- [ ] **Memory Leak Gauntlet**
  - [ ] Test: `tests/performance/memory-leak-docker.test.ts`
  - [ ] 1,000 spawn/cleanup cycles, monitor RSS + dangling containers/volumes
  - [ ] Produce `.artifacts/memory-leak.json`
  - **Verification**: <0.1% memory growth, zero orphaned resources

- [ ] **Performance Benchmarks**
  - [ ] Compare Windows native vs prior WSL baseline
  - [ ] Record container startup latency and I/O throughput
  - [ ] Artifact: `.artifacts/perf-comparison.json`
  - **Verification**: Windows shows >=10% I/O gain, other platforms within ±10%

### Day 18: Documentation & Migration Assets

- [ ] **README & CHANGELOG**
  - [ ] Document Docker requirement, feature flag usage, rollout status
  - **Verification**: Docs review complete

- [ ] **User Migration Guide**
  - [ ] File: `planning/windows/USER_DOCKER_MIGRATION_GUIDE.md`
  - [ ] Covers installing Docker, enabling flag, troubleshooting, rollback
  - [ ] Includes FAQ for enterprises without admin rights
  - **Verification**: Support + PM sign-off

- [ ] **Support Playbook**
  - [ ] Steps for collecting docker diagnostics, pruning stuck containers, toggling flag
  - **Verification**: Linked from on-call runbook

### Day 19-20: Feature Flag Rollout & Beta Packaging

- [ ] **Feature Flag Enablement**
  - [ ] Default `CFN_USE_DOCKER_SUBAGENTS=true` for canary channels
  - [ ] Telemetry dashboards for adoption + failure monitoring
  - **Verification**: Canary users run containers with <1% failure rate

- [ ] **Beta Release Prep**
  - [ ] Publish `v2.15.0-beta.1` with Docker mode enabled
  - [ ] Release notes + announcement (`BETA_RELEASE_NOTES.md`)
  - [ ] Go/No-Go checklist (`planning/windows/GO_NO_GO_DECISION.md`)
  - **Verification**: Week 4 completion report finalized

---

## Post-Week 4: Rollout (Days 21+)

### Day 21-22: Internal Testing

- [ ] Enable flag in internal environments, run production-like workloads, capture feedback (`planning/windows/INTERNAL_TESTING_REPORT.md`)

### Day 23-25: Beta Release

- [ ] Publish npm beta, announce to Windows users, monitor GitHub issues + telemetry (`planning/windows/BETA_FEEDBACK_SUMMARY.md`)

### Day 26+: General Availability

- [ ] Promote to `latest`, update docs, announce GA, monitor dashboards, execute rollback plan if needed

---

## Success Criteria Summary

### Functional
- [ ] Docker runtime detector + installers validated on Windows/macOS/Linux
- [ ] 100% of subagents launch via Docker when flag enabled
- [ ] Legacy path functional when flag disabled
- [ ] CI matrix (ubuntu/macos/windows × node 18/20/22) green in Docker mode

### Performance
- [ ] Container startup overhead <150 ms vs legacy spawn
- [ ] Windows native file I/O >=10% faster than WSL baseline
- [ ] Memory leak growth <0.1% over 1,000 container cycles
- [ ] No performance regression >10% on Linux/Mac

### Quality
- [ ] Telemetry + alerts for OOMKilled/crash scenarios operational
- [ ] Test coverage >=80% on Docker runtime + worker modules
- [ ] Zero known critical bugs at release
- [ ] Troubleshooting docs published

### Documentation
- [ ] Runtime setup guide, migration guide, support playbook complete
- [ ] README/CHANGELOG updated
- [ ] Rollback steps documented and tested

---

## Sign-Off

### Week 1 Completion
- [ ] Technical Lead Sign-Off: _________________ Date: _______
- [ ] QA Sign-Off: _________________ Date: _______

### Week 2 Completion
- [ ] Technical Lead Sign-Off: _________________ Date: _______
- [ ] QA Sign-Off: _________________ Date: _______

### Week 3 Completion
- [ ] Technical Lead Sign-Off: _________________ Date: _______
- [ ] QA Sign-Off: _________________ Date: _______

### Week 4 Completion
- [ ] Technical Lead Sign-Off: _________________ Date: _______
- [ ] QA Sign-Off: _________________ Date: _______

### GA Release Approval
- [ ] Technical Lead Sign-Off: _________________ Date: _______
- [ ] Product Owner Sign-Off: _________________ Date: _______

---

**Version**: 2.0
**Last Updated**: 2025-01-15
**Status**: Planning Phase
