# macOS Setup (CFN Porting Guide)

**Last Updated:** 2026-08-18
**Status:** Sections 4, 5 and 6 (in-repo half) are fixed and gated in CI, and CI now runs
the shell gates on a `macos-latest` runner with a deliberately BSD userland. Everything
else is unverified on real hardware: a static-analysis checklist, not a validated runbook.

CFN is developed on WSL2 (Ubuntu) and assumes a GNU userland. A `git clone` on macOS gets
you roughly half a working install. This document lists every gap found by auditing the
repo, so the next person setting up a Mac does not rediscover them one broken hook at a time.

Every count below was measured against this repo. The measuring command is included so you
can re-run it and see whether the number has moved.

> **No human has run this on a Mac.** CI exercises the shell layer on a macOS runner, which
> is not the same as a working install: it never touches Homebrew's GNU tools, the reverse
> symlinks, CodeSearch, or a signed-in Claude Code. Treat the rest as a hypothesis to
> verify, and correct this file in the same commit when you do.

---

## 1. Audience and scope

Read this if you are setting up CFN on macOS (Apple Silicon or Intel) from
`github.com/masharratt/claude-flow-novice`.

Out of scope: the CFN Loop itself, skill authoring, agent design. Those are unchanged
across platforms. See `readme/INDEX.md`.

---

## 2. What the clone does not give you

`git clone` ships 1527 tracked files under `.claude/`. The following are gitignored or were
never tracked. They must be copied from a working machine or recreated by hand.

| Item | Why it is missing | Consequence if skipped |
|------|-------------------|------------------------|
| `~/.claude/settings.json` | untracked | No hooks, no statusline, no plugins |
| `.claude/settings.json` | gitignored (`.gitignore:230`) | No provider/env config |
| `.claude/settings.local.json` | gitignored (`.gitignore:228`) | No local permissions |
| `.env` | gitignored | No `DATABASE_URL`, db-query skill inert |
| `.claude/tooling/jq` | gitignored (`.gitignore:6`) | Vendored `jq` absent (and it is a Linux ELF binary regardless) |
| `.claude/skills/cfn-codesearch/target/` | gitignored (`.gitignore:3`) | CodeSearch binary must be compiled |
| `.claude/cfn-data/*.db` | gitignored (`.gitignore:9`) | Empty memory/decision stores (expected, they rebuild) |

### The operating guide now ships with the clone

`~/.claude/CLAUDE.md`, `RTK.md`, `model-pricing.md`, `rules/` and `references/` were
untracked local files until 2026-08-18. They are now tracked at `.claude/global/` and
symlinked into `~/.claude/`, so a clone carries the rules, not just the tooling. Link them
with `.claude/cfn-scripts/link-global-config.sh` (§7). The stale
`root-claude-distribute/CFN-CLAUDE.md` copy was deleted in the same commit: it was a
v2.21.0 snapshot kept for npm packaging that is no longer done.

### Transfer manifest

From the source machine:

```bash
tar czf cfn-untracked.tgz \
  -C "$HOME" \
  .claude/settings.json
```

That is the whole manifest now. `~/.claude/settings.json` holds hooks, statusline and
plugin config; the guide and references come from the clone. The project-local
`.claude/settings.json` and `.env` hold live credentials and are handled separately in §8.

`.env`, `.claude/settings.json` (project) and `.claude/settings.local.json` hold live
credentials. Move them over a secure channel, one at a time, and never into a tracked file.
See §8.

---

## 3. Prerequisites

```bash
# Homebrew first, then:
brew install bash coreutils gnu-sed grep findutils jq node rust \
             openssl pkg-config cmake postgresql redis
```

| Tool | Needed for |
|------|-----------|
| `bash` 5.x | §4. macOS ships bash 3.2 |
| `coreutils` `gnu-sed` `grep` `findutils` | §5. GNU flags used throughout |
| `jq` | Ubiquitous in CFN scripts, resolved from `PATH` |
| `node` >=18, `npm` >=9 | `package.json` `engines` |
| `rust` | CodeSearch is not shipped compiled (§7) |
| `openssl` `pkg-config` `cmake` | CodeSearch links `openssl-sys`, builds `fastembed` (ONNX) |
| `postgresql` (client) | `psql`/`pg_dump` for db-query and `cfn-migration-rehearsal` |
| `redis` | Orchestration modes that use Redis coordination |

