#!/bin/bash
# planning/seo/scripts/sync-patterns.sh
# Phase 4 Sprint 2 :: Pattern Sync CLI Script
#
# Purpose: Bidirectional pattern synchronization between global and local stores
# Features: pull, push, bidirectional sync with incremental/full modes
# Security: Input validation, injection prevention, authorization checks

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LIB_DIR="$PROJECT_ROOT/planning/seo/lib"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_LOCAL_STORE="${REDIS_LOCAL_STORE:-pattern:local}"
REDIS_GLOBAL_STORE="${REDIS_GLOBAL_STORE:-pattern:global}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

show_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Bidirectional pattern synchronization between global and local stores

OPTIONS:
    --direction <pull|push|both>    Sync direction (required)
    --mode <incremental|full>       Sync mode (required)
    --project <project-id>          Project ID for local store (required)
    --pattern-types <types>         Comma-separated pattern types (optional)
    --last-sync <timestamp>         Last sync timestamp for incremental mode (optional)
    --force                         Force operations (overwrite/promotion) (optional)
    --authorized-by <identity>      Authorization identity for force operations (optional)
    --dry-run                       Show what would be synced without executing (optional)
    --verbose                       Enable verbose logging (optional)
    -h, --help                      Show this help message

EXAMPLES:
    # Pull patterns from global to local (incremental)
    $0 --direction pull --mode incremental --project myproject

    # Push patterns from local to global (full)
    $0 --direction push --mode full --project myproject

    # Bidirectional sync with pattern type filter
    $0 --direction both --mode full --project myproject --pattern-types title-tags,schema-markup

    # Force push with authorization
    $0 --direction push --mode full --project myproject --force --authorized-by admin@example.com

    # Dry run to see what would be synced
    $0 --direction both --mode full --project myproject --dry-run

ENVIRONMENT VARIABLES:
    REDIS_HOST              Redis host (default: localhost)
    REDIS_PORT              Redis port (default: 6379)
    REDIS_LOCAL_STORE       Local pattern store prefix (default: pattern:local)
    REDIS_GLOBAL_STORE      Global pattern store prefix (default: pattern:global)

EOF
}

validate_direction() {
    local direction="$1"
    if [[ ! "$direction" =~ ^(pull|push|both)$ ]]; then
        log_error "Invalid direction: $direction (must be pull, push, or both)"
        return 1
    fi
}

validate_mode() {
    local mode="$1"
    if [[ ! "$mode" =~ ^(incremental|full)$ ]]; then
        log_error "Invalid mode: $mode (must be incremental or full)"
        return 1
    fi
}

validate_project_id() {
    local project_id="$1"
    if [[ ! "$project_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid project ID format: $project_id (must be alphanumeric with hyphens/underscores)"
        return 1
    fi
}

check_redis_connection() {
    if ! command -v redis-cli &>/dev/null; then
        log_error "redis-cli not found in PATH"
        return 1
    fi

    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING &>/dev/null; then
        log_error "Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
        return 1
    fi

    log_info "Redis connection: OK ($REDIS_HOST:$REDIS_PORT)"
}

check_node_dependencies() {
    if ! command -v node &>/dev/null; then
        log_error "Node.js not found in PATH"
        return 1
    fi

    if [[ ! -f "$LIB_DIR/pattern-sync.ts" ]]; then
        log_error "Pattern sync library not found: $LIB_DIR/pattern-sync.ts"
        return 1
    fi

    log_info "Node.js version: $(node --version)"
}

# ============================================================================
# MAIN SYNC FUNCTION
# ============================================================================

execute_sync() {
    local direction="$1"
    local mode="$2"
    local project_id="$3"
    local pattern_types="${4:-}"
    local last_sync="${5:-}"
    local force="${6:-false}"
    local authorized_by="${7:-}"
    local dry_run="${8:-false}"
    local verbose="${9:-false}"

    log_info "Starting pattern sync..."
    log_info "Direction: $direction"
    log_info "Mode: $mode"
    log_info "Project: $project_id"
    [[ -n "$pattern_types" ]] && log_info "Pattern types: $pattern_types"
    [[ -n "$last_sync" ]] && log_info "Last sync: $last_sync"
    [[ "$force" == "true" ]] && log_warning "Force mode enabled"
    [[ "$dry_run" == "true" ]] && log_warning "DRY RUN - No changes will be made"

    if [[ "$dry_run" == "true" ]]; then
        # Dry run: query patterns without syncing
        case "$direction" in
            pull)
                local global_count
                global_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "$REDIS_GLOBAL_STORE:*" | wc -l)
                log_info "Would pull $global_count patterns from global store"
                ;;
            push)
                local local_count
                local_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "$REDIS_LOCAL_STORE:*" | wc -l)
                log_info "Would push $local_count patterns to global store"
                ;;
            both)
                local global_count local_count
                global_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "$REDIS_GLOBAL_STORE:*" | wc -l)
                local_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" KEYS "$REDIS_LOCAL_STORE:*" | wc -l)
                log_info "Would sync $local_count local patterns and $global_count global patterns"
                ;;
        esac
        log_success "Dry run complete"
        return 0
    fi

    # Create secure temporary Node.js script using heredoc
    local temp_script
    temp_script=$(mktemp /tmp/sync-patterns-XXXXXX.js)
    trap "rm -f '$temp_script'" RETURN

    # Write script securely with no variable interpolation risks
    cat > "$temp_script" <<'EOF_SCRIPT'
const { syncPatterns, pullPatternsFromGlobal, pushPatternsToGlobal } = require(process.env.LIB_DIR + '/pattern-sync.ts');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10),
});

