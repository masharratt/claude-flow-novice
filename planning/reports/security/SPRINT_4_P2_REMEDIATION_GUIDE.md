# Phase 4 Sprint 2: Security Remediation Guide

**Date**: 2025-12-01
**Status**: REQUIRES IMPLEMENTATION
**Total Effort**: 4 hours
**Target Completion**: Before merge to main

---

## Overview

This guide provides step-by-step remediation for 10 security vulnerabilities identified in P4-S2 security audit. Vulnerabilities are organized by priority and include complete code examples for each fix.

**P0 Critical**: 3 vulnerabilities (1 hour fix)
**P1 High**: 3 vulnerabilities (1.5 hours fix)
**P2 Medium**: 3 vulnerabilities (1.5 hours fix)
**P3 Low**: 1 vulnerability (15 min fix)

---

## Critical Fixes (P0)

### Fix 1: Remove Eval Usage in Shell Script

**Location**: `planning/seo/scripts/sync-patterns.sh` (line 196-260)
**Effort**: 30 minutes
**Impact**: Eliminates arbitrary code execution vulnerability

**Current Code** (VULNERABLE):
```bash
local node_cmd="node -e \"
const { syncPatterns, ... } = require('$LIB_DIR/pattern-sync.ts');
...
const options = {
  projectId: '$project_id',
  direction: '$direction',
  mode: '$mode',
  patternTypes: '$pattern_types' ? '$pattern_types'.split(',') : undefined,
  lastSyncTimestamp: '$last_sync' ? parseInt('$last_sync', 10) : undefined,
  force: $force,
  authorizedBy: '$authorized_by' || undefined,  # INJECTION POINT
  verbose: $verbose,
};
...
if result=$(eval "$node_cmd" 2>&1); then
```

**Fixed Code**:
```bash
# Create Node.js script with heredoc (no string interpolation in script)
local node_script=$(cat <<'EOFNODESCRIPT'
const { syncPatterns, pullPatternsFromGlobal, pushPatternsToGlobal } = require(process.env.LIB_DIR);
const Redis = require('ioredis');
const fs = require('fs');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});

const options = {
  projectId: process.env.PROJECT_ID,
  direction: process.env.DIRECTION,
  mode: process.env.MODE,
  patternTypes: process.env.PATTERN_TYPES ? process.env.PATTERN_TYPES.split(',') : undefined,
  lastSyncTimestamp: process.env.LAST_SYNC ? parseInt(process.env.LAST_SYNC, 10) : undefined,
  force: process.env.FORCE === 'true',
  authorizedBy: process.env.AUTHORIZED_BY || undefined,
  verbose: process.env.VERBOSE === 'true',
};

async function main() {
  try {
    let result;
    if (options.direction === 'pull') {
      result = await pullPatternsFromGlobal({
        projectId: options.projectId,
        patternTypes: options.patternTypes,
        incremental: options.mode === 'incremental',
        lastSyncTimestamp: options.lastSyncTimestamp,
        forceOverwrite: options.force,
        verbose: options.verbose,
      }, redis, process.env.REDIS_LOCAL_STORE, process.env.REDIS_GLOBAL_STORE);
    } else if (options.direction === 'push') {
      result = await pushPatternsToGlobal({
        projectId: options.projectId,
        patternTypes: options.patternTypes,
        forcePromotion: options.force,
        authorizedBy: options.authorizedBy,
        verbose: options.verbose,
      }, redis, process.env.REDIS_LOCAL_STORE, process.env.REDIS_GLOBAL_STORE);
    } else {
      result = await syncPatterns(options, redis, process.env.REDIS_LOCAL_STORE, process.env.REDIS_GLOBAL_STORE);
    }

    console.log(JSON.stringify(result, null, 2));
    await redis.quit();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Sync failed:', error.message);
    await redis.quit();
    process.exit(1);
  }
}

main();
EOFNODESCRIPT
)

# Execute with environment variables (no eval)
if result=$(LIB_DIR="$LIB_DIR" \
  REDIS_HOST="$REDIS_HOST" \
  REDIS_PORT="$REDIS_PORT" \
  PROJECT_ID="$PROJECT_ID" \
  DIRECTION="$DIRECTION" \
  MODE="$MODE" \
  PATTERN_TYPES="$PATTERN_TYPES" \
  LAST_SYNC="$LAST_SYNC" \
  FORCE="$FORCE" \
  AUTHORIZED_BY="$AUTHORIZED_BY" \
  VERBOSE="$VERBOSE" \
  REDIS_LOCAL_STORE="$REDIS_LOCAL_STORE" \
  REDIS_GLOBAL_STORE="$REDIS_GLOBAL_STORE" \
  node -e "$node_script" 2>&1); then
```

