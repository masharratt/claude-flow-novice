#!/bin/bash

set -euo pipefail

# CFN Dependency Management - Main Execution Script
# Orchestrates the complete dependency extraction and ingestion pipeline

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTRACTOR_SCRIPT="${SCRIPT_DIR}/lib/extractor/extract-dependencies.sh"
INGESTION_SCRIPT="${SCRIPT_DIR}/lib/ingestion/ingest-dependencies.sh"

# Default parameters
TASK_DESCRIPTION=""
OUTPUT_FILE=""
MODE="standard"  # mvp, standard, enterprise
VERBOSE=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --task-description)
            TASK_DESCRIPTION="$2"
            shift 2
            ;;
        --output-file)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            cat << EOF
CFN Dependency Management Execution Script

Usage:
    $0 --task-description "<description>" [--output-file <path>] [--mode <mode>] [--verbose]

Parameters:
    --task-description    Task description or acceptance criteria to analyze
    --output-file         Optional file to save ingestion results (default: stdout)
    --mode                Execution mode: mvp, standard, or enterprise (default: standard)
    --verbose             Enable verbose logging
    --help, -h           Show this help message

Examples:
    # Basic dependency extraction and ingestion
    $0 --task-description "Implement OAuth2 authentication with 2FA support"

    # Save results to file
    $0 --task-description "Build admin dashboard" --output-file /tmp/dependencies.txt

    # MVP mode (minimal dependencies)
    $0 --task-description "Add user profile management" --mode mvp

    # Enterprise mode (full dependency graph)
    $0 --task-description "Complete security audit system" --mode enterprise --verbose

EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Use --help for usage information" >&2
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ -z "$TASK_DESCRIPTION" ]]; then
    echo "Error: --task-description is required" >&2
    echo "Use --help for usage information" >&2
    exit 1
fi

# Validate mode
if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
    echo "Error: Invalid mode '$MODE'. Must be one of: mvp, standard, enterprise" >&2
    exit 1
fi

# Check if component scripts exist
if [[ ! -f "$EXTRACTOR_SCRIPT" ]]; then
    echo "Error: Extractor script not found: $EXTRACTOR_SCRIPT" >&2
    exit 1
fi

if [[ ! -f "$INGESTION_SCRIPT" ]]; then
    echo "Error: Ingestion script not found: $INGESTION_SCRIPT" >&2
    exit 1
fi

# Logging function
log() {
    if [[ "$VERBOSE" == true ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
    fi
}

# Generate context based on extraction results when diagram is missing
generate_context_from_extraction() {
    local extraction_result="$1"
    local mode="$2"
    
    echo "# CFN Loop Dependency Context (Generated from Task Analysis)"
    echo "# Generated: $(date)"
    echo "# Task: $TASK_DESCRIPTION"
    echo "# Mode: $mode"
    echo ""
    
    # Extract critical path dependencies
    local critical_path=$(echo "$extraction_result" | jq -r '.critical_path[]?' 2>/dev/null || echo "")
    
    if [[ -n "$critical_path" ]]; then
        echo "# Critical Path Dependencies:"
        for dep in $critical_path; do
            echo "#   - $dep"
        done
        echo ""
        
        # Map dependencies to relevant files
        echo "# Suggested Context Files (based on dependencies):"
        
        case "$critical_path" in
            *oauth2*)
                echo "Read: .claude/agents/cfn-dev-team/cfn-security-expert.md"
                echo "Read: .claude/agents/cfn-dev-team/cfn-implementation-agent.md"
                ;;
            *admin_dashboard*)
                echo "Read: .claude/agents/cfn-dev-team/cfn-frontend-expert.md"
                echo "Read: .claude/agents/cfn-dev-team/cfn-implementation-agent.md"
                ;;
            *security_audit*)
                echo "Read: .claude/agents/cfn-dev-team/cfn-security-expert.md"
                echo "Read: .claude/agents/cfn-dev-team/cfn-validator.md"
                ;;
        esac
        
        echo ""
        echo "# Coordination Layer Files:"
        echo "Read: .claude/skills/cfn-loop-orchestration/SKILL.md"
        echo "Read: .claude/skills/cfn-redis-coordination/SKILL.md"
        echo ""
    fi
    
    # Always include core CFN files based on mode
    echo "# Core CFN Loop Files:"
    
    case "$mode" in
        mvp)
            echo "Read: .claude/agents/cfn-dev-team/cfn-implementation-agent.md"
            echo "Read: .claude/skills/cfn-agent-spawning/SKILL.md"
            ;;
        standard|enterprise)
            echo "Read: .claude/agents/cfn-dev-team/cfn-coordinator.md"
            echo "Read: .claude/agents/cfn-dev-team/cfn-implementation-agent.md"
            echo "Read: .claude/agents/cfn-dev-team/cfn-validator.md"
            echo "Read: .claude/skills/cfn-loop-orchestration/SKILL.md"
            echo "Read: .claude/skills/cfn-redis-coordination/SKILL.md"
            echo "Read: .claude/skills/cfn-agent-spawning/SKILL.md"
            
            if [[ "$mode" == "enterprise" ]]; then
                echo "Read: .claude/skills/cfn-validation-framework/SKILL.md"
                echo "Read: .claude/skills/cfn-error-management/SKILL.md"
            fi
            ;;
    esac
    
    echo ""
    echo "# Context generation complete"
}

# Main execution
main() {
    log "Starting dependency management pipeline"
    log "Task: $TASK_DESCRIPTION"
    log "Mode: $MODE"
    
    # Step 1: Extract dependencies
    log "Step 1: Extracting dependencies from task description"
    EXTRACTION_RESULT=$("$EXTRACTOR_SCRIPT" --criteria "$TASK_DESCRIPTION")
    
    if [[ $? -ne 0 ]]; then
        echo "Error: Dependency extraction failed" >&2
        exit 1
    fi
    
    log "Extraction completed successfully"
    
    # Parse extraction result to get critical path
    CRITICAL_PATH=$(echo "$EXTRACTION_RESULT" | jq -r '.critical_path[]' 2>/dev/null || echo "")
    
    if [[ -n "$CRITICAL_PATH" ]]; then
        log "Critical path identified: ${CRITICAL_PATH//$'\n'/, }"
    fi
    
    # Step 2: Check if dependency diagram exists for ingestion
    PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")
    DIAGRAM="${PROJECT_ROOT}/readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt"
    
    if [[ ! -f "$DIAGRAM" ]]; then
        log "Warning: Dependency diagram not found at $DIAGRAM"
        log "Generating context from task analysis instead"
        
        # Generate context from extraction results
        CONTEXT_OUTPUT=$(generate_context_from_extraction "$EXTRACTION_RESULT" "$MODE")
        
        # Output or save the generated context
        if [[ -n "$OUTPUT_FILE" ]]; then
            log "Saving generated context to: $OUTPUT_FILE"
            echo "$CONTEXT_OUTPUT" > "$OUTPUT_FILE"
        else
            echo "$CONTEXT_OUTPUT"
        fi
    else
        # Step 3: Run ingestion with existing diagram
        log "Step 3: Running dependency ingestion with mode: $MODE"
        
        # Prepare ingestion arguments based on mode
        INGESTION_ARGS=""
        
        case "$MODE" in
            mvp)
                # MVP: Only P0 files
                INGESTION_ARGS="--priority P0 --type TS,SH"
                ;;
            standard)
                # Standard: P0 and P1 files
                INGESTION_ARGS="--priority P0,P1 --type TS,SH"
                ;;
            enterprise)
                # Enterprise: All files (P0, P1, P2)
                INGESTION_ARGS="--priority P0,P1,P2 --type TS,SH --include-deprecated"
                ;;
        esac
        
        if [[ -n "$OUTPUT_FILE" ]]; then
            log "Saving ingestion results to: $OUTPUT_FILE"
            "$INGESTION_SCRIPT" $INGESTION_ARGS > "$OUTPUT_FILE"
            INGESTION_STATUS=$?
        else
            log "Outputting ingestion results to stdout"
            "$INGESTION_SCRIPT" $INGESTION_ARGS
            INGESTION_STATUS=$?
        fi
        
        if [[ $INGESTION_STATUS -ne 0 ]]; then
            echo "Error: Dependency ingestion failed" >&2
            exit 1
        fi
    fi
    
    # Step 4: Generate summary
    log "Step 4: Generating pipeline summary"
    
    echo ""
    echo "# CFN Dependency Management Pipeline Summary"
    echo "# Generated: $(date)"
    echo "# Task: $TASK_DESCRIPTION"
    echo "# Mode: $MODE"
    echo ""
    
    if [[ -n "$CRITICAL_PATH" ]]; then
        echo "# Critical Path Dependencies:"
        for dep in $CRITICAL_PATH; do
            echo "#   - $dep"
        done
        echo ""
    fi
    
    # Count dependencies by type if jq is available
    if command -v jq >/dev/null 2>&1; then
        echo "# Dependency Analysis:"
        DEP_COUNT=$(echo "$EXTRACTION_RESULT" | jq '.dependencies | keys | length' 2>/dev/null || echo "N/A")
        echo "#   Total dependencies: $DEP_COUNT"
        
        # Show parallel opportunities
        PARALLEL_OPPS=$(echo "$EXTRACTION_RESULT" | jq -r '.parallel_opportunities[] | "\(.sprint) can run with \(.can_run_parallel_with)"' 2>/dev/null || echo "None identified")
        if [[ "$PARALLEL_OPPS" != "None identified" ]] && [[ -n "$PARALLEL_OPPS" ]]; then
            echo "#   Parallel opportunities:"
            echo "$PARALLEL_OPPS" | sed 's/^/#     /'
        fi
    fi
    
    echo ""
    echo "# Pipeline completed successfully"
    
    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "# Results saved to: $OUTPUT_FILE"
    fi
    
    if [[ ! -f "$DIAGRAM" ]]; then
        echo "# Note: Context generated from task analysis (no dependency diagram found)"
    fi
    
    log "Pipeline execution completed"
}

# Execute main function
main