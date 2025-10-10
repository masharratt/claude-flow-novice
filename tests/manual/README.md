# Manual Test Scripts

This directory contains manual test scripts for development and debugging purposes. These scripts are designed for interactive testing, validation, and experimentation during development.

## Purpose

Manual tests are NOT part of the automated test suite (use `npm test` for automated tests). These scripts are intended for:

- Development and debugging workflows
- Interactive testing of swarm coordination
- Performance benchmarking and profiling
- WASM module validation
- Integration validation with external systems
- Manual regression testing
- Experimental feature validation

## Script Categories

### Swarm Tests
Scripts for testing swarm coordination, agent spawning, and multi-agent workflows:
- Swarm initialization and execution
- Redis pub/sub coordination validation
- Agent lifecycle management
- Recovery and persistence testing

### WASM Tests
Scripts for validating WebAssembly acceleration modules:
- Drop trait validation for memory management
- Performance benchmarking (52x acceleration)
- AST parsing optimization validation
- Pattern matching acceleration tests

### Performance Tests
Scripts for measuring and validating system performance:
- Throughput testing
- Latency measurements
- Resource utilization profiling
- Scalability validation

### Validation Tests
Scripts for validating system behaviors and compliance:
- Memory safety validation
- Event bus coordination testing
- Configuration validation
- Integration point testing

## Running Manual Tests

Manual test scripts should be executed directly with Node.js:

```bash
# Example: Run swarm test
node tests/manual/test-swarm-direct.mjs

# Example: Run WASM validation test
node tests/manual/test-drop-validation.mjs

# Example: Run with specific parameters
node tests/manual/test-swarm-direct.mjs "Test objective" --max-agents 5
```

## Best Practices

1. **Cleanup**: Always cleanup resources after manual testing (kill processes, clear Redis state if needed)
2. **Isolation**: Run manual tests in isolated environments to avoid conflicts with development work
3. **Documentation**: Document test results and observations for future reference
4. **Logging**: Enable verbose logging for debugging purposes
5. **Resource Management**: Monitor resource usage during performance tests

## Integration with Automated Tests

Manual tests can inform automated test development:
- Identify edge cases for unit tests
- Validate integration scenarios
- Benchmark performance targets
- Verify system behaviors under load

## Common Manual Test Workflows

### Testing Swarm Coordination
```bash
# Initialize and execute a test swarm
node tests/manual/test-swarm-direct.mjs "Build REST API" --executor --max-agents 3

# Monitor Redis coordination
redis-cli keys "swarm:*"
redis-cli get "swarm:test_swarm_id"
```

### Testing WASM Acceleration
```bash
# Validate Drop trait implementation
node tests/manual/test-drop-validation.mjs

# Benchmark WASM performance
node tests/manual/test-wasm-performance.mjs --iterations 1000
```

### Testing Event Bus
```bash
# Publish test events
node tests/manual/test-event-bus.mjs --publish --type "test.event"

# Subscribe to test patterns
node tests/manual/test-event-bus.mjs --subscribe --pattern "test.*"
```

## Cleanup Commands

```bash
# Kill hanging test processes
pkill -f vitest
pkill -f "npm test"

# Clear Redis test data (development only)
redis-cli --scan --pattern "test:*" | xargs redis-cli del

# Clean test artifacts
npm run clean:test
```

## Contributing

When adding new manual test scripts:
1. Use clear, descriptive filenames (e.g., `test-feature-name.mjs`)
2. Add usage documentation in script comments
3. Include cleanup instructions
4. Update this README with script description
5. Ensure scripts use absolute paths for cross-platform compatibility

## See Also

- `/tests/integration/` - Automated integration tests
- `/tests/hello-world/` - Hello world examples and basic tests
- `npm test` - Run automated test suite
- `/config/hooks/post-edit-pipeline.js` - Post-edit validation hook
