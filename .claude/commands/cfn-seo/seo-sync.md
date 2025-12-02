# /seo-sync - Pattern Synchronization Command

**Phase**: 4 Sprint 2 (Cross-Domain Learning - Pattern Sync)
**Purpose**: Bidirectional pattern synchronization between global and local stores
**Script**: `planning/seo/scripts/sync-patterns.sh`

---

## Command Syntax

```bash
/seo-sync --direction <pull|push|both> --mode <incremental|full> --project <project-id> [OPTIONS]
```

## Required Parameters

| Parameter | Description | Values |
|-----------|-------------|--------|
| `--direction` | Sync direction | `pull`, `push`, `both` |
| `--mode` | Sync mode | `incremental`, `full` |
| `--project` | Project ID for local store | Alphanumeric with `-_` |

## Optional Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--pattern-types` | Comma-separated pattern types to sync | `title-tags,schema-markup` |
| `--last-sync` | Last sync timestamp for incremental mode | `1701388800000` |
| `--force` | Force operations (overwrite/promotion) | Flag |
| `--authorized-by` | Authorization identity for force ops | `admin@example.com` |
| `--dry-run` | Preview sync without executing | Flag |
| `--verbose` | Enable verbose logging | Flag |

---

## Use Cases

### 1. Pull Global Patterns to Local (Incremental)

**Scenario**: Update local store with latest global patterns
**Command**:
```bash
/seo-sync --direction pull --mode incremental --project myproject
```

**Output**:
- Pulls patterns changed since last sync
- Resolves conflicts automatically (confidence-based)
- Updates sync metadata

### 2. Push Local Patterns to Global (Full)

**Scenario**: Promote validated local patterns to global store
**Command**:
```bash
/seo-sync --direction push --mode full --project myproject
```

**Output**:
- Uses P4-S1 promotion protocol
- Checks eligibility (confidence ≥0.8, usage ≥5, success rate ≥0.7)
- Merges with similar global patterns

### 3. Bidirectional Sync with Filters

**Scenario**: Sync only specific pattern types in both directions
**Command**:
```bash
/seo-sync --direction both --mode full --project myproject \
  --pattern-types title-tags,schema-markup,meta-descriptions
```

**Output**:
- Pulls matching patterns from global
- Pushes matching patterns to global
- Combined metrics reported

### 4. Force Push with Authorization

**Scenario**: Override promotion eligibility for urgent deployment
**Command**:
```bash
/seo-sync --direction push --mode full --project myproject \
  --force --authorized-by admin@example.com
```

**Security**:
- Requires `--authorized-by` for audit trail
- Logs force promotion events
- Should be used sparingly

### 5. Dry Run Preview

**Scenario**: Preview sync impact without making changes
**Command**:
```bash
/seo-sync --direction both --mode full --project myproject --dry-run
```

**Output**:
- Shows pattern counts
- No database changes
- Safe for exploration

---

## Sync Behavior

### Pull (Global → Local)

1. Query global patterns (filtered by type if specified)
2. Check local versions for conflicts
3. Auto-resolve conflicts:
   - Higher confidence wins
   - Similar confidence (±0.05): merge patterns
4. Update local store
5. Track conflicts requiring manual review

### Push (Local → Global)

1. Query local patterns (filtered by type if specified)
2. Use P4-S1 promotion protocol:
   - Check eligibility (confidence, usage, success rate)
   - Anonymize pattern data
   - Detect similar global patterns
   - Create new or merge existing
3. Update sync metadata

### Both (Bidirectional)

1. Execute pull operation
2. Execute push operation
3. Combine metrics and report

---

## Conflict Resolution

### Automatic Resolution

**Confidence-Based** (default):
- Confidence difference ≥0.05: Higher confidence pattern wins
- Confidence difference <0.05: Patterns merged

**Merge Strategy**:
- Use higher confidence as base
- Merge evidence arrays
- Update timestamps
- Increment version

### Manual Resolution Required

Conflicts requiring manual review:
- Data divergence (incompatible changes)
- Major version drift
- High severity conflicts

**Review Conflicts**:
```bash
redis-cli LRANGE pattern:sync:conflicts:myproject 0 -1
```

---

## Incremental Sync

**How It Works**:
1. Track `last_synced` timestamp in Redis
2. Only transfer patterns with `updated_at > last_synced`
3. Significantly faster for frequent syncs

**Enable**:
```bash
/seo-sync --direction pull --mode incremental --project myproject
```

**Provide Timestamp**:
```bash
/seo-sync --direction pull --mode incremental --project myproject \
  --last-sync 1701388800000
```

**When to Use**:
- Frequent sync operations (hourly/daily)
- Large pattern stores (>100 patterns)
- Bandwidth-constrained environments

---

## Performance Guidelines

| Store Size | Recommended Mode | Typical Duration |
|------------|------------------|------------------|
| <50 patterns | Full | <500ms |
| 50-200 patterns | Incremental | 500ms-2s |
| 200-1000 patterns | Incremental | 2s-10s |
| >1000 patterns | Incremental | 10s-60s |

**Optimization Tips**:
- Use `--pattern-types` to filter sync scope
- Schedule incremental syncs frequently
- Run full sync weekly for integrity check
- Monitor sync duration with `--verbose`

---

## Security & Authorization

### Input Validation

