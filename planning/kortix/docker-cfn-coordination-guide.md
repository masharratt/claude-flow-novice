# Docker-Native CFN Loop Coordination Guide

**Learn how Docker containers work together with CFN Loops to prevent memory leaks and coordinate work efficiently.**

---

## What is Docker-Native Coordination?

Think of Docker-native coordination like having separate workrooms for different types of tasks. Each room has its own resources (memory, CPU) and can't affect other rooms. CFN Loops act like the manager that assigns work to the right rooms.

### Traditional vs Docker-Native

**Traditional (Problem):**
```
Host Computer
├── Agent 1 (can use ALL memory)
├── Agent 2 (can use ALL memory)
└── Agent 3 (can use ALL memory)
→ Problem: If one agent has a memory leak, the whole computer slows down
```

**Docker-Native (Solution):**
```
Host Computer
├── Container 1 (limited to 2GB memory)
├── Container 2 (limited to 4GB memory)
└── Container 3 (limited to 8GB memory)
→ Solution: Memory leak stays inside its container
```

---

## Key Components

### 1. Containers (The Workrooms)

**Task Mode Containers** - Small, focused workers
- Memory: 2GB
- CPU: 1 core
- Good for: Quick tasks, API calls, simple processing

**CLI Mode Containers** - Powerful workers
- Memory: 4GB
- CPU: 2 cores
- Good for: Complex analysis, large file processing

**Orchestrator Container** - The manager
- Memory: 8GB
- CPU: 2.5 cores
- Good for: Coordinating other agents, making decisions

**Telemetry Container** - The monitor
- Memory: 512MB
- CPU: 0.5 cores
- Good for: Collecting metrics, health checks

**Redis Container** - The message board
- Memory: 1GB
- CPU: 0.3 cores
- Good for: Storing messages, coordination data

### 2. Docker Compose (The Blueprint)

The `docker-compose.stabilization.yml` file is like a blueprint that tells Docker how to build and connect all the containers.

**Example section:**
```yaml
cfn-agent-task:
  build:
    dockerfile: Dockerfile.agent.stabilized
    target: task-mode  # Build the small worker version
  image: claude-flow-novice:agent-task-latest
  deploy:
    resources:
      limits:
        memory: ${CFN_TASK_MEMORY_LIMIT:-2048M}  # Use 2GB memory
        cpus: '${CFN_TASK_CPU_LIMIT:-1.0}'       # Use 1 CPU core
```

### 3. Environment Variables (The Settings)

Environment variables are like configuration settings that control how containers behave.

**Example from `docker.stabilization.env`:**
```bash
# Task Mode (Default) - Conservative Resource Limits
CFN_TASK_MEMORY_LIMIT=2048
CFN_TASK_CPU_LIMIT=1.0

# CLI Mode - Performance Resource Limits
CFN_CLI_MEMORY_LIMIT=4096
CFN_CLI_CPU_LIMIT=2.0
```

---

## How CFN Loops Work with Docker

### Step 1: Starting the System

When you run the deployment command:
```bash
./docker/scripts/docker-deploy.stabilization.sh deploy
```

Here's what happens:

1. **Docker reads the blueprint** (`docker-compose.stabilization.yml`)
2. **Builds the containers** using the Dockerfiles
3. **Applies resource limits** (memory, CPU) to each container
4. **Starts Redis** as the communication hub
5. **Launches the orchestrator** as the coordinator
6. **Creates agent pools** based on configuration

### Step 2: CFN Loop Coordination

CFN Loops work through three main phases:

#### Phase 1: Understanding the Task
The orchestrator receives a task like: *"Build a user authentication system"*

It breaks this down into:
- **What needs to be done:** Create login, signup, password reset
- **Who should do it:** Backend developer for APIs, frontend for UI, tester for validation
- **How to coordinate:** Use Redis for messages between containers

#### Phase 2: Assigning Work

The orchestrator starts containers and gives them specific jobs:

```bash
# Example: Starting a backend developer container
docker run -d \
  --name cfn-backend-developer \
  --memory 4GB \
  --cpu 2 \
  -e TASK_ID="auth-apis" \
  -e AGENT_ID="backend-dev-1" \
  claude-flow-novice:agent-cli-latest \
  "implement user authentication APIs"
```

#### Phase 3: Coordination via Redis

Containers communicate through Redis like workers using a message board:

**Backend Developer writes:**
```json
{
  "agent": "backend-developer",
  "status": "completed",
  "work_done": ["login-api", "signup-api", "token-service"],
  "confidence": 0.92
}
```

**Frontend Developer reads this and starts:**
```json
{
  "agent": "frontend-developer",
  "status": "starting",
  "work_needed": ["login-form", "signup-page"],
  "depends_on": "backend APIs completed"
}
```

---

## Real-World Examples

### Example 1: Building a Blog Platform

**Task:** "Create a blog platform with posts, comments, and user management"

**How it works:**

1. **Orchestrator** breaks it down:
   - Database design → Database architect container
   - User authentication → Backend developer container
   - Post management → Backend developer container
   - Comment system → Backend developer container
   - Frontend design → Frontend developer container
   - Testing → QA tester containers

2. **Coordination happens:**
   ```
   Redis Message Board:
   - DB_SCHEMA_READY ✅
   - AUTH_APIS_DONE ✅
   - POST_APIS_DONE ✅
   - COMMENT_APIS_DONE ✅
   - FRONTEND_IN_PROGRESS 🔄
   - TESTING_SCHEDULED ⏳
   ```

3. **Resource protection:**
   - If database architect has a memory leak → only affects that container
   - Other containers continue working normally
   - System automatically restarts the problematic container

### Example 2: Processing Large Data Files

**Task:** "Analyze 100GB of sales data and create reports"

**How it works:**

1. **Orchestrator** assigns work:
   - Data validation → Data engineer container (4GB memory)
   - Data cleaning → Data engineer container (4GB memory)
   - Analysis → Data scientist container (4GB memory)
   - Report generation → Report writer container (2GB memory)

2. **Memory safety:**
   ```
   Container Memory Limits:
   - Data validator: 4GB (can't crash the system)
   - Data cleaner: 4GB (protected from validator's issues)
   - Data scientist: 4GB (isolated memory space)
   - Report writer: 2GB (lightweight, focused)
   ```

3. **Progress tracking:**
   ```
   Redis Updates:
   sales:data:validation:progress → "75%"
   sales:data:cleaning:progress → "30%"
   sales:analysis:complete → ✅
   sales:reports:ready → ❌ (waiting for cleaning)
   ```

---

## Container Mode Detection

Each container automatically detects how it should work:

### Task Mode (Small Jobs)
```bash
# Inside container
export TASK_ID="quick-api-fix"
export AGENT_ID="dev-123"

# Container detects: "I'm doing a small task"
# Uses: 2GB memory, 1 CPU core
# Good for: Quick fixes, simple features
```

### CLI Mode (Big Jobs)
```bash
# Inside container
export CFN_SWARM_ID="big-analysis-456"
export CFN_REDIS_URL="redis://redis:6379"

# Container detects: "I'm coordinating with others"
# Uses: 4GB memory, 2 CPU cores
# Good for: Complex analysis, coordination
```

The detection logic in `container-mode-detection.sh`:
```bash
if [[ -n "${TASK_ID:-}" && -n "${AGENT_ID:-}" ]]; then
    echo "container-task"  # Small, focused work
elif [[ -n "${CFN_SWARM_ID:-}" && -n "${CFN_REDIS_URL:-}" ]]; then
    echo "container-cli"   # Coordination work
else
    echo "container-task"  # Safe default
fi
```

---

## Memory Leak Prevention

### How It Works

1. **Container Boundaries:** Each container has a memory limit
2. **Cgroup Enforcement:** The operating system enforces limits
3. **Isolation:** Problems stay within their container
4. **Auto-Recovery:** Failed containers restart automatically

