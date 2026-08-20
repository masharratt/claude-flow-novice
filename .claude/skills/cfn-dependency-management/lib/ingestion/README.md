# CFN Dependency Ingestion Skill

Dynamic ingestion of CFN Loop CLI dependency files by parsing the dependency diagram.

## Quick Start

```bash
# Ingest all dependencies
$HOME/.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh

# Ingest P0 critical path only
$HOME/.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --priority P0

# Ingest TypeScript files only
$HOME/.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --type TS

# Include deprecated files
$HOME/.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh --include-deprecated
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
- `--skip-validation` - Disable file existence checks (faster, but may include missing files)

## Features

### Deduplication (Enhancement #1)
All file paths are deduplicated using `sort -u`. If a file appears in multiple sections (e.g., `orchestrate.ts` in both P0 and coordination layer), it will only appear once in the final output.

### Type Filtering (Enhancement #2)
The `--type` flag correctly filters files by extension:
- `--type TS` - Only `.ts`, `.js`, `.cjs` files
- `--type SH` - Only `.sh` files
- `--type TS,SH` - Both TypeScript and Shell files

### File Existence Validation (Enhancement #3)
By default, the script validates that all discovered files exist on the filesystem:
- Missing files are reported to stderr with `WARNING: File not found: <path>`
- Missing files are excluded from Read output
- Use `--skip-validation` to disable checks for faster execution

### Regression Testing (Enhancement #4)
Expected file counts are documented in `SKILL.md` for regression testing:
- Total files: 14 (as of 2025-11-20, after deduplication)
- P0 files: 3 (in P0 section, Step 2)
- TypeScript files: 4
- Shell files: 3
- Known missing files: 4

See `SKILL.md` for validation commands and regression test suite.

## Usage in Agents

The `cfn-loops-cli-expert` agent uses this skill for dynamic dependency loading:

```markdown
## Step 2: Execute Dependency Ingestion

```bash
$HOME/.claude/skills/cfn-dependency-ingestion/ingest-dependencies.sh
```

This automatically discovers and reads all files referenced in the dependency diagram.
```

## Maintenance

This skill self-updates when `readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt` changes. No code updates needed.

## Implementation

See `SKILL.md` for complete documentation and progressive disclosure.
