---
description: Execute Google Sheets CFN Loop with micro-sprint decomposition and progressive goal achievement
tags: [cfn-loop, google-sheets, micro-sprints, progressive-execution]
version: 1.0.0
---

# Google Sheets CFN Loop

Execute CFN Loop optimized for Google Sheets operations with automatic micro-sprint decomposition and progressive goal achievement.

## Usage

```bash
/google-sheets-loop "<request description>" [--mode=mvp|standard|enterprise] [--spreadsheet-id=<id>]
```

## Parameters

- `<request description>` (required): Natural language description of Google Sheets task
- `--mode`: Execution mode (default: standard)
  - `mvp`: Quick iteration (≥0.70 gate, ≥0.80 consensus)
  - `standard`: Production quality (≥0.95 gate, ≥0.90 consensus)
  - `enterprise`: Maximum quality (≥0.98 gate, ≥0.95 consensus)
- `--spreadsheet-id`: Google Sheets ID (optional, extracted from context if available)

## How It Works

### Phase 1: Request Decomposition
Coordinator spawns google-sheets-decomposition skill to break complex request into atomic micro-sprints:

**Sprint Types:**
- Schema Sprint: Create/modify sheet structure
- Data Sprint: Import/transform data
- Formula Sprint: Add calculations and validation
- Formatting Sprint: Apply styles and conditional formatting
- Integration Sprint: Connect external data sources
- Automation Sprint: Add scripts and triggers

**Output:** JSON with sprints, dependencies, success criteria

### Phase 2: Dependency Resolution
Coordinator spawns google-sheets-sprint-order skill to generate execution plan:

