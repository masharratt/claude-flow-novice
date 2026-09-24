#!/bin/bash

# cfn-task-intelligence.sh
# Task Intelligence Integration Layer for CFN Loop Orchestration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/../cfn-memory-persistence/task_intelligence.db"
LOG_FILE="${SCRIPT_DIR}/task_intelligence.log"

# Initialize database
init_database() {
    mkdir -p "$(dirname "$DB_PATH")"
    sqlite3 "$DB_PATH" <<EOF
CREATE TABLE IF NOT EXISTS task_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_hash TEXT UNIQUE,
    description TEXT,
    category TEXT,
    subcategories TEXT,
    recommended_agents TEXT,
    confidence REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS complexity_estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_hash TEXT,
    estimated_iterations INTEGER,
    confidence REAL,
    factors TEXT,
    mode TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_hash) REFERENCES task_classifications(task_hash)
);

CREATE TABLE IF NOT EXISTS specialist_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loop3_agents TEXT,
    feedback_themes TEXT,
    recurring_count INTEGER,
    recommended_specialist TEXT,
    reasoning TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS execution_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_hash TEXT,
    actual_iterations INTEGER,
    success BOOLEAN,
    agents_used TEXT,
    specialists_added TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_hash) REFERENCES task_classifications(task_hash)
);
EOF
}

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Generate task hash
generate_task_hash() {
    local description="$1"
    echo -n "$description" | sha256sum | cut -d' ' -f1
}