### Example Scenario

**Traditional approach:**
```
Process A (memory leak) → Uses 20GB → System crashes → Everything stops
```

**Docker approach:**
```
Container A (memory leak) → Hits 2GB limit → Container stops →
Other containers continue → Container A restarts automatically →
System keeps working
```

### Resource Limits in Practice

```yaml
# From docker-compose.stabilization.yml
services:
  cfn-agent-task:
    deploy:
      resources:
        limits:
          memory: 2G        # Maximum 2GB RAM
          cpus: '1.0'       # Maximum 1 CPU core
        reservations:
          memory: 512M      # Guaranteed 512MB RAM
          cpus: '0.25'      # Guaranteed 0.25 CPU core
```

**What this means:**
- Container can use up to 2GB memory
- If it tries to use more → OS blocks it
- If it crashes → only this container affected
- Other containers keep running normally

---

## Monitoring and Telemetry

### What Gets Monitored

The telemetry container collects:
- **Memory usage** for each container
- **CPU usage** for each container
- **Container health** (running/stopped)
- **Task progress** via Redis messages
- **Error rates** and recovery events

### Example Metrics

```json
{
  "timestamp": "2025-11-06T15:30:00Z",
  "containers": {
    "cfn-agent-task-1": {
      "memory_used": "1.2GB",
      "memory_limit": "2GB",
      "cpu_percent": "45%",
      "status": "healthy",
      "task_progress": "75%"
    },
    "cfn-orchestrator": {
      "memory_used": "3.1GB",
      "memory_limit": "8GB",
      "cpu_percent": "20%",
      "status": "healthy",
      "coordinating": "3 agents"
    }
  }
}
```

### Health Checks

Each container has health check endpoints:

```bash
# Check if container is healthy
curl http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "timestamp": "2025-11-06T15:30:00Z",
  "service": "cfn-telemetry"
}
```

---

## Getting Started

### 1. Set Up Environment

```bash
# Copy environment template
cp docker.stabilization.env.example docker.stabilization.env

# Edit settings (optional)
nano docker.stabilization.env
```

### 2. Deploy the System

```bash
# Build and start all containers
./docker/scripts/docker-deploy.stabilization.sh deploy

# Check that everything is running
./docker/scripts/docker-deploy.stabilization.sh validate
```

### 3. Use CFN Loops

```bash
# Start a CFN Loop for a task
/cfn-loop-cli "Build a user authentication system" --mode=standard

# The orchestrator will:
# 1. Analyze the task
# 2. Start appropriate containers
# 3. Coordinate work via Redis
# 4. Monitor progress
# 5. Deliver results
```

### 4. Monitor Progress

```bash
# Check container status
docker ps

# View logs
docker logs cfn-orchestrator

# Check resource usage
docker stats
```

### 5. Clean Up

```bash
# Stop and remove containers
./docker/scripts/docker-deploy.stabilization.sh cleanup
```

---

## Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check for missing environment variables
docker logs cfn-agent-task

# Verify resource limits aren't too restrictive
docker inspect cfn-agent-task | grep Memory
```

**Redis connection issues:**
```bash
# Check Redis is running
docker logs cfn-redis

# Test connection from another container
docker exec cfn-orchestrator redis-cli -h redis -p 6379 ping
```

**Memory issues:**
```bash
# Check which container is using most memory
docker stats --no-stream

