# Platform Compatibility Matrix (Dockerized Subagents)

## Overview

Compatibility snapshot for the Docker-first CFN runtime across Windows, macOS, Linux, WSL2, and CI/CD.

## Supported Platforms

| Tier | Platform | Version | Docker Runtime | Support Level | CI/CD Coverage |
|------|----------|---------|----------------|---------------|----------------|
| 1 | Windows 10 1809+, 11 | Docker Desktop 4.31+ (WSL2 backend) | Full | windows-latest |
| 1 | macOS 12.0+ (Intel + Apple Silicon) | Docker Desktop 4.31+ | Full | macos-latest |
| 1 | Linux (Ubuntu 20.04+, Debian 11+, Fedora 38+, Amazon Linux 2023) | Docker Engine 24+ / containerd | Full | ubuntu-latest |
| 1 | WSL2 (Ubuntu 20.04+) | Docker Desktop integration | Full | Covered via windows-latest |
| 2 | Windows Server 2019+ | Docker Desktop or Mirantis Moby | Best Effort | None |
| 2 | macOS 11 | Docker Desktop (legacy) | Best Effort | None |
| 2 | Other Linux distros (kernel >=5.4) | Docker Engine 24+ | Best Effort | None |
| Unsupported | WSL1 / Windows 8.1 / macOS 10.x | N/A | Not Supported | None |

## Feature Coverage

### Core Workloads

| Feature | Linux | macOS | Windows | WSL2 | CI/CD |
|---------|-------|-------|---------|------|-------|
| Docker Runtime Detector | Yes | Yes | Yes | Yes | Yes |
| CFN Loop (CLI + Task) | Yes | Yes | Yes | Yes | Yes |
| Subagent Container Launch | Yes | Yes | Yes | Yes | Yes |
| Redis Coordination (Node) | Yes | Yes | Yes | Yes | Yes |
| SQLite Adapter (Node) | Yes | Yes | Yes | Yes | Yes |
| Legacy Host Spawn (flag off) | Yes | Yes | Yes | Yes | Yes |

### Advanced Capabilities

| Capability | Linux | macOS | Windows | Notes |
|------------|-------|-------|---------|-------|
| Memory policies (`--memory`, `--memory-swap`) | Yes | Yes | Yes | Policies enforced per mode |
| CPU policies (`--cpus`) | Yes | Yes | Yes | Host must allocate enough CPUs to Docker |
| Volume mounts / workspace sync | Yes | Yes | Yes | Runner handles path translation + permissions |
| OOMKill detection | Yes | Yes | Yes | Telemetry pipeline records `OOMKilled` events |
| Container telemetry (logs/stats) | Yes | Yes | Yes | Exported to Prometheus/OTel |
| Legacy bash/PowerShell scripts | Inside container | Inside container | Inside container | Image carries scripts |

### Developer Tooling

| Tooling | Linux | macOS | Windows | Notes |
|---------|-------|-------|---------|-------|
| `npm run verify:docker` | Yes | Yes | Yes | Fails fast when prerequisites missing |
| VS Code tasks / devcontainer | Yes | Yes | Yes | Use Docker context |
| `npm run agent:start|logs|prune` | Yes | Yes | Yes | Proxies to docker-worker-runner |

## Required Host Software

| Component | Linux | macOS | Windows |
|-----------|-------|-------|---------|
| Docker Engine/Desktop | 24+ | Desktop 4.31+ | Desktop 4.31+ with WSL2 backend |
| Virtualization | KVM enabled | Apple Hypervisor | Hyper-V + WSL2 |
| Node.js | 18.x / 20.x / 22.x | Same | Same |
| Git | Optional | Optional | Optional |

### Container Image Targets

| Image | Architecture | Host Coverage |
|-------|--------------|---------------|
| `ghcr.io/claude-flow/agent` | linux/amd64 | Windows (via WSL2), macOS, Linux |
| Optional variant | linux/arm64 | Apple Silicon (native) + ARM servers |

## Environment Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| Docker RAM allocation | 4 GB | 8 GB |
| Docker CPU allocation | 2 cores | 4 cores |
| Disk space (images + volumes) | 5 GB | 10 GB |
| Network | Internet for pulls | LAN mirror optional |

### Container Policies

| Mode | Memory | CPUs | Swap | Notes |
|------|--------|------|------|-------|
| MVP | 1.5 GB | 1 | 2 GB | Lightweight tasks |
| Standard | 3 GB | 2 | 4 GB | Default developer mode |
| Enterprise | 6 GB | 4 | 8 GB | Parallel orchestration |

## Known Limitations & Workarounds

### Windows / Docker Desktop
- `docker info` shows WSL2 backend disabled -> Enable WSL + Virtual Machine Platform, restart Docker Desktop.
- Insufficient memory for Enterprise mode -> Raise Docker Desktop memory slider to >=8 GB.
- Slow file sync on bind mounts -> Keep workspaces on local NTFS (C:) or switch to named Docker volumes.

### macOS
- Rosetta missing for x86 image on Apple Silicon -> Install Rosetta or pull arm64 image variant.
- File permission mismatches on bind mounts -> Runner applies `--user` mappings to align UID/GID.

### Linux Servers
- cgroup v1 hosts cannot set memory+swap simultaneously -> Enable cgroup v2 or allow fallback to memory-only limits.
- Rootless Docker lacks needed privileges -> Run Engine in rootful mode or configure user namespace mapping.

## Testing Matrix

| Suite | Linux | macOS | Windows | CI |
|-------|-------|-------|---------|----|
| `npm run test:unit` | Yes | Yes | Yes | Yes |
| `tests/integration/agent-script-smoke` | Yes | Yes | Yes | Yes |
| `tests/e2e/cfn-loop-docker` | Yes | Yes | Yes | Yes |
| Memory leak (1,000 cycles) | Yes | Yes | Yes | Nightly on CI |
| Legacy path regression | Yes | Yes | Yes | Yes |

Approximate durations: Unit 3 min, Integration 8 min, E2E 15 min on Windows (faster on Linux/macOS).

## Backward Compatibility

| Version | Docker Mode | Legacy Host Mode |
|---------|-------------|------------------|
| 2.14.x | Not available | Default |
| 2.15.0-beta | Opt-in via `CFN_USE_DOCKER_SUBAGENTS` | Enabled |
| 2.15.0 (target GA) | Default | Available via feature flag |

## Support Policy

- Tier 1 platforms: 24–48 hour response SLA.
- Tier 2 platforms: best-effort guidance.
- Unsupported platforms: tooling blocks execution with actionable errors.

---

**Version**: 2.0
**Last Updated**: 2025-01-15
**Owner**: Platform Engineering