Docker Desktop only if you use docker mode.

---

## 4. bash 3.2

macOS `/bin/bash` is 3.2 (2007, held there for GPLv2 licensing reasons). It has no
associative arrays, no `mapfile`, no `readarray`. 33 files here use `declare -A` and 9 use
`mapfile`/`readarray`.

**This is already fixed in the repo.** Every tracked script a person executes now uses
`#!/usr/bin/env bash`, which resolves whichever bash is first on `PATH`. `brew install bash`
puts bash 5 at `/opt/homebrew/bin/bash` (Apple Silicon) or `/usr/local/bin/bash` (Intel).
It cannot replace `/bin/bash`, because SIP blocks writes to `/bin`, which is why the shebang
had to change rather than the `PATH`.

You only need to make sure brew's bin directory comes before `/bin`:

```bash
/usr/bin/env bash -c 'echo $BASH_VERSION'   # want 5.x, not 3.2
```

The `tests/test-shell-portability.sh` gate enforces this and runs in CI, so it cannot rot
back. If you add a script, use `#!/usr/bin/env bash`.

Scripts under `docker/`, `legacy/`, `planning/`, `packages/` and the archive trees were left
on `#!/bin/bash` deliberately. They are Linux-container-bound or dead, and are excluded from
the gate.

## 5. GNU vs BSD userland

**Status: handled in the repo.** You do not have to install GNU tools to make CFN's own
scripts work. This section explains what was done and what it still does not cover.

### The problem

macOS ships a BSD userland. A script that is correct on WSL2 fails on a Mac in one of two
ways: the command does not exist at all, or it exists with incompatible flags. Measured
across the 1007 scripts in the portability gate's scope:

| Call | Sites | macOS behavior without GNU tools |
|------|-------|----------------------------------|
| `timeout` | 283 | Not installed. Command not found |
| `stat -c` | 90 | BSD `stat` has no `-c`. Errors out |
| `sed -i ` | 38 | BSD `sed -i` takes the next arg as a backup suffix. **Corrupts files** |
| `date -d ` | 38 | BSD `date` has no `-d`. Errors out |
| `free -m` | 31 | Does not exist |
| `readlink -f` | 17 | Arrived in macOS 12.3. Broken below that |
| `realpath` | 15 | Arrived in macOS 12.3 |
| `nproc` | 4 | Does not exist |
| `grep -P` | 4 | BSD grep has no PCRE |

Re-measure with:

```bash
bash tests/test-shell-portability.sh --list | xargs grep -hnE '<pattern>' | wc -l
```

### The fix: `.claude/helpers/cfn-portable.sh`

The obvious remedy is "install coreutils and put gnubin first on `PATH`". That works in a
login shell and fails in the places that matter most: hooks spawned by Claude Code, cron,
launchd, and any non-interactive shell that never reads a profile. A CFN hook that silently
runs BSD `sed -i` corrupts the file it was asked to edit.

So the `PATH` dependency was removed instead. `.claude/helpers/cfn-portable.sh` defines
shell functions that shadow the missing or incompatible commands, and 182 scripts source it
with one line placed after their `set -e`:

```bash
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
```

Three properties make this safe to apply at that scale:

1. **Every shim is defined only when the GNU behavior is absent.** On Linux the file defines
   nothing at all, so the injection cannot change WSL2 behavior. `tests/test-portable-shims.sh`
   asserts this directly.
2. **Every shim delegates through `command`,** so it can never recurse into itself.
3. **Untranslated forms pass through to the real binary** and fail visibly, rather than
   being guessed at and silently producing a wrong answer.

What each shim does:

| Command | Trigger | Behavior |
|---------|---------|----------|
| `timeout` | not on `PATH` | uses `gtimeout` if present, else a `perl -e 'alarm'` fallback |
| `stat` | `stat -c` rejected | translates the GNU format string to BSD (`%Y`->`%m`, `%s`->`%z`, `%a`->`%Lp`, ...) |
| `date` | `date -d @0` rejected | `-d @EPOCH` becomes `-r EPOCH`; `-d 'N units ago'` becomes `-v-Nu` |
| `sed` | `sed --version` rejected | inserts the empty backup suffix BSD `-i` requires |
| `free` | not on `PATH` | synthesizes the procps `free -m` layout from `vm_stat` and `sysctl` |
| `nproc` | not on `PATH` | `sysctl -n hw.ncpu` |
| `readlink` | `readlink -f` rejected | resolves via `perl -MCwd` |

