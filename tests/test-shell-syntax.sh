#!/usr/bin/env bash
# Shell syntax gate.
#
# `bash -n` parses a script without running it. A script that fails it is dead
# code: it aborts on the first line, so nothing it claims to do has ever run.
# Nine such scripts sat in the tree undetected because nothing parses a shell
# script until someone executes it, and these were skills and deployment
# helpers that are executed rarely.
#
# Scope is borrowed verbatim from the portability gate so the two can never
# drift. See tests/test-shell-portability.sh for what is in and out.
#
# A second check rides along: a script with a shebang must be executable in
# git's index. `core.fileMode` is false in this repo, so git ignores the disk
# permission bit and records every newly added script as 100644. The working
# copy keeps its 755 and nobody notices; a fresh clone gets 644 and direct
# invocation dies with exit 126. That is not hypothetical -- it is how
# link-global-config.sh reached CI, and it applied to 933 scripts including
# every hook CLAUDE.md tells agents to run directly.
#
# This is a parse check, not a lint. It catches "this file cannot run at all",
# not "this file has a questionable quoting habit". shellcheck is the tool for
# the latter and is deliberately not wired in here, because turning it on
# repo-wide would fail on hundreds of pre-existing style warnings and the
# resulting red build teaches people to ignore the gate.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

SCOPE="tests/test-shell-portability.sh"
if [ ! -x "$SCOPE" ] && [ ! -f "$SCOPE" ]; then
  echo "FAIL: cannot resolve scope, $SCOPE is missing" >&2
  exit 1
fi

BROKEN=""
while read -r f; do
  [ -f "$f" ] || continue
  bash -n "$f" 2>/dev/null || BROKEN="$BROKEN$f"$'\n'
done < <(bash "$SCOPE" --list)

BROKEN="${BROKEN%$'\n'}"
TOTAL=$(bash "$SCOPE" --list | wc -l | tr -d ' ')

if [ -n "$BROKEN" ]; then
  COUNT=$(echo "$BROKEN" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT script(s) do not parse. They cannot run at all:" >&2
  while read -r f; do
    echo "  $f" >&2
    bash -n "$f" 2>&1 | head -2 | sed 's/^/      /' >&2
  done <<< "$BROKEN"
  echo >&2
  echo "  Reproduce a single file with: bash -n <file>" >&2
  echo "  shellcheck -S error <file> usually names the real cause, which is" >&2
  echo "  often many lines above where bash reports the error." >&2
  echo "---" >&2
  echo "shell syntax: FAILED" >&2
  exit 1
fi

echo "PASS: all $TOTAL in-scope scripts parse"

# --- executable bit in the index -----------------------------------------
# Checked against git, not the filesystem: the filesystem is what lies here.
NOEXEC=""
while read -r f; do
  [ -f "$f" ] || continue
  head -1 "$f" 2>/dev/null | grep -q '^#!' || continue
  [ "$(git ls-files -s "$f" | cut -d' ' -f1)" = "100755" ] || NOEXEC="$NOEXEC$f"$'\n'
done < <(bash "$SCOPE" --list)
NOEXEC="${NOEXEC%$'\n'}"

if [ -n "$NOEXEC" ]; then
  COUNT=$(echo "$NOEXEC" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT script(s) have a shebang but are not executable in git." >&2
  echo "$NOEXEC" | head -20 | sed 's/^/  /' >&2
  [ "$COUNT" -gt 20 ] && echo "  ... and $((COUNT - 20)) more" >&2
  echo "  A fresh clone gets mode 644 and ./<script> fails with exit 126." >&2
  echo "  Fix: git update-index --chmod=+x <file>" >&2
  echo "  chmod alone is not enough. core.fileMode is false, so git ignores it." >&2
  echo "---" >&2
  echo "shell syntax: FAILED" >&2
  exit 1
fi

echo "PASS: all in-scope scripts with a shebang are executable in git"
echo "---"
echo "shell syntax: OK"
