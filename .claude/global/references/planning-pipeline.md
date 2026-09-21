# Planning Pipeline Details

Sub-pipeline descriptions, conditional-phase rules, and track-split evidence for the planning pipeline in `~/.claude/CLAUDE.md`. Load when choosing among planning skills or composing pipeline stages standalone.

**Status 2026-09-21:** the megaplan family is deprecated for ordinary feature work; Fable-class models made its ceremony cost more than the errors it caught. Plain plan mode is the default. Reach for the megaplan skills only per the routing in CLAUDE.md (genuine multi-part mvp/beta programs → `-fast`; enterprise/compliance/ops/migration-rehearsal → full).

## Sub-pipelines megaplan composes (run standalone only for narrow/iterative work)

- `/cfn-spa-plan` — spec + pseudo + arch only, no tiering or extra phases.
- `/write-plan` — implementation roadmap, agent dispatch, TDD phases.
- `/cfn-plan-review` — assumption extraction, dependency trace, blast radius.
- `/cfn-megaplan-lite`: balanced cut of megaplan for medium features (3-7 files, single shared-state surface); both bars 1-round, no live probe, pseudo folded into arch, sonnet non-core phases.
- `/cfn-megaplan-fast`: token-lean planner for multi-part programs (and cheapest safe path for single features). One program-level spec/data/arch/ux, then per-part test-plan + write-plan + Bar A over `extract-sections.sh` slices (`--part-specs` auto-adds a 12KB per-part SPEC when parts are distinct domains); `check-size.sh` caps every artifact; Bar B static lint only. Same loop-task hand-off. Measured reason: a 7-part megaplan program cost ~10M output tokens.
- `/cfn-knowledge-plan`: non-code deliverables. Route here when the output is prose, not code. A doc that specifies a build still goes to `/cfn-megaplan`. Hand raw sources (full transcript, whole PDF) to intake — summarising first destroys the signal extraction mines.
- `/cfn-share`: hand a plan to someone who does not live in a terminal. Always pass the recorded `url` on re-shares or the reader's link is orphaned.

## Conditional phases

Conditional phases (frontend/db/pii/unknowns) auto-resolve from cfn-spec build flags; the security floor (RLS/auth/secrets/no-unscoped-delete/PII) is forced on regardless of tier. Outputs `planning/*_*.md` per phase.

## Manifest vs session track: evidence for the split

Megaplan's own artifacts have shipped binding defects (PLAN steps naming the same AC, ACs with no producing step) and S007 failures (rows inline-pinning a DB with no `requires`, grading red when the local stack is down) — a blessed manifest buys tamper-evidence and a mechanical gate, which is worth real money on a policy that can silently leak a hidden attendee and worth nothing on a page where the test is that you look at it.

## Manifest vs Session track (full table)

`cfn-loop-task` requires `PLAN_<slug>.md` but not `VERIFY_<slug>.md` — without VERIFY there is no mechanical Bar A all-green done gate, only gate-vote opinion (dry-review, security-review, a11y, dep-audit, 3-vote still run off manifest build flags, not VERIFY presence). Once SPEC/DATA/ARCH/UX already exist for a feature, the live question per surface is only: **can this be wrong quietly?**

| Track | Criterion | Process |
|---|---|---|
| Manifest track | Wrong state is invisible until someone is harmed: RLS, `can_view_person`-class visibility, chat/booking state, block enforcement, anything writing policy | `/write-plan` from existing artifacts → Bar A → blessed VERIFY → `cfn-loop-task` |
| Session track | Wrong state is visible the moment you open the page: content pages, display/read surfaces, info/FAQ, schedule display | Plan mode in its own session, TDD, `cfn-loop-task` with PLAN only, no VERIFY |

Split **per surface, not per feature** — one feature can straddle both (a schedule feature's display half is session track, its visibility-policy half is manifest track).

## Canonical order (when a megaplan-tier run is actually warranted)

Code builds: `/cfn-megaplan` (program-scale entry, tiered DAG wrapping write-plan + plan-review, gated by Verifiable-done + Haiku-executable bars; `--tier=mvp|beta|enterprise`; internally runs write-plan and cfn-plan-review) → `/cfn-loop-task` (execution, subscription-backed; Verifiable-done manifest is the completion gate). Optional: `/cfn-goap-plan` (goal-state modeling + A* action sequence) before or during.

Non-code branch (deliverable is a document, not a build): `/cfn-knowledge-plan` (strategy docs, proposals, research memos; Bar K grounding + weasel scan; NO drafting before KPLAN_<slug>.md is approved) → `/cfn-share` (publish as a private page with a stable URL; re-shares update the same link).

Routing wrong is the primary cause of intent drift, missed edge cases, and the dropdown-as-textbox class of UI bugs.
