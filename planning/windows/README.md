# Cross-Platform Migration Plan: Dockerized Subagents

## Overview

We are shifting Claude Flow Novice (CFN) onto a containerized execution model so every subagent runs inside a controlled Docker environment. This delivers deterministic memory budgets and identical tooling across Windows, macOS, Linux, and CI while keeping ".just works" ergonomics for developers. Windows hosts use Docker Desktop (WSL2 backend when needed), Linux/macOS hosts use the native Docker Engine, and CI uses GitHub Actions' container support.

## Strategy at a Glance
- **Run-time parity** – all subagents execute inside the same `claude-agent` image, so bash-heavy workflows stay intact without PowerShell rewrites.
- **Memory enforcement** – orchestrator launches each container with `--memory`, `--memory-swap`, and `--cpus` budgets instead of OS-specific job objects.
- **Minimal host surface area** – only the orchestrator and Node coordination layer run on the host; everything else lives inside containers.
- **Single prerequisite** – "Docker installed" replaces the long list of GNU tools, redis-cli/sqlite3 binaries, and signal semantics we previously had to support per platform.
- **Fallback simplicity** – if native Docker is unavailable, we guide users to install Docker Desktop/Engine rather than juggling bespoke WSL fallbacks.

## Project Goals
1. **Containerized subagents** – 100% of agent workloads run inside Docker on every platform.
2. **Deterministic resource limits** – enforce per-agent memory/CPU ceilings with Docker runtime controls.
3. **Host portability** – Windows, macOS, Linux, and CI/CD orchestrators all share one TypeScript-based container launcher.
4. **Zero regressions** – existing Linux/WSL users experience no breaking changes.
5. **Operational visibility** – container events feed into the existing logging and monitoring systems for auditing.

## Why Containers (Now)
- Eliminates the need for Windows Job Objects while still guaranteeing cleanup and leak prevention.
- Retains our existing bash-centric automation because scripts continue to run inside Linux containers.
- Provides a uniform path for bundling Redis/SQLite CLIs, build utilities, and debugging tools without burdening host systems.
- Matches GitHub Actions' strengths (services + containers) and simplifies future scaling to Kubernetes or Nomad if desired.

## Current vs Target State
| Area | Current | Target |
| --- | --- | --- |
| Subagent runtime | POSIX shells launched directly via Node on host | Containers launched via `docker run`/Engine API |
| Memory limits | Best-effort traps/Job Objects (not implemented) | Enforced via Docker `--memory`/`--memory-reservation` |
| Toolchain surface | 289 bash scripts + redis-cli/sqlite3 on host | Scripts baked into agent image; hosts only need Docker + Node |
| Platform fallback | WSL requirement on Windows | Docker Desktop w/ built-in WSL backend; no bespoke fallback |
| Coordination layer | Shelling out to redis-cli/sqlite3 | Native Node clients shared by host + container |

## Architecture Building Blocks
- **Docker Runtime Detector (`src/runtime/docker-runtime.ts`)** – validates Docker/WSL availability, engine version, resource quotas, and provides actionable error messages.
- **Agent Base Image (`docker/agent/Dockerfile`)** – Alpine/Ubuntu image containing CFN scripts, Node runtime, redis-cli/sqlite3 for debugging, and health probe hooks.
- **Container Launcher (`src/agents/docker-worker-runner.ts`)** – TypeScript module that builds `docker run` requests, mounts workspaces, injects secrets, applies resource limits, and streams logs.
- **Coordination Layer** – Redis + SQLite adapters move to Node (outside containers) but expose lightweight RPC endpoints to agents through mounted sockets or HTTP.
- **Observability** – container lifecycle events emit structured logs + metrics (start/stop duration, exit codes, memory high-water mark gathered via `docker stats`).
- **Developer Experience** – helper scripts (`scripts/windows/install-docker.ps1`, `scripts/macos/install-docker.sh`, etc.) plus VS Code devcontainers/tasks for one-click setup.

## Phased Plan (4 Weeks)
1. **Week 1 – Runtime Foundation**
   - Build Docker runtime detector + capability schema.
   - Ship installer/validation scripts for Windows/macOS/Linux, including guidance for Docker Desktop memory settings.
   - Update CI to fail fast when Docker is missing or misconfigured; capture baseline resource usage running current stack in containers.

2. **Week 2 – Agent Image & Coordination**
   - Author the `claude-agent` Dockerfile, entrypoints, and volume strategy; migrate top 20 scripts into the image.
   - Move Redis + SQLite integrations to Node modules consumed by both host orchestrator and agent container.
   - Publish versioned container images to ghcr.io and wire up automated builds in CI.

3. **Week 3 – Orchestration & Memory Controls**
   - Implement `docker-worker-runner` and integrate it with the CFN orchestrator; support parallel launches and cancellation.
   - Enforce per-mode resource policies (MVP, Standard, Enterprise) using Docker limits; surface warnings when host quotas are insufficient.
   - Capture telemetry (container exit states, RSS, runtime) and plug into monitoring dashboards.

4. **Week 4 – Validation & Rollout**
   - Run full E2E suites on Windows, macOS, Linux using Docker-based agents.
   - Execute long-running memory leak tests (1,000 spawn/cleanup cycles) verifying no orphan containers or volume leaks.
   - Update documentation, publish migration guides, and gate release behind `CFN_USE_DOCKER_SUBAGENTS` feature flag.

## Key Decisions
1. **Containers over native processes** – memory limits, cleanup guarantees, and toolchain bundling outweigh the added Docker dependency.
2. **Single image for all agents** – simplifies maintenance; agent-specific behavior is driven via env vars/entrypoints rather than bespoke images.
3. **Host-side coordination** – Redis/SQLite stay on the host (or managed service) while containers communicate via APIs; avoids nested Docker-in-Docker for services.
4. **Feature flag rollout** – orchestrator defaults to the legacy path until Docker mode passes all gates; rollback is a flag flip plus npm revert.

## Success Criteria
### Functional
- 100% of subagents launch via Docker on Windows/macOS/Linux/CI when the feature flag is enabled.
- Legacy path remains available and stable while the flag is off.
- Container startup latency increase <150 ms compared to current `spawn` approach.

### Performance & Reliability
- Memory leak test shows <0.1% growth over 1,000 container cycles with enforced `--memory` limits.
- No zombie containers or dangling volumes after task completion.
- Windows native I/O throughput improves >=10% vs WSL baseline due to reduced host-process churn.

### Operational
- Docker prerequisite installers + docs validated on clean Windows 10/11, macOS 13+, Ubuntu 22.04.
- GitHub Actions matrix (ubuntu/macos/windows × node 18/20/22) passes with Docker-enabled suites.
- Monitoring dashboards expose container-level metrics and alerts for OOMKilled events.

## Timeline Summary
- **Week 1** – Runtime detection, install automation, CI gating.
- **Week 2** – Agent image + coordination refactor + image publishing.
- **Week 3** – Container launcher, resource policies, observability.
- **Week 4** – Cross-platform testing, memory/perf validation, documentation, feature-flagged rollout.

## Next Steps
1. Approve this container-focused plan.
2. Stand up Windows/macOS developer environments with Docker Desktop and run the validation checklist.
3. Kick off Week 1 sprints and set up metrics to track adoption.
