---
name: cfn-alpha-launch-v2
description: "Group-based alpha readiness analysis. Use when analyzing all features in one priority group (CRITICAL/HIGH/MEDIUM/LOW) at once; generates consolidated fix lists, marks group complete when done."
version: 2.2.0
tags: [alpha, launch, readiness, focused, group-based, incremental, progress-tracking, feature-status]
status: production
---

# CFN Alpha Launch V2

## Overview

**Group-based, incremental readiness assessment** - One priority group at a time.

Unlike V1's broad analysis, V2:
- **Reads** `readme/feature-status.md` for feature list
- **Groups** features by priority (CRITICAL → HIGH → MEDIUM → LOW)
- **Analyzes** ALL features in a priority group together
- **Fixes** with consolidated fix lists per group
- **Marks** entire group ✅ READY when complete
- **Repeats** until alpha ready

**Key Benefits**:
- **Faster than single-feature**: Process 3-5 related features at once
- **More focused than V1**: Only next priority group, not entire codebase
- **Linear progress**: No more circular analysis

## V1 vs V2 Comparison

| Aspect | V1 (cfn-alpha-launch) | V2 (cfn-alpha-launch-v2) |
|--------|----------------------|------------------------------|
| **Scope** | 8 areas, entire codebase | 1 priority group (3-5 features) |
| **Analysis** | Broad, all gaps | Group-focused, related features |
| **Output** | `fix-list.md` (all issues) | `fix-list-CRITICAL.md` (per-group) |
| **Progress** | Circular (re-analyzes same) | Linear (marks groups complete) |
| **Tracking** | Unknown per-feature | X/29 features, groups complete |
| **Time** | 4-6 hours per run | 1-2 hours per group |

## Usage

### Quick Start

```bash
# 1. See what's next (group-based)
/cfn-alpha-launch-v2:select

# 2. Analyze the entire priority group
/cfn-alpha-launch-v2:analyze

# 3. Execute all fixes for the group
/cfn-alpha-launch-v2:fix

# 4. Mark entire group complete
/cfn-alpha-launch-v2:complete

# 5. Check overall progress
/cfn-alpha-launch-v2:status

# 6. Repeat until alpha ready
```

## Modes

### Mode: Select

```bash
/cfn-alpha-launch-v2:select
```

**Purpose**: Show next priority group to work on.

**Behavior**:
- Reads `readme/feature-status.md`
- Finds next incomplete priority (CRITICAL → HIGH → MEDIUM → LOW)
- Shows all features in that group
- Skips features already marked ✅ READY

**Example Output**:
```
╔════════════════════════════════════════════════════════════╗
║  NEXT PRIORITY GROUP TO ASSESS                             ║
╚════════════════════════════════════════════════════════════╝

Priority:    CRITICAL
Features:    1 incomplete

  • #1: Secret Rotation

─────────────────────────────────────────────────────────────────

Next Steps:
1. /cfn-alpha-launch-v2:analyze -p CRITICAL
2. /cfn-alpha-launch-v2:fix -p CRITICAL
3. /cfn-alpha-launch-v2:complete -p CRITICAL

Or analyze a specific feature (overrides group):
   /cfn-alpha-launch-v2:analyze -f 2
```

### Mode: Analyze

```bash
/cfn-alpha-launch-v2:analyze                # Auto-selects next priority group
/cfn-alpha-launch-v2:analyze -p HIGH       # Analyze HIGH priority features
/cfn-alpha-launch-v2:analyze -f 2          # Analyze specific feature #2 (override)
```

**Purpose**: Run targeted analysis on all features in a priority group.

**Parameters**:
- `-p, --priority` - Priority group (optional, defaults to next incomplete)
- `-f, --feature NUM` - Specific feature (optional, overrides group mode)

**Behavior**:
- **Without `-f`**: Spawns analysis agent for entire priority group
- **With `-f``: Analyzes single feature (overrides group mode)
- Generates consolidated fix list: `docs/alpha/fixes-by-priority/fix-list-{PRIORITY}.md`

**Example Output**:
```
Selected Priority Group: CRITICAL (3 features)

Features to Analyze:
  • #1: Secret Rotation
  • #2: TypeScript Compilation
  • #3: E2E Test Configuration

SCOPE CONSTRAINT: Analyze ONLY these 3 features. Do NOT expand.

[Agent spawns, analyzes all 3 features]

