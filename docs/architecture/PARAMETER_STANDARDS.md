# CFN Loop Orchestrator Parameter Standards

## Overview

This document defines the standardized parameter formats for the CFN Loop orchestrator to ensure consistency across all invocations and reduce configuration errors.

## Parameter Categories

### Required Parameters

These parameters must be provided for every orchestrator invocation.

#### `--task-id`
**Format**: Alphanumeric string with hyphens and underscores  
**Length**: 3-100 characters  
**Pattern**: `^[a-zA-Z0-9_-]+$`  
**Example**: `auth-system-implementation-1234567890`

**Description**: Unique identifier for the CFN Loop execution task. Used for Redis key names and file organization.

**Valid Examples**:
```bash
--task-id "user-auth-feature-1234567890"
--task-id "phase2_component_development"
--task-id "security-audit-001"
```

**Invalid Examples**:
```bash
--task-id "task with spaces"          # Contains spaces
--task-id "task@with#symbols"         # Invalid symbols
--task-id ""                          # Empty string
```

#### `--mode`
**Format**: Enumeration string  
**Valid Values**: `mvp`, `standard`, `enterprise`  
**Default**: No default (required)  

**Description**: Determines validation thresholds and iteration limits.

**Valid Examples**:
```bash
--mode "standard"
--mode "enterprise"
--mode "mvp"
```

**Invalid Examples**:
```bash
--mode "custom"                       # Not in allowed values
--mode "STANDARD"                     # Case sensitive
```

#### `--loop3-agents`
**Format**: Comma-separated list of agent IDs  
**Pattern**: Each agent ID must match `^[a-zA-Z0-9_-]+$`  
**Minimum**: 1 agent  

**Description**: List of implementer agents for the primary execution loop.

**Valid Examples**:
```bash
--loop3-agents "backend-dev,frontend-dev,ui-designer"
--loop3-agents "security-specialist"
--loop3-agents "researcher,developer,tester"
```

**Invalid Examples**:
```bash
--loop3-agents ""                      # Empty list
--loop3-agents "agent with spaces"    # Invalid agent ID
--loop3-agents "agent1,,agent3"        # Empty agent ID
```

#### `--loop2-agents`
**Format**: Comma-separated list of agent IDs  
**Pattern**: Each agent ID must match `^[a-zA-Z0-9_-]+$`  
**Minimum**: 1 agent  

**Description**: List of validator agents for the consensus validation loop.

**Valid Examples**:
```bash
--loop2-agents "code-reviewer,tester,security-reviewer"
--loop2-agents "qa-specialist"
--loop2-agents "architect,reviewer"
```

#### `--product-owner`
**Format**: Single agent ID  
**Pattern**: Must match `^[a-zA-Z0-9_-]+$`  

**Description**: Product owner agent responsible for final decisions.

**Valid Examples**:
```bash
--product-owner "product-owner-1"
--product-owner "tech-lead"
--product-owner "project-manager"
```

### Optional Parameters

These parameters enhance functionality but have sensible defaults.

#### `--max-iterations`
**Format**: Positive integer  
**Range**: 1-20  
**Default**: 10 (determined by orchestrator)  

**Description**: Maximum number of CFN Loop iterations before forcing completion.

**Valid Examples**:
```bash
--max-iterations 5
--max-iterations 15
--max-iterations 20
```

**Invalid Examples**:
```bash
--max-iterations 0                     # Below minimum
--max-iterations 25                    # Above maximum
--max-iterations "not-a-number"        # Not numeric
```

#### `--min-quorum-loop3` and `--min-quorum-loop2`
**Format**: Number, percentage, or decimal  
**Number Range**: 1-20  
**Percentage Range**: 1%-100%  
**Decimal Range**: 0.01-1.0  
**Default**: 0.66 (66% = 2/3 majority)  

**Description**: Minimum quorum required for consensus in each loop.

**Valid Examples**:
```bash
# Absolute numbers
--min-quorum-loop3 3                   # Require exactly 3 agents
--min-quorum-loop2 2                   # Require exactly 2 agents

# Percentages
--min-quorum-loop3 85%                 # Require 85% of agents
--min-quorum-loop2 75%                 # Require 75% of agents

# Decimals
--min-quorum-loop3 0.75                # Require 75% of agents
--min-quorum-loop2 0.66                # Require 66% of agents
```

**Invalid Examples**:
```bash
--min-quorum-loop3 150%                # Percentage over 100%
--min-quorum-loop3 0.00                # Decimal below 0.01
--min-quorum-loop3 25                  # Number above 20
```

#### `--phase-id`
**Format**: Alphanumeric string with hyphens and underscores  
**Pattern**: `^[a-zA-Z0-9_-]+$`  

**Description**: Phase identifier for timeout configuration and tracking.

**Valid Examples**:
```bash
--phase-id "phase-1"
--phase-id "backend-implementation"
--phase-id "testing-phase"
```

#### JSON Context Parameters

All JSON parameters must be valid JSON strings and are optional.

