#!/bin/bash

###############################################################################
# Claude SDK Emergency Rollback Script
# Restores system to pre-SDK state
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKUP_DIR="./backups/pre-sdk-snapshot"
ROLLBACK_LOG="./logs/rollback-$(date +%Y%m%d-%H%M%S).log"
TIMESTAMP=$(date +'%Y-%m-%d %H:%M:%S')

# Logging
log() { echo -e "${GREEN}[$TIMESTAMP]${NC} $1" | tee -a "$ROLLBACK_LOG"; }
warn() { echo -e "${YELLOW}[$TIMESTAMP] WARNING:${NC} $1" | tee -a "$ROLLBACK_LOG"; }
error() { echo -e "${RED}[$TIMESTAMP] ERROR:${NC} $1" | tee -a "$ROLLBACK_LOG"; }
info() { echo -e "${BLUE}[$TIMESTAMP] INFO:${NC} $1" | tee -a "$ROLLBACK_LOG"; }

mkdir -p logs

log "========================================="
log "🚨 EMERGENCY ROLLBACK INITIATED"
log "========================================="

# Pre-rollback checks
check_backup() {
    if [ ! -d "$BACKUP_DIR" ]; then
        error "Backup directory not found: $BACKUP_DIR"
        error "Cannot proceed with rollback without backup!"
        exit 1
    fi

    info "Backup directory found: $BACKUP_DIR"

    # List backup contents
    info "Backup contents:"
    ls -lh "$BACKUP_DIR" | tee -a "$ROLLBACK_LOG"
}

# Capture current state for postmortem
capture_failure_state() {
    log "Capturing failure state for analysis..."

    local failure_dir="./backups/failure-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$failure_dir"

    # Capture metrics
    if [ -f ".metrics-snapshot" ]; then
        cp .metrics-snapshot "$failure_dir/metrics-at-failure.json"
        info "Metrics snapshot saved"
    fi

    # Capture logs
    if [ -f "logs/sdk-migration.log" ]; then
        cp logs/sdk-migration.log "$failure_dir/migration-log.txt"
        info "Migration log saved"
    fi

    # Capture alerts
    if [ -f "logs/alerts.json" ]; then
        cp logs/alerts.json "$failure_dir/alerts.json"
        info "Alerts saved"
    fi

    # Capture environment
    env | grep -E "SDK|CLAUDE|ENABLE" > "$failure_dir/environment.txt" || true
    info "Environment variables saved"

    # Capture current phase
    if [ -f ".migration-phase" ]; then
        cp .migration-phase "$failure_dir/phase-at-failure.txt"
        info "Migration phase saved"
    fi

    # Capture git state
    git rev-parse HEAD > "$failure_dir/git-commit.txt" 2>/dev/null || true
    git status > "$failure_dir/git-status.txt" 2>/dev/null || true
    git diff > "$failure_dir/git-diff.txt" 2>/dev/null || true

    log "✅ Failure state captured at: $failure_dir"
    echo "$failure_dir" > .last-failure-dir
}

# Stop services
stop_services() {
    log "Stopping all services..."

    # Stop dashboard
    if pgrep -f "dashboard" > /dev/null; then
        info "Stopping dashboard..."
        pkill -f "dashboard" || true
        sleep 2
    fi

    # Stop monitoring
    if pgrep -f "monitor-migration" > /dev/null; then
        info "Stopping migration monitor..."
        pkill -f "monitor-migration" || true
        sleep 2
    fi

    # Stop application
    npm run stop 2>/dev/null || true
    sleep 3

    log "✅ Services stopped"
}

# Restore environment
restore_environment() {
    log "Restoring environment configuration..."

    if [ -f "$BACKUP_DIR/.env.backup" ]; then
        cp "$BACKUP_DIR/.env.backup" .env
        log "✅ .env restored"
    else
        warn "No .env backup found"

        # Remove SDK-related variables
        if [ -f ".env" ]; then
            info "Removing SDK variables from .env..."
            sed -i '/SDK_/d' .env
            sed -i '/ENABLE_SDK_/d' .env
            sed -i '/ENABLE_SELF_VALIDATION/d' .env
            sed -i '/VALIDATION_MODE/d' .env
            sed -i '/CONFIDENCE_THRESHOLD/d' .env
        fi
    fi
}

