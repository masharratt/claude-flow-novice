# Phase 4: Workflow Codification System - Architecture Design

**Version:** 1.0.0
**Status:** DRAFT
**Created:** 2025-11-15
**Based on:** Phase 3 Workflow Codification Specification v3.0.0
**Integration Level:** Phase 1 (Corporate Organization) + Phase 2 (Playbook-Driven Architecture)

---

## Executive Summary

The Workflow Codification System bridges the gap between knowledge persistence (ACE playbooks) and automated execution. This architecture introduces a four-tier component system that transforms repeated AI agent workflows into executable skills while maintaining human oversight through expert approval gates.

**Key Design Principles:**
- **Zero-trust for automation:** All codified skills require expert review before deployment
- **Progressive disclosure:** Start with single-step workflows, evolve to multi-step orchestration
- **Team isolation:** Skills isolated per team with opt-in cross-team sharing
- **Cost transparency:** Track every execution, edge case, and savings calculation
- **Continuous improvement:** Edge cases drive automatic skill update proposals

---

## 1. System Architecture Overview

### 1.1 Component Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW CODIFICATION SYSTEM                          │
│                                                                          │
│  PHASE 2 INPUT              CODIFICATION PIPELINE        OUTPUT          │
│  ─────────────              ──────────────────           ──────          │
│                                                                          │
│  ┌──────────┐   ┌───────────────────┐   ┌──────────┐   ┌────────────┐  │
│  │  ACE     │──>│ Pattern Analyzer  │──>│  Skill   │──>│   Expert   │  │
│  │ Playbook │   │  (PostgreSQL)     │   │Generator │   │  Review    │  │
│  │Reference │   │                   │   │  (AI)    │   │  Approval  │  │
│  └──────────┘   │ - 5+ occurrences  │   │          │   │  Workflow  │  │
│                 │ - 85%+ similarity  │   │ - Bash   │   │            │  │
│                 │ - Deterministic   │   │ - Tests  │   │ PENDING →  │  │
│                 │ - Confidence 0.90  │   │ - Docs   │   │ APPROVED   │  │
│                 └───────────────────┘   └──────────┘   └────────────┘  │
│                         │                      │              │         │
│                         ▼                      ▼              ▼         │
│                 ┌──────────────────┐  ┌──────────────┐  ┌───────────┐  │
│                 │ workflow_patterns │  │ Staging      │  │ skill_    │  │
│                 │ (PostgreSQL)      │  │ Repository   │  │ approvals │  │
│                 │                   │  │ (.claude/../ │  │ (Postgres)│  │
│                 │ ┌────────────┐    │  │ codified-*)  │  │           │  │
│                 │ │pattern_name│    │  │              │  │ APPROVED: │  │
│                 │ │occurrence_ │    │  │ - execute.sh │  │ Deploy to │  │
│                 │ │ count      │    │  │ - validate.sh│  │ Production│  │
│                 │ │teams_      │    │  │ - test.sh    │  │ Skills    │  │
│                 │ │affected    │    │  │ - SKILL.md   │  └───────────┘  │
│                 │ │confidence_ │    │  │ - edge-cases │                 │
│                 │ │ score      │    │  │ - metadata   │                 │
│                 │ │status      │    │  └──────────────┘                 │
│                 │ └────────────┘    │                                    │
│                 └──────────────────┘                                    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        PRODUCTION SKILLS                         │  │
│  │                                                                  │  │
│  │  Team A Skills        Team B Skills        Shared Skills        │  │
│  │  ────────────         ────────────         ──────────           │  │
│  │  frontend-lint        backend-lint         common-security-     │  │
│  │  frontend-test        backend-test         headers-check        │  │
│  │  component-gen        api-validation       common-error-        │  │
│  │                       db-migrate           boundary-gen         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│         ▲                     ▲                     ▲                    │
│         │                     │                     │                    │
│         │         ┌───────────┴───────────┐         │                    │
│         │         │                       │         │                    │
│         └─────────┤  Execution & Feedback ├─────────┘                    │
│                   │  Component             │                            │
│                   │  ─────────────────     │                            │
│                   │  - skill_executions    │                            │
│                   │  - edge_cases (capture)│                            │
│                   │  - cost_tracking       │                            │
│                   │  - performance_metrics │                            │
│                   │  - skill_updates (      │                            │
│                   │    proposal generation) │                            │
│                   └───────────────────────┘                            │
│                                                                          │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Roles

| Component | Responsibility | Key Artifact | Cycle Time |
|-----------|-----------------|--------------|------------|
| **Pattern Analyzer** | Detect ≥5 occurrence workflows | workflow_patterns table | Real-time (triggers on ACE completion) |
| **Skill Generator** | Create executable bash skills | `.claude/skills/codified-*/` | 60-120s per skill |
| **Approval Workflow** | Human expert review gate | skill_approvals table | Expert SLA (5 min target) |
| **Edge Case Tracker** | Capture execution failures | edge_cases table | Real-time (on skill failure) |
| **Cost Tracker** | Track ROI and savings | skill_executions table | Real-time (on execution) |

---

## 2. Database Schema Design

### 2.1 PostgreSQL Schema Overview

