# Deployment Runbook

## Overview
This runbook covers initial deployment of the CFN Loop system to a production environment, including prerequisites, deployment steps, verification, and rollback procedures.

**Expected Duration:** 30-45 minutes
**Difficulty:** Intermediate
**Requires:** Docker, Kubernetes (or Docker Compose), Git access, Database credentials

## Prerequisites

### System Requirements
- Docker: v24.0+
- Docker Compose: v2.20+
- Kubernetes: v1.27+ (if using K8s deployment)
- Disk Space: 50GB available
- Memory: 16GB minimum
- CPU: 8 cores minimum

### Access Requirements
- Git repository access (SSH key configured)
- Docker registry credentials
- Database credentials (PostgreSQL superuser)
- Redis authentication token
- Secrets management (Vault/AWS Secrets Manager)
- DNS update permissions
- SSL certificate provisioning access

### Pre-Deployment Checklist
```bash
# Verify Docker daemon is running
docker ps

# Test Docker Compose
docker-compose version

# Check disk space (require >50GB)
df -h / | awk 'NR==2 {if ($4 < 50) exit 1}'

# Verify connectivity to Docker registry
docker pull redis:7-alpine

# Verify database connectivity
psql -h $DB_HOST -U $DB_USER -d postgres -c "SELECT version();"

# Verify Redis connectivity
redis-cli -h $REDIS_HOST -p 6379 ping

# Generate SSL certificates
./scripts/security/generate-certificates.sh --cn production.example.com

# Load secrets into environment
source .env.production
```

## Detection / Pre-Deployment Validation

### Configuration Validation
```bash
# Validate environment variables
required_vars=(
  "POSTGRES_PASSWORD"
  "REDIS_PASSWORD"
  "JWT_SECRET"
  "CFN_AGENT_IMAGE"
  "CFN_ORCHESTRATOR_IMAGE"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: Missing required variable: $var"
    exit 1
  fi
done

# Validate Docker Compose files
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml config > /dev/null

# Validate Kubernetes manifests (if applicable)
kubectl apply --dry-run=client -k ./k8s/overlays/production/

# Check for conflicting ports
for port in 5432 6379 3000 3001 9090 9093; do
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "ERROR: Port $port already in use"
    exit 1
  fi
done
```

## Response Steps

### Phase 1: Infrastructure Setup (10 minutes)

1. **Create volumes and networks**
   ```bash
   # Create persistent volumes
   docker volume create postgres-data
   docker volume create redis-data
   docker volume create prometheus-data
   docker volume create grafana-data
   docker volume create loki-data

   # Create networks
   docker network create cfn-network
   docker network create monitoring
   ```

2. **Initialize PostgreSQL database**
   ```bash
   # Start PostgreSQL container
   docker-compose up -d postgres

   # Wait for PostgreSQL to be healthy
   until docker-compose exec postgres pg_isready -U postgres; do
     echo "Waiting for PostgreSQL..."
     sleep 5
   done

   # Initialize database schema
   docker-compose exec postgres psql -U postgres -f /docker-entrypoint-initdb.d/schema.sql

   # Create application user and database
   docker-compose exec postgres psql -U postgres -c "
     CREATE USER cfn_user WITH PASSWORD '$POSTGRES_PASSWORD';
     CREATE DATABASE cfn OWNER cfn_user;
     GRANT ALL PRIVILEGES ON DATABASE cfn TO cfn_user;
   "

   # Run migrations
   docker-compose exec postgres psql -U cfn_user -d cfn -f /migrations/001_initial_schema.sql
   ```

3. **Initialize Redis**
   ```bash
   # Start Redis container
   docker-compose up -d redis

   # Wait for Redis to be healthy
   until docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" ping | grep -q PONG; do
     echo "Waiting for Redis..."
     sleep 5
   done

   # Verify Redis configuration
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET maxmemory
   ```

### Phase 2: Core Services Deployment (15 minutes)

