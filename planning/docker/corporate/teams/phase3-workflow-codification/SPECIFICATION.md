# Phase 3: Workflow Codification System - Specification

**Version:** 3.0.0
**Status:** DRAFT
**Dependencies:** Phase 1 (Corporate Organization), Phase 2 (Playbook-Driven Architecture)
**Author:** Claude Flow Novice System Architecture Team
**Date:** 2025-11-12

---

## Executive Summary

Phase 3 introduces an **automated workflow codification system** that transforms repeated AI agent patterns into executable code, skills, and automation workflows. This system bridges the gap between knowledge persistence (ACE playbooks from Phase 2) and automated execution, reducing AI invocation costs by **60-80%** for common workflows while maintaining human oversight through expert approval gates.

### Core Value Proposition

**Problem:** AI agents repeatedly execute the same workflows (npm install → build → test, security header validation, error boundary setup), consuming tokens and time for deterministic operations that could be codified.

**Solution:** Detect workflow patterns across team executions → Generate executable skills (bash scripts, validation tools, templates) → Human expert approval → Deploy as automated workflows → Track edge cases → Iterative improvement.

**Business Impact:**
- **60-80% cost reduction** for repeated workflows (AI → script execution)
- **95% faster execution** for codified workflows (200s AI task → 10s script)
- **Expert oversight** ensures quality and domain knowledge integration
- **Continuous improvement** through edge case tracking and skill refinement

**Technical Impact:**
- Automatic skill generation from pattern detection
- Human-in-the-loop approval workflow
- Edge case tracking and test suite generation
- Version control and rollback for generated skills
- Integration with Phase 2 ACE system (lessons → code)

---

## 1. System Overview

### 1.1 Workflow Codification Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW CODIFICATION PIPELINE                      │
└─────────────────────────────────────────────────────────────────────────┘

Phase 2 (ACE)          Phase 3 (Codification)           Deployment
─────────────          ──────────────────────           ──────────

┌──────────────┐       ┌──────────────────┐           ┌──────────────┐
│   Pattern    │──────>│ Skill Generator  │──────────>│ Human Expert │
│  Detection   │       │  (AI-Powered)    │           │   Review     │
└──────────────┘       └──────────────────┘           └──────────────┘
       │                       │                              │
       │ 5+ occurrences       │ Generate:                    │ Approve/
       │ Same workflow        │ - Bash script                │ Reject/
       │                      │ - Validator                  │ Correct
       │                      │ - Tests                      │
       │                      │ - Documentation              │
       ▼                       ▼                              ▼
┌──────────────┐       ┌──────────────────┐           ┌──────────────┐
│ PostgreSQL   │       │ Staging Skills   │           │ Production   │
│ Reflections  │       │  Repository      │           │   Skills     │
└──────────────┘       └──────────────────┘           └──────────────┘
                               │                              │
                               │ Testing &                    │ Team agents
                               │ Validation                   │ invoke skills
                               ▼                              ▼
                       ┌──────────────────┐           ┌──────────────┐
                       │  Edge Case       │<──────────│   Execution  │
                       │   Tracking       │           │   Feedback   │
                       └──────────────────┘           └──────────────┘
                               │
                               │ New edge case
                               │ detected
                               ▼
                       ┌──────────────────┐
                       │ Skill Update     │────> Back to Human Expert
                       │  Proposal        │
                       └──────────────────┘