```sql
-- Core workflow pattern detection
CREATE TABLE workflow_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name VARCHAR(255) NOT NULL UNIQUE,
    pattern_category VARCHAR(50) NOT NULL,

    -- Pattern characteristics
    workflow_steps JSONB NOT NULL,           -- Array of sequential steps
    occurrence_count INTEGER NOT NULL,       -- ≥5 for candidacy
    last_occurrence_at TIMESTAMP,
    teams_affected TEXT[] NOT NULL,

    -- Quality metrics
    similarity_score DECIMAL(3,2) NOT NULL,  -- ≥0.85 threshold
    deterministic BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(3,2) NOT NULL,  -- ≥0.90 threshold

    -- Business metrics
    estimated_savings_usd DECIMAL(10,2),
    avg_execution_time_seconds DECIMAL(8,2),
    priority VARCHAR(20),                     -- high, medium, low

    -- Lifecycle
    status VARCHAR(50) DEFAULT 'detected',   -- detected, generated, approved, deployed, deprecated
    detected_at TIMESTAMP DEFAULT NOW(),
    marked_for_codification_at TIMESTAMP,
    deprecation_reason VARCHAR(255),
    deprecated_at TIMESTAMP,

    -- Metadata
    source_ace_reflections JSONB,            -- Links to source ACE data
    notes TEXT
);

-- Skill generation tracking
CREATE TABLE skill_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_id UUID NOT NULL REFERENCES workflow_patterns(id),
    skill_name VARCHAR(255) NOT NULL,
    skill_version VARCHAR(50) DEFAULT '1.0.0',

    -- Generation process
    generator_agent_id VARCHAR(255),         -- Agent that generated skill
    generation_started_at TIMESTAMP,
    generation_completed_at TIMESTAMP,
    generation_duration_seconds DECIMAL(8,2),

    -- Quality metrics
    shellcheck_passed BOOLEAN,                -- validate execute.sh
    test_coverage_percentage DECIMAL(5,2),  -- test.sh coverage
    documentation_complete BOOLEAN,          -- SKILL.md exists

    -- Generated artifacts
    execute_script_path VARCHAR(500),
    validate_script_path VARCHAR(500),
    test_script_path VARCHAR(500),
    skill_md_path VARCHAR(500),
    edge_cases_json_path VARCHAR(500),
    metadata_json_path VARCHAR(500),

    -- Status
    status VARCHAR(50) DEFAULT 'generated',  -- generated, awaiting-review, approved, rejected, active, archived

    -- Error tracking
    generation_errors TEXT[],
    validation_errors TEXT[],

    UNIQUE(pattern_id, skill_version)
);

-- Expert approval workflow
CREATE TABLE skill_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_generation_id UUID NOT NULL REFERENCES skill_generations(id),

    -- Approval metadata
    expert_id VARCHAR(255),
    expert_email VARCHAR(255),
    expert_team VARCHAR(100),

    -- Approval timeline
    submitted_for_review_at TIMESTAMP DEFAULT NOW(),
    review_started_at TIMESTAMP,
    review_completed_at TIMESTAMP,
    review_duration_minutes DECIMAL(10,2),

    -- Expert decision
    decision VARCHAR(50),                    -- APPROVED, REJECTED, NEEDS_CORRECTION, APPROVED_WITH_EDITS
    decision_rationale TEXT,
    expert_feedback TEXT,

    -- Corrections requested
    correction_required BOOLEAN DEFAULT FALSE,
    correction_type VARCHAR(100),            -- script-logic, test-coverage, edge-case, documentation
    correction_details JSONB,

    -- Direct edits by expert
    expert_edited BOOLEAN DEFAULT FALSE,
    edited_files JSONB,                      -- Which files were edited

    -- SLA tracking
    sla_met BOOLEAN,                         -- <5 minutes per SLA
    sla_minutes DECIMAL(10,2),

    -- Audit trail
    approved_at TIMESTAMP,
    deployed_at TIMESTAMP
);

-- Edge case tracking
CREATE TABLE edge_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL,                  -- References skill (could be multiple versions)

    -- Edge case details
    error_message TEXT NOT NULL,
    error_context JSONB,                     -- Full error details, stack trace
    occurred_at TIMESTAMP DEFAULT NOW(),

    -- Execution context
    execution_id UUID,                       -- References skill_executions entry
    team_affected VARCHAR(100),
    input_parameters JSONB,

    -- Classification
    edge_case_type VARCHAR(100),             -- timeout, permission, format, logic, environment
    severity VARCHAR(50),                     -- critical, high, medium, low
    frequency_count INTEGER DEFAULT 1,

    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolution_type VARCHAR(100),            -- skill-update, documentation, user-action, deprecated
    resolution_notes TEXT,

    -- Tracking for proposals
    triggers_skill_update BOOLEAN DEFAULT FALSE,
    update_proposal_created_at TIMESTAMP,

    UNIQUE(skill_id, error_message, DATE(occurred_at))
);

-- Skill execution tracking
CREATE TABLE skill_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id VARCHAR(255) NOT NULL,          -- Fully-qualified skill name
    skill_version VARCHAR(50),

    -- Execution context
    team_invoked_by VARCHAR(100),
    agent_invoker_id VARCHAR(255),
    execution_started_at TIMESTAMP DEFAULT NOW(),
    execution_completed_at TIMESTAMP,
    execution_duration_seconds DECIMAL(8,2),

    -- Execution results
    status VARCHAR(50),                      -- success, partial-success, failed
    return_code INTEGER,
    stdout TEXT,
    stderr TEXT,

    -- Cost tracking
    cost_avoided_usd DECIMAL(8,2),           -- AI invocation that was avoided
    execution_cost_usd DECIMAL(8,2),         -- Cost to run script
    net_savings_usd DECIMAL(8,2),            -- cost_avoided - execution_cost

    -- Edge case capture
    edge_case_detected BOOLEAN DEFAULT FALSE,
    edge_case_id UUID REFERENCES edge_cases(id),

    -- Input/Output for analysis
    input_parameters JSONB,
    output_artifacts JSONB,                  -- Files modified, etc.

    -- Performance metrics
    memory_used_mb DECIMAL(10,2),
    cpu_percent DECIMAL(5,2)
);

-- Skill metadata and versioning
CREATE TABLE skill_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name VARCHAR(255) NOT NULL,
    skill_version VARCHAR(50) NOT NULL,

    -- Authors and lifecycle
    generated_by_agent VARCHAR(255),
    approved_by_expert VARCHAR(255),

    -- Skill configuration
    teams_authorized TEXT[],                 -- Teams that can invoke
    shared_across_teams BOOLEAN DEFAULT FALSE,
    version_pinned BOOLEAN DEFAULT FALSE,    -- Prevent auto-upgrade

    -- Dependency tracking
    dependencies JSONB,                      -- External scripts, tools required
    parameter_schema JSONB,                  -- JSON schema for parameters

    -- Lifecycle
    published_at TIMESTAMP,
    deprecated_at TIMESTAMP,
    deprecation_reason TEXT,

    -- Performance baselines
    baseline_execution_time_seconds DECIMAL(8,2),
    baseline_memory_mb DECIMAL(10,2),

    -- Thresholds
    performance_alert_threshold_seconds DECIMAL(8,2),
    edge_case_alert_threshold_count INTEGER,

    UNIQUE(skill_name, skill_version)
);

-- Skill update proposals (from edge cases)
CREATE TABLE skill_update_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id VARCHAR(255) NOT NULL,
    current_version VARCHAR(50),

    -- Proposal trigger
    triggered_by_edge_case_count INTEGER,
    edge_cases_json JSONB,                   -- Aggregated edge cases
    triggered_at TIMESTAMP DEFAULT NOW(),

    -- Proposal details
    proposed_changes TEXT,
    proposed_change_type VARCHAR(100),      -- bug-fix, edge-case-handling, performance, docs

    -- Review status
    status VARCHAR(50) DEFAULT 'pending',   -- pending, expert-review, approved, implemented, rejected
    expert_reviewer_id VARCHAR(255),
    expert_decision_at TIMESTAMP,
    expert_decision TEXT,

    -- Implementation
    implementation_started_at TIMESTAMP,
    implemented_at TIMESTAMP,
    new_version VARCHAR(50),                -- After implementation

    UNIQUE(skill_id, triggered_at)
);

-- Cost tracking summary (denormalized for quick reporting)
CREATE TABLE cost_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,

    -- Aggregates
    total_skills_deployed INTEGER,
    total_executions INTEGER,
    total_cost_avoided_usd DECIMAL(12,2),
    total_execution_cost_usd DECIMAL(12,2),
    total_net_savings_usd DECIMAL(12,2),

    -- Per-team breakdown
    team_breakdown JSONB,                    -- {team: {executions, savings}}

    -- By pattern
    pattern_breakdown JSONB,                 -- {pattern_name: {executions, savings}}

    -- Performance
    avg_execution_time_seconds DECIMAL(8,2),
    edge_case_rate_percent DECIMAL(5,2),
    success_rate_percent DECIMAL(5,2),

    -- Quality
    skills_needing_updates INTEGER,
    deprecation_candidates INTEGER,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_workflow_patterns_status ON workflow_patterns(status);
CREATE INDEX idx_workflow_patterns_confidence ON workflow_patterns(confidence_score) WHERE status = 'detected';
CREATE INDEX idx_workflow_patterns_teams ON workflow_patterns USING GIN(teams_affected);
CREATE INDEX idx_skill_executions_skill_date ON skill_executions(skill_id, DATE(execution_started_at));
CREATE INDEX idx_skill_executions_team_date ON skill_executions(team_invoked_by, DATE(execution_started_at));
CREATE INDEX idx_edge_cases_skill_unresolved ON edge_cases(skill_id) WHERE resolved = FALSE;
CREATE INDEX idx_edge_cases_triggers_update ON edge_cases(skill_id) WHERE triggers_skill_update = TRUE;
CREATE INDEX idx_skill_approvals_expert ON skill_approvals(expert_id);
CREATE INDEX idx_skill_approvals_sla ON skill_approvals WHERE sla_met = FALSE;
```

### 2.2 Database Schema Design Rationale

**Pattern Detection Table (`workflow_patterns`):**
- Stores all detected workflow patterns with similarity metrics
- Status field tracks codification progression
- Confidence score gates when pattern is eligible for generation
- Teams affected enables cross-team analysis and skill sharing decisions

**Skill Generations Table (`skill_generations`):**
- Audit trail of every AI-generated skill
- Tracks quality metrics (shellcheck, test coverage)
- Links to artifact paths for version control
- Enables skill version history and rollback capability

**Approval Workflow Table (`skill_approvals`):**
- Expert review state machine (submitted → reviewed → approved/rejected)
- SLA tracking for expert response time
- Support for multiple correction cycles (NEEDS_CORRECTION → regenerated → resubmitted)
- Audit trail for compliance

**Edge Cases Table (`edge_cases`):**
- Real-time capture of skill failures in production
- Automatic triggering of skill update proposals when threshold reached
- Context preservation for debugging and skill improvement
- Severity and type classification for prioritization

**Execution Tracking Table (`skill_executions`):**
- ROI calculation (cost_avoided vs execution_cost)
- Performance baseline tracking for alerting
- Outcome capture for analytics
- Cost data for executive reporting

**Cost Summary Table:**
- Denormalized aggregates for fast reporting
- Period-based rollups for monthly/quarterly reports
- Team and pattern breakdowns for steering decisions

---

## 3. Component Architecture Details

### 3.1 Pattern Analyzer Component

**Responsibility:** Detect repeated workflow patterns from ACE reflections

**Input Sources:**
- ACE reflections table (Phase 2 output)
- Agent execution logs
- Team coordinator completion reports

**Processing Pipeline:**

```
ACE Reflection Stream
        │
        ▼
┌──────────────────────────────┐
│ 1. Aggregate Workflows       │ - Group by pattern signature
│    (Last 90 days)            │ - Extract workflow steps
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 2. Calculate Metrics         │ - Occurrence count
│                              │ - Team distribution
│                              │ - Workflow similarity (Jaccard)
│                              │ - Determinism check
│                              │ - Confidence scoring
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 3. Filter Candidates         │ - occurrence_count ≥ 5
│                              │ - similarity_score ≥ 0.85
│                              │ - deterministic = TRUE
│                              │ - confidence_score ≥ 0.90
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 4. Store in PostgreSQL       │ - INSERT workflow_patterns
│                              │ - status = 'detected'
│                              │ - Set priority (high/med/low)
└──────────────────────────────┘
        │
        ▼
Workflow Pattern Detected
(Ready for Skill Generation)
```

