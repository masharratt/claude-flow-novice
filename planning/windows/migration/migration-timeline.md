# Migration Timeline: Dockerized Subagent Rollout

## Executive Summary

**Total Duration**: 4 weeks (160 hours)
**Parallel Tracks**: Runtime Foundation, Agent Image & Coordination, Container Orchestration, Validation & Rollout
**Risk Level**: Medium (Docker prerequisite + broad platform surface)
**Breaking Changes**: None (feature-flagged rollout)

---

## Week 1: Docker Runtime Foundation (40 hours)

### Goals
- Detect and validate Docker availability across Windows/macOS/Linux/CI
- Automate prerequisite installation and verification
- Gate CI on a healthy container runtime and capture baseline metrics

### Day 1-2: Docker Runtime Detector (16 hours)

#### Tasks
- Implement `src/runtime/docker-runtime.ts` for detecting Docker Desktop/Engine/containerd
- Create `src/runtime/runtime-types.ts` for shared typing
- Write unit tests `src/runtime/docker-runtime.test.ts` mocking Windows, macOS, Linux, WSL2, CI variants
- Ensure detector surfaces remediation steps for missing Hyper-V/WSL/cgroups or insufficient memory

#### Deliverables
- Source + tests merged with 100% coverage
- Detector CLI hook `npm run verify:docker`

#### Validation Criteria
- Detector correctly classifies every supported runtime
- Helpful error/warning output for each failure mode
- Works on clean Windows 11, macOS 13, Ubuntu 22.04 hosts

### Day 3-4: Host Prerequisite Automation (16 hours)

#### Tasks
- Author install scripts (`scripts/windows/install-docker.ps1`, `scripts/macos/install-docker.sh`, `scripts/linux/install-docker.sh`)
- Document setup steps + troubleshooting tips in `docs/docker-runtime-setup.md`
- Bake memory/CPU recommendations into scripts plus doc checklist
- Implement `package-scripts/verify-docker.ts` to run detector + friendly output

#### Deliverables
- Verified install scripts committed
- Documentation with screenshots / remediation table
- `npm run verify:docker` command wired into package.json

#### Validation Criteria
- Scripts succeed end-to-end on lab VMs
- Docs peer-reviewed by DevEx + Support
- Verification script fails with actionable error on misconfigured hosts

### Day 5: CI Container Gate & Baseline (8 hours)

#### Tasks
- Update `.github/workflows/cross-platform-test.yml` to run docker sanity check (info + hello-world)
- Expand matrix to `os: [ubuntu-latest, macos-latest, windows-latest]` × `node: [18, 20, 22]`
- Capture baseline container metrics and commit `.artifacts/docker-baseline.json`
- Publish Week 1 completion report

#### Validation Criteria
- CI fails fast when Docker unavailable
- Baseline artifact includes startup latency + memory per platform
- Week 1 checkpoint signed off

---

## Week 2: Agent Image & Coordination (40 hours)

### Goals
- Build/publish the `claude-agent` Docker image
- Migrate top bash scripts into the image
- Replace redis-cli/sqlite3 shell calls with Node adapters shared by host + containers

### Day 6-7: Agent Base Image (16 hours)

#### Tasks
- Create `docker/agent/Dockerfile` (multi-stage, Node 20, bash tooling, redis-cli/sqlite3, jq, rsync)
- Write entrypoints (`docker/agent/entrypoint.sh`, `docker/agent/scripts/*.sh`) with env-based behavior
- Set up `.github/workflows/agent-image.yml` for automated builds, signing, publish to ghcr.io

#### Deliverables
- Built image `ghcr.io/claude-flow/agent:<sha>` with SBOM/signature
- Smoke-test target: `docker run claude-agent:local smoke-test`

#### Validation Criteria
- Image runs on Windows/macOS/Linux Docker hosts identically
- Build pipeline green and pushing digests per commit

### Day 8: Script Migration (8 hours)