Generated: docs/alpha/fixes-by-priority/fix-list-CRITICAL.md
```

### Mode: Fix

```bash
/cfn-alpha-launch-v2:fix                      # Uses next priority group
/cfn-alpha-launch-v2:fix -p HIGH               # Fix HIGH priority features
/cfn-alpha-launch-v2:fix -f 2 --agents 5     # Fix specific feature (override)
```

**Purpose**: Execute fixes for a priority group (or specific feature).

**Parameters**:
- `-p, --priority` - Priority group (optional, defaults to next)
- `-f, --feature NUM` - Specific feature (optional, overrides group mode)
- `-a, --agents NUM` - Unused by this mode (default: 3); see Behavior below

**Behavior**:
- Calls the same `mode_manifest` logic that `manifest` mode uses (fix-list resolution
  for single-feature or group-priority runs, converter existence check, single converter
  invocation) and prints the hand-off command: `/cfn-vote-implement latest`
- Exits 3 (manifest ready, execution not performed). A shell script cannot spawn Claude
  agents, so `fix` mode stops there. `/cfn-vote-implement latest` is the documented
  consumer of an alpha-launch manifest: it always runs a fixed 3-agent vote, which is
  why `--agents` has no effect on this mode

### Mode: Manifest

```bash
/cfn-alpha-launch-v2:manifest                  # Uses next priority group
/cfn-alpha-launch-v2:manifest -p HIGH           # Convert HIGH group fix-list
/cfn-alpha-launch-v2:manifest -f 2              # Convert feature #2 fix-list
```

**Purpose:** Convert priority-group or single-feature fix-list to `cfn-vote-implement`-compatible JSON manifest.

**Output:** `<project-root>/.cfn-cache/manifests/cfn-review-alpha-v2-{PRIORITY}-<ts>.json` matching cfn-dry-review schema.

**Field mapping:**
| Source | Manifest field |
|--------|----------------|
| Filename `fix-list-CRITICAL.md` | `impact: high`, `priority: critical` (all items) |
| Filename `fix-list-HIGH.md` | `impact: high`, `priority: high` |
| Filename `fix-list-MEDIUM.md` | `impact: medium`, `priority: medium` |
| `## Feature #N: Title` | feature context (fallback `category`) |
| `- Agent: <type>` | `category: <type>` |
| `- File: <path>` | `files: ["<path>"]` |

**Use case:** Route alpha findings through 3-agent consensus voting before implementation:
```bash
/cfn-alpha-launch-v2:manifest -p HIGH
/cfn-vote-implement latest
```

### Mode: Complete

```bash
/cfn-alpha-launch-v2:complete                  # Uses next priority group
/cfn-alpha-launch-v2:complete -p HIGH           # Mark HIGH group complete
/cfn-alpha-launch-v2:complete -f 2              # Mark feature #2 complete
```

**Purpose**: Mark all features in a group (or specific feature) as complete.

**Parameters**:
- `-p, --priority` - Priority group (optional, defaults to next)
- `-f, --feature NUM` - Specific feature (optional, overrides group mode)

**Behavior**:
- Provides instructions for updating `feature-status.md`
- Marks ALL features in the group as ✅ READY
- Adds group completion summary to `feature-status.md`

### Mode: Status

```bash
/cfn-alpha-launch-v2:status
```

**Purpose**: Show overall alpha readiness progress.

**Example Output**:
```
╔════════════════════════════════════════════════════════════╗
║  ALPHA LAUNCH READINESS PROGRESS                            ║
╚════════════════════════════════════════════════════════════╝

Overall Progress: [20/29 features] (69%)

Remaining by Priority:
  • CRITICAL:  1 features
  • HIGH:      3 features
  • MEDIUM:    5 features

Next Priority Group: HIGH (3 features)
```

## Workflow Example

### Session 1: Fix CRITICAL Features

```bash
# See what's next
/cfn-alpha-launch-v2:select
> Priority: CRITICAL (1 feature)
> • #1: Secret Rotation

# Analyze CRITICAL group
/cfn-alpha-launch-v2:analyze -p CRITICAL
> Analyzing 1 CRITICAL feature...
> Generated: docs/alpha/fixes-by-priority/fix-list-CRITICAL.md

# Execute fixes
/cfn-alpha-launch-v2:fix -p CRITICAL
> Manifest ready: <project-root>/.cfn-cache/manifests/cfn-review-alpha-v2-CRITICAL-<ts>.json
> Run: /cfn-vote-implement latest

# Run the printed command to actually vote on and implement CRITICAL fixes
/cfn-vote-implement latest

# Mark group complete
/cfn-alpha-launch-v2:complete -p CRITICAL
> Instructions for updating feature-status.md

# Check progress
/cfn-alpha-launch-v2:status
> Progress: [21/29 features] (72%)
> Next: HIGH (3 features)
```

### Session 2: Fix HIGH Features

