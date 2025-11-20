---
name: cfn-dependency-ingestion
description: Atomic ingestion of all CFN Loop CLI dependency files by parsing the dependency diagram
version: 1.0.0
tags: [cfn-loop, dependency-management, dynamic-ingestion]
---

# CFN Dependency Ingestion Skill

## Quick Start

Use this skill to dynamically ingest ALL CFN Loop CLI dependency files:

```bash
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh
```

This outputs Read commands for all files referenced in the dependency diagram.

## What This Skill Does

1. Parses `readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt` (single source of truth)
2. Extracts all file paths from PART 4 (File Execution Order) and PART 5 (TypeScript Module Structure)
3. Groups files by priority: [P0] critical path, [P1] post-validation, [P2] deferred
4. Outputs Read commands in execution order

## Usage Examples

**Basic ingestion (all files):**
```bash
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh
```

**Priority-filtered ingestion:**
```bash
# P0 only (critical path)
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --priority P0

# P0 + P1 (exclude deferred)
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --priority P0,P1
```

**Type-filtered ingestion:**
```bash
# TypeScript only
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --type TS

# Shell scripts only
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --type SH

# Both TypeScript and shell
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --type TS,SH
```

## Progressive Disclosure

<details>
<summary>Click to see full implementation details</summary>

### File Priority Levels

- **P0 (Critical Path):** Required for 5-iteration North Star test
- **P1 (Post-Validation):** High value features after core validation
- **P2 (Deferred):** Nice-to-have features, can inline

### Dynamic Parsing Logic

The script uses grep and sed patterns to extract files:
- `[P0]` - Critical path markers
- `[P1]` - Post-validation markers
- `[P2]` - Deferred features
- `[TS]` - TypeScript implementation
- `[SH]` - Shell script fallback
- `[DEPRECATED]` - Legacy files (excluded by default)

### Output Format

Generates Read commands grouped by priority for easy copy-paste into Main Chat or agent profiles:

```
# Step 1: Read the dependency diagram
Read: readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt

# Step 2: Read P0 critical path files
Read: .claude/commands/cfn-loop-cli.md
Read: src/cli/index.ts
Read: .claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md
...

# Step 3: Read P1 files (post-validation)
Read: .claude/skills/cfn-loop-orchestration/src/helpers/confidence-aggregator.ts
Read: .claude/skills/cfn-loop-orchestration/src/helpers/context-lookup.ts
...

# Step 4: Read coordination layer (Redis/Shell)
Read: .claude/skills/cfn-coordination/coordination-wait.sh
Read: .claude/skills/cfn-redis-coordination/report-completion.sh
...
```

### Architecture

**Diagram Structure (Source of Truth):**
```
readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt
├── PART 1: USER TO COORDINATOR (spawning flow)
├── PART 2: COORDINATOR TO ORCHESTRATOR (parameters)
├── PART 3: TYPESCRIPT ORCHESTRATOR (main loop)
├── PART 4: CRITICAL DEPENDENCIES (execution order)
├── PART 5: TYPESCRIPT MODULE STRUCTURE (priority markers)
├── PART 6: MODE-SPECIFIC THRESHOLDS
└── PART 7: COORDINATION PROTOCOL (Redis patterns)
```

**Parsing Strategy:**
1. Read entire diagram into memory
2. Extract PART 4 and PART 5 sections
3. Parse priority markers: [P0], [P1], [P2]
4. Parse type markers: [TS], [SH]
5. Extract file paths using regex patterns
6. Deduplicate and sort by priority
7. Output Read commands grouped by category

**File Path Patterns:**
- `.claude/commands/*.md`
- `.claude/agents/**/*.md`
- `.claude/skills/**/src/**/*.ts`
- `src/cli/*.ts`
- `tests/**/*.sh`

</details>

## Integration with cfn-loops-cli-expert Agent

The `cfn-loops-cli-expert` agent MUST use this skill in Step 2 instead of hardcoded file lists:

```markdown
## Step 2: Execute Dependency Ingestion

Run the dynamic ingestion script to load all CFN Loop CLI dependencies:

```bash
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh
```

This automatically discovers and reads all files referenced in the dependency diagram.
```

## Maintenance

This skill self-updates as long as `readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt` is maintained. No code changes needed when files are added/removed.

**When to Update:**
- New TypeScript module added to orchestration
- New agent profile created
- File paths change
- Priority levels shift (P0 → P1, etc.)

**How to Update:**
Simply update the dependency diagram. The parser adapts automatically.

## Success Criteria

Skill is working correctly when:
- All P0 critical path files are extracted
- Priority filtering works (--priority flag)
- Type filtering works (--type flag)
- No DEPRECATED files included (unless --include-deprecated flag set)
- Output is valid Read commands (can copy-paste directly)
- File paths are relative to project root

## Related Documentation

- **Dependency Diagram:** `readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt` (source of truth)
- **CFN Loop Architecture:** `docs/CFN_LOOP_ARCHITECTURE.md`
- **TypeScript Migration:** `planning/docker-migration/TYPESCRIPT_MIGRATION_HANDOFF.md`
- **Agent Profiles:** `.claude/agents/cfn-dev-team/`

## Version History

- **1.0.0** (2025-11-20): Initial release with dynamic parsing from dependency diagram
