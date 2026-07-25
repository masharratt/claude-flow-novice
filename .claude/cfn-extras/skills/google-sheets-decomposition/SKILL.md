# Google Sheets Request Decomposition

## Overview
Analyzes complex Google Sheets requests and decomposes them into atomic micro-sprints with clear dependencies and success criteria.

## Purpose
Prevents "doing too much at once" by breaking complex spreadsheet operations into progressive, testable units that build toward the end goal.

## Sprint Types

### 1. Schema Sprint
**Purpose:** Establish spreadsheet structure
**Operations:**
- Create/rename sheets
- Add/remove columns
- Define data types
- Set up named ranges

**Dependencies:** None (foundation sprint)
**Max Operations:** 5 per sprint
**Success Criteria:**
- All sheets exist with expected names
- Column headers match specification
- Named ranges defined correctly

### 2. Data Sprint
**Purpose:** Populate or transform spreadsheet data
**Operations:**
- Import data from external sources
- Transform existing data
- Merge/split columns
- Clean/normalize values

**Dependencies:** Schema Sprint
**Max Operations:** 5 per sprint
**Success Criteria:**
- Data imported without errors
- Transformations produce expected output
- No data loss or corruption
- Row counts match expectations

### 3. Formula Sprint
**Purpose:** Add calculated columns and validation rules
**Operations:**
- Create formulas (simple to complex)
- Add data validation rules
- Implement conditional logic
- Set up array formulas

**Dependencies:** Schema Sprint, Data Sprint
**Max Operations:** 5 per sprint
**Success Criteria:**
- All formulas return expected types
- No #REF!, #VALUE!, #N/A errors
- Validation rules enforce constraints
- Array formulas expand correctly

### 4. Formatting Sprint
**Purpose:** Apply visual formatting and conditional styles
**Operations:**
- Conditional formatting rules
- Number/date formats
- Cell styling (colors, fonts, borders)
- Column widths/row heights

**Dependencies:** Data Sprint
**Max Operations:** 5 per sprint
**Success Criteria:**
- Formatting rules apply to correct ranges
- Conditional formatting triggers properly
- Visual consistency maintained

### 5. Integration Sprint
**Purpose:** Connect external data sources or services
**Operations:**
- Import from databases
- Connect APIs
- Link other spreadsheets
- Set up IMPORTRANGE functions

**Dependencies:** Schema Sprint
**Max Operations:** 3 per sprint (API quota considerations)
**Success Criteria:**
- External connections established
- Data syncs without errors
- API quota not exceeded
- Refresh triggers work correctly

### 6. Automation Sprint
**Purpose:** Add scripts, triggers, and automations
**Operations:**
- Google Apps Script functions
- Time-based triggers
- Event-driven triggers
- Custom functions

**Dependencies:** All previous sprint types
**Max Operations:** 3 per sprint (complexity considerations)
**Success Criteria:**
- Scripts execute without errors
- Triggers fire on expected events
- Custom functions return correct values
- No infinite loop conditions

## Decomposition Algorithm

### Input
- User request (natural language or structured)
- Current spreadsheet state (optional)
- Business requirements

### Process
1. **Parse Request:** Extract operations and goals
2. **Classify Operations:** Map to sprint types
3. **Determine Dependencies:** Build directed acyclic graph (DAG)
4. **Group Operations:** Batch into sprints (max 5 ops/sprint)
5. **Order Sprints:** Topological sort based on dependencies
6. **Generate Success Criteria:** Define testable conditions for each sprint

