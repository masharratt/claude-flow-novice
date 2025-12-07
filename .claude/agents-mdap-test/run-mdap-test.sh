#!/bin/bash
# MDAP Test: Agent Profile Standardization
# Processes agent files in parallel batches to simulate MDAP micro-task execution

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="${SCRIPT_DIR}/cfn-dev-team"
LOG_DIR="${SCRIPT_DIR}/mdap-logs"
RESULTS_FILE="${SCRIPT_DIR}/mdap-results.json"

# Create log directory
mkdir -p "$LOG_DIR"

# Skills mapping by category
declare -A CATEGORY_SKILLS
CATEGORY_SKILLS["analysts"]='["cfn-project-analysis", "cfn-ruvector-codebase-index"]'
CATEGORY_SKILLS["architecture"]='["cfn-planning", "cfn-task-planning"]'
CATEGORY_SKILLS["coordinators"]='["cfn-loop-orchestration", "cfn-redis-coordination"]'
CATEGORY_SKILLS["dev-ops"]='["cfn-docker-runtime", "cfn-github-workflow"]'
CATEGORY_SKILLS["developers"]='["cfn-agent-spawning", "cfn-test-framework"]'
CATEGORY_SKILLS["documentation"]='["cfn-session-handoff", "cfn-knowledge-base"]'
CATEGORY_SKILLS["product-owners"]='["cfn-sprint-execution", "cfn-validation-framework"]'
CATEGORY_SKILLS["reviewers"]='["cfn-validation-framework", "cfn-test-framework"]'
CATEGORY_SKILLS["testers"]='["cfn-test-framework", "cfn-validation-framework"]'
CATEGORY_SKILLS["utility"]='["cfn-agent-tooling", "cfn-skill-management"]'

# Priority mapping
declare -A CATEGORY_PRIORITY
CATEGORY_PRIORITY["coordinators"]="P1"
CATEGORY_PRIORITY["analysts"]="P2"
CATEGORY_PRIORITY["architecture"]="P2"
CATEGORY_PRIORITY["dev-ops"]="P2"
CATEGORY_PRIORITY["developers"]="P2"
CATEGORY_PRIORITY["documentation"]="P3"
CATEGORY_PRIORITY["product-owners"]="P2"
CATEGORY_PRIORITY["reviewers"]="P2"
CATEGORY_PRIORITY["testers"]="P2"
CATEGORY_PRIORITY["utility"]="P3"

echo "=== MDAP Agent Profile Standardization Test ==="
echo "Target directory: $AGENTS_DIR"
echo ""

# Find all agent files
AGENT_FILES=$(find "$AGENTS_DIR" -name "*.md" -type f ! -name "CLAUDE.md" ! -name "README.md" 2>/dev/null)
TOTAL_FILES=$(echo "$AGENT_FILES" | wc -l)

echo "Found $TOTAL_FILES agent files to process"
echo ""

# Initialize results
PROCESSED=0
FAILED=0
RESULTS=()