**Process:**
- Build dependency graph (DAG)
- Detect circular dependencies
- Topological sort (Kahn's algorithm)
- Identify parallelization opportunities

**Output:** Execution plan with ordered levels

### Phase 3: Micro-Sprint Execution
For each sprint level (sequential):

**Loop 3 (Implementers):**
- google-sheets-schema-designer (if schema sprint)
- google-sheets-formula-engineer (if formula sprint)
- google-sheets-data-transformer (if data sprint)
- google-sheets-api-integrator (if integration sprint)

Agents execute operations and self-validate using google-sheets-validation skill.

**Loop 3 Gate Check (Test-Driven):**
- Execute validation tests
- Calculate pass rate
- IF pass rate < threshold → ITERATE (wake Loop 3 for retry)
- IF pass rate ≥ threshold → PROCEED (signal Loop 2 to start)

**Loop 2 (Validators):**
Wait for gate pass signal, then review Loop 3 work:
- google-sheets-data-validator (check data integrity)
- google-sheets-formula-validator (validate formulas)
- google-sheets-performance-analyst (review quota usage)

Report consensus scores (0.0-1.0).

**Product Owner Decision:**
Orchestrator spawns google-sheets-business-validator to make final decision:
- PROCEED → Move to next sprint
- ITERATE → Retry current sprint
- ABORT → Exit with error

**Progress Tracking:**
After each sprint, update progress state using google-sheets-progress skill.

### Phase 4: Completion
After all sprints complete:
- Final validation across entire spreadsheet
- Generate completion report
- Return results to user

## Example Requests

### Simple Request (1-2 sprints)
```bash
/google-sheets-loop "Add a revenue column that calculates quantity * price"
```

**Decomposition:**
- Sprint 1 (schema): Add 'Revenue' column
- Sprint 2 (formula): Create formula `=C2*D2` for all rows

### Complex Request (5+ sprints)
```bash
/google-sheets-loop "Create sales dashboard with pivot tables, conditional formatting, and automated email alerts" --mode=standard
```

**Decomposition:**
- Sprint 1 (schema): Create Dashboard sheet, define named ranges
- Sprint 2 (data): Import sales data from CSV
- Sprint 3 (formula): Create pivot table formulas
- Sprint 4 (formatting): Apply conditional formatting rules
- Sprint 5 (automation): Add email trigger script

### Integration Request
```bash
/google-sheets-loop "Connect to PostgreSQL database and sync product inventory daily" --mode=enterprise
```

**Decomposition:**
- Sprint 1 (schema): Create Inventory sheet with columns
- Sprint 2 (integration): Set up database connection via Apps Script
- Sprint 3 (data): Initial data import
- Sprint 4 (automation): Add daily sync trigger

## Mode Comparison

| Mode | Loop 3 Gate | Loop 2 Consensus | Max Iterations | Validators | Use Case |
|------|-------------|------------------|----------------|------------|----------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 | Quick prototyping |
| Standard | ≥0.95 | ≥0.90 | 10 | 3 | Production spreadsheets |
| Enterprise | ≥0.98 | ≥0.95 | 15 | 5-7 | Mission-critical data |

## Success Criteria

### Per Sprint
- All operations completed without errors
- Validation tests pass at required rate
- API quota not exceeded
- Data integrity maintained

### Overall
- All sprints completed successfully
- Final validation passes
- Business requirements met
- No formula errors (#REF!, #VALUE!, etc.)

## Anti-Patterns Prevented

### "Doing Too Much at Once"
✓ Automatic decomposition into max 5 operations per sprint
✓ Sequential sprint execution with clear dependencies
✓ Progressive validation prevents error accumulation

### "Consensus on Vapor"
✓ Test-driven gate checks (≥0.95 pass rate)
✓ Explicit success criteria per sprint
✓ Validators review actual spreadsheet state (not just code)

### API Quota Exhaustion
✓ API coordinator skill enforces rate limits
✓ Estimated API calls tracked during decomposition
✓ Warning if total calls exceed 100

## Execution Pattern

**CLI Mode (Production - Default):**
```bash
# Main Chat spawns coordinator
npx claude-flow-novice agent-spawn google-sheets-coordinator \
  --task-id "gs-$(date +%s)" \
  --env REQUEST="$USER_REQUEST" \
  --env MODE="standard"

# Coordinator orchestrates micro-sprints via CLI
# (95-98% cost savings vs Task mode)
```

**Task Mode (Debugging):**
```bash
# Main Chat spawns agents directly via Task() tool
# Full visibility, higher cost
# Use for learning or troubleshooting
```

## Required Environment

```bash
# Google Sheets API credentials
export GOOGLE_SHEETS_API_KEY="[REDACTED]"
export GOOGLE_SHEETS_CLIENT_ID="[REDACTED]"
export GOOGLE_SHEETS_CLIENT_SECRET="[REDACTED]"

# CFN Loop configuration
export CFN_MODE="standard"
export CFN_MAX_ITERATIONS="10"
```

## Troubleshooting

### Issue: "Sprints not executing in order"
**Solution:** Check dependency resolution in sprint order skill. Ensure DAG is valid (no cycles).

### Issue: "API quota exceeded"
**Solution:** Enable API coordinator rate limiting. Reduce operations per sprint. Use batch API calls.

### Issue: "Formulas show #REF! errors"
**Solution:** Validate cell references before applying. Ensure schema sprint completed successfully.

### Issue: "Too many sprints generated (>15)"
**Solution:** Request too complex. Break into multiple user requests or simplify scope.

## Integration with Other Skills

- **cfn-loop-orchestration**: Sprint-level Loop 3/Loop 2 execution
- **cfn-coordination**: Agent signaling and consensus collection
- **cfn-product-owner-decision**: PROCEED/ITERATE/ABORT decisions

## References

- Google Sheets API Limits: https://developers.google.com/sheets/api/limits
- CFN Loop Documentation: `CLAUDE.md` Section 4
- Micro-Sprint Guide: `.claude/cfn-extras/docs/GOOGLE_SHEETS_SPRINTS.md`
- Skills Overview: `.claude/cfn-extras/skills/GOOGLE_SHEETS_SKILLS_README.md`
- Agent Profiles: `.claude/cfn-extras/agents/google-sheets/`

---

## Execution Instructions for Main Chat

When user invokes `/google-sheets-loop "request" --mode=standard`:

### Step 1: Parse Arguments
```bash
REQUEST="<user request>"
MODE="${MODE:-standard}"  # default to standard
SPREADSHEET_ID="${SPREADSHEET_ID:-}"
```

### Step 2: Generate Task ID
```bash
TASK_ID="google-sheets-$(date +%s)-$$"
```

### Step 3: Spawn Coordinator (CLI Mode)
```bash
npx claude-flow-novice agent-spawn google-sheets-coordinator \
  --task-id "$TASK_ID" \
  --env REQUEST="$REQUEST" \
  --env MODE="$MODE" \
  --env SPREADSHEET_ID="$SPREADSHEET_ID" \
  --background

echo "Google Sheets CFN Loop started (Task ID: $TASK_ID)"
echo "Coordinator will decompose request into micro-sprints and execute progressively."
echo "Monitor progress: tail -f /tmp/cfn-loop-$TASK_ID.log"
```

### Step 4: Inform User
```
Google Sheets CFN Loop executing in CLI mode (cost-optimized).

Task ID: google-sheets-1234567890-12345
Mode: standard
Request: "Create sales dashboard with pivot tables"

The coordinator will:
1. Decompose request into micro-sprints
2. Resolve dependencies and create execution plan
3. Execute sprints sequentially (schema → data → formula → formatting → automation)
4. Validate each sprint before proceeding
5. Track progress and return final results

Monitor: tail -f /tmp/cfn-loop-google-sheets-1234567890-12345.log
```

## Alternative: Task Mode Execution

If user requests debugging or full visibility:

```bash
/google-sheets-loop "request" --mode=standard --spawn-mode=task
```

Main Chat spawns all agents directly via Task() tool:
1. Task("google-sheets-coordinator", "Decompose and orchestrate...")
2. Coordinator returns execution plan
3. Main Chat spawns Loop 3/Loop 2 agents via Task()
4. Full conversation visibility (higher cost, better for learning)
