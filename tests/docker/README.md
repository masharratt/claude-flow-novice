# Docker Agent Deployment - Proof of Concept

**Status:** Ready for Testing
**Purpose:** Validate Docker + Claude agent interaction pattern
**Date Created:** 2025-10-30

---

## Overview

This POC tests whether Claude Flow Novice agents can be deployed and executed within Docker containers. This is a critical validation for the hybrid architecture strategy (Claude Max coordinators + Z.ai workers in Docker).

**Key Question:** Can we package, deploy, and interact with agents via Docker?

---

## Quick Start

### Prerequisites

1. **Docker installed and running**
   ```bash
   docker --version  # Should be 20.x or higher
   ```

2. **Redis running on localhost**
   ```bash
   redis-cli ping  # Should return "PONG"
   # If not running: redis-server
   ```

3. **Z.ai API key set**
   ```bash
   export ZAI_API_KEY="your-zai-api-key"
   # OR: copy .env.poc.example to .env.poc and fill in your key
   # Z.ai provides 95-98% cost savings vs Anthropic API
   ```

4. **Claude Flow Novice project cloned**
   ```bash
   cd /path/to/claude-flow-novice
   ```

### Run the POC

```bash
# Execute the test script
./tests/docker-deployment/test-docker-agent-interaction.sh
```

**Expected Output:**
- 7 test results (image build, runtime, agent execution, tools, Redis, output, coordination)
- Final result: PASSED or FAILED
- Detailed logs saved to `/tmp/docker-agent-logs-{task-id}.txt`

**Duration:** ~2-3 minutes (includes Docker build, agent execution, cleanup)

---

## Files in This Directory

| File | Purpose | Size |
|------|---------|------|
| `Dockerfile.agent-poc` | Minimal Docker image for agent execution | 60 lines |
| `test-docker-agent.md` | Simple test agent definition | 62 lines |
| `test-docker-agent-interaction.sh` | Automated test script | 274 lines |
| `POC_RESULTS.md` | Results documentation template | 398 lines |
| `.env.poc.example` | Environment variables example | 34 lines |
| `README.md` | This file | You are here |

**Total:** ~830 lines of code/documentation

---

## What Gets Tested

### 1. Docker Image Build
- ✅ Image builds without errors
- ✅ Image size < 500MB (target)
- ✅ Dependencies installed correctly

### 2. Container Runtime
- ✅ Container starts successfully
- ✅ Non-root user can execute tasks
- ✅ Health check passes
- ✅ Container exits cleanly

### 3. Agent Execution
- ✅ Agent receives task from CLI
- ✅ Agent executes task (creates test file)
- ✅ Agent reports confidence score
- ✅ Agent completes within timeout

### 4. Tool Access
- ✅ Bash tool works (file creation)
- ✅ Redis CLI accessible
- ✅ /tmp directory writable

### 5. Redis Coordination
- ✅ Agent signals completion
- ✅ Agent reports confidence to Redis
- ✅ Signals visible from host

### 6. Output & Logging
- ✅ Agent output captured
- ✅ Confidence score visible
- ✅ Logs extractable

---

## Architecture

### POC Design

