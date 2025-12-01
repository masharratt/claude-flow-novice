# Deployment Scripts Reference

**Phase 1.3 Production Deployment Preparation**

Quick reference for trigger.dev worker deployment automation scripts.

---

## Scripts Overview

| Script | Purpose | Duration | Usage |
|--------|---------|----------|-------|
| `deploy-trigger-worker.sh` | Blue-green deployment | 4-10 min | `./deploy-trigger-worker.sh <env>` |
| `rollback-trigger-worker.sh` | Fast rollback | 2-5 min | `./rollback-trigger-worker.sh <env> [reason]` |
| `health-checks.sh` | Health validation | 30-60s | `./health-checks.sh` |

---

## deploy-trigger-worker.sh

### Usage

```bash
# Deploy to development
./scripts/deployment/deploy-trigger-worker.sh dev

# Deploy to staging
./scripts/deployment/deploy-trigger-worker.sh staging

# Deploy to production
./scripts/deployment/deploy-trigger-worker.sh prod
```

### What It Does

1. **Validates** environment and dependencies
2. **Preserves** current deployment state
3. **Builds** new worker image
4. **Starts** green deployment
5. **Validates** health (10 checks)
6. **Switches** from blue to green (zero downtime)
7. **Cleans up** old deployment
8. **Validates** final health

### Success Criteria

- All pre-deployment validations pass
- Health checks pass (10/10)
- Blue-green switch completes
- Total time <10 minutes

### Automatic Rollback

Deployment automatically rolls back if:
- Image build fails
- Green deployment fails to start
- Health checks fail (any of 10)
- Blue-green switch fails

### Environment Variables

```bash
# Optional overrides
STATE_DIR=/custom/state/path
LOG_FILE=/custom/log/path
HEALTH_CHECK_RETRIES=5
HEALTH_CHECK_WAIT=15
```

### Exit Codes

- `0` - Deployment successful
- `1` - Deployment failed (rollback attempted)

---

## rollback-trigger-worker.sh

### Usage

```bash
# Rollback with reason
./scripts/deployment/rollback-trigger-worker.sh dev "Health checks failed"

# Emergency rollback (production)
./scripts/deployment/rollback-trigger-worker.sh prod "Critical bug"

# Quick rollback (default reason)
./scripts/deployment/rollback-trigger-worker.sh staging
```

### What It Does

1. **Validates** state backup exists
2. **Preserves** pre-rollback state
3. **Stops** current deployment
4. **Restores** previous configuration
5. **Restores** previous Docker image
6. **Starts** previous deployment
7. **Validates** health (10 checks)

### Success Criteria

- State backup found
- Previous deployment restored
- Health checks pass (10/10)
- Total time ≤5 minutes (RTO)

### Emergency Fallback

If rollback fails, script attempts emergency recovery:
- Starts worker with latest available image
- Bypasses configuration restore
- **Manual intervention required**

### Environment Variables

```bash
# Optional overrides
STATE_DIR=/custom/state/path
LOG_FILE=/custom/log/path
RTO_TARGET=180  # 3 minutes for production
```

### Exit Codes

- `0` - Rollback successful
- `1` - Rollback failed (emergency recovery attempted)

---

## health-checks.sh

### Usage

```bash
# Standard health checks
./scripts/deployment/health-checks.sh

# Custom thresholds
REQUIRED_SECRETS=12 MAX_MEMORY_PERCENT=70 ./scripts/deployment/health-checks.sh

# Custom container name
WORKER_CONTAINER=trigger-dev-worker-green ./scripts/deployment/health-checks.sh
```

### Health Checks (10 validations)

| # | Check | Severity | Failure Impact |
|---|-------|----------|----------------|
| 1 | Container Running | CRITICAL | Deployment fails |
| 2 | Container Health | CRITICAL | Deployment fails |
| 3 | Socket Proxy | CRITICAL | Agent spawning broken |
| 4 | Secrets Loaded (10) | CRITICAL | Authentication fails |
| 5 | Agent Profiles (≥20) | HIGH | Missing agents |
| 6 | Provider Routing (≥2) | HIGH | Limited routing |
| 7 | Redis Connectivity | HIGH | Coordination broken |
| 8 | PostgreSQL Connectivity | HIGH | Database unavailable |
| 9 | No Critical Errors | MEDIUM | Potential issues |
| 10 | Resource Usage | MEDIUM | Performance degraded |

### Environment Variables

```bash
# Configurable thresholds
WORKER_CONTAINER=trigger-dev-worker
REQUIRED_SECRETS=10
MAX_MEMORY_PERCENT=80
MAX_CPU_PERCENT=90
MIN_PROVIDERS=2
LOG_FILE=/tmp/health-checks.log
```

### Exit Codes

- `0` - All health checks passed
- `1` - One or more health checks failed

---

## Common Workflows

### Standard Deployment Flow

```bash
# 1. Start dependencies
cd docker/trigger-dev
docker-compose up -d postgres redis socket-proxy trigger-webapp

# 2. Deploy worker
cd ../../
./scripts/deployment/deploy-trigger-worker.sh dev

# 3. Verify health
./scripts/deployment/health-checks.sh
```

