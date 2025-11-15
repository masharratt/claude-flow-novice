# CFN Docker Team Provisioning Guide

**Document Version:** 1.0.0
**Date:** 2025-11-15
**Status:** Phase 0A Complete - Implementation Guide
**Purpose:** Step-by-step guide for provisioning and deprovisioning teams in CFN Docker infrastructure

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Team Provisioning](#3-team-provisioning)
4. [Team Deprovisioning](#4-team-deprovisioning)
5. [Configuration Reference](#5-configuration-reference)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Overview

### 1.1 What is Team Provisioning?

Team provisioning creates a complete isolated environment for a team:
- Dedicated workspace directory
- Isolated Docker network
- Team-specific Redis instance
- Team coordinator container
- Skill directory with allowed skills only
- Resource budget allocation

### 1.2 Team Lifecycle

```
┌──────────────┐
│   CREATING   │
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│    ACTIVE    │────▶│   INACTIVE   │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐
│  DEPROVISIONING    │   ARCHIVED   │
└──────────────┘     └──────────────┘
```

---

## 2. Prerequisites

### 2.1 System Requirements

- Docker Engine 20.10+
- 120GB RAM minimum
- 48 CPU cores minimum
- 500GB disk space minimum
- Linux host (Ubuntu 20.04+ or similar)

### 2.2 Infrastructure Requirements

**Must be running:**
- Main coordinator: `cfn-docker-main-coordinator`
- Shared Redis: `cfn-redis-shared`
- PostgreSQL: `cfn-postgres`
- Coordination network: `cfn-coordination`

**Verify infrastructure:**
```bash
docker ps | grep "cfn-docker-main-coordinator\|cfn-redis-shared\|cfn-postgres"
docker network ls | grep cfn-coordination
```

---

## 3. Team Provisioning

### 3.1 Quick Start

**Provision a team in 1 command:**
```bash
./scripts/provision-team.sh \
  --config config/teams/seo.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator
```

### 3.2 Step-by-Step Manual Provisioning

#### Step 1: Create Team Configuration

Create `config/teams/{team_id}.yaml`:

```yaml
# config/teams/seo.yaml
team:
  id: seo
  name: "SEO Team"
  description: "Content generation and keyword optimization"

  workspace:
    path: /workspace/seo
    disk_quota: 50GB

  resources:
    memory: 12GB
    cpu_cores: 4
    max_agents: 5

  allowed_skills:
    - content-generation
    - keyword-research
    - database-readonly
    - web-scraping

  network:
    subnet_id: 5  # 172.18.5.0/24
    coordinator_ip: 172.18.0.15
```

#### Step 2: Create Workspace Directory

```bash
# Create workspace
sudo mkdir -p /workspace/seo/code
sudo mkdir -p /workspace/seo/skills

# Set ownership
sudo chown -R 1000:1000 /workspace/seo

# Set disk quota (requires ext4 with quota support)
sudo setquota -u 1000 50G 50G 0 0 /workspace/seo
```

#### Step 3: Copy Allowed Skills

```bash
# Copy each allowed skill to team workspace
for skill in content-generation keyword-research database-readonly web-scraping; do
  sudo cp -r /skills/$skill /workspace/seo/skills/$skill
  sudo chown -R 1000:1000 /workspace/seo/skills/$skill
done
```

#### Step 4: Create Team Network

```bash
docker network create \
  --driver bridge \
  --subnet 172.18.5.0/24 \
  --gateway 172.18.5.1 \
  --label cfn.network=team \
  --label cfn.team=seo \
  team-seo
```

#### Step 5: Spawn Team Redis

```bash
docker run -d \
  --name cfn-redis-seo \
  --network team-seo \
  --ip 172.18.5.20 \
  --memory 512m \
  --cpus 0.5 \
  --restart unless-stopped \
  --label cfn.component=redis \
  --label cfn.team=seo \
  -v cfn-redis-seo-data:/data \
  redis:7-alpine \
  redis-server --maxmemory 512mb --maxmemory-policy volatile-lru
```

#### Step 6: Register Team in Database

```bash
psql -h localhost -U cfn_admin -d cfn_corporate <<EOF
INSERT INTO teams (id, name, status, created_at, config, metadata)
VALUES (
  'seo',
  'SEO Team',
  'active',
  NOW(),
  '{"resources": {"memory": "12GB", "cpu_cores": 4, "max_agents": 5}}'::jsonb,
  '{"description": "Content generation and keyword optimization"}'::jsonb
);
EOF
```

#### Step 7: Spawn Team Coordinator

```bash
docker run -d \
  --name cfn-docker-team-coordinator-seo \
  --network cfn-coordination \
  --network team-seo \
  --ip 172.18.0.15 \
  --memory 2g \
  --cpus 1.0 \
  --restart unless-stopped \
  --label cfn.component=team-coordinator \
  --label cfn.team=seo \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /workspace/seo:/workspace:rw \
  -v ./config/teams/seo.yaml:/config/team.yaml:ro \
  -e TEAM_ID=seo \
  -e TEAM_NAME="SEO Team" \
  -e REDIS_HOST=cfn-redis-seo \
  -e POSTGRES_HOST=cfn-postgres \
  -e BUDGET_ALLOCATED=12GB \
  -e MAX_AGENTS=5 \
  -e MAIN_COORDINATOR_HOST=cfn-docker-main-coordinator \
  cfn-docker-team-coordinator:latest
```

#### Step 8: Configure Firewall Rules

```bash
# Allow agents → team coordinator
sudo iptables -A DOCKER-USER -s 172.18.5.11/28 -d 172.18.5.10 -j ACCEPT

# Allow agents → team Redis
sudo iptables -A DOCKER-USER -s 172.18.5.11/28 -d 172.18.5.20 -j ACCEPT

# Block agents → other team networks
for subnet in 1 2 3 4 6 7; do
  sudo iptables -A DOCKER-USER -s 172.18.5.11/28 -d 172.18.${subnet}.0/24 -j DROP
done

# Block agents → coordination network
sudo iptables -A DOCKER-USER -s 172.18.5.11/28 -d 172.18.0.0/24 -j DROP

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

#### Step 9: Verify Provisioning

```bash
# Check team coordinator is running
docker ps | grep cfn-docker-team-coordinator-seo

# Check team Redis is running
docker ps | grep cfn-redis-seo

# Check network exists
docker network inspect team-seo

# Check workspace exists
ls -la /workspace/seo

# Check team is registered
psql -h localhost -U cfn_admin -d cfn_corporate \
  -c "SELECT * FROM teams WHERE id='seo';"
```

---

## 4. Team Deprovisioning

### 4.1 Quick Deprovision

```bash
./scripts/deprovision-team.sh --team seo
```

### 4.2 Step-by-Step Manual Deprovisioning

#### Step 1: Stop Team Coordinator

```bash
docker stop cfn-docker-team-coordinator-seo
docker rm cfn-docker-team-coordinator-seo
```

#### Step 2: Stop All Team Agents

```bash
# Find and stop all agents for this team
docker ps --filter "label=cfn.team=seo" -q | xargs docker stop
docker ps -a --filter "label=cfn.team=seo" -q | xargs docker rm
```

#### Step 3: Stop Team Redis

```bash
docker stop cfn-redis-seo
docker rm cfn-redis-seo
```

#### Step 4: Mark Team as Inactive

```bash
psql -h localhost -U cfn_admin -d cfn_corporate <<EOF
UPDATE teams
SET status='inactive', deprovisioned_at=NOW()
WHERE id='seo';
EOF
```

#### Step 5: Preserve Workspace (Optional)

```bash
# Option A: Keep workspace as-is (recommended)
echo "Workspace preserved at /workspace/seo"

# Option B: Archive workspace to S3 (future)
# tar -czf /tmp/seo-workspace-$(date +%Y%m%d).tar.gz /workspace/seo
# aws s3 cp /tmp/seo-workspace-*.tar.gz s3://cfn-archives/teams/seo/

# Option C: Delete workspace (destructive)
# sudo rm -rf /workspace/seo
```

#### Step 6: Remove Network (Optional)

```bash
# Only if no containers are using it
docker network rm team-seo
```

#### Step 7: Remove Firewall Rules

```bash
# Remove SEO-specific iptables rules
sudo iptables -D DOCKER-USER -s 172.18.5.11/28 -d 172.18.5.10 -j ACCEPT
sudo iptables -D DOCKER-USER -s 172.18.5.11/28 -d 172.18.5.20 -j ACCEPT

# Save rules
sudo iptables-save > /etc/iptables/rules.v4
```

---

## 5. Configuration Reference

### 5.1 Team Config Schema

```yaml
team:
  id: string                    # Unique team identifier (lowercase, no spaces)
  name: string                  # Human-readable team name
  description: string           # Team purpose

  workspace:
    path: string                # Absolute path to team workspace
    disk_quota: string          # Disk quota (e.g., "50GB")

  resources:
    memory: string              # Memory budget (e.g., "12GB")
    cpu_cores: integer          # CPU core allocation
    max_agents: integer         # Maximum concurrent agents

  allowed_skills:
    - string                    # List of skill directory names

  network:
    subnet_id: integer          # Subnet ID (1-254)
    coordinator_ip: string      # IP address for team coordinator
```

### 5.2 Network Subnet Allocation

| Subnet ID | CIDR | Team | Coordinator IP |
|-----------|------|------|----------------|
| 0 | 172.18.0.0/24 | Coordination | 172.18.0.10 (main) |
| 1 | 172.18.1.0/24 | Frontend | 172.18.0.11 |
| 2 | 172.18.2.0/24 | Backend | 172.18.0.12 |
| 3 | 172.18.3.0/24 | DevOps | 172.18.0.13 |
| 4 | 172.18.4.0/24 | QA | 172.18.0.14 |
| 5 | 172.18.5.0/24 | SEO | 172.18.0.15 |
| 6 | 172.18.6.0/24 | Marketing | 172.18.0.16 |
| 7 | 172.18.7.0/24 | C-Suite | 172.18.0.17 |

### 5.3 Resource Budget Guidelines

**Team Size Recommendations:**

| Team Type | Memory | CPU | Max Agents | Disk |
|-----------|--------|-----|------------|------|
| Small (1-3 agents) | 6-8GB | 2-3 | 3 | 30GB |
| Medium (3-5 agents) | 10-12GB | 3-4 | 5 | 50GB |
| Large (5-8 agents) | 14-16GB | 5-6 | 8 | 100GB |

---

## 6. Troubleshooting

### 6.1 Common Issues

#### Issue: Team coordinator won't start

**Symptoms:**
```bash
docker ps | grep cfn-docker-team-coordinator-seo
# No output
```

**Diagnosis:**
```bash
docker logs cfn-docker-team-coordinator-seo
```

**Common causes:**
- Redis not running: Check `docker ps | grep cfn-redis-seo`
- PostgreSQL not reachable: Check `docker exec cfn-docker-team-coordinator-seo ping cfn-postgres`
- Config file missing: Check `-v ./config/teams/seo.yaml:/config/team.yaml:ro`

#### Issue: Agents can't communicate with coordinator

**Symptoms:**
- Agents timeout waiting for tasks
- Coordinator logs show no agent heartbeats

**Diagnosis:**
```bash
# Check agent can reach coordinator
docker exec cfn-agent-seo-001 ping 172.18.5.10

# Check firewall rules
sudo iptables -L DOCKER-USER | grep 172.18.5
```

**Solution:**
```bash
# Re-add firewall rules (Step 8 of provisioning)
sudo iptables -A DOCKER-USER -s 172.18.5.11/28 -d 172.18.5.10 -j ACCEPT
```

#### Issue: Workspace permission errors

**Symptoms:**
- Agents can't write files
- "Permission denied" errors in agent logs

**Diagnosis:**
```bash
ls -la /workspace/seo
# Should show: drwxr-xr-x 1000 1000
```

**Solution:**
```bash
sudo chown -R 1000:1000 /workspace/seo
sudo chmod -R 755 /workspace/seo
```

#### Issue: Resource budget exceeded

**Symptoms:**
- Team coordinator logs: "Budget exceeded, cannot spawn agent"
- Escalation messages in main coordinator

**Diagnosis:**
```bash
# Check current memory usage
docker stats --no-stream --filter "label=cfn.team=seo"

# Check team budget in database
psql -h localhost -U cfn_admin -d cfn_corporate \
  -c "SELECT * FROM teams WHERE id='seo';"
```

**Solution:**
```bash
# Option 1: Terminate idle agents
docker ps --filter "label=cfn.team=seo" -q | head -1 | xargs docker stop

# Option 2: Increase budget (requires main coordinator approval)
# Manually update config/teams/seo.yaml and restart coordinator
```

### 6.2 Validation Checklist

Use this checklist after provisioning:

- [ ] Team config file exists: `config/teams/{team_id}.yaml`
- [ ] Workspace directory exists: `/workspace/{team_id}`
- [ ] Workspace owned by UID 1000: `ls -la /workspace/{team_id}`
- [ ] Skills copied to workspace: `ls /workspace/{team_id}/skills`
- [ ] Network created: `docker network inspect team-{team_id}`
- [ ] Team Redis running: `docker ps | grep cfn-redis-{team_id}`
- [ ] Team coordinator running: `docker ps | grep cfn-docker-team-coordinator-{team_id}`
- [ ] Team registered in database: `SELECT * FROM teams WHERE id='{team_id}'`
- [ ] Firewall rules configured: `sudo iptables -L DOCKER-USER | grep 172.18.X`
- [ ] Coordinator can reach shared Redis: `docker exec cfn-docker-team-coordinator-{team_id} ping cfn-redis-shared`
- [ ] Coordinator can reach PostgreSQL: `docker exec cfn-docker-team-coordinator-{team_id} ping cfn-postgres`

---

## Document Metadata

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**Author:** Phase 0A Documentation Team
**Status:** Ready for Implementation

**Related Documents:**
- CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md
- CFN_DOCKER_ORGANIZATIONAL_ARCHITECTURE.md
- scripts/provision-team.sh (to be created in Phase 0B)
- scripts/deprovision-team.sh (to be created in Phase 0B)

**Next Steps:**
- Phase 0B: Implement `provision-team.sh` script
- Phase 0B: Implement `deprovision-team.sh` script
- Phase 0B: Create team config templates for 7 teams
- Phase 0B: Test provisioning end-to-end