```bash
/cfn-alpha-launch-v2:select
> Priority: HIGH (3 features)

/cfn-alpha-launch-v2:analyze -p HIGH
/cfn-alpha-launch-v2:fix -p HIGH
/cfn-alpha-launch-v2:complete -p HIGH

/cfn-alpha-launch-v2:status
> Progress: [24/29 features] (83%)
```

## Output Files

| File | Purpose |
|------|---------|
| `readme/feature-status.md` | Master feature tracking (read/write) |
| `docs/alpha/fixes-by-priority/fix-list-CRITICAL.md` | CRITICAL priority fixes |
| `docs/alpha/fixes-by-priority/fix-list-HIGH.md` | HIGH priority fixes |
| `docs/alpha/fixes-by-priority/fix-list-MEDIUM.md` | MEDIUM priority fixes |
| `docs/alpha/fixes-by-priority/fix-list-LOW.md` | LOW priority fixes |
| `docs/alpha/readiness-feature-N.md` | Individual feature analysis reports |
| `<project-root>/.cfn-cache/manifests/cfn-review-alpha-v2-{PRIORITY}-<ts>.json` | cfn-vote-implement JSON manifest (emitted by `manifest` mode) |

## Priority Group Structure

Features are grouped by priority level in `feature-status.md`:

| Priority | Description | Example Count | Time Estimate |
|----------|-------------|---------------|---------------|
| **CRITICAL** | Blocks alpha launch | 1-3 features | 1-3 hours |
| **HIGH** | Should fix before launch | 3-5 features | 2-4 hours |
| **MEDIUM** | Post-launch acceptable | 5-10 features | 3-6 hours |
| **LOW** | Nice to have | 5+ features | 2-4 hours |

## Group vs Single Feature Mode

**Default: Group mode** (faster, efficient)
```bash
/cfn-alpha-launch-v2:analyze        # Analyzes next priority group
/cfn-alpha-launch-v2:fix            # Fixes all features in group
/cfn-alpha-launch-v2:complete      # Marks entire group complete
```

**Override: Single feature mode** (when needed)
```bash
/cfn-alpha-launch-v2:analyze -f 2  # Analyzes only feature #2
/cfn-alpha-launch-v2:fix -f 2        # Fixes only feature #2
/cfn-alpha-launch-v2:complete -f 2  # Marks only feature #2 complete
```

**When to use each mode:**

| Use Group Mode | Use Single Feature Mode |
|----------------|----------------------|
| Regular alpha prep work | Quick fix for one blocking issue |
| Multiple related features | Feature needs re-analysis |
| First pass through priority | Feature was partially complete |
| Most common use case | Exceptional cases |

## Progress Tracking

### Group Status Markers

In `readme/feature-status.md`, groups use these markers:

| Marker | Meaning |
|--------|---------|
| ✅ READY | Feature complete, tested, documented |
| ⚠️ PARTIAL | Partially implemented, gaps remain |
| ❌ BLOCKED | Critical issues, cannot launch |
| 🔄 IN PROGRESS | Currently being worked on |

### Completion Formula

```
Feature Completion % = (Complete Features / Total Features) × 100

Example: (24 / 29) × 100 = 83%

Group Completion = All features in priority group are ✅ READY
```

### Alpha Launch Criteria

**Ready when**:
- All CRITICAL features are ✅ READY (group complete)
- All HIGH features are ✅ READY (group complete)
- Overall progress ≥ 85%

## Integration with V1

**V2 does NOT replace V1** - they serve different purposes:

| Use V1 when... | Use V2 when... |
|---------------|---------------|
| First-time alpha assessment | Incremental group progress |
| Need full codebase scan | Focus on priority group |
| Generate comprehensive fix list | Complete priority groups one-by-one |
| Before starting V2 workflow | After V1 initial assessment |
| Final pre-launch check | During development iterations |

**Recommended workflow**:
1. Run V1 once for initial assessment
2. Switch to V2 for group-based progress
3. Use V2 until alpha ready
4. Run V1 final check before launch

## Troubleshooting

### No Features in Group

```bash
/cfn-alpha-launch-v2:select
> 🎉 ALL FEATURES COMPLETE - ALPHA READY!
```

**Solution**: All features marked ✅ READY. Run final V1 check before launch.

### Fix List Missing

```bash
/cfn-alpha-launch-v2:fix -p HIGH
> ERROR: Fix list not found: docs/alpha/fixes-by-priority/fix-list-HIGH.md
```

**Solution**: Run analyze mode first:
```bash
/cfn-alpha-launch-v2:analyze -p HIGH
```

### Wrong Priority Group

```bash
/cfn-alpha-launch-v2:analyze
> Auto-selected priority: MEDIUM (8 features)
```

