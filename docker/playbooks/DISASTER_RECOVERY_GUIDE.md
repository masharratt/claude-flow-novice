# CFN Docker Infrastructure Disaster Recovery Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**RTO (Recovery Time Objective):** 2 hours
**RPO (Recovery Point Objective):** 24 hours

---

## Table of Contents

1. [Disaster Scenarios](#disaster-scenarios)
2. [Recovery Procedures](#recovery-procedures)
3. [Backup Verification](#backup-verification)
4. [Failover Procedures](#failover-procedures)

---

## Disaster Scenarios

### Scenario 1: Complete Host Failure

**Impact:** All containers lost, host unreachable

**Recovery Strategy:** Build new host, restore from backups

**Steps:**

1. **Provision new host** (AWS/Azure/GCP or on-premise)
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com | sh

   # Install required tools
   apt-get update
   apt-get install -y yq postgresql-client redis-tools
   ```

2. **Restore Docker infrastructure files**
   ```bash
   # Pull from Git
   git clone https://github.com/company/claude-flow-novice.git
   cd claude-flow-novice

   # Or restore from backup
   aws s3 cp s3://cfn-backups/latest/docker-infrastructure.tar.gz /tmp/
   tar -xzf /tmp/docker-infrastructure.tar.gz
   ```

3. **Create Docker networks**
   ```bash
   ./docker/scripts/create-networks.sh
   ```

4. **Deploy shared infrastructure**
   ```bash
   # PostgreSQL
   docker run -d \
     --name cfn-postgres \
     --network cfn-coordination \
     --ip 172.18.0.5 \
     -e POSTGRES_USER=cfn_user \
     -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
     -e POSTGRES_DB=cfn_corporate \
     -v cfn-postgres-data:/var/lib/postgresql/data \
     postgres:15-alpine

   # Redis
   docker run -d \
     --name cfn-redis \
     --network cfn-coordination \
     --ip 172.18.0.10 \
     redis:7-alpine
   ```

5. **Restore PostgreSQL data**
   ```bash
   # Get latest backup from S3
   LATEST_BACKUP=$(aws s3 ls s3://cfn-backups/postgresql/ --recursive | sort | tail -1 | awk '{print $4}')
   aws s3 cp s3://cfn-backups/$LATEST_BACKUP /tmp/postgres-backup.sql.gz

   # Restore
   gunzip -c /tmp/postgres-backup.sql.gz | \
     docker exec -i cfn-postgres psql -U postgres
   ```

6. **Build and deploy coordinators**
   ```bash
   # Build images
   docker build -f docker/Dockerfile.main-coordinator -t cfn-docker-main-coordinator:latest .
   docker build -f docker/Dockerfile.team-coordinator -t cfn-docker-team-coordinator:latest .

   # Start main coordinator
   docker run -d \
     --name cfn-docker-main-coordinator \
     --network cfn-coordination \
     --ip 172.18.0.10 \
     -e REDIS_HOST=cfn-redis \
     -e POSTGRES_HOST=cfn-postgres \
     -e POSTGRES_USER=cfn_user \
     -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
     cfn-docker-main-coordinator:latest
   ```

7. **Restore team workspaces**
   ```bash
   # For each team
   for team in seo marketing frontend backend devops qa csuite; do
     echo "Restoring workspace: $team"

     # Get latest workspace backup
     LATEST=$(aws s3 ls s3://cfn-backups/workspaces/ --recursive | grep $team | sort | tail -1 | awk '{print $4}')
     aws s3 cp s3://cfn-backups/$LATEST /tmp/workspace-$team.tar.gz

     # Extract
     mkdir -p /workspace/$team
     tar -xzf /tmp/workspace-$team.tar.gz -C /workspace/
     chown -R 1000:1000 /workspace/$team
   done
   ```

8. **Provision all teams**
   ```bash
   for team in seo marketing frontend backend devops qa csuite; do
     ./docker/scripts/provision-team.sh \
       --config docker/config/teams/$team.yaml \
       --spawn-coordinator
   done
   ```

**RTO:** 2 hours (assuming backups available)

### Scenario 2: PostgreSQL Data Corruption

**Impact:** Database data corrupted, queries failing

**Recovery Strategy:** Restore from most recent backup

**Steps:**

1. **Stop all coordinators** (prevent further corruption)
   ```bash
   docker stop $(docker ps -q --filter "name=cfn-docker")
   ```

2. **Backup current state** (for forensics)
   ```bash
   docker exec cfn-postgres pg_dumpall -U postgres > /tmp/corrupted-db-$(date +%Y%m%d-%H%M%S).sql
   ```

3. **Drop corrupted database**
   ```bash
   docker exec cfn-postgres psql -U postgres -c "DROP DATABASE cfn_corporate;"
   docker exec cfn-postgres psql -U postgres -c "CREATE DATABASE cfn_corporate;"
   ```

4. **Restore from backup**
   ```bash
   # Get latest clean backup
   LATEST_BACKUP=$(ls -t /backups/postgresql/*/cfn-postgres-*.sql.gz | head -1)

   # Restore
   gunzip -c $LATEST_BACKUP | docker exec -i cfn-postgres psql -U postgres
   ```

5. **Verify data integrity**
   ```bash
   docker exec cfn-postgres psql -U cfn_user -d cfn_corporate -c "\dt"
   docker exec cfn-postgres psql -U cfn_user -d cfn_corporate -c "SELECT COUNT(*) FROM agents;"
   ```

6. **Restart coordinators**
   ```bash
   docker start cfn-docker-main-coordinator

   for team in seo marketing frontend backend devops qa csuite; do
     docker start cfn-docker-team-coordinator-$team
   done
   ```

**RPO:** Last backup (24 hours max)

### Scenario 3: Team Workspace Data Loss

**Impact:** Single team loses workspace data

**Recovery Strategy:** Restore team workspace from backup

**Steps:**

1. **Stop team coordinator**
   ```bash
   TEAM="seo"  # Replace with affected team
   docker stop cfn-docker-team-coordinator-$TEAM
   ```

2. **Remove corrupted workspace**
   ```bash
   mv /workspace/$TEAM /workspace/$TEAM.corrupted-$(date +%Y%m%d)
   mkdir /workspace/$TEAM
   ```

3. **Restore from backup**
   ```bash
   # Get latest backup
   LATEST=$(ls -t /backups/workspaces/*/workspace-$TEAM-*.tar.gz | head -1)

   # Extract
   tar -xzf $LATEST -C /workspace/
   chown -R 1000:1000 /workspace/$TEAM
   ```

4. **Restart team coordinator**
   ```bash
   docker start cfn-docker-team-coordinator-$TEAM
   ```

5. **Verify recovery**
   ```bash
   ls -la /workspace/$TEAM/
   docker logs cfn-docker-team-coordinator-$TEAM --tail 20
   ```

**RPO:** Last backup (24 hours max)

---

## Backup Verification

### Monthly Backup Restore Test

**Frequency:** First Sunday of each month

**Procedure:**

1. **Select random team**
   ```bash
   TEAMS=(seo marketing frontend backend devops qa csuite)
   TEST_TEAM=${TEAMS[$RANDOM % ${#TEAMS[@]}]}
   echo "Testing backup for team: $TEST_TEAM"
   ```

2. **Create test environment**
   ```bash
   # Create test workspace
   mkdir -p /tmp/backup-test-$TEST_TEAM
   ```

3. **Restore backup to test location**
   ```bash
   LATEST_BACKUP=$(ls -t /backups/workspaces/*/workspace-$TEST_TEAM-*.tar.gz | head -1)
   tar -xzf $LATEST_BACKUP -C /tmp/backup-test-$TEST_TEAM/
   ```

4. **Verify restoration**
   ```bash
   # Check files exist
   ls -la /tmp/backup-test-$TEST_TEAM/workspace/$TEST_TEAM/

   # Check skills directory
   ls -la /tmp/backup-test-$TEST_TEAM/workspace/$TEST_TEAM/skills/

   # Verify against team config
   EXPECTED_SKILLS=$(yq -r '.team.allowed_skills[]' docker/config/teams/$TEST_TEAM.yaml)
   ACTUAL_SKILLS=$(ls /tmp/backup-test-$TEST_TEAM/workspace/$TEST_TEAM/skills/)

   echo "Expected skills: $EXPECTED_SKILLS"
   echo "Actual skills: $ACTUAL_SKILLS"
   ```

5. **Document results**
   ```bash
   cat > /var/log/cfn/backup-test-$(date +%Y%m).log <<EOF
   Backup Restore Test - $(date)
   Team: $TEST_TEAM
   Backup File: $LATEST_BACKUP
   Result: [PASS/FAIL]
   Notes: [Any issues]
   EOF
   ```

6. **Cleanup**
   ```bash
   rm -rf /tmp/backup-test-$TEST_TEAM
   ```

---

## Failover Procedures

### PostgreSQL Failover (if using replication)

1. **Promote standby to primary**
   ```bash
   docker exec cfn-postgres-standby pg_ctl promote
   ```

2. **Update coordinator connection strings**
   ```bash
   # Update all coordinators to point to new primary
   docker stop cfn-docker-main-coordinator

   docker run -d \
     --name cfn-docker-main-coordinator \
     --network cfn-coordination \
     -e POSTGRES_HOST=cfn-postgres-standby \
     ... [other options]
     cfn-docker-main-coordinator:latest
   ```

3. **Verify connectivity**
   ```bash
   docker exec cfn-docker-main-coordinator \
     psql -h cfn-postgres-standby -U cfn_user -d cfn_corporate -c "SELECT 1;"
   ```

### Redis Failover (if using Sentinel)

1. **Sentinel promotes replica automatically**

2. **Verify new master**
   ```bash
   docker exec cfn-redis-sentinel redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster
   ```

3. **No coordinator changes needed** (Sentinel handles redirects)

---

## Recovery Time Estimates

| Scenario | RTO | RPO | Manual Steps | Automation Level |
|----------|-----|-----|--------------|------------------|
| Complete host failure | 2 hours | 24 hours | Moderate | Medium (50%) |
| PostgreSQL corruption | 30 minutes | 24 hours | Low | High (80%) |
| Single team workspace | 15 minutes | 24 hours | Low | High (90%) |
| Redis data loss | 10 minutes | 7 days (persistent) | Low | High (90%) |
| Network failure | 5 minutes | N/A | Low | Manual |

---

## Recovery Checklist

**Pre-Recovery:**
- [ ] Identify disaster scenario
- [ ] Notify stakeholders (SEV-1 incident)
- [ ] Collect diagnostic information
- [ ] Verify backup availability

**During Recovery:**
- [ ] Follow scenario-specific procedures
- [ ] Document all actions taken
- [ ] Update stakeholders every 15 minutes
- [ ] Verify each step before proceeding

**Post-Recovery:**
- [ ] Verify all services operational
- [ ] Run health checks
- [ ] Monitor for 24 hours
- [ ] Conduct post-incident review
- [ ] Update disaster recovery procedures

---

## Emergency Contacts

**Primary On-Call:** [Phone/PagerDuty]
**Backup On-Call:** [Phone/PagerDuty]
**Database Administrator:** [Phone/Email]
**Infrastructure Lead:** [Phone/Email]

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-15 | Initial disaster recovery guide |

---

## Related Documents

- [Operational Runbook](OPERATIONAL_RUNBOOK.md) - Backup procedures
- [Incident Response Guide](INCIDENT_RESPONSE_GUIDE.md) - Escalation procedures
- [Troubleshooting Playbook](TROUBLESHOOTING_PLAYBOOK.md) - Common issues
