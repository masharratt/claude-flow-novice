---
description: "Night mode autonomy flag: turn on/off, show status, print the morning report, or run doctor"
argument-hint: "[on|off|status|report|doctor] [--ack] [--since DATE] [--project P] [--install]"
allowed-tools: ["Bash"]
---

# Night Mode

Run the CLI:

```bash
bash "$HOME/.claude/skills/cfn-night-mode/night-mode.sh" ${ARGUMENTS:-status}
```

No arguments means `status`.

Relay the script's output VERBATIM. Never paraphrase, summarize, or reformat what it prints. Status output and the morning report are audit documents: their structure (NEEDS ACTION cards, AUTO-DECIDED lines, accountability counts, git evidence) is part of the contract, and a paraphrased report defeats its purpose.

If the script exits non-zero (failed checks, unknown subcommand), still relay its output verbatim before diagnosing.

Notes:

- Subcommands: `on`, `off`, `status` (default), `report [--ack]`, `doctor`.
- `doctor --install` must run once on a fresh machine to register the two hooks in `~/.claude/settings.local.json`. `on` runs doctor verify-only and tells you when registrations are missing.
- Full contract: `.claude/skills/cfn-night-mode/SKILL.md`
