# Trigger.dev Multi-Environment Deployment Guide

## Overview

This guide covers the Phase 1.3 production deployment preparation for trigger.dev worker deployment with multi-environment Docker Compose configurations and CI/CD automation.

### What's Included

- **3 Environment Configurations**: dev, staging, and production
- **CI/CD Pipeline**: Automated build, test, and deployment workflow
- **Security Hardening**: Integration with Phase 1.2a controls
- **Validation Framework**: Environment configuration checking
- **Operational Runbooks**: Deployment and troubleshooting procedures

## Architecture

### Environment Structure

```
docker/trigger-dev/
├── docker-compose.yml              # Base services (postgres, redis, etc)
├── docker-compose.secrets.yml      # Secrets management
├── Dockerfile.worker               # Worker image definition
└── environments/
    ├── dev.yml                     # Development overrides
    ├── staging.yml                 # Staging overrides
    └── prod.yml                    # Production overrides
```

### Deployment Pipeline

```
Commit → Build Image → Security Tests → Deployment Validation
                                              ↓
                                         Staging Deploy
                                              ↓
                                    Manual Production Approval
                                              ↓
                                        Production Deploy
                                              ↓
                                       (Rollback if failed)
```

## Environment Specifications

### Development Environment

**Location**: `docker/trigger-dev/environments/dev.yml`

**Characteristics**:
- Single instance per service
- Debug logging enabled (LOG_LEVEL=debug)
- Relaxed resource limits (512MB-1GB)
- Fast health check intervals (5s)
- No persistence for Redis (faster iteration)
- Disabled telemetry

**Resource Allocation**:
```yaml
PostgreSQL:
  CPU: 0.5 cores (limit) / 0.25 (reserved)
  Memory: 512MB (limit) / 256MB (reserved)

Redis:
  CPU: 0.25 cores / 0.125 (reserved)
  Memory: 256MB / 128MB (reserved)

Webapp & Worker:
  CPU: 1 core / 0.5 (reserved)
  Memory: 512MB / 256MB (reserved)
```

**Use Cases**:
- Local development and testing
- Quick iteration on code changes
- Debug agent behavior
- Test new features

**Startup Time**: ~30 seconds

### Staging Environment

**Location**: `docker/trigger-dev/environments/staging.yml`

**Characteristics**:
- 2 replicas for webapp and worker (HA testing)
- Info-level logging (less verbose)
- Moderate resource limits (768MB-1GB)
- Health check intervals: 10-20 seconds
- Persistent Redis with AOF
- Rollback strategy on failure
- Monitoring enabled

**Resource Allocation**:
```yaml
PostgreSQL:
  CPU: 1 core / 0.5 (reserved)
  Memory: 1GB / 512MB (reserved)

Redis:
  CPU: 0.5 cores / 0.25 (reserved)
  Memory: 512MB / 256MB (reserved)

Webapp (2 replicas):
  CPU: 1 core / 0.5 (reserved)
  Memory: 768MB / 384MB (reserved)

Worker (2 replicas):
  CPU: 1 core / 0.5 (reserved)
  Memory: 768MB / 384MB (reserved)

Total: ~6.5GB
```

**Update Strategy**:
```yaml
parallelism: 1          # One at a time
delay: 10s              # 10 second wait between updates
failure_action: rollback # Roll back on failure
max_failure_ratio: 0.33 # Can lose 1 of 3 before rolling back
```

**Use Cases**:
- Production-like testing
- Load testing with multiple workers
- Validate deployment procedures
- Test HA and failover
- Security and performance validation

**Startup Time**: ~1 minute (health checks for 2 replicas)

### Production Environment

**Location**: `docker/trigger-dev/environments/prod.yml`

**Characteristics**:
- 3 replicas for all major services (true HA)
- Warn-level logging (minimal)
- High resource allocation (1GB-4GB)
- Strict health checks (30s intervals)
- Full persistence (Postgres, Redis, MinIO)
- Backup volume mounts
- Monitoring and metrics enabled
- Full security hardening

**Resource Allocation**:
```yaml
PostgreSQL:
  CPU: 4 cores / 2 (reserved)
  Memory: 4GB / 2GB (reserved)

Redis:
  CPU: 2 cores / 1 (reserved)
  Memory: 2GB / 1GB (reserved)

Webapp (3 replicas):
  CPU: 2 cores / 1 (reserved)
  Memory: 1GB / 512MB (reserved)

Worker (3 replicas):
  CPU: 2 cores / 1 (reserved)
  Memory: 1GB / 512MB (reserved)

ClickHouse:
  CPU: 4 cores / 2 (reserved)
  Memory: 4GB / 2GB (reserved)

Total: ~20GB for full HA setup
```

**Restart Policy**:
```yaml
condition: on-failure
delay: 10s
max_attempts: 5
window: 120s           # Limit restarts to 5 per 2 minutes
```

