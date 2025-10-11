# 🛡️ Secret Detection & Security Guide

## Overview

This repository includes comprehensive secret detection to prevent hardcoded secrets, API keys, tokens, and other sensitive information from being committed to the repository.

## 🔧 Security Tools

### 1. GitHub Actions Workflow
**File**: `.github/workflows/security-check.yml`

Automatically runs on every push and pull request:
- **TruffleHog OSS**: Industry-standard secret detection
- **GitLeaks**: Comprehensive secret pattern matching
- **Custom Patterns**: Project-specific secret detection
- **File Analysis**: Checks for secret files and patterns
- **Git History**: Scans recent commits for leaked secrets

### 2. Pre-commit Hook
**File**: `.github/hooks/pre-commit`

Runs locally before each commit:
- Scans staged files for secret patterns
- Blocks commits containing hardcoded secrets
- Provides immediate feedback and remediation guidance
- Works offline for fast local validation

### 3. GitLeaks Configuration
**File**: `.gitleaks.toml`

Defines detection rules for:
- API keys and tokens
- Database connection strings
- SSH private keys
- Cloud service credentials
- Custom application secrets

## 🚀 Quick Setup

### Install Git Hooks
```bash
# Run the installation script
./scripts/security/install-git-hooks.sh

# Or manually install GitLeaks
curl -sSfL https://raw.githubusercontent.com/gitleaks/gitleaks/master/scripts/install.sh | sh
```

### Manual Hook Installation
```bash
# Copy the pre-commit hook
cp .github/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## 🔍 What Gets Detected

### Common Secret Patterns
- **API Keys**: `api_key = "sk-1234567890abcdef"`
- **Passwords**: `password = "mySecretPassword123"`
- **Database URLs**: `database_url = "postgres://user:pass@host/db"`
- **JWT Tokens**: `jwt_token = "eyJhbGciOiJIUzI1NiIs..."`
- **Private Keys**: SSH, RSA, and other private key formats
- **Cloud Credentials**: AWS, GitHub, Stripe, OpenAI, Anthropic

### Secret Files
- `.env` files (non-example)
- Private key files (`id_rsa`, `*.pem`, `*.key`)
- Credential files (`credentials.json`, `service-account.json`)
- Certificate files (`*.p12`, `*.pfx`)

### Cloud Service Keys
- **AWS**: `AKIA[0-9A-Z]{16}`
- **GitHub**: `ghp_[a-zA-Z0-9]{36}`
- **Stripe**: `sk_live_[0-9a-zA-Z]{24}`
- **OpenAI**: `sk-[a-zA-Z0-9]{48}`
- **Anthropic**: `sk-ant-[a-zA-Z0-9\-_]{95}`

## ✅ What's Allowed

### Safe Patterns
- Example files: `*.example`, `*.template`, `*.sample`
- Documentation: `README.md`, `SECURITY.md`
- Placeholder values: `"your-api-key-here"`, `"***"`, `"xxx"`
- Environment variables: `process.env.API_KEY`, `${API_KEY}`
- Test/mock data: `test_password`, `mock_secret`

### Example Files
```bash
# These are safe to commit
.env.example          # Template file
config.template.json  # Configuration template
README.md            # Documentation
```

## 🛠️ Best Practices

### 1. Use Environment Variables
```javascript
// ❌ BAD: Hardcoded secret
const apiKey = "sk-1234567890abcdef1234567890abcdef12345678";

// ✅ GOOD: Environment variable
const apiKey = process.env.API_KEY;
```

### 2. Use .env Files
```bash
# .env (add to .gitignore)
API_KEY=sk-1234567890abcdef1234567890abcdef12345678
DATABASE_URL=postgres://user:password@localhost/mydb

# .env.example (safe to commit)
API_KEY=your-api-key-here
DATABASE_URL=postgres://user:password@localhost/mydb
```

### 3. Configuration Templates
```json
// config.template.json (safe to commit)
{
  "apiKey": "your-api-key-here",
  "databaseUrl": "your-database-url-here"
}

// config.json (add to .gitignore)
{
  "apiKey": "sk-actual-api-key",
  "databaseUrl": "postgres://user:pass@host/db"
}
```

## 🚨 What to Do When Secrets Are Detected

### 1. Immediate Actions
```bash
# Remove the secret from your code
git reset HEAD <file-with-secret>
# Edit the file to remove the secret
# Use environment variables instead
git add <file-with-secret>
git commit -m "Remove hardcoded secret, use environment variable"
```

### 2. If Secret Was Committed
```bash
# Remove from git history (BE CAREFUL!)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch <file-with-secret>' \
  --prune-empty --tag-name-filter cat -- --all

# Force push (only if safe to do so)
git push --force-with-lease origin main
```

### 3. Rotate the Secret
- **Immediately revoke** the exposed secret
- **Generate a new** secret/token/key
- **Update all applications** using the secret
- **Monitor** for any unauthorized usage

## 🔄 Testing Secret Detection

### Test the Pre-commit Hook
```bash
# Create a test file with a fake secret
echo 'api_key = "sk-1234567890abcdef1234567890abcdef12345678"' > test-secret.js

# Try to commit it (should be blocked)
git add test-secret.js
git commit -m "Test secret detection"

# Clean up
git reset HEAD test-secret.js
rm test-secret.js
```

### Test GitHub Actions
- Push a branch with a test secret
- Check the Actions tab for security workflow results
- Verify the workflow fails when secrets are detected

## 📋 Configuration Files

### Update .gitignore
```gitignore
# Environment files
.env
.env.*
!.env.example

# Credentials
credentials.json
service-account.json
*.pem
*.key
*.p12
*.pfx

# SSH keys
id_rsa
id_dsa
id_ecdsa
id_ed25519
```

### Custom Detection Rules
Edit `.gitleaks.toml` to add project-specific patterns:

```toml
[[rules]]
id = "custom-app-token"
description = "My App Token"
regex = '''myapp_token_[a-zA-Z0-9]{32}'''
tags = ["myapp", "token"]
```

## 🚀 Advanced Features

### Slack/Teams Integration
Add notifications to your security workflow:

```yaml
- name: Notify Security Team
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
    text: "🚨 Secret detected in repository!"
```

### Custom Hook Actions
Extend the pre-commit hook for your needs:

```bash
# Add custom validation
if [ -f "custom-security-check.sh" ]; then
    ./custom-security-check.sh
fi
```

## 🆘 Troubleshooting

### False Positives
Add to `.gitleaks.toml`:
```toml
[[allowlist]]
description = "False positive pattern"
regexes = [
    '''your-false-positive-pattern'''
]
```

### Hook Not Running
```bash
# Check hook permissions
ls -la .git/hooks/pre-commit

# Reinstall if needed
./scripts/security/install-git-hooks.sh
```

### GitLeaks Not Found
```bash
# Install GitLeaks manually
curl -sSfL https://raw.githubusercontent.com/gitleaks/gitleaks/master/scripts/install.sh | sh

# Or download from GitHub releases
wget https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz
```

---

## 🔒 Security is Everyone's Responsibility

By following these practices and using the provided tools, you help keep our codebase secure and protect sensitive information from exposure.

**Remember**: It's much easier to prevent secrets from being committed than to clean them up afterward!