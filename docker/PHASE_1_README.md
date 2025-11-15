# Phase 1: Docker Infrastructure Foundation

**Status:** Infrastructure Ready
**Date:** 2025-11-15
**Completion:** Foundation complete, ready for deployment testing

---

## What Was Built

### 1. Coordinator Docker Images

#### Main Coordinator (`cfn-docker-main-coordinator`)
- **Purpose:** Cross-team resource allocation and escalation handling
- **Base Image:** `node:20-slim`
- **Key Features:**
  - Team coordinator spawning and monitoring
  - Escalation handling from team coordinators
  - System-wide health monitoring
  - Docker socket access for container management

**Files:**
- `docker/Dockerfile.main-coordinator`
- `docker/coordinator/main/entrypoint.sh`
- `docker/coordinator/main/coordinator.js`
- `docker/coordinator/main/escalation-handler.js`
- `docker/coordinator/main/package.json`

#### Team Coordinator (`cfn-docker-team-coordinator`)
- **Purpose:** Team-specific agent lifecycle and resource tracking
- **Base Image:** `node:20-slim`
- **Key Features:**
  - Agent spawning and monitoring
  - Team resource tracking (memory, CPU, disk)
  - Heartbeat to main coordinator
  - Escalation on resource exhaustion

**Files:**
- `docker/Dockerfile.team-coordinator`
- `docker/coordinator/team/entrypoint.sh`
- `docker/coordinator/team/coordinator.js`
- `docker/coordinator/team/agent-manager.js`
- `docker/coordinator/team/resource-tracker.js`
- `docker/coordinator/team/package.json`

---

### 2. Skill Variants (Isolation Model)

#### Database Read-Only Skill
- **Purpose:** SELECT-only database access
- **Teams:** SEO, Marketing, Frontend, QA, C-Suite
- **Security:** Uses `readonly_user` with SELECT-only permissions

**Files:**
- `docker/skills/database-readonly/README.md`
- `docker/skills/database-readonly/query.sh`

#### Database Read-Write Skill
- **Purpose:** Full CRUD database access
- **Teams:** Backend, DevOps
- **Security:** Uses `admin_user`, all operations audit logged

**Files:**
- `docker/skills/database-readwrite/README.md`
- `docker/skills/database-readwrite/query.sh`
- `docker/skills/database-readwrite/migrate.sh`

---

## Build Instructions

### Build Coordinator Images

```bash
# Build main coordinator
docker build -f docker/Dockerfile.main-coordinator \
  -t cfn-docker-main-coordinator:latest \
  -t cfn-docker-main-coordinator:3.0.0 \
  .

# Build team coordinator
docker build -f docker/Dockerfile.team-coordinator \
  -t cfn-docker-team-coordinator:latest \
  -t cfn-docker-team-coordinator:3.0.0 \
  .
```

**Note:** On WSL2, use the Linux build script for 96% faster builds:
```bash
DOCKERFILE="docker/Dockerfile.main-coordinator" \
IMAGE_NAME="cfn-docker-main-coordinator" \
./scripts/docker/build-from-linux.sh

DOCKERFILE="docker/Dockerfile.team-coordinator" \
IMAGE_NAME="cfn-docker-team-coordinator" \
./scripts/docker/build-from-linux.sh
```

---

## Testing (Without Full Infrastructure)

### Test Image Contracts

```bash
# Test main coordinator health check
docker run --rm cfn-docker-main-coordinator:latest --health-check

# Test team coordinator health check (requires env vars)
docker run --rm \
  -e TEAM_ID=test \
  -e BUDGET_ALLOCATED=12g \
  -e MAX_AGENTS=5 \
  cfn-docker-team-coordinator:latest --health-check

# Show version information
docker run --rm cfn-docker-main-coordinator:latest --version
docker run --rm cfn-docker-team-coordinator:latest --version
```

### Test Skill Scripts

```bash
# Test database-readonly query validation
docker/skills/database-readonly/query.sh "SELECT 1"  # Should work
docker/skills/database-readonly/query.sh "UPDATE users SET x=1"  # Should block

# Test database-readwrite (requires DB connection)
docker/skills/database-readwrite/query.sh "SELECT NOW()"
```

---

## Deployment Prerequisites

Before deploying coordinators, ensure infrastructure is ready:

### 1. Networks Created
```bash
./docker/scripts/create-networks.sh
```

### 2. Shared Infrastructure Running
- **Shared Redis:** `cfn-redis-shared` on `cfn-coordination` network
- **PostgreSQL:** `cfn-postgres` on `cfn-coordination` network

### 3. Database Schema Created
```sql
-- Run against cfn_corporate database
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    deprovisioned_at TIMESTAMP,
    config JSONB,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS operational_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    team_id VARCHAR(50),
    agent_id VARCHAR(100),
    log_level VARCHAR(20),
    event_type VARCHAR(50),
    message TEXT,
    context JSONB
);

CREATE INDEX idx_logs_timestamp ON operational_logs(timestamp DESC);
CREATE INDEX idx_logs_team_agent ON operational_logs(team_id, agent_id);
```

---

## Deployment

### 1. Deploy Main Coordinator

```bash
docker run -d \
  --name cfn-docker-main-coordinator \
  --network cfn-coordination \
  --ip 172.18.0.10 \
  --memory 4g \
  --cpus 2.0 \
  --restart unless-stopped \
  --label cfn.component=main-coordinator \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e REDIS_HOST=cfn-redis-shared \
  -e POSTGRES_HOST=cfn-postgres \
  -e POSTGRES_DB=cfn_corporate \
  -e POSTGRES_USER=cfn_admin \
  -e POSTGRES_PASSWORD=your_password_here \
  -e LOG_LEVEL=info \
  cfn-docker-main-coordinator:latest

# Verify
docker logs cfn-docker-main-coordinator
```

### 2. Deploy Team Coordinators

Use the provisioning script:

```bash
# Provision SEO team (includes coordinator)
./docker/scripts/provision-team.sh \
  --config docker/config/teams/seo.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator

# Verify
docker logs cfn-docker-team-coordinator-seo
```

---

## Monitoring

### Check Coordinator Health

```bash
# Main coordinator health
docker exec cfn-docker-main-coordinator /app/entrypoint.sh --health-check

# Team coordinator health
docker exec cfn-docker-team-coordinator-seo /app/entrypoint.sh --health-check
```

### Monitor Logs

```bash
# Main coordinator logs
docker logs -f cfn-docker-main-coordinator

# Team coordinator logs
docker logs -f cfn-docker-team-coordinator-seo

# Filter for errors
docker logs cfn-docker-main-coordinator 2>&1 | grep ERROR
```

### Check Redis Coordination

```bash
# Main coordinator heartbeat
docker exec cfn-redis-shared redis-cli GET "main:health"

# Team coordinator heartbeat
docker exec cfn-redis-seo redis-cli GET "team:seo:coordinator:heartbeat"
```

---

## Next Steps (Phase 2)

### Implement Full Agent Management

1. **Agent Spawning:**
   - Implement `agent-manager.js` spawnAgent function
   - Select runtime image based on agent type
   - Configure team-specific mounts and environment

2. **Resource Tracking:**
   - Implement `resource-tracker.js` with Docker stats API
   - Real-time memory/CPU monitoring
   - Escalation logic for budget exceeded

3. **Escalation Handling:**
   - Implement `escalation-handler.js` decision logic
   - Temporary budget increase approval
   - Cross-team resource sharing

4. **Agent Failure Recovery:**
   - PostgreSQL state restoration
   - Automatic agent respawn
   - Task resumption from checkpoint

---

## Troubleshooting

### Coordinator won't start - Redis connection failed
**Solution:** Ensure Redis is running and accessible
```bash
docker exec cfn-docker-main-coordinator ping cfn-redis-shared
docker exec cfn-redis-shared redis-cli ping
```

### Coordinator won't start - PostgreSQL connection failed
**Solution:** Check PostgreSQL credentials and network
```bash
docker exec cfn-docker-main-coordinator ping cfn-postgres
docker exec cfn-postgres psql -U cfn_admin -d cfn_corporate -c "SELECT 1"
```

### Coordinator won't start - Docker socket permission denied
**Solution:** Mount Docker socket with correct permissions
```bash
# Verify socket exists
ls -la /var/run/docker.sock

# If needed, add cfnagent user to docker group in container
# Or run container with --user root (not recommended)
```

### Skill script fails - database connection refused
**Solution:** Ensure database credentials are correct
```bash
# Test connection manually
docker exec cfn-postgres psql -U readonly_user -d cfn_corporate -c "SELECT 1"
```

---

## File Structure

```
docker/
├── Dockerfile.main-coordinator
├── Dockerfile.team-coordinator
├── coordinator/
│   ├── main/
│   │   ├── entrypoint.sh
│   │   ├── coordinator.js
│   │   ├── escalation-handler.js
│   │   └── package.json
│   └── team/
│       ├── entrypoint.sh
│       ├── coordinator.js
│       ├── agent-manager.js
│       ├── resource-tracker.js
│       └── package.json
├── skills/
│   ├── database-readonly/
│   │   ├── README.md
│   │   └── query.sh
│   └── database-readwrite/
│       ├── README.md
│       ├── query.sh
│       └── migrate.sh
├── config/
│   └── teams/
│       └── [7 team YAML files]
├── scripts/
│   ├── provision-team.sh
│   ├── deprovision-team.sh
│   ├── validate-team-config.sh
│   └── create-networks.sh
└── docs/
    └── SPARC/
        └── [3 architecture documents]
```

---

## Success Metrics

**Phase 1 Complete When:**
- ✅ Both coordinator images build successfully
- ✅ Health checks pass in isolation
- ✅ Version information displays correctly
- ✅ Skill scripts validate queries correctly
- ✅ All scripts are executable

**Phase 2 Ready When:**
- ⏳ Shared infrastructure deployed (Redis, PostgreSQL)
- ⏳ Networks created
- ⏳ Main coordinator running and healthy
- ⏳ First team coordinator running and healthy
- ⏳ Agent spawning tested end-to-end

---

## Related Documentation

- [Requirements Specification](docs/SPARC/CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md)
- [Organizational Architecture](docs/SPARC/CFN_DOCKER_ORGANIZATIONAL_ARCHITECTURE.md)
- [Team Provisioning Guide](docs/SPARC/CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md)
- [Script Documentation](scripts/README.md)
- [Team Configuration Guide](config/teams/README.md)
