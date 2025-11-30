# RuVector Operations Guide

## Overview

This guide covers operational tasks for deploying, maintaining, and troubleshooting RuVector in production and development environments.

## Table of Contents

- [Deployment](#deployment)
- [Docker Setup](#docker-setup)
- [Multi-Worktree Configuration](#multi-worktree-configuration)
- [Backup and Restore](#backup-and-restore)
- [Migration Procedures](#migration-procedures)
- [Monitoring and Debugging](#monitoring-and-debugging)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)
- [Runbooks](#runbooks)

---

## Deployment

### System Requirements

**Minimum:**
- Memory: 2GB RAM
- Storage: 10GB disk space
- CPU: 2 cores
- Network: TCP port 8000

**Recommended (Production):**
- Memory: 8GB+ RAM
- Storage: 100GB+ disk space (depends on data volume)
- CPU: 4+ cores
- Network: Low-latency connection
- HA: Redis cluster for failover

### Environment Configuration

**Development (.env):**
```bash
RUVECTOR_HOST=localhost
RUVECTOR_PORT=8000
RUVECTOR_LOG_LEVEL=debug
RUVECTOR_MAX_CONNECTIONS=10
RUVECTOR_TIMEOUT_MS=5000
RUVECTOR_MEMORY_GB=2
RUVECTOR_COLLECTION_LIMIT=100000
RUVECTOR_ENABLE_PERSISTENCE=true
RUVECTOR_ENABLE_INDEXING=true
RUVECTOR_VERBOSE=true
```

**Staging (.env.staging):**
```bash
RUVECTOR_HOST=ruvector-staging.internal
RUVECTOR_PORT=8000
RUVECTOR_LOG_LEVEL=info
RUVECTOR_MAX_CONNECTIONS=50
RUVECTOR_TIMEOUT_MS=3000
RUVECTOR_MEMORY_GB=4
RUVECTOR_COLLECTION_LIMIT=500000
RUVECTOR_ENABLE_PERSISTENCE=true
RUVECTOR_ENABLE_INDEXING=true
RUVECTOR_VERBOSE=false
RUVECTOR_API_KEY=staging-key-xyz
```

**Production (.env.production):**
```bash
RUVECTOR_HOST=ruvector-prod.internal
RUVECTOR_PORT=8000
RUVECTOR_LOG_LEVEL=warn
RUVECTOR_MAX_CONNECTIONS=100
RUVECTOR_TIMEOUT_MS=2000
RUVECTOR_MEMORY_GB=8
RUVECTOR_COLLECTION_LIMIT=1000000
RUVECTOR_ENABLE_PERSISTENCE=true
RUVECTOR_ENABLE_INDEXING=true
RUVECTOR_ENABLE_REPLICATION=true
RUVECTOR_VERBOSE=false
RUVECTOR_API_KEY=${VAULT_RUVECTOR_API_KEY}
RUVECTOR_TLS_CERT=${VAULT_RUVECTOR_TLS_CERT}
RUVECTOR_TLS_KEY=${VAULT_RUVECTOR_TLS_KEY}
```

---

## Docker Setup

### Build RuVector Image

```bash
# Build from Dockerfile
docker build -f docker/Dockerfile.ruvector \
  -t ruvector:latest \
  -t ruvector:v1.0 \
  --build-arg RUVECTOR_VERSION=1.0 \
  .

# Verify image
docker images | grep ruvector
docker run --rm ruvector:latest ruvector --version
```

### Docker Compose Configuration

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  ruvector:
    image: ruvector:latest
    container_name: ruvector-dev
    ports:
      - "${RUVECTOR_PORT:-8000}:8000"
    environment:
      LOG_LEVEL: ${RUVECTOR_LOG_LEVEL:-info}
      MAX_CONNECTIONS: ${RUVECTOR_MAX_CONNECTIONS:-50}
      MEMORY_GB: ${RUVECTOR_MEMORY_GB:-2}
      ENABLE_PERSISTENCE: ${RUVECTOR_ENABLE_PERSISTENCE:-true}
      ENABLE_INDEXING: ${RUVECTOR_ENABLE_INDEXING:-true}
    volumes:
      - ruvector-data:/var/lib/ruvector
      - ./config/ruvector.yaml:/etc/ruvector/config.yaml:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - cfn-network
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "10"

  redis:
    image: redis:7-alpine
    container_name: redis-dev
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis-data:/data
    networks:
      - cfn-network
    restart: unless-stopped

volumes:
  ruvector-data:
    driver: local
  redis-data:
    driver: local

networks:
  cfn-network:
    driver: bridge
```

### Running Services

**Start services:**
```bash
# Start all services
docker-compose up -d

# Wait for health checks
docker-compose ps

# View logs
docker-compose logs -f ruvector

# Verify RuVector is ready
curl http://localhost:8000/health
```

**Stop services:**
```bash
# Graceful shutdown
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Stop specific service
docker-compose stop ruvector
```

### Network Configuration

**For multi-worktree setups:**
```bash
# Set project name to avoid conflicts
export COMPOSE_PROJECT_NAME=cfn-${BRANCH}

# Start stack with isolated networking
docker-compose -p cfn-feature-auth up -d

# Services are accessible via:
# Inside network: ruvector:8000
# From host: localhost:8000 (or offset port)
```

---

## Multi-Worktree Configuration

### Port Offset Calculation

```bash
# Worktree: main (primary)
RUVECTOR_PORT=8000
REDIS_PORT=6379

# Worktree: feature-auth
# Base: 8000, Offset: +400 = 8400
RUVECTOR_PORT=8400
REDIS_PORT=6779

# Worktree: bugfix-validation
# Base: 8000, Offset: +800 = 8800
RUVECTOR_PORT=8800
REDIS_PORT=7179
```

### Worktree Isolation Setup

```bash
#!/bin/bash
# setup-worktree-isolation.sh

BRANCH=$(git branch --show-current)
PORT_OFFSET=$(($(git rev-parse --short HEAD | od -A n -t x1 | tr -d ' ' | cut -c1-4) % 1000))
RUVECTOR_PORT=$((8000 + PORT_OFFSET))
REDIS_PORT=$((6379 + PORT_OFFSET))

export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
export RUVECTOR_PORT
export REDIS_PORT
export CFN_REDIS_PORT=${REDIS_PORT}

# Start services with isolation
docker-compose -p "cfn-${BRANCH}" up -d

echo "Worktree: ${BRANCH}"
echo "RUVECTOR_PORT: ${RUVECTOR_PORT}"
echo "REDIS_PORT: ${REDIS_PORT}"
echo "COMPOSE_PROJECT_NAME: ${COMPOSE_PROJECT_NAME}"

# Verify connectivity
sleep 5
curl http://localhost:${RUVECTOR_PORT}/health
```

### Connection Verification

```bash
#!/bin/bash
# verify-worktree-isolation.sh

# Check all RuVector instances
echo "=== RuVector Instances ==="
docker ps | grep ruvector

# Check network connectivity
echo ""
echo "=== Network Connectivity ==="
docker network ls | grep cfn

# Check Redis instances
echo ""
echo "=== Redis Instances ==="
docker ps | grep redis

# Test RuVector health
echo ""
echo "=== RuVector Health ==="
for port in 8000 8400 8800; do
  echo -n "Port ${port}: "
  curl -s http://localhost:${port}/health | jq -r '.status' 2>/dev/null || echo "unreachable"
done
```

---

## Backup and Restore

### Backup Strategy

**Daily incremental backup:**
```bash
#!/bin/bash
# backup-ruvector-daily.sh

BACKUP_DIR="/mnt/backups/ruvector"
CONTAINER_NAME="ruvector-dev"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/backup-${BACKUP_DATE}"

mkdir -p "${BACKUP_PATH}"

# Backup data volume
docker run --rm \
  -v ruvector-dev_ruvector-data:/data:ro \
  -v "${BACKUP_PATH}":/backup \
  alpine tar czf /backup/ruvector-data.tar.gz -C /data .

# Backup configuration
docker exec "${CONTAINER_NAME}" \
  cat /etc/ruvector/config.yaml > "${BACKUP_PATH}/config.yaml"

# Create manifest
cat > "${BACKUP_PATH}/manifest.json" <<EOF
{
  "backup_date": "$(date -Iseconds)",
  "source": "${CONTAINER_NAME}",
  "data_version": "$(docker inspect ${CONTAINER_NAME} | jq -r '.[0].Config.Image')",
  "files": {
    "data": "ruvector-data.tar.gz",
    "config": "config.yaml"
  }
}
EOF

# Keep last 30 days only
find "${BACKUP_DIR}" -maxdepth 1 -type d -name "backup-*" -mtime +30 -exec rm -rf {} \;

echo "Backup completed: ${BACKUP_PATH}"
```

**Weekly full backup to S3:**
```bash
#!/bin/bash
# backup-ruvector-s3-weekly.sh

BACKUP_DIR="/tmp/ruvector-backup"
S3_BUCKET="s3://cfn-backups/ruvector"
BACKUP_DATE=$(date +%Y-%V)  # Year-week

mkdir -p "${BACKUP_DIR}"

# Export collections to JSON
docker exec ruvector-dev \
  ruvector-cli export --all --format=json > "${BACKUP_DIR}/collections-${BACKUP_DATE}.json"

# Create tarball
tar czf "${BACKUP_DIR}/ruvector-full-${BACKUP_DATE}.tar.gz" -C "${BACKUP_DIR}" .

# Upload to S3
aws s3 cp "${BACKUP_DIR}/ruvector-full-${BACKUP_DATE}.tar.gz" "${S3_BUCKET}/"

# Verify upload
aws s3 ls "${S3_BUCKET}/"

# Cleanup
rm -rf "${BACKUP_DIR}"
```

### Restore from Backup

**Restore single collection:**
```bash
#!/bin/bash
# restore-collection.sh BACKUP_PATH COLLECTION_NAME

BACKUP_PATH=$1
COLLECTION_NAME=$2
CONTAINER_NAME="ruvector-dev"

# Extract backup
TEMP_DIR=$(mktemp -d)
cd "${TEMP_DIR}"
tar xzf "${BACKUP_PATH}/ruvector-data.tar.gz"

# Restore collection
docker exec -i "${CONTAINER_NAME}" \
  ruvector-cli restore \
    --collection="${COLLECTION_NAME}" \
    --from-file=/dev/stdin < "${TEMP_DIR}/collections.json"

echo "Restored collection: ${COLLECTION_NAME}"

# Cleanup
rm -rf "${TEMP_DIR}"
```

**Full restore:**
```bash
#!/bin/bash
# restore-full.sh BACKUP_DATE

BACKUP_DATE=$1
BACKUP_DIR="/mnt/backups/ruvector"
BACKUP_PATH="${BACKUP_DIR}/backup-${BACKUP_DATE}"
CONTAINER_NAME="ruvector-dev"

if [ ! -d "${BACKUP_PATH}" ]; then
  echo "Backup not found: ${BACKUP_PATH}"
  exit 1
fi

# Stop RuVector
docker-compose stop ruvector

# Remove current data
docker volume rm ruvector-dev_ruvector-data || true

# Create new volume
docker volume create ruvector-dev_ruvector-data

# Restore data
docker run --rm \
  -v ruvector-dev_ruvector-data:/data \
  -v "${BACKUP_PATH}":/backup:ro \
  alpine tar xzf /backup/ruvector-data.tar.gz -C /data

# Restore configuration
docker cp "${BACKUP_PATH}/config.yaml" \
  ${CONTAINER_NAME}:/etc/ruvector/config.yaml

# Start RuVector
docker-compose start ruvector

# Verify restore
sleep 5
curl http://localhost:8000/health

echo "Restore completed from: ${BACKUP_PATH}"
```

### Backup Verification

```bash
#!/bin/bash
# verify-backup.sh BACKUP_PATH

BACKUP_PATH=$1

echo "=== Backup Verification ==="
echo "Path: ${BACKUP_PATH}"
echo ""

# Check manifest
if [ -f "${BACKUP_PATH}/manifest.json" ]; then
  echo "Manifest:"
  jq . "${BACKUP_PATH}/manifest.json"
else
  echo "ERROR: No manifest found"
  exit 1
fi

# Check data archive
echo ""
echo "Data archive:"
ls -lh "${BACKUP_PATH}/ruvector-data.tar.gz"
tar tzf "${BACKUP_PATH}/ruvector-data.tar.gz" | head -10
echo "..."

# Check configuration
echo ""
echo "Configuration:"
head -20 "${BACKUP_PATH}/config.yaml"

echo ""
echo "✓ Backup appears valid"
```

---

## Migration Procedures

### Schema Migration

**Add new field to collection:**
```bash
#!/bin/bash
# migrate-add-field.sh

COLLECTION=$1
FIELD_NAME=$2
DEFAULT_VALUE=$3

# Export current data
docker exec ruvector-dev \
  ruvector-cli export \
    --collection="${COLLECTION}" \
    --format=json \
    > "/tmp/${COLLECTION}-backup.json"

# Migrate: add field with default
jq ".[] |= . + {${FIELD_NAME}: ${DEFAULT_VALUE}}" \
  "/tmp/${COLLECTION}-backup.json" \
  > "/tmp/${COLLECTION}-migrated.json"

# Re-import
docker exec -i ruvector-dev \
  ruvector-cli import \
    --collection="${COLLECTION}" \
    --format=json \
    < "/tmp/${COLLECTION}-migrated.json"

echo "Migration complete: added ${FIELD_NAME} to ${COLLECTION}"
```

**Rename field:**
```bash
#!/bin/bash
# migrate-rename-field.sh

COLLECTION=$1
OLD_FIELD=$2
NEW_FIELD=$3

# Export and transform
docker exec ruvector-dev \
  ruvector-cli export \
    --collection="${COLLECTION}" \
    --format=json | \
  jq ".[] |= .${NEW_FIELD} = .${OLD_FIELD} | del(.${OLD_FIELD})" \
  > "/tmp/${COLLECTION}-migrated.json"

# Re-import
docker exec -i ruvector-dev \
  ruvector-cli import \
    --collection="${COLLECTION}" \
    --format=json \
    < "/tmp/${COLLECTION}-migrated.json"

echo "Migration complete: renamed ${OLD_FIELD} to ${NEW_FIELD}"
```

### Data Migration

**Copy collection to new RuVector instance:**
```bash
#!/bin/bash
# migrate-collection-to-new-instance.sh

SOURCE_HOST=ruvector-old.internal
DEST_HOST=ruvector-new.internal
COLLECTION=decompositions

# Export from source
curl -s "http://${SOURCE_HOST}:8000/collections/${COLLECTION}/export" \
  -H "Accept: application/json" \
  > "/tmp/${COLLECTION}.json"

# Import to destination
curl -X POST "http://${DEST_HOST}:8000/collections/${COLLECTION}/import" \
  -H "Content-Type: application/json" \
  -d @"/tmp/${COLLECTION}.json"

echo "Migrated ${COLLECTION} to ${DEST_HOST}"
```

### Blue-Green Deployment

```bash
#!/bin/bash
# deploy-blue-green.sh

CURRENT_PORT=8000
CANARY_PORT=8001

echo "=== Starting canary deployment ==="

# Start new version on canary port
docker run -d \
  --name ruvector-canary \
  -p ${CANARY_PORT}:8000 \
  ruvector:v2.0

# Wait for health
sleep 10
curl http://localhost:${CANARY_PORT}/health

# Test canary
echo "=== Running canary tests ==="
npm run test:integration -- --ruvector-host=localhost:${CANARY_PORT}

if [ $? -eq 0 ]; then
  echo "✓ Canary tests passed"

  # Switch traffic
  echo "=== Switching traffic to new version ==="
  docker stop ruvector-prod
  docker rename ruvector-prod ruvector-blue
  docker rename ruvector-canary ruvector-prod

  echo "✓ Deployment complete"
else
  echo "✗ Canary tests failed, rolling back"
  docker stop ruvector-canary
  docker rm ruvector-canary
fi
```

---

## Monitoring and Debugging

### Health Checks

**Endpoint:**
```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600000,
  "collections": {
    "decompositions": {
      "count": 1245,
      "indexHealth": "ok"
    },
    "errors": {
      "count": 5678,
      "indexHealth": "ok"
    }
  },
  "latency": {
    "p50": 12,
    "p95": 45,
    "p99": 120
  }
}
```

### Metrics Collection

**Prometheus metrics endpoint:**
```bash
curl http://localhost:8000/metrics
```

**Common metrics:**
- `ruvector_operations_total` - Total operations by type
- `ruvector_operation_duration_ms` - Operation latency
- `ruvector_collection_size_bytes` - Collection size
- `ruvector_index_rebuild_seconds` - Index rebuild time
- `ruvector_memory_usage_bytes` - Memory consumption

### Logging

**View logs:**
```bash
# Current logs
docker-compose logs -f ruvector

# Last 100 lines
docker-compose logs --tail=100 ruvector

# Logs since 10 minutes ago
docker-compose logs --since 10m ruvector

# Export logs
docker-compose logs ruvector > /tmp/ruvector.log
```

**Log levels:**
```bash
# Set log level
docker exec ruvector-dev ruvector-cli set log-level debug

# View current level
docker exec ruvector-dev ruvector-cli get log-level
```

### Debug Commands

**Inspect collection:**
```bash
# Get collection stats
docker exec ruvector-dev ruvector-cli stats --collection=decompositions

# Check index status
docker exec ruvector-dev ruvector-cli index status --collection=decompositions

# Sample documents
docker exec ruvector-dev ruvector-cli query \
  --collection=decompositions \
  --limit=5 \
  --format=json | jq '.'
```

**Connection diagnostics:**
```bash
# Test connection from app
npm run test:ruvector-connection

# Check port
netstat -an | grep 8000

# Check Docker network
docker network inspect cfn-network | jq '.Containers'
```

---

## Performance Tuning

### Memory Optimization

```yaml
# config/ruvector.yaml
cache:
  maxSize: 512MB
  evictionPolicy: "lru"
  ttl: 3600s

memory:
  maxHeap: 2GB
  gcInterval: 300s
  compactionThreshold: 0.8
```

### Index Optimization

```bash
# Rebuild indexes
docker exec ruvector-dev ruvector-cli rebuild-indexes

# Compact collections
docker exec ruvector-dev ruvector-cli compact --collection=all

# Analyze query performance
docker exec ruvector-dev ruvector-cli analyze-queries \
  --collection=performance \
  --top=20
```

### Connection Pooling

```typescript
// Optimal connection pool configuration
const config = {
  maxConnections: 50,        // Pool size
  minConnections: 10,        // Minimum open
  maxIdleTime: 300000,       // 5 minutes
  maxWaitTime: 5000,         // 5 seconds max wait
  validateOnCheckout: true,  // Health check
  validationInterval: 60000   // Revalidate every 60s
};
```

---

## Troubleshooting

### RuVector Not Starting

**Symptom:**
```
docker: Error response from daemon: error while creating mount source path
```

**Solution:**
```bash
# Create data directory
mkdir -p /mnt/ruvector-data

# Set permissions
chmod 777 /mnt/ruvector-data

# Restart
docker-compose up -d ruvector
```

### High Memory Usage

**Symptom:**
```
Container using >90% allocated memory
```

**Solutions:**
1. Reduce cache size
2. Enable garbage collection
3. Compact collections
4. Check for memory leaks

```bash
# Monitor memory
docker stats ruvector-dev --no-stream

# Trigger garbage collection
docker exec ruvector-dev ruvector-cli gc

# Compact all
docker exec ruvector-dev ruvector-cli compact --collection=all
```

### Slow Queries

**Symptom:**
```
Query taking >1000ms
```

**Investigation:**
```bash
# Check index status
docker exec ruvector-dev ruvector-cli index status --collection=errors

# Analyze query
docker exec ruvector-dev ruvector-cli explain \
  --collection=errors \
  --query='{"errorType": "TimeoutError"}'

# Profile collection
docker exec ruvector-dev ruvector-cli profile --collection=errors
```

### Connection Refused

**Symptom:**
```
RuVectorConnectionError: Connection refused on localhost:8000
```

**Solutions:**
```bash
# Verify service is running
docker ps | grep ruvector

# Check port mapping
docker port ruvector-dev

# Verify network connectivity
docker exec ruvector-dev curl http://localhost:8000/health

# Check firewall
sudo iptables -L -n | grep 8000
```

### Data Corruption

**Recovery:**
```bash
# Check integrity
docker exec ruvector-dev ruvector-cli verify --collection=all

# If corrupted, restore from backup
./backup-restore/restore-full.sh backup-20251128-100000

# Rebuild indexes
docker exec ruvector-dev ruvector-cli rebuild-indexes --collection=all
```

---

## Runbooks

### Daily Operations

**Start of day checklist:**
```bash
#!/bin/bash
# daily-operations-start.sh

echo "=== Daily Start Checklist ==="

# Check service status
echo "1. Service Status:"
docker-compose ps

# Verify health
echo ""
echo "2. Health Check:"
curl -s http://localhost:8000/health | jq '.status'

# Check disk space
echo ""
echo "3. Disk Space:"
docker exec ruvector-dev df -h /var/lib/ruvector

# Check backups
echo ""
echo "4. Recent Backups:"
ls -lt /mnt/backups/ruvector | head -3

echo ""
echo "✓ All checks passed"
```

### Incident Response

**RuVector Down:**
```bash
#!/bin/bash
# incident-ruvector-down.sh

echo "=== RuVector Recovery Procedure ==="

# 1. Verify down
echo "1. Confirming RuVector is down..."
curl -s http://localhost:8000/health || echo "✓ Confirmed down"

# 2. Check logs for errors
echo ""
echo "2. Checking error logs..."
docker-compose logs ruvector | grep -i error | tail -10

# 3. Restart
echo ""
echo "3. Restarting RuVector..."
docker-compose restart ruvector

# 4. Wait for health
echo ""
echo "4. Waiting for health..."
for i in {1..30}; do
  curl -s http://localhost:8000/health 2>/dev/null && break
  echo "  Attempt $i/30..."
  sleep 2
done

# 5. Verify recovery
echo ""
echo "5. Verifying recovery..."
curl -s http://localhost:8000/health | jq '.status'

echo ""
echo "✓ Recovery complete"
```

---

## Summary

Key operational tasks:
- [ ] Regular backups configured and tested
- [ ] Health checks monitored
- [ ] Logs collected and analyzed
- [ ] Performance tuned for workload
- [ ] Disaster recovery plan documented
- [ ] Team trained on runbooks

For detailed API information, see [RUVECTOR_API_REFERENCE.md](./RUVECTOR_API_REFERENCE.md).

