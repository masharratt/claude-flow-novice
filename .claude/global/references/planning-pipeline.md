# Planning Pipeline Details

Sub-pipeline descriptions, conditional-phase rules, and track-split evidence for the planning pipeline in `~/.claude/CLAUDE.md`. Load when choosing among planning skills or composing pipeline stages standalone.

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
