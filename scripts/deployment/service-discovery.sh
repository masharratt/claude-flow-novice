#!/usr/bin/env bash
# Service Discovery Utility
# Implements convention-based and environment-driven service discovery
# Part of: DEPLOYMENT_PIPELINE_STANDARDS.md

set -euo pipefail

# Default values
DEFAULT_SKILLS_PATH="./.claude/skills"
DEFAULT_CONFIG_PATH="./config"
DEFAULT_REDIS_HOST="localhost"
DEFAULT_REDIS_PORT=6379

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# Layer 1: Environment-Based Discovery
# ============================================================================

discover_redis_service() {
    local REDIS_HOST="${CFN_REDIS_HOST:-${DEFAULT_REDIS_HOST}}"
    local REDIS_PORT="${CFN_REDIS_PORT:-${DEFAULT_REDIS_PORT}}"

    echo "[DISCOVER] Redis service: $REDIS_HOST:$REDIS_PORT"

    # Validate connectivity
    if timeout 5 bash -c "echo >/dev/tcp/$REDIS_HOST/$REDIS_PORT" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Redis service is reachable"
        export REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"
        return 0
    else
        echo -e "${RED}✗${NC} Redis service not reachable at $REDIS_HOST:$REDIS_PORT" >&2
        return 1
    fi
}

discover_api_service() {
    local API_HOST="${CFN_API_HOST:-0.0.0.0}"
    local API_PORT="${CFN_API_PORT:-9000}"

    echo "[DISCOVER] API service: $API_HOST:$API_PORT"

    # Check if port is listening
    if timeout 5 bash -c "echo >/dev/tcp/$API_HOST/$API_PORT" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} API service is reachable"
        export API_URL="http://${API_HOST}:${API_PORT}"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} API service may not be ready (binding to $API_HOST:$API_PORT)" >&2
        export API_URL="http://${API_HOST}:${API_PORT}"
        return 0
    fi
}

discover_all_environment_services() {
    echo "[DISCOVER] Discovering services from environment variables"

    local FAILED=0

    discover_redis_service || ((FAILED++))
    discover_api_service || ((FAILED++))

    if [[ $FAILED -gt 0 ]]; then
        echo -e "${YELLOW}⚠ ${FAILED} service(s) not immediately available${NC}"
        echo "   Services may be starting up - will retry on demand"
        return 1
    fi

    echo -e "${GREEN}✓ All environment services discovered${NC}"
    return 0
}

# ============================================================================
# Layer 2: Convention-Based Discovery (Configuration Paths)
# ============================================================================

resolve_config_path() {
    local CONFIG_NAME="$1"
    local SEARCH_PATHS=(
        "${CFN_CONFIG_PATH:-${DEFAULT_CONFIG_PATH}}/${CONFIG_NAME}"
        "./config/${CONFIG_NAME}"
        "./.claude/cfn-config/${CONFIG_NAME}"
        "/etc/cfn/${CONFIG_NAME}"
    )

    for PATH in "${SEARCH_PATHS[@]}"; do
        if [[ -f "$PATH" ]]; then
            echo "$PATH"
            return 0
        fi
    done

    echo "ERROR: Config not found: $CONFIG_NAME" >&2
    return 1
}

resolve_skills_dir() {
    local SKILLS_DIR="${CFN_SKILLS_PATH:-${DEFAULT_SKILLS_PATH}}"

    if [[ ! -d "$SKILLS_DIR" ]]; then
        echo "ERROR: Skills directory not found: $SKILLS_DIR" >&2
        return 1
    fi

    echo "$SKILLS_DIR"
}

discover_skill_by_name() {
    local SKILL_NAME="$1"
    local SKILLS_ROOT=$(resolve_skills_dir) || return 1
    local SKILL_PATH="${SKILLS_ROOT}/${SKILL_NAME}"

    if [[ ! -d "$SKILL_PATH" ]]; then
        echo "ERROR: Skill not found: $SKILL_NAME (searched: $SKILL_PATH)" >&2
        return 1
    fi

    echo "$SKILL_PATH"
}

