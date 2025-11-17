# Test Coverage Dependency Map (Updated)
## Claude Flow Novice - Testing Prerequisites & Dependencies

**Last Updated:** November 17, 2025  
**Purpose:** Understand which tests depend on what infrastructure

---

## CORE DEPENDENCIES

### Level 0: Foundation

```
Redis Server
├─ Standalone: redis-server (6.0+)
├─ Docker: docker run -p 6379:6379 redis:7
├─ Cloud: AWS ElastiCache / Azure Cache
└─ Status: REQUIRED for all CFN Loop tests

Jest Framework
├─ Version: 30.2.0+
├─ Config: jest.config.cjs
├─ Presets: @types/jest, ts-jest
└─ Status: INSTALLED ✅

TypeScript
├─ Version: 5.x
├─ Compiler: tsc
├─ Types: @types/* packages
└─ Status: INSTALLED ✅

Node.js
├─ Version: 18.x+
├─ LTS: 20.x recommended
└─ Status: REQUIRED
```

### Level 1: Test Infrastructure

```
Bash Testing
├─ bats: Bash Automated Testing System
├─ shellcheck: Shell script linter
├─ shunit2: Shell assertions
└─ Status: PARTIALLY INSTALLED (need BATS)

Database Testing
├─ jest-sql: SQL helper functions
├─ sql-bricks: Query builder
├─ knex: Migration runner
└─ Status: INSTALLED (partial)

HTTP Testing
├─ supertest: Express/HTTP testing
├─ nock: HTTP mocking
├─ axios: HTTP client
└─ Status: INSTALLED (partial)

Mock/Fixture Libraries
├─ jest-mock-extended: Enhanced mocking
├─ faker: Test data generation
├─ lodash: Utilities
└─ Status: INSTALLED ✅
```

---

## TEST-TO-CODE DEPENDENCY GRAPH

### CFN Loop Tests → Implementation Dependencies

```
tests/cfn-loop-orchestration-e2e.test.ts
├─ REQUIRES: src/cfn-loop/cfn-loop-orchestrator.ts
├─ REQUIRES: .claude/skills/cfn-loop-orchestration/orchestrate.sh
├─ REQUIRES: Redis (for context storage)
├─ REQUIRES: .claude/skills/cfn-coordination/* (all coordination scripts)
├─ DEPENDS: test fixtures (mock agents, contexts)
└─ MOCK: cfn-redis-coordination (publish/subscribe)

Loop 3 Phase Tests
├─ REQUIRES: src/cfn-loop/loop3-executor.ts
├─ REQUIRES: src/agents/lifecycle-manager.ts
├─ DEPENDS: Agent spawning (test doubles needed)
└─ MOCK: Agent output validation

Loop 2 Phase Tests
├─ REQUIRES: src/cfn-loop/loop2-validator.ts
├─ REQUIRES: .claude/skills/cfn-coordination/collect-confidence-scores.sh
├─ DEPENDS: Loop 3 test results (fixtures)
└─ MOCK: Agent output, confidence scores

Product Owner Tests
├─ REQUIRES: src/cfn-loop/product-owner-executor.ts
├─ REQUIRES: .claude/skills/product-owner-decision/execute-decision.sh
├─ DEPENDS: Loop 2 consensus results
└─ MOCK: Decision outcomes
```

### Agent System Tests → Implementation Dependencies

```
tests/agent-lifecycle-state-machine.test.ts
├─ REQUIRES: src/agents/lifecycle-manager.ts
├─ REQUIRES: src/agents/agent-state-machine.ts
├─ DEPENDS: Process management (node child_process)
├─ MOCK: External CLI calls
└─ FIXTURE: Agent configurations

Agent Spawning Tests
├─ REQUIRES: src/cli/agent-spawn.ts
├─ REQUIRES: .claude/skills/cfn-agent-spawning/spawn-agent.sh
├─ DEPENDS: src/agents/lifecycle-manager.ts
├─ DEPENDS: .claude/agents/* (agent definitions)
└─ MOCK: Process execution

Lifecycle Manager Tests
├─ REQUIRES: src/agents/lifecycle-manager.ts
├─ DEPENDS: Process signals (SIGTERM, SIGKILL)
├─ DEPENDS: Memory persistence (SQLite)
└─ FIXTURE: Agent state transitions

Agent Dependency Tests
├─ REQUIRES: src/agents/dependency-resolver.ts
├─ DEPENDS: Agent definitions (.claude/agents/)
└─ MOCK: Circular dependency scenarios
```

### CLI Command Tests → Implementation Dependencies