4. **Deploy monitoring stack**
   ```bash
   # Start monitoring services
   docker-compose -f docker-compose.monitoring.yml up -d

   # Wait for all services to be healthy
   services=("prometheus" "alertmanager" "grafana" "loki" "promtail")
   for service in "${services[@]}"; do
     until docker-compose -f docker-compose.monitoring.yml exec $service wget --tries=1 --spider http://localhost:9090/-/healthy 2>/dev/null; do
       echo "Waiting for $service..."
       sleep 5
     done
   done
   ```

5. **Deploy orchestrator and coordinator**
   ```bash
   # Build or pull orchestrator image
   docker pull cfn-orchestrator:latest || docker build -t cfn-orchestrator:latest ./docker/orchestrator/

   # Start orchestrator
   docker-compose up -d cfn-orchestrator

   # Verify orchestrator health
   docker-compose exec cfn-orchestrator curl -f http://localhost:3001/health || exit 1

   # Build or pull coordinator image
   docker pull cfn-coordinator:latest || docker build -t cfn-coordinator:latest ./docker/coordinator/
   ```

6. **Deploy agent pool**
   ```bash
   # Build agent image
   docker build -t cfn-agent:latest ./docker/agent/

   # Deploy initial agent pool (3 agents for production)
   for i in {1..3}; do
     docker run -d \
       --name cfn-agent-$i \
       --network cfn-network \
       -e REDIS_HOST=redis \
       -e REDIS_PORT=6379 \
       -e REDIS_PASSWORD="$REDIS_PASSWORD" \
       -e POSTGRES_HOST=postgres \
       -e POSTGRES_USER=cfn_user \
       -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
       cfn-agent:latest
   done

   # Verify agents registered in Redis
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l
   ```

### Phase 3: Configuration and Verification (10 minutes)

7. **Configure monitoring and alerting**
   ```bash
   # Reload Prometheus configuration
   docker-compose -f docker-compose.monitoring.yml exec prometheus curl -X POST http://localhost:9090/-/reload

   # Verify alert rules loaded
   docker-compose -f docker-compose.monitoring.yml exec prometheus curl -s http://localhost:9090/api/v1/rules | grep -c cfn_

   # Configure Grafana data sources
   curl -X POST http://admin:admin@localhost:3000/api/datasources \
     -H "Content-Type: application/json" \
     -d @monitoring/grafana/datasources.json
   ```

8. **Perform smoke tests**
   ```bash
   # Test Redis connectivity
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING

   # Test PostgreSQL connectivity
   docker-compose exec postgres psql -U cfn_user -d cfn -c "SELECT 1;"

   # Test agent registration
   docker-compose exec cfn-agent-1 curl -f http://cfn-orchestrator:3001/agents

   # Test metrics collection
   curl -s http://localhost:9090/api/v1/query?query=up | grep -q '\"value\"'
   ```

## Validation

### Health Check Script
```bash
#!/bin/bash
# scripts/validate-deployment.sh

set -euo pipefail

echo "=== Deployment Validation ==="

# Check all containers running
echo "Checking containers..."
RUNNING=$(docker-compose ps --services --filter "status=running" | wc -l)
EXPECTED=$(docker-compose config --services | wc -l)
if [ "$RUNNING" -eq "$EXPECTED" ]; then
  echo "✓ All $RUNNING containers running"
else
  echo "✗ Only $RUNNING/$EXPECTED containers running"
  exit 1
fi

# Check database
echo "Checking database..."
TABLES=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'
")
if [ "$TABLES" -gt 0 ]; then
  echo "✓ Database initialized with $TABLES tables"
else
  echo "✗ Database not initialized"
  exit 1
fi

# Check Redis
echo "Checking Redis..."
if docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING | grep -q PONG; then
  echo "✓ Redis healthy"
else
  echo "✗ Redis not responding"
  exit 1
fi

# Check monitoring
echo "Checking monitoring stack..."
TARGETS=$(curl -s http://localhost:9090/api/v1/targets | grep -c '"health":"up"')
if [ "$TARGETS" -gt 5 ]; then
  echo "✓ Prometheus scraping $TARGETS targets"
else
  echo "✗ Prometheus only has $TARGETS healthy targets"
  exit 1
fi

# Check agents registered
echo "Checking agent registration..."
AGENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
if [ "$AGENTS" -ge 3 ]; then
  echo "✓ $AGENTS agents registered"
else
  echo "✗ Only $AGENTS agents registered (expected 3+)"
  exit 1
fi

echo ""
echo "=== Deployment Validation Complete ==="
```

