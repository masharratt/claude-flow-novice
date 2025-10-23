# CFN v3 - Visual Summary & Quick Reference

## Core Concept: From "Launch Button" to "Strategic AI Coach"

```
┌─────────────────────────────────────────────────────────────────┐
│                    CFN V2 (CURRENT)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Main Chat ────► Coordinator ────► Orchestrator                │
│                      ▲                                          │
│                      │                                          │
│                  "Just launches                                 │
│                   and waits"                                    │
│                                                                 │
│  Problem: Coordinator is passive, doesn't adapt or learn       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CFN V3 (PROPOSED)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Main Chat ────► Coordinator (AI Strategic Meta-Agent)         │
│                      │                                          │
│                      ├─► Analyzes task type                    │
│                      ├─► Selects optimal agents                │
│                      ├─► Breaks down complexity                │
│                      ├─► Monitors execution live               │
│                      ├─► Intervenes when stuck                 │
│                      ├─► Prunes context intelligently          │
│                      ├─► Learns from every execution           │
│                      └─► Builds playbook                       │
│                                                                 │
│  Solution: Coordinator is active AI that improves over time    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Different Loop Structures for Different Tasks

### Universal Pattern (Abstract)

```
Producer Agents → Create candidate solutions
      ↓
Evaluator Agents → Assess quality
      ↓
Decision Agent → PROCEED / ITERATE / ABORT
      ↓
Reflector Agent → Learn patterns (post-sprint)
```

### Domain Mappings

```
SOFTWARE DEVELOPMENT:
  Producers:  coder, backend-dev, devops
  Evaluators: reviewer, tester, security-specialist
  Decider:    product-owner
  Criteria:   Tests pass, coverage ≥ 80%, security clean

CONTENT CREATION:
  Producers:  copywriter, seo-specialist, content-strategist
  Evaluators: editor, brand-reviewer, compliance-checker
  Decider:    editorial-director
  Criteria:   Readability score, brand voice, SEO, fact-check

RESEARCH:
  Producers:  researcher, data-analyst, domain-expert
  Evaluators: fact-checker, methodology-reviewer, statistician
  Decider:    research-director
  Criteria:   Sources cited, methodology sound, reproducible

DESIGN:
  Producers:  ui-designer, ux-researcher, visual-designer
  Evaluators: accessibility-advocate, design-critic, user-tester
  Decider:    creative-director
  Criteria:   WCAG 2.1 AA, design system, user testing

INFRASTRUCTURE:
  Producers:  terraform-engineer, kubernetes-architect
  Evaluators: security-auditor, cost-optimizer, compliance
  Decider:    infrastructure-director
  Criteria:   Security posture, cost budget, compliance

DATA ENGINEERING:
  Producers:  data-engineer, pipeline-builder, etl-specialist
  Evaluators: data-quality-validator, schema-reviewer
  Decider:    data-platform-owner
  Criteria:   Data quality, schema valid, performance SLA
```

**Key Insight:** Same loop structure, different agents and validation criteria.

---

## 2. Coordinator Strategic Capabilities

### Lifecycle: Before → During → After

```
┌────────────────────────────────────────────────────────────────┐
│ BEFORE ORCHESTRATION: Strategic Planning                      │
├────────────────────────────────────────────────────────────────┤
│ ✓ Analyze task description                                    │
│ ✓ Determine task type (auto-classify)                         │
│ ✓ Select agent archetypes                                     │
│ ✓ Load validation criteria template                           │
│ ✓ Set resource budget (iterations, timeout, agents)           │
│ ✓ Query playbook: "Have we done this before?"                │
│ ✓ Inject learned context from similar tasks                   │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ DURING ORCHESTRATION: Real-Time Monitoring                    │
├────────────────────────────────────────────────────────────────┤
│ ✓ Monitor confidence score trends                             │
│ ✓ Detect stuck patterns:                                      │
│   • Confidence plateau (2+ iterations, Δ < 0.05)             │
│   • Same validator feedback 3+ times                          │
│   • Product Owner defers repeatedly                           │
│ ✓ Intervene when needed:                                      │
│   • Swap underperforming agents                               │
│   • Add specialist (e.g., security-specialist)                │
│   • Adjust iteration budget                                   │
│   • Simplify scope                                            │
│ ✓ Prune context (keep summaries, not raw logs)               │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ AFTER ORCHESTRATION: Learning & Synthesis                     │
├────────────────────────────────────────────────────────────────┤
│ ✓ Synthesize sprint learnings                                 │
│ ✓ Update playbook:                                            │
│   • "For tasks like X, strategy Y worked"                    │
│   • "Agent A + Agent B pair well"                            │
│   • "Validator Z focuses on edge cases"                       │
│ ✓ Store strategic context (not raw logs)                     │
│ ✓ Feed meta-insights to next sprint                          │
│ ✓ Trigger Loop 5 Reflector                                   │
└────────────────────────────────────────────────────────────────┘
```

### Context Pruning Example

```
Iteration 1 Context:  5 KB  (full detail)
Iteration 2 Context:  8 KB  (iter 1 summary + iter 2 detail)
Iteration 5 Context: 12 KB  (iter 1-4 summary + iter 5 detail)
Iteration 10 Context: 15 KB (iter 1-9 summary + iter 10 detail)

