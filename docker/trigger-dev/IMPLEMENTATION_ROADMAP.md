# Trigger.dev Container Modes - Implementation Roadmap

**Reference Document**: docker/trigger-dev/TRIGGER_DEV_ARCHITECTURE.md
**Status**: Planning & Validation Phase
**Last Updated**: 2025-11-24

---

## Executive Summary

This roadmap outlines the phased implementation plan for Trigger.dev container modes, building on the comprehensive architecture defined in TRIGGER_DEV_ARCHITECTURE.md (14 parts). Each phase includes specific deliverables, validation criteria, and success metrics.

## Phase Structure

```
Phase 1: Foundation (Current)
  ├─ 1.0: Investigation (COMPLETE)
  ├─ 1.1: Network Configuration (IN PROGRESS)
  ├─ 1.2a: Multi-Container Spawning (PLANNED)
  ├─ 1.2b: Wave-Based Orchestration (PLANNED)
  ├─ 1.3a: Agent Coordination (PLANNED)
  ├─ 1.3b: Infrastructure Validation (PLANNED)
  └─ 1.4: Documentation & Testing (PLANNED)

Phase 2: Scaling (FUTURE)
  ├─ 2.1: Multi-Worker Pool
  ├─ 2.2: Load Balancing
  ├─ 2.3: Horizontal Scaling
  └─ 2.4: Performance Optimization

Phase 3: Enterprise (FUTURE)
  ├─ 3.1: Production Hardening
  ├─ 3.2: Security & Compliance
  ├─ 3.3: Disaster Recovery
  └─ 3.4: Multi-Region Support
```

---

## Phase 1: Foundation

### Phase 1.0: Investigation (COMPLETE)

**Objective**: Understand Trigger.dev architecture, CFN integration points, and Docker networking

**Completed Deliverables**:
- [x] CFN_ARCHITECTURE_ANALYSIS.md (Docker service discovery, Redis configuration)
- [x] CLI_AGENT_SPAWNING_ROOT_CAUSE_ANALYSIS.md (agent container lifecycle)
- [x] DOCKER_VALIDATION_REPORT.md (Docker build and execution)
- [x] Validation reports (Loop 2 consensus, testing validation)

**Key Findings**:
1. Redis service name configuration: Use `redis` (not `cfn-redis`)
2. Agent network isolation: cfn-network separate from trigger-cfn-network
3. Docker socket proxy required for secure Docker API access
4. Multi-layer coordination: Webapp → Worker → Agents

**Success Criteria Met**:
- ✅ Architecture documented and validated
- ✅ Network configuration understood
- ✅ Service discovery patterns identified
- ✅ Integration points mapped

---

### Phase 1.1: Network Configuration

**Objective**: Validate and document Docker networking, service discovery, and agent isolation

**Status**: IN PROGRESS (based on investigation findings)

**Deliverables**:

1. **Network Configuration Validation**
   - Verify trigger-cfn-network creation and service registration
   - Test internal service discovery (postgres, redis, minio)
   - Validate cfn-network creation (agent network)
   - Document port mapping and external access

   ```bash
   # Validation steps
   docker network inspect trigger-cfn-network
   docker network inspect cfn-network
   docker-compose exec redis redis-cli ping
   docker-compose exec postgres psql -U postgres -c "SELECT 1"
   ```

2. **Service Discovery Documentation**
   - Internal DNS resolution for all services
   - Agent container network assignment
   - Redis connectivity verification
   - Database access patterns

   **Expected Configuration**:
   ```yaml
   # Service accessibility matrix
   Service         From Webapp    From Worker    From Agent
   ───────────────────────────────────────────────────────────
   Redis           redis:6379     redis:6379     redis:6379
   PostgreSQL      postgres:5432  postgres:5432  (N/A)
   MinIO           minio:9000     minio:9000     (N/A)
   ```

