# Agent Output Schema Documentation

**Version:** 1.0.0
**Schema:** `schemas/agent-output-v1.json`
**Last Updated:** 2025-11-15

## Overview

The Agent Output Schema provides a standardized JSON structure for all CFN agent outputs. It replaces ad-hoc stdout parsing with strict type-safe validation, ensuring consistent communication across the CFN Loop.

## Schema Design

### Output Types

The schema supports three agent output types using a discriminated union pattern:

1. **Loop 3 (Implementer)** - `output_type: "loop3"`
2. **Loop 2 (Validator)** - `output_type: "loop2"`
3. **Product Owner** - `output_type: "product_owner"`

### Base Structure

All outputs share common base fields:

```typescript
{
  "output_type": "loop3" | "loop2" | "product_owner",
  "success": boolean,
  "confidence": number,  // 0.0-1.0
  "iteration": number,   // ≥1
  "errors": AgentError[],
  "metadata": AgentMetadata
}
```

## Loop 3 (Implementer) Output

Loop 3 agents perform implementation work and report deliverables created.

### Schema

```json
{
  "output_type": "loop3",
  "success": true,
  "confidence": 0.85,
  "iteration": 1,
  "deliverables": [
    {
      "path": "src/auth.ts",
      "type": "implementation",
      "status": "created",
      "size_bytes": 4567,
      "lines": 120,
      "checksum": "abc123def456"
    }
  ],
  "metrics": {
    "files_created": 2,
    "files_modified": 1,
    "lines_of_code": 450,
    "test_coverage": 0.92,
    "execution_time_ms": 1234
  },
  "summary": "Implemented JWT authentication module",
  "errors": [],
  "metadata": {
    "agent_type": "backend-developer",
    "agent_id": "agent-123",
    "execution_time_ms": 1234,
    "timestamp": "2025-11-15T08:00:00Z"
  }
}
```

### Fields

#### Required Fields

- **output_type**: `"loop3"` (discriminator)
- **success**: Whether implementation was successful
- **confidence**: Self-confidence score (0.0-1.0)
- **iteration**: CFN Loop iteration number
- **deliverables**: Array of created/modified artifacts
- **errors**: Array of errors encountered
- **metadata**: Agent execution metadata

#### Optional Fields

- **metrics**: Quantitative metrics (files, lines, coverage, etc.)
- **summary**: Brief description of implementation work

#### Deliverable Fields

Each deliverable must include:

- **path** (required): File path (absolute or relative)
- **type** (required): One of `implementation`, `test`, `documentation`, `config`, `schema`, `script`, `other`
- **status** (required): One of `created`, `modified`, `deleted`, `validated`, `pending`
- **size_bytes** (optional): File size in bytes
- **lines** (optional): Number of lines
- **checksum** (optional): SHA-256 checksum

### Example: Successful Implementation

```json
{
  "output_type": "loop3",
  "success": true,
  "confidence": 0.88,
  "iteration": 1,
  "deliverables": [
    {
      "path": "src/lib/auth.ts",
      "type": "implementation",
      "status": "created",
      "size_bytes": 3456,
      "lines": 98
    },
    {
      "path": "tests/auth.test.ts",
      "type": "test",
      "status": "created",
      "size_bytes": 2134,
      "lines": 67
    }
  ],
  "metrics": {
    "files_created": 2,
    "lines_of_code": 165,
    "test_coverage": 0.95,
    "tests_passed": 15,
    "tests_failed": 0
  },
  "summary": "Implemented JWT authentication with refresh tokens and comprehensive test coverage",
  "errors": [],
  "metadata": {
    "agent_type": "backend-developer",
    "execution_time_ms": 2456,
    "timestamp": "2025-11-15T10:30:00Z",
    "swarm_id": "swarm-abc123"
  }
}
```

## Loop 2 (Validator) Output

Loop 2 agents validate Loop 3 work and provide consensus votes.

### Schema

