---
description: Start Claude Code Router and activate routing with optional resume
---

Start CCR, activate routing, and launch Claude Code with router enabled.

Usage:
  /router       - Fresh start with routing
  /router -r    - Resume previous session with routing

This command:
1. Starts the Claude Code Router (port 3456)
2. Activates routing (sets ANTHROPIC_BASE_URL)
3. Launches Claude Code with --dangerously-skip-permissions
4. Optionally resumes previous session

Router configuration routes:
- haiku → cerebras,gpt-oss-120b (3000 tok/s)
- sonnet → cerebras,zai-glm-4.6 (1000 tok/s)
- Main chat → cerebras,glm-4.6 (default route)
- Think mode → anthropic,claude-opus-4-5-20251101

To disable routing in current session:
```bash
unset ANTHROPIC_BASE_URL
```

To stop router:
```bash
ccr stop
```