3. **Multi-Network Bridge**
   - Validate agent containers can reach Redis (cross-network)
   - Document network connectivity patterns
   - Test fallback mechanisms if connectivity fails

   **Issue Resolution**:
   - Agents on cfn-network must reach Redis on trigger-cfn-network
   - Solution: Expose Redis on both networks OR agent uses external Redis port
   - Validation: Agent container can execute `redis-cli -h redis -p 6379 ping`

**Success Criteria**:
- [ ] All services accessible via service names
- [ ] Agents can reach Redis from cfn-network
- [ ] Port mapping documented and tested
- [ ] Network diagnostics documented

**Effort**: 1 week
**Owner**: DevOps / Infrastructure team

---

### Phase 1.2a: Multi-Container Spawning

**Objective**: Implement and validate worker spawning of multiple agent containers

**Deliverables**:

1. **Agent Spawning Script Enhancement**
   - Update trigger-worker spawn logic to handle multiple agents
   - Implement container naming convention: `cfn-agent-{job-id}-{type}-{index}`
   - Add resource constraints (memory, CPU)
   - Implement container labeling for tracking

   ```typescript
   // src/jobs/multi-agent-spawn.ts
   async function spawnMultipleAgents(jobId: string, agentConfig: AgentConfig[]) {
     const spawned: SpawnedAgent[] = [];

     for (const config of agentConfig) {
       const containerName = `cfn-agent-${jobId}-${config.type}-${config.index}`;
       const container = await docker.createContainer({
         name: containerName,
         Image: 'cfn-agent:latest',
         HostConfig: {
           Memory: parseMemory(config.memory),
           Cpus: config.cpus,
           NetworkMode: 'cfn-network',
           Labels: {
             'job-id': jobId,
             'agent-type': config.type,
             'agent-index': config.index
           }
         },
         Env: [
           `CFN_JOB_ID=${jobId}`,
           `CFN_AGENT_TYPE=${config.type}`,
           `REDIS_HOST=redis`,
           // ... other env vars
         ]
       });

       await container.start();
       spawned.push({ containerName, config });
     }

     return spawned;
   }
   ```

2. **Resource Allocation**
   - Define memory tiers: 512MB, 1GB, 2GB (configurable)
   - CPU allocation: 1-2 cores per agent
   - Memory budget tracking per worker
   - Prevent over-allocation

3. **Container Tracking**
   - Track spawned containers by job ID
   - Monitor container status (running, exited, crashed)
   - Implement automatic cleanup of completed containers

   ```sql
   -- Proposed tracking table
   CREATE TABLE agent_containers (
     id UUID PRIMARY KEY,
     job_id UUID REFERENCES jobs(id),
     container_name VARCHAR(255),
     agent_type VARCHAR(100),
     memory_mb INTEGER,
     cpu_cores DECIMAL(4,2),
     status VARCHAR(50),
     started_at TIMESTAMP,
     completed_at TIMESTAMP,
     exit_code INTEGER
   );
   ```

**Success Criteria**:
- [ ] Spawn 5+ agents concurrently
- [ ] Container names follow convention
- [ ] Resource constraints applied correctly
- [ ] Container status tracked in database
- [ ] Automatic cleanup on completion

**Effort**: 2 weeks
**Owner**: Backend developer, DevOps

---

### Phase 1.2b: Wave-Based Orchestration

**Objective**: Implement memory-budget-aware spawning (similar to CLI Docker mode)

**Deliverables**:

1. **Wave Spawning Algorithm**
   - Fill waves respecting memory budget (e.g., 40GB per worker)
   - Spawn agents in parallel within wave
   - Wait for wave completion before spawning next wave
   - Track wave progress and metrics

   ```javascript
   // Wave-based spawning logic
   async function spawnWaves(agents: AgentConfig[], memoryBudget: number) {
     let waveNumber = 1;
     let agentQueue = [...agents];

     while (agentQueue.length > 0) {
       const wave: AgentConfig[] = [];
       let waveMemory = 0;

       // Fill wave up to budget
       while (agentQueue.length > 0) {
         const agent = agentQueue[0];
         const agentMemory = parseMemory(agent.memory);

         if (waveMemory + agentMemory <= memoryBudget) {
           wave.push(agentQueue.shift());
           waveMemory += agentMemory;
         } else {
           break;
         }
       }

       // Spawn all agents in wave
       await spawnMultipleAgents(wave);

       // Wait for completion
       await waitForWaveCompletion(wave);

       waveNumber++;
     }
   }
   ```