```

### 1.2 Integration with Existing Phases

**Phase 1 (Corporate Organization):**
- Team Coordinators invoke codified skills instead of spawning agents
- Skills isolated per team (frontend skills vs backend skills)
- Resource budgets track script execution vs AI invocation

**Phase 2 (Playbook-Driven Architecture):**
- Pattern detection (existing) feeds into skill generation
- ACE reflections provide source data for workflow extraction
- Ephemeral agents still handle novel/complex tasks

**Phase 3 (Workflow Codification):**
- Automated skill generation from detected patterns
- Human expert approval workflow
- Edge case tracking and iterative skill improvement
- Cost optimization through script execution

---

## 2. Functional Requirements

### FR-1: Pattern Analysis and Extraction

**Requirement:** System must analyze ACE reflections to detect repeated workflow patterns suitable for codification.

**Criteria:**
- Detect workflows with ≥5 occurrences across team executions (last 90 days)
- Minimum 85% similarity between workflow steps
- Workflows must be deterministic (same inputs → same outputs)
- Pattern confidence score ≥ 0.90

**Pattern Types:**
1. **Sequential Workflows:** npm install → build → test → deploy
2. **Validation Workflows:** Check security headers → Validate CORS → Check CSP
3. **Setup Workflows:** Create React component → Add error boundary → Add tests
4. **Transformation Workflows:** Convert API response → Validate schema → Transform to model

**Output:**
- Pattern report with workflow steps, occurrence count, teams affected
- Estimated cost savings (AI invocations vs script execution)
- Codification recommendation (high/medium/low priority)

**Database Schema:**
```sql
CREATE TABLE workflow_patterns (
    id UUID PRIMARY KEY,
    pattern_name VARCHAR(255) NOT NULL,
    workflow_steps JSONB NOT NULL,        -- Array of steps
    occurrence_count INTEGER NOT NULL,
    teams_affected TEXT[] NOT NULL,
    similarity_score DECIMAL(3,2) NOT NULL,
    deterministic BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3,2) NOT NULL,
    estimated_savings_usd DECIMAL(10,2),
    priority VARCHAR(20),                  -- high, medium, low
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'detected'  -- detected, generated, approved, deployed
);
```

---

### FR-2: Automated Skill Generation

**Requirement:** System must generate executable bash skills, validators, tests, and documentation from detected patterns.

**Skill Components:**
1. **Main Skill Script:** `.claude/skills/codified-{pattern-name}/execute.sh`
2. **Validator Script:** `.claude/skills/codified-{pattern-name}/validate.sh`
3. **Test Suite:** `.claude/skills/codified-{pattern-name}/test.sh`
4. **Documentation:** `.claude/skills/codified-{pattern-name}/SKILL.md`
5. **Edge Cases:** `.claude/skills/codified-{pattern-name}/edge-cases.json`

**Generation Process:**
1. AI agent analyzes pattern and reflections
2. Generates skill skeleton with parameter validation
3. Extracts edge cases from historical failures
4. Generates test cases (happy path + edge cases)
5. Creates documentation with usage examples
6. Outputs to staging repository

**Validation:**
- Generated script passes shellcheck (no errors)
- Test suite coverage ≥ 80% (includes edge cases)
- Documentation includes: purpose, usage, parameters, examples, edge cases
- Skill adheres to CFN skill specification

**Output:**
- Complete skill package in staging repository
- Generation report (success/failure, validation results)
- Estimated cost savings per invocation

---

### FR-3: Human Expert Approval Workflow

**Requirement:** Domain experts must review, approve, reject, or correct generated skills before production deployment.

**Approval States:**
- **PENDING_REVIEW:** Skill generated, awaiting expert review
- **APPROVED:** Expert approved, ready for deployment
- **REJECTED:** Expert rejected, skill archived with reason
- **NEEDS_CORRECTION:** Expert requested changes, awaiting correction
- **DEPLOYED:** Skill deployed to production, available to teams

**Expert Actions:**
1. **Approve:** Skill deployed to production immediately
2. **Reject:** Skill archived, pattern marked as "not suitable for codification"
3. **Request Correction:** Expert provides feedback, AI regenerates skill
4. **Edit Directly:** Expert modifies skill, approves edited version

**Approval Interface:**
```bash
# CLI command for expert review
./.claude/skills/workflow-codification/review-skill.sh \
  --skill-id "uuid" \
  --action approve|reject|correct \
  --feedback "Optional expert feedback"