### Output
JSON structure:
```json
{
  "request_summary": "...",
  "total_sprints": 5,
  "sprints": [
    {
      "sprint_id": "schema_001",
      "sprint_type": "schema",
      "operations": [
        "Create sheet 'Sales Data'",
        "Add columns: Date, Product, Quantity, Revenue",
        "Define named range 'SalesTable'"
      ],
      "dependencies": [],
      "success_criteria": [
        "Sheet 'Sales Data' exists",
        "Columns match: Date, Product, Quantity, Revenue",
        "Named range 'SalesTable' covers A1:D1000"
      ],
      "estimated_api_calls": 3
    },
    {
      "sprint_id": "data_001",
      "sprint_type": "data",
      "operations": [
        "Import CSV from Google Drive",
        "Parse dates to standard format",
        "Validate quantity > 0"
      ],
      "dependencies": ["schema_001"],
      "success_criteria": [
        "All rows imported (expect ~500 rows)",
        "Date column format: YYYY-MM-DD",
        "No negative quantities",
        "No import errors"
      ],
      "estimated_api_calls": 2
    }
  ]
}
```

## Usage

### CLI
```bash
./.claude/cfn-extras/skills/google-sheets-decomposition/decompose.sh \
  --request "Create sales dashboard with pivot tables" \
  --mode standard \
  --output /tmp/google-sheets-sprints.json
```

### From Agent
```bash
# Generate decomposition
DECOMPOSITION=$(bash ./.claude/cfn-extras/skills/google-sheets-decomposition/decompose.sh \
  --request "$USER_REQUEST" \
  --mode standard)

# Parse output
TOTAL_SPRINTS=$(echo "$DECOMPOSITION" | jq -r '.total_sprints')
```

## Validation Rules

### Per Sprint
- Maximum 5 operations (3 for Integration/Automation)
- Clear success criteria (2-5 testable conditions)
- Explicit dependencies declared
- Estimated API calls < 10 per sprint

### Across All Sprints
- No circular dependencies
- Schema sprints before Data sprints
- Formula sprints after Data sprints
- Automation sprints last
- Total estimated API calls < 100 (quota management)

## Error Handling

### Invalid Request
```json
{
  "error": "INVALID_REQUEST",
  "message": "Request too vague: 'make it better'",
  "suggestion": "Specify concrete operations (e.g., 'add revenue column', 'create pivot table')"
}
```

### Too Complex
```json
{
  "error": "EXCEEDS_COMPLEXITY_LIMIT",
  "message": "Request requires 25 sprints, maximum is 15",
  "suggestion": "Break into multiple user requests or simplify scope"
}
```

### Missing Dependencies
```json
{
  "error": "CIRCULAR_DEPENDENCY",
  "message": "Formula sprint depends on Automation sprint which depends on Formula sprint",
  "sprints_affected": ["formula_003", "automation_001"]
}
```

## Integration with CFN Loop

### Coordinator Usage
```bash
# 1. Decompose request
SPRINTS_JSON=$(decompose.sh --request "$USER_REQUEST" --mode standard)

# 2. Extract sprint count
TOTAL_SPRINTS=$(echo "$SPRINTS_JSON" | jq -r '.total_sprints')

# 3. Execute sprints sequentially
for i in $(seq 0 $((TOTAL_SPRINTS - 1))); do
  SPRINT=$(echo "$SPRINTS_JSON" | jq -r ".sprints[$i]")
  SPRINT_ID=$(echo "$SPRINT" | jq -r '.sprint_id')

  # Execute CFN Loop for this micro-sprint
  ./.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh \
    --task-id "$TASK_ID" \
    --sprint "$SPRINT" \
    --mode standard
done
```

## Testing

Test script: `./.claude/cfn-extras/skills/google-sheets-decomposition/test-decomposition.sh`

**Test Cases:**
1. Simple request (1 sprint)
2. Multi-sprint with dependencies
3. Complex request (10+ sprints)
4. Invalid request handling
5. Circular dependency detection
6. API quota estimation

**Expected Pass Rate:** ≥0.95 (Standard mode)

## References
- Google Sheets API Quotas: https://developers.google.com/sheets/api/limits
- Sprint Types Documentation: `./.claude/cfn-extras/docs/GOOGLE_SHEETS_SPRINTS.md`
- CFN Loop Integration: `CLAUDE.md` Section 4
