# Test: Hierarchical Coordinator Pattern (1:Many Dependencies)

**Test the coordinator broadcast pattern for 1:many dependencies (Researcher → Analyzer + Architect)**

---

## Scenario

**1:Many Dependency:**
- Researcher (Agent A) → produces results
- Coordinator → receives results, broadcasts to dependents
- Analyzer (Agent B) → waits for coordinator broadcast
- Architect (Agent C) → waits for coordinator broadcast

**Topology:** Hierarchical

```
Researcher → Coordinator ─┬→ Analyzer
                          └→ Architect
```

---

## Test Execution

### Step 1: Clear Redis Channels

```bash
redis-cli del "swarm:hier:researcher:done" \
            "swarm:hier:analyzer:inbox" \
            "swarm:hier:architect:inbox"

redis-cli keys "swarm:hier:*"
# Expected: (empty array)
```

### Step 2: Run Test (Single Message Spawn)

Paste this in main chat:

```
Test hierarchical coordinator pattern:

Task: Research TypeScript benefits with 1:many dependency

Spawn 4 agents in single message:
- Researcher (produces results)
- Coordinator (broadcasts to analyzer + architect)
- Analyzer (waits for coordinator)
- Architect (waits for coordinator)

Use Redis lists (lpush/blpop) on channel: swarm:hier
```

---

## Expected Agent Spawn

```javascript
Task("researcher", `
  Research TypeScript benefits.

  Use Bash tool:
  echo "✅ [Researcher] Starting research..."
  sleep 2  # Simulate work

  redis-cli lpush "swarm:hier:researcher:done" '{
    "agent": "researcher",
    "confidence": 0.85,
    "findings": "Type safety, IDE support, error catching"
  }'

  echo "✅ [Researcher] COMPLETE - pushed to coordinator inbox"
`, "researcher")

Task("coordinator-hybrid", `
  Receive researcher results and broadcast to analyzer + architect.

  Use Bash tool:
  echo "⏳ [Coordinator] Waiting for researcher..."

  # Receive from researcher
  data=$(timeout 60 redis-cli --csv blpop "swarm:hier:researcher:done" 0)

  if [ $? -eq 0 ]; then
    echo "✅ [Coordinator] Received researcher data: $data"

    # Broadcast to BOTH dependents
    redis-cli lpush "swarm:hier:analyzer:inbox" "$data"
    redis-cli lpush "swarm:hier:architect:inbox" "$data"

    echo "✅ [Coordinator] Broadcasted to analyzer + architect"
  else
    echo "❌ [Coordinator] TIMEOUT - researcher did not complete"
    exit 1
  fi
`, "coordinator")

Task("analyst", `
  Analyze TypeScript benefits.

  Use Bash tool:
  echo "⏳ [Analyzer] Waiting for coordinator broadcast..."

  # Wait for coordinator's broadcast
  data=$(timeout 60 redis-cli --csv blpop "swarm:hier:analyzer:inbox" 0)

  if [ $? -eq 0 ]; then
    echo "✅ [Analyzer] Received data from coordinator: $data"
    sleep 1  # Simulate analysis

    echo "✅ [Analyzer] COMPLETE - analysis done"
  else
    echo "❌ [Analyzer] TIMEOUT"
    exit 1
  fi
`, "analyst")

Task("architect", `
  Design architecture based on research.

  Use Bash tool:
  echo "⏳ [Architect] Waiting for coordinator broadcast..."

  # Wait for coordinator's broadcast
  data=$(timeout 60 redis-cli --csv blpop "swarm:hier:architect:inbox" 0)

  if [ $? -eq 0 ]; then
    echo "✅ [Architect] Received data from coordinator: $data"
    sleep 1  # Simulate design

    echo "✅ [Architect] COMPLETE - design done"
  else
    echo "❌ [Architect] TIMEOUT"
    exit 1
  fi
`, "architect")
```

---

## Expected Console Output

```
✅ [Researcher] Starting research...
✅ [Researcher] COMPLETE - pushed to coordinator inbox

⏳ [Coordinator] Waiting for researcher...
✅ [Coordinator] Received researcher data: ...
✅ [Coordinator] Broadcasted to analyzer + architect

⏳ [Analyzer] Waiting for coordinator broadcast...
✅ [Analyzer] Received data from coordinator: ...
✅ [Analyzer] COMPLETE - analysis done

⏳ [Architect] Waiting for coordinator broadcast...
✅ [Architect] Received data from coordinator: ...
✅ [Architect] COMPLETE - design done
```

---

## Verification

### Check Redis Lists

```bash
# All lists should be consumed (empty)
redis-cli llen "swarm:hier:researcher:done"    # Expected: 0 (coordinator consumed)
redis-cli llen "swarm:hier:analyzer:inbox"     # Expected: 0 (analyzer consumed)
redis-cli llen "swarm:hier:architect:inbox"    # Expected: 0 (architect consumed)
```

### Execution Order

1. ✅ Researcher runs first, pushes to coordinator inbox
2. ✅ Coordinator receives, broadcasts to analyzer + architect inboxes
3. ✅ Analyzer and Architect run in parallel (both receive same data)
4. ✅ No race conditions or timeouts

---

## Success Criteria

✅ **All 4 agents spawned in single message**
✅ **Researcher completes first**
✅ **Coordinator receives researcher data**
✅ **Coordinator broadcasts to BOTH dependents**
✅ **Analyzer receives broadcast (no timeout)**
✅ **Architect receives broadcast (no timeout)**
✅ **Both analyzer and architect get SAME data**
✅ **No BLPOP destructive issue** (coordinator solves it)

---

## Key Lessons

1. **Hierarchical pattern solves BLPOP destructive problem**
2. **Coordinator acts as broadcast hub for 1:many**
3. **Each dependent gets own inbox (separate lists)**
4. **Coordinator ensures all dependents receive data**
5. **Scales to N dependents (just add more inboxes)**

---

## Cleanup

```bash
redis-cli del "swarm:hier:researcher:done" \
            "swarm:hier:analyzer:inbox" \
            "swarm:hier:architect:inbox"
```
