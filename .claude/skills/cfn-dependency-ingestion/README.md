# CFN Dependency Ingestion Skill

Dynamic ingestion of CFN Loop CLI dependency files by parsing the dependency diagram.

## Quick Start

```bash
# Ingest all dependencies
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh

# Ingest P0 critical path only
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --priority P0

# Ingest TypeScript files only
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --type TS

# Include deprecated files
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --include-deprecated
```

## Output

The script outputs Read commands grouped by priority:

```
# Step 1: Read the dependency diagram
Read: readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt

# Step 2: Read P0 critical path files (required for 5-iteration e2e)
Read: .claude/skills/cfn-loop-orchestration/src/orchestrate.ts
Read: .claude/skills/cfn-agent-selection-with-fallback/src/cli.ts
...

# Step 3: Read P1 files (post-validation features)
...

# Step 5: Read coordination layer (Redis/Shell scripts)
...

# Step 6: Read agent profiles (coordinators and workers)
...

# Step 7: Read slash commands
...
```

## Options

- `--priority P0,P1,P2` - Filter by priority levels
- `--type TS,SH` - Filter by file types (TypeScript or Shell)
- `--include-deprecated` - Include files marked as DEPRECATED

## Usage in Agents

The `cfn-loops-cli-expert` agent uses this skill for dynamic dependency loading:

```markdown
## Step 2: Execute Dependency Ingestion

```bash
./.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh
```

This automatically discovers and reads all files referenced in the dependency diagram.
```

## Maintenance

This skill self-updates when `readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt` changes. No code updates needed.

## Implementation

See `SKILL.md` for complete documentation and progressive disclosure.
