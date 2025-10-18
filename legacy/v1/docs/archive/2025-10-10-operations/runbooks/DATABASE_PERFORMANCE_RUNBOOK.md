# Database Performance Runbook

## Overview
This runbook provides step-by-step instructions for responding to database performance issues in the Claude Flow Novice infrastructure.

## Trigger Conditions
- Slow query response times (> 5 seconds)
- Database connection timeouts
- High CPU/memory usage on database instances
- Application errors related to database connectivity
- Replication lag > 60 seconds

## Initial Assessment (Minutes 0-5)

### 1. Verify Database Status
```bash
# Check RDS instance status
aws rds describe-db-instances \
  --db-instance-identifier claude-flow-novice-primary-db

# Check cluster status (if using Aurora)
aws rds describe-db-clusters \
  --db-cluster-identifier claude-flow-novice-cluster

# Check replication status
aws rds describe-db-clusters \
  --db-cluster-identifier claude-flow-novice-cluster \
  --query 'DBClusters[0].ReadReplicaIdentifiers[]'
```

### 2. Check Performance Metrics
```bash
# CPU utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average

# Memory utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average

# Database connections
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average

# Read IOPS
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReadIOPS \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average

# Write IOPS
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name WriteIOPS \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average
```

### 3. Check Application Connectivity
```bash
# Test database connection from application tier
mysql -h claude-flow-novice-primary-db.cluster-abcdefg12345.us-east-1.rds.amazonaws.com \
  -u admin -p -e "SELECT 1 as test_connection"

# Check connection pool status
# (Application-specific monitoring)
```

## Investigation (Minutes 5-15)

### 1. Analyze Slow Queries
```sql
-- Connect to database
mysql -h CLUSTER_ENDPOINT -u admin -p

-- Enable slow query log if not already enabled
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- Show currently running queries
SHOW FULL PROCESSLIST;

-- Check for long-running queries
SELECT * FROM information_schema.processlist
WHERE time > 60 AND command != 'Sleep';

-- Analyze slow query log
SHOW VARIABLES LIKE 'slow_query_log_file';
```

### 2. Check Locking Issues
```sql
-- Check for locked tables
SHOW OPEN TABLES WHERE In_use > 0;

-- Check for metadata locks
SELECT * FROM performance_schema.metadata_locks
WHERE LOCK_STATUS = 'PENDING';

-- Check for InnoDB locks
SELECT * FROM sys.innodb_lock_waits;
```

### 3. Review Resource Utilization
```sql
-- Check table sizes
SELECT
  table_schema,
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS "Size (MB)"
FROM information_schema.tables
ORDER BY (data_length + index_length) DESC;

-- Check index usage
SELECT
  table_schema,
  table_name,
  index_name,
  cardinality
FROM information_schema.statistics
WHERE table_schema NOT IN ('mysql', 'performance_schema', 'information_schema');

-- Check for missing indexes
SELECT * FROM sys.schema_unused_indexes;
```

### 4. Check Replication Lag (if applicable)
```sql
-- For MySQL read replicas
SHOW SLAVE STATUS\G

-- For Aurora clusters
SELECT * FROM mysql.replica_host_status;

-- Check CloudWatch replication lag metric
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-dr-read-replica \
  --start-time $(date -u -v-15M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average
```

## Mitigation Strategies (Minutes 15-30)

### Strategy 1: Kill Long-Running Queries
```sql
-- Identify problematic queries
SELECT
  id,
  user,
  host,
  db,
  command,
  time,
  state,
  info
FROM information_schema.processlist
WHERE time > 300 AND command != 'Sleep';

-- Kill specific queries
KILL [QUERY_ID];
```

### Strategy 2: Scale Up Database Instance
```bash
# Modify instance class
aws rds modify-db-instance \
  --db-instance-identifier claude-flow-novice-primary-db \
  --db-instance-class db.r5.large \
  --apply-immediately

# For Aurora clusters
aws rds modify-db-cluster \
  --db-cluster-identifier claude-flow-novice-cluster \
  --scaling-configuration MinCapacity=4,MaxCapacity=64 \
  --apply-immediately
```

### Strategy 3: Optimize Configuration
```sql
-- Check current configuration
SHOW VARIABLES;

-- Key parameters to adjust:
SET GLOBAL innodb_buffer_pool_size = [appropriate_size];
SET GLOBAL max_connections = [appropriate_limit];
SET GLOBAL query_cache_size = [appropriate_size];
SET GLOBAL tmp_table_size = [appropriate_size];

-- For permanent changes, modify parameter group
aws rds modify-db-parameter-group \
  --db-parameter-group-name claude-flow-novice-params \
  --parameters "ParameterName=innodb_buffer_pool_size,ParameterValue=[size],ApplyMethod=immediate"
```

### Strategy 4: Create Additional Indexes
```sql
-- Analyze query execution plan
EXPLAIN SELECT * FROM table WHERE condition;

-- Create missing indexes
CREATE INDEX idx_table_column ON table(column);

-- Monitor index creation progress
SHOW PROCESSLIST;
```

### Strategy 5: Failover to Read Replica
```bash
# Check read replica status
aws rds describe-db-instances \
  --db-instance-identifier claude-flow-novice-dr-read-replica

# Promote read replica to primary
aws rds promote-read-replica \
  --db-instance-identifier claude-flow-novice-dr-read-replica \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00"

# Update application configuration to point to new primary
# (This would be done via application deployment or configuration update)
```

## Escalation Procedures

### When to Escalate
- Database unavailable for > 10 minutes
- Data corruption suspected
- Replication failure
- Performance issues persist after initial mitigation

### Escalation Steps
1. Notify database administrator
2. Engage AWS support (if needed)
3. Consider emergency failover
4. Management notification

## Recovery and Verification

### Service Recovery Checks
```sql
-- Verify database connectivity
SELECT 1 as connectivity_test;

-- Check performance with simple queries
SELECT COUNT(*) FROM large_table;

-- Verify application can connect
# Test from application tier
```

### Performance Validation
```bash
# Monitor key metrics for 30 minutes after recovery
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=claude-flow-novice-primary-db \
  --start-time $(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average
```

## Prevention Measures

### Short-term Prevention
- [ ] Add monitoring for slow queries
- [ ] Implement connection pooling limits
- [ ] Review and optimize frequent queries
- [ ] Add appropriate indexes

### Long-term Prevention
- [ ] Implement read replica for reporting
- [ ] Consider database partitioning
- [ ] Implement caching layer
- [ ] Regular performance tuning

## Communication Templates

### Database Performance Alert
```
🚨 DATABASE PERFORMANCE ISSUE

Database: claude-flow-novice-primary-db
Impact: Slow application response times
Current Status: [Investigating/Mitigating/Monitored]
Duration: XX minutes
Next Update: [Time]
```

### Resolution Notification
```
✅ DATABASE PERFORMANCE RESTORED

Issue: Database performance degradation
Duration: XX minutes
Root Cause: [Brief description]
Resolution: [What was done]
Impact: [Duration and affected services]
```

## Contacts and Escalation

### Database Team
- DBA On-Call: [Phone/Slack]
- Database Team Lead: [Slack channel]

### AWS Support
- AWS Support: [Contact information]
- Technical Account Manager: [Email/Phone]

### Application Team
- Application On-Call: [Phone/Slack]
- Development Team: [Slack channel]

---

**Runbook Version**: 1.0
**Last Updated**: [Date]
**Next Review**: [Date]
**Approved By**: [Name/Title]