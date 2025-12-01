# IMPL-001: Security Hardening - Remaining Work Delegation

## Status Summary

### Completed (60% → 70%)
- ✅ Label injection sanitization implementation
- ✅ Test suite creation (38/38 passing - 100%)
- ✅ Cost allocation tracker integration
- ✅ Security validation complete

### Remaining Work (30%)

Three parallel work streams requiring specialized agents:

---

## Stream 1: HashiCorp Vault Integration (25%)

**Owner:** Backend Developer + Security Specialist
**Estimated Time:** 2-3 days
**Priority:** HIGH

### Deliverables

1. **Docker Compose Configuration** (`docker-compose.vault.yml`)
   - Vault service definition
   - Dev mode for local development
   - Production-ready configuration templates
   - Volume mounts for persistent storage

2. **Vault Integration Scripts**
   - `scripts/vault/vault-integration.sh` - Setup and initialization
   - `scripts/vault/secrets-fetch.sh` - Retrieve secrets from KV v2
   - `scripts/vault/secrets-rotate.sh` - Automated rotation workflow
   - `scripts/vault/vault-policy-manager.sh` - Policy management

3. **Secrets Engine Configuration**
   - KV v2 engine for API keys (path: secret/)
   - Transit engine for encryption (path: transit/)
   - Database engine for dynamic credentials (path: database/)

4. **Access Policies**
   ```hcl
   # Engineering team policy
   path "secret/data/engineering/*" {
     capabilities = ["create", "read", "update", "delete", "list"]
   }

   # Marketing team policy (read-only)
   path "secret/data/marketing/*" {
     capabilities = ["read", "list"]
   }

   # Agent runtime policy
   path "secret/data/agents/*" {
     capabilities = ["read"]
   }
   ```

5. **Documentation** (`docs/security/VAULT_INTEGRATION_GUIDE.md`)
   - Setup instructions
   - Secret migration workflow
   - Policy management
   - Troubleshooting guide

6. **Test Suite** (`tests/security/test-vault-integration.sh`)
   - Vault connectivity
   - Secret CRUD operations
   - Policy enforcement
   - Encryption/decryption via Transit
   - Dynamic credential generation

### Success Criteria

- Vault service starts successfully via Docker Compose
- All API keys migrated from `.env` to Vault
- Scripts achieve 100% pass rate on test executions
- Policy enforcement verified (team isolation works)
- Zero plaintext secrets in environment files
- Documentation complete with examples

### Test-Driven Requirements

```bash
# Test scenarios (minimum 15 tests)
1. Vault service health check
2. KV v2 secret write/read
3. KV v2 secret deletion
4. Transit encryption/decryption
5. Policy enforcement (read-only)
6. Policy enforcement (no access)
7. Dynamic database credentials
8. Secret rotation workflow
9. Multi-team isolation
10. Agent secret fetch
11. Vault unsealing
12. Backup/restore
13. Audit log validation
14. Connection failure handling
15. Token expiration handling
```

**Pass Rate Threshold:** ≥0.95 (Standard mode)

---

## Stream 2: CVE Remediation in Dockerfiles (20%)

**Owner:** Docker Specialist + Security Specialist
**Estimated Time:** 2-3 days
**Priority:** CRITICAL

### Deliverables

1. **Base Image Upgrades**

   `docker/teams/base/Dockerfile.base`:
   ```dockerfile
   # OLD: Alpine 3.18 (CVE-2024-XXXX, CVE-2024-YYYY)
   FROM alpine:3.18

   # NEW: Alpine 3.20 (all CVEs patched)
   FROM alpine:3.20.3

   # OLD: Node.js 20.x (floating version)
   RUN apk add nodejs npm

   # NEW: Node.js 20.18.0 (pinned, CVE-free)
   RUN apk add --no-cache nodejs=20.18.0-r0 npm=10.8.2-r0
   ```

