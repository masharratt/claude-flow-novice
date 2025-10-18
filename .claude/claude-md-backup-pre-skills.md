# Claude Flow Novice — AI Agent Orchestration

**🚀 Production Status:** Redis coordination system fully deployed (Phase 7 - 2025-10-17)

---

## 1) Critical Rules (Single Source of Truth)

**Main Chat Role (Thin Orchestration Layer):**
* Main chat does ONLY: minimal investigation → determine task type → spawn coordinator + agents in single message → wait for results
* ALL coordination happens via Redis between coordinator and agents
* Main chat does NOT orchestrate agents directly - coordinator handles all agent coordination
* Agents communicate via Redis pub/sub with explicit dependencies (see `.claude/redis-agent-dependencies.md`)

[... rest of the original CLAUDE.md content ...]