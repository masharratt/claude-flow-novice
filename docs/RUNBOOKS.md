# Operational Runbooks

Consolidated operational procedures, troubleshooting guides, and incident response from docs/runbooks/.

## System Health Check

#!/bin/bash
echo "=== System Health Check ==="

# Check services
echo -n "Redis: "
redis-cli ping > /dev/null 2>&1 && echo "OK" || echo "FAILED"

echo -n "SQLite: "
sqlite3 /data/primary.db "SELECT 1" > /dev/null 2>&1 && echo "OK" || echo "FAILED"

echo -n "Coordination Manager: "
curl -s http://localhost:8000/health > /dev/null 2>&1 && echo "OK" || echo "FAILED"

echo -n "Database Service: "
curl -s http://localhost:8001/health > /dev/null 2>&1 && echo "OK" || echo "FAILED"

# Show processes
echo -e "\n=== Active Services ==="
ps aux | grep -E "redis|coordin|database" | grep -v grep

## Common Issues and Solutions

### Database Issues

QUERY_TIMEOUT
# Check database responsiveness
time sqlite3 /data/primary.db "SELECT COUNT(*) FROM agents"

# Check table sizes
sqlite3 /data/primary.db "SELECT name, COUNT(*) FROM sqlite_master WHERE type='table'"

# Optimize if needed
sqlite3 /data/primary.db "VACUUM ANALYZE"

SCHEMA_NOT_FOUND
# List registered schemas
npm run list:schemas

# Re-register schema
await databaseService.registerSchema({
  schema_id: "your-schema-v1",
  fields: [...]
});

### Coordination Issues

REDIS_UNAVAILABLE
# Check Redis status
systemctl status redis
redis-cli ping

# Restart if needed
systemctl restart redis

# Check logs
tail -f /var/log/redis/redis.log

Agent Timeouts
# Check active agents
docker ps | grep cfn

# Monitor Redis pub/sub
redis-cli MONITOR

# Clear stale locks
redis-cli DEL "lock:task:*"

### Docker Issues

Container Failures
# Check container logs
docker logs cfn-coordinator
docker logs cfn-agent-*

# Restart services
docker-compose down
docker-compose up -d

# Clean up if needed
docker system prune -f

WSL2 Performance
# Ensure working from Linux filesystem
pwd | grep "^/mnt/c/" && echo "WARNING: On Windows mount"

# Move to Linux storage
cp -r /mnt/c/project ~/project
cd ~/project

## Deployment Procedures

### Initial Deployment

1. Environment Setup
# Clone repository
git clone <repo>
cd claude-flow-novice

# Install dependencies
npm install

# Initialize database
npm run init:database -- --name primary

2. Start Services
# Start Redis
redis-server --daemonize yes

# Start application services
npm run start:services

# Verify health
curl http://localhost:8000/health

3. Configure Agents
# Set environment
export CFN_MODE=standard
export CFN_REDIS_URL=redis://localhost:6379

# Test agent spawning
npm run test:agent-spawn

### Configuration Updates

1. Backup Current Config
cp .env .env.backup.$(date +%s)

2. Apply Changes
# Update environment variables
vim .env

# Reload configuration
npm run reload:config

3. Verify Changes
# Check services recognize new config
npm run verify:config

# Run health check
./scripts/health-check.sh

## Incident Response

### Severity Levels

- SEV-0: System down, complete outage
- SEV-1: Major feature unavailable
- SEV-2: Performance degradation
- SEV-3: Minor issues, workarounds available

### Response Steps

1. Immediate Assessment
# Run health check
./scripts/health-check.sh

# Check recent errors
tail -n 100 /var/log/cfn/error.log

# Verify service status
systemctl status cfn-coordinator cfn-database

2. Containment
# Isolate affected services
docker stop cfn-agent-affected

# Switch to maintenance mode
curl -X POST http://localhost:8000/maintenance

# Notify team
slack-alert "SEV-1: Database service degraded"

3. Resolution
# Apply fix
# [Fix-specific commands]

# Verify resolution
./scripts/smoke-test.sh

# Exit maintenance mode
curl -X DELETE http://localhost:8000/maintenance

### Specific Incidents

High Memory Usage
# Check memory usage
docker stats

# Identify largest containers
docker ps --format "table {{.Names}}\t{{.Size}}"

# Restart if needed
docker restart cfn-coordinator

Database Corruption
# Check integrity
sqlite3 /data/primary.db "PRAGMA integrity_check"

# Restore from backup if corrupted
cp /backups/primary.db.latest /data/primary.db

Agent Stuck in Loop
# Find stuck processes
ps aux | grep "cfn-agent" | grep -v grep

# Kill if necessary
kill -9 <PID>

# Clear Redis state
redis-cli DEL "task:stuck-task-id:*"

## Monitoring

### Key Metrics

- Response times (API endpoints)
- Agent success/failure rates
- Database query performance
- Memory and CPU usage
- Redis operations per second

### Alerting

# Set up alerts for:
- Response time > 5s
- Error rate > 5%
- Memory usage > 80%
- Disk space < 10%
- Agent timeout > 10min

### Log Analysis

# Monitor error patterns
tail -f /var/log/cfn/error.log | grep ERROR

# Track agent performance
grep "Agent completed" /var/log/cfn/info.log | tail -20

# Database performance
sqlite3 /data/primary.db ".timer on" "SELECT * FROM tasks LIMIT 10"

## Maintenance

### Daily Tasks

- Check system health
- Review error logs
- Monitor disk space
- Verify backups

### Weekly Tasks

- Update dependencies
- Clean up old logs
- Performance review
- Security scan

### Monthly Tasks

- Database maintenance
- Capacity planning
- Documentation updates
- Disaster recovery test