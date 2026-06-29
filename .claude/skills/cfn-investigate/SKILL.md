---
name: cfn-investigate
description: "Root-cause debugging: 5-phase protocol, 3-strike escalation, scope lock. Enforces investigation before fixes. Use when diagnosing bugs, system failures, or unexpected behavior."
version: 1.0.0
tags: [debugging, root-cause, investigation, safety]
status: production
---

# CFN Investigate

**Purpose:** Enforce systematic root-cause debugging. No fixes without investigation.

## Protocol

### Phase 1: Symptom Collection

- Collect exact error messages, stack traces, logs.
- Identify when the bug was introduced (`git log`, `git bisect`).
- Reproduce deterministically. If you cannot reproduce, you cannot fix.
- Check cfn-knowledge-base for prior similar issues.
- Query decision log for prior investigations: `~/.claude/skills/decision-log/query.sh '<error-message-keywords>' 5 <project>`

### Phase 2: Root Cause Hypothesis

- Trace the symptom backward through data flow.
- Form a specific, testable hypothesis: "Root cause is X at file:line because Y."
- Match against known signatures: race conditions, nil propagation, state corruption, integration failure, config drift, stale cache.
- Do NOT propose fixes yet.

### Phase 3: Hypothesis Testing

- Add targeted debug output at the suspected root cause.
- Run reproduction to confirm or reject.
- If rejected, gather more evidence. Do not guess.
- **3-STRIKE RULE:** If 3 hypotheses fail, STOP and escalate to the user. Options:
  - (a) New hypothesis with user input
  - (b) Human review
  - (c) Add logging and revisit later

### Phase 4: Targeted Fix

- Fix the root cause, not the symptom.
- Minimal diff. Do not refactor surrounding code.
- Write a regression test that fails without the fix and passes with it.
- Run full test suite using the standard capture pattern so all failures show in one pass:
  ```bash
  OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
  <test-cmd> 2>&1 | tee "$OUT"
  ```
  No watch mode, no bail/fail-fast flag. Read `"$OUT"` for the complete failure set.

### Phase 5: Verification

- Reproduce the original bug and confirm it is fixed.
- Verify no new failures introduced.
- Output structured report:
  - **Symptom:** what was observed
  - **Root cause:** what caused it (file:line)
  - **Fix:** what was changed
  - **Evidence:** how root cause was confirmed
  - **Regression test:** location of the test

## Red Flags (stop and reassess)

- "Quick fix for now": there is no "for now." Fix it right or escalate.
- Proposing a fix before tracing data flow: you are guessing.
- Each fix reveals a new problem elsewhere: wrong architectural layer.

## Scope Lock

During investigation, edits should be restricted to the affected module. Use cfn-edit-safety to create backups before any changes. Do not fix unrelated issues discovered during investigation. Log them to TODO instead.

## Integration

- Query cfn-knowledge-base before starting (check for prior similar bugs).
- Log findings to cfn-knowledge-base when complete.
- Works with cfn-edit-safety for backup/restore during hypothesis testing.
