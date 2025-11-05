# Containerized Agent MCP Integration Handoff Document

**Handoff Date:** 2025-11-04
**Priority:** High
**Status:** Architecture Gap Identified, Solution Plan Ready
**Handoff To:** Docker/MCP Integration Team

---

## 🎯 Executive Summary

We have successfully proven individual components work (Playwright in containers, MCP servers, agent-MCP communication) but identified a **critical architectural gap**: we cannot yet spawn agents inside Docker containers with MCP access.

**Current Status:** 75% infrastructure validated, 25% missing core containerized agent capability.

---

## 📊 Current Achievements vs. Missing Components

### ✅ **What's Working (75% Complete)**

| Component | Status | Evidence | Location |
|-----------|--------|----------|----------|
| Playwright in Docker | ✅ Working | Screenshots generated | `claude-flow-novice:playwright-working` |
| MCP Server in Docker | ✅ Working | JSON-RPC 2.0 server | `docker/scripts/playwright-mcp-server.js` |
| Agent-MCP Communication | ✅ Working | Agent accessed MCP tools | Chat-based agent testing |
| Screenshot Generation | ✅ Working | 14 files, 420KB total | `/screenshots/` directory |
| Memory Leak Prevention | ✅ Working | 2GB container limits | Docker configuration |
| File Volume Mounting | ✅ Working | Host directory access | Docker volume mounts |

### ❌ **What's Missing (25% Gap)**

| Missing Component | Critical Impact | Current Workaround |
|-------------------|----------------|-------------------|
| Docker Agent Spawning | ❌ **BLOCKS PRODUCTION** | Manual container only |
| Containerized Agent Runtime | ❌ **LIMITS SCALING** | Host-based agents only |
| Cross-Container MCP Access | ❌ **REDUCES FLEXIBILITY** | Chat-based only |
| Production Orchestration | ❌ **NO DEPLOYMENT** | Manual processes |

---

## 🔍 The Core Problem

### **Current Architecture (Limited):**
```
This Chat → Agent → MCP Tools → Docker Container → Playwright
```

### **Target Architecture (Missing):**
```
CLI Spawner → Docker Container (Agent) → MCP Tools → Docker Container → Playwright
```

**The agent itself needs to run inside Docker, not just the tools.**

---

## 🛠️ Solution Architecture

### **Phase 1: CLI Enhancement (1-2 weeks)**
**File:** `src/cli/index.js`

**Required Changes:**
```bash
# Add new CLI flags:
npx claude-flow-novice agent-spawn \
  --docker \                    # Spawn agent in container
  --agent-type frontend-engineer \
  --container claude-flow-novice:playwright-working \
  --memory 2g \                 # Container memory limit
  --mcp-servers playwright \    # MCP tools to load
  --name agent-fe-001          # Container name
```

**Implementation:**
- Add `--docker` flag handling
- Implement container spawning logic
- Create agent-to-container communication bridge
- Add MCP server discovery for containers

### **Phase 2: Container Agent Runtime (1-2 weeks)**
**Files:**
- `docker/Dockerfile.agent-containerized`
- `src/agent/containerized-agent.js`

**Key Components:**
```dockerfile
FROM claude-flow-novice:playwright-working
ENV AGENT_MODE=containerized
ENV MCP_SERVERS=playwright,n8n-mcp
COPY src/agent/containerized-agent.js /app/
ENTRYPOINT ["node", "/app/containerized-agent.js"]
```

```javascript
// Container agent that can access MCP tools from within container
class ContainerizedAgent {
  async start() {
    // Initialize MCP connections
    // Load agent capabilities
    // Start execution loop
    // Report to coordinator via Redis
  }
}
```

### **Phase 3: Container MCP Integration (2-3 weeks)**
**File:** `.claude/settings.containerized.json`

**Cross-Container MCP Configuration:**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--network", "container:${CONTAINER_ID}",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "claude-flow-novice:playwright-working",
        "node", "/app/scripts/container-mcp-server.js"
      ]
    }
  }
}
```

### **Phase 4: Production Orchestration (2-3 weeks)**
**File:** `docker-compose.agents.yml`

**Multi-Container Deployment:**
```yaml
services:
  agent-coordinator:
    image: claude-flow-novice:coordinator

  agent-frontend:
    image: claude-flow-novice:agent-containerized
    environment:
      - AGENT_TYPE=react-frontend-engineer
      - MCP_SERVERS=playwright,browser-tools

  mcp-playwright:
    image: claude-flow-novice:playwright-working
    command: ["node", "/app/scripts/mcp-server.js"]

  redis:
    image: redis:7-alpine