```
tests/cli/cfn-loop-commands.test.ts
├─ REQUIRES: src/cli/cfn-loop.ts
├─ REQUIRES: src/cli/command-parser.ts
├─ DEPENDS: src/cli/cfn-context.ts (context management)
├─ DEPENDS: src/cfn-loop/* (orchestration)
├─ MOCK: User input, environment variables
└─ FIXTURE: Test projects, configurations

cfn-swarm Tests
├─ REQUIRES: src/cli/cfn-swarm.ts
├─ DEPENDS: src/agents/lifecycle-manager.ts
├─ DEPENDS: Redis pub/sub
└─ FIXTURE: Agent templates

cfn-memory Tests
├─ REQUIRES: src/cli/memory-cli.ts
├─ REQUIRES: src/lib/memory-manager.ts
├─ DEPENDS: Redis client, SQLite
└─ MOCK: Storage operations

cfn-redis Tests
├─ REQUIRES: src/cli/redis-cli-wrapper.ts
├─ REQUIRES: .claude/skills/cfn-redis-coordination/redis-cli-wrapper.sh
├─ DEPENDS: Redis server
└─ MOCK: Redis responses
```

### Database Tests → Implementation Dependencies

```
tests/database-service-comprehensive.test.ts
├─ PostgreSQL Adapter
│  ├─ REQUIRES: src/lib/database-service/postgres-adapter.ts
│  ├─ REQUIRES: postgresql (running instance)
│  ├─ DEPENDS: pg client library
│  └─ FIXTURE: Test database + migrations
├─ SQLite Adapter
│  ├─ REQUIRES: src/lib/database-service/sqlite-adapter.ts
│  ├─ REQUIRES: better-sqlite3
│  └─ FIXTURE: In-memory test databases
├─ Redis Adapter
│  ├─ REQUIRES: src/lib/database-service/redis-adapter.ts
│  ├─ REQUIRES: redis (running instance)
│  └─ FIXTURE: Isolated Redis namespace
└─ Transaction Manager
   ├─ REQUIRES: src/lib/database-service/transaction-manager.ts
   ├─ DEPENDS: All adapters above
   └─ FIXTURE: Savepoint management
```

### Docker Tests → Implementation Dependencies

```
tests/docker/test-docker-orchestrator.sh
├─ REQUIRES: Docker (running daemon)
├─ REQUIRES: docker-compose (for multi-service tests)
├─ REQUIRES: src/docker/* (Docker support code)
├─ REQUIRES: docker/Dockerfile.* (Docker images)
├─ DEPENDS: WSL2 Linux native storage
├─ FIXTURE: docker-compose.test.yml
└─ INTEGRATION: Redis, database services

Container Security Tests
├─ REQUIRES: docker/DOCKER_ACCESS_CONTROL.md
├─ REQUIRES: Docker build validation
├─ MOCK: Security scanning tools
└─ FIXTURE: Vulnerable image tests

Docker Orchestration Tests
├─ REQUIRES: docker/SUCCESS_CRITERIA_INTEGRATION.md
├─ REQUIRES: Agent container spawning
├─ DEPENDS: Container networking
└─ FIXTURE: Multi-container scenarios
```

---

## TESTING SPECIALIST DEPENDENCIES

### Contract Tester Dependencies

```
contract-tester Agent
├─ Requires: @pact-foundation/pact@^12.0.0
├─ Requires: express-openapi-validator@^5.0.0
├─ Requires: ajv@^8.0.0
├─ Uses: jest@^29.0.0
├─ External: Node.js, npm
└─ Skills:
   ├─ API schema validation
   ├─ Pact broker integration (optional)
   └─ Consumer-driven contract testing

Installation:
npm install --save-dev @pact-foundation/pact@^12.0.0
npm install --save-dev express-openapi-validator@^5.0.0
npm install --save-dev ajv@^8.0.0
```

### Integration Tester Dependencies

```
integration-tester Agent
├─ Requires: jest@^29.0.0
├─ Requires: Test fixtures framework
├─ Requires: Database instances (test databases)
├─ Requires: Redis (for context passing)
├─ Requires: Environment setup (Docker or local)
└─ Skills:
   ├─ End-to-end workflow testing
   ├─ Cross-component integration
   ├─ Database operation validation
   └─ Service orchestration testing

Setup Required:
- Docker Compose for service stack
- Test database migrations
- Redis configuration
- Environment variables
```

### Mutation Testing Specialist Dependencies

