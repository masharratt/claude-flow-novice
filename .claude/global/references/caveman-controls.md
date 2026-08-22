# Caveman Plugin Controls (terse-output mode)

Measured cost, disable methods, and hazards for the caveman plugin's terse-output injections. Load when adjusting terse mode or asking why output style changed.

## Measured cost (2026-08-21)

- Session-start block: 1,847 bytes, re-paid on every compact.
- Per-prompt reminder: 121 bytes.
- Neither shrinks with intensity level (`lite` is 1,907 bytes, `ultra` 1,852) — the only real lever is on/off, where both payloads drop to zero.

## Disabling

- **This session only:** say "stop caveman". That unlinks `~/.claude/.caveman-active`, so per-prompt reinforcement stops on the next turn. `/caveman full` restores it. The session-start block is already paid and cannot be reclaimed.
- **One project, permanently:** add `"CAVEMAN_DEFAULT_MODE": "off"` to that project's `.claude/settings.json` `env` block. Settings `env` reaches hook processes, so session start emits nothing and never writes the flag. Use this on projects that are mostly coordination, where most output is agent briefs and plan artifacts that the carve-out exempts anyway.
- **Everywhere, permanently:** set `defaultMode` in `~/.config/caveman/config.json`.

## Hazards

- **Never patch the plugin under `~/.claude/plugins/cache/`.** That tree is not a git checkout, and an update writes a new content-hashed directory, so the edit disappears with no conflict and no warning.
- **Fork inheritance:** forks inherit the whole transcript, so they inherit every injection above (session-start block + per-prompt reminders). Fresh agents do not: no session-start or prompt-submit hook fires for them.