# ============================================================================
# Layer 3: Dynamic Service Registry (Redis)
# ============================================================================

register_service_in_registry() {
    local SERVICE_TYPE="$1"      # e.g., "agent", "coordinator"
    local SERVICE_ID="$2"         # e.g., "agent-12345-abc"
    local SERVICE_ENDPOINT="$3"   # e.g., "http://localhost:9000"
    local TTL="${4:-300}"         # 5-minute TTL by default

    echo "[REGISTRY] Registering service: $SERVICE_TYPE/$SERVICE_ID"

    if ! command -v redis-cli &>/dev/null; then
        echo "WARN: redis-cli not available, skipping registration" >&2
        return 0
    fi

    # Register endpoint
    redis-cli SET "service:${SERVICE_TYPE}:${SERVICE_ID}" "${SERVICE_ENDPOINT}" EX "$TTL"

    # Add to discovery set
    redis-cli SADD "services:${SERVICE_TYPE}" "${SERVICE_ID}"

    echo -e "${GREEN}✓${NC} Service registered: $SERVICE_TYPE/$SERVICE_ID → $SERVICE_ENDPOINT"
    return 0
}

discover_active_services() {
    local SERVICE_TYPE="$1"  # e.g., "agent"

    if ! command -v redis-cli &>/dev/null; then
        echo "WARN: redis-cli not available" >&2
        return 1
    fi

    echo "[REGISTRY] Discovering active services of type: $SERVICE_TYPE"

    local SERVICES
    SERVICES=$(redis-cli SMEMBERS "services:${SERVICE_TYPE}" 2>/dev/null) || {
        echo "ERROR: Failed to discover services from Redis" >&2
        return 1
    }

    if [[ -z "$SERVICES" ]]; then
        echo "No active services of type: $SERVICE_TYPE"
        return 1
    fi

    echo "$SERVICES"
    return 0
}

get_service_endpoint() {
    local SERVICE_TYPE="$1"
    local SERVICE_ID="$2"

    if ! command -v redis-cli &>/dev/null; then
        echo "ERROR: redis-cli not available" >&2
        return 1
    fi

    redis-cli GET "service:${SERVICE_TYPE}:${SERVICE_ID}"
}

# ============================================================================
# Database Connection Discovery
# ============================================================================

discover_skills_db() {
    local DB_PATH="${CFN_SKILLS_DB_PATH:-./config/skills.db}"

    echo "[DB] Discovering skills database: $DB_PATH"

    if [[ ! -f "$DB_PATH" ]]; then
        echo "ERROR: Skills database not found: $DB_PATH" >&2
        return 1
    fi

    # Verify database is accessible
    if ! sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master;" > /dev/null 2>&1; then
        echo "ERROR: Skills database is corrupted or inaccessible: $DB_PATH" >&2
        return 1
    fi

    echo -e "${GREEN}✓${NC} Skills database discovered and accessible"
    export SKILLS_DB_PATH="$DB_PATH"
    return 0
}

# ============================================================================
# Skill Discovery
# ============================================================================

list_available_skills() {
    local SKILLS_ROOT=$(resolve_skills_dir) || return 1

    echo "[SKILLS] Available skills:"
    echo ""

    local SKILL_COUNT=0
    while IFS= read -r SKILL_DIR; do
        local SKILL_NAME=$(basename "$SKILL_DIR")
        local SKILL_VERSION="unknown"
        local SKILL_STATUS="unverified"

        # Try to read version from SKILL.md
        if [[ -f "${SKILL_DIR}/SKILL.md" ]]; then
            SKILL_STATUS="verified"
            SKILL_VERSION=$(grep "^**Version:" "${SKILL_DIR}/SKILL.md" | cut -d: -f2 | xargs || echo "unknown")
        fi

        printf "  %s%-30s%s  version: %-10s  status: %s\n" \
            "${GREEN}" "$SKILL_NAME" "${NC}" "$SKILL_VERSION" "$SKILL_STATUS"

        ((SKILL_COUNT++))
    done < <(find "$SKILLS_ROOT" -maxdepth 1 -type d -name "cfn-*" | sort)

    echo ""
    echo "Total skills found: $SKILL_COUNT"
    return 0
}

