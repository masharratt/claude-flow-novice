# CFN v3 Architecture Corrections

**Date:** 2025-10-22
**Status:** ✅ COMPLETE

## Critical Architecture Updates

### 1. Coordinator as Task Tool Agent ✅

**❌ Initial Design Flaw:**
- Architecture implied coordinator might be CLI-spawned
- Unclear how coordinator interfaces with Main Chat

**✅ Corrected Design:**
```javascript
// Main Chat spawns coordinator using Task() tool
Task("cfn-v3-coordinator", `
  Execute CFN Loop v3 for: ${TASK_DESCRIPTION}

  Your responsibilities:
  1. Analyze task type
  2. Select optimal agents
  3. Spawn orchestrator via CLI (background)
  4. Enter BLPOP waiting mode for orchestrator events
  5. Intervene when needed (plateau, recurring feedback)
  6. Return final result to Main Chat
`)
```

**Key Points:**
- Coordinator is a **Task tool agent** (not CLI-spawned)
- Orchestrator is CLI-spawned by coordinator (background process)
- Clear separation: Main Chat → Task(coordinator) → CLI(orchestrator)

---

### 2. Redis BLPOP Waiting (Not Sleep Loops) ✅

**❌ Initial Design Flaw:**
- Architecture mentioned "monitoring" but didn't specify mechanism
- Risk of sleep loops being used (inefficient, high token cost)

**✅ Corrected Design:**
```bash
# Coordinator spawns orchestrator in background
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard &
ORCHESTRATOR_PID=$!

# Enter BLPOP waiting mode (zero-token, instant wake)
while true; do
  # BLPOP blocks until event arrives (timeout=0 = infinite wait)
  EVENT=$(redis-cli BLPOP "swarm:${TASK_ID}:coordinator:events" 0)

  EVENT_TYPE=$(echo "$EVENT" | jq -r '.[1]' | jq -r '.type')

  case "$EVENT_TYPE" in
    "iteration_complete")
      # Check intervention triggers
      if should_intervene; then
        send_intervention_directive
      fi
      ;;
    "confidence_plateau")
      swap_underperforming_agent
      ;;
    "recurring_feedback")
      add_specialist_agent
      ;;
    "orchestrator_complete")
      break
      ;;
  esac
done

# Collect final result
RESULT=$(redis-cli GET "swarm:${TASK_ID}:result")
```

**Benefits:**
- ✅ Zero-token waiting (BLPOP blocks without API calls)
- ✅ Instant wake-up (<100ms when event arrives)
- ✅ No arbitrary timeouts
- ✅ Event-driven, not polling
- ✅ Coordinator only consumes tokens when processing events

---

### 3. Orchestrator Event Publishing ✅

**Pattern:**
```bash
# orchestrate-cfn-loop.sh

publish_coordinator_event() {
  local event_type="$1"
  local event_data="$2"

  redis-cli LPUSH "swarm:${TASK_ID}:coordinator:events" "$(cat <<EOF
{
  "type": "$event_type",
  "iteration": $ITERATION,
  "loop3_confidence": $LOOP3_CONFIDENCE,
  "loop2_consensus": $LOOP2_CONSENSUS,
  "timestamp": $(date +%s),
  "data": $event_data
}
EOF
)"
}

# Usage:
publish_coordinator_event "iteration_complete" "{}"
publish_coordinator_event "confidence_plateau" "{\"delta\": 0.03}"
publish_coordinator_event "recurring_feedback" "{\"theme\": \"security\"}"
publish_coordinator_event "orchestrator_complete" "{\"decision\": \"PROCEED\"}"
```

---

## Updated Documents

### 1. CFN_V3_ARCHITECTURE_PROPOSAL.md
**Updated Sections:**
- Part 2: Enhanced Coordinator Role
  - Added "Coordinator as Task Tool Agent" section
  - Added "Redis BLPOP Waiting Pattern" section
- Part 3: Context Injection vs Redis Coordination
  - Added "Coordinator-Orchestrator Communication (Redis Events)" section
- Part 5: Complete v3 Architecture
  - Updated system interaction flow

### 2. VISUAL_SUMMARY.md
**Updated Sections:**
- Added Section 2.5: "Coordinator Spawning & Waiting Patterns"
  - Spawning Pattern (Task Tool)
  - Waiting Pattern (Redis BLPOP)
  - Orchestrator Event Publishing
- Updated Section 5: "Complete v3 System Flow"
  - Step 3: Coordinator spawns orchestrator (background)
  - Step 3b: Coordinator enters BLPOP waiting mode
- Updated Section 8: "Quick Comparison: v2 vs v3"
  - Added rows: Coordinator Spawn, Waiting Mechanism

### 3. IMPLEMENTATION_PLAN.md
**Updated Phase 1 Tasks:**
- **P1-T05:** Create coordinator agent template (Task tool compatible)
  - Deliverables: `cfn-v3-coordinator.md`
  - Agent spawnable via Task() tool
  - Implements BLPOP waiting loop
  - Handles intervention triggers
  - Returns structured result to Main Chat