```

---

## 📁 Critical Files & Locations

### **Ready for Implementation:**
- `docker/Dockerfile.playwright-working` - ✅ Base image ready
- `docker/scripts/playwright-mcp-server.js` - ✅ MCP server implemented
- `docker/scripts/monitor-wrapper.sh` - ✅ Memory monitoring ready
- `.claude/settings.json` - ✅ MCP configuration template
- `screenshots/` - ✅ File mounting working

### **Files Needing Creation:**
- `src/cli/index.js` - Add Docker agent spawning
- `docker/Dockerfile.agent-containerized` - Containerized agent image
- `src/agent/containerized-agent.js` - Agent runtime for containers
- `docker-compose.agents.yml` - Production orchestration
- `.claude/settings.containerized.json` - Container MCP config

---

## 🎯 Success Criteria

### **Phase 1 Success Metrics:**
```bash
# This command must work:
npx claude-flow-novice agent-spawn --docker --agent-type react-frontend-engineer

# Verification:
docker ps | grep "claude-flow-novice-agent"  # Container running
docker logs <container-id>                  # Agent logs
```

### **Phase 2 Success Metrics:**
- Agent container starts successfully
- Agent can access MCP tools from within container
- Playwright automation works via agent-MCP workflow
- Screenshots generated from containerized agent

### **Phase 3 Success Metrics:**
- Multiple agent containers run simultaneously
- MCP servers scale independently
- No WSL2 memory leaks or crashes
- Redis coordination working between containers

### **Phase 4 Success Metrics:**
- Production-ready deployment with Docker Compose
- Monitoring and orchestration functional
- Scalable multi-agent workflows
- Resource usage within limits

---

## 🚨 Known Issues & Risks

### **Technical Risks:**
1. **Cross-Container Communication:** Docker networking complexity
2. **MCP Protocol Overhead:** Performance impact of container boundaries
3. **Resource Contention:** Multiple containers sharing host resources
4. **Agent State Management:** Persisting agent state across container restarts

### **Mitigation Strategies:**
1. **Networking:** Use Docker networks and proper service discovery
2. **Performance:** Benchmark MCP overhead, optimize critical paths
3. **Resources:** Implement per-container memory/CPU limits
4. **State Management:** Redis-based state persistence

---

## 📅 Implementation Timeline

| Phase | Duration | Start Date | Target Complete | Dependencies |
|-------|----------|------------|----------------|--------------|
| CLI Enhancement | 1-2 weeks | Week 1 | Week 2 | Current codebase |
| Container Agent Runtime | 1-2 weeks | Week 2 | Week 3 | CLI enhancement |
| MCP Integration | 2-3 weeks | Week 3 | Week 6 | Container runtime |
| Production Orchestration | 2-3 weeks | Week 6 | Week 9 | MCP integration |

**Total Estimated:** 7-9 weeks for complete implementation

---

## 🏆 Expected Outcomes

### **Immediate Benefits:**
- True containerized agent deployment
- Production-ready multi-agent architecture
- Complete memory leak prevention
- Scalable agent orchestration

### **Long-term Benefits:**
- Enterprise-grade agent deployment
- Cloud-native agent architecture
- Horizontal scaling capabilities
- Robust production monitoring

---

## 📞 Handoff Contacts

**Primary:** Docker/MCP Integration Team
**Secondary:** CLI Tool Development Team
**Stakeholder:** Product Architecture Team

**Dependencies:**
- CLI tool development resources
- Docker expertise
- MCP protocol knowledge
- Production deployment experience

---

## 🎯 Next Steps

1. **Approve Implementation Plan:** Review and prioritize phases
2. **Allocate Development Resources:** Assign team members to phases
3. **Set Up Development Environment:** Prepare testing infrastructure
4. **Begin Phase 1:** Start with CLI Docker agent spawning enhancement

**This handoff provides everything needed to bridge the 25% architectural gap and achieve true containerized agent MCP integration.**