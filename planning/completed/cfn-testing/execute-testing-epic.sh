#!/bin/bash
# Execute CFN Testing Epic v2.0 with reflection checkpoints
# Meta-validation: Using CFN Loop to validate CFN Loop improvements

set -euo pipefail

EPIC_ID="cfn-testing-epic-v2-$(date +%s)"
EPIC_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/planning/cfn-testing"
RESULTS_DIR="$EPIC_DIR/results"
REFLECTION_DIR="$EPIC_DIR/reflections"

# Create results and reflection directories
mkdir -p "$RESULTS_DIR"
mkdir -p "$REFLECTION_DIR"

echo "=========================================="
echo "CFN Testing Epic v2.0 - Production Run"
echo "=========================================="
echo "Epic ID: $EPIC_ID"
echo "Goal: Meta-validation with reflection checkpoints"
echo "Approach: Execute phases as CFN Loop sprints"
echo ""
echo "Features being validated:"
echo "  ✅ P1-P7 simplifications (all 7 priorities)"
echo "  ✅ BUG #21 & #22 fixes"
echo "  ✅ Phase 1: Feedback accumulation"
echo "  ✅ Phase 2: Validator feedback extraction"
echo "  ✅ Phase 3: Sprint execution skill"
echo ""
echo "Reflection checkpoints after each phase"
echo "=========================================="
echo ""

# Phase 0: Regression Suite (Sprint 1)
PHASE0_TASK_ID="cfn-regression-$(date +%s)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SPRINT 1: Phase 0 - Regression Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Duration: 30 minutes"
echo "Tests: 3 critical regression tests"
echo "Purpose: Validate P1-P7 + Phases 1-3 haven't broken"
echo ""

PHASE0_EPIC_CONTEXT='{
  "epicGoal": "Validate P1-P7 simplifications and feedback accumulation (Phases 1-3) in production - meta-validation first run",
  "inScope": [
    "P1: Coordinator monitoring (no premature exit)",
    "P2: SQLite logging to .claude/data/cfn-loop.db",
    "P3: Agent lifecycle clean-exit pattern",
    "P4: Product Owner scope enforcement (DEFER_AND_PROCEED)",
    "P5: Fork-ID removal (zero references)",
    "P6: Spawning pattern separation",
    "P7: Redis script cleanup (report/collect/shutdown only)",
    "BUG #21: Confidence storage gap fix",
    "BUG #22: Wake calls removal (5 locations)",
    "Phase 1: Feedback accumulation (3 storage points + context injection)",
    "Phase 2: Validator feedback extraction",
    "Phase 3: Sprint execution skill"
  ],
  "outOfScope": [
    "New feature development",
    "Performance optimization beyond measurement",
    "UI/UX improvements"
  ]
}'

PHASE0_PHASE_CONTEXT='{
  "currentPhase": "phase-0-regression-suite",
  "phaseName": "Regression Suite - Quick Smoke Tests",
  "deliverables": [
    "planning/cfn-testing/results/phase-0-p1-p7-smoke-test.md",
    "planning/cfn-testing/results/phase-0-feedback-accumulation-test.md",
    "planning/cfn-testing/results/phase-0-sprint-skill-test.md",
    "planning/cfn-testing/reflections/phase-0-reflection.md"
  ],
  "directory": "planning/cfn-testing/results",
  "tests": [
    {
      "testId": "regression-01",
      "name": "P1-P7 Quick Smoke Test",
      "objective": "Verify all 7 priorities + BUG fixes still work",
      "expectedDuration": "5 minutes",
      "criticalChecks": [
        "Coordinator does not exit prematurely (P1)",
        "SQLite event logged correctly (P2)",
        "Agent exits cleanly without waiting mode (P3)",
        "Product Owner PROCEED enforced (P4)",
        "Zero fork-ID references in logs (P5)",
        "Agent spawned with correct parameters (P6)",
        "Only report/collect/shutdown Redis commands (P7)",
        "Confidence stored and retrieved (BUG #21)",
        "No wake commands in logs (BUG #22)"
      ]
    },
    {
      "testId": "regression-02",
      "name": "Feedback Accumulation Smoke Test",
      "objective": "Verify Phases 1-3 feedback system works",
      "expectedDuration": "15 minutes",
      "expectedIterations": 3,
      "criticalChecks": [
        "Feedback stored at 3 locations (lines 1121, 1151, 1602)",
        "Feedback history retrieved in iteration 2+",
        "Feedback prepended to Loop 3 context",
        "Validator feedback stored separately",
        "Confidence improves with feedback (iteration N+1 > iteration N)"
      ]
    },
    {
      "testId": "regression-03",
      "name": "Sprint Skill Smoke Test",
      "objective": "Verify Phase 3 sprint execution skill works",
      "expectedDuration": "10 minutes",
      "criticalChecks": [
        "Sprint skill file exists",
        "Sprint context stored and retrieved from Redis",
        "Focused deliverables injected correctly",
        "Fallback to standard context works"
      ]
    }
  ]
}'