load_skill_metadata() {
    local SKILL_NAME="$1"
    local SKILL_PATH=$(discover_skill_by_name "$SKILL_NAME") || return 1

    echo "[SKILL] Loading metadata for: $SKILL_NAME"

    # Look for metadata in order of precedence
    local METADATA_FILE=""

    if [[ -f "${SKILL_PATH}/config.json" ]]; then
        METADATA_FILE="${SKILL_PATH}/config.json"
    elif [[ -f "${SKILL_PATH}/.metadata.json" ]]; then
        METADATA_FILE="${SKILL_PATH}/.metadata.json"
    elif [[ -f "${SKILL_PATH}/SKILL.md" ]]; then
        METADATA_FILE="${SKILL_PATH}/SKILL.md"
    else
        echo "WARN: No metadata found for skill: $SKILL_NAME" >&2
        return 1
    fi

    cat "$METADATA_FILE"
    return 0
}

# ============================================================================
# Endpoint Discovery
# ============================================================================

register_api_endpoint() {
    local ENDPOINT_NAME="$1"      # e.g., "skill_deployment"
    local ENDPOINT_PATH="$2"      # e.g., "/api/v1/skills/deploy"
    local METHOD="$3"             # e.g., "POST"
    local VERSION="${4:-v1}"      # default v1

    if ! command -v redis-cli &>/dev/null; then
        echo "WARN: redis-cli not available, skipping endpoint registration" >&2
        return 0
    fi

    local KEY="api:endpoint:${VERSION}:${ENDPOINT_NAME}"
    redis-cli SET "$KEY" "${ENDPOINT_PATH}:${METHOD}"
    redis-cli SET "api:path:${ENDPOINT_PATH}" "${ENDPOINT_NAME}"

    echo "[API] Registered endpoint: $ENDPOINT_NAME → $ENDPOINT_PATH ($METHOD)"
    return 0
}

discover_api_endpoint() {
    local ENDPOINT_NAME="$1"
    local VERSION="${2:-v1}"

    if ! command -v redis-cli &>/dev/null; then
        echo "ERROR: redis-cli not available" >&2
        return 1
    fi

    redis-cli GET "api:endpoint:${VERSION}:${ENDPOINT_NAME}"
}

list_api_endpoints() {
    local VERSION="${1:-v1}"

    if ! command -v redis-cli &>/dev/null; then
        echo "ERROR: redis-cli not available" >&2
        return 1
    fi

    echo "[API] Available endpoints (version: $VERSION):"
    redis-cli KEYS "api:endpoint:${VERSION}:*" | sed "s/api:endpoint:${VERSION}://"
}

# ============================================================================
# Discovery Report
# ============================================================================

