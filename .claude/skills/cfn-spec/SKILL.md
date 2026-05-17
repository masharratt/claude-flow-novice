---
name: cfn-spec
description: "SPARC Specification phase. Generate testable acceptance criteria, enumerate edge cases, define pre/post conditions and invariants BEFORE planning implementation. Use when starting any non-trivial task to lock intent and surface ambiguity early."
version: 1.0.0
tags: [planning, sparc, specification, requirements, edge-cases]
status: production
---

# CFN Spec Skill (SPARC Phase 1)

**Purpose:** Convert vague task descriptions into testable, unambiguous specifications. Force explicit enumeration of edge cases and acceptance criteria before any code or pseudocode exists.

**Phase:** Specification (SPARC step 1 of 3 used by `/cfn-spa-plan`).

## When to Use

- Any task touching 2+ files, shared state, or external APIs
- Any task where the user's words leave room for interpretation
- Before `/write-plan`, `/cfn-loop-cli`, or plan mode for non-trivial work
- Auto-invoked by `/cfn-spa-plan` orchestrator (preferred entry point)

Skip only for: single-line fixes, rename refactors with no logic change, obvious bug fixes with reproducing test.

## Protocol

### Step 0: Scope Challenge

Before writing the spec, answer:
- Minimum viable interpretation of this task?
- Does similar capability already exist in the codebase? (Run `/codebase-search` first.)
- If scope spans 8+ files, stop. Negotiate scope with user before continuing.

### Step 1: Functional Requirements

Numbered list. Each requirement = one observable behavior. No implementation hints.

Format:
```
FR-1: System SHALL <behavior> WHEN <trigger> GIVEN <preconditions>.
FR-2: ...
```

### Step 2: Non-Functional Requirements

Performance, security, accessibility, observability. Each NFR must include a measurable threshold.

Format:
```
NFR-1: Response p95 latency < 200ms under 100 RPS load.
NFR-2: All endpoints require authenticated session; 401 on missing/invalid token.
```

### Step 3: Acceptance Criteria (Gherkin)

For every FR, write at least one Given/When/Then. These become test cases in `/write-plan`.

```
Scenario: <name>
  Given <precondition>
  When <action>
  Then <observable outcome>
  And <secondary outcome>
```

### Step 4: Edge Case Enumeration (MANDATORY, ≥5)

The point of this skill. List every boundary condition. Force at least five entries even for simple tasks — if fewer than 5 surface, you have not thought hard enough.

Categories to walk through:
- **Empty inputs:** null, undefined, empty string, empty array, zero
- **Boundary values:** min, max, off-by-one, integer overflow
- **Concurrency:** race conditions, duplicate submissions, stale reads
- **Failure modes:** network timeout, DB down, partial write, retry semantics
- **Auth/permission:** unauthenticated, unauthorized, expired token, role mismatch
- **Data quality:** malformed input, encoding issues, injection, oversized payload
- **State transitions:** invalid state for operation, already-completed, deleted entity
- **Time:** clock skew, timezone, DST, leap second, future/past dates
- **Locale/i18n:** Unicode, RTL, surrogate pairs, normalization
- **Resource limits:** rate limit hit, quota exceeded, disk full, OOM

For each edge case, state the expected behavior. "Returns 400 with error code INVALID_X" not "handles gracefully".

### Step 5: Pre/Post Conditions and Invariants

For each operation in scope:
```
Operation: <name>
  Preconditions: <what must be true to invoke>
  Postconditions (success): <what is true after success>
  Postconditions (failure): <what is true after failure, including rollback semantics>
  Invariants: <what NEVER changes regardless of outcome>
```

### Step 6: Out of Scope

Explicit list of things NOT covered by this spec. Forces the implementer to escalate scope creep instead of silently expanding.

### Step 7: Open Questions

If any spec section depends on a decision the user has not made, list it as an open question with options. Do not assume.

## Output

Write to: `planning/SPEC_<sanitized-task-name>.md`

Template:
```markdown
# Specification: <task>

**Date:** <YYYY-MM-DD>
**Author:** spec phase (cfn-spec)
**Status:** draft | reviewed | locked

## 1. Functional Requirements
FR-1: ...

## 2. Non-Functional Requirements
NFR-1: ...

## 3. Acceptance Criteria
Scenario: ...

## 4. Edge Cases
EC-1: <case> -> <expected behavior>
EC-2: ...
(minimum 5)

## 5. Pre/Post Conditions
Operation: ...

## 6. Out of Scope
- ...

## 7. Open Questions
- Q-1: ...
```

## Handoff

This artifact is the input to `cfn-pseudo`. Do not advance to pseudocode phase until all `[OPEN]` questions are resolved or accepted as parking-lot items.

## Anti-Patterns

- Writing implementation hints in FRs ("uses Redis to cache...")
- "Handles errors gracefully" without specifying behavior
- Fewer than 5 edge cases (signals shallow thinking)
- Acceptance criteria that don't map to a testable observable
- Assuming missing information instead of recording as Open Question

## Related

- Next phase: `cfn-pseudo` (algorithm trace)
- Then: `cfn-arch` (component contracts)
- Orchestrator: `cfn-spa-plan` (auto-chains all three)
- Downstream: `/write-plan` consumes SPEC artifact
