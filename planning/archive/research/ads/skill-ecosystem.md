# Cross-Agent Skill Ecosystem — Claude Code / OpenClaw / Hermes (June 2026)

**Connecting thread:** all three consume the same `SKILL.md` format (agentskills.io spec). Author an ad-skill once → runs in all three unchanged. Only install path differs. Portable across 13 tools (Claude Code, Codex, Gemini CLI, OpenClaw, Hermes Agent, Cursor, Aider, Windsurf, etc.).

| Platform | What it is | Skill path | Role |
|----------|-----------|------------|------|
| Claude Code | session-based coding/analysis agent | `~/.claude/skills/` | deep reasoning in-session |
| OpenClaw | always-on self-hosted assistant over 20+ chat channels | `~/.openclaw/skills/` | 24/7 autonomous monitor |
| Hermes Agent | self-improving agent, runs on 200+ LLMs | `~/.hermes/skills/` (post-sync) | autonomous loops + `/learn` skill auto-capture |

⚠️ **Star counts suspect:** OpenClaw ~380k, Hermes ~204k for ~7-month repos = implausibly high. Live GitHub API but verify before betting on maturity.

---

## OpenClaw
- Repo: https://github.com/openclaw/openclaw — TS, MIT (verify LICENSE), created Nov 2025, active
- Site: https://openclaw.ai · Docs: https://docs.openclaw.ai/tools/skills · Registry: clawhub.ai
- "Molty" lobster-themed assistant by Peter Steinberger (ex-PSPDFKit). Local-first, model-agnostic (Claude/GPT/Gemini/DeepSeek)
- Skills = AgentSkills spec (same SKILL.md as Claude Code). Extensions: `metadata.openclaw` gating, `user-invocable`, `command-dispatch`
- ClawHub registry = security-scanned skill registry (VirusTotal/static analysis, trust envelope)
- Install: `openclaw skills install @owner/<slug>` | `git:owner/repo@ref` | `./path` | `--global`
- Bridges: run Claude Code as runtime inside OpenClaw (`noncelogic/openclaw-skill-claude-code`, `Enderfga/claw-orchestrator`)
- Ad skills on ClawHub: Meta Ads monitoring/optimization, Google Ads (search-term/wasted-spend/negative-keywords), multi-platform audit, copy/creative gen
- Curated: https://github.com/VoltAgent/awesome-openclaw-skills · https://github.com/mergisi/awesome-openclaw-agents
- **NOT the 1997 game** (`pjasicek/OpenClaw` is a separate unrelated C++ project)

## Hermes Agent
- Repo: https://github.com/NousResearch/hermes-agent — MIT, Nous Research, v0.17.0 (Jun 2026)
- Docs: https://hermes-agent.nousresearch.com/docs/
- Self-improving, persistent memory, autonomous skill creation, multi-platform messaging. Runs on 200+ LLMs (OpenAI-compatible)
- Skills = agentskills.io SKILL.md standard (no conversion from Claude Code). `python scripts/sync-hermes-skills.py` → `~/.hermes/skills/`
- `/learn` auto-captures workflows as skills (MarkTechPost 2026-06-24)
- MCP client (v0.2.0) + MCP server (v0.6.0, exposes to Claude Desktop/Cursor)
- Bundled `autonomous-ai-agents/claude-code` skill → delegates coding to Claude Code CLI (Hermes orchestrates, Claude codes)
- Ad skills: Google Ads via Composio (https://composio.dev/toolkits/googleads/framework/hermes-agent), Meta via Composio metaads (https://composio.dev/toolkits/metaads/framework/hermes-agent) + https://github.com/Varnan-Tech/meta-ads-skill
- Hermes models (separate): https://github.com/NousResearch/Hermes-Function-Calling — function-calling engine, not a skill library

---

## Ad-management skills (beyond AgriciDaniel/claude-ads)
| Repo | Stars | Type | Note |
|------|-------|------|------|
| https://github.com/coreyhaines31/marketingskills | ~35k* | Skill | full marketing stack; `ads`+`ad-creative` (Google/Meta/LinkedIn/X). Knowledge-only |
| https://github.com/ivangfalco/ads-skills | 182 | Skill | agency running $200K+/mo, 12+ accounts; 39 Python API scripts; no spend gates |
| https://github.com/OpenClaudia/openclaudia-skills | 508 | Skill | 67+ skills incl. google-ads/facebook-ads/linkedin-ads/video-ad-analysis |
| https://github.com/amekala/ads-mcp (Adspirer) | 63 | MCP | 175+ tools, end-to-end launch Google/Meta/LinkedIn/TikTok, budget caps |
| https://github.com/Varnan-Tech/meta-ads-skill | — | Skill | Hermes-targeted Meta |
*suspect-high

**Composio toolkits** = glue with pre-built bindings for Claude Code + Hermes + OpenClaw: `metaads`, `googleads`. Fastest multi-platform write path.

**Marketplaces:** Anthropic official `anthropics/claude-plugins-official` Marketing plugin = strategy/content only, **NO paid-ads skills**. Community: claudemarketplaces.com, claudepluginhub.com, mcpmarket.com, Composio registry.

---

## At-scale patterns (verified from operator writeups)
1. **Per-client OAuth isolation + context-switch** — one grant per platform per client, data layer enforces scoping. 30 accounts, no cross-client leak.
2. **Combinatorial creative matrix → gallery gate → bulk publish** — Brand Foundation × topics × personas × styles = 100s ads → local web gallery, human keeps 70-80% → Graph API bulk w/ Advantage+.
3. **Write-review-execute** — scripts emit CSV recommendations, dry-run, max-monthly-increase caps, audit log, human approves.
4. **Launch-PAUSED safety** — every create defaults `status: PAUSED` + `dryRun` rule testing.

**Universal consensus: reads autonomous, every spend/write human-gated or launched paused.** Nobody verifiable runs fully-autonomous spend.

---

## Gaps (OSS whitespace)
- **No agent-fleet orchestrator for ads.** "Creative Scout→Launch→Monitor→Comment" = marketing copy, no real repo. (CFN Loop could fill.)
- **No autonomous kill/scale loop as shareable skill** — only ad-hoc scripts or paid SaaS.
- **Anthropic official marketing plugin omits paid ads entirely.**
- **Multi-account approval/audit governance** (who approved which spend, rollback) — proprietary SaaS only.
