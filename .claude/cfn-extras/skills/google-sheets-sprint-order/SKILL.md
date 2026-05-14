# Google Sheets Sprint Ordering

## Overview
Resolves sprint dependencies and generates optimal execution order using topological sorting to ensure micro-sprints execute in the correct sequence.

## Purpose
Prevents execution failures by ensuring prerequisite sprints complete before dependent sprints begin. Creates a directed acyclic graph (DAG) of sprint dependencies.

## Dependency Rules

### Sprint Type Dependencies

| Sprint Type | Depends On | Reason |
|-------------|------------|--------|
| Schema | None | Foundation sprint |
| Data | Schema | Requires defined columns/structure |
| Formula | Schema, Data | Requires columns and populated data |
| Formatting | Data | Requires data to format |
| Integration | Schema | Requires defined structure for external data |
| Automation | All | Scripts reference all previous work |

### Custom Dependencies
In addition to type-based dependencies, specific sprints may have explicit dependencies based on operation content:
- Formula referencing imported data → depends on Integration sprint
- Conditional formatting based on formula → depends on Formula sprint
- Script accessing specific sheet → depends on Schema sprint creating that sheet

## Ordering Algorithm

### Input
Sprints JSON from decomposition skill:
```json
{
  "sprints": [
    {
      "sprint_id": "schema_001",
      "sprint_type": "schema",
      "dependencies": []
    },
    {
      "sprint_id": "data_001",
      "sprint_type": "data",
      "dependencies": ["schema"]
    }
  ]
}
```

### Process
1. **Build Dependency Graph:** Create adjacency list of sprint dependencies
2. **Detect Cycles:** Ensure no circular dependencies exist
3. **Topological Sort:** Order sprints using Kahn's algorithm
4. **Identify Parallelizable Sprints:** Find sprints at same level (can run in parallel)
5. **Generate Execution Plan:** Output ordered list with parallelization hints

### Output
```json
{
  "execution_order": [
    {
      "level": 0,
      "parallel_group": [
        {
          "sprint_id": "schema_001",
          "sprint_type": "schema",
          "can_parallelize": false
        }
      ]
    },
    {
      "level": 1,
      "parallel_group": [
        {
          "sprint_id": "data_001",
          "sprint_type": "data",
          "can_parallelize": false
        },
        {
          "sprint_id": "integration_001",
          "sprint_type": "integration",
          "can_parallelize": true
        }
      ]
    }
  ],
  "total_levels": 4,
  "critical_path_length": 6,
  "parallelization_opportunities": 2
}
```

## Usage

### CLI
```bash
./.claude/cfn-extras/skills/google-sheets-sprint-order/order-sprints.sh \
  --sprints-json /tmp/google-sheets-sprints.json \
  --output /tmp/execution-plan.json
```

### From Coordinator
```bash
# Generate execution plan
EXEC_PLAN=$(bash ./.claude/cfn-extras/skills/google-sheets-sprint-order/order-sprints.sh \
  --sprints-json "$SPRINTS_JSON_PATH")

# Extract level count
LEVELS=$(echo "$EXEC_PLAN" | jq -r '.total_levels')

# Execute level by level
for level in $(seq 0 $((LEVELS - 1))); do
  PARALLEL_GROUP=$(echo "$EXEC_PLAN" | jq -r ".execution_order[$level].parallel_group")

  # Spawn sprints in this level (can parallelize if multiple)
  # ...
done
```

## Cycle Detection

### Valid DAG
```
schema_001 → data_001 → formula_001 → automation_001
           ↘ integration_001 ↗
```

### Invalid (Circular Dependency)
```
formula_001 → automation_001 → data_001 → formula_001
```

**Error Output:**
```json
{
  "error": "CIRCULAR_DEPENDENCY",
  "message": "Cycle detected in sprint dependencies",
  "cycle_path": ["formula_001", "automation_001", "data_001", "formula_001"],
  "suggestion": "Remove dependency or restructure operations"
}
```