The `timeout` fallback exits **142** (128 + SIGALRM) on expiry, not GNU's **124**. Do not
compare against 124 in portable code.

### What this does not cover

A shell function is not inherited by a separate binary. A GNU-ism inside `find -exec`,
`xargs`, `sudo`, or a `#!/bin/sh` subscript still runs the real BSD tool. Those call sites
were fixed in place instead, by rewriting them to POSIX equivalents:

- `find ... -exec stat -c%s {} +` became `find ... -exec cat {} + | wc -c` (which also fixed
  a real bug: the original emitted one size per line rather than the total it was assigned to)
- `grep -P "\t..."` became `grep -F` against a `printf`-built literal tab
- `head -n -N` (drop last N lines, GNU only) became `sed '$d'`

`systemd-run` in `.claude/cfn-scripts/run-with-memory-limit.sh` is Linux-only and is not
shimmed. It already falls back to `ulimit`, so it degrades rather than breaking.

### You may still want the GNU tools

Nothing above stops you installing them, and your own shell one-liners will want them:

```bash
brew install coreutils gnu-sed grep findutils
```

```bash
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/gnu-sed/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/grep/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/findutils/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/bin:$PATH"   # bash 5 ahead of /bin
```

The shims probe for capability rather than checking `uname`, so if GNU tools are first on
`PATH` they step aside and the real binaries are used.

---

## 6. Hardcoded paths

### Global settings (still yours to do)

`~/.claude/settings.json` is not in the repo, and it pins 5 commands to a literal Linux
home. On macOS the home is `/Users/<you>`, so all 5 break:

- `PreCompact` -> `cfn-precompact-task.sh`
- `UserPromptSubmit` -> `cfn-autoset-task.sh`
- `Stop` -> `cfn-notify.sh stop`
- `Notification` -> `cfn-notify.sh input`
- `statusLine` -> `statusline-command.sh`

Rewrite all 5 to `$HOME`. Three `PostToolUse` hooks already use `$HOME` and need no change.
This is the single highest-value fix you still have to make by hand: without it no hook
fires at all.

```bash
gsed -i 's|/home/[a-z]*/\.claude|$HOME/.claude|g' ~/.claude/settings.json
jq . ~/.claude/settings.json >/dev/null && echo "valid json"
```

### In-repo scripts (fixed)

**Already fixed.** 198 hardcoded paths across 57 scripts were removed. They fell into
four groups:

| Group | Count | Was | Now |
|-------|-------|-----|-----|
| Stale Windows-side repo copy | 95 | `/mnt/c/Users/<user>/Documents/claude-flow-novice/...` | `$PROJECT_ROOT`, derived from `BASH_SOURCE` |
| Non-existent placeholder repo root | 89 | `/home/user/claude-flow-novice/...` | `$PROJECT_ROOT` |
| One machine's projects directory | 9 | `/home/<user>/projects` | `${CFN_PROJECTS_ROOT:-$HOME/projects}` |
| External tools and other checkouts | 5 | absolute paths to a memory monitor and another repo | env vars, with the destructive ones now skipping rather than guessing |

The first two groups were not only Mac problems. `/home/user/claude-flow-novice` never
existed on any machine, and the `/mnt/c/...` tree is a stale copy of this repo that still
sits on the Windows filesystem, so those scripts were silently reading and writing the wrong
checkout on WSL too.

A small number of absolute paths are legitimate and are exempted with an inline
`# portability-ok: <reason>` marker: paths inside a container image, and literal strings fed
to a log sanitizer under test. The reason is mandatory, so the exemption cannot be used as a
silent mute.

## 7. Reverse symlinks

CFN's model: this repo is the source of truth, and `~/.claude/<dir>` symlinks back into it,
so every project on the machine shares one copy. Recreate that layout after cloning.

`migrate-cfn-to-global.sh` in the repo root moves-then-links. That is the wrong direction
for a fresh clone (the repo is already authoritative). Use the link-only form below.

