# Docker Shell to TypeScript Migration Handoff

## Overview

Migration of 33 shell scripts in `docker/` to TypeScript for improved type safety, testability, and maintainability.

## Files to Convert

### Core Scripts (Priority 1)
| File | Purpose |
|------|---------|
| `docker/coordinator-entrypoint.sh` | Main coordinator container entry point |
| `docker/coordinator/main/entrypoint.sh` | Main coordinator variant |
| `docker/coordinator/team/entrypoint.sh` | Team coordinator variant |
| `docker/runtime/cfn-runtime.sh` | CFN runtime initialization |
| `docker/redis-health-check.sh` | Redis health check for containers |

### Build & Deploy Scripts (Priority 2)
| File | Purpose |
|------|---------|
| `docker/build-all.sh` | Build all Docker images |
| `docker/scripts/container-deploy-cfn-team.sh` | Team deployment |
| `docker/scripts/container-deploy-cfn-team-fixed.sh` | Fixed team deployment |
| `docker/scripts/create-networks.sh` | Docker network creation |
| `docker/scripts/deprovision-team.sh` | Team teardown |
| `docker/scripts/docker-deploy.stabilization.sh` | Stabilization deployment |
| `docker/scripts/monitor-wrapper.sh` | Container monitoring |
| `docker/scripts/provision-team.sh` | Team provisioning |
| `docker/scripts/validate-team-config.sh` | Config validation |

### Database Skills (Priority 3)
| File | Purpose |
|------|---------|
| `docker/skills/database-readonly/query.sh` | Read-only DB queries |
| `docker/skills/database-readwrite/migrate.sh` | DB migrations |
| `docker/skills/database-readwrite/query.sh` | Read-write DB queries |

### Test Infrastructure (Priority 4)
| File | Purpose |
|------|---------|
| `docker/test-all.sh` | Run all tests |
| `docker/test-images.sh` | Test Docker images |
| `docker/test-runner.sh` | Test runner |
| `docker/tests/run-all-tests.sh` | Test suite runner |
| `docker/tests/test-helpers.sh` | Shared test utilities |
| `docker/tests/mocks/generate-skill-metadata.sh` | Mock generation |
| `docker/tests/mocks/generate-workflow-reflections.sh` | Mock generation |

### Individual Test Files (Priority 5)
| File | Purpose |
|------|---------|
| `docker/tests/test-approval-workflow.sh` | Approval workflow tests |
| `docker/tests/test-cost-tracking.sh` | Cost tracking tests |
| `docker/tests/test-edge-case-tracking.sh` | Edge case tests |
| `docker/tests/test-pattern-detection.sh` | Pattern detection tests |
| `docker/tests/test-phase2-validation.sh` | Phase 2 validation tests |
| `docker/tests/test-skill-generation.sh` | Skill generation tests |
| `docker/tests/test-workflow-codification-e2e.sh` | E2E workflow tests |
| `docker/tests/test-workflow-codification-performance.sh` | Performance tests |
| `docker/tests/test-workflow-codification-security.sh` | Security tests |

## Migration Guidelines

1. **Target location**: `src/docker/` mirroring current structure
2. **Use zx or execa** for shell command execution
3. **Preserve environment variable contracts** (TASK_ID, WORKSPACE, CFN_NETWORK_NAME, etc.)
4. **Add type definitions** for all inputs/outputs
5. **Maintain backward compatibility** with existing Docker compose files
6. **Add unit tests** alongside each converted file

## Dependencies to Add

```json
{
  "zx": "^8.0.0",
  "execa": "^9.0.0"
}
```

## Acceptance Criteria

- [ ] All 33 scripts converted to TypeScript
- [ ] Existing Docker workflows unchanged
- [ ] Unit test coverage >80%
- [ ] No regression in CLI/Docker mode tests
