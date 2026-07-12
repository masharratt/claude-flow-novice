# Agent Prelude (shared rules, read before starting any task)

## 1. Edit Safety
Before every file edit:
```bash
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$AGENT_ID")
```
After every file edit:
```bash
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "$AGENT_ID"
```
Rollback uses the backup scripts, never `git checkout`.

## 2. CodeSearch First
Query CodeSearch BEFORE grep/glob/find:
```bash
/codebase-search "query" --top 5
```
Use grep only if CodeSearch returns zero results.

## 3. Test Output Capture
```bash
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
<test-cmd> 2>&1 | tee "$OUT"
```
- Never watch mode: `vitest run`, not `vitest`.
- No bail flags (`-x`, `--bail`, `--fail-fast`). See every failure in one run.
- Use verbose reporters (`--reporter=verbose`, `--verbose`, `-v`).
- Compile errors are not test failures. Run `tsc --noEmit` (TS) or
  `cargo check --message-format=short` (Rust) first and dump ALL compile
  errors in one pass before blaming tests.

## 4. Test-Execution Ownership
- Loop 3 implementers run ONLY their own scoped test files, with the capture
  pattern above.
- Loop 2 validators and the product-owner NEVER run tests. They read the
  captured output file passed in their prompt. If no output file is provided,
  the verdict is FAIL with issue "no test evidence provided".
- Only the coordinator runs full suites.

## 5. Scope Fence
- Edit ONLY files named in your task prompt. If another file needs changing,
  report it under "out_of_scope_needs" in your final message; do not edit it.
- **"out_of_scope_needs" is a BLOCKING gate, not prose (S006).** The coordinator
  persists every entry to `planning/.DEFERRALS_<slug>.json`
  (`deferrals.sh record`, cfn-loop-task.md Step 3.01) and Phase 5's exit gate
  (5E.4a, `deferrals.sh gate`) refuses to declare done while any entry is open
  and blocking. Every entry defaults to blocking (fail-closed) until an
  explicit `deferrals.sh resolve` closes it. Naming a file or step ANOTHER
  LANE was supposed to finish (e.g. "src/index.ts: needs the new provider
  wired in") is exactly the orphan-creating shape that must block — this is
  the mechanical fix for MP-A, which shipped a feature 81/81 green while
  unreachable from its production entrypoint because the implementer's
  correctly-flagged deferral was never read by anything (see
  ROOTCAUSE_mpa_thread_wiring_gap.md). Do not use this field to quietly punt
  work you suspect nobody will revisit — it now stops the loop until someone
  does.
- No drive-by refactors, renames, or formatting-only changes.
- No new dependencies. If stdlib/existing deps are insufficient, stop and report.
- Every DELETE in test code needs a WHERE clause scoped to test-marker rows.
- Redact credentials, tokens, and PII as [REDACTED].
- No em dashes in code, comments, or copy.

## 6. Test Framework Detection (detect and match, never mix)
```bash
# Detect existing test framework
if grep -q "vitest" package.json 2>/dev/null; then
  FRAMEWORK="vitest"
elif grep -q "jest" package.json 2>/dev/null; then
  FRAMEWORK="jest"
elif ls *.test.ts *.spec.ts 2>/dev/null | head -1 | xargs grep -l "vitest\|vi\." 2>/dev/null; then
  FRAMEWORK="vitest"
elif ls *.test.ts *.spec.ts 2>/dev/null | head -1 | xargs grep -l "jest\|expect(" 2>/dev/null; then
  FRAMEWORK="jest"
fi
```

| Check | Action |
|-------|--------|
| `vitest` in package.json | Use vitest patterns: `vi.fn()`, `vi.mock()` |
| `jest` in package.json | Use jest patterns: `jest.fn()`, `jest.mock()` |
| Existing `*.test.ts` files | Match their import style exactly |
| `vitest.config.ts` exists | Use vitest |
| `jest.config.js` exists | Use jest |

**NEVER mix frameworks. If project uses vitest, do NOT import from jest. If project uses jest, do NOT import from vitest.**

## 7. Final Message Contract (implementers)
Canonical implementer contract JSON, reported as the last block of your final message:
```json
{"lane": "<lane>", "tests_written": N, "scoped_tests_passed": N, "scoped_tests_total": M, "files_modified": [], "phases_complete": [], "out_of_scope_needs": [], "blocked_on": null | "<one sentence>", "confidence": 0.0}
```
out_of_scope_needs = out-of-lane file needs ("path: why") — BLOCKING until resolved (see §5); blocked_on = own-lane blocker only (one sentence, else null).
