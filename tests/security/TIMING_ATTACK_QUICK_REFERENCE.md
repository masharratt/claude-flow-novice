# Timing Attack Prevention - Quick Reference

## What is a Timing Attack?

Timing attacks exploit measurable differences in execution time to extract secret information. In hash comparison, standard string comparison (`===`) exits early when characters don't match, creating timing side-channels.

---

## The Problem

**Vulnerable Code:**
```typescript
// ❌ VULNERABLE - Timing leak
if (hashA === hashB) {
  return true;
}
```

**Why it's vulnerable:**
- Comparison stops at first character mismatch
- Timing varies based on match position
- Attacker can extract hash bit-by-bit

**Measured Timing Variance:**
- Position-based leakage: **26.37%**
- Length-based leakage: **23.56%**
- Character-level leakage: **10.60%**

---

## The Solution

**Secure Code:**
```typescript
// ✅ SECURE - Constant-time
import * as crypto from 'crypto';

function constantTimeCompare(a: string, b: string): boolean {
  // Fast path for length mismatch (OK to leak length)
  if (a.length !== b.length) {
    return false;
  }

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(a, 'utf8'),
    Buffer.from(b, 'utf8')
  );
}

// Usage
if (!constantTimeCompare(hashA, hashB)) {
  throw new Error('Hash mismatch');
}
```

**Why it works:**
- `crypto.timingSafeEqual` compares all bytes regardless of mismatches
- Execution time independent of match position
- No timing side-channel

**Performance:**
- Overhead: **0.841μs** (negligible)
- No performance-security tradeoff

---

## When to Use Constant-Time Comparison

**Required for:**
- ✅ Password hashes
- ✅ API tokens / secrets
- ✅ File integrity hashes (SHA-256)
- ✅ HMAC verification
- ✅ Digital signatures
- ✅ Session tokens

**Not required for:**
- ❌ Non-sensitive data comparison
- ❌ Public identifiers
- ❌ Debug logging
- ❌ Performance-critical paths (where security isn't a concern)

---

## Attack Example

**Hash to extract:** `a7b3c5d1...` (64 hex characters)

**Standard comparison (vulnerable):**
```
Attempt 1: 'a' at pos 0 → 1500ns (slower, match!)
Attempt 2: 'b' at pos 0 → 800ns  (faster, mismatch)
Attempt 3: '7' at pos 1 → 1500ns (slower, match!)
...
Result: Extract hash in ~1,024 attempts (64 * 16)
Time: ~1 second at 1ms/attempt
```

**Constant-time comparison (secure):**
```
All attempts: ~750ns (consistent timing)
No timing difference reveals match position
Attacker must brute-force 16^64 combinations
Time: Heat death of universe
```

---

## Testing for Timing Attacks

**Run security tests:**
```bash
npm test -- tests/security/timing-attack-backup-manager.test.ts
```

**Check variance thresholds:**
- Position independence: <10%
- Length handling: <15%
- Character position: <10%
- Coefficient of variation: <0.5

**Example test:**
```typescript
const SAMPLES = 150;
const timingsStart: number[] = [];
const timingsEnd: number[] = [];

// Measure timing with difference at start vs end
for (let i = 0; i < SAMPLES; i++) {
  const start = process.hrtime.bigint();
  crypto.timingSafeEqual(Buffer.from(hashA), Buffer.from(hashB));
  const end = process.hrtime.bigint();
  timingsStart.push(Number(end - start));
}

// Calculate variance
const stats = calculateTimingStats(timingsStart);
expect(stats.coefficientOfVariation).toBeLessThan(0.5);
```

---

## Common Pitfalls

### ❌ Pitfall 1: Early return on length mismatch
```typescript
// VULNERABLE - Leaks length information
if (a === b) return true;
```

**Fix:** Length leakage is acceptable (standard practice), but character comparison must be constant-time.

### ❌ Pitfall 2: Using substring comparison
```typescript
// VULNERABLE - Character-by-character leakage
for (let i = 0; i < a.length; i++) {
  if (a[i] !== b[i]) return false;
}
```

**Fix:** Use `crypto.timingSafeEqual` instead of loops.

### ❌ Pitfall 3: Assuming JIT optimization prevents leakage
```typescript
// VULNERABLE - JIT doesn't fix timing leaks
return a.split('').every((c, i) => c === b[i]);
```

**Fix:** Only cryptographic primitives guarantee constant-time.

### ❌ Pitfall 4: Using === for hex-encoded hashes
```typescript
// VULNERABLE - Standard comparison
const hexHash = crypto.createHash('sha256').update(data).digest('hex');
if (hexHash === expectedHash) { ... }
```

**Fix:** Use `constantTimeCompare(hexHash, expectedHash)`.

---

## CI/CD Integration

**Add to GitHub Actions:**
```yaml
- name: Run Security Tests
  run: npm test -- tests/security/timing-attack-backup-manager.test.ts

- name: Check Timing Variance Threshold
  run: |
    if grep -q "FAIL" test-results.txt; then
      echo "❌ Timing attack vulnerability detected"
      exit 1
    fi
```

**Prevent regression:**
- Run security tests on every PR
- Fail build if variance exceeds thresholds
- Generate security test reports in CI artifacts

---

## References

**Node.js Crypto:**
- [`crypto.timingSafeEqual`](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)

**Security Standards:**
- CWE-208: Observable Timing Discrepancy
- OWASP: Timing Attack Prevention

**Academic Research:**
- "Remote Timing Attacks are Practical" (Brumley & Boneh, 2003)
- "Cache-Timing Attacks on AES" (Bernstein, 2005)

**Test Reports:**
- Full Report: `tests/security/TIMING_ATTACK_TEST_REPORT.md`
- Executive Summary: `tests/security/TIMING_ATTACK_EXECUTIVE_SUMMARY.md`

---

## Quick Checklist

Before deploying code that compares secrets:

- [ ] Using `crypto.timingSafeEqual` for hash comparison?
- [ ] Tested with timing attack test suite?
- [ ] Timing variance < 10%?
- [ ] Performance overhead acceptable?
- [ ] Security tests added to CI/CD?
- [ ] Code review approved by security team?

---

**Last Updated:** 2025-11-17
**Test Suite Version:** 1.0.0
**Maintained by:** Security Testing Team
