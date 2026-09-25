# Executive Summary: Dockerized Subagents

## Project Overview

**Project**: Claude Flow Novice – Dockerized Subagents
**Objective**: Run every CFN subagent inside a Docker container to deliver deterministic memory controls, eliminate WSL-only workflows, and keep parity across Windows, macOS, Linux, WSL2, and CI/CD.
**Timeline**: 4 weeks (160 hours) + feature-flagged rollout
**Risk Level**: Medium (Docker prerequisite + cross-platform testing)
**Impact**: High (opens native Windows market, improves reliability, simplifies tooling)

## Business Case

### Current State
- **Windows Support**: Requires WSL2 bash + scattershot GNU tools; brittle setup.
- **Performance**: Windows users see 20-30% slower file I/O due to WSL filesystem overhead.
- **Memory Control**: No deterministic limits; process leaks/zombies rely on best-effort scripts.
- **Operational Costs**: 289 bash scripts + 531 `redis-cli`/`sqlite3` calls run directly on host, each needing per-OS fixes.

### Future State (Docker)
- **Windows Support**: Docker Desktop-backed containers deliver “just works” native experience.
- **Performance**: Windows file I/O improves ≥10% vs WSL baseline because workloads run against native NTFS volumes.
- **Memory Control**: Docker `--memory/--cpus` policies enforce budgets per agent; leak prevention validated via telemetry.
- **Operational Costs**: Tooling, scripts, and dependencies live in a single container image; host only needs Docker + Node.

## Key Benefits

1. **Expanded User Base** – Removes WSL dependency, enabling 30% more potential users (Windows devs + enterprises).
2. **Reliability** – Containers guarantee cleanup, resource limits, and reproducible environments.
3. **Developer Velocity** – One container image handles every bash dependency; no more PowerShell rewrites or platform-specific hacks.
4. **Operational Visibility** – Container telemetry surfaces OOMKilled events, slow startups, and cleanup failures in real time.

## Technical Approach

| Pillar | Description |
|--------|-------------|
| **Docker Runtime Detector** | TypeScript module validates Docker Desktop/Engine/containerd availability, memory quotas, and virtualization support before any workload starts. |
| **Agent Image (ghcr.io/claude-flow/agent)** | Multi-stage Node 20 image embedding CFN scripts, redis-cli/sqlite3, and troubleshooting tools; built and signed in CI. |
| **Container Launcher** | `src/agents/docker-worker-runner.ts` orchestrates `docker run` with resource policies, log streaming, cleanup, and telemetry. |
| **Coordination Bridge** | Native Redis + SQLite adapters run on host/managed services; containers interact via sockets/HTTP instead of shelling out to CLI tools. |
| **Feature Flag** | `CFN_USE_DOCKER_SUBAGENTS` gates rollout, allowing instant fallback to legacy host execution if issues arise. |

## Implementation Plan (4 Weeks)

1. **Week 1 – Runtime Foundation**
   - Docker runtime detector, installer/validation scripts, CI docker gate, baseline metrics.
2. **Week 2 – Agent Image & Coordination**
   - Build/publish container image, migrate top scripts inside image, replace redis-cli/sqlite3 with Node adapters + container bridge.
3. **Week 3 – Container Orchestration**
   - Implement docker worker runner, resource policies, telemetry, and developer tooling (VS Code tasks/devcontainers, troubleshooting doc).
4. **Week 4 – Validation & Rollout**
   - Cross-platform + memory/perf testing, documentation/migration guide, feature-flag rollout, beta packaging.
5. **Post Week 4** – Internal testing (Day 21-22), beta release (Day 23-25), GA + monitoring (Day 26+).

## Resource Requirements

- **People**: 1 platform lead (runtime + runner), 1 backend engineer (image + adapters), 1 DevEx/QA engineer (scripts, docs, testing).
- **Tooling**: Windows 11 + Docker Desktop, macOS 13 + Docker Desktop, Ubuntu 22.04 + Docker Engine, GitHub Actions matrix runners.
- **Budget**: ~$20k engineering time (160 hours); no new SaaS costs.

## Success Criteria

| Category | Target |
|----------|--------|
| Functional | 100% of subagents launch inside containers when flag enabled; legacy path works when disabled. |
| Performance | Container startup overhead <150 ms vs existing spawn; Windows native I/O ≥10% faster than WSL baseline; no >10% regression on Linux/Mac. |
| Reliability | Memory leak test shows <0.1% growth across 1,000 container cycles; zero zombie containers/volumes after tasks. |
| Quality | CI matrix (ubuntu/macos/windows × node 18/20/22) green with Docker; telemetry + alerts for OOM/crash scenarios; docs + migration guide approved. |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Users lack virtualization/Docker prerequisites | Installer scripts, runtime detector with remediation steps, detailed troubleshooting docs. |
| Docker Desktop resource limits too low | Detector checks available memory/CPU; docs instruct raising limits; orchestrator warns when policy cannot be met. |
| Image size or pull times grow | Multi-stage builds, layer caching, nightly pruning, SBOM monitoring. |
| Developer confusion switching modes | Feature flag helpers, CLI messaging, telemetry to detect mixed usage, migration guide + support playbook. |

## Cost-Benefit Snapshot

- **Investment**: 160 engineering hours (~$20k) + existing CI resources.
- **Return**: +30% potential users, higher retention, fewer Windows support tickets, simpler onboarding, and a path to container orchestration (Kubernetes, Nomad) later.
- **ROI**: ~5x (expected value $100k+ from new/retained users).

## Recommendation

Proceed with the Docker-based migration. The plan decouples CFN from platform-specific shell idiosyncrasies, enforces memory limits without waiting for Windows Job Objects, and unlocks a consistent story across laptops and CI. The feature flag plus rollback steps cap downside risk while we gather telemetry in beta.

## Next Steps

1. Approve the Dockerized plan and resource allocation.
2. Execute Week 1 checklist (runtime detector, installers, CI gate) on Windows/macOS/Linux lab machines.
3. Hold weekly checkpoints to review progress, telemetry, and readiness for the feature-flag rollout.
4. Prepare support + comms teams for beta announcements (Week 4) and GA (Day 26+).

---

**Document Version**: 2.0
**Last Updated**: 2025-01-15
**Status**: Awaiting Approval
**Prepared By**: CFN Platform Engineering Team