**Key Changes**:
- Use heredoc with `'EOFNODESCRIPT'` (no variable expansion)
- Pass all parameters via environment variables
- No eval or string interpolation in script
- Reduces attack surface from 5 injection points to 0

---

### Fix 2: Add Pattern ID Validation

**Location**: `planning/seo/lib/pattern-sync.ts` (lines 295, 363, 463, 502)
**Effort**: 15 minutes
**Impact**: Prevents pattern ID injection attacks

**Add at Module Top** (after imports):
```typescript
const VALID_PATTERN_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
```

**In pullPatternsFromGlobal()** - After line 295:
```typescript
for (const globalKey of validKeys) {
  try {
    const globalPatternData = await redis.hgetall(globalKey);
    if (!globalPatternData || Object.keys(globalPatternData).length === 0) {
      continue;
    }

    const patternId = globalKey.replace(`${globalStore}:`, '');

    // ADD THIS VALIDATION:
    if (!VALID_PATTERN_ID_REGEX.test(patternId)) {
      failedPatterns.push(patternId);
      if (options.verbose) {
        console.warn(`[PatternSync] Skipping pattern with invalid ID format`);
      }
      continue;
    }
    // END ADDITION

    // Filter by pattern type if specified
    if (
      options.patternTypes &&
      ...
```

**In pushPatternsToGlobal()** - After line 463:
```typescript
for (const localKey of validKeys) {
  try {
    const localPatternData = await redis.hgetall(localKey);
    if (!localPatternData || Object.keys(localPatternData).length === 0) {
      continue;
    }

    const patternId = localKey.replace(`${localStore}:`, '');

    // ADD VALIDATION HERE (same as pull)
    if (!VALID_PATTERN_ID_REGEX.test(patternId)) {
      failedPatterns.push(patternId);
      if (options.verbose) {
        console.warn(`[PatternSync] Skipping pattern with invalid ID format`);
      }
      continue;
    }
    // END ADDITION
```

**In detectConflict()** - At function start (around line 785):
```typescript
async function detectConflict(
  localData: Record<string, string>,
  globalData: Record<string, string>,
  patternId: string
): Promise<PatternConflict | null> {
  // ADD VALIDATION:
  if (!VALID_PATTERN_ID_REGEX.test(patternId)) {
    return null;  // Skip invalid pattern IDs
  }
  // END ADDITION
```

---

### Fix 3: Add Timestamp Validation

**Location**: `planning/seo/scripts/sync-patterns.sh`
**Effort**: 20 minutes
**Impact**: Prevents negative timestamp DoS attack

**Add Function** (after validate_project_id, around line 118):
```bash
validate_last_sync() {
    local last_sync="$1"

    if [[ -z "$last_sync" ]]; then
        return 0  # Optional parameter, skip validation
    fi

    # Must be numeric
    if ! [[ "$last_sync" =~ ^[0-9]+$ ]]; then
        log_error "Last sync timestamp must be non-negative integer: $last_sync"
        return 1
    fi

    # Cannot be in future (allow 5 minute tolerance for clock skew)
    local now_seconds=$(($(date +%s) * 1000))
    local tolerance=$((5 * 60 * 1000))  # 5 minutes in milliseconds

    if (( last_sync > now_seconds + tolerance )); then
        log_error "Last sync timestamp cannot be in future: $last_sync (now: $now_seconds)"
        return 1
    fi

    return 0
}
```

**Add Validation Call** (in VALIDATION section, around line 370):
```bash
# Validate optional parameters
[[ -n "$LAST_SYNC" ]] && validate_last_sync "$LAST_SYNC" || exit 1
```

