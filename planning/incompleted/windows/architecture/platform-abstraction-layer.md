# Dockerized Subagents Architecture

## Overview

Claude Flow Novice now executes every subagent inside a Docker container, giving us identical tooling, deterministic memory limits, and predictable cleanup on Windows, macOS, Linux, WSL2, and CI. The host process only contains the orchestrator plus coordination adapters; everything agent-specific lives inside a signed container image.

## Design Principles

1. **Deterministic runtime** – the `claude-agent` image carries all shell scripts, binaries, and environment tweaks so results are consistent everywhere.
2. **Host portability** – the orchestrator talks to Docker Engine/Desktop/containerd using the Engine API; no host-specific shell tricks or POSIX signals.
3. **Predictable resource limits** – memory/CPU budgets are enforced via Docker flags rather than platform APIs like Job Objects or POSIX process groups.
4. **Feature-flag safety** – Docker mode is gated by `CFN_USE_DOCKER_SUBAGENTS`; legacy host spawning is still available until GA.
5. **Observability first** – every container launch emits structured telemetry (timings, RSS, exit code, OOMKilled state) so we know when resource policies fail.

## High-Level Layout

```
+---------------- Application Layer (CFN Loop, Agents, CLI) ----------------+
|   src/orchestrator, src/agents/*, src/coordination/*                      |
+-----------------------------------+--------------------------------------+
                                    |
                            Docker Worker Runner
                            (src/agents/docker-worker-runner.ts)
                                    |
 +-------------------+   Engine API / docker CLI   +---------------------+
 | Docker Runtime    | <--------------------------> | Docker Desktop /    |
 | Detector & Policy |                              | Docker Engine       |
 | (src/runtime/*)   |                              | (Windows/macOS/Linux)|
 +-------------------+                              +---------------------+
                                    |
                            claude-agent Container
                            (docker/agent/Dockerfile, scripts)
```

## Core Components

### 1. Docker Runtime Detector (`src/runtime/docker-runtime.ts`)
- Detects Docker Desktop, Docker Engine, or containerd-backed CI.
- Validates API version, available memory/CPU, disk space, and (on Windows) WSL/Hyper-V readiness.
- Surfaces actionable remediation steps (enable virtualization, raise memory limit, start daemon).
- Used by `npm run verify:docker`, CI gates, and runtime health checks.

### 2. Agent Image (`docker/agent/Dockerfile`)
- Multi-stage Node 20 image with bash, redis-cli, sqlite3, jq, rsync, git tooling.
- Embeds legacy `.claude/skills/*` scripts plus entrypoints for orchestrator/worker/maintenance flows.
- Publishes signed digests to ghcr.io with SBOM + provenance metadata.
- Supports configuration via env vars, mounted volumes, and secrets passed from host.

### 3. Container Launcher (`src/agents/docker-worker-runner.ts`)
- Wraps the Docker Engine SDK (or `docker` CLI fallback) to spawn/stop containers, stream logs, and inspect status.
- Applies resource policies defined in `config/resource-policies.json` (memory, swap, CPU, pids, disk quota).
- Handles Windows/macOS/Linux specifics: path translation, drive letter mapping, named pipe sockets, fs permissions.
- Guarantees cleanup of containers and anonymous volumes even when hosts crash (uses `--rm` + safety pruning).

### 4. Coordination Bridge (`src/coordination/*`)
- Redis (`redis-coordinator.ts`) and SQLite (`sqlite-adapter.ts`) run on the host or managed service; containers communicate through sockets or HTTP endpoints mounted into the container.
- Replaces 531 shell invocations with native TypeScript calls, improving observability and error handling.

### 5. Telemetry + Monitoring (`src/monitoring/docker-telemetry.ts`)
- Collects `docker events` and `docker stats` output for each container.
- Emits structured logs (JSON) with container ID, task ID, exit reason, runtime, RSS high-water mark.
- Integrates with Prometheus/OTel exporters for dashboards and alerting (OOMKilled, crash loops, slow startup, excessive retries).

## Execution Flow

1. Platform bootstrap calls `DockerRuntime.validate()`; launch halts if prerequisites are missing.
2. User command triggers orchestrator logic (e.g., CFN Loop) which requests a worker via `docker-worker-runner.spawn()`.
3. Runner calculates resource policy for the requested mode, mounts workspace + secrets, and starts the container using the published `claude-agent` image.
4. Inside the container, entrypoints execute legacy bash scripts/Node tasks, talking to coordination services through the bridge.
5. Runner streams stdout/stderr back to the host, watching for completion or cancellation events.
6. Telemetry layer records lifecycle events and enforces cleanup policies.

## Resource Policies

`config/resource-policies.json` defines limits per product tier:

| Mode | Memory | Swap | CPUs | Notes |
|------|--------|------|------|-------|
| MVP | 1.5GB | 2GB | 1 | Focus on lightweight workflows |
| Standard | 3GB | 4GB | 2 | Default developer experience |
| Enterprise | 6GB | 8GB | 4 | Aggressive concurrency |

Runner logic verifies that Docker Desktop/Engine has enough headroom; if not, launch fails with guidance on increasing Docker Desktop limits or resizing servers.

## Failure Handling

- **Prerequisite failures**: detector emits remediation steps; CLI exits non-zero before any work begins.
- **Launch failures**: runner retries transient Docker errors (image pull, network) with exponential backoff; permanent errors bubble up with actionable logs.
- **OOMKilled**: telemetry marks the run, orchestrator can retry with higher policy (if allowed) or fail fast.
- **Crash loops**: after N retries, orchestrator toggles feature flag to fall back to legacy host execution.
- **Cleanup**: safety task periodically prunes stale containers/volumes in case of host crashes.

## Testing Strategy

| Layer | Tests |
|-------|-------|
| Runtime Detector | Jest unit tests with mocked Docker API responses + integration tests running against real Docker Desktop/Engine installs. |
| Agent Image | `docker build` linting, `hadolint`, smoke tests executing key scripts, vulnerability scanning + SBOM validation. |
| Container Runner | Unit tests using mocked Engine API + integration suite that launches short-lived containers on each OS/CI runner. |
| Resource Policies | Contract tests ensuring effective limits, plus stress tests verifying OOM detection and cleanup. |
| End-to-End | Full CFN Loop flows on Windows/macOS/Linux with Docker flag on/off, 1,000-cycle memory leak gauntlet. |

## Migration Path

1. **Week 1** – Runtime detector, installer scripts, CI Docker gate.
2. **Week 2** – Agent image, script migration into container, Redis/SQLite adapters + bridge.
3. **Week 3** – Docker worker runner, resource policies, telemetry + developer tooling.
4. **Week 4** – Cross-platform validation, documentation, feature-flag rollout, beta packaging.
5. **Post-GA** – Optional Podman/Kubernetes support, automated pruning, offline installers.

## Rollback Strategy

- Feature flag `CFN_USE_DOCKER_SUBAGENTS` controls whether orchestrator uses containers or the legacy host path.
- Rollback steps: toggle flag off, revert to previous npm release, prune containers/images, investigate issue, re-enable once fixed.
- Target <1 hour to disable + <4 hours to verify stability.

---

**Version**: 2.0
**Last Updated**: 2025-01-15
**Status**: Design Phase
