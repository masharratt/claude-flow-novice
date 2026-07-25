# MCP Multi-Agent Docker Configuration Research

**Research Date:** 2025-10-29
**Purpose:** Investigate if MCP servers can have different configurations per server for deploying Claude Code agents in separate Docker containers

---

## Executive Summary

**✅ YES - Multiple MCP configurations per server/agent are fully supported**

Key findings:
1. **Scope-based configuration** - MCP supports local, project, and global scopes
2. **Per-agent environment variables** - Each agent can have unique `AGENT_NAME` and environment settings
3. **Docker MCP Gateway** - Unified management for multiple MCP servers with different configurations
4. **MCP Toolkit** - 200+ pre-built containerized MCP servers with one-click deployment

---

## Configuration Scope Levels

### 1. Local Scope (Agent-Specific)
**File:** `.claude/settings.json` (project-specific user settings)
**Purpose:** Private to individual agent, only accessible within project directory
**Use Case:**
- Personal development servers
- Experimental configurations
- Sensitive credentials per agent

```json
{
  "mcpServers": {
    "agent-1-n8n": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
        "-e", "AGENT_NAME=agent-1",
        "-e", "N8N_API_URL=https://agent1.n8n.example.com",
        "-e", "N8N_API_KEY=${AGENT_1_N8N_KEY}",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

### 2. Project Scope (Shared Configuration)
**File:** `.mcp.json` (project root)
**Purpose:** Team collaboration, version-controlled shared configurations
**Use Case:**
- Shared MCP servers across team
- Standardized development environments
- Docker container coordination

```json
{
  "mcpServers": {
    "shared-n8n": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
        "-e", "N8N_API_URL=https://shared.n8n.example.com",
        "-e", "N8N_API_KEY=${SHARED_N8N_KEY}",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

### 3. Global Scope (System-Wide)
**File:** System-level Claude Desktop config
**Purpose:** User-wide MCP servers across all projects
**Use Case:**
- Personal utility servers
- Authentication services
- Cross-project tools

---

## Per-Agent Configuration Pattern

### Docker Container Isolation

**Each agent in separate container with unique configuration:**

```json
{
  "mcpServers": {
    "marketing-agent-n8n": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-marketing-agent",
        "-e", "AGENT_NAME=marketing-agent",
        "-e", "N8N_API_URL=https://marketing.n8n.dailyautomations.com",
        "-e", "N8N_API_KEY=${MARKETING_N8N_KEY}",
        "-e", "LOG_LEVEL=info",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    },
    "sales-agent-n8n": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-sales-agent",
        "-e", "AGENT_NAME=sales-agent",
        "-e", "N8N_API_URL=https://sales.n8n.dailyautomations.com",
        "-e", "N8N_API_KEY=${SALES_N8N_KEY}",
        "-e", "LOG_LEVEL=warn",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    },
    "devops-agent-n8n": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-devops-agent",
        "-e", "AGENT_NAME=devops-agent",
        "-e", "N8N_API_URL=https://devops.n8n.dailyautomations.com",
        "-e", "N8N_API_KEY=${DEVOPS_N8N_KEY}",
        "-e", "LOG_LEVEL=debug",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

### Key Benefits of Per-Agent Containers

1. **Environment Isolation** - Each agent has isolated environment variables
2. **Security** - Separate API keys, credentials, network access per agent
3. **Resource Control** - Per-container CPU/memory limits
4. **Minimal Privilege** - Compromised tool can't access other agents
5. **Independent Configuration** - Different n8n instances, log levels, timeout settings

---

## Docker MCP Gateway Architecture

### Problem Solved
**Traditional Setup:** X servers × Y clients = X × Y configuration entries
**MCP Gateway:** Y entries (one per client) + centralized server management

### Gateway Benefits

```bash
# Single connection point for multiple MCP servers
docker run -p 8000:8000 docker/mcp-gateway:latest

# Gateway exposes multiple servers over HTTP SSE or STDIO
# Clients connect to gateway URL instead of individual servers
# Gateway manages server lifecycle, catalog, credentials
```

**Advantages:**
- ✅ Unified endpoint for 220+ pre-built MCP servers
- ✅ Automatic credential handling
- ✅ One-click deployment in Docker Desktop
- ✅ Cross-platform support (Mac, Windows, Linux)
- ✅ No dependency conflicts between servers

### MCP Catalog Integration

**Docker MCP Toolkit Features:**
- 200+ pre-built containerized MCP servers
- One-click deployment from catalog
- Automatic dependency resolution
- Secure credential injection
- Consistent workflow across platforms

**Example Catalog Servers:**
- Filesystem MCP
- Brave Search MCP
- PostgreSQL MCP
- n8n MCP
- Redis MCP
- Custom MCP servers

---

## Recommended Architecture for CFN Marketing Epic

### Phase 0: n8n-mcp Setup (Multiple Agents)

**Configuration Strategy:**

1. **Shared n8n MCP Server** (`.mcp.json` - project scope)
   - All marketing agents connect to single n8n instance
   - Shared credentials from `.env`
   - Centralized workflow management

2. **Per-Agent n8n MCP Servers** (`.claude/settings.json` - local scope)
   - 57 marketing agents each with dedicated n8n workflow instance
   - Agent-specific credentials: `AGENT_{ID}_N8N_KEY`
   - Isolated execution environments

### Deployment Pattern

**Option 1: Shared MCP Server (Recommended for MVP)**

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "-e", "N8N_API_URL=https://n8n.dailyautomations.com",
        "-e", "N8N_API_KEY=${N8N_API_KEY}",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

**Benefits:**
- Simple setup (single container)
- Centralized n8n workflow management
- Shared template library (2,709 workflows)
- Cost-effective (one n8n instance)

**Option 2: Per-Agent MCP Servers (Enterprise Scale)**

```bash
# Agent 1: Email Campaign Specialist
.claude/agents/marketing/email-campaigns/settings.json:
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-email-campaigns",
        "-e", "AGENT_NAME=email-campaigns",
        "-e", "N8N_API_URL=https://n8n.dailyautomations.com",
        "-e", "N8N_API_KEY=${EMAIL_CAMPAIGNS_N8N_KEY}",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}

# Agent 2: Social Publishing Specialist
.claude/agents/marketing/social-publishing/settings.json:
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-social-publishing",
        "-e", "AGENT_NAME=social-publishing",
        "-e", "N8N_API_URL=https://n8n.dailyautomations.com",
        "-e", "N8N_API_KEY=${SOCIAL_PUBLISHING_N8N_KEY}",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```

**Benefits:**
- Complete agent isolation
- Independent workflow access control
- Separate rate limiting per agent
- Audit trail per agent (`AGENT_NAME` tracking)

---

## Implementation Recommendations

### Phase 0 Sprint 0.1 Updates

**Current Deliverable:**
```
"n8n-mcp installed (dual setup: npx + docker)"
```

**Enhanced Deliverable:**
```
"n8n-mcp installed with multi-agent configuration support:
 - Shared MCP server for MVP (single container)
 - Per-agent MCP server architecture designed
 - Agent isolation via AGENT_NAME environment variable
 - Docker MCP Gateway integration (optional enhancement)"
```

**Acceptance Criteria Addition:**
```
- Multi-agent configuration pattern documented
- AGENT_NAME environment variable tested
- Per-agent credentials isolated in .env
- Docker container naming convention established (mcp-{agent-name})
```

### Environment Variable Structure

**`.env` file pattern:**
```bash
# Shared n8n credentials (MVP)
N8N_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Per-agent credentials (enterprise)
EMAIL_CAMPAIGNS_N8N_KEY=agent_specific_key_1
SOCIAL_PUBLISHING_N8N_KEY=agent_specific_key_2
ANALYTICS_DATA_N8N_KEY=agent_specific_key_3
CRM_CONTACTS_N8N_KEY=agent_specific_key_4
# ... (57 total marketing agents)
```

### Docker MCP Gateway Integration (Optional)

**Benefits for 57 marketing agents:**
- Single gateway endpoint instead of 57 individual MCP server configurations
- Centralized credential management
- Automatic server lifecycle management
- Catalog-based server discovery

**Setup:**
```bash
# Install Docker MCP Gateway
docker plugin install docker/mcp-gateway

# Configure gateway endpoint
docker mcp-gateway start --catalog marketing-mcp-catalog.json

# Agents connect to gateway instead of individual MCP servers
```

---

## Security Considerations

### Container Isolation

**Per-agent containers provide:**
1. **Network isolation** - Separate network namespaces
2. **Filesystem isolation** - No shared volumes between agents
3. **Resource limits** - CPU/memory quotas per agent
4. **Credential isolation** - Each container only sees its own environment variables
5. **Minimal privileges** - Run with `--rm` (auto-cleanup), `--init` (proper signal handling)

### Credential Management

**Best Practices:**
```bash
# Never hardcode in configuration
❌ "N8N_API_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Use environment variable references
✅ "N8N_API_KEY": "${N8N_API_KEY}"

# Store in .env file (gitignored)
✅ .env:
   N8N_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## References

### Documentation
- [Docker MCP Integration Guide](https://www.docker.com/blog/build-to-prod-mcp-servers-with-docker/)
- [MCP Gateway Architecture](https://github.com/docker/mcp-gateway)
- [Claude Code MCP Setup](https://docs.claude.com/en/docs/claude-code/mcp)
- [Docker MCP Toolkit](https://www.docker.com/blog/add-mcp-servers-to-claude-code-with-mcp-toolkit/)

### Implementation Examples
- [n8n MCP Docker Setup](https://www.ajeetraina.com/running-docker-mcp-gateway-in-a-docker-container/)
- [Multi-Agent MCP Configuration](https://ai-claude.net/mcp-docker-integration/)

---

## Next Steps

### Immediate Actions (Phase 0 Sprint 0.1)

1. ✅ **Document multi-agent configuration pattern** - This document
2. **Update epic configuration** - Add per-agent MCP server architecture to Phase 0
3. **Test AGENT_NAME isolation** - Verify environment variable separation
4. **Design credential structure** - Plan `.env` file organization for 57 agents

### Future Enhancements (Post-Phase 0)

1. **Docker MCP Gateway integration** - Simplify management of 57 agent MCP servers
2. **MCP Catalog customization** - Build marketing-specific MCP server catalog
3. **Per-agent resource monitoring** - Track container CPU/memory usage per agent
4. **Automated credential rotation** - Implement API key rotation for 57 agents

---

## Conclusion

**Multi-agent MCP server configurations are fully supported and recommended for CFN marketing epic.**

**Recommended Path:**
- **Phase 0-1 (MVP):** Shared MCP server (single container, simple setup)
- **Phase 2-3 (Scale):** Per-agent MCP servers (57 containers, isolated credentials)
- **Phase 4-5 (Enterprise):** Docker MCP Gateway (unified management, catalog-based)

**Key Insight:** Start simple with shared MCP server, scale to per-agent containers as needed. Docker's MCP Gateway provides enterprise-grade management for large-scale deployments.
