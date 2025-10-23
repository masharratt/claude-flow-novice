# orchestrate-cfn-loop-v3.sh Specification

## Purpose
Enhanced CFN Loop orchestrator with v3 intelligence: domain-specific validation, adaptive context pruning, real-time intervention, and automatic learning.

---

## Input Parameters (from Coordinator)

```bash
./orchestrate-cfn-loop-v3.sh \
  --task-id "auth-impl-2025-10-23" \
  --task-type "software-development" \
  --loop3-agents "backend-dev,security-specialist" \
  --loop2-agents "reviewer,tester,security-auditor" \
  --validation-template ".claude/skills/validation-templates/software.json" \
  --estimated-iterations 4 \
  --playbook-task-id "auth-pattern-001" \
  --mode "standard" \
  --epic-context '{"epicGoal":"Auth system","inScope":["JWT","2FA"]}' \
  --phase-context '{"deliverables":["auth.ts","auth.test.ts"]}' \
  --success-criteria '{"acceptanceCriteria":["Tests pass","Coverage >80%"]}'
```

---

## V3 Skills Integration

### 1. Validation Template Loading (Start of Orchestration)
**Skill:** `validation-templates/{task_type}.json`
**When:** Load once at start
**Purpose:** Domain-specific consensus criteria

```bash
# Load template
VALIDATION_TEMPLATE=$(cat "$VALIDATION_TEMPLATE_PATH")

# Extract thresholds
GATE_THRESHOLD=$(echo "$VALIDATION_TEMPLATE" | jq -r '.success_metrics.gate_threshold')
CONSENSUS_THRESHOLD=$(echo "$VALIDATION_TEMPLATE" | jq -r '.success_metrics.consensus_threshold')

# Extract criteria for Loop 2 context injection
CRITICAL_CRITERIA=$(echo "$VALIDATION_TEMPLATE" | jq -r '.validation_criteria.critical | join(", ")')
IMPORTANT_CRITERIA=$(echo "$VALIDATION_TEMPLATE" | jq -r '.validation_criteria.important | join(", ")')
```

**Usage:**
- Gate check uses `GATE_THRESHOLD` (0.75 for software, 0.70 for content, 0.85 for infrastructure)
- Loop 2 validators receive criteria in context: "Verify these critical items: [Tests pass, Security scan clean, ...]"
- Consensus check uses `CONSENSUS_THRESHOLD`

---

#### 2. Intervention Detection (After Each Iteration)
**Skill:** `intervention-detector/detect-intervention.sh`
**When:** After Loop 2 consensus, before Product Owner decision
**Purpose:** Detect stuck patterns and trigger adaptive corrections

```bash
# Build history arrays
CONFIDENCE_HISTORY="${confidence_scores[@]}"  # "0.72,0.74,0.75"
DELIVERABLES_HISTORY="${deliverable_counts[@]}"  # "0,0,1"

# Detect intervention need
INTERVENTION_RESULT=$(./.claude/skills/intervention-detector/detect-intervention.sh \
  --confidence-history "$CONFIDENCE_HISTORY" \
  --feedback-history "$FEEDBACK_JSON" \
  --deliverables-history "$DELIVERABLES_HISTORY" \
  --iteration "$iteration")

INTERVENTION_NEEDED=$(echo "$INTERVENTION_RESULT" | jq -r '.intervention_needed')

if [ "$INTERVENTION_NEEDED" = "true" ]; then
  INTERVENTION_TYPE=$(echo "$INTERVENTION_RESULT" | jq -r '.type')

  # Apply intervention via orchestrator skill
  ./.claude/skills/intervention-orchestrator/execute-intervention.sh \
    --type "$INTERVENTION_TYPE" \
    --current-agents "$LOOP3_AGENTS" \
    --feedback "$LOOP2_FEEDBACK" \
    --deliverables "$PHASE_DELIVERABLES"

  # Update agent roster or scope based on intervention result
  # Then continue iteration with modified config
fi
```

**Intervention Types:**
- `agent-swap`: Replace underperforming agent
- `specialist-injection`: Add domain specialist
- `scope-simplification`: Reduce deliverables

---

### 4. Playbook Update (After Completion)
**Skill:** `playbook/update-playbook.sh`
**When:** When Product Owner says PROCEED
**Purpose:** Store successful patterns for future query

```bash
if [ "$DECISION" = "PROCEED" ]; then
  # Aggregate feedback themes
  COMMON_FEEDBACK=$(echo "$ALL_FEEDBACK" | jq -s 'group_by(.theme) | map({theme: .[0].theme, count: length}) | sort_by(.count) | reverse | .[0:5]')

  # Update playbook
  ./.claude/skills/playbook/update-playbook.sh \
    --task-pattern "$TASK_DESCRIPTION" \
    --task-type "$TASK_TYPE" \
    --loop3-agents "$LOOP3_AGENTS" \
    --loop2-agents "$LOOP2_AGENTS" \
    --iterations-required "$iteration" \
    --final-confidence "$FINAL_GATE_SCORE" \
    --final-consensus "$FINAL_CONSENSUS" \
    --common-feedback "$COMMON_FEEDBACK"

  echo "✅ Playbook updated: $PLAYBOOK_TASK_ID"
fi
```

---

