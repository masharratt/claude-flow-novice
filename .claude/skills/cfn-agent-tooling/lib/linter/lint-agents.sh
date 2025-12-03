#!/usr/bin/env bash
#
# Agent Validation Linter
# Enforces validation pattern compliance across all agent profiles
#
# Usage:
#   ./.claude/skills/agent-validation-linter/lint-agents.sh [OPTIONS]
#
# Options:
#   --fix          Auto-fix agents that can be automatically corrected
#   --strict       Fail on any violations (exit code 1)
#   --summary      Show summary only (no detailed output)
#   --agent <path> Lint specific agent file
#
# Exit Codes:
#   0 - All agents compliant or --strict not set
#   1 - Violations found and --strict mode enabled

set -euo pipefail

# Configuration
AGENTS_DIR=".claude/agents/cfn-dev-team"
VALIDATION_SKILL_PATH=".claude/skills/json-validation/validate-success-criteria.sh"
REQUIRED_SOURCE_PATTERN='source .claude/skills/json-validation/validate-success-criteria.sh'
REQUIRED_VALIDATION_CALL='validate_success_criteria'

# Options
FIX_MODE=false
STRICT_MODE=false
SUMMARY_ONLY=false
SPECIFIC_AGENT=""

# Counters
TOTAL_AGENTS=0
COMPLIANT_AGENTS=0
VIOLATIONS_FOUND=0
AUTO_FIXED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix)
            FIX_MODE=true
            shift
            ;;
        --strict)
            STRICT_MODE=true
            shift
            ;;
        --summary)
            SUMMARY_ONLY=true
            shift
            ;;
        --agent)
            SPECIFIC_AGENT="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --fix          Auto-fix agents that can be automatically corrected"
            echo "  --strict       Fail on any violations (exit code 1)"
            echo "  --summary      Show summary only (no detailed output)"
            echo "  --agent <path> Lint specific agent file"
            echo ""
            echo "Checks:"
            echo "  1. Validation skill is sourced"
            echo "  2. validate_success_criteria() is called"
            echo "  3. Inline validation code is removed (if using centralized skill)"
            echo "  4. Provider configuration is present"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Lint a single agent file
lint_agent() {
    local agent_file="$1"
    local agent_name
    agent_name=$(basename "$agent_file" .md)

    TOTAL_AGENTS=$((TOTAL_AGENTS + 1))

    local violations=()
    local can_auto_fix=true

    # Check 1: Validation skill is sourced
    if ! grep -q "$REQUIRED_SOURCE_PATTERN" "$agent_file"; then
        violations+=("Missing centralized validation skill source")
        # Can auto-fix by injecting source statement
    fi

    # Check 2: validate_success_criteria() is called
    if ! grep -q "$REQUIRED_VALIDATION_CALL" "$agent_file"; then
        violations+=("Missing validate_success_criteria() call")
        # Can auto-fix by adding call after source
    fi

    # Check 3: No inline validation code (old pattern)
    if grep -q 'echo "\$AGENT_SUCCESS_CRITERIA" | jq -e' "$agent_file" 2>/dev/null; then
        violations+=("Contains inline validation code (should use centralized skill)")
        can_auto_fix=false  # Manual review needed for refactoring
    fi

    # Check 4: Provider configuration present
    if ! grep -q "PROVIDER_PARAMETERS" "$agent_file"; then
        violations+=("Missing provider configuration (PROVIDER_PARAMETERS)")
        # Can auto-fix by adding default provider config
    fi

    # Report violations
    if [[ ${#violations[@]} -eq 0 ]]; then
        COMPLIANT_AGENTS=$((COMPLIANT_AGENTS + 1))
        if [[ "$SUMMARY_ONLY" == "false" ]]; then
            echo -e "${GREEN}✓${NC} $agent_name"
        fi
        return 0
    else
        VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + ${#violations[@]}))

        if [[ "$SUMMARY_ONLY" == "false" ]]; then
            echo -e "${RED}✗${NC} $agent_name"
            for violation in "${violations[@]}"; do
                echo -e "  ${YELLOW}⚠${NC}  $violation"
            done

            if [[ "$FIX_MODE" == "true" && "$can_auto_fix" == "true" ]]; then
                echo -e "  ${BLUE}🔧${NC}  Auto-fixing..."
                auto_fix_agent "$agent_file" "${violations[@]}"
            elif [[ "$FIX_MODE" == "true" && "$can_auto_fix" == "false" ]]; then
                echo -e "  ${YELLOW}⚠${NC}   Cannot auto-fix (manual review required)"
            fi
        fi
        return 1
    fi
}

# Auto-fix agent violations
auto_fix_agent() {
    local agent_file="$1"
    shift
    local violations=("$@")

    local fixed=false

    # Create backup
    cp "$agent_file" "${agent_file}.bak"

    for violation in "${violations[@]}"; do
        case "$violation" in
            "Missing centralized validation skill source")
                # Find Success Criteria Awareness section and inject source
                if grep -q "## Success Criteria" "$agent_file"; then
                    # Insert after "### 1. Read Success Criteria" or similar
                    sed -i '/### 1\. Read Success Criteria/a\\n```bash\n# Source centralized validation skill\nsource .claude/skills/json-validation/validate-success-criteria.sh\n\n# Validate on startup (exits on invalid JSON)\nvalidate_success_criteria || exit 1\n```\n' "$agent_file"
                    fixed=true
                fi
                ;;

            "Missing validate_success_criteria() call")
                # Add call if source exists but call doesn't
                if grep -q "$REQUIRED_SOURCE_PATTERN" "$agent_file" && ! grep -q "$REQUIRED_VALIDATION_CALL" "$agent_file"; then
                    sed -i "/source.*validate-success-criteria\.sh/a\\validate_success_criteria || exit 1" "$agent_file"
                    fixed=true
                fi
                ;;

            "Missing provider configuration (PROVIDER_PARAMETERS)")
                # Insert provider parameters after frontmatter
                if grep -q "^---$" "$agent_file"; then
                    # Find the closing --- of frontmatter
                    sed -i '/^---$/,/^---$/{
                        /^---$/a\\n<!-- PROVIDER_PARAMETERS\nprovider: zai\nmodel: glm-4.6\n-->
                    }' "$agent_file"
                    fixed=true
                fi
                ;;
        esac
    done

    if [[ "$fixed" == "true" ]]; then
        AUTO_FIXED=$((AUTO_FIXED + 1))
        echo -e "  ${GREEN}✓${NC}  Fixed $(basename "$agent_file")"
        # Remove backup on successful fix
        rm "${agent_file}.bak"
    else
        # Restore from backup if no fixes applied
        mv "${agent_file}.bak" "$agent_file"
    fi
}

