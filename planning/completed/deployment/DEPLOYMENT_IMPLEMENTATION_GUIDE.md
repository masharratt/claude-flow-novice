# Deployment Pipeline Implementation Guide

**Status:** Production Ready
**Version:** 1.0
**Created:** 2025-11-15
**Target Audience:** DevOps Engineers, Platform Architects

---

## Executive Summary

This guide provides step-by-step implementation instructions for the Claude Flow Novice deployment and handoff pipeline standards. It covers:

1. **Quick Start** - Get deployment automation running in 30 minutes
2. **Phased Implementation** - Full rollout over 4 weeks
3. **Validation Procedures** - Ensure correct implementation
4. **Troubleshooting** - Solve common issues
5. **Runbook Integration** - Operationalize the system

---

## Part 1: Quick Start (30 Minutes)

### Phase 1.1: Deploy Service Discovery (5 minutes)

**Goal:** Enable services to find each other

```bash
# 1. Make service discovery script executable
chmod +x /home/user/claude-flow-novice/scripts/deployment/service-discovery.sh

# 2. Test service discovery
cd /home/user/claude-flow-novice
./scripts/deployment/service-discovery.sh report
```

**Expected Output:**
```
SERVICE DISCOVERY REPORT
======================================================================

ENVIRONMENT VARIABLES:
  CFN_REDIS_HOST:        localhost
  CFN_REDIS_PORT:        6379
  ...

SERVICE DISCOVERY STATUS:
  Redis:                 ✓ Available
  API:                   ⚠ May not be ready
  Skills Database:       ✓ Available
```

**Validation:**
- [ ] Service discovery script runs without errors
- [ ] Report shows at least Redis or database available
- [ ] Skills directory is found

### Phase 1.2: Deploy Health Checks (10 minutes)

**Goal:** Monitor system dependencies

```bash
# 1. Make health check script executable
chmod +x /home/user/claude-flow-novice/scripts/deployment/health-check-service.sh

# 2. Run comprehensive health check
./scripts/deployment/health-check-service.sh check-all

# 3. Generate JSON report
./scripts/deployment/health-check-service.sh report /tmp/health-report.json
```

**Expected Output:**
```
[CHECK] Redis (localhost:6379)... ✓ HEALTHY (latency: 2ms)
[CHECK] Skills Database (./config/skills.db)... ✓ HEALTHY (size: 24MB)
[CHECK] File System (./config)... ✓ HEALTHY
[CHECK] Disk Space... ✓ HEALTHY (50GB available)
[CHECK] Memory Usage... ✓ HEALTHY (45% used)
[CHECK] Critical Processes... ✓ HEALTHY
```

**Validation:**
- [ ] Health check script runs without errors
- [ ] All major components show healthy status
- [ ] JSON report is created and valid

### Phase 1.3: Run Integration Tests (15 minutes)

**Goal:** Validate all integration points

```bash
# 1. Make test script executable
chmod +x /home/user/claude-flow-novice/tests/integration/integration-test-framework.sh

# 2. Run all integration tests
cd /home/user/claude-flow-novice
./tests/integration/integration-test-framework.sh

# 3. Review test results
cat .test-results/integration-test-*.log | tail -50
```

**Expected Output:**
```
TEST: Service Discovery Integration
TEST: Health Check Integration
TEST: Configuration Discovery
TEST: Skills Database Integration
TEST: Deployment Scripts Exist
TEST: Integration Documentation
TEST: Environment Variable Loading
TEST: Smoke Test - End-to-End

TEST SUMMARY
======================================================================

Results:
  Passed:  8
  Failed:  0
  Skipped: 0
```

**Validation:**
- [ ] All tests pass (or minimal failures are expected)
- [ ] No blocking failures in deployment infrastructure
- [ ] Log files are generated

---

## Part 2: Phased Implementation (4 Weeks)

### Week 1: Service Discovery & Configuration Management

**Objectives:**
- [ ] Environment variable management standardized
- [ ] Configuration paths convention-established
- [ ] Service registry operational in Redis

**Tasks:**

