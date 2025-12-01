# Security Remediation Guide
## SEO Intelligence Phase 1 Sprint 1 - Blocking Issues

**Guide for:** Development team implementing security fixes
**Timeline:** Must complete before external API integration
**Estimated effort:** 3.5 hours for both blockers

---

## BLOCKER #1: H1 File-Based Cache Permission Vulnerability

### Quick Summary
Cache files created with world-readable permissions (0644). Fix: Restrict to owner-only (0600).

### Location
`planning/seo/lib/research-cache.ts`

### Current Vulnerable Code
**Lines 40-43 (ensureCacheDir method):**
```typescript
private ensureCacheDir(): void {
  if (!fs.existsSync(this.cacheDir)) {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    // VULNERABLE: Creates with default permissions (umask dependent)
  }
}
```

**Lines 142-155 (set method):**
```typescript
fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
// VULNERABLE: File written with 0644 permissions (rw-r--r--)
```

### Remediation Steps

#### Step 1: Fix ensureCacheDir()
Replace lines 40-43 with:
```typescript
private ensureCacheDir(): void {
  if (!fs.existsSync(this.cacheDir)) {
    // Create with restricted permissions (owner only)
    fs.mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
  } else {
    // Fix permissions on existing directory
    try {
      fs.chmodSync(this.cacheDir, 0o700);
    } catch (error) {
      console.warn(`Failed to set cache directory permissions: ${error}`);
    }
  }
}
```

#### Step 2: Fix set() method
After line 155 (`fs.writeFileSync(...)`), add:
```typescript
// Set file permissions to owner-only read/write
try {
  fs.chmodSync(cacheFile, 0o600);
} catch (error) {
  console.warn(`Failed to set cache file permissions: ${error}`);
}
```

#### Step 3: Fix get() method (cache file update)
In the `get()` method around line 96, after updating cache metadata:
```typescript
fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
// Add permission fix
try {
  fs.chmodSync(cacheFile, 0o600);
} catch (error) {
  console.warn(`Failed to set cache file permissions: ${error}`);
}
```

### Verification

Run these commands to verify the fix:
```bash
# Check directory permissions (should be rwx------)
ls -ld ~/.cfn/seo/cache/research/
# Expected: drwx------ ... ~/.cfn/seo/cache/research/

# Check file permissions (should be rw-------)
ls -l ~/.cfn/seo/cache/research/*.json | head -1
# Expected: -rw------- ... <filename>.json

# Verify no world-readable permissions
stat ~/.cfn/seo/cache/research/ | grep -i "access:"
# Should show no 'other' or 'group' read bits
```

### Test Case
```typescript
// Add to planning/seo/tests/security/cache-permissions.test.ts
describe('Cache File Permissions', () => {
  it('should create cache directory with 0o700 permissions', () => {
    const cache = new ResearchCache();
    const stats = fs.statSync(cache.cacheDir);

    // 0o700 = 448 in decimal
    const mode = stats.mode & parseInt('0777', 8);
    expect(mode).toBe(0o700);
  });

  it('should create cache files with 0o600 permissions', async () => {
    const cache = new ResearchCache();
    const query = { query: 'test', type: 'serp' as const };
    const result = { query, serpResults: [], metadata: {...} };

    await cache.set(query, result);
    const key = cache.generateCacheKey(query);
    const filePath = path.join(cache.cacheDir, `${key}.json`);

    const stats = fs.statSync(filePath);
    const mode = stats.mode & parseInt('0777', 8);
    expect(mode).toBe(0o600);
  });

  it('should restrict directory access to owner only', () => {
    const cacheDir = path.join(process.env.HOME || '/tmp', '.cfn/seo/cache/research');
    const stats = fs.statSync(cacheDir);

    // Verify no group or other permissions
    const mode = stats.mode;
    expect(mode & 0o077).toBe(0); // 077 = group + other permissions
  });
});
```