PHASE0_SUCCESS_CRITERIA='{
  "acceptanceCriteria": [
    "All 3 regression tests executed",
    "Test results documented in deliverables",
    "Reflection document captures what worked and what did not",
    "Any regressions identified and documented",
    "Consensus on regression status >= 0.90",
    "All deliverable files created"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90
}'

echo "Launching Phase 0 orchestrator..."
echo ""

./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$PHASE0_TASK_ID" \
  --mode standard \
  --phase-id "phase-0-regression" \
  --loop3-agents "analyst,tester" \
  --loop2-agents "reviewer,code-quality-validator" \
  --product-owner "product-owner" \
  --max-iterations 3 \
  --epic-context "$PHASE0_EPIC_CONTEXT" \
  --phase-context "$PHASE0_PHASE_CONTEXT" \
  --success-criteria "$PHASE0_SUCCESS_CRITERIA" 2>&1 | tee "$RESULTS_DIR/phase-0-execution-log.txt"

PHASE0_EXIT_CODE=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "REFLECTION CHECKPOINT: Phase 0"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Phase 0 Exit Code: $PHASE0_EXIT_CODE"
echo ""
echo "Generating reflection document..."
echo ""

# Launch reflection agent to analyze Phase 0 results
REFLECTION_TASK_ID="reflection-phase0-$(date +%s)"

REFLECTION_CONTEXT='{
  "reflectionPhase": "phase-0-regression",
  "reflectionGoal": "Analyze Phase 0 regression suite execution and capture feedback on what worked and what did not",
  "analysisScope": [
    "Review execution log: planning/cfn-testing/results/phase-0-execution-log.txt",
    "Review test deliverables created",
    "Identify successes (features that worked as expected)",
    "Identify failures (features that did not work)",
    "Identify surprises (unexpected behavior)",
    "Identify blockers (issues preventing progress)",
    "Recommend improvements for next phase"
  ],
  "deliverables": [
    "planning/cfn-testing/reflections/phase-0-reflection.md"
  ]
}'

REFLECTION_CRITERIA='{
  "acceptanceCriteria": [
    "Reflection document created",
    "Successes documented with examples",
    "Failures documented with root cause analysis",
    "Surprises documented with impact assessment",
    "Blockers identified with severity",
    "Recommendations provided for Phase 1",
    "Go/No-Go decision for Phase 1 documented"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90
}'

echo "Launching reflection agent for Phase 0..."
echo ""

./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$REFLECTION_TASK_ID" \
  --mode standard \
  --phase-id "reflection-phase0" \
  --loop3-agents "analyst" \
  --loop2-agents "reviewer" \
  --product-owner "product-owner" \
  --max-iterations 2 \
  --epic-context "$REFLECTION_CONTEXT" \
  --phase-context "$REFLECTION_CONTEXT" \
  --success-criteria "$REFLECTION_CRITERIA" 2>&1 | tee "$RESULTS_DIR/phase-0-reflection-log.txt"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 0 COMPLETE - PAUSING FOR REVIEW"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Deliverables:"
echo "  - Execution log: $RESULTS_DIR/phase-0-execution-log.txt"
echo "  - Reflection log: $RESULTS_DIR/phase-0-reflection-log.txt"
echo "  - Reflection doc: $REFLECTION_DIR/phase-0-reflection.md"
echo ""
echo "Next Steps:"
echo "  1. Review Phase 0 reflection document"
echo "  2. Address any critical blockers"
echo "  3. Decide: Proceed to Phase 1 or fix Phase 0 issues"
echo "  4. Run: bash planning/cfn-testing/execute-phase-1.sh (when ready)"
echo ""
echo "Epic ID: $EPIC_ID"
echo "Status: PHASE 0 COMPLETE - AWAITING GO/NO-GO DECISION"
echo ""
echo "=========================================="