# See if container hit memory limit
docker events --filter container=cfn-agent-task
```

### Getting Help

1. **Check logs:** Each container writes detailed logs
2. **Validate configuration:** Run `./docker/scripts/docker-deploy.stabilization.sh validate`
3. **Check resource usage:** Use `docker stats` to monitor live usage
4. **Review Redis:** Check coordination messages in Redis

---

## Best Practices

### For Developers

1. **Use appropriate container types:**
   - Small tasks → Task mode containers (2GB memory)
   - Complex tasks → CLI mode containers (4GB memory)
   - Coordination work → Orchestrator handles it

2. **Write efficient code:**
   - Containers have limited resources
   - Clean up memory when done
   - Handle errors gracefully

3. **Use Redis for coordination:**
   - Store progress updates
   - Share results between containers
   - Signal completion status

### For Operations

1. **Monitor resource usage:**
   - Set up alerts for memory limits
   - Watch for containers hitting limits
   - Scale resources as needed

2. **Regular maintenance:**
   - Clean up old containers
   - Update images regularly
   - Monitor telemetry data

3. **Backup coordination data:**
   - Save Redis data for recovery
   - Track task progress
   - Document successful patterns

---

## Summary

Docker-native CFN Loop coordination provides:

✅ **Memory Safety:** Container isolation prevents system crashes
✅ **Resource Control:** Predictable memory and CPU usage
✅ **Scalability:** Add more containers as needed
✅ **Monitoring:** Real-time telemetry and health checks
✅ **Reliability:** Automatic recovery from failures
✅ **Flexibility:** Different container types for different tasks

It's like having a team of specialized workers in separate rooms, each with their own tools and space, coordinated by a manager who ensures everything works together smoothly.

---

## Deep Dive: How Coordination Actually Works

Let me walk you through what really happens behind the scenes, answering the 7 critical questions about container coordination.

### 1️⃣ What Happens If a Container Shuts Down Due to a Memory Leak?

**The Problem:**
```bash
# Traditional system:
Process A (memory leak) → Uses 20GB → System crashes → Everything stops
```

**The Docker Solution:**
```bash
# Container system:
Container A (memory leak) → Hits 2GB limit → Container stops →
Other containers continue → Docker restarts Container A → System keeps working
```

**What Actually Happens:**

1. **Memory Limit Hit:** When a container hits its memory limit (e.g., 2GB), the OS stops it
2. **Automatic Restart:** Docker restarts it due to `restart: unless-stopped` policy
3. **Other Containers Safe:** Memory leak is contained - doesn't affect other containers
4. **Recovery Logic:** The orchestrator detects the restart and handles recovery

**Example Recovery Process:**
```yaml
# From docker-compose.stabilization.yml
cfn-agent-task:
  restart: unless-stopped  # Automatically restart on failure
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Recovery Timeline:**
- **0s:** Container hits memory limit and stops
- **5s:** Docker detects stopped container
- **10s:** Docker restarts container automatically
- **30s:** Health check begins
- **60s:** Container back to healthy state
- **Throughout:** Other containers continue working normally

### 2️⃣ How Does the Coordinator Know It Needs to Take Action?

**Yes, we extensively use the BLPOP method with Redis!**

**BLPOP = Block List Pop** - Think of it like a waiter waiting for an order:
- **Blocks** until a message arrives
- **Zero CPU usage** while waiting
- **Instant response** when message appears

**Coordinator Coordination Flow:**
```bash
# Step 1: Coordinator starts agents
npx claude-flow-novice agent-spawn backend-dev --task-id "${TASK_ID}"
npx claude-flow-novice agent-spawn reviewer --task-id "${TASK_ID}"

# Step 2: Coordinator waits for completion signals
redis-cli blpop "swarm:${TASK_ID}:backend-dev:done" 300  # Wait up to 5 minutes
redis-cli blpop "swarm:${TASK_ID}:reviewer:done" 300   # Wait up to 5 minutes

# Step 3: When agent finishes, it signals:
redis-cli lpush "swarm:${TASK_ID}:backend-dev:done" "complete"
```

**Real BLPOP Usage Examples:**
```bash
# From the actual codebase:
redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0          # Wait for gate signal
redis-cli blpop "swarm:${TASK_ID}:${AGENT_ID}:done" 300   # Wait for agent completion
redis-cli blpop "swarm:${TASK_ID}:decision" 3600         # Wait for product owner decision
```

**Message Queue Pattern:**
```
Agent Work → LPUSH to completion queue → BLPOP by coordinator → Take action
```

### 3️⃣ What Happens If the Coordinator Misses a Message?