### Rollback Flow

```bash
# 1. Initiate rollback
./scripts/deployment/rollback-trigger-worker.sh dev "Failed health checks"

# 2. Verify health
./scripts/deployment/health-checks.sh

# 3. Check logs
tail -100 /tmp/trigger-worker-rollback-*.log
```

### Testing Deployment Scripts

```bash
# Run all deployment tests
./tests/deployment/test-production-readiness.sh

# Expected results:
# - 15+ tests executed
# - Pass rate ≥95%
# - All idempotency checks pass
```

---

## Troubleshooting

### Deployment Fails During Validation

**Symptom**: Script exits before building image

**Check**:
```bash
# Missing secrets?
docker secret ls | grep -E "(api_key|secret|password)"

# Dependencies running?
docker-compose ps postgres redis socket-proxy trigger-webapp

# Configuration files?
ls -la docker/trigger-dev/docker-compose*.yml .env
```

**Fix**: Address validation error and re-run deployment

### Deployment Fails During Health Checks

**Symptom**: Green deployment starts but fails health validation

**Check**:
```bash
# View health check log
cat /tmp/trigger-worker-health-checks.log

# Check specific validation
docker exec trigger-dev-worker-green ls -la /run/secrets/
docker exec trigger-dev-worker-green wget -O- http://socket-proxy:2375/containers/json
```

**Fix**: Address health check failure and re-run deployment (automatic rollback preserves state)

### Rollback Fails - No State Found

**Symptom**: Cannot find deployment state for rollback

**Check**:
```bash
# Check state directory
ls -la .artifacts/deployment-state/
cat .artifacts/deployment-state/latest-dev
```

**Fix**: Deploy fresh (first deployment creates state for future rollbacks)

### Rollback Takes Too Long (RTO Exceeded)

**Symptom**: Rollback completes but exceeds 5 minute target

**Check**:
```bash
# Review rollback log
grep "Duration:" /tmp/trigger-worker-rollback-*.log

# Identify bottleneck
grep "step" /tmp/trigger-worker-rollback-*.log | awk '{print $1, $2, $NF}'
```

**Fix**: Optimize slow phase (usually image restore or health checks)

---

## Performance Optimization

### Reduce Deployment Time

1. **Pre-build images**:
   ```bash
   # Build image ahead of deployment
   cd docker/trigger-dev
   docker-compose build trigger-worker
   ```

2. **Increase health check parallelism**:
   ```bash
   # Reduce retry wait time
   HEALTH_CHECK_WAIT=5 ./scripts/deployment/deploy-trigger-worker.sh dev
   ```

3. **Use Docker BuildKit**:
   ```bash
   DOCKER_BUILDKIT=1 docker-compose build trigger-worker
   ```

### Reduce Rollback Time

1. **Keep previous images**:
   ```bash
   # Don't prune Docker images immediately after deployment
   # docker system prune -a  # ❌ Removes previous images
   docker system prune      # ✅ Keeps images
   ```

2. **Pre-load configuration**:
   ```bash
   # Cache configuration in state directory
   # Rollback script automatically uses cached config
   ```

---

## State Management

### View Deployment State

```bash
# Latest deployment state
cat .artifacts/deployment-state/latest-dev

# View metadata
cat .artifacts/deployment-state/$(cat .artifacts/deployment-state/latest-dev)/deployment-metadata.json

# View image tag
cat .artifacts/deployment-state/$(cat .artifacts/deployment-state/latest-dev)/image-tag.txt
```

### Clean Old States

```bash
# Manual cleanup (keep last 5)
cd .artifacts/deployment-state
ls -t dev-* | tail -n +6 | xargs rm -rf

# Automated cleanup (30+ days old)
find .artifacts/deployment-state/ -type d -mtime +30 -exec rm -rf {} +
```

---

## Log Files

### Deployment Logs

```bash
# Latest deployment log
ls -lt /tmp/trigger-worker-deployment-*.log | head -1

# View deployment progress
tail -f /tmp/trigger-worker-deployment-*.log

# Search for errors
grep -i "error\|fail" /tmp/trigger-worker-deployment-*.log
```

### Rollback Logs

```bash
# Latest rollback log
ls -lt /tmp/trigger-worker-rollback-*.log | head -1

# View RTO metrics
grep "RTO" /tmp/trigger-worker-rollback-*.log
```

### Health Check Logs

```bash
# Latest health check log
cat /tmp/trigger-worker-health-checks.log

# Failed checks only
grep "❌" /tmp/trigger-worker-health-checks.log
```

---

## Related Documentation

- **Comprehensive Deployment Guide**: `docker/trigger-dev/DEPLOYMENT.md`
- **Security Assessment**: `planning/trigger/PHASE_1_SECURITY_ASSESSMENT.md`
- **Production Readiness Tests**: `tests/deployment/test-production-readiness.sh`

---

**Last Updated**: 2025-11-23
**Scripts Version**: Phase 1.3
**Tested Environments**: dev, staging, prod