##### `--epic-context`
**Format**: Valid JSON string  
**Purpose**: Epic-level goals and scope information  

**Valid Examples**:
```bash
--epic-context '{"epicGoal":"Implement user authentication","inScope":["JWT","OAuth2"],"outOfScope":["SSO","LDAP"]}'

--epic-context '{
  "epicGoal": "Build payment processing system",
  "inScope": ["Stripe integration", "Webhook handling"],
  "outOfScope": ["PayPal", "Crypto currencies"]
}'
```

##### `--phase-context`
**Format**: Valid JSON string  
**Purpose**: Phase-specific deliverables and requirements  

**Valid Examples**:
```bash
--phase-context '{"deliverables":["auth-service.ts","login.component.ts"],"directory":"src/auth"}'

--phase-context '{
  "deliverables": [
    "test-suite.js",
    "integration-test.sh",
    "coverage-report.html"
  ],
  "directory": "tests",
  "dependencies": ["mock-server", "test-data"]
}'
```

##### `--success-criteria`
**Format**: Valid JSON string  
**Purpose**: Acceptance criteria and quality gates  

**Valid Examples**:
```bash
--success-criteria '{"acceptanceCriteria":["All tests pass","Coverage >80%"],"gateThreshold":0.75}'

--success-criteria '{
  "acceptanceCriteria": [
    "API endpoints documented",
    "Security scan passes",
    "Performance benchmarks met"
  ],
  "gateThreshold": 0.90,
  "qualityMetrics": {
    "codeCoverage": 85,
    "performanceScore": 95
  }
}'
```

#### `--expected-files`
**Format**: Comma-separated list of file paths  
**Purpose**: Track expected deliverables for validation  

**Valid Examples**:
```bash
--expected-files "src/auth.service.ts,tests/auth.test.ts,docs/api.md"

--expected-files "package.json,README.md,.env.example"
```

## Integration Examples

### Basic Usage (Required Parameters Only)
```bash
./orchestrate-cfn-loop.sh \
  --task-id "user-auth-1234567890" \
  --mode "standard" \
  --loop3-agents "backend-dev,security-specialist" \
  --loop2-agents "code-reviewer,tester" \
  --product-owner "product-owner-1"
```

### Advanced Usage with All Parameters
```bash
./orchestrate-cfn-loop.sh \
  --task-id "payment-system-1234567890" \
  --mode "enterprise" \
  --loop3-agents "backend-dev,security-specialist,devops-engineer" \
  --loop2-agents "code-reviewer,security-reviewer,performance-reviewer,qa-specialist" \
  --product-owner "product-owner-1" \
  --max-iterations 15 \
  --min-quorum-loop3 85% \
  --min-quorum-loop2 0.90 \
  --phase-id "implementation-phase" \
  --epic-context '{"epicGoal":"Build payment processing system","inScope":["Stripe","webhooks"],"outOfScope":["PayPal"]}' \
  --phase-context '{"deliverables":["payment.service.ts","stripe.client.ts"],"directory":"src/payment"}' \
  --success-criteria '{"acceptanceCriteria":["Tests pass","Security audit","Coverage>90%"],"gateThreshold":0.85}' \
  --expected-files "src/payment.service.ts,src/stripe.client.ts,tests/payment.test.ts"
```

## Validation Integration

The parameter validation helper (`validate-parameters.sh`) can be integrated into orchestrator workflows:

### Pre-execution Validation
```bash
#!/bin/bash

# Validate parameters before orchestrator execution
./.claude/skills/redis-coordination/validate-parameters.sh "$@"
if [ $? -eq 0 ]; then
  echo "✅ Parameters validated, starting orchestrator..."
  ./orchestrate-cfn-loop.sh "$@"
else
  echo "❌ Parameter validation failed, aborting execution"
  exit 1
fi
```

### CLI Validation Examples
```bash
# Validate with verbose output
./validate-parameters.sh \
  --task-id "test-123" \
  --mode "standard" \
  --loop3-agents "dev,tester" \
  --loop2-agents "reviewer" \
  --product-owner "owner" \
  --verbose

# Validate JSON structure
./validate-parameters.sh \
  --task-id "test-123" \
  --mode "standard" \
  --loop3-agents "dev" \
  --loop2-agents "reviewer" \
  --product-owner "owner" \
  --epic-context '{"invalid":json}' \
  --verbose
```

## Best Practices

1. **Use descriptive task IDs**: Include project and timestamp information
2. **Choose appropriate mode**: Start with `mvp`, upgrade to `standard` or `enterprise` as needed
3. **Set realistic quorum thresholds**: Higher thresholds for critical systems
4. **Provide context JSON**: Enables better agent decision-making
5. **Validate before execution**: Always run parameter validation before orchestrator
6. **Document parameter choices**: Include rationale for non-default values

## Error Handling

The validation helper provides clear error messages for:
- Missing required parameters
- Invalid parameter formats
- Out-of-range values
- Malformed JSON structures
- Invalid character patterns

All validation errors include the parameter name and specific validation failure reason to facilitate quick resolution.