vs v2:
Iteration 10 Context: 120 KB (everything accumulated)

Savings: 88% reduction in context size
```

---

## 3. Context Injection vs Redis Coordination Tradeoffs

### Decision Matrix

```
┌─────────────────────────┬──────────────────┬────────────────────┐
│ Scenario                │ Context Inject   │ Redis Coordination │
├─────────────────────────┼──────────────────┼────────────────────┤
│ Loop 3 → Loop 2 → Loop 4│ ✅ RECOMMENDED   │ ❌ Overkill        │
│ Sprint execution        │ ✅ RECOMMENDED   │ ❌ Unnecessary     │
│ Iteration feedback      │ ✅ RECOMMENDED   │ ❌ Too complex     │
│ Parallel implementers   │ ⚠️  Possible     │ ✅ RECOMMENDED     │
│ Live code review        │ ❌ Can't do this │ ✅ RECOMMENDED     │
│ Pair programming        │ ❌ Can't do this │ ✅ RECOMMENDED     │
│ Data pipeline stages    │ ⚠️  Sequential   │ ✅ RECOMMENDED     │
└─────────────────────────┴──────────────────┴────────────────────┘
```

### Coordinator Spawning & Waiting Patterns

### Spawning Pattern (Task Tool)

❌ **ANTI-PATTERN: CLI-Spawned Coordinator**
```bash
# WRONG: Coordinator should not be CLI-spawned
npx claude-flow-novice swarm "Execute task" --coordinator
```

✅ **CORRECT: Task Tool Coordinator**
```javascript
// Main Chat spawns coordinator using Task() tool
Task("cfn-v3-coordinator", `
  Execute CFN Loop v3 for: Implement authentication system

  Context:
  - Epic: User authentication
  - Success criteria: Tests pass, security validated
  - Max iterations: 10

  Your responsibilities:
  1. Analyze task type → software-development
  2. Select optimal agents → backend-dev, security-specialist
  3. Spawn orchestrator via CLI (background)
  4. Enter BLPOP waiting mode for events
  5. Intervene when: confidence plateau, stuck patterns
  6. Return final result with learnings
`)
```

**Key Point:** Coordinator is a **Task tool agent**. Orchestrator is CLI-spawned by coordinator.

---

### Waiting Pattern (Redis BLPOP)

❌ **ANTI-PATTERN: Sleep Loops**
```bash
# WRONG: Polling with arbitrary timeouts
while true; do
  sleep 60  # Wastes 60 seconds, makes arbitrary API calls
  STATUS=$(check_orchestrator_status)
  if [ "$STATUS" = "complete" ]; then break; fi
done
```

**Problems:**
- Wastes time (sleep delays)
- Wastes tokens (polls during sleep)
- Arbitrary timeouts (why 60 seconds?)
- Misses events between polls

---

✅ **CORRECT: Event-Driven BLPOP**
```bash
# Coordinator spawns orchestrator in background
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard &
ORCHESTRATOR_PID=$!