1. **Create .env.local with environment overrides**
   ```bash
   cat > /home/user/claude-flow-novice/.env.local <<'EOF'
   # Production-specific overrides
   CFN_REDIS_HOST=cfn-redis.prod.local
   CFN_REDIS_PASSWORD=your-secure-password
   CFN_SKILLS_DB_PATH=/data/prod/skills.db
   CFN_ENABLE_PROGRESS_TRACKING=true
   EOF

   chmod 600 /home/user/claude-flow-novice/.env.local  # Restrict permissions
   ```

2. **Create configuration discovery helper**
   ```bash
   cat > /home/user/claude-flow-novice/scripts/deployment/load-environment.sh <<'EOF'
   #!/bin/bash
   # Load environment with layering

   ENV_FILE="${1:-.env}"
   LOCAL_ENV="${ENV_FILE%.env}.env.local"
   PROVIDER_ENV="${ENV_FILE%.env}.env.${CFN_CUSTOM_ROUTING:-standard}"

   # Source in order (later files override earlier)
   [[ -f "$ENV_FILE" ]] && source "$ENV_FILE"
   [[ -f "$LOCAL_ENV" ]] && source "$LOCAL_ENV"
   [[ -f "$PROVIDER_ENV" ]] && source "$PROVIDER_ENV"

   # Validate required variables
   export CFN_REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
   export CFN_REDIS_PORT="${CFN_REDIS_PORT:-6379}"
   export CFN_CONFIG_PATH="${CFN_CONFIG_PATH:-./config}"
   EOF

   chmod +x /home/user/claude-flow-novice/scripts/deployment/load-environment.sh
   ```

3. **Document service discovery in team wiki**
   - Service discovery flow diagram
   - Environment variable mapping
   - Configuration path resolution order

4. **Set up service registry monitoring**
   ```bash
   # Create Redis service registry monitoring
   watch -n 5 'redis-cli KEYS "service:*"'
   ```

**Success Criteria:**
- [ ] `.env.local` properly isolates secrets
- [ ] `load-environment.sh` loads all variable layers
- [ ] Service discovery script finds 100% of available services
- [ ] Team understands discovery mechanism

### Week 2: Deployment Automation & Rollback

**Objectives:**
- [ ] Skill deployment pipeline automated
- [ ] Configuration change propagation working
- [ ] Rollback procedures tested

**Tasks:**

1. **Implement skill deployment automation**
   ```bash
   cat > /home/user/claude-flow-novice/scripts/deployment/deploy-skill.sh <<'EOF'
   #!/bin/bash
   set -euo pipefail

   SKILL_NAME="$1"
   SKILL_PATH="${2:-./.claude/skills/${SKILL_NAME}}"

   echo "[DEPLOY] Deploying skill: $SKILL_NAME"

   # Validate
   [[ -f "${SKILL_PATH}/SKILL.md" ]] || { echo "ERROR: Invalid skill"; exit 1; }

   # Backup
   DB_BACKUP="${CFN_SKILLS_DB_PATH}.backup.$(date +%s)"
   cp "${CFN_SKILLS_DB_PATH}" "$DB_BACKUP"
   trap "cp '$DB_BACKUP' '${CFN_SKILLS_DB_PATH}'; rm '$DB_BACKUP'" ERR

   # Deploy
   tar -czf "/tmp/${SKILL_NAME}.tar.gz" -C "$(dirname "$SKILL_PATH")" "$SKILL_NAME"
   sqlite3 "${CFN_SKILLS_DB_PATH}" \
       "INSERT OR REPLACE INTO skills (name, deployed_at) VALUES ('$SKILL_NAME', datetime('now'));"

   # Invalidate caches
   redis-cli DEL "skill:${SKILL_NAME}:cache"
   redis-cli PUBLISH "skill:deployed" "$SKILL_NAME"

   # Cleanup
   rm "$DB_BACKUP"
   echo "[DEPLOY] Skill deployed successfully: $SKILL_NAME"
   EOF

   chmod +x /home/user/claude-flow-novice/scripts/deployment/deploy-skill.sh
   ```

