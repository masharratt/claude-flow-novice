# Adoptable Agent Architecture Patterns
## Implementation Guide

**Quick Reference:** Three proven patterns from QuDAG/daa/claude-flow-novice that can immediately improve agent coordination systems.

---

## Pattern 1: Confidence Gating
### Removes subjective opinions from pass/fail decisions

**Problem it solves:**
- Agents argue about whether work is "good enough"
- Humans can't easily decide between competing implementations
- No objective criteria for moving forward

**The Pattern:**
```
Agent Output → Confidence Score (0.0-1.0) → Compare to THRESHOLD
                                              ├─ Pass (≥ threshold) → Proceed
                                              └─ Fail (< threshold) → Retry
```

**Implementation: claude-flow-novice (Current)**
```bash
# cfn-loop-orchestration/orchestrate.sh

# 1. Agents report confidence with their output
LOOP3_AGENT_CONFIDENCE[0]=0.82
LOOP3_AGENT_CONFIDENCE[1]=0.79
LOOP3_AGENT_CONFIDENCE[2]=0.88

# 2. Calculate average confidence
avg_confidence=$((
    (${LOOP3_AGENT_CONFIDENCE[0]} +
     ${LOOP3_AGENT_CONFIDENCE[1]} +
     ${LOOP3_AGENT_CONFIDENCE[2]}) / 3
))

# 3. Gate check (hard threshold, no opinions)
GATE_THRESHOLD=0.75  # Configurable per mode

if (( $(echo "$avg_confidence >= $GATE_THRESHOLD" | bc -l) )); then
    echo "✅ GATE PASSED ($avg_confidence >= $GATE_THRESHOLD)"
    proceed_to_loop_2
else
    echo "❌ GATE FAILED ($avg_confidence < $GATE_THRESHOLD)"
    iterate_loop_3
fi
```

**How to Adopt in daa:**
```rust
// daa-orchestrator/src/workflow.rs

pub struct WorkflowExecutionContext {
    pub confidence_threshold: f64,  // Mode-dependent
    pub agent_outputs: Vec<AgentOutput>,
}

pub fn check_confidence_gate(ctx: &WorkflowExecutionContext) -> bool {
    let avg_confidence = ctx.agent_outputs
        .iter()
        .map(|o| o.confidence_score)
        .sum::<f64>() / ctx.agent_outputs.len() as f64;

    avg_confidence >= ctx.confidence_threshold
}

pub async fn execute_step_with_gating(
    step: &WorkflowStep,
    config: &OrchestratorConfig,
) -> Result<WorkflowStepResult> {
    loop {
        // Execute agents for this step
        let outputs = execute_agents_for_step(step).await?;

        // Create execution context
        let ctx = WorkflowExecutionContext {
            confidence_threshold: match config.mode {
                Mode::MVP => 0.70,
                Mode::Standard => 0.75,
                Mode::Enterprise => 0.85,
            },
            agent_outputs: outputs,
        };

        // Gate check
        if check_confidence_gate(&ctx) {
            // Aggregate and return
            return aggregate_outputs(ctx.agent_outputs);
        }
        // Otherwise retry loop (implicit iteration)
    }
}
```

**How to Adopt in QuDAG:**
```rust
// qudag-exchange/src/agent_orchestration.rs

pub fn evaluate_task_completion(
    task_id: &str,
    agent_results: Vec<AgentResult>,
    mode: ExecutionMode,
) -> TaskGateDecision {
    let threshold = match mode {
        ExecutionMode::MVP => 0.70,
        ExecutionMode::Standard => 0.75,
        ExecutionMode::Enterprise => 0.85,
    };

    let avg_confidence = agent_results
        .iter()
        .map(|r| r.confidence)
        .sum::<f64>() / agent_results.len() as f64;

    match avg_confidence >= threshold {
        true => TaskGateDecision::Proceed,
        false => TaskGateDecision::Retry,
    }
}

// In task coordinator
match evaluate_task_completion(&task_id, results, mode) {
    TaskGateDecision::Proceed => {
        // Merge results into ledger
        integration_agent.merge_results(results)?;
    }
    TaskGateDecision::Retry => {
        // Spawn coordinator.spawn_task_retry(&task_id)?;
        coordinator.spawn_task_retry(&task_id)?;
    }
}
```

