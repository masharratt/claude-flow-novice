---
name: cfn-security-review
description: "MUST BE USED before merging any change that touches auth, DB schema, HTTP handlers, or input parsing. Post-implementation security gate mirroring cfn-dry-review: reviews the working diff for injection, authz/authn gaps, secret exposure, missing RLS, missing security headers, unscoped DELETE/TRUNCATE, unsafe input. Emits a JSON manifest for cfn-vote-implement. Never auto-fixes."
version: 1.0.0
tags: [security, code-review, gate, injection, rls, secrets, auth]
status: production
---

# CFN Security Review

**Purpose:** Post-implementation security gate. Reviews the working diff for the security failure classes called out in CLAUDE.md, then emits a structured manifest that feeds `cfn-vote-implement` for 3-agent voting. Findings route through voting. This skill never auto-fixes.

This is the security counterpart to `cfn-dry-review`. Same flow (review the diff, emit a manifest, route through `cfn-vote-implement`), different axis. `cfn-dry-review` owns minimalism. `cfn-security-review` owns safety. Do not mix the two.

## When to Use (gate)

Run BEFORE merging any change that touches:

- Authentication or authorization (login, sessions, JWT, role checks, RLS).
- Database schema (new tables, columns, policies, migrations).
- HTTP handlers / routes / middleware.
- Input parsing (request bodies, query params, CLI args, file uploads, deserialization).

If a change touches none of those, this gate is optional.

## Inputs

- `--diff` (default): working-tree changes vs `HEAD` (staged + unstaged).
- `--staged`: staged changes only.
- `--diff=<ref>`: changes since `<ref>` (e.g. `--diff=main`).
- `<path>`: restrict the diff to a path.

## Outputs

- A captured diff at `<project-root>/.cfn-cache/diffs/cfn-security-review-<ns>.diff`.
- A manifest skeleton at `<project-root>/.cfn-cache/manifests/cfn-security-review-<ns>.json` (auto-gitignored, nanosecond-precision filename).
- Human-readable summary to stdout.

`execute.sh` only gathers the diff and scaffolds the manifest (metadata, changed files, surface hints, empty `suggestions`). The security analysis is performed by an agent you spawn (below), which appends findings to `suggestions`.

## How to Run

```bash
# 1. Scaffold: capture the diff + write the manifest skeleton
./.claude/skills/cfn-security-review/execute.sh            # working tree vs HEAD
./.claude/skills/cfn-security-review/execute.sh --staged   # staged only
./.claude/skills/cfn-security-review/execute.sh --diff=main

# 2. Spawn a security-specialist agent (see prompt below) to fill the manifest

# 3. Route findings through voting
/cfn-vote-implement latest
```

## Step 2: Spawn the Reviewer Agent

Spawn a single `security-specialist` agent. Give it the captured diff (`diff_file` from the manifest) and the manifest path. Instruct it to read the diff, find issues across the categories below, and append one suggestion per finding to the manifest's `suggestions` array (schema below). It must NOT modify production code.

For broad coverage you may also invoke the built-in `/security-review` command on the same diff and fold its findings into the same manifest. The deduplicated union is what gets voted on.

### Categories (mirror the CLAUDE.md security rules)

| Category | What to flag |
|----------|--------------|
| `injection` | SQL/command/template injection. Unparameterized queries, string-built SQL, `eval`, shell interpolation of user input. SQL must use explicit schema qualification, never `search_path` defaults. |
| `authz_authn` | Missing or weak authentication/authorization. Unprotected routes, missing role checks, broken object-level authz, trusting client-supplied identity. |
| `secret_exposure` | Hardcoded credentials, tokens, API keys, private keys. Secrets logged, returned in responses, or committed. Redact as `[REDACTED]` when quoting. |
| `missing_rls` | New DB tables without Row Level Security policies. A migration adding a table requires RLS in the same change. |
| `missing_security_headers` | HTTP responses missing HSTS, CSP, X-Frame-Options. Headers must come from shared middleware, not per-route. |
| `unscoped_destructive_sql` | `DELETE`/`TRUNCATE` without a WHERE clause that targets only the intended rows. Any unscoped destructive SQL is a hard block. `session_replication_role = 'replica'` to bypass FK checks is also a block. |
| `unsafe_input` | Missing validation/sanitization at boundaries. Unvalidated deserialization, path traversal, SSRF, unchecked file uploads, null/type assumptions on external data. |

The agent must NOT hand-roll crypto, auth, or token parsing as a fix. A widely-audited dependency wins there.

## Manifest Schema (shared with cfn-vote-implement)

The skeleton is written by `execute.sh`. The agent appends entries to `suggestions`:

```json
{
  "review_id": "security-review-<ns>",
  "source": "cfn-security-review",
  "scope": "git diff HEAD (working tree)",
  "generated_at": "ISO-8601",
  "status": "pending_review",
  "diff_file": "<project-root>/.cfn-cache/diffs/cfn-security-review-<ns>.diff",
  "file_count": 3,
  "changed_files": ["src/api/auth.ts", "supabase/migrations/0007_orders.sql"],
  "surface_hints": ["db_schema", "secret_or_auth"],
  "categories": ["injection", "authz_authn", "..."],
  "suggestions": [
    {
      "id": "S001",
      "category": "missing_rls",
      "tag": "block | fix | harden",
      "one_liner": "0007_orders.sql:L4: block: new table `orders` ships with no RLS policy.",
      "title": "orders table has no Row Level Security",
      "description": "Migration 0007 creates public.orders but adds no RLS policy. Any authenticated role can read every row.",
      "files": ["supabase/migrations/0007_orders.sql:4"],
      "impact": "high",
      "effort": "low",
      "suggested_approach": "Add ENABLE ROW LEVEL SECURITY plus an owner-scoped SELECT/INSERT policy in the same migration.",
      "related_suggestions": []
    }
  ]
}
```

Tags: `block` (hard merge blocker, e.g. unscoped DELETE, missing RLS, exposed secret), `fix` (clear vulnerability), `harden` (defense-in-depth improvement). Sort `suggestions` by impact descending, then effort ascending.

## Rules

- Read the actual diff. Do not guess from file names.
- Never auto-fix. Every finding routes through `/cfn-vote-implement`.
- `block`-tagged findings should be treated as merge blockers regardless of vote outcome. Surface them even if voting defers.
- Cite file paths with line numbers.
- Redact any credential/token/PII in quoted code as `[REDACTED]`.
- Scope lock: security only. DRY/modularity goes to `/cfn-dry-review`; correctness bugs go to `/code-review`.

## Related

- `/cfn-vote-implement` - votes on and routes the findings (never implement manually).
- `/security-review` - built-in command; its findings can fold into the same manifest.
- `security-specialist` agent - performs the analysis.
- `/cfn-dry-review` - the minimalism counterpart of this gate.
