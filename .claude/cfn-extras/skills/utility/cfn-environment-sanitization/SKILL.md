# CFN Environment Sanitization Skill

## Purpose

Automatically sanitizes environment variables and enforces resource limits to prevent memory leaks in CFN Loop orchestration workflows. This is a critical component of the ANTI-023 memory leak protection system.

## Core Functions

### Environment Sanitization
- Removes or redacts sensitive environment variables
- Enforces memory limits for Node.js processes
- Sets CFN-specific configuration limits
- Preserves critical coordination variables

### Resource Limit Enforcement
- Node.js heap size: 2GB max
- Maximum agents: 10 concurrent
- Operation timeout: 600 seconds
- Memory limits: 2GB per process

### Sensitive Data Protection
- Detects and redacts passwords, secrets, tokens
- Validates environment for exposed credentials
- Prevents sensitive data leakage in logs

## Usage Patterns

### Integration in Orchestration Scripts
```bash
#!/usr/bin/env bash

# Load sanitization at script start
source "$(dirname "$0")/../cfn-environment-sanitization/sanitize-environment.sh"

# Rest of orchestration logic...
```

### Standalone Validation
```bash
# Check current environment state
./cfn-environment-sanitization/sanitize-environment.sh check

# Apply strict sanitization
./cfn-environment-sanitization/sanitize-environment.sh --strict
```

### CFN Loop Integration Points
- **Orchestration Scripts**: Apply before agent spawning
- **Agent Spawning**: Enforce limits during process creation
- **Validation Scripts**: Check environment before operations
- **Cleanup Scripts**: Sanitize before process exit

## Configuration

### Environment Variables
- `CFN_MAX_AGENTS`: Maximum concurrent agents (default: 10)
- `CFN_TIMEOUT`: Operation timeout in seconds (default: 600)
- `CFN_MEMORY_LIMIT`: Memory limit per process (default: 2GB)
- `CFN_MODE`: Execution mode preservation
- `NODE_OPTIONS`: Node.js runtime options with memory limits

### Sanitization Rules
The script uses a rule-based system for variable handling:
- `sanitize`: Remove the variable
- `sanitize_if_sensitive`: Remove if contains sensitive data
- `preserve`: Keep the variable unchanged
- `enforce_*`: Set to specific limit value

## Safety Features

### Strict Mode
When enabled (`--strict` flag):
- Validates required CLI mode variables
- Enforces additional security checks
- Prevents execution without proper configuration

### Environment Validation
- Detects sensitive data exposure
- Validates memory limit configuration
- Checks CFN coordination variables

### Automatic Protection
- Applies sanitization automatically when sourced
- Preserves critical coordination variables
- Enforces limits without manual configuration

## Integration Requirements

### Prerequisites
- Bash 4.0+ for associative arrays
- Standard Unix tools (grep, cut, sed)
- Node.js environment for memory limits

### Dependencies
- CFN Mode Detection skill for coordination
- CFN Redis Coordination for state management
- CFN Agent Spawning for process creation

## Usage Examples

### Orchestration Script Integration
```bash
#!/usr/bin/env bash

# Load environment sanitization
source "$(dirname "$0")/../cfn-environment-sanitization/sanitize-environment.sh"

# Now safe to proceed with orchestration
echo "Environment sanitized, starting orchestration..."
```

### Agent Spawning with Limits
```bash
#!/usr/bin/env bash

# Ensure sanitized environment
source "./cfn-environment-sanitization/sanitize-environment.sh" --strict

# Spawn agent with enforced limits
npx claude-flow-novice agent "$AGENT_TYPE" \
    --max-memory "$CFN_MEMORY_LIMIT" \
    --timeout "$CFN_TIMEOUT"
```

### Environment Validation
```bash
# Pre-execution validation
if ! ./cfn-environment-sanitization/sanitize-environment.sh check; then
    echo "Environment validation failed" >&2
    exit 1
fi
```

## Testing

### Unit Tests
```bash
# Test sanitization rules
./tests/test-environment-sanitization.sh

# Test sensitive data detection
./tests/test-sensitive-data-redaction.sh

# Test memory limit enforcement
./tests/test-memory-limits.sh
```

### Integration Tests
```bash
# Test with orchestration script
./tests/test-orchestration-integration.sh

# Test with agent spawning
./tests/test-agent-spawning-integration.sh
```

## Troubleshooting

### Common Issues
1. **Missing required variables**: Use strict mode to validate
2. **Memory limits not applied**: Check Node.js options
3. **Sensitive data leakage**: Run environment check
4. **Agent spawning failures**: Verify resource limits

### Debug Mode
```bash
# Enable debug output
export CFN_DEBUG=1
./sanitize-environment.sh --strict
```

## Monitoring and Telemetry

### Metrics Collected
- Environment sanitization changes
- Resource limit violations
- Sensitive data detections
- Memory usage patterns

### Log Integration
- Structured logging with severity levels
- Integration with CFN logging system
- Audit trail for security compliance

## Security Considerations

### Data Protection
- Automatic redaction of sensitive data
- Prevention of credential exposure
- Secure environment variable handling

### Resource Protection
- Memory limit enforcement prevents OOM
- Timeout protection prevents hanging
- Agent count limits prevent resource exhaustion

### Compliance
- Audit logging for security reviews
- Environment state validation
- Secure by default configuration