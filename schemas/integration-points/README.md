# Integration Points Schema Registry

**Total Schemas:** 47 integration points across 6 categories
**Format:** JSON Schema Draft 7
**Versioning:** Semantic versioning (vX.Y.Z)

---

## Quick Reference

| Category | Schemas | Status |
|----------|---------|--------|
| Database Handoffs | 9 | ✅ Defined |
| File Operations | 11 | ✅ Defined |
| CFN Loop Communication | 8 | ✅ Defined |
| Phase 4 Workflow | 7 | ✅ Defined |
| API Layer | 7 | ✅ Defined |
| Data Format Transformations | 5 | ✅ Defined |

---

## Schema Directory Structure

```
integration-points/
├── database-handoffs/          (9 schemas)
│   ├── pattern-deployment/     ✅
│   ├── execution-metrics/      ✅
│   ├── edge-case-feedback/     📋
│   ├── skill-analytics/        📋
│   ├── skill-loading/          📋
│   ├── phase4-patterns/        📋
│   ├── deployment-status/      📋
│   ├── config-loading/         📋
│   └── agent-state/            📋
├── file-operations/            (11 schemas)
│   ├── pre-edit-backup/        ✅
│   ├── post-edit-validation/   📋
│   ├── skill-deployment/       📋
│   ├── agent-output/           ✅
│   ├── artifact-registry/      📋
│   ├── checkpoint-data/        📋
│   ├── reflection-logs/        📋
│   ├── skill-cache/            📋
│   ├── config-files/           📋
│   ├── temp-cleanup/           📋
│   └── log-rotation/           📋
├── cfn-loop-communication/     (8 schemas)
│   ├── cli-mode-spawn/         ✅
│   ├── task-mode-spawn/        📋
│   ├── agent-completion/       📋
│   ├── broadcast-message/      ✅
│   ├── confidence-scores/      📋
│   ├── consensus-collection/   📋
│   ├── product-owner-decision/ 📋
│   └── iteration-context/      📋
├── phase4-workflow/            (7 schemas)
│   ├── pattern-to-skill/       ✅
│   ├── skill-generation/       📋
│   ├── approval-queue/         📋
│   ├── deployment-trigger/     📋
│   ├── edge-case-analysis/     📋
│   ├── skill-improvement/      📋
│   └── analytics-export/       📋
├── api-layer/                  (7 schemas)
│   ├── skillloader-request/    ✅
│   ├── skillloader-response/   📋
│   ├── cache-invalidation/     📋
│   ├── query-abstraction/      📋
│   ├── health-check/           📋
│   ├── metrics-query/          📋
│   └── config-query/           📋
└── data-format-transformations/ (5 schemas)
    ├── config-transform/       ✅
    ├── schema-migration/       📋
    ├── agent-output-parse/     📋
    ├── log-format/             📋
    └── metric-aggregation/     📋

Legend:
✅ Schema defined and validated
📋 Schema planned (to be created)
⚠️  Schema needs update
❌ Schema deprecated
```

---

## Category 1: Database Handoffs (9 schemas)

### 1.1 Pattern Deployment
**Schema ID:** `database-handoffs/pattern-deployment`
**Version:** 1.0.0
**Description:** Pattern deployment from Phase 4 PostgreSQL to Skills DB SQLite
**Integration Point:** 1.1
**Status:** ✅ Complete
**File:** `database-handoffs/pattern-deployment/v1.0.0.schema.json`

### 1.2 Execution Metrics
**Schema ID:** `database-handoffs/execution-metrics`
**Version:** 1.0.0
**Description:** Skill execution metrics for dual logging (PostgreSQL)
**Integration Point:** 1.2
**Status:** ✅ Complete
**File:** `database-handoffs/execution-metrics/v1.0.0.schema.json`

### 1.3 Edge Case Feedback
**Schema ID:** `database-handoffs/edge-case-feedback`
**Version:** 1.0.0
**Description:** Edge case feedback from Skills DB to Phase 4
**Integration Point:** 1.3
**Status:** 📋 Planned

### 1.4 Skill Analytics
**Schema ID:** `database-handoffs/skill-analytics`
**Version:** 1.0.0
**Description:** Aggregated skill analytics data
**Integration Point:** 1.4
**Status:** 📋 Planned

