# Bar B — Haiku-Executable Gate

**Type:** Quality gate (not a phase). Runs for MVP, Beta, Enterprise; the **executor tier** (below) sets how literal a step must be.
**Invoked by:** `cfn-megaplan` orchestrator inside `plan_review`, after the plan is assembled.
**Purpose:** Reject any plan that needs a judgment call *the executor cannot make*. Ambiguity about WHAT to build is where the wrong thing gets built (the dropdown-as-text-box class of bug). Ambiguity about HOW to spell a signature is not, when the executor is sonnet-tier.

## Executor tier (`bars.haiku_executable` in the profile, `--bar-b=full|sonnet` overrides)

| Tier | Executor it models | What a step must state | Live probe |
|---|---|---|---|
| `full` | haiku lane, no coordinator | items 1-9 verbatim: full path, **typed signature**, control type, value source, branches, no weasel, states, errors, DI | yes (haiku, once per round) |
| `sonnet` (default at mvp/beta) | opus coordinator + sonnet lanes | items 1, 3-9 verbatim; item 2 relaxed to **file + symbol name + done predicate** (typed args/return optional; the lane picks them, the failing test + done predicate pin the behavior) | no |

Everything about *what* is built stays at full strength in both tiers: control types, value sources, branch coverage, UI states, error paths, core-FR DI, zero weasel words. `sonnet` only stops requiring the plan to spell out *how the code is shaped* when a named symbol plus a runnable done predicate already pins it. Rationale: cfn-loop-task's real executor is an opus coordinator driving sonnet lanes with exclusive file ownership; the coordinator is the clarifying layer the haiku probe simulated (same reasoning `cfn-megaplan-lite` used to drop the probe). `enterprise` keeps `full`.

Choose `full` even at mvp/beta when lanes will run at haiku, or when a plan will be executed by an agent with no coordinator (a `claude -p` batch, an external contractor). Never lower `full` on a plan whose `[core]` FRs cross a composition root (item 9) without the DI table in `cfn-arch` §2, the one place `sonnet` tier still needs a literal signature.

## The rule

The plan fails the gate if a step requires the implementer to decide, infer, locate, or guess anything not stated **that the executor tier does not license it to decide**.

## Specificity checklist (every item must pass)

1. **Files** — every step names a full path. No "the relevant component", "the auth module", "wherever X lives".
2. **Signatures** — every function/method to add or change is given typed args + return. No "a helper that does X". (`sonnet` tier: file + symbol name + a done predicate that pins behavior is sufficient; typed args/return are optional. "a helper that does X" is still rejected: the symbol must be named.)
3. **UI controls** — every field names its explicit control type via the cfn-ux affordance map (dropdown vs input vs toggle vs date-picker). No "an input for course".
4. **Value sources** — every value names its origin: which table column, which env var, which constant, which upstream field. No "the configured value".
5. **Branches** — every branch enumerated in PSEUDO maps to a named step. No silent fall-through.
6. **No weasel words** — zero occurrences of: appropriately, as needed, as appropriate, handle accordingly, figure out, etc., and so on, TBD, properly, gracefully (without a defined behavior), where applicable.
7. **States** — for any UI surface, loading / empty / error / success / partial / disabled each have a named handling step (sourced from cfn-ux).
8. **Errors** — every external call (DB, HTTP, queue) names its error path. No bare happy-path-only step.
9. **Non-optional core-FR dependency injection.** A component mapped to a SPEC `core_fr` MUST be a REQUIRED (non-optional) dependency at the composition root named in `cfn-arch` §1 — so a build that omits it is a COMPILE ERROR, not a silent runtime no-op. Any optionality on such a component's dependency requires an explicit `planning/DECISIONS_<slug>.md` entry (a `D-n` row naming the ceiling and the upgrade trigger); an inline code comment does NOT satisfy this — MP-A's `thread?:` optional dep was justified only by an inline comment and no `D-n` row authorized it (`/home/masha/projects/daily-agents/planning/ROOTCAUSE_mpa_thread_wiring_gap.md`).

   **The conflation trap (name it explicitly when reviewing).** ARCH may legitimately widen a *call-site seam* to be optional for backward compatibility (e.g. `postCard(msg, opts?.thread)` so pre-existing callers still compile) — that is a decision about one call site tolerating absence, not a decision that the *composition-root dependency itself* may be omitted. MP-A's implementer conflated "the seam tolerates no-thread" with "the daemon may omit the manager entirely," and the conflation is what let `thread?:` on the daemon's own dependency type compile clean with the feature never built. A plan step or interface widening a call-site seam does NOT license making the composition-root injection optional; if a step does both, it is two separate decisions and only the seam-widening one is pre-authorized.