**Built-in Timeout Mechanisms!**

**Timeout Layers:**
```bash
# Layer 1: Individual agent timeout (5 minutes default)
timeout 300 redis-cli blpop "swarm:${TASK_ID}:agent:done" 0

# Layer 2: Overall task timeout (configurable)
CFN_VALIDATION_TIMEOUT=300  # 5 minutes

# Layer 3: Safe BLPOP with error handling
redis_blpop_safe() {
    local key="$1"
    local timeout="$2"
    local output_file="$3"

    timeout "$timeout" redis-cli --csv blpop "$key" 0 > "$output_file" || {
        echo "TIMEOUT" > "$output_file"
        return 1
    }
}
```

**What Happens on Timeout:**
1. **BLPOP times out** after configured duration
2. **Coordinator detects timeout** via return code
3. **Takes corrective action** - marks task as failed, restarts agents
4. **Continues with next task** - doesn't block indefinitely

**Timeout Configuration:**
```bash
# From environment file:
CFN_VALIDATION_TIMEOUT=300    # 5 minutes for agent completion
CFN_TASK_TIMEOUT=600          # 10 minutes for overall task
CFN_ORCHESTRATOR_TIMEOUT=1800 # 30 minutes for complex coordination
```

### 4️⃣ How is Context Passed Between Agents?

**Redis Hash-based Context Storage!**

**Context Flow:**
```bash
# Step 1: Coordinator stores context in Redis
redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
  "epic_goal" "Build user authentication system" \
  "deliverables" "['auth.ts', 'login.html', 'signup.html']" \
  "acceptance_criteria" "['Login works', 'Password reset functional']" \
  "iteration" "1" \
  "status" "in_progress"

# Step 2: Agent reads complete context
TASK_CONTEXT=$(redis-cli HGETALL "cfn_loop:task:${TASK_ID}:context")

# Step 3: Agent updates context with progress
redis-cli HSET "cfn_loop:task:${TASK_ID}:context" \
  "backend-dev:status" "complete" \
  "backend-dev:confidence" "0.92" \
  "backend-dev:deliverables" "['auth.ts', 'middleware.ts']"
```

**Context Structure Example:**
```json
{
  "epic_goal": "Build user authentication system",
  "deliverables": ["auth.ts", "login.html", "signup.html"],
  "acceptance_criteria": ["Login works", "Password reset functional"],
  "directory": "./src/auth",
  "iteration": "2",
  "status": "in_progress",
  "agents": {
    "backend-dev": {
      "status": "complete",
      "confidence": "0.92",
      "deliverables": ["auth.ts", "middleware.ts"]
    }
  }
}
```

**Context Benefits:**
- **Persistent:** Survives container restarts
- **Shared:** All agents can read the full context
- **Updateable:** Real-time progress tracking
- **Queryable:** Can be searched and filtered

### 5️⃣ Does the Coordinator Monitor Messages Between Agents?

**Yes, through Redis Key Patterns!**

**Message Monitoring Pattern:**
```bash
# Coordinator watches for specific message patterns
swarm:${TASK_ID}:${AGENT_ID}:done          # Agent completion
swarm:${TASK_ID}:gate-passed            # Loop 3 to Loop 2 transition
swarm:${TASK_ID}:decision               # Product owner decision
swarm:${TASK_ID}:${AGENT_ID}:started     # Agent started working
swarm:${TASK_ID}:${AGENT_ID}:progress    # Progress updates
```

**Real Monitoring Examples:**
```bash
# Monitor agent lifecycle
redis-cli KEYS "swarm:${TASK_ID}:*" | grep -E "(started|done|progress)"

# Track specific agent progress
redis-cli GET "swarm:${TASK_ID}:backend-dev:progress"

# Monitor decision flow
redis-cli BLPOP "swarm:${TASK_ID}:decision" 3600  # Wait for product owner
```

**Telemetry Integration:**
```bash
# Telemetry container also monitors
docker exec cfn-telemetry redis-cli KEYS "swarm:*" | wc -l  # Count active tasks
docker exec cfn-telemetry redis-cli HGETALL "metrics:*"     # Get performance data
```

