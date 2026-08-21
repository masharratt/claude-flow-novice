#!/usr/bin/env bash
# Shell portability gate.
#
# CFN is developed on WSL2 but has to run on macOS too (readme/macos-setup.md),
# and CFN skills are invoked from OTHER projects, where the working directory is
# not this repo. Three classes of breakage are mechanical, so they are checked
# mechanically here instead of being rediscovered one broken hook at a time:
#
#   1. `#!/bin/bash` pins the script to whatever lives at that exact path. On
#      macOS that is bash 3.2 (2007), which has no associative arrays. Homebrew
#      installs bash 5 elsewhere and cannot replace /bin/bash (SIP). Only
#      `#!/usr/bin/env bash` picks up the modern interpreter.
#   2. A hardcoded /home/<user> or /Users/<user> path is correct on exactly one
#      machine.
#   3. A path like `.claude/skills/cfn-foo/bar.sh` resolves only when the shell's
#      cwd is this repo. Every other project has its own `.claude/`, so the
#      helper is simply absent and the call fails, usually silently, because
#      these are `|| true` side calls (event emitters, gates, path resolvers).
#      The shared copy lives at `$HOME/.claude/skills/` via the reverse symlinks
#      described in CLAUDE.md, so executable references must go through `$HOME`
#      (or `$CFN_SKILLS` / a `$(dirname)`-derived root / `$CLAUDE_PROJECT_DIR`).
#
# Scope is deliberately "everything a person actually executes": CFN skills and
# hooks, the test suite, build and deployment scripts. Dead archives and
# container-only scripts are excluded. `in_scope` is the single source of truth
# for the SHELL scope (checks 1 and 2); `in_scope_refs` is the single source of
# truth for the SKILL-REFERENCE scope (check 3). The fix-up sweeps consume
# `--list` and `--list-refs` from here so the scopes can never drift from the
# checks that use them.
#
# ---------------------------------------------------------------------------
# Check 3: how prose is told apart from code (the rule, and why this one)
# ---------------------------------------------------------------------------
# Check 3 has to read `.md` files, because `.claude/commands/*.md` bodies are
# executed, not just read. But `.md` files also legitimately cite repo-relative
# paths in tables, "see also" lists and file inventories. Two rules were
# measured against the tree before picking one:
#
#   (a) fence tracking: scan `.sh` fully, `.md` only inside ```bash fences.
#       Rejected: fence state is not reliably trackable with line-oriented
#       tools (nested fences, ~~~ blocks, unterminated fences), and it MISSES
#       the real class, because command bodies give bash one-liners outside
#       fences as often as inside them.
#
#   (b) executable-position shapes: ignore the file type entirely and match
#       only the syntactic positions where a shell would resolve the string as
#       a path. CHOSEN. One code path for `.sh` and `.md`, so the two can't
#       drift, and prose is filtered by shape rather than by guessing at
#       document structure. Measured 2026-08-19 against the tree mid-sweep:
#       299 hits, 0 prose false positives (every `.md` hit was a runnable
#       command line or an explicit "run <script>" instruction).
#
# The five shapes, and the prose each one deliberately steps around:
#
#   VAR=      `PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh`
#   ./        a line starting with `./.claude/skills/cfn-...`
#   arg       `.claude/skills/...` as an argument to an interpreter or
#             file-consuming builtin (bash, source, cd, cat, test, node, ...)
#   -f        a test operator's operand: `[ -f .claude/skills/cfn-... ]`
#   run-inst  a backticked path ending `.sh` FOLLOWED BY ARGUMENTS, i.e.
#             `` `.../check-phase-width.sh PLAN_<slug>.md` `` is a command
#             someone is being told to run.
#
# Every shape anchors `.claude` immediately after a delimiter or an opening
# quote, which is why no negative lookbehind is needed (ERE has none): a
# correctly-rooted reference always has `$HOME/`, `$CFN_SKILLS/`,
# `$CLAUDE_PROJECT_DIR/`, `"$ROOT/"` or a leading `/` in that position, so it
# simply fails to match.
#
# The `run-inst` shape is why a bare backticked path is NOT matched. Measured:
# matching every `` `<path>.sh` `` produced 71 hits of which ~50 were prose
# pointers ("Tests: `.../test.sh`", migration mapping tables, "(549 lines)").
# Requiring an argument after the path separates the two with no overlap:
# a pointer names a file and stops, an instruction passes it something. The
# accepted cost is that a bare-path run instruction ("Run `.../resolve.sh`"
# with no args) is not caught. The alternative was a 70% false-positive rate,
# which trains people to ignore the gate.
#
# `sed`, `grep` and `awk` are deliberately absent from the command list: they
# take the path as a SEARCH PATTERN as often as a file, and including them
# added zero hits on this tree while adding that false-positive class.
#
# Exclusions specific to check 3 (on top of the shared EXCLUDE_RE):
#   tests/, docs/, readme/, planning/, .claude/cfn-extras/
# These are either prose (docs, readme, planning artifacts) or run only from
# this repo's root, where a repo-relative path is correct by construction.
# `target/` and `node_modules/` are already covered by EXCLUDE_RE.
#
# Usage:
#   tests/test-shell-portability.sh              # check, non-zero on violation
#   tests/test-shell-portability.sh --list       # print in-scope shell files
#   tests/test-shell-portability.sh --list-refs  # print check-3 scope
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Directories excluded from the portability contract.
#   docker/, tests/docker-mode/  container-only, always Linux
#   *archive*, legacy/, planning/  dead or historical, not executed
#   packages/, api-gateway/, examples/, templates/, benchmark/, monitoring/,
#   analysis/  vendored or illustrative trees, not part of the CFN runtime
EXCLUDE_RE='^(docker/|archive/|legacy/|planning/|benchmark/|api-gateway/|packages/|examples/|templates/|monitoring/|analysis/|\.archive/)|(^|/)(\.backups|node_modules|target|archive)/'

