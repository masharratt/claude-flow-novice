# BUG #25: Product Owner Agent ID Mismatch

**Status:** CRITICAL - Blocks iteration progression  
**Discovered:** 2025-10-22 21:24 UTC  
**Root Cause:** Agent ID parameter (`product-owner-1-decision`) != runtime ID (`product-owner-1`)

## Summary

Orchestrator spawns Product Owner with `--agent-id "product-owner-1-decision"` but agent stores Redis keys using runtime ID `product-owner-1`. Result: Orchestrator cannot find decision despite agent successfully storing `"ITERATE"`.

## Evidence

```bash
# Decision exists at runtime ID:
$ redis-cli LRANGE "swarm:cfn-phase-2-gate-ack-1761164102:product-owner-1:decision" 0 -1
{"decision": "ITERATE", "reasoning": "In-scope consensus below threshold (0.70 < 0.90)", ...}

# Orchestrator looks at spawn ID:
$ redis-cli GET "swarm:cfn-phase-2-gate-ack-1761164102:product-owner-1-decision:decision"
(nil)  # Key not found!
```

## Root Cause

**orchestrate-cfn-loop.sh:1530**
```bash
PO_AGENT_ID="product-owner-${PO_INSTANCE_NUM}-decision"  # Spawn with suffix

npx claude-flow-novice agent product-owner --agent-id "$PO_AGENT_ID" ...
# ↑ Passes "product-owner-1-decision" as parameter
```

**Agent Runtime**  
CLI agent reads `$AGENT_ID` from environment, which is set to `product-owner-1` (no suffix), not the `--agent-id` parameter value.

**execute-decision.sh:102**
```bash
AGENT_ID="${AGENT_ID:-product-owner-1}"  # Uses runtime ID
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:decision" ...
# ↑ Stores at swarm:...:product-owner-1:decision
```

## Impact

- ✅ Product Owner decision correct: `"ITERATE"`
- ❌ Orchestrator cannot retrieve it (wrong Redis key)
- ❌ Iteration 2 never spawns
- ❌ 4 iteration-reduction improvements remain untested

## Fix #1: Remove `-decision` Suffix (RECOMMENDED)

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh:1530`

```bash
# OLD:
PO_AGENT_ID="product-owner-${PO_INSTANCE_NUM}-decision"

# NEW:
PO_AGENT_ID="product-owner-${PO_INSTANCE_NUM}"
```

**Impact:** Aligns spawn ID with runtime ID → Redis keys match  
**Effort:** 1 line  
**Risk:** Low

## Fix #2: Stdout Fallback Parsing

```bash
DECISION=$(redis-cli LINDEX "$DECISION_KEY" 0 | jq -r '.decision' 2>/dev/null)

if [ -z "$DECISION" ]; then
  # Fallback: Parse from captured agent output
  DECISION=$(echo "$PO_OUTPUT" | grep -oP '(?<=DECISION: )[A-Z_]+' | head -1)
  
  if [ -n "$DECISION" ]; then
    echo "⚠️  Decision parsed from agent output (Redis key mismatch)"
  else
    echo "❌ ERROR: Could not retrieve Product Owner decision"
    exit 1
  fi
fi
```

**Impact:** Tolerates ID mismatch  
**Effort:** 15 lines  
**Risk:** Medium (regex brittleness)

## Related Bugs

- **BUG #11**: Original Product Owner output parsing (solved with `execute-decision.sh`)
- **BUG #20**: Missing deliverable extraction (solved with pre-verification)
- **BUG #21**: Iteration blocking (solved with explicit `continue`)

This is the **4th Product Owner integration bug** - architectural smell in coordinator ↔ skill communication.

## Adaptive Context

**ANTI-025: CLI Agent ID Parameter vs Runtime Mismatch**
- **Context**: CLI agent spawning, Redis coordination
- **Insight**: Spawn parameter `--agent-id "X"` may not match runtime `$AGENT_ID=Y`. Always align spawn ID with runtime environment ID to prevent Redis key mismatches. Remove unnecessary suffixes unless required for disambiguation.
- **Tags**: agent-spawning, redis-coordination, id-mismatch, environment-variables
- **Confidence**: 0.93
- **Priority**: 9/10

---

**Created**: 2025-10-22 21:35 UTC  
**Action**: Apply Fix #1, relaunch Phase 2, validate iteration 2 spawning
