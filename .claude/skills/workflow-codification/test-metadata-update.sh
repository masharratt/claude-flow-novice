#!/usr/bin/env bash
#
# test-metadata-update.sh - Test Metadata Update Functionality
#
# Purpose: Verify that propagate-skill-update.sh correctly updates
#          frontmatter metadata (tags, category, owner, approval_level)
#          when propagating skill updates.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test database path
TEST_DB="/tmp/test-skills-metadata-$(date +%s).db"

# Cleanup function
cleanup() {
    if [[ -f "$TEST_DB" ]]; then
        rm -f "$TEST_DB"
    fi
    rm -f /tmp/test-skill-*.md
}

# Helper functions
log_test() {
    echo -e "${YELLOW}$*${NC}"
}

log_pass() {
    echo -e "${GREEN}✓ PASS${NC}"
}

log_fail() {
    echo -e "${RED}✗ FAIL${NC} $*"
}

# Create test database schema
setup_test_db() {
    log_test "Setting up test database..."

    sqlite3 "$TEST_DB" <<EOF
CREATE TABLE skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    tags TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    content_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    owner TEXT,
    approval_level TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    approval_level TEXT NOT NULL,
    approver TEXT NOT NULL,
    decision TEXT NOT NULL,
    reasoning TEXT,
    approval_criteria_check TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE agent_skill_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL,
    skill_id INTEGER NOT NULL,
    FOREIGN KEY (skill_id) REFERENCES skills(id)
);
EOF

    log_pass
}

# Create test skill v1.0.0
create_test_skill_v1() {
    local skill_file="/tmp/test-skill-v1.0.0.md"

    cat > "$skill_file" <<'EOF'
---
name: test-skill
category: testing
tags: [original, test]
version: 1.0.0
owner: test-owner
approval_level: manual
---

# Test Skill v1.0.0

Original content for testing.
EOF

    # Calculate hash
    local hash=$(sha256sum "$skill_file" | awk '{print $1}')

    # Insert into database
    sqlite3 "$TEST_DB" <<EOSQL
INSERT INTO skills (name, category, tags, version, content_path, content_hash, owner, approval_level)
VALUES (
    'test-skill',
    'testing',
    '["original","test"]',
    '1.0.0',
    '$skill_file',
    '$hash',
    'test-owner',
    'manual'
);
EOSQL

    echo "$skill_file"
}

# Create test skill v1.0.1 with updated metadata
create_test_skill_v1_0_1() {
    local skill_file="/tmp/test-skill-v1.0.1.md"

    cat > "$skill_file" <<'EOF'
---
name: test-skill
category: updated-category
tags: [updated, new-tag, test]
version: 1.0.1
owner: new-owner
approval_level: auto
---

# Test Skill v1.0.1

Updated content with new metadata.
EOF

    echo "$skill_file"
}

# Test 1: Verify metadata is updated
test_metadata_update() {
    log_test "Test 1: Verify metadata is updated from frontmatter"

    # Create initial skill
    local v1_path=$(create_test_skill_v1)

    # Create updated skill
    local v1_0_1_path=$(create_test_skill_v1_0_1)

    # Run propagate-skill-update.sh
    export CFN_SKILLS_DB_PATH="$TEST_DB"

    if bash "${SCRIPT_DIR}/propagate-skill-update.sh" \
        "test-skill" \
        "1.0.1" \
        "$v1_0_1_path" \
        "patch" \
        "false" > /dev/null 2>&1; then

        # Verify version updated
        local version=$(sqlite3 "$TEST_DB" "SELECT version FROM skills WHERE name='test-skill'")
        if [[ "$version" != "1.0.1" ]]; then
            log_fail "Version not updated (expected: 1.0.1, got: $version)"
            return 1
        fi

        # Verify tags updated
        local tags=$(sqlite3 "$TEST_DB" "SELECT tags FROM skills WHERE name='test-skill'")
        if [[ "$tags" != '["updated","new-tag","test"]' ]]; then
            log_fail "Tags not updated (expected: [\"updated\",\"new-tag\",\"test\"], got: $tags)"
            return 1
        fi

        # Verify category updated
        local category=$(sqlite3 "$TEST_DB" "SELECT category FROM skills WHERE name='test-skill'")
        if [[ "$category" != "updated-category" ]]; then
            log_fail "Category not updated (expected: updated-category, got: $category)"
            return 1
        fi

        # Verify owner updated
        local owner=$(sqlite3 "$TEST_DB" "SELECT owner FROM skills WHERE name='test-skill'")
        if [[ "$owner" != "new-owner" ]]; then
            log_fail "Owner not updated (expected: new-owner, got: $owner)"
            return 1
        fi

        # Verify approval_level updated
        local approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE name='test-skill'")
        if [[ "$approval_level" != "auto" ]]; then
            log_fail "Approval level not updated (expected: auto, got: $approval_level)"
            return 1
        fi

        log_pass
        return 0
    else
        log_fail "propagate-skill-update.sh failed"
        return 1
    fi
}

