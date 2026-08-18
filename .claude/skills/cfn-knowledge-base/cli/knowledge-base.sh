#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
readonly SHARED_UTILS_DIR="${SHARED_UTILS_DIR:-$PROJECT_ROOT/shared}"

# Try different paths for bootstrap utilities
if [[ -f "${PROJECT_ROOT}/.claude/skills/shared/bootstrap/sqlite-params.sh" ]]; then
    source "${PROJECT_ROOT}/.claude/skills/shared/bootstrap/sqlite-params.sh"
elif [[ -f "${SCRIPT_DIR}/../../shared/bootstrap/sqlite-params.sh" ]]; then
    source "${SCRIPT_DIR}/../../shared/bootstrap/sqlite-params.sh"
elif [[ -f "${SHARED_UTILS_DIR}/bootstrap.sh" ]]; then
    source "${SHARED_UTILS_DIR}/bootstrap.sh"
else
    echo "Error: Bootstrap utilities not found" >&2
    echo "Tried: ${PROJECT_ROOT}/.claude/skills/shared/bootstrap/sqlite-params.sh" >&2
    echo "Tried: ${SCRIPT_DIR}/../../shared/bootstrap/sqlite-params.sh" >&2
    echo "And: ${SHARED_UTILS_DIR}/bootstrap.sh" >&2
    exit 1
fi

readonly WORKFLOW_DB="${WORKFLOW_DB:-${SCRIPT_DIR}/data/workflows.db}"
readonly PLAYBOOK_DB="${PLAYBOOK_DB:-${SCRIPT_DIR}/data/playbooks.db}"
readonly LEARNINGS_DB="${LEARNINGS_DB:-${SCRIPT_DIR}/data/learnings.db}"

JSON_OUTPUT=false
VERBOSE=false

usage() {
    cat << EOF
Usage: ${SCRIPT_NAME} [OPTIONS] <SUBCOMMAND> [ARGS]

A unified CLI interface for the cfn-knowledge-base skill.

SUBCOMMANDS:
    query-workflow    Search workflow patterns
    query-playbook    Search playbook entries
    store-learning    Store new learnings to appropriate database
    init              Initialize both databases

OPTIONS:
    -j, --json        Output results in JSON format
    -v, --verbose     Enable verbose output
    -h, --help        Show this help message

EXAMPLES:
    # Initialize databases
    ${SCRIPT_NAME} init

    # Query workflows
    ${SCRIPT_NAME} query-workflow --pattern "EC2"
    ${SCRIPT_NAME} query-workflow --pattern "Lambda" --json

    # Query playbooks
    ${SCRIPT_NAME} query-playbook --category "security"
    ${SCRIPT_NAME} query-playbook --search "IAM role" --json

    # Store learning
    ${SCRIPT_NAME} store-learning --type "workflow" --title "New Pattern" --content "Description here"
    ${SCRIPT_NAME} store-learning --type "playbook" --title "Security Guide" --content "Steps here" --tags "security,iam"

For detailed help on each subcommand:
    ${SCRIPT_NAME} <SUBCOMMAND> --help
EOF
}

