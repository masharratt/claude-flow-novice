---
name: cfn-pseudo
description: "SPARC Pseudocode phase. Trace logic, enumerate branches, find failure paths, verify branch coverage BEFORE writing real code. Use after cfn-spec to catch logic gaps before implementation."
version: 1.0.0
tags: [planning, sparc, pseudocode, algorithm, logic, branch-coverage]
status: production
---

# CFN Pseudo Skill (SPARC Phase 2)

**Purpose:** Force a logic trace through every acceptance criterion and edge case BEFORE code exists. Surfaces algorithmic gaps, missing branches, and complexity issues at the cheapest possible stage.

**Phase:** Pseudocode. DAG level 3 in the canonical `cfn-megaplan` pipeline (after `cfn-spec`, in parallel with `cfn-decide`). Also SPARC step 2 of 3 in the lighter `cfn-spa-plan` sub-pipeline.

## When to Use

- After `cfn-spec` produces `planning/SPEC_<task>.md`
- Auto-invoked by `/cfn-megaplan` (canonical) and the lighter `/cfn-spa-plan` sub-pipeline
- Standalone when reviewing existing code for logical completeness

Skip only for: pure config changes, declarative schema updates with no procedural logic.

## Input

Required: `planning/SPEC_<task>.md` from `cfn-spec`. Refuse to run if spec missing or has unresolved `[OPEN]` questions.

## Protocol

### Step 1: Map FRs to Operations

For each FR in the spec, identify the procedural operation(s) needed. One FR may span multiple operations; one operation may serve multiple FRs.

Output table:
```
| FR    | Operation              | Inputs           | Outputs           |
|-------|------------------------|------------------|-------------------|
| FR-1  | validateUserPayload    | UserInput        | ValidUser | Error |
| FR-2  | persistUser            | ValidUser        | UserRecord        |
```

### Step 2: Pseudocode Per Operation

Use language-neutral pseudocode. Numbered steps. Explicit branches. No syntactic sugar that hides logic.

Format:
```
FUNCTION <name>(<params>):
  1. <step>
  2. IF <condition> THEN
       2a. <branch>
     ELSE
       2b. <branch>
  3. FOR <each> IN <collection>:
       3a. <action>
  4. RETURN <value>
```

Rules:
- Every branch must trace to a postcondition from the spec
- Every loop must declare termination condition
- Every external call (DB, API, file) must declare failure handling

### Step 3: Branch Coverage Map

For each pseudocode operation, map every branch to the acceptance criterion or edge case it satisfies. Branches with no mapping = dead code OR missing acceptance criterion.

Format:
```
Operation: validateUserPayload
  Branch 2a (valid input)     -> AC-1 (happy path)
  Branch 2b (invalid email)   -> EC-3 (malformed email returns 400)
  Branch 2b (missing field)   -> EC-7 (missing required field returns 400)
  [UNMAPPED] Branch 2c        -> ??? must add EC or remove branch
```

### Step 4: Complexity Annotation

For each operation, declare:
- Time complexity (Big-O, average + worst case)
- Space complexity
- Number of external I/O calls (DB queries, API calls, file ops)
- Whether operation is idempotent
- Whether operation is reentrant

If any operation is O(n^2) or worse, justify or refactor.
If any operation makes >3 external I/O calls, flag for batching.

### Step 5: Failure Path Trace

For each external dependency in pseudocode:
- What happens on timeout?
- What happens on transient error (retry semantics)?
- What happens on permanent error (rollback, compensation)?
- What state does the system end in after failure?

Map every failure path to an edge case in the spec. Unmapped failure paths = spec incomplete; loop back to `cfn-spec`.

### Step 6: Data Structure Declarations

List every non-trivial data structure used. Justify choice (hash for O(1) lookup, sorted list for range queries, etc.). If reusing existing structure from codebase, link to it.

### Step 7: State Transition Diagrams (when applicable)

If any entity has a lifecycle (draft → published → archived), draw a state machine. Use ASCII or mermaid. Every transition must have a trigger and effect.

## Output

Write to: `planning/PSEUDO_<sanitized-task-name>.md`

Template:
```markdown
# Pseudocode: <task>

**Date:** <YYYY-MM-DD>
**Spec:** planning/SPEC_<task>.md
**Status:** draft | reviewed | locked

## 1. Operation Map
| FR | Operation | Inputs | Outputs |

## 2. Pseudocode
### Operation: <name>
FUNCTION ...

## 3. Branch Coverage
Operation: <name>
  Branch X -> AC/EC mapping

## 4. Complexity
| Operation | Time | Space | I/O | Idempotent | Reentrant |

## 5. Failure Paths
External Dep: <name>
  Timeout -> <behavior>
  Transient -> <behavior>
  Permanent -> <behavior>

## 6. Data Structures
- <name>: <type> -- <justification>

## 7. State Transitions
(if applicable)
```

## Handoff

Input to `cfn-arch`. Do not proceed to architecture phase if branch coverage has any `[UNMAPPED]` entries.

## Anti-Patterns

- Pseudocode that is just JavaScript without semicolons
- Branches with no AC/EC mapping (= dead code or missing spec)
- "Handle errors" as a pseudocode step (specify the handling)
- Skipping complexity annotation because "it's obvious"
- External I/O without failure path

## Related

- Canonical orchestrator: `cfn-megaplan` (runs this at DAG level 3, parallel with `cfn-decide`)
- Previous phase: `cfn-spec`
- Parallel phase: `cfn-decide` (decision register)
- Next phase: `cfn-arch`
- Lighter orchestrator: `cfn-spa-plan`
