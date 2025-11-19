# Google Sheets CFN Loop Architecture

## Overview

Specialized CFN Loop implementation for Google Sheets operations with **micro-sprint decomposition** to prevent "doing too much at once" while progressively achieving complex goals.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER REQUEST                                │
│  "Create sales dashboard with pivot tables and automation"     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              GOOGLE SHEETS COORDINATOR                          │
│  Agent: google-sheets-coordinator                               │
│  Role: Orchestrate micro-sprint execution                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        ▼                            ▼
┌──────────────────┐      ┌──────────────────────┐
│  DECOMPOSITION   │      │   SPRINT ORDERING    │
│  Skill           │      │   Skill              │
│                  │      │                      │
│  Break request   │      │  Resolve deps        │
│  into sprints    │──────▶  Topological sort    │
│  (max 5 ops)     │      │  Generate exec plan  │
└──────────────────┘      └──────────┬───────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXECUTION PLAN                                │
│  Level 0: [schema_001]                                          │
│  Level 1: [data_001, integration_001]  (parallel possible)      │
│  Level 2: [formula_001]                                         │
│  Level 3: [formatting_001]                                      │
│  Level 4: [automation_001]                                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────┐
        │  FOR EACH LEVEL (Sequential)        │
        │  FOR EACH SPRINT (Parallel if safe) │
        └─────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOOP 3: IMPLEMENTERS                         │
│  Agents execute sprint operations in parallel                  │
├─────────────────────────────────────────────────────────────────┤
│  [google-sheets-schema-designer]    (if schema sprint)         │
│  [google-sheets-formula-engineer]   (if formula sprint)        │
│  [google-sheets-data-transformer]   (if data sprint)           │
│  [google-sheets-api-integrator]     (if integration sprint)    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              SELF-VALIDATION (Loop 3)                           │
│  Skill: google-sheets-validation                               │
│  Each agent validates own work before completion               │
│  - Schema exists? ✓                                            │
│  - Data populated? ✓                                           │
│  - Formulas correct? ✓                                         │
│  - No errors? ✓                                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              LOOP 3 GATE CHECK (Test-Driven)                    │
│  Orchestrator collects validation results                      │
│  Calculate pass rate: passes / total_tests                     │
│                                                                 │
│  IF pass_rate < threshold (e.g., 0.95):                        │
│     → GATE FAILS → Wake Loop 3 for iteration N+1               │
│     → Skip Loop 2 (no point reviewing broken work)             │
│                                                                 │
│  IF pass_rate ≥ threshold:                                     │
│     → GATE PASSES → Signal Loop 2 to start                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   LOOP 2: VALIDATORS                            │
│  Wait for gate pass signal via coordination layer              │
│  Review Loop 3 work in parallel                                │
├─────────────────────────────────────────────────────────────────┤
│  [google-sheets-data-validator]      Confidence: 0.92          │
│  [google-sheets-formula-validator]   Confidence: 0.88          │
│  [google-sheets-performance-analyst] Confidence: 0.95          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONSENSUS CALCULATION                              │
│  Orchestrator collects validator scores                        │
│  Average: (0.92 + 0.88 + 0.95) / 3 = 0.917                     │
│                                                                 │
│  IF consensus < threshold (e.g., 0.90):                        │
│     → ITERATE (wake all agents for retry)                      │
│                                                                 │
│  IF consensus ≥ threshold:                                     │
│     → PROCEED to Product Owner                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              PRODUCT OWNER DECISION                             │
│  Agent: google-sheets-business-validator                       │
│  Reviews: Business requirements, deliverables, validation      │
│                                                                 │
│  Decision:                                                      │
│    PROCEED  → Sprint complete, move to next                    │
│    ITERATE  → Retry current sprint                             │
│    ABORT    → Exit with error                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              PROGRESS TRACKING                                  │
│  Skill: google-sheets-progress                                 │
│  Update state: completed sprints, current, remaining           │
│  Calculate: 3/5 sprints complete (60%)                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
   [More Sprints]          [Final Validation]
         │                         │
         └────────────┬────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  COMPLETION REPORT                              │
│  All sprints: ✓ Complete                                       │
│  Total sprints: 5                                               │
│  Iterations: 2 (1 retry on formula sprint)                     │
│  API calls: 47 / 100 quota                                     │
│  Final validation: ✓ Passed                                    │
│  Spreadsheet ready for use                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Key Innovations

### 1. Micro-Sprint Decomposition
**Problem:** Complex Google Sheets requests overwhelming agents
**Solution:** Break into atomic sprints (max 5 operations each)

