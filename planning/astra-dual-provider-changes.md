# Dual-Provider Setup: GPT-6 Astra (via Codex) + Claude Code

**Date:** 2026-09-06 (night session)
**Status:** Proposed. Nothing applied; every change below awaits morning review.
**Goal:** User will run Claude Code (Z.ai/GLM side) plus GPT-6 Astra through codex-cli. Determine what the CFN config must change to support both.

## Verified facts about Astra (web-sourced 2026-09-06)

- Model id: `gpt-6-astra`. New architecture (latent reasoning, no human-readable chain of thought).
- Requires Codex CLI **≥ 0.153.0**. Installed here: **0.150.1** → hard blocker.
- Codex subscription billing: included in the existing Codex usage allowance on Pro ($100/$200) and Business ($100) plans. NOT available on Plus or the $20 Business tier.
- API fallback pricing: $10/M input, $1/M cached input, $50/M output. Roughly 2.5× gpt-5.6 output price.
- Rate limits: community reports Astra drains a 5-hour usage window in minutes at Medium reasoning. The real cost constraint is rate limit, not dollars, while subscription-billed.
- Safety: first OpenAI model rated **Critical** for cybersecurity capability under the Preparedness Framework; it found and exploited two zero-days during pre-release testing. Sandbox discipline matters more with this model, not less.

## Change list

### 1. BLOCKER — upgrade codex CLI (machine-level)
```bash
npm install -g @openai/codex@latest
codex --version   # expect ≥ 0.153.0
```
Current 0.150.1 cannot discover `gpt-6-astra` (community-confirmed: 0.152.1 also failed model discovery). After upgrade, the `~/.codex/models_cache.json` (currently lists gpt-5.5, gpt-5.6-sol/terra/luna, gpt-5.4-mini, gpt-5.3-codex-spark, gpt-reserve, codex-auto-review — no astra) should refresh and include the astra slug. Verify the exact slug before wiring config: it may be `gpt-6-astra` or a variant.

### 2. `~/.codex/config.toml` — add profiles, keep default unchanged
The file is currently 3 lines (one project trust entry, nothing pinned). Add:

```toml
# Default profile stays the cheap tier; Astra is opt-in only.
[profiles.astra]
model = "gpt-6-astra"        # confirm exact slug after CLI upgrade
# model_reasoning_effort = "low"   # consider; Medium drains limits fast
```

Selection:
- CLI: `codex -p astra ...` / `codex exec -p astra ...`
- MCP (this repo's delegation path): pass `model: "gpt-6-astra"` per call — the `mcp__codex__codex` tool accepts a `model` parameter, so the MCP registration in `~/.claude.json` (`{"command":"codex","args":["mcp-server"]}`) stays untouched.

Rationale for opt-in: Astra's rate-limit burn makes it the wrong default. Default server model keeps serving mechanical work.

### 3. Routing policy — edit `.claude/global/CLAUDE.md` Codex Delegation section
Add to the section (around line 70):

- Default codex model: existing tier (cheap, subscription-friendly). Use for: read-heavy sweeps, mechanical implementation of fully specified plans, log/schema dumps.
- Escalate to `gpt-6-astra` (per-call `model` param or `-p astra`) only for: architecture-decision second opinions, security review of high-blast-radius diffs, hard debugging root-cause work, advisor-class consults. Same task classes already routed to the `advisor` / `technical-advisor` agents.
- One line of why: subscription rate limits drain in minutes on Astra; dollars only matter if `OPENAI_API_KEY` leaks into the environment.

### 4. Billing guard — rule unchanged, worth restating
Astra rides the existing codex subscription allowance, so "keep `OPENAI_API_KEY` unset" (CLAUDE.md line 70) still applies to every codex call including Astra. No per-model carve-out needed as long as Astra is never used via raw API. If the subscription window runs dry mid-task: wait, do not set the key. API fallback on Astra is $50/M output.

### 5. Sandbox policy — reinforced, not changed
Existing rule (read-only sandbox for research/review, workspace-write only for fully specified implementation, `approval-policy = never` only with bounded prompts) stays. Given the Critical cybersecurity rating and the zero-day exploit demo, do not loosen sandboxing for Astra calls. If anything, run Astra review/delegation calls read-only by default and grant workspace-write per task, not per profile.

### 6. `~/.claude/references/../.claude/global/model-pricing.md` — add row
Add to the OpenAI table (currently gpt-5.x only, lines ~36-54): `gpt-6-astra | $10.00 | $1.00 (cached) | $50.00 |`.

### 7. `~/.claude/references/provider-cost-runtime.md` — new subsection
Add a "Codex model routing" subsection: which model when (from item 3), the rate-limit caveat, and the API-fallback price so a future session does not "fix" a rate-limit error by setting `OPENAI_API_KEY`.

### 8. codex-hud plugin — no action
Usage parsing is already multi-model safe (rollouts grouped by model; API tables keyed by model). Two cosmetic quirks, upstream-fix only (plugins/cache is never patched locally):
- `codex-appserver.ts:54-56` reads the first `model =` line in config.toml, so profiles may confuse the config badge.
- `statusline.ts:154,475` badge shows the last-run model under mixed usage; demo fallback hardcodes `gpt-5.5`.

### 9. CFN pipeline wiring — no change
No project script shells out to `codex exec` or pins `--model` (audited: skills, commands, hooks, cfn-scripts, agent dispatch lines all call `mcp__codex__codex` bare or not at all). codex-dispatch SKILL.md is model-agnostic. Per-call `model` choice stays with the coordinator; do not bake model names into agent definitions yet.

### 10. Memory updated (done this session)
`codex-delegation-setup.md` memory now records: CLI 0.150.1 < required 0.153.0, `gpt-6-astra` id, opt-in profile plan, subscription/rate-limit facts.

## Assumption registry (testable)

1. Exact slug is `gpt-6-astra` per OpenAI docs/OpenRouter on 2026-09-06; `models_cache.json` has not listed it yet. Test: after CLI upgrade, `codex` model list contains the astra slug; adjust config if the slug differs.
2. The codex auth plan is Pro or Business Premium, so Astra is subscription-covered. Test: run any Astra call after upgrade; a plan-gating error means fall back to gpt-5.6-tier and revisit.
3. Astra will only ever be reached through codex (subscription), never raw API from project code. Provider ban is unaffected either way (it bans Anthropic programmatic calls, not OpenAI).

## Deferred to morning (night-mode deferrals)

- Run the CLI upgrade (global toolchain mutation; one command, listed above). Memory watch item: the upgrade may surface the `codex app-server` deprecation for the MCP registration (`codex mcp-server` was already flagged as successor-pending) — re-check the `~/.claude.json` registration after upgrading.
- Apply items 2, 3, 6, 7 (config + global doc edits that change behavior across all projects).
- Confirm plan eligibility (assumption 2).
