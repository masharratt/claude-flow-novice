# CFN Loop CLI Mode Reference

**Purpose:** Detailed documentation for CLI mode execution of CFN Loops.

---

## Overview

CLI Mode is the production-default execution method for CFN Loops, optimized for cost and provider routing.

**Command:** `/cfn-loop-cli "Task description" --mode=standard --provider kimi`

**Best for:** Production workflows, provider routing, cost-sensitive work.

---

## Execution Flow

### Slash Command Execution Rules

1. Expand slash command
2. Immediately execute coordinator spawn via Bash tool using the exact command
3. Do not merely show commands; run them
4. Inform user after spawn with task ID

**Anti-patterns:**
- Pausing to ask what next
- Manual Task() spawning for CLI workflows
- Skipping execution

### CLI Mode Execution Steps

1. **Expand & Validate:** Parse slash command, validate required parameters (mode, optional provider)
2. **Spawn Coordinator:** Execute orchestration script; confirm task ID
3. **Loop 3 Implementation:** Agents implement and run tests; orchestration monitors via Redis
4. **Gate Check:** Compare pass rate to mode threshold; if failing, iterate Loop 3
5. **Loop 2 Validation:** If gate passes, validators review and score
6. **Product Owner Decision:** PROCEED/ITERATE/ABORT; orchestrator enforces
7. **Report & Cleanup:** Final status, code paths, test results; stop agents cleanly

---

## Provider Routing

### Enable Custom Routing

Set `CFN_CUSTOM_ROUTING=true` in `.env`.

### Provider Options

| Provider | Use Case | Notes |
|----------|----------|-------|
| `zai` | Cost-sensitive | Default when custom routing enabled |
| `kimi` | Balanced quality/cost | Good general choice |
| `openrouter` | Broad access | Multiple models available |
| `max` / `anthropic` | Premium quality | Highest safety/quality |
| `gemini` | Google ecosystem | |
| `xai` | Grok-style responses | |

### Provider Selection

- **Cost sensitive:** `zai` or low-tier `openrouter`
- **Balanced:** `kimi`
- **Quality critical:** `max` or `anthropic`
- **Google tools:** `gemini`
- **Mixed providers:** Set per-agent profile; otherwise inherit main chat provider

### Example Flow

```bash
/switch-api kimi
/cfn-loop-cli "Implement feature" --provider kimi
```

**Full guide:** `docs/CUSTOM_PROVIDER_ROUTING.md`

---

## Mode Thresholds

### Test Gate Thresholds

| Mode | Gate Pass Rate | Consensus | Max Iterations | Validators |
|------|----------------|-----------|----------------|------------|
| MVP | >= 0.70 | >= 0.80 | 5 | 2 |
| Standard | >= 0.95 | >= 0.90 | 10 | 3-5 |
| Enterprise | >= 0.98 | >= 0.95 | 15 | 5-7 |

### Mode Selection

- **MVP:** Fast prototyping, demos, non-critical work
- **Standard:** Production default, most features
- **Enterprise:** Compliance-sensitive, security-critical work

---

## Redis Coordination

CLI mode uses Redis BLPOP for agent coordination:

- Agents signal completion via Redis
- Orchestrator monitors progress via polling
- Context validation and metadata tracking
- Health monitoring for stuck agents

**Key patterns:** `.claude/skills/cfn-coordination/SKILL.md`

---

## Deprecated Patterns

- Manual `Task()` spawning for CLI workflows
- Ad-hoc file coordination (use Redis protocols)
- Host-side iteration scripts (use self-contained coordinator)

---

## Quick Reference

```bash
# Standard CLI mode execution
/cfn-loop-cli "Implement feature X" --mode=standard

# With provider routing
/cfn-loop-cli "Fix bug Y" --mode=standard --provider kimi

# Enterprise mode for compliance
/cfn-loop-cli "Security audit" --mode=enterprise --provider anthropic
```

**See also:**
- Root `CLAUDE.md` for Task Mode (debugging/learning)
- `docs/CFN_LOOP_ARCHITECTURE.md` for architecture details
- `.claude/agents/custom/cfn-loops-cli-expert.md` for CLI expert agent