```json
{
  "output_type": "loop2",
  "success": true,
  "confidence": 0.90,
  "iteration": 1,
  "validation_type": "review",
  "issues": [
    {
      "severity": "medium",
      "category": "security",
      "message": "SQL injection vulnerability in query builder",
      "location": "src/db.ts:45",
      "recommendation": "Use parameterized queries",
      "code": "SQLI-001"
    }
  ],
  "recommendations": [
    "Add input validation for user-provided queries",
    "Implement rate limiting on API endpoints"
  ],
  "approved": false,
  "summary": "Security review identified 1 medium-severity issue",
  "errors": [],
  "metadata": {
    "agent_type": "reviewer",
    "execution_time_ms": 890,
    "timestamp": "2025-11-15T08:02:00Z"
  }
}
```

### Fields

#### Required Fields

- **output_type**: `"loop2"` (discriminator)
- **success**: Whether validation completed successfully
- **confidence**: Validator confidence score (0.0-1.0)
- **iteration**: CFN Loop iteration number
- **validation_type**: One of `review`, `test`, `security`, `architecture`, `performance`, `compliance`
- **issues**: Array of issues found
- **recommendations**: Array of improvement suggestions
- **approved**: Consensus vote (true/false)
- **errors**: Array of errors encountered
- **metadata**: Agent execution metadata

#### Optional Fields

- **summary**: Brief validation findings summary

#### Issue Fields

Each issue must include:

- **severity** (required): One of `critical`, `high`, `medium`, `low`, `info`
- **category** (required): One of `security`, `performance`, `quality`, `style`, `documentation`, `testing`, `architecture`, `other`
- **message** (required): Human-readable issue description
- **location** (optional): File path and line number (e.g., `src/file.ts:45`)
- **recommendation** (optional): Suggested fix
- **code** (optional): Error code or rule identifier

### Example: Failed Validation

```json
{
  "output_type": "loop2",
  "success": true,
  "confidence": 0.92,
  "iteration": 1,
  "validation_type": "security",
  "issues": [
    {
      "severity": "high",
      "category": "security",
      "message": "Hardcoded API key in source code",
      "location": "src/config.ts:12",
      "recommendation": "Move API key to environment variable",
      "code": "SEC-HARDCODED-KEY"
    },
    {
      "severity": "medium",
      "category": "security",
      "message": "Missing input sanitization on user input",
      "location": "src/api/users.ts:78",
      "recommendation": "Use validator library for input sanitization"
    }
  ],
  "recommendations": [
    "Implement environment-based configuration",
    "Add input validation middleware",
    "Run SAST scanner in CI/CD pipeline"
  ],
  "approved": false,
  "summary": "Security audit identified 2 critical issues requiring remediation",
  "errors": [],
  "metadata": {
    "agent_type": "security-analyst",
    "execution_time_ms": 1567,
    "timestamp": "2025-11-15T10:35:00Z"
  }
}
```

## Product Owner Output

Product Owner makes final decisions on iteration outcomes.

### Schema

```json
{
  "output_type": "product_owner",
  "success": true,
  "confidence": 0.95,
  "iteration": 2,
  "decision": "PROCEED",
  "rationale": "All deliverables complete, consensus achieved at 0.93, gate score at 0.87",
  "deliverables_validated": true,
  "next_action": "mark_task_complete",
  "consensus_score": 0.93,
  "gate_score": 0.87,
  "errors": [],
  "metadata": {
    "agent_type": "product-owner",
    "execution_time_ms": 567,
    "timestamp": "2025-11-15T08:05:00Z"
  }
}
```

### Fields

#### Required Fields

- **output_type**: `"product_owner"` (discriminator)
- **success**: Whether decision completed successfully
- **confidence**: Product Owner confidence score (0.0-1.0)
- **iteration**: CFN Loop iteration number
- **decision**: One of `PROCEED`, `ITERATE`, `ABORT`
- **rationale**: Explanation for decision
- **deliverables_validated**: Whether deliverables were validated
- **next_action**: Next action to take
- **errors**: Array of errors encountered
- **metadata**: Agent execution metadata