# Enter BLPOP waiting mode (zero-token, instant wake)
while true; do
  # BLPOP blocks until event arrives (timeout=0 means infinite wait)
  EVENT=$(redis-cli BLPOP "swarm:${TASK_ID}:coordinator:events" 0)

  # Parse event
  EVENT_TYPE=$(echo "$EVENT" | jq -r '.[1]' | jq -r '.type')
  ITERATION=$(echo "$EVENT" | jq -r '.[1]' | jq -r '.iteration')

  case "$EVENT_TYPE" in
    "iteration_complete")
      LOOP3_CONFIDENCE=$(echo "$EVENT" | jq -r '.[1]' | jq -r '.loop3_confidence')
      LOOP2_CONSENSUS=$(echo "$EVENT" | jq -r '.[1]' | jq -r '.loop2_consensus')

      # Check intervention triggers
      if should_intervene "$LOOP3_CONFIDENCE" "$LOOP2_CONSENSUS"; then
        send_intervention_directive "$TASK_ID" "$ITERATION"
      fi
      ;;

    "confidence_plateau")
      # Detected: 2+ iterations with <0.05 improvement
      swap_underperforming_agent "$TASK_ID" "$ITERATION"
      ;;

    "recurring_feedback")
      # Same validator feedback 3+ times
      add_specialist_agent "$TASK_ID" "$ITERATION"
      ;;

    "orchestrator_complete")
      # Final result ready
      break
      ;;
  esac
done

# Collect final result
FINAL_RESULT=$(redis-cli GET "swarm:${TASK_ID}:result")
echo "$FINAL_RESULT"
```

**Benefits:**
- ✅ Zero-token waiting (BLPOP blocks without API calls)
- ✅ Instant wake-up (<100ms when event arrives)
- ✅ No arbitrary timeouts
- ✅ Event-driven, not polling
- ✅ Coordinator only "wakes up" when orchestrator needs attention

---

### Orchestrator Event Publishing

Orchestrator publishes events to wake coordinator:

```bash
# orchestrate-cfn-loop.sh

# After each iteration completes
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

# Usage examples:
publish_coordinator_event "iteration_complete" "{}"
publish_coordinator_event "confidence_plateau" "{\"delta\": 0.03}"
publish_coordinator_event "recurring_feedback" "{\"theme\": \"security\"}"
publish_coordinator_event "orchestrator_complete" "{\"decision\": \"PROCEED\"}"
```

---

### Context Injection (Default)

**How it works:**
```bash
# Coordinator builds context string with everything agent needs
AGENT_CONTEXT="Task: Implement OAuth2

Iteration: 2 of 10

Previous Feedback:
- Iteration 1: Add JWT validation
- Iteration 1: Improve error handling

Deliverables Required:
- src/auth/oauth2.ts
- tests/auth/oauth2.test.ts

Success Criteria:
- All tests pass
- JWT validation implemented
- Error handling improved"

# Spawn agent with complete context
npx claude-flow-novice agent backend-dev \
  --context "$AGENT_CONTEXT"
```

**Pros:**
- ✅ Simple (no wait loops, timeouts, deadlocks)
- ✅ Stateless agents (easier to reason about)
- ✅ Explicit context (no hidden Redis state)
- ✅ Easy testing (just pass different context)
- ✅ Clear sequential flow

**Cons:**
- ❌ No live collaboration (agents can't talk)
- ❌ Context can grow (mitigated by pruning)
- ❌ Coordinator orchestrates everything

---

### Redis Coordination (Opt-In for Live Collaboration)

**How it works:**
```bash
# Coder agent pushes updates live
while coding:
    write_code()
    redis-cli lpush "coder:updates" "$(git diff)"
    sleep 120  # Every 2 minutes

# Reviewer subscribes and provides feedback in real-time
redis-cli subscribe "coder:updates"
for update in updates:
    review_code(update)
    redis-cli lpush "reviewer:feedback" "$FEEDBACK"
```

**Pros:**
- ✅ Live collaboration (agents communicate)
- ✅ True parallelism (work simultaneously)
- ✅ Real-time feedback (faster iteration)
- ✅ Shared state (multiple readers/writers)

**Cons:**
- ❌ Complex (wait loops, timeouts, race conditions)
- ❌ Hard to debug (hidden state in Redis)
- ❌ Timeout risks (agents can block)
- ❌ Requires careful coordination

**Use When:**
- Real-time collaboration needed (pair programming, live review)
- Parallel execution critical (performance requirement)
- Dynamic dependencies (runtime-determined wait conditions)

---

### Example: When Redis Shines

```
TRADITIONAL (Sequential):
  1. Coder writes feature         (10 min)
  2. Reviewer reviews code        (5 min)
  3. Coder addresses feedback     (5 min)
  Total: 20 minutes

LIVE COLLABORATION (Redis):
  1. Coder starts writing         (minute 0)
  2. Reviewer subscribes to updates
  3. Coder pushes updates         (minutes 2, 4, 6, 8, 10)
  4. Reviewer gives incremental feedback (minutes 3, 5, 7, 9)
  5. Coder addresses live
  Total: 12 minutes (40% faster)
