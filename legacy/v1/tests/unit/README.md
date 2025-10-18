# Unit Tests - Configuration Validation

## Sprint 1.3: Configuration Management Testing

This directory contains unit tests for the CLI Coordination V2 configuration system.

## Test Files

### config.test.sh
Comprehensive test suite for configuration validation, covering:
- Default values verification
- Environment variable overrides
- Invalid configuration detection
- 100-agent swarm configuration defaults

## Running Tests

### Run Configuration Tests
```bash
bash tests/unit/config.test.sh
```

### Expected Output
```
============================================================
Configuration Validation Test Suite - Sprint 1.3
============================================================
Total Tests: 17
Passed: 17
Failed: 0

✓ ALL TESTS PASSED

CONFIDENCE REPORT: 1.00
```

## Test Coverage

### Default Values (2 tests)
- `test_default_values`: Validates all default configuration values
- `test_default_base_dir`: Validates default base directory path

### Environment Overrides (3 tests)
- `test_environment_overrides`: Validates environment variable override functionality
- `test_environment_override_base_dir`: Validates base directory override
- `test_environment_override_preserves_unset`: Validates partial overrides preserve defaults

### Invalid Configuration Detection (8 tests)
- `test_invalid_config_detection`: Validates rejection of CFN_MAX_AGENTS > 1000
- `test_invalid_max_agents_negative`: Validates rejection of negative values
- `test_invalid_max_agents_zero`: Validates rejection of zero value
- `test_invalid_max_agents_non_numeric`: Validates rejection of non-numeric values
- `test_invalid_topology`: Validates rejection of invalid topology names
- `test_invalid_log_level`: Validates rejection of invalid log levels
- `test_invalid_liveness_threshold`: Validates liveness threshold validation
- `test_invalid_max_inbox_size`: Validates minimum inbox size enforcement

### 100-Agent Configuration (4 tests)
- `test_100_agent_defaults`: Validates defaults support 100 agents
- `test_100_agent_validation_passes`: Validates 100-agent configuration passes validation
- `test_load_config_creates_base_dir`: Validates directory creation
- `test_valid_topologies`: Validates all supported topology types

## Configuration File

The tests validate: `/mnt/c/Users/masha/Documents/claude-flow-novice/src/coordination/v2/coordination-config.sh`

## Test Results

All 17 tests pass with 100% confidence score.

**Coverage:**
- Default values: 100%
- Environment overrides: 100%
- Invalid config detection: 100%
- 100-agent defaults: 100%

**Blockers:** None