```

**Notification System:**
- Email notification to team expert when skill ready for review
- Slack notification to team channel
- Dashboard shows pending reviews count

**SLA:**
- Expert review within 48 hours (high priority)
- Expert review within 7 days (medium/low priority)
- Auto-escalate to Product Owner if SLA exceeded

**Audit Trail:**
```sql
CREATE TABLE skill_approvals (
    id UUID PRIMARY KEY,
    skill_id UUID REFERENCES workflow_patterns(id),
    expert_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,          -- approve, reject, correct
    feedback TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

---

### FR-4: Edge Case Tracking and Skill Evolution

**Requirement:** System must track edge cases encountered during skill execution and propose skill updates.

**Edge Case Detection:**
1. Skill execution fails with non-zero exit code
2. Skill output doesn't match expected format
3. Skill timeout exceeded
4. Skill produces warnings (captured in logs)

**Edge Case Capture:**
```json
{
  "edge_case_id": "uuid",
  "skill_id": "uuid",
  "task_id": "uuid",
  "team_id": "frontend",
  "failure_reason": "CORS header not set for localhost",
  "input_parameters": {"domain": "localhost"},
  "expected_output": "CORS headers valid",
  "actual_output": "Error: localhost not in allowed origins",
  "timestamp": "2025-11-12T10:30:00Z",
  "severity": "medium",
  "resolved": false
}
```

**Skill Update Proposal:**
1. Edge case occurs ≥3 times for same skill
2. System generates skill update proposal (AI agent)
3. Update includes: new test case, modified logic, updated documentation
4. Expert reviews and approves update
5. Skill version incremented (semantic versioning)

**Skill Versioning:**
- `v1.0.0` → Initial deployment
- `v1.0.1` → Patch (edge case fix)
- `v1.1.0` → Minor (new parameter added)
- `v2.0.0` → Major (breaking change)

**Rollback:**
- Expert can rollback to previous version
- Teams notified of rollback
- Rollback reason logged

---

### FR-5: Cost Tracking and ROI Measurement

**Requirement:** System must track cost savings from codified workflows and provide ROI metrics.

**Metrics Tracked:**
1. **AI Invocations Avoided:** Count of times script executed instead of spawning agent
2. **Token Savings:** Estimated tokens saved per execution
3. **Time Savings:** Execution time (AI: 200s, Script: 10s)
4. **Cost Savings:** Token cost avoided (at current pricing)

**Calculation:**
```javascript
// Per-execution savings
ai_cost = (input_tokens + output_tokens) * $0.50 / 1M
script_cost = $0.001  // Negligible compute cost
savings_per_execution = ai_cost - script_cost

// Monthly ROI
executions_per_month = occurrence_count * 4  // Weekly pattern
monthly_savings = executions_per_month * savings_per_execution
annual_roi = monthly_savings * 12
```

**Dashboard Metrics:**
- Total skills deployed
- Total executions (AI vs Script)
- Total cost savings (monthly, annual)
- ROI per skill (ranked)
- Top 10 most-used skills
- Skills with highest edge case rate (improvement candidates)

**Database Schema:**
```sql
CREATE TABLE skill_executions (
    id UUID PRIMARY KEY,
    skill_id UUID REFERENCES workflow_patterns(id),
    team_id VARCHAR(50),
    task_id UUID,
    execution_time_ms INTEGER,
    exit_code INTEGER,
    cost_avoided_usd DECIMAL(10,6),
    tokens_avoided INTEGER,
    timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Non-Functional Requirements

### NFR-1: Performance

- **Skill Generation Time:** < 120 seconds (AI-powered generation)
- **Skill Execution Time:** < 30 seconds (95% of skills)
- **Pattern Detection Query:** < 5 seconds (PostgreSQL query across 90 days)
- **Edge Case Tracking Overhead:** < 100ms per execution

### NFR-2: Scalability

- **Concurrent Skill Executions:** 100+ per team coordinator
- **Skills Deployed:** Support 500+ skills across organization
- **Edge Case Storage:** 100K edge cases per year
- **Pattern Detection Dataset:** 1M+ reflections

### NFR-3: Reliability

- **Skill Execution Success Rate:** ≥ 98% (approved skills)
- **Rollback Time:** < 5 minutes (revert to previous version)
- **Edge Case Detection Accuracy:** ≥ 90%
- **Approval Workflow Uptime:** 99.9%

### NFR-4: Cost Efficiency

- **Cost Reduction Target:** 60-80% for codified workflows
- **Skill Generation Cost:** < $1 per skill (AI generation)
- **Storage Cost:** < $5/month (PostgreSQL edge cases + skills)
- **Overall Phase 3 ROI:** Break-even within 30 days

### NFR-5: Security

- **Input Validation:** All skill parameters validated (prevent injection)
- **Secrets Management:** Skills never hardcode secrets (use env vars)
- **Audit Logging:** All skill executions logged with user, team, timestamp
- **Access Control:** Only team experts can approve skills for their domain

---

## 4. System Architecture Overview

### 4.1 High-Level Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PHASE 3 ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                           PATTERN ANALYZER                               │
│  (.claude/skills/workflow-codification/analyze-patterns.sh)             │
│                                                                          │
│  - Queries PostgreSQL (Phase 2 reflections)                             │
│  - Detects repeated workflows (≥5 occurrences)                          │
│  - Calculates similarity, confidence, priority                          │
│  - Outputs pattern reports                                              │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          SKILL GENERATOR (AI)                            │
│  (Ephemeral agent: skill-generator)                                     │
│                                                                          │
│  - Reads pattern report                                                 │
│  - Generates bash skill (execute.sh)                                    │
│  - Generates validator (validate.sh)                                    │
│  - Generates tests (test.sh)                                            │
│  - Generates documentation (SKILL.md)                                   │
│  - Outputs to staging repository                                        │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       APPROVAL WORKFLOW ENGINE                           │
│  (.claude/skills/workflow-codification/approval-workflow.sh)            │
│                                                                          │
│  - Notifies team expert (email, Slack)                                  │
│  - Tracks approval state (pending, approved, rejected)                  │
│  - Handles corrections (feedback loop to generator)                     │
│  - Deploys approved skills to production                                │
│  - Logs audit trail                                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION SKILLS REPOSITORY                        │
│  (.claude/skills/codified-*/execute.sh)                                 │
│                                                                          │
│  - Version-controlled skills (git)                                      │
│  - Semantic versioning (v1.0.0)                                         │
│  - Team coordinators invoke skills                                      │
│  - Edge case tracking on failures                                       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       EDGE CASE TRACKER                                  │
│  (.claude/skills/workflow-codification/track-edge-case.sh)              │
│                                                                          │
│  - Captures skill execution failures                                    │
│  - Stores edge case details in PostgreSQL                               │
│  - Detects recurring edge cases (≥3 occurrences)                        │
│  - Proposes skill updates                                               │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          COST TRACKING ENGINE                            │
│  (.claude/skills/workflow-codification/track-cost-savings.sh)           │
│                                                                          │
│  - Logs all skill executions                                            │
│  - Calculates cost avoided per execution                                │
│  - Aggregates monthly/annual ROI                                        │
│  - Generates cost dashboard                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Flow

```
ACE Reflections (PostgreSQL)
        │
        ├─> Pattern Analyzer (Batch, Weekly)
        │         │
        │         ├─> Workflow Patterns Table
        │         │         │
        │         │         ├─> Skill Generator (AI Agent, On-Demand)
        │         │         │         │
        │         │         │         ├─> Staging Skills Repo (Git Branch)
        │         │         │         │         │
        │         │         │         │         ├─> Approval Workflow (Email/Slack)
        │         │         │         │         │         │
        │         │         │         │         │         ├─> Expert Review (Human)
        │         │         │         │         │         │         │
        │         │         │         │         │         │         ├─> [Approve]
        │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         ├─> Production Skills Repo (Git Merge)
        │         │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         │         ├─> Team Coordinator Invokes Skill
        │         │         │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         │         │         ├─> [Success]
        │         │         │         │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         │         │         │         ├─> Execution Log
        │         │         │         │         │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         │         │         │         │         └─> Cost Tracking
        │         │         │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         │         │         ├─> [Failure]
        │         │         │         │         │         │         │         │         │         │         │
        │         │         │         │         │         │         │         │         │         │         └─> Edge Case Tracker
        │         │         │         │         │         │         │         │         │         │                   │
        │         │         │         │         │         │         │         │         │         │                   ├─> Edge Cases Table
        │         │         │         │         │         │         │         │         │         │                   │
        │         │         │         │         │         │         │         │         │         │                   └─> [≥3 occurrences]
        │         │         │         │         │         │         │         │         │         │                             │
        │         │         │         │         │         │         │         │         │         │                             └─> Skill Update Proposal
        │         │         │         │         │         │         │         │         │         │                                       │
        │         │         │         │         │         │         │         │         │         │                                       └─> [Back to Expert]
```

---

## 5. Skill Generation Specification

### 5.1 Skill Package Structure

```
.claude/skills/codified-{pattern-name}/
├── execute.sh              # Main skill execution script
├── validate.sh             # Input validation and pre-checks
├── test.sh                 # Test suite (unit + integration + edge cases)
├── SKILL.md                # Documentation
├── edge-cases.json         # Known edge cases and solutions
├── metadata.json           # Skill metadata (version, author, teams)
└── rollback/               # Previous versions for rollback
    ├── v1.0.0/
    ├── v1.0.1/
    └── v1.1.0/
```

### 5.2 Execute Script Template

```bash
#!/bin/bash
# Generated by: Workflow Codification System v3.0.0
# Pattern: {pattern-name}
# Version: {version}
# Teams: {teams-affected}
# Generated: {timestamp}

set -euo pipefail

# ============================================================================
# METADATA
# ============================================================================
readonly SKILL_NAME="{pattern-name}"
readonly SKILL_VERSION="{version}"
readonly SKILL_AUTHOR="workflow-codification-system"

# ============================================================================
# PARAMETER VALIDATION
# ============================================================================
validate_input() {
  local param_name="$1"
  local param_value="$2"
  local param_type="$3"  # string, integer, boolean, path

  # Validate based on type
  case "$param_type" in
    string)
      [[ -n "$param_value" ]] || { echo "Error: $param_name cannot be empty"; return 1; }
      ;;
    integer)
      [[ "$param_value" =~ ^[0-9]+$ ]] || { echo "Error: $param_name must be integer"; return 1; }
      ;;
    boolean)
      [[ "$param_value" =~ ^(true|false)$ ]] || { echo "Error: $param_name must be boolean"; return 1; }
      ;;
    path)
      [[ -e "$param_value" ]] || { echo "Error: $param_name path does not exist"; return 1; }
      ;;
  esac
}

