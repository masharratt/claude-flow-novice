# Git Hooks: Credential Exposure Prevention

Automated pre-commit security validation to prevent accidental credential exposure.

## Overview

This system provides a multi-layered defense against credential exposure:

1. **Pre-Commit Hook** (.git/hooks/pre-commit)
   - Scans staged files before commit
   - Blocks commits with exposed credentials
   - Provides clear remediation guidance

2. **Installation Script** (.claude/hooks/install-git-hooks.sh)
   - Automated hook installation
   - Validation and verification
   - Project setup

3. **Integration Points**
   - Post-edit credential scanner (.claude/hooks/validators/credential-scanner.sh)
   - CI/CD credential scanning (.github/workflows/security-credential-scan.yml)
   - Git history scanning (git-secrets)

## Installation

### Quick Start

```bash
bash .claude/hooks/install-git-hooks.sh
```

### With Force Overwrite (CI/CD)

```bash
bash .claude/hooks/install-git-hooks.sh --force
```

### Manual Installation

```bash
# Copy pre-commit hook
cp .git/hooks/pre-commit .git/hooks/pre-commit.bak  # Backup existing
chmod +x .git/hooks/pre-commit

# Verify installation
ls -l .git/hooks/pre-commit
```

## Detected Credential Patterns

### API Keys

| Provider | Pattern | Example |
|----------|---------|---------|
| Anthropic | `sk-ant-[a-zA-Z0-9_-]{40,}` | `sk-ant-v1-abcd1234...` |
| Z.ai | `sk-zai-[a-zA-Z0-9._-]{20,}` | `sk-zai-12345678...` |
| NPM | `npm_[a-zA-Z0-9]{36}` | `npm_1a2b3c4d5e6f...` |
| Trigger.dev | `tr_dev_[a-zA-Z0-9]{16,}` | `tr_dev_abc123...` |
| Google | `AIzaSy[a-zA-Z0-9_-]{33}` | `AIzaSy_1234567...` |
| XAi/Grok | `xai-[a-zA-Z0-9]{32,}` | `xai-abc123...` |

### Z.ai Token Formats

| Format | Pattern |
|--------|---------|
| Current | `[a-zA-Z0-9]{32,}\.SUs3hnpAZAGsQDHX` |
| Legacy | `[a-zA-Z0-9]{32,}\.QO8R0JxF4fucsoWL` |
| Legacy | `[a-zA-Z0-9]{32,}\.gDXkwrMNlYcqE8mF` |

### Environment Variable Assignments

Detects suspicious assignments like:

```bash
ANTHROPIC_API_KEY="sk-ant-..."
ZAI_API_KEY="sk-zai-..."
REDIS_PASSWORD="password123"
POSTGRES_PASSWORD="secure_pass"
```

### Database Credentials

- PostgreSQL passwords
- MySQL passwords
- MongoDB passwords
- Redis passwords

### JSON/YAML Structures

```json
{
  "api_key": "long_credential_string",
  "apiKey": "secret_value",
  "auth_token": "bearer_token",
  "password": "database_password"
}
```

## Whitelisted Patterns

The following patterns are automatically whitelisted and won't trigger blocks:

| Pattern | Usage |
|---------|-------|
| `[REDACTED]` | Already redacted credentials |
| `YOUR_API_KEY` | Documentation placeholders |
| `YOUR_.*_KEY` | Generic placeholders |
| `CHANGE_ME` | Configuration templates |
| `test_key` / `mock_key` | Test credentials |
| `sk-ant-mock` | Mock Anthropic keys |
| `npm_MockTestKey` | Mock NPM keys |
| `example.com` | Example domains |

## Usage

### Normal Development

```bash
# Stage and commit files
git add src/feature.ts docs/FEATURE.md
git commit -m "feat: add new feature"

# If credentials detected, you'll see:
# ❌ COMMIT BLOCKED: 1 credential(s) detected
# File: src/feature.ts
# Match: ANTHROPIC_API_KEY="[CREDENTIAL_REDACTED]"
```

### Remediation Steps

When the hook blocks your commit:

1. **Identify the exposed credential:**
   ```bash
   git diff --cached src/feature.ts  # Review staged changes
   ```

2. **Replace with placeholder:**
   ```bash
   # Replace actual value with [REDACTED]
   sed -i 's/sk-ant-.*/[REDACTED]/g' src/feature.ts
   ```

3. **Move to secure location:**
   ```bash
   # Add to .env (add to .gitignore)
   echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
   ```

4. **Update code to use environment variable:**
   ```typescript
   // Before
   const apiKey = "sk-ant-...";

   // After
   const apiKey = process.env.ANTHROPIC_API_KEY;
   ```

5. **Re-stage and commit:**
   ```bash
   git add src/feature.ts
   git commit -m "feat: add new feature"
   ```

### Test Files with Mock Credentials

For test files, use whitelisted mock credentials:

```typescript
// tests/auth.test.ts
describe('Authentication', () => {
  it('should validate API key format', () => {
    const mockKey = 'sk-ant-mock';  // Whitelisted
    expect(validateKey(mockKey)).toBe(true);
  });
});
```

Whitelisted mock patterns:
- `sk-ant-mock` (Anthropic)
- `npm_MockTestKey` (NPM)
- `test_key` or `test-key` (Generic)
- `mock_key` or `mock-key` (Generic)
- `[REDACTED]` (Documentation)

### Bypass (NOT RECOMMENDED)

To bypass the pre-commit hook:

```bash
git commit --no-verify
```

