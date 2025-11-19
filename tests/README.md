# Claude Flow Novice Test Suite

Comprehensive test suite for CLI and Docker mode execution.

## Quick Start

```bash
# CLI Mode Tests
cd tests/cli-mode
./run-all-tests.sh --quick         # Fast validation (~1 min)
./run-all-tests.sh --integration   # Pre-commit (~5 min)
./run-all-tests.sh --full          # Full suite (~15 min)

# Docker Mode Tests
cd tests/docker
./run-all-tests.sh --quick         # Fast validation (~2 min)
./run-all-tests.sh --integration   # Pre-commit (~10 min)
./run-all-tests.sh --full          # Full suite (~30 min)
```

## Test Organization

### CLI Mode (20 tests total)
```
tests/cli-mode/
├── core/
│   ├── unit/         4 tests - Component validation
│   ├── integration/  7 tests - Workflow validation
│   └── e2e/          4 tests - End-to-end validation
├── archive/          5 tests - Obsolete/redundant
└── run-all-tests.sh  Comprehensive test runner
```

### Docker Mode (98 tests total)
```
tests/docker/
├── core/            31 tests - Critical functionality
├── integration/      5 tests - Integration validation
├── unit/             1 test  - Syntax validation
├── archive/          Experimental/obsolete tests
└── run-all-tests.sh  Comprehensive test runner
```

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

- **Comprehensive Guide**: `tests/TEST_ORGANIZATION.md` - Complete test organization, categories, and usage
- **Test Standards**: `tests/CLAUDE.md` - Test authoring standards and boilerplate
- **CLI Mode Tests**: `tests/cli-mode/README*.md` - CLI-specific documentation
- **Docker Tests**: `tests/docker/TEST_SUITE_README.md` - Docker-specific documentation

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