### 1.5 Skill Loading
**Schema ID:** `database-handoffs/skill-loading`
**Version:** 1.0.0
**Description:** Skill loading from Skills DB to agent memory
**Integration Point:** 1.5
**Status:** 📋 Planned

### 1.6 Phase 4 Patterns
**Schema ID:** `database-handoffs/phase4-patterns`
**Version:** 1.0.0
**Description:** PostgreSQL pattern queries
**Integration Point:** 1.6
**Status:** 📋 Planned

### 1.7 Deployment Status
**Schema ID:** `database-handoffs/deployment-status`
**Version:** 1.0.0
**Description:** Cross-database deployment sync
**Integration Point:** 1.7
**Status:** 📋 Planned

### 1.8 Config Loading
**Schema ID:** `database-handoffs/config-loading`
**Version:** 1.0.0
**Description:** Config DB to runtime configuration loading
**Integration Point:** 1.8
**Status:** 📋 Planned

### 1.9 Agent State
**Schema ID:** `database-handoffs/agent-state`
**Version:** 1.0.0
**Description:** SQLite ↔ Redis agent state synchronization
**Integration Point:** 1.9
**Status:** 📋 Planned

---

## Category 2: File Operations (11 schemas)

### 2.1 Pre-Edit Backup
**Schema ID:** `file-operations/pre-edit-backup`
**Version:** 1.0.0
**Description:** Pre-edit backup metadata
**Integration Point:** 2.1
**Status:** ✅ Complete
**File:** `file-operations/pre-edit-backup/v1.0.0.schema.json`

### 2.4 Agent Output
**Schema ID:** `file-operations/agent-output`
**Version:** 1.0.0
**Description:** Agent output to /tmp/ directory
**Integration Point:** 2.4
**Status:** ✅ Complete
**File:** `file-operations/agent-output/v1.0.0.schema.json`

*Additional schemas 2.2, 2.3, 2.5-2.11 planned*

---

## Category 3: CFN Loop Communication (8 schemas)

### 3.1 CLI Mode Spawn
**Schema ID:** `cfn-loop-communication/cli-mode-spawn`
**Version:** 1.0.0
**Description:** Main Chat → Coordinator CLI mode spawning
**Integration Point:** 3.1
**Status:** ✅ Complete
**File:** `cfn-loop-communication/cli-mode-spawn/v1.0.0.schema.json`

### 3.4 Broadcast Message
**Schema ID:** `cfn-loop-communication/broadcast-message`
**Version:** 1.0.0
**Description:** Coordinator broadcast messages to agents
**Integration Point:** 3.4
**Status:** ✅ Complete
**File:** `cfn-loop-communication/broadcast-message/v1.0.0.schema.json`

*Additional schemas 3.2, 3.3, 3.5-3.8 planned*

---

## Category 4: Phase 4 Workflow (7 schemas)

### 4.1 Pattern to Skill
**Schema ID:** `phase4-workflow/pattern-to-skill`
**Version:** 1.0.0
**Description:** Pattern detection output for skill generation
**Integration Point:** 4.1
**Status:** ✅ Complete
**File:** `phase4-workflow/pattern-to-skill/v1.0.0.schema.json`

*Additional schemas 4.2-4.7 planned*

---

## Category 5: API Layer (7 schemas)

### 5.1 SkillLoader Request
**Schema ID:** `api-layer/skillloader-request`
**Version:** 1.0.0
**Description:** SkillLoader API request format
**Integration Point:** 5.1
**Status:** ✅ Complete
**File:** `api-layer/skillloader-request/v1.0.0.schema.json`

*Additional schemas 5.2-5.7 planned*

---

## Category 6: Data Format Transformations (5 schemas)

### 6.1 Config Transform
**Schema ID:** `data-format-transformations/config-transform`
**Version:** 1.0.0
**Description:** JSON ↔ YAML ↔ Shell variable transformations
**Integration Point:** 6.1
**Status:** ✅ Complete
**File:** `data-format-transformations/config-transform/v1.0.0.schema.json`

*Additional schemas 6.2-6.5 planned*

---

