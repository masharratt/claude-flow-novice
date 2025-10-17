# Test: Redis Agent Wait Patterns

**Simple 3-agent test to verify agents can wait for each other using Redis pub/sub.**

---

## Test Scenario

**Task:** Research a simple topic with 3 agents

**Agents:**
1. **Researcher** (Agent A) - Runs first, publishes findings
2. **Analyzer** (Agent B) - Waits for researcher, then analyzes
3. **Architect** (Agent C) - Waits for BOTH researcher + analyzer, then designs

**Dependencies:**
```
Researcher (A) ─┬─→ Analyzer (B) ─┐
                └──────────────────┴─→ Architect (C)
```

---

## Test Execution

**Step 1: Ensure Redis is Running**

```bash
# Check if Redis is running
redis-cli ping
# Expected: PONG

# If not running, start Redis
redis-server --daemonize yes
```

**Step 2: Clear Redis Test Channels**

```bash
# Clear any previous test data
redis-cli del "swarm:test:researcher:complete"
redis-cli del "swarm:test:analyzer:complete"
redis-cli del "swarm:test:architect:complete"

# Verify cleared
redis-cli keys "swarm:test:*"
# Expected: (empty array)
```

**Step 3: Run the Test**

In main chat, paste this EXACT prompt:

```
Run a 3-agent Redis coordination test:

Task: Research the benefits of TypeScript

Agents:
1. Researcher (runs first)
2. Analyzer (waits for researcher)
3. Architect (waits for both)

Use Redis pub/sub for coordination on channel: swarm:test

Spawn all 3 agents in a single message.
```

---

## Expected Agent Spawn Pattern

Main chat should spawn all 3 agents in a single message like this:

```javascript
Task("researcher", `
  Research the benefits of TypeScript.

  **Redis Channel:** swarm:test:researcher

  Research benefits (type safety, IDE support, etc.)

  **On Completion:**
  redis-cli publish "swarm:test:researcher:complete" '{
    "agent": "researcher",
    "confidence": 0.85,
    "findings": "Type safety, better IDE support, catch errors early"
  }'

  Log to confirm: "Researcher complete, published to Redis"
`, "researcher")

Task("analyst", `
  Analyze TypeScript benefits from research.

  **Redis Channel:** swarm:test:analyzer

  **Dependencies:**
  echo "Analyzer waiting for researcher..."
  result=$(timeout 60 redis-cli --csv blpop "swarm:test:researcher:complete" 0)

  if [ $? -eq 0 ]; then
    echo "Researcher complete, analyzer proceeding..."
    echo "Received: $result"
  else
    echo "TIMEOUT: Researcher did not complete"
    exit 1
  fi

  Analyze the research findings.

  **On Completion:**
  redis-cli publish "swarm:test:analyzer:complete" '{
    "agent": "analyzer",
    "confidence": 0.88,
    "analysis": "Strong benefits for large codebases"
  }'

  echo "Analyzer complete, published to Redis"
`, "analyst")

Task("architect", `
  Design architecture recommendations based on research + analysis.

  **Redis Channel:** swarm:test:architect

  **Dependencies (WAIT FOR BOTH):**
  echo "Architect waiting for researcher..."
  researcher_result=$(timeout 60 redis-cli --csv blpop "swarm:test:researcher:complete" 0)

  if [ $? -ne 0 ]; then
    echo "TIMEOUT: Researcher did not complete"
    exit 1
  fi

  echo "Researcher complete, waiting for analyzer..."
  analyzer_result=$(timeout 60 redis-cli --csv blpop "swarm:test:analyzer:complete" 0)

  if [ $? -ne 0 ]; then
    echo "TIMEOUT: Analyzer did not complete"
    exit 1
  fi

  echo "Both dependencies complete, architect proceeding..."
  echo "Researcher: $researcher_result"
  echo "Analyzer: $analyzer_result"

  Design architecture based on findings.

  **On Completion:**
  redis-cli publish "swarm:test:architect:complete" '{
    "agent": "architect",
    "confidence": 0.90,
    "design": "Adopt TypeScript for new modules, gradual migration plan"
  }'

  echo "Architect complete, published to Redis"