### 6️⃣ Is the Orchestrator Still a Deterministic Script?

**Not exactly - it's now an intelligent agent that uses deterministic coordination patterns!**

**Traditional Script (Deterministic):**
```bash
#!/bin/bash
# Always does the same thing in the same order
echo "Step 1: Always do X"
echo "Step 2: Always do Y"
echo "Step 3: Always do Z"
```

**Modern Orchestrator (Adaptive + Deterministic Coordination):**
```bash
# Dockerfile.orchestrator
#!/bin/bash

# Intelligent task analysis (adaptive)
TASK_ANALYSIS=$(analyze_task "$1")

# Deterministic coordination patterns (reliable)
spawn_agents_based_on_analysis "$TASK_ANALYSIS"
wait_for_completions_with_timeouts "$TASK_ID"
make_decisions_based_on_confidence_scores "$TASK_ID"

# But the coordination logic itself is deterministic and reliable
```

**Key Differences:**
- **Task Analysis:** Smart vs hardcoded
- **Agent Selection:** Dynamic vs predefined
- **Coordination:** Still reliable and deterministic
- **Error Handling:** Robust vs brittle

**Deterministic Elements Preserved:**
- **Message patterns:** Always use `swarm:${TASK_ID}:${AGENT_ID}:done`
- **Timeout values:** Configurable but predictable
- **Decision flows:** Gate → Validate → Product Owner → Action
- **Recovery patterns:** Always retry on failure

### 7️⃣ Are Subagents Shut Down, Respawned, or Stay Active?

**They stay active until task completion, then exit cleanly!**

**Agent Lifecycle:**
```bash
# Step 1: Agent starts (container runs)
docker run claude-flow-novice:agent-task-latest \
  -e TASK_ID="auth-123" \
  -e AGENT_ID="backend-dev-456"

# Step 2: Agent does its work (stays running)
# - Processes files
# - Writes code
# - Runs tests
# - Updates progress in Redis

# Step 3: Agent signals completion (still running)
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:confidence" "0.92"

# Step 4: Agent exits cleanly (container stops)
exit 0

# Step 5: Container is removed by Docker
# - Resources are freed
# - Container is cleaned up
# - No respawning needed
```

**No Respawning Because:**
- **Task-based:** Each agent has a specific, finite task
- **Stateless:** Next task gets a fresh container
- **Resource efficient:** Don't keep containers running when not needed
- **Clean separation:** Each task is isolated

**When Are New Containers Started?**
```bash
# For new task
npx claude-flow-novice agent-spawn backend-dev --task-id "new-task-789"

# For iteration (failed validation)
npx claude-flow-novice agent-spawn backend-dev --task-id "auth-123" --iteration "2"

# For different task phase
npx claude-flow-novice agent-spawn reviewer --task-id "auth-123"
```

**Container State Management:**
```yaml
# From docker-compose.stabilization.yml
cfn-agent-task:
  restart: "no"  # Don't restart automatically - task-based lifecycle
  # Task completion = container exit = cleanup
```

---

## Summary: How It All Works Together

**Complete Coordination Flow:**

1. **Start:** Coordinator analyzes task and stores context in Redis
2. **Spawn:** Coordinator starts agent containers with specific parameters
3. **Work:** Agents read context, do work, update progress in Redis
4. **Signal:** Agents signal completion via `redis-cli lpush "swarm:...:done"`
5. **Wait:** Coordinator waits with `redis-cli blpop "swarm:...:done" timeout`
6. **Collect:** Coordinator collects all confidence scores and results
7. **Decide:** Based on scores, decide PROCEED/ITERATE/ABORT
8. **Cleanup:** Containers exit cleanly, resources are freed
9. **Repeat:** Either start next iteration or move to next task