log() {
    if [[ "${VERBOSE}" == "true" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
    fi
}

error_exit() {
    echo "Error: $1" >&2
    exit "${2:-1}"
}

validate_db_file() {
    local db_file="$1"
    local db_type="$2"
    
    if [[ ! -f "${db_file}" ]]; then
        error_exit "${db_type} database not found. Run '${SCRIPT_NAME} init' first."
    fi
    
    if [[ ! -r "${db_file}" ]]; then
        error_exit "${db_type} database is not readable."
    fi
}

init_databases() {
    local data_dir
    data_dir="$(dirname "${WORKFLOW_DB}")"
    
    mkdir -p "${data_dir}"
    
    log "Initializing workflow database at ${WORKFLOW_DB}"
    sqlite3 "${WORKFLOW_DB}" << 'EOF'
CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    pattern TEXT NOT NULL,
    description TEXT,
    steps TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_pattern ON workflows(pattern);
CREATE INDEX IF NOT EXISTS idx_workflow_title ON workflows(title);
EOF

    log "Initializing playbook database at ${PLAYBOOK_DB}"
    sqlite3 "${PLAYBOOK_DB}" << 'EOF'
CREATE TABLE IF NOT EXISTS playbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_playbook_category ON playbooks(category);
CREATE INDEX IF NOT EXISTS idx_playbook_title ON playbooks(title);
CREATE INDEX IF NOT EXISTS idx_playbook_tags ON playbooks(tags);
EOF

    log "Initializing learnings database at ${LEARNINGS_DB}"
    sqlite3 "${LEARNINGS_DB}" << 'EOF'
CREATE TABLE IF NOT EXISTS learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('workflow', 'playbook')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learnings_type ON learnings(type);
CREATE INDEX IF NOT EXISTS idx_learnings_title ON learnings(title);
EOF

    if [[ "${JSON_OUTPUT}" == "true" ]]; then
        echo '{"status": "success", "message": "Databases initialized successfully"}'
    else
        echo "Databases initialized successfully"
    fi
}

query_workflow() {
    local pattern=""
    local title=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --pattern) pattern="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --help)
                cat << EOF
Usage: ${SCRIPT_NAME} query-workflow [OPTIONS]

Search workflow patterns.

OPTIONS:
    --pattern PATTERN    Search by pattern name
    --title TITLE        Search by title
    -j, --json           Output in JSON format
    -v, --verbose        Enable verbose output
    -h, --help           Show this help message

EXAMPLES:
    ${SCRIPT_NAME} query-workflow --pattern "EC2"
    ${SCRIPT_NAME} query-workflow --title "Instance Launch"
EOF
                exit 0
                ;;
            *) error_exit "Unknown option: $1" ;;
        esac
    done

    validate_db_file "${WORKFLOW_DB}" "Workflow"

    local query="SELECT id, title, pattern, description, created_at FROM workflows WHERE 1=1"
    local params=()

    if [[ -n "${pattern}" ]]; then
        query+=" AND pattern LIKE ?"
        params+=("%${pattern}%")
    fi

    if [[ -n "${title}" ]]; then
        query+=" AND title LIKE ?"
        params+=("%${title}%")
    fi

    query+=" ORDER BY created_at DESC"

    log "Executing query: ${query}"
    log "Parameters: ${params[*]}"

    if [[ "${JSON_OUTPUT}" == "true" ]]; then
        local json_output='{"workflows": ['
        local first=true
        
        while IFS='|' read -r id title pattern description created_at; do
            if [[ "${first}" == "true" ]]; then
                first=false
            else
                json_output+=','
            fi
            json_output+=$(cat << EOF
{
    "id": ${id},
    "title": "${title}",
    "pattern": "${pattern}",
    "description": "${description}",
    "created_at": "${created_at}"
}
EOF
)
        done < <(sqlite3 "${WORKFLOW_DB}" "${query}" "${params[@]}")
        
        json_output+=']}'
        echo "${json_output}"
    else
        printf "%-5s %-30s %-20s %-50s %-20s\n" "ID" "TITLE" "PATTERN" "DESCRIPTION" "CREATED_AT"
        printf "%-5s %-30s %-20s %-50s %-20s\n" "---" "-----" "-------" "-----------" "-----------"
        sqlite3 "${WORKFLOW_DB}" "${query}" "${params[@]}" | while IFS='|' read -r id title pattern description created_at; do
            printf "%-5s %-30s %-20s %-50s %-20s\n" "${id}" "${title}" "${pattern}" "${description}" "${created_at}"
        done
    fi
}

query_playbook() {
    local category=""
    local search=""
    local tags=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --category) category="$2"; shift 2 ;;
            --search) search="$2"; shift 2 ;;
            --tags) tags="$2"; shift 2 ;;
            --help)
                cat << EOF
Usage: ${SCRIPT_NAME} query-playbook [OPTIONS]

Search playbook entries.

OPTIONS:
    --category CATEGORY    Search by category
    --search SEARCH        Search in title and content
    --tags TAGS            Search by tags (comma-separated)
    -j, --json             Output in JSON format
    -v, --verbose          Enable verbose output
    -h, --help             Show this help message

EXAMPLES:
    ${SCRIPT_NAME} query-playbook --category "security"
    ${SCRIPT_NAME} query-playbook --search "IAM role"
    ${SCRIPT_NAME} query-playbook --tags "security,iam"
