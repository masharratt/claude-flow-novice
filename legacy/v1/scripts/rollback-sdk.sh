#!/bin/bash

# Claude Agent SDK - Rollback Script
# Instant rollback of SDK integration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/.sdk-backup"
LOG_FILE="$PROJECT_ROOT/sdk-rollback.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

echo "=== SDK Rollback Log ===" > "$LOG_FILE"
log "Starting SDK rollback..."

# Disable SDK in environment
log "Disabling SDK integration..."
if [ -f "$PROJECT_ROOT/.env" ]; then
    sed -i.bak '/^# Claude Agent SDK Configuration/,/^$/d' "$PROJECT_ROOT/.env"
    sed -i.bak '/^ENABLE_SDK/d' "$PROJECT_ROOT/.env"
    sed -i.bak '/^SDK_/d' "$PROJECT_ROOT/.env"
    success "SDK environment variables removed"
fi

# Restore backup if needed
if [ -f "$BACKUP_DIR/.env.backup" ]; then
    log "Restoring environment from backup..."
    cp "$BACKUP_DIR/.env.backup" "$PROJECT_ROOT/.env"
    success "Environment restored"
fi

success "Rollback complete!"

cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║            SDK Rollback Successful                           ║
╚══════════════════════════════════════════════════════════════╝

✅ SDK Integration: DISABLED
✅ System: Restored to pre-SDK state

📁 Rollback log: $LOG_FILE

EOF

log "Rollback complete. System restored."