```bash
#!/usr/bin/env bash
# UNVERIFIED on macOS. Read it before running it.
set -euo pipefail
REPO="${1:?usage: link-cfn.sh /path/to/claude-flow-novice}"
REPO="$(cd "$REPO" && pwd -P)"
G="$HOME/.claude"
mkdir -p "$G" "$G/agents"

LINKS=(skills hooks commands core helpers cfn-config cfn-data cfn-extras
       cfn-scripts adaptive-context agent-principles prompts tooling
       statusline-command.sh)

for name in "${LINKS[@]}"; do
  src="$REPO/.claude/$name"; dst="$G/$name"
  [ -e "$src" ] || { echo "SKIP missing: $src"; continue; }
  if [ -L "$dst" ]; then rm "$dst"
  elif [ -e "$dst" ]; then mv "$dst" "$dst.pre-cfn.$(date +%s)"; fi
  ln -s "$src" "$dst"; echo "linked $name"
done

# agents/ stays a real directory. Only the cfn-dev-team subdir is linked.
src="$REPO/.claude/agents/cfn-dev-team"; dst="$G/agents/cfn-dev-team"
[ -L "$dst" ] && rm "$dst"
ln -s "$src" "$dst"; echo "linked agents/cfn-dev-team"
```

Then link the global config layer. That one has its own tracked script because the entries
are individual files, not whole directories:

```bash
.claude/cfn-scripts/link-global-config.sh          # idempotent; backs up anything it replaces
.claude/cfn-scripts/link-global-config.sh --check  # verify only, no writes
```

It links `CLAUDE.md`, `RTK.md`, `model-pricing.md`, `rules/` and `references/`. Nothing it
overwrites is deleted: pre-existing files move to `~/.claude-global-config-backup-<ts>/`.

Verify against the reference layout (14 top-level links plus `agents/cfn-dev-team`):

```bash
find ~/.claude -maxdepth 2 -type l -printf '%P -> %l\n' 2>/dev/null | sort
# GNU find via findutils. BSD find has no -printf.
```

---

## 8. Security

### Repo history

`.git` is **963 MB**. A prior audit found credentials committed to that history. The known
ones are dead or rotated (Trigger.dev keys return 401, the Z.ai key was rotated, the Redis
password was a local Docker `requirepass`, never a hosted credential), but the **values are
still present in history**.

On a company-managed laptop that history lands on company disk and may be swept by backup
or DLP tooling. Unless you need history:

```bash
git clone --depth 1 https://github.com/masharratt/claude-flow-novice.git
```

Shallow clone also cuts the transfer from ~963 MB to a fraction.

### Live credentials

`.claude/settings.json` (project) carries a provider auth token in plaintext. It is
gitignored, so it does not travel with the clone. Recreate it on the Mac by hand. Never
paste a token into a tracked file, and never into this document.

---

## 9. Components that do not work on macOS

Not blockers. They fail closed or no-op. Know that they are inert so you do not debug them.

| Component | Dependency | macOS behavior | Fix |
|---|---|---|---|
| `.claude/hooks/cfn-notify.sh` | `powershell.exe`, `C:\Windows\Media` | Exits 0 silently, no sound | Port to `afplay` / `osascript` |
| `.claude/skills/cfn-workbench/render.sh` | `wslpath`, `explorer.exe`, `xdg-open` | Renders, cannot open the page | Add an `open` branch |
| WSL memory monitor | `~/.local/bin/wsl-memory-monitor.sh` | Absent | Not needed. macOS has no WSL memory pathology |
| `.claude/cfn-scripts/run-with-memory-limit.sh` | `systemd-run`, `/proc` | Falls back to `ulimit`. Tests run, the cap is weak | Accept, or port to a macOS mechanism |
| 11 scripts reading `/proc/` | procfs | No `/proc` on macOS. Memory/process introspection degrades | Per-script `sysctl`/`ps` branch |

`.claude/hooks/cfn-autoset-task.sh:18` calls `timeout 2s cat`. Without GNU `timeout` the
command fails and the fallback yields `{}`, so the hook no-ops instead of crashing. §5 fixes
this properly.

---

## 10. CodeSearch

Not shipped compiled. `.claude/skills/cfn-codesearch/target/` is gitignored.

The SessionStart hook `cfn-SessionStart-cfn-build-codesearch.sh` checks
`~/.local/bin/local-codesearch`, then the local `target/release/local-codesearch`, then runs
`cargo build --release` if `cargo` is on `PATH`. So installing Rust before the first Claude
Code session is enough to trigger the build automatically.

