#!/bin/bash

###############################################################################
# Claude SDK Migration Script
# Phase 4: Production Optimization
#
# Performs gradual rollout of SDK integration with validation and rollback
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MIGRATION_LOG="./logs/sdk-migration.log"
ROLLBACK_SNAPSHOT="./backups/pre-sdk-snapshot"
VALIDATION_THRESHOLD=0.95
MAX_ERROR_RATE=0.01

# Create required directories
mkdir -p logs backups

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$MIGRATION_LOG"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$MIGRATION_LOG"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$MIGRATION_LOG"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$MIGRATION_LOG"
}

# Phase detection
get_current_phase() {
    if [ -f ".migration-phase" ]; then
        cat .migration-phase
    else
        echo "0"
    fi
}

set_phase() {
    echo "$1" > .migration-phase
    log "Migration phase set to: $1"
}

# Backup current state
create_backup() {
    log "Creating backup snapshot..."

    mkdir -p "$ROLLBACK_SNAPSHOT"

    # Backup critical files
    cp .env "$ROLLBACK_SNAPSHOT/.env.backup" 2>/dev/null || true
    cp package.json "$ROLLBACK_SNAPSHOT/package.json.backup"

    # Backup current metrics
    if [ -f ".metrics-snapshot" ]; then
        cp .metrics-snapshot "$ROLLBACK_SNAPSHOT/metrics-snapshot.backup"
    fi

    # Store current git commit
    git rev-parse HEAD > "$ROLLBACK_SNAPSHOT/git-commit.txt" 2>/dev/null || true

    log "✅ Backup created at: $ROLLBACK_SNAPSHOT"
}

# Restore from backup
restore_backup() {
    error "Restoring from backup..."

    if [ ! -d "$ROLLBACK_SNAPSHOT" ]; then
        error "No backup found! Cannot rollback."
        exit 1
    fi

    # Restore environment
    cp "$ROLLBACK_SNAPSHOT/.env.backup" .env 2>/dev/null || true

    # Restore git state if available
    if [ -f "$ROLLBACK_SNAPSHOT/git-commit.txt" ]; then
        COMMIT=$(cat "$ROLLBACK_SNAPSHOT/git-commit.txt")
        git checkout "$COMMIT" 2>/dev/null || warn "Could not restore git commit"
    fi

    # Restart services
    npm run stop 2>/dev/null || true
    npm run start

    log "✅ Rollback complete"
}

# Validate SDK installation
validate_sdk_installation() {
    log "Validating SDK installation..."

    if ! npm list @anthropic-ai/claude-agent-sdk > /dev/null 2>&1; then
        warn "SDK not installed. Installing..."
        npm install @anthropic-ai/claude-agent-sdk
    fi

    # Verify SDK can be required
    node -e "require('@anthropic-ai/claude-agent-sdk')" || {
        error "SDK installation failed"
        return 1
    }

    log "✅ SDK installation validated"
    return 0
}

# Run tests
run_tests() {
    local test_type=$1
    log "Running $test_type tests..."

    case $test_type in
        "unit")
            npm test -- --testPathPattern="src/sdk" || return 1
            ;;
        "integration")
            npm run test:integration || return 1
            ;;
        "performance")
            npm run test:performance || return 1
            ;;
        *)
            npm test || return 1
            ;;
    esac

    log "✅ $test_type tests passed"
    return 0
}