const options = {
  projectId: process.env.PROJECT_ID,
  direction: process.env.DIRECTION,
  mode: process.env.MODE,
  patternTypes: process.env.PATTERN_TYPES ? process.env.PATTERN_TYPES.split(',') : undefined,
  lastSyncTimestamp: process.env.LAST_SYNC ? parseInt(process.env.LAST_SYNC, 10) : undefined,
  force: process.env.FORCE === 'true',
  authorizedBy: process.env.AUTHORIZED_BY || undefined,
  verbose: process.env.VERBOSE === 'true',
};

async function main() {
  try {
    let result;
    if (options.direction === 'pull') {
      result = await pullPatternsFromGlobal({
        projectId: options.projectId,
        patternTypes: options.patternTypes,
        incremental: options.mode === 'incremental',
        lastSyncTimestamp: options.lastSyncTimestamp,
        forceOverwrite: options.force,
        verbose: options.verbose,
      }, redis, process.env.REDIS_LOCAL_STORE, process.env.REDIS_GLOBAL_STORE);
    } else if (options.direction === 'push') {
      result = await pushPatternsToGlobal({
        projectId: options.projectId,
        patternTypes: options.patternTypes,
        forcePromotion: options.force,
        authorizedBy: options.authorizedBy,
        verbose: options.verbose,
      }, redis, process.env.REDIS_LOCAL_STORE, process.env.REDIS_GLOBAL_STORE);
    } else {
      result = await syncPatterns(options, redis, process.env.REDIS_LOCAL_STORE, process.env.REDIS_GLOBAL_STORE);
    }

    console.log(JSON.stringify(result, null, 2));
    await redis.quit();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Sync failed:', error.message);
    await redis.quit();
    process.exit(1);
  }
}

main();
EOF_SCRIPT

    # Execute with environment variables (no injection risk)
    local result
    if result=$(LIB_DIR="$LIB_DIR" \
                REDIS_HOST="$REDIS_HOST" \
                REDIS_PORT="$REDIS_PORT" \
                PROJECT_ID="$project_id" \
                DIRECTION="$direction" \
                MODE="$mode" \
                PATTERN_TYPES="$pattern_types" \
                LAST_SYNC="$last_sync" \
                FORCE="$force" \
                AUTHORIZED_BY="$authorized_by" \
                VERBOSE="$verbose" \
                REDIS_LOCAL_STORE="$REDIS_LOCAL_STORE" \
                REDIS_GLOBAL_STORE="$REDIS_GLOBAL_STORE" \
                node "$temp_script" 2>&1); then
        # Parse result
        local patterns_synced conflicts_resolved duration_ms
        patterns_synced=$(echo "$result" | jq -r '.patternsSynced // 0')
        conflicts_resolved=$(echo "$result" | jq -r '.conflictsResolved // 0')
        duration_ms=$(echo "$result" | jq -r '.durationMs // 0')

        log_success "Sync complete"
        log_info "Patterns synced: $patterns_synced"
        [[ "$conflicts_resolved" -gt 0 ]] && log_info "Conflicts resolved: $conflicts_resolved"
        log_info "Duration: ${duration_ms}ms"

        # Show metrics breakdown
        if [[ "$verbose" == "true" ]]; then
            echo "$result" | jq '.metrics'
        fi

        return 0
    else
        log_error "Sync failed: $result"
        return 1
    fi
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

DIRECTION=""
MODE=""
PROJECT_ID=""
PATTERN_TYPES=""
LAST_SYNC=""
FORCE="false"
AUTHORIZED_BY=""
DRY_RUN="false"
VERBOSE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --direction)
            DIRECTION="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --project)
            PROJECT_ID="$2"
            shift 2
            ;;
        --pattern-types)
            PATTERN_TYPES="$2"
            shift 2
            ;;
        --last-sync)
            LAST_SYNC="$2"
            shift 2
            ;;
        --force)
            FORCE="true"
            shift
            ;;
        --authorized-by)
            AUTHORIZED_BY="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --verbose)
            VERBOSE="true"
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# ============================================================================
# VALIDATION
# ============================================================================

# Required parameters
if [[ -z "$DIRECTION" ]]; then
    log_error "Missing required parameter: --direction"
    show_usage
    exit 1
fi

if [[ -z "$MODE" ]]; then
    log_error "Missing required parameter: --mode"
    show_usage
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    log_error "Missing required parameter: --project"
    show_usage
    exit 1
fi

# Validate parameters
validate_direction "$DIRECTION" || exit 1
validate_mode "$MODE" || exit 1
validate_project_id "$PROJECT_ID" || exit 1

# Validate last_sync timestamp if provided (Fix #6 - CVSS 7.5)
if [[ -n "$LAST_SYNC" ]]; then
    if ! [[ "$LAST_SYNC" =~ ^[0-9]+$ ]]; then
        log_error "--last-sync must be a positive integer (Unix timestamp)"
        exit 1
    fi

    if [[ "$LAST_SYNC" -lt 0 ]] || [[ "$LAST_SYNC" -gt $(date +%s) ]]; then
        log_error "--last-sync timestamp out of valid range (must be between 0 and current time)"
        exit 1
    fi
fi

# Force operations require authorization
if [[ "$FORCE" == "true" && "$DIRECTION" != "pull" && -z "$AUTHORIZED_BY" ]]; then
    log_error "Force push/both requires --authorized-by parameter"
    exit 1
fi

# Check dependencies
check_redis_connection || exit 1
[[ "$DRY_RUN" != "true" ]] && check_node_dependencies || exit 1

# ============================================================================
# EXECUTE SYNC
# ============================================================================

execute_sync "$DIRECTION" "$MODE" "$PROJECT_ID" "$PATTERN_TYPES" "$LAST_SYNC" "$FORCE" "$AUTHORIZED_BY" "$DRY_RUN" "$VERBOSE"