**Also Add in TypeScript** - In pullPatternsFromGlobal() after line 268:
```typescript
// Validate optional numeric parameters
if (options.lastSyncTimestamp !== undefined) {
  if (!Number.isFinite(options.lastSyncTimestamp) || options.lastSyncTimestamp < 0) {
    throw new PatternSyncError(
      'Invalid lastSyncTimestamp: must be non-negative integer',
      'INVALID_OPTIONS'
    );
  }
}
```

---

## High Priority Fixes (P1)

### Fix 4: Safe JSON Parsing

**Location**: `planning/seo/lib/pattern-sync.ts` (lines 859-860)
**Effort**: 10 minutes

**Add Helper Function** (near helper section, around line 770):
```typescript
/**
 * Safely parse JSON with fallback to default value
 */
function safeJsonParse(json: string, defaultValue: any = {}): any {
  if (!json) {
    return defaultValue;
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn(`[PatternSync] Failed to parse JSON: ${json.substring(0, 50)}...`);
    return defaultValue;
  }
}
```

**Update redisDataToPattern()** (lines 859-860):
```typescript
// BEFORE:
evidence: data.evidence ? JSON.parse(data.evidence) : [],
metadata: data.metadata ? JSON.parse(data.metadata) : {},

// AFTER:
evidence: safeJsonParse(data.evidence, []),
metadata: safeJsonParse(data.metadata, {}),
```

---

### Fix 5: Pattern Type Whitelist

**Location**: `planning/seo/lib/pattern-sync.ts`
**Effort**: 15 minutes

**Add Constant** (near top of file after VALID_PATTERN_ID_REGEX):
```typescript
const VALID_PATTERN_TYPES = [
  'title-tags',
  'meta-description',
  'schema-markup',
  'heading-structure',
  'internal-linking',
  'anchor-text',
  'alt-text',
  'content-quality',
  'mobile-optimization',
  'page-speed',
  // Add all known pattern types from your system
];
```

**Add Validation** (in pullPatternsFromGlobal, around line 270):
```typescript
// Validate pattern types whitelist
if (options.patternTypes && options.patternTypes.length > 0) {
  const invalidTypes = options.patternTypes.filter(
    (type) => !VALID_PATTERN_TYPES.includes(type)
  );
  if (invalidTypes.length > 0) {
    throw new PatternSyncError(
      `Invalid pattern types: ${invalidTypes.join(', ')}`,
      'INVALID_OPTIONS'
    );
  }
}
```

**Repeat in pushPatternsToGlobal** (around line 430)

---

### Fix 6: Redis SCAN Implementation

**Location**: `planning/seo/lib/pattern-sync.ts` (lines 280, 448)
**Effort**: 45 minutes
**Note**: Architectural improvement, lower immediate priority

**Add Helper Function**:
```typescript
/**
 * Scan patterns from Redis with pagination
 * Yields batches of keys without loading all into memory
 */
async function* scanPatternKeys(
  redis: Redis,
  pattern: string,
  batchSize: number = 100
): AsyncGenerator<string[]> {
  let cursor = '0';
  do {
    const [newCursor, keys] = await redis.scan(
      cursor,
      'MATCH', pattern,
      'COUNT', batchSize
    );
    cursor = newCursor;
    if (keys.length > 0) {
      yield keys;
    }
  } while (cursor !== '0');
}
```

**Replace in pullPatternsFromGlobal()** (around line 280):
```typescript
// BEFORE:
const globalPatternKeys = await redis.keys(`${globalStore}:*`);
const validKeys = globalPatternKeys.filter((key) => /^[a-zA-Z0-9:_-]+$/.test(key));

for (const globalKey of validKeys) {

// AFTER:
for await (const batch of scanPatternKeys(redis, `${globalStore}:*`, 100)) {
  const validKeys = batch.filter((key) => /^[a-zA-Z0-9:_-]+$/.test(key));

  for (const globalKey of validKeys) {
    // ... existing loop code
  }
}
```

---

## Medium Priority Fixes (P2)

