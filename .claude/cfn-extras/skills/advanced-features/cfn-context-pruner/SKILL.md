# Context Pruner Skill

**Version:** 1.0.0
**Purpose:** Hierarchical context summarization for CFN Loop v3 iterations

## Overview

Reduces context size across iterations by:
- Keeping current iteration in full detail
- Summarizing previous iterations
- Extracting key themes from feedback
- Maintaining deliverable tracking

## Goal

Reduce context from 120 KB (iteration 10) to 15 KB (88% reduction)

## Usage

```bash
PRUNED_CONTEXT=$(./.claude/skills/context-pruner/prune-context.sh \
  --iteration 3 \
  --full-history "$FULL_HISTORY" \
  --current-context "$CURRENT_CONTEXT")

echo "$PRUNED_CONTEXT"
```

## Pruning Strategy

### Iteration 1
- Full detail (no pruning)
- Context size: ~5 KB

### Iteration 2
- Iteration 1: Summary only
- Iteration 2: Full detail
- Context size: ~8 KB

### Iteration 3+
- Iterations 1-(N-1): Summary with key themes
- Iteration N: Full detail
- Context size: ~10-15 KB (stable)

## Summary Format

```
Iterations 1-2 Summary:
- Initial confidence: 0.72
- Key feedback themes:
  * Add error handling
  * Improve test coverage
  * Address security concerns
- Final confidence: 0.82
- Progress: +0.10
```

## Key Themes Extraction

Analyze all feedback across iterations to extract recurring themes:

```bash
# Count feedback occurrences
"Add error handling" - 3 times (iterations 1, 2, 3)
"Improve test coverage" - 2 times (iterations 1, 2)
"Security concerns" - 2 times (iterations 2, 3)

# Output top 5 themes
```

## Integration

Used by:
- Main Chat loop orchestration
- Coordinator for iteration context building