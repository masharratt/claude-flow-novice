#!/usr/bin/env bash
# Smoke test for cfn-megaplan-lite SKILL.md.
# Asserts: (a) frontmatter keys present, (b) every reused bar script + phase
# skill path resolves, (c) the no-probe invariant is documented.
# Exits 0 only on all-pass. Runs from any CWD (paths anchored on this file).
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$TEST_DIR/.." && pwd)"
SKILLS_DIR="$(cd "$SKILL_DIR/.." && pwd)"

SKILL_MD="$SKILL_DIR/SKILL.md"
FAILED=0

# ----- Group (a): frontmatter present -----
check_frontmatter() {
  local key="$1"
  if [ -f "$SKILL_MD" ] && grep -q "^${key}:" "$SKILL_MD"; then
    echo "OK frontmatter-${key}"
  else
    echo "FAIL frontmatter-${key}"
    FAILED=1
  fi
}

check_frontmatter "name"
check_frontmatter "version"
check_frontmatter "status"

# ----- Group (b): every referenced path resolves -----
check_path() {
  local rel="$1"
  local abs="$SKILLS_DIR/$rel"
  if [ -f "$abs" ]; then
    echo "OK path ${rel}"
  else
    echo "FAIL path ${rel} (not found at ${abs})"
    FAILED=1
  fi
}

# megaplan bar scripts (inherited unmodified)
check_path "cfn-megaplan/bars/check-verifiable-static.sh"
check_path "cfn-megaplan/bars/bless-verify.sh"
check_path "cfn-megaplan/bars/check-haiku-static.sh"
check_path "cfn-megaplan/bars/weasel-phrases.txt"

# phase skills referenced by the lite DAG
check_path "cfn-spec/SKILL.md"
check_path "cfn-decide/SKILL.md"
check_path "cfn-data/SKILL.md"
check_path "cfn-arch/SKILL.md"
check_path "cfn-ux/SKILL.md"
check_path "cfn-design/SKILL.md"
check_path "cfn-test-plan/SKILL.md"

# ----- Group (c): no-probe invariant is documented -----
if [ -f "$SKILL_MD" ] && grep -q 'DO NOT spawn the live haiku probe' "$SKILL_MD"; then
  echo "OK no-probe-invariant"
else
  echo "FAIL no-probe-invariant"
  FAILED=1
fi

if [ "$FAILED" -eq 0 ]; then
  echo "ALL OK"
  exit 0
else
  echo "SOME FAILURES"
  exit 1
fi