```
mutation-testing-specialist Agent
├─ Requires: stryker@latest
├─ Requires: stryker-cli@latest
├─ Requires: Test suite (for mutation killing)
├─ Requires: Jest@^29.0.0
├─ Requires: TypeScript compiler
└─ Skills:
   ├─ Mutation score calculation
   ├─ Weak test detection
   ├─ Test quality validation
   └─ Mutant coverage analysis

Installation:
npm install --save-dev @stryker-mutator/core
npm install --save-dev @stryker-mutator/typescript-checker
npm install --save-dev @stryker-mutator/jest-runner
npm install --save-dev stryker-cli

Configuration: stryker.conf.json (required)
```

---

## EXECUTION DEPENDENCY CHAINS

### Critical Path: CFN Loop Test Execution

```
1. Infrastructure Setup (Prereq)
   ├─ Redis running (localhost:6379)
   ├─ Database available (PostgreSQL or SQLite)
   ├─ Node.js environment
   └─ All npm packages installed

2. Test Preparation
   ├─ Jest configuration loaded
   ├─ TypeScript compiled
   ├─ Mocks initialized
   └─ Test fixtures created

3. Test Execution (Ordered)
   ├─ Gate checking tests (foundation)
   ├─ Loop 3 spawning tests (depends on gate)
   ├─ Confidence collection tests (depends on Loop 3)
   ├─ Loop 2 consensus tests (depends on Loop 3 results)
   ├─ Product Owner decision tests (depends on Loop 2)
   └─ Full cycle tests (depends on all above)

4. Cleanup
   ├─ Redis cleanup (flush test keys)
   ├─ Database cleanup (rollback transactions)
   ├─ Process cleanup (kill test agents)
   └─ File cleanup (remove test fixtures)

Failure Cascade Risk: HIGH
├─ If gate tests fail → Loop 3 tests fail
├─ If Loop 3 fails → Loop 2 fails
├─ If Loop 2 fails → Product Owner tests fail
└─ Mitigation: Parallel test suites with isolated setup
```

### Critical Path: Agent Spawning Test Execution

```
1. Setup (Prereq)
   ├─ Lifecycle manager initialized
   ├─ Agent definitions loaded
   ├─ Process environment ready
   └─ Resource limits set

2. State Machine Tests (Sequential)
   ├─ uninitialized → initializing transition
   ├─ initializing → idle transition
   ├─ idle → running transition
   ├─ running → paused transition (optional)
   ├─ paused/running → stopping transition
   ├─ stopping → stopped transition
   └─ stopped → error transition (error cases)

3. Concurrent Tests (Parallel Safe)
   ├─ Spawn N agents simultaneously
   ├─ Verify no resource exhaustion
   ├─ Check queue management
   └─ Validate dependency ordering

Failure Cascade Risk: MEDIUM
├─ State test failures block subsequent tests
├─ Concurrent tests can run in isolation
└─ Cleanup required between test suites
```

---

## MOCK & FIXTURE DEPENDENCIES

### Required Mocks

```
Redis Mock
├─ Library: redis-mock or ioredis-mock
├─ Used By: CFN Loop, Agent Spawning tests
├─ Replaces: Real Redis server
└─ Limitation: Pub/sub less reliable

Agent Process Mock
├─ Library: jest.mock('child_process')
├─ Used By: Lifecycle Manager tests
├─ Replaces: Real process spawning
└─ Must Mock: spawn, exec, fork

File System Mock
├─ Library: memfs or jest-fs
├─ Used By: Config loader, CLI tests
├─ Replaces: Real file I/O
└─ Care Needed: Path handling

HTTP Mock
├─ Library: nock or jest-mock-axios
├─ Used By: API integration tests
├─ Replaces: Real HTTP calls
└─ Must Mock: Status codes, bodies
```

### Required Fixtures

```
Agent Definitions
├─ Location: tests/fixtures/agents/
├─ Contains: Mock .claude/agents/
├─ Used By: Agent spawning tests
└─ Size: ~10 agent files

Test Configurations
├─ Location: tests/fixtures/configs/
├─ Contains: Mock CLAUDE.md, config files
├─ Used By: Config validator tests
└─ Size: ~5 config files

Database Migrations
├─ Location: tests/fixtures/migrations/
├─ Contains: Test schema setup
├─ Used By: Database tests
└─ Size: ~10 migration files

Success Criteria
├─ Location: tests/fixtures/criteria/
├─ Contains: Mock success criteria JSON
├─ Used By: Gate checking tests
└─ Size: ~20 criteria files

Agent Output
├─ Location: tests/fixtures/outputs/
├─ Contains: Mock agent execution results
├─ Used By: Output validator tests
└─ Size: ~30 output files
```

