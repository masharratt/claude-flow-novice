# Product Owner Backlog Integration

**Version:** 1.0.0
**Last Updated:** 2025-11-04
**Component:** `.claude/skills/cfn-product-owner-decision/execute-decision.sh`

## Overview

Automatic extraction and backlog addition of deferred items from Product Owner decisions during CFN Loop execution.

## Purpose

When Product Owner makes strategic decisions, deferred/out-of-scope items are automatically captured in `readme/BACKLOG.md` for future sprint planning. Prevents loss of valuable scope reduction insights.

## How It Works

### 1. Detection Phase

Product Owner output is scanned for deferred item sections:
- "Out of Scope"
- "Deferred"
- "Future Work"
- "Defer:"

### 2. Extraction Phase

Items are parsed from bullet lists:
- Lines starting with `-`, `*`, or `•`
- Minimum length: 10 characters
- Section headers filtered out

### 3. Backlog Addition

Each item added via `cfn-backlog-management` skill:

```bash
.claude/skills/cfn-backlog-management/add-backlog-item.sh \
  --item "Deferred feature description" \
  --why "Deferred during Product Owner decision (Task: X, Iteration: Y)" \
  --solution "To be determined during sprint planning" \
  --priority "P2" \
  --category "Technical-Debt" \
  --sprint "Sprint-Backlog-N" \
  --force
```

### 4. Metadata Storage

Backlog metadata stored in Redis:

```bash
redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "backlog_items_added" "$COUNT"
```

## Product Owner Output Format

**Recommended format for deferred items:**

```markdown
Decision: PROCEED
Reasoning: Core features complete, advanced features deferred.

Out of Scope (Deferred to Future Sprints):
- Multi-factor authentication support
- OAuth2 integration with third-party providers
- Advanced session management with Redis
- Audit logging for authentication events

These items were deferred because:
- MFA requires additional security infrastructure
- OAuth2 has external dependencies not yet available

Confidence: 0.92
```

**Supported section headers:**
- "Out of Scope"
- "Out of Scope (Deferred to Future Sprints)"
- "Deferred"
- "Deferred Items"
- "Future Work"
- "Defer:"

## Error Handling

**Non-blocking failures:**
- Backlog skill failures logged as warnings
- Decision execution continues regardless
- Prevents decision pipeline blocking on backlog errors

**Example:**
```bash
set +e  # Disable exit-on-error
add-backlog-item.sh ... || echo "Warning: Backlog update failed"
set -e  # Re-enable exit-on-error
```

## Redis Metadata

**Key:** `swarm:${TASK_ID}:${AGENT_ID}:result`

**Fields:**
- `backlog_items_added`: Count of successfully added items

**Example:**
```bash
redis-cli HGET "swarm:task-123:product-owner:result" "backlog_items_added"
# Output: 4
```

## Backlog File Location

**Path:** `readme/BACKLOG.md`

**Structure:**
```markdown
# Claude Flow Novice - Backlog

Last Updated: 2025-11-04

## Active Items

### P2 - Medium Priority

**[P2] - Multi-factor authentication support**
- **Sprint Backlogged**: Sprint-Backlog-1
- **Category**: Technical-Debt
- **Description**: Multi-factor authentication support
- **Rationale**: Deferred during Product Owner decision (Task: X, Iteration: 1)
- **Proposed Solution**: To be determined during sprint planning
- **Status**: Backlogged
- **Date Added**: 2025-11-04
```

## Testing

**Test script:** `tests/test-product-owner-backlog-integration.sh`

**Validates:**
- Deferred section extraction
- Item parsing and filtering
- Backlog skill invocation
- Integration in execute-decision.sh
- Defensive error handling
- Redis metadata storage

**Run test:**
```bash
bash tests/test-product-owner-backlog-integration.sh
```

**Expected output:**
```
✅ All integration tests passed!

Integration Summary:
  ✓ Deferred section extraction works
  ✓ Item parsing and filtering works
  ✓ Backlog skill can be invoked successfully
  ✓ Integration point exists in execute-decision.sh
  ✓ Defensive error handling implemented
  ✓ Redis metadata storage included
```

## Configuration

**Default values:**
- Priority: `P2` (Medium Priority)
- Category: `Technical-Debt`
- Sprint: `Sprint-Backlog-{ITERATION}`
- Force: `true` (skip duplicate warnings in automation)

**Customize in execute-decision.sh (line 224-230):**
```bash
add-backlog-item.sh \
  --priority "P1" \          # Change default priority
  --category "Feature" \     # Change category
  --sprint "Custom-Sprint"   # Custom sprint name
```

## Troubleshooting

### No items extracted

**Symptom:** "No deferred items detected" message

**Causes:**
- Product Owner didn't use recognized section headers
- Items not in bullet list format
- Items too short (< 10 chars)

**Solution:** Update Product Owner agent prompt to use standard format

### Backlog skill fails

**Symptom:** "Warning: Failed to add backlog item"

**Causes:**
- Backlog file permissions
- Validation.sh missing dependencies
- Item validation failure (length, priority, category)

**Solution:** Check backlog skill logs:
```bash
bash .claude/skills/cfn-backlog-management/add-backlog-item.sh \
  --item "Test" --why "Test" --solution "Test"
# See detailed error output
```

### Duplicate items

**Behavior:** Backlog skill detects similar items, adds with `--force`

**Why:** Automation mode requires non-interactive operation

**Manual cleanup:** Review `readme/BACKLOG.md` periodically for duplicates

## Integration Timeline

**When backlog processing occurs:**

```
CFN Loop Iteration
  ↓
Loop 3 (Implementers) → Complete work, report confidence
  ↓
Gate Check → Pass
  ↓
Loop 2 (Validators) → Review, report consensus
  ↓
Product Owner Decision
  ↓
[1] Parse decision (PROCEED/ITERATE/ABORT)
[2] Verify deliverables
[3] *** Process deferred items for backlog ***  ← HERE
[4] Store decision in Redis
[5] Signal completion
```

## Performance Impact

**Overhead per decision:**
- Deferred section extraction: ~10ms
- Item parsing: ~5ms per item
- Backlog skill invocation: ~100ms per item
- Total: ~10ms + (105ms × item_count)

**Example:**
- 4 deferred items: ~430ms total overhead
- Negligible compared to Product Owner agent execution time (60-300s)

## Future Enhancements

**Potential improvements:**
- Extract priority hints from Product Owner output
- Parse rationale/solution from deferred section context
- Support structured JSON output from Product Owner
- Backlog skill batch mode (single invocation for multiple items)
- Category classification based on item keywords

## Related Documentation

- **Backlog Management Skill:** `.claude/skills/cfn-backlog-management/SKILL.md`
- **Product Owner Decision Skill:** `.claude/skills/cfn-product-owner-decision/SKILL.md`
- **CFN Loop Orchestration:** `.claude/skills/cfn-loop-orchestration/SKILL.md`
- **Agent Output Standards:** `docs/AGENT_OUTPUT_STANDARDS.md`

## References

- **Implementation:** `.claude/skills/cfn-product-owner-decision/execute-decision.sh` (lines 200-256)
- **Test:** `tests/test-product-owner-backlog-integration.sh`
- **Backlog File:** `readme/BACKLOG.md`