EOF
                exit 0
                ;;
            *) error_exit "Unknown option: $1" ;;
        esac
    done

    validate_db_file "${PLAYBOOK_DB}" "Playbook"

    local query="SELECT id, title, category, tags, created_at FROM playbooks WHERE 1=1"
    local params=()

    if [[ -n "${category}" ]]; then
        query+=" AND category LIKE ?"
        params+=("%${category}%")
    fi

    if [[ -n "${search}" ]]; then
        query+=" AND (title LIKE ? OR content LIKE ?)"
        params+=("%${search}%" "%${search}%")
    fi

    if [[ -n "${tags}" ]]; then
        IFS=',' read -ra tag_array <<< "${tags}"
        for tag in "${tag_array[@]}"; do
            query+=" AND tags LIKE ?"
            params+=("%${tag# }%")
        done
    fi

    query+=" ORDER BY created_at DESC"

    log "Executing query: ${query}"
    log "Parameters: ${params[*]}"

    if [[ "${JSON_OUTPUT}" == "true" ]]; then
        local json_output='{"playbooks": ['
        local first=true
        
        while IFS='|' read -r id title category tags created_at; do
            if [[ "${first}" == "true" ]]; then
                first=false
            else
                json_output+=','
            fi
            json_output+=$(cat << EOF
{
    "id": ${id},
    "title": "${title}",
    "category": "${category}",
    "tags": "${tags}",
    "created_at": "${created_at}"
}
EOF
)
        done < <(sqlite3 "${PLAYBOOK_DB}" "${query}" "${params[@]}")
        
        json_output+=']}'
        echo "${json_output}"
    else
        printf "%-5s %-30s %-20s %-30s %-20s\n" "ID" "TITLE" "CATEGORY" "TAGS" "CREATED_AT"
        printf "%-5s %-30s %-20s %-30s %-20s\n" "---" "-----" "--------" "----" "-----------"
        sqlite3 "${PLAYBOOK_DB}" "${query}" "${params[@]}" | while IFS='|' read -r id title category tags created_at; do
            printf "%-5s %-30s %-20s %-30s %-20s\n" "${id}" "${title}" "${category}" "${tags}" "${created_at}"
        done
    fi
}

store_learning() {
    local type=""
    local title=""
    local content=""
    local tags=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type) type="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --content) content="$2"; shift 2 ;;
            --tags) tags="$2"; shift 2 ;;
            --help)
                cat << EOF
Usage: ${SCRIPT_NAME} store-learning [OPTIONS]

Store new learnings to appropriate database.

OPTIONS:
    --type TYPE          Type of learning (workflow|playbook)
    --title TITLE        Title of the learning
    --content CONTENT    Content/description
    --tags TAGS          Comma-separated tags
    -j, --json           Output in JSON format
    -v, --verbose        Enable verbose output
    -h, --help           Show this help message

EXAMPLES:
    ${SCRIPT_NAME} store-learning --type "workflow" --title "New Pattern" --content "Description here"
    ${SCRIPT_NAME} store-learning --type "playbook" --title "Security Guide" --content "Steps here" --tags "security,iam"
EOF
                exit 0
                ;;
            *) error_exit "Unknown option: $1" ;;
        esac
    done

    if [[ -z "${type}" ]]; then
        error_exit "--type is required"
    fi

    if [[ "${type}" != "workflow" && "${type}" != "playbook" ]]; then
        error_exit "Type must be 'workflow' or 'playbook'"
    fi

    if [[ -z "${title}" ]]; then
        error_exit "--title is required"
    fi

    if [[ -z "${content}" ]]; then
        error_exit "--content is required"
    fi

    validate_db_file "${LEARNINGS_DB}" "Learnings"

    log "Storing learning: type=${type}, title=${title}, tags=${tags}"

    # Use execute_insert from bootstrap utilities
    local result
    result=$(execute_insert "${LEARNINGS_DB}" \
        "learnings" \
        "type, title, content, tags" \
        "${type}" "${title}" "${content}" "${tags}")

    if [[ "${JSON_OUTPUT}" == "true" ]]; then
        echo '{"status": "success", "message": "Learning stored successfully"}'
    else
        echo "Learning stored successfully"
    fi
}

main() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -j|--json) JSON_OUTPUT=true; shift ;;
            -v|--verbose) VERBOSE=true; shift ;;
            -h|--help) usage; exit 0 ;;
            *) break ;;
        esac
    done

    if [[ $# -eq 0 ]]; then
        usage
        error_exit "No subcommand provided"
    fi

    local subcommand="$1"
    shift

    case "${subcommand}" in
        init) init_databases "$@" ;;
        query-workflow) query_workflow "$@" ;;
        query-playbook) query_playbook "$@" ;;
        store-learning) store_learning "$@" ;;
        *) error_exit "Unknown subcommand: ${subcommand}" ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi