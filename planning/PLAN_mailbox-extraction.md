# PLAN: Extract the mailbox into its own repo

Status: approved by Michael 2026-11-18. Private repo first, Codex security review before going public.

## Goal
Move cfn-mailbox out of claude-flow-novice (CFN) into a standalone repo, github.com/masharratt/cfn-mailbox (private for now).
It is the ONLY home of the mailbox code. CFN uses it through a git submodule. Steve (CTO) installs it in his own VPS account from that repo.

## Decisions (made, do not reopen)
- Separate repo, fresh history. No CFN history is copied (the CFN history holds old leaked credentials).
- CFN links it as a git submodule (GitHub-tracked link). CI checks out submodules using a read-only deploy key while private.
- Open source later, only after a Codex security review for personal info.

## Files that move (from git ls-files)
- .claude/skills/cfn-mailbox/ (mailbox.sh, mailbox-watch.sh, codex-mail.sh, project-name.sh, proxy-tunnel.py, SKILL.md)
- .claude/skills/cfn-mailbox-listener/ (plugin: .claude-plugin/plugin.json, hooks/hooks.json, hooks/register.ts, register.test.ts)
- .claude/hooks/cfn-mailbox-hook.sh
- Mailbox-only tests: tests/test-cfn-mailbox.sh, -codex, -delivery, -hooks, -listen, -watch, -tunnel.py, and the fake redis helper tests/lib/fake-redis-cli.sh (copy; fleet tests may also use it)
Stays in CFN: tests/test-cfn-mailbox-fleet.sh and tests/test-cfn-fleet-mailbox.sh (they test fleet), planning/, readme/wiki.

## Path contract (must keep working, every project depends on it)
- $HOME/.claude/skills/cfn-mailbox/mailbox.sh (and mailbox-watch.sh, codex-mail.sh)
- $HOME/.claude/hooks/cfn-mailbox-hook.sh (referenced 5x in ~/.claude/settings.json)
- $HOME/.claude/skills/cfn-mailbox-listener/ (plugin)
Suggested CFN layout: submodule at .claude/vendor/cfn-mailbox; .claude/skills/cfn-mailbox, .claude/skills/cfn-mailbox-listener and .claude/hooks/cfn-mailbox-hook.sh become relative symlinks into it. Repo layout is the implementer's call as long as the contract holds.

## Known couplings to break
- mailbox.sh sets REPO to three dirs up and reads REPO/.env (adduser admin URL) and sources REPO/.claude/helpers/cfn-portable.sh (macOS shims, optional). Standalone: admin env path via MAILBOX_ADMIN_ENV (already supported) with a sane default; portability helper optional or vendored.
- Consumers in CFN: cfn-fleet (lib/common.sh, lib/mail.sh, lib/spawn-remote.sh, SKILL.md), cfn-tmux-agents (execute.sh, lib/sandbox.sh, tests), zai-fence.sh + lib, open-dirs.sh, vps-rebuild.sh, statusline-command.sh, test-tooling-nudge.sh, test-zai-fence.sh, test-cfn-fleet-spawn-host.sh.

## Phases
1. Build standalone repo locally at ~/projects/cfn-mailbox (git init, no push). All moved tests green there. Add README (install for a new person: redis-tools, clone, env file at ~/.config/cfn-mailbox/env, optional hook) and an install.sh. No personal info: no michael/steve/gg names, hosts, IPs, emails in code, tests, docs.
2. Main session creates the private GitHub repo and pushes.
3. CFN swap: submodule + symlinks, consumers updated, CI checkout with submodules + deploy key, full suite green. Every machine (desktop, VPS, Mac) needs git submodule update --init after pulling, or the mailbox breaks there.
4. Install in Steve's VPS account. Fresh mailbox password (re-run adduser steve --login steve-vps), env file 600.
5. Codex team security review for personal info and secrets, before any public flip.