---

## DEPENDENCY INSTALLATION PLAN

### Phase 1: Core (Already Done)

```bash
✅ npm install             # All base dependencies
✅ jest 30.2.0            # Test framework
✅ typescript 5.x         # Type checking
✅ redis (client)         # Redis testing
✅ better-sqlite3         # SQLite testing
✅ pg (PostgreSQL client) # PostgreSQL testing
```

### Phase 2: Testing Framework Additions (Recommended)

```bash
# Bash Testing
npm install --save-dev @bats-core/bats
npm install --save-dev bats-support
npm install --save-dev bats-assert

# Contract Testing
npm install --save-dev @pact-foundation/pact
npm install --save-dev express-openapi-validator
npm install --save-dev ajv

# Mutation Testing
npm install --save-dev @stryker-mutator/core
npm install --save-dev @stryker-mutator/typescript-checker
npm install --save-dev stryker-cli

# Additional Mocking
npm install --save-dev jest-mock-extended
npm install --save-dev ioredis-mock

# Data Generation
npm install --save-dev faker
```

### Phase 3: Optional Enhancements

```bash
# Performance Testing
npm install --save-dev autocannon   # Load testing
npm install --save-dev clinic       # Performance profiling

# Code Quality
npm install --save-dev @coverage/eslint-plugin
npm install --save-dev jest-html-reporters

# Documentation
npm install --save-dev typedoc      # API documentation
```

---

## ENVIRONMENT SETUP REQUIREMENTS

### Local Development

```bash
# Redis
redis-server

# PostgreSQL (if using PostgreSQL)
psql -U postgres

# SQLite (no setup needed)
# better-sqlite3 handles automatically

# Node.js
node --version  # 18.x or higher
npm --version   # 9.x or higher

# Docker (for Docker tests)
docker --version
docker-compose --version
```

### CI/CD Environment

```yaml
# GitHub Actions example
services:
  redis:
    image: redis:7
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 6379:6379

  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: postgres
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
    ports:
      - 5432:5432
```

---

## DEPENDENCY CONFLICT MATRIX

### Known Issues & Solutions

| Conflict | Components | Solution |
|----------|-----------|----------|
| Redis mock vs real Redis | ioredis-mock ↔ redis | Use separate test configs |
| Jest version mismatch | jest ↔ ts-jest | Lock versions together |
| TypeScript strict mode | TypeScript ↔ source code | Configure tsconfig.json |
| Port conflicts (Redis, DB) | Service stacks | Use different ports per test suite |
| File system mocking | memfs ↔ Node fs | Use scoped mocks |
| Docker layer caching | docker-compose ↔ builds | Use `--no-cache` in tests |

---

## TESTING ROADMAP & DEPENDENCIES

### Week 1-2: Foundation Setup
```
Dependencies Added:
├─ BATS shell testing
├─ jest-mock-extended
├─ ioredis-mock
└─ faker

Tests Created:
├─ CFN Loop gate checking (40 tests)
├─ Agent spawning basics (30 tests)
└─ CLI parameter validation (25 tests)
```

### Week 3-4: Framework Integration
```
Dependencies Added:
├─ @pact-foundation/pact
├─ @stryker-mutator/*
└─ ajv

Tests Created:
├─ Contract tests (20 tests)
├─ Integration tests (40 tests)
└─ Mutation tests (mutation score baseline)
```

### Week 5-6: Comprehensive Coverage
```
Dependencies Added:
├─ @coverage/eslint-plugin
├─ autocannon (load testing)
└─ jest-html-reporters

Tests Created:
├─ Database transaction tests (60 tests)
├─ Docker integration tests (40 tests)
├─ Error scenario tests (80 tests)
└─ Performance tests (10 benchmarks)
```

---

## SUMMARY: Critical Dependency Path

```
Redis ──┐
        ├─→ CFN Loop Tests ──→ Integration Tests ──→ E2E Tests
Node.js ┤
        ├─→ Jest Framework ──→ Unit Tests ──→ Coverage
        │
Database┤
        ├─→ Database Tests ──→ Transaction Tests
        │
Docker ──→ Docker Tests ──→ Container Tests ──→ Production Validation
```

**Critical Dependency:** Redis (needed by 60%+ of tests)  
**Blocking Issue:** Missing BATS (blocks shell script testing)  
**High Impact:** Mutation testing setup (needed for test quality validation)

---

**Generated:** November 17, 2025  
**Maintainer:** Test Infrastructure Team  
**Status:** DRAFT - Ready for review