2. **Team-Specific Dockerfiles**

   Engineering (`docker/teams/Dockerfile.engineering`):
   ```dockerfile
   # Python upgrade: 3.11 → 3.12.3
   FROM python:3.12.3-alpine3.20

   # Pin ALL dependencies
   RUN pip install --no-cache-dir \
     flask==3.0.0 \
     requests==2.31.0 \
     psycopg2-binary==2.9.9
   ```

   Marketing (`docker/teams/Dockerfile.marketing`):
   ```dockerfile
   # PHP upgrade: 8.2 → 8.3.6
   FROM php:8.3.6-fpm-alpine3.20

   # Pin Composer packages
   RUN composer require \
     guzzlehttp/guzzle:^7.8 \
     symfony/http-foundation:^6.4
   ```

   Data (`docker/teams/Dockerfile.data`):
   ```dockerfile
   # Pin NumPy, Pandas, PyTorch
   RUN pip install --no-cache-dir \
     numpy==1.26.4 \
     pandas==2.2.1 \
     torch==2.2.1
   ```

3. **CVE Scanning Integration**
   - Script: `scripts/docker/scan-cve.sh`
   - Runs `docker scan` or `trivy` on all images
   - Fails build if HIGH/CRITICAL CVEs found
   - Generates report: `docs/security/CVE_SCAN_REPORT.md`

4. **Documentation** (`docs/security/CVE_REMEDIATION_REPORT.md`)
   - List of all CVEs addressed
   - Before/After comparison
   - Upgrade justification
   - Breaking changes (if any)

5. **Test Suite** (`tests/security/test-cve-remediation.sh`)
   - Verify base image versions
   - Verify pinned package versions
   - Run CVE scanner on all images
   - Assert zero HIGH/CRITICAL findings

### Success Criteria

- Zero HIGH/CRITICAL CVEs in all Docker images
- All package versions pinned (no floating versions)
- CVE scan passes for 4+ team Dockerfiles
- Documentation complete with CVE mappings
- Test pass rate ≥0.95

### Test-Driven Requirements

```bash
# Test scenarios (minimum 12 tests)
1. Alpine version == 3.20.3
2. Node.js version == 20.18.0
3. Python version == 3.12.3
4. PHP version == 8.3.6
5. No floating versions in RUN commands
6. Docker scan passes (base image)
7. Docker scan passes (engineering)
8. Docker scan passes (marketing)
9. Docker scan passes (data)
10. Trivy scan passes (all images)
11. Image build succeeds
12. CVE report generated
```

**Pass Rate Threshold:** ≥0.95 (Standard mode)

---

## Stream 3: Plaintext Secrets Removal (15%)

**Owner:** Security Specialist
**Estimated Time:** 1 day
**Priority:** HIGH

### Deliverables

1. **Secret Scanning Script** (`scripts/security/scan-secrets.sh`)
   - Scans all files for API key patterns
   - Patterns to detect:
     - `ANTHROPIC_API_KEY=sk-ant-*`
     - `KIMI_API_KEY=sk-*`
     - `OPENAI_API_KEY=sk-*`
     - `JWT_SECRET=*`
     - `DB_PASSWORD=*`
     - `REDIS_PASSWORD=*`
   - Outputs: File path, line number, pattern matched
   - Exit code: 1 if secrets found, 0 otherwise

2. **Secret Redaction**
   - All `docs/**/*.md` files → Replace with `[REDACTED]`
   - All `docker-compose*.yml` → Use Vault references
   - All `scripts/**/*.sh` → No hardcoded secrets
   - Update `.env.example` with Vault paths

   Example redaction:
   ```bash
   # OLD (docs/API_GUIDE.md)
   ANTHROPIC_API_KEY=sk-ant-1234567890abcdef

   # NEW (docs/API_GUIDE.md)
   ANTHROPIC_API_KEY=sk-ant-[REDACTED]

   # NEW (.env.example)
   # Fetch from Vault: vault kv get secret/agents/anthropic
   ANTHROPIC_API_KEY=__VAULT__secret/agents/anthropic/api_key
   ```

