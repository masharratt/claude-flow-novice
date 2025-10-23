#!/bin/bash

# select-specialist-agent.sh
# Adaptive agent specialization based on feedback type
# Part of CFN Loop Robustness & Validation Enhancement

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPECIALIST_REGISTRY="$SCRIPT_DIR/specialist-registry.json"

# Default agent when no specialist match found
DEFAULT_AGENT="general-dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] SPECIALIST-SELECTOR:${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Show usage information
show_usage() {
    cat << EOF
Adaptive Agent Specialist Selector

USAGE:
    $0 --feedback-type <TYPE> [OPTIONS]
    $0 --feedback-text <TEXT> [OPTIONS]

REQUIRED:
    --feedback-type <TYPE>     Direct feedback category (CRITICAL|WARNING|SUGGESTION|PERFORMANCE|SECURITY|ARCHITECTURE|TESTING|DOCUMENTATION)
    --feedback-text <TEXT>     Analyze feedback text to categorize

OPTIONS:
    --task-id <ID>             Task identifier for logging
    --iteration <N>            Iteration number (default: 1)
    --confidence <SCORE>       Confidence threshold for auto-selection (default: 0.7)
    --default-agent <AGENT>    Fallback agent when no match (default: general-dev)
    --dry-run                  Show selection without spawning
    --verbose                  Detailed logging output
    --help                     Show this help message

EXAMPLES:
    # Direct feedback type selection
    $0 --feedback-type SECURITY --task-id "task-123" --iteration 2

    # Analyze feedback text automatically
    $0 --feedback-text "Memory leak detected in authentication module" --task-id "task-123"

    # Dry run to test selection logic
    $0 --feedback-text "Database query is slow" --dry-run --verbose

SPECIALIST CATEGORIES:
    SECURITY        → security-specialist
    PERFORMANCE     → performance-specialist
    ARCHITECTURE    → architecture-specialist
    TESTING         → testing-specialist
    DOCUMENTATION   → documentation-specialist
    CRITICAL        → security-specialist (default for critical issues)
    WARNING         → architecture-specialist (default for warnings)
    SUGGESTION      → general-dev (default for suggestions)

EOF
}

# Parse command line arguments
parse_args() {
    FEEDBACK_TYPE=""
    FEEDBACK_TEXT=""
    TASK_ID=""
    ITERATION="1"
    CONFIDENCE="0.7"
    DRY_RUN=false
    VERBOSE=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --feedback-type)
                FEEDBACK_TYPE="$2"
                shift 2
                ;;
            --feedback-text)
                FEEDBACK_TEXT="$2"
                shift 2
                ;;
            --task-id)
                TASK_ID="$2"
                shift 2
                ;;
            --iteration)
                ITERATION="$2"
                shift 2
                ;;
            --confidence)
                CONFIDENCE="$2"
                shift 2
                ;;
            --default-agent)
                DEFAULT_AGENT="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$FEEDBACK_TYPE" && -z "$FEEDBACK_TEXT" ]]; then
        error "Either --feedback-type or --feedback-text is required"
        show_usage
        exit 1
    fi
}

# Analyze feedback text to determine category
analyze_feedback_text() {
    local text="$1"
    local feedback_type=""
    
    if [[ "$VERBOSE" == true ]]; then
        log "Analyzing feedback text: '$text'"
    fi

    # Security keywords
    if echo "$text" | grep -qiE "(security|vulnerability|auth|password|token|injection|xss|csrf|encryption|ssl|tls|hack|breach|malicious)"; then
        feedback_type="SECURITY"
    # Performance keywords
    elif echo "$text" | grep -qiE "(performance|slow|memory|leak|cpu|optimization|cache|bottleneck|latency|throughput|scale|efficiency)"; then
        feedback_type="PERFORMANCE"
    # Architecture keywords
    elif echo "$text" | grep -qiE "(architecture|design|pattern|structure|modular|coupling|cohesion|scalability|maintainability|refactor|component)"; then
        feedback_type="ARCHITECTURE"
    # Testing keywords
    elif echo "$text" | grep -qiE "(test|testing|coverage|unit|integration|e2e|tdd|assert|mock|fixture|spec|validate)"; then
        feedback_type="TESTING"
    # Documentation keywords
    elif echo "$text" | grep -qiE "(documentation|doc|readme|guide|manual|comment|explain|clarify|instruction|tutorial)"; then
        feedback_type="DOCUMENTATION"
    # Critical severity indicators
    elif echo "$text" | grep -qiE "(critical|urgent|broken|failed|crash|error|exception|blocker|showstopper)"; then
        feedback_type="CRITICAL"
    # Warning indicators
    elif echo "$text" | grep -qiE "(warning|caution|risk|potential|should|recommend|consider|improve)"; then
        feedback_type="WARNING"
    else
        feedback_type="SUGGESTION"
    fi

    if [[ "$VERBOSE" == true ]]; then
        log "Detected feedback type: $feedback_type"
    fi

    echo "$feedback_type"
}

