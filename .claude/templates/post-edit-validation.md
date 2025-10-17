# Post-Edit Validation Template

## Validation Lifecycle

### Stages
1. Pre-Validation: Static analysis
2. Edit Validation: Immediate checks
3. Post-Validation: Comprehensive review
4. Feedback Generation: Actionable insights

## Validation Criteria

### 1. Code Quality
- Static analysis
- Style consistency
- Complexity metrics
- Best practice adherence

### 2. Security
- Vulnerability checks
- Input validation
- Authentication integrity
- Exposure risk detection

### 3. Performance
- Time complexity analysis
- Memory usage tracking
- Resource allocation
- Bottleneck identification

### 4. Test Coverage
- Unit test completeness
- Integration test validation
- Edge case handling
- Mutation testing

## Feedback Types

### Priority Levels
1. **High Priority**
   - `ROOT_WARNING`: File misplacement
   - `TDD_VIOLATION`: Missing tests
   - `SECURITY_RISK`: Vulnerability detected

2. **Medium Priority**
   - `LOW_COVERAGE`: Insufficient tests
   - `PERFORMANCE_ISSUE`: Optimization needed
   - `COMPLEXITY_WARNING`: Over-complexity

3. **Low Priority**
   - `LINT_ISSUE`: Style/formatting
   - `DOCUMENTATION_GAPS`: Missing comments
   - `BEST_PRACTICE_DEVIATION`: Minor improvements

## Validation Hook Pattern

```bash
#!/bin/bash
# Post-Edit Validation Hook

# Run comprehensive checks
validation_report=$(jq -n '{
    "status": "validated",
    "issues": {
        "high_priority": [],
        "medium_priority": [],
        "low_priority": []
    },
    "metrics": {
        "test_coverage": 0,
        "security_score": 0,
        "complexity_score": 0
    }
}')

# Publish to Redis
redis-cli lpush "agent:feedback:post-edit" "$validation_report"
```

## Confidence Scoring

### Scoring Mechanism
- Base Score: 1.0
- Deduct points by issue priority
  * High Priority: -0.3
  * Medium Priority: -0.1
  * Low Priority: -0.02

## Recommended Actions

### High Priority
- STOP progression
- Fix critical issues immediately
- Revalidate after fixes

### Medium Priority
- Address before merge
- Create improvement tickets
- Incremental refactoring

### Low Priority
- Optional enhancements
- Add to technical debt backlog
- Consider in next iteration

## Integration Patterns
- Silent execution
- Automatic feedback generation
- Redis-based communication
- SQLite persistence

## Quick Reference

```bash
# Run post-edit validation
node config/hooks/post-edit-pipeline.js [FILE] \
  --memory-key "swarm/validation/[agent]"
```

**Last Updated**: 2025-10-17
**Status**: Production-ready