#### Optional Fields

- **consensus_score**: Loop 2 consensus score (0.0-1.0)
- **gate_score**: Loop 3 gate score (0.0-1.0)

### Decisions

#### PROCEED

Task complete, mark as done.

```json
{
  "decision": "PROCEED",
  "rationale": "All deliverables complete and validated, consensus at 0.95",
  "next_action": "mark_task_complete"
}
```

#### ITERATE

Requires another iteration with improvements.

```json
{
  "decision": "ITERATE",
  "rationale": "Security issues identified, requires remediation in iteration 2",
  "next_action": "start_iteration_2"
}
```

#### ABORT

Task cannot be completed, abort execution.

```json
{
  "decision": "ABORT",
  "rationale": "Requirements unclear, technical approach not feasible",
  "next_action": "abort_task_and_escalate"
}
```

## Common Fields

### Metadata

All outputs include metadata with agent execution context:

```typescript
{
  "agent_type": string,           // Required: Agent type identifier
  "agent_id": string,              // Optional: Unique agent instance ID
  "execution_time_ms": number,     // Optional: Execution time in milliseconds
  "timestamp": string,             // Optional: ISO 8601 timestamp
  "swarm_id": string,              // Optional: Swarm/task identifier
  "iteration": number,             // Optional: CFN Loop iteration
  "mode": "mvp" | "standard" | "enterprise",  // Optional: CFN Loop mode
  "context": Record<string, any>   // Optional: Additional context
}
```

### Errors

Errors encountered during execution:

```typescript
{
  "code": string,                  // Required: Error code
  "message": string,               // Required: Error message
  "stack": string,                 // Optional: Stack trace
  "context": Record<string, any>   // Optional: Additional context
}
```

## Validation

### TypeScript Validation

```typescript
import { validateAgentOutput } from './lib/agent-output-validator';

const result = validateAgentOutput(output);

if (result.valid) {
  console.log('✅ Valid output');
} else {
  console.error('❌ Validation errors:', result.errors);
}
```

### Type-Specific Validation

```typescript
import {
  validateLoop3Output,
  validateLoop2Output,
  validateProductOwnerOutput
} from './lib/agent-output-validator';

// Validate Loop 3 output
const loop3Result = validateLoop3Output(output);

// Validate Loop 2 output
const loop2Result = validateLoop2Output(output);

// Validate Product Owner output
const poResult = validateProductOwnerOutput(output);
```

### JSON String Validation

```typescript
import { validateJSON } from './lib/agent-output-validator';

const jsonString = '{"output_type": "loop3", ...}';
const result = validateJSON(jsonString);
```

## Performance

- **Validation time**: <10ms for typical outputs
- **Memory overhead**: <5MB for validation library
- **Large arrays**: Handles 1000+ deliverables efficiently

## Error Codes

- `INVALID_TYPE`: Field has wrong type
- `MISSING_REQUIRED`: Required field missing
- `INVALID_ENUM`: Enum value not in allowed list
- `CONSTRAINT_VIOLATION`: Value violates constraints (e.g., confidence >1.0)
- `INVALID_OUTPUT_TYPE`: Unknown output_type
- `JSON_PARSE_ERROR`: JSON string parsing failed

## Best Practices

1. **Always include metadata**: Helps with debugging and audit trails
2. **Use descriptive summaries**: Makes logs more readable
3. **Report all errors**: Include full error context for troubleshooting
4. **Validate before persisting**: Catch errors early
5. **Use appropriate confidence scores**: Reflect actual certainty
6. **Include timestamps**: Essential for performance analysis

## See Also

- [Migration Guide](./AGENT_OUTPUT_MIGRATION.md) - Migrating from legacy stdout
- [TypeScript Types](../src/types/agent-output.ts) - Type definitions
- [Validator](../src/lib/agent-output-validator.ts) - Validation implementation
- [JSON Schema](../schemas/agent-output-v1.json) - Schema definition
