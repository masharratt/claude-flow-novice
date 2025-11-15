#!/bin/bash
# Deliverable-Based Confidence Calculator
# Calculates confidence scores based on actual deliverable completion

set -euo pipefail

# Arguments
TASK_ID="$1"
AGENT_ID="$2"
EXPECTED_DELIVERABLES="$3"  # JSON array of expected files/deliverables
WORKING_DIR="${4:-$(pwd)}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Deliverable-Based Confidence Calculator${NC}"
echo "Task ID: $TASK_ID"
echo "Agent ID: $AGENT_ID"
echo "Working Directory: $WORKING_DIR"
echo ""

# Function to check if deliverable exists and is valid
validate_deliverable() {
    local deliverable="$1"
    local deliverable_path="$WORKING_DIR/$deliverable"

    # Handle different deliverable types
    case "$deliverable" in
        *.md|*.txt|*.json|*.yaml|*.yml)
            # Text files - check existence and content
            if [ -f "$deliverable_path" ]; then
                local size=$(stat -c%s "$deliverable_path" 2>/dev/null || echo "0")
                if [ "$size" -gt 0 ]; then
                    echo "VALID:$size"
                    return 0
                fi
            fi
            ;;
        *.sh|*.js|*.ts|*.tsx|*.py)
            # Code files - check existence and basic syntax
            if [ -f "$deliverable_path" ]; then
                local size=$(stat -c%s "$deliverable_path" 2>/dev/null || echo "0")
                if [ "$size" -gt 100 ]; then
                    echo "VALID:$size"
                    return 0
                fi
            fi
            ;;
        */)
            # Directories - check existence and contents
            if [ -d "$deliverable_path" ]; then
                local file_count=$(find "$deliverable_path" -type f | wc -l)
                if [ "$file_count" -gt 0 ]; then
                    echo "VALID:$file_count"
                    return 0
                fi
            fi
            ;;
        *.json)
            # JSON files - check validity
            if [ -f "$deliverable_path" ]; then
                if jq empty "$deliverable_path" 2>/dev/null; then
                    local size=$(stat -c%s "$deliverable_path" 2>/dev/null || echo "0")
                    echo "VALID:$size"
                    return 0
                fi
            fi
            ;;
        *)
            # Generic file check
            if [ -f "$deliverable_path" ]; then
                local size=$(stat -c%s "$deliverable_path" 2>/dev/null || echo "0")
                if [ "$size" -gt 0 ]; then
                    echo "VALID:$size"
                    return 0
                fi
            fi
            ;;
    esac

    echo "INVALID"
    return 1
}

# Function to calculate quality score based on deliverable characteristics
calculate_quality_score() {
    local deliverable="$1"
    local deliverable_path="$WORKING_DIR/$deliverable"

    local quality_score=0.5  # Base score for existing

    # Size scoring (larger files with meaningful content)
    if [ -f "$deliverable_path" ]; then
        local size=$(stat -c%s "$deliverable_path" 2>/dev/null || echo "0")

        if [ "$size" -gt 5000 ]; then
            quality_score=0.9  # Substantial content
        elif [ "$size" -gt 1000 ]; then
            quality_score=0.8  # Good content
        elif [ "$size" -gt 100 ]; then
            quality_score=0.7  # Adequate content
        else
            quality_score=0.6  # Minimal content
        fi
    fi

    # Content-specific scoring
    case "$deliverable" in
        *.md)
            # Markdown files - check for structure
            if grep -q "^#" "$deliverable_path" 2>/dev/null; then
                quality_score=$((quality_score + 10))  # Has headers
            fi
            if grep -q "^```" "$deliverable_path" 2>/dev/null; then
                quality_score=$((quality_score + 5))   # Has code blocks
            fi
            ;;
        *.ts|*.tsx|*.js|*.jsx)
            # Code files - check for functions/exports
            if grep -q "function\|export\|class\|const.*=" "$deliverable_path" 2>/dev/null; then
                quality_score=$((quality_score + 10))  # Has functions/exports
            fi
            ;;
        *.json)
            # JSON files - check for structure
            if jq -e 'type == "object" and keys > 0' "$deliverable_path" >/dev/null 2>&1; then
                quality_score=$((quality_score + 10))  # Has meaningful structure
            fi
            ;;
    esac

    # Cap at 1.0
    if [ "$quality_score" -gt 100 ]; then
        quality_score=100
    fi

    echo "$quality_score"
}

