# Skill: cfn-decisions

## Purpose

Records one resolved decision per invocation to the per-run JSON ledger
`planning/<slug>/.VERIFY_<slug>.decisions.json` (atomic upsert-by-key) and delegates
the SQLite register sync to the LOCKED `decision-log/record.sh` sink
(composition per D-1, not duplication).

Closes the gap where `cfn-workbench/lib/section-decisions.sh:14,38-51` reads
the per-run JSON but nothing writes it.

## Inputs

- `argv`: 12 flags (5 required + 7 optional). See "Writer CLI" below.
- `ENV`: none (the writer reads no env vars; `DB_PATH` belongs to the sink).

## Outputs

- stdout: `<id> <status>\n` (FR-9: id and status only; no rationale ever).
- stderr: field NAMES, exit codes, target file PATHS. Never field VALUES.
- exit code: `0..8` (code 6 RESERVED per D-7, never emitted). See "Exit
  taxonomy" below.
- Filesystem: `planning/<slug>/.VERIFY_<slug>.decisions.json` (atomic mv via mktemp);
  legacy flat `planning/` when the plan has no per-plan dir.
- SQLite: one row in `decisions` table (via `decision-log/record.sh`).

## Usage

```bash
.claude/skills/cfn-decisions/record.sh \
  --slug <run-slug> \
  --id <stable-decision-id> \
  --title "<short summary>" \
  --chosen "<chosen option>" \
  --actor human|ai \
  [--rationale "<why>"] \
  [--alternatives "<rejected options>"] \
  [--status proposed|accepted|superseded] \
  [--iteration <int>] \
  [--blocking true|false] \
  [--timestamp <iso8601-utc>] \
  [--root <dir>]
```

Manual invocation is identical to coordinator invocation (EC-12). There is no
caller-detection branch.

## Writer CLI (12 flags + FR-10 defaults)

Required (FR-3: refuse on missing/empty/whitespace, exit 1):

| Flag | Validation |
|---|---|
| `--slug` | `^[a-z0-9][a-z0-9_-]{0,59}$` |
| `--id` | non-empty after trim |
| `--title` | non-empty after trim |
| `--chosen` | non-empty after trim |
| `--actor` | enum `{human, ai}` |

Optional (FR-10 defaults applied when omitted):

| Flag | Default | Validation |
|---|---|---|
| `--rationale` | `""` | any UTF-8 (jq-escaped per FR-6) |
| `--alternatives` | `""` | any UTF-8 |
| `--status` | `proposed` | enum `{proposed, accepted, superseded}` |
| `--iteration` | `1` | `^[0-9]+$` (0 and 2147483647 both accepted; EC-5) |
| `--blocking` | `false` | literal `true` or `false` |
| `--timestamp` | `date -u +%Y-%m-%dT%H:%M:%SZ` (UTC) | `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$` (EC-19) |
| `--root` | `$(pwd)/planning` | existing writable dir |

## Reject flags (FR-8 floor)

`--delete`, `--remove`, `--purge`, `--supersede` are rejected with exit 2
(`unknown arg: <flag>`). The sink's supersede path is NOT exposed through
this writer; status transitions are encoded via `--status` on the replacement
entry. The writer issues NO `DELETE` SQL and NO `rm`/`truncate` against the
target file.

## Exit taxonomy (0..8; ARCH §10.1)

| Code | Constant | Meaning |
|---|---|---|
| 0 | `E_OK` | success: JSON written AND SQLite row synced |
| 1 | `E_VALIDATION` | FR-3 missing/empty/whitespace required field |
| 2 | `E_CLI_PARSE` | unknown flag, missing flag value, invalid enum, malformed timestamp/iteration/blocking |
| 3 | `E_JQ_BUILD` | jq failed to build ENTRY (defensive, near-unreachable) |
| 4 | `E_FILESYSTEM` | dir missing/RO, mktemp fail, mv fail, disk full at FS layer |
| 5 | `E_TARGET_CORRUPT` | existing target JSON does not parse; bad file PRESERVED |
| 6 | `E_RESERVED_6` | RESERVED (D-7 rejected FATAL; NEVER emitted in current contract) |
| 7 | `E_SINK_MISSING` | `decision-log/record.sh` not on PATH (D-7 PERSIST; JSON kept) |
| 8 | `E_SINK_NONZERO` | `record.sh` exited non-zero (JSON kept; idempotent retry safe) |

## Dual-write order (D-7)

1. Write JSON FIRST (atomic mktemp+mv). The JSON is the renderer's primary
   artifact.
2. Call `decision-log/record.sh` to sync SQLite (best-effort, wrapped in
   `timeout "${SINK_TIMEOUT_SECONDS:-30}"` per Q1 promotion).
3. On sink failure (non-zero OR timeout): KEEP the JSON, surface the failure
   via exit code (7 or 8). NEVER roll back. Idempotent retry safe.

Sink stderr is suppressed (`2>/dev/null`) so a misbehaving sink cannot leak
field values via the writer's stderr channel (FR-9 invariant).

## State machine (ARCH §9; SM-1..SM-9)

All status pairs are legal in BOTH directions (EC-16 mistake correction).
There is NO forward-only gate; the enum is the only validation. The
illegal-transition table is EMPTY by design. See
`lib/state-machine-doc.md` for the full table and mermaid diagram.

## Composition (D-1)

The writer DELEGATES SQLite persistence to the LOCKED `decision-log/record.sh`
subprocess. It NEVER opens `decisions.db` directly and NEVER duplicates the
sink's SQL. The sink's argv surface (shared fields only):

- Forwarded: `--slug --id --title --chosen --rationale --alternatives --status
  --timestamp` (and bare `--blocking` only when writer's `--blocking=true`).
- NEVER forwarded: `--actor`, `--iteration` (JSON-only per FR-5), `--project`
  (sink derives from git toplevel; Q-6), `--supersede` (encoded via
  `--status`).

## Components (ARCH §1)

This skill is the composition root for two components:

- `cfn-decisions-writer`: this skill's `record.sh` + `lib/*.sh`. Owns the
  per-run JSON. Owns NO database table.
- `cfn-decisions-hook`: logical component. The OP-H1 wrapper lives inline at
  each coordinator site (no new file). Wired by Lane B at 4 sites.

Two LOCKED consumers (called, never modified):

- `decision-log/record.sh` + `schema.sql` (SQLite sink).
- `cfn-workbench/lib/section-decisions.sh` (renderer; reads the JSON).

## Dependencies

- `bash` 4+, `jq` 1.6+, `date`, `mktemp`, `mv`, `rm`, `timeout`, `grep`.
- Subprocess: `decision-log/record.sh` (LOCKED; called via PATH lookup).
- Tests: `bash`, `jq`, `sqlite3` (via the sink; never opened by the writer).

No `node`, `python`, `ruby`. No Anthropic API calls. No em dashes in the
writer's OWN code, comments, or this SKILL.md (NFR-5). Caller-supplied text
(`--rationale`, `--alternatives`) is persisted verbatim; em dashes there are
the caller's data, not the writer's code (EC-22 carve-out).

## Tests

```bash
bash .claude/skills/cfn-decisions/tests/run-all.sh
```

One `.sh` file per AC group. TDD ordering (TEST Phase 6) puts AC-2 (upsert
cardinality) and AC-4 (atomic write) RED FIRST. Each file exits 0 on pass,
non-zero on fail. Plain bash + jq + grep, no bats.
