# macOS Setup (CFN Porting Guide)

**Last Updated:** 2026-08-17
**Status:** Unverified on hardware. This is a static-analysis port checklist, not a validated runbook.

CFN is developed on WSL2 (Ubuntu) and assumes a GNU userland. A `git clone` on macOS gets
you roughly half a working install. This document lists every gap found by auditing the
repo, so the next person setting up a Mac does not rediscover them one broken hook at a time.

Every count below was measured against this repo. The measuring command is included so you
can re-run it and see whether the number has moved.

> **Nothing here has been executed on a Mac.** Treat each section as a hypothesis to verify.
> When you do run it, correct this file in the same commit.

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
| `~/.claude/CLAUDE.md` | untracked, global only | No CFN operating guide. Agents lose all CFN rules. |
| `~/.claude/RTK.md` | untracked | RTK token proxy conventions unavailable |
| `~/.claude/rules/code-quality.md` | untracked | Auto-loaded quality rules missing |
| `~/.claude/references/*.md` (6 files) | untracked | On-demand reference table dead-links |
| `~/.claude/settings.json` | untracked | No hooks, no statusline, no plugins |
| `.claude/settings.json` | gitignored (`.gitignore:230`) | No provider/env config |
| `.claude/settings.local.json` | gitignored (`.gitignore:228`) | No local permissions |
| `.env` | gitignored | No `DATABASE_URL`, db-query skill inert |
| `.claude/tooling/jq` | gitignored (`.gitignore:6`) | Vendored `jq` absent (and it is a Linux ELF binary regardless) |
| `.claude/skills/cfn-codesearch/target/` | gitignored (`.gitignore:3`) | CodeSearch binary must be compiled |
| `.claude/cfn-data/*.db` | gitignored (`.gitignore:9`) | Empty memory/decision stores (expected, they rebuild) |

### Do not use `root-claude-distribute/CFN-CLAUDE.md`

That in-repo copy is **stale (v2.21.0)**. The live global guide is v2.25.0+. Copy the real
`~/.claude/CLAUDE.md` across. Resyncing the distributed copy is a separate open task.

### Transfer manifest

From the source machine:

```bash
tar czf cfn-untracked.tgz \
  -C "$HOME" \
  .claude/CLAUDE.md \
  .claude/RTK.md \
  .claude/rules \
  .claude/references \
  .claude/model-pricing.md \
  .claude/settings.json
```

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

## 4. bash 3.2 is the hardest blocker

macOS `/bin/bash` is 3.2 (2007, GPLv2 for licensing reasons). It has no associative arrays.

| Measurement | Count | Command |
|---|---|---|
| Scripts pinned to `#!/bin/bash` | 351 | `grep -rh '^#!' --include='*.sh' .claude/ \| grep -v /target/ \| sort \| uniq -c` |
| Scripts using `#!/usr/bin/env bash` | 238 | (same) |
| Files using `declare -A` | 33 | `grep -rlE --include='*.sh' 'declare -A' .claude/ \| grep -v /target/ \| wc -l` |
| Files using `mapfile`/`readarray` | 9 | `grep -rlE --include='*.sh' 'mapfile\|readarray' .claude/ \| grep -v /target/ \| wc -l` |

`brew install bash` puts bash 5 at `/opt/homebrew/bin/bash` (Apple Silicon) or
`/usr/local/bin/bash` (Intel). It does **not** replace `/bin/bash`, and SIP prevents that.
So the 238 `env bash` scripts pick up bash 5 once brew's bin is ahead on `PATH`. The 351
hard-pinned ones still get 3.2 and fail.

**Remediation: normalize the shebangs.** Preferred over shimming because it is portable,
reviewable, and fixes the problem for every future Mac.

```bash
# Dry run first. Inspect the list before running the second command.
grep -rl '^#!/bin/bash' --include='*.sh' .claude/ | grep -v /target/

# Apply (GNU sed, from brew, as `gsed` unless gnubin is on PATH)
grep -rlZ '^#!/bin/bash' --include='*.sh' .claude/ | grep -zv /target/ \
  | xargs -0 gsed -i '1s|^#!/bin/bash$|#!/usr/bin/env bash|'
```

Then confirm bash 5 actually wins:

```bash
/usr/bin/env bash -c 'echo $BASH_VERSION'   # want 5.x
```

---

## 5. GNU vs BSD userland

Measured across `.claude/` (excluding `target/`):

| Call | Files | macOS behavior without GNU tools |
|------|-------|----------------------------------|
| `timeout` | 138 | Not installed. Silent degradation, hooks lose their input |
| `stat -c` | 25 | BSD `stat` uses `-f`. Wrong output, not an error |
| `sed -i ` | 22 | BSD `sed -i` consumes the next arg as a backup suffix. **Corrupts files** |
| `readlink -f` | 20 | Works on macOS 13+. Broken below |
| `realpath` | 14 | Works on recent macOS |
| `free -m` | 5 | Does not exist. Use `vm_stat` |
| `nproc` | 2 | Does not exist. Use `sysctl -n hw.ncpu` |
| `grep -P` | 1 | BSD grep has no PCRE. `.claude/hooks/cfn-codesearch-logger.sh` |

