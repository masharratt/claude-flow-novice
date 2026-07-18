# tests/docker/core/ — Docker-mode core suite

Authoring standards, inclusion criteria, and BUG #21 rule: `tests/CORE_TEST_STANDARDS.md`. This file is the Docker-mode delta only.

## Docker-specific requirements

- Validate actual Docker behavior, not just script logic. Check container logs for errors (`docker logs`), not only exit codes.
- Verify Docker socket access, env var propagation, network isolation, volume mounts where used.
- Unique test IDs to avoid collisions: `TEST_ID="test-$(date +%s)-$$"`, name containers/networks/volumes `cfn-test-${TEST_ID}`.
- Clean up ALL Docker resources on exit:

```bash
cleanup_test_resources() {
  docker ps -a | grep "cfn-test-" | awk '{print $1}' | xargs docker rm -f 2>/dev/null || true
  docker network ls | grep "cfn-test-" | awk '{print $1}' | xargs docker network rm 2>/dev/null || true
  docker volume ls | grep "cfn-test-" | awk '{print $2}' | xargs docker volume rm 2>/dev/null || true
}
trap cleanup_test_resources EXIT
```

## Runner modes (`run-all-tests.sh`)

| Mode | Scope | Time | Pass gate |
|------|-------|------|-----------|
| `--quick` | critical integration only | <5 min | 100% |
| `--integration` | all `core/` integration | <15 min | ≥95% |
| `--full` | + e2e + wave orchestration/stress | <40 min | ≥90% |

Auto-start Redis if down; require cfn-agent image; legacy excluded by default.

## Quality gates

| Category | Pass rate | Speed | Cleanup |
|----------|-----------|-------|---------|
| integration | ≥95% | <2 min avg | 100% |
| e2e | ≥90% | <5 min avg | 100% |
| orchestration | ≥85% | <10 min avg | 100% |

## Related

`docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md` (if present), `.claude/skills/cfn-docker-agent-spawning/SKILL.md`, `tests/CORE_TEST_STANDARDS.md`.