**Key Advantages:**
- ✅ **Memory Safe:** Container isolation prevents system crashes
- ✅ **Reliable:** BLPOP + timeouts prevent deadlocks
- ✅ **Visible:** Redis context provides real-time progress tracking
- ✅ **Recoverable:** Failed agents can be restarted without losing work
- ✅ **Efficient:** Resources freed when tasks complete
- ✅ **Scalable:** Multiple tasks can run simultaneously with different containers

---

## Beyond Grafana: Comprehensive Monitoring Implementation

**The monitoring system extends far beyond the Grafana dashboard - it includes real-time violation detection, WebSocket alerts, and specialized monitoring tools.**

### 🚨 Real-Time Violation Monitoring

**Violation Detection System:**
```bash
# Background monitoring script that watches for CFN Loop violations
.claude/skills/redis-coordination/monitor-cfn-violations.sh
```

**What It Monitors:**
- ✅ **Gate Bypass Violations** - Loop 2 starting before Loop 3 complete
- ✅ **Orchestrator Hang Issues** - Agents done but coordinator still waiting
- ✅ **Coordinator Timeouts** - Cancellation after 5-10 minutes
- ✅ **Product Owner Missing** - Loop 2 complete but PO not spawned

**Real-Time Alerting:**
```bash
# Start monitoring with WebSocket alerts
./monitor-cfn-violations.sh --interval 60 --websocket-port 3001

# Sends real-time alerts to:
# - WebSocket server (port 3001)
# - Grafana dashboards
# - Admin notifications
# - Violation history logs
```

### 📡 WebSocket Integration

**WebSocket Server Features:**
```javascript
// From web-portal/server.js
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Real-time violation broadcasts
io.on('connection', (socket) => {
  socket.emit('current-violations', latestViolations);
});

// API endpoints for violations
app.post('/api/violations', (req, res) => {
  // Receive violation from monitor script
  // Store in Redis for persistence
  // Broadcast to all connected clients
  io.emit('violation', violationData);
});
```

**Web Portal Dashboard:**
```javascript
// Real-time violation display
const socket = io('http://localhost:3001');

socket.on('violation', (violation) => {
  showRealtimeAlert(violation);
  updateDashboardCounters();
});

// View modes for different perspectives
viewMode: 'dashboard' | 'messages' | 'agents' | 'transparency' | 'mcp' | 'violations';
```

### 📊 Multiple Data Sources Integration

**Grafana Data Sources:**
```yaml
# From monitoring/grafana/provisioning/datasources/docker.yml
datasources:
  docker-native-cfn:
    type: docker        # Direct Docker metrics
    url: http://docker-proxy:2375

  redis-cfn-metrics:
    type: redis         # CFN coordination data
    url: redis://redis:6379

  file-cfn-telemetry:
    type: file          # Container telemetry files
    path: /var/lib/grafana/data/telemetry

  system-metrics:
    type: prometheus   # System performance metrics
    url: http://prometheus:9090
```

**Telemetry Collection:**
```javascript
// From Dockerfile.telemetry - Real-time metrics collection
class SimpleTelemetryCollector {
  async collectSystemMetrics() {
    // Collects memory, CPU, load average
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const loadavg = readFileSync('/proc/loadavg', 'utf8');

    return {
      timestamp: new Date().toISOString(),
      system: {
        memory_total_kb: memTotal,
        memory_used_kb: used,
        load_average: parseFloat(loadavg[0]),
        uptime: uptime
      }
    };
  }
}
```

### 🔍 Specialized Monitoring Tools

**1. CFN Violations Monitor:**
```bash
# Continuous background monitoring
./.claude/skills/redis-coordination/monitor-cfn-violations.sh &
PID=$!

# Check specific violations
redis-cli KEYS "swarm:*:*:violation" | wc -l
```

**2. Cost Monitoring:**
```bash
# From monitoring/sprint-2.2/track-costs.sh
# Z.ai API cost tracking and optimization
COST_FILE="./monitoring/sprint-2.2/zai-costs.csv"

# Track API usage per agent
echo "timestamp,agent,tokens,cost" > "$COST_FILE"
```