## Parallelization Strategy

### Safe to Parallelize
Sprints at the same dependency level with:
- Different target sheets
- No shared named ranges
- Different data sources
- Independent formulas

### Not Safe to Parallelize
Sprints that:
- Write to same sheet
- Reference same cells
- Modify shared named ranges
- Have API quota concerns (serialize to stay under limit)

## Critical Path Analysis

**Critical Path:** Longest sequence of dependent sprints
**Importance:** Determines minimum execution time

**Example:**
```
Sprint Sequence: schema_001 → data_001 → formula_001 → formula_002 → automation_001
Critical Path Length: 5 sprints
Estimated Time: 5 * avg_sprint_duration
```

**Optimization Opportunities:**
- Parallelize non-critical sprints
- Batch operations within sprints
- Use bulk API calls where possible

## Integration with CFN Loop

### Coordinator Workflow
```bash
# 1. Get decomposed sprints
SPRINTS_JSON=$(decompose.sh --request "$USER_REQUEST")

# 2. Generate execution plan
EXEC_PLAN=$(order-sprints.sh --sprints-json <(echo "$SPRINTS_JSON"))

# 3. Execute by level
LEVELS=$(echo "$EXEC_PLAN" | jq -r '.total_levels')

for level in $(seq 0 $((LEVELS - 1))); do
  echo "Executing level $level..."

  # Get sprints at this level
  SPRINT_IDS=$(echo "$EXEC_PLAN" | jq -r ".execution_order[$level].parallel_group[].sprint_id")

  # Execute sprints (parallel if multiple)
  for sprint_id in $SPRINT_IDS; do
    # Spawn CFN Loop for this sprint
    ./.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh \
      --task-id "$TASK_ID" \
      --sprint "$sprint_id" \
      --mode standard &
  done

  # Wait for level completion
  wait
done
```

## Validation Rules

### Pre-Execution
- No circular dependencies
- All referenced dependencies exist
- Dependency types are valid (e.g., Data can't depend on Automation)

### Post-Ordering
- All sprints appear exactly once in execution order
- Sprint count matches input
- Levels are sequential (0, 1, 2, ...)
- Dependencies satisfied (dependent sprint appears after prerequisite)

## Error Handling

### Missing Dependency
```json
{
  "error": "MISSING_DEPENDENCY",
  "message": "Sprint 'formula_001' depends on 'data_002' which does not exist",
  "sprint_id": "formula_001",
  "missing_dependency": "data_002"
}
```

### Invalid Dependency Type
```json
{
  "error": "INVALID_DEPENDENCY",
  "message": "Schema sprint cannot depend on Automation sprint (reverse dependency)",
  "sprint_id": "schema_002",
  "invalid_dependency": "automation_001"
}
```

## Testing

Test script: `./.claude/cfn-extras/skills/google-sheets-sprint-order/test-ordering.sh`

**Test Cases:**
1. Simple linear dependency chain
2. Multiple parallel sprints at same level
3. Complex DAG with multiple paths
4. Circular dependency detection
5. Missing dependency handling
6. Critical path calculation

**Expected Pass Rate:** ≥0.95 (Standard mode)

## Performance

### Time Complexity
- Cycle Detection: O(V + E) where V = sprints, E = dependencies
- Topological Sort: O(V + E)
- Overall: O(V + E)

### Space Complexity
- Adjacency List: O(V + E)
- Visit Tracking: O(V)
- Overall: O(V + E)

### Scalability
- Tested with up to 50 sprints
- Sub-second execution for typical workloads (5-15 sprints)
- Scales linearly with sprint count

## References
- Kahn's Algorithm: https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
- DAG Validation: `./.claude/cfn-extras/docs/DEPENDENCY_VALIDATION.md`
- CFN Loop Integration: `CLAUDE.md` Section 4
