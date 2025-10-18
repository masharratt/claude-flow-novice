# CFN Loop Validation Skill

## Overview
A comprehensive validation system for CloudFormation loops with mode-dependent thresholds, auto-retry capabilities, and SQLite integration.

## Features

### Mode-Dependent Thresholds
- **MVP Mode**: Basic validation with minimum requirements
- **Standard Mode**: Balanced validation with moderate thresholds
- **Enterprise Mode**: Comprehensive validation with strict thresholds

### Auto-Retry Mechanism
- Automatic retry until consensus is reached
- Configurable retry limits and backoff strategies
- Score aggregation and validation logic

### SQLite Integration
- Persistent storage for validation results
- Evidence chain tracking
- Performance metrics storage

### Automatic Validator Spawning
- Dynamic validator creation based on workload
- Load balancing across validators
- Resource optimization

## Architecture

### Core Components
1. **Consensus Calculator** - Aggregates validator scores
2. **Evidence Chain** - SQLite schema for validation tracking
3. **Validation Engine** - Core validation logic with retry mechanism
4. **Mode Manager** - Handles mode-specific threshold configuration

## Configuration

### Mode Thresholds

| Mode | Minimum Validators | Consensus Threshold | Max Retries | Timeout (ms) |
|------|-------------------|-------------------|-------------|-------------|
| MVP  | 3                 | 0.7               | 5           | 30000       |
| Standard | 5             | 0.8               | 8           | 45000       |
| Enterprise | 8          | 0.9               | 12          | 60000       |

### Auto-Rtry Configuration
- Exponential backoff: base_delay * (2^attempt)
- Max delay cap: 5000ms
- Jitter: ±10% to avoid thundering herd

## Performance Targets

### Code Quality Metrics
- Test Coverage: 100%
- Code Complexity: < 10 (cyclomatic complexity)
- Maintainability Score: > 80%
- Technical Debt: Low

### Performance Metrics
- Validation Time: < 1s (average)
- Memory Usage: < 100MB
- CPU Utilization: < 50%
- Throughput: > 100 validations/minute

## Security Considerations
- Input validation and sanitization
- SQL injection protection
- Rate limiting
- Audit logging

## Monitoring and Observability
- Validation success/failure rates
- Performance metrics tracking
- Error categorization
- Resource utilization monitoring