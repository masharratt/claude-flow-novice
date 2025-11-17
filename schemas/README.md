# Schema Registry

Complete JSON Schema registry for all 47 integration points in the Claude Flow Novice system.

## Overview

This registry contains JSON Schema Draft 2020-12 schemas that validate data at all integration boundaries. Each schema ensures type safety, data integrity, and protocol compliance across the system.

**Total Schemas:** 48 (47 integration points + 1 support schema)
**Schema Version:** JSON Schema Draft 2020-12
**Validation Performance:** <20ms per schema
**Coverage:** 100% of integration points

## Directory Structure

```
schemas/
├── integration-points/           # 47+ integration point schemas
│   ├── database-handoffs/        # 9 schemas
│   ├── file-operations/          # 11 schemas
│   ├── cfn-loop-communication/   # 8-9 schemas
│   ├── phase4-workflow/          # 7 schemas
│   ├── api-layer/                # 7 schemas
│   └── data-format-transformations/  # 5 schemas
├── config-v1.schema.json         # General config schema
├── skill-file-v1.schema.json     # Skill file schema
├── skill-markdown-v1.schema.json # Skill markdown schema
└── skill-output-v1.schema.json   # Skill output schema
```

## Integration Categories

### Category 1: Database Handoffs (9 schemas)

Data exchange between databases (SQLite, PostgreSQL, Redis).

| Integration Point | Schema ID | Version |
|-------------------|-----------|---------|
| 1.1 Pattern Deployment | `database-handoffs/pattern-deployment` | 1.0.0 |
| 1.2 Execution Metrics | `database-handoffs/execution-metrics` | 1.0.0 |
| 1.3 Edge Case Feedback | `database-handoffs/edge-case-feedback` | 1.0.0 |
| 1.4 Reflection Persistence | `database-handoffs/reflection-persistence` | 1.0.0 |
| 1.5 Skill Loader Cache | `database-handoffs/skill-loader-cache` | 1.0.0 |
| 1.6 ACE Reflection Streaming | `database-handoffs/ace-reflection-streaming` | 1.0.0 |
| 1.7 Cross-Database Mappings | `database-handoffs/cross-database-mappings` | 1.0.0 |
| 1.8 Cost Tracking Metrics | `database-handoffs/cost-tracking-metrics` | 1.0.0 |
| 1.9 Persistent Skill Data | `database-handoffs/persistent-skill-data` | 1.0.0 |

### Category 2: File Operations (11 schemas)

File system operations including backups, validation, and artifact generation.

| Integration Point | Schema ID | Version |
|-------------------|-----------|---------|
| 2.1 Pre-Edit Backup | `file-operations/pre-edit-backup` | 1.0.0 |
| 2.2 Post-Edit Validation | `file-operations/post-edit-validation` | 1.0.0 |
| 2.3 Skill Content Storage | `file-operations/skill-content-storage` | 1.0.0 |
| 2.4 Agent Output Files | `file-operations/agent-output` | 1.0.0 |
| 2.5 Docker Build Context | `file-operations/docker-build-context` | 1.0.0 |
| 2.6 Coordinator Entrypoint | `file-operations/coordinator-entrypoint` | 1.0.0 |
| 2.7 Skill Promotion | `file-operations/skill-promotion` | 1.0.0 |
| 2.8 Configuration Files | `file-operations/config-files` | 1.0.0 |
| 2.9 Distributed Logging | `file-operations/distributed-logging` | 1.0.0 |
| 2.10 Memory Persistence | `file-operations/memory-persistence` | 1.0.0 |
| 2.11 Artifact Generation | `file-operations/artifact-generation` | 1.0.0 |

### Category 3: CFN Loop Communication (8 schemas)

Agent coordination and communication in CFN Loop workflows.