2. **Create deployment history tracking**
   ```bash
   cat > /home/user/claude-flow-novice/scripts/deployment/record-deployment.sh <<'EOF'
   #!/bin/bash

   COMPONENT="$1"
   VERSION="$2"
   STATUS="${3:-success}"

   DEPLOYMENT_ID="deploy-${COMPONENT}-$(date +%s)"

   redis-cli LPUSH "deployment:history:${COMPONENT}" "$DEPLOYMENT_ID"
   redis-cli HSET "deployment:${DEPLOYMENT_ID}" \
       component "$COMPONENT" \
       version "$VERSION" \
       status "$STATUS" \
       timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

   echo "Recorded deployment: $DEPLOYMENT_ID"
   EOF

   chmod +x /home/user/claude-flow-novice/scripts/deployment/record-deployment.sh
   ```

3. **Test rollback procedures**
   ```bash
   # Simulate a deployment
   ./scripts/deployment/record-deployment.sh "test-skill" "1.0" "success"
   ./scripts/deployment/record-deployment.sh "test-skill" "2.0" "failed"

   # Verify deployment history
   redis-cli LRANGE "deployment:history:test-skill" 0 -1
   ```

4. **Document rollback procedures**
   - Rollback decision criteria
   - Rollback execution steps
   - Verification procedures

**Success Criteria:**
- [ ] Skill deployment script runs successfully
- [ ] Deployment history is recorded in Redis
- [ ] Rollback can be performed manually
- [ ] All deployments are logged

### Week 3: Health Monitoring & Observability

**Objectives:**
- [ ] Health checks integrated into monitoring
- [ ] Metrics collection enabled
- [ ] Alerting configured

**Tasks:**

1. **Set up continuous health monitoring**
   ```bash
   # Create systemd service for continuous monitoring (optional)
   cat > /tmp/cfn-health-monitor.service <<'EOF'
   [Unit]
   Description=Claude Flow Novice Health Monitor
   After=network.target

   [Service]
   Type=simple
   ExecStart=/home/user/claude-flow-novice/scripts/deployment/health-check-service.sh monitor 60
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   EOF

   # Or run as background process
   nohup /home/user/claude-flow-novice/scripts/deployment/health-check-service.sh monitor 60 > /var/log/cfn-health-monitor.log 2>&1 &
   ```

2. **Create health check HTTP endpoint** (if running API)
   ```javascript
   // routes/health.ts
   import express from 'express';
   import { exec } from 'child_process';

   const router = express.Router();

   router.get('/health', async (req, res) => {
     try {
       const healthOutput = await execPromise(
         '/home/user/claude-flow-novice/scripts/deployment/health-check-service.sh report-json'
       );
       const healthData = JSON.parse(healthOutput);
       res.status(healthData.overall_status === 'healthy' ? 200 : 503).json(healthData);
     } catch (error) {
       res.status(503).json({ error: 'Health check failed' });
     }
   });

   export default router;
   ```

3. **Configure monitoring dashboard**
   - Health status panel (Redis, Database, Filesystem)
   - Dependency metrics
   - Alert status
   - Deployment history

4. **Set up alert thresholds**
   ```json
   {
     "alerts": [
       {
         "name": "redis_latency_high",
         "metric": "redis_latency_ms",
         "threshold": 50,
         "severity": "warning"
       },
       {
         "name": "disk_space_critical",
         "metric": "disk_available_gb",
         "threshold": 1,
         "severity": "critical"
       },
       {
         "name": "skill_deployment_failed",
         "metric": "deployment_status",
         "threshold": 0,
         "severity": "critical"
       }
     ]
   }
   ```

**Success Criteria:**
- [ ] Health checks run continuously
- [ ] Health endpoint returns correct JSON
- [ ] Monitoring dashboard displays all metrics
- [ ] Alerts are triggered on threshold violations

### Week 4: Integration Testing & Documentation

**Objectives:**
- [ ] All integration tests passing
- [ ] Runbooks created for common scenarios
- [ ] Team trained on deployment procedures