### Expected Outputs
```
✓ All 15 containers running
✓ Database initialized with 28 tables
✓ Redis healthy
✓ Prometheus scraping 12 targets
✓ 3 agents registered
```

## Rollback

### Immediate Rollback (< 5 minutes)

If deployment fails during any phase, perform immediate rollback:

```bash
# Stop all containers
docker-compose down

# Remove volumes (CAREFUL - loses data)
docker volume rm postgres-data redis-data

# Revert to previous version
git checkout previous-tag
docker-compose up -d
```

### Gradual Rollback (with data preservation)

If issues discovered after deployment:

```bash
# 1. Stop new deployment
docker-compose down

# 2. Backup current data
docker run --rm \
  -v postgres-data:/data \
  -v ./backups:/backup \
  postgres:15 \
  pg_dump -U cfn_user -d cfn > /backup/cfn-rollback-$(date +%s).sql

# 3. Restore from previous backup
docker-compose up -d postgres
docker-compose exec postgres psql -U cfn_user -d cfn < ./backups/cfn-before-deployment.sql

# 4. Restart services with previous version
git checkout previous-tag
docker-compose up -d
```

### Data Recovery

If database corruption occurs:

```bash
# Check database integrity
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT schemaname, tablename FROM pg_catalog.pg_tables
  WHERE schemaname != 'pg_catalog'
  AND schemaname != 'information_schema'
"

# Restore from backup (if available)
BACKUP_FILE="./backups/cfn-before-deployment.sql"
if [ -f "$BACKUP_FILE" ]; then
  docker-compose exec postgres psql -U cfn_user -d cfn < "$BACKUP_FILE"
  echo "Database restored from backup"
else
  echo "ERROR: No backup available"
  exit 1
fi
```

## Escalation

### Escalation Paths

**If deployment validation fails:**
1. Check error logs: `docker-compose logs -f`
2. Verify all prerequisites met
3. Contact Platform Engineering team

**If database initialization fails:**
1. Check PostgreSQL logs: `docker-compose logs postgres`
2. Verify database credentials
3. Check disk space: `df -h /`
4. Contact Database Administrator

**If monitoring stack won't start:**
1. Check Prometheus logs: `docker-compose -f docker-compose.monitoring.yml logs prometheus`
2. Verify Prometheus configuration is valid
3. Contact SRE team

**If agents can't register:**
1. Verify Redis is running and healthy
2. Check agent logs: `docker-compose logs cfn-agent-1`
3. Verify network connectivity: `docker network inspect cfn-network`
4. Contact Infrastructure team

### Support Contacts
- **Platform Engineering:** platform-engineering@example.com / Slack #platform
- **Database Administration:** dba-team@example.com / Slack #dba
- **Site Reliability Engineering:** sre-team@example.com / Slack #sre-oncall
- **On-Call:** Check PagerDuty escalation schedule

### Post-Deployment

After successful deployment:

1. **Document deployment details**
   ```bash
   cat > deployment-log.txt <<EOF
   Date: $(date -u)
   Version: $(git describe --tags)
   Deployed by: $(whoami)
   Environment: production

   Deployment checklist:
   - [ ] All containers running
   - [ ] Database initialized
   - [ ] Redis initialized
   - [ ] Monitoring stack active
   - [ ] Agents registered
   - [ ] Health checks passing
   - [ ] Smoke tests passing
   EOF
   ```

2. **Update deployment status**
   - Update runbook status in team wiki
   - Post deployment notification to #deployments
   - Update status page

3. **Schedule post-deployment review**
   - Monitor metrics for 1 hour
   - Review logs for errors
   - Schedule team review meeting
