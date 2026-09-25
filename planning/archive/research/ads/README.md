# Ad Management Research — Index

Research compiled June 2026. Open-source tooling for publishing/managing Meta, TikTok, LinkedIn ads + creative-at-scale + the Claude Code skill ecosystem.

| File | Covers |
|------|--------|
| [platform-tooling.md](platform-tooling.md) | Per-platform MCPs, SDKs, CLIs, capability matrices, gotchas (Meta / TikTok / LinkedIn) |
| [creative-at-scale.md](creative-at-scale.md) | Copy gen, image/video render, orchestration, end-to-end pipeline blueprint |
| [skill-ecosystem.md](skill-ecosystem.md) | Cross-agent SKILL.md ecosystem: Claude Code / OpenClaw / Hermes; ad-mgmt skills; at-scale patterns; gaps |
| [recommended-stack.md](recommended-stack.md) | Synthesized recommendation + next moves |

## Key takeaway
All three agent platforms (Claude Code / OpenClaw / Hermes) consume the **same `SKILL.md` format** (agentskills.io spec). Author one ad-skill, run everywhere. **No OSS tool does full create-and-launch** for any ad platform — execution drops to official SDK; MCP = read/analytics layer.

## Caveats on star counts
OpenClaw (~380k) and Hermes Agent (~204k) star counts for ~7-month-old repos are implausibly high. Pulled from live GitHub API but verify maturity before betting on them. coreyhaines marketingskills (~35k) similarly suspect.