2. **Wave Metadata Tracking**
   - Wave number, start time, end time
   - Agents in wave, completion status
   - Memory utilization percentage
   - Errors and retries

3. **Configuration**
   - Worker memory budget (default: 8GB, configurable)
   - Wave timeout (default: 30 minutes)
   - Retry policy on agent failure

**Success Criteria**:
- [ ] Multi-wave spawning works with memory budget
- [ ] Wave metrics collected and stored
- [ ] No OOM errors during spawning
- [ ] Performance metrics baseline established

**Effort**: 1.5 weeks
**Owner**: Backend developer

---

### Phase 1.3a: Agent Coordination

**Objective**: Implement Redis-based coordination between agents and worker

**Deliverables**:

1. **Task Queue System**
   - Worker pushes tasks to Redis queue
   - Agents claim tasks atomically
   - Track task status and completion
   - Support task retries

   ```bash
   # Redis queue commands (from worker perspective)
   LPUSH task:queue <task-1> <task-2> ...
   RPOP task:queue
   SET task:{id}:status "processing"
   INCR task:completed
   ```

2. **Completion Signaling**
   - Agent reports completion via Redis
   - Worker receives and processes signal
   - Signal includes results, metrics, status
   - Automatic container cleanup

   ```json
   // Agent completion signal format
   {
     "agentId": "cfn-agent-job-123-loop3-1",
     "jobId": "job-123",
     "status": "completed",
     "confidence": 0.95,
     "results": {
       "filesModified": ["src/auth.ts"],
       "testsPassed": 34
     }
   }
   ```

3. **Progress Tracking**
   - Agent progress updates to Redis
   - Worker collects metrics
   - Dashboard real-time updates via socket.io

4. **Error Handling**
   - Agent crash detection (no heartbeat)
   - Container exit code monitoring
   - Retry mechanism (up to N retries)
   - Dead letter queue for permanent failures

**Success Criteria**:
- [ ] Task queue operations tested
- [ ] Completion signals reliable
- [ ] No lost signals or duplicate processing
- [ ] Error handling robust

**Effort**: 1.5 weeks
**Owner**: Backend developer, Infrastructure

---

### Phase 1.3b: Infrastructure Validation

**Objective**: Comprehensive validation of Phase 1 implementation

**Deliverables**:

1. **Integration Test Suite**
   - Test: Worker spawns agents → agents execute tasks → report completion
   - Test: Multi-wave spawning with memory constraints
   - Test: Network connectivity (agents reach Redis)
   - Test: Resource limits enforced
   - Test: Automatic cleanup on completion
   - Test: Error recovery and retries

   ```bash
   # Test script structure
   #!/bin/bash
   # tests/trigger-dev/phase-1-integration-test.sh

   # Setup
   docker-compose up -d postgres redis minio trigger-webapp trigger-worker

   # Test 1: Agent spawning
   # Test 2: Task execution
   # Test 3: Wave spawning
   # ...

   # Cleanup
   docker-compose down -v
   ```

2. **Performance Baseline**
   - Measure spawn time (1, 5, 10 agents)
   - Measure task execution time
   - Measure completion signal latency
   - Measure memory/CPU utilization
   - Document performance characteristics

3. **Documentation**
   - Update TRIGGER_DEV_ARCHITECTURE.md with validated findings
   - Document network configuration procedures
   - Create troubleshooting guide (Part 11)
   - Document container naming conventions

4. **Production Readiness Checklist**
   - [ ] All tests passing (≥95% success rate)
   - [ ] Performance baselines established
   - [ ] Documentation complete
   - [ ] Error handling validated
   - [ ] Resource limits working as expected
   - [ ] Cleanup procedures tested
   - [ ] Security policies enforced