process_agent() {
    local file="$1"
    local filename=$(basename "$file")
    local category=$(dirname "$file" | xargs basename)
    local agent_name="${filename%.md}"

    # Get default skills for category
    local skills="${CATEGORY_SKILLS[$category]:-[]}"
    local priority="${CATEGORY_PRIORITY[$category]:-P2}"

    # Check if file already has required fields
    local has_skills=$(grep -c "^skills:" "$file" 2>/dev/null || echo "0")
    local has_tags=$(grep -c "^tags:" "$file" 2>/dev/null || echo "0")
    local has_version=$(grep -c "^version:" "$file" 2>/dev/null || echo "0")
    local has_priority=$(grep -c "^priority:" "$file" 2>/dev/null || echo "0")

    local needs_update=0
    local updates=""

    if [[ "$has_skills" -eq 0 ]]; then
        needs_update=1
        updates="${updates}skills,"
    fi
    if [[ "$has_tags" -eq 0 ]]; then
        needs_update=1
        updates="${updates}tags,"
    fi
    if [[ "$has_version" -eq 0 ]]; then
        needs_update=1
        updates="${updates}version,"
    fi
    if [[ "$has_priority" -eq 0 ]]; then
        needs_update=1
        updates="${updates}priority,"
    fi

    if [[ "$needs_update" -eq 1 ]]; then
        # Generate tags from agent name
        local tags=$(echo "$agent_name" | tr '-' ',' | sed 's/,$//')
        tags="[$tags, $category]"

        # Create temp file with updates
        local temp_file="${LOG_DIR}/${agent_name}.tmp"

        # Find the end of frontmatter (second ---) and insert new fields
        awk -v skills="$skills" -v tags="$tags" -v priority="$priority" '
        BEGIN { in_frontmatter=0; frontmatter_end=0; added=0 }
        /^---$/ {
            if (in_frontmatter == 0) {
                in_frontmatter=1;
                print;
                next
            } else {
                frontmatter_end=1
            }
        }
        frontmatter_end && !added {
            # Add missing fields before closing ---
            if (skills != "[]") print "skills: " skills
            print "tags: " tags
            print "version: \"1.0.0\""
            print "priority: " priority
            added=1
        }
        { print }
        ' "$file" > "$temp_file"

        # Replace original
        mv "$temp_file" "$file"

        echo "  ✓ Updated: $filename (added: ${updates%,})"
        return 0
    else
        echo "  - Skipped: $filename (already standardized)"
        return 0
    fi
}

echo "Processing agents..."
echo ""

# Process files in parallel (batches of 10)
BATCH_SIZE=10
BATCH_NUM=0
BATCH_FILES=()

for file in $AGENT_FILES; do
    BATCH_FILES+=("$file")

    if [[ ${#BATCH_FILES[@]} -ge $BATCH_SIZE ]]; then
        BATCH_NUM=$((BATCH_NUM + 1))
        echo "=== Batch $BATCH_NUM (${#BATCH_FILES[@]} files) ==="

        for f in "${BATCH_FILES[@]}"; do
            process_agent "$f" &
        done
        wait

        PROCESSED=$((PROCESSED + ${#BATCH_FILES[@]}))
        BATCH_FILES=()
        echo ""
    fi
done

# Process remaining files
if [[ ${#BATCH_FILES[@]} -gt 0 ]]; then
    BATCH_NUM=$((BATCH_NUM + 1))
    echo "=== Batch $BATCH_NUM (${#BATCH_FILES[@]} files) ==="

    for f in "${BATCH_FILES[@]}"; do
        process_agent "$f" &
    done
    wait

    PROCESSED=$((PROCESSED + ${#BATCH_FILES[@]}))
fi

echo ""
echo "=== MDAP Test Complete ==="
echo "Total files: $TOTAL_FILES"
echo "Processed: $PROCESSED"
echo "Batches: $BATCH_NUM"
echo ""

# Validation
echo "=== Validation ==="
VALID=0
INVALID=0

for file in $AGENT_FILES; do
    has_all=1
    grep -q "^skills:" "$file" 2>/dev/null || has_all=0
    grep -q "^tags:" "$file" 2>/dev/null || has_all=0
    grep -q "^version:" "$file" 2>/dev/null || has_all=0
    grep -q "^priority:" "$file" 2>/dev/null || has_all=0

    if [[ "$has_all" -eq 1 ]]; then
        VALID=$((VALID + 1))
    else
        INVALID=$((INVALID + 1))
        echo "  ✗ Missing fields: $(basename "$file")"
    fi
done

echo ""
echo "Validation Results:"
echo "  Valid: $VALID/$TOTAL_FILES"
echo "  Invalid: $INVALID/$TOTAL_FILES"
echo "  Pass Rate: $(echo "scale=2; $VALID * 100 / $TOTAL_FILES" | bc)%"

# Write results JSON
cat > "$RESULTS_FILE" << EOF
{
  "task": "agent-profile-standardization",
  "timestamp": "$(date -Iseconds)",
  "total_files": $TOTAL_FILES,
  "processed": $PROCESSED,
  "batches": $BATCH_NUM,
  "valid": $VALID,
  "invalid": $INVALID,
  "pass_rate": $(echo "scale=4; $VALID / $TOTAL_FILES" | bc)
}
EOF

echo ""
echo "Results written to: $RESULTS_FILE"
