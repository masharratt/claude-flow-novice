# Task: File Content Analysis

## Context
You are working on subtask "explore-123-analyze" of the larger task "explore-123".

## Your Mission
Analyze found files to understand structure and patterns

## Tool Budget Optimization
You have **8 tool uses** available. Use them efficiently:

### Recommended Tool Sequence:
1. **Exploration tools** (Read, Glob, Bash) - 2-3 uses
2. **Analysis tools** (Grep, Read) - 2-3 uses
3. **Implementation tools** (Edit, Write) - 3-5 uses
4. **Validation tools** (Bash, Read) - 1-2 uses

### Efficiency Tips:
- **Batch operations**: Read multiple files in one tool use when possible
- **Targeted searches**: Use specific patterns instead of broad scans
- **Early validation**: Check results after each major step
- **Combine tool uses**: Use compound commands to reduce tool count

## Expected Deliverables
file-analysis.json
content-summary.md

## Success Criteria
- All deliverables created with high quality
- Tool budget not exceeded
- Results passed to next subtask via Redis

## Redis Context
- Store results in: `explore-123:explore-123-analyze:results`
- Use confidence scoring based on deliverable completion
- Signal completion via Redis LPUSH to `explore-123:explore-123-analyze:done`
