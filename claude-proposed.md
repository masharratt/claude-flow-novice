# Claude Flow Novice — Proposed Ops Guide (vNext)

**Status:** v2.9.1 (Namespace Isolation complete — 2025-10-25)

## 1. Purpose & Scope
- Single source of truth for how we operate this repo after namespace isolation.
- Focuses on day-to-day execution: when to delegate, how to run CFN Loop, how to document, and which skills/assets to touch.

## 2. Operating Principles

### Core workflow rules
- Use specialized agents for every task that exceeds three concrete steps or spans multiple files/domains.
- For CFN Loop work, Main Chat issues CLI commands only (<code>/cfn-loop-cli</code> preferred; <code>/cfn-loop-task</code> only when explicitly debugging). Never spawn CFN Loop agents manually with <code>Task()</code>.
- Initialize or restore swarm context before coordinating multi-agent efforts; batch related actions (spawns, file edits, hooks, todos) into single messages.
- Keep implementers and validators separated; run validators only after implementers signal completion.
- Execute tests outside of agents; agents can request or analyze results but never run the suites themselves.
- Keep responses concise, plain-english, and free of unnecessary examples unless the user asks.
- Monitor long-running background work with a <code>sleep N</code> → check → repeat loop to avoid timeouts.
- Never store deliverables in the repo root; respect intended subdirectories.

### Output & documentation standards
- Bugs → <code>docs/BUG_<id>_<slug>.md</code>
- Features or process docs → <code>docs/FEATURE_NAME.md</code>
- Test artifacts → <code>tests/test-*.sh</code> plus durable outputs under <code>tests/</code>
- Temporary scratch → <code>/tmp/</code> only
- Backlog deferrals → <code>.claude/skills/cfn-backlog-management/add-backlog-item.sh</code>
- Changelog entries → <code>.claude/skills/cfn-changelog-management/add-changelog-entry.sh</code>
- Full policy reference → <code>docs/AGENT_OUTPUT_STANDARDS.md</code>

### Confidence & consensus
- Loop 3 gate: each implementer reports ≥0.75 confidence to unlock validation.
- Loop 2 consensus: aggregate ≥0.90 required before Product Owner review.

## 3. Execution modes

| Mode | When to use | Spawn pattern | Cost or visibility |
|------|-------------|---------------|--------------------|
| CLI (<code>/cfn-loop-cli ... --mode=standard</code>) | Production-default for every CFN Loop (multi-agent, implementation work, cost sensitivity) | Main Chat → <code>cfn-v3-coordinator</code> → orchestrator <code>./.claude/skills/cfn-loop-orchestration/orchestrate.sh</code> | Lowest cost (≈$0.054/iteration via Z.ai routing), background with persistence |
| Task (<code>/cfn-loop-task ... --mode=standard</code>) | Debugging or teaching when full visibility is required | Main Chat spawns every agent via <code>Task()</code> | Higher cost (≈$0.150/iteration) but transparent logs |
| Single agent <code>Task("role", "...")</code> | Truly isolated specialist work (one reviewer, a copy edit, etc.) | Direct spawn, no coordinator | Only option for sub-three-step work |

**Selection rules**
- Default to CLI mode unless the user explicitly says “task mode” or you require interactive debugging.
- Never let validators run before the CLI orchestrator confirms the gate.
- CLI agents automatically leverage custom routing; enable once via <code>/custom-routing-activate</code>, verify anytime with <code>/switch-api status</code>.

## 4. Roles & responsibilities
- **Main Chat**: chooses mode, defines success criteria, and never micromanages implementation details.
- **cfn-v3-coordinator**: spawned automatically in CLI mode; owns swarm orchestration, persistence, and health monitoring.
- **Loop 3 implementers**: create deliverables, run self-checks, and report confidence plus metadata before yielding.
- **Loop 2 validators**: wait for the <code>gate-passed</code> signal, review implementation artifacts, and supply structured consensus data.
- **Product Owner**: final arbiter using <code>.claude/skills/product-owner-decision/execute-decision.sh</code>; decides PROCEED / ITERATE / ABORT and encodes deliverable requirements for the next loop.

## 5. Delegation triggers
- CFN Loop CLI is mandatory when: more than three discrete steps, multiple files, implementation plus documentation, research plus code, refactors, security or performance audits, or any workflow needing validators.
- Single-agent Task spawns are acceptable for: a narrow code review on one file, responding to a simple question, or writing a tiny script with no dependencies.
- Never mix implementers and validators inside the same message; finish one layer, collect confidence, then move to the next.

