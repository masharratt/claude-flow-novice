 Forking - Moderate Value

  Current Situation

  - CLI spawning: 10s for 5 agents (sequential)
  - SDK forking: <500ms for 10 agents (parallel)
  - Current cost optimization already 95-98% with Z.ai routing

  Where It Would Help

  1. CFN Loop Iteration Speed (Primary benefit)
  Current (CLI):
  Loop 3 Iteration 2 → Spawn 5 agents → 10s delay → Work → Results       
  Loop 3 Iteration 3 → Spawn 5 agents → 10s delay → Work → Results       

  With Forking:
  Loop 3 Iteration 2 → Fork 5 sessions → <500ms → Work → Results
  Loop 3 Iteration 3 → Fork 5 sessions → <500ms → Work → Results

  Savings: 9.5s per iteration × 10 iterations = 95s per CFN Loop
  phase

  2. Epic Execution with Many Phases
  - Epic with 8 phases × 10 iterations = 80 agent spawns
  - Current: 80 × 10s = 13.3 minutes of pure spawning overhead
  - With forking: 80 × 0.5s = 40 seconds
  - Savings: 12.7 minutes per epic

  3. Simplified Coordination
  - No Redis pub/sub needed for basic orchestration
  - No BLPOP blocking for iteration handoff
  - Lower complexity (but loses distributed coordination benefits)       

  Trade-offs

  ✅ Benefits:
  - 20x faster spawning
  - Simpler coordination for single-phase tasks
  - Built-in conversation context sharing

  ❌ Costs:
  - Requires API access (not available with subscription-only)
  - Cannot mix providers (all Z.ai or all Claude Max)
  - Loses Redis-based distributed coordination
  - Less flexible than current architecture

  Recommendation

  Conditional adoption if you have API access:
  - Use for rapid iteration scenarios (CFN Loop with frequent
  retries)
  - Use for epics with 5+ phases (significant spawning overhead
  reduction)
  - Keep CLI spawning for complex distributed coordination (current      
  Redis patterns work well)

  ---
  Pause/Resume - High Value

  Current Pain Points

  1. Bash Timeout Limit (10 minutes hard cap)
  From BUG_7 investigation:
  # Current workaround (from STRAT-007)
  ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "$TASK_ID" \
    --mode standard &

  # Monitor in background
  ORCHESTRATOR_PID=$!

  # Problem: Bash tool timeout after 10 minutes
  # Workaround: Background execution + Redis monitoring

  With Pause/Resume:
  const orchestrator = query({
    prompt: "Execute CFN Loop for Phase 4",
    options: { maxTurns: 50 }  // Can run indefinitely
  });

  // Pause at 9 minutes if needed
  await orchestrator.interrupt();

  // Resume when ready (preserves full state)
  await orchestrator.resume();

  2. Human Review Checkpoints
  Current: Kill agent → Review → Restart with context (loses
  in-flight work)

  With pause/resume:
  const complexAgent = query({
    prompt: "Implement security-critical auth system",
    options: { forkSession: true }
  });

  // Agent works for 30 minutes...
  // Pause for human review
  await complexAgent.interrupt();

  // Human reviews logs/code
  // "Looks good, continue with OAuth integration"

  // Resume with injected guidance
  await complexAgent.resume({
    resumeSessionAt: lastMessageUUID,
    additionalContext: "Add OAuth2 PKCE flow support"
  });

  3. Resource Management
  // Low-priority documentation agent working
  const docAgent = query({ prompt: "Generate API docs" });

  // High-priority security issue arrives
  await docAgent.interrupt();  // Pause (preserves work)

  // Handle security issue...
  const securityFix = query({ prompt: "Fix CVE-2025-1234" });
  await securityFix;  // Complete

  // Resume documentation (zero re-work)
  await docAgent.resume();

  Concrete Use Cases

  1. Loop 3 Long-Running Implementations
  Scenario: Agent implementing complex feature takes 45 minutes
  Current: Bash timeout at 10 min → Kill → Restart → Lose progress       
  With pause/resume: Pause at 9 min → Resume in new session →
  Continue seamlessly

  2. Interactive CFN Loop
  Loop 3 Iteration 3 → Agent confidence 68% → Pause agent
  Human reviews incomplete work → Provides targeted feedback
  Resume agent with feedback → Agent continues from pause point
  Confidence now 92% → Proceed to Loop 2

  3. Debugging Agent Behavior
  Agent exhibits unexpected behavior at Step 7 of 12
  Pause immediately → Inspect agent state, files, memory
  Adjust strategy → Resume with corrections
  Complete remaining steps successfully

  4. Cost-Optimized Long Workflows
  Epic: 8 phases × 2 hours each = 16 hours total
  Current: Must run continuously (high risk of timeout/interruption)     
  With pause/resume: Pause between phases, resume when ready
  True $0 cost during pauses (vs keeping agent alive)

  Implementation Path

  Option 1: Full SDK Adoption (API required)
  - Switch Main Chat API calls to use Z.ai provider
  - Use query({ forkSession: true }) for all agent spawning
  - Use query.interrupt() and query.resume() for long workflows
  - Cost: Same as current (Z.ai routing) + API access needed
  - Benefit: Session forking + pause/resume

  Option 2: Hybrid SDK + CLI (Best of both worlds)
  // Coordinator via SDK (pause/resume control)
  const coordinator = query({
    prompt: "Orchestrate CFN Loop Phase 4",
    options: { maxTurns: 100 }
  });

  // Workers via CLI (cost-optimized, current pattern)
  // Coordinator spawns workers via Bash tool
  // Use Redis for coordination (current proven pattern)

  // Pause coordinator if needed (long-running orchestration)
  if (needsHumanReview) {
    await coordinator.interrupt();
    // Human reviews, provides input
    await coordinator.resume();
  }

  Option 3: Custom Pause/Resume via Redis (No SDK needed)
  Implement checkpoint-based pause/resume (like legacy test):
  # Agent checkpoints state to Redis every 5 minutes
  ./.claude/skills/agent-lifecycle/checkpoint-state.sh \
    --agent-id "$AGENT_ID" \
    --iteration 3 \
    --confidence 0.72

  # Coordinator can pause agent
  redis-cli SET "swarm:$TASK_ID:$AGENT_ID:pause-signal" "1"

  # Agent detects pause signal, saves state, exits
  # Resume: Spawn agent with --resume flag, loads state from Redis       

  ---
  Final Recommendations

  Immediate Actions (No API Required)

  1. Implement Custom Pause/Resume via Redis Checkpoints
  - Value: Solves 10-minute Bash timeout limit
  - Complexity: Medium (2-3 days implementation)
  - Pattern: Similar to legacy pause/resume test (proven working)        
  - Use case: Long-running orchestration (>10 minutes)

  2. Background Execution + Redis Monitoring (Already Done -
  STRAT-007)
  - Current workaround for long workflows
  - Keep using for orchestration >10 minutes
  - Works well but lacks mid-execution control

  Future Enhancements (API Access Required)

  3. Evaluate SDK Session Forking (If API access available)
  - Value: 20x faster spawning, simpler coordination
  - Cost: Same as current (Z.ai routing)
  - Use case: CFN Loop with many iterations, epics with 5+ phases        
  - Trade-off: Loses Redis distributed coordination benefits

  4. Adopt SDK Pause/Resume (If API access available)
  - Value: True pause/resume with state preservation
  - Cost: Requires API access, state management on Anthropic servers     
  - Use case: Interactive workflows, human-in-the-loop, resource
  management
  - Benefit: Zero re-work on resume, true $0 cost during pause

  Prioritization

  High Priority (Solves current pain points):
  1. Custom pause/resume via Redis (addresses 10-min timeout)
  2. Interactive review checkpoints (improves CFN Loop quality)

  Medium Priority (Performance optimization):
  3. Session forking for CFN Loop speed (if API access available)        

  Low Priority (Nice to have):
  4. SDK pause/resume (if interactive workflows become common)

  Decision Criteria

  Use Custom Redis Pause/Resume if:
  - Workflows routinely exceed 10 minutes
  - Need human review checkpoints
  - Want to avoid Bash timeout limitations
  - Prefer to stay with CLI subscription model

  Use SDK Session Forking if:
  - Have API access available
  - CFN Loop iterations are bottleneck (>8 phases per epic)
  - Spawning overhead is >15% of total execution time
  - Willing to trade Redis coordination for speed

  Use SDK Pause/Resume if:
  - Have API access available
  - Need true mid-execution state preservation
  - Interactive human-in-the-loop workflows are common
  - Cost optimization during pauses is critical

───────────────