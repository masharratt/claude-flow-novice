#!/usr/bin/env bash
# Deterministic blind-label assignment for cfn-ab-critic.
#
# The whole point of the blind A/B gate is that the critic cannot tell which
# artifact is "ours". This file hands out the A/B labels deterministically from
# a SHA-256 derivative of (ac_id, iteration): no $RANDOM, no Math.random, no
# wall-clock seeding. Same inputs ALWAYS reproduce the same assignment, which
# is what makes the audit trail in comparisons[].label_assignment meaningful
# (a reviewer can re-derive it and confirm the blind was not gamed).
#
# Sourceable: `source lib/shuffle.sh; label_assignment AC-7 0`
set -uo pipefail

# label_assignment <ac_id> <iteration>
# Echoes exactly one of:
#   A=ours,B=reference
#   A=reference,B=ours
label_assignment() {
  local ac_id="$1"
  local iteration="$2"
  local hash assignment
  hash=$(printf '%s\n' "${ac_id}|${iteration}" | sha256sum | cut -c1-16)
  assignment=$(( (0x${hash:0:8}) % 2 ))
  if [ "$assignment" -eq 0 ]; then
    echo "A=ours,B=reference"
  else
    echo "A=reference,B=ours"
  fi
}

# unshuffle <raw_winner> <assignment>
# Maps a raw blinded verdict (A | B | tie) back to the canonical vocabulary
# (ours | reference | tie) using the assignment string emitted by
# label_assignment. Used by execute.sh AFTER the critic returns its raw pick.
unshuffle() {
  local raw="$1"
  local assignment="$2"
  case "$raw" in
    tie) echo "tie"; return ;;
    A|B) : ;;
    *)   echo "tie"; return ;;
  esac
  if printf '%s\n' "$assignment" | grep -q "${raw}=ours"; then
    echo "ours"
  elif printf '%s\n' "$assignment" | grep -q "${raw}=reference"; then
    echo "reference"
  else
    echo "tie"
  fi
}