```
┌─────────────────────────────────────────────┐
│ Host Machine                                │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Redis (localhost:6379)               │  │
│  │ - Coordination signals               │  │
│  │ - Confidence scores                  │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Docker Container (cfn-agent-poc)     │  │
│  │                                      │  │
│  │  ┌────────────────────────────────┐ │  │
│  │  │ Node.js 20 (Alpine)            │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ Claude Flow Novice (npm)       │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ Agent: test-docker-agent       │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ Tools: Bash, Write, Redis CLI  │ │  │
│  │  ├────────────────────────────────┤ │  │
│  │  │ User: cfnuser (non-root)       │ │  │
│  │  └────────────────────────────────┘ │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ Test Script                          │  │
│  │ - Builds image                       │  │
│  │ - Runs container                     │  │
│  │ - Verifies results                   │  │
│  │ - Cleans up                          │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Communication Flow

1. **Test Script** → Builds Docker image
2. **Test Script** → Runs container with CLI spawn command
3. **Container** → Agent executor spawns `test-docker-agent`
4. **Agent** → Calls Z.ai API (via ZAI_API_KEY and ZAI_BASE_URL)
5. **Agent** → Uses Bash tool to create `/tmp/docker-test.txt`
6. **Agent** → Signals completion to Redis (via Redis CLI)
7. **Agent** → Reports confidence score to Redis
8. **Container** → Exits with code 0 (if successful)
9. **Test Script** → Extracts logs from container
10. **Test Script** → Verifies Redis signals
11. **Test Script** → Reports results

---

## Customization

### Change Agent Behavior

Edit `test-docker-agent.md` to:
- Test different tools (Grep, Glob, TodoWrite)
- Create multiple files
- Perform more complex operations
- Test error handling

### Modify Docker Image

Edit `Dockerfile.agent-poc` to:
- Change base image (e.g., debian-slim)
- Add additional packages
- Configure resource limits
- Implement multi-stage build

### Adjust Test Parameters

Edit `test-docker-agent-interaction.sh` to:
- Change timeout values
- Add more test cases
- Modify Redis key patterns
- Adjust log verbosity

---

## Troubleshooting

### Issue: Docker build fails with "npm install" error

**Solution:**
```bash
# Clear npm cache and rebuild
docker builder prune -a
docker build --no-cache -f tests/docker-deployment/Dockerfile.agent-poc -t cfn-agent-poc:latest .
```

### Issue: Container cannot access Redis

**Symptom:** "Could not connect to Redis at localhost:6379"

**Solution 1:** Use `--network host` (POC approach)
```bash
docker run --network host ...
```

**Solution 2:** Use host.docker.internal (Mac/Windows)
```bash
docker run -e REDIS_HOST=host.docker.internal ...
```

**Solution 3:** Run Redis in container with custom network (production approach)
```bash
docker network create cfn-network
docker run --name cfn-redis --network cfn-network redis:alpine
docker run --name cfn-agent --network cfn-network -e REDIS_HOST=cfn-redis ...
```

### Issue: Agent hangs indefinitely

**Symptom:** Container runs for >2 minutes without completing

**Possible Causes:**
1. Z.ai API key not set correctly (ZAI_API_KEY)
2. Z.ai endpoint unreachable (check ZAI_BASE_URL)
3. Agent waiting for user input (shouldn't happen)
4. Infinite loop in agent logic
5. Redis BLPOP blocking without wake signal

**Debug Steps:**
```bash
# Check container logs
docker logs cfn-agent-test-XXXX

# Inspect container environment (verify Z.ai config)
docker inspect cfn-agent-test-XXXX | grep -A 10 Env

# Check Redis keys
redis-cli keys "*docker-test*"