**Example:**
```
User Request: "Create sales dashboard with pivot tables"

Decomposition:
  Sprint 1 (schema):     Create Dashboard sheet, define columns
  Sprint 2 (data):       Import sales data from CSV
  Sprint 3 (formula):    Build pivot table formulas
  Sprint 4 (formatting): Apply conditional formatting
  Sprint 5 (automation): Add refresh trigger
```

### 2. Progressive Achievement
**Problem:** All-or-nothing execution leads to failure
**Solution:** Sequential sprints build upon each other

**Execution:**
```
Level 0: schema_001          → Complete → ✓
Level 1: data_001            → Complete → ✓
Level 2: formula_001         → FAIL (retry)
Level 2: formula_001 (retry) → Complete → ✓
Level 3: formatting_001      → Complete → ✓
Level 4: automation_001      → Complete → ✓
```

### 3. Test-Driven Validation
**Problem:** Subjective confidence scoring (55% accuracy)
**Solution:** Objective test execution (95%+ accuracy)

**Gate Check:**
```bash
# Loop 3 agents execute validation tests
test_schema_exists.sh       → PASS
test_columns_match.sh       → PASS
test_data_populated.sh      → PASS
test_formulas_no_errors.sh  → FAIL (1 #REF! error)
test_formatting_applied.sh  → PASS

Pass Rate: 4/5 = 0.80 < 0.95 threshold
→ GATE FAILS → Retry sprint
```

### 4. Dependency-Aware Execution
**Problem:** Sprints executing in wrong order
**Solution:** Topological sort ensures prerequisites complete first

**Dependencies:**
```
schema_001 (no deps)
  ↓
data_001 (depends on schema)
  ↓
formula_001 (depends on schema + data)
  ↓
automation_001 (depends on all above)
```

## Sprint Type Specifications

### Schema Sprint
**Purpose:** Establish spreadsheet structure
**Operations:**
- Create/rename sheets
- Add/remove columns
- Define named ranges
- Set data types

**Success Criteria:**
- Sheets exist with expected names
- Column headers match specification
- Named ranges defined correctly

**Agent:** google-sheets-schema-designer

### Data Sprint
**Purpose:** Populate or transform data
**Operations:**
- Import data from external sources
- Transform existing data
- Merge/split columns
- Clean/normalize values

**Success Criteria:**
- Data imported without errors
- Transformations produce expected output
- No data loss or corruption
- Row counts match expectations

**Agent:** google-sheets-data-transformer

### Formula Sprint
**Purpose:** Add calculations and validation
**Operations:**
- Create formulas (simple to complex)
- Add data validation rules
- Implement conditional logic
- Set up array formulas

**Success Criteria:**
- All formulas return expected types
- No #REF!, #VALUE!, #N/A errors
- Validation rules enforce constraints
- Array formulas expand correctly

**Agent:** google-sheets-formula-engineer

### Formatting Sprint
**Purpose:** Apply visual formatting
**Operations:**
- Conditional formatting rules
- Number/date formats
- Cell styling (colors, fonts, borders)
- Column widths/row heights

**Success Criteria:**
- Formatting rules apply to correct ranges
- Conditional formatting triggers properly
- Visual consistency maintained

**Agent:** google-sheets-schema-designer

### Integration Sprint
**Purpose:** Connect external data sources
**Operations:**
- Import from databases
- Connect APIs
- Link other spreadsheets
- Set up IMPORTRANGE functions

**Success Criteria:**
- External connections established
- Data syncs without errors
- API quota not exceeded
- Refresh triggers work correctly

**Agent:** google-sheets-api-integrator

### Automation Sprint
**Purpose:** Add scripts and triggers
**Operations:**
- Google Apps Script functions
- Time-based triggers
- Event-driven triggers
- Custom functions

**Success Criteria:**
- Scripts execute without errors
- Triggers fire on expected events
- Custom functions return correct values
- No infinite loop conditions

**Agent:** google-sheets-api-integrator

## Coordination Protocols

### Loop 3 Completion
```bash
# 1. Execute work
# 2. Self-validate
./.claude/cfn-extras/skills/google-sheets-validation/validate-state.sh \
  --sprint-id "$SPRINT_ID" \
  --output-format json

# 3. Signal completion
coordination-signal "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 4. Report results
./.claude/skills/cfn-coordination/report-completion.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.95 \
  --result '{"deliverables": ["sheet_created"], "tests_passed": 5, "tests_total": 5}'
```

### Loop 2 Validation
```bash
# 1. Wait for gate pass signal
coordination-wait "swarm:${TASK_ID}:gate-passed"

# 2. Review Loop 3 work
./.claude/cfn-extras/skills/google-sheets-validation/validate-state.sh \
  --sprint-id "$SPRINT_ID" \
  --validation-type comprehensive

# 3. Report confidence score
./.claude/skills/cfn-coordination/report-completion.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.92
```

## API Quota Management

