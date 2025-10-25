#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --trigger) TRIGGER="$2"; shift 2 ;;
        --iteration) ITERATION="$2"; shift 2 ;;
        --loop3-agents) IFS=',' read -ra AGENTS <<< "$2"; shift 2 ;;
        --feedback-themes) IFS=',' read -ra THEMES <<< "$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Intervention router
case "$TRIGGER" in
    "confidence_plateau")
        # Use agent swap
        SWAP_OUTPUT=$(/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/agent-swap/recommend-swap.sh \
            --loop3-agents "$(IFS=,; echo "${AGENTS[*]}")" \
            --loop3-confidences "0.70,0.82" \
            --feedback-themes "$(IFS=,; echo "${THEMES[*]}")")

        INTERVENTION_TYPE="agent_swap"
        ;;

    "recurring_feedback")
        # Use specialist injection
        SWAP_OUTPUT=$(/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/specialist-injection/recommend-specialist.sh \
            --current-loop3 "$(IFS=,; echo "${AGENTS[*]}")" \
            --feedback-themes "$(IFS=,; echo "${THEMES[*]}")" \
            --recurring-count 3)

        INTERVENTION_TYPE="add_specialist"
        ;;

    "deliverables_stuck")
        # Use scope simplifier
        SWAP_OUTPUT=$(/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/scope-simplifier/simplify-scope.sh \
            --original-deliverables "src/auth/oauth2.ts,src/auth/sessions.ts,tests/auth.test.ts,docs/auth.md" \
            --files-created "none" \
            --iteration "$ITERATION")

        INTERVENTION_TYPE="simplify_scope"
        ;;

    *)
        echo "Invalid intervention trigger" >&2
        exit 1
        ;;
esac

# Transform intervention output to standard format
echo "$SWAP_OUTPUT" | jq \
    --arg intervention_type "$INTERVENTION_TYPE" \
    --arg iteration "$ITERATION" \
    '.intervention_type = $intervention_type |
     .iteration = $iteration |
     .expected_improvement = "Intervention should address underlying performance issues"'