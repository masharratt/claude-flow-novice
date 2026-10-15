---
name: cfn-work-mode
description: "Global no-visible-windows flag for when the user is at work and the Mac screen may be seen. While on, a Bash guard refuses anything that opens a window (open, osascript, GUI app binaries, game/player builds, headed browsers, Unity without -nographics, Blender without -b) and queues the refused command for later. Questions are allowed but never waited on. Exclusive with night mode: turning one on turns the other off."
version: 1.0.0
tags: [hooks, guard, work-mode, night-mode, headless]
status: production
---

# Work Mode

## Contract

The user is at work and the Mac's screen may be seen by others. While the flag is on:

- **Open no visible window on this Mac.** No `open` (apps, files, URLs), no `osascript`, no Quick Look,
  no launching GUI apps or game/player binaries (`*.app/Contents/MacOS/*`, MDTWII `Builds/*.app`),
  no headed browsers (`playwright --headed/--ui/--debug`).
- **Unity only headless:** `-batchmode -nographics`. In MDTWII that is `tools/unity/run.sh --nographics ...`
  (EditMode tests: `tools/unity/run.sh --nographics --test EditMode`). Captures, player builds and render
  jobs (`CaenBuild.BuildCapture*`, `CampaignCapture`, `CampaignPlayerBuild`) are refused even with `--nographics`.
- **Blender only with `-b`/`--background`.** MDTWII `tools/blender/run.sh` already passes `-b`.
- **Visual checks are queued, not dropped.** The guard appends each refused command (with its cwd) to the
  queue; `work-mode.sh off` and `work-mode.sh queue` print it for the user to run later. Do not retry a refused
  command or look for another way to show a window. Note the pending visual check in your report and carry on.
- **Offload heavy builds and tests to the VPS** where the project supports it (`cfn-vps` skill). Guidance only;
  the guard does not enforce it.
- **Questions are allowed, never blocking.** Unlike night mode, AskUserQuestion works. Ask, then keep working
  on anything that does not depend on the answer.

## Swapping with night mode

The two modes are exclusive.

- `work-mode.sh on` turns night mode off first via `night-mode.sh off`, so the night report still prints.
- `night-mode.sh on` turns work mode off first via `work-mode.sh off`, so the queue still prints.
- `mode.sh night|work|off|status` is one switch for both.

## CLI reference

```bash
bash $HOME/.claude/skills/cfn-work-mode/work-mode.sh on               # night off first, then flag on
bash $HOME/.claude/skills/cfn-work-mode/work-mode.sh off              # flag off, print the queue
bash $HOME/.claude/skills/cfn-work-mode/work-mode.sh status           # both flags, queue size, registrations
bash $HOME/.claude/skills/cfn-work-mode/work-mode.sh queue [--clear]  # list (or empty) refused commands
bash $HOME/.claude/skills/cfn-work-mode/work-mode.sh doctor [--install]
bash $HOME/.claude/skills/cfn-work-mode/mode.sh night|work|off|status
```

State lives in `$HOME/.claude/`: `.work-mode-active` (ISO UTC start, the flag; it does not expire) and
`.work-mode-queue.log` (`<iso>\t<project>\t<cwd>\t<command>`). Overrides: `CFN_WORK_MODE_DIR`,
`CFN_WORK_SETTINGS`, `CFN_WORK_MODE_PATTERNS`, and `CFN_NIGHT_MODE_DIR` for the night flag.

## Rules are data

`patterns.conf` in this folder holds every block/allow rule: `action ;; scope ;; regex ;; message`, first
match wins per simple command. Scope `*` applies everywhere; a project name (the folder holding the repo's
`.git`, so worktrees count as their main repo) applies only there. MDTWII's rules live there too. Add a
rule, then add a case to the test script and run it.

The guard splits the Bash command into simple commands on `; & | ( )` backticks and newlines outside quotes,
strips leading `VAR=value` and wrappers (`env`, `nohup`, `exec`, `time`, `timeout N`), and matches rules
anchored on the program being run. So `fopen`, `--open-files`, `git log --oneline`, quoted text and
`grep ... tools/unity/run.sh` all pass. Known gap: a command hidden inside a quoted string
(`bash -c "open x"`) is not inspected.

## Hooks

- `.claude/hooks/cfn-work-mode-guard.sh`: PreToolUse, matcher `Bash`. Exit 2 with a message naming what was
  refused, the allowed alternative, and that it was queued. Fails open (exit 0) when the flag is off, jq is
  missing, or `patterns.conf` is missing.
- `.claude/hooks/cfn-work-mode-inject.sh`: SessionStart and UserPromptSubmit; one-line reminder while on.
- Tests: `bash $HOME/.claude/hooks/cfn-work-mode-guard.test.sh` (uses a temp flag dir, never the real flag).

Registrations live in `~/.claude/settings.local.json`. Install or repair with `doctor --install`; verify with
plain `doctor` (exit 1 names what is missing).

## Dependencies

`bash`, `jq`, `git` (project detection), `awk`.