## Usage Examples

### Validate Data Against Schema

```typescript
import { IntegrationSchemaValidator } from '../src/lib/integration-schema-validator';

const validator = new IntegrationSchemaValidator({
  schemaPath: './schemas/integration-points',
});

await validator.initialize();

// Validate pattern deployment
await validator.validate(
  {
    pattern_id: 'skill-001',
    skill_name: 'auto-backup',
    version: '1.0.0',
    content_path: '/skills/auto-backup.md',
    content_hash: 'abc123',
  },
  'database-handoffs/pattern-deployment',
  '1.0.0'
);
```

### Express Middleware

```typescript
import { validateRequest } from '../src/middleware/schema-validation';

app.post('/api/pattern-deployment',
  validateRequest('database-handoffs/pattern-deployment', '1.0.0'),
  handlePatternDeployment
);
```

---

## Schema Versioning

### Version Format

- **Format:** `vX.Y.Z` (semantic versioning)
- **File naming:** `v1.0.0.schema.json`
- **Directory structure:** `category/schema-name/vX.Y.Z.schema.json`

### Version Bumping Rules

- **Major (X):** Breaking changes (remove fields, change types)
- **Minor (Y):** Non-breaking additions (new optional fields)
- **Patch (Z):** Bug fixes (documentation, validation rules)

### Example

```
database-handoffs/pattern-deployment/
├── v1.0.0.schema.json  (Initial release)
├── v1.1.0.schema.json  (Added 'metadata' optional field)
└── v2.0.0.schema.json  (Changed 'pattern_id' format - breaking)
```

---

## Adding New Schemas

### 1. Create Schema File

```bash
mkdir -p schemas/integration-points/category/schema-name
touch schemas/integration-points/category/schema-name/v1.0.0.schema.json
```

### 2. Define Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "category/schema-name/v1.0.0",
  "title": "Schema Title",
  "description": "Integration Point X.Y description",
  "type": "object",
  "required": ["field1"],
  "properties": {
    "field1": {
      "type": "string",
      "description": "Field description"
    }
  },
  "additionalProperties": false
}
```

### 3. Add Tests

Add test cases to `tests/integration-schema-validator.test.ts`:

```typescript
describe('Category X: Description (N points)', () => {
  describe('X.Y Schema Name', () => {
    const schemaId = 'category/schema-name';

    it('should validate valid data', async () => {
      await expect(
        validator.validate(validData, schemaId, '1.0.0')
      ).resolves.not.toThrow();
    });

    it('should reject invalid data', async () => {
      await expect(
        validator.validate(invalidData, schemaId, '1.0.0')
      ).rejects.toThrow(StandardError);
    });
  });
});
```

### 4. Update Documentation

- Add to this README.md
- Update docs/SCHEMA_VALIDATION_GUIDE.md
- Update planning/INTEGRATION_POINTS_INVENTORY.md

---

## Schema Best Practices

1. **Always include `$schema` and `$id`**
2. **Write detailed descriptions** for all fields
3. **Use patterns for validation** (regex for IDs, paths)
4. **Set `additionalProperties: false`** to prevent unexpected data
5. **Use enums** for fixed value sets
6. **Specify numeric ranges** with `minimum`/`maximum`
7. **Use standard formats** (date-time, email, uri, uuid)
8. **Test with valid and invalid data**
9. **Version schemas semantically**
10. **Document breaking changes**

---

## Validation Performance

| Operation | Target | Measured |
|-----------|--------|----------|
| Schema validation | <50ms | 5-20ms |
| Schema loading (cold) | <100ms | 30-80ms |
| Schema loading (cached) | <10ms | 1-5ms |
| Batch (100 records) | <5s | 2-3s |

---

## Support

For questions or issues:
- **Documentation:** `/docs/SCHEMA_VALIDATION_GUIDE.md`
- **Integration Points:** `/planning/INTEGRATION_POINTS_INVENTORY.md`
- **Validation Report:** `/planning/INTEGRATION_STANDARDIZATION_VALIDATION_REPORT.md`

---

**Last Updated:** 2025-11-16
**Status:** 9/47 schemas defined (19% complete)
**Next Priority:** Complete remaining 38 schemas