### 5. Retrospective Trigger (After Completion)
**Skill:** `retrospective-analyst` agent + 4 skills
**When:** After playbook update (final step)
**Purpose:** Extract patterns and generate improvement recommendations

```bash
if [ "$DECISION" = "PROCEED" ]; then
  # Spawn retrospective analyst
  RETROSPECTIVE_REPORT=$(npx claude-flow-novice spawn-agent \
    --agent-type "retrospective-analyst" \
    --task-id "$TASK_ID" \
    --context "{
      \"sprint_name\": \"$TASK_DESCRIPTION\",
      \"total_iterations\": $iteration,
      \"confidence_history\": [${confidence_scores[@]}],
      \"consensus_history\": [${consensus_scores[@]}],
      \"feedback_history\": $FEEDBACK_JSON,
      \"interventions_applied\": $INTERVENTIONS_JSON,
      \"agents_used\": {
        \"loop3\": \"$LOOP3_AGENTS\",
        \"loop2\": \"$LOOP2_AGENTS\"
      },
      \"final_deliverables\": $(git diff --name-only HEAD~1)
    }")

  # Retrospective analyst will:
  # 1. Extract patterns (pattern-extraction/extract-patterns.sh)
  # 2. Auto-update playbook (playbook-auto-update/auto-update-playbook.sh)
  # 3. Recommend improvements (improvement-recommender/recommend-improvements.sh)
  # 4. Generate report (retrospective-report/generate-report.sh)

  echo "📊 Retrospective complete: See docs/retrospective-$TASK_ID.md"
fi
```

---

## Orchestrator Flow Diagram

```
START
  ↓
Load Validation Template (software.json)
  ↓
Iteration Loop:
  ↓
  Spawn Loop 3 Agents (CLI)
  ↓
  Gate Check (use validation template thresholds)
  ↓
  [FAIL] → Iterate
  [PASS] → Continue
  ↓
  Spawn Loop 2 Validators (CLI)
  (Inject critical criteria from validation template)
  ↓
  Collect Consensus
  ↓
  Check Intervention Triggers ← intervention-detector
  ↓
  [Intervention Needed]
    → Apply Intervention ← intervention-orchestrator
    → Update agent roster or scope
  ↓
  Spawn Product Owner (CLI)
  ↓
  Decision:
    [ITERATE] → Loop back
    [PROCEED] → Exit loop
    [ABORT] → Exit with error
  ↓
END LOOP
  ↓
Update Playbook ← playbook/update-playbook.sh
  ↓
Spawn Retrospective Analyst ← retrospective-analyst agent
  ↓
Return Result to Coordinator
```

---

## V3 vs V2 Comparison

| Feature | V2 Orchestrator | V3 Orchestrator |
|---------|-----------------|-----------------|
| **Validation** | Generic thresholds | Domain-specific criteria |
| **Stuck Detection** | None | Intervention detector |
| **Agent Roster** | Fixed | Adaptive (swap/inject) |
| **Learning** | Manual | Automatic playbook update |
| **Retrospective** | None | Automatic Loop 5 analysis |
| **Scope** | Static | Adaptive simplification |

---

## Skills NOT Used by Orchestrator

**Pre-Orchestration (Coordinator Only):**
- ❌ `task-classifier` (coordinator determines domain once)
- ❌ `complexity-estimator` (coordinator predicts iterations once)
- ❌ `agent-selector` (coordinator chooses initial roster)
- ❌ `playbook/query-playbook.sh` (coordinator queries for initial config)

**Epic-Level (Main Chat Only):**
- ❌ `epic-decomposer` (Main Chat breaks epic into sprints)
- ❌ `sprint-planner` (Main Chat creates sprint boundaries)
- ❌ `dependency-extractor` (Main Chat sequences sprints)
- ❌ `sprint-execution` (wrapper around multiple CFN Loops)

---

## File Structure

```
.claude/skills/redis-coordination/
├── orchestrate-cfn-loop.sh          # V2 (baseline)
└── orchestrate-cfn-loop-v3.sh       # V3 (enhanced) ← NEW

Uses:
├── validation-templates/{domain}.json   # Load once
├── intervention-detector/               # After each consensus
├── intervention-orchestrator/           # When intervention needed
├── playbook/update-playbook.sh         # On completion
└── (triggers) retrospective-analyst     # On completion
```

---

## Testing Requirements

### Unit Tests
- [ ] Validation template loading for all 6 domains
- [ ] Context pruning reduces size by 80%+
- [ ] Intervention detection triggers correctly (plateau, recurring feedback, stuck deliverables)
- [ ] Playbook update writes correct records
- [ ] Retrospective triggering includes all context

### Integration Tests
- [ ] Full CFN Loop execution (single iteration)
- [ ] Multi-iteration with context pruning
- [ ] Intervention triggering and agent swap
- [ ] Playbook update and retrospective generation
- [ ] Domain-specific validation (software vs content vs infrastructure)

---

## Success Criteria

✅ Orchestrator loads and applies domain-specific validation templates
✅ Context size reduces by 80%+ after iteration 2
✅ Intervention detection identifies stuck patterns
✅ Agent roster adapts via swap/injection when needed
✅ Playbook updates automatically on completion
✅ Retrospective runs and generates markdown report
✅ All v2 functionality preserved (Redis BLPOP, CLI spawning, zero-token waiting)
