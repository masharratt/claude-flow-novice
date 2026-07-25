# CFN Loop Docker Infrastructure - Requirements Specification

**Document Version:** 2.0.0 (Corporate Alignment)
**Date:** 2025-11-15
**Status:** Phase 0A Complete - Ready for Implementation
**Purpose:** Define comprehensive requirements for multi-runtime, multi-team CFN Loop Docker infrastructure with organizational isolation

---

## Executive Summary

### Phase 0A: Corporate Alignment Complete

**Document Status:**
- SPARC technical specs + Corporate organizational requirements = **UNIFIED**
- Multi-runtime support + Multi-team isolation = **ALIGNED**
- Physical resource budgets + Team provisioning = **DEFINED**
- Hierarchical coordination protocol = **SPECIFIED**

### Current State Analysis

**Existing Infrastructure:**
- Single Node.js runtime (node:20-slim base)
- 15 Dockerfiles (including variants and backups)
- Test suite with 13/19 failures
- Environment contract exists but incomplete alignment
- No formal image contract specification
- No cross-runtime coordination tests
- **No team isolation** (NEW GAP)
- **No skill-based access control** (NEW GAP)
- **No hierarchical coordination** (NEW GAP)

**Critical Gaps (Updated with Corporate Requirements):**

**Technical Gaps (Original SPARC):**
1. **Runtime Support:** Only Node.js supported; no Python, Rust, Go, Java
2. **Image Contract:** Missing standardized interface across runtimes
3. **Testing Strategy:** No build-time validation gates
4. **Protocol Versioning:** No cross-runtime coordination tests
5. **Operational Readiness:** No versioning strategy or compatibility matrices

**Organizational Gaps (Corporate Alignment):**
6. **Team Isolation:** No workspace/network/skill isolation between teams
7. **Skill Permissions:** All agents have access to all skills (security risk)
8. **Hierarchical Coordination:** No Main Coordinator → Team Coordinator protocol
9. **Knowledge Persistence:** Agent knowledge only in Redis (ephemeral, data loss risk)
10. **Resource Management:** No per-team physical resource budgets
11. **Operational Logging:** No troubleshooting logs (debugging difficult)

**Business Impact (Expanded):**
- Cannot support ML/data processing use cases (need Python)
- Cannot support high-performance use cases (need Rust, Go)
- Cannot support enterprise Java-based workflows
- Cannot deploy multi-team organizations (SEO, marketing, frontend, backend, devops, qa, csuite)
- Frontend agents can access backend code (security breach)
- Agents have unrestricted MCP access (compliance violation)
- No visibility into agent behavior (troubleshooting impossible)
- Risk of runtime drift causing coordination failures
- No rollback strategy for broken images

---

## 1. Image Contract Requirements

### 1.1 Mandatory Image Capabilities

**MUST-HAVE (P0) - All CFN Images:**

#### 1.1.1 User Isolation
- **Requirement:** Non-root user with UID/GID 1000:1000
- **Rationale:** Security best practice, prevents privilege escalation
- **Validation:** `docker run --rm <image> id -u` returns `1000`
- **Implementation:** Create `cfnagent` user in all runtimes

#### 1.1.2 Filesystem Layout
- **Requirement:** Standardized directory structure
  - `/app` - Application code root (owned by cfnagent)
  - `/app/workspace` - Mounted workspace for task execution (writable)
  - `/app/.claude` - CFN configuration and agent profiles (read-only)
  - `/app/dist` (Node.js) or `/app/bin` (compiled) or `/app/src` (interpreted) - Runtime entry point
- **Rationale:** Consistent mount points across runtimes
- **Validation:** Directory existence and ownership checks

#### 1.1.3 Environment Variable Contract
- **Requirement:** All images MUST support CFN runtime contract variables
  - Task: `CFN_TASK_ID`, `CFN_TASK_DESCRIPTION`, `CFN_TASK_TIMEOUT`
  - Agent: `CFN_AGENT_TYPE`, `CFN_AGENT_ID`, `CFN_ITERATION`
  - Coordination: `CFN_REDIS_HOST`, `CFN_REDIS_PORT`, `CFN_REDIS_PASSWORD`
  - Runtime: `CFN_CONTAINER_MODE`, `CFN_NETWORK_NAME`
- **Rationale:** Enables coordinator to spawn any runtime without runtime-specific knowledge
- **Validation:** Contract compliance test (see section 3.3)
- **Reference:** `docker/runtime/cfn-runtime.contract.yml`

#### 1.1.4 Coordination Capability
- **Requirement:** Redis client library available in all runtimes
  - Node.js: `redis` npm package
  - Python: `redis-py` pip package
  - Rust: `redis-rs` crate
  - Go: `go-redis` module
  - Java: `jedis` or `lettuce`
- **Rationale:** CFN Loop coordination protocol requires Redis
- **Validation:** Test Redis connection from each runtime

#### 1.1.5 Entry Point Specification
- **Requirement:** Images MUST expose standardized entry point script
  - Script: `/app/entrypoint.sh` (all runtimes)
  - Arguments: `--help`, `--version`, `--validate`
  - Exit codes: 0=success, 1=task failure, 2=validation failure, 137=OOM
- **Rationale:** Enables health checks and version negotiation
- **Validation:** `docker run --rm <image> /app/entrypoint.sh --help`

#### 1.1.6 Health Check Support
- **Requirement:** Images MUST respond to health checks
  - Endpoint: `/app/entrypoint.sh --health-check`
  - Timeout: 5 seconds
  - Success criteria: Redis connectivity, filesystem access
- **Rationale:** Enables coordinator to detect stuck agents
- **Validation:** `docker run --rm <image> /app/entrypoint.sh --health-check`

#### 1.1.7 Signal Handling
- **Requirement:** Entry point MUST handle SIGTERM gracefully
  - Cleanup partial work
  - Report cancellation to Redis
  - Exit with code 130 (terminated by signal)
- **Rationale:** Enables coordinator to cancel tasks cleanly
- **Validation:** Send SIGTERM, verify cleanup occurs

### 1.2 Image Metadata

**MUST-HAVE (P0) - Image Labels:**

```dockerfile
LABEL com.claudeflownovice.version="3.0.0" \
      com.claudeflownovice.runtime="<nodejs|python|rust|golang|java>" \
      com.claudeflownovice.contract.version="1.0.0" \
      com.claudeflownovice.build.date="<ISO-8601>" \
      com.claudeflownovice.build.source="<git-sha>" \
      com.claudeflownovice.capabilities="redis,filesystem,signal-handling" \
      com.claudeflownovice.agent.types="<comma-separated-list>"
```

**Rationale:** Enables version negotiation and capability discovery

**Validation:** `docker inspect <image> --format='{{json .Config.Labels}}'`

### 1.3 Testing Gates (Build-Time)

**MUST-HAVE (P0) - All Images:**

1. **Contract Compliance Test**
   - Verifies all CFN environment variables are supported
   - Validates entry point exists and responds to `--help`
   - Checks user UID/GID = 1000:1000
   - **Gate:** Build fails if test fails

2. **Redis Connectivity Test**
   - Spawns Redis container
   - Spawns image container on same network
   - Verifies connection and basic operations (SET/GET)
   - **Gate:** Build fails if test fails

3. **Filesystem Permission Test**
   - Mounts test workspace
   - Verifies read/write/execute permissions
   - Checks ownership correctness
   - **Gate:** Build fails if test fails

4. **Signal Handling Test**
   - Spawns long-running task
   - Sends SIGTERM after 5 seconds
   - Verifies graceful shutdown within 10 seconds
   - **Gate:** Build fails if test fails

5. **Memory Limit Test**
   - Spawns container with 512MB limit
   - Verifies OOM handling (exit code 137)
   - **Gate:** Warning if not handled correctly

**Implementation:** `tests/docker/contract/test-image-contract.sh <image-name>`

### 1.4 Team Workspace Isolation

**MUST-HAVE (P0) - Security Critical:**

#### 1.4.1 Team-Specific Workspaces
- **Requirement:** Each team has isolated workspace directory
  - SEO: `/workspace/seo`
  - Marketing: `/workspace/marketing`
  - Frontend: `/workspace/frontend`
  - Backend: `/workspace/backend`
  - DevOps: `/workspace/infrastructure`
  - QA: `/workspace/tests`
  - C-Suite: `/workspace/csuite`
- **Rationale:** Prevent cross-team data access, enable team-specific permissions
- **Validation:** Agent from Team A cannot read files from Team B workspace