**Tasks:**

1. **Complete integration testing**
   ```bash
   # Run full test suite weekly
   ./tests/integration/integration-test-framework.sh --verbose

   # Verify all tests pass
   echo "Exit code: $?"
   ```

2. **Create deployment runbooks**
   - Skill deployment runbook
   - Configuration change runbook
   - Rollback runbook
   - Incident response runbook

3. **Document integration points**
   For each integration point, create:
   - Service discovery details
   - Health check specifics
   - Deployment procedures
   - Common failure scenarios
   - Recovery procedures

4. **Team training**
   - Service discovery mechanism overview
   - Health check interpretation
   - Deployment procedure walkthrough
   - Rollback scenario practice

**Success Criteria:**
- [ ] All integration tests pass
- [ ] Runbooks are documented and accessible
- [ ] Team can execute deployments independently
- [ ] Post-incident reviews include runbook updates

---

## Part 3: Validation Procedures

### Deployment Readiness Checklist

Before any production deployment:

```bash
# 1. Run pre-deployment checks
./scripts/deployment/service-discovery.sh discover-all
./scripts/deployment/health-check-service.sh check-all

# 2. Run integration tests
./tests/integration/integration-test-framework.sh

# 3. Verify no blocking issues
echo "If all above passed, deployment is ready"
```

### Integration Point Validation

For each integration point, verify:

**Service Discovery:**
- [ ] Service endpoint is discoverable
- [ ] Service responds to ping/health check
- [ ] Connection latency acceptable

**Deployment:**
- [ ] Package created successfully
- [ ] Database entry inserted
- [ ] Caches invalidated
- [ ] Agents notified

**Health Checks:**
- [ ] Health endpoint responds with 200
- [ ] All dependencies reported
- [ ] Status correctly reflects actual state

**Monitoring:**
- [ ] Metrics are collected
- [ ] Dashboard shows current data
- [ ] Alerts trigger on thresholds

---

## Part 4: Troubleshooting

### Common Issues

#### Issue: Service Discovery Not Finding Redis

**Diagnosis:**
```bash
./scripts/deployment/service-discovery.sh discover-redis
# Should return: redis://localhost:6379
```

**Solutions:**
1. Check Redis is running:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

2. Check environment variables:
   ```bash
   echo "REDIS_HOST: ${CFN_REDIS_HOST:-not set}"
   echo "REDIS_PORT: ${CFN_REDIS_PORT:-not set}"
   ```

3. Verify network connectivity:
   ```bash
   telnet localhost 6379
   # Should connect successfully
   ```

#### Issue: Health Check Shows Degraded Status

**Diagnosis:**
```bash
./scripts/deployment/health-check-service.sh report /tmp/health.json
jq '.components' /tmp/health.json
```

**Solutions:**
- Check individual component status
- Run focused health checks
- Review component logs
- Consult component-specific troubleshooting

#### Issue: Deployment Fails with Database Error

**Diagnosis:**
```bash
# Check database accessibility
sqlite3 "${CFN_SKILLS_DB_PATH}" "SELECT COUNT(*) FROM sqlite_master;"

# Check database permissions
ls -la "${CFN_SKILLS_DB_PATH}"

# Check disk space
df -h
```

**Solutions:**
1. Verify database permissions:
   ```bash
   chmod 644 "${CFN_SKILLS_DB_PATH}"
   ```

2. Check disk space:
   ```bash
   # Clean up old backups
   rm -f "${CFN_SKILLS_DB_PATH}.backup."*
   ```

3. Verify database integrity:
   ```bash
   sqlite3 "${CFN_SKILLS_DB_PATH}" "PRAGMA integrity_check;"
   ```

---

## Part 5: Operationalization

### Daily Operations

**Morning Health Check:**
```bash
#!/bin/bash
echo "=== Daily Health Check ==="
/home/user/claude-flow-novice/scripts/deployment/service-discovery.sh report
/home/user/claude-flow-novice/scripts/deployment/health-check-service.sh report /tmp/daily-health.json
echo "Report saved to: /tmp/daily-health.json"
```