#### Tasks
- Move top 20 critical bash scripts into `/opt/cfn/scripts` inside the image
- Provide host shims that `docker exec` into running agent containers
- Maintain script inventory + ownership in `planning/windows/SCRIPT_INVENTORY.md`

#### Deliverables
- Updated scripts packaged inside image
- Smoke-test suite `tests/integration/agent-script-smoke.test.ts`

#### Validation Criteria
- Scripts behave the same inside container as previous host execution
- Windows/macOS/Linux smoke tests pass

### Day 9-10: Redis & SQLite Adapters (16 hours)

#### Tasks
- Implement `src/coordination/redis-coordinator.ts` (signal/wait/store/retrieve, retries, metrics)
- Implement `src/coordination/sqlite-adapter.ts` plus migrations
- Expose adapters to containers via mounted socket or HTTP bridge
- Update orchestrator + agent entrypoints to consume adapters

#### Deliverables
- Integration tests `tests/integration/redis-coordination.test.ts` & `tests/integration/sqlite-adapter.test.ts`
- `.artifacts/week2-e2e-report.json`

#### Validation Criteria
- Zero remaining redis-cli/sqlite3 shell invocations
- Containers can call coordination APIs successfully on all platforms
- Week 2 completion report approved

---

## Week 3: Container Orchestration & Resource Controls (40 hours)

### Goals
- Replace host process spawning with Docker worker runner
- Enforce memory/CPU budgets via container limits
- Emit telemetry/alerts for container lifecycle events

### Day 11-12: Docker Worker Runner (16 hours)

#### Tasks
- Implement `src/agents/docker-worker-runner.ts` (spawn/stop/status/logs)
- Handle Windows/macOS/Linux mount paths, secrets, cleanup on crash
- Unit tests mocking Docker Engine SDK interactions

#### Deliverables
- Runner source + `tests/unit/docker-worker-runner.test.ts`
- Updated orchestrator wiring using new runner (behind feature flag)

#### Validation Criteria
- Runner handles parallel launches, cancellations, and crash recovery
- Cleanup removes containers/volumes even on abrupt exit

### Day 13-14: Resource Policies & Telemetry (16 hours)

#### Tasks
- Define policies in `config/resource-policies.json` for MVP/Standard/Enterprise
- Enforce `--memory`, `--memory-swap`, `--cpus`, and disk quotas per policy
- Implement `src/monitoring/docker-telemetry.ts` to collect stats + alert on OOMKilled/crash loops
- Export metrics to existing monitoring stack

#### Deliverables
- Resource policy config + tests (`tests/unit/resource-policy.test.ts`, `tests/integration/resource-policy.test.ts`)
- Telemetry module + dashboards/alerts

#### Validation Criteria
- Policies validated against runtime detector (warning when host cannot satisfy requirements)
- Telemetry visible in monitoring dashboards

### Day 15: Developer Experience & Checkpoint (8 hours)

#### Tasks
- Update `.vscode/tasks.json`, `.devcontainer/devcontainer.json`, npm scripts for Docker workflows
- Publish `docs/docker-troubleshooting.md`
- Complete Week 3 checkpoint report

#### Validation Criteria
- Devs can run/inspect/prune containers with new scripts on all platforms
- Week 3 sign-off completed

---

## Week 4: Validation & Rollout (40 hours)

### Goals
- Validate Dockerized subagents across platforms at scale
- Document migration path, support playbook, and feature flag rollout
- Prepare beta + GA releases guarded by telemetry

### Day 16-17: Cross-Platform & Memory Testing (16 hours)

#### Tasks
- Run full CFN Loop suite (`tests/e2e/cfn-loop-docker.test.ts`) on Windows/macOS/Linux + CI
- Execute 1,000-cycle memory leak test (`tests/performance/memory-leak-docker.test.ts`)
- Capture performance comparisons vs previous WSL baseline (`.artifacts/perf-comparison.json`)

#### Validation Criteria
- All tests pass with feature flag enabled and disabled paths
- Memory growth <0.1%; zero orphaned containers/volumes
- Windows I/O at least 10% faster than WSL baseline; other platforms within ±10%

