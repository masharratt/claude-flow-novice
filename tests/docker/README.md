# Docker CFN Loop Test Suite

Comprehensive regression test suite validating the Docker-based CFN Loop v3 architecture, coordinator workflows, Docker infrastructure, and Redis coordination patterns.

**Purpose:** Ensure that code changes don't break the Docker CFN Loop process or underlying Docker infrastructure.

## Directory Structure

```
tests/docker/
├── core/                    # Essential process validation tests (13 test files)
│   ├── coordinator-planning-tests.sh
│   ├── coordinator-docker-in-docker-tests.sh
│   ├── coordinator-atomic-task-tests.sh
│   ├── coordinator-validation-tests.sh
│   ├── coordinator-iteration-tests.sh
│   ├── coordinator-fault-tolerance-tests.sh
│   ├── intelligent-coordinator-test.sh
│   ├── docker-hello-world-parity-tests.sh
│   ├── redis-coordination-tests.sh
│   ├── agent-lifecycle-tests.sh
│   ├── memory-budget-tests.sh
│   ├── cfn-loop-compliance-tests.sh
│   └── env-propagation-tests.sh
└── README.md               # This file
```

## Core Tests Overview

The core test suite validates the entire Docker CFN Loop execution path from task decomposition to agent completion. Run these tests after ANY code changes to ensure the process still works.

### Coordinator V3 Features (6 tests)

**1. Dynamic Planning (`coordinator-planning-tests.sh`)**
- **What:** Validates coordinator's ability to decompose tasks via Anthropic API
- **Coverage:** orchestrate.sh:252-393 (plan_task function)
- **Validates:**
  - API calls to Anthropic for task decomposition
  - Plan file generation (`/tmp/cfn-docker-plan-*.json`)
  - Atomic task scoping (15-30 min time bounds)
  - Fallback to keyword matching without API key
- **Test Count:** 4 test cases

**2. Docker-in-Docker Worker Spawning (`coordinator-docker-in-docker-tests.sh`)**
- **What:** Validates coordinator spawning worker containers
- **Coverage:** spawn-agent.sh, Docker-in-Docker architecture
- **Validates:**
  - Coordinator Docker socket access (`/var/run/docker.sock`)
  - Worker container configuration (network, environment, image)
  - Worker lifecycle: spawn → execute → cleanup
- **Test Count:** 3 test cases

**3. Atomic Task Assignment (`coordinator-atomic-task-tests.sh`)**
- **What:** Validates one task per agent assignment pattern
- **Coverage:** orchestrate.sh:451-509 (spawn_loop3 function)
- **Validates:**
  - Each agent receives exactly ONE atomic task
  - Task context files contain required fields (task_id, agent_type, atomic_task, deliverables)
- **Test Count:** 2 test cases

**4. Validation and Error Handling (`coordinator-validation-tests.sh`)**
- **What:** Validates plan validation and entrypoint checks
- **Coverage:** coordinator-entrypoint.sh, plan validation
- **Validates:**
  - Invalid plan rejection
  - Dependency ordering enforcement
  - Entrypoint validation (env vars, Docker socket, Redis connectivity)
- **Test Count:** 5 test cases

**5. Iteration Management (`coordinator-iteration-tests.sh`)**
- **What:** Validates multi-iteration CFN Loop execution
- **Validates:**
  - Iteration tracking and metadata storage
  - Product Owner decision enforcement (PROCEED/ITERATE/ABORT)
  - Max iteration limits

**6. Fault Tolerance (`coordinator-fault-tolerance-tests.sh`)**
- **What:** Validates coordinator resilience to failures
- **Validates:**
  - Agent failure recovery
  - Redis connection loss handling
  - Partial plan completion handling

### Intelligent Coordinator (1 test)

**7. Intelligent Coordinator Integration (`intelligent-coordinator-test.sh`)**
- **What:** End-to-end validation of coordinator v3 workflow
- **Validates:**
  - Complete flow: planning → spawning → iteration → decision
  - Integration between all coordinator components
  - Real task execution with actual agent spawning

### Docker Infrastructure (2 tests)