First build is slow (`fastembed` pulls an ONNX runtime, `openssl-sys` needs `pkg-config`
plus brew openssl). If it fails:

```bash
export PKG_CONFIG_PATH="$(brew --prefix openssl)/lib/pkgconfig"
cd .claude/skills/cfn-codesearch && cargo build --release
```

Then index:

```bash
/codebase-reindex
/codebase-search "some query"
```

CodeSearch is mandatory before grep per the CFN rules, so a failed build degrades every
agent in the system. Do not leave it broken.

---

## 11. Recommended order

1. Install prerequisites (§3), set `PATH` (§5), open a new shell
2. `git clone --depth 1` (§8)
3. `npm install`
4. Copy the untracked/gitignored set from a working machine (§2)
5. Rewrite `~/.claude/settings.json` paths to `$HOME` (§6)
6. Create the reverse symlinks (§7)
7. Confirm bash 5 wins: `/usr/bin/env bash -c 'echo $BASH_VERSION'` (§4)
8. Start Claude Code, let the SessionStart hook build CodeSearch (§10)
9. Run the verification checklist below

---

## 12. Verification checklist

Do not declare the setup done until all of these pass.

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| 1 | bash 5 resolves | `/usr/bin/env bash -c 'echo $BASH_VERSION'` | starts with `5.` |
| 2 | Portability gate | `bash tests/test-shell-portability.sh` | both checks PASS |
| 3 | Syntax gate | `bash tests/test-shell-syntax.sh` | all in-scope scripts parse |
| 4 | Shims work here | `bash tests/test-portable-shims.sh` | `0 failed` |
| 5 | Shims are active | `bash -c '. .claude/helpers/cfn-portable.sh; type -t stat sed'` | `function` twice, unless GNU tools are first on `PATH` |
| 6 | Symlinks correct | `find ~/.claude -maxdepth 2 -type l \| wc -l` | 15 or more |
| 7 | Global config linked | `.claude/cfn-scripts/link-global-config.sh --check` | `OK (5 of 5 linked)` |
| 8 | Settings valid | `jq -e '.hooks' ~/.claude/settings.json` | no `/home/` remains |
| 9 | Hooks fire | edit any file in Claude Code | pre/post-edit backup written to `.claude/backups/` |
| 10 | Hook self-test | `bash .claude/hooks/cfn-hook-selftest.sh` | `all hook checks passed` |
| 11 | Doc lint runs | `/cfn-doc-lint` | completes, no interpreter error |
| 12 | CodeSearch works | `/codebase-search "cfn loop"` | returns results, not "index missing" |
| 13 | A skill self-test | `bash .claude/skills/cfn-migration-rehearsal/tests/test-migration-rehearsal.sh` | `8 passed, 0 failed` |
| 14 | Node build | `npm run typecheck` | matches the result on a known-good machine |

Checks 1 to 5 are what the `macOS Portability` CI job already runs on every push, so they
should pass before you touch anything. If one of them fails on your Mac but passes in CI,
the difference is your machine, not the repo.

Check 13 is a good canary for the rest: it exercises `grep -iE`, `mktemp -d`, `git init`,
and env handling in one shot, with no database required.

Note that checks 2 and 4 no longer require GNU sed or a `timeout` binary. That is the point
of section 5. If you install the GNU tools anyway, the shims step aside and the checks still
pass.

---

## 13. Open items

Not yet done. Pick these up if you are the one doing the port.

- **No human has run this on a Mac.** CI covers the shell layer only. Sections 7 (reverse
  symlinks), 10 (CodeSearch) and the Claude Code integration itself are still unverified.
- The `macOS Portability` CI job deliberately installs only bash 5, so it proves the shims
  work against a stock BSD userland. It does **not** prove a full install works: it never
  creates the reverse symlinks, never builds CodeSearch, and never runs a hook under
  Claude Code.
- `cfn-notify.sh` and `cfn-workbench/render.sh` need macOS branches, not workarounds.
- CodeSearch is a Rust build with `openssl-sys` and `fastembed` (ONNX) dependencies. Nobody
  has compiled it on Apple Silicon. Section 10 is the least-tested part of this document.
- `systemd-run` in `.claude/cfn-scripts/run-with-memory-limit.sh` has no macOS equivalent.
  It falls back to `ulimit`, so memory caps are softer there than on WSL2.

When you verify a section, update it here in the same commit and change the Status line at
the top of this file.
