#!/bin/bash

# SQLite TTL Cleanup Script
# Automated cleanup of expired memory entries based on ACL levels
# Supports Redis+SQLite integration with configurable retention policies

set -e  # Exit on error

# Configuration
DB_PATH="${DB_PATH:-./swarm-memory.db}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
LOG_FILE="${LOG_FILE:-./logs/ttl-cleanup.log}"
DRY_RUN="${DRY_RUN:-false}"

# Create logs directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    error_exit "Database file not found: $DB_PATH"
fi

# Check if Redis is available
check_redis() {
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
        log "WARNING: Redis not available at $REDIS_HOST:$REDIS_PORT"
        return 1
    fi
    return 0
}

# Get database statistics
get_db_stats() {
    sqlite3 "$DB_PATH" <<EOF
-- Get memory counts by ACL level
SELECT 
    'ACL_Level_' || acl_level as acl_level,
    COUNT(*) as total_count,
    SUM(CASE WHEN expires_at > datetime('now') THEN 1 ELSE 0 END) as active_count,
    SUM(CASE WHEN expires_at <= datetime('now') THEN 1 ELSE 0 END) as expired_count
FROM memory_store
GROUP BY acl_level;

-- Get total database size
SELECT 
    'Database_Size' as metric,
    COUNT(*) as total_records,
    SUM(LENGTH(value)) as total_bytes
FROM memory_store;
EOF
}

# Cleanup expired entries by ACL level
cleanup_acl_level() {
    local acl_level=$1
    local retention_days=$2
    
    log "Cleaning up ACL Level $acl_level entries older than $retention_days days..."
    
    # SQLite cleanup query
    local cleanup_sql="
    DELETE FROM memory_store 
    WHERE acl_level = $acl_level 
    AND expires_at <= datetime('now', '-$retention_days days')
    AND acl_level != 5; -- Skip system audit logs (level 5)
    "
    
    if [ "$DRY_RUN" = "true" ]; then
        # Count what would be deleted
        local count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM memory_store WHERE acl_level = $acl_level AND expires_at <= datetime('now', '-$retention_days days') AND acl_level != 5;")
        log "[DRY RUN] Would delete $count entries from ACL Level $acl_level"
        return 0
    fi
    
    # Execute cleanup
    local deleted_count=$(sqlite3 "$DB_PATH" "$cleanup_sql")
    log "Deleted $deleted_count entries from ACL Level $acl_level"
    
    # Sync with Redis if available
    if check_redis; then
        sync_redis_cleanup "$acl_level"
    fi
}

# Sync Redis cleanup with SQLite
sync_redis_cleanup() {
    local acl_level=$1
    
    log "Syncing Redis cleanup for ACL Level $acl_level..."
    
    # Get keys that should be removed from Redis
    local redis_keys=$(sqlite3 "$DB_PATH" "
    SELECT key FROM memory_store 
    WHERE acl_level = $acl_level 
    AND expires_at <= datetime('now')
    ")
    
    # Remove from Redis
    while IFS= read -r key; do
        if [ -n "$key" ]; then
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$key" > /dev/null 2>&1 || true
        fi
    done <<< "$redis_keys"
    
    log "Redis sync completed for ACL Level $acl_level"
}

# Cleanup Redis TTL entries
cleanup_redis_ttl() {
    log "Cleaning up Redis TTL entries..."
    
    if [ "$DRY_RUN" = "true" ]; then
        local redis_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE)
        log "[DRY RUN] Redis has $redis_count keys, would clean expired ones"
        return 0
    fi
    
    # Redis doesn't have automatic TTL cleanup in the same way, but we can
    # check and clean keys that should have expired
    local redis_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "memory:*")
    
    while IFS= read -r key; do
        if [ -n "$key" ]; then
            local ttl=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" TTL "$key")
            if [ "$ttl" -eq -2 ]; then
                # Key doesn't exist in Redis but exists in SQLite (stale)
                redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$key" > /dev/null 2>&1 || true
            elif [ "$ttl" -eq -1 ]; then
                # Key has no TTL, check if it should have one based on ACL level
                local acl_level=$(sqlite3 "$DB_PATH" "SELECT acl_level FROM memory_store WHERE key = '$key' LIMIT 1")
                if [ -n "$acl_level" ] && [ "$acl_level" -le 4 ]; then
                    # Should have TTL, remove it
                    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "$key" > /dev/null 2>&1 || true
                fi
            fi
        fi
    done <<< "$redis_keys"
    
    log "Redis TTL cleanup completed"
}

# Optimize database
optimize_database() {
    log "Optimizing SQLite database..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log "[DRY RUN] Would optimize database (VACUUM and ANALYZE)"
        return 0
    fi
    
    sqlite3 "$DB_PATH" "VACUUM;"
    sqlite3 "$DB_PATH" "ANALYZE;"
    
    log "Database optimization completed"
}

# Generate cleanup report
generate_report() {
    log "Generating cleanup report..."
    
    local report_file="logs/cleanup-report-$(date '+%Y%m%d-%H%M%S').txt"
    
    {
        echo "SQLite TTL Cleanup Report"
        echo "========================"
        echo "Generated: $(date)"
        echo "Database: $DB_PATH"
        echo "Redis: $REDIS_HOST:$REDIS_PORT"
        echo "Dry Run: $DRY_RUN"
        echo ""
        
        echo "Database Statistics:"
        get_db_stats
        
        echo ""
        echo "Cleanup Summary:"
        echo "================"
        echo "ACL Level 1 (Agent): Cleaned entries older than 1 day"
        echo "ACL Level 2 (Team): Cleaned entries older than 7 days"
        echo "ACL Level 3 (Swarm): Cleaned entries older than 2 days"
        echo "ACL Level 4 (Project): Cleaned entries older than 30 days"
        echo "ACL Level 5 (System): Never cleaned (permanent storage)"
        
    } > "$report_file"
    
    log "Cleanup report generated: $report_file"
}

# Main cleanup function
main() {
    log "Starting TTL cleanup process..."
    
    # Check prerequisites
    if [ ! -f "$DB_PATH" ]; then
        error_exit "Database file not found: $DB_PATH"
    fi
    
    # Show current stats
    log "Current database statistics:"
    get_db_stats
    
    # Cleanup by ACL level with different retention policies
    cleanup_acl_level 1 1   # Agent: 1 day retention
    cleanup_acl_level 2 7   # Team: 7 days retention  
    cleanup_acl_level 3 2   # Swarm: 2 days retention
    cleanup_acl_level 4 30  # Project: 30 days retention
    # Level 5 (System) is never cleaned
    
    # Cleanup Redis TTL entries
    cleanup_redis_ttl
    
    # Optimize database
    optimize_database
    
    # Generate report
    generate_report
    
    log "TTL cleanup process completed successfully"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --redis-host)
            REDIS_HOST="$2"
            shift 2
            ;;
        --redis-port)
            REDIS_PORT="$2"
            shift 2
            ;;
        --db-path)
            DB_PATH="$2"
            shift 2
            ;;
        --log-file)
            LOG_FILE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --dry-run            Show what would be deleted without actually deleting"
            echo "  --redis-host HOST    Redis host (default: localhost)"
            echo "  --redis-port PORT    Redis port (default: 6379)"
            echo "  --db-path PATH       SQLite database path (default: ./swarm-memory.db)"
            echo "  --log-file FILE      Log file path (default: ./logs/ttl-cleanup.log)"
            echo "  --help              Show this help message"
            exit 0
            ;;
        *)
            error_exit "Unknown option: $1"
            ;;
    esac
done

# Run main function
main "$@"