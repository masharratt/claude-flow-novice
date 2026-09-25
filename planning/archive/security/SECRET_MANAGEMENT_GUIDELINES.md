# Secret Management Guidelines

## Core Principles
1. **Never Commit Secrets to Version Control**
2. **Use Centralized Secret Management**
3. **Implement Least Privilege Access**
4. **Rotate Secrets Regularly**

## Recommended Tools
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault

## Environment Variable Standards

### Naming Convention
- Use `PROVIDER_SERVICE_SECRET` format
- Standardized names across all environments

**Good Examples:**
```bash
ANTHROPIC_AUTH_TOKEN=sk-...
ZAI_API_BASE_URL=https://api.z.ai
ZAI_AUTH_TOKEN=token-...
```

**Bad Examples:**
```bash
# Avoid these
API_KEY=...
SECRET=...
RANDOM_TOKEN=...
```

## Secret Injection Patterns

### Docker Compose
```yaml
services:
  agent:
    secrets:
      - anthropic_auth_token
    environment:
      - ANTHROPIC_AUTH_TOKEN_FILE=/run/secrets/anthropic_auth_token

secrets:
  anthropic_auth_token:
    external: true
```

### Kubernetes
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: anthropic-secrets
type: Opaque
stringData:
  ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN}
```

## Rotation Strategy
- Rotate secrets every 90 days
- Automate rotation via CI/CD pipelines
- Maintain backward compatibility during rotation

## Scanning & Detection

### Automated Checks
- Use tools like TruffleHog, GitGuardian
- Implement pre-commit hooks
- Run secret scanning in CI/CD

```bash
# Example pre-commit hook
#!/bin/bash
trufflehog --max-depth=1 .
```

## Access Control
- Use short-lived tokens
- Implement multi-factor authentication
- Log and monitor secret access

## Emergency Procedures
1. Immediately revoke compromised secrets
2. Rotate ALL related credentials
3. Audit access logs
4. Update access patterns

## Compliance Checklist
- [ ] No hardcoded secrets
- [ ] Centralized secret management
- [ ] Regular rotation
- [ ] Access logging
- [ ] Least privilege principles