---
name: cfn-dry-review
description: "MUST BE USED before merging any PR that adds 3+ new functions or 50+ lines. Run after implementation to identify DRY violations before they land. Code review for DRY violations, modularity improvements, and resumable pipeline opportunities. Outputs a JSON manifest for cfn-vote-implement."
version: 1.0.0
tags: [code-review, DRY, modularity, refactoring]
status: production
---

# CFN DRY Review

**Purpose:** Systematically review code for DRY violations, modularity improvements, and resumable pipeline opportunities. Produces a structured manifest that feeds into cfn-vote-implement for 3-agent voting.

## Inputs

- `$1`: Target scope. One of:
  - A file or directory path (e.g., `src/services/`)
  - `--diff` (default): review files changed in `git diff` against the base branch
  - `--diff=<ref>`: review files changed since a specific ref (e.g., `--diff=main`)
- `--category`: Filter to specific categories: `dry`, `modularity`, `resumable`, or `all` (default: `all`)

## Outputs

- JSON manifest at `/tmp/cfn-dry-review-<timestamp>.json`
- Human-readable summary to stdout

## Manifest Schema

```json
{
  "review_id": "dry-review-<timestamp>",
  "scope": "git diff main | src/services/",
  "generated_at": "ISO-8601",
  "suggestions": [
    {
      "id": "S001",
      "category": "dry | modularity | resumable",
      "title": "Short description",
      "description": "What the problem is and why it matters",
      "files": ["path/to/file.ts:42", "path/to/other.ts:17"],
      "impact": "high | medium | low",
      "effort": "high | medium | low",
      "suggested_approach": "Brief description of the fix",
      "related_suggestions": ["S003"]
    }
  ]
}
```

## Categories

| Category | What to look for |
|----------|-----------------|
| `dry` | Duplicated logic, copy-pasted blocks, repeated patterns across files, string literals that should be constants |
| `modularity` | God functions/files, mixed concerns, missing abstractions at natural boundaries, tight coupling between modules |
| `resumable` | Pipelines that lose progress on failure, missing checkpoints, non-idempotent operations, batch processes without resume capability |

## Usage

```bash
# Review changed files (default)
/cfn-dry-review

# Review a specific directory
/cfn-dry-review src/services/

# Review only DRY violations
/cfn-dry-review --category=dry

# Review changes since a specific branch
/cfn-dry-review --diff=feature-branch
```

## Integration

- Outputs feed directly into `/cfn-vote-implement` for 3-agent voting
- Can be used standalone for review-only workflows
- Manifest is resumable: re-running `/cfn-vote-implement` on the same manifest skips already-processed suggestions

## Related

- `/cfn-vote-implement` - Phase 2: voting and implementation