**Use Cases**:
- Production workloads
- High-availability requirements
- Multi-node deployments
- Enterprise support

**Startup Time**: ~2 minutes (health checks for 3 replicas of each service)

## Quick Start

### Development (Local)

```bash
# Validate environment
./scripts/deployment/validate-environment.sh dev

# Start services
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  up -d

# View logs
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  logs -f trigger-worker

# Stop services
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  down
```

### Staging Deployment

```bash
# Validate staging configuration
./scripts/deployment/validate-environment.sh staging

# Deploy to staging
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  up -d

# Check deployment status
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  ps

# Watch service health
watch -n 2 'docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  ps'
```

### Production Deployment

```bash
# Validate production configuration
./scripts/deployment/validate-environment.sh prod

# Deploy to production (with manual approval in CI/CD)
# In GitHub Actions, requires manual approval gate

# Or manually for emergency:
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/prod.yml \
  up -d

# Verify all services healthy
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/prod.yml \
  ps --all
```

## Validation Script

### Usage

```bash
./scripts/deployment/validate-environment.sh [env] [--fix] [--quiet]
```

### Options

| Option | Purpose |
|--------|---------|
| `dev` | Validate development configuration |
| `staging` | Validate staging configuration |
| `prod` | Validate production configuration |
| `--fix` | Automatically fix common issues |
| `--quiet` | Suppress output |
| `--help` | Show help message |

### Validation Checks

The script validates:

1. **Directory Structure**: Required files exist
2. **Compose Syntax**: All YAML files are valid
3. **Secrets Configuration**: Required secrets present
4. **Environment Variables**: .env file configured
5. **Resource Limits**: Appropriate for environment
6. **Replicas**: Correct HA configuration
7. **Health Checks**: All services have them
8. **Network**: Custom network configured
9. **Socket Proxy**: Properly configured
10. **Security**: TLS and auth enabled
11. **Volumes**: Named volumes configured
12. **Environment-Specific**: Settings validated per environment

### Example Output

```bash
$ ./scripts/deployment/validate-environment.sh staging
=== Trigger.dev Environment Validation ===
Environment: staging
Project: /home/user/trigger-dev

ℹ Checking directory structure...
✓ Found: docker-compose.yml
✓ Found: docker-compose.secrets.yml
✓ Found: dev.yml
✓ Found: staging.yml
✓ Found: prod.yml

ℹ Validating Docker Compose syntax...
✓ Valid: docker-compose.yml docker-compose.secrets.yml
✓ Valid: docker-compose.yml docker-compose.secrets.yml staging.yml

ℹ Checking required secrets...
✓ Secret configured: ANTHROPIC_API_KEY
✓ Secret configured: POSTGRES_PASSWORD
...

=== Validation Summary ===
Critical errors: 0
Warnings: 2
Validation PASSED with warnings
```

## CI/CD Pipeline

### Pipeline Overview

**File**: `.github/workflows/trigger-deploy.yml`

**Triggers**:
- Push to `main` or `develop` branches
- PR to `main` or `develop`
- Manual workflow dispatch

**Stages**:
1. **Build** (3-5 min): Compile worker image
2. **Security Tests** (2-3 min): 24 security validation tests
3. **Deployment Validation** (2-3 min): Config and readiness checks
4. **Quality Gate** (1 min): Consolidate results
5. **Staging Deploy** (5 min): Auto-deploy to staging
6. **Production Approval** (manual): Await human approval
7. **Production Deploy** (5 min): Deploy to production
8. **Rollback** (if failed): Create rollback issue

### Build Job

**Task**: Compile trigger-dev-worker-cfn Docker image

**Process**:
```
git-checkout → docker-buildx → ghcr.io push → digest+tag output
```

**Output**:
- Docker image tagged: `ghcr.io/org/trigger-dev-worker-cfn:main-<sha>`
- Image digest: SHA256 of compiled image

**Performance**: ~3-5 minutes

### Security Tests (95% Gate)

**Task**: Validate 24 Phase 1.2a security requirements

**Tests**:
1. Environment variable filtering (4 tests)
2. Secrets file access control (4 tests)
3. Socket proxy configuration (4 tests)
4. Encryption key validation (4 tests)
5. Security isolation (4 tests)
6. Auth mechanisms (4 tests)

**Gate**: Must pass 23/24 tests (95.8%)

**Failure**: Blocks staging and production deployments

### Deployment Validation

**Tasks**:
- Validate compose file syntax for all environments
- Check secrets exist and are accessible
- Verify environment-specific settings
- Validate health check configuration
- Check resource limits and replicas

**Checks**:
```
Compose syntax ✓
Secrets ✓
Environment vars ✓
Health checks ✓
Resource limits ✓
Replicas ✓
```

**Failure**: Blocks all deployments