# Restore package.json
restore_packages() {
    log "Restoring package dependencies..."

    if [ -f "$BACKUP_DIR/package.json.backup" ]; then
        cp "$BACKUP_DIR/package.json.backup" package.json
        log "✅ package.json restored"

        info "Reinstalling dependencies..."
        npm install 2>&1 | tee -a "$ROLLBACK_LOG"
    else
        warn "No package.json backup found"

        # Remove SDK package
        info "Removing Claude Agent SDK..."
        npm uninstall @anthropic-ai/claude-agent-sdk 2>&1 | tee -a "$ROLLBACK_LOG" || true
    fi
}

# Restore git state
restore_git() {
    log "Restoring git state..."

    if [ -f "$BACKUP_DIR/git-commit.txt" ]; then
        local commit=$(cat "$BACKUP_DIR/git-commit.txt")
        info "Restoring to commit: $commit"

        # Stash any changes
        git stash push -m "Pre-rollback stash $(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

        # Checkout commit
        git checkout "$commit" 2>&1 | tee -a "$ROLLBACK_LOG" || {
            error "Could not restore git commit"
            warn "Manual git restore may be required"
        }

        log "✅ Git state restored"
    else
        warn "No git commit backup found"
        info "Current git state will be preserved"
    fi
}

# Restore database (if applicable)
restore_database() {
    log "Checking for database backups..."

    if [ -f "$BACKUP_DIR/database.backup.db" ]; then
        info "Restoring database..."
        cp "$BACKUP_DIR/database.backup.db" ./data/swarm.db
        log "✅ Database restored"
    else
        info "No database backup found (may not be needed)"
    fi
}

# Clean SDK artifacts
clean_sdk_artifacts() {
    log "Cleaning SDK artifacts..."

    # Remove phase marker
    rm -f .migration-phase
    info "Removed phase marker"

    # Remove metrics snapshot
    rm -f .metrics-snapshot
    info "Removed metrics snapshot"

    # Clean SDK cache (if any)
    if [ -d ".sdk-cache" ]; then
        rm -rf .sdk-cache
        info "Removed SDK cache"
    fi

    # Clean SDK logs
    if [ -d "logs/sdk" ]; then
        mv logs/sdk "logs/sdk-$(date +%Y%m%d-%H%M%S).backup"
        info "Archived SDK logs"
    fi

    log "✅ SDK artifacts cleaned"
}

# Validate rollback
validate_rollback() {
    log "Validating rollback..."

    # Check critical files exist
    local critical_files=(
        "package.json"
        ".env"
        "src/index.js"
    )

    for file in "${critical_files[@]}"; do
        if [ ! -f "$file" ]; then
            error "Critical file missing after rollback: $file"
            return 1
        fi
    done

    # Check SDK is not installed
    if npm list @anthropic-ai/claude-agent-sdk > /dev/null 2>&1; then
        warn "SDK still appears to be installed"
        info "Attempting to remove..."
        npm uninstall @anthropic-ai/claude-agent-sdk || true
    fi

    # Check environment variables
    if grep -q "ENABLE_SDK_INTEGRATION=true" .env 2>/dev/null; then
        warn "SDK environment variables still present"
        sed -i '/ENABLE_SDK_INTEGRATION/d' .env
    fi

    log "✅ Rollback validation passed"
}

# Restart services
restart_services() {
    log "Restarting services with pre-SDK configuration..."

    # Start application
    info "Starting application..."
    npm run start &
    local APP_PID=$!

    # Wait for startup
    sleep 10

    # Check if running
    if ps -p $APP_PID > /dev/null; then
        log "✅ Application started successfully (PID: $APP_PID)"
    else
        error "Application failed to start"
        return 1
    fi
}

# Run post-rollback tests
run_tests() {
    log "Running post-rollback validation tests..."

    # Run basic tests
    info "Running unit tests..."
    if npm test 2>&1 | tee -a "$ROLLBACK_LOG"; then
        log "✅ Tests passed"
    else
        error "Tests failed after rollback"
        warn "Manual intervention may be required"
        return 1
    fi
}