# Initialize specialist registry
initialize_registry() {
    if [[ ! -f "$SPECIALIST_REGISTRY" ]]; then
        log "Creating specialist registry"
        mkdir -p "$(dirname "$SPECIALIST_REGISTRY")"
        cat > "$SPECIALIST_REGISTRY" << 'EOF'
{
  "specialists": {
    "security": {
      "agent": "security-specialist",
      "keywords": ["security", "vulnerability", "auth", "password", "token", "injection", "xss", "csrf", "encryption", "ssl", "tls", "hack", "breach", "malicious"],
      "feedback_types": ["SECURITY", "CRITICAL"],
      "capabilities": ["Security analysis", "Vulnerability assessment", "Authentication/Authorization", "Encryption implementation", "Security testing"],
      "confidence_threshold": 0.8
    },
    "performance": {
      "agent": "performance-specialist",
      "keywords": ["performance", "slow", "memory", "leak", "cpu", "optimization", "cache", "bottleneck", "latency", "throughput", "scale", "efficiency"],
      "feedback_types": ["PERFORMANCE"],
      "capabilities": ["Performance profiling", "Memory optimization", "Caching strategies", "Load testing", "Benchmarking"],
      "confidence_threshold": 0.75
    },
    "architecture": {
      "agent": "architecture-specialist",
      "keywords": ["architecture", "design", "pattern", "structure", "modular", "coupling", "cohesion", "scalability", "maintainability", "refactor", "component"],
      "feedback_types": ["ARCHITECTURE", "WARNING"],
      "capabilities": ["System design", "Pattern implementation", "Refactoring", "Modularity", "Scalability planning"],
      "confidence_threshold": 0.7
    },
    "testing": {
      "agent": "testing-specialist",
      "keywords": ["test", "testing", "coverage", "unit", "integration", "e2e", "tdd", "assert", "mock", "fixture", "spec", "validate"],
      "feedback_types": ["TESTING"],
      "capabilities": ["Test design", "Test automation", "Coverage analysis", "Test-driven development", "Quality assurance"],
      "confidence_threshold": 0.75
    },
    "documentation": {
      "agent": "documentation-specialist",
      "keywords": ["documentation", "doc", "readme", "guide", "manual", "comment", "explain", "clarify", "instruction", "tutorial"],
      "feedback_types": ["DOCUMENTATION"],
      "capabilities": ["Technical writing", "API documentation", "User guides", "Code comments", "Tutorial creation"],
      "confidence_threshold": 0.65
    }
  },
  "fallback_mappings": {
    "CRITICAL": "security",
    "WARNING": "architecture",
    "SUGGESTION": "general"
  },
  "version": "1.0.0",
  "last_updated": "2025-06-17"
}
EOF
        log "Specialist registry initialized at $SPECIALIST_REGISTRY"
    fi
}