**Key Algorithms:**

**Similarity Detection (Jaccard Index):**
```
similarity = |workflow_A ∩ workflow_B| / |workflow_A ∪ workflow_B|

Example:
Workflow A: [npm install, npm run build, npm test, npm run deploy]
Workflow B: [npm install, npm run build, npm test]
Intersection: 3 steps
Union: 4 steps
Similarity: 3/4 = 0.75 (below 0.85 threshold)
```

**Confidence Scoring:**
```
confidence =
  (occurrence_count / 5) * 0.30 +        -- 30% weight: frequency
  similarity_score * 0.40 +               -- 40% weight: consistency
  (deterministic ? 1.0 : 0.5) * 0.30     -- 30% weight: determinism

Min threshold: 0.90
```

**Implementation:** PostgreSQL stored procedures or Python daemon monitoring ACE table

### 3.2 Skill Generator Component

**Responsibility:** Generate executable bash skills from detected patterns

**Input:** workflow_patterns row with status='detected'

**Processing Pipeline:**

```
Detected Pattern
        │
        ▼
┌──────────────────────────────┐
│ 1. Retrieve Pattern Data     │ - Load workflow_patterns row
│                              │ - Load linked ACE reflections
│                              │ - Extract historical failures
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 2. Generate Skill via AI     │ - Invoke Claude Code agent
│    (Skill Generation Prompt) │ - Generate execute.sh
│                              │ - Generate validate.sh
│                              │ - Generate test.sh
│                              │ - Generate SKILL.md
│                              │ - Extract edge-cases.json
│                              │ - Generate metadata.json
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 3. Validate Generated Skill  │ - Run shellcheck on execute.sh
│                              │ - Verify test.sh coverage ≥80%
│                              │ - Check SKILL.md completeness
│                              │ - Validate JSON schemas
└──────────────────────────────┘
        │
        ├─ Validation FAILS
        │   │
        │   └──> Log errors, notify via Alert
        │
        └─ Validation PASSES
            │
            ▼
┌──────────────────────────────┐
│ 4. Stage Skill Artifacts     │ - Create .claude/skills/codified-{name}/
│                              │ - Write all 6 files
│                              │ - Commit to git (draft)
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 5. Record in Database        │ - INSERT skill_generations
│                              │ - UPDATE workflow_patterns
│                              │ - SET status = 'generated'
│                              │ - INSERT skill_approvals
│                              │ - SET approval status = 'pending'
└──────────────────────────────┘
        │
        ▼
Skill Ready for Expert Review
```

**Skill Generation Prompt Template:**

```markdown
# Skill Generation Prompt

You are a senior DevOps engineer tasked with codifying a workflow pattern into an
executable bash skill for the Claude Flow Novice system.

## Pattern Information
- **Pattern Name:** {pattern_name}
- **Category:** {pattern_category}
- **Occurrence Count:** {occurrence_count}
- **Teams Affected:** {teams_list}
- **Confidence Score:** {confidence_score}

## Workflow Steps to Codify
{formatted_workflow_steps}

## Historical Context (ACE Reflections)
{ace_reflection_summaries}

## Known Edge Cases (From Failures)
{historical_edge_cases}

## Requirements

1. **execute.sh** - Main skill script
   - Parameters: documented with --help
   - Error handling: set -euo pipefail
   - Logging: echo progress statements
   - Return codes: 0 for success, non-zero for failure
   - Should be idempotent where possible

2. **validate.sh** - Input validation script
   - Verify all required parameters
   - Check preconditions (files exist, permissions, etc.)
   - Return codes: 0 if valid, 1 if invalid

3. **test.sh** - Comprehensive test suite
   - Happy path tests
   - Edge case tests from known failures
   - Target ≥80% code coverage
   - Use standard test framework (bats or similar)

4. **SKILL.md** - Complete documentation
   - Description of what skill does
   - Usage examples
   - Parameter documentation
   - Known edge cases and workarounds
   - Dependencies
   - Version information
   - Links to pattern

5. **edge-cases.json** - Known limitations
   - List of known edge cases
   - Workarounds if available
   - Severity levels

6. **metadata.json** - Skill metadata
   - Version: "1.0.0"
   - Author: "workflow-codification-system"
   - Pattern ID: {pattern_id}
   - Teams: {teams_list}
   - Parameters schema

## Standards
- Follow CFN skill specification
- Use shellcheck-compliant bash
- Include comprehensive error messages
- Design for logging and monitoring
- Handle failures gracefully

## Output Format
Provide all six files as separate code blocks with filenames.
```

### 3.3 Approval Workflow Component

**Responsibility:** Expert review and approval gate for skills before production deployment

**Workflow State Machine:**

```
PENDING_REVIEW
    │
    ├──(Expert Reviews & Approves)──> APPROVED
    │                                    │
    │                                    ▼
    │                               Deploy to Production
    │
    ├──(Expert Requests Changes)──> NEEDS_CORRECTION
    │                                    │
    │                                    ▼
    │                              Regenerate Skill
    │                                    │
    │                                    └──> PENDING_REVIEW (cycle)
    │
    └──(Expert Rejects)──> REJECTED
                               │
                               ▼
                          Archive Skill
                          (Mark pattern as unsuitable)
```

**Expert Interface:**

```bash
# CLI command for expert review
./.claude/skills/workflow-codification/review-skill.sh \
  --skill-generation-id "uuid-456" \
  --action approve|reject|correct \
  --feedback "Optional detailed feedback" \
  --expert-id "expert-name"

# Interactive review interface (TBD)
./scripts/workflow-codification/expert-review-portal.sh
```

**SLA Tracking:**
- Target: Expert review within 5 minutes
- Alert: Escalate if pending >15 minutes
- Audit trail: Every approval recorded with timestamp and rationale

### 3.4 Edge Case Tracking Component

**Responsibility:** Capture skill execution failures and trigger improvement proposals

**Triggering Logic:**

```
Skill Execution
    │
    ├─ Success (return code 0)
    │   │
    │   └─> Record execution
    │        (status='success', cost_avoided tracked)
    │
    └─ Failure (return code ≠ 0)
        │
        ├─> Capture error context
        │   - Error message
        │   - Stack trace / stderr
        │   - Input parameters
        │   - Environment details
        │
        ├─> INSERT edge_cases
        │   - skill_id
        │   - error_message
        │   - error_context (JSONB)
        │   - execution_id (reference)
        │
        ├─> Classify edge case
        │   - Type: timeout, permission, format, logic, environment
        │   - Severity: critical, high, medium, low
        │
        ├─> Check for proposal trigger
        │   IF (occurrence of same error ≥ 3 in 7 days)
        │       AND (skill not already in update_proposals)
        │   THEN
        │       INSERT skill_update_proposals
        │       status = 'pending'
        │       Notify expert & system
        │
        └─> Track in execution record
            (edge_case_detected=TRUE, edge_case_id=ref)
```

**Aggregation Query for Proposal Triggering:**

```sql
-- Identify skills that need updates
SELECT
  ec.skill_id,
  COUNT(*) as edge_case_count,
  COUNT(DISTINCT ec.error_message) as unique_error_types,
  MAX(ec.occurred_at) as latest_occurrence,
  array_agg(DISTINCT ec.error_message) as error_messages
FROM edge_cases ec
WHERE
  ec.resolved = FALSE
  AND ec.occurred_at > NOW() - INTERVAL '7 days'
GROUP BY ec.skill_id
HAVING COUNT(*) >= 3
ORDER BY edge_case_count DESC;
```

### 3.5 Cost Tracking Component

**Responsibility:** Calculate ROI and track financial impact of workflow codification

**Cost Model:**

```
Cost Savings Calculation:
─────────────────────────

cost_avoided =
  (AI_INVOCATION_COST_PER_SKILL * average_tokens_per_invocation)
  / 1_000_000

Example:
  - AI cost: $15 / 1M tokens (Anthropic pricing)
  - Average invocation: 50K tokens
  - Cost per AI invocation: (50,000 / 1,000,000) × $15 = $0.75

execution_cost =
  (COMPUTE_COST_PER_MINUTE * execution_time_seconds / 60)
  + STORAGE_COST_PER_GB × storage_used_gb
  + NETWORK_COST

Example:
  - Compute: $0.10/minute × (5 seconds / 60) = $0.008
  - Storage: negligible
  - Network: negligible
  - Total: ~$0.01 per execution

net_savings = cost_avoided - execution_cost
            = $0.75 - $0.01 = $0.74 per skill invocation
```

