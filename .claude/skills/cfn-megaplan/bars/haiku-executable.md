# Bar B — Haiku-Executable Gate

**Type:** Quality gate (not a phase). Tier-independent — runs at full strength for MVP, Beta, Enterprise.
**Invoked by:** `cfn-megaplan` orchestrator inside `plan_review`, after the plan is assembled.
**Purpose:** Reject any plan that needs a judgment call. A haiku-level agent must be able to execute every step with zero clarifying questions. Ambiguity is where the wrong thing gets built (the dropdown-as-text-box class of bug).

## The rule

The plan fails the gate if a step requires the implementer to decide, infer, locate, or guess anything not stated.

## Specificity checklist (every item must pass)

1. **Files** — every step names a full path. No "the relevant component", "the auth module", "wherever X lives".
2. **Signatures** — every function/method to add or change is given typed args + return. No "a helper that does X".
3. **UI controls** — every field names its explicit control type via the cfn-ux affordance map (dropdown vs input vs toggle vs date-picker). No "an input for course".
4. **Value sources** — every value names its origin: which table column, which env var, which constant, which upstream field. No "the configured value".
5. **Branches** — every branch enumerated in PSEUDO maps to a named step. No silent fall-through.
6. **No weasel words** — zero occurrences of: appropriately, as needed, as appropriate, handle accordingly, figure out, etc., and so on, TBD, properly, gracefully (without a defined behavior), where applicable.
7. **States** — for any UI surface, loading / empty / error / success / partial / disabled each have a named handling step (sourced from cfn-ux).
8. **Errors** — every external call (DB, HTTP, queue) names its error path. No bare happy-path-only step.

## Gate logic (orchestrator runs this)

1. **Static scan (mandatory first pass, before the haiku probe):** run `bars/check-haiku-static.sh <plan file>`. It greps the plan for the banned vague-phrase list (item 6) and prints a JSON findings array (`file`, `line`, `phrase`); exit 0 = clean, exit 1 = findings. Every finding enters the Bar B findings list with kind `weasel`. Do not hand-grep; the script is the single source of the scan.
2. **Structural scan** — assert each implementation step has: file path, and (if code) a signature, and (if UI) a control type, and (if external I/O) an error path.
3. **Coverage scan** — assert every PSEUDO branch id appears in a step.
4. **Live haiku probe (the real test):** spawn a haiku-tier agent with the plan and the instruction: *"You will build exactly this. List every question you must ask before you can start. If you have zero questions, output PASS."*

   Parsing rule (mechanical, no judgment):
   - The probe passes ONLY if the agent's entire final message, trimmed, equals `PASS`.
   - Otherwise split the message into lines; every line containing `?` becomes a `probe_question` finding verbatim.
   - Lines matching `which test runner|which branch|where do I run` are harness noise: log as `probe_noise`, not findings.
   - Run the probe once per round. Never re-run the probe within a round hoping for a different answer.
5. **FAIL the plan** if the static, structural, coverage, or probe scan produces any finding.

## Probe spawn (step 4)

```
Agent(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Haiku executability probe",
  prompt: "You are about to implement the plan below with no further context and no ability to ask follow-ups mid-build. BEFORE starting, list every clarifying question you would need answered to build it exactly as specified — control types, file paths, value sources, error behavior, edge-case handling. If you have ZERO questions, output exactly: PASS. Plan:\n\n<plan content>"
)
```

## Output contract

```json
{
  "slug": "<task-slug>",
  "passed": false,
  "findings": [
    { "step": "3.2", "kind": "weasel", "detail": "'handle the response appropriately' — name the success and error branch" },
    { "step": "4.1", "kind": "ui_control", "detail": "field 'course' has no control type — apply cfn-ux affordance map" },
    { "step": "5.0", "kind": "probe_question", "detail": "haiku asked: which table does the status dropdown read from?" }
  ]
}
```

Each finding routes back to the owning phase to fix (ui_control → cfn-ux, value source → cfn-data/arch, branch → cfn-pseudo). The orchestrator loops the failing phase, not the whole pipeline. Rounds are bounded: the orchestrator runs at most 3 Bar B rounds, then surfaces residual findings to the user (cfn-megaplan Step 6).