**Solution**: Specify priority explicitly:
```bash
/cfn-alpha-launch-v2:analyze -p CRITICAL
```

## Configuration

### Agent Count

```bash
/cfn-alpha-launch-v2:fix --agents 5
```

More agents = faster fixes, more context usage.

### Priority Selection

Automatic by default (next incomplete priority). Manual selection with `-p` flag:

```bash
/cfn-alpha-launch-v2:analyze -p HIGH      # Analyze HIGH group
/cfn-alpha-launch-v2:fix -p CRITICAL       # Fix CRITICAL group
```

### Feature Override

For single-feature mode (overrides group):

```bash
/cfn-alpha-launch-v2:analyze -f 7           # Only feature #7
/cfn-alpha-launch-v2:fix -f 7 --agents 2  # Only feature #7
```

## Examples

### Example 1: Group-Based Workflow (Default)

```bash
# Session 1: CRITICAL group
/cfn-alpha-launch-v2:select
> CRITICAL (1 feature)

/cfn-alpha-launch-v2:analyze -p CRITICAL
> Analyzed 1 feature
> Generated: fix-list-CRITICAL.md

/cfn-alpha-launch-v2:fix -p CRITICAL
> Fixed 3 issues

/cfn-alpha-launch-v2:complete -p CRITICAL
> Marked 1 feature READY

/cfn-alpha-launch-v2:status
> [21/29 features] (72%)
> Next: HIGH (3 features)

# Session 2: HIGH group
/cfn-alpha-launch-v2:select
> HIGH (3 features)

/cfn-alpha-launch-v2:analyze -p HIGH
> Analyzed 3 features
> Generated: fix-list-HIGH.md

/cfn-alpha-launch-v2:fix -p HIGH
> Fixed 8 issues across 3 features

/cfn-alpha-launch-v2:complete -p HIGH
> Marked 3 features READY

/cfn-alpha-launch-v2:status
> [24/29 features] (83%)
```

### Example 2: Single Feature Override

```bash
# Need to re-analyze one feature
/cfn-alpha-launch-v2:analyze -f 2
> Only analyzing Feature #2: TypeScript Compilation

/cfn-alpha-launch-v2:fix -f 2
> Only fixing Feature #2 issues

/cfn-alpha-launch-v2:complete -f 2
> Only marking Feature #2 complete
```

### Example 3: Check Progress Midway

```bash
/cfn-alpha-launch-v2:status
╔════════════════════════════════════════════════════════════╗
║  ALPHA LAUNCH READINESS PROGRESS                            ║
╚════════════════════════════════════════════════════════════╝

Overall Progress: [20/29 features] (69%)

Remaining by Priority:
  • CRITICAL:  1 features
  • HIGH:      3 features
  • MEDIUM:    5 features

Next Priority Group: CRITICAL (1 feature)
```

## Key Benefits of Group-Based Approach

### 1. Faster Completion
- **Single feature**: 5-10 features × 30-90 min each = 2.5-15 hours
- **Group-based**: 5-10 features ÷ 3 groups × 1-2 hours each = 2-4 hours
- **Time savings**: ~50-70%

### 2. Related Features Together
- CRITICAL features often related (security, infrastructure)
- HIGH features often related (functionality, UX)
- Fixing related features together is more efficient

### 3. Better Context for Agents
- Agent sees related features together
- Can identify shared issues across features
- More efficient fix planning

### 4. Clearer Progress Tracking
- Group completion milestones (e.g., "All CRITICAL features done!")
- More satisfying progress than feature-by-feature

## Version History

### 2.2.0 (2026-05-17)
- **Manifest emission mode** - `--mode manifest` converts priority-group fix-list to `<project-root>/.cfn-cache/manifests/cfn-review-alpha-v2-<PRIORITY>-<ts>.json`
- **cfn-vote-implement integration** - findings can route through 3-agent voting via shared converter
- **Shared converter** - reuses `cfn-alpha-launch/lib/fixlist-to-manifest.sh`

### 2.1.0 (2026-01-18)
- **Changed to group-based analysis** (was single-feature)
- **Auto-selects next priority group** by default
- **Consolidated fix lists** per priority group
- **Single-feature override** with `-f` flag when needed
- **More efficient** than single-feature approach

### 2.0.0 (2026-01-18)
- Initial V2 release (single-feature mode)
- Focused, feature-by-feature analysis
- Reads from `readme/feature-status.md`
- Per-feature fix lists
- Progress tracking (X/29 features)
- Mark features complete when done

### V1 (cfn-alpha-launch)
- Broad, 8-area analysis
- Comprehensive fix lists
- Regression detection
- Auto-archive previous runs