**Cost Tracking Pipeline:**

```
Skill Execution Completes
        │
        ▼
┌──────────────────────────────┐
│ 1. Record Execution Data     │ - execution_started_at
│                              │ - execution_completed_at
│                              │ - return_code
│                              │ - input_parameters
│                              │ - output_artifacts
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 2. Calculate Costs           │ - Look up baseline AI cost
│                              │ - Estimate execution cost
│                              │ - Calculate net_savings_usd
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 3. Insert into Database      │ - INSERT skill_executions
│                              │ - UPDATE cost tracking
│                              │ - Check edge cases
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ 4. Generate Reports          │ - Daily cost summary
│                              │ - Weekly ROI by skill
│                              │ - Monthly savings by team
└──────────────────────────────┘
```

**Key Metrics (30-Day Period):**

```sql
-- Top 10 skills by savings
SELECT
  s.skill_name,
  s.pattern_id,
  COUNT(e.id) as executions,
  SUM(e.cost_avoided_usd) as total_avoided,
  SUM(e.execution_cost_usd) as total_cost,
  SUM(e.net_savings_usd) as total_savings,
  AVG(e.execution_duration_seconds) as avg_duration_seconds
FROM skill_executions e
JOIN skill_metadata s ON e.skill_id = s.skill_name
WHERE e.execution_started_at > NOW() - INTERVAL '30 days'
GROUP BY s.skill_name, s.pattern_id
ORDER BY total_savings DESC
LIMIT 10;

-- Team-based cost breakdown
SELECT
  e.team_invoked_by,
  COUNT(e.id) as executions,
  SUM(e.cost_avoided_usd) as total_savings,
  COUNT(CASE WHEN ec.id IS NOT NULL THEN 1 END) as edge_cases,
  COUNT(CASE WHEN ec.id IS NOT NULL THEN 1 END)::FLOAT / COUNT(e.id) as edge_case_rate
FROM skill_executions e
LEFT JOIN edge_cases ec ON e.edge_case_id = ec.id
WHERE e.execution_started_at > NOW() - INTERVAL '30 days'
GROUP BY e.team_invoked_by
ORDER BY total_savings DESC;
```

---

## 4. Skill Package Structure

### 4.1 Directory Layout

```
.claude/skills/codified-{pattern-name}/
├── execute.sh                    # Main skill script (executable)
├── validate.sh                   # Input validation (executable)
├── test.sh                       # Test suite (executable)
├── SKILL.md                      # User documentation
├── edge-cases.json              # Known limitations (JSON)
├── metadata.json                # Skill metadata (JSON)
└── .gitkeep                     # Version control
```

### 4.2 Script Specifications

#### execute.sh - Main Skill Script

```bash
#!/bin/bash
set -euo pipefail

# Skill: {pattern_name}
# Version: 1.0.0
# Pattern ID: {uuid}
# Teams: {comma-separated}
# Description: {one-line description}

# === USAGE ===
# ./execute.sh --param1 value1 --param2 value2
#
# === PARAMETERS ===
# --param1 (required): Description
# --param2 (optional): Description (default: value)
# --help: Show this message

# === EXIT CODES ===
# 0: Success
# 1: Invalid parameters
# 2: Precondition failure
# 3: Execution error
# 4: Unknown error

# === GLOBAL CONFIG ===
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly PATTERN_ID="{uuid}"

# === LOGGING ===
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $*" >&2
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_debug() { [[ "${DEBUG:-0}" == "1" ]] && log "DEBUG" "$@"; }

# === PARAMETER PARSING ===
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --param1)
                PARAM1="$2"
                shift 2
                ;;
            --param2)
                PARAM2="${2:-default_value}"
                shift 2
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# === VALIDATION ===
validate_inputs() {
    log_info "Validating inputs..."

    if [[ -z "${PARAM1:-}" ]]; then
        log_error "--param1 is required"
        return 1
    fi

    if [[ ! -f "$PARAM1" ]]; then
        log_error "File not found: $PARAM1"
        return 2
    fi

    log_info "Validation passed"
    return 0
}

# === MAIN EXECUTION ===
execute_workflow() {
    log_info "Starting workflow execution"
    log_info "Pattern ID: $PATTERN_ID"

    # Step 1: {First workflow step}
    log_info "Executing step 1..."
    # implementation here

    # Step 2: {Second workflow step}
    log_info "Executing step 2..."
    # implementation here

    # Step N: {Final workflow step}
    log_info "Executing step N..."
    # implementation here

    log_info "Workflow execution completed successfully"
    return 0
}

# === HELP ===
show_help() {
    cat <<EOF
$SCRIPT_NAME - {pattern_name} Skill

Usage: $SCRIPT_NAME [OPTIONS]

Options:
  --param1 VALUE      {Description} (required)
  --param2 VALUE      {Description} (optional)
  --help, -h          Show this help message

Examples:
  $SCRIPT_NAME --param1 value1 --param2 value2

Exit Codes:
  0: Success
  1: Invalid parameters
  2: Precondition failure
  3: Execution error
  4: Unknown error

See SKILL.md for detailed documentation and edge cases.
EOF
}

# === MAIN ===
main() {
    log_info "Starting $SCRIPT_NAME"

    parse_args "$@" || exit 1
    validate_inputs || exit $?
    execute_workflow || exit 3

    log_info "$SCRIPT_NAME completed successfully"
    return 0
}

# Trap errors
trap 'log_error "Unexpected error on line $LINENO"; exit 4' ERR

main "$@"
```

#### validate.sh - Input Validation

```bash
#!/bin/bash
set -euo pipefail

# Validation script for {pattern_name} skill
# Returns 0 if valid, 1 if invalid

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# === VALIDATORS ===
validate_param1() {
    local value=$1

    if [[ -z "$value" ]]; then
        echo "ERROR: param1 is required" >&2
        return 1
    fi

    if [[ ! -f "$value" ]]; then
        echo "ERROR: File not found: $value" >&2
        return 1
    fi

    return 0
}

validate_prerequisites() {
    # Check required commands
    local required_commands=(bash grep sed)

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &>/dev/null; then
            echo "ERROR: Required command not found: $cmd" >&2
            return 1
        fi
    done

    return 0
}

# === MAIN ===
main() {
    validate_prerequisites || return 1
    validate_param1 "${1:-}" || return 1

    echo "All validations passed"
    return 0
}

main "$@"
```

#### test.sh - Comprehensive Test Suite

```bash
#!/bin/bash
set -euo pipefail

# Test suite for {pattern_name} skill
# Uses BATS (Bash Automated Testing System)

# === TEST SETUP ===
setup() {
    export BATS_TEST_TMPDIR=$(mktemp -d)
    cd "$BATS_TEST_TMPDIR"
}

teardown() {
    rm -rf "$BATS_TEST_TMPDIR"
}

# === HAPPY PATH TESTS ===

@test "execute.sh succeeds with valid parameters" {
    result=$("$SCRIPT_DIR/execute.sh" --param1 valid_value)
    [ $? -eq 0 ]
    [[ "$result" =~ "success" ]]
}

@test "validate.sh accepts valid parameters" {
    run "$SCRIPT_DIR/validate.sh" --param1 valid_value
    [ "$status" -eq 0 ]
}

# === EDGE CASE TESTS ===

@test "execute.sh fails with missing required parameter" {
    run "$SCRIPT_DIR/execute.sh"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "required" ]]
}

@test "execute.sh fails with invalid file parameter" {
    run "$SCRIPT_DIR/execute.sh" --param1 /nonexistent/file
    [ "$status" -eq 2 ]
    [[ "$output" =~ "not found" ]]
}

@test "skill handles timeout gracefully (edge case 1)" {
    # Test implementation for timeout edge case
    skip "Requires long-running subprocess"
}

@test "skill recovers from permission denied error (edge case 2)" {
    # Test implementation for permission error
    skip "Requires special setup"
}

# === PERFORMANCE TESTS ===

@test "execute.sh completes in reasonable time" {
    start_time=$(date +%s)
    "$SCRIPT_DIR/execute.sh" --param1 value
    end_time=$(date +%s)
    duration=$((end_time - start_time))

    [ $duration -lt 30 ]  # Should complete in <30 seconds
}
```

#### SKILL.md - User Documentation

