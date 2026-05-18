---
description: "Code review for DRY violations, modularity improvements, and resumable pipeline opportunities. Outputs a JSON manifest for cfn-vote-implement."
argument-hint: "[path | --diff | --diff=<ref>] [--category=dry|modularity|resumable|all]"
allowed-tools: ["Agent", "Read", "Grep", "Glob", "Bash", "Write"]
---

# CFN DRY Review

Review code for DRY violations, modularity improvements, and resumable pipeline opportunities.
Output a structured JSON manifest that feeds into `/cfn-vote-implement`.

**Arguments:** $ARGUMENTS

---

## Step 1: Determine Scope

Parse arguments to determine what code to review:

- **No arguments or `--diff`**: Run `git diff --name-only main...HEAD` to get changed files. If no changes against main, use `git diff --name-only HEAD` (unstaged + staged changes). If still nothing, use `git diff --name-only HEAD~1` (last commit).
- **`--diff=<ref>`**: Run `git diff --name-only <ref>...HEAD`
- **A file or directory path**: Review that specific path

Filter out non-code files (images, lock files, generated files, node_modules, .next, dist).

Read every file in scope. You must read the actual code to review it.

## Step 2: Parse Category Filter

- `--category=dry`: Only DRY violations
- `--category=modularity`: Only modularity improvements
- `--category=resumable`: Only resumable pipeline opportunities
- `--category=all` or no flag: All three categories

## Step 3: Review (via Agent)

Spawn a single **code-reviewer** agent with the following prompt. Include the full file contents you read in Step 1.

The agent must review for:

### DRY Violations
- Duplicated logic across files (even if not character-identical)
- Copy-pasted blocks with minor variations
- Repeated string literals, magic numbers, or regex patterns that should be constants
- Similar error handling patterns that could be unified
- Multiple implementations of the same business rule

### Modularity Improvements
- Functions or files doing too many things (>1 clear responsibility)
- Mixed concerns (e.g., business logic interleaved with I/O or formatting)
- Missing abstractions at natural boundaries
- Tight coupling between modules that should communicate through interfaces
- Large files that would benefit from splitting along clear seams

### Resumable Pipeline Opportunities
- Multi-step processes that restart from scratch on failure
- Batch operations without checkpointing
- Non-idempotent operations that could be made idempotent
- Missing progress tracking in long-running workflows
- Pipeline stages without clear input/output boundaries (preventing partial re-runs)

The agent must output a JSON array of suggestions, each with:
- `id`: Sequential (S001, S002, ...)
- `category`: `dry`, `modularity`, or `resumable`
- `title`: Short description (under 80 chars)
- `description`: What the problem is and why it matters (2-4 sentences)
- `files`: Array of `"path/to/file.ts:line"` references
- `impact`: `high`, `medium`, or `low`
- `effort`: `high`, `medium`, or `low`
- `suggested_approach`: Brief description of the fix (1-3 sentences)
- `related_suggestions`: Array of related suggestion IDs (empty array if none)

**Sorting:** Order suggestions by impact descending, then effort ascending (high-impact/low-effort first).

**Grouping:** If multiple instances of the same pattern exist (e.g., "the same validation logic is duplicated in 5 files"), group them as ONE suggestion with all files listed, not 5 separate suggestions.

## Step 4: Write Manifest

Resolve the project-scoped manifest directory first:

```bash
MANIFEST_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.cfn-cache/manifests"
mkdir -p "$MANIFEST_DIR"
# Ensure .cfn-cache/ is gitignored at project root
GITIGNORE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.gitignore"
grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"
TS=$(date +%s%N 2>/dev/null || echo "$(date +%s)-$$")
MANIFEST_PATH="${MANIFEST_DIR}/cfn-dry-review-${TS}.json"
```

Write the manifest to `${MANIFEST_PATH}`:

```json
{
  "review_id": "dry-review-<unix-timestamp>",
  "scope": "<description of what was reviewed>",
  "generated_at": "<ISO-8601>",
  "category_filter": "<dry|modularity|resumable|all>",
  "file_count": <number of files reviewed>,
  "suggestions": [ ... ]
}
```

## Step 5: Summary

Print a concise summary:

```
DRY Review complete: <N> suggestions across <M> files

By category:
  DRY: <n>  Modularity: <n>  Resumable: <n>

By impact:
  High: <n>  Medium: <n>  Low: <n>

Manifest: ${MANIFEST_PATH}

Next: /cfn-vote-implement latest
```

---

## Rules

- Read all code in scope before reviewing. Do not guess from file names.
- Be specific: cite file paths with line numbers. Vague suggestions are useless.
- Group related instances. "Duplicated in 5 places" is one suggestion, not five.
- Impact = how much the codebase improves. Effort = how hard the change is.
- Do not suggest improvements that are purely cosmetic (formatting, comment style).
- Do not suggest adding documentation or comments unless there's a functional benefit.
- Focus on actionable structural improvements, not style preferences.