- Project ID: Alphanumeric with `-_` only
- Pattern types: Validated against known types
- Timestamps: Numeric validation

### Injection Prevention

- Redis key validation (regex: `/^[a-zA-Z0-9:_-]+$/`)
- Pattern ID validation before queries
- No user input directly in Redis commands

### Authorization

**Force Operations**:
- Require `--authorized-by` parameter
- Log to audit trail: `pattern:sync:audit:${projectId}`
- Include timestamp and operation details

**Audit Query**:
```bash
redis-cli LRANGE pattern:sync:audit:myproject 0 -1
```

---

## Monitoring & Metrics

### Sync Metadata

**Redis Key**: `pattern:sync:meta:${projectId}`

**Fields**:
- `last_pull`: ISO timestamp of last pull
- `last_push`: ISO timestamp of last push
- `patterns_pulled`: Total patterns pulled
- `patterns_pushed`: Total patterns pushed
- `conflicts_resolved`: Total conflicts auto-resolved

**Query**:
```bash
redis-cli HGETALL pattern:sync:meta:myproject
```

### Detailed Metrics

**Returned by Sync**:
```json
{
  "success": true,
  "direction": "both",
  "mode": "incremental",
  "patternsSynced": 42,
  "conflictsResolved": 3,
  "durationMs": 1250,
  "metrics": {
    "pulled": 15,
    "pushed": 24,
    "merged": 3,
    "skipped": 8,
    "conflictsDetected": 3,
    "conflictsAutoResolved": 3,
    "conflictsManual": 0
  }
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid project ID format` | Non-alphanumeric project ID | Use only `[a-zA-Z0-9_-]` |
| `Force promotion requires authorizedBy` | Missing authorization | Add `--authorized-by` |
| `Cannot connect to Redis` | Redis unavailable | Check `REDIS_HOST:REDIS_PORT` |
| `Pattern sync library not found` | Missing TypeScript files | Run `npm install` |

### Rollback

**No Explicit Rollback**:
- Patterns are versioned
- Previous versions remain in Redis
- Manual revert via Redis CLI if needed

**Query Previous Version**:
```bash
redis-cli HGET pattern:local:${patternId} version
redis-cli HGET pattern:local:${patternId} previous_version
```

---

## Integration with Phase 4 Sprint 1

### Uses P4-S1 Functions

- `promotePattern()`: Push operation uses promotion protocol
- `detectSimilarPatterns()`: Merge detection during push
- `updateConfidenceFromOutcome()`: Confidence updates during sync

### Lifecycle Integration

- Respects pattern lifecycle stages
- Only promotes patterns in `validation` or `promotion` stages
- Archives low-confidence patterns (P4-S1 auto-archive)

---

## Examples by Team Role

### Content SEO Strategist

**Sync latest global patterns for new project**:
```bash
/seo-sync --direction pull --mode full --project new-client-2024
```

### SEO Content Writer

**Push successful title-tag patterns**:
```bash
/seo-sync --direction push --mode full --project content-campaign \
  --pattern-types title-tags
```

### SEO Analytics Specialist

**Bidirectional sync with verbose metrics**:
```bash
/seo-sync --direction both --mode incremental --project analytics-project \
  --verbose
```

### Technical SEO Specialist

**Force push schema markup patterns**:
```bash
/seo-sync --direction push --mode full --project schema-optimization \
  --pattern-types schema-markup --force --authorized-by tech-lead@company.com
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_LOCAL_STORE` | `pattern:local` | Local pattern key prefix |
| `REDIS_GLOBAL_STORE` | `pattern:global` | Global pattern key prefix |

**Override Example**:
```bash
REDIS_HOST=redis.prod.internal REDIS_PORT=6380 \
  /seo-sync --direction both --mode full --project myproject
```

---

## Troubleshooting

### Sync Takes Too Long

**Solutions**:
1. Switch to incremental mode
2. Use `--pattern-types` filter
3. Check Redis latency: `redis-cli --latency`
4. Consider Redis pipelining (future enhancement)

### Conflicts Not Auto-Resolving

**Check Conflict Severity**:
```bash
redis-cli LRANGE pattern:sync:conflicts:myproject 0 -1 | jq '.severity'
```

**Manual Resolution**:
1. Review conflict details
2. Choose resolution strategy
3. Update pattern manually in Redis
4. Remove from conflict list

### Patterns Not Syncing

**Debug**:
1. Run with `--verbose` flag
2. Check pattern eligibility (for push)
3. Verify pattern types match filter
4. Check Redis key format

---

## Future Enhancements

- [ ] Batch sync with Redis pipelining
- [ ] Webhook notifications on sync completion
- [ ] Sync scheduling (cron integration)
- [ ] Conflict resolution UI
- [ ] Multi-region global store replication
- [ ] Pattern diff viewer

---

## Related Documentation

- P4-S1: Pattern Promotion Protocol (`docs/seo/P4-S1-SPRINT-COMPLETION.md`)
- P4-S1: Confidence Scoring (`planning/seo/lib/confidence-scoring.ts`)
- SEO Intelligence Epic (`planning/seo/seo-intelligence-epic.json`)
- Redis Coordination Guide (`docs/REDIS_CLI_COORDINATION_GUIDE.md`)

---

**Version**: 1.0.0
**Last Updated**: 2025-12-01
**Maintainer**: Backend Developer Agent