- **P1-T06:** Implement Redis event publishing in orchestrator
  - Deliverables: `publish-event.sh`, updated `orchestrate-cfn-loop.sh`
  - Publishes events: iteration_complete, confidence_plateau, recurring_feedback, orchestrator_complete
  - JSON event format with type, iteration, confidence, consensus, timestamp

- **P1-T07:** Implement BLPOP waiting loop in coordinator
  - Deliverables: `wait-for-events.sh`
  - BLPOP with timeout=0 (infinite wait, zero tokens)
  - Event handler switch statement
  - Intervention trigger detection
  - Exit on orchestrator_complete event

- **P1-T08:** Update orchestrator to support context injection (renumbered)

**Updated Testing Requirements:**
- Test coordinator spawn via Task() tool from Main Chat
- Test BLPOP waiting loop (coordinator wakes on events)
- Test orchestrator event publishing (all event types)
- Verify zero-token waiting (no API calls during BLPOP)
- Test intervention triggers (plateau, recurring feedback)

**Updated Success Criteria:**
- Coordinator spawnable via Task() tool
- BLPOP waiting loop functional (zero-token)
- Orchestrator publishes events correctly
- Intervention logic operational

**Added Anti-Patterns Section:**
- ❌ Context storage without injection
- ❌ Generic context when specifics exist
- ❌ Sleep loops for waiting → Use Redis BLPOP
- ❌ CLI-spawned coordinator → Use Task() tool

### 4. cfn-v3-epic.json
**Updated Metadata:**
```json
{
  "coordinator_spawn": "task_tool",
  "coordinator_waiting": "redis_blpop",
  "orchestrator_spawn": "cli",
  "coordination_pattern": "event_driven"
}
```

**Updated Phase 1 Deliverables:**
- `.claude/agents/cfn-v3-coordinator.md`
- `.claude/skills/coordinator-waiting/wait-for-events.sh`
- `.claude/skills/orchestrator-events/publish-event.sh`

---

## Anti-Patterns to Avoid

### ❌ ANTI-PATTERN 1: CLI-Spawned Coordinator
```bash
# WRONG
npx claude-flow-novice swarm "Execute task" --coordinator
```

**Why Wrong:**
- Coordinator can't return result to Main Chat
- No clear interface between user and coordinator
- Breaks Task tool integration

**Correct:**
```javascript
// Main Chat spawns coordinator via Task() tool
Task("cfn-v3-coordinator", "Execute CFN Loop v3...")
```

---

### ❌ ANTI-PATTERN 2: Sleep Loops for Waiting
```bash
# WRONG
while true; do
  sleep 60  # Wastes time + tokens
  STATUS=$(check_orchestrator_status)
  if [ "$STATUS" = "complete" ]; then break; fi
done
```

**Why Wrong:**
- Wastes 60 seconds per poll
- Makes arbitrary API calls during sleep
- Misses events between polls
- High token cost (polling every 60s)

**Correct:**
```bash
# Event-driven BLPOP (zero-token waiting)
while true; do
  EVENT=$(redis-cli BLPOP "swarm:${TASK_ID}:coordinator:events" 0)
  handle_event "$EVENT"
done
```

---

## Implementation Priority

### Phase 1 (Weeks 1-2) - CRITICAL
These patterns are foundational and must be implemented correctly from the start:

1. **P1-T05:** Coordinator agent template
   - Task tool compatible
   - BLPOP waiting loop
   - Intervention logic

2. **P1-T06:** Orchestrator event publishing
   - All event types
   - JSON format
   - LPUSH to coordinator queue

3. **P1-T07:** BLPOP waiting loop
   - Zero-token blocking
   - Event handler
   - Intervention triggers

**Why Critical:**
- Sets correct architecture patterns
- Prevents refactoring later
- Enables zero-token waiting
- Establishes event-driven coordination

---

## Validation Checklist

Before proceeding with implementation, verify:

- [ ] Coordinator defined as Task tool agent (not CLI)
- [ ] BLPOP waiting pattern documented
- [ ] Orchestrator event publishing specified
- [ ] Sleep loops marked as anti-pattern
- [ ] All 4 planning documents updated consistently
- [ ] Phase 1 tasks include coordinator + BLPOP + events
- [ ] Testing requirements include zero-token validation
- [ ] Epic config metadata shows correct patterns

**Status: ✅ ALL VALIDATED**

---

## Next Steps

1. ✅ Architecture corrections complete
2. ⏭️  Begin Phase 1 implementation (P1-T05, P1-T06, P1-T07)
3. ⏭️  Create coordinator agent template
4. ⏭️  Implement BLPOP waiting loop
5. ⏭️  Add event publishing to orchestrator

**Ready to start implementation with correct architecture!**
