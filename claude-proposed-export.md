# Claude Flow — Proposed Ops Guide (Export)

**Status:** Portable reference for npm distribution (v2.9.x)

## 1. Purpose & Scope
- Provide a concise, install-ready operating guide for any repo that installs the Claude Flow Novice package.
- Covers delegation rules, CFN Loop execution, documentation expectations, and the shared skill/hook surfaces that ship with the npm release.

## 2. Operating Principles

### Core workflow rules
- Use specialized agents whenever a task exceeds three concrete steps or spans multiple domains/files.
- For every CFN Loop workflow, issue CLI commands (<code>/cfn-loop-cli</code> preferred, <code>/cfn-loop-task</code> for debugging). Never spawn CFN Loop agents manually with <code>Task()</code>.
- Batch related actions (spawns, edits, hook invocations, todos) and keep implementers separate from validators.
- Execute tests outside agents; agents only request, analyze, or react to results.
- Keep responses plain-english and concise; provide examples only when asked.
- Monitor background jobs with a <code>sleep N</code> → check → repeat cycle to stay within CLI timeouts.
- Store deliverables in intentional subdirectories; never drop artifacts in the repo root.

### Output & documentation standards
- Bugs → <code>docs/BUG_<id>_<slug>.md</code>
- Features/process → <code>docs/FEATURE_NAME.md</code>
- Tests → <code>tests/test-*.sh</code> plus durable logs under <code>tests/</code>
- Temporary scratch → <code>/tmp/</code>
- Backlog deferrals → <code>.claude/skills/cfn-backlog-management/add-backlog-item.sh</code>
- Changelog entries → <code>.claude/skills/cfn-changelog-management/add-changelog-entry.sh</code>
- Full policy reference → <code>docs/AGENT_OUTPUT_STANDARDS.md</code> (packaged default)

### Confidence & consensus
- Loop 3 gate: each implementer must report ≥0.75 confidence to wake validators.
- Loop 2 consensus: aggregate confidence ≥0.90 before Product Owner review.

## 3. Execution modes

| Mode | When to use | Spawn pattern | Cost or visibility |
|------|-------------|---------------|--------------------|
| CLI (<code>/cfn-loop-cli ... --mode=standard</code>) | Production-default for multi-agent or cost-sensitive work | Main Chat → <code>cfn-v3-coordinator</code> → <code>./.claude/skills/cfn-loop-orchestration/orchestrate.sh</code> | Lowest cost (≈$0.054/iteration via Z.ai routing), background with persistence |
| Task (<code>/cfn-loop-task ... --mode=standard</code>) | Debugging/learning with full visibility | Main Chat spawns each agent via <code>Task()</code> | Higher cost (≈$0.150/iteration) but transparent logs |
| Single agent <code>Task("role", "...")</code> | Isolated specialist work with ≤3 steps | Direct spawn, no coordinator | Use for tight, single-file requests |

**Selection rules**
- Default to CLI mode; only drop to Task mode when a user explicitly asks or you need line-by-line transparency.
- Validators never start before the orchestrator signals that the gate passed.
- Enable custom routing once (<code>/custom-routing-activate</code>) and verify anytime with <code>/switch-api status</code>.

## 4. Roles & responsibilities
- **Main Chat**: choose execution mode, define scope/success criteria, and avoid micromanaging implementation details.
- **cfn-v3-coordinator**: orchestrates swarms, manages persistence, monitors health (spawned automatically in CLI mode).
- **Loop 3 implementers**: build deliverables, self-validate, report confidence/metadata.
- **Loop 2 validators**: wait for the <code>gate-passed</code> signal, review artifacts, produce structured consensus data.
- **Product Owner**: run <code>.claude/skills/product-owner-decision/execute-decision.sh</code> to issue PROCEED / ITERATE / ABORT directives and restate deliverable expectations.

## 5. Delegation triggers
- Mandatory CLI delegation when: >3 steps, multiple files, combined research+implementation, refactors, security/performance reviews, or any validator involvement.
- Direct single-agent <code>Task()</code> spawns are acceptable for tiny, isolated work (one-file review, short explanation, or micro-script).
- Keep implementers and validators in separate messages to preserve clean hand-offs.

