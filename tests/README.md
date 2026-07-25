# Claude Flow Novice Test Suite

Comprehensive test suite for CLI and Docker mode execution.

## Quick Reference

| Test Suite | Command | Tests Run | Duration | When to Use |
|------------|---------|-----------|----------|-------------|
| **CLI Quick** | `tests/cli-mode/run-all-tests.sh --quick` | 4 unit tests | ~1 min | Pre-commit, fast validation |
| **CLI Integration** | `tests/cli-mode/run-all-tests.sh --integration` | 10 tests (unit + integration) | ~5 min | PR validation |
| **CLI Full** | `tests/cli-mode/run-all-tests.sh --full` | 12 tests (all core) | ~15 min | Release validation |
| **Docker Quick** | `tests/docker/run-all-tests.sh --quick` | Critical integration | ~2 min | Pre-commit, fast validation |
| **Docker Integration** | `tests/docker/run-all-tests.sh --integration` | All integration | ~10 min | PR validation |
| **Docker Full** | `tests/docker/run-all-tests.sh --full` | 17 core tests | ~30 min | Release validation |

**Note:** Test runners automatically exclude legacy/ tests (historical reference only).

## Quick Start

```bash
# CLI Mode Tests (from project root)
tests/cli-mode/run-all-tests.sh --quick         # Fast validation (~1 min)
tests/cli-mode/run-all-tests.sh --integration   # Pre-commit (~5 min)
tests/cli-mode/run-all-tests.sh --full          # Full suite (~15 min)

# Docker Mode Tests (from project root)
tests/docker/run-all-tests.sh --quick           # Fast validation (~2 min)
tests/docker/run-all-tests.sh --integration     # Pre-commit (~10 min)
tests/docker/run-all-tests.sh --full            # Full suite (~30 min)
```

## Test Organization

### CLI Mode (12 core tests + 3 legacy)
```
tests/cli-mode/
├── core/
│   ├── unit/            4 tests - Parameter validation, tool access, thresholds
│   ├── integration/     6 tests - Coordinator spawning, orchestrator workflow
│   ├── e2e/             2 tests - TRUE E2E with real production scripts
│   └── legacy/          3 tests - Superseded by TRUE E2E (historical reference)
├── archive/             5 tests - Obsolete/redundant
└── run-all-tests.sh     Comprehensive test runner (excludes legacy/)
```

**Run Commands:**
```bash
tests/cli-mode/run-all-tests.sh --quick       # Unit tests only (~1 min)
tests/cli-mode/run-all-tests.sh --integration # Unit + Integration (~5 min)
tests/cli-mode/run-all-tests.sh --full        # All tests including E2E (~15 min)
```

### Docker Mode (17 core tests + 14 legacy)
```
tests/docker/
├── core/
│   ├── 17 tests         Agent lifecycle, coordinators, wave orchestration
│   └── legacy/          14 tests - Bug-specific validation (historical)
├── integration/         5 tests - Integration validation
├── unit/                1 test  - Syntax validation
├── archive/             Experimental/obsolete tests
└── run-all-tests.sh     Comprehensive test runner (excludes legacy/)
```

**Run Commands:**
```bash
tests/docker/run-all-tests.sh --quick         # Critical integration (~2 min)
tests/docker/run-all-tests.sh --integration   # All integration tests (~10 min)
tests/docker/run-all-tests.sh --full          # Full suite with E2E (~30 min)
```

### Unit Tests (TypeScript/JavaScript)
```
tests/unit/
├── agent-spawner/       Agent spawning and output validation
├── auth/                Authentication system tests
├── backup/              Backup manager tests
├── cache/               Cache and correlation tests
├── cfn-loop/            CFN Loop orchestration
├── cli/                 CLI formatting and tools
├── config/              Configuration management
├── coordination/        Coordination wrapper
├── database/            Database services
├── lock/                Distributed and file locking
├── metrics/             Metrics logging
├── security/            Command injection and security
├── typescript/          TypeScript E2E documentation
└── [15+ other domains]  Organized by domain
```

**Run Commands:**
```bash
npm test                           # All unit tests
npm test -- agent-spawner          # Specific domain
npm test -- --coverage             # With coverage
```

### Archive Structure
```
tests/archive/
├── historical/          Deprecated tests (8 shell scripts + docs)
│   ├── cli-mode-comprehensive-test.sh → Use cli-mode/run-all-tests.sh --full
│   ├── cli-mode-quick-validation.sh → Use cli-mode/run-all-tests.sh --quick
│   └── [Other deprecated tests]
└── experimental/        POC and research (59 files across 7 features)
    ├── api-gateway/     API Gateway integration (on hold)
    ├── hello-world/     Multi-layer coordination experiments
    ├── cfn-loop/        CFN Loop variant implementations
    ├── ace/             Agent Capability Expression experiments
    ├── tdd-compliance/  TDD enforcement experiments
    ├── playbooks/       Workflow codification research
    └── workflows/       Event-driven workflow experiments
```