## Gate logic (orchestrator runs this)

1. **Static scan (mandatory first pass, before the haiku probe):** run `bars/check-haiku-static.sh <plan file> [core-fr-interfaces-file]`. With one arg it greps the plan for the banned vague-phrase list (item 6) and prints a JSON findings array (`file`, `line`, `phrase`, `severity`); exit 0 = clean, exit 1 = error-severity findings. Every `severity:error` finding enters the Bar B findings list with kind `weasel`. Do not hand-grep; the script is the single source of the scan.

   **Optional-DI mechanical assist (item 9, WARN severity only — scoped, not a repo-wide scan).** When a second argument is supplied, the script also greps ONLY the plan lines that reference a file:Symbol pair named in that file for the TypeScript optional-property token `\w+\?:`, emitting a `severity:warn` finding per hit (never `error` — this never fails the gate by itself). The interfaces file is one `file[:Symbol]` per line, derived by the orchestrator from `cfn-arch` §2's Core-FR Dependency Interfaces table (one line per `required`-column-eligible row) — e.g. `planning/<slug>/.core-fr-interfaces_<slug>.txt` containing `src/poll-loop.ts:PollLoopDeps`. `cfn:` scoped-bash-grep ceiling, not a general TS optional-DI detector: it cannot tell whether a `?` on a component NOT named in the interfaces file matters, and it cannot tell whether an optional dep found this way already carries a `D-n` DECISIONS entry — both require a real TS AST (ts-morph/tsc) to resolve; upgrade trigger: this WARN's false-positive/negative rate becoming high enough that reviewers start ignoring it. Resolution of every WARN (is this component core_fr, is the DECISIONS ref present) happens at the live haiku probe / owning-phase review, not mechanically.
2. **Structural scan** — assert each implementation step has: file path, and (if code) a signature (`full`) or a named symbol (`sonnet`), and (if UI) a control type, and (if external I/O) an error path.
3. **Coverage scan** — assert every PSEUDO branch id appears in a step.
4. **Live haiku probe (`full` tier only; skipped at `sonnet`):** spawn a haiku-tier agent with the plan and the instruction: *"You will build exactly this. List every question you must ask before you can start. If you have zero questions, output PASS."*

   Parsing rule (mechanical, no judgment):
   - The probe passes ONLY if the agent's entire final message, trimmed, equals `PASS`.
   - Otherwise split the message into lines; every line containing `?` becomes a `probe_question` finding verbatim.
   - Lines matching `which test runner|which branch|where do I run` are harness noise: log as `probe_noise`, not findings.
   - Run the probe once per round. Never re-run the probe within a round hoping for a different answer.
5. **FAIL the plan** if the static, structural, coverage, or (at `full`) probe scan produces any finding. Record the tier the gate ran at in the gate report (`bar_b_tier`), so a later re-gate does not silently run at a different bar.

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
  "bar_b_tier": "sonnet",
  "passed": false,
  "findings": [
    { "step": "3.2", "kind": "weasel", "detail": "'handle the response appropriately' — name the success and error branch" },
    { "step": "4.1", "kind": "ui_control", "detail": "field 'course' has no control type — apply cfn-ux affordance map" },
    { "step": "5.0", "kind": "probe_question", "detail": "haiku asked: which table does the status dropdown read from?" },
    { "step": "6.2", "kind": "optional_di", "severity": "warn", "detail": "src/poll-loop.ts:PollLoopDeps declares 'thread?:' — component maps to core_fr FR-20; make it required or add a DECISIONS D-n entry naming ceiling + upgrade trigger" }
  ]
}
```

Each finding routes back to the owning phase to fix (ui_control → cfn-ux, value source → cfn-data/arch, branch → cfn-pseudo, optional_di → cfn-arch §2 Core-FR Dependency Interfaces table or cfn-decide for the DECISIONS entry). The orchestrator loops the failing phase, not the whole pipeline. Rounds are bounded: the orchestrator runs at most 3 Bar B rounds, then surfaces residual findings to the user (cfn-megaplan Step 6).