### Staging Deployment

**Trigger**: Automatic on successful quality gate (main branch only)

**Process**:
1. Create GitHub deployment record
2. Deploy using staging.yml config
3. Update deployment status
4. Report deployment URL

**Rollback**: Manual via GitHub

### Production Approval

**Gate**: Manual review and approval required

**Process**:
1. Workflow pauses at approval step
2. Team reviews in: Actions > Workflow Run > Review Deployments
3. Approval grants production access
4. Automated rollback on failure

**Key**: Prevents accidental production deployments

### Production Deployment

**Trigger**: After manual approval (main branch only)

**Process**:
1. Create production GitHub deployment
2. Deploy using prod.yml config
3. Update deployment status
4. Report deployment URL and metrics

**Rollback**: Automatic issue creation on failure

### Rollback Procedure

**Trigger**: Deployment failure on main branch

**Actions**:
1. Create GitHub issue with `priority:critical` label
2. Include deployment logs and commit info
3. Notify team with @team mention
4. Require manual rollback action

**Issue Template**:
```markdown
🚨 Production Deployment Failure - Rollback Required

**Commit**: <sha>
**Branch**: main
**Workflow**: <link to failed workflow>

### Required Actions
1. Review deployment logs
2. Verify current production status
3. Execute rollback if needed
4. Update this issue with results
```

## Security Integration (Phase 1.2a)

All environments maintain Phase 1.2a security controls:

### 1. Docker Secrets

Sensitive data managed via Docker secrets, not environment variables:

```bash
# Create secrets
printf "sk-ant-..." | docker secret create ANTHROPIC_API_KEY -
printf "secure-password" | docker secret create POSTGRES_PASSWORD -

# Access in containers at /run/secrets/
cat /run/secrets/ANTHROPIC_API_KEY
```

### 2. Socket Proxy (Security Hardening - Requirement 2)

Worker connects via socket proxy instead of direct socket mount:

```yaml
trigger-worker:
  environment:
    DOCKER_HOST: tcp://socket-proxy:2375  # Not /var/run/docker.sock
```

**Benefits**:
- Prevents escalation attacks
- Restricts available operations
- Auditable socket access

### 3. Environment Variable Filtering

Only approved variables pass to containers:

```yaml
environment:
  PASS_THROUGH: value          # Passed through
  PRIVATE_KEY: ...             # Filtered out
```

### 4. Encryption

All sensitive data at rest:

```yaml
environment:
  ENCRYPTION_KEY: ${ENCRYPTION_KEY}  # 32+ bytes required
```

### 5. TLS Validation

Production enforces strict TLS:

```yaml
trigger-webapp:
  environment:
    NODE_TLS_REJECT_UNAUTHORIZED: '1'  # In prod
```

## Monitoring & Observability

### Health Checks

Each service has health check configuration:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 30s
```

### Metrics Collection

Production enables metrics export:

```yaml
environment:
  ENABLE_METRICS: 'true'
  METRICS_PORT: '9090'
```

### Logging Levels

Environment-specific logging:

| Environment | Level | Purpose |
|------------|-------|---------|
| dev | debug | Detailed debugging |
| staging | info | Important events |
| prod | warn | Warnings and errors only |

### Resource Monitoring

Track resource usage:

```bash
# Real-time resource usage
docker stats

# Container memory limit
docker inspect trigger-worker | grep Memory

# Network I/O
docker exec trigger-worker cat /proc/net/dev
```

## Troubleshooting

### Services Not Starting

```bash
# Check logs
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  logs trigger-worker

# Common causes
# - Secrets missing: Create .secrets files
# - Port conflicts: Check `docker ps` for port usage
# - Image not available: Build image first
# - Health check failing: Check service logs
```

### Health Check Failures

```bash
# Check service health
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  ps

# Test health endpoint
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  exec trigger-webapp curl -f http://localhost:3000/

# Increase timeout
# Edit environments/dev.yml, increase timeout: and retries:
```

### Network Connectivity Issues

```bash
# Test network
docker network ls
docker network inspect trigger-cfn-network

# Test service discovery
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/dev.yml \
  exec trigger-worker ping postgres

# Common cause: Services not on same network
# Check environments/dev.yml has networks: trigger-cfn-network
```

### Secret Access Issues

```bash
# Verify secrets exist
ls -la docker/trigger-dev/.secrets/

# Test secret access
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  exec trigger-worker cat /run/secrets/ANTHROPIC_API_KEY

# For development, use external files:
# docker-compose.secrets.yml with external: false
```

### Memory/Resource Exhaustion

```bash
# Check resource limits
docker inspect trigger-worker | grep Memory

# Monitor usage
watch -n 2 docker stats

# Solutions:
# 1. Increase limits in environments/*.yml
# 2. Reduce replica count
# 3. Optimize application memory usage
```

## Operational Runbooks

### Scale Workers in Staging/Production

```bash
# Current worker count
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  ps trigger-worker