# Select specialist agent based on feedback type
select_specialist() {
    local feedback_type="$1"
    local specialist_type=""
    local selected_agent=""
    local confidence=""

    # Normalize feedback type
    feedback_type=$(echo "$feedback_type" | tr '[:lower:]' '[:upper:]')

    if [[ "$VERBOSE" == true ]]; then
        log "Selecting specialist for feedback type: $feedback_type"
    fi

    # Load specialist registry
    if [[ -f "$SPECIALIST_REGISTRY" ]]; then
        # Try direct mapping to specialist type
        specialist_type=$(jq -r ".specialists | to_entries[] | select(.value.feedback_types[] | test(\"^$feedback_type$\"; \"i\")) | .key" "$SPECIALIST_REGISTRY" 2>/dev/null || echo "")
        
        # If no direct match, try fallback mappings
        if [[ -z "$specialist_type" ]]; then
            specialist_type=$(jq -r ".fallback_mappings[\"$feedback_type\"] // empty" "$SPECIALIST_REGISTRY" 2>/dev/null || echo "")
        fi

        # Get agent and confidence if specialist type found
        if [[ -n "$specialist_type" && "$specialist_type" != "null" ]]; then
            selected_agent=$(jq -r ".specialists[\"$specialist_type\"].agent // empty" "$SPECIALIST_REGISTRY" 2>/dev/null || echo "")
            confidence=$(jq -r ".specialists[\"$specialist_type\"].confidence_threshold // $CONFIDENCE" "$SPECIALIST_REGISTRY" 2>/dev/null || echo "$CONFIDENCE")
        fi
    fi

    # Fallback to default agent if no specialist found
    if [[ -z "$selected_agent" || "$selected_agent" == "null" ]]; then
        selected_agent="$DEFAULT_AGENT"
        confidence="$CONFIDENCE"
        warning "No specialist found for feedback type '$feedback_type', using default agent: $DEFAULT_AGENT"
    else
        success "Selected specialist: $selected_agent (confidence: $confidence)"
    fi

    echo "$selected_agent:$confidence:$specialist_type"
}

# Spawn specialist agent
spawn_specialist() {
    local agent="$1"
    local task_id="$2"
    local iteration="$3"
    local specialist_type="$4"
    
    if [[ "$DRY_RUN" == true ]]; then
        log "[DRY RUN] Would spawn specialist agent: $agent"
        log "[DRY RUN] Task ID: $task_id"
        log "[DRY RUN] Iteration: $iteration"
        log "[DRY RUN] Specialist type: $specialist_type"
        return 0
    fi

    log "Spawning specialist agent: $agent"
    
    # Spawn agent using CLI
    if command -v npx >/dev/null 2>&1; then
        npx claude-flow-novice spawn agent "$agent" \
            --task-id "$task_id" \
            --iteration "$iteration" \
            --specialist-type "$specialist_type" \
            --feedback-type "$FEEDBACK_TYPE" || {
                error "Failed to spawn specialist agent: $agent"
                return 1
            }
        success "Specialist agent spawned successfully: $agent"
    else
        error "npx command not found. Cannot spawn specialist agent."
        return 1
    fi
}

# Main execution
main() {
    parse_args "$@"
    
    # Initialize registry
    initialize_registry
    
    # Determine feedback type
    if [[ -z "$FEEDBACK_TYPE" ]]; then
        FEEDBACK_TYPE=$(analyze_feedback_text "$FEEDBACK_TEXT")
    fi
    
    # Select specialist
    local result=$(select_specialist "$FEEDBACK_TYPE")
    local selected_agent=$(echo "$result" | cut -d: -f1)
    local confidence_score=$(echo "$result" | cut -d: -f2)
    local specialist_type=$(echo "$result" | cut -d: -f3)
    
    # Log selection details
    if [[ "$VERBOSE" == true ]]; then
        log "Feedback Type: $FEEDBACK_TYPE"
        log "Selected Agent: $selected_agent"
        log "Confidence Score: $confidence_score"
        log "Specialist Type: $specialist_type"
        log "Task ID: ${TASK_ID:-N/A}"
        log "Iteration: $ITERATION"
    fi
    
    # Check confidence threshold
    if (( $(echo "$confidence_score >= $CONFIDENCE" | bc -l) )); then
        # Spawn specialist
        spawn_specialist "$selected_agent" "$TASK_ID" "$ITERATION" "$specialist_type"
        
        # Return result for orchestrator
        echo "{\"selected_agent\":\"$selected_agent\",\"confidence\":$confidence_score,\"specialist_type\":\"$specialist_type\",\"feedback_type\":\"$FEEDBACK_TYPE\"}"
    else
        warning "Confidence score ($confidence_score) below threshold ($CONFIDENCE), using default agent"
        if [[ "$DRY_RUN" != true ]]; then
            spawn_specialist "$DEFAULT_AGENT" "$TASK_ID" "$ITERATION" "general"
        fi
        echo "{\"selected_agent\":\"$DEFAULT_AGENT\",\"confidence\":$confidence_score,\"specialist_type\":\"general\",\"feedback_type\":\"$FEEDBACK_TYPE\"}"
    fi
}

# Execute main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi