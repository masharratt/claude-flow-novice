#!/usr/bin/env bash

set -euo pipefail

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DOCS_ALPHA_DIR="${PROJECT_ROOT}/docs/alpha"
LOG_FILE="${SCRIPT_DIR}/logs/execution.log"
FEATURE_STATUS="${PROJECT_ROOT}/readme/feature-status.md"
FIX_LIST_DIR="${DOCS_ALPHA_DIR}/fixes-by-priority"
DEFAULT_AGENTS=3

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$FIX_LIST_DIR"

# Logging function (stderr only, doesn't interfere with output capture)
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
    >&2 echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Show help
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

CFN Alpha Launch V2 - Group-based alpha readiness analysis.

OPTIONS:
    -m, --mode MODE         Mode: select, analyze, fix, status, complete (required)
    -p, --priority PRIORITY  Priority group: CRITICAL, HIGH, MEDIUM, LOW (optional)
    -f, --feature NUM       Specific feature number (optional, overrides group mode)
    -a, --agents NUM        Number of parallel agents for fix mode (default: 3)
    -h, --help              Show this help message

MODES:
    select                  Show next priority group to work on
    analyze                 Run analysis on all features in priority group
    fix                     Execute fixes for priority group
    status                  Show overall alpha readiness progress
    complete                Mark all features in group as complete
    manifest                Convert priority-group fix-list to cfn-vote-implement JSON manifest

EXAMPLES:
    $0 -m select
    $0 -m analyze                    # Analyzes next priority group (default)
    $0 -m analyze -p CRITICAL         # Analyzes CRITICAL features
    $0 -m analyze -f 2                # Analyzes specific feature #2 (override)
    $0 -m fix --agents 5
    $0 -m status
    $0 -m complete -p CRITICAL

FEATURE STATUS:
    Reads from: readme/feature-status.md
    Groups: CRITICAL, HIGH, MEDIUM, LOW
    Default: Next incomplete priority group

OUTPUT:
    fix-list-CRITICAL.md, fix-list-HIGH.md, etc.

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            -p|--priority)
                PRIORITY="$2"
                shift 2
                ;;
            -f|--feature)
                FEATURE_NUM="$2"
                shift 2
                ;;
            -a|--agents)
                AGENT_COUNT="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error_exit "Unknown option: $1"
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ -z "${MODE:-}" ]]; then
        error_exit "Mode is required. Use -m or --mode option."
    fi

    case "$MODE" in
        select|analyze|fix|status|complete|manifest)
            ;;
        *)
            error_exit "Invalid mode: $MODE. Must be select, analyze, fix, status, complete, or manifest."
            ;;
    esac

    # Validate priority if provided
    if [[ -n "${PRIORITY:-}" ]]; then
        case "$PRIORITY" in
            CRITICAL|HIGH|MEDIUM|LOW)
                ;;
            *)
                error_exit "Invalid priority: $PRIORITY. Must be CRITICAL, HIGH, MEDIUM, or LOW."
                ;;
        esac
    fi

    # Feature number overrides priority mode
    if [[ -n "${FEATURE_NUM:-}" ]]; then
        PRIORITY=""  # Clear priority if specific feature given
    fi

    AGENT_COUNT="${AGENT_COUNT:-$DEFAULT_AGENTS}"
    if ! [[ "$AGENT_COUNT" =~ ^[0-9]+$ ]] || [[ "$AGENT_COUNT" -lt 1 ]]; then
        error_exit "Agent count must be a positive integer."
    fi
}

# Extract feature info from feature-status.md
extract_feature_info() {
    local feature_num="$1"
    local feature_status="$FEATURE_STATUS"

    if [[ ! -f "$feature_status" ]]; then
        error_exit "Feature status file not found: $feature_status"
    fi

    # Find the feature section by number
    local in_section=0
    local title="" priority="" status="" description="" task_ref=""

    while IFS= read -r line; do
        # Look for task reference table row
        if [[ "$line" =~ ^\|[[:space:]]*#$feature_num[[:space:]]*\| ]]; then
            in_section=1
            # Parse: | #N | Name | Status | Priority | Date | Description |
            title=$(echo "$line" | cut -d'|' -f3 | xargs)
            status=$(echo "$line" | cut -d'|' -f4 | xargs)
            priority=$(echo "$line" | cut -d'|' -f5 | xargs)
            description=$(echo "$line" | cut -d'|' -f7 | xargs)
            break
        fi
    done < "$feature_status"

    if [[ -z "$title" ]]; then
        error_exit "Feature #$feature_num not found in feature-status.md"
    fi

    echo "$title|$status|$priority|$description"
}

# Find next priority group with incomplete features
find_next_priority_group() {
    local feature_status="$FEATURE_STATUS"

    if [[ ! -f "$feature_status" ]]; then
        error_exit "Feature status file not found: $feature_status"
    fi

    log "Scanning feature-status.md for next priority group..."

    # Priority order: CRITICAL, HIGH, MEDIUM, LOW
    local priorities=("CRITICAL" "HIGH" "MEDIUM" "LOW")

    for priority in "${priorities[@]}"; do
        local count=0
        # Count features at this priority that are NOT ready
        while IFS= read -r line; do
            if [[ "$line" =~ ^\|[[:space:]]*#([0-9]+)[[:space:]]*\| ]]; then
                local status=$(echo "$line" | cut -d'|' -f4 | xargs)
                local line_priority=$(echo "$line" | cut -d'|' -f5 | xargs)

                if [[ "$line_priority" == "$priority" ]]; then
                    if [[ ! "$status" =~ ✅|READY|COMPLETE ]]; then
                        ((count++))
                    fi
                fi
            fi
        done < "$feature_status"

        if [[ $count -gt 0 ]]; then
            echo "$priority|$count"
            return
        fi
    done

    echo "ALL_COMPLETE"
}

# Get all features in a priority group
get_features_in_group() {
    local target_priority="$1"
    local feature_status="$FEATURE_STATUS"
    local features=()

    while IFS= read -r line; do
        if [[ "$line" =~ ^\|[[:space:]]*#([0-9]+)[[:space:]]*\| ]]; then
            local num="${BASH_REMATCH[1]}"
            local status=$(echo "$line" | cut -d'|' -f4 | xargs)
            local line_priority=$(echo "$line" | cut -d'|' -f5 | xargs)

            if [[ "$line_priority" == "$target_priority" ]] && [[ ! "$status" =~ ✅|READY|COMPLETE ]]; then
                features+=("$num")
            fi
        fi
    done < "$feature_status"

    # Return as space-separated list
    echo "${features[@]}"
}

# Calculate progress statistics
calculate_progress() {
    local feature_status="$FEATURE_STATUS"
    local total=0 complete=0 critical_remaining=0 high_remaining=0 medium_remaining=0

    while IFS= read -r line; do
        if [[ "$line" =~ ^\|[[:space:]]*#([0-9]+)[[:space:]]*\| ]]; then
            ((total++))
            local status=$(echo "$line" | cut -d'|' -f4 | xargs)
            local priority=$(echo "$line" | cut -d'|' -f5 | xargs)

            if [[ "$status" =~ ✅|READY|COMPLETE ]]; then
                ((complete++))
            elif [[ "$priority" == "CRITICAL" ]]; then
                ((critical_remaining++))
            elif [[ "$priority" == "HIGH" ]]; then
                ((high_remaining++))
            elif [[ "$priority" == "MEDIUM" ]]; then
                ((medium_remaining++))
            fi
        fi
    done < "$feature_status"

    local percent=$((complete * 100 / total))

    echo "$total|$complete|$critical_remaining|$high_remaining|$medium_remaining|$percent"
}

# Mode: Select next priority group
mode_select() {
    log "Mode: select"

    local next=$(find_next_priority_group)

    if [[ "$next" == "ALL_COMPLETE" ]]; then
        cat << 'SELECT_OUTPUT'

╔════════════════════════════════════════════════════════════╗
║  🎉 ALL FEATURES COMPLETE - ALPHA READY!                  ║
╚════════════════════════════════════════════════════════════╝

Run /cfn-alpha-launch-v2:status for final readiness report.

SELECT_OUTPUT
        return
    fi

    IFS='|' read -r priority count <<< "$next"

    # Get feature numbers and descriptions for this group
    local features=($(get_features_in_group "$priority"))
    local feature_list=""

    for num in "${features[@]}"; do
        local info=$(extract_feature_info "$num")
        IFS='|' read -r title status priority desc <<< "$info"
        feature_list="$feature_list  • #$num: $title\n"
    done

    cat << SELECT_OUTPUT

╔════════════════════════════════════════════════════════════╗
║  NEXT PRIORITY GROUP TO ASSESS                             ║
╚════════════════════════════════════════════════════════════╝

Priority:    $priority
Features:    $count incomplete
$(echo -e "$feature_list")
─────────────────────────────────────────────────────────────────

Next Steps:

1. Run analysis on this group:
   /cfn-alpha-launch-v2:analyze -p $priority

2. Execute fixes for this group:
   /cfn-alpha-launch-v2:fix -p $priority

3. Mark group complete:
   /cfn-alpha-launch-v2:complete -p $priority

─────────────────────────────────────────────────────────────────

Or analyze a specific feature (overrides group):
   /cfn-alpha-launch-v2:analyze -f 2

SELECT_OUTPUT
}

# Mode: Status report
mode_status() {
    log "Mode: status"

    local stats=$(calculate_progress)
    IFS='|' read -r total_complete complete critical high medium percent <<< "$stats"

    cat << STATUS_OUTPUT

╔════════════════════════════════════════════════════════════╗
║  ALPHA LAUNCH READINESS PROGRESS                            ║
╚════════════════════════════════════════════════════════════╝

Overall Progress: [$complete/$total_complete features] ($percent%)

Remaining by Priority:
  • CRITICAL:  $critical features
  • HIGH:      $high features
  • MEDIUM:    $medium features
  • LOW:       (see feature-status.md for details)

STATUS_OUTPUT

    # Show next priority group
    local next=$(find_next_priority_group)
    if [[ "$next" != "ALL_COMPLETE" ]]; then
        IFS='|' read -r priority count <<< "$next"
        echo ""
        echo "Next Priority Group: $priority ($count features)"
    fi

    echo ""
    echo "─────────────────────────────────────────────────────────────────"
    echo ""
    echo "Full details: readme/feature-status.md"
}

# Mode: Analyze priority group
mode_analyze() {
    log "Mode: analyze"

    # Determine priority group
    local target_priority="$PRIORITY"
    if [[ -z "$target_priority" ]]; then
        local next=$(find_next_priority_group)
        if [[ "$next" == "ALL_COMPLETE" ]]; then
            echo "All features complete. Nothing to analyze."
            return
        fi
        IFS='|' read -r target_priority count <<< "$next"
        log "Auto-selected priority: $target_priority ($count features)"
    fi

    # If specific feature requested, override group mode
    if [[ -n "${FEATURE_NUM:-}" ]]; then
        log "Feature override: #$FEATURE_NUM (group mode disabled)"
        local info=$(extract_feature_info "$FEATURE_NUM")
        IFS='|' read -r title status priority description <<< "$info"

        local slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -ch '[:alnum:]-')
        local fix_list="${FIX_LIST_DIR}/fix-list-${FEATURE_NUM}-${slug}.md"

        cat << "ANALYZE_INSTRUCTIONS"

# CFN Alpha Launch V2 - Single Feature Analysis (Override)

## Selected Feature

**Feature**: #$FEATURE_NUM
**Title**: $title
**Priority**: $priority

## Instructions for Main Chat

You are in ANALYZE mode for a SINGLE feature. Spawn agents to assess ONLY this feature's readiness.

Task(subagent_type="tester", prompt="Assess readiness for Feature #$FEATURE_NUM: $title

FOCUSED ANALYSIS (this feature only):
$description

Check:
1. Is this feature implemented?
2. Are there any blocking issues?
3. Do tests pass for this feature?
4. Is documentation complete?

DO NOT expand scope to other features.

Write results to docs/alpha/readiness-feature-${FEATURE_NUM}.md with:
- Implementation status
- Blocking issues (if any)
- Test coverage for this feature
- Readiness score (0-100%)
- Specific fixes needed (with file locations)

Output a focused fix list to $fix_list with:
## Feature #$FEATURE_NUM: $title
## Priority Issues (Must Fix)
1. [specific issue] - Agent: [type] - File: [location]
2. ...
")

ANALYZE_INSTRUCTIONS
        log "Analyze mode instructions printed above"
        log "Fix list will be: $fix_list"
        return
    fi

    # Group mode: analyze all features in priority group
    log "Priority group: $target_priority"

    local features=($(get_features_in_group "$target_priority"))
    local feature_count=${#features[@]}
    local fix_list="${FIX_LIST_DIR}/fix-list-${target_priority}.md"

    # Build feature list string
    local feature_details=""
    local feature_prompts=""

    for num in "${features[@]}"; do
        local info=$(extract_feature_info "$num")
        IFS='|' read -r title status priority desc <<< "$info"
        feature_details="$feature_details\n  • #$num: $title"
        feature_prompts="$feature_prompts

Feature #$num: $title
  $desc"
    done

    cat << "ANALYZE_INSTRUCTIONS"

# CFN Alpha Launch V2 - Priority Group Analysis

## Selected Priority Group

**Priority**: $target_priority
**Features**: $feature_count incomplete

## Features to Analyze
$(echo -e "$feature_details")

─────────────────────────────────────────────────────────────────

## Instructions for Main Chat

You are in ANALYZE mode for a PRIORITY GROUP. Assess ALL $feature_count features in this priority group.

**SCOPE CONSTRAINT**: Analyze ONLY the $feature_count features listed above. Do NOT expand to other priorities or features.

### Spawn Analysis Agent(s)

Task(subagent_type="tester", prompt="Assess readiness for $feature_count FEATURES in the $target_priority priority group:

FEATURES TO ASSESS:
$feature_prompts

For EACH feature, check:
1. Is this feature implemented?
2. Are there any blocking issues?
3. Do tests pass for this feature?
4. Is documentation complete?

DO NOT expand scope to other features or priorities.

SCORING PER FEATURE:
- 100%: Feature complete, tested, documented
- 75%: Implemented but minor gaps
- 50%: Partial implementation, blocking issues
- 25%: Started but incomplete
- 0%: Not implemented

Write individual readiness reports to docs/alpha/readiness-feature-[N].md for each feature.

Output a consolidated fix list to $fix_list with:
# Priority Group: $target_priority

## Feature #[N]: [Feature Name]
## Priority Issues
1. [specific issue] - Agent: [type] - File: [location]
2. ...

## Feature #[N+1]: [Feature Name]
## Priority Issues
1. [specific issue] - Agent: [type] - File: [location]
...")

ANALYZE_INSTRUCTIONS

    log "Analyze mode instructions printed above"
    log "Fix list will be: $fix_list"
}

# Mode: Fix execution
mode_fix() {
    log "Mode: fix"
    log "Parallel agents: $AGENT_COUNT"

    # Determine if group mode or single feature
    if [[ -n "${FEATURE_NUM:-}" ]]; then
        # Single feature mode
        log "Single feature mode: #$FEATURE_NUM"

        local info=$(extract_feature_info "$FEATURE_NUM")
        IFS='|' read -r title status priority description <<< "$info"

        local slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -ch '[:alnum:]-')
        local fix_list="${FIX_LIST_DIR}/fix-list-${FEATURE_NUM}-${slug}.md"

        if [[ ! -f "$fix_list" ]]; then
            error_exit "Fix list not found: $fix_list

Run analyze mode first:
  cfn-alpha-launch-v2 --mode analyze --feature $FEATURE_NUM"
        fi

        log "Delegating to cfn-parallel-execute..."
        log "Tasks file: $fix_list"

        local parallel_execute="${SCRIPT_DIR}/../cfn-parallel-execute/execute.sh"
        if [[ ! -f "$parallel_execute" ]]; then
            error_exit "cfn-parallel-execute not found at: $parallel_execute"
        fi

        exec "$parallel_execute" --tasks="$fix_list" --agents="$AGENT_COUNT"
    else
        # Group mode
        local target_priority="$PRIORITY"
        if [[ -z "$target_priority" ]]; then
            local next=$(find_next_priority_group)
            if [[ "$next" == "ALL_COMPLETE" ]]; then
                echo "All features complete. Nothing to fix."
                return
            fi
            IFS='|' read -r target_priority count <<< "$next"
            log "Auto-selected priority: $target_priority ($count features)"
        fi

        local fix_list="${FIX_LIST_DIR}/fix-list-${target_priority}.md"

        if [[ ! -f "$fix_list" ]]; then
            error_exit "Fix list not found: $fix_list

Run analyze mode first:
  cfn-alpha-launch-v2 --mode analyze --priority $target_priority"
        fi

        log "Priority group: $target_priority"
        log "Delegating to cfn-parallel-execute..."
        log "Tasks file: $fix_list"

        local parallel_execute="${SCRIPT_DIR}/../cfn-parallel-execute/execute.sh"
        if [[ ! -f "$parallel_execute" ]]; then
            error_exit "cfn-parallel-execute not found at: $parallel_execute"
        fi

        exec "$parallel_execute" --tasks="$fix_list" --agents="$AGENT_COUNT"
    fi
}

# Mode: Mark features complete
mode_complete() {
    log "Mode: complete"

    # Determine if group mode or single feature
    if [[ -n "${FEATURE_NUM:-}" ]]; then
        # Single feature mode
        log "Single feature mode: #$FEATURE_NUM"

        local info=$(extract_feature_info "$FEATURE_NUM")
        IFS='|' read -r title status priority description <<< "$info"
        local timestamp=$(date '+%Y-%m-%d')

        cat << "COMPLETE_INSTRUCTIONS"

# CFN Alpha Launch V2 - Mark Feature Complete

## Feature to Mark Complete

**Feature**: #$FEATURE_NUM
**Title**: $title
**Priority**: $priority

## Instructions for Main Chat

1. Read the feature analysis report:
   docs/alpha/readiness-feature-${FEATURE_NUM}.md

2. Verify all fixes are complete:
   - All priority issues resolved
   - Tests passing
   - Documentation updated

3. Update readme/feature-status.md:
   - Find the task table row for #$FEATURE_NUM
   - Update status to: ✅ READY
   - Update date to: $timestamp

4. Add feature completion section to feature-status.md:
   ```markdown
   ## ✅ $title ($timestamp)

   **Status**: 🟢 **READY**

   **Task**: #$FEATURE_NUM from alpha launch readiness

   **Issue**: $description

   **Solution Applied**:
   - ✅ [List what was fixed]
   - ✅ [Test coverage]
   - ✅ [Documentation]

   **Readiness**: 🟢 PRODUCTION READY
   ```

5. Commit the changes:
   ```bash
   git add readme/feature-status.md
   git commit -m "feat: feature #$FEATURE_NUM complete - $title"
   ```

COMPLETE_INSTRUCTIONS
    else
        # Group mode
        local target_priority="$PRIORITY"
        if [[ -z "$target_priority" ]]; then
            local next=$(find_next_priority_group)
            if [[ "$next" == "ALL_COMPLETE" ]]; then
                echo "All features complete. Nothing to mark."
                return
            fi
            IFS='|' read -r target_priority count <<< "$next"
            log "Auto-selected priority: $target_priority ($count features)"
        fi

        local features=($(get_features_in_group "$target_priority"))
        local feature_count=${#features[@]}
        local timestamp=$(date '+%Y-%m-%d')

        # Build feature list string
        local feature_list=""
        for num in "${features[@]}"; do
            feature_list="$feature_list  • Feature #$num\n"
        done

        cat << "COMPLETE_INSTRUCTIONS"

# CFN Alpha Launch V2 - Mark Priority Group Complete

## Priority Group to Mark Complete

**Priority**: $target_priority
**Features**: $feature_count

## Features to Mark Complete:
$(echo -e "$feature_list")

─────────────────────────────────────────────────────────────────

## Instructions for Main Chat

1. Read all feature analysis reports for this priority group

2. Verify all fixes are complete for ALL features in this group

3. Update readme/feature-status.md:
   For each feature, update the task table row:
   - Update status to: ✅ READY
   - Update date to: $timestamp

4. Add group completion summary to feature-status.md:
   ```markdown
   ## ✅ $target_priority Features Complete ($timestamp)

   **Status**: 🟢 **ALL $target_priority FEATURES READY**

   **Features Completed**:
$feature_list

   **Remaining Work**:
   - Next priority: [Next priority group]
   - Overall progress: [X/29 features]
   ```

5. Commit the changes:
   ```bash
   git add readme/feature-status.md
   git commit -m "feat: $target_priority priority group complete - $feature_count features"
   ```

COMPLETE_INSTRUCTIONS
    fi

    log "Complete mode instructions printed above"
}

# Mode: Manifest emission - convert priority-group fix-list to JSON manifest
mode_manifest() {
    log "Mode: manifest"

    local target_priority="$PRIORITY"
    local fix_list=""

    if [[ -n "${FEATURE_NUM:-}" ]]; then
        local info=$(extract_feature_info "$FEATURE_NUM")
        IFS='|' read -r title status priority description <<< "$info"
        local slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -ch '[:alnum:]-')
        fix_list="${FIX_LIST_DIR}/fix-list-${FEATURE_NUM}-${slug}.md"
    else
        if [[ -z "$target_priority" ]]; then
            local next=$(find_next_priority_group)
            if [[ "$next" == "ALL_COMPLETE" ]]; then
                echo "All features complete. Nothing to emit."
                return
            fi
            IFS='|' read -r target_priority count <<< "$next"
            log "Auto-selected priority: $target_priority"
        fi
        fix_list="${FIX_LIST_DIR}/fix-list-${target_priority}.md"
    fi

    if [[ ! -f "$fix_list" ]]; then
        error_exit "Fix list not found: $fix_list

Run analyze mode first."
    fi

    local converter="${SCRIPT_DIR}/../cfn-alpha-launch/lib/fixlist-to-manifest.sh"
    if [[ ! -x "$converter" ]]; then
        error_exit "Converter not found or not executable: $converter"
    fi

    log "Converting $fix_list to manifest..."
    "$converter" "$fix_list" --source cfn-alpha-launch-v2
}

# Main execution function
main() {
    log "Starting cfn-alpha-launch-v2..."
    log "Project root: $PROJECT_ROOT"
    log "Mode: $MODE"

    case "$MODE" in
        select)
            mode_select
            ;;
        analyze)
            mode_analyze
            ;;
        fix)
            mode_fix
            ;;
        status)
            mode_status
            ;;
        complete)
            mode_complete
            ;;
        manifest)
            mode_manifest
            ;;
    esac

    log "Instructions printed. Follow the prompts above."
}

# Parse and validate arguments
parse_args "$@"
validate_args

# Run main function
main