**WARNING:** This disables all pre-commit hooks. Only use if absolutely necessary, and ensure credentials are removed before pushing.

## File Scanning

### Files Scanned

The pre-commit hook scans these file types:

```
*.ts, *.tsx, *.js, *.jsx
*.json, *.md, *.sh, *.bash
*.env*, *.yaml, *.yml, *.txt
```

### Files Skipped

Files in these directories are automatically skipped:

- `.git/`
- `node_modules/`
- `.venv/`
- `dist/`, `build/`
- `.next/`, `.artifacts/`

Binary files larger than 1MB are also skipped.

## Integration with Other Tools

### Post-Edit Credential Scanner

The post-edit hook runs the same credential scanner:

```bash
.claude/hooks/validators/credential-scanner.sh
```

### CI/CD Credential Scanning

GitHub Actions workflow validates credentials:

```yaml
# .github/workflows/security-credential-scan.yml
- Credential scanning (git-secrets)
- TruffleHog scanning
- Custom pattern validation
```

### Git History Scanning

To scan git history for past credential exposure:

```bash
git secrets --scan-history --since=HEAD~10
```

## Audit Trail

All pre-commit hook activity is logged to:

```
.artifacts/logs/git-hooks.log
```

Log entries include:

```
2025-11-23T10:30:45Z | PRE-COMMIT BLOCKED | CREDENTIALS:2 | FILES_SCANNED:5
2025-11-23T10:31:12Z | PRE-COMMIT SUCCESS | FILES_SCANNED:3
```

## Troubleshooting

### Hook Not Executing

Check if the hook is executable:

```bash
ls -l .git/hooks/pre-commit
# Should show: -rwxr-xr-x
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

### Hook Conflicts

If you have other pre-commit hooks, they may conflict. Check:

```bash
cat .git/hooks/pre-commit
```

Merge hooks using a wrapper script.

### False Positives

If a legitimate pattern is blocked, add it to WHITELIST in the hook:

```bash
# Edit .git/hooks/pre-commit
WHITELIST=(
    # ... existing patterns ...
    "my_specific_pattern"
)
```

Then reinstall:

```bash
bash .claude/hooks/install-git-hooks.sh --force
```

### Permission Issues

If you can't install hooks:

```bash
# Check .git directory permissions
ls -ld .git
chmod 755 .git
chmod 755 .git/hooks

# Retry installation
bash .claude/hooks/install-git-hooks.sh
```

## Best Practices

### 1. Use Environment Variables

Never hardcode credentials:

```typescript
// WRONG
const apiKey = "sk-ant-v1-...";

// RIGHT
const apiKey = process.env.ANTHROPIC_API_KEY;
```

### 2. Create .env.example

Document required variables without values:

```bash
# .env.example
ANTHROPIC_API_KEY=YOUR_API_KEY
DATABASE_URL=postgresql://user:pass@localhost/db
REDIS_PASSWORD=CHANGE_ME
```

### 3. Add .env to .gitignore

```bash
echo ".env*" >> .gitignore
git add .gitignore
git commit -m "chore: add .env to gitignore"
```

### 4. Use Secure Configuration

For deployments, use:
- Environment variable injection
- Secret management services (HashiCorp Vault, AWS Secrets Manager)
- Encrypted configuration files (git-crypt, SOPS)

### 5. Redact Documentation

When documenting credentials in code examples:

```bash
# DO: Use [REDACTED] placeholder
ANTHROPIC_API_KEY=sk-ant-[REDACTED]

# DON'T: Show actual credentials
ANTHROPIC_API_KEY=sk-ant-v1-abc123...
```

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | No credentials detected | Commit proceeds |
| 1 | Credentials detected | Commit blocked |

## Configuration

### Modify Detection Patterns

Edit `.git/hooks/pre-commit` and modify the PATTERNS array:

```bash
declare -a PATTERNS=(
    "your-new-pattern"
    # ... existing patterns ...
)
```

### Modify Whitelist

Edit `.git/hooks/pre-commit` and modify the WHITELIST array:

```bash
declare -a WHITELIST=(
    "\\[REDACTED\\]"
    "your-safe-pattern"
    # ... existing patterns ...
)
```

### Customize Scanned File Types

Edit `.git/hooks/pre-commit` and modify SCANNABLE_TYPES:

```bash
declare -a SCANNABLE_TYPES=(
    "*.ts" "*.tsx"
    "*.custom"  # Add custom type
)
```

## Related Documentation

- **Credential Scanner**: `.claude/hooks/validators/credential-scanner.sh`
- **CI/CD Workflow**: `.github/workflows/security-credential-scan.yml`
- **Installation Script**: `.claude/hooks/install-git-hooks.sh`
- **Project Standards**: `CLAUDE.md` (Redaction Protocol section)

## Support

For issues or improvements:

1. Review `.git/hooks/pre-commit` for current implementation
2. Check `.artifacts/logs/git-hooks.log` for audit trail
3. Test with: `git commit --no-verify` (temporary bypass)
4. Refer to post-edit scanner for pattern reference

## Summary

The git hooks system provides:

- **Automated Detection**: Pre-commit scanning catches credentials before commit
- **Consistent Patterns**: Same detection rules across pre-commit, post-edit, and CI/CD
- **Clear Remediation**: Detailed guidance when credentials are detected
- **Flexible Whitelisting**: Safe patterns for tests and documentation
- **Audit Trail**: Complete logging of all credential detection events
- **Easy Installation**: Single command setup with validation