**Success Criteria**:
- [ ] Integration test suite passes
- [ ] Performance meets requirements
- [ ] Documentation complete and accurate
- [ ] Ready for Phase 2

**Effort**: 1 week
**Owner**: QA/Testing, Documentation

---

### Phase 1.4: Documentation & Testing

**Objective**: Comprehensive documentation and test suite for Phase 1

**Deliverables**:

1. **Architecture Documentation Update**
   - Finalize TRIGGER_DEV_ARCHITECTURE.md
   - Add Phase 1 validation results
   - Document network configuration
   - Include performance baselines

2. **Operational Runbooks**
   - Deployment procedures
   - Troubleshooting guide
   - Monitoring setup
   - Health checks

   ```
   docs/runbooks/
   ├─ trigger-dev-deployment.md
   ├─ trigger-dev-troubleshooting.md
   ├─ trigger-dev-monitoring.md
   └─ trigger-dev-health-checks.md
   ```

3. **Test Suite**
   - Integration tests (50+ test cases)
   - Performance tests
   - Stress tests (high-volume spawning)
   - Failure/recovery tests

   ```
   tests/trigger-dev/
   ├─ phase-1-integration-test.sh
   ├─ phase-1-performance-test.sh
   ├─ phase-1-stress-test.sh
   └─ phase-1-recovery-test.sh
   ```

4. **Example Jobs**
   - Documented example job definitions
   - Common use case implementations
   - Provider routing examples
   - Scheduled job examples

**Success Criteria**:
- [ ] Documentation complete and reviewed
- [ ] Test coverage ≥90%
- [ ] All tests passing
- [ ] Examples working and documented

**Effort**: 2 weeks
**Owner**: DevOps, Documentation, QA

---

## Phase 1 Summary

| Phase    | Deliverable                    | Status     | Effort   | Target Date |
|----------|--------------------------------|------------|----------|-------------|
| 1.0      | Investigation Complete        | COMPLETE   | 2 weeks  | 2025-11-24  |
| 1.1      | Network Configuration         | IN PROGRESS| 1 week   | 2025-12-01  |
| 1.2a     | Multi-Container Spawning      | PLANNED    | 2 weeks  | 2025-12-15  |
| 1.2b     | Wave-Based Orchestration      | PLANNED    | 1.5 weeks| 2025-12-29  |
| 1.3a     | Agent Coordination            | PLANNED    | 1.5 weeks| 2026-01-12  |
| 1.3b     | Infrastructure Validation     | PLANNED    | 1 week   | 2026-01-19  |
| 1.4      | Documentation & Testing       | PLANNED    | 2 weeks  | 2026-02-02  |

**Total Phase 1 Effort**: ~10 weeks

---

## Phase 2: Scaling (FUTURE)

### Phase 2.1: Multi-Worker Pool

**Objective**: Implement multiple persistent workers for parallel job processing

**Key Features**:
- 2-5 worker containers running simultaneously
- Each worker claims jobs from shared queue
- Load distribution across workers
- Worker health monitoring

**Effort**: 2 weeks

### Phase 2.2: Load Balancing

**Objective**: Distribute load across multiple workers

**Key Features**:
- Job distribution based on worker capacity
- Worker priority assignment (fast vs slow)
- Provider diversity (different providers per worker)

**Effort**: 1.5 weeks

### Phase 2.3: Horizontal Scaling

**Objective**: Support adding/removing workers dynamically

**Key Features**:
- Kubernetes integration (optional)
- Docker Swarm support (optional)
- Auto-scaling based on queue depth

**Effort**: 3 weeks

### Phase 2.4: Performance Optimization

**Objective**: Optimize for maximum throughput

**Key Features**:
- Connection pooling optimization
- Redis cluster support
- Caching layer enhancement
- Database query optimization

**Effort**: 2 weeks

---

## Phase 3: Enterprise (FUTURE)

### Phase 3.1: Production Hardening

**Objective**: Prepare for production deployment