```markdown
# Skill: {pattern_name}

**Version:** 1.0.0
**Pattern ID:** {uuid}
**Teams:** {team1, team2}
**Generated:** {date}
**Approved:** {date}
**Status:** Active

## Purpose

{One-paragraph description of what this skill does}

## What This Codifies

{Explain the workflow pattern that was detected and automated}

### Original Pattern
- Occurrence count: {N}
- Teams affected: {team_list}
- Cost savings: ${savings}/execution

## Usage

### Basic Usage
```bash
./execute.sh --param1 value1 --param2 value2
```

### Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| --param1 | string | Yes | Description of param1 | value1 |
| --param2 | string | No | Description of param2 (default: xyz) | value2 |

### Exit Codes

| Code | Meaning | Troubleshooting |
|------|---------|-----------------|
| 0 | Success | N/A |
| 1 | Invalid parameters | Check parameter values |
| 2 | Precondition failure | Verify prerequisites |
| 3 | Execution error | See stderr output |
| 4 | Unknown error | Contact team |

## Examples

### Example 1: Basic Execution
```bash
./execute.sh --param1 value1
```

### Example 2: With Optional Parameters
```bash
./execute.sh --param1 value1 --param2 custom_value
```

## Prerequisites

- Bash 4.0+
- Commands: {command_list}
- Environment: {env_vars}

## Known Edge Cases

### Edge Case 1: {Description}
**Symptom:** {What happens}
**Root Cause:** {Why it happens}
**Workaround:** {How to handle}
**Status:** {Tracked in issue #N | Fixed in v1.1}

### Edge Case 2: {Description}
[Similar format]

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Average execution time | {X} seconds |
| Memory usage | {Y} MB |
| Network I/O | {Z} KB |

## Cost Impact

| Metric | Value |
|--------|-------|
| Cost avoided per execution | ${A} |
| Execution cost | ${B} |
| Net savings per execution | ${C} |

## Troubleshooting

### Issue: {Problem}
**Error:** {Error message}
**Solution:** {Steps to resolve}

## Integration Examples

### With CFN Loop
```bash
./.claude/skills/codified-{pattern-name}/execute.sh \
  --param1 value \
  --param2 value
```

### As Team Coordinator Task
```bash
# Team coordinator invokes instead of spawning agent
TASK_ID="team-$(date +%s)"
./.claude/skills/codified-{pattern-name}/execute.sh ...
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | {date} | Initial version |

## Support

- **Skill Owner:** workflow-codification-system
- **Pattern ID:** {uuid}
- **Issues:** Report via edge-cases table (automatic)
- **Updates:** Tracked in skill_update_proposals table

## See Also

- [Edge Cases](edge-cases.json)
- [Metadata](metadata.json)
- [Pattern Specification](planning/docker/corporate/phase3-workflow-codification/SPECIFICATION.md)
```

#### edge-cases.json - Known Limitations

```json
{
  "skill_name": "codified-pattern-name",
  "version": "1.0.0",
  "edge_cases": [
    {
      "case_id": "EC001",
      "title": "Timeout when processing large files",
      "description": "Skill times out when input file exceeds 100MB",
      "root_cause": "Linear memory algorithm, not optimized for large inputs",
      "occurrence_frequency": "Rare (<1% of executions)",
      "severity": "high",
      "workaround": "Split large files into smaller chunks before processing",
      "fixed_in_version": null,
      "related_issue": "#42",
      "timestamp_first_observed": "2025-11-15T10:00:00Z",
      "timestamp_last_observed": "2025-11-15T14:00:00Z",
      "occurrence_count": 2
    },
    {
      "case_id": "EC002",
      "title": "Permission denied on Docker mounts",
      "description": "Skill fails when executed from Docker container with read-only mounts",
      "root_cause": "Script attempts to write to input directory",
      "occurrence_frequency": "Medium (5-10% of executions)",
      "severity": "medium",
      "workaround": "Use read-write mount or copy input to temp directory first",
      "fixed_in_version": null,
      "related_issue": "#45",
      "timestamp_first_observed": "2025-11-14T09:00:00Z",
      "timestamp_last_observed": "2025-11-15T16:00:00Z",
      "occurrence_count": 12
    },
    {
      "case_id": "EC003",
      "title": "Invalid JSON schema detected",
      "description": "Skill throws error when input parameter has unexpected JSON structure",
      "root_cause": "Insufficient input validation in validate.sh",
      "occurrence_frequency": "Common (10-15% of executions)",
      "severity": "low",
      "workaround": "Ensure input JSON matches schema in metadata.json",
      "fixed_in_version": "2.0.0 (planned)",
      "related_issue": "#48",
      "timestamp_first_observed": "2025-11-10T12:00:00Z",
      "timestamp_last_observed": "2025-11-15T17:00:00Z",
      "occurrence_count": 47
    }
  ],
  "notes": "Edge cases are automatically tracked via the edge_cases database table. Recurring issues (≥3 occurrences) trigger skill_update_proposals.",
  "last_updated": "2025-11-15T18:00:00Z"
}
```

#### metadata.json - Skill Metadata

```json
{
  "skill_id": "uuid-456",
  "skill_name": "codified-pattern-name",
  "version": "1.0.0",

  "pattern_information": {
    "pattern_id": "uuid-123",
    "pattern_name": "workflow-pattern-name",
    "occurrence_count": 12,
    "confidence_score": 0.95,
    "teams_affected": ["frontend", "backend"]
  },

  "authorship": {
    "generated_by_agent": "workflow-codification-v1",
    "generated_at": "2025-11-15T10:00:00Z",
    "approved_by_expert": "expert-name",
    "approved_at": "2025-11-15T10:15:00Z",
    "expert_email": "expert@company.com"
  },

  "parameters": [
    {
      "name": "param1",
      "type": "string",
      "required": true,
      "description": "Description of parameter",
      "example": "example_value",
      "validation": {
        "pattern": "^[a-z0-9-]+$",
        "min_length": 1,
        "max_length": 255
      }
    },
    {
      "name": "param2",
      "type": "string",
      "required": false,
      "description": "Optional parameter",
      "default": "default_value",
      "example": "custom_value"
    }
  ],

  "lifecycle": {
    "published_at": "2025-11-15T10:30:00Z",
    "deprecated_at": null,
    "deprecation_reason": null
  },

  "access_control": {
    "teams_authorized": ["frontend", "backend"],
    "shared_across_teams": false,
    "version_pinned": false
  },

  "dependencies": {
    "bash_version_min": "4.0",
    "external_commands": ["grep", "sed", "awk"],
    "environment_variables": [],
    "files_required": []
  },

  "performance": {
    "baseline_execution_time_seconds": 15.3,
    "baseline_memory_mb": 128,
    "alert_threshold_execution_seconds": 45,
    "alert_threshold_memory_mb": 512
  },

  "quality": {
    "test_framework": "bats",
    "test_coverage_percentage": 87,
    "shellcheck_passed": true,
    "documentation_complete": true,
    "edge_cases_documented": 3
  },

  "cost_impact": {
    "cost_avoided_per_execution_usd": 0.75,
    "execution_cost_per_execution_usd": 0.02,
    "net_savings_per_execution_usd": 0.73,
    "estimated_annual_usage": 500,
    "estimated_annual_savings_usd": 365
  },

  "tags": [
    "workflow-codification",
    "generated-skill",
    "phase-4"
  ]
}
```

---

## 5. Data Flow Architecture

### 5.1 Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW CODIFICATION DATA FLOW                  │
└─────────────────────────────────────────────────────────────────────────┘

PHASE 2 (ACE Playbooks)
       │
       │  Completed Workflows
       ▼
┌─────────────────────┐
│   ACE Reflections   │
│   (PostgreSQL)      │
│ - workflow_steps    │
│ - team_executed     │
│ - success/failure   │
│ - execution_time    │
└─────────────────────┘
       │
       │  1. Aggregate & Analyze
       ▼
┌─────────────────────┐
│   Pattern Detector  │
│   (PostgreSQL       │
│    Procedures)      │
│ - Similarity: 0.85+ │
│ - Occurrence: 5+    │
│ - Confidence: 0.90+ │
│ - Deterministic: Y  │
└─────────────────────┘
       │
       │  2. Store Detected Patterns
       ▼
┌──────────────────────────┐
│  workflow_patterns       │
│  (PostgreSQL)            │
│ - status='detected'      │
│ - confidence_score       │
│ - estimated_savings      │
│ - teams_affected         │
└──────────────────────────┘
       │
       │  3. Generate Skills (via AI)
       ▼
┌──────────────────────────┐
│  Skill Generator Agent   │
│  (Claude Code)           │
│ - Analyzes pattern       │
│ - Generates 6 files      │
│ - Validates quality      │
│ - Records generation     │
└──────────────────────────┘
       │
       │  4. Stage Artifacts
       ▼
┌──────────────────────────┐
│  .claude/skills/codified-* │
│  ├─ execute.sh           │
│  ├─ validate.sh          │
│  ├─ test.sh              │
│  ├─ SKILL.md             │
│  ├─ edge-cases.json      │
│  └─ metadata.json        │
└──────────────────────────┘
       │
       │  5. Record Generation
       ▼
┌──────────────────────────┐
│  skill_generations      │
│  (PostgreSQL)           │
│ - skill_name            │
│ - artifact_paths        │
│ - test_coverage         │
│ - shellcheck_passed     │
└──────────────────────────┘
       │
       │  6. Create Approval Request
       ▼
┌──────────────────────────┐
│  skill_approvals        │
│  (PostgreSQL)           │
│ - status='pending'      │
│ - submitted_for_review  │
│ - expert notification   │
└──────────────────────────┘
       │
       │  7. Expert Reviews
       │     (Async SLA: 5 minutes)
       ▼
┌──────────────────────────┐
│  Expert Review          │
│  ├─ Tests skill         │
│  ├─ Validates docs      │
│  ├─ Checks edge cases   │
│  ├─ Reviews code        │
│  └─ Makes decision      │
└──────────────────────────┘
       │
       ├──(APPROVED)
       │   │
       │   ├─> UPDATE skill_approvals
       │   │   status='approved'
       │   │
       │   └─> Deploy to Production
       │       .claude/skills/codified-*/
       │       (Final version)
       │
       ├──(REJECTED)
       │   │
       │   ├─> UPDATE skill_approvals
       │   │   status='rejected'
       │   │
       │   └─> UPDATE workflow_patterns
       │       status='not_suitable'
       │
       └──(NEEDS_CORRECTION)
           │
           ├─> UPDATE skill_approvals
           │   status='needs_correction'
           │
           ├─> Skill re-generation
           │   (Loop back to Skill Generator)
           │
           └─> Re-submit for review

PRODUCTION EXECUTION
       │
       │  8. Team Coordinator Uses Skill
       ▼
┌──────────────────────────┐
│  Team Coordinator       │
│  ├─ Instead of:         │
│  │  Task("agent", task) │
│  │                      │
│  └─ Invoke:             │
│     ./.claude/skills/   │
│     codified-*/         │
│     execute.sh          │
└──────────────────────────┘
       │
       │  9. Capture Execution
       ▼
┌──────────────────────────┐
│  skill_executions       │
│  (PostgreSQL)           │
│ - execution_time        │
│ - cost_avoided_usd      │
│ - execution_cost_usd    │
│ - status                │
│ - return_code           │
└──────────────────────────┘
       │
       │  10a. Success Path
       ├─────────────────────────┐
       │                         │
       │  Record Execution       │
       │  Calculate Savings      │
       │  Update Cost Summaries  │
       │
       │  10b. Failure Path
       │                         │
       │  Capture Error Context  │
       │  INSERT edge_cases      │
       │  Check for Proposal     │
       │  Trigger (≥3 same error)│
       │
       ▼
┌──────────────────────────┐
│  edge_cases             │
│  (PostgreSQL)           │
│ - error_message         │
│ - error_context         │
│ - resolved              │
│ - triggers_update       │
└──────────────────────────┘
       │
       │  11. Aggregate & Analyze
       ▼
┌──────────────────────────┐
│  Skill Update Proposal   │
│  Generator               │
│  (Periodic Process)      │
│                          │
│ IF (same_error_count≥3   │
│     in 7 days)           │
│ THEN generate proposal   │
└──────────────────────────┘
       │
       │  12. Create Proposal
       ▼
┌──────────────────────────┐
│  skill_update_proposals │
│  (PostgreSQL)           │
│ - triggered_by_         │
│   edge_case_count       │
│ - status='pending'      │
│ - expert_review         │
└──────────────────────────┘
       │
       │  13. Expert Reviews & Approves
       │      (Loop back to generation)
       ▼
   (New Version Generated)
   (Deployed to Production)

REPORTING & ANALYTICS
       │
       │  14. Daily Summary
       ▼
┌──────────────────────────┐
│  cost_summary           │
│  (PostgreSQL)           │
│ - total_savings_usd     │
│ - total_executions      │
│ - team_breakdown        │
│ - pattern_breakdown     │
└──────────────────────────┘
       │
       │  15. Executive Report
       ▼
Monthly/Quarterly ROI Report
- Total skills deployed
- Executions & savings
- Edge case trends
- Team performance
```

