# CFN v3 Architecture Proposal

## Part 2: Enhanced Coordinator Role

### Coordinator as Task Tool Agent

❌ ANTI-PATTERN: CLI-Spawned Coordinator
```javascript
// Incorrect: CLI-spawned coordinator
npx claude-flow-novice swarm "Execute task" --coordinator
```

✅ CORRECT PATTERN: Task Tool Coordinator
```javascript
// Main Chat spawns coordinator using Task tool
Task("cfn-v3-coordinator", `
  Execute CFN Loop v3 for: ${TASK_DESCRIPTION}

  Your responsibilities:
  1. Analyze task type
  2. Select optimal agents
  3. Spawn orchestrator via CLI
  4. Monitor execution via Redis pub/sub
  5. Intervene when needed
  6. Return final result
`)
```

### Redis BLPOP Waiting Pattern

❌ ANTI-PATTERN: Sleep Loops
```bash
# Inefficient, high-overhead monitoring
while true; do
  sleep 60  # Arbitrary timeout
  check_status
done
```

✅ CORRECT PATTERN: Event-Driven Redis BLPOP
```bash
# Coordinator enters waiting mode for orchestrator events
while true; do
  # BLPOP blocks until event arrives (no polling)
  EVENT=$(redis-cli BLPOP "swarm:${TASK_ID}:coordinator:events" 0)

  EVENT_TYPE=$(echo "$EVENT" | jq -r '.type')

  case "$EVENT_TYPE" in
    "iteration_complete")
      # Check for intervention triggers
      if should_intervene; then
        send_intervention_directive
      fi
      ;;
    "confidence_plateau")
      # Swap agents
      swap_underperforming_agent
      ;;
    "orchestrator_complete")
      # Exit waiting loop
      break
      ;;
  esac
done

# Collect final result
RESULT=$(get_orchestrator_result "$TASK_ID")
```

## Part 3: Context Injection vs Redis Coordination

### Coordinator-Orchestrator Communication (Redis Events)

Orchestrator Event Publishing:
```bash
# After each iteration
redis-cli LPUSH "swarm:${TASK_ID}:coordinator:events" "$(cat <<EOF
{
  "type": "iteration_complete",
  "iteration": $ITERATION,
  "loop3_confidence": $LOOP3_CONFIDENCE,
  "loop2_consensus": $LOOP2_CONSENSUS,
  "timestamp": $(date +%s)
}
EOF
)"

# When detecting plateau
redis-cli LPUSH "swarm:${TASK_ID}:coordinator:events" "$(cat <<EOF
{
  "type": "confidence_plateau",
  "iteration": $ITERATION,
  "delta": $CONFIDENCE_DELTA
}
EOF
)"

# When complete
redis-cli LPUSH "swarm:${TASK_ID}:coordinator:events" "$(cat <<EOF
{
  "type": "orchestrator_complete",
  "decision": "$DECISION_TYPE",
  "final_confidence": $FINAL_CONFIDENCE
}
EOF
)"
```

## Part 5: Complete v3 Architecture

### System Interaction Flow
1. Main Chat → Task(coordinator)
2. Coordinator → CLI spawn orchestrator
3. Orchestrator → Publish Redis events
4. Coordinator → BLPOP waiting mode
5. Coordinator → Intervention/Completion