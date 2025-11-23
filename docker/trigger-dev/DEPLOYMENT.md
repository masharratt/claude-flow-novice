# Trigger.dev Worker Deployment Guide

**Phase 1.3 Production Deployment Preparation**

This guide covers automated deployment, rollback, and troubleshooting procedures for the trigger.dev worker with CFN agent orchestration.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Deployment Workflow](#deployment-workflow)
3. [Rollback Procedures](#rollback-procedures)
4. [Health Checks](#health-checks)
5. [Troubleshooting Decision Trees](#troubleshooting-decision-trees)
6. [Environments](#environments)
7. [State Management](#state-management)
8. [Performance Metrics](#performance-metrics)

---

## Quick Start

### Prerequisites

1. **Dependencies running**:
   ```bash
   cd docker/trigger-dev
   docker-compose up -d postgres redis socket-proxy trigger-webapp
   ```

2. **Docker secrets created** (Phase 1.2a):
   ```bash
   # Verify secrets exist
   docker secret ls | grep -E "(api_key|secret|password)"
   ```

3. **Configuration validated**:
   ```bash
   # Check required files
   ls -la docker/trigger-dev/docker-compose*.yml
   ls -la .env
   ```

### Deploy to Development

```bash
# Standard deployment (dev environment)
./scripts/deployment/deploy-trigger-worker.sh dev

# Monitor deployment logs
tail -f /tmp/trigger-worker-deployment-*.log
```

### Deploy to Production

```bash
# Production deployment with all validations
./scripts/deployment/deploy-trigger-worker.sh prod

# Verify health after deployment
./scripts/deployment/health-checks.sh
```

---

## Deployment Workflow

### Blue-Green Deployment Pattern

The deployment script implements **zero-downtime blue-green deployments**:

```
Current (Blue)          Green Deployment        Promoted Green
    ↓                         ↓                       ↓
┌─────────┐            ┌─────────┐             ┌─────────┐
│ Worker  │            │ Worker  │             │ Worker  │
│ (Blue)  │  Build →   │ (Green) │  Switch →   │(Primary)│
│ Running │            │ Testing │             │ Running │
└─────────┘            └─────────┘             └─────────┘
                            ↓
                     Health Checks
                     (10 validations)
                            ↓
                    Pass? → Switch
                    Fail? → Rollback
```

### Deployment Phases

#### Phase 1: Pre-Deployment Validation (30-60s)

```bash
# What gets validated:
✓ Environment parameter (dev/staging/prod)
✓ All 10 Docker secrets exist
✓ Configuration files present
✓ Dependencies healthy (postgres, redis, socket-proxy, webapp)
```

**Validation failures stop deployment immediately** - no partial deployments.

#### Phase 2: State Preservation (5-10s)

```bash
# State backup location:
.artifacts/deployment-state/dev-20251123-120000/
├── container-config.json          # Current container settings
├── image-tag.txt                  # Current Docker image
├── env-backup                     # Environment variables
├── docker-compose.yml.backup      # Compose configuration
├── docker-compose.secrets.yml.backup
└── deployment-metadata.json       # Deployment context
```

**Why preserve state**: Enables fast rollback without git operations or manual configuration.

#### Phase 3: Image Build (2-5 min)

```bash
# Build new worker image
docker-compose build --no-cache trigger-worker

# Image includes:
- CFN agent profiles (23 agents)
- 6-provider routing (Z.ai, Kimi, OpenRouter, Anthropic, Gemini, XAi)
- Socket proxy client configuration
- Security hardening (non-root user, secret loading)
```

**Build failures trigger automatic rollback**.

#### Phase 4: Green Deployment (1-2 min)

```bash
# Start green instance with different name
docker-compose run -d --name trigger-dev-worker-green trigger-worker

# Wait for initialization (30s)
# Container starts, loads secrets, connects to services
```

#### Phase 5: Health Validation (1-3 min)

10 comprehensive health checks run against the green deployment:

1. ✓ Container running and healthy
2. ✓ Socket proxy accessible
3. ✓ All 10 secrets loaded
4. ✓ Agent profiles accessible (≥20 profiles)
5. ✓ Provider routing configured (≥2 providers)
6. ✓ Redis connectivity
7. ✓ PostgreSQL connectivity
8. ✓ No critical errors in logs
9. ✓ Resource usage within limits (CPU <90%, Memory <80%)
10. ✓ Container uptime ≥30s

**Health check failures trigger automatic rollback**.

#### Phase 6: Blue-Green Switch (<5s)

```bash
# Zero-downtime cutover:
1. Rename current worker → trigger-dev-worker-blue (backup)
2. Rename green worker → trigger-dev-worker (primary)
3. Cleanup blue deployment
```

**Switch failures trigger automatic rollback**.

#### Phase 7: Final Validation (30s)

```bash
# Re-run health checks on promoted deployment
./scripts/deployment/health-checks.sh

# Verify all 10 checks still pass
```

**Total deployment time**: 4-10 minutes (target: <10 min)

---

## Rollback Procedures

### Fast Rollback (RTO ≤5 min)

```bash
# Automatic rollback (triggered by deployment failures)
# Manual rollback with reason
./scripts/deployment/rollback-trigger-worker.sh dev "Health checks failed"

# Emergency rollback (production)
./scripts/deployment/rollback-trigger-worker.sh prod "Critical bug detected"
```

### Rollback Workflow

```
Current Deployment      Stop & Remove       Restore Previous
      ↓                      ↓                     ↓
┌──────────┐           ┌──────────┐          ┌──────────┐
│  Worker  │  Stop →   │ Stopped  │  Start → │ Previous │
│ (Failed) │           │          │          │  Worker  │
│          │           │          │          │ (Stable) │
└──────────┘           └──────────┘          └──────────┘
                                                   ↓
                                            Health Checks
                                             (10 validations)
```

### Rollback Phases

#### Phase 1: Pre-Rollback State Preservation (5-10s)

```bash
# Save current state before rollback
.artifacts/deployment-state/rollback-dev-20251123-123000/
├── container-config.json
├── image-tag.txt
└── rollback-metadata.json  # Includes rollback reason
```

#### Phase 2: Stop Current Deployment (10-20s)

```bash
docker stop trigger-dev-worker
docker rm trigger-dev-worker
```

#### Phase 3: Restore Previous Configuration (10-20s)

```bash
# Restore from latest deployment state
cp .artifacts/deployment-state/dev-20251123-120000/docker-compose.yml docker/trigger-dev/
cp .artifacts/deployment-state/dev-20251123-120000/env-backup .env
```

#### Phase 4: Restore Previous Image (30-60s)

```bash
# Use previous Docker image tag
# If image not found locally, rebuild from configuration
```

#### Phase 5: Start Previous Deployment (30-60s)

```bash
docker-compose up -d trigger-worker
# Wait 30s for initialization
```

#### Phase 6: Health Validation (1-3 min)

```bash
# Run all 10 health checks
# Retry up to 3 times with 10s wait
```

**Total rollback time**: 2-5 minutes (target: ≤5 min)

---

## Health Checks

### Health Check Script

```bash
# Run standalone health checks
./scripts/deployment/health-checks.sh

# Check specific validations
LOG_FILE=/tmp/health.log ./scripts/deployment/health-checks.sh
```

### Health Check Details

| Check | Description | Failure Impact |
|-------|-------------|----------------|
| **1. Container Running** | Worker container state is "running" | CRITICAL - Deployment fails |
| **2. Container Health** | Uptime ≥30s, no restart loops | CRITICAL - Deployment fails |
| **3. Socket Proxy** | http://socket-proxy:2375 accessible | CRITICAL - Agent spawning broken |
| **4. Secrets Loaded** | All 10 secrets in /run/secrets/ | CRITICAL - Authentication fails |
| **5. Agent Profiles** | ≥20 agent profiles accessible | HIGH - Missing agents |
| **6. Provider Routing** | ≥2 AI providers configured | HIGH - Limited routing options |
| **7. Redis Connectivity** | redis:6379 reachable | HIGH - Coordination broken |
| **8. PostgreSQL Connectivity** | postgres:5432 reachable | HIGH - Database unavailable |
| **9. No Critical Errors** | <3 error patterns in logs | MEDIUM - Potential issues |
| **10. Resource Usage** | CPU <90%, Memory <80% | MEDIUM - Performance degradation |

### Health Check Thresholds

```bash
# Configurable via environment variables
REQUIRED_SECRETS=10        # Minimum secrets required
MAX_MEMORY_PERCENT=80      # Memory usage threshold
MAX_CPU_PERCENT=90         # CPU usage threshold
MIN_PROVIDERS=2            # Minimum AI providers
```

---

## Troubleshooting Decision Trees

### Deployment Failure Decision Tree

```
Deployment Failed
    ↓
┌───────────────────────────────────────┐
│ What phase failed?                    │
└───────────────────────────────────────┘
    ↓
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Validation  │ Build       │ Health      │ Switch      │
└─────────────┴─────────────┴─────────────┴─────────────┘
      ↓              ↓             ↓             ↓
   FIX-001        FIX-002       FIX-003       FIX-004
```

#### FIX-001: Validation Failures

**Symptom**: Deployment stops during pre-deployment validation

**Common Causes**:

1. **Missing Docker secrets**
   ```bash
   # Check which secrets are missing
   docker secret ls | grep -E "(api_key|secret|password)"

   # Create missing secrets (Phase 1.2a)
   echo "secret-value" | docker secret create secret_name -
   ```

2. **Dependencies not healthy**
   ```bash
   # Check dependency status
   docker-compose ps postgres redis socket-proxy trigger-webapp

   # Start missing dependencies
   docker-compose up -d postgres redis socket-proxy trigger-webapp

   # Wait for health checks
   sleep 30
   ```

3. **Configuration files missing**
   ```bash
   # Verify required files exist
   ls -la docker/trigger-dev/docker-compose.yml
   ls -la docker/trigger-dev/docker-compose.secrets.yml
   ls -la docker/trigger-dev/Dockerfile.worker
   ls -la .env

   # Restore from git if missing
   git checkout docker/trigger-dev/
   ```

**Resolution**: Fix validation issue and re-run deployment.

#### FIX-002: Build Failures

**Symptom**: Docker image build fails

**Common Causes**:

1. **Docker build context too large**
   ```bash
   # Use .dockerignore to exclude large directories
   cat >> docker/trigger-dev/.dockerignore <<EOF
   node_modules
   .git
   .artifacts
   tests
   EOF
   ```

2. **Out of disk space**
   ```bash
   # Check disk space
   df -h

   # Clean up unused Docker images
   docker system prune -a --volumes -f

   # Remove old worker images
   docker images | grep trigger-dev-worker | awk '{print $3}' | xargs docker rmi -f
   ```

3. **Network issues during dependency installation**
   ```bash
   # Build with verbose logging
   docker-compose build --no-cache --progress=plain trigger-worker

   # Check network connectivity
   curl -I https://registry.npmjs.org/
   ```

**Resolution**: Fix build issue and re-run deployment.

#### FIX-003: Health Check Failures

**Symptom**: Green deployment fails health validation

**Common Causes**:

1. **Secrets not loading correctly**
   ```bash
   # Check secret files exist in container
   docker exec trigger-dev-worker-green ls -la /run/secrets/

   # Verify secret content (sample one secret)
   docker exec trigger-dev-worker-green cat /run/secrets/trigger_secret_key

   # Re-create corrupted secrets
   docker secret rm secret_name
   echo "new-value" | docker secret create secret_name -
   ```

2. **Socket proxy not accessible**
   ```bash
   # Test socket proxy from green container
   docker exec trigger-dev-worker-green wget -O- http://socket-proxy:2375/containers/json

   # Check socket proxy logs
   docker logs trigger-dev-socket-proxy --tail 50

   # Restart socket proxy if needed
   docker-compose restart socket-proxy
   ```

3. **Resource limits exceeded**
   ```bash
   # Check resource usage
   docker stats trigger-dev-worker-green

   # Increase memory limit in docker-compose.yml
   # deploy:
   #   resources:
   #     limits:
   #       memory: 4G  # Increase from 2G
   ```

**Resolution**: Fix health issue and re-run deployment (automatic rollback preserves previous state).

#### FIX-004: Switch Failures

**Symptom**: Blue-green cutover fails

**Common Causes**:

1. **Container naming conflict**
   ```bash
   # Check for name conflicts
   docker ps -a | grep trigger-dev-worker

   # Manually remove conflicting containers
   docker rm -f trigger-dev-worker-blue
   docker rm -f trigger-dev-worker-green
   ```

2. **Network issues during rename**
   ```bash
   # Check Docker daemon status
   systemctl status docker

   # Restart Docker daemon if needed
   sudo systemctl restart docker

   # Re-run deployment
   ```

**Resolution**: Fix switch issue and re-run deployment (automatic rollback preserves previous state).

---

### Rollback Failure Decision Tree

```
Rollback Failed
    ↓
┌───────────────────────────────────────┐
│ What phase failed?                    │
└───────────────────────────────────────┘
    ↓
┌─────────────┬─────────────┬─────────────┐
│ State       │ Restore     │ Health      │
│ Not Found   │ Failed      │ Failed      │
└─────────────┴─────────────┴─────────────┘
      ↓              ↓             ↓
   FIX-005        FIX-006       FIX-007
```

#### FIX-005: State Not Found

**Symptom**: No deployment state backup found for rollback

**Cause**: First deployment or state directory cleaned

**Resolution**:
```bash
# Cannot rollback without state - deploy fresh
./scripts/deployment/deploy-trigger-worker.sh dev

# Future rollbacks will work after first successful deployment
```

#### FIX-006: Restore Failed

**Symptom**: Cannot restore previous configuration or image

**Resolution**:
```bash
# Emergency recovery - start with latest image
cd docker/trigger-dev
docker-compose up -d trigger-worker

# Verify worker started
docker ps | grep trigger-dev-worker

# Run health checks
./scripts/deployment/health-checks.sh
```

#### FIX-007: Health Failed After Rollback

**Symptom**: Rolled-back deployment fails health checks

**Resolution**:
```bash
# Check logs for errors
docker logs trigger-dev-worker --tail 100

# Try emergency recovery
cd docker/trigger-dev
docker-compose down
docker-compose up -d

# If still failing, manual intervention required
# Contact DevOps team
```

---

## Environments

### Environment Configuration

| Environment | Purpose | Validation Level | RTO Target |
|-------------|---------|------------------|------------|
| **dev** | Development testing | Standard | 5 min |
| **staging** | Pre-production validation | Enhanced | 3 min |
| **prod** | Production deployment | Maximum | 2 min |

### Environment-Specific Settings

#### Development (dev)

```bash
# Relaxed validation, faster deployment
./scripts/deployment/deploy-trigger-worker.sh dev

# Features:
- Standard health checks
- 3 retry attempts
- 10s retry wait
- Full logging
```

#### Staging (staging)

```bash
# Enhanced validation, production-like
./scripts/deployment/deploy-trigger-worker.sh staging

# Features:
- Enhanced health checks
- 5 retry attempts
- 5s retry wait
- Detailed logging
```

#### Production (prod)

```bash
# Maximum validation, zero-downtime critical
./scripts/deployment/deploy-trigger-worker.sh prod

# Features:
- Maximum health checks
- 5 retry attempts
- 5s retry wait
- Audit logging
- Deployment notifications
```

---

## State Management

### State Directory Structure

```
.artifacts/deployment-state/
├── dev-20251123-120000/           # Deployment state backup
│   ├── container-config.json
│   ├── image-tag.txt
│   ├── env-backup
│   ├── docker-compose.yml.backup
│   ├── docker-compose.secrets.yml.backup
│   └── deployment-metadata.json
├── rollback-dev-20251123-123000/  # Pre-rollback state backup
│   ├── container-config.json
│   ├── image-tag.txt
│   └── rollback-metadata.json
└── latest-dev                     # Pointer to latest deployment
```

### State Retention Policy

- **Deployment states**: Keep last 5 per environment
- **Rollback states**: Keep last 3 per environment
- **Cleanup**: Automatic after 30 days

### Manual State Management

```bash
# List all deployment states
ls -lt .artifacts/deployment-state/

# View latest deployment metadata
cat .artifacts/deployment-state/$(cat .artifacts/deployment-state/latest-dev)/deployment-metadata.json

# Manually clean old states (older than 30 days)
find .artifacts/deployment-state/ -type d -mtime +30 -exec rm -rf {} +
```

---

## Performance Metrics

### Deployment Performance Targets

| Metric | Target | Acceptable | Warning |
|--------|--------|------------|---------|
| **Total Deployment Time** | <10 min | <15 min | >15 min |
| **Health Check Time** | <3 min | <5 min | >5 min |
| **Image Build Time** | <5 min | <8 min | >8 min |
| **Rollback Time (RTO)** | ≤5 min | ≤8 min | >8 min |

### Deployment Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Deployment Success Rate** | ≥95% | Successful deployments / Total attempts |
| **Rollback Rate** | ≤5% | Rollbacks / Total deployments |
| **Health Check Pass Rate** | 100% | Passing checks / Total checks |
| **Zero-Downtime Deployments** | 100% | Zero-downtime cutover / Total |

### Monitoring Deployment Performance

```bash
# Track deployment durations
grep "Duration:" /tmp/trigger-worker-deployment-*.log | awk '{print $NF}' | sort -n

# Calculate average deployment time
grep "Duration:" /tmp/trigger-worker-deployment-*.log | awk '{sum+=$NF; count++} END {print sum/count "s"}'

# Track rollback RTO compliance
grep "RTO met" /tmp/trigger-worker-rollback-*.log | wc -l
grep "RTO exceeded" /tmp/trigger-worker-rollback-*.log | wc -l
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Dependencies running (postgres, redis, socket-proxy, webapp)
- [ ] All 10 Docker secrets created
- [ ] Configuration files validated
- [ ] Disk space available (≥5GB free)
- [ ] Docker daemon healthy
- [ ] Recent backup of .env file

### During Deployment

- [ ] Monitor deployment logs
- [ ] Watch health check progress
- [ ] Verify green deployment starts
- [ ] Confirm blue-green switch
- [ ] Verify final health validation

### Post-Deployment

- [ ] Worker container running
- [ ] All health checks passing
- [ ] No errors in worker logs
- [ ] Resource usage within limits
- [ ] State backup created
- [ ] Update deployment documentation

### Post-Rollback

- [ ] Previous deployment restored
- [ ] All health checks passing
- [ ] Root cause identified
- [ ] Fix plan documented
- [ ] Rollback reason logged

---

## Support and Contact

### Deployment Issues

**During business hours**:
- DevOps Team: devops@example.com
- Slack: #trigger-dev-deployments

**After hours**:
- PagerDuty: trigger-dev-oncall
- Emergency hotline: +1-XXX-XXX-XXXX

### Logs and Diagnostics

```bash
# Deployment logs
/tmp/trigger-worker-deployment-*.log

# Rollback logs
/tmp/trigger-worker-rollback-*.log

# Health check logs
/tmp/trigger-worker-health-checks.log

# Worker container logs
docker logs trigger-dev-worker --tail 200
```

---

## Related Documentation

- **Phase 1.2a Security Assessment**: `planning/trigger/PHASE_1_SECURITY_ASSESSMENT.md`
- **Trigger.dev Architecture**: `docker/trigger-dev/CLAUDE.md`
- **Docker Secrets Management**: `docker/trigger-dev/README.md`
- **CFN Agent Orchestration**: `docker/CLAUDE.md`

---

**Last Updated**: 2025-11-23
**Phase**: 1.3 Production Deployment Preparation
**Status**: Complete - Ready for production deployment