# ============================================================================
# MAIN WORKFLOW
# ============================================================================
main() {
  # Parse parameters
  local param1="$1"
  local param2="${2:-default}"

  # Validate inputs
  validate_input "param1" "$param1" "string"
  validate_input "param2" "$param2" "string"

  # Execute workflow steps
  echo "[${SKILL_NAME}] Starting workflow..."

  # STEP 1: {description}
  echo "[${SKILL_NAME}] Step 1: {step-description}"
  {step-1-commands}

  # STEP 2: {description}
  echo "[${SKILL_NAME}] Step 2: {step-description}"
  {step-2-commands}

  # STEP 3: {description}
  echo "[${SKILL_NAME}] Step 3: {step-description}"
  {step-3-commands}

  # Success
  echo "[${SKILL_NAME}] Workflow completed successfully"
  return 0
}

# ============================================================================
# ERROR HANDLING
# ============================================================================
trap 'echo "[${SKILL_NAME}] Error on line $LINENO"; exit 1' ERR

# ============================================================================
# EXECUTION
# ============================================================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

### 5.3 Test Suite Template

```bash
#!/bin/bash
# Test suite for: {pattern-name}
# Generated by: Workflow Codification System v3.0.0

set -euo pipefail

SKILL_PATH="$(dirname "$0")/execute.sh"
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# TEST HELPERS
# ============================================================================
assert_equals() {
  local expected="$1"
  local actual="$2"
  local test_name="$3"

  if [[ "$expected" == "$actual" ]]; then
    echo "✅ PASS: $test_name"
    ((TESTS_PASSED++))
  else
    echo "❌ FAIL: $test_name (expected: $expected, actual: $actual)"
    ((TESTS_FAILED++))
  fi
}

assert_exit_code() {
  local expected_code="$1"
  local command="$2"
  local test_name="$3"

  set +e
  eval "$command" &>/dev/null
  local actual_code=$?
  set -e

  assert_equals "$expected_code" "$actual_code" "$test_name"
}

# ============================================================================
# HAPPY PATH TESTS
# ============================================================================
test_happy_path_basic() {
  local result
  result=$("$SKILL_PATH" "valid-input" "valid-param2" 2>&1)
  assert_exit_code 0 "$SKILL_PATH valid-input valid-param2" "Happy path: basic execution"
}

# ============================================================================
# EDGE CASE TESTS
# ============================================================================
test_edge_case_empty_input() {
  assert_exit_code 1 "$SKILL_PATH '' 'valid-param2'" "Edge case: empty input"
}

test_edge_case_invalid_type() {
  assert_exit_code 1 "$SKILL_PATH 'not-a-number' 'valid-param2'" "Edge case: invalid type"
}

# ============================================================================
# RUN ALL TESTS
# ============================================================================
main() {
  echo "Running test suite for: {pattern-name}"
  echo "========================================"

  # Happy path tests
  test_happy_path_basic

  # Edge case tests
  test_edge_case_empty_input
  test_edge_case_invalid_type

  # Summary
  echo "========================================"
  echo "Tests Passed: $TESTS_PASSED"
  echo "Tests Failed: $TESTS_FAILED"

  [[ $TESTS_FAILED -eq 0 ]] && exit 0 || exit 1
}

main "$@"
```

