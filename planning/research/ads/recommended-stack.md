# Recommended Stack + Next Moves

## Synthesis
CFN setup is already a multi-agent orchestrator with skills + gates + Redis coordination — exactly the gap nobody filled in OSS ad tooling.

## Recommended play
1. **Author one portable ad-skill** (`SKILL.md`) targeting Composio `metaads`/`googleads` toolkits → runs in Claude Code now, Hermes/OpenClaw later unchanged.
2. **Wire into a CFN Loop fleet:** Creative-gen agent → publish agent (launches PAUSED) → Product Owner gate (existing PROCEED/ITERATE) → performance-pull agent → kill/scale agent. The unbuilt orchestrator.
3. **Use `glm-video-ingest` skill as creative-QA gate** before publish.

## Per-platform execution layer
| Platform | Start with | Backbone (heavy/bulk) | Access prereq |
|----------|-----------|----------------------|---------------|
| Meta | official MCP `mcp.facebook.com/ads` (beta, skips App Review) | `facebook-business` Python v25 + non-expiring System User token | own app + Standard tier via App Review |
| TikTok | `tiktok-business-api-sdk-official` | same SDK (real write) | app approval + Content Posting ToS audit |
| LinkedIn | `danielpopamd/linkedin-ads-mcp` | official `linkedin-api-python-client` | Marketing Developer Platform approval (weeks) |

## First moves (priority order)
1. **LinkedIn: apply to Marketing Developer Platform TODAY** — longest lead (weeks), often rejected.
2. **Meta: test official MCP beta** in parallel with registering own app + Standard tier for own quota.
3. **TikTok: get official SDK**, start app approval, plan for Content Posting audit.
4. **Stand up n8n + Sheets + satori + Revideo** pipeline against ONE product as proof.
5. **Add `AgriciDaniel/claude-ads`** (6.5k★) for audit layer.

## Recommended next deliverable
**(a) Scaffold portable ad-management SKILL.md** (Meta first, Composio-backed) — concrete, reusable across all three agent platforms today.
Alt: **(b) Design CFN Loop ad-fleet architecture** — fills the gap nobody shipped.

## Universal safety rule
Reads autonomous. Every spend/write human-gated OR launched PAUSED. No fully-autonomous spend changes.