| Integration Point | Schema ID | Version |
|-------------------|-----------|---------|
| 3.1 CLI Mode Spawning | `cfn-loop-communication/cli-mode-spawn` | 1.0.0 |
| 3.2 Coordinator Delegation | `cfn-loop-communication/coordinator-delegation` | 1.0.0 |
| 3.3 Loop 3 Agent Spawning | `cfn-loop-communication/loop3-spawning` | 1.0.0 |
| 3.4 Agent Completion | `cfn-loop-communication/agent-completion` | 1.0.0 |
| 3.5 Consensus Reporting | `cfn-loop-communication/consensus-reporting` | 1.0.0 |
| 3.6 Product Owner Decision | `cfn-loop-communication/product-owner-decision` | 1.0.0 |
| 3.7 Task Mode Spawning | `cfn-loop-communication/task-mode-spawn` | 1.0.0 |
| 3.8 Redis Queues | `cfn-loop-communication/redis-queues` | 1.0.0 |

### Category 4: Phase 4 Workflow (7 schemas)

Phase 4 pattern detection and skill generation workflow.

| Integration Point | Schema ID | Version |
|-------------------|-----------|---------|
| 4.1 Pattern to Skill | `phase4-workflow/pattern-to-skill` | 1.0.0 |
| 4.2 Skill Approval | `phase4-workflow/skill-approval` | 1.0.0 |
| 4.3 Skill Deployment | `phase4-workflow/skill-deployment` | 1.0.0 |
| 4.4 Skill Execution Logging | `phase4-workflow/skill-execution-logging` | 1.0.0 |
| 4.5 Edge Case Update Proposal | `phase4-workflow/edge-case-update-proposal` | 1.0.0 |
| 4.6 Iteration Feedback | `phase4-workflow/iteration-feedback` | 1.0.0 |
| 4.7 Agent Lifecycle | `phase4-workflow/agent-lifecycle` | 1.0.0 |

### Category 5: API Layer (7 schemas)

TypeScript APIs and CLI interfaces.

| Integration Point | Schema ID | Version |
|-------------------|-----------|---------|
| 5.1 SkillLoader API | `api-layer/skillloader-request` | 1.0.0 |
| 5.2 Prompt Builder Integration | `api-layer/prompt-builder-integration` | 1.0.0 |
| 5.3 Coordination Signal API | `api-layer/coordination-signal` | 1.0.0 |
| 5.4 Orchestrator Config API | `api-layer/orchestrator-config` | 1.0.0 |
| 5.5 Database Query APIs | `api-layer/database-query` | 1.0.0 |
| 5.6 Docker Spawn API | `api-layer/docker-spawn` | 1.0.0 |
| 5.7 CLI Invocation | `api-layer/cli-invocation` | 1.0.0 |

### Category 6: Data Format Transformations (5 schemas)

Data format conversions and parsing.

| Integration Point | Schema ID | Version |
|-------------------|-----------|---------|
| 6.1 Config Transform | `data-format-transformations/config-transform` | 1.0.0 |
| 6.2 Agent JSON Report | `data-format-transformations/agent-json-report` | 1.0.0 |
| 6.3 Markdown Skill Files | `data-format-transformations/markdown-skill` | 1.0.0 |
| 6.4 Bash Output Parsing | `data-format-transformations/bash-output` | 1.0.0 |
| 6.5 SQLite ↔ Redis Mapping | `data-format-transformations/sqlite-redis-mapping` | 1.0.0 |

## Usage

### Initialization

```typescript
import { IntegrationSchemaValidator } from './src/lib/integration-schema-validator';
import path from 'path';

const validator = new IntegrationSchemaValidator({
  schemaPath: path.join(__dirname, 'schemas/integration-points'),
  enableCache: true,
  strictMode: true,
});

await validator.initialize();
```

### Validation

```typescript
// Validate data against a schema
const data = {
  pattern_id: 'pattern-auth-001',
  skill_name: 'JWT Authentication',
  version: '1.0.0',
  content_path: '/skills/jwt-auth.md',
  content_hash: 'abc123',
};

try {
  await validator.validate(data, 'database-handoffs/pattern-deployment', '1.0.0');
  console.log('✓ Valid');
} catch (error) {
  console.error('✗ Invalid:', error.message);
}
```

### Batch Validation

```typescript
const records = [...]; // Array of records

const result = await validator.validateBatch(
  records,
  'database-handoffs/pattern-deployment',
  '1.0.0',
  { failFast: false }
);

console.log(`${result.validRecords}/${result.totalRecords} valid`);
```

### Schema Registry Queries

```typescript
// List all schemas
const allSchemas = await validator.listSchemas();

// List schemas by category
const dbSchemas = await validator.listSchemas('database-handoffs');

// Get schema versions
const versions = await validator.getVersions('database-handoffs/pattern-deployment');

// Check schema existence
const exists = await validator.hasSchema('database-handoffs/pattern-deployment', '1.0.0');
```

## Schema Naming Convention

**Format:** `{category}/{integration-point}/v{version}.schema.json`

**Examples:**
- `database-handoffs/pattern-deployment/v1.0.0.schema.json`
- `file-operations/pre-edit-backup/v1.0.0.schema.json`
- `cfn-loop-communication/cli-mode-spawn/v1.0.0.schema.json`

## Schema Structure

All schemas follow this structure:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "category/integration-point/v1.0.0",
  "title": "Schema Title",
  "description": "Schema description (Integration Point X.Y)",
  "type": "object",
  "required": ["field1", "field2"],
  "properties": {
    "field1": {
      "type": "string",
      "description": "Field description",
      "pattern": "^[a-z0-9-]+$"
    }
  },
  "additionalProperties": false,
  "examples": [
    {
      "field1": "example-value"
    }
  ]
}
```

## Versioning

Schemas use semantic versioning (semver):
- **Major:** Breaking changes to schema structure
- **Minor:** Backward-compatible additions
- **Patch:** Backward-compatible bug fixes

**Migration:** Use `validator.migrate()` to migrate data between schema versions.

## Performance Targets

- **Validation:** <20ms per schema
- **Batch Validation:** <20ms per record average
- **Schema Loading:** <100ms for all schemas
- **Cache Hit:** <1ms for cached schemas

## Testing

Run comprehensive schema validation tests:

```bash
npm test tests/integration/schema-validation-complete.test.ts
```

**Test Coverage:**
- ✓ 50+ test cases
- ✓ All 47 integration points
- ✓ Happy path and error cases
- ✓ Performance benchmarks
- ✓ Schema registry operations

## Maintenance

### Adding New Schemas

1. Create schema file in appropriate category directory
2. Follow naming convention: `{name}/v{version}.schema.json`
3. Include all required fields: $schema, $id, title, description, examples
4. Add tests to `schema-validation-complete.test.ts`
5. Update this README

### Updating Existing Schemas

1. Increment version according to semver
2. Create new schema file with new version
3. Register migration function if breaking change
4. Update tests
5. Update documentation

## Integration with System

Schemas are automatically loaded and enforced at integration boundaries:

- **API Endpoints:** Request/response validation
- **Database Handoffs:** Data validation before insert/update
- **File Operations:** Metadata validation
- **Agent Communication:** Message validation
- **Configuration:** Config file validation

## Error Handling

Validation errors include:

```typescript
{
  code: 'VALIDATION_FAILED',
  message: 'Schema validation failed for database-handoffs/pattern-deployment@1.0.0',
  context: {
    schemaId: 'database-handoffs/pattern-deployment',
    version: '1.0.0',
    errors: [
      {
        path: '/version',
        message: 'Required property missing'
      }
    ],
    suggestions: ['Did you mean: versions?']
  }
}
```

## Resources

- **Validation Report:** `planning/INTEGRATION_STANDARDIZATION_VALIDATION_REPORT.md`
- **Completion Docs:** `docs/SCHEMA_VALIDATION_COMPLETE.md`
- **Validator Source:** `src/lib/integration-schema-validator.ts`
- **Test Suite:** `tests/integration/schema-validation-complete.test.ts`
- **JSON Schema Spec:** https://json-schema.org/draft/2020-12/schema

## Support

For schema-related questions or issues:
1. Check existing schemas for patterns
2. Review validation error messages and suggestions
3. Consult integration standardization report
4. Review test suite for usage examples