## 6. Edit / validation workflow
1. **Pre-edit backup**: <code>./.claude/hooks/cfn-invoke-pre-edit.sh "&lt;path&gt;" --agent-id "$AGENT_ID"</code>
2. **Edit**: use Edit/apply_patch/editor; avoid destructive git operations.
3. **Post-edit hook**: <code>./.claude/hooks/cfn-invoke-post-edit.sh "&lt;path&gt;" --agent-id "$AGENT_ID"</code>
4. **Deliverable verification**: <code>./.claude/skills/cfn-loop-validation/validate-deliverables.sh</code> enforces STRAT-020 (no “consensus on vapor”).
5. **Testing**: run suites once outside agents; surface logs as needed.
6. **Recovery**: <code>./.claude/skills/pre-edit-backup/revert-file.sh</code> reverts from the managed backups.

## 7. CFN Loop lifecycle
1. Run <code>/cfn-loop-cli "Task" --mode=standard</code> with explicit deliverables and acceptance criteria.
2. Coordinator stores structured context (epic goal, scope, deliverables, directory, acceptance criteria) in persistence (STRAT-026).
3. Orchestrator validates context, spawns Loop 3 agents with injected templates, monitors progress, and enforces completion protocols.
4. Implementers signal completion via <code>coordination-signal "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"</code> and call <code>./.claude/skills/cfn-coordination/report-completion.sh ...</code>
5. Gate check enforces ≥0.75 confidence per agent; failures loop implementers again.
6. Success wakes Loop 2 validators, who deliver ≥0.90 consensus using PATTERN-009 multi-format parsing.
7. Product Owner decision script validates deliverables and replies with PROCEED / ITERATE / ABORT plus explicit feedback.
8. Decision broadcast updates persistence so subsequent iterations inherit the latest constraints.

**Key commands**
~~~
/cfn-loop-cli "Implement X" --mode=standard
/cfn-loop-task "Investigate Y" --mode=standard
/cfn-loop-single "Update documentation"
~~~

## 8. Skills, hooks, and assets (package)
- **Agents**: shipped under <code>.claude/agents/</code>; add custom agents alongside vendor-provided profiles.
- **Skills**: <code>.claude/skills/cfn-*/</code> namespace with consistent flags (STRAT-014). Extend by adding new skill folders that follow the same interface contract.
- **Hooks**: <code>.claude/hooks/cfn-*</code> (backup + post-edit) with config in <code>.claude/hooks/post-edit.config.json</code>.
- **Commands**: <code>.claude/commands/cfn/</code> (Task/CLI docs, coordinator parameter specs, mode guides).
- **Core orchestrator assets**: <code>.claude/skills/cfn-loop-orchestration/orchestrate.sh</code>, <code>.claude/skills/cfn-coordination/</code>, <code>.claude/skills/cfn-loop-validation/</code>, and <code>.claude/skills/product-owner-decision/</code>.
- **Policies**: <code>docs/AGENT_OUTPUT_STANDARDS.md</code> ships as the default output policy—customize per repo without touching package internals.

## 9. Adaptive patterns to remember
- **Context & coordination**: STRAT-007, PATTERN-008/009/010, STRAT-020/021, PATTERN-020/021/022, STRAT-024/026/028.
- **Quality gates**: STRAT-027, STRAT-020, STRAT-025.
- **Anti-patterns**: ANTI-004, ANTI-020/021, ANTI-022, ANTI-023.
- **Defensive scripting**: PATTERN-025/026/028 plus STRAT-028 for process cleanup.

## 10. Reference materials
- <code>.claude/commands/cfn/CFN_LOOP_TASK_MODE.md</code>
- <code>.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md</code>
- <code>.claude/skills/cfn-loop-validation/SKILL.md</code>
- <code>.claude/skills/cfn-agent-spawning/SKILL.md</code>
- <code>.claude/skills/cfn-coordination/SKILL.md</code>
- <code>.claude/skills/product-owner-decision/README.md</code>
- <code>docs/AGENT_OUTPUT_STANDARDS.md</code>