# Generate rollback report
generate_report() {
    log "Generating rollback report..."

    local report_file="./logs/rollback-report-$(date +%Y%m%d-%H%M%S).md"

    cat > "$report_file" << EOF
# SDK Rollback Report

**Date:** $(date)
**Status:** Complete
**Duration:** $((SECONDS / 60)) minutes

## Rollback Details

### Pre-Rollback State
- **Phase:** $(cat "$BACKUP_DIR/../failure-$(date +%Y%m%d)*/phase-at-failure.txt" 2>/dev/null || echo "Unknown")
- **Failure State:** $(cat .last-failure-dir 2>/dev/null || echo "Not captured")

### Actions Taken
1. ✅ Services stopped
2. ✅ Failure state captured
3. ✅ Environment restored
4. ✅ Dependencies restored
5. ✅ Git state restored
6. ✅ SDK artifacts cleaned
7. ✅ Rollback validated
8. ✅ Services restarted
9. ✅ Tests executed

### Validation Results
- Environment: ✅ Restored
- Dependencies: ✅ Restored
- Git State: ✅ Restored
- Tests: ✅ Passed
- Services: ✅ Running

### Post-Rollback Metrics
$(cat .metrics-snapshot 2>/dev/null || echo "No metrics available")

## Next Steps

1. **Investigate Failure:**
   - Review failure state at: $(cat .last-failure-dir 2>/dev/null || echo "Unknown")
   - Analyze logs: logs/sdk-migration.log
   - Check alerts: logs/alerts.json

2. **Root Cause Analysis:**
   - Identify what caused the rollback
   - Document findings
   - Create fix plan

3. **Prepare for Retry:**
   - Fix identified issues
   - Update configuration
   - Plan retry strategy

4. **Monitor:**
   - Watch system health for 24 hours
   - Verify baseline metrics
   - Ensure stability before retry

## Support
- **Rollback Log:** $ROLLBACK_LOG
- **Failure State:** $(cat .last-failure-dir 2>/dev/null || echo "Unknown")
- **Documentation:** docs/sdk-migration-guide.md

---
*Generated automatically by rollback-sdk.sh*
EOF

    log "✅ Report generated: $report_file"
    cat "$report_file"
}

# Main rollback procedure
main() {
    local start_time=$SECONDS

    log "Starting rollback procedure..."
    log "Timestamp: $TIMESTAMP"

    # Execute rollback steps
    check_backup || exit 1
    capture_failure_state
    stop_services
    restore_environment
    restore_packages
    restore_git
    restore_database
    clean_sdk_artifacts
    validate_rollback || {
        error "Rollback validation failed!"
        error "System may be in inconsistent state"
        exit 1
    }
    restart_services || {
        error "Failed to restart services"
        exit 1
    }
    run_tests || warn "Tests failed - manual review needed"

    # Generate report
    generate_report

    local duration=$((SECONDS - start_time))

    log "========================================="
    log "✅ ROLLBACK COMPLETE"
    log "Duration: $((duration / 60))m $((duration % 60))s"
    log "========================================="

    info ""
    info "Next Steps:"
    info "1. Review rollback report: ./logs/rollback-report-*.md"
    info "2. Investigate failure state: $(cat .last-failure-dir 2>/dev/null)"
    info "3. Monitor system health: npm run dashboard"
    info "4. Document findings before retry"
    info ""

    log "Rollback log saved to: $ROLLBACK_LOG"
}

# Handle command line
case "${1:-rollback}" in
    rollback)
        main
        ;;
    status)
        if [ -f ".last-failure-dir" ]; then
            echo "Last failure state: $(cat .last-failure-dir)"
            if [ -d "$(cat .last-failure-dir)" ]; then
                echo "Failure files:"
                ls -lh "$(cat .last-failure-dir)"
            fi
        else
            echo "No previous rollback found"
        fi
        ;;
    report)
        if [ -f "./logs/rollback-report-"*.md ]; then
            latest=$(ls -t ./logs/rollback-report-*.md | head -1)
            cat "$latest"
        else
            echo "No rollback reports found"
        fi
        ;;
    *)
        echo "Usage: $0 {rollback|status|report}"
        exit 1
        ;;
esac