# Additionally excluded from check 3 only: prose trees, plus the dead corners of
# cfn-extras.
#
# cfn-extras itself is NOT exempt. It is one of the 14 reverse-symlinked runtime
# dirs (see CLAUDE.md), so it is live code reached from every project, and
# excluding it wholesale is why a path corruption from 921604f4d survived there
# for ten months with no gate watching. Only the deliberately-dead subtrees are
# skipped: commands/deprecated/ and skills/deprecated/ are retained for history,
# and agents/unused/ is not dispatched.
EXCLUDE_REFS_RE='^(tests/|docs/|readme/)|^\.claude/cfn-extras/(commands/deprecated/|skills/deprecated/|agents/unused/)'

in_scope() {
  git ls-files '*.sh' | grep -vE "$EXCLUDE_RE"
}

# Check-3 scope: shell scripts PLUS the markdown and hook files that are
# executed rather than merely read. `.claude/commands/*.md` bodies are run by
# Claude; skill and agent markdown carries the invocation snippets those bodies
# copy; `.claude/hooks/*` includes non-.sh entrypoints and JSON hook configs
# that embed command strings. Keep this function as the only definition of that
# scope. Check 3 and `--list-refs` must never diverge.
# (A bare `*` in a git pathspec matches `/`, so these patterns cover nested
# files too; `**` would match ONLY nested ones.)
in_scope_refs() {
  git ls-files '*.sh' \
                '.claude/commands/*.md' \
                '.claude/skills/*.md' \
                '.claude/agents/*.md' \
                '.claude/hooks' \
    | sort -u | grep -vE "$EXCLUDE_RE" | grep -vE "$EXCLUDE_REFS_RE"
}

if [ "${1:-}" = "--list" ];      then in_scope;      exit 0; fi
if [ "${1:-}" = "--list-refs" ]; then in_scope_refs; exit 0; fi

FAIL=0