# Classify task
classify_task() {
    local description="$1"
    local task_hash
    task_hash=$(generate_task_hash "$description")
    
    # Check cache first
    local cached_result
    cached_result=$(sqlite3 "$DB_PATH" "SELECT category, subcategories, recommended_agents, confidence FROM task_classifications WHERE task_hash='$task_hash'" 2>/dev/null || echo "")
    
    if [[ -n "$cached_result" ]]; then
        IFS='|' read -r category subcategories agents confidence <<< "$cached_result"
        echo "{\"category\":\"$category\",\"subcategories\":[$subcategories],\"recommended_agents\":[$agents],\"confidence\":$confidence}"
        return
    fi
    
    # Classification logic
    local category="general"
    local subcategories="[]"
    local agents="[]"
    local confidence=0.5
    
    if [[ "$description" =~ (frontend|ui|ux|interface|component) ]]; then
        category="frontend"
        subcategories='["ui","state-management"]'
        agents='["frontend-developer","ui-ux-designer"]'
        confidence=0.85
    elif [[ "$description" =~ (backend|api|server|database|service) ]]; then
        category="backend"
        subcategories='["api","data-layer"]'
        agents='["backend-developer","database-administrator"]'
        confidence=0.82
    elif [[ "$description" =~ (security|auth|authentication|authorization|encryption) ]]; then
        category="security"
        subcategories='["authentication","authorization"]'
        agents='["security-specialist","backend-developer"]'
        confidence=0.88
    elif [[ "$description" =~ (performance|optimization|speed|latency|cache) ]]; then
        category="performance"
        subcategories='["optimization","monitoring"]'
        agents='["performance-engineer","backend-developer"]'
        confidence=0.80
    elif [[ "$description" =~ (test|testing|quality|assurance|qa) ]]; then
        category="testing"
        subcategories='["unit-testing","integration-testing"]'
        agents='["qa-engineer","test-automation-specialist"]'
        confidence=0.83
    fi
    
    # Cache result
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO task_classifications (task_hash, description, category, subcategories, recommended_agents, confidence) VALUES ('$task_hash', '$(echo "$description" | sed "s/'/''/g")', '$category', '$subcategories', '$agents', $confidence)"
    
    echo "{\"category\":\"$category\",\"subcategories\":$subcategories,\"recommended_agents\":$agents,\"confidence\":$confidence}"
}

# Estimate complexity
estimate_complexity() {
    local description="$1"
    local task_hash
    task_hash=$(generate_task_hash "$description")
    
    # Check cache
    local cached_result
    cached_result=$(sqlite3 "$DB_PATH" "SELECT estimated_iterations, confidence, factors, mode FROM complexity_estimates WHERE task_hash='$task_hash'" 2>/dev/null || echo "")
    
    if [[ -n "$cached_result" ]]; then
        IFS='|' read -r iterations confidence factors mode <<< "$cached_result"
        echo "{\"estimated_iterations\":$iterations,\"confidence\":$confidence,\"factors\":[$factors],\"mode\":\"$mode\"}"
        return
    fi
    
    # Complexity estimation logic
    local iterations=3
    local confidence=0.7
    local factors="[]"
    local mode="standard"
    
    # Analyze factors
    local factor_list=()
    
    if [[ "$description" =~ (new|novel|first-time|initial) ]]; then
        ((iterations += 2))
        factor_list+=('"new-feature"')
        confidence=$(echo "$confidence - 0.1" | bc)
    fi
    
    if [[ "$description" =~ (cross|multiple|several|different) ]]; then
        ((iterations += 1))
        factor_list+=('"cross-component"')
        confidence=$(echo "$confidence - 0.05" | bc)
    fi
    
    if [[ "$description" =~ (test|testing|validate|verify) ]]; then
        ((iterations += 1))
        factor_list+=('"testing-required"')
    fi
    
    if [[ "$description" =~ (complex|difficult|challenging|advanced) ]]; then
        ((iterations += 2))
        factor_list+=('"high-complexity"')
        confidence=$(echo "$confidence - 0.1" | bc)
    fi
    
    if [[ "$description" =~ (urgent|critical|immediate) ]]; then
        mode="fast-track"
        iterations=$((iterations / 2 + 1))
    fi
    
    # Ensure minimum iterations
    if [[ $iterations -lt 2 ]]; then
        iterations=2
    fi
    
    # Ensure maximum iterations
    if [[ $iterations -gt 10 ]]; then
        iterations=10
    fi
    
    # Format factors
    if [[ ${#factor_list[@]} -gt 0 ]]; then
        factors=$(IFS=,; echo "${factor_list[*]}")
    fi
    
    # Cache result
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO complexity_estimates (task_hash, estimated_iterations, confidence, factors, mode) VALUES ('$task_hash', $iterations, $confidence, '[$factors]', '$mode')"
    
    echo "{\"estimated_iterations\":$iterations,\"confidence\":$confidence,\"factors\":[$factors],\"mode\":\"$mode\"}"
}

# Recommend specialist
recommend_specialist() {
    local current_loop3="$1"
    local feedback_themes="$2"
    local recurring_count="$3"
    
    local specialist=""
    local reasoning=""
    local new_agents="$current_loop3"
    
    # Analyze feedback themes
    if [[ "$feedback_themes" =~ (security|auth|authentication|authorization) ]] && [[ $recurring_count -ge 3 ]]; then
        specialist="security-specialist"
        reasoning="Recurring feedback themes: security, authentication. Added as number of occurrences reached required threshold."
        if [[ ! "$current_loop3" =~ security-specialist ]]; then
            new_agents="$current_loop3,security-specialist"
        fi
    elif [[ "$feedback_themes" =~ (performance|optimization|speed|latency) ]] && [[ $recurring_count -ge 3 ]]; then
        specialist="performance-engineer"
        reasoning="Recurring feedback themes: performance, optimization. Added as number of occurrences reached required threshold."
        if [[ ! "$current_loop3" =~ performance-engineer ]]; then
            new_agents="$current_loop3,performance-engineer"
        fi
    elif [[ "$feedback_themes" =~ (test|testing|quality|assurance) ]] && [[ $recurring_count -ge 3 ]]; then
        specialist="qa-engineer"
        reasoning="Recurring feedback themes: testing, quality assurance. Added as number of occurrences reached required threshold."
        if [[ ! "$current_loop3" =~ qa-engineer ]]; then
            new_agents="$current_loop3,qa-engineer"
        fi
    elif [[ "$feedback_themes" =~ (ui|ux|design|interface) ]] && [[ $recurring_count -ge 3 ]]; then
        specialist="ui-ux-designer"
        reasoning="Recurring feedback themes: UI/UX, design. Added as number of occurrences reached required threshold."
        if [[ ! "$current_loop3" =~ ui-ux-designer ]]; then
            new_agents="$current_loop3,ui-ux-designer"
        fi
    fi
    
    # Store recommendation
    sqlite3 "$DB_PATH" "INSERT INTO specialist_recommendations (loop3_agents, feedback_themes, recurring_count, recommended_specialist, reasoning) VALUES ('$current_loop3', '$feedback_themes', $recurring_count, '$specialist', '$(echo "$reasoning" | sed "s/'/''/g")')"
    
    # Format new agents as array
    local agents_array="[\"$(echo "$new_agents" | sed 's/,/","/g')\"]"
    
    echo "{\"add_specialist\":\"$specialist\",\"reasoning\":\"$reasoning\",\"new_loop3_agents\":$agents_array}"
}

# Full analysis
full_analysis() {
    local description="$1"
    
    local classification
    classification=$(classify_task "$description")
    
    local complexity
    complexity=$(estimate_complexity "$description")
    
    echo "{\"classification\":$classification,\"complexity\":$complexity}"
}

# Main execution
main() {
    init_database
    
    local mode=""
    local task_description=""
    local current_loop3=""
    local feedback_themes=""
    local recurring_count=0
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode)
                mode="$2"
                shift 2
                ;;
            --task-description)
                task_description="$2"
                shift 2
                ;;
            --current-loop3)
                current_loop3="$2"
                shift 2
                ;;
            --feedback-themes)
                feedback_themes="$2"
                shift 2
                ;;
            --recurring-count)
                recurring_count="$2"
                shift 2
                ;;
            *)
                log "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Execute based on mode
    case "$mode" in
        classify)
            if [[ -z "$task_description" ]]; then
                log "Error: --task-description required for classify mode"
                exit 1
            fi
            classify_task "$task_description"
            ;;
        complexity)
            if [[ -z "$task_description" ]]; then
                log "Error: --task-description required for complexity mode"
                exit 1
            fi
            estimate_complexity "$task_description"
            ;;
        specialist)
            if [[ -z "$current_loop3" || -z "$feedback_themes" ]]; then
                log "Error: --current-loop3 and --feedback-themes required for specialist mode"
                exit 1
            fi
            recommend_specialist "$current_loop3" "$feedback_themes" "$recurring_count"
            ;;
        all)
            if [[ -z "$task_description" ]]; then
                log "Error: --task-description required for all mode"
                exit 1
            fi
            full_analysis "$task_description"
            ;;
        *)
            log "Error: Invalid mode. Use classify, complexity, specialist, or all"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"