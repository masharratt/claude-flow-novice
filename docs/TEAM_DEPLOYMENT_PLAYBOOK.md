# Team Deployment Playbook

**Purpose:** Step-by-step guide for deploying Trigger.dev per-agent container architecture for enterprise teams.

**Version:** 1.0.0
**Status:** Phase 5 - Enterprise Multi-Team Architecture
**Last Updated:** 2025-11-24

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Team Onboarding Process](#team-onboarding-process)
4. [Deployment Verification](#deployment-verification)
5. [Monitoring and Alerts](#monitoring-and-alerts)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Requirements Validation

Before deploying a new team, verify:

**Infrastructure Requirements:**
- [ ] Dedicated Docker host available (or shared cluster)
- [ ] Docker daemon version 24.0+
- [ ] Docker Compose version 2.20+
- [ ] 16+ CPU cores allocated
- [ ] 64GB+ RAM allocated
- [ ] 500GB+ disk space
- [ ] Network connectivity to central Redis (coordination)
- [ ] TLS certificates for trigger.dev HTTPS
- [ ] DNS entries created (trigger-TEAM.company.com)

**Security Checklist:**
- [ ] Docker socket secured (ACLs applied)
- [ ] API keys rotated for new team
- [ ] Secrets manager integrated (Vault/AWS Secrets Manager)
- [ ] Network policies defined (no cross-team container communication)
- [ ] Audit logging enabled (Docker events)
- [ ] Resource quotas defined and enforced
- [ ] Cost alerts configured

**Team Handoff:**
- [ ] Team lead confirmed deployment scope
- [ ] On-call engineer assigned
- [ ] Escalation contacts provided
- [ ] Post-deployment training scheduled
- [ ] Documentation reviewed by team

**Approval Gates:**
- [ ] Infrastructure team sign-off
- [ ] Security team sign-off
- [ ] Finance team sign-off (budget approved)
- [ ] CISO approval (container isolation strategy)

---

## Infrastructure Setup

### Phase 1: Base Infrastructure (2-4 hours)

#### Step 1.1: Provision Docker Host

**For AWS (EC2):**
```bash
#!/bin/bash
# provision-docker-host.sh - AWS infrastructure as code

TEAM_NAME=$1
INSTANCE_TYPE=${2:-t3.xlarge}  # 4 CPU, 16GB RAM (starter)
VOLUME_SIZE=${3:-500}           # 500GB EBS volume

# Create security group
aws ec2 create-security-group \
  --group-name "trigger-$TEAM_NAME" \
  --description "Trigger.dev for $TEAM_NAME team" \
  --vpc-id "$VPC_ID"

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=trigger-$TEAM_NAME" \
  --query 'SecurityGroups[0].GroupId' --output text)

# Allow SSH, Docker API, HTTP/HTTPS, Redis
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 2375 --cidr 10.0.0.0/8  # Docker API (internal only)

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 6379 --cidr 10.0.0.0/8

# Launch EC2 instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type "$INSTANCE_TYPE" \
  --key-name trigger-deploy \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile Name=TriggerDevRole \
  --block-device-mappings \
    DeviceName=/dev/xvda,Ebs="{VolumeSize=$VOLUME_SIZE,VolumeType=gp3,DeleteOnTermination=true}" \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=trigger-$TEAM_NAME}]" \
  --user-data file://install-docker.sh

echo "Instance launched. Waiting for availability..."
sleep 60

# Get instance details
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=trigger-$TEAM_NAME" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo "Instance ready: trigger-$TEAM_NAME"
echo "IP: $PUBLIC_IP"
echo "SSH: ssh -i trigger-deploy.pem ec2-user@$PUBLIC_IP"
```

**User data script (`install-docker.sh`):**
```bash
#!/bin/bash
set -e

# Update system
yum update -y
yum install -y docker docker-compose git curl jq

# Enable Docker daemon
systemctl enable docker
systemctl start docker

# Create docker group
groupadd docker || true
usermod -aG docker ec2-user

# Configure Docker daemon (increase file descriptors, add labels)
cat > /etc/docker/daemon.json <<'EOF'
{
  "insecure-registries": ["registry.company.com"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

systemctl restart docker

# Install Node.js (for trigger.dev)
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Install CFN Loop CLI
npm install -g claude-flow-novice

echo "Docker host ready for deployment"
```

#### Step 1.2: Create Docker Network

```bash
#!/bin/bash
# setup-docker-network.sh

TEAM_NAME=$1

# Create isolated network for this team
docker network create \
  --driver bridge \
  --subnet=172.25.0.0/16 \
  "trigger-$TEAM_NAME"

# Verify
docker network inspect "trigger-$TEAM_NAME"

echo "Network created: trigger-$TEAM_NAME"
```

#### Step 1.3: Deploy Redis (Coordination Layer)

```bash
#!/bin/bash
# deploy-redis.sh

TEAM_NAME=$1
REDIS_PORT=${2:-6379}

# Check if Redis already exists
if docker ps -a --format '{{.Names}}' | grep -q "redis-$TEAM_NAME"; then
  echo "Redis already running for $TEAM_NAME"
  exit 0
fi

# Deploy Redis container
docker run -d \
  --name "redis-$TEAM_NAME" \
  --network "trigger-$TEAM_NAME" \
  --restart unless-stopped \
  -v "redis-$TEAM_NAME-data:/data" \
  -p "$REDIS_PORT:6379" \
  --label team="$TEAM_NAME" \
  --label component="coordination" \
  redis:7-alpine \
  redis-server \
  --appendonly yes \
  --maxmemory 4gb \
  --maxmemory-policy allkeys-lru

# Wait for Redis to be ready
sleep 2
docker exec "redis-$TEAM_NAME" redis-cli PING

echo "Redis deployed: redis-$TEAM_NAME"
echo "Endpoint: redis-$TEAM_NAME:6379"
```

---

### Phase 2: Build Agent Images (1-2 hours)

#### Step 2.1: Build Team-Specific Agent Images

```bash
#!/bin/bash
# build-team-agents.sh

TEAM_NAME=$1
REGISTRY=${2:-registry.company.com}

echo "Building agent images for team: $TEAM_NAME"

# Base agent image (shared across teams)
docker build \
  -f docker/Dockerfile.cfn-agent-base \
  -t "$REGISTRY/cfn-agent-base:latest" \
  .

# Team-specific agent images
agent_types=("backend-developer" "frontend-engineer" "tester" "code-reviewer" "product-owner")

for agent_type in "${agent_types[@]}"; do
  # Replace hyphens with underscores for directory
  dir_name=${agent_type//-/_}

  docker build \
    -f "docker/agents/$dir_name/Dockerfile" \
    -t "$REGISTRY/cfn-agent-$TEAM_NAME:$agent_type" \
    --build-arg TEAM="$TEAM_NAME" \
    --build-arg AGENT_TYPE="$agent_type" \
    .

  # Push to registry
  docker push "$REGISTRY/cfn-agent-$TEAM_NAME:$agent_type"
  echo "✓ Built and pushed: cfn-agent-$TEAM_NAME:$agent_type"
done

echo "All agent images built for team: $TEAM_NAME"
```

#### Step 2.2: Verify Agent Images

```bash
#!/bin/bash
# verify-agent-images.sh

TEAM_NAME=$1
REGISTRY=${2:-registry.company.com}

agent_types=("backend-developer" "frontend-engineer" "tester" "code-reviewer" "product-owner")

echo "Verifying agent images for team: $TEAM_NAME"

for agent_type in "${agent_types[@]}"; do
  image="$REGISTRY/cfn-agent-$TEAM_NAME:$agent_type"

  # Check if image exists in registry
  if curl -s -o /dev/null -w "%{http_code}" "$REGISTRY/v2/$image/manifests/latest" | grep -q "200\|301"; then
    echo "✓ $image exists in registry"
  else
    echo "✗ $image NOT found in registry"
    exit 1
  fi

  # Test image locally
  docker run --rm "$image" --version
  echo "✓ $image runs successfully"
done

echo "All agent images verified!"
```

---

### Phase 3: Deploy Trigger.dev (1-2 hours)

#### Step 3.1: Deploy Trigger.dev Stack

```yaml
# docker-compose.yml - Trigger.dev for specific team

version: "3.9"

services:
  # PostgreSQL (Trigger.dev database)
  postgres:
    image: postgres:15-alpine
    container_name: trigger-postgres-${TEAM_NAME}
    environment:
      POSTGRES_USER: trigger
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: trigger_dev
    volumes:
      - postgres-${TEAM_NAME}-data:/var/lib/postgresql/data
    networks:
      - trigger-${TEAM_NAME}
    restart: unless-stopped
    labels:
      team: "${TEAM_NAME}"
      component: "database"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trigger"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis (Coordination)
  redis:
    image: redis:7-alpine
    container_name: redis-${TEAM_NAME}
    networks:
      - trigger-${TEAM_NAME}
    restart: unless-stopped
    labels:
      team: "${TEAM_NAME}"
      component: "coordination"
    healthcheck:
      test: ["CMD", "redis-cli", "PING"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Trigger.dev Server
  trigger-server:
    image: ${REGISTRY}/trigger-server:latest
    container_name: trigger-server-${TEAM_NAME}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://trigger:${DB_PASSWORD}@postgres:5432/trigger_dev
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
      TEAM_NAME: ${TEAM_NAME}
      TEAM_COST_CENTER: ${COST_CENTER}
      API_KEY: ${TRIGGER_API_KEY}
      SECRET_KEY: ${TRIGGER_SECRET_KEY}
      DOCKER_SOCKET: /var/run/docker.sock
      DOCKER_NETWORK: trigger-${TEAM_NAME}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - trigger-${TEAM_NAME}-data:/app/data
    ports:
      - "${TRIGGER_PORT}:3000"
    networks:
      - trigger-${TEAM_NAME}
    restart: unless-stopped
    labels:
      team: "${TEAM_NAME}"
      component: "server"
      cost-center: "${COST_CENTER}"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Trigger.dev Worker
  trigger-worker:
    image: ${REGISTRY}/trigger-worker:latest
    container_name: trigger-worker-${TEAM_NAME}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      trigger-server:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://trigger:${DB_PASSWORD}@postgres:5432/trigger_dev
      REDIS_URL: redis://redis:6379
      TRIGGER_SERVER_URL: http://trigger-server:3000
      TEAM_NAME: ${TEAM_NAME}
      TEAM_COST_CENTER: ${COST_CENTER}
      DOCKER_SOCKET: /var/run/docker.sock
      DOCKER_NETWORK: trigger-${TEAM_NAME}
      MAX_CONCURRENT_CONTAINERS: ${MAX_CONCURRENT:-8}
      CPU_LIMIT: ${CPU_LIMIT:-4}
      MEMORY_LIMIT: ${MEMORY_LIMIT:-16g}
      REGISTRY_URL: ${REGISTRY}
      AGENT_IMAGE_PATTERN: cfn-agent-${TEAM_NAME}:*
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /workspace:/workspace
      - trigger-${TEAM_NAME}-cache:/app/cache
    networks:
      - trigger-${TEAM_NAME}
    restart: unless-stopped
    labels:
      team: "${TEAM_NAME}"
      component: "worker"
      cost-center: "${COST_CENTER}"
    healthcheck:
      test: ["CMD", "ps", "aux"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres-${TEAM_NAME}-data:
  redis-${TEAM_NAME}-data:
  trigger-${TEAM_NAME}-data:
  trigger-${TEAM_NAME}-cache:

networks:
  trigger-${TEAM_NAME}:
    driver: bridge
```

**Environment file (`.env.team-TEAMNAME`):**
```bash
# Team Configuration
TEAM_NAME=engineering
COST_CENTER=ENG-001

# Database
DB_PASSWORD=<GENERATE_STRONG_PASSWORD>

# Trigger.dev API
TRIGGER_API_KEY=<GENERATE_API_KEY>
TRIGGER_SECRET_KEY=<GENERATE_SECRET_KEY>
TRIGGER_PORT=3000

# Registry
REGISTRY=registry.company.com

# Resource Limits (based on team)
MAX_CONCURRENT=8
CPU_LIMIT=4
MEMORY_LIMIT=16g
```

#### Step 3.2: Deploy Stack

```bash
#!/bin/bash
# deploy-trigger-team.sh

TEAM_NAME=$1
COST_CENTER=$2

if [ -z "$TEAM_NAME" ] || [ -z "$COST_CENTER" ]; then
  echo "Usage: $0 <team-name> <cost-center>"
  exit 1
fi

# Create environment file
cat > ".env.team-$TEAM_NAME" <<EOF
TEAM_NAME=$TEAM_NAME
COST_CENTER=$COST_CENTER
DB_PASSWORD=$(openssl rand -base64 32)
TRIGGER_API_KEY=$(openssl rand -hex 32)
TRIGGER_SECRET_KEY=$(openssl rand -hex 32)
TRIGGER_PORT=$((3000 + $(echo -n "$TEAM_NAME" | md5sum | cut -c1-4 | xargs printf '%d\n' || echo 0) % 1000))
REGISTRY=registry.company.com
MAX_CONCURRENT=8
CPU_LIMIT=4
MEMORY_LIMIT=16g
EOF

# Load environment
export $(cat ".env.team-$TEAM_NAME" | xargs)

# Create Docker network
docker network create "trigger-$TEAM_NAME" 2>/dev/null || true

# Deploy Redis first
docker run -d \
  --name "redis-$TEAM_NAME" \
  --network "trigger-$TEAM_NAME" \
  --restart unless-stopped \
  -v "redis-$TEAM_NAME-data:/data" \
  --label team="$TEAM_NAME" \
  --label component="coordination" \
  redis:7-alpine \
  redis-server --appendonly yes --maxmemory 4gb

# Deploy stack
docker-compose -f docker-compose.yml \
  --project-name "trigger-$TEAM_NAME" \
  -p "trigger-$TEAM_NAME" \
  up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 10

# Verify deployment
echo "Verifying deployment..."
docker-compose -f docker-compose.yml -p "trigger-$TEAM_NAME" ps

echo "✓ Trigger.dev deployed for team: $TEAM_NAME"
echo "Access at: http://localhost:$TRIGGER_PORT"
echo "API Key: $TRIGGER_API_KEY"
echo "Secret Key: $TRIGGER_SECRET_KEY"
echo ""
echo "Save these credentials securely!"
```

---

## Team Onboarding Process

### Phase 4: Team Onboarding (1-2 hours)

#### Step 4.1: Create Team Account

```bash
#!/bin/bash
# onboard-team.sh

TEAM_NAME=$1
TEAM_LEAD_EMAIL=$2
COST_CENTER=$3
MONTHLY_BUDGET=$4

if [ -z "$TEAM_NAME" ] || [ -z "$TEAM_LEAD_EMAIL" ] || [ -z "$COST_CENTER" ] || [ -z "$MONTHLY_BUDGET" ]; then
  echo "Usage: $0 <team-name> <lead-email> <cost-center> <monthly-budget>"
  exit 1
fi

# Create team in management database
psql -h postgres.company.com -U admin -d management <<EOF
INSERT INTO teams (name, cost_center, team_lead_email, monthly_budget, created_at)
VALUES ('$TEAM_NAME', '$COST_CENTER', '$TEAM_LEAD_EMAIL', $MONTHLY_BUDGET, NOW());
EOF

# Create API key for team
API_KEY=$(openssl rand -hex 32)

psql -h postgres.company.com -U admin -d management <<EOF
INSERT INTO api_keys (team_id, key, created_at)
SELECT id, '$API_KEY', NOW() FROM teams WHERE name = '$TEAM_NAME';
EOF

# Create cost center in billing system
curl -X POST https://billing.company.com/api/cost-centers \
  -H "Authorization: Bearer $BILLING_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$COST_CENTER\",
    \"team_name\": \"$TEAM_NAME\",
    \"monthly_budget\": $MONTHLY_BUDGET,
    \"alerts\": {
      \"warning_threshold\": 0.8,
      \"critical_threshold\": 0.95
    }
  }"

# Send onboarding email
cat > /tmp/onboarding-email.txt <<EOF
Subject: Trigger.dev Deployment Ready - $TEAM_NAME

Dear $TEAM_LEAD_EMAIL,

Your Trigger.dev instance is ready!

Team: $TEAM_NAME
Cost Center: $COST_CENTER
Monthly Budget: \$$MONTHLY_BUDGET
API Key: $API_KEY (save securely!)

Documentation: https://company.com/docs/trigger-dev
Support: platform-team@company.com

Next steps:
1. Set API credentials in your CI/CD
2. Configure team webhooks
3. Test first agent spawn

Questions? Reach out to the Platform Team.
EOF

mail -s "Trigger.dev Deployment Ready - $TEAM_NAME" "$TEAM_LEAD_EMAIL" < /tmp/onboarding-email.txt

echo "✓ Team onboarded: $TEAM_NAME"
echo "API Key: $API_KEY"
```

#### Step 4.2: Configure Team Quotas

```bash
#!/bin/bash
# configure-team-quotas.sh

TEAM_NAME=$1
MAX_CONCURRENT=${2:-8}
MAX_CPU=${3:-4}
MAX_MEMORY=${4:-16}
MAX_DAILY_COST=${5:-500}

# Update docker-compose environment
source ".env.team-$TEAM_NAME"

export MAX_CONCURRENT
export CPU_LIMIT=$MAX_CPU
export MEMORY_LIMIT="${MAX_MEMORY}g"
export MAX_DAILY_COST

# Restart worker with new limits
docker-compose -p "trigger-$TEAM_NAME" up -d --no-deps trigger-worker

echo "✓ Quotas configured for team: $TEAM_NAME"
echo "  Max concurrent: $MAX_CONCURRENT"
echo "  Max CPU: $MAX_CPU"
echo "  Max memory: ${MAX_MEMORY}GB"
echo "  Daily budget: \$$MAX_DAILY_COST"
```

#### Step 4.3: Configure Team Secrets

```bash
#!/bin/bash
# configure-team-secrets.sh

TEAM_NAME=$1

echo "Configuring secrets for team: $TEAM_NAME"

# Store API keys in secrets manager
vault kv put "secret/trigger/$TEAM_NAME" \
  zai_api_key="$ZAI_API_KEY" \
  kimi_api_key="$KIMI_API_KEY" \
  openrouter_api_key="$OPENROUTER_API_KEY" \
  anthropic_api_key="$ANTHROPIC_API_KEY"

# Mount secrets in Docker container
docker-compose -p "trigger-$TEAM_NAME" down
docker-compose -p "trigger-$TEAM_NAME" up -d

echo "✓ Secrets configured for team: $TEAM_NAME"
```

---

## Deployment Verification

### Phase 5: Verify Deployment (30 minutes)

#### Step 5.1: Health Checks

```bash
#!/bin/bash
# verify-deployment.sh

TEAM_NAME=$1

echo "Verifying deployment for team: $TEAM_NAME"

# Check Docker containers
echo -n "Checking containers... "
containers=$(docker-compose -p "trigger-$TEAM_NAME" ps --quiet | wc -l)
if [ "$containers" -eq 4 ]; then
  echo "✓ All 4 containers running"
else
  echo "✗ Expected 4 containers, found $containers"
  exit 1
fi

# Check PostgreSQL
echo -n "Checking PostgreSQL... "
if docker exec "trigger-postgres-$TEAM_NAME" psql -U trigger -d trigger_dev -c "SELECT 1" > /dev/null 2>&1; then
  echo "✓ PostgreSQL healthy"
else
  echo "✗ PostgreSQL failed"
  exit 1
fi

# Check Redis
echo -n "Checking Redis... "
if docker exec "redis-$TEAM_NAME" redis-cli PING | grep -q "PONG"; then
  echo "✓ Redis healthy"
else
  echo "✗ Redis failed"
  exit 1
fi

# Check Trigger.dev Server
echo -n "Checking Trigger.dev Server... "
if curl -s http://localhost:3000/health | grep -q "ok"; then
  echo "✓ Server healthy"
else
  echo "✗ Server health check failed"
  exit 1
fi

# Check Docker socket access
echo -n "Checking Docker socket access... "
if docker exec "trigger-worker-$TEAM_NAME" docker ps > /dev/null 2>&1; then
  echo "✓ Docker socket accessible"
else
  echo "✗ Docker socket not accessible"
  exit 1
fi

echo ""
echo "✓ All health checks passed!"
```

#### Step 5.2: Test Agent Spawning

```bash
#!/bin/bash
# test-agent-spawn.sh

TEAM_NAME=$1
TRIGGER_API_KEY=$2

echo "Testing agent spawn for team: $TEAM_NAME"

# Trigger test job
response=$(curl -s -X POST "http://localhost:3000/api/trigger" \
  -H "Authorization: Bearer $TRIGGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.agent.spawn",
    "payload": {
      "agentType": "backend-developer",
      "taskDescription": "Test deployment"
    }
  }')

# Extract job ID
JOB_ID=$(echo "$response" | jq -r '.job_id // empty')

if [ -z "$JOB_ID" ]; then
  echo "✗ Failed to spawn job"
  echo "Response: $response"
  exit 1
fi

echo "Job spawned: $JOB_ID"
echo "Waiting for completion..."

# Poll for completion (timeout after 5 minutes)
timeout=300
elapsed=0
while [ $elapsed -lt $timeout ]; do
  status=$(curl -s "http://localhost:3000/api/jobs/$JOB_ID" \
    -H "Authorization: Bearer $TRIGGER_API_KEY" | jq -r '.status')

  if [ "$status" = "completed" ] || [ "$status" = "failed" ]; then
    echo "Job status: $status"
    break
  fi

  sleep 5
  elapsed=$((elapsed + 5))
done

if [ "$status" = "completed" ]; then
  echo "✓ Agent spawn test passed!"
else
  echo "✗ Agent spawn test failed (status: $status)"
  exit 1
fi
```

#### Step 5.3: Verify Cost Tracking

```bash
#!/bin/bash
# verify-cost-tracking.sh

TEAM_NAME=$1

echo "Verifying cost tracking for team: $TEAM_NAME"

# Check for labeled containers
echo -n "Checking container labels... "
labeled=$(docker ps -a \
  --filter "label=team=$TEAM_NAME" \
  --filter "label=cost-center" \
  --filter "label=project" \
  --format "{{.ID}}" | wc -l)

if [ "$labeled" -gt 0 ]; then
  echo "✓ Found $labeled labeled containers"
else
  echo "✗ No labeled containers found"
  exit 1
fi

# Verify label values
echo -n "Checking label values... "
label_output=$(docker inspect $(docker ps -a --filter "label=team=$TEAM_NAME" --quiet | head -1) \
  --format '{{json .Config.Labels}}')

if echo "$label_output" | jq -e '.team, .cost_center, .project' > /dev/null 2>&1; then
  echo "✓ All required labels present"
else
  echo "✗ Missing required labels"
  exit 1
fi

# Check cost calculation
echo -n "Checking cost calculation... "
if docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" > /tmp/stats.txt 2>&1; then
  echo "✓ Cost metrics collectible"
else
  echo "✗ Cannot collect cost metrics"
  exit 1
fi

echo ""
echo "✓ Cost tracking verified!"
```

---

## Monitoring and Alerts

### Phase 6: Configure Monitoring (1 hour)

#### Step 6.1: Set Up Cost Alerts

```bash
#!/bin/bash
# configure-alerts.sh

TEAM_NAME=$1
DAILY_BUDGET=$2
ALERT_EMAIL=$3

# Create alert in monitoring system
cat > /tmp/alert-config.json <<EOF
{
  "team": "$TEAM_NAME",
  "metric": "daily_cost",
  "threshold": $DAILY_BUDGET,
  "comparison": "greater_than",
  "action": "email",
  "recipients": ["$ALERT_EMAIL"],
  "template": "cost_alert",
  "repeat": 3600
}
EOF

# Register alert
curl -X POST https://monitoring.company.com/api/alerts \
  -H "Authorization: Bearer $MONITORING_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/alert-config.json

echo "✓ Cost alert configured for team: $TEAM_NAME"
echo "Alert threshold: \$$DAILY_BUDGET/day"
echo "Alert recipient: $ALERT_EMAIL"
```

#### Step 6.2: Configure Resource Monitoring

```bash
#!/bin/bash
# configure-monitoring.sh

TEAM_NAME=$1

# Deploy Prometheus scrape config for team
cat > "/etc/prometheus/trigger-$TEAM_NAME.yml" <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'trigger-$TEAM_NAME'
    static_configs:
      - targets: ['localhost:8080']
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'container_.*'
        action: keep
EOF

# Reload Prometheus
curl -X POST http://localhost:9090/-/reload

echo "✓ Prometheus monitoring configured for team: $TEAM_NAME"
```

---

## Troubleshooting Guide

### Common Issues and Resolutions

#### Issue 1: Agent Containers Fail to Spawn

**Symptoms:**
- Trigger.dev job shows "spawning" but never completes
- `docker ps` shows no containers starting

**Diagnosis:**
```bash
docker logs "trigger-worker-$TEAM_NAME" | tail -50
docker exec "trigger-worker-$TEAM_NAME" docker ps
```

**Resolution:**
1. Verify Docker socket is accessible:
   ```bash
   docker exec "trigger-worker-$TEAM_NAME" ls -la /var/run/docker.sock
   ```
2. Check Docker network exists:
   ```bash
   docker network ls | grep "trigger-$TEAM_NAME"
   ```
3. Verify agent images are available:
   ```bash
   docker images | grep "cfn-agent-$TEAM_NAME"
   ```
4. Check worker resource constraints:
   ```bash
   docker stats "trigger-worker-$TEAM_NAME"
   ```

#### Issue 2: High Cost Spikes

**Symptoms:**
- Daily cost suddenly 10x normal
- Cost alerts firing

**Diagnosis:**
```bash
# Find high-resource containers
docker stats --no-stream \
  --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
  --filter "label=team=$TEAM_NAME" | sort -k2 -rn | head -10

# Check for runaway processes
docker ps --filter "label=team=$TEAM_NAME" | while read line; do
  container=$(echo "$line" | awk '{print $1}')
  docker top "$container" | head -5
done
```

**Resolution:**
1. Stop high-cost containers:
   ```bash
   docker stop <container-id>
   ```
2. Check for infinite loops in agent code:
   ```bash
   docker logs <container-id> | tail -100
   ```
3. Set resource limits if missing:
   ```bash
   docker update --cpus 2 --memory 4g <container-id>
   ```

#### Issue 3: Redis Coordination Failures

**Symptoms:**
- "BLPOP timeout" errors in logs
- Agents not communicating properly

**Diagnosis:**
```bash
docker exec "redis-$TEAM_NAME" redis-cli
> PING
PONG
> DBSIZE
(integer) 1234
> KEYS *
```

**Resolution:**
1. Check Redis memory usage:
   ```bash
   docker stats "redis-$TEAM_NAME"
   ```
2. Clear old keys if full:
   ```bash
   docker exec "redis-$TEAM_NAME" redis-cli FLUSHDB
   ```
3. Increase Redis max memory:
   ```bash
   docker exec "redis-$TEAM_NAME" redis-cli CONFIG SET maxmemory 8gb
   ```

#### Issue 4: PostgreSQL Connection Failures

**Symptoms:**
- "Connection refused" errors
- Trigger.dev Server failing to start

**Diagnosis:**
```bash
docker logs "trigger-postgres-$TEAM_NAME" | tail -20
docker exec "trigger-postgres-$TEAM_NAME" psql -U trigger -d trigger_dev -c "SELECT 1"
```

**Resolution:**
1. Check disk space:
   ```bash
   docker exec "trigger-postgres-$TEAM_NAME" df -h
   ```
2. Check PostgreSQL logs:
   ```bash
   docker logs "trigger-postgres-$TEAM_NAME" | grep ERROR
   ```
3. Restart PostgreSQL:
   ```bash
   docker-compose -p "trigger-$TEAM_NAME" restart postgres
   ```

---

## Rollback Procedures

### Rollback Scenarios

#### Scenario 1: Rollback Agent Image

If a newly deployed agent image causes issues:

```bash
#!/bin/bash
# rollback-agent-image.sh

TEAM_NAME=$1
AGENT_TYPE=$2
PREVIOUS_VERSION=${3:-previous}

REGISTRY=registry.company.com

# Stop workers using new image
docker-compose -p "trigger-$TEAM_NAME" down

# Switch to previous image version
docker pull "$REGISTRY/cfn-agent-$TEAM_NAME:$AGENT_TYPE-$PREVIOUS_VERSION"
docker tag "$REGISTRY/cfn-agent-$TEAM_NAME:$AGENT_TYPE-$PREVIOUS_VERSION" \
           "$REGISTRY/cfn-agent-$TEAM_NAME:$AGENT_TYPE-latest"

# Restart
docker-compose -p "trigger-$TEAM_NAME" up -d

echo "✓ Rolled back $AGENT_TYPE to version: $PREVIOUS_VERSION"
```

#### Scenario 2: Rollback Trigger.dev Version

If Trigger.dev Server has issues:

```bash
#!/bin/bash
# rollback-trigger-server.sh

TEAM_NAME=$1
PREVIOUS_VERSION=${2:-24.11.0}

# Backup current database
docker exec "trigger-postgres-$TEAM_NAME" pg_dump -U trigger trigger_dev > \
  "/tmp/trigger-backup-$TEAM_NAME-$(date +%s).sql"

# Stop services
docker-compose -p "trigger-$TEAM_NAME" stop trigger-server trigger-worker

# Update image
export TRIGGER_VERSION=$PREVIOUS_VERSION
docker-compose -p "trigger-$TEAM_NAME" pull trigger-server
docker-compose -p "trigger-$TEAM_NAME" up -d trigger-server

# Verify
docker-compose -p "trigger-$TEAM_NAME" ps

echo "✓ Rolled back Trigger.dev to version: $PREVIOUS_VERSION"
```

#### Scenario 3: Emergency Shutdown

In case of security breach or critical failure:

```bash
#!/bin/bash
# emergency-shutdown.sh

TEAM_NAME=$1
REASON=${2:-"Manual shutdown"}

echo "EMERGENCY SHUTDOWN: $TEAM_NAME"
echo "Reason: $REASON"
echo "Time: $(date)"

# Stop all containers
docker-compose -p "trigger-$TEAM_NAME" down

# Stop any remaining containers with team label
docker ps -a --filter "label=team=$TEAM_NAME" -q | xargs -r docker stop

# Remove network
docker network rm "trigger-$TEAM_NAME" 2>/dev/null || true

# Log incident
echo "Emergency shutdown at $(date)" >> "/var/log/trigger/$TEAM_NAME.log"

echo "✓ Team $TEAM_NAME shut down"
echo "Data preserved in volumes"
```

---

## Checklist: Complete Deployment

Use this checklist to verify full deployment completion:

```
INFRASTRUCTURE SETUP
  [ ] Docker host provisioned
  [ ] Docker network created
  [ ] Redis deployed
  [ ] DNS entry created

AGENT IMAGES
  [ ] Base image built
  [ ] Team-specific images built
  [ ] Images pushed to registry
  [ ] Images tested locally

TRIGGER.DEV DEPLOYMENT
  [ ] PostgreSQL running
  [ ] Trigger.dev Server healthy
  [ ] Trigger.dev Worker healthy
  [ ] All services in Docker Compose

TEAM ONBOARDING
  [ ] Team account created
  [ ] API key generated
  [ ] Cost center created in billing
  [ ] Quotas configured
  [ ] Secrets stored securely

VERIFICATION
  [ ] Health checks pass
  [ ] Agent spawn test succeeds
  [ ] Cost tracking functional
  [ ] Monitoring alerts configured

PRODUCTION READINESS
  [ ] Backups scheduled
  [ ] Log rotation configured
  [ ] Security team approved
  [ ] Finance team approved
  [ ] Runbook provided to team
```

---

**Last Updated:** 2025-11-24
**Status:** Phase 5 Complete - Ready for Enterprise Deployment
