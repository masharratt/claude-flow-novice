#!/bin/bash
set -euo pipefail

# Loop 2 Output Processing: Feedback Parsing
# Supports both old (stdin) and new (--extract-*) interfaces

detect_confidence() {
    local input="$1"

    # Pattern 1: Explicit numeric (0.XX or 0.X)
    if echo "$input" | grep -qoE "confidence:?\s*0?\.[0-9]+"; then
        echo "$input" | grep -oE "confidence:?\s*0?\.[0-9]+" | grep -oE "0?\.[0-9]+" | head -1
        return 0
    fi

    # Pattern 2: Percentage (XX%)
    if echo "$input" | grep -qoE "[0-9]+%"; then
        PERCENT=$(echo "$input" | grep -oE "[0-9]+%" | grep -oE "[0-9]+" | head -1)
        echo "scale=2; $PERCENT / 100" | bc
        return 0
    fi

    # Pattern 3: Qualitative
    if echo "$input" | grep -qiE "confidence.*(high|strong)"; then
        echo "0.90"
        return 0
    fi
    if echo "$input" | grep -qiE "confidence.*(medium|moderate)"; then
        echo "0.70"
        return 0
    fi
    if echo "$input" | grep -qiE "confidence.*(low|weak)"; then
        echo "0.50"
        return 0
    fi

    # Default: not found
    echo "0.0"
}

extract_feedback_items() {
    local input="$1"
    local category="$2"

    # Look for categorized feedback (Critical:, Warning:, Suggestion:)
    local items=$(echo "$input" | grep -iA5 "${category}:" | grep -E "^-|^\*|^[0-9]" | sed 's/^[- \*0-9.]*//g' | head -5)

    if [[ -n "$items" ]]; then
        # Convert to JSON array
        echo "$items" | jq -R -s -c 'split("\n") | map(select(length > 0))'
    else
        echo "[]"
    fi
}

# Check if using new interface (--extract-*)
if [[ "${1:-}" == "--extract-confidence" ]]; then
    # New interface: --extract-confidence "output text"
    INPUT="${2:-}"
    detect_confidence "$INPUT"
    exit 0
elif [[ "${1:-}" == "--extract-feedback" ]]; then
    # New interface: --extract-feedback "output text"
    INPUT="${2:-}"

    CRITICAL=$(extract_feedback_items "$INPUT" "Critical")
    WARNINGS=$(extract_feedback_items "$INPUT" "Warning")
    SUGGESTIONS=$(extract_feedback_items "$INPUT" "Suggestion")

    # Output JSON feedback object
    jq -n \
        --argjson critical "$CRITICAL" \
        --argjson warnings "$WARNINGS" \
        --argjson suggestions "$SUGGESTIONS" \
        '{critical: $critical, warnings: $warnings, suggestions: $suggestions}'
    exit 0
fi

# Old interface (backward compatibility): read from stdin
RAW_INPUT=$(cat | xargs)

# If input is empty, use a default
if [[ -z "$RAW_INPUT" ]]; then
    RAW_INPUT="No specific feedback"
fi

# Detect confidence
CONFIDENCE=$(detect_confidence "$RAW_INPUT")

# Extract feedback
CRITICAL=$(extract_feedback_items "$RAW_INPUT" "Critical")
WARNING=$(extract_feedback_items "$RAW_INPUT" "Warning")
SUGGESTION=$(extract_feedback_items "$RAW_INPUT" "Suggestion")

# Output JSON (old format for backward compatibility)
jq -n \
    --arg confidence "$CONFIDENCE" \
    --argjson critical "$CRITICAL" \
    --argjson warning "$WARNING" \
    --argjson suggestion "$SUGGESTION" \
    '{
        confidence: ($confidence | tonumber),
        confidence_source: "extracted",
        feedback: {
            critical: $critical,
            warning: $warning,
            suggestion: $suggestion
        }
    }'