# --- check 1: no interpreter pinned to /bin/bash ------------------------------
BAD_SHEBANG=$(in_scope | while read -r f; do
  [ -f "$f" ] || continue
  head -1 "$f" | grep -q '^#!/bin/bash' && echo "$f"
done)

if [ -n "$BAD_SHEBANG" ]; then
  COUNT=$(echo "$BAD_SHEBANG" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT script(s) pin the interpreter to /bin/bash (bash 3.2 on macOS)." >&2
  echo "$BAD_SHEBANG" | head -20 | sed 's/^/  /' >&2
  [ "$COUNT" -gt 20 ] && echo "  ... and $((COUNT - 20)) more" >&2
  echo "  Fix: replace '#!/bin/bash' with '#!/usr/bin/env bash'." >&2
  FAIL=1
else
  echo "PASS: no script pins the interpreter to /bin/bash"
fi

# --- check 2: no hardcoded home directories in executable lines ---------------
# Comments are provenance, not behavior, so a path in a comment does not fail
# the gate. Anything a shell would evaluate does.
# `# portability-ok: <reason>` on the same line exempts a path that is
# legitimately absolute: a path inside a container image, or literal test data
# fed to a sanitizer. The reason is mandatory so the exemption cannot be used
# as a silent mute.
HOME_HITS=$(in_scope | while read -r f; do
  [ -f "$f" ] || continue
  grep -nE '(^|[^#])/(home|Users)/[a-z][a-z0-9_-]*/' "$f" 2>/dev/null \
    | grep -vE '^[0-9]+:[[:space:]]*#' \
    | grep -v 'portability-ok:' \
    | sed "s|^|$f:|"
done)

if [ -n "$HOME_HITS" ]; then
  COUNT=$(echo "$HOME_HITS" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT hardcoded home path(s) outside comments." >&2
  echo "$HOME_HITS" | head -20 | sed 's/^/  /' >&2
  [ "$COUNT" -gt 20 ] && echo "  ... and $((COUNT - 20)) more" >&2
  echo "  Fix: derive from \$HOME, or take it as a parameter with a \$HOME default." >&2
  FAIL=1
else
  echo "PASS: no hardcoded home paths outside comments"
fi

# --- check 3: no cwd-relative references to the shared CFN skills dir ---------
# Shapes and the prose-vs-code rule are documented in the header. Built from
# named fragments so the four shapes stay readable.
#
# Same comment convention as check 2: a line whose first non-space character is
# `#` is provenance, not behavior. In markdown that also drops headings, which
# is correct, because a heading is prose.
# Exemption: `portability-ok: <reason>` anywhere on the line, in whatever
# comment syntax the file uses (`#` in shell, `<!-- -->` in markdown). The
# reason is mandatory: a bare `portability-ok:` with nothing after it does NOT
# exempt, so the marker cannot be used as a silent mute.
_D='(^|[[:space:]]|[;|&(`]|\$\()'                    # delimiter before a word
_Q='["'"'"']?'                                        # optional opening quote
_S='\.claude/skills/cfn-'                             # the relative path itself
_CMD='bash|sh|zsh|source|\.|exec|eval|cd|cat|test|chmod|node|npx|python3|python|perl|jq|ls|rm|mkdir|cp|mv|tee|wc|head|tail'

REL_RE="${_D}[A-Za-z_][A-Za-z0-9_]*=${_Q}${_S}"                       # VAR=
REL_RE="$REL_RE|^[[:space:]]*[\`]?(\\\$ )?${_Q}\./${_S}"              # ./
REL_RE="$REL_RE|${_D}(${_CMD})([[:space:]]+-[A-Za-z-]+)*[[:space:]]+${_Q}${_S}"  # arg
REL_RE="$REL_RE|-[fdxserwLhs][[:space:]]+${_Q}${_S}"                  # -f operand
REL_RE="$REL_RE|\`${_S}[A-Za-z0-9_./-]*\.sh[[:space:]]+[^\`[:space:]]" # run-inst

REL_HITS=$(in_scope_refs | while read -r f; do
  [ -f "$f" ] || continue
  grep -nE "$REL_RE" "$f" 2>/dev/null \
    | grep -vE '^[0-9]+:[[:space:]]*#' \
    | grep -vE 'portability-ok:[[:space:]]*[^[:space:]]' \
    | sed "s|^|$f:|"
done)

if [ -n "$REL_HITS" ]; then
  COUNT=$(echo "$REL_HITS" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT cwd-relative reference(s) to .claude/skills/cfn-* in executable position." >&2
  echo "$REL_HITS" | cut -c1-160 | head -20 | sed 's/^/  /' >&2
  [ "$COUNT" -gt 20 ] && echo "  ... and $((COUNT - 20)) more" >&2
  echo "  Fix: skills are invoked from OTHER projects, where cwd is not this repo." >&2
  echo "       Use \$HOME/.claude/skills/cfn-* (the shared copy, see CLAUDE.md), or a" >&2
  echo "       \$(dirname \"\$0\")-derived root. Exempt a genuine repo-root-only call with" >&2
  echo "       'portability-ok: <reason>' on the same line." >&2
  FAIL=1
else
  echo "PASS: no cwd-relative .claude/skills/cfn-* references in executable position"
fi

# --- Check: no multi-line shell variable passed through `awk -v` -------------
#
# BSD awk (macOS) refuses a newline inside a -v string assignment:
#   awk: newline in string ... at source line 1
# It then inserts nothing and exits non-zero, while GNU awk and mawk both accept
# it, so the bug is invisible on Linux. Hit once for real:
# add-backlog-item.sh built BACKLOG_ENTRY with a heredoc and passed it as
# `awk -v entry="$BACKLOG_ENTRY"`, so every backlog write was a silent no-op on
# macOS. `-v` also expands backslash escapes, so user text containing \n is
# rewritten even where it does work.
#
# Detection is narrow on purpose: only a -v value whose variable is assigned from
# a heredoc (`VAR=$(cat <<EOF` / `VAR=$(<<`) or `read -r -d ''`. Those are the
# forms that guarantee real newlines. A -v fed by a plain assignment is fine.
#
# Fix: export the variable for the awk call and read it via ENVIRON["NAME"].
AWKV_HITS=""
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  f="${hit%%:*}"
  var=$(printf '%s' "$hit" | grep -oE '"\$\{?[A-Za-z_]+\}?"$' | tr -d '"${}')
  [ -n "$var" ] || continue
  if grep -qE "^[[:space:]]*${var}=\\\$\(cat <<|^[[:space:]]*${var}=\\\$\(<<|^[[:space:]]*read -r -d '' ${var}" "$f" 2>/dev/null; then
    AWKV_HITS="$AWKV_HITS$f: awk -v ... \"\$$var\" (heredoc-built, has real newlines)
"
  fi
done <<AWKV_EOF
$(in_scope | while read -r f; do
    [ -f "$f" ] || continue
    grep -oE 'awk [^|]*-v [a-zA-Z_]+="\$\{?[A-Za-z_]+\}?"' "$f" 2>/dev/null | sed "s|^|$f:|"
  done)
AWKV_EOF

AWKV_HITS=$(printf '%s' "$AWKV_HITS" | grep -v '^$' | sort -u || true)
if [ -n "$AWKV_HITS" ]; then
  echo "FAIL: multi-line variable passed through 'awk -v' (BSD awk rejects it):" >&2
  echo "$AWKV_HITS" | sed 's/^/  /' >&2
  echo "  Fix: VAR=\"\$VAR\" awk '... ENVIRON[\"VAR\"] ...'  (POSIX, byte-exact)" >&2
  FAIL=1
else
  echo "PASS: no heredoc-built variable passed through 'awk -v'"
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "shell portability: OK ($(in_scope | wc -l | tr -d ' ') shell files, $(in_scope_refs | wc -l | tr -d ' ') files scanned for skill refs)"
else
  echo "shell portability: FAILED. See readme/macos-setup.md." >&2
fi
exit "$FAIL"