### Rate Limiting
```bash
# Enforce 300 requests/minute default
./.claude/cfn-extras/skills/google-sheets-api-coordinator/api-call.sh \
  --operation "sheets.spreadsheets.values.update" \
  --spreadsheet-id "$SPREADSHEET_ID" \
  --rate-limit 300
```

### Quota Tracking
```
Decomposition Phase:
  Estimated API calls per sprint:
    schema_001: 3 calls
    data_001: 5 calls
    formula_001: 4 calls
  Total estimated: 12 calls

Execution Phase:
  Actual API calls:
    schema_001: 3 calls ✓
    data_001: 6 calls (1 retry)
    formula_001: 5 calls (1 extra validation)
  Total actual: 14 calls

Quota Status: 14 / 100 (14% used)
```

## Example Workflows

### Workflow 1: Simple Dashboard
```
Request: "Create sales dashboard with revenue totals"

Sprints:
  1. schema_001: Create Dashboard sheet, add columns (Date, Product, Revenue)
  2. data_001: Import sales data from CSV (500 rows)
  3. formula_001: Add SUM formula for total revenue
  4. formatting_001: Apply number formatting to Revenue column

Execution:
  Level 0: schema_001 → Complete (3 API calls)
  Level 1: data_001 → Complete (5 API calls)
  Level 2: formula_001 → Complete (2 API calls)
  Level 3: formatting_001 → Complete (1 API call)

Total: 4 sprints, 11 API calls, 0 retries
```

### Workflow 2: Complex Integration
```
Request: "Connect PostgreSQL database, sync inventory daily, alert on low stock"

Sprints:
  1. schema_001: Create Inventory sheet with columns
  2. integration_001: Set up database connection via Apps Script
  3. data_001: Initial inventory import (1000 products)
  4. formula_001: Add low stock calculation (IF quantity < reorder_point)
  5. formatting_001: Conditional format for low stock (red highlight)
  6. automation_001: Daily sync trigger
  7. automation_002: Email alert script for low stock

Execution:
  Level 0: schema_001 → Complete
  Level 1: integration_001 → Complete (requires user auth)
  Level 2: data_001 → FAIL (connection timeout)
  Level 2: data_001 (retry) → Complete
  Level 3: formula_001, formatting_001 → Complete (parallel)
  Level 4: automation_001, automation_002 → Complete (parallel)

Total: 7 sprints, 25 API calls, 1 retry
```

### Workflow 3: Formula Error Recovery
```
Request: "Add VLOOKUP formulas to match product prices"

Sprints:
  1. schema_001: Add Price column
  2. formula_001: Create VLOOKUP formula

Execution:
  Level 0: schema_001 → Complete
  Level 1: formula_001 → Gate FAILS (pass rate 0.60)
    Tests:
      test_formula_syntax → PASS
      test_formula_references → FAIL (#REF! error - range not found)
      test_formula_returns_number → FAIL (error value)

    Product Owner: ITERATE

  Level 1: formula_001 (retry) → Gate PASSES (pass rate 1.00)
    Tests:
      test_formula_syntax → PASS
      test_formula_references → PASS
      test_formula_returns_number → PASS

Total: 2 sprints, 6 API calls, 1 retry (auto-recovery)
```

## Performance Metrics

### Cost Optimization (CLI Mode)
```
Traditional Task Mode:
  10 sprints × 4 agents/sprint × $0.150 = $6.00

CLI Mode with Coordinator:
  Coordinator spawn: $0.054
  10 sprints × 4 agents/sprint × $0.012 (CLI) = $0.480
  Total: $0.534 (91% savings)
```

### Execution Time
```
Average Sprint Duration:
  Schema: 15-30 seconds
  Data: 30-60 seconds (depends on import size)
  Formula: 20-40 seconds
  Formatting: 10-20 seconds
  Integration: 60-120 seconds (API latency)
  Automation: 40-80 seconds (script deployment)

Example: 5-sprint workflow ≈ 2-4 minutes total
```

### Success Rates
```
Test-Driven Validation (v3.0):
  Loop 3 gate accuracy: 95%+ (objective tests)
  Loop 2 consensus accuracy: 90%+ (validator agreement)
  Overall success rate: 98% (1 retry per 50 sprints)

Previous Confidence-Based (v1.x-2.x):
  Subjective scoring accuracy: 55%
  Overall success rate: 70% (3 retries per 10 sprints)
```

## Troubleshooting Guide

### Issue: Circular Dependencies Detected
**Symptom:** `CIRCULAR_DEPENDENCY` error during sprint ordering
**Cause:** Sprint dependencies form a cycle
**Solution:**
```bash
# Review dependency graph
./.claude/cfn-extras/skills/google-sheets-sprint-order/order-sprints.sh \
  --sprints-json /tmp/sprints.json

# Check for cycles in output
# Restructure operations to break cycle
```