#### 1.4.2 Volume Mount Permissions
- **Requirement:** Team agents mount only their team's workspace
  ```bash
  # Frontend agent
  docker run -v /workspace/frontend:/workspace:rw cfn-docker-agent-nodejs

  # Backend agent (read-only to frontend for API contract validation)
  docker run -v /workspace/backend:/workspace:rw \
             -v /workspace/frontend:/workspace-readonly/frontend:ro \
             cfn-docker-agent-nodejs
  ```
- **Rationale:** Filesystem-level isolation prevents accidental or malicious access
- **Validation:** Test agent cannot write to read-only mounts

#### 1.4.3 Skill Directory Isolation
- **Requirement:** Skills copied to team workspace during provisioning
  ```bash
  /workspace/seo/
    ├── code/              # Team's work output
    └── skills/            # Team's allowed skills (copied)
        ├── content-generation/
        ├── keyword-research/
        └── database-readonly/
  ```
- **Rationale:** Teams can only execute skills they're authorized for
- **Validation:** SEO team cannot access `stripe-payments/` skill

### 1.5 Skill-Based Access Control

**MUST-HAVE (P0) - Security Critical:**

#### 1.5.1 Skill Variants
- **Requirement:** Read-only and read-write variants for sensitive resources
  - `database-readonly/` - SELECT queries only
  - `database-readwrite/` - Full CRUD operations
  - `docker-readonly/` - Inspect containers only
  - `docker-readwrite/` - Full Docker API access
- **Rationale:** Principle of least privilege
- **Implementation:**
  ```bash
  /skills/database-readonly/
    ├── config.json     # DB credentials: readonly_user
    ├── query.sh        # SELECT queries only
    └── README.md

  /skills/database-readwrite/
    ├── config.json     # DB credentials: admin_user
    ├── query.sh        # All operations
    ├── migrate.sh      # Schema migrations
    └── README.md
  ```

#### 1.5.2 Team Skill Allowlists
- **Requirement:** Team config defines allowed skills
  ```yaml
  # config/teams/seo.yaml
  team:
    id: seo
    allowed_skills:
      - content-generation
      - keyword-research
      - database-readonly   # ← Read-only variant only
  ```
- **Rationale:** Explicit permission model, auditable
- **Validation:** Team provisioning only copies allowed skills

#### 1.5.3 MCP Server Permissions (Future)
- **Note:** MCP servers disabled for initial implementation
- **Future:** Per-team MCP server configuration with permission model
- **Placeholder:** Reserve architecture for MCP permission system

### 1.6 Network Segmentation Architecture

**MUST-HAVE (P0) - Isolation Required:**

#### 1.6.1 Network Topology
- **Requirement:** Isolated Docker networks per team + coordination network
  ```
  cfn-coordination (172.18.0.0/24)
    ├── cfn-docker-main-coordinator (172.18.0.10)
    ├── cfn-docker-team-coordinator-seo (172.18.0.15)
    ├── cfn-docker-team-coordinator-marketing (172.18.0.16)
    ├── cfn-docker-team-coordinator-frontend (172.18.0.11)
    ├── cfn-docker-team-coordinator-backend (172.18.0.12)
    ├── cfn-docker-team-coordinator-devops (172.18.0.13)
    ├── cfn-docker-team-coordinator-qa (172.18.0.14)
    ├── cfn-docker-team-coordinator-csuite (172.18.0.17)
    ├── cfn-redis-shared (172.18.0.20)
    └── cfn-postgres (172.18.0.30)

  team-seo (172.18.5.0/24)
  team-marketing (172.18.6.0/24)
  team-frontend (172.18.1.0/24)
  team-backend (172.18.2.0/24)
  team-devops (172.18.3.0/24)
  team-qa (172.18.4.0/24)
  team-csuite (172.18.7.0/24)
  ```
- **Rationale:** Network-level isolation prevents cross-team communication
- **Validation:** Agent in team-frontend cannot ping agent in team-backend

#### 1.6.2 Network Creation Script
- **Implementation:** `scripts/create-networks.sh`
  ```bash
  docker network create --driver bridge --subnet 172.18.0.0/24 cfn-coordination
  docker network create --driver bridge --subnet 172.18.1.0/24 team-frontend
  docker network create --driver bridge --subnet 172.18.2.0/24 team-backend
  docker network create --driver bridge --subnet 172.18.3.0/24 team-devops
  docker network create --driver bridge --subnet 172.18.4.0/24 team-qa
  docker network create --driver bridge --subnet 172.18.5.0/24 team-seo
  docker network create --driver bridge --subnet 172.18.6.0/24 team-marketing
  docker network create --driver bridge --subnet 172.18.7.0/24 team-csuite
  ```

#### 1.6.3 Firewall Rules (iptables)
- **Requirement:** Block cross-team communication
  ```bash
  # Allow agents → team coordinator
  iptables -A DOCKER-USER -s 172.18.1.11/28 -d 172.18.1.10 -j ACCEPT

  # Block agents → other team networks
  iptables -A DOCKER-USER -s 172.18.1.11/28 -d 172.18.2.0/24 -j DROP
  ```
- **Rationale:** Defense in depth, prevents network-level attacks
- **Validation:** Network isolation test suite

---

## 2. Multi-Runtime Support Requirements

### 2.1 Required Language Runtimes

**MUST-HAVE (P0):**

#### 2.1.1 Node.js Runtime
- **Base Image:** `node:20-slim`
- **Use Cases:** TypeScript/JavaScript development, React/Vue frontends, Express backends
- **Agent Types:**
  - `react-frontend-engineer`
  - `backend-developer`
  - `api-designer`
  - `playwright-tester` (requires Playwright browsers)
- **Status:** Implemented (Dockerfile.agent)
- **Build Time:** <20s with Linux build script
- **Image Size Target:** <500MB (without Playwright), <1.5GB (with Playwright)

#### 2.1.2 Python Runtime
- **Base Image:** `python:3.11-slim`
- **Use Cases:** Data processing, ML/AI, scripting, backend APIs
- **Agent Types:**
  - `data-engineer`
  - `ml-specialist`
  - `python-backend-developer`
  - `data-validation-specialist`
- **Required Packages:**
  - `redis-py` (coordination)
  - `pyyaml` (agent profile parsing)
  - `requests` (API calls)
- **Status:** Not implemented
- **Build Time Target:** <30s with Linux build script
- **Image Size Target:** <400MB

#### 2.1.3 Rust Runtime
- **Base Image:** `rust:1.75-slim` (builder) + `debian:bookworm-slim` (runtime)
- **Use Cases:** High-performance processing, systems programming, security tools
- **Agent Types:**
  - `rust-backend-developer`
  - `performance-optimization-specialist`
  - `security-scanning-specialist`
- **Required Crates:**
  - `redis` (coordination)
  - `serde`, `serde_yaml` (config parsing)
  - `tokio` (async runtime)
- **Status:** Not implemented
- **Build Time Target:** <120s (Rust compilation overhead)
- **Image Size Target:** <200MB (minimal runtime)

#### 2.1.4 Go Runtime
- **Base Image:** `golang:1.21-alpine` (builder) + `alpine:3.19` (runtime)
- **Use Cases:** Microservices, CLI tools, concurrent processing
- **Agent Types:**
  - `go-backend-developer`
  - `microservices-specialist`
  - `concurrency-specialist`
- **Required Modules:**
  - `github.com/go-redis/redis/v9` (coordination)
  - `gopkg.in/yaml.v3` (config parsing)
- **Status:** Not implemented
- **Build Time Target:** <60s
- **Image Size Target:** <150MB (minimal runtime)

**SHOULD-HAVE (P1):**

#### 2.1.5 Java Runtime
- **Base Image:** `eclipse-temurin:21-jre-alpine`
- **Use Cases:** Enterprise applications, Spring backends, Android development
- **Agent Types:**
  - `java-backend-developer`
  - `spring-specialist`
  - `enterprise-integration-specialist`
- **Required Libraries:**
  - `lettuce-core` (Redis client)
  - `jackson` (JSON/YAML parsing)
- **Status:** Not implemented
- **Build Time Target:** <90s
- **Image Size Target:** <300MB