### Security Impact After Fix
- Cache directory: rwx------ (owner only)
- Cache files: rw------- (owner only)
- Local privilege escalation prevented
- Compliance with least privilege principle

---

## BLOCKER #2: H2 Rate Limiter Queue Priority Injection

### Quick Summary
Priority input not validated. Accepts invalid values like "CRITICAL" or numeric. Fix: Validate priority enum.

### Location
`planning/seo/lib/research-service.ts` - validateQuery() method

### Current Code
The validateQuery() method (lines 232-259) doesn't validate priority:
```typescript
private validateQuery(query: ResearchQuery): void {
  if (!query.query || typeof query.query !== 'string') {
    throw new ResearchError(
      'Query text is required',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  if (!['serp', 'content', 'hybrid'].includes(query.type)) {
    throw new ResearchError(
      `Invalid query type: ${query.type}`,
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  // MISSING: Priority validation
  // VULNERABLE: Invalid priority accepted

  if (query.type === 'content' && !query.options?.targetUrl) {
    throw new ResearchError(
      'targetUrl is required for content queries',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  if (query.options?.maxResults && query.options.maxResults < 1) {
    throw new ResearchError(
      'maxResults must be >= 1',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }
}
```

### Remediation Steps

#### Step 1: Add priority validation
After the `query.type` validation (after line 256), add:
```typescript
// Validate priority if provided
if (query.options?.priority) {
  const validPriorities = ['low', 'normal', 'high'];
  if (!validPriorities.includes(query.options.priority)) {
    throw new ResearchError(
      `Invalid priority: ${query.options.priority}. Must be one of: low, normal, high`,
      ResearchErrorCode.INVALID_QUERY,
      {
        invalidField: 'priority',
        providedValue: query.options.priority,
        validValues: validPriorities,
      }
    );
  }
}
```

#### Step 2: Complete updated validateQuery()
The method should now be:
```typescript
private validateQuery(query: ResearchQuery): void {
  if (!query.query || typeof query.query !== 'string') {
    throw new ResearchError(
      'Query text is required',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  if (!['serp', 'content', 'hybrid'].includes(query.type)) {
    throw new ResearchError(
      `Invalid query type: ${query.type}`,
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  // NEW: Validate priority if provided
  if (query.options?.priority) {
    const validPriorities = ['low', 'normal', 'high'];
    if (!validPriorities.includes(query.options.priority)) {
      throw new ResearchError(
        `Invalid priority: ${query.options.priority}. Must be one of: low, normal, high`,
        ResearchErrorCode.INVALID_QUERY,
        {
          invalidField: 'priority',
          providedValue: query.options.priority,
          validValues: validPriorities,
        }
      );
    }
  }

  if (query.type === 'content' && !query.options?.targetUrl) {
    throw new ResearchError(
      'targetUrl is required for content queries',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  if (query.options?.maxResults && query.options.maxResults < 1) {
    throw new ResearchError(
      'maxResults must be >= 1',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }
}
```

### Verification

Run these commands to test:
```bash
cd planning/seo
npx jest --testNamePattern="priority" --verbose
```

### Test Cases
```typescript
// Add to planning/seo/tests/security/rate-limit-validation.test.ts
describe('Rate Limiter Priority Validation', () => {
  let service: ResearchService;

  beforeEach(() => {
    service = new ResearchService();
  });

  it('should accept valid priority values', async () => {
    const validQueries = [
      { query: 'test', type: 'serp', options: { priority: 'low' } },
      { query: 'test', type: 'serp', options: { priority: 'normal' } },
      { query: 'test', type: 'serp', options: { priority: 'high' } },
    ];

    for (const query of validQueries) {
      expect(() => service.validateQuery(query)).not.toThrow();
    }
  });

  it('should reject invalid priority values', async () => {
    const invalidQueries = [
      { query: 'test', type: 'serp', options: { priority: 'CRITICAL' } },
      { query: 'test', type: 'serp', options: { priority: 'urgent' } },
      { query: 'test', type: 'serp', options: { priority: 999 } },
      { query: 'test', type: 'serp', options: { priority: 'critical' } },
    ];

    for (const query of invalidQueries) {
      expect(() => service.validateQuery(query)).toThrow(ResearchError);
      expect(() => service.validateQuery(query)).toThrow('Invalid priority');
    }
  });

  it('should reject numeric priority values', () => {
    const query = {
      query: 'test',
      type: 'serp',
      options: { priority: 3 }
    };

    expect(() => service.validateQuery(query)).toThrow();
  });

  it('should accept null/undefined priority (uses default)', () => {
    const query = {
      query: 'test',
      type: 'serp',
      options: {}
    };

    expect(() => service.validateQuery(query)).not.toThrow();
  });
});
```