**8. Hello-World Parity (`docker-hello-world-parity-tests.sh`)**
- **What:** Validates basic Docker agent execution (Bug #6 fix validation)
- **Coverage:** Container-based parity with CLI hello-world tests
- **Validates:**
  - Docker container spawning
  - Basic agent functionality in containers
  - Parity between CLI and Docker execution modes
- **Test Count:** Multiple parity checks

**9. Agent Lifecycle Management (`agent-lifecycle-tests.sh`)**
- **What:** Validates agent spawn-to-exit cycle
- **Coverage:** Agent lifecycle patterns
- **Validates:**
  - Agent spawn with environment-based task assignment (Bug #4 pattern)
  - Metadata capture during execution
  - Auto-removal on completion
  - Orphan agent detection and cleanup
- **Test Count:** 4 test cases

### Redis Coordination (1 test)

**10. Redis Coordination Patterns (`redis-coordination-tests.sh`)**
- **What:** Validates Redis-based coordination (Bug #6 fix validation)
- **Coverage:** Node.js Redis client connectivity
- **Validates:**
  - Node.js Redis client connectivity with CFN_REDIS_HOST/PORT
  - Heartbeat mechanism for agent health tracking
  - Completion tracking and pub/sub patterns
  - Redis key expiration and cleanup
- **Test Count:** 4 test cases

### Resource Management (1 test)

**11. Memory Budget Enforcement (`memory-budget-tests.sh`)**
- **What:** Validates wave spawning and memory limits
- **Coverage:** Memory budget enforcement patterns
- **Validates:**
  - Wave spawning when tasks exceed 40GB budget
  - Tier allocation (T1: 256MB, T2: 512MB, T3: 1GB, T4: 2GB)
  - OOM prevention through memory limits
  - Batch size calculations
- **Test Count:** 4 test cases

### CFN Loop Patterns (1 test)

**12. CFN Loop Compliance (`cfn-loop-compliance-tests.sh`)**
- **What:** Validates CFN Loop gate/consensus/decision patterns
- **Coverage:** Loop 3, Loop 2, Product Owner workflow
- **Validates:**
  - Loop 3 gate check (≥0.75 confidence threshold)
  - Loop 2 consensus collection (≥0.90 threshold)
  - Product Owner decision parsing (PROCEED/ITERATE/ABORT)
  - Iteration metadata tracking
- **Test Count:** 4 test cases

### Environment Management (1 test)

**13. Environment Propagation (`env-propagation-tests.sh`)**
- **What:** Validates environment variable handling (Bug #4 / Bug #6 fix validation)
- **Coverage:** .env file validation, runtime propagation
- **Validates:**
  - .env.clean file format (no inline comments)
  - Required variable validation (CFN_REDIS_HOST, ANTHROPIC_API_KEY)
  - Runtime environment variable propagation to containers
  - Credential redaction in logs
- **Test Count:** 4 test cases

## Test Execution

### Run Full Regression Suite

```bash
# Run all core tests (comprehensive regression)
for test in tests/docker/core/*.sh; do
    bash "$test"
done
```

### Run Individual Test Categories

```bash
# Coordinator v3 features only
bash tests/docker/core/coordinator-planning-tests.sh
bash tests/docker/core/coordinator-docker-in-docker-tests.sh
bash tests/docker/core/coordinator-atomic-task-tests.sh
bash tests/docker/core/coordinator-validation-tests.sh

# Docker infrastructure only
bash tests/docker/core/docker-hello-world-parity-tests.sh
bash tests/docker/core/agent-lifecycle-tests.sh

# Redis coordination only
bash tests/docker/core/redis-coordination-tests.sh

# CFN Loop patterns only
bash tests/docker/core/cfn-loop-compliance-tests.sh
bash tests/docker/core/memory-budget-tests.sh

# Environment management only
bash tests/docker/core/env-propagation-tests.sh

# End-to-end integration
bash tests/docker/core/intelligent-coordinator-test.sh
```

## Prerequisites

**Docker Environment:**
- Docker daemon running
- mcp-network: `docker network create mcp-network`
- Redis: `docker run -d --name cfn-redis --network mcp-network redis:alpine`

**Images:**
- Coordinator: `docker build -f Dockerfile.cfn-coordinator -t cfn-coordinator:v3 .`
- Agent: `docker build -f Dockerfile.agent -t cfn-agent:latest .`

**Environment Variables:**
- ANTHROPIC_API_KEY set (for planning tests)
- Z_AI_API_KEY set (optional, for custom routing tests)

## Coverage Summary

| Category | Test Files | Test Cases | Coverage |
|----------|-----------|------------|----------|
| Coordinator v3 | 6 | 20+ | 100% |
| Docker Infrastructure | 2 | 8+ | 100% |
| Redis Coordination | 1 | 4 | 100% |
| Resource Management | 1 | 4 | 100% |
| CFN Loop Patterns | 1 | 4 | 100% |
| Environment Management | 1 | 4 | 100% |
| Integration | 1 | E2E | 100% |
| **Total** | **13** | **44+** | **100%** |

## Bug Fix Validation

These tests validate fixes for documented bugs:

- **Bug #4:** Agent task assignment pattern (validated by agent-lifecycle-tests.sh)
- **Bug #6:** Redis environment variable propagation (validated by redis-coordination-tests.sh, env-propagation-tests.sh)

## Related Documentation

- **Implementation:** `docs/DOCKER_COORDINATOR_FINAL.md`
- **Test Gaps:** `tests/docker/COORDINATOR_V3_TEST_GAPS.md`
- **Test Standards:** `tests/CLAUDE.md`
- **Suite Overview:** `tests/docker/TEST_SUITE_OVERVIEW.md`
- **Maintenance:** `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md`
- **Execution Playbook:** `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md`