```

**Recommendation:** Use context injection as default, opt-in to Redis when you need live collaboration.

---

## 4. Loop 5 - The Reflector

### What is Loop 5?

**Loop 5 runs AFTER sprint completion to extract learnings and update the coordinator's playbook.**

```
Sprint Complete (PROCEED decision)
      ↓
Loop 5 Reflector Analyzes:
  • What worked well?
  • What caused delays?
  • Which agents performed best?
  • Which feedback was most valuable?
  • What would we do differently next time?
      ↓
Update Coordinator Playbook
      ↓
Next Sprint Benefits from Learnings
```

### Example Retrospective Output

```json
{
  "sprint_id": "auth-phase2",
  "completed_at": "2025-10-22T10:30:00Z",

  "velocity": {
    "total_iterations": 3,
    "time_to_convergence": "24 minutes",
    "vs_estimate": "10% faster"
  },

  "agent_performance": {
    "top_performers": [
      {"agent": "security-specialist", "avg_confidence": 0.95},
      {"agent": "backend-dev", "avg_confidence": 0.88}
    ],
    "improvement_needed": [
      {"agent": "coder", "avg_confidence": 0.75}
    ]
  },

  "bottlenecks": [
    {
      "type": "missing_specialist",
      "description": "No security review until iteration 3",
      "impact": "2 iterations wasted",
      "solution": "Add security-specialist to Loop 3 for auth tasks"
    }
  ],

  "lessons_learned": [
    "Always include security-specialist for auth tasks",
    "Backend-dev + security-specialist pair well",
    "Iteration 1 always misses security - improve context"
  ],

  "playbook_updates": [
    {
      "task_pattern": "implement authentication",
      "add_agent": "security-specialist",
      "expected_improvement": "1-2 fewer iterations"
    }
  ]
}
```

**Result:** Next time coordinator sees "implement authentication", it automatically includes security-specialist from iteration 1.

---

## 5. Complete v3 System Flow

```
1. USER SUBMITS TASK
   "Implement OAuth2 authentication"
      ↓
2. COORDINATOR ANALYZES
   ✓ Task type: software-development
   ✓ Complexity: medium-high (security involved)
   ✓ Query playbook: Found similar task (3 months ago)
   ✓ Playbook says: "Include security-specialist from start"
   ✓ Select agents: backend-dev, security-specialist (Loop 3)
                     reviewer, tester, security-auditor (Loop 2)
   ✓ Load validation: tests_pass, coverage≥80%, security_clean
   ✓ Set budget: max 5 iterations, 15 min timeout
      ↓
3. COORDINATOR SPAWNS ORCHESTRATOR (Background CLI)

   3a. Spawn orchestrator in background:
       ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
         --task-id "$TASK_ID" &
       ORCHESTRATOR_PID=$!

   3b. Enter BLPOP waiting mode:
       while true; do
         EVENT=$(redis-cli BLPOP "swarm:${TASK_ID}:coordinator:events" 0)
         handle_event "$EVENT"
       done
      ↓
4. ORCHESTRATOR EXECUTES CFN LOOP

   ITERATION 1:
     ├─► Spawn Loop 3 (backend-dev, security-specialist)
     │   Inject complete context via CLI
     │   Confidence 0.78 (threshold: 0.75)
     │
     ├─► Publish iteration results to Redis
     │   - Event type: "iteration_complete"
     │   - Capture Loop 3 metrics
     │
     ├─► Trigger Loop 2 (reviewer, tester, security-auditor)
     │   Inject Loop 3 context
     │   Consensus 0.82 (threshold: 0.90)
     │
     └─► Loop 4 (product-owner)
         Event: "iteration_feedback"
         Decision: ITERATE

   🔔 COORDINATOR LISTENS:
      - Detects 0.04 confidence improvement
      - Prepares specialist agent intervention

   ITERATION 2:
     ├─► Spawn Loop 3 (plus security-edge-case specialist)
     │   Context: Previous feedback
     │   Confidence 0.85
     │
     ├─► Publish metrics to Redis event stream
     │
     ├─► Loop 2 validations
     │   Consensus 0.88
     │
     └─► Loop 4
         Event: "recurring_feedback"
         Decision: ITERATE

   ITERATION 3:
     ├─► Loop 3 agents optimized
     │   Security specialist engaged
     │   Confidence 0.92
     │
     ├─► Publish event: "iteration_complete"
     │
     ├─► Loop 2 consensus
     │   Result: 0.93
     │
     └─► Loop 4
         Event: "orchestrator_complete"
         Decision: PROCEED ✅
      ↓