**Configuration Presets:**
```yaml
# Per-mode confidence thresholds
modes:
  mvp:
    gate_threshold: 0.70
    consensus_threshold: 0.80
    max_iterations: 5
    time_budget: "5 minutes"

  standard:
    gate_threshold: 0.75
    consensus_threshold: 0.90
    max_iterations: 10
    time_budget: "30 minutes"

  enterprise:
    gate_threshold: 0.85
    consensus_threshold: 0.95
    max_iterations: 15
    time_budget: "2 hours"
```

**Key Benefits:**
- ✅ Completely objective (no opinions in gate)
- ✅ Automatic retry logic
- ✅ Mode-based risk profiles
- ✅ Easy to debug (inspect confidence scores)
- ✅ Scales to any number of agents

**Anti-patterns to Avoid:**
- ❌ "Agent thinks it's done" (too subjective)
- ❌ "Majority vote" (2 out of 3 isn't good enough)
- ❌ Fixed thresholds (doesn't scale with risk)
- ❌ Averaging with outliers (use median + IQR)

---

## Pattern 2: Blind Validator Review
### Prevents bias from agent reputation/type

**Problem it solves:**
- Validators give favorable reviews to specialized agents
- "This is good because Agent X did it" (credential bias)
- Quick reviews of new agents because no reputation
- Groupthink among familiar agent combinations

**The Pattern:**
```
Loop 3 Agent Output (with metadata)
        ↓ [Remove: agent_id, agent_type, agent_name]
        ↓
Loop 2 Validators Review (don't know who created it)
        ↓ [Vote yes/no/iterate]
        ↓
Unbiased Consensus
```

**Implementation: claude-flow-novice (Current)**
```bash
# cfn-loop-orchestration/orchestrate.sh - Loop 2 Setup

# When spawning validators, strip agent metadata from work
prepare_anonymized_work() {
    local agent_output_file="$1"
    local task_id="$2"

    # Read original output
    local output=$(cat "$agent_output_file")

    # Create anonymized version (keep content, remove metadata)
    jq '
        {
            "content": .content,
            "deliverables": .deliverables,
            "reasoning": .reasoning
        }
    ' <<< "$output" > "/tmp/anonymized_${task_id}.json"

    return "/tmp/anonymized_${task_id}.json"
}

# Before spawning Loop 2, prepare work
for agent_output in $(find /tmp/loop3_outputs -name "*.json"); do
    anonymized=$(prepare_anonymized_work "$agent_output" "$TASK_ID")

    # Store for validator review (without agent metadata)
    redis-cli HSET \
        "swarm:${TASK_ID}:validator-work" \
        "work_$(uuidgen)" \
        "$(cat $anonymized)"
done

# Validators review without seeing: agent_id, agent_type, agent_name
# So they can't have affinity bias
```

**How to Adopt in daa:**
```rust
// daa-orchestrator/src/validation.rs

pub struct AgentOutput {
    pub agent_id: String,
    pub agent_type: String,
    pub content: String,
    pub deliverables: Vec<String>,
    pub reasoning: String,
    pub confidence: f64,
}

pub struct AnonymizedOutput {
    // Remove these fields to enforce blind review:
    // pub agent_id: String,
    // pub agent_type: String,

    pub content: String,
    pub deliverables: Vec<String>,
    pub reasoning: String,
    pub confidence: f64,  // Keep confidence (objective metric)
}

impl AgentOutput {
    pub fn anonymize_for_review(&self) -> AnonymizedOutput {
        AnonymizedOutput {
            content: self.content.clone(),
            deliverables: self.deliverables.clone(),
            reasoning: self.reasoning.clone(),
            confidence: self.confidence,
            // agent_id and agent_type are intentionally dropped
        }
    }
}

pub async fn validate_with_blind_review(
    outputs: Vec<AgentOutput>,
    validators: &[ValidatorAgent],
) -> Result<ConsensusResult> {
    // Anonymize all outputs before sending to validators
    let anonymized = outputs.iter()
        .map(|o| o.anonymize_for_review())
        .collect::<Vec<_>>();

    // Each validator reviews without knowing who created it
    let votes = futures::stream::iter(validators)
        .then(|validator| async move {
            validator.review(&anonymized).await
        })
        .collect::<Vec<_>>()
        .await;

    // Tally votes (no bias)
    consensus_from_votes(votes)
}
```

**How to Adopt in QuDAG:**
```rust
// qudag-exchange/src/integration_agent.rs

pub fn create_blind_merge_request(
    task_id: &str,
    agent_results: Vec<AgentResult>,
) -> BlindMergeRequest {
    let anonymized_submissions = agent_results
        .iter()
        .map(|result| BlindSubmission {
            // These are removed:
            // agent_id: result.agent_id.clone(),
            // agent_specialty: result.specialty.clone(),

            // These are kept:
            code: result.code.clone(),
            tests_passing: result.tests_passing,
            test_count: result.test_count,
            performance_metrics: result.metrics.clone(),
        })
        .collect();

    BlindMergeRequest {
        task_id: task_id.to_string(),
        submissions: anonymized_submissions,
        reviewers: select_integration_agents(3),
    }
}

// Integration agents review without seeing which agent did the work
// They can't favor the "security specialist" over the "new agent"
pub fn review_blind_submission(submission: &BlindSubmission) -> ReviewVote {
    let metrics = ReviewMetrics {
        code_quality: analyze_code(&submission.code),
        test_coverage: submission.test_count,
        test_passing: submission.tests_passing,
        performance: submission.performance_metrics.latency_ms,
    };

    // Vote based purely on metrics, not agent reputation
    match metrics {
        m if m.code_quality > 0.8 && m.test_passing == m.test_count => ReviewVote::Approve,
        _ => ReviewVote::RequestChanges,
    }
}
```

**Implementation Checklist:**
- [ ] Define what metadata to strip (agent_id, agent_type, agent_name)
- [ ] Define what metrics to keep (confidence, test results, performance)
- [ ] Update validator interfaces to accept only anonymized data
- [ ] Add audit trail (record that blind review was performed)
- [ ] Document removal rationale in validator instructions

**Key Benefits:**
- ✅ Removes credential bias
- ✅ Encourages critical evaluation
- ✅ Protects new agents from prejudice
- ✅ Prevents groupthink
- ✅ Makes consensus truly objective

**Anti-patterns to Avoid:**
- ❌ Leaving agent_type visible (validators know specialization)
- ❌ Removing confidence scores (objective metrics should remain)
- ❌ Telling validators who created work (defeats blind purpose)
- ❌ Using original filenames (often encode agent names)

---

## Pattern 3: Test-Driven Convergence
### Uses test results as objective completion criteria

**Problem it solves:**
- "Is this correct?" → Agents disagree
- No objective way to validate completed work
- Agents claim feature complete but tests fail
- Difficult to score confidence without objective baseline

**The Pattern:**
```
Agent completes work
        ↓
Run tests against deliverables
        ↓
Tests pass? (Objective, not opinion)
├─ Yes → Confidence = 0.9 (tests = proof)
└─ No → Confidence = 0.3 (tests = requirement)
```

**Implementation: claude-flow-novice Enhancement**
```bash
# cfn-loop-orchestration/orchestrate.sh - Add test validation

validate_with_tests() {
    local agent_output_dir="$1"
    local agent_id="$2"

    # Run validation tests against agent's deliverables
    echo "🧪 Running validation tests for $agent_id..." >&2

    # Tests should cover:
    # 1. Does the deliverable exist?
    # 2. Is it syntactically valid?
    # 3. Do acceptance criteria pass?
    # 4. Does it integrate with other components?

    local test_result=0
    if npm run test -- "$agent_output_dir" 2>/dev/null; then
        TEST_RESULT=0
    else
        TEST_RESULT=$?
    fi

    # Base confidence on test results (objective)
    if [[ $TEST_RESULT -eq 0 ]]; then
        CONFIDENCE=0.90  # Tests pass = high confidence
        echo "  ✅ All tests passed" >&2
    else
        CONFIDENCE=0.30  # Tests fail = low confidence
        echo "  ❌ Tests failed (exit code: $TEST_RESULT)" >&2
    fi

    # Report with test-based confidence
    report-completion.sh \
        --task-id "$TASK_ID" \
        --agent-id "$agent_id" \
        --confidence "$CONFIDENCE" \
        --result "{\"tests_passed\": $([[ $TEST_RESULT -eq 0 ]] && echo true || echo false)}" \
        --evidence "test_results.xml"

    return $TEST_RESULT
}

# In main loop
for agent in "${LOOP3_AGENTS[@]}"; do
    execute_agent_task "$agent" "$TASK_ID"
    AGENT_OUTPUT="/tmp/${TASK_ID}_${agent}_output"

    # Validate with tests (not opinions)
    validate_with_tests "$AGENT_OUTPUT" "$agent"
done
```

**How to Adopt in daa:**
```rust
// daa-orchestrator/src/validation.rs

pub struct AgentDeliverable {
    pub file_path: String,
    pub content: String,
    pub metadata: serde_json::Value,
}

pub struct TestResult {
    pub passed: usize,
    pub failed: usize,
    pub total: usize,
}

pub async fn validate_deliverable(
    deliverable: &AgentDeliverable,
) -> Result<(f64, TestResult)> {
    // Run tests against the deliverable
    let test_result = run_validation_tests(&deliverable.file_path).await?;

    // Confidence based on test results (objective)
    let confidence = match test_result {
        r if r.passed == r.total => 0.95,      // All tests pass = high confidence
        r if r.passed >= r.total / 2 => 0.60,  // 50%+ pass = medium confidence
        _ => 0.25,                              // Most fail = low confidence
    };

    Ok((confidence, test_result))
}

pub async fn execute_workflow_with_test_validation(
    workflow: &Workflow,
    orchestrator: &DaaOrchestrator,
) -> Result<WorkflowResult> {
    for step in &workflow.steps {
        // Execute agents
        let outputs = execute_agents_for_step(step).await?;

        // Validate each output with tests (not opinions)
        let mut validated_outputs = Vec::new();
        for output in outputs {
            let (confidence, test_result) =
                validate_deliverable(&output).await?;

            validated_outputs.push(ValidatedOutput {
                content: output.content,
                confidence,  // Based on tests, not agent opinion
                test_result,
                metadata: output.metadata,
            });
        }

        // Gate check using test-based confidence
        let avg_confidence = validated_outputs
            .iter()
            .map(|o| o.confidence)
            .sum::<f64>() / validated_outputs.len() as f64;

        if avg_confidence < 0.75 {
            // Tests failed → retry with different agent configuration
            return Err(anyhow::anyhow!("Tests failed (avg confidence: {})", avg_confidence));
        }
    }

    Ok(WorkflowResult::Success)
}
```

**How to Adopt in QuDAG:**
```rust
// qudag-exchange/src/task_validation.rs

pub fn evaluate_task_with_tests(
    task_id: &str,
    agent_results: Vec<AgentResult>,
) -> TaskEvaluation {
    let mut test_based_scores = Vec::new();

    for result in &agent_results {
        // Run test suite against deliverables
        let test_output = run_tests_on_deliverables(
            &result.code,
            &result.deliverables,
        );

        // Score based on tests (objective)
        let score = match test_output {
            TestOutput { passed, total } if passed == total => 0.95,
            TestOutput { passed, total } if passed > total / 2 => 0.65,
            _ => 0.25,
        };

        test_based_scores.push((result.agent_id.clone(), score));
    }

    // Gate decision based on test results
    let avg_score = test_based_scores
        .iter()
        .map(|(_, s)| s)
        .sum::<f64>() / test_based_scores.len() as f64;

    TaskEvaluation {
        task_id: task_id.to_string(),
        test_scores: test_based_scores,
        average_score: avg_score,
        passed: avg_score >= 0.75,
        evidence: "test_results.json",  // Objective evidence
    }
}

// Use test results for merge decisions
pub fn should_integrate_task(evaluation: &TaskEvaluation) -> bool {
    // No subjective opinions - only test results
    evaluation.passed && !evaluation.test_scores.is_empty()
}
```

**Test Suite Design:**
```yaml
# Example test categories for agent validation

syntax_validation:
  - File parses without errors
  - No syntax errors in code
  - Matches expected format

acceptance_criteria:
  - Feature X works as specified
  - Output matches expected schema
  - Performance within bounds

integration_tests:
  - Works with existing modules
  - No breaking changes
  - API compatibility

security_tests:
  - No unsafe operations
  - Credentials not logged
  - Input validation present

performance_tests:
  - Response time < threshold
  - Memory usage acceptable
  - No memory leaks
```

**Key Benefits:**
- ✅ Completely objective (test = proof)
- ✅ No subjective opinions in scoring
- ✅ Automatic retry for failed tests
- ✅ Clear pass/fail criteria
- ✅ Prevents "done" claims without evidence

**Anti-patterns to Avoid:**
- ❌ Only running "happy path" tests (need edge cases)
- ❌ Allowing manual test overrides (tests are final word)
- ❌ Ignoring test failures (always retry with changes)
- ❌ Using agent's own tests (need independent validation)

---

## Quick Adoption Matrix

| Pattern | Difficulty | Time to Implement | Impact | Dependencies |
|---------|-----------|------------------|---------|--------------|
| Confidence Gating | Easy | 1-2 days | High | Agents must report confidence |
| Blind Validator Review | Medium | 3-5 days | High | Need anonymization library |
| Test-Driven Convergence | Medium | 5-7 days | Very High | Need test framework setup |

---

## Implementation Order

**Recommended sequence for maximum impact:**

1. **Start with Confidence Gating** (1-2 days)
   - Easiest to implement
   - Immediate impact on pass/fail decisions
   - Foundation for other patterns

2. **Add Test-Driven Validation** (5-7 days after #1)
   - Feeds objective scores into confidence gating
   - Provides evidence for decisions
   - Increases trust in system

3. **Implement Blind Review** (3-5 days after #2)
   - Prevents bias in validation step
   - Improves consensus quality
   - Best done after tests are in place

---

## Success Metrics

**After implementing these patterns, measure:**

| Metric | Before | Target | How to Measure |
|--------|--------|--------|-----------------|
| Decision Clarity | 60% clear | 95%+ clear | Audit logs: conflicts/ambiguity |
| Iteration Count | 8-10 avg | 4-5 avg | Task metadata: iterations |
| Consensus Quality | 78% agree | 92%+ agree | Validator votes on same work |
| Bug Escape Rate | 12% | <2% | Bugs found post-delivery |
| Confidence Calibration | Uncalibrated | ±0.05 error | Actual vs reported confidence |

---

## References

**Full Documentation:**
- `/home/user/claude-flow-novice/docs/ARCHITECTURAL_COMPARISON_QUDAG_DAA.md` (sections 5-7)

**Implementation Files:**
- claude-flow-novice: `.claude/skills/cfn-loop-orchestration/orchestrate.sh` (gates)
- claude-flow-novice: `.claude/skills/cfn-loop-orchestration-v2/` (coordination)
- daa: `crates/daa-ai/src/agent.rs` (agent structure)
- daa: `daa-orchestrator/src/lib.rs` (orchestrator)
- QuDAG: `qudag-exchange/plans/swarm-orchestration.md` (TDD convergence)

**Testing:** See `.claude/skills/cfn-loop-validation/` for validation framework that can be extended with these patterns.
