# Pre-commit Hook: Database Secret Scanning

## Overview

The pre-commit hook automatically scans SQLite database files for secrets, API keys, passwords, and other sensitive data before allowing commits. This prevents accidental leakage of credentials in version control.

**Status**: Production Ready
**Version**: 1.0
**Last Updated**: 2025-10-11

---

## Installation

### Quick Install

```bash
bash scripts/install-pre-commit-hook.sh
```

### Manual Installation

```bash
# Copy hook to git hooks directory
cp config/hooks/pre-commit-db-scan .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## What It Checks

The hook scans staged database files for the following secret patterns:

### API Keys
- `api_key`, `api-key`, `apiKey`
- `ZAI_API_KEY`
- `ANTHROPIC_API_KEY`
- Anthropic API keys: `sk-ant-*`

### Authentication
- `password`
- `Bearer` tokens
- `auth_key`, `auth-key`
- Session tokens: `sess-*`

### Credentials
- `secret`
- `token`
- `private_key`, `private-key`
- `credential`

---

## How It Works

1. **Git Commit Triggered**: When you run `git commit`, the hook executes automatically
2. **Find Staged Databases**: Scans for `*.db` and `*.sqlite` files in the commit
3. **Dump Database Content**: Uses `sqlite3 .dump` to extract all data
4. **Pattern Matching**: Checks content against secret patterns (case-insensitive)
5. **Block or Allow**:
   - ✅ No secrets found → Commit proceeds
   - ❌ Secrets detected → Commit blocked with detailed report

---

## Example Output

### Clean Database (Allowed)

```bash
🔍 Scanning database files for secrets...
Found database files:
.artifacts/database/swarm-memory.db

Scanning: .artifacts/database/swarm-memory.db
  ✓ Scan complete for .artifacts/database/swarm-memory.db

✅ Database secret scan passed - no secrets detected
```

### Secrets Detected (Blocked)

```bash
🔍 Scanning database files for secrets...
Found database files:
memory/coordination.db

Scanning: memory/coordination.db
  ❌ ERROR: Found potential secret matching pattern: api[_-]?key
    INSERT INTO config VALUES ('ZAI_API_KEY', 'sk-ant-1234567890abc***');

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ COMMIT BLOCKED: 1 potential secret(s) found in database files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 Security Issue: Database files contain potential secrets or API keys

To fix:
  1. Remove secrets from database files before committing
  2. Use environment variables for API keys instead
  3. Sanitize data before storing in SQLite (see sanitizeForStorage())
  4. If false positive, add pattern to whitelist in this hook
```

---

## Bypassing the Hook (NOT RECOMMENDED)

If you absolutely must commit a database with detected patterns:

```bash
git commit --no-verify
```

**⚠️ Warning**: Only use `--no-verify` if you're certain the detected patterns are false positives. Committing secrets can lead to:
- Security breaches
- Unauthorized API usage
- Data leaks
- Compliance violations

---

## False Positives

If the hook detects legitimate data (not actual secrets), you can:

### Option 1: Whitelist Pattern (Recommended)

Edit `.git/hooks/pre-commit` and add exception logic:

```bash
# Example: Allow "api_key" in documentation
if echo "$db" | grep -q "docs/"; then
  echo "  ℹ️  Skipping docs database (whitelisted)"
  continue
fi
```

### Option 2: Sanitize Before Storage

Use the `sanitizeForStorage()` function before storing data:

```typescript
// Before storing in SQLite
function sanitizeForStorage(data: any): any {
  const secrets = [
    /api[_-]?key/i,
    /password/i,
    /secret/i,
    /token/i
  ];

  const serialized = JSON.stringify(data);

  for (const pattern of secrets) {
    if (pattern.test(serialized)) {
      throw new Error(`Cannot store data containing secrets: ${pattern}`);
    }
  }

  return data;
}
```

---

## Integration with .gitignore

The hook works alongside `.gitignore` allowlist patterns:

```gitignore
# Block all databases by default
*.db
*.sqlite
*.db-journal
*.db-wal

# Allow specific project databases (protected by pre-commit hook)
!.artifacts/database/swarm-memory.db
!.artifacts/database/coordination-state.db
!memory/project-context.db

# Still block temporary/cache databases
**/*-temp.db
**/*-cache.db
```

---

## Uninstallation

```bash
# Remove the hook
rm .git/hooks/pre-commit

# Restore backup if created
mv .git/hooks/pre-commit.backup-<timestamp> .git/hooks/pre-commit
```

---

## Troubleshooting

### Hook Not Running

**Problem**: Commits proceed without scanning

**Solutions**:
1. Check hook is executable: `ls -la .git/hooks/pre-commit`
2. Make executable: `chmod +x .git/hooks/pre-commit`
3. Verify git config: `git config --get core.hooksPath`

### sqlite3 Command Not Found

**Problem**: Hook fails with "sqlite3: command not found"

**Solutions**:
- Ubuntu/Debian: `sudo apt-get install sqlite3`
- macOS: `brew install sqlite`
- Windows (WSL): `sudo apt-get install sqlite3`

### Hook Runs Too Slow

**Problem**: Scanning large databases takes too long

**Solutions**:
1. Add database to `.gitignore` (don't commit it)
2. Split large databases into smaller files
3. Use temporary databases for development (blocked by `*-temp.db` pattern)

---

## Security Best Practices

### 1. Environment Variables

Store secrets in environment variables, not databases:

```typescript
// ❌ BAD: Storing API key in database
await db.run('INSERT INTO config VALUES (?, ?)', ['api_key', 'sk-ant-1234']);

// ✅ GOOD: Use environment variable
const apiKey = process.env.ANTHROPIC_API_KEY;
```

### 2. Encrypted Storage

If you must store secrets in databases:

```typescript
import crypto from 'crypto';

function encryptSecret(secret: string, key: string): string {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  return cipher.update(secret, 'utf8', 'hex') + cipher.final('hex');
}

// Store encrypted (but still avoid if possible)
const encrypted = encryptSecret(apiKey, process.env.ENCRYPTION_KEY);
await db.run('INSERT INTO config VALUES (?, ?)', ['api_key', encrypted]);
```

### 3. Separate Development/Production Databases

- Development: Use mock/test API keys (can commit)
- Production: Use environment variables (never commit)

---

## Related Documentation

- [COORDINATOR_COMMUNICATION_REQUIREMENTS.md](../planning/COORDINATOR_COMMUNICATION_REQUIREMENTS.md) - Memory database requirements
- [Post-Edit Pipeline](../config/hooks/post-edit-pipeline.js) - Hook integration
- [CLAUDE.md](../CLAUDE.md) - Project security standards

---

## Support

**Issues**: File a GitHub issue with:
- Hook output (sanitized to remove actual secrets)
- Database file size
- Git version: `git --version`
- SQLite version: `sqlite3 --version`

**Questions**: See [COORDINATOR_COMMUNICATION_REQUIREMENTS.md](../planning/COORDINATOR_COMMUNICATION_REQUIREMENTS.md) Section "Memory Database Requirements"

---

**Version**: 1.0
**Maintainer**: Claude Flow DevOps Team
**License**: Same as claude-flow-novice project
