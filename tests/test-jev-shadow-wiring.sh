#!/usr/bin/env bash
# shellcheck disable=SC2016

set -uo pipefail

SKILL_FILE=".claude/skills/cfn-vote-implement/SKILL.md"
missing=()

check() {
    local name="$1"
    local pattern="$2"

    if ! grep -Fq -- "$pattern" "$SKILL_FILE"; then
        missing+=("$name")
    fi
}

check "triage-shadow" 'SHADOW: logs only, decides nothing; output must not be shown to voters. Run `$HOME/.claude/skills/cfn-vote-implement/jev-triage.sh --manifest <path>`'
check "tally-record" '$HOME/.claude/skills/cfn-vote-implement/jev-shadow-record.sh --manifest <p> --tallies'
check "final-record" '$HOME/.claude/skills/cfn-vote-implement/jev-shadow-record.sh --manifest <p> --finals'
check "dry-run-skip" '`--dry-run` skips both SHADOW steps entirely.'
check "on-demand-report" 'On-demand report: `$HOME/.claude/skills/cfn-vote-implement/jev-shadow-report.sh --manifest <p>`; never part of any gate or exit code.'

if ((${#missing[@]} > 0)); then
    joined=$(IFS=,; echo "${missing[*]}")
    printf 'missing=[%s] unexpected=[]\n' "$joined" >&2
    exit 1
fi

printf 'missing=[] unexpected=[]\n'
