# Test: Mesh Hybrid Pattern (LPUSH+SET for Multiple Consumers)

**Test the hybrid LPUSH+SET pattern for 1:many dependencies without coordinator**

---

## Scenario

**1:Many Dependency (No Coordinator):**
- Researcher (Agent A) → produces results (LPUSH + SET)
- Analyzer (Agent B) → waits for results (BLPOP - first consumer)
- Architect (Agent C) → waits for results (GET - additional reader)

**Topology:** Mesh (peer-to-peer)

```
Researcher ─┬─→ Analyzer (BLPOP)
            └─→ Architect (GET)
```

---

## Test Execution

### Step 1: Clear Redis Keys

```bash
redis-cli del "swarm:mesh:researcher:done" \
            "swarm:mesh:researcher:result"

redis-cli keys "swarm:mesh:*"
# Expected: (empty array)
```

### Step 2: Run Test (Single Message Spawn)

Paste this in main chat:

```
Test mesh hybrid LPUSH+SET pattern:

Task: Research TypeScript benefits with hybrid coordination

Spawn 3 agents in single message (NO coordinator):
- Researcher (LPUSH + SET)
- Analyzer (BLPOP first consumer)
- Architect (GET additional reader)

Use Redis hybrid pattern on channel: swarm:mesh
```

---

## Expected Agent Spawn

```javascript
Task("researcher", `
  Research TypeScript benefits.

  Use Bash tool:
  echo "✅ [Researcher] Starting research..."
  sleep 2  # Simulate work

  data='{"agent":"researcher","confidence":0.85,"findings":"Type safety, IDE support"}'

  # HYBRID PATTERN: LPUSH for first waiter + SET for additional readers
  redis-cli lpush "swarm:mesh:researcher:done" "$data"          # For BLPOP (analyzer)
  redis-cli set "swarm:mesh:researcher:result" "$data"          # For GET (architect)
  redis-cli expire "swarm:mesh:researcher:result" 3600          # Cleanup after 1 hour

  echo "✅ [Researcher] COMPLETE - pushed (LPUSH + SET hybrid)"
`, "researcher")

Task("analyst", `
  Analyze TypeScript benefits (first consumer - BLPOP).

  Use Bash tool:
  echo "⏳ [Analyzer] Waiting for researcher (BLPOP)..."

  # First consumer uses BLPOP
  data=$(timeout 60 redis-cli --csv blpop "swarm:mesh:researcher:done" 0)

  if [ $? -eq 0 ]; then
    echo "✅ [Analyzer] Received data via BLPOP: $data"
    sleep 1  # Simulate analysis

    echo "✅ [Analyzer] COMPLETE"
  else
    echo "❌ [Analyzer] TIMEOUT"
    exit 1
  fi
`, "analyst")

Task("architect", `
  Design architecture (additional reader - GET).

  Use Bash tool:
  echo "⏳ [Architect] Waiting for researcher (GET with polling)..."

  # Additional reader uses GET (poll until available)
  timeout=60
  elapsed=0

  while [ $elapsed -lt $timeout ]; do
    data=$(redis-cli get "swarm:mesh:researcher:result")

    if [ -n "$data" ] && [ "$data" != "(nil)" ]; then
      echo "✅ [Architect] Received data via GET: $data"
      sleep 1  # Simulate design

      echo "✅ [Architect] COMPLETE"
      exit 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "❌ [Architect] TIMEOUT - result not available"
  exit 1
`, "architect")
```

---

## Expected Console Output

```
✅ [Researcher] Starting research...
✅ [Researcher] COMPLETE - pushed (LPUSH + SET hybrid)

⏳ [Analyzer] Waiting for researcher (BLPOP)...
✅ [Analyzer] Received data via BLPOP: ...
✅ [Analyzer] COMPLETE

⏳ [Architect] Waiting for researcher (GET with polling)...
✅ [Architect] Received data via GET: ...
✅ [Architect] COMPLETE
```

---

## Verification

### Check Redis Keys

```bash
# List consumed by BLPOP
redis-cli llen "swarm:mesh:researcher:done"     # Expected: 0 (analyzer consumed via BLPOP)

# Key still available for GET
redis-cli get "swarm:mesh:researcher:result"    # Expected: {"agent":"researcher",...}

# Key has TTL
redis-cli ttl "swarm:mesh:researcher:result"    # Expected: ~3600 (1 hour)
```

### Execution Order

1. ✅ Researcher runs first, does LPUSH + SET
2. ✅ Analyzer uses BLPOP (consumes list)
3. ✅ Architect uses GET (reads from key)
4. ✅ Both get same data (no race condition)

---

## Success Criteria

✅ **All 3 agents spawned in single message**
✅ **No coordinator needed** (peer-to-peer mesh)
✅ **Researcher pushes LPUSH + SET hybrid**
✅ **Analyzer receives via BLPOP (first consumer)**
✅ **Architect receives via GET (additional reader)**
✅ **Both analyzer and architect get SAME data**
✅ **No timeout errors**
✅ **Key expires after 1 hour (cleanup)**

---

## Key Lessons

1. **Mesh pattern works without coordinator for simple topologies**
2. **Hybrid LPUSH+SET solves BLPOP destructive problem**
3. **First consumer uses BLPOP (blocking, efficient)**
4. **Additional readers use GET (polling, less efficient)**
5. **TTL ensures automatic cleanup**
6. **Good for 2-5 agents, breaks down at scale**

---

## When to Use

**Use Mesh Hybrid Pattern:**
- ✅ 2-5 agents total
- ✅ Simple 1:many dependencies
- ✅ Peer-to-peer coordination acceptable
- ✅ No coordinator overhead desired

**Use Hierarchical Coordinator Instead:**
- ❌ 6+ agents
- ❌ Complex dependency graphs
- ❌ Need centralized monitoring
- ❌ Dynamic agent spawning

---

## Cleanup

```bash
redis-cli del "swarm:mesh:researcher:done" \
            "swarm:mesh:researcher:result"
```