5. LOOP 5 REFLECTOR
   - Extract sprint learnings
   - Store in coordination playbook
   - Agent performance tracking
      ↓
6. COORDINATOR LEARNS
   - Update agent pairing strategies
   - Store execution pattern
   - Inject security-specialist recommendation
      ↓
7. RETURN RESULT
   - Deliverables: 6 files
   - Confidence: 0.93
   - Iterations: 3
   - Playbook Updated ✓
```

---

## 6. Key Benefits Summary

### Modularity
```
✓ Add new task types by creating validation templates
✓ Same loop structure, different agent archetypes
✓ Reusable across domains (code, content, research, design, data, infra)
```

### AI-Driven Intelligence
```
✓ Coordinator learns from every execution
✓ Builds playbook of successful strategies
✓ Dynamic agent selection based on task
✓ Real-time intervention when stuck
✓ Context pruning for efficiency
```

### Simplicity
```
✓ Context injection by default (no Redis complexity)
✓ Clear sequential flow
✓ Easy to debug (explicit context)
✓ Opt-in to Redis for live collaboration only
```

### Quality
```
✓ Task-specific validation criteria
✓ Deliverable verification (prevents "consensus on vapor")
✓ Multi-loop validation (producers → evaluators → decider)
✓ Post-sprint retrospective (Loop 5)
```

### Velocity
```
✓ Fewer iterations through learning
✓ Coordinator interventions prevent spinning
✓ Optimal agent selection from playbook
✓ Context pruning reduces token cost
```

---

## 7. Implementation Roadmap

```
Phase 1: Foundation (Weeks 1-2)
  ✓ Coordinator agent template
  ✓ Task type detection
  ✓ Validation templates
  ✓ Context pruning
  ✓ Context injection mode

Phase 2: Dynamic Agents (Weeks 3-4)
  ✓ Agent selection skill
  ✓ Playbook storage (SQLite)
  ✓ Query playbook
  ✓ Agent performance tracking

Phase 3: Task Breakdown (Weeks 5-6)
  ✓ Epic decomposition
  ✓ Sprint planner
  ✓ Dependency extraction

Phase 4: Real-Time Monitoring (Weeks 7-8)
  ✓ Event streaming (Redis pub/sub)
  ✓ Intervention detection
  ✓ Agent swap mechanism
  ✓ Specialist injection

Phase 5: Loop 5 Retrospective (Weeks 9-10)
  ✓ Retrospective agent
  ✓ Analysis framework
  ✓ Pattern extraction
  ✓ Playbook updates

Phase 6: Multi-Domain (Weeks 11-12)
  ✓ Validation templates (all 6 domains)
  ✓ Domain-specific agents
  ✓ Test examples per domain

Phase 7: Polish (Weeks 13-14)
  ✓ Performance optimization
  ✓ Documentation
  ✓ Migration guide (v2 → v3)
```

---

## 8. Quick Comparison: v2 vs v3

```
┌─────────────────────┬──────────────────┬──────────────────┐
│ Feature             │ v2 (Current)     │ v3 (Proposed)    │
├─────────────────────┼──────────────────┼──────────────────┤
│ Task Types          │ 1 (Software)     │ 6 (All domains)  │
│ Coordinator Role    │ Launcher         │ Strategic AI     │
│ Context Management  │ Infinite growth  │ Pruned (88% ↓)   │
│ Agent Selection     │ Fixed config     │ AI-driven        │
│ Learning            │ None             │ Loop 5 + Playbook│
│ Intervention        │ None             │ Real-time        │
│ Coordination        │ Redis (complex)  │ Context + BLPOP  │
│ Coordinator Spawn   │ N/A              │ Task() tool      │
│ Waiting Mechanism   │ Sleep loops      │ Redis BLPOP      │
│ Iterations (avg)    │ 5.2              │ 3.5 (33% ↓)     │
│ Time to Converge    │ 45 min           │ 30 min (33% ↓)   │
└─────────────────────┴──────────────────┴──────────────────┘
```

---

## Next Steps

1. ✅ Review architecture proposal
2. ⏳ Discuss tradeoffs and priorities
3. ⏳ Approve direction
4. ⏳ Start Phase 1 implementation

**Ready to build the future of CFN Loop?**
