# CFN Loop North Star Test Suite

**Purpose**: Comprehensive component testing for CFN Loop methodology with full coverage of agent spawning, file operations, Redis coordination, prompt injection, and handoff points.

## Test Architecture

This test suite provides rapid validation of individual CFN Loop components and end-to-end workflows. Each test focuses on specific functionality while maintaining the ability to run complete integration tests.

## Test Categories

### 1. Agent Spawning Tests (`01-agent-spawning/`)
- **CLI Command Execution**: Validates `/cfn-loop-cli` and `/cfn-loop-task` commands
- **Process Lifecycle**: Tests agent startup, execution, and cleanup
- **Environment Injection**: Validates context passing and environment variables
- **Error Handling**: Tests failed spawns and recovery mechanisms

### 2. File System Tests (`02-file-operations/`)
- **Workspace Persistence**: Tests iterative file creation and modification
- **Volume Mounting**: Validates Docker volume access and permissions
- **File Context Passing**: Tests how iterations build on previous work
- **Cleanup Operations**: Validates proper file cleanup and rollback

### 3. Redis Coordination Tests (`03-redis-coordination/`)
- **Message Queuing**: Tests task distribution and completion signaling
- **Blocking Operations**: Validates BLPOP and coordination patterns
- **Data Persistence**: Tests iteration state and result storage
- **Connection Management**: Tests Redis connectivity and recovery

### 4. Prompt Injection Tests (`04-prompt-injection/`)
- **Context Building**: Tests broadcast message injection
- **Agent Communication**: Validates inter-agent context passing
- **Template Processing**: Tests prompt template rendering
- **Memory Management**: Tests context size and optimization

### 5. Handoff Point Tests (`05-handoff-points/`)
- **Loop 3 → Loop 2**: Tests gate passing and validator spawning
- **Loop 2 → Product Owner**: Tests consensus collection and decision making
- **Decision Execution**: Tests PROCEED/ITERATE/ABORT workflows
- **Signal Propagation**: Tests coordination signal reliability

### 6. Integration Tests (`06-integration/`)
- **End-to-End Workflows**: Tests complete CFN Loop execution
- **Mode Validation**: Tests MVP/Standard/Enterprise mode differences
- **Performance Benchmarks**: Tests iteration timing and resource usage
- **Error Recovery**: Tests failure scenarios and recovery mechanisms

### 7. Performance Tests (`07-performance/`)
- **Load Testing**: Tests multiple concurrent CFN Loops
- **Memory Profiling**: Tests agent memory usage and cleanup
- **Resource Limits**: Tests container resource constraints
- **Scaling Analysis**: Tests performance with iteration count

### 8. Error Recovery Tests (`08-error-recovery/`)
- **Agent Failures**: Tests stuck agent detection and recovery
- **Network Issues**: Tests Redis connectivity failures
- **File System Errors**: Tests permission and disk space issues
- **Graceful Degradation**: tests partial failure scenarios

## Running Tests

### Individual Test Categories
```bash
# Run all agent spawning tests
./01-agent-spawning/run-all.sh

# Run all file operations tests
./02-file-operations/run-all.sh

# Run Redis coordination tests
./03-redis-coordination/run-all.sh
```

### Complete Test Suite
```bash
# Run all North Star tests
./run-all-tests.sh

# Run with coverage
./run-all-tests.sh --coverage

# Run with performance profiling
./run-all-tests.sh --profile
```

### Quick Validation
```bash
# Run critical tests only (< 2 minutes)
./run-critical-tests.sh

# Run smoke tests
./run-smoke-tests.sh
```

## Test Results

Test results are stored in:
- **Artifacts**: `.artifacts/north-star/`
- **Coverage**: `.artifacts/coverage/north-star/`
- **Performance**: `.artifacts/performance/north-star/`
- **Logs**: `.artifacts/logs/north-star/`

## Integration with CI/CD

This test suite integrates with the main CI/CD pipeline:
- Runs on every push to main branches
- Required for pull request validation
- Performance regression detection
- Security vulnerability scanning

## Test Data Management

Test data and fixtures are managed in:
- **Fixtures**: `fixtures/` - Reusable test data
- **Temp**: `/tmp/north-star-tests/` - Ephemeral test data
- **Mocks**: `mocks/` - Mocked external dependencies

## Troubleshooting

### Common Issues
- **Redis not running**: `redis-server --daemonize yes`
- **Docker permission issues**: `sudo usermod -aG docker $USER`
- **Port conflicts**: `./cleanup/ports.sh`

### Debug Mode
```bash
# Enable verbose logging
DEBUG=true ./run-all-tests.sh

# Enable step-by-step execution
STEP=true ./01-agent-spawning/test-cli-commands.sh
```

## Test Standards

All tests follow the standards documented in `../CLAUDE.md`:
- Use `set -euo pipefail` for strict error handling
- Implement proper cleanup with `trap` commands
- Use GIVEN/WHEN/THEN structure for clarity
- Validate both positive and negative scenarios
- Include performance assertions where applicable

## Contributing

When adding new tests:
1. Follow existing naming conventions
2. Use standard test utilities from `../test-utils.sh`
3. Include both success and failure scenarios
4. Document test purpose and dependencies
5. Update this README with new test categories

## Dependencies

- **Docker**: Container orchestration
- **Redis**: Coordination and messaging
- **Node.js**: Test execution and utilities
- **Bash**: Test scripting framework
- **Claude Flow Novice**: Agent spawning system