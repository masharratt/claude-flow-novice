# Credential Management Guide
**Version:** 4.0.0
**Security Level:** CRITICAL (CVSS 9.0)
**Last Updated:** 2025-11-17

---

## Executive Summary

This document provides comprehensive guidance for managing credentials in the Claude Flow Novice project. Hardcoded credentials represent a CVSS 9.0 critical vulnerability and must be strictly prevented.

### Key Principles

1. **Never commit secrets to version control**
2. **Use environment variables exclusively**
3. **Rotate credentials regularly** (90-day schedule)
4. **Implement automated detection** (pre-commit hooks)
5. **Audit all credential access** (logging and monitoring)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Credential Types](#credential-types)
3. [Environment Variable Setup](#environment-variable-setup)
4. [Development Workflow](#development-workflow)
5. [Production Deployment](#production-deployment)
6. [Credential Rotation](#credential-rotation)
7. [Security Best Practices](#security-best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Compliance](#compliance)

---

## Quick Start

### Setup Local Development (5 minutes)

```bash
# 1. Copy the template file
cp .env.example .env

# 2. Generate strong passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)

# 3. Edit .env with generated values
nano .env  # Edit with your generated passwords

# 4. Verify .env is in .gitignore
grep "^\.env$" .gitignore  # Should output: .env

# 5. Test local setup
docker-compose up -d
```

### Setup Production (10 minutes)

```bash
# 1. Generate credentials with strong randomness
for SECRET in POSTGRES_PASSWORD REDIS_PASSWORD GRAFANA_PASSWORD JWT_SECRET SESSION_SECRET; do
  echo "$SECRET=$(openssl rand -base64 32)" >> .env.production
done

# 2. Secure the file
chmod 600 .env.production

# 3. Store in vault/secrets manager
# AWS Secrets Manager:
aws secretsmanager create-secret --name cfn/production --secret-string file://.env.production

# GitHub Actions:
gh secret set POSTGRES_PASSWORD < <(openssl rand -base64 32)
gh secret set REDIS_PASSWORD < <(openssl rand -base64 32)

# 4. Deploy (never commit .env to git)
docker-compose --env-file .env.production up -d
```

---

## Credential Types

### Critical Credentials (Rotate Every 90 Days)

| Credential | Format | Usage | Storage |
|------------|--------|-------|---------|
| **API Keys** | `sk-ant-v1-xxxxx` | AI model access | Vault/Secrets |
| **Database Passwords** | 32+ chars | PostgreSQL auth | Vault/Secrets |
| **Redis Password** | 32+ chars | Cache auth | Vault/Secrets |
| **JWT Secret** | 64+ chars | Token signing | Vault/Secrets |
| **Session Secret** | 64+ chars | Session encryption | Vault/Secrets |

### Semi-Critical (Rotate Every 6 Months)

| Credential | Usage | Storage |
|------------|-------|---------|
| **SSH Keys** | Git access | SSH agent |
| **Deployment Keys** | CD/CD automation | CI/CD platform |
| **OAuth Tokens** | 3rd party API access | Vault/Secrets |

### Low-Risk (Rotate Annually)

| Credential | Usage | Storage |
|-----------|-------|---------|
| **Monitoring API Keys** | Datadog, New Relic | Vault/Secrets |
| **CDN Tokens** | Static asset delivery | Vault/Secrets |

---

## Environment Variable Setup

### Local Development

**File:** `.env` (local only, never commit)

```bash
# Generate passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
SESSION_SECRET=$(openssl rand -base64 64)

# Create .env
cat > .env <<EOF
# Database
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD

# Authentication
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET

# API Keys
ANTHROPIC_API_KEY=your_key_here
Z_AI_API_KEY=your_key_here
EOF

# Secure the file
chmod 600 .env
```

### Template File

**File:** `.env.example` (commit this, never real secrets)

```bash
# DO NOT COMMIT REAL SECRETS
# This is a TEMPLATE. Copy to .env and fill with real values.

POSTGRES_PASSWORD=CHANGE_ME_GENERATE_STRONG_PASSWORD_MIN_32_CHARS
REDIS_PASSWORD=CHANGE_ME_GENERATE_STRONG_PASSWORD_MIN_32_CHARS
JWT_SECRET=CHANGE_ME_GENERATE_STRONG_JWT_SECRET_MIN_64_CHARS
ANTHROPIC_API_KEY=sk-ant-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Production Secrets

**Storage Locations (Never in Git):**

1. **AWS Secrets Manager**
   ```bash
   aws secretsmanager create-secret \
     --name cfn/production \
     --secret-string file://.env.production
   ```

2. **GitHub Actions**
   ```bash
   gh secret set POSTGRES_PASSWORD
   gh secret set REDIS_PASSWORD
   gh secret set ANTHROPIC_API_KEY
   ```

3. **HashiCorp Vault**
   ```bash
   vault kv put secret/cfn/production \
     postgres_password="$POSTGRES_PASSWORD" \
     redis_password="$REDIS_PASSWORD"
   ```

4. **Docker Swarm Secrets**
   ```bash
   echo "$POSTGRES_PASSWORD" | docker secret create postgres_password -
   docker service create \
     --secret postgres_password \
     --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
     postgres:15-alpine
   ```

---

## Development Workflow

### Before First Commit

```bash
# 1. Verify .env is in .gitignore
echo ".env" >> .gitignore
git add .gitignore
git commit -m "chore: ensure .env files are never committed"

# 2. Install pre-commit hook
chmod +x .claude/hooks/detect-hardcoded-credentials.sh
cp .claude/hooks/detect-hardcoded-credentials.sh .git/hooks/pre-commit

# 3. Create .env from template
cp .env.example .env
# ... edit .env with real values ...

# 4. Test the hook
git add .
git commit -m "test: verify pre-commit hook" 2>&1 | head -5
```

### Daily Development

```bash
# ✅ CORRECT: Use environment variables
const password = process.env.POSTGRES_PASSWORD;
const apiKey = process.env.ANTHROPIC_API_KEY;

// ❌ WRONG: Never hardcode
const password = "MySecretPassword123";
const apiKey = "sk-ant-v1-abc123xyz";
```

### Code Review Checklist

- [ ] No hardcoded passwords, tokens, or API keys
- [ ] All secrets use `process.env.VARIABLE_NAME`
- [ ] `.env` file never committed
- [ ] `.env.example` has placeholder values only
- [ ] Pre-commit hook prevents accidental commits

---

## Production Deployment

### Docker Compose Deployment

```bash
# ✅ CORRECT: Use environment variables without defaults
# docker-compose.yml
services:
  postgres:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # Required at runtime
      POSTGRES_DB: cfn_production

# Deploy with .env file
docker-compose --env-file /secure/path/.env.production up -d
```

### Kubernetes Deployment

```yaml
# ✅ CORRECT: Use Kubernetes Secrets
apiVersion: v1
kind: Secret
metadata:
  name: cfn-credentials
type: Opaque
data:
  postgres-password: base64encodedpassword
  redis-password: base64encodedpassword
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-app
spec:
  template:
    spec:
      containers:
      - name: app
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: cfn-credentials
              key: postgres-password
```

### GitHub Actions Secrets

```yaml
# .github/workflows/deploy.yml
name: Deploy

on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to production
        env:
          POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
          REDIS_PASSWORD: ${{ secrets.REDIS_PASSWORD }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          docker-compose --env-file <(env | grep -E '^(POSTGRES|REDIS|ANTHROPIC)') up -d
```

---

## Credential Rotation

### 90-Day Rotation Schedule (Critical Credentials)

#### Week 1: Preparation
```bash
# Generate new credentials
NEW_POSTGRES_PASSWORD=$(openssl rand -base64 32)
NEW_REDIS_PASSWORD=$(openssl rand -base64 32)
NEW_JWT_SECRET=$(openssl rand -base64 64)

# Store in vault (do NOT commit)
aws secretsmanager update-secret --secret-id cfn/production \
  --secret-string "{\"POSTGRES_PASSWORD\":\"$NEW_POSTGRES_PASSWORD\"}"
```

#### Week 2: Staging Test
```bash
# Deploy to staging environment
docker-compose --env-file /staging/.env.rotation up -d

# Run integration tests
npm run test:integration

# Monitor for errors
docker logs -f app-staging
```

#### Week 3: Production Deployment
```bash
# Update production secrets
aws secretsmanager update-secret --secret-id cfn/production \
  --secret-string file://new-credentials.json

# Rolling restart (zero downtime)
docker-compose --env-file /prod/.env.new up -d
sleep 30  # Wait for new containers to start

# Remove old containers
docker-compose down
```

#### Week 4: Verification
```bash
# Verify old credentials are no longer working
psql -h postgres -U cfn_app_user -d cfn_production \
  --password="$OLD_POSTGRES_PASSWORD" 2>&1 | grep "FATAL"
# Expected: FATAL: password authentication failed

# Verify new credentials work
psql -h postgres -U cfn_app_user -d cfn_production \
  --password="$NEW_POSTGRES_PASSWORD" -c "SELECT 1;"
# Expected: Query returns 1
```

### Rotation Checklist

- [ ] Generate new credentials with `openssl rand -base64 32`
- [ ] Update vault/secrets manager
- [ ] Deploy to staging
- [ ] Run full test suite
- [ ] Monitor staging for 24 hours
- [ ] Deploy to production
- [ ] Monitor production for 24 hours
- [ ] Verify old credentials no longer work
- [ ] Document rotation in audit log
- [ ] Schedule next rotation (90 days from now)

---

## Security Best Practices

### 1. Password Generation

```bash
# ✅ CORRECT: High entropy randomness
openssl rand -base64 32    # 32 characters, 192-bit entropy
openssl rand -base64 64    # 64 characters, 384-bit entropy

# ❌ WRONG: Low entropy
date | md5sum              # Predictable, only 32-bit entropy
echo "password$(date +%s)" # Weak, predictable patterns

# Generate multiple credentials at once
for i in {1..5}; do
  echo "Password $i: $(openssl rand -base64 32)"
done
```

### 2. Secure File Handling

```bash
# ✅ CORRECT: Secure permissions
chmod 600 .env              # Only owner can read
chmod 600 .env.production   # Only owner can read

# ✅ CORRECT: Secure deletion
shred -vfz -n 3 .env.old   # Overwrite 3 times, force, zero, verbose

# ❌ WRONG: World-readable
chmod 644 .env              # Everyone can read secrets!
```

### 3. Logging Best Practices

```typescript
// ✅ CORRECT: Never log credentials
logger.info('Connected to database', { host, port, user });

// ❌ WRONG: Never log passwords
logger.info('Database connected', {
  host,
  port,
  user,
  password: dbPassword  // SECURITY BREACH!
});

// ✅ CORRECT: Log masked values
const maskedKey = apiKey.substring(0, 8) + '***';
logger.info('API key configured', { keyPrefix: maskedKey });
```

### 4. Error Handling

```typescript
// ✅ CORRECT: Generic error messages
catch (error) {
  logger.error('Database connection failed');
  return { error: 'Unable to connect to database' };
}

// ❌ WRONG: Expose credentials in errors
catch (error) {
  logger.error('Database connection failed', {
    error: error.message  // Might contain password!
  });
  throw error;
}
```

### 5. Code Review

```bash
# Pre-commit hook prevents most issues
# But manual review should also check:

git log --patch HEAD~10..HEAD | grep -E "password|secret|api_key"
# Should return no results

# Look for suspicious patterns
git grep -E 'password\s*=\s*[\'"][^\'"]+'
git grep -E 'sk-ant-v1-[a-z0-9]{20,}'
git grep -E 'Bearer\s+[a-zA-Z0-9_.-]{20,}'
```

---

## Troubleshooting

### Pre-commit Hook Issues

**Problem:** Hook doesn't run or gives false positives

```bash
# Verify hook is executable
ls -la .git/hooks/pre-commit
# Should show: -rwxr-xr-x

# Test hook manually
.claude/hooks/detect-hardcoded-credentials.sh

# Run with debug output
bash -x .git/hooks/pre-commit

# Check hook path
cat .git/hooks/pre-commit | head -1
# Should be: #!/bin/bash
```

### Accidental Credential Commit

**If you accidentally committed a credential:**

```bash
# 1. IMMEDIATELY rotate the credential
openssl rand -base64 32 > /tmp/new_password.txt

# 2. Remove from recent commits (BEFORE PUSHING)
git reset HEAD~1              # Undo last commit
git checkout -- .env          # Discard changes
git commit -m "fix: remove hardcoded credential"

# 3. If already pushed to remote:
# Remove from git history (irreversible)
git filter-branch --tree-filter 'rm -f .env' HEAD
git push origin --force-with-lease

# 4. Notify security team
# Alert: Credential potentially exposed in history
```

### Environment Variable Not Working

```bash
# Verify .env file is loaded
docker-compose config | grep POSTGRES_PASSWORD
# Should show: POSTGRES_PASSWORD: your_actual_password

# Check if variable is set
echo $POSTGRES_PASSWORD

# If empty, source the file
set -a
source .env
set +a
echo $POSTGRES_PASSWORD
```

### Docker Secrets Not Accessible

```bash
# Verify secret was created
docker secret ls

# Check container can access secret
docker exec <container> cat /run/secrets/postgres_password

# Verify secret mount permissions
docker inspect <container> | grep -A5 "Secrets"
```

---

## Compliance

### Standards Compliance

**OWASP Top 10 2021:**
- A02:2021 – Cryptographic Failures ✅
- A03:2021 – Injection ✅
- A05:2021 – Access Control ✅

**PCI DSS (if handling payment data):**
- Requirement 2: No default/weak passwords ✅
- Requirement 8: User IDs and strong authentication ✅

**SOC 2 Type II:**
- Secure credential management ✅
- Access control and monitoring ✅
- Regular security reviews ✅

### Audit Trail

All credential operations should be logged:

```bash
# Credential rotation audit log
{
  "timestamp": "2025-11-17T10:30:00Z",
  "event": "credential_rotation",
  "credential_type": "postgres_password",
  "environment": "production",
  "performed_by": "devops-team",
  "verification": "passed"
}
```

### Security Checklist

- [ ] All credentials use environment variables
- [ ] `.env*` files in `.gitignore`
- [ ] Pre-commit hook installed and working
- [ ] No real secrets in `.env.example`
- [ ] Credentials rotate every 90 days
- [ ] Audit logs for all credential access
- [ ] Code review catches hardcoded secrets
- [ ] Docker files use environment variables
- [ ] GitHub Actions use secrets
- [ ] Kubernetes uses Secret objects

---

## Additional Resources

- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Node.js dotenv](https://github.com/motdotla/dotenv)
- [12 Factor App - Config](https://12factor.net/config)
- [Docker Secrets Best Practices](https://docs.docker.com/engine/swarm/secrets/)

---

## Support

For credential management issues:

1. Check troubleshooting section above
2. Review test results: `npm run test:security`
3. Consult OWASP best practices
4. Contact security team for escalations

**Last Updated:** 2025-11-17
**Severity:** CRITICAL (CVSS 9.0)