**3. Performance Monitoring:**
```bash
# Docker container performance tracking
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"
```

**4. Health Check Integration:**
```bash
# All services include health endpoints
curl -f http://localhost:3000/health  # Telemetry
curl -f http://localhost:3001/health  # Orchestrator
docker exec cfn-redis redis-cli ping          # Redis
```

### 📱 Alert Configuration

**Grafana Alerting:**
```yaml
# Example alert rules
alerts:
  - name: HighMemoryUsage
    condition: docker_container_memory_usage > 90
    for: 5m
    annotations:
      summary: "Container {{ $labels.name }} using too much memory"

  - name: AgentTimeout
    condition: redis_key_missing "swarm:*:*:done" for 10m
    for: 2m
    annotations:
      summary: "Agent timeout detected"
```

**WebSocket Alerts:**
```bash
# Configurable alerting thresholds
./monitor-cfn-violations.sh \
  --alert-threshold 5 \
  --email admin@company.com \
  --slack #webhook-url
```

### 📈 Integration Points

**1. Slack Integration:**
```bash
# Send violations to Slack
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"CFN Violation Detected"}' \
  https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

**2. Email Notifications:**
```bash
# Email alert configuration
CFN_ALERT_EMAIL=admin@company.com
CFN_ALERT_SMTP_SERVER=smtp.company.com
```

**3. Webhook Callbacks:**
```javascript
// Custom webhook receivers
const webhookUrl = process.env.VIOLATION_WEBHOOK;
fetch(webhookUrl, {
  method: 'POST',
  body: JSON.stringify({
    violation: violationData,
    timestamp: new Date().toISOString(),
    severity: 'high'
  })
});
```

### 🛠️ Monitoring CLI Commands

**Status Commands:**
```bash
# Check monitoring status
ps aux | grep monitor-cfn-violations

# Current active violations
redis-cli KEYS "swarm:*:*:violation" | head -10

# Violation statistics
redis-cli GET "swarm:violations:stats"

# Agent health status
docker ps --filter "name=cfn-*" --format "table {{.Names}}\t{{.Status}}"
```

**Debug Commands:**
```bash
# Test monitoring script
./.claude/skills/redis-coordination/monitor-cfn-violations.sh --test

# Check WebSocket connection
curl -s http://localhost:3001/socket.io/ || echo "WebSocket down"

# Verify data sources
curl -s http://localhost:3000/api/datasources | jq '.'
```

### 📋 Monitoring Checklist

**Dashboard Setup:**
- [x] Grafana dashboards configured
- [x] Docker metrics datasource
- [x] Redis coordination datasource
- [x] File-based telemetry datasource
- [x] System metrics datasource

**Alert Configuration:**
- [x] Memory usage alerts
- [x] Agent timeout alerts
- [x] Redis connection alerts
- [x] Container health alerts

**Integration Testing:**
- [x] Violation detection working
- [x] WebSocket broadcasting
- [x] API endpoints responsive
- [x] Email/S Slack notifications

**Production Readiness:**
- [x] Background monitoring daemon
- [x] Historical data retention
- [x] Performance baselines
- [x] Incident response procedures

---

**Summary: Monitoring Architecture**

**The complete monitoring ecosystem includes:**

1. **🎯 Grafana Dashboard** - Visual metrics and dashboards
2. **🚨 Violation Detection** - Real-time CFN Loop violation monitoring
3. **📡 WebSocket Server** - Live updates and broadcasting
4. **📊 Telemetry Collection** - System and container metrics
5. **🔧 CLI Tools** - Command-line monitoring and debugging
6. **📧 Alert Integration** - Slack, email, webhook notifications
7. **📈 Multiple Data Sources** - Docker, Redis, Prometheus, Files

This provides comprehensive visibility into the entire CFN coordination system, from individual container performance to system-wide workflow health.

---

**Ready to start?** Run `./docker/scripts/docker-deploy.stabilization.sh deploy` to get your coordinated, memory-safe CFN Loop system running with full monitoring!