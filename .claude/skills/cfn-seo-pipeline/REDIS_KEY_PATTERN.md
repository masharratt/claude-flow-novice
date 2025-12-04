# SEO Pipeline Redis Key Pattern

## Canonical Pattern

**Format**: `seo:task:${taskId}:phase${N}[:${suffix}]`

### Components
- **Prefix**: `seo:task` (fixed)
- **Task ID**: `${taskId}` (UUID or unique identifier)
- **Phase**: `phase${N}` (phase1, phase2, ... phase7)
- **Suffix**: Optional descriptive name for phase outputs

## Usage Guidelines

### Reading Cross-Phase Dependencies (No Suffix)
When reading prerequisite data from other phases, use bare keys without suffix:

```typescript
// Phase 6 reading Phase 1-5 data
const phase1Raw = await redis.get(`seo:task:${taskId}:phase1`);
const phase1Data = phase1Raw ? JSON.parse(phase1Raw) : null;

const phase4Raw = await redis.get(`seo:task:${taskId}:phase4`);
const phase4Data = phase4Raw ? JSON.parse(phase4Raw) : null;
```

### Writing Phase Outputs (With Descriptive Suffix)
When storing phase results, use descriptive suffixes:

```typescript
// Phase 4: Store keyword universe
const redisKey = `seo:task:${taskId}:phase4:keyword_universe`;
await redis.set(redisKey, JSON.stringify(data), 'EX', ttl);

// Phase 6: Store strategy
const redisKey = `seo:task:${taskId}:phase6:strategy`;
await redis.set(redisKey, JSON.stringify(strategy), 'EX', ttl);
```

## Phase-Specific Keys

### Phase 1: Technical Audit
- Input: Site URL, domain
- Output: `seo:task:${taskId}:phase1:technical_audit`
- Read key: `seo:task:${taskId}:phase1`

### Phase 2: Content Analysis
- Input: Phase 1 data
- Output: `seo:task:${taskId}:phase2:content_analysis`
- Read key: `seo:task:${taskId}:phase2`

### Phase 3: Competitive Analysis
- Input: Phase 1-2 data
- Output: `seo:task:${taskId}:phase3:competitor_analysis`
- Read key: `seo:task:${taskId}:phase3`

### Phase 4: Keyword Research
- Input: Phase 3 data
- Output: `seo:task:${taskId}:phase4:keyword_universe`
- Read key: `seo:task:${taskId}:phase4`

### Phase 5: Gap Analysis
- Input: Phase 3-4 data
- Output: `seo:task:${taskId}:phase5:gap_analysis`
- Read key: `seo:task:${taskId}:phase5`

### Phase 6: Strategy Creation
- Input: Phase 1-5 data
- Output: `seo:task:${taskId}:phase6:strategy`
- Read key: `seo:task:${taskId}:phase6`

### Phase 7: Roadmap Generation
- Input: Phase 6 data
- Output: `seo:task:${taskId}:phase7:roadmap`
- Read key: `seo:task:${taskId}:phase7`

## Anti-Patterns (DO NOT USE)

### Wrong Prefix
```typescript
// ❌ WRONG - inconsistent prefix
`seo:onboarding:${taskId}:phase-6`

// ✅ CORRECT
`seo:task:${taskId}:phase6:strategy`
```

### Wrong Phase Format
```typescript
// ❌ WRONG - hyphenated phase number
`seo:task:${taskId}:phase-1`

// ✅ CORRECT
`seo:task:${taskId}:phase1`
```

### Missing Task ID
```typescript
// ❌ WRONG - no task isolation
`seo:phase4:data`

// ✅ CORRECT
`seo:task:${taskId}:phase4:keyword_universe`
```

## Rationale

### Prefix (`seo:task`)
- **seo**: Namespace for all SEO-related keys
- **task**: Indicates task-scoped data (not global or user-scoped)

### Task ID
- Provides isolation between concurrent SEO onboarding tasks
- Prevents data collisions in multi-tenant environments
- Enables task-specific TTL and cleanup

### Phase Number Format (`phaseN`)
- Consistent numeric format without hyphens
- Easier to parse and validate
- Matches variable naming conventions

### Optional Suffix
- **No suffix for reading**: Maximizes compatibility across implementations
- **With suffix for writing**: Clearly identifies data type and purpose
- Allows multiple outputs per phase if needed in future

## Migration Notes

### Sprint 1.3 (Phase 4-5)
Already uses canonical pattern for outputs:
- `seo:task:${taskId}:phase4:keyword_universe`
- `seo:task:${taskId}:phase5:gap_analysis`

### Sprint 1.4 (Phase 6-7)
Updated from `seo:onboarding:${taskId}:phase-X` to canonical pattern:
- `seo:task:${taskId}:phase6:strategy`
- `seo:task:${taskId}:phase7:roadmap`

### Test Fixtures
Standardized to bare keys for phase data:
- `seo:task:${taskId}:phase1` (not `phase-1` or with suffix)
- Matches expected read pattern

## Validation Checklist

Before implementing new phase or modifying existing:

- [ ] Uses `seo:task` prefix (not `seo:onboarding`)
- [ ] Includes `${taskId}` for isolation
- [ ] Phase number format is `phaseN` (not `phase-N`)
- [ ] Read keys use bare pattern (no suffix)
- [ ] Write keys use descriptive suffix
- [ ] TTL set appropriately (typically 7 days)
- [ ] Keys documented in this file
- [ ] Tests use consistent pattern

## Examples

### Complete Phase Implementation
```typescript
export async function executePhaseX(config: PhaseXConfig): Promise<PhaseXResult> {
  const { redis, taskId } = config;

  // Read prerequisite data (no suffix)
  const prevPhaseRaw = await redis.get(`seo:task:${taskId}:phase${X-1}`);
  const prevPhaseData = prevPhaseRaw ? JSON.parse(prevPhaseRaw) : null;

  if (!prevPhaseData) {
    throw new Error(`Phase ${X-1} data not found. Run Phase ${X-1} first.`);
  }

  // Process data
  const result = await processPhase(prevPhaseData);

  // Write output (with descriptive suffix)
  const redisKey = `seo:task:${taskId}:phase${X}:result_name`;
  await redis.set(
    redisKey,
    JSON.stringify(result),
    'EX',
    7 * 24 * 3600  // 7 day TTL
  );

  return result;
}
```

### Test Fixture Setup
```typescript
async function setupTestData(redis: Redis, taskId: string) {
  // Setup Phase 1 data
  await redis.set(
    `seo:task:${taskId}:phase1`,  // Bare key for reading
    JSON.stringify({
      siteProfile: { domain: 'example.com' }
    })
  );

  // Setup Phase 4 data
  await redis.set(
    `seo:task:${taskId}:phase4`,  // Bare key for reading
    JSON.stringify({
      keywordClusters: [...]
    })
  );
}
```

## References

- Sprint 1.3 Implementation: `phase-4-keywords.ts`, `phase-5-gaps.ts`
- Sprint 1.4 Fix: `REDIS_KEY_FIX_REPORT.md`
- Test Examples: `phase-6-strategy.test.ts`, `phase-7-roadmap.test.ts`
