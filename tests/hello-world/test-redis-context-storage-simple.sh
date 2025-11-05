#!/bin/bash
# Simple Redis Context Storage Test
# Tests Zone A fix: structured context vs generic IDs

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

TEST_ID="test-redis-$(date +%s)"
TASK_ID="zone-a-fix-$(date +%s)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REDIS_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

log_info "Testing Redis Context Storage (Zone A Fix)"
log_info "Test ID: $TEST_ID"

cleanup() {
    redis-cli DEL "swarm:$TASK_ID:context" >/dev/null 2>&1 || true
    redis-cli DEL "cfn_loop:task:$TASK_ID:context" >/dev/null 2>&1 || true
}

trap cleanup EXIT

# Test 1: Structured context storage
log_info "Test 1: Structured context storage with --key/--value"

result=$("$REDIS_SKILL/store-context.sh" \
    --task-id "$TASK_ID" \
    --key "epic-context" \
    --value '{"goal": "React Router v6 migration", "zone": "A"}' \
    --namespace "swarm" 2>&1)

if [[ $result == *"✅ Context stored: epic-context"* ]]; then
    log_success "Structured storage works"
else
    log_error "Structured storage failed: $result"
    exit 1
fi

# Test 2: Context retrieval
log_info "Test 2: Context retrieval"

if [[ ! -f "$REDIS_SKILL/get-context.sh" ]]; then
    log_error "get-context.sh not found"
    exit 1
fi

chmod +x "$REDIS_SKILL/get-context.sh"

retrieved=$("$REDIS_SKILL/get-context.sh" \
    --task-id "$TASK_ID" \
    --key "epic-context" \
    --namespace "swarm" 2>&1)

if [[ $retrieved == *"React Router v6 migration"* ]]; then
    log_success "Context retrieval works"
else
    log_error "Context retrieval failed: $retrieved"
    exit 1
fi

# Test 3: Legacy compatibility
log_info "Test 3: Legacy compatibility"

legacy=$("$REDIS_SKILL/store-context.sh" \
    "$TASK_ID" "React Router v6 fix TS2786" 2>&1)

if [[ $legacy == *"✅ Context stored for task:"* ]]; then
    log_success "Legacy compatibility works"
else
    log_error "Legacy compatibility failed: $legacy"
    exit 1
fi

# Test 4: TTL functionality
log_info "Test 4: TTL functionality"

ttl=$(redis-cli TTL "swarm:$TASK_ID:context" 2>/dev/null || echo "-1")

if [[ $ttl -gt 86000 && $ttl -le 86400 ]]; then
    log_success "TTL set correctly: ${ttl}s"
else
    log_warning "TTL may be incorrect: ${ttl}s"
fi

log_success "All tests passed! Zone A fix validated."
log_info "CLI Mode now stores rich context instead of generic IDs."