# Collect metrics
collect_metrics() {
    log "Collecting current metrics..."

    # Make metrics collection request
    local metrics=$(curl -s http://localhost:3000/api/summary 2>/dev/null || echo "{}")

    if [ "$metrics" = "{}" ]; then
        warn "Could not collect metrics - dashboard may not be running"
        return 1
    fi

    echo "$metrics" > .metrics-snapshot
    log "✅ Metrics collected"
    return 0
}

# Validate metrics
validate_metrics() {
    log "Validating metrics against thresholds..."

    if [ ! -f ".metrics-snapshot" ]; then
        warn "No metrics snapshot found"
        return 1
    fi

    # Extract key metrics using node
    local validation_result=$(node -e "
        const metrics = require('./.metrics-snapshot');
        const validationSuccess = metrics.quality?.validationSuccessRate || 0;
        const errorRate = metrics.performance?.errorRate || 1;

        const passed = validationSuccess >= $VALIDATION_THRESHOLD && errorRate <= $MAX_ERROR_RATE;

        console.log(JSON.stringify({
            passed,
            validationSuccess,
            errorRate,
            message: passed ? 'Metrics validation passed' : 'Metrics validation failed'
        }));
    ")

    local passed=$(echo "$validation_result" | node -pe "JSON.parse(require('fs').readFileSync(0)).passed")

    if [ "$passed" = "true" ]; then
        log "✅ Metrics validation passed"
        return 0
    else
        error "❌ Metrics validation failed"
        echo "$validation_result" | tee -a "$MIGRATION_LOG"
        return 1
    fi
}

# Phase 0: Pre-migration setup
phase_0_setup() {
    log "========================================="
    log "Phase 0: Pre-migration Setup"
    log "========================================="

    # Create backup
    create_backup

    # Validate environment
    if [ ! -f ".env" ]; then
        warn "No .env file found. Creating from template..."
        cp .env.example .env 2>/dev/null || {
            error "No .env.example found. Please create .env manually."
            return 1
        }
    fi

    # Check for API key
    if ! grep -q "CLAUDE_API_KEY" .env; then
        error "CLAUDE_API_KEY not found in .env"
        return 1
    fi

    # Install SDK
    validate_sdk_installation || return 1

    # Run baseline tests
    run_tests "unit" || return 1

    set_phase 1
    log "✅ Phase 0 complete - Ready for gradual rollout"
}

# Phase 1: Enable caching (5% traffic)
phase_1_caching() {
    log "========================================="
    log "Phase 1: Enable SDK Caching (5% traffic)"
    log "========================================="

    # Update environment variables
    cat >> .env << EOF

# SDK Integration - Phase 1
ENABLE_SDK_INTEGRATION=true
SDK_INTEGRATION_MODE=parallel
ENABLE_SDK_CACHING=true
ENABLE_CONTEXT_EDITING=true
SDK_ROLLOUT_PERCENTAGE=5
EOF

    log "Environment variables updated"

    # Restart with new config
    info "Restarting services..."
    npm run stop 2>/dev/null || true
    sleep 2
    npm run start &

    # Wait for startup
    sleep 10

    # Start monitoring
    info "Starting monitoring dashboard..."
    npm run dashboard &
    DASHBOARD_PID=$!
    sleep 5

    # Collect initial metrics
    collect_metrics || warn "Could not collect initial metrics"

    # Monitor for 1 hour (or as specified)
    local monitor_duration=${PHASE_1_DURATION:-3600}
    info "Monitoring for $monitor_duration seconds..."

    local start_time=$(date +%s)
    local check_interval=60

    while [ $(($(date +%s) - start_time)) -lt $monitor_duration ]; do
        sleep $check_interval

        collect_metrics

        if ! validate_metrics; then
            error "Metrics validation failed during Phase 1"
            warn "Initiating rollback..."
            restore_backup
            return 1
        fi

        info "Phase 1 monitoring: $(($(date +%s) - start_time))s / ${monitor_duration}s"
    done

    log "✅ Phase 1 monitoring complete - Metrics stable"
    set_phase 2
}

# Phase 2: Self-validation (25% traffic)
phase_2_validation() {
    log "========================================="
    log "Phase 2: Enable Self-Validation (25% traffic)"
    log "========================================="

    # Update rollout percentage
    sed -i 's/SDK_ROLLOUT_PERCENTAGE=5/SDK_ROLLOUT_PERCENTAGE=25/' .env

    # Enable self-validation
    cat >> .env << EOF
ENABLE_SELF_VALIDATION=true
VALIDATION_MODE=parallel
CONFIDENCE_THRESHOLD=0.75
EOF

    log "Self-validation enabled"

    # Restart services
    npm run stop 2>/dev/null || true
    sleep 2
    npm run start &
    sleep 10

    # Run validation tests
    run_tests "integration" || {
        error "Integration tests failed in Phase 2"
        restore_backup
        return 1
    }

    log "✅ Phase 2 complete - Self-validation working"
    set_phase 3
}

# Phase 3: Full integration (75% traffic)
phase_3_full_integration() {
    log "========================================="
    log "Phase 3: Full SDK Integration (75% traffic)"
    log "========================================="

    # Update rollout percentage
    sed -i 's/SDK_ROLLOUT_PERCENTAGE=25/SDK_ROLLOUT_PERCENTAGE=75/' .env

    # Enable full features
    cat >> .env << EOF
SDK_INTEGRATION=full
CONSENSUS_MODE=validated_only
MAX_PARALLEL_AGENTS=10
EOF

    log "Full integration enabled"

    # Restart services
    npm run stop 2>/dev/null || true
    sleep 2
    npm run start &
    sleep 10

    # Run comprehensive tests
    run_tests "integration" || {
        error "Integration tests failed in Phase 3"
        restore_backup
        return 1
    }

    run_tests "performance" || {
        error "Performance tests failed in Phase 3"
        restore_backup
        return 1
    }

    log "✅ Phase 3 complete - Full integration working"
    set_phase 4
}

# Phase 4: Production (100% traffic)
phase_4_production() {
    log "========================================="
    log "Phase 4: Production Deployment (100% traffic)"
    log "========================================="

    # Update to 100%
    sed -i 's/SDK_ROLLOUT_PERCENTAGE=75/SDK_ROLLOUT_PERCENTAGE=100/' .env

    # Production configuration
    cat >> .env << EOF
ENVIRONMENT=production
MONITORING_ENABLED=true
ALERTS_ENABLED=true
AUTO_ROLLBACK=true
EOF

    log "Production configuration applied"

    # Final restart
    npm run stop 2>/dev/null || true
    sleep 2
    npm run start &
    sleep 10

    # Comprehensive validation
    info "Running production validation..."
    npm run validate:production || {
        error "Production validation failed"
        restore_backup
        return 1
    }

    # Collect final metrics
    collect_metrics

    log "========================================="
    log "✅ SDK MIGRATION COMPLETE!"
    log "========================================="

    # Print summary
    info "Migration Summary:"
    info "  - Phase 0: Setup ✓"
    info "  - Phase 1: Caching (5%) ✓"
    info "  - Phase 2: Validation (25%) ✓"
    info "  - Phase 3: Integration (75%) ✓"
    info "  - Phase 4: Production (100%) ✓"
    info ""
    info "Dashboard: http://localhost:3000"
    info "Logs: $MIGRATION_LOG"
    info "Backup: $ROLLBACK_SNAPSHOT"

    set_phase "complete"
}

# Rollback function
rollback() {
    log "========================================="
    log "INITIATING EMERGENCY ROLLBACK"
    log "========================================="

    local current_phase=$(get_current_phase)
    error "Rolling back from phase: $current_phase"

    restore_backup

    # Reset phase
    set_phase 0

    error "Rollback complete. Please investigate issues before retrying."
    exit 1
}

# Main migration flow
main() {
    log "========================================="
    log "Claude SDK Migration"
    log "Started: $(date)"
    log "========================================="

    # Set up error handling
    trap rollback ERR

    local current_phase=$(get_current_phase)
    local target_phase=${1:-4}

    info "Current phase: $current_phase"
    info "Target phase: $target_phase"

    # Execute phases
    if [ "$current_phase" -lt 1 ] && [ "$target_phase" -ge 1 ]; then
        phase_0_setup || exit 1
    fi

    if [ "$current_phase" -lt 2 ] && [ "$target_phase" -ge 2 ]; then
        phase_1_caching || exit 1
    fi

    if [ "$current_phase" -lt 3 ] && [ "$target_phase" -ge 3 ]; then
        phase_2_validation || exit 1
    fi

    if [ "$current_phase" -lt 4 ] && [ "$target_phase" -ge 4 ]; then
        phase_3_full_integration || exit 1
    fi

    if [ "$current_phase" -lt 5 ] && [ "$target_phase" -ge 4 ]; then
        phase_4_production || exit 1
    fi

    log "========================================="
    log "Migration completed successfully!"
    log "Completed: $(date)"
    log "========================================="
}

# Handle command line arguments
case "${1:-migrate}" in
    migrate)
        main "${2:-4}"
        ;;
    rollback)
        rollback
        ;;
    status)
        current_phase=$(get_current_phase)
        echo "Current migration phase: $current_phase"
        if [ -f ".metrics-snapshot" ]; then
            echo "Latest metrics:"
            cat .metrics-snapshot | node -pe "JSON.stringify(JSON.parse(require('fs').readFileSync(0)), null, 2)"
        fi
        ;;
    validate)
        validate_metrics
        ;;
    *)
        echo "Usage: $0 {migrate|rollback|status|validate} [target_phase]"
        echo ""
        echo "Commands:"
        echo "  migrate [phase]  - Run migration to specified phase (default: 4)"
        echo "  rollback         - Rollback to pre-migration state"
        echo "  status           - Show current migration status"
        echo "  validate         - Validate current metrics"
        exit 1
        ;;
esac