### 5.2 Detailed Workflows

**Workflow 1: Pattern Detection to Deployment**

```
Timeline: Real-time → ~30 minutes (if approved without correction)

T+0min:   ACE Reflection recorded
          Trigger: workflow_patterns detection check (cron job)

T+1min:   Pattern detected if meets thresholds
          INSERT workflow_patterns (status='detected')

T+2min:   Send to Skill Generator
          Spawn Claude Code agent with pattern details

T+10min:  Skill generation complete
          6 files staged in .claude/skills/codified-*/
          INSERT skill_generations
          INSERT skill_approvals (status='pending')

T+12min:  Alert expert for review
          Email/Slack notification with skill summary

T+15min:  Expert downloads/tests skill
          Reviews code, tests, documentation
          Validates edge cases are documented

T+20min:  Expert approves skill
          UPDATE skill_approvals (status='approved')
          Expert edits any issues if needed

T+22min:  Deployment automation triggered
          Finalize skill in .claude/skills/codified-*/
          Commit to version control
          Update skill_metadata (published_at)

T+25min:  Skill available to teams
          Team coordinators can invoke instead of spawning agents
          Cost tracking begins

T+1day:   Monitor executions
          Track edge cases
          Aggregate cost savings
          Generate daily report
```

**Workflow 2: Edge Case Detection to Skill Update**

```
Timeline: Real-time → ~2 hours (if update approved without generation cycle)

T+0min:   Skill execution fails
          Return code ≠ 0
          Error message captured
          Input parameters logged

T+1min:   INSERT edge_cases
          - error_message
          - error_context
          - execution_id reference
          - severity classification

T+5min:   Check for proposal trigger
          SELECT COUNT(*) FROM edge_cases
          WHERE skill_id = $skill
          AND error_message = $error
          AND occurred_at > NOW() - '7 days'

T+5min:   If count >= 3 AND no pending proposal
          INSERT skill_update_proposals (status='pending')
          Mark edge_cases (triggers_update='TRUE')

T+10min:  Alert expert
          Email/Slack with edge case summary
          Link to skill_update_proposals record

T+30min:  Expert reviews edge cases
          Decides if fix or documentation is needed
          Might request AI regeneration vs manual patch

T+60min:  Skill updated
          New version generated or manually patched
          Re-submitted for approval

T+90min:  Updated skill approved & deployed
          New version available to teams
          Edge cases table updated with resolution

T+next:   Monitor updated skill
          Track if edge case recurs
          Calculate improvement
```

---

## 6. Integration with Existing Infrastructure

### 6.1 Phase 1 Integration (Corporate Organization)

**Team Isolation Model:**

```
Phase 1 Structure:
├── frontend-team coordinator
├── backend-team coordinator
├── devops-team coordinator
└── other-teams...

Phase 4 Integration:
├── .claude/skills/frontend/codified-*
├── .claude/skills/backend/codified-*
├── .claude/skills/devops/codified-*
├── .claude/skills/shared/codified-*
└── other-team-skills...
```

**Team Coordinator Invocation Change:**

```bash
# BEFORE (Phase 1): Spawn agent for every workflow
Task("frontend-developer", "Implement login form", ...)

# AFTER (Phase 1+4): Check if codified skill exists
if [ -f ".claude/skills/frontend/codified-login-component/execute.sh" ]; then
    # Cost savings: $0.75 per invocation
    ./.claude/skills/frontend/codified-login-component/execute.sh
else
    # Fallback: Spawn agent for novel tasks
    Task("frontend-developer", "Implement novel feature", ...)
fi
```

**Resource Budget Integration:**

```
Phase 1 tracks:
- AI token budget (e.g., 1M tokens/month)
- Agent spawning cost

Phase 4 adds:
- Skill execution cost (trivial vs AI)
- Cost avoidance metrics
- ROI per team

Team Coordinator reports:
- Agent spawns: 100 (cost: $75)
- Skill executions: 500 (cost: $10, saved: $375)
- Net savings: $365/month
```

### 6.2 Phase 2 Integration (ACE Playbooks)

**Pattern Detection Source:**

```
Phase 2 produces:
- ace_reflections table
- Execution logs with workflow steps
- Success/failure data
- Team execution history

Phase 4 consumes:
- workflow_patterns derived from reflections
- Historical context for generation
- Edge case context from failures
- Cost baseline (AI invocation cost avoided)

Link: workflow_patterns.source_ace_reflections → ace_reflections.id
```

