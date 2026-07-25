# Test Organization Guide

This document explains the test suite organization for Claude Flow Novice, covering both CLI mode and Docker mode tests.

## Quick Start

```bash
# CLI Mode Tests
tests/cli-mode/run-all-tests.sh --quick         # Unit tests only (~1 min)
tests/cli-mode/run-all-tests.sh --integration   # Unit + Integration (~5 min)
tests/cli-mode/run-all-tests.sh --full          # All tests including E2E (~15 min)

# Docker Mode Tests
tests/docker/run-all-tests.sh --quick          # Unit tests only (~2 min)
tests/docker/run-all-tests.sh --integration    # Unit + Integration (~10 min)
tests/docker/run-all-tests.sh --full           # All tests including Core (~30 min)
```

## Directory Structure

```
tests/
├── cli-mode/
│   ├── core/                    # Essential CLI mode tests
│   │   ├── unit/                # Component validation (4 tests)
│   │   │   ├── test-agent-tool-access.sh
│   │   │   ├── test-command-parameter-validation.sh
│   │   │   ├── test-path-resolution-fix.sh
│   │   │   └── test-threshold-enforcement.sh
│   │   ├── integration/         # Component interaction (7 tests)
│   │   │   ├── test-cfn-loop-cli-command.sh
│   │   │   ├── test-cfn-loop-execution.sh
│   │   │   ├── test-cfn-loop-task-command.sh
│   │   │   ├── test-coordinator-spawning.sh
│   │   │   ├── test-orchestrator-workflow.sh
│   │   │   ├── test-redis-coordination.sh
│   │   │   └── test-task-mode-detection.sh
│   │   └── e2e/                 # End-to-end validation (4 tests)
│   │       ├── test-cfn-loop-cli-real-execution.sh (PRIMARY E2E)
│   │       ├── test-cfn-loop-e2e-integration.sh
│   │       ├── test-cfn-loop-full-cycle.sh
│   │       └── test-success-criteria-e2e.sh
│   ├── archive/                 # Old/redundant tests (5 tests)
│   │   ├── test_cli_mode.sh
│   │   ├── test_mode_detection.sh
│   │   ├── test_mode_simple.sh
│   │   ├── test-cli-mode-fixes.sh
│   │   └── test-mode-detection-anti023.sh
│   ├── run-all-tests.sh         # Comprehensive test runner
│   └── README*.md               # Test documentation
│
├── docker/
│   ├── core/                    # Critical Docker functionality (40 tests)
│   │   ├── agent-lifecycle-tests.sh
│   │   ├── cfn-loop-compliance-tests.sh
│   │   ├── cfn-loop-full-cycle-tests.sh
│   │   ├── coordinator-*.sh (9 coordinator tests)
│   │   ├── docker-hello-world-parity-tests.sh
│   │   ├── orchestrator-workflow-tests.sh
│   │   ├── redis-coordination-tests.sh
│   │   ├── tdd-compliance-tests.sh
│   │   └── test-*.sh (various core tests)
│   ├── unit/                    # Docker unit tests (1 test)
│   │   └── test-spawn-command-syntax.sh
│   ├── integration/             # Docker integration tests (7 tests)
│   │   ├── docker-cfn-loop-hello-world-e2e.sh
│   │   ├── test-hello-world-cfn-loop-full.sh
│   │   ├── test-logging-verification-team.sh
│   │   ├── test-real-agent-spawning.sh (BUG #21 validation)
│   │   └── test-tdd-violation-gate-failure.sh
│   ├── archive/                 # Experimental/obsolete tests
│   │   ├── b10-typescript-fix/  # Bug #10 specific (already fixed)
│   │   └── 50-agent-parallel/   # Experimental parallel testing
│   ├── lifecycle/               # Agent lifecycle tests
│   ├── orchestration/           # Orchestration pattern tests
│   ├── redis/                   # Redis coordination tests
│   ├── validation/              # Validation tests
│   ├── run-all-tests.sh         # Comprehensive test runner
│   └── TEST_*.md                # Test documentation
│
└── TEST_ORGANIZATION.md         # This file
```

## Test Categories

### CLI Mode Tests

#### Unit Tests (core/unit/)
**Purpose:** Validate individual components and functions
**Runtime:** ~1 minute
**Prerequisites:** None (no external services required)

