---
name: cfn-dry-review
description: "MUST BE USED before merging any PR that adds 3+ new functions or 50+ lines. Run after implementation. Reviews code for DRY violations, modularity, resumable pipeline opportunities. Outputs JSON manifest for cfn-vote-implement."
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

- JSON manifest at `<project-root>/.cfn-cache/manifests/cfn-dry-review-<timestamp>.json` (auto-gitignored, timestamps are nanosecond-precision)
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
      "tag": "delete | stdlib | native | yagni | shrink",
      "one_liner": "L12-38: stdlib: 27-line validator class. \"@\" check is 1 line; real validation is the confirmation mail.",
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

## Suggestion Tags & Grammar

Every suggestion carries one `tag` (orthogonal to `category` — it sharpens the fix) and a one-line `one_liner` in imperative form:

`L<line>: <tag> <what>. <replacement>.`  (use `<file>:L<line>: ...` for multi-file diffs)

| Tag | Means |
|-----|-------|
| `delete` | Dead code, unused flexibility, speculative feature. Replacement: nothing. |
| `stdlib` | Hand-rolled thing the standard library ships. Name the function. |
| `native` | Dependency or code doing what the platform/DB/framework already does. Name the feature. |
| `yagni` | Abstraction with one implementation, config nobody sets, a layer with one caller. |
| `shrink` | Same logic, fewer lines. Show the shorter form. |

Imperative, not Socratic:
- ❌ "This EmailValidator class might be more complex than necessary, have you considered whether all these rules are needed?"
- ✅ `L12-38: stdlib: 27-line validator class. "@" check is 1 line; real validation is the confirmation mail.`

End the stdout summary with one metric: `net: -<N> lines possible.` (or `Lean already. Ship.` if nothing to cut).

### Scope Lock

This review covers minimalism ONLY: DRY, modularity, resumable, over-engineering. **Correctness bugs, security holes, and performance are explicitly OUT of scope — route those to `/code-review`.** Do not mix axes; the scope lock is what keeps findings terse and the manifest focused.

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
