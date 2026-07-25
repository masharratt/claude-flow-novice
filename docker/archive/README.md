# Archived Dockerfiles

This directory contains legacy Dockerfiles that are no longer actively used.

## Contents

- **Dockerfile.agent-backend** - Backend specialist agent (superseded by docker/agent/Dockerfile)
- **Dockerfile.agent-frontend** - Frontend specialist agent (superseded by docker/agent/Dockerfile)
- **Dockerfile.agent.stabilized** - Stabilized agent variant (no longer maintained)
- **Dockerfile.orchestrator** - Simple orchestrator (see docker/CLAUDE.md for current patterns)
- **Dockerfile.cfn-coordinator** - CFN v3 coordinator (legacy)
- **Dockerfile.production** - Production multi-stage image (no longer used)
- **Dockerfile.telemetry** - Telemetry collection container (deprecated)
- **Dockerfile.minimal** - Minimal test image (deprecated)
- **Dockerfile.minimal-test** - Test artifact (deprecated)

## Active Dockerfiles

For current Docker builds, see:
- **docker/agent/Dockerfile** - Active agent image (moved from root)
- **docker/trigger-dev/Dockerfile.worker** - Trigger.dev worker

## Why Archived?

These files were moved to archive because:
1. Only `Dockerfile.agent` was actively used for agent builds
2. `docker/trigger-dev/Dockerfile.worker` was already properly organized
3. Other Dockerfiles were either duplicates, test artifacts, or no longer maintained
4. Keeping them in root created unnecessary clutter

## Migration

**Date:** 2025-11-24
**Migration Plan:** `planning/docker/DOCKERFILE_MIGRATION_PLAN.md`

If you need to restore any of these Dockerfiles, they remain in git history.