# Main confidence calculation
main() {
    echo -e "${YELLOW}Analyzing expected deliverables...${NC}"

    # Parse expected deliverables from JSON
    if ! echo "$EXPECTED_DELIVERABLES" | jq empty 2>/dev/null; then
        echo -e "${RED}❌ Invalid JSON in expected deliverables${NC}"
        echo "0.0"
        return 1
    fi

    local total_deliverables=$(echo "$EXPECTED_DELIVERABLES" | jq 'length')
    local valid_deliverables=0
    local total_quality_score=0

    echo "Expected deliverables: $total_deliverables"
    echo ""

    # Check each deliverable
    for ((i=0; i<total_deliverables; i++)); do
        local deliverable=$(echo "$EXPECTED_DELIVERABLES" | jq -r ".[$i]")

        echo -n "  Checking: $deliverable ... "

        local validation_result=$(validate_deliverable "$deliverable")

        if [[ "$validation_result" == VALID* ]]; then
            local quality_score=$(calculate_quality_score "$deliverable")
            total_quality_score=$((total_quality_score + quality_score))
            valid_deliverables=$((valid_deliverables + 1))

            local size=$(echo "$validation_result" | cut -d: -f2)
            echo -e "${GREEN}✓ VALID${NC} (size: $size, quality: $quality_score)"
        else
            echo -e "${RED}✗ MISSING/INVALID${NC}"
        fi
    done

    echo ""
    echo -e "${YELLOW}Summary:${NC}"
    echo "  Valid deliverables: $valid_deliverables/$total_deliverables"

    # Calculate completion score (0-1)
    local completion_score=0
    if [ "$total_deliverables" -gt 0 ]; then
        completion_score=$(echo "scale=3; $valid_deliverables / $total_deliverables" | bc -l)
    fi

    # Calculate average quality score (0-1)
    local avg_quality_score=0.5  # Default if no deliverables
    if [ "$valid_deliverables" -gt 0 ]; then
        avg_quality_score=$(echo "scale=3; $total_quality_score / ($valid_deliverables * 100)" | bc -l)
    fi

    # Calculate final confidence score
    # Weight: 60% completion, 40% quality
    local final_confidence=$(echo "scale=3; ($completion_score * 0.6) + ($avg_quality_score * 0.4)" | bc -l)

    # Round to 2 decimal places
    final_confidence=$(echo "$final_confidence" | sed 's/^\./0./' | sed 's/\.\([0-9]\{2\}\)[0-9]*$/.\1/')

    echo "  Completion score: $completion_score"
    echo "  Quality score: $avg_quality_score"
    echo "  Final confidence: $final_confidence"

    # Validation rules
    if [ "$valid_deliverables" -eq 0 ]; then
        echo -e "${RED}🚨 CRITICAL: No deliverables created - confidence should be 0.0${NC}"
        echo "0.0"
        return 1
    elif (( $(echo "$final_confidence > 0.3" | bc -l) )); then
        if [ "$valid_deliverables" -lt "$((total_deliverables / 2))" ]; then
            echo -e "${YELLOW}⚠️  WARNING: Low deliverable completion (<50%) - confidence should be <= 0.3${NC}"
        fi
    fi

    echo -e "${GREEN}✓ Calculated confidence: $final_confidence${NC}"
    echo "$final_confidence"
}

# Store results in Redis if available
store_confidence_result() {
    local confidence="$1"

    if command -v redis-cli >/dev/null 2>&1; then
        # Store detailed breakdown
        local breakdown=$(cat << EOF
{
  "task_id": "$TASK_ID",
  "agent_id": "$AGENT_ID",
  "calculated_confidence": $confidence,
  "calculation_method": "deliverable-based",
  "timestamp": "$(date -Iseconds)",
  "working_directory": "$WORKING_DIR",
  "expected_deliverables": $EXPECTED_DELIVERABLES
}
EOF
        )

        redis-cli set "${TASK_ID}:${AGENT_ID}:confidence-breakdown" "$breakdown" >/dev/null 2>&1 || true
        redis-cli set "${TASK_ID}:${AGENT_ID}:confidence-score" "$confidence" >/dev/null 2>&1 || true

        echo -e "📦 ${BLUE}Stored confidence breakdown in Redis:${NC} ${TASK_ID}:${AGENT_ID}:confidence-breakdown"
    fi
}

# Execute main function
if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <task_id> <agent_id> <expected_deliverables_json> [working_directory]"
    echo "Example: $0 task-123 agent-1 '[\"file1.txt\", \"script.sh\", \"docs/\"]' /path/to/project"
    exit 1
fi

final_confidence=$(main "$@")

# Store results
store_confidence_result "$final_confidence"

echo "$final_confidence"