**ACE-to-Codification Flow:**

```
ACE Reflection Pattern:
{
  workflow: [
    "npm install",
    "npm run build",
    "npm run test",
    "npm run deploy"
  ],
  team: "frontend",
  success: true,
  execution_time: 245,
  cost: 0.75
}

Same pattern occurs 5+ times in 90 days with 85%+ similarity
↓
Pattern detected: "npm-install-build-test-deploy"
Confidence: 0.95, Occurrence: 12
↓
Skill generated: .claude/skills/frontend/codified-npm-install-build-test-deploy/
↓
Team can now invoke skill instead of running full CI/CD pipeline
Cost per invocation: $0.75 → $0.02 (97% savings)
```

### 6.3 CFN Loop Integration

**Modified CFN Loop Pattern:**

```
Loop 3 (Implementation):
BEFORE: Task("specialist-agent", task)
        Agent spawned, costs $0.75-$1.00

AFTER:  IF codified_skill_exists(task)
            Execute .claude/skills/codified-*/execute.sh
            Cost: $0.02
        ELSE
            Task("specialist-agent", task)
            Cost: $0.75-$1.00

Result: 60-80% cost reduction for repeated patterns
```

**Product Owner Decision Gate:**

```
Loop 4 (Product Owner):
NEW: Check workflow_codification_readiness

IF skill_deployment_ready:
    - Skill meets quality thresholds
    - Expert has approved
    - Documentation complete
THEN:
    - Mark as APPROVED
    - Deploy to production
    - Update team coordinators
```

### 6.4 Database Integration

**PostgreSQL Multi-Schema Design:**

```sql
-- Phase 1 Schema
SCHEMA corporate_organization
  - teams
  - team_coordinators
  - resource_budgets

-- Phase 2 Schema
SCHEMA ace_playbooks
  - ace_reflections
  - lesson_learned
  - best_practices

-- Phase 3 Schema (NEW)
SCHEMA workflow_codification
  - workflow_patterns
  - skill_generations
  - skill_approvals
  - edge_cases
  - skill_executions
  - skill_metadata
  - skill_update_proposals
  - cost_summary

-- Joins across schemas
workflow_patterns.source_ace_reflections
  → ace_playbooks.ace_reflections.id

skill_executions.team_invoked_by
  → corporate_organization.teams.name

edge_cases.skill_id
  → skill_metadata.skill_name
```

**Redis Coordination Layer:**

```
Phase 1 coordination:
- Team coordinator heartbeats
- Agent task queues
- Resource tracking

Phase 4 additions:
- Skill execution logs (temporary)
- Cost tracking cache (for real-time dashboards)
- Pattern detection triggers (frequency counters)

Key patterns:
skill:execution:${skill_name}:count    → Real-time execution count
skill:cost:${skill_name}:total_saved   → Cache total savings
pattern:${pattern_id}:occurrence       → Frequency counter for detection
```

---

## 7. Quality Assurance & Validation

### 7.1 Skill Validation Checklist

**Before Expert Review:**

```
Quality Gate 1: Code Quality
- [ ] execute.sh passes shellcheck (no warnings)
- [ ] validate.sh passes shellcheck
- [ ] test.sh passes shellcheck
- [ ] Scripts are executable (chmod +x)
- [ ] No hardcoded credentials or secrets
- [ ] Error handling present (set -euo pipefail)

Quality Gate 2: Testing
- [ ] Test coverage ≥ 80%
- [ ] All known edge cases have tests
- [ ] Happy path tests pass
- [ ] Edge case tests pass
- [ ] Tests documented in test.sh
- [ ] Test timeouts specified

Quality Gate 3: Documentation
- [ ] SKILL.md exists and is complete
- [ ] Parameter documentation present
- [ ] Examples provided
- [ ] Edge cases documented
- [ ] Prerequisites listed
- [ ] Performance characteristics documented

Quality Gate 4: Metadata
- [ ] edge-cases.json is valid JSON
- [ ] metadata.json is valid JSON
- [ ] All required fields present
- [ ] Version format correct (semver)
- [ ] Parameter schema complete
- [ ] Dependencies documented

Quality Gate 5: Functionality
- [ ] Skill performs documented workflow
- [ ] Return codes correct (0=success, >0=failure)
- [ ] Error messages descriptive
- [ ] Performance acceptable (<30s baseline)
- [ ] Memory usage reasonable (<500MB)
- [ ] Idempotent where applicable
```

### 7.2 Post-Deployment Monitoring

**First 7 Days:**

```
Monitoring Metrics:
- Execution count (target: ≥10)
- Success rate (target: ≥95%)
- Average execution time vs baseline
- Edge case occurrence rate
- Cost savings accumulation

Alerts:
- IF success_rate < 90% → Escalate to expert
- IF avg_exec_time > 2x baseline → Performance alert
- IF edge_case_count > 5 → Quality alert
- IF no executions after 3 days → Visibility alert
```

---

## 8. Deployment Architecture

### 8.1 Skill Deployment Process

```bash
#!/bin/bash
# deployment/codified-skill-deploy.sh

set -euo pipefail

SKILL_NAME=$1
SKILL_VERSION=${2:-1.0.0}
SKILL_PATH=".claude/skills/codified-${SKILL_NAME}"

# 1. Validate skill exists and is approved
validate_skill_ready() {
    # Check PostgreSQL skill_approvals
    psql -h $DB_HOST -c "
        SELECT skill_generation_id
        FROM skill_approvals
        WHERE status = 'APPROVED'
        AND skill_generation_id = (
            SELECT id FROM skill_generations
            WHERE skill_name = '$SKILL_NAME'
            AND skill_version = '$SKILL_VERSION'
        )
    " | grep -q . || {
        echo "ERROR: Skill not approved for deployment"
        exit 1
    }
}

# 2. Create production version
create_production_version() {
    # Copy staging to production
    cp -r "$SKILL_PATH.staging" "$SKILL_PATH"

    # Make executable
    chmod +x "$SKILL_PATH/execute.sh"
    chmod +x "$SKILL_PATH/validate.sh"
    chmod +x "$SKILL_PATH/test.sh"

    # Verify permissions
    [ -x "$SKILL_PATH/execute.sh" ] || exit 1
}

# 3. Update metadata
update_metadata() {
    # Update published_at
    jq ".lifecycle.published_at = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" \
        "$SKILL_PATH/metadata.json" > "$SKILL_PATH/metadata.json.tmp"
    mv "$SKILL_PATH/metadata.json.tmp" "$SKILL_PATH/metadata.json"
}

# 4. Version control
version_control_commit() {
    git add "$SKILL_PATH"
    git commit -m "feat(codified-skills): Deploy $SKILL_NAME v$SKILL_VERSION"
}

# 5. Update database
update_deployment_record() {
    psql -h $DB_HOST -c "
        UPDATE skill_approvals
        SET deployed_at = NOW()
        WHERE skill_generation_id = (
            SELECT id FROM skill_generations
            WHERE skill_name = '$SKILL_NAME'
            AND skill_version = '$SKILL_VERSION'
        );

        UPDATE skill_metadata
        SET published_at = NOW()
        WHERE skill_name = '$SKILL_NAME'
        AND skill_version = '$SKILL_VERSION';
    "
}

# 6. Notify teams
notify_teams() {
    # Get authorized teams
    TEAMS=$(psql -h $DB_HOST -c "
        SELECT array_to_string(teams_authorized, ',')
        FROM skill_metadata
        WHERE skill_name = '$SKILL_NAME'
    " | tail -1)

    echo "Skill $SKILL_NAME deployed for teams: $TEAMS"
    # Send Slack/email notification
}

# Main
validate_skill_ready
create_production_version
update_metadata
version_control_commit
update_deployment_record
notify_teams

echo "✅ Deployment complete: $SKILL_NAME v$SKILL_VERSION"
```

---

## 9. Reporting & Analytics

### 9.1 Key Dashboards

**Executive Dashboard (Monthly):**
```
┌─────────────────────────────────────┐
│ Workflow Codification ROI Summary    │
├─────────────────────────────────────┤
│ Skills Deployed: 23                 │
│ Total Executions: 2,450             │
│ Total Cost Avoided: $1,837.50        │
│ Total Execution Cost: $49.00         │
│ Net Savings: $1,788.50               │
│ ROI: 3,650% (vs. AI execution)       │
├─────────────────────────────────────┤
│ By Team:                            │
│ Frontend: 1,200 exec, $906 saved    │
│ Backend: 950 exec, $712 saved       │
│ DevOps: 300 exec, $171 saved        │
└─────────────────────────────────────┘
```