## 6. Edit / validation workflow
1. **Pre-edit backup**: run <code>./.claude/hooks/cfn-invoke-pre-edit.sh "&lt;path&gt;" --agent-id "$AGENT_ID"</code> before touching any tracked file (yes, even markdown).
2. **Apply change**: perform the edit via Edit/apply_patch/editor; never use destructive git commands for rollback.
3. **Post-edit hook**: run <code>./.claude/hooks/cfn-invoke-post-edit.sh "&lt;path&gt;" --agent-id "$AGENT_ID"</code> immediately after saving.
4. **Deliverable verification**: <code>./.claude/skills/cfn-loop-validation/validate-deliverables.sh</code> enforces STRAT-020 (no “consensus on vapor”). Expect forced iteration if git shows zero net changes when a task was supposed to “build/create/implement”.
5. **Testing**: run suites once outside agents; share the logs with any agents that need them.
6. **Recovery**: use <code>./.claude/skills/pre-edit-backup/revert-file.sh</code> to roll back a file if hooks fail.

## 7. CFN Loop lifecycle
1. Main Chat issues <code>/cfn-loop-cli "Task" --mode=standard</code> with clear deliverables plus acceptance criteria.
2. Coordinator stores structured context (epic goal, in/out of scope, deliverables, directory, acceptance criteria) in persistence per STRAT-026.
3. Orchestrator validates context, spawns Loop 3 agents via CLI with injected templates, and monitors progress (enhanced waiting plus stuck detection).
4. Implementers finish work, call <code>coordination-signal "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"</code>, then execute <code>./.claude/skills/cfn-coordination/report-completion.sh ...</code>.
5. Gate check enforces ≥0.75 per agent; failures trigger another Loop 3 pass without waking validators.
6. On pass, orchestrator wakes Loop 2 validators, collects consensus (≥0.90) with multi-pattern confidence parsing (PATTERN-009).
7. Product Owner decision script interprets validator output, cross-checks deliverables, and returns PROCEED / ITERATE / ABORT.
8. Decision broadcast updates persistence so agents know whether to continue, iterate with new constraints, or stand down.

**Key commands**
~~~
/cfn-loop-cli "Implement X" --mode=standard
/cfn-loop-task "Investigate Y" --mode=standard
/cfn-loop-single "Update documentation"
~~~

## 8. Skills, hooks, and assets (repo-specific)
- Agents live in <code>.claude/agents/cfn-dev-team/</code> (23 production agents). Custom agents can coexist anywhere under <code>.claude/agents/</code>.
- Skills live in <code>.claude/skills/cfn-*/</code> (43 modules) with consistent parameter contracts (STRAT-014).
- Hooks: <code>.claude/hooks/cfn-*</code> (backup plus post-edit pipelines). Configuration: <code>.claude/hooks/post-edit.config.json</code>.
- Commands: <code>.claude/commands/cfn/</code> (45+ entries, including CFN Loop Task/CLI guides).
- Coordinator and orchestrator scripts: <code>.claude/skills/cfn-loop-orchestration/orchestrate.sh</code>, <code>.claude/skills/cfn-coordination/*</code>.
- Analytics plus lessons: <code>.artifacts/analytics/context-reduction-report.json</code>, <code>planning/cfn-v3/DUAL_MODE_IMPLEMENTATION.md</code>, <code>planning/agentic-improvements/AGENTIC_COORDINATION_RESEARCH_REPORT.md</code>.

## 9. Adaptive patterns to remember
- **Context and coordination**: STRAT-007 (background execution), PATTERN-008 (Product Owner flow), PATTERN-009 (confidence parsing), PATTERN-010 (parallel temp files), STRAT-020/021 plus PATTERN-020/021/022 (multi-layer context injection and validation), STRAT-024/026/028 (persistence plus modular skills).
- **Quality gates**: STRAT-027 (validator consensus for architecture), STRAT-020 (deliverable verification), STRAT-025 (explicit deliverable tracking).
- **Anti-patterns to avoid**: ANTI-004 (regex self-match), ANTI-020/021 (context stored but not injected), ANTI-022 (premature optimization), ANTI-023 (task-spawned validators using CLI protocols).
- **Defensive scripting**: PATTERN-025 (file validation), PATTERN-026 (shell strict mode), PATTERN-028 (process group management).
- **Monitoring**: STRAT-007 plus STRAT-028 ensure background jobs stay healthy and are cleaned up.

## 10. Reference materials
- <code>.claude/commands/cfn/CFN_LOOP_TASK_MODE.md</code> — Task mode specialization strategy.
- <code>.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md</code> — argument schema for coordinator or CLI.
- <code>.claude/skills/cfn-loop-validation/SKILL.md</code> — validation hooks and deliverable checks.
- <code>.claude/skills/cfn-agent-spawning/SKILL.md</code> plus <code>.claude/skills/cfn-coordination/SKILL.md</code> — spawn and coordination protocols.
- <code>.claude/skills/product-owner-decision/</code> — decision script documentation.
- <code>planning/skills/ROLLBACK_PLAN.md</code>, <code>planning/skills/MAINTENANCE_SCHEDULE.md</code> — maintenance playbooks.