---

## 6. Approval Workflow Specification

### 6.1 Expert Notification Template

**Email:**
```
Subject: [CFN] New Skill Ready for Review: {pattern-name}

Hi {expert-name},

A new skill has been generated and is ready for your review:

Skill Name: {pattern-name}
Team: {team-id}
Priority: {high|medium|low}
Estimated Savings: ${estimated-savings-usd}/month

Pattern Summary:
- Occurrence Count: {occurrence-count}
- Teams Affected: {teams-list}
- Confidence Score: {confidence-score}

Workflow Steps:
1. {step-1}
2. {step-2}
3. {step-3}

Review Actions:
1. Review skill code: .claude/skills/codified-{pattern-name}/
2. Run tests: .claude/skills/codified-{pattern-name}/test.sh
3. Approve/Reject/Request Correction:
   ./.claude/skills/workflow-codification/review-skill.sh \
     --skill-id "{skill-id}" \
     --action approve|reject|correct \
     --feedback "Optional feedback"

SLA: Please review within 48 hours (high priority) or 7 days (medium/low).

Thank you,
CFN Workflow Codification System
```

**Slack:**
```
🤖 New Skill Ready for Review

*Skill:* {pattern-name}
*Team:* {team-id}
*Priority:* {high|medium|low}
*Estimated Savings:* ${estimated-savings-usd}/month

*Workflow:*
{step-1} → {step-2} → {step-3}

*Actions:*
✅ Approve | ❌ Reject | 🔄 Request Correction

Review at: .claude/skills/codified-{pattern-name}/

cc: @{expert-slack-handle}
```

### 6.2 Approval State Machine