Re-measure any row with:

```bash
grep -rlE --include='*.sh' '<pattern>' .claude/ | grep -v /target/ | wc -l
```

**Remediation: put GNU tools first on `PATH`.** Cheaper and lower-risk than patching 200
scripts, and it makes the Mac behave like CI.

Add to `~/.zshrc`:

```bash
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/gnu-sed/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/grep/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/opt/findutils/libexec/gnubin:$PATH"
export PATH="/opt/homebrew/bin:$PATH"   # bash 5 ahead of /bin
```

Verify:

```bash
sed --version | head -1     # want "GNU sed"
stat --version | head -1    # want "GNU coreutils"
grep --version | head -1    # want "GNU grep"
command -v timeout          # want a gnubin path
```

`sed -i` is the dangerous one. If GNU sed is not first, in-place edits silently mangle
files instead of erroring.

**Known limitation of this approach:** hooks launched by Claude Code inherit the login
environment, not your interactive shell. If a hook behaves as though GNU tools are absent,
export the `PATH` from a place the GUI session reads, or make the hook resolve `gsed`/
`gstat` explicitly.

---

## 6. Hardcoded paths

### Global settings

`~/.claude/settings.json` pins 5 commands to a literal Linux home. On macOS the home is
`/Users/<you>`, so all 5 break:

- `PreCompact` -> `cfn-precompact-task.sh`
- `UserPromptSubmit` -> `cfn-autoset-task.sh`
- `Stop` -> `cfn-notify.sh stop`
- `Notification` -> `cfn-notify.sh input`
- `statusLine` -> `statusline-command.sh`

Rewrite all of them to `$HOME`. Three `PostToolUse` hooks already use `$HOME` and need no
change. This is the single highest-value fix: without it no hook fires at all.

```bash
gsed -i 's|/home/[a-z]*/\.claude|$HOME/.claude|g' ~/.claude/settings.json
jq . ~/.claude/settings.json >/dev/null && echo "valid json"
```

### In-repo scripts

31 tracked scripts contain a hardcoded `/home/masha`. Notably:

- `.claude/skills/cfn-doc-lint/execute.sh`
- `.claude/skills/cfn-megaplan/bars/check-verifiable-static.sh`

Find the current set:

```bash
grep -rl '/home/masha' .claude/ --include='*.sh' --include='*.json' --include='*.js' \
  | grep -v /target/
```

These should become `$HOME` or repo-relative. Fixing them upstream benefits every machine,
so prefer a PR over a local patch.

---

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
7. Shebang sweep (§4)
8. Start Claude Code, let the SessionStart hook build CodeSearch (§10)
9. Run the verification checklist below

---

## 12. Verification checklist

Do not declare the setup done until all of these pass.

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| 1 | bash 5 resolves | `/usr/bin/env bash -c 'echo $BASH_VERSION'` | starts with `5.` |
| 2 | GNU sed first | `sed --version \| head -1` | says `GNU sed` |
| 3 | `timeout` exists | `command -v timeout` | non-empty |
| 4 | No stale shebangs | `grep -rl '^#!/bin/bash' --include='*.sh' .claude/ \| grep -v /target/ \| wc -l` | `0` |
| 5 | Symlinks correct | `find ~/.claude -maxdepth 2 -type l \| wc -l` | 15 or more |
| 6 | Global guide present | `head -1 ~/.claude/CLAUDE.md` | CFN Operating Guide header |
| 7 | Settings valid | `jq -e '.hooks' ~/.claude/settings.json` | no `/home/` remains |
| 8 | Hooks fire | edit any file in Claude Code | pre/post-edit backup written to `.claude/backups/` |
| 9 | Doc lint runs | `/cfn-doc-lint` | completes, no interpreter error |
| 10 | CodeSearch works | `/codebase-search "cfn loop"` | returns results, not "index missing" |
| 11 | A skill self-test | `bash .claude/skills/cfn-migration-rehearsal/tests/test-migration-rehearsal.sh` | `8 passed, 0 failed` |
| 12 | Node build | `npm run typecheck` | matches the result on a known-good machine |

Check 11 is a good canary: it exercises `grep -iE`, `mktemp -d`, `git init`, and env
handling in one shot, with no database required.

---

## 13. Open items

Not yet done. Pick these up if you are the one doing the port.

- No Mac has run this. Every section is unverified.
- 351 shebangs and 31 hardcoded paths are still Linux-shaped in the repo. Fixing them
  upstream is better than every Mac patching locally.
- `cfn-notify.sh` and `cfn-workbench/render.sh` need macOS branches, not workarounds.
- `root-claude-distribute/CFN-CLAUDE.md` is stale at v2.21.0 and should be resynced from
  the live global guide.
- CI runs on Linux only. Nothing catches a macOS regression. A `macos-latest` job running
  the skill self-tests would.

When you verify a section, update it here in the same commit and change the Status line at
the top of this file.
