# CFN Container-Based Monitoring Dashboard Task Specification

**Task ID:** container-monitoring-dashboard-mvp
**Deployment Method:** CONTAINER-BASED (Mandatory)
**Priority:** HIGH

## Primary Objective

Deploy CFN team INSIDE Docker containers to build a monitoring dashboard that MONITORS THE CONTAINER TEAM building it and demonstrates full Docker CFN coordination capabilities.

## Success Criteria (Mandatory Validation Points)

### 1. Container Deployment Requirements ✅
- [ ] CFN orchestrator container deployed and running
- [ ] Agent containers spawned via Docker CFN coordination (not CLI)
- [ ] Redis container for container-to-container messaging
- [ ] All coordination happens between containers (no Main Chat spawning)

### 2. Coordination Pattern Requirements ✅
- [ ] Redis BLPOP/LP messaging between containers
- [ ] Container lifecycle management via orchestration
- [ ] Agent spawning coordinated through Redis pub/sub
- [ ] Task context passed via Redis Hash storage

### 3. Meta-Monitoring Requirements ✅
- [ ] Dashboard monitors the containers building it
- [ ] Real-time display of container team activity
- [ ] Agent lifecycle tracking (spawn→execute→cleanup)
- [ ] Resource usage monitoring of builder containers

### 4. Infrastructure Test Objectives ✅
- [ ] Validate Docker CFN orchestration patterns
- [ ] Test container-to-container communication
- [ ] Demonstrate self-referential monitoring
- [ ] Validate Redis coordination in containerized environment

## Specific Deliverables

### 1. Container Team Setup
- Orchestrator container with Redis coordination
- Backend-developer container (API endpoints)
- Frontend-developer container (Dashboard UI)
- Tester container (Integration testing)
- Docker-specialist container (Container optimization)

### 2. Monitoring Dashboard Features
- Real-time container status (building team)
- Agent lifecycle visualization
- Resource usage of builder containers
- Redis coordination status display
- Container health monitoring
- Self-referential monitoring proof

### 3. Coordination Validation
- Redis messaging between containers
- Task context container passing
- Agent orchestration via Docker
- Container lifecycle management
- Inter-container communication proof

## Anti-Pattern Prevention

### ❌ FORBIDDEN
- Main Chat building dashboard directly
- CLI agent spawning (use container deployment only)
- Non-container coordination methods
- Dashboard that doesn't monitor builder containers

### ✅ REQUIRED
- All agents deployed as containers
- Redis container-to-container messaging
- Meta-monitoring of builder infrastructure
- Docker CFN coordination demonstration

## Success Validation

### Technical Validation
```bash
# Verify container deployment
docker ps | grep "cfn-orchestrator" ✅
docker ps | grep "cfn-agent-" | wc -l ≥ 3 ✅

# Verify Redis coordination between containers
redis-cli KEYS "cfn_loop:*" | grep container-team ✅

# Verify meta-monitoring
curl http://localhost:PORT/api/builder-containers ✅
# Should show the containers building the dashboard
```

### Functional Validation
- [ ] Dashboard displays builder container status
- [ ] Agent lifecycle tracked in real-time
- [ ] Redis coordination visualized
- [ ] Container resource usage monitored
- [ ] Self-referential monitoring demonstrated

## Implementation Constraints

### Docker Environment
- All agents must run in containers
- Use docker-compose.stabilization.yml base
- Container resource limits enforced
- Health checks implemented

### Coordination Stack
- Redis for container messaging
- No direct Main Chat agent spawning
- Container orchestration via CFN patterns
- Context passing through Redis

### Meta-Monitoring
- Dashboard monitors builder containers
- Real-time agent lifecycle display
- Container resource tracking
- Self-reference proof required

## Completion Criteria

1. **Container Team Deployed**: CFN orchestrator + agent containers running
2. **Coordination Working**: Redis messaging between containers functional
3. **Dashboard Built**: Monitoring dashboard created by container team
4. **Meta-Monitoring Active**: Dashboard monitors builder containers
5. **Infrastructure Validated**: Docker CFN coordination demonstrated

## Success Definition

**SUCCESS**: A monitoring dashboard built entirely by containerized CFN team that monitors the containers building it, demonstrating full Docker CFN coordination and meta-monitoring capabilities.

**FAILURE**: Any Main Chat direct implementation, CLI spawning, or dashboard that doesn't monitor its builder containers.

---

**Spec Version:** 2.0 (Container-Based)
**Date:** 2025-11-06
**Mandatory**: Container deployment and meta-monitoring requirements