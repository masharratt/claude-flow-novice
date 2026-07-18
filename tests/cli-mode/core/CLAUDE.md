# tests/cli-mode/core/ — CLI-mode core suite

Authoring standards, inclusion criteria, and BUG #21 rule: `tests/CORE_TEST_STANDARDS.md`. This file is the CLI-mode delta only.

## Runner modes (`run-all-tests.sh`)

| Mode | Scope | Time | Deps |
|------|-------|------|------|
| `--quick` | `core/unit/` only | <2 min | none |
| `--integration` | unit + `core/integration/` | <7 min | Redis, Docker |
| `--full` | unit + integration + `core/e2e/` | <20 min | Redis, Docker, NPX, cfn-agent image |

`--full` MUST include the North Star e2e test `core/e2e/test-cfn-loop-cli-real-execution.sh` (real spawning, no mocks). Legacy excluded by default.

## Quality gates

| Category | Pass rate | Speed |
|----------|-----------|-------|
| unit | 100% | <10s |
| integration | ≥95% | <60s |
| e2e | ≥90% | <5 min |

## Related

`docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md` (if present), `tests/cli-mode/core/legacy/README.md`, `tests/CORE_TEST_STANDARDS.md`.