### Fix 7: Sanitize Error Messages

**Location**: `planning/seo/lib/pattern-sync.ts` (lines 392-395)
**Effort**: 10 minutes

**Update catch blocks**:
```typescript
// BEFORE:
} catch (error) {
  throw new PatternSyncError(
    `Pull operation failed: ${error instanceof Error ? error.message : String(error)}`,
    'PULL_FAILED',
    error  // Includes stack trace
  );
}

// AFTER:
} catch (error) {
  // Log detailed error internally
  if (options.verbose) {
    console.error('[PatternSync] Pull failed:', error);
  }

  // Return generic error to caller (no stack trace)
  throw new PatternSyncError(
    'Pull operation failed. Please check server logs for details.',
    'PULL_FAILED'
    // Omit error object - don't expose internal details
  );
}
```

---

### Fix 8: Validate Authorization Identity

**Location**: `planning/seo/lib/pattern-sync.ts` (line 436)
**Effort**: 10 minutes

**Add Email Validation**:
```typescript
const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In pushPatternsToGlobal, after line 436:
if (options.forcePromotion && !options.authorizedBy) {
  throw new PatternSyncError(
    'Force promotion requires authorizedBy field',
    'INVALID_OPTIONS'
  );
}

// ADD THIS:
if (options.authorizedBy && !VALID_EMAIL_REGEX.test(options.authorizedBy)) {
  throw new PatternSyncError(
    `Invalid authorization identity format: ${options.authorizedBy}`,
    'INVALID_OPTIONS'
  );
}
```

**Also in Shell Script** - Add validation function (around line 118):
```bash
validate_authorized_by() {
    local authorized_by="$1"

    if [[ -z "$authorized_by" ]]; then
        return 0  # Optional in pull mode
    fi

    # Basic email format validation
    if ! [[ "$authorized_by" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        log_error "Invalid authorization identity format (must be email): $authorized_by"
        return 1
    fi

    return 0
}
```

---

### Fix 9: Add Security Test Cases

**Location**: `planning/seo/tests/test-pattern-sync.sh`
**Effort**: 60 minutes