```
DETECTED (Pattern Analyzer)
    │
    ├─> GENERATING (Skill Generator invoked)
    │       │
    │       ├─> GENERATION_FAILED (Skill generator error) [Terminal State]
    │       │
    │       └─> PENDING_REVIEW (Expert notified)
    │               │
    │               ├─> APPROVED (Expert approves)
    │               │       │
    │               │       └─> DEPLOYING (Deployment in progress)
    │               │               │
    │               │               ├─> DEPLOYMENT_FAILED (Deployment error)
    │               │               │       │
    │               │               │       └─> [Back to PENDING_REVIEW]
    │               │               │
    │               │               └─> DEPLOYED (Skill live) [Terminal State]
    │               │
    │               ├─> REJECTED (Expert rejects)
    │               │       │
    │               │       └─> ARCHIVED (Pattern marked unsuitable) [Terminal State]
    │               │
    │               └─> NEEDS_CORRECTION (Expert requests changes)
    │                       │
    │                       └─> CORRECTING (AI regenerating or expert editing)
    │                               │
    │                               └─> [Back to PENDING_REVIEW]
```

---

## 7. Edge Case Management Specification

### 7.1 Edge Case Schema

```sql
CREATE TABLE edge_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES workflow_patterns(id),
    task_id UUID,
    team_id VARCHAR(50) NOT NULL,
    failure_reason TEXT NOT NULL,
    input_parameters JSONB NOT NULL,
    expected_output TEXT,
    actual_output TEXT,
    stack_trace TEXT,
    severity VARCHAR(20) NOT NULL,         -- critical, high, medium, low
    occurrence_count INTEGER DEFAULT 1,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    UNIQUE (skill_id, failure_reason, input_parameters)
);

CREATE INDEX idx_edge_cases_skill ON edge_cases(skill_id);
CREATE INDEX idx_edge_cases_unresolved ON edge_cases(skill_id, resolved) WHERE resolved = FALSE;
CREATE INDEX idx_edge_cases_severity ON edge_cases(severity);
```

### 7.2 Edge Case Detection

**Trigger Conditions:**
1. Skill execution returns non-zero exit code
2. Skill output doesn't match expected format (validation fails)
3. Skill timeout exceeded (default: 30s)
4. Skill produces warnings in stderr

**Capture Mechanism:**
```bash
# Executed by Team Coordinator after skill execution
./.claude/skills/workflow-codification/track-edge-case.sh \
  --skill-id "$SKILL_ID" \
  --task-id "$TASK_ID" \
  --team-id "$TEAM_ID" \
  --exit-code "$EXIT_CODE" \
  --input-params "$INPUT_PARAMS_JSON" \
  --expected-output "$EXPECTED" \
  --actual-output "$ACTUAL" \
  --stack-trace "$STDERR"
```

### 7.3 Skill Update Proposal

**Trigger:** Edge case occurrence count ≥ 3 (same failure reason)

**Update Proposal Contents:**
1. **New Test Case:** Test for edge case
2. **Modified Logic:** Handle edge case in execute.sh
3. **Updated Documentation:** Document edge case and solution
4. **Version Increment:** Patch version (v1.0.0 → v1.0.1)

**Expert Review:**
- Expert reviews proposed changes
- Expert can edit, approve, or reject
- Approved updates deployed immediately
- Rejected updates archived with reason

---

## 8. Cost Tracking Specification

### 8.1 Cost Calculation

**Per-Execution Cost Avoided:**
```javascript
// AI Agent Execution (Baseline)
ai_input_tokens = 5000      // Average for workflow task
ai_output_tokens = 2000     // Average for workflow completion
ai_cost = ((ai_input_tokens + ai_output_tokens) * $0.50) / 1_000_000
ai_cost = $0.0035 per execution

// Script Execution (Codified)
script_cost = $0.0001       // Negligible compute cost

// Savings
savings_per_execution = ai_cost - script_cost
savings_per_execution = $0.0034 per execution

// Monthly Savings (5 executions/week)
executions_per_month = 5 * 4 = 20
monthly_savings = 20 * $0.0034 = $0.068 per month

// ROI at Scale (50 skills, 20 executions each)
total_monthly_savings = 50 * $0.068 = $3.40 per month
annual_roi = $3.40 * 12 = $40.80 per year

// More realistic (20+ executions/day for common workflows)
high_frequency_executions = 20 * 30 = 600/month
high_frequency_savings = 600 * $0.0034 = $2.04 per skill per month
with_50_skills = 50 * $2.04 = $102 per month = $1,224 per year
```

**Actual Phase 3 ROI (Conservative):**
- 50 skills deployed
- Average 10 executions/day per skill
- Monthly savings: $51/month
- Annual ROI: $612/year
- Break-even: 1 month (skill generation costs ~$50)

### 8.2 Cost Dashboard Metrics

