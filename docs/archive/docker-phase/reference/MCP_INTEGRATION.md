# Docker MCP Integration Guide

**Version:** 4.1.0
**Status:** Production Ready
**Last Updated:** November 9, 2025

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [MCP Server Specifications](#mcp-server-specifications)
4. [Authentication Flow](#authentication-flow)
5. [Skill-Based Routing](#skill-based-routing)
6. [Deployment Guide](#deployment-guide)
7. [Testing and Validation](#testing-and-validation)
8. [Troubleshooting](#troubleshooting)

## Overview

The MCP (Model Context Protocol) Integration extends the Claude Flow Novice Docker infrastructure with specialized tool servers that provide isolated, secure access to browser automation, Redis operations, workflow automation, and security scanning capabilities.

### Key Features

- **Isolated MCP Servers**: Each tool runs in its own container with resource limits
- **Token-Based Authentication**: Secure access via agent-specific tokens
- **Skill-Based Routing**: Agents automatically connect to required MCP servers based on their skills
- **Health Monitoring**: Comprehensive health checks and metrics collection
- **Network Isolation**: Separate MCP network for security
- **Resource Management**: CPU and memory limits prevent resource exhaustion

### Benefits

- **Security**: Tool isolation prevents unauthorized access
- **Scalability**: Independent scaling of each MCP server
- **Reliability**: Health checks and automatic recovery
- **Performance**: Optimized resource allocation per tool type
- **Cost Efficiency**: Pay-per-use model with resource limits

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CFN Loop Agent Orchestration                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐         ┌────────────────┐                 │
│  │ CFN Orchestrator│────────│ Redis Coordinator│                │
│  │   (Port 3000)   │         │   (Port 6379)   │                │
│  └────────┬─────────┘         └────────────────┘                │
│           │                                                      │
│           │ Spawns Agents                                       │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Agent Pool (Docker Containers)                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │   │
│  │  │ Agent 1  │  │ Agent 2  │  │ Agent N  │             │   │
│  │  │ (skill:  │  │ (skill:  │  │ (skill:  │             │   │
│  │  │ browser) │  │  redis)  │  │workflow) │             │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘             │   │
│  └───────│─────────────│─────────────│───────────────────┘   │
│          │             │             │                         │
│          │ Token Auth  │ Token Auth  │ Token Auth             │
│          ▼             ▼             ▼                         │
├──────────────────────────────────────────────────────────────┤
│                    MCP Network (Isolated)                      │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Playwright  │  │ Redis Tools  │  │     N8N      │       │
│  │  MCP Server  │  │  MCP Server  │  │  MCP Server  │       │
│  │ (Port 8081)  │  │ (Port 8082)  │  │ (Port 8083)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│  ┌──────────────┐                                            │
│  │  Security    │                                            │
│  │  Scanner     │                                            │
│  │  MCP Server  │                                            │
│  │ (Port 8084)  │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CFN Network (172.30.0.0/16)                                  │
│  - Orchestrator                                              │
│  - Redis Coordinator                                         │
│  - Agent Containers                                          │
│  - Monitoring Stack (Prometheus, Grafana, Loki)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Bridge Connection
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ MCP Network (172.31.0.0/16 - Isolated)                      │
│  - MCP Playwright                                            │
│  - MCP Redis Tools                                           │
│  - MCP N8N                                                   │
│  - MCP Security Scanner                                      │
└─────────────────────────────────────────────────────────────┘
```

## MCP Server Specifications

### 1. Playwright MCP Server

**Purpose:** Browser automation, testing, screenshot capture

**Image:** `mcr.microsoft.com/playwright:v1.40.0-jammy`
**Port:** 8081
**Health Check:** `/health`

**Resource Limits:**
- Memory: 512MB (limit) / 256MB (reservation)
- CPU: 0.5 (limit) / 0.25 (reservation)

**Required Skills:**
- `browser-automation`
- `testing`
- `screenshot-capture`
- `accessibility-testing`

**Capabilities:**
- Browser automation (Chromium, Firefox, WebKit)
- Screenshot and PDF generation
- Page interaction and form filling
- Accessibility testing
- Performance metrics collection

**Environment Variables:**
```bash
MCP_SERVER_TYPE=playwright
MCP_PORT=8081
MCP_TOKEN_HEADER=X-MCP-Token
NODE_ENV=production
```

### 2. Redis Tools MCP Server

**Purpose:** Redis operations, cache management, data migration

**Image:** `redis:7-alpine`
**Port:** 8082
**Health Check:** `/health`

**Resource Limits:**
- Memory: 256MB (limit) / 128MB (reservation)
- CPU: 0.25 (limit) / 0.1 (reservation)

**Required Skills:**
- `redis-operations`
- `database-management`
- `caching`

**Capabilities:**
- Redis key-value operations
- Cache analysis and optimization
- Data migration utilities
- Performance monitoring
- Pub/sub messaging

**Environment Variables:**
```bash
MCP_SERVER_TYPE=redis-tools
MCP_PORT=8082
MCP_TOKEN_HEADER=X-MCP-Token
REDIS_COORDINATOR_URL=redis://redis-coordinator:6379
```

### 3. N8N Workflow Automation MCP Server

**Purpose:** Workflow automation, API integration, data pipelines

**Image:** `n8nio/n8n:latest`
**Port:** 8083 (mapped to internal 5678)
**Health Check:** `/healthz`

**Resource Limits:**
- Memory: 1024MB (limit) / 512MB (reservation)
- CPU: 0.75 (limit) / 0.5 (reservation)

**Required Skills:**
- `workflow-automation`
- `api-integration`
- `data-pipeline`

**Capabilities:**
- Visual workflow automation
- 300+ API integrations
- Data transformation
- Scheduled task execution
- Webhook handling

**Environment Variables:**
```bash
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
MCP_SERVER_TYPE=n8n
MCP_PORT=8083
MCP_TOKEN_HEADER=X-MCP-Token
WEBHOOK_URL=http://mcp-n8n:5678/
```

### 4. Security Scanner MCP Server

**Purpose:** Vulnerability scanning, dependency analysis, compliance checking

**Image:** `aquasec/trivy:latest`
**Port:** 8084
**Health Check:** `/health`

**Resource Limits:**
- Memory: 2048MB (limit) / 1024MB (reservation)
- CPU: 0.8 (limit) / 0.5 (reservation)

**Required Skills:**
- `security-auditing`
- `vulnerability-scanning`
- `compliance-checking`

**Capabilities:**
- Container image vulnerability scanning
- Dependency analysis (npm, pip, go mod, etc.)
- Code security audit
- Compliance checking (CIS, PCI-DSS)
- Threat modeling

**Environment Variables:**
```bash
MCP_SERVER_TYPE=security-scanner
MCP_PORT=8084
MCP_TOKEN_HEADER=X-MCP-Token
TRIVY_SEVERITY=HIGH,CRITICAL
```

## Authentication Flow

```
┌─────────────┐                    ┌─────────────────┐
│   Agent     │                    │ Token Manager   │
│ Container   │                    │   (Redis)       │
└──────┬──────┘                    └─────────┬───────┘
       │                                     │
       │ 1. Request Token                   │
       │    (Agent ID, Required Skills)     │
       ├────────────────────────────────────>│
       │                                     │
       │                          2. Generate│
       │                             Token   │
       │                                     │
       │ 3. Return Token                    │
       │<────────────────────────────────────┤
       │                                     │
       │                                     │
┌──────▼──────┐                    ┌─────────────────┐
│   Agent     │                    │   MCP Server    │
│ with Token  │                    │  (Playwright)   │
└──────┬──────┘                    └─────────┬───────┘
       │                                     │
       │ 4. API Request                     │
       │    + X-MCP-Token Header            │
       ├────────────────────────────────────>│
       │                                     │
       │                          5. Validate│
       │                             Token   │
       │                                     │
       │ 6. Execute Tool                    │
       │                                     │
       │ 7. Return Results                  │
       │<────────────────────────────────────┤
       │                                     │
       └─────────────────────────────────────┘
```

### Token Generation

Tokens are generated by the Agent Token Manager (`src/cli/agent-token-manager.js`):

```javascript
// Generate token for agent with specific skills
const token = await tokenManager.generateToken({
  agentId: 'agent-123',
  skills: ['browser-automation', 'testing'],
  expiresIn: 3600000 // 1 hour
});
```

### Token Validation

MCP servers validate tokens on each request:

1. Extract token from `X-MCP-Token` header
2. Validate token signature and expiration
3. Check if agent has required skills for MCP server
4. Execute request if authorized
5. Return 401 Unauthorized if validation fails

## Skill-Based Routing

Agents automatically connect to required MCP servers based on their skills.

### Skill-to-MCP Mapping

Defined in `config/mcp-servers.json`:

```json
{
  "skill_to_mcp_mapping": {
    "browser-automation": ["playwright"],
    "testing": ["playwright"],
    "screenshot-capture": ["playwright"],
    "redis-operations": ["redis-tools"],
    "database-management": ["redis-tools"],
    "caching": ["redis-tools"],
    "workflow-automation": ["n8n"],
    "api-integration": ["n8n"],
    "data-pipeline": ["n8n"],
    "security-auditing": ["security-scanner"],
    "vulnerability-scanning": ["security-scanner"],
    "compliance-checking": ["security-scanner"]
  }
}
```

### Routing Logic

```javascript
// Example: Agent with browser-automation skill
const agentSkills = ['browser-automation', 'screenshot-capture'];

// Determine required MCP servers
const mcpServers = agentSkills
  .flatMap(skill => skillToMcpMapping[skill] || [])
  .filter((v, i, a) => a.indexOf(v) === i); // unique

// Result: ['playwright']

// Generate tokens for required servers only
const tokens = await Promise.all(
  mcpServers.map(server =>
    tokenManager.generateToken({ agentId, server, skills: agentSkills })
  )
);
```

## Deployment Guide

### Prerequisites

- Docker 20.10+
- docker-compose 1.29+
- 8GB+ available RAM
- Network ports 8081-8084 available

### Step 1: Build Images

```bash
./scripts/docker-build-mcp.sh
```

This script:
- Builds enhanced agent image with MCP clients
- Pulls base MCP server images
- Runs security scans with Trivy
- Tags images appropriately

### Step 2: Configure Environment

Create `.env` file:

```bash
# N8N Configuration
N8N_PASSWORD=your-secure-password

# Redis Configuration
REDIS_PASSWORD=your-redis-password

# Build Metadata
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VCS_REF=$(git rev-parse --short HEAD)
VERSION=4.1.0-mcp
```

### Step 3: Start Services

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# Or start MCP services only
docker-compose -f docker-compose.production.yml up -d \
  redis-coordinator \
  mcp-playwright \
  mcp-redis-tools \
  mcp-n8n \
  mcp-security-scanner
```

### Step 4: Verify Health

```bash
# Run comprehensive health checks
./scripts/docker-test-mcp.sh

# Or check individual services
docker-compose -f docker-compose.production.yml ps
docker logs cfn-mcp-playwright
docker logs cfn-mcp-redis-tools
docker logs cfn-mcp-n8n
docker logs cfn-mcp-security-scanner
```

### Step 5: Test Agent Connectivity

```bash
# Spawn test agent with MCP access
npx claude-flow-novice agent test-agent \
  --skills browser-automation,testing \
  --mcp-enabled \
  --context "Test Playwright MCP connectivity"
```

## Testing and Validation

### Automated Test Suite

Run the comprehensive test suite:

```bash
./scripts/docker-test-mcp.sh
```

**Tests Include:**
1. MCP configuration validation (JSON syntax)
2. Docker Compose syntax validation
3. Container startup verification
4. Health check for each MCP server
5. Network connectivity tests
6. Volume mount verification
7. Redis coordinator connectivity
8. Container resource limit verification
9. Environment variable validation
10. Token authentication flow

### Manual Testing

**Test Playwright MCP:**
```bash
# From agent container
curl -H "X-MCP-Token: $TOKEN" \
  http://mcp-playwright:8081/health

# Start browser automation task
curl -X POST -H "X-MCP-Token: $TOKEN" \
  -d '{"url": "https://example.com", "action": "screenshot"}' \
  http://mcp-playwright:8081/api/screenshot
```

**Test Redis Tools MCP:**
```bash
curl -H "X-MCP-Token: $TOKEN" \
  http://mcp-redis-tools:8082/health

curl -X POST -H "X-MCP-Token: $TOKEN" \
  -d '{"key": "test", "value": "hello"}' \
  http://mcp-redis-tools:8082/api/set
```

**Test N8N MCP:**
```bash
curl -H "X-MCP-Token: $TOKEN" \
  http://mcp-n8n:8083/healthz

# Access N8N UI (development only)
open http://localhost:8083
```

**Test Security Scanner MCP:**
```bash
curl -H "X-MCP-Token: $TOKEN" \
  http://mcp-security-scanner:8084/health

curl -X POST -H "X-MCP-Token: $TOKEN" \
  -d '{"image": "node:18-alpine"}' \
  http://mcp-security-scanner:8084/api/scan
```

## Troubleshooting

### Common Issues

#### 1. MCP Server Not Starting

**Symptoms:**
- Container exits immediately
- Health check fails

**Solutions:**
```bash
# Check container logs
docker logs cfn-mcp-playwright --tail 50

# Check resource availability
docker stats

# Verify volume mounts
docker inspect cfn-mcp-playwright | jq '.[0].Mounts'

# Restart container
docker-compose -f docker-compose.production.yml restart mcp-playwright
```

#### 2. Authentication Failures

**Symptoms:**
- 401 Unauthorized errors
- Token validation failures

**Solutions:**
```bash
# Verify token generation
node src/cli/agent-token-manager.js generate \
  --agent-id test-agent \
  --skills browser-automation

# Check token expiration
# Tokens expire after 1 hour by default

# Verify MCP_TOKEN_HEADER environment variable
docker exec cfn-mcp-playwright env | grep MCP_TOKEN_HEADER
```

#### 3. Network Connectivity Issues

**Symptoms:**
- Connection refused errors
- Timeout errors

**Solutions:**
```bash
# Verify networks exist
docker network ls | grep mcp

# Check network connectivity
docker exec cfn-orchestrator ping -c 3 mcp-playwright

# Inspect network configuration
docker network inspect mcp-isolated

# Verify port mappings
docker-compose -f docker-compose.production.yml ps
```

#### 4. Resource Limit Exceeded

**Symptoms:**
- Container OOM killed
- Slow performance

**Solutions:**
```bash
# Check current resource usage
docker stats cfn-mcp-playwright

# Increase memory limit in docker-compose.production.yml
# Under mcp-playwright service:
deploy:
  resources:
    limits:
      memory: 1024M  # Increase from 512M

# Restart service
docker-compose -f docker-compose.production.yml up -d mcp-playwright
```

#### 5. Health Check Failures

**Symptoms:**
- Container marked unhealthy
- Services restarting frequently

**Solutions:**
```bash
# Check health check endpoint manually
docker exec cfn-mcp-playwright curl -f http://localhost:8081/health

# Increase health check timeout in docker-compose.production.yml
healthcheck:
  timeout: 20s  # Increase from 10s
  start_period: 60s  # Increase from 30s

# Disable health check temporarily for debugging
# Comment out healthcheck section in docker-compose.production.yml
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug environment variables
docker-compose -f docker-compose.production.yml \
  -e DEBUG=* \
  -e LOG_LEVEL=debug \
  up mcp-playwright
```

### Health Check Script

Run MCP health checks from agent containers:

```bash
# Inside agent container
/app/scripts/mcp-health-check.sh

# With custom config
CONFIG_FILE=/custom/path/mcp-servers.json \
MCP_TOKEN=$TOKEN \
/app/scripts/mcp-health-check.sh
```

### Monitoring

Access monitoring dashboards:

```bash
# Prometheus metrics
open http://localhost:9090

# Grafana dashboards
open http://localhost:3001

# View MCP metrics
curl http://localhost:9090/api/v1/query?query=mcp_server_requests_total
```

---

## Additional Resources

- **Main Docker Documentation:** `/docs/DOCKER_PRODUCTION_IMPLEMENTATION_COMPLETE.md`
- **MCP Configuration:** `/config/mcp-servers.json`
- **Token Manager:** `/src/cli/agent-token-manager.js`
- **Build Script:** `/scripts/docker-build-mcp.sh`
- **Test Script:** `/scripts/docker-test-mcp.sh`
- **Health Check:** `/scripts/mcp-health-check.sh`

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review container logs: `docker logs <container-name>`
3. Run diagnostic script: `./scripts/docker-test-mcp.sh`
4. Consult main Docker documentation

---

**Document Version:** 1.0.0
**MCP Integration Version:** 4.1.0
**Last Updated:** November 9, 2025