**Skill Health Dashboard (Per-Skill):**
```
┌─────────────────────────────────────┐
│ Skill: codified-login-component     │
├─────────────────────────────────────┤
│ Version: 1.2.1                      │
│ Status: Active                      │
│ Days Since Deploy: 15               │
│                                     │
│ Executions (This Month): 145        │
│ Success Rate: 98.6%                 │
│ Avg Execution Time: 12.3s           │
│ (Baseline: 14.5s, -15% improvement) │
│                                     │
│ Cost Saved (This Month): $108.75    │
│ Edge Cases: 2 (resolved)            │
│ Update Proposals: 0                 │
│                                     │
│ Last Execution: 2 mins ago ✅       │
└─────────────────────────────────────┘
```

---

## 10. File Structure & Organization

```
docker/workflow-codification/
├── ARCHITECTURE.md                          # This document
├── PSEUDOCODE.md (TBD)                      # Detailed algorithms
├── scripts/
│   ├── pattern-detector.sh                  # Pattern detection daemon
│   ├── skill-generator.sh                   # Orchestrate AI generation
│   ├── skill-validator.sh                   # Quality gate checker
│   ├── approval-workflow.sh                 # SLA tracking
│   ├── edge-case-tracker.sh                 # Execution failure capture
│   └── cost-tracker.sh                      # ROI calculation
├── sql/
│   ├── schema.sql                           # PostgreSQL DDL
│   ├── indexes.sql                          # Performance indexes
│   ├── queries/
│   │   ├── pattern-detection.sql
│   │   ├── cost-analysis.sql
│   │   ├── skill-health.sql
│   │   └── edge-case-proposals.sql
│   └── migrations/
│       └── 001-initial-schema.sql
├── templates/
│   ├── execute.sh.template                  # Skill script template
│   ├── validate.sh.template
│   ├── test.sh.template
│   ├── SKILL.md.template
│   ├── metadata.json.template
│   └── edge-cases.json.template
└── dashboards/
    ├── executive-roi-report.sql
    ├── skill-health-dashboard.sql
    └── team-cost-breakdown.sql

.claude/skills/
├── codified-{pattern-1}/
│   ├── execute.sh
│   ├── validate.sh
│   ├── test.sh
│   ├── SKILL.md
│   ├── edge-cases.json
│   └── metadata.json
├── codified-{pattern-2}/
│   └── [same structure]
└── [other skills...]

planning/docker/corporate/
└── phase3-workflow-codification/
    ├── SPECIFICATION.md                     # Functional requirements
    ├── PSEUDOCODE.md (TBD)                  # Algorithm pseudocode
    └── ARCHITECTURE.md ← You are here
```

---

## 11. Implementation Roadmap

### Phase 4.1: MVP (Weeks 1-2)
- [x] Architecture design (this document)
- [ ] PostgreSQL schema implementation
- [ ] Pattern detector script (basic directory-based)
- [ ] Skill generator agent prompt
- [ ] Approval workflow (CLI only)
- [ ] Cost tracking integration

### Phase 4.2: Enhanced (Weeks 3-4)
- [ ] AST-based pattern detection
- [ ] Multi-step workflow support
- [ ] Cross-team skill sharing
- [ ] Edge case dashboard
- [ ] Automated skill update proposals

### Phase 4.3: Advanced (Weeks 5-6)
- [ ] ML-based pattern detection
- [ ] A/B testing for skill variants
- [ ] Skill marketplace (discovery)
- [ ] Real-time cost dashboards
- [ ] Performance auto-optimization

### Phase 5: Autonomous (Future)
- [ ] Self-healing skills (no human approval)
- [ ] Skill versioning auto-upgrade
- [ ] Cross-organization skill marketplace
- [ ] Predictive skill generation

---

## 12. Success Metrics (30-Day Period)

| Metric | Target | Notes |
|--------|--------|-------|
| **Deployment** | ≥20 skills | Minimum viable set |
| **Usage** | ≥500 executions | Adoption by multiple teams |
| **Success Rate** | ≥95% | Production quality threshold |
| **Cost Savings** | ≥$500/month | $0.75 avoided vs $0.02 execution |
| **Edge Case Rate** | <5% | Quality threshold |
| **Expert SLA** | ≥90% met | <5 minute review time |
| **Documentation** | 100% complete | All skills fully documented |
| **Quality Coverage** | ≥80% test coverage | All skills tested thoroughly |

---

## 13. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Skills too rigid (don't handle variations) | High | High | Include edge cases, iteration cycles |
| Pattern detection false positives | Medium | Medium | Require 5+ occurrences + 90% confidence |
| Expert approval bottleneck | Medium | High | SLA tracking, escalation process |
| Security vulnerabilities in generated code | Low | Critical | Shellcheck validation, code review |
| Cross-team skill conflicts | Low | Medium | Team isolation, version pinning |
| Cost calculation errors | Low | Medium | Multiple validation checkpoints |

---

## Appendix A: Database Diagram (Entity-Relationship)

```
workflow_patterns
  ├─ id (PK)
  ├─ pattern_name (UNIQUE)
  ├─ workflow_steps (JSONB)
  ├─ occurrence_count
  ├─ confidence_score
  ├─ status (detected, generated, approved, deployed)
  └─ [links to] skill_generations (1:1)
  └─ [links to] edge_cases (1:N)
  └─ [links to] skill_update_proposals (1:N)

skill_generations
  ├─ id (PK)
  ├─ pattern_id (FK)
  ├─ skill_name
  ├─ skill_version
  ├─ [paths to artifacts]
  ├─ test_coverage_percentage
  ├─ shellcheck_passed
  └─ [links to] skill_approvals (1:1)

skill_approvals
  ├─ id (PK)
  ├─ skill_generation_id (FK)
  ├─ expert_id
  ├─ decision (APPROVED, REJECTED, NEEDS_CORRECTION)
  ├─ sla_met
  └─ deployed_at

skill_executions
  ├─ id (PK)
  ├─ skill_id (FK → skill_metadata)
  ├─ team_invoked_by
  ├─ execution_started_at
  ├─ status (success, partial, failed)
  ├─ cost_avoided_usd
  ├─ execution_cost_usd
  ├─ net_savings_usd
  └─ [links to] edge_cases (1:1 on failure)

edge_cases
  ├─ id (PK)
  ├─ skill_id
  ├─ error_message
  ├─ error_context (JSONB)
  ├─ occurrence_count
  ├─ severity
  ├─ resolved
  ├─ triggers_skill_update
  └─ [links to] skill_update_proposals (1:N)

skill_metadata
  ├─ skill_name (PK part)
  ├─ skill_version (PK part)
  ├─ teams_authorized (array)
  ├─ shared_across_teams
  ├─ parameter_schema (JSONB)
  └─ published_at

skill_update_proposals
  ├─ id (PK)
  ├─ skill_id (FK)
  ├─ triggered_by_edge_case_count
  ├─ status (pending, expert-review, approved)
  └─ new_version (after implementation)

cost_summary
  ├─ id (PK)
  ├─ period_start_date
  ├─ period_end_date
  ├─ total_skills_deployed
  ├─ total_executions
  ├─ total_cost_avoided_usd
  ├─ team_breakdown (JSONB)
  └─ pattern_breakdown (JSONB)
```

---

## Appendix B: Configuration Reference

**Environment Variables for Phase 4 Components:**

```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cfn_corporate
POSTGRES_USER=workflow_codification_user
POSTGRES_PASSWORD=<secure>

# Pattern Detection
PATTERN_DETECTION_MIN_OCCURRENCES=5
PATTERN_DETECTION_MIN_SIMILARITY=0.85
PATTERN_DETECTION_MIN_CONFIDENCE=0.90
PATTERN_DETECTION_CHECK_INTERVAL_HOURS=24

# Skill Generation
SKILL_GENERATION_TIMEOUT_SECONDS=300
SKILL_GENERATION_AGENT=workflow-codification-v1
SKILL_GENERATION_MODEL=claude-sonnet-4-5

# Approval Workflow
APPROVAL_SLA_MINUTES=5
APPROVAL_ESCALATION_MINUTES=15
EXPERT_NOTIFICATION_CHANNEL=slack  # or email

# Edge Case Tracking
EDGE_CASE_PROPOSAL_THRESHOLD=3      # Trigger at 3 occurrences
EDGE_CASE_PROPOSAL_WINDOW_DAYS=7    # Within 7 days

# Cost Tracking
COST_AI_INVOCATION_PER_MILLION_TOKENS=15000  # cents
COST_EXECUTION_PER_MINUTE=10        # cents
COST_CURRENCY=USD
```

---

**Document End**

**Status:** DRAFT - Ready for Implementation
**Next Steps:** Create PSEUDOCODE.md with detailed algorithms
**Created by:** System Architect Agent
**Date:** 2025-11-15