```sql
-- Total executions (AI vs Script)
SELECT
  COUNT(*) FILTER (WHERE execution_method = 'script') as script_executions,
  COUNT(*) FILTER (WHERE execution_method = 'ai') as ai_executions,
  SUM(cost_avoided_usd) as total_savings
FROM skill_executions
WHERE timestamp > NOW() - INTERVAL '30 days';

-- ROI per skill (ranked)
SELECT
  s.pattern_name,
  COUNT(e.id) as executions,
  SUM(e.cost_avoided_usd) as total_savings,
  AVG(e.execution_time_ms) as avg_time_ms
FROM skill_executions e
JOIN workflow_patterns s ON e.skill_id = s.id
WHERE e.timestamp > NOW() - INTERVAL '30 days'
GROUP BY s.pattern_name
ORDER BY total_savings DESC
LIMIT 10;

-- Skills with highest edge case rate
SELECT
  s.pattern_name,
  COUNT(ec.id) as edge_case_count,
  COUNT(ec.id) FILTER (WHERE ec.resolved = FALSE) as unresolved_count
FROM edge_cases ec
JOIN workflow_patterns s ON ec.skill_id = s.id
GROUP BY s.pattern_name
ORDER BY unresolved_count DESC
LIMIT 10;
```

---

## 9. Acceptance Criteria

### 9.1 Pattern Detection

- [ ] Pattern analyzer detects ≥5 candidate workflows within first month
- [ ] Similarity detection accuracy ≥ 90% (manual review)
- [ ] Deterministic workflow classification ≥ 95% accurate
- [ ] Pattern report includes cost savings estimate

### 9.2 Skill Generation

- [ ] Skill generator produces valid bash scripts (shellcheck passes)
- [ ] Generated tests achieve ≥ 80% coverage
- [ ] Documentation includes usage examples and edge cases
- [ ] Generation time < 120 seconds per skill

### 9.3 Approval Workflow

- [ ] Expert notified within 5 minutes of skill generation
- [ ] Approval state transitions tracked in audit log
- [ ] SLA adherence ≥ 90% (reviews completed on time)
- [ ] Rejected skills archived with reason

### 9.4 Edge Case Tracking

- [ ] Edge cases captured on skill execution failure
- [ ] Recurring edge cases (≥3) trigger skill update proposal
- [ ] Edge case resolution rate ≥ 80% within 30 days
- [ ] Unresolved edge cases flagged on dashboard

### 9.5 Cost Tracking

- [ ] All skill executions logged with cost avoided
- [ ] Monthly savings report accurate within 5%
- [ ] ROI dashboard shows per-skill and aggregate metrics
- [ ] Break-even achieved within 30 days

### 9.6 Integration Testing

- [ ] End-to-end test: Pattern detection → Skill generation → Approval → Deployment → Execution → Edge case tracking
- [ ] Team coordinator successfully invokes codified skill instead of spawning agent
- [ ] Cost tracking records execution and calculates savings
- [ ] Edge case triggers skill update proposal

---

## 10. Open Questions

### Q1: Skill Namespace Management
**Question:** How do we prevent skill name collisions across teams?

**Options:**
1. Team-prefixed names: `frontend-security-headers`, `backend-security-headers`
2. Centralized skill registry with uniqueness validation
3. Team-isolated skill directories: `.claude/skills/frontend/codified-*/`

**Recommendation:** Option 3 (team-isolated directories) for consistency with Phase 1 isolation model.

---

### Q2: Skill Deprecation Policy
**Question:** When should a skill be deprecated and removed?

**Options:**
1. Zero executions for 90 days
2. Edge case rate > 50% (skill unreliable)
3. Expert manually deprecates skill

**Recommendation:** Combination: Auto-deprecate if (zero executions for 90 days) OR (edge case rate > 50% for 30 days), with expert override.

---

### Q3: Cross-Team Skill Sharing
**Question:** Should skills be shareable across teams (e.g., backend skill used by frontend)?

**Options:**
1. Team-isolated only (no sharing)
2. Opt-in sharing (expert marks skill as "shared")
3. Automatic sharing for generic skills (e.g., `lint-check`)

**Recommendation:** Option 2 (opt-in sharing) with version pinning to prevent breaking changes.

---

### Q4: Skill Performance Monitoring
**Question:** What happens when a skill's execution time degrades?

**Options:**
1. Alert expert if execution time > 2x baseline
2. Auto-rollback to previous version
3. Track performance metrics but no automatic action

**Recommendation:** Option 1 (alert expert) with dashboard showing performance trends.

---

### Q5: Multi-Step Workflow Codification
**Question:** Can we codify workflows that require agent handoff (e.g., Loop 3 → Loop 2)?

**Options:**
1. Phase 3 only supports single-step workflows (no agent handoff)
2. Support multi-step with agent invocation (partial codification)
3. Support full orchestration (bash script calls multiple skills/agents)

**Recommendation:** Option 1 for Phase 3 (single-step only). Option 3 for Phase 4 enhancement.

---

## 11. Success Metrics