# Main execution
echo "Agent Validation Linter"
echo "======================="
echo ""

if [[ -n "$SPECIFIC_AGENT" ]]; then
    # Lint specific agent
    if [[ ! -f "$SPECIFIC_AGENT" ]]; then
        echo -e "${RED}Error:${NC} Agent file not found: $SPECIFIC_AGENT"
        exit 1
    fi
    lint_agent "$SPECIFIC_AGENT"
else
    # Lint all agents
    echo "Scanning: $AGENTS_DIR/**/*.md"
    echo ""

    # Find all agent markdown files
    while IFS= read -r agent_file; do
        # Skip README files
        if [[ "$(basename "$agent_file")" == "README.md" || "$(basename "$agent_file")" == "CLAUDE.md" ]]; then
            continue
        fi

        lint_agent "$agent_file"
    done < <(find "$AGENTS_DIR" -type f -name "*.md")
fi

# Print summary
echo ""
echo "======================="
echo "Summary"
echo "======================="
echo -e "Total agents scanned:  $TOTAL_AGENTS"
echo -e "${GREEN}Compliant:${NC}             $COMPLIANT_AGENTS"

NON_COMPLIANT=$((TOTAL_AGENTS - COMPLIANT_AGENTS))
if [[ $NON_COMPLIANT -gt 0 ]]; then
    echo -e "${RED}Non-compliant:${NC}         $NON_COMPLIANT"
    echo -e "${YELLOW}Total violations:${NC}      $VIOLATIONS_FOUND"
else
    echo -e "Non-compliant:         0"
fi

if [[ "$FIX_MODE" == "true" && "$AUTO_FIXED" -gt 0 ]]; then
    echo -e "${BLUE}Auto-fixed:${NC}            $AUTO_FIXED"
fi

# Calculate compliance rate
if [[ $TOTAL_AGENTS -gt 0 ]]; then
    COMPLIANCE_RATE=$(awk "BEGIN {printf \"%.1f\", ($COMPLIANT_AGENTS / $TOTAL_AGENTS) * 100}")
    echo -e "Compliance rate:       ${COMPLIANCE_RATE}%"
fi

echo ""

# Exit with appropriate code
if [[ "$STRICT_MODE" == "true" && $NON_COMPLIANT -gt 0 ]]; then
    echo -e "${RED}✗ STRICT MODE: Violations found${NC}"
    exit 1
elif [[ $NON_COMPLIANT -gt 0 ]]; then
    echo -e "${YELLOW}⚠ Violations found (use --fix to auto-correct)${NC}"
    exit 0
else
    echo -e "${GREEN}✓ All agents compliant${NC}"
    exit 0
fi