generate_discovery_report() {
    echo ""
    echo "======================================================================"
    echo "SERVICE DISCOVERY REPORT"
    echo "======================================================================"
    echo ""

    # Environment Variables
    echo "ENVIRONMENT VARIABLES:"
    echo "  CFN_REDIS_HOST:        ${CFN_REDIS_HOST:-not set (default: localhost)}"
    echo "  CFN_REDIS_PORT:        ${CFN_REDIS_PORT:-not set (default: 6379)}"
    echo "  CFN_API_HOST:          ${CFN_API_HOST:-not set (default: 0.0.0.0)}"
    echo "  CFN_API_PORT:          ${CFN_API_PORT:-not set (default: 9000)}"
    echo "  CFN_CONFIG_PATH:       ${CFN_CONFIG_PATH:-not set (default: ./config)}"
    echo "  CFN_SKILLS_PATH:       ${CFN_SKILLS_PATH:-not set (default: ./.claude/skills)}"
    echo ""

    # Service Status
    echo "SERVICE DISCOVERY STATUS:"
    if discover_redis_service 2>/dev/null; then
        echo "  Redis:                 ${GREEN}✓ Available${NC}"
    else
        echo "  Redis:                 ${RED}✗ Not available${NC}"
    fi

    if discover_api_service 2>/dev/null; then
        echo "  API:                   ${GREEN}✓ Available${NC}"
    else
        echo "  API:                   ${YELLOW}⚠ May not be ready${NC}"
    fi

    if discover_skills_db 2>/dev/null; then
        echo "  Skills Database:       ${GREEN}✓ Available${NC}"
    else
        echo "  Skills Database:       ${RED}✗ Not available${NC}"
    fi
    echo ""

    # Paths
    echo "CONFIGURATION PATHS:"
    if SKILLS_DIR=$(resolve_skills_dir 2>/dev/null); then
        echo "  Skills Directory:      $SKILLS_DIR"
    else
        echo "  Skills Directory:      ${RED}✗ Not found${NC}"
    fi

    if CONFIG_PATH=$(resolve_config_path "redis.config.js" 2>/dev/null); then
        echo "  Redis Config:          $CONFIG_PATH"
    else
        echo "  Redis Config:          ${YELLOW}⚠ Not found${NC}"
    fi
    echo ""

    # Skills
    echo "INSTALLED SKILLS:"
    list_available_skills 2>/dev/null | tail -1
    echo ""

    echo "======================================================================"
}

# ============================================================================
# Main CLI
# ============================================================================

usage() {
    cat << 'EOF'
Service Discovery Utility

Usage: service-discovery.sh <command> [options]

Commands:
  discover-all              Discover all services from environment
  discover-redis            Discover Redis service
  discover-api              Discover API service
  discover-db               Discover Skills database

  resolve-config <name>     Resolve configuration file path
  resolve-skills-dir        Resolve skills directory
  discover-skill <name>     Discover specific skill
  load-skill-metadata <name> Load skill metadata

  list-skills               List all available skills
  list-endpoints [version]  List API endpoints

  register-service <type> <id> <endpoint> [ttl]  Register service
  discover-services <type>  Discover active services
  get-endpoint <type> <id>  Get service endpoint

  report                    Generate discovery report

  help                      Show this help message

Examples:
  service-discovery.sh discover-all
  service-discovery.sh discover-skill cfn-coordination
  service-discovery.sh list-skills
  service-discovery.sh report
  service-discovery.sh register-service agent agent-123 http://localhost:9001
  service-discovery.sh discover-services agent

EOF
}

# Parse command
COMMAND="${1:-help}"

case "$COMMAND" in
    discover-all)
        discover_all_environment_services
        ;;
    discover-redis)
        discover_redis_service
        ;;
    discover-api)
        discover_api_service
        ;;
    discover-db)
        discover_skills_db
        ;;
    resolve-config)
        resolve_config_path "$2"
        ;;
    resolve-skills-dir)
        resolve_skills_dir
        ;;
    discover-skill)
        discover_skill_by_name "$2"
        ;;
    load-skill-metadata)
        load_skill_metadata "$2"
        ;;
    list-skills)
        list_available_skills
        ;;
    list-endpoints)
        list_api_endpoints "${2:-v1}"
        ;;
    register-service)
        register_service_in_registry "$2" "$3" "$4" "${5:-300}"
        ;;
    discover-services)
        discover_active_services "$2"
        ;;
    get-endpoint)
        get_service_endpoint "$2" "$3"
        ;;
    report)
        generate_discovery_report
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo "Unknown command: $COMMAND" >&2
        usage
        exit 1
        ;;
esac

exit $?
