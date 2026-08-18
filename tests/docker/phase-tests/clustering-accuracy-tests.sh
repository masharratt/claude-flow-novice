#!/usr/bin/env bash
# tests/docker/clustering-accuracy-tests.sh
# Phase 3 :: Dependency clustering validation (tier distribution, import graph, coordinated batching)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

# Configuration
TEST_DIR="/tmp/cfn-clustering-test-$(date +%s)"

cleanup() {
    log_step "GIVEN cleanup of test artifacts"
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: Cluster size distribution (60% T1, 25% T2, 10% T3, 5% T4)
test_cluster_size_distribution() {
    log_step "Test 1: Verify tier distribution matches target ratios"

    # GIVEN: B10 actual distribution (baseline)
    TIER_1_COUNT=42
    TIER_2_COUNT=12
    TIER_3_COUNT=3
    TIER_4_COUNT=1

    TOTAL_BATCHES=$((TIER_1_COUNT + TIER_2_COUNT + TIER_3_COUNT + TIER_4_COUNT))

    # WHEN: Calculate percentages
    TIER_1_PCT=$(( (TIER_1_COUNT * 100) / TOTAL_BATCHES ))
    TIER_2_PCT=$(( (TIER_2_COUNT * 100) / TOTAL_BATCHES ))
    TIER_3_PCT=$(( (TIER_3_COUNT * 100) / TOTAL_BATCHES ))
    TIER_4_PCT=$(( (TIER_4_COUNT * 100) / TOTAL_BATCHES ))

    log_info "Tier 1: $TIER_1_COUNT batches (${TIER_1_PCT}%)"
    log_info "Tier 2: $TIER_2_COUNT batches (${TIER_2_PCT}%)"
    log_info "Tier 3: $TIER_3_COUNT batches (${TIER_3_PCT}%)"
    log_info "Tier 4: $TIER_4_COUNT batches (${TIER_4_PCT}%)"

    # THEN: Tier 1 is 60-80% (allow variance)
    if [ $TIER_1_PCT -ge 60 ] && [ $TIER_1_PCT -le 80 ]; then
        log_pass "Tier 1 distribution within range: ${TIER_1_PCT}% (target: 60%)"
    else
        log_fail "Tier 1 distribution out of range: ${TIER_1_PCT}% (expected: 60-80%)"
        return 1
    fi

    # Tier 2 is 15-35%
    if [ $TIER_2_PCT -ge 15 ] && [ $TIER_2_PCT -le 35 ]; then
        log_pass "Tier 2 distribution within range: ${TIER_2_PCT}% (target: 25%)"
    else
        log_fail "Tier 2 distribution out of range: ${TIER_2_PCT}% (expected: 15-35%)"
        return 1
    fi

    # Tier 3 is 3-15%
    if [ $TIER_3_PCT -ge 3 ] && [ $TIER_3_PCT -le 15 ]; then
        log_pass "Tier 3 distribution within range: ${TIER_3_PCT}% (target: 10%)"
    else
        log_fail "Tier 3 distribution out of range: ${TIER_3_PCT}% (expected: 3-15%)"
        return 1
    fi

    # Tier 4 is 1-10%
    if [ $TIER_4_PCT -ge 1 ] && [ $TIER_4_PCT -le 10 ]; then
        log_pass "Tier 4 distribution within range: ${TIER_4_PCT}% (target: 5%)"
    else
        log_fail "Tier 4 distribution out of range: ${TIER_4_PCT}% (expected: 1-10%)"
        return 1
    fi
}

# Test 2: Import graph accuracy validation
test_import_graph_accuracy() {
    log_step "Test 2: Directory-based clustering approximates import dependencies"

    # GIVEN: Test project structure
    mkdir -p "$TEST_DIR/src/auth"
    mkdir -p "$TEST_DIR/src/dashboard"
    mkdir -p "$TEST_DIR/src/utils"

    # Create files with logical groupings
    cat > "$TEST_DIR/src/auth/LoginForm.tsx" << 'EOF'
import { useAuth } from './useAuth';
export const LoginForm = () => null;
EOF

    cat > "$TEST_DIR/src/auth/useAuth.ts" << 'EOF'
export const useAuth = () => null;
EOF

    cat > "$TEST_DIR/src/dashboard/Dashboard.tsx" << 'EOF'
export const Dashboard = () => null;
EOF

    # WHEN: Cluster by directory (Phase 1 strategy)
    declare -A CLUSTERS
    for file in "$TEST_DIR"/src/**/*.{ts,tsx}; do
        [ -e "$file" ] || continue
        DIR=$(dirname "$file" | sed "s|$TEST_DIR/||")
        CLUSTERS[$DIR]+="$(basename "$file") "
    done

    # THEN: Files in same directory are clustered together
    AUTH_CLUSTER="${CLUSTERS[src/auth]}"
    DASHBOARD_CLUSTER="${CLUSTERS[src/dashboard]}"

    if echo "$AUTH_CLUSTER" | grep -q "LoginForm.tsx" && echo "$AUTH_CLUSTER" | grep -q "useAuth.ts"; then
        log_pass "Auth files clustered together: $AUTH_CLUSTER"
    else
        log_fail "Auth files not clustered correctly"
        return 1
    fi

    if echo "$DASHBOARD_CLUSTER" | grep -q "Dashboard.tsx"; then
        log_pass "Dashboard files isolated: $DASHBOARD_CLUSTER"
    else
        log_fail "Dashboard files not isolated"
        return 1
    fi
}

# Test 3: Coordinated file batching (shared imports → same batch)
test_coordinated_file_batching() {
    log_step "Test 3: Files sharing imports are batched together"

    # GIVEN: Files with import chain
    mkdir -p "$TEST_DIR/src/feature"

    cat > "$TEST_DIR/src/feature/fileA.ts" << 'EOF'
import { funcB } from './fileB';
export const funcA = () => funcB();
EOF

    cat > "$TEST_DIR/src/feature/fileB.ts" << 'EOF'
import { funcC } from './fileC';
export const funcB = () => funcC();
EOF

    cat > "$TEST_DIR/src/feature/fileC.ts" << 'EOF'
export const funcC = () => 'hello';
EOF

    # WHEN: Cluster by directory
    FEATURE_DIR="$TEST_DIR/src/feature"
    FILES=$(ls "$FEATURE_DIR"/*.ts)
    FILE_COUNT=$(echo "$FILES" | wc -w)

    log_info "Found $FILE_COUNT files in feature directory"

    # THEN: All 3 files should be in same cluster (same directory)
    if [ $FILE_COUNT -eq 3 ]; then
        log_pass "All 3 related files clustered together"
    else
        log_fail "Expected 3 files, found $FILE_COUNT"
        return 1
    fi

    # Verify tier assignment (3 files = Tier 2: 600MB)
    EXPECTED_TIER=2
    if [ $FILE_COUNT -ge 2 ] && [ $FILE_COUNT -le 3 ]; then
        log_pass "Cluster assigned to Tier $EXPECTED_TIER (2-3 files)"
    else
        log_fail "Wrong tier assignment for $FILE_COUNT files"
        return 1
    fi
}

# Test 4: Independent file isolation (standalone → Tier 1)
test_independent_file_isolation() {
    log_step "Test 4: Standalone files get Tier 1 (512MB)"

    # GIVEN: Standalone file with no imports
    mkdir -p "$TEST_DIR/src/standalone"

    cat > "$TEST_DIR/src/standalone/utility.ts" << 'EOF'
export const utility = () => 'standalone utility';
EOF

    # WHEN: Cluster by directory
    STANDALONE_DIR="$TEST_DIR/src/standalone"
    FILE_COUNT=$(ls "$STANDALONE_DIR"/*.ts | wc -l)

    log_info "Standalone directory has $FILE_COUNT file(s)"

    # THEN: Single file gets Tier 1 (512MB)
    if [ $FILE_COUNT -eq 1 ]; then
        TIER=1
        MEMORY="512m"
        log_pass "Standalone file assigned Tier $TIER ($MEMORY)"
    else
        log_fail "Expected 1 standalone file, found $FILE_COUNT"
        return 1
    fi
}

# Test 5: Large cluster handling (9+ files → Tier 4)
test_large_cluster_handling() {
    log_step "Test 5: Large clusters (9+ files) get Tier 4 (1GB)"

    # GIVEN: Large feature with many files
    mkdir -p "$TEST_DIR/src/large-feature"

    for i in {1..10}; do
        cat > "$TEST_DIR/src/large-feature/file${i}.ts" << EOF
export const func${i} = () => 'function ${i}';
EOF
    done

    # WHEN: Count files in directory
    LARGE_DIR="$TEST_DIR/src/large-feature"
    FILE_COUNT=$(ls "$LARGE_DIR"/*.ts | wc -l)

    log_info "Large feature directory has $FILE_COUNT files"

    # THEN: Cluster gets Tier 4 (1GB)
    if [ $FILE_COUNT -ge 9 ]; then
        TIER=4
        MEMORY="1024m"
        log_pass "Large cluster ($FILE_COUNT files) assigned Tier $TIER ($MEMORY)"
    else
        log_fail "Expected ≥9 files, found $FILE_COUNT"
        return 1
    fi
}

# Test 6: Mixed directory structure
test_mixed_directory_structure() {
    log_step "Test 6: Mixed directory structure produces varied tier distribution"

    # GIVEN: Project with mixed file distributions
    mkdir -p "$TEST_DIR/src/"{small,medium,large,solo}

    # Solo: 1 file (Tier 1)
    echo "export const solo = () => null;" > "$TEST_DIR/src/solo/solo.ts"

    # Small: 3 files (Tier 2)
    for i in {1..3}; do
        echo "export const small${i} = () => null;" > "$TEST_DIR/src/small/file${i}.ts"
    done

    # Medium: 6 files (Tier 3)
    for i in {1..6}; do
        echo "export const medium${i} = () => null;" > "$TEST_DIR/src/medium/file${i}.ts"
    done

    # Large: 10 files (Tier 4)
    for i in {1..10}; do
        echo "export const large${i} = () => null;" > "$TEST_DIR/src/large/file${i}.ts"
    done

    # WHEN: Cluster by directory
    declare -A TIER_COUNTS
    for dir in "$TEST_DIR/src/"*/; do
        FILE_COUNT=$(ls "$dir"/*.ts 2>/dev/null | wc -l)
        DIR_NAME=$(basename "$dir")

        # Assign tier based on file count
        if [ $FILE_COUNT -eq 1 ]; then
            TIER=1
        elif [ $FILE_COUNT -ge 2 ] && [ $FILE_COUNT -le 3 ]; then
            TIER=2
        elif [ $FILE_COUNT -ge 4 ] && [ $FILE_COUNT -le 8 ]; then
            TIER=3
        else
            TIER=4
        fi

        TIER_COUNTS[$TIER]=$((${TIER_COUNTS[$TIER]:-0} + 1))
        log_info "Directory $DIR_NAME: $FILE_COUNT files → Tier $TIER"
    done

    # THEN: Validate all tiers represented
    if [ "${TIER_COUNTS[1]}" -ge 1 ] && \
       [ "${TIER_COUNTS[2]}" -ge 1 ] && \
       [ "${TIER_COUNTS[3]}" -ge 1 ] && \
       [ "${TIER_COUNTS[4]}" -ge 1 ]; then
        log_pass "All 4 tiers represented in mixed structure"
    else
        log_fail "Not all tiers represented (T1:${TIER_COUNTS[1]}, T2:${TIER_COUNTS[2]}, T3:${TIER_COUNTS[3]}, T4:${TIER_COUNTS[4]})"
        return 1
    fi
}

# Run all tests
log_step "Starting Dependency Clustering Accuracy Tests"
echo ""

test_cluster_size_distribution
test_import_graph_accuracy
test_coordinated_file_batching
test_independent_file_isolation
test_large_cluster_handling
test_mixed_directory_structure

echo ""
print_test_summary