# Edit environments/staging.yml, change replicas: 2 → 4
# Then:
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  up -d trigger-worker
```

### Update Service (Rolling Update)

```bash
# Staging uses rolling update strategy:
# - Parallelism: 1 (one at a time)
# - Delay: 10s between updates
# - Failure action: rollback

# Trigger update
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  up -d

# Watch progress
watch -n 1 'docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/staging.yml \
  ps'
```

### Rotate Secrets (No Downtime)

```bash
# For Docker Swarm (production)
# 1. Create new secret
printf "new-secret-value" | docker secret create ANTHROPIC_API_KEY2 -

# 2. Update service to use new secret
docker service update --secret-rm ANTHROPIC_API_KEY \
  --secret-add ANTHROPIC_API_KEY2 trigger-dev-worker

# 3. Remove old secret (after confirmation)
docker secret rm ANTHROPIC_API_KEY

# For development/staging (docker-compose)
# 1. Update .secrets/ANTHROPIC_API_KEY file
# 2. Restart service: docker-compose restart trigger-worker
```

### Backup Database (PostgreSQL)

```bash
# Create backup
docker-compose -f docker/trigger-dev/docker-compose.yml \
  exec postgres pg_dump -U postgres trigger > backup-$(date +%s).sql

# Backup directory (production)
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/environments/prod.yml \
  exec postgres pg_dump -U postgres trigger \
  > ./backups/postgres/backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from backup
docker-compose -f docker/trigger-dev/docker-compose.yml \
  exec -T postgres psql -U postgres trigger < backup.sql
```

### Emergency Rollback

```bash
# If production deployment fails:

# 1. Verify current service status
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/prod.yml \
  ps

# 2. Check recent image
docker image ls trigger-dev-worker-cfn | head -3

# 3. Revert to previous image
# Edit docker-compose.yml, set image: trigger-dev-worker-cfn:previous-tag
# Then:
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/prod.yml \
  up -d

# 4. Verify services healthy
docker-compose -f docker/trigger-dev/docker-compose.yml \
  -f docker/trigger-dev/docker-compose.secrets.yml \
  -f docker/trigger-dev/environments/prod.yml \
  ps --all
```

## Specifications Summary

### Configuration Files

| File | Purpose | Environment |
|------|---------|-------------|
| `docker-compose.yml` | Base services | All |
| `docker-compose.secrets.yml` | Secrets management | All |
| `environments/dev.yml` | Development overrides | dev |
| `environments/staging.yml` | Staging overrides | staging |
| `environments/prod.yml` | Production overrides | prod |

### Environment Comparison

| Feature | Dev | Staging | Prod |
|---------|-----|---------|------|
| Replicas | 1 | 2 | 3 |
| Logging | debug | info | warn |
| Health check interval | 5s | 10-20s | 30s |
| Memory limit | 512MB-1GB | 768MB-1GB | 1GB-4GB |
| Restart attempts | 5 | 3 | 5 |
| Monitoring | No | No | Yes |
| Telemetry | Disabled | Enabled | Disabled |
| TLS validation | Disabled | Partial | Enforced |

### Service Dependencies

```
trigger-worker depends on:
  - postgres (healthy)
  - redis (healthy)
  - minio (healthy)
  - clickhouse (healthy)
  - trigger-webapp (healthy)
  - socket-proxy (healthy)

trigger-webapp depends on:
  - postgres (healthy)
  - redis (healthy)
  - minio (healthy)
  - clickhouse (healthy)

socket-proxy depends on:
  - Docker daemon (external)
```

## Success Criteria

### Phase 1.3 Completion Checklist

- [x] 3 environment compose files (dev/staging/prod)
- [x] CI/CD pipeline with 95% security test gate
- [x] Environment validation script
- [x] Deployment documentation
- [x] Multi-replica HA configuration
- [x] Rollback procedures documented
- [x] Monitoring and health checks configured

### Key Metrics

- All 3 environments deployable
- Security tests pass at 95%+ rate
- Validation script catches common misconfigurations
- CI/CD pipeline gates quality before deployment
- Staging deployment automatic, production manual
- Health checks validate service readiness
- Phase 1.2a security controls maintained

## Related Documentation

- **Phase 1.1**: Worker image with 6-provider routing
- **Phase 1.2a**: Security hardening (docker-compose.secrets.yml)
- **Phase 1.2b**: Docker secrets and socket proxy integration
- **CFN Loop Execution**: `docs/guides/CFN_LOOP_ARCHITECTURE.md`
- **Trigger.dev Configuration**: `docker/trigger-dev/CLAUDE.md`

---

**Version**: 1.0
**Phase**: 1.3 Production Deployment Preparation
**Status**: Complete
**Last Updated**: 2025-11-23
