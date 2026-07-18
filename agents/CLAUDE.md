# agents/ — imported agent-profile library

Read-only reference library of 658 agent profiles organized by category (`ai-ml-automation/`, `business-operations/`, `development-engineering/`, `security-compliance/`, etc.). Imported from upstream for reference and mining.

## Rules (local only)

- **These are reference profiles, not the live dispatch table.** Dispatchable CFN agents live in `.claude/agents/` — `cfn-dev-team/` (shared infra) and `project-only-agents/`. Add project-specific agents under `.claude/agents/custom/`.
- **No MCP.** This repo spawns agents via the Task tool, not `mcp__claude-flow__*`. Ignore any MCP/`swarm_init` instructions inside imported profiles.
- Navigate with `agents/README.md`, `QUICK_REFERENCE.md`, `FULL_STRUCTURE.md`.