### Day 18: Documentation & Migration Assets (8 hours)

#### Tasks
- Update README + CHANGELOG with Docker requirements and rollout notes
- Write `planning/windows/USER_DOCKER_MIGRATION_GUIDE.md`
- Update support playbook with diagnostics + rollback steps

#### Validation Criteria
- Docs reviewed by Support + Product
- Migration guide published internally + externally

### Day 19-20: Feature Flag Rollout & Beta Packaging (16 hours)

#### Tasks
- Enable `CFN_USE_DOCKER_SUBAGENTS` for canary cohort, monitor telemetry dashboards
- Prepare beta release `v2.15.0-beta.1` + `BETA_RELEASE_NOTES.md`
- Record Go/No-Go in `planning/windows/GO_NO_GO_DECISION.md`
- Publish Week 4 completion report

#### Validation Criteria
- Canary failure rate <1%
- Beta package live on npm with announcement sent
- Rollout + rollback procedures rehearsed

---

## Rollout Strategy (Post Week 4)

### Phase 1: Internal Testing (Day 21-22)
- Enable flag in internal environments, run production workloads, document findings in `planning/windows/INTERNAL_TESTING_REPORT.md`

### Phase 2: Beta Release (Day 23-25)
- Keep flag enabled for beta cohort, collect telemetry + feedback (`planning/windows/BETA_FEEDBACK_SUMMARY.md`)

### Phase 3: General Availability (Day 26+)
- Promote Docker mode to default, monitor dashboards, maintain rollback ability (`CFN_USE_DOCKER_SUBAGENTS=false`)

---

## Success Metrics

### Functional Metrics
- 100% of subagents launch inside Docker when flag enabled
- Legacy host path stable when flag disabled
- CI matrix green across Windows/macOS/Linux × Node 18/20/22

### Performance Metrics
- Container startup overhead <150 ms vs legacy spawn
- Windows native file I/O >=10% faster than prior WSL baseline
- Memory leak growth <0.1% over 1,000 container cycles
- No regression >10% on Linux/Mac

### Quality Metrics
- Test coverage >=80% on Docker runtime + worker modules
- Telemetry/alerting active for OOMKilled/crash scenarios
- Documentation + migration guides complete
- Positive beta feedback (>=80% satisfaction)

---

## Risk Mitigation

### High Risk: Docker prerequisites unavailable (Hyper-V/WSL/cgroups)
**Mitigation**: Installer scripts, runtime detector warnings, troubleshooting guide, fallback instructions

### Medium Risk: Docker Desktop resource caps too low
**Mitigation**: Detector checks capacity, docs teach users to raise limits, orchestrator warns when budgets unmet

### Medium Risk: Image size growth slows installs
**Mitigation**: Multi-stage builds, nightly pruning, artifact compression, SBOM monitoring

### Low Risk: Developer confusion between legacy and Docker modes
**Mitigation**: Feature flag toggle commands, clear docs, telemetry to observe mixed usage

---

## Rollback Plan

### Trigger Conditions
- Docker runtime failures affecting >10% of users
- Performance regression >20%
- Memory leaks causing repeated OOM events
- Security vulnerability in container image

### Procedure
1. Toggle feature flag `CFN_USE_DOCKER_SUBAGENTS=false`
2. Revert to latest non-Docker npm release
3. Prune containers/images created by rollout scripts
4. Investigate + fix root cause
5. Re-enable flag after validation

### Targets
- Rollback initiation <1 hour from decision
- Stability verification <4 hours after rollback

---

## Post-Migration

### Week 5+: Optimization & Refinement
- Tune image size, improve cold-start times, collect feedback for Podman/Kubernetes support backlog item

### Ongoing Maintenance
- Monitor CI for Docker regressions
- Keep install docs aligned with Docker Desktop/Engine releases
- Regularly prune stale images + volumes in templates
- Track telemetry for adoption + anomalies

---

**Version**: 2.0
**Last Updated**: 2025-01-15
**Status**: Planning Phase