**Key Features**:
- High availability setup (HA)
- Database replication
- Backup/recovery procedures
- Monitoring and alerting

### Phase 3.2: Security & Compliance

**Objective**: Implement security controls

**Key Features**:
- Network security hardening
- Secret management
- Audit logging
- Compliance reporting

### Phase 3.3: Disaster Recovery

**Objective**: Implement DR procedures

**Key Features**:
- Backup strategies
- Recovery testing
- RTO/RPO requirements

### Phase 3.4: Multi-Region Support

**Objective**: Support multiple deployment regions

**Key Features**:
- Database replication across regions
- Job routing by region
- Failover procedures

---

## Success Metrics

### Phase 1 Success Criteria

**Functional**:
- Single worker can spawn 5+ agents concurrently
- Agents execute tasks correctly
- Results reported back to worker
- Automatic cleanup working
- Error handling operational

**Performance**:
- Agent startup: <5 seconds
- Task execution: 2-10 minutes
- Completion signal latency: <1 second
- Memory efficiency: 60-80% of budget utilization

**Quality**:
- Test coverage: ≥90%
- Test pass rate: ≥95%
- Documentation completeness: 100%
- No critical bugs in validation

**Operational**:
- Deployment time: <30 minutes
- Recovery from failure: <5 minutes
- Troubleshooting procedures available
- Monitoring dashboards functional

---

## Dependencies & Blockers

### Current Status

**Resolved**:
- ✅ Docker architecture validated
- ✅ Service discovery patterns identified
- ✅ CFN Loop integration points mapped
- ✅ Network configuration options documented

**In Progress**:
- 🔄 Network validation (Phase 1.1)
- 🔄 Service connectivity testing

**Blocked**:
- ❌ None currently

### Potential Blockers

1. **Docker Socket Access**
   - Issue: Socket proxy permission issues
   - Resolution: Validate socket-proxy container permissions
   - Timeline: Phase 1.1

2. **Network Connectivity**
   - Issue: Agents on separate network may not reach Redis
   - Resolution: Implement network bridge or expose Redis
   - Timeline: Phase 1.1

3. **PostgreSQL Connection Pool**
   - Issue: Many workers may exhaust connection pool
   - Resolution: Implement connection pooling (PgBouncer)
   - Timeline: Phase 2.1

---

## Next Steps

### Immediate (This Week)

1. Complete Phase 1.1 network validation
   - Verify all services accessible via service names
   - Test agent-to-Redis connectivity
   - Document any issues and resolutions

2. Start Phase 1.2a preparation
   - Review agent spawning script
   - Design container naming convention
   - Create resource allocation logic

### Short-term (Next 2 Weeks)

1. Complete Phase 1.2a (Multi-Container Spawning)
2. Begin Phase 1.2b (Wave-Based Orchestration)
3. Update TRIGGER_DEV_ARCHITECTURE.md with progress

### Medium-term (Next Month)

1. Complete Phase 1.3a & 1.3b
2. Run comprehensive integration tests
3. Establish performance baselines
4. Begin Phase 2 planning

---

## References

**Architecture Document**:
- docker/trigger-dev/TRIGGER_DEV_ARCHITECTURE.md (14 parts, comprehensive reference)

**Related Documentation**:
- readme/CLI_MODE_ARCHITECTURE.md (CLI mode reference)
- docker/CLAUDE.md (Docker orchestration patterns)
- docker/trigger-dev/CLAUDE.md (Trigger.dev development guide)
- docker/trigger-dev/DEPLOYMENT.md (deployment procedures)

**Investigation Reports**:
- docker/trigger-dev/CFN_ARCHITECTURE_ANALYSIS.md
- docker/trigger-dev/CLI_AGENT_SPAWNING_ROOT_CAUSE_ANALYSIS.md
- docker/trigger-dev/DOCKER_VALIDATION_REPORT.md

---

**Document Version**: 1.0.0
**Created**: 2025-11-24
**Status**: Planning & Implementation Roadmap
**Owner**: CFN Infrastructure Team