3. **Test Suite** (`tests/security/test-secret-redaction.sh`)
   - Verify scan-secrets.sh detects patterns
   - Verify no matches in docs/
   - Verify no matches in scripts/
   - Verify no matches in docker-compose files
   - Verify .env.example uses Vault references

4. **Git Pre-Commit Hook** (`.git/hooks/pre-commit`)
   - Runs `scan-secrets.sh` before commit
   - Blocks commit if secrets detected
   - Provides guidance on Vault usage

### Success Criteria

- Secret scanner detects 8+ known patterns
- Zero plaintext secrets in git-tracked files
- All API keys referenced via Vault
- Pre-commit hook blocks secret commits
- Test pass rate = 1.00 (100% - security tests)

### Test-Driven Requirements

```bash
# Test scenarios (minimum 10 tests)
1. Scanner detects ANTHROPIC_API_KEY pattern
2. Scanner detects KIMI_API_KEY pattern
3. Scanner detects JWT_SECRET pattern
4. Scanner detects DB_PASSWORD pattern
5. No secrets in docs/
6. No secrets in scripts/
7. No secrets in docker-compose*.yml
8. .env.example uses Vault references
9. Pre-commit hook blocks secrets
10. False positive handling (commented secrets OK)
```

**Pass Rate Threshold:** 1.00 (100% - critical security)

---

## Coordination Notes

### Execution Order

1. **Stream 1 (Vault)** - Start first (prerequisite for Stream 3)
2. **Stream 2 (CVE)** - Parallel with Stream 1
3. **Stream 3 (Secrets)** - Starts after Vault is operational

### Dependencies

- Stream 3 depends on Stream 1 (Vault must be running)
- Stream 2 is independent

### Integration Points

- Vault scripts will be used by secrets removal workflow
- CVE remediation may require Vault for build-time secrets
- All streams converge in final security audit

### Final Validation

After all streams complete, run comprehensive security audit:

```bash
# Execute all security tests
./tests/security/test-label-injection.sh      # Already passing (38/38)
./tests/security/test-vault-integration.sh    # Stream 1 deliverable
./tests/security/test-cve-remediation.sh      # Stream 2 deliverable
./tests/security/test-secret-redaction.sh     # Stream 3 deliverable

# Generate final report
scripts/security/security-audit-report.sh \
  --output docs/security/IMPL-001-FINAL-REPORT.md

# Expected metrics:
# - Label injection: 38/38 passed (100%)
# - Vault integration: ≥15 tests passed (≥95%)
# - CVE remediation: 12/12 passed (100%)
# - Secret redaction: 10/10 passed (100%)
# - Overall: ≥75/75 tests passed (≥95%)
```

---

## Agent Assignment Recommendation

**Use CFN Loop CLI mode for parallel execution:**

```bash
# Stream 1: Vault Integration
/cfn-loop-cli "Implement HashiCorp Vault integration per IMPL-001-REMAINING-WORK.md Stream 1" \
  --mode=standard \
  --provider=kimi \
  --agents=backend-developer,security-specialist

# Stream 2: CVE Remediation
/cfn-loop-cli "Remediate Docker CVEs per IMPL-001-REMAINING-WORK.md Stream 2" \
  --mode=standard \
  --provider=kimi \
  --agents=docker-specialist,security-specialist

# Stream 3: Secret Redaction (starts after Vault is ready)
/cfn-loop-cli "Remove plaintext secrets per IMPL-001-REMAINING-WORK.md Stream 3" \
  --mode=standard \
  --provider=kimi \
  --agents=security-specialist
```

**Estimated Timeline:**
- Stream 1+2 (parallel): 2-3 days
- Stream 3 (sequential): 1 day
- Integration & testing: 0.5 day
- **Total: 3.5-4.5 days**

**Cost Estimate (Kimi @ $2/1M tokens):**
- Stream 1: ~500K tokens = $1.00
- Stream 2: ~400K tokens = $0.80
- Stream 3: ~200K tokens = $0.40
- **Total: ~$2.20**