`, "architect")
```

---

## Expected Console Output

**Researcher (runs first):**
```
Researcher complete, published to Redis
```

**Analyzer (waits for researcher):**
```
Analyzer waiting for researcher...
Researcher complete, analyzer proceeding...
Received: [researcher's completion data]
Analyzer complete, published to Redis
```

**Architect (waits for both):**
```
Architect waiting for researcher...
Researcher complete, waiting for analyzer...
Analyzer complete, architect proceeding...
Researcher: [researcher's data]
Analyzer: [analyzer's data]
Architect complete, published to Redis
```

---

## Verification Steps

**Step 1: Check Redis Channels**

```bash
# Check all test channels
redis-cli keys "swarm:test:*"

# Expected output:
# 1) "swarm:test:researcher:complete"
# 2) "swarm:test:analyzer:complete"
# 3) "swarm:test:architect:complete"
```

**Step 2: Read Completion Data**

```bash
# Read researcher completion
redis-cli --raw blpop "swarm:test:researcher:complete" 0

# Expected: JSON with researcher findings

# Read analyzer completion
redis-cli --raw blpop "swarm:test:analyzer:complete" 0

# Expected: JSON with analyzer analysis

# Read architect completion
redis-cli --raw blpop "swarm:test:architect:complete" 0

# Expected: JSON with architect design
```

**Step 3: Verify Execution Order**

Check agent console logs to confirm:
1. ✅ Researcher ran first
2. ✅ Analyzer waited for researcher, then ran
3. ✅ Architect waited for both, then ran

---

## Success Criteria

✅ **All 3 agents spawned in single message**
✅ **Researcher completes first**
✅ **Analyzer waits for researcher** (blocks until researcher publishes)
✅ **Architect waits for both** (blocks until both publish)
✅ **All agents publish completion to Redis**
✅ **No race conditions** (agents execute in correct order)
✅ **Timeouts work** (agents don't wait forever if dependency fails)

---

## Troubleshooting

**Problem: Analyzer/Architect don't wait**
```bash
# Check if Redis is running
redis-cli ping

# Check if channels exist
redis-cli keys "swarm:test:*"

# Verify blpop syntax in agent prompts
```

**Problem: Timeout errors**
```bash
# Increase timeout from 60s to 120s
timeout 120 redis-cli --csv blpop "swarm:test:researcher:complete" 0

# Check if researcher actually completed
redis-cli get "swarm:test:researcher:status"
```

**Problem: Agents spawn sequentially**
```
❌ Wrong: Spawning agents one at a time
✅ Correct: All 3 agents spawned in single message with Task() calls
```

---

## Cleanup

```bash
# Clear test channels
redis-cli del "swarm:test:researcher:complete"
redis-cli del "swarm:test:analyzer:complete"
redis-cli del "swarm:test:architect:complete"

# Verify cleanup
redis-cli keys "swarm:test:*"
# Expected: (empty array)
```

---

## What This Test Proves

1. **Single Message Spawn**: Main chat can spawn all agents at once
2. **Redis Coordination**: Agents communicate via Redis pub/sub
3. **Blocking Wait**: Agents block on `blpop` until dependencies complete
4. **Sequential Dependencies**: Agent B waits for Agent A
5. **Parallel Dependencies**: Agent C waits for both A and B
6. **Timeout Safety**: Agents don't hang forever (60s timeout)
7. **No Main Chat Orchestration**: Main chat spawns and exits, agents handle coordination

---

## Next Steps

After successful test:
1. Try with real tasks (security fix, feature implementation)
2. Add coordinator agent for monitoring
3. Test with CLI spawning mode (cost-savings)
4. Scale to 5+ agents with complex dependencies