# Test 2: Verify fallback to existing values when metadata missing
test_metadata_fallback() {
    log_test "Test 2: Verify fallback to existing values when frontmatter missing"

    echo "DEBUG: Test 2 started" >&2

    # Clean database
    if [[ -f "$TEST_DB" ]]; then
        sqlite3 "$TEST_DB" "DELETE FROM skills" || {
            log_fail "Failed to clean database"
            return 1
        }
    else
        log_fail "Database not found: $TEST_DB"
        return 1
    fi

    # Create initial skill
    local v1_path=$(create_test_skill_v1)

    # Create updated skill without some metadata
    local skill_file="/tmp/test-skill-v1.0.2.md"
    cat > "$skill_file" <<'EOF'
---
name: test-skill
version: 1.0.2
tags: [partial-update]
---

# Test Skill v1.0.2

Updated content with partial metadata.
EOF

    # Run propagate-skill-update.sh
    export CFN_SKILLS_DB_PATH="$TEST_DB"

    if bash "${SCRIPT_DIR}/propagate-skill-update.sh" \
        "test-skill" \
        "1.0.2" \
        "$skill_file" \
        "patch" \
        "false" > /dev/null 2>&1; then

        # Verify tags updated
        local tags=$(sqlite3 "$TEST_DB" "SELECT tags FROM skills WHERE name='test-skill'")
        if [[ "$tags" != '["partial-update"]' ]]; then
            log_fail "Tags not updated (expected: [\"partial-update\"], got: $tags)"
            return 1
        fi

        # Verify category fallback to existing value
        local category=$(sqlite3 "$TEST_DB" "SELECT category FROM skills WHERE name='test-skill'")
        if [[ "$category" != "testing" ]]; then
            log_fail "Category fallback failed (expected: testing, got: $category)"
            return 1
        fi

        # Verify owner fallback to existing value
        local owner=$(sqlite3 "$TEST_DB" "SELECT owner FROM skills WHERE name='test-skill'")
        if [[ "$owner" != "test-owner" ]]; then
            log_fail "Owner fallback failed (expected: test-owner, got: $owner)"
            return 1
        fi

        log_pass
        return 0
    else
        log_fail "propagate-skill-update.sh failed"
        return 1
    fi
}

# Main execution
main() {
    echo "=========================================="
    echo "Metadata Update Functionality Tests"
    echo "=========================================="
    echo ""

    setup_test_db
    echo ""

    local tests_passed=0
    local tests_failed=0

    if test_metadata_update; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    echo ""

    echo "DEBUG: About to run Test 2" >&2

    if test_metadata_fallback; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    echo ""

    # Summary
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Tests run: $((tests_passed + tests_failed))"
    echo -e "${GREEN}Tests passed: $tests_passed${NC}"

    if [[ $tests_failed -gt 0 ]]; then
        echo -e "${RED}Tests failed: $tests_failed${NC}"
        echo "=========================================="
        cleanup
        return 1
    else
        echo "Tests failed: 0"
        echo "=========================================="
        cleanup
        return 0
    fi
}

main "$@"