**Add Tests**:
```bash
# Test 1: Invalid project ID injection
test_invalid_project_id() {
    log_info "GIVEN: Invalid project ID with SQL injection payload"
    local result
    result=$(node -e "
    const { pullPatternsFromGlobal } = require('./lib/pattern-sync.ts');
    async function test() {
      try {
        await pullPatternsFromGlobal(
          { projectId: \"'; DROP TABLE patterns; //\" },
          redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS'
        );
        return 'FAIL: Injection accepted';
      } catch (error) {
        return 'PASS: Injection rejected';
      }
    }
    test().then(console.log);
    " 2>&1 || true)

    if [[ "$result" == *"PASS"* ]]; then
        log_success "Invalid project ID rejected"
        return 0
    fi
    log_error "Invalid project ID was accepted"
    return 1
}

# Test 2: Negative timestamp DoS
test_negative_timestamp_dos() {
    log_info "GIVEN: Negative timestamp in incremental sync"

    local result
    result=$(node -e "
    async function test() {
      const { pullPatternsFromGlobal } = require('./lib/pattern-sync.ts');
      try {
        await pullPatternsFromGlobal(
          { 
            projectId: 'test', 
            incremental: true, 
            lastSyncTimestamp: -9999999999999 
          },
          redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS'
        );
        return 'FAIL: Negative timestamp accepted';
      } catch (error) {
        return 'PASS: Negative timestamp rejected';
      }
    }
    test().then(console.log);
    " 2>&1 || true)

    if [[ "$result" == *"PASS"* ]]; then
        log_success "Negative timestamp rejected"
        return 0
    fi
    return 1
}

# Test 3: Malformed JSON handling
test_malformed_json() {
    log_info "GIVEN: Malformed JSON in pattern metadata"
    $REDIS_CLI_CMD HSET "$REDIS_GLOBAL_PATTERNS:malformed" \
        pattern_id "malformed" \
        metadata '{"incomplete":' \
        evidence '[1, 2, 3' \
        confidence "0.8" > /dev/null

    log_info "WHEN: Pull with malformed JSON"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Should handle gracefully"
    if jq -e '.success' "$SYNC_RESULTS" > /dev/null 2>&1; then
        log_success "Malformed JSON handled safely"
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:malformed" > /dev/null
        return 0
    fi
    return 1
}

# Test 4: Invalid pattern type filter
test_invalid_pattern_type_filter() {
    log_info "GIVEN: Invalid pattern type in filter"

    local result
    result=$(node -e "
    async function test() {
      const { pullPatternsFromGlobal } = require('./lib/pattern-sync.ts');
      try {
        await pullPatternsFromGlobal(
          { 
            projectId: 'test', 
            patternTypes: [\"'; DROP TABLE patterns; //\"] 
          },
          redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS'
        );
        return 'FAIL: Invalid type accepted';
      } catch (error) {
        return 'PASS: Invalid type rejected';
      }
    }
    test().then(console.log);
    " 2>&1 || true)

    if [[ "$result" == *"PASS"* ]]; then
        log_success "Invalid pattern type rejected"
        return 0
    fi
    return 1
}

# Test 5: Authorization identity validation
test_invalid_auth_identity() {
    log_info "GIVEN: Invalid authorization identity format"

    local result
    result=$(node -e "
    async function test() {
      const { pushPatternsToGlobal } = require('./lib/pattern-sync.ts');
      try {
        await pushPatternsToGlobal(
          { 
            projectId: 'test', 
            forcePromotion: true,
            authorizedBy: 'not-an-email'
          },
          redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS'
        );
        return 'FAIL: Invalid auth accepted';
      } catch (error) {
        return 'PASS: Invalid auth rejected';
      }
    }
    test().then(console.log);
    " 2>&1 || true)

    if [[ "$result" == *"PASS"* ]]; then
        log_success "Invalid authorization identity rejected"
        return 0
    fi
    return 1
}

# Test 6: Pattern ID validation
test_pattern_id_injection() {
    log_info "GIVEN: Redis key with injection payload"
    $REDIS_CLI_CMD HSET "pattern:global:malicious\"; DROP TABLE patterns; //" \
        pattern_id 'test' \
        confidence '0.9' > /dev/null

    log_info "WHEN: Sync patterns"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Should skip injected pattern ID"
    if jq -e '.success' "$SYNC_RESULTS" > /dev/null 2>&1; then
        log_success "Pattern ID injection handled safely"
        $REDIS_CLI_CMD DEL "pattern:global:malicious\"; DROP TABLE patterns; //" > /dev/null 2>&1 || true
        return 0
    fi
    return 1
}
```

---

## Verification Checklist

### Before Merge

- [ ] All P0 fixes applied and tested
- [ ] All P1 fixes applied and tested
- [ ] All security tests added and passing
- [ ] No CVSS ≥7.0 vulnerabilities remain
- [ ] Follow-up security audit score ≥0.90
- [ ] Code review approved
- [ ] All tests passing: `npm test` + test suite

### Testing Commands

```bash
# Run full test suite
npm run test:unit
npm run test:integration
./planning/seo/tests/test-pattern-sync.sh

# Run security tests only
grep "test_invalid\|test_negative\|test_malformed" ./planning/seo/tests/test-pattern-sync.sh

# Manual security validation
./planning/seo/scripts/sync-patterns.sh --help  # Should not error
./planning/seo/scripts/sync-patterns.sh \
  --direction pull \
  --mode full \
  --project "test; DROP TABLE;" \
  --dry-run  # Should reject invalid project ID
```

---

## Rollback Plan

If any fix introduces regressions:

1. Revert changes: `git checkout -- planning/seo/`
2. Verify tests pass with original code
3. File regression bug with reproduction steps
4. Implement fix in isolated PR

---

## Success Criteria

**Security Score**: 0.78 → 0.90+
**Remaining Critical Issues**: 3 → 0
**Test Coverage**: Current → 90%+ for security paths
**CVSS Average**: 7.3 → <5.0

---

**Estimated Total Time**: 4 hours
**Recommend**: 1-person, 1 day effort block
**Review**: Security specialist + code reviewer