### Security Impact After Fix
- Priority values restricted to enum: low, normal, high
- Priority spoofing prevented
- Queue ordering guaranteed to be predictable
- DoS via priority manipulation blocked

---

## Implementation Checklist

### For Developer Implementing H1
- [ ] Open `planning/seo/lib/research-cache.ts`
- [ ] Update `ensureCacheDir()` method (lines 40-43)
- [ ] Update `set()` method (add after line 155)
- [ ] Update `get()` method (add after cache metadata write)
- [ ] Run verification commands
- [ ] Create/run permission test cases
- [ ] Commit with message: "fix(seo-cache): Restrict cache file permissions to owner-only (H1)"

### For Developer Implementing H2
- [ ] Open `planning/seo/lib/research-service.ts`
- [ ] Update `validateQuery()` method (add priority validation)
- [ ] Create security test file: `planning/seo/tests/security/rate-limit-validation.test.ts`
- [ ] Run: `npm test -- rate-limit-validation`
- [ ] Test with invalid priority values manually
- [ ] Commit with message: "fix(seo-rate-limit): Add priority input validation (H2)"

### Post-Implementation
- [ ] Run full test suite: `npm test`
- [ ] Verify no regressions
- [ ] Code review by security specialist
- [ ] Merge to feature branch
- [ ] Document in SPRINT_*.md
- [ ] Update security audit status to RESOLVED

---

## Quick Reference: File Permission Numbers

| Permission | Number | Meaning |
|-----------|--------|---------|
| 0o700 | rwx------ | Owner: read+write+execute, Others: nothing |
| 0o600 | rw------- | Owner: read+write, Others: nothing |
| 0o644 | rw-r--r-- | VULNERABLE - world readable |
| 0o755 | rwxr-xr-x | VULNERABLE - world readable |

---

## FAQ

**Q: Why is 0o600 better than 0o644?**
A: 0o644 means "read+write for owner, read-only for group and others". 0o600 means "read+write for owner only, nothing for group and others". Cache files contain sensitive business data (competitor URLs, keywords), so only the service owner should read them.

**Q: What if the cache directory already exists with bad permissions?**
A: The fix includes `fs.chmodSync()` to fix existing directories. The service will automatically correct permissions on startup.

**Q: Can I ignore this for testing?**
A: No. These are production security issues. Test environments should follow the same security practices to catch issues early.

**Q: What if other code expects the old behavior?**
A: The changes are backwards compatible. We're only restricting file access, not changing the API or cache format.

**Q: How do I know if the fix worked?**
A: Run: `ls -l ~/.cfn/seo/cache/research/` and verify files show `rw-------` (owner-only).

---

## Related Issues

- **M1:** Error Message Information Disclosure (separate remediation in Sprint 2)
- **M2:** Cache Eviction Race Condition (separate remediation in Sprint 2)
- **L1:** Cache Key Namespace (nice-to-have in Sprint 2)

---

## Support

For questions on these fixes:
1. Review the full audit report: `planning/reports/security/SECURITY_AUDIT_SEO_PHASE1_SPRINT1.md`
2. Check test cases for expected behavior
3. Ask security specialist for clarification