# Force stop container
docker stop cfn-agent-test-XXXX
```

### Issue: "Permission denied" in container

**Symptom:** "bash: /tmp/docker-test.txt: Permission denied"

**Solution:** Verify /tmp permissions in Dockerfile
```dockerfile
RUN mkdir -p /tmp && chmod 1777 /tmp
```

### Issue: Image size exceeds 500MB

**Symptom:** Image size is 600MB+

**Solutions:**
1. Implement multi-stage build (separate builder stage)
2. Use alpine variants of packages
3. Remove build tools after npm install
4. Use `.dockerignore` to exclude unnecessary files

**Example `.dockerignore`:**
```
node_modules
tests
legacy
docs
planning
*.md
.git
```

---

## Next Steps After POC

### If POC Passes (all 6 tests successful)

1. **Multi-Stage Dockerfile**
   - Create optimized production Dockerfile
   - Target size: <200MB (with multi-stage)

2. **Docker Compose**
   - Define multi-container setup (agent + Redis + coordinator)
   - Implement custom networks and volumes

3. **Security Hardening**
   - Run security scans (Trivy, Docker Scout)
   - Implement read-only filesystem
   - Add resource limits

4. **CI/CD Integration**
   - Automate builds on git push
   - Implement automated testing
   - Push to container registry

5. **Production Deployment**
   - Deploy to Kubernetes or Docker Swarm
   - Implement load balancing
   - Set up monitoring and logging

### If POC Fails (major blockers)

1. **Analyze Root Cause**
   - Review logs in `/tmp/docker-agent-logs-*.txt`
   - Check `POC_RESULTS.md` for error details
   - Identify specific failure points

2. **Consider Alternatives**
   - VM-based deployment (if Docker adds too much complexity)
   - Serverless functions (Lambda, Cloud Functions)
   - Process-based isolation (systemd, supervisord)
   - Hybrid approach (coordinators on host, workers in containers)

3. **Iterate on Blockers**
   - Fix critical issues one at a time
   - Re-run POC after each fix
   - Document workarounds

---

## Performance Expectations

| Metric | Target | Acceptable | Concern |
|--------|--------|------------|---------|
| Image Size | <500MB | <800MB | >1GB |
| Build Time | <5 min | <10 min | >15 min |
| Container Startup | <10s | <30s | >60s |
| Agent Execution | <60s | <120s | >180s |
| Total Test Time | <3 min | <5 min | >10 min |

---

## Security Considerations

### POC Simplifications (NOT production-safe)

- ⚠️ Using `--network host` (bypasses Docker networking isolation)
- ⚠️ API key passed via environment variable (visible in `docker inspect`)
- ⚠️ No TLS encryption for Redis connections
- ⚠️ No resource limits (CPU, memory)
- ⚠️ No container scanning (vulnerabilities not checked)

### Production Requirements

- ✅ Custom Docker network with service isolation
- ✅ Secrets management (Vault, AWS Secrets Manager, Docker Secrets)
- ✅ TLS encryption for all service communication
- ✅ Resource limits (--cpus, --memory flags)
- ✅ Security scanning integrated into CI/CD
- ✅ Read-only root filesystem with explicit RW volumes
- ✅ Non-root user (already implemented)
- ✅ Minimal base image (already using Alpine)

---

## Cost Analysis

### POC Costs (minimal)

- Docker CE (free)
- Redis (free, self-hosted)
- Local compute (your machine)
- API calls to Z.ai (~$0.001 per test run with haiku - 95% cheaper than Anthropic)

**Total POC Cost:** ~$0.005-0.01 for testing (Z.ai pricing)

### Production Costs (estimated)

**Compute:**
- Container overhead: ~50-100MB RAM, 0.1 CPU per agent
- Z.ai workers: $0.50/1M tokens (in Docker) - 95-98% cost savings
- Claude Max coordinator: $3-15/1M tokens (on host, if using hybrid architecture)

**Infrastructure:**
- Container registry: ~$5-10/month (Docker Hub Pro, ECR)
- Load balancer: ~$20/month (if scaling)
- Persistent storage: ~$0.10/GB/month

**Total Estimated Savings:**
- Without Docker + Z.ai: 100% Anthropic API ($3-15/1M tokens)
- With Docker + Z.ai: ~95-98% cost savings ($0.50/1M tokens)

**Break-even:** If running >1000 agent tasks/month, Docker deployment is cost-effective

---

## Additional Resources

### Documentation

- **Planning:** `/planning/docker/HYBRID_FROM_START_IMPLEMENTATION_PLAN.md`
- **Analysis:** `/planning/docker/HYBRID_COORDINATOR_WORKERS_ANALYSIS.md`
- **Strategy:** `/planning/docker/MULTI_SUBSCRIPTION_STRATEGY.md`

### Agent Guides

- **Docker Specialist:** `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`
- **Agent Creation:** `.claude/agents/CLAUDE.md`

### Skills

- **Redis Coordination:** `.claude/skills/cfn-redis-coordination/SKILL.md`
- **Agent Spawning:** `.claude/skills/cfn-agent-spawning/SKILL.md`

### Docker Resources

- **Best Practices:** https://docs.docker.com/develop/dev-best-practices/
- **Multi-Stage Builds:** https://docs.docker.com/build/building/multi-stage/
- **Security Scanning:** https://docs.docker.com/scout/

---

## Support

### Getting Help

1. Check this README for troubleshooting steps
2. Review `POC_RESULTS.md` for detailed findings
3. Examine logs in `/tmp/docker-agent-logs-*.txt`
4. Check existing issues in GitHub repository
5. Open new issue with POC results attached

### Reporting Issues

When reporting POC failures, include:
- Full output of `test-docker-agent-interaction.sh`
- Contents of `/tmp/docker-agent-logs-*.txt`
- Docker version (`docker --version`)
- Redis version (`redis-cli --version`)
- OS and architecture
- ZAI_API_KEY status (set/not set, don't include actual key)
- ZAI_BASE_URL value

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-30
**Maintained By:** Docker Specialist Agent
**Questions?** Review planning documents or open an issue