Tests:
- **test-agent-tool-access.sh**: Validates required tools for CLI agents (Bash, Read, Write, Edit, Grep, Glob, Task)
- **test-command-parameter-validation.sh**: BUG #22 validation - parameter handling in orchestrate-wrapper.sh
- **test-path-resolution-fix.sh**: Path resolution in orchestrate.sh
- **test-threshold-enforcement.sh**: Gate threshold enforcement

#### Integration Tests (core/integration/)
**Purpose:** Validate component interactions and workflows
**Runtime:** ~5 minutes
**Prerequisites:** Redis running

Tests:
- **test-cfn-loop-cli-command.sh**: CLI mode slash command execution
- **test-cfn-loop-execution.sh**: Loop execution workflow
- **test-cfn-loop-task-command.sh**: Task mode slash command execution
- **test-coordinator-spawning.sh**: Coordinator spawning mechanism
- **test-orchestrator-workflow.sh**: Orchestrator workflow patterns
- **test-redis-coordination.sh**: Redis coordination protocols
- **test-task-mode-detection.sh**: Task mode detection logic

#### E2E Tests (core/e2e/)
**Purpose:** End-to-end validation with real production code paths
**Runtime:** ~15 minutes
**Prerequisites:** Redis, Docker, NPX

Tests:
- **test-cfn-loop-cli-real-execution.sh**: PRIMARY E2E - Real coordinator spawn, orchestrator execution, Loop 3 agents, Loop 2 validators, Product Owner decision (BUG #21 & #22 validation)
- **test-cfn-loop-e2e-integration.sh**: Integration E2E test
- **test-cfn-loop-full-cycle.sh**: Full cycle validation
- **test-success-criteria-e2e.sh**: Success criteria validation

#### Archive Tests (archive/)
**Purpose:** Obsolete or redundant tests kept for historical reference
**Status:** Not run by default

Tests:
- **test_cli_mode.sh**: Simple mode detection (superseded)
- **test_mode_detection.sh**: Mode detection (superseded)
- **test_mode_simple.sh**: Simple mode test (superseded)
- **test-cli-mode-fixes.sh**: Old bug fixes (pre-BUG #22)
- **test-mode-detection-anti023.sh**: Specific bug fix (resolved)

### Docker Mode Tests

#### Unit Tests (unit/)
**Purpose:** Validate Docker-specific components
**Runtime:** ~2 minutes
**Prerequisites:** Docker

Tests:
- **test-spawn-command-syntax.sh**: Validates spawn-agent.sh uses correct npx syntax (BUG #21 unit test)

#### Integration Tests (integration/)
**Purpose:** Validate Docker integration with CFN Loop
**Runtime:** ~10 minutes
**Prerequisites:** Docker, Redis, CFN agent image

Tests:
- **docker-cfn-loop-hello-world-e2e.sh**: Hello World CFN Loop E2E
- **test-hello-world-cfn-loop-full.sh**: Full Hello World validation
- **test-logging-verification-team.sh**: Logging verification
- **test-real-agent-spawning.sh**: Real agent spawning validation (BUG #21 integration test)
- **test-tdd-violation-gate-failure.sh**: TDD gate failure validation

#### Core Tests (core/)
**Purpose:** Critical Docker CFN Loop functionality
**Runtime:** ~30 minutes
**Prerequisites:** Docker, Redis, docker-compose, CFN agent image

Major test suites:
- **Agent Lifecycle**: agent-lifecycle-tests.sh
- **CFN Loop Compliance**: cfn-loop-compliance-tests.sh
- **Coordinator Tests**: coordinator-*.sh (9 tests)
- **Orchestrator Workflow**: orchestrator-workflow-tests.sh
- **Redis Coordination**: redis-coordination-tests.sh
- **TDD Compliance**: tdd-compliance-tests.sh
- **Hello World Parity**: docker-hello-world-parity-tests.sh

#### Archive Tests (archive/)
**Purpose:** Experimental or bug-specific tests
**Status:** Not run by default

Directories:
- **b10-typescript-fix/**: Bug #10 specific tests (already fixed)
- **50-agent-parallel/**: Experimental parallel agent testing

## Test Runners

### CLI Mode Runner (`tests/cli-mode/run-all-tests.sh`)

**Usage:**
```bash
tests/cli-mode/run-all-tests.sh [MODE]

Modes:
  --quick         Unit tests only (~1 min)
  --integration   Unit + Integration (~5 min)
  --full          All tests including E2E (~15 min) [default]
  --help          Show help
```

**Features:**
- Automatic prerequisite checking (Redis, Docker, NPX)
- Color-coded output (green=pass, red=fail, yellow=warning)
- Detailed test output with summaries
- Exit code 0 = all pass, 1 = any fail
- Test output saved to /tmp/test-output-*.log

### Docker Mode Runner (`tests/docker/run-all-tests.sh`)

**Usage:**
```bash
tests/docker/run-all-tests.sh [MODE]

Modes:
  --quick         Unit tests only (~2 min)
  --integration   Unit + Integration (~10 min)
  --full          All tests including Core (~30 min) [default]
  --help          Show help
```

**Features:**
- Automatic prerequisite checking (Redis, Docker, docker-compose, NPX)
- Auto-start Redis if not running
- Color-coded output
- Automatic Docker resource cleanup on exit
- Test output saved to /tmp/test-output-*.log

## Test Naming Conventions

- **test-*.sh**: Test files (executable)
- **README*.md**: Test documentation
- **TEST_*.md**: Test planning/results documentation

## Integration with CI/CD

### Quick Validation (Pre-commit)
```bash
tests/cli-mode/run-all-tests.sh --quick
tests/docker/run-all-tests.sh --quick
```

### Full Validation (PR/CI)
```bash
tests/cli-mode/run-all-tests.sh --integration
tests/docker/run-all-tests.sh --integration
```

### Comprehensive Validation (Release)
```bash
tests/cli-mode/run-all-tests.sh --full
tests/docker/run-all-tests.sh --full
```

## Bug Tracking in Tests

### BUG #21: Agent Spawning Mechanism
**Issue:** Tests passed 100% while production failed 100%
**Root Cause:** Tests used alpine image with inline scripts, production used cfn-agent image with spawn-agent.sh
**Prevention Tests:**
- Unit: `tests/docker/unit/test-spawn-command-syntax.sh`
- Integration: `tests/docker/integration/test-real-agent-spawning.sh`
- E2E: `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`

### BUG #22: Empty Parameter Handling
**Issue:** Coordinator received empty parameters causing orchestration failures
**Root Cause:** orchestrate-wrapper.sh parameter validation issues
**Prevention Tests:**
- Unit: `tests/cli-mode/core/unit/test-command-parameter-validation.sh`
- E2E: `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`

## Test Coverage Metrics

### CLI Mode
- Unit Tests: 4 tests (component validation)
- Integration Tests: 7 tests (workflow validation)
- E2E Tests: 4 tests (end-to-end validation)
- **Total: 15 core tests** + 5 archived

### Docker Mode
- Unit Tests: 1 test (syntax validation)
- Integration Tests: 7 tests (E2E validation)
- Core Tests: 40 tests (critical functionality)
- **Total: 48 core tests** + archived experiments

## Best Practices

### Writing New Tests
1. Follow template in `tests/CLAUDE.md`
2. Use `PROJECT_ROOT=$(git rev-parse --show-toplevel)`
3. Source `$PROJECT_ROOT/tests/test-utils.sh`
4. Implement cleanup trap
5. Use GIVEN/WHEN/THEN comments
6. Place in appropriate directory:
   - Unit: Component validation, no external services
   - Integration: Component interaction, requires services
   - E2E/Core: Full workflow, production code paths

### Test Maintenance
- Archive obsolete tests (don't delete)
- Update documentation when adding tests
- Run full suite before major releases
- Keep test runtime reasonable (<30 min for full suite)

## Troubleshooting

### Common Issues

**Test runner fails with "required file not found":**
```bash
# Fix line endings
dos2unix tests/cli-mode/run-all-tests.sh
# or
sed -i 's/\r$//' tests/cli-mode/run-all-tests.sh
```

**Redis not running:**
```bash
redis-server --daemonize yes
```

**Docker daemon not running:**
```bash
sudo systemctl start docker
```

**CFN agent image not found:**
```bash
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.agent --tag cfn-agent:latest
```

## References

- Test Standards: `tests/CLAUDE.md`
- CLI Mode Tests: `tests/cli-mode/README.md`
- Docker Tests: `tests/docker/TEST_SUITE_README.md`
- Production Testing: `docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md`