**Legacy Tests:**
- Not included in test runners by default
- Preserved for historical reference and regression debugging
- See `tests/cli-mode/core/legacy/README.md` and `tests/docker/core/legacy/README.md`
- See `tests/archive/historical/README.md` for deprecated test reference
- See `tests/archive/experimental/README.md` for POC status

## Test Categories

### Unit Tests
- **Purpose**: Component validation
- **Runtime**: 1-2 minutes
- **Prerequisites**: None
- **Examples**: Parameter validation, syntax checking, path resolution

### Integration Tests
- **Purpose**: Component interaction
- **Runtime**: 5-10 minutes
- **Prerequisites**: Redis, Docker
- **Examples**: Coordinator spawning, Redis coordination, workflow execution

### E2E/Core Tests
- **Purpose**: End-to-end validation with production code paths
- **Runtime**: 15-30 minutes
- **Prerequisites**: Redis, Docker, NPX, CFN agent image
- **Examples**: Full CFN Loop execution, agent spawning, deliverable validation

## Bug Tracking

### BUG #21: Agent Spawning Mechanism
**Tests:**
- Unit: `tests/docker/unit/test-spawn-command-syntax.sh`
- Integration: `tests/docker/integration/test-real-agent-spawning.sh`
- E2E: `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`

### BUG #22: Empty Parameter Handling
**Tests:**
- Unit: `tests/cli-mode/core/unit/test-command-parameter-validation.sh`
- E2E: `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`

## Prerequisites

### Required
- Docker daemon running
- Redis running (or redis-server available)
- NPX available
- Git repository (for PROJECT_ROOT)

### Optional
- docker-compose (for Docker mode tests)
- CFN agent image (built automatically if needed)

## Documentation

### Core Documentation
- **Core Test Summary**: `tests/CORE_TEST_SUMMARY.md` - **START HERE** - Post-reorganization summary
- **Comprehensive Guide**: `tests/TEST_ORGANIZATION.md` - Complete test organization, categories, and usage
- **Test Standards**: `tests/CLAUDE.md` - Test authoring standards and boilerplate (includes BUG #21 lesson)

### Mode-Specific Documentation
- **CLI Mode Tests**: `tests/cli-mode/README*.md` - CLI-specific documentation
- **CLI Legacy Tests**: `tests/cli-mode/core/legacy/README.md` - Historical CLI test reference
- **Docker Tests**: `tests/docker/TEST_SUITE_README.md` - Docker-specific documentation
- **Docker Legacy Tests**: `tests/docker/core/legacy/README.md` - Historical Docker test reference

### Bug Documentation
- **BUG #21**: `docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md` - Production testing requirements
- **BUG #22**: `docs/BUG_CLI_MODE_COORDINATOR_EMPTY_PARAMS.md` - Empty parameter handling

## CI/CD Integration

### Pre-commit Hooks
```bash
tests/cli-mode/run-all-tests.sh --quick
tests/docker/run-all-tests.sh --quick
```

### Pull Request Validation
```bash
tests/cli-mode/run-all-tests.sh --integration
tests/docker/run-all-tests.sh --integration
```

### Release Validation
```bash
tests/cli-mode/run-all-tests.sh --full
tests/docker/run-all-tests.sh --full
```

## Troubleshooting

### Line Ending Issues
```bash
dos2unix tests/cli-mode/run-all-tests.sh
dos2unix tests/docker/run-all-tests.sh
# or
sed -i 's/\r$//' tests/cli-mode/run-all-tests.sh
sed -i 's/\r$//' tests/docker/run-all-tests.sh
```

### Redis Not Running
```bash
redis-server --daemonize yes
```

### Docker Not Running
```bash
sudo systemctl start docker
```

### CFN Agent Image Missing
```bash
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.agent \
  --tag cfn-agent:latest
```

## Contributing

When adding new tests:
1. Follow standards in `tests/CLAUDE.md`
2. Place in appropriate directory (unit/integration/e2e)
3. Update relevant documentation
4. Test with runner scripts before committing
5. Archive obsolete tests (don't delete)

## Support

For detailed information, see:
- `tests/TEST_ORGANIZATION.md` - Complete organization guide
- `tests/CLAUDE.md` - Test authoring standards
- `docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md` - Production testing requirements