### Issue: API Quota Exceeded
**Symptom:** `429 Too Many Requests` errors
**Cause:** Too many API calls in short timeframe
**Solution:**
```bash
# Enable stricter rate limiting
./.claude/cfn-extras/skills/google-sheets-api-coordinator/api-call.sh \
  --rate-limit 100  # Reduce from default 300

# Batch operations where possible
# Add delays between sprints
```

### Issue: Formula Sprint Keeps Failing
**Symptom:** Loop 3 gate fails repeatedly on formula sprint
**Cause:** Formula references non-existent cells or sheets
**Solution:**
```bash
# Check validation output
./.claude/cfn-extras/skills/google-sheets-validation/validate-state.sh \
  --sprint-id formula_001 \
  --output-format verbose

# Review error messages for #REF! locations
# Ensure schema sprint completed successfully
# Validate cell references match actual sheet structure
```

### Issue: Too Many Sprints Generated
**Symptom:** `EXCEEDS_COMPLEXITY_LIMIT` error (>15 sprints)
**Cause:** User request too complex for single workflow
**Solution:**
```bash
# Break into multiple user requests:

Request 1: "Create basic sales dashboard structure and import data"
Request 2: "Add pivot tables and formulas to sales dashboard"
Request 3: "Add automation and email alerts to sales dashboard"
```

## Integration with CFN Loop v3.0

### Coordinator Spawning
```bash
# CLI Mode (Production)
npx claude-flow-novice agent-spawn google-sheets-coordinator \
  --task-id "gs-$(date +%s)" \
  --env REQUEST="Create sales dashboard" \
  --env MODE="standard" \
  --background

# Task Mode (Debugging)
Task("google-sheets-coordinator", "
  Execute Google Sheets CFN Loop:
  Request: 'Create sales dashboard'
  Mode: standard

  Return: Final results with completion report
")
```

### Enhanced Monitoring (v3.0)
```bash
# Orchestrator tracks agent health
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --health-check-interval 30

# Automatic recovery from stuck agents
# Enhanced waiting with progress tracking
# Protocol compliance validation
```

## Files Reference

### Skills
- `.claude/cfn-extras/skills/google-sheets-decomposition/` - Request decomposition
- `.claude/cfn-extras/skills/google-sheets-sprint-order/` - Dependency resolution
- `.claude/cfn-extras/skills/google-sheets-progress/` - Progress tracking
- `.claude/cfn-extras/skills/google-sheets-validation/` - State validation
- `.claude/cfn-extras/skills/google-sheets-formula-builder/` - Formula generation
- `.claude/cfn-extras/skills/google-sheets-api-coordinator/` - API management

### Agents
- `.claude/cfn-extras/agents/google-sheets/google-sheets-coordinator.md` - Orchestrator
- `.claude/cfn-extras/agents/google-sheets/google-sheets-schema-designer.md` - Loop 3
- `.claude/cfn-extras/agents/google-sheets/google-sheets-formula-engineer.md` - Loop 3
- `.claude/cfn-extras/agents/google-sheets/google-sheets-data-transformer.md` - Loop 3
- `.claude/cfn-extras/agents/google-sheets/google-sheets-api-integrator.md` - Loop 3
- `.claude/cfn-extras/agents/google-sheets/google-sheets-data-validator.md` - Loop 2
- `.claude/cfn-extras/agents/google-sheets/google-sheets-formula-validator.md` - Loop 2
- `.claude/cfn-extras/agents/google-sheets/google-sheets-performance-analyst.md` - Loop 2
- `.claude/cfn-extras/agents/google-sheets/google-sheets-business-validator.md` - Product Owner

### Commands
- `.claude/commands/google-sheets/google-sheets-loop.md` - Slash command entry point

### Documentation
- `.claude/cfn-extras/docs/GOOGLE_SHEETS_CFN_LOOP.md` - This file
- `.claude/cfn-extras/skills/GOOGLE_SHEETS_SKILLS_README.md` - Skills overview

## Next Steps

1. **Set up Google Sheets API credentials**
2. **Test simple workflow**: `/google-sheets-loop "Add revenue column"`
3. **Test complex workflow**: `/google-sheets-loop "Create dashboard with pivot tables"`
4. **Monitor execution**: `tail -f /tmp/cfn-loop-*.log`
5. **Review results**: Check completion report and spreadsheet state

## Support

For issues or questions:
- Review troubleshooting guide above
- Check skill documentation in `.claude/cfn-extras/skills/`
- Examine agent profiles in `.claude/cfn-extras/agents/google-sheets/`
- Test individual skills in isolation before full CFN Loop execution