**MAY-HAVE (P2):**
- Ruby runtime (Rails development)
- PHP runtime (WordPress/Laravel)
- .NET runtime (C# development)

### 2.2 Runtime Selection Mechanism

**MUST-HAVE (P0):**

#### 2.2.1 Agent Profile Metadata
- **Requirement:** Agents specify required runtime in frontmatter
  ```yaml
  ---
  type: data-engineer
  runtime: python
  runtime_version: ">=3.10"
  dependencies:
    - pandas
    - numpy
  ---
  ```
- **Rationale:** Coordinator can select correct image without hardcoding
- **Validation:** All agent profiles validated at build time

#### 2.2.2 Coordinator Spawn Logic
- **Requirement:** Coordinator reads agent profile and selects image
  ```javascript
  const agentProfile = loadAgentProfile(agentType);
  const runtime = agentProfile.runtime || 'nodejs'; // default
  const image = `cfn-agent-${runtime}:latest`;

  const container = await docker.createContainer({
    Image: image,
    // ... rest of config
  });
  ```
- **Rationale:** Transparent runtime selection
- **Validation:** Test spawning all runtime types

#### 2.2.3 Fallback Strategy
- **Requirement:** If runtime-specific image missing, use Node.js as fallback with warning
- **Rationale:** Graceful degradation prevents task failures
- **Implementation:**
  ```javascript
  let image = `cfn-agent-${runtime}:latest`;
  const imageExists = await docker.getImage(image).inspect().catch(() => null);

  if (!imageExists) {
    console.warn(`Image ${image} not found, falling back to nodejs`);
    image = 'cfn-agent-nodejs:latest';
  }
  ```

### 2.3 Runtime Configuration

**MUST-HAVE (P0):**

#### 2.3.1 Runtime-Specific Environment Variables
- **Requirement:** Runtime-specific config passed via environment
  - Node.js: `NODE_ENV`, `NODE_OPTIONS`
  - Python: `PYTHONPATH`, `PYTHONUNBUFFERED`
  - Rust: `RUST_LOG`, `RUST_BACKTRACE`
  - Go: `GOMAXPROCS`, `GODEBUG`
  - Java: `JAVA_OPTS`, `JVM_HEAP_SIZE`
- **Rationale:** Runtime optimization without rebuilding images
- **Validation:** Test with various runtime configs

#### 2.3.2 Dependency Management
- **Requirement:** Images include common dependencies; additional deps installed at runtime
  - Node.js: `package.json` mounted, `npm install` in entry point
  - Python: `requirements.txt` mounted, `pip install` in entry point
  - Rust: Pre-compiled binaries (no runtime deps)
  - Go: Pre-compiled binaries (no runtime deps)
- **Rationale:** Balance between image size and flexibility
- **Constraint:** Runtime install adds 5-30s to spawn time (acceptable for P1)

---

## 3. Testing Strategy Requirements

### 3.1 Build-Time Testing

**MUST-HAVE (P0) - Image Contract Tests:**

#### 3.1.1 Contract Compliance Test Suite
**File:** `tests/docker/contract/test-image-contract.sh`

**Test Cases:**
1. **User and Permissions**
   - UID/GID = 1000:1000
   - Home directory = `/home/cfnagent`
   - Workspace writable by user

2. **Environment Variables**
   - All CFN contract variables supported
   - Legacy variables mapped correctly
   - Required variables validated

3. **Entry Point**
   - `--help` flag works
   - `--version` returns valid version
   - `--validate` performs self-check

4. **Health Check**
   - Responds within 5 seconds
   - Returns exit code 0 on success
   - Verifies Redis connectivity

5. **Signal Handling**
   - SIGTERM handled gracefully
   - Cleanup occurs within 10 seconds
   - Exit code = 130

**Gate:** Build fails if any test fails

**Execution:** `./tests/docker/contract/test-image-contract.sh cfn-agent-nodejs:latest`

#### 3.1.2 Runtime Capability Tests
**File:** `tests/docker/contract/test-runtime-capabilities.sh`

**Test Cases:**
1. **Redis Operations**
   - Connect to Redis
   - SET key/value
   - GET key/value
   - LPUSH/RPOP queue operations
   - INCR counter

2. **Filesystem Operations**
   - Read from `/app/workspace`
   - Write to `/app/workspace`
   - Execute scripts
   - Handle file permissions correctly

3. **Memory Limits**
   - Respect `--memory` flag
   - Handle OOM gracefully (exit 137)
   - Cleanup on OOM

**Gate:** Build fails if any test fails

**Execution:** `./tests/docker/contract/test-runtime-capabilities.sh cfn-agent-nodejs:latest`

### 3.2 Cross-Runtime Coordination Tests

**MUST-HAVE (P0):**

#### 3.2.1 Multi-Runtime Task Queue Test
**File:** `tests/docker/coordination/test-multi-runtime-queue.sh`

**Scenario:**
1. Push 10 tasks to Redis queue
2. Spawn 2 Node.js agents
3. Spawn 2 Python agents
4. Spawn 1 Rust agent
5. Verify all tasks completed correctly
6. Verify no task duplication
7. Verify completion counter = 10

**Validation:**
- All runtimes can claim tasks atomically
- Results are stored in consistent format
- No race conditions or deadlocks

**Gate:** CI test (not build blocker)

#### 3.2.2 Protocol Version Negotiation Test
**File:** `tests/docker/coordination/test-protocol-versioning.sh`

**Scenario:**
1. Spawn old contract version agent (v1.0.0)
2. Spawn new contract version agent (v2.0.0)
3. Verify both can communicate via Redis
4. Verify version warnings are logged
5. Verify backward compatibility

**Validation:**
- Protocol version mismatches detected
- Graceful degradation occurs
- No silent failures

**Gate:** CI test (not build blocker)

### 3.3 Regression Testing

**MUST-HAVE (P0):**

#### 3.3.1 Image Drift Detection
**File:** `tests/docker/regression/test-image-drift.sh`

**Purpose:** Detect unintended changes between versions

**Method:**
1. Build image with tag `<version>`
2. Build image with tag `<version>-test`
3. Compare:
   - Layer hashes
   - File sizes
   - Label metadata
   - Entry point behavior
4. Flag unexpected differences

**Gate:** CI warning (human review required)

#### 3.3.2 Coordination Protocol Regression
**File:** `tests/docker/regression/test-coordination-protocol.sh`

**Purpose:** Ensure coordination protocol remains compatible

**Method:**
1. Run baseline B10 test (32 agents, 10 files)
2. Verify success rate ≥95%
3. Verify coordination latency <500ms
4. Verify zero deadlocks
5. Compare against previous baseline

**Gate:** CI test (blocks release if <90%)

### 3.4 Performance Testing

**SHOULD-HAVE (P1):**

#### 3.4.1 Build Time Benchmarks
**File:** `tests/docker/performance/test-build-time.sh`

**Targets:**
- Node.js: <20s
- Python: <30s
- Rust: <120s
- Go: <60s
- Java: <90s

**Validation:** Log build times, warn if targets exceeded

#### 3.4.2 Spawn Time Benchmarks
**File:** `tests/docker/performance/test-spawn-time.sh`

**Targets:**
- Cold spawn (pull + create + start): <10s
- Warm spawn (create + start): <2s
- Task claim latency: <100ms

**Validation:** Log spawn times, warn if targets exceeded

#### 3.4.3 Memory Footprint Benchmarks
**File:** `tests/docker/performance/test-memory-footprint.sh`

**Targets:**
- Node.js idle: <100MB
- Python idle: <80MB
- Rust idle: <20MB
- Go idle: <30MB
- Java idle: <150MB

**Validation:** Log memory usage, warn if targets exceeded

---

## 4. Coordination Protocol Requirements

### 4.1 Message Encoding/Decoding

**MUST-HAVE (P0):**

#### 4.1.1 Standardized Message Format
- **Requirement:** All runtimes encode/decode messages in same format
- **Format:** JSON with UTF-8 encoding
- **Schema:**
  ```json
  {
    "version": "1.0.0",
    "task_id": "string",
    "agent_id": "string",
    "status": "pending|in_progress|completed|failed",
    "files": ["array", "of", "strings"],
    "metadata": {
      "key": "value"
    },
    "timestamp": "ISO-8601"
  }
  ```
- **Rationale:** JSON universally supported, human-readable for debugging
- **Validation:** Cross-runtime message parsing tests

#### 4.1.2 Redis Key Naming Convention
- **Requirement:** Consistent key naming across runtimes
- **Convention:**
  - Tasks: `task:{task_id}` (hash)
  - Queue: `task:queue` (list)
  - Counters: `task:total`, `task:completed` (strings)
  - Results: `task:{task_id}:result` (hash)
  - Coordination: `coord:{channel}:{message}` (pubsub)
- **Rationale:** Prevents key collision and enables debugging
- **Validation:** Key naming compliance test

#### 4.1.3 Error Handling Protocol
- **Requirement:** Agents report errors in standardized format
- **Format:**
  ```json
  {
    "task_id": "string",
    "agent_id": "string",
    "error_type": "validation|execution|timeout|oom",
    "error_message": "string",
    "stack_trace": "string (optional)",
    "timestamp": "ISO-8601"
  }
  ```
- **Storage:** `task:{task_id}:error` (hash)
- **Rationale:** Enables coordinator to diagnose failures
- **Validation:** Error reporting test across runtimes

### 4.2 Protocol Versioning

**MUST-HAVE (P0):**

#### 4.2.1 Version Negotiation
- **Requirement:** Agents and coordinator negotiate protocol version at startup
- **Mechanism:**
  1. Agent sets `agent:{agent_id}:version` = "1.0.0"
  2. Coordinator reads version before task assignment
  3. Coordinator logs version mismatch warning
  4. Task proceeds if version compatible
- **Compatibility Matrix:**
  - v1.0.0 ↔ v1.x.x: Compatible
  - v1.x.x ↔ v2.x.x: Degraded (warnings)
  - v2.x.x ↔ v3.x.x: Incompatible (fail fast)
- **Rationale:** Enables rolling upgrades without downtime
- **Validation:** Version negotiation test

#### 4.2.2 Breaking Change Prevention
- **Requirement:** Breaking changes require major version bump
- **Definition of Breaking Change:**
  - Remove required field from message
  - Change field type (string → number)
  - Change Redis key naming
  - Remove required environment variable
- **Process:**
  1. Document breaking change in CHANGELOG
  2. Bump major version (1.0.0 → 2.0.0)
  3. Update compatibility matrix
  4. Release migration guide
- **Validation:** Schema validation test

### 4.3 Backward Compatibility

**MUST-HAVE (P0):**

#### 4.3.1 Legacy Variable Support
- **Requirement:** Support CFN_ and legacy (non-prefixed) variables for 2 major versions
- **Example:**
  - v1.0.0: `REDIS_HOST` (legacy only)
  - v2.0.0: `CFN_REDIS_HOST` + `REDIS_HOST` (both, with warning)
  - v3.0.0: `CFN_REDIS_HOST` only (legacy removed)
- **Implementation:**
  ```bash
  REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-cfn-redis}}"
  if [ -n "${REDIS_HOST}" ] && [ -z "${CFN_REDIS_HOST}" ]; then
    echo "WARNING: REDIS_HOST is deprecated, use CFN_REDIS_HOST" >&2
  fi
  ```
- **Rationale:** Gradual migration without breaking existing deployments
- **Validation:** Legacy variable compatibility test

#### 4.3.2 Message Format Versioning
- **Requirement:** Messages include `version` field for schema evolution
- **Handling:**
  ```python
  def parse_message(msg):
      version = msg.get('version', '1.0.0')
      if version == '1.0.0':
          return parse_v1(msg)
      elif version == '2.0.0':
          return parse_v2(msg)
      else:
          raise UnsupportedVersionError(version)
  ```
- **Rationale:** Enables schema evolution without breaking changes
- **Validation:** Message parsing version test

### 4.4 Hierarchical Coordination Protocol

**MUST-HAVE (P0) - Architecture Required:**

#### 4.4.1 Three-Tier Architecture
- **Requirement:** Main Coordinator → Team Coordinators → Agents
  ```
  cfn-docker-main-coordinator
    ├── cfn-docker-team-coordinator-seo
    │   ├── cfn-agent-seo-001
    │   ├── cfn-agent-seo-002
    │   └── cfn-agent-seo-003
    ├── cfn-docker-team-coordinator-frontend
    │   ├── cfn-agent-frontend-001
    │   └── cfn-agent-frontend-002
    └── ... (5 more team coordinators)
  ```
- **Rationale:** Enables team isolation, resource allocation, cross-team coordination
- **Validation:** Hierarchical message routing test

#### 4.4.2 Main Coordinator ↔ Team Coordinator Protocol
- **Requirement:** Standardized message format for coordinator communication
- **Channels:**
  - `main:directives` - Main → All Team Coordinators (broadcast)
  - `coordinator:{team_id}:inbox` - Main → Specific Team Coordinator
  - `main:escalations` - Team Coordinators → Main (resource requests, failures)
  - `coordination:cross-team` - Inter-team coordination requests

- **Message Types:**
  ```json
  {
    "message_type": "directive|escalation|resource_request|status_update",
    "from": {
      "type": "main_coordinator|team_coordinator",
      "id": "coordinator_id"
    },
    "to": {
      "type": "main_coordinator|team_coordinator",
      "team_id": "team_id (optional)"
    },
    "payload": {
      "action": "spawn_team|shutdown_team|allocate_resources|report_failure",
      "data": {}
    },
    "timestamp": "ISO-8601"
  }
  ```

#### 4.4.3 Team Coordinator ↔ Agent Protocol
- **Requirement:** Team coordinators manage agent lifecycle
- **Channels:**
  - `agent:{team_id}:inbox:{agent_id}` - Team → Agent (task assignment)
  - `coordinator:{team_id}:inbox` - Agent → Team (status updates)
  - `team:{team_id}:monitoring:heartbeats` - Agent heartbeats

- **Task Assignment Message:**
  ```json
  {
    "message_id": "uuid",
    "correlation_id": "task_id",
    "from": {
      "type": "coordinator",
      "team": "team_id",
      "id": "coordinator"
    },
    "to": {
      "type": "agent",
      "team": "team_id",
      "id": "agent_id"
    },
    "message_type": "task",
    "priority": "low|medium|high|critical",
    "payload": {
      "task_id": "uuid",
      "description": "Task description",
      "files": ["file1.ts", "file2.ts"],
      "deadline": "ISO-8601 (optional)"
    }
  }
  ```

#### 4.4.4 Escalation Protocol
- **Requirement:** Team coordinators escalate to main coordinator
- **Escalation Triggers:**
  - Physical resource exceeded (memory >90%, CPU >90%)
  - Agent failure rate >20% (3+ failures in 1 hour)
  - Task queue depth >50 (team overloaded)
  - Network isolation failure detected

- **Escalation Message:**
  ```json
  {
    "message_type": "escalation",
    "from": {"type": "team_coordinator", "team": "team_id"},
    "to": {"type": "main_coordinator"},
    "payload": {
      "escalation_type": "resource_exceeded|agent_failures|queue_overload",
      "severity": "warning|critical",
      "context": {
        "memory_used_gb": 14.5,
        "memory_limit_gb": 12.0,
        "failed_agents": ["agent-001", "agent-002"]
      },
      "requested_action": "allocate_more_memory|restart_agents|redistribute_tasks"
    }
  }
  ```

---

## 5. Operational Requirements

### 5.1 Image Versioning Strategy

**MUST-HAVE (P0):**

#### 5.1.1 Semantic Versioning
- **Requirement:** All images follow SemVer (MAJOR.MINOR.PATCH)
  - MAJOR: Breaking changes (protocol, contract, API)
  - MINOR: New features (new runtime, new capabilities)
  - PATCH: Bug fixes, security patches
- **Tags:**
  - `cfn-agent-nodejs:3.1.2` (specific version)
  - `cfn-agent-nodejs:3.1` (minor version)
  - `cfn-agent-nodejs:3` (major version)
  - `cfn-agent-nodejs:latest` (latest stable)
  - `cfn-agent-nodejs:dev` (development)
- **Rationale:** Enables pinning versions and gradual rollouts
- **Validation:** Tag validation test

#### 5.1.2 Version Labeling
- **Requirement:** Images include version metadata in labels
  ```dockerfile
  LABEL com.claudeflownovice.version="3.1.2" \
        com.claudeflownovice.contract.version="1.0.0" \
        com.claudeflownovice.build.date="2025-11-14T12:00:00Z" \
        com.claudeflownovice.build.source="abc123def"
  ```
- **Rationale:** Enables version discovery at runtime
- **Validation:** `docker inspect <image> | jq .Config.Labels`

#### 5.1.3 Changelog Maintenance
- **Requirement:** All version changes documented in `docker/CHANGELOG.md`
- **Format:**
  ```markdown
  ## [3.1.2] - 2025-11-14
  ### Fixed
  - Fixed Redis connection timeout handling
  - Improved SIGTERM cleanup

  ### Security
  - Updated base image to patch CVE-2025-1234
  ```
- **Rationale:** Enables users to understand changes between versions
- **Validation:** Manual review

### 5.2 Compatibility Matrices

**MUST-HAVE (P0):**

#### 5.2.1 Runtime Compatibility Matrix
**File:** `docker/COMPATIBILITY_MATRIX.md`

| Image Version | Contract Version | Node.js | Python | Rust | Go | Java |
|---------------|------------------|---------|--------|------|----|----- |
| 3.0.0 | 1.0.0 | ✅ 20.x | ❌ | ❌ | ❌ | ❌ |
| 3.1.0 | 1.0.0 | ✅ 20.x | ✅ 3.11+ | ❌ | ❌ | ❌ |
| 3.2.0 | 1.0.0 | ✅ 20.x | ✅ 3.11+ | ✅ 1.75+ | ✅ 1.21+ | ❌ |
| 4.0.0 | 2.0.0 | ✅ 22.x | ✅ 3.12+ | ✅ 1.76+ | ✅ 1.22+ | ✅ 21+ |

**Purpose:** Document supported runtimes per version

#### 5.2.2 Coordinator Compatibility Matrix
**File:** `docker/COMPATIBILITY_MATRIX.md`

| Coordinator | Agent Nodejs | Agent Python | Agent Rust | Agent Go | Agent Java |
|-------------|-------------|-------------|-----------|---------|-----------|
| v3.0.0 | 3.0.x | ❌ | ❌ | ❌ | ❌ |
| v3.1.0 | 3.0.x - 3.1.x | 3.1.x | ❌ | ❌ | ❌ |
| v3.2.0 | 3.0.x - 3.2.x | 3.1.x - 3.2.x | 3.2.x | 3.2.x | ❌ |
| v4.0.0 | 4.0.x+ | 4.0.x+ | 4.0.x+ | 4.0.x+ | 4.0.x+ |

**Purpose:** Document coordinator-agent version compatibility

### 5.3 Rollback Strategy

**MUST-HAVE (P0):**

#### 5.3.1 Version Pinning
- **Requirement:** Coordinator can specify exact agent versions
  ```javascript
  const container = await docker.createContainer({
    Image: `cfn-agent-${runtime}:${version}`, // explicit version
    // ...
  });
  ```
- **Rationale:** Enables rollback to previous version if issues found
- **Validation:** Spawn test with explicit version

#### 5.3.2 Rollback Procedure
**File:** `docker/ROLLBACK_PROCEDURE.md`

**Steps:**
1. Identify problematic version (e.g., 3.1.2)
2. Update coordinator config to pin previous version (3.1.1)
3. Restart coordinator
4. Verify agents spawn with correct version
5. Monitor for issues
6. If stable, document root cause
7. Release patched version (3.1.3)

**Validation:** Rollback simulation test

### 5.4 Health Checks and Monitoring

**MUST-HAVE (P0):**

#### 5.4.1 Container Health Checks
- **Requirement:** Dockerfiles include HEALTHCHECK directive
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD /app/entrypoint.sh --health-check || exit 1
  ```
- **Health Check Script:**
  - Verify Redis connectivity
  - Verify filesystem access
  - Verify memory usage < 90%
- **Rationale:** Enables Docker orchestration (Swarm, K8s) to detect unhealthy agents
- **Validation:** Health check test

#### 5.4.2 Metrics Export
- **Requirement:** Agents export metrics to Redis
  - Key: `metrics:{agent_id}`
  - Fields: `cpu_percent`, `memory_mb`, `tasks_completed`, `uptime_seconds`
  - Update frequency: Every 30 seconds
- **Rationale:** Enables coordinator to monitor agent health
- **Validation:** Metrics export test

**SHOULD-HAVE (P1):**

#### 5.4.3 Prometheus Metrics
- **Requirement:** Coordinator exports Prometheus metrics
  - `cfn_agents_spawned_total` (counter)
  - `cfn_agents_active` (gauge)
  - `cfn_tasks_completed_total` (counter)
  - `cfn_task_duration_seconds` (histogram)
- **Rationale:** Enables production monitoring and alerting
- **Implementation:** Prometheus exporter sidecar

### 5.4 Knowledge Persistence Strategy

**MUST-HAVE (P0) - Data Loss Prevention:**

#### 5.4.1 Multi-Tier Storage Architecture
- **Requirement:** Three-tier storage for agent knowledge and task history
  ```
  Layer 1: Redis (Hot Storage)
    ├── TTL: 7 days
    ├── Purpose: Real-time agent state, recent knowledge
    └── Namespace: team:{team_id}:agent:{role}:{id}:*

  Layer 2: PostgreSQL (Warm Storage)
    ├── Retention: Permanent
    ├── Purpose: Agent profiles, playbooks, knowledge base, task history
    └── Tables: agents, playbooks, knowledge_entries, task_history

  Layer 3: S3/MinIO (Cold Storage - Future)
    ├── Retention: 7 years
    ├── Purpose: Historical playbooks (>180 days), old task logs (>90 days)
    └── Lifecycle: Archive after 180 days
  ```
- **Rationale:** Balance performance (Redis), durability (PostgreSQL), cost (S3)
- **Validation:** Data persistence test (agent crash → knowledge restored)

#### 5.4.2 PostgreSQL Schema
- **Requirement:** Standardized schema for all teams
  ```sql
  CREATE TABLE agents (
      id UUID PRIMARY KEY,
      team_id VARCHAR(50) NOT NULL,
      role VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL,
      spawned_at TIMESTAMP NOT NULL,
      last_heartbeat TIMESTAMP,
      total_tasks_completed INTEGER DEFAULT 0,
      avg_confidence DECIMAL(3, 2),
      metadata JSONB,
      INDEX idx_team_status (team_id, status)
  );

  CREATE TABLE playbooks (
      id UUID PRIMARY KEY,
      agent_id UUID REFERENCES agents(id),
      team_id VARCHAR(50) NOT NULL,
      playbook_name VARCHAR(200) NOT NULL,
      playbook_content JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      success_rate DECIMAL(5, 2),
      times_used INTEGER DEFAULT 0,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      UNIQUE (agent_id, playbook_name, version)
  );

  CREATE TABLE knowledge_entries (
      id UUID PRIMARY KEY,
      owner_id UUID REFERENCES agents(id),
      team_id VARCHAR(50) NOT NULL,
      scope VARCHAR(20) NOT NULL,  -- agent|team|org
      category VARCHAR(100) NOT NULL,
      content JSONB NOT NULL,
      confidence DECIMAL(3, 2),
      created_at TIMESTAMP NOT NULL,
      INDEX idx_team_scope (team_id, scope)
  );

  CREATE TABLE task_history (
      id UUID,
      agent_id UUID REFERENCES agents(id),
      team_id VARCHAR(50) NOT NULL,
      task_description TEXT,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP,
      duration_seconds INTEGER,
      status VARCHAR(20) NOT NULL,
      confidence_reported DECIMAL(3, 2),
      input_tokens INTEGER,
      output_tokens INTEGER,
      metadata JSONB,
      PRIMARY KEY (id, start_time)
  ) PARTITION BY RANGE (start_time);
  ```

#### 5.4.3 Redis → PostgreSQL Migration
- **Requirement:** Automatic migration of knowledge from Redis to PostgreSQL
- **Trigger:** Every 24 hours (cron job)
- **Process:**
  1. Scan Redis keys matching `team:*:agent:*:knowledge:*`
  2. Extract knowledge entries with confidence >0.70
  3. Insert into `knowledge_entries` table (ON CONFLICT UPDATE confidence)
  4. Delete from Redis if successfully persisted
- **Rationale:** Prevents knowledge loss on Redis restart
- **Implementation:** `scripts/migrate-knowledge-to-postgres.sh`

#### 5.4.4 Playbook Management
- **Requirement:** Agents create and evolve playbooks based on task success
- **Playbook Creation Criteria:**
  - Task completed with confidence ≥0.90
  - No existing playbook for task category
  - Task took >3 steps (non-trivial)
- **Playbook Structure:**
  ```json
  {
    "playbook_name": "implement-react-component",
    "description": "Create new React component from specification",
    "steps": [
      {"action": "read_spec", "input": "spec_file"},
      {"action": "create_component", "template": "react-tsx"},
      {"action": "write_tests", "framework": "jest"},
      {"action": "validate_types", "tool": "tsc"}
    ],
    "success_criteria": ["tests_pass", "types_valid", "no_linter_errors"],
    "version": 1
  }
  ```
- **Versioning:** Increment version on playbook update (track evolution)

#### 5.4.5 Agent Failure Recovery
- **Requirement:** Restore agent state from PostgreSQL on crash
- **Recovery Process:**
  1. Detect agent failure (heartbeat timeout 90s)
  2. Query PostgreSQL for agent's last known state
  3. Spawn new agent container with same agent_id
  4. Restore knowledge from `knowledge_entries` to Redis
  5. Restore playbooks from `playbooks` table
  6. Resume task from last checkpoint (if applicable)
- **Rationale:** Minimize data loss, enable seamless failover
- **Validation:** Agent crash recovery test

### 5.5 Operational Logging (Troubleshooting)

**MUST-HAVE (P0) - Promoted Priority:**

#### 5.5.1 Operational Log Events
- **Requirement:** Log key events for troubleshooting
- **Event Types:**
  - `agent_spawn` - Agent container created
  - `agent_terminate` - Agent container stopped
  - `task_start` - Task execution began
  - `task_complete` - Task execution finished
  - `task_fail` - Task execution failed
  - `skill_used` - Agent executed specific skill
  - `memory_warning` - Memory usage >80%
  - `network_error` - Network connectivity issue
  - `coordination_failure` - Redis communication failed

#### 5.5.2 Log Storage Schema
- **Requirement:** PostgreSQL table for operational logs
  ```sql
  CREATE TABLE operational_logs (
      id UUID PRIMARY KEY,
      timestamp TIMESTAMP NOT NULL,
      team_id VARCHAR(50),
      agent_id VARCHAR(100),
      log_level VARCHAR(20),  -- DEBUG|INFO|WARN|ERROR
      event_type VARCHAR(50),
      message TEXT,
      context JSONB,  -- {task_id, skill_name, memory_mb, etc.}
      INDEX idx_timestamp (timestamp DESC),
      INDEX idx_team_agent (team_id, agent_id),
      INDEX idx_event_type (event_type)
  ) PARTITION BY RANGE (timestamp);
  ```

#### 5.5.3 Log Retention Policy
- **Requirement:** 7-day retention for operational logs
- **Implementation:**
  ```sql
  CREATE OR REPLACE FUNCTION delete_old_operational_logs()
  RETURNS void AS $$
  BEGIN
      DELETE FROM operational_logs
      WHERE timestamp < NOW() - INTERVAL '7 days';
  END;
  $$ LANGUAGE plpgsql;

  -- Run daily at 2 AM
  SELECT cron.schedule('delete-old-logs', '0 2 * * *',
    'SELECT delete_old_operational_logs()');
  ```
- **Rationale:** Balance troubleshooting needs with storage costs
- **Future:** Archive to S3 for long-term compliance (if needed)

#### 5.5.4 Log Query Patterns
- **Common Queries:**
  ```sql
  -- Why did this agent fail?
  SELECT * FROM operational_logs
  WHERE agent_id = 'agent-123' AND log_level = 'ERROR'
  ORDER BY timestamp DESC LIMIT 10;

  -- What skills did this agent use?
  SELECT context->>'skill_name', COUNT(*)
  FROM operational_logs
  WHERE agent_id = 'agent-123' AND event_type = 'skill_used'
  GROUP BY context->>'skill_name';

  -- How much memory did this task consume?
  SELECT context->>'memory_mb', timestamp
  FROM operational_logs
  WHERE context->>'task_id' = 'task-456'
  ORDER BY timestamp;

  -- Which team spawned the most agents?
  SELECT team_id, COUNT(*)
  FROM operational_logs
  WHERE event_type = 'agent_spawn'
  AND timestamp > NOW() - INTERVAL '24 hours'
  GROUP BY team_id
  ORDER BY COUNT(*) DESC;
  ```

---

## 6. Constraints

### 6.1 Performance Constraints

**MUST-HAVE (P0):**

#### 6.1.1 Build Time Limits
- **Constraint:** Build time MUST NOT exceed 5 minutes for any runtime
- **Rationale:** Enables rapid iteration during development
- **Current State:**
  - Node.js: 20s (✅ meets constraint)
  - Python: Not implemented (target: 30s)
  - Rust: Not implemented (target: 120s)
  - Go: Not implemented (target: 60s)
  - Java: Not implemented (target: 90s)
- **Mitigation:** Use Linux build script (96% faster), multi-stage builds, layer caching
- **Validation:** Build time benchmark test

#### 6.1.2 Image Size Limits
- **Constraint:** Image size MUST NOT exceed 2GB for any runtime (without Playwright)
- **Rationale:** Reduces pull time and storage costs
- **Current State:**
  - Node.js: <500MB (✅ meets constraint)
  - Python: Target <400MB
  - Rust: Target <200MB
  - Go: Target <150MB
  - Java: Target <300MB
- **Mitigation:** Use slim/alpine base images, multi-stage builds, remove dev dependencies
- **Validation:** Image size check

#### 6.1.3 Spawn Time Limits
- **Constraint:** Cold spawn MUST complete within 10 seconds
- **Rationale:** Enables responsive task execution
- **Current State:** Node.js <2s (✅ meets constraint)
- **Mitigation:** Pre-pull images, use Docker layer caching
- **Validation:** Spawn time benchmark test

#### 6.1.4 Memory Overhead Limits
- **Constraint:** Idle agent MUST consume <150MB RAM
- **Rationale:** Enables 40GB budget to support 250+ agents
- **Current State:** Node.js ~100MB (✅ meets constraint)
- **Mitigation:** Use slim runtimes, minimize dependencies, disable unnecessary services
- **Validation:** Memory footprint benchmark test

### 6.2 Security Constraints

**MUST-HAVE (P0):**

#### 6.2.1 User Isolation
- **Constraint:** Agents MUST run as non-root (UID 1000)
- **Rationale:** Prevents privilege escalation attacks
- **Current State:** Node.js ✅ (cfnagent user)
- **Validation:** UID check test

#### 6.2.2 Network Isolation
- **Constraint:** Agents MUST NOT access internet without explicit permission
- **Rationale:** Prevents data exfiltration
- **Implementation:** Docker network with no internet gateway (optional: use `--network=none`)
- **Validation:** Network isolation test

#### 6.2.3 Secret Management
- **Constraint:** API keys MUST NOT be embedded in images
- **Rationale:** Prevents secret leakage via image layers
- **Implementation:** Pass secrets via environment variables or Docker secrets
- **Validation:** Image layer scan for secrets

#### 6.2.4 Workspace Isolation
- **Constraint:** Agents MUST NOT access files outside `/app/workspace`
- **Rationale:** Prevents unauthorized file access
- **Implementation:** Mount workspace as read-only where possible, use AppArmor/SELinux
- **Validation:** Filesystem access test

### 6.3 Resource Constraints

**MUST-HAVE (P0):**

#### 6.3.1 Memory Budget
- **Constraint:** Total agent memory MUST NOT exceed 40GB
- **Rationale:** Host machine memory limit
- **Current State:** Four-tier batching strategy reduces usage by 66%
- **Implementation:** Coordinator tracks allocated memory, spawns waves to respect budget
- **Validation:** Memory budget enforcement test

#### 6.3.2 CPU Limits
- **Constraint:** Each agent limited to 1.0 CPU (configurable)
- **Rationale:** Prevents single agent monopolizing CPU
- **Implementation:** `--cpus=1.0` flag in docker create
- **Validation:** CPU limit enforcement test

#### 6.3.3 Disk Space
- **Constraint:** Workspace MUST NOT exceed 10GB per agent
- **Rationale:** Prevents disk exhaustion
- **Implementation:** `--storage-opt size=10G` flag in docker create
- **Validation:** Disk quota enforcement test

#### 6.3.4 Team Resource Budgets (Physical Resources)
- **Constraint:** Each team has dedicated physical resource allocation
- **Team Allocations:**
  ```yaml
  teams:
    seo:
      memory: 12GB
      cpu_cores: 4
      max_agents: 5
      disk_quota: 50GB

    marketing:
      memory: 10GB
      cpu_cores: 3
      max_agents: 4
      disk_quota: 40GB

    frontend:
      memory: 12GB
      cpu_cores: 4
      max_agents: 5
      disk_quota: 50GB

    backend:
      memory: 16GB
      cpu_cores: 5
      max_agents: 6
      disk_quota: 100GB

    devops:
      memory: 12GB
      cpu_cores: 4
      max_agents: 4
      disk_quota: 75GB

    qa:
      memory: 10GB
      cpu_cores: 3
      max_agents: 4
      disk_quota: 50GB

    csuite:
      memory: 8GB
      cpu_cores: 2
      max_agents: 3
      disk_quota: 30GB

  total:
    memory: 80GB (+ 10GB coordinators = 90GB host requirement)
    cpu_cores: 25
    max_agents: 31
    disk_quota: 395GB
  ```
- **Rationale:** Prevents one team from exhausting host resources
- **Implementation:** Team coordinator tracks allocation, prevents spawning beyond budget
- **Validation:** Resource budget enforcement test per team

#### 6.3.5 Resource Exhaustion Handling
- **Requirement:** Team coordinators handle resource exhaustion gracefully
- **Exhaustion Scenarios:**
  1. **Memory >90% of team budget:**
     - Log warning
     - Escalate to main coordinator
     - Queue new tasks instead of spawning agents
  2. **CPU >90% of team allocation:**
     - Log warning
     - Throttle agent spawning (backoff)
  3. **Disk >90% of team quota:**
     - Log error
     - Block new agent spawns
     - Escalate for cleanup
- **Recovery Actions:**
  - Main coordinator can temporarily increase team budget (manual approval)
  - Team coordinator can terminate idle agents to free resources
  - Automatic cleanup of old workspaces (>30 days inactive)

### 6.4 Compatibility Constraints

**MUST-HAVE (P0):**

#### 6.4.1 CFN Loop Protocol Compatibility
- **Constraint:** All runtimes MUST support CFN Loop coordination protocol
- **Rationale:** Enables multi-runtime swarms
- **Implementation:** Standardized Redis operations (see section 4.1)
- **Validation:** Cross-runtime coordination test

#### 6.4.2 Docker Version
- **Constraint:** Images MUST work with Docker Engine 20.10+
- **Rationale:** Common baseline for users
- **Validation:** Test on Docker 20.10, 23.0, 24.0

#### 6.4.3 Platform Support
- **Constraint:** Images MUST work on linux/amd64 and linux/arm64
- **Rationale:** Support M1/M2 Macs and ARM servers
- **Implementation:** Multi-platform builds via buildx
- **Validation:** Build and test on both platforms

---

## 7. Acceptance Criteria

### 7.1 Functional Requirements

**P0 (Release Blocker):**

- [ ] Node.js runtime image passes all contract compliance tests
- [ ] Python runtime image implemented and passes all contract compliance tests
- [ ] Rust runtime image implemented and passes all contract compliance tests
- [ ] Go runtime image implemented and passes all contract compliance tests
- [ ] Cross-runtime coordination test passes (5 runtimes, 10 tasks)
- [ ] Protocol version negotiation test passes
- [ ] Image contract test suite implemented and enforced
- [ ] Coordinator selects runtime based on agent profile
- [ ] Environment variable contract fully documented
- [ ] Rollback procedure documented and tested

**P1 (Post-Release):**

- [ ] Java runtime image implemented
- [ ] Prometheus metrics implemented
- [ ] Performance benchmarks within targets
- [ ] Multi-platform builds (amd64 + arm64)

### 7.2 Non-Functional Requirements

**P0 (Release Blocker):**

- [ ] Build time <5 minutes for all runtimes
- [ ] Image size <2GB for all runtimes (without Playwright)
- [ ] Cold spawn <10 seconds
- [ ] Idle memory <150MB per agent
- [ ] All agents run as non-root (UID 1000)
- [ ] No secrets in image layers
- [ ] Health checks respond within 5 seconds

**P1 (Post-Release):**

- [ ] Build time within targets (Node.js <20s, Python <30s, etc.)
- [ ] Image size within targets (Node.js <500MB, Python <400MB, etc.)
- [ ] Prometheus metrics exported
- [ ] Network isolation enforced

### 7.3 Quality Gates

**Build-Time Gates (MUST PASS):**

1. Contract compliance test suite (exit 0)
2. Runtime capability test suite (exit 0)
3. Signal handling test (exit 0)
4. Image size check (<2GB)
5. Secret scan (no secrets found)

**CI Gates (MUST PASS):**

1. Cross-runtime coordination test (≥95% success)
2. Protocol version negotiation test (exit 0)
3. Coordination protocol regression test (≥90% success)
4. Build time benchmark (within targets)

**Release Gates (MUST COMPLETE):**

1. Compatibility matrix updated
2. CHANGELOG updated
3. Rollback procedure tested
4. Documentation updated
5. Version tags applied

---

## 8. Risk Analysis

### 8.1 Technical Risks

#### 8.1.1 Runtime Drift
- **Risk:** Different runtimes implement coordination protocol differently
- **Probability:** Medium
- **Impact:** High (coordination failures)
- **Mitigation:**
  - Standardized message format (JSON)
  - Cross-runtime coordination tests
  - Reference implementation in Node.js
  - Strict contract compliance tests
- **Detection:** Coordination test failures in CI

#### 8.1.2 Protocol Breaking Changes
- **Risk:** Protocol changes break existing agents
- **Probability:** Medium
- **Impact:** High (production outages)
- **Mitigation:**
  - Version negotiation at startup
  - Backward compatibility for 2 major versions
  - Breaking change checklist
  - Migration guides
- **Detection:** Version negotiation warnings in logs

#### 8.1.3 Memory Budget Exceeded
- **Risk:** Wave spawning allocates more than 40GB
- **Probability:** Low
- **Impact:** High (OOM, system crash)
- **Mitigation:**
  - Coordinator tracks allocated memory
  - Wave spawning respects budget
  - Memory usage monitoring
  - Emergency cleanup on threshold
- **Detection:** Memory usage metrics, OOM events

#### 8.1.4 Image Size Growth
- **Risk:** Images exceed 2GB, slow pull times
- **Probability:** Medium
- **Impact:** Medium (slow spawns, storage costs)
- **Mitigation:**
  - Multi-stage builds
  - Layer caching
  - Regular size audits
  - Automated size checks in CI
- **Detection:** Image size benchmark alerts

### 8.2 Operational Risks

#### 8.2.1 Build Failures
- **Risk:** Docker build fails in CI or local environments
- **Probability:** Medium
- **Impact:** High (blocks development)
- **Mitigation:**
  - Use Linux build script (96% faster, prevents OOM)
  - Build time limits (fail fast)
  - Layer caching
  - Fallback to direct build
- **Detection:** Build time exceeded warnings

#### 8.2.2 Version Confusion
- **Risk:** Users deploy incompatible agent/coordinator versions
- **Probability:** Medium
- **Impact:** Medium (task failures)
- **Mitigation:**
  - Compatibility matrix documentation
  - Version negotiation at runtime
  - Warnings on version mismatch
  - Release notes with breaking changes
- **Detection:** Version mismatch warnings in logs

#### 8.2.3 Rollback Challenges
- **Risk:** Cannot rollback to previous version
- **Probability:** Low
- **Impact:** High (extended outage)
- **Mitigation:**
  - Documented rollback procedure
  - Version pinning support
  - Rollback simulation tests
  - Retain previous 3 versions
- **Detection:** Rollback procedure validation

### 8.3 Business Risks

#### 8.3.1 Complexity Overhead
- **Risk:** Multi-runtime support adds too much complexity
- **Probability:** Medium
- **Impact:** Medium (slower development)
- **Mitigation:**
  - Phased rollout (Node.js → Python → Rust/Go)
  - Comprehensive documentation
  - Reference implementations
  - Automated testing
- **Detection:** Development velocity metrics

#### 8.3.2 Maintenance Burden
- **Risk:** Maintaining 5+ runtime images too costly
- **Probability:** Low
- **Impact:** Medium (outdated runtimes)
- **Mitigation:**
  - Automated dependency updates (Dependabot)
  - Security scanning (Trivy)
  - Deprecation policy (EOL after 2 years)
  - Community contributions
- **Detection:** Security vulnerability reports

#### 8.3.3 Adoption Challenges
- **Risk:** Users don't adopt multi-runtime support
- **Probability:** Low
- **Impact:** Low (wasted effort)
- **Mitigation:**
  - Clear use case documentation
  - Example agent profiles
  - Migration guides
  - Success stories (ML, performance)
- **Detection:** Runtime usage metrics

---

## 9. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Deliverables:**
- [ ] Image contract specification finalized
- [ ] Contract compliance test suite implemented
- [ ] Node.js image updated to meet contract
- [ ] Environment variable contract fully aligned
- [ ] Documentation: Image contract, testing strategy

**Success Criteria:**
- Node.js image passes all contract tests
- Test suite covers 100% of contract requirements
- Zero contract alignment gaps

### Phase 2: Python Runtime (Week 3-4)

**Deliverables:**
- [ ] Python runtime Dockerfile implemented
- [ ] Python agent entry point script
- [ ] Python Redis coordination library
- [ ] Cross-runtime coordination test (Node.js + Python)
- [ ] Agent profiles updated with runtime metadata

**Success Criteria:**
- Python image passes all contract tests
- Cross-runtime test shows zero coordination failures
- Build time <30s, image size <400MB

### Phase 3: Rust + Go Runtimes (Week 5-6)

**Deliverables:**
- [ ] Rust runtime Dockerfile implemented
- [ ] Go runtime Dockerfile implemented
- [ ] Rust/Go entry point scripts
- [ ] Rust/Go Redis coordination libraries
- [ ] Cross-runtime coordination test (4 runtimes)

**Success Criteria:**
- Both images pass all contract tests
- Cross-runtime test shows ≥95% success
- Build times within targets (Rust <120s, Go <60s)

### Phase 4: Operational Readiness (Week 7-8)

**Deliverables:**
- [ ] Compatibility matrix documented
- [ ] Rollback procedure tested
- [ ] Version negotiation implemented
- [ ] Health checks and monitoring
- [ ] Performance benchmarks baselined

**Success Criteria:**
- Rollback simulation successful
- Version negotiation prevents incompatible pairings
- All performance targets met

### Phase 5: Java Runtime (Optional, Week 9-10)

**Deliverables:**
- [ ] Java runtime Dockerfile implemented
- [ ] Java agent entry point script
- [ ] Java Redis coordination library
- [ ] Cross-runtime coordination test (5 runtimes)

**Success Criteria:**
- Java image passes all contract tests
- Build time <90s, image size <300MB

---

## 10. Success Metrics

### 10.1 Technical Metrics

**Build Quality:**
- Contract compliance: 100% (all tests pass)
- Cross-runtime coordination success rate: ≥95%
- Build time within targets: ≥80% of builds
- Image size within targets: 100% of images

**Runtime Quality:**
- Spawn success rate: ≥99%
- Task completion rate: ≥95%
- Coordination latency: <500ms p95
- Memory overhead: <150MB per agent

### 10.2 Operational Metrics

**Reliability:**
- Zero breaking changes without major version bump
- Rollback success rate: 100%
- Version negotiation success: 100%
- Health check uptime: ≥99.9%

**Performance:**
- Build time reduction: 96% (vs Windows mount baseline)
- Spawn time: <2s warm, <10s cold
- Memory utilization: 80-85% of budget
- Parallel agent count: 250+ (40GB budget)

### 10.3 Business Metrics

**Adoption:**
- Use cases supported: 5+ (Node.js, Python, Rust, Go, Java)
- Agent types migrated: ≥20 (from 23 total)
- Production deployments: ≥3

**Efficiency:**
- Development velocity: No regression vs current state
- Maintenance overhead: <10% of development time
- Documentation coverage: ≥90%

---

## 11. Open Questions

### 11.1 Technical Decisions Required

1. **Q: Should we support agent-specific dependency installation at runtime?**
   - **Pro:** Flexibility, smaller base images
   - **Con:** Slower spawn times (5-30s), network dependency
   - **Recommendation:** Phase 2 feature, support via mounted `requirements.txt`

2. **Q: Should we use Docker Compose for multi-container orchestration?**
   - **Pro:** Simplified local development, standard tool
   - **Con:** Kubernetes required for production
   - **Recommendation:** Provide both Docker Compose (dev) and K8s manifests (prod)

3. **Q: Should images include development tools (debuggers, profilers)?**
   - **Pro:** Easier debugging in production
   - **Con:** Larger images, security risk
   - **Recommendation:** Separate dev images (e.g., `cfn-agent-nodejs:3.1.2-dev`)

4. **Q: Should we support GPU workloads (ML agents)?**
   - **Pro:** Enables CUDA-accelerated ML
   - **Con:** Requires NVIDIA runtime, specialized hardware
   - **Recommendation:** Phase 3 feature, separate ML-optimized images

### 11.2 Product Decisions Required

1. **Q: Which runtimes should be prioritized?**
   - **Current Priority:** Node.js (P0), Python (P0), Rust (P1), Go (P1), Java (P2)
   - **User Feedback Needed:** Survey users for runtime preferences

2. **Q: Should we maintain backward compatibility indefinitely?**
   - **Proposal:** Support legacy variables for 2 major versions, then deprecate
   - **Impact:** Reduces technical debt, requires migration effort

3. **Q: What is the EOL policy for runtime versions?**
   - **Proposal:** Align with upstream (Node.js 20 → EOL 2026-04-30)
   - **Action Required:** Document EOL timeline in compatibility matrix

---

## 12. Appendices

### Appendix A: Environment Variable Contract Reference

**See:** `docker/runtime/cfn-runtime.contract.yml`

**Key Sections:**
- Task configuration (`CFN_TASK_*`)
- Agent configuration (`CFN_AGENT_*`)
- Coordination (`CFN_REDIS_*`)
- Resources (`CFN_MEMORY_*`, `CFN_CPU_*`)
- Runtime (`CFN_DOCKER_*`, `CFN_CONTAINER_*`)

### Appendix B: Testing Matrix

| Test Type | Scope | Frequency | Blocker? |
|-----------|-------|-----------|----------|
| Contract Compliance | Per-image | Every build | Yes |
| Runtime Capabilities | Per-image | Every build | Yes |
| Cross-Runtime Coordination | All runtimes | Every commit | No |
| Protocol Versioning | Agent + Coordinator | Every commit | No |
| Regression (Image Drift) | Per-image | Every release | No (warning) |
| Regression (Coordination) | All runtimes | Every release | Yes |
| Performance (Build Time) | Per-image | Weekly | No (warning) |
| Performance (Spawn Time) | Per-image | Weekly | No (warning) |
| Performance (Memory) | Per-image | Weekly | No (warning) |

### Appendix C: Dockerfile Template

**File:** `docker/templates/Dockerfile.runtime-template`

```dockerfile
# ============================================================================
# CFN Agent - <RUNTIME> Runtime
# ============================================================================
# CRITICAL: Use Linux build script for 96% faster builds
# Build: ./.claude/skills/docker-build/build.sh --dockerfile Dockerfile.agent.<runtime> --tag cfn-agent-<runtime>:latest
# ============================================================================

# Stage 1: Builder
FROM <runtime-base-image> AS builder
WORKDIR /app
# ... runtime-specific build steps ...

# Stage 2: Runtime
FROM <runtime-slim-image>
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y bash curl jq git && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY --from=builder /app/bin /app/bin

# Create non-root user
RUN groupadd -g 1000 cfnagent && \
    useradd -u 1000 -g cfnagent -m -s /bin/bash cfnagent && \
    chown -R cfnagent:cfnagent /app

# Switch to non-root user
USER cfnagent

# Environment variables
ENV CFN_RUNTIME="<runtime>" \
    CFN_CONTRACT_VERSION="1.0.0" \
    NODE_ENV=production

# Metadata labels
LABEL com.claudeflownovice.version="3.0.0" \
      com.claudeflownovice.runtime="<runtime>" \
      com.claudeflownovice.contract.version="1.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD /app/entrypoint.sh --health-check || exit 1

# Entry point
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["--help"]
```

### Appendix D: References

**Documentation:**
- `docker/CLAUDE.md` - Docker infrastructure overview
- `docker/ENVIRONMENT_CONTRACT_ALIGNMENT_REPORT.md` - Contract alignment analysis
- `docker/runtime/cfn-runtime.contract.yml` - Environment variable contract
- `.claude/skills/docker-build/SKILL.md` - Linux build script documentation

**Code:**
- `docker/Dockerfile.agent` - Current Node.js image
- `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh` - Agent spawning logic
- `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh` - Coordinator orchestration

**Tests:**
- `docker/test-all.sh` - Current test suite (13/19 failures)
- `tests/docker/b10-typescript-fix-test.sh` - B10 batch test (reference)

---

## Document Metadata

**Version:** 1.0.0
**Last Updated:** 2025-11-14
**Author:** SPARC Specification Agent
**Confidence:** 0.92

**Review Status:** Draft - Awaiting stakeholder review

**Next Steps:**
1. Stakeholder review and feedback
2. Prioritize requirements (confirm P0/P1/P2)
3. Validate acceptance criteria
4. Approve implementation roadmap
5. Begin Phase 1 implementation

**Change History:**
- 2025-11-14: Initial draft created