### 11.1 Deployment Metrics (30 Days)

- **Skills Deployed:** ≥ 20 skills
- **Teams Using Codified Skills:** ≥ 3 teams
- **Total Executions:** ≥ 500 skill executions
- **Skill Success Rate:** ≥ 95%

### 11.2 Cost Metrics (30 Days)

- **Cost Savings:** ≥ $100/month
- **AI Invocations Avoided:** ≥ 300 agent spawns
- **ROI:** Break-even within 30 days
- **Cost per Skill Generation:** < $1

### 11.3 Quality Metrics (30 Days)

- **Edge Case Resolution Rate:** ≥ 80%
- **Skill Update Rate:** ≥ 5 skills updated
- **Expert Approval Rate:** ≥ 70% (approved vs rejected)
- **Skill Rollback Rate:** < 5%

### 11.4 Efficiency Metrics (30 Days)

- **Average Execution Time (Script):** < 30 seconds
- **Average Execution Time (AI):** ~200 seconds
- **Time Savings:** 85% reduction per execution
- **Pattern Detection Accuracy:** ≥ 90%

---

## 12. Roadmap and Future Enhancements

### Phase 3.1: Core Implementation (Weeks 1-4)
- Pattern analyzer
- Skill generator (AI agent)
- Approval workflow
- Edge case tracking
- Cost tracking

### Phase 3.2: Advanced Features (Weeks 5-8)
- Multi-step workflow codification
- Cross-team skill sharing
- Skill marketplace (discover/rate skills)
- Performance monitoring and auto-rollback

### Phase 3.3: Enterprise Features (Weeks 9-12)
- Skill dependency management
- A/B testing for skill variants
- ML-based pattern detection (replace rule-based)
- Real-time skill optimization

### Phase 4: Autonomous Skill Evolution (Future)
- AI-powered skill refactoring
- Automatic edge case resolution (no human approval)
- Predictive skill generation (before pattern threshold)
- Cross-organization skill marketplace

---

## 13. Appendices

### Appendix A: Skill Generation Prompt Template

```markdown
# Skill Generation Prompt

You are an expert bash script developer tasked with generating a CFN skill from a detected workflow pattern.

## Pattern Details
- **Pattern Name:** {pattern-name}
- **Occurrence Count:** {occurrence-count}
- **Teams Affected:** {teams-list}
- **Workflow Steps:** {step-list}

## Requirements
1. Generate a bash script (execute.sh) that implements the workflow steps
2. Include parameter validation for all inputs
3. Use `set -euo pipefail` for error handling
4. Include descriptive echo statements for progress tracking
5. Generate a test suite (test.sh) with ≥80% coverage
6. Include edge cases from historical failures
7. Generate documentation (SKILL.md) with usage examples
8. Follow CFN skill specification

## Historical Context
{ace-reflections-related-to-pattern}

## Edge Cases (from ACE system)
{edge-cases-list}

## Output Format
Provide the following files:
1. execute.sh
2. validate.sh
3. test.sh
4. SKILL.md
5. edge-cases.json
6. metadata.json

Ensure all scripts pass shellcheck validation.
```

### Appendix B: Example Pattern Report

```json
{
  "pattern_id": "uuid-123",
  "pattern_name": "security-headers-validation",
  "workflow_steps": [
    "Check Content-Security-Policy header",
    "Check X-Frame-Options header",
    "Check X-Content-Type-Options header",
    "Check Strict-Transport-Security header",
    "Validate CORS configuration"
  ],
  "occurrence_count": 12,
  "teams_affected": ["frontend", "backend"],
  "similarity_score": 0.93,
  "deterministic": true,
  "confidence_score": 0.95,
  "estimated_savings_usd": 42.84,
  "priority": "high",
  "created_at": "2025-11-12T10:00:00Z",
  "status": "detected"
}
```

### Appendix C: Example Skill Metadata

```json
{
  "skill_id": "uuid-456",
  "skill_name": "security-headers-validation",
  "version": "1.0.0",
  "author": "workflow-codification-system",
  "teams": ["frontend", "backend"],
  "parameters": [
    {
      "name": "domain",
      "type": "string",
      "required": true,
      "description": "Domain to validate headers for"
    },
    {
      "name": "strict_mode",
      "type": "boolean",
      "required": false,
      "default": false,
      "description": "Enable strict validation (fails on warnings)"
    }
  ],
  "edge_cases_count": 3,
  "test_coverage": 0.87,
  "generated_at": "2025-11-12T11:00:00Z",
  "approved_at": "2025-11-12T12:00:00Z",
  "deployed_at": "2025-11-12T12:05:00Z"
}
```

---

**End of Specification Document**

**Version:** 3.0.0
**Status:** DRAFT
**Next Steps:** Create PSEUDOCODE.md and ARCHITECTURE.md documents
