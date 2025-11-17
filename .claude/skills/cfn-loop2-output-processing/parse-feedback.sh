#!/bin/bash
set -euo pipefail

# Loop 2 Output Processing: Feedback Parsing
# Supports both old (stdin) and new (--extract-*) interfaces

detect_confidence() {
    local input="$1"

    # Pattern 1: Explicit numeric in header (## Validation Confidence: 0.XX)
    if echo "$input" | grep -qoE "Validation Confidence:?\s*0?\.[0-9]+"; then
        echo "$input" | grep -oE "Validation Confidence:?\s*0?\.[0-9]+" | grep -oE "0?\.[0-9]+" | head -1
        return 0
    fi

    # Pattern 2: Generic confidence field (confidence: 0.XX or Confidence: 0.XX)
    if echo "$input" | grep -qoiE "confidence:?\s*0?\.[0-9]+"; then
        echo "$input" | grep -oiE "confidence:?\s*0?\.[0-9]+" | grep -oE "0?\.[0-9]+" | head -1
        return 0
    fi

    # Pattern 3: Percentage (XX% or XX percent)
    if echo "$input" | grep -qoE "[0-9]+%|[0-9]+\s*percent"; then
        PERCENT=$(echo "$input" | grep -oE "[0-9]+%|[0-9]+\s*percent" | grep -oE "[0-9]+" | head -1)
        echo "scale=2; $PERCENT / 100" | bc
        return 0
    fi

    # Pattern 4: Decimal without prefix (e.g., "0.87" in context of confidence)
    if echo "$input" | grep -qE "(score|rating|level).{0,10}0?\.[0-9]{2}"; then
        echo "$input" | grep -oE "(score|rating|level).{0,10}0?\.[0-9]{2}" | grep -oE "0?\.[0-9]{2}" | head -1
        return 0
    fi

    # Pattern 5: Qualitative (high/medium/low) - check word boundaries
    if echo "$input" | grep -qiE "(high|strong|excellent)[[:space:]]*(confidence|validation)|(confidence|validation)[[:space:]]*(high|strong|excellent)"; then
        echo "0.90"
        return 0
    fi
    if echo "$input" | grep -qiE "(medium|moderate|good)[[:space:]]*(confidence|validation)|(confidence|validation)[[:space:]]*(medium|moderate|good)"; then
        echo "0.75"
        return 0
    fi
    if echo "$input" | grep -qiE "(low|weak|poor)[[:space:]]*(confidence|validation)|(confidence|validation)[[:space:]]*(low|weak|poor)"; then
        echo "0.50"
        return 0
    fi

    # Default: not found
    echo "0.0"
}

extract_feedback_items() {
    local input="$1"
    local category="$2"

    # BUG #27 FIX: Enhanced feedback extraction with multiple patterns

    # Pattern 1: Look for categorized sections (### CRITICAL Issues)
    # Use awk to extract section between header and next ### or EOF
    local items=$(echo "$input" | awk -v cat="$category" '
        BEGIN { in_section=0; IGNORECASE=1 }
        /^###/ {
            if ($0 ~ cat) { in_section=1; next }
            else { in_section=0 }
        }
        in_section && /^[-*0-9]/ {
            # Remove bullet prefix and trim
            gsub(/^[- *0-9.]+/, "")
            gsub(/^[[:space:]]+|[[:space:]]+$/, "")
            if (length($0) > 0) print
        }
    ')

    # Pattern 2: If no structured sections, look for inline mentions (Critical:, Warning:, etc.)
    if [[ -z "$items" ]]; then
        items=$(echo "$input" | grep -iA3 "${category}:" | tail -n +2 | grep -E "^-|^\*|^[0-9]" | sed 's/^[- \*0-9.]*//g' | sed 's/^[[:space:]]*//' | grep -v "^$" | head -5)
    fi

    # Pattern 3: Extract from sentences containing category keyword (e.g., "Critical: error found")
    if [[ -z "$items" ]]; then
        # Look for sentences like "Critical: missing error handling"
        items=$(echo "$input" | grep -iE "^${category}:" | sed "s/^${category}://i" | sed 's/^[[:space:]]*//' | grep -v "^$" | head -3)
    fi

    if [[ -n "$items" ]]; then
        # Convert to JSON array, filtering empty lines and "No issues found"
        echo "$items" | jq -R -s -c 'split("\n") | map(select(length > 0 and . != "No issues found" and . != "Issues"))'
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
