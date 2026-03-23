# Git Hooks: Usage Examples

Real-world examples of the pre-commit credential detection system in action.

## Example 1: Developer Accidentally Commits API Key

Developer edits a configuration file and forgets to redact their Anthropic API key.

```bash
$ git add config.ts
$ git commit -m "feat: add anthropic integration"

Pre-Commit Hook: Scanning for credential exposure...

COMMIT BLOCKED: 1 credential(s) detected

CREDENTIAL DETECTED:
   File: config.ts
   Line: 1
   Match: ANTHROPIC_API_KEY=[CREDENTIAL_REDACTED]
```

Resolution: Replace with placeholder, move to .env, use environment variable.

## Example 2: Database Password in Connection String

Hardcoded PostgreSQL password in database configuration.

```bash
$ git commit -m "chore: database configuration"

COMMIT BLOCKED: 1 credential(s) detected

CREDENTIAL DETECTED:
   File: database.ts
   Line: 4
   Match: password: [CREDENTIAL_REDACTED]
```

Resolution: Replace with process.env.DB_PASSWORD.

## Example 3: Test File with Mock Credentials (Whitelisted)

Tests with legitimate test credentials that are whitelisted.

```bash
$ git add auth.test.ts
$ git commit -m "test: add API key format validation"

No credentials detected - proceeding with commit

# Success! 'sk-ant-mock' and 'npm_MockTestKey'
# are whitelisted patterns for testing
```

## Example 4: Documentation with [REDACTED] Placeholder

Documentation showing API setup with redacted values.

```bash
$ git add API_SETUP.md
$ git commit -m "docs: add API setup instructions"

No credentials detected - proceeding with commit

# Success! [REDACTED] is a whitelisted pattern
```

## Example 5: Multiple Files Scanned

Multiple files scanned before commit.

```bash
$ git add src/auth.ts src/config.ts docs/SETUP.md tests/auth.test.ts
$ git commit -m "feat: complete authentication setup"

Pre-Commit Hook: Scanning for credential exposure...

   Scanning: src/auth.ts
   Scanning: src/config.ts
   Scanning: docs/SETUP.md
   Scanning: tests/auth.test.ts

   Scanned: 4 files

No credentials detected - proceeding with commit
```

## Example 6: Bypassing the Hook (Emergency Only)

Emergency override when absolutely necessary.

```bash
$ git commit --no-verify -m "emergency: temporary workaround"

# WARNING: CI/CD will still catch credentials!
# This should only be used in true emergencies
```

## Example 7: Audit Trail Review

Security team reviewing credential detection history.

```bash
$ cat .artifacts/logs/git-hooks.log

2025-11-23T10:30:45Z | PRE-COMMIT BLOCKED | CREDENTIALS:1 | FILES_SCANNED:1
2025-11-23T10:31:12Z | PRE-COMMIT SUCCESS | FILES_SCANNED:2
2025-11-23T10:32:15Z | PRE-COMMIT SUCCESS | FILES_SCANNED:4
```

## Related Documentation

- Complete Guide: `.claude/hooks/README-GIT-HOOKS.md`
- Installation: `.claude/hooks/install-git-hooks.sh`
- Pre-Commit Hook: `.git/hooks/pre-commit`