**Deployment Process:**
```bash
#!/bin/bash
SKILL_NAME="$1"

echo "Deploying skill: $SKILL_NAME"

# Pre-deployment
./scripts/deployment/health-check-service.sh check-all || exit 1

# Deploy
./scripts/deployment/deploy-skill.sh "$SKILL_NAME"
DEPLOY_EXIT=$?

# Record deployment
./scripts/deployment/record-deployment.sh "$SKILL_NAME" "1.0" \
    "$([ $DEPLOY_EXIT -eq 0 ] && echo success || echo failed)"

# Post-deployment validation
./scripts/deployment/health-check-service.sh report /tmp/post-deploy-health.json

exit $DEPLOY_EXIT
```

**Incident Response:**
```bash
#!/bin/bash
echo "=== Incident Response Check ==="

# 1. Full health check
./scripts/deployment/health-check-service.sh check-all

# 2. Check recent deployments
redis-cli LRANGE deployment:history:* 0 5

# 3. Review logs
tail -50 /var/log/cfn-health-monitor.log

# 4. Check service registry
redis-cli KEYS "service:*"

# 5. Generate diagnostic report
./scripts/deployment/health-check-service.sh report /tmp/incident-diagnostics.json
```

### Monitoring & Alerting

**Set up automated health checks:**
```bash
# Add to crontab for continuous monitoring
* * * * * /home/user/claude-flow-novice/scripts/deployment/health-check-service.sh report /tmp/health-$(date +\%s).json

# Check health every 5 minutes
*/5 * * * * /home/user/claude-flow-novice/scripts/deployment/health-check-service.sh check-all >> /var/log/cfn-health-check.log 2>&1
```

**Alert on failures:**
```bash
# Send alert if health check fails
if ! /home/user/claude-flow-novice/scripts/deployment/health-check-service.sh check-all; then
    # Send alert to monitoring system
    curl -X POST https://monitoring.example.com/api/alerts \
        -d '{"severity":"critical","message":"CFN health check failed"}'
fi
```

---

## Part 6: Measurement & Optimization

### Key Metrics to Track

1. **Deployment Metrics:**
   - Deployment frequency
   - Lead time for changes
   - Deployment success rate
   - Rollback frequency

2. **System Health:**
   - Health check pass rate
   - Component availability
   - Dependency latency
   - Error rate

3. **Performance:**
   - Service discovery latency
   - Health check duration
   - Database query latency
   - Configuration propagation time

### Monthly Review

```bash
#!/bin/bash
echo "=== Monthly Deployment Review ==="

# Get deployment statistics from Redis
echo "Deployments this month:"
redis-cli KEYS "deployment:*" | wc -l

# Get health statistics
echo "Average health check results:"
redis-cli LRANGE health:history 0 30 | jq '.overall_status' | sort | uniq -c

# Generate optimization recommendations
echo "Check if any components consistently degraded:"
grep "degraded" /var/log/cfn-health-check.log | tail -20
```

---

## Conclusion

This four-week implementation plan transforms the deployment pipeline standards into operational systems. The key to success is:

1. **Start small** - Begin with 30-minute quick start
2. **Iterate gradually** - Deploy one component per week
3. **Validate thoroughly** - Run tests at each stage
4. **Operationalize** - Create automated procedures
5. **Monitor continuously** - Track metrics and optimize

**Expected outcomes after 4 weeks:**
- ✓ Fully automated service discovery
- ✓ Automated health monitoring
- ✓ Deployment automation with rollback
- ✓ Comprehensive observability
- ✓ Team trained on procedures
- ✓ Documentation complete

---

**Support:**
- Review DEPLOYMENT_PIPELINE_STANDARDS.md for detailed specifications
- Check runbooks for common scenarios
- Use health-check-service.sh for diagnostics
- Monitor logs and metrics regularly

**Next Steps:**
1. Begin quick start (Week 0)
2. Follow phased implementation
3. Run integration tests
4. Create team runbooks
5. Schedule training session
