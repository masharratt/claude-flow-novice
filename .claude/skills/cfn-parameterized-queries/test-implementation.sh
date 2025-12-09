#!/bin/bash
# Implementation test for cfn-parameterized-queries skill
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test results
PASSED=0
FAILED=0

# Test helper functions
assert() {
    local condition="$1"
    local message="$2"
    
    if eval "$condition"; then
        echo -e "${GREEN}✓${NC} $message"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $message"
        ((FAILED++))
        return 1
    fi
}

# Test 1: Check if implementation file exists
test_implementation_exists() {
    echo "Test 1: Checking implementation file..."
    assert "[[ -f '$SKILL_DIR/parameterized-queries.sh' ]]" "Implementation file exists"
}

# Test 2: Check if file is executable
test_file_permissions() {
    echo -e "\nTest 2: Checking file permissions..."
    assert "[[ -x '$SKILL_DIR/parameterized-queries.sh' ]]" "File is executable"
}

# Test 3: Check for SQL injection patterns
test_no_sql_injection() {
    echo -e "\nTest 3: Checking for SQL injection vulnerabilities..."
    
    # Check for dangerous patterns
    local file="$SKILL_DIR/parameterized-queries.sh"
    local violations=0
    
    # Check for variable interpolation in SQL
    if grep -E '\$[a-zA-Z_][a-zA-Z0-9_]*[^a-zA-Z0-9_]' "$file" | grep -E "(SELECT|INSERT|UPDATE|DELETE).*\".*\$" > /dev/null; then
        echo -e "${RED}✗${NC} Found potential SQL variable interpolation"
        ((violations++))
    fi
    
    # Check for string concatenation in SQL
    if grep -E '(SELECT|INSERT|UPDATE|DELETE).*\".*\+.*\"' "$file" > /dev/null; then
        echo -e "${RED}✗${NC} Found SQL string concatenation"
        ((violations++))
    fi
    
    # Check for eval with SQL
    if grep -E 'eval.*SELECT|INSERT|UPDATE|DELETE' "$file" > /dev/null; then
        echo -e "${RED}✗${NC} Found eval with SQL"
        ((violations++))
    fi
    
    assert "[[ $violations -eq 0 ]]" "No SQL injection patterns found"
}

# Test 4: Check parameter binding implementation
test_parameter_binding() {
    echo -e "\nTest 4: Checking parameter binding implementation..."
    
    local file="$SKILL_DIR/parameterized-queries.sh"
    
    # Check for proper parameter binding with ?
    assert "grep -q 'sqlite3.*\?.*;' '$file'" "Uses ? parameter placeholders"
    
    # Check for here-document parameter passing
    assert "grep -q 'printf.*%s.*sqlite3' '$file'" "Uses here-document for parameters"
    
    # Check for no direct variable interpolation
    assert "! grep -E 'sqlite3.*\".*\$.*\".*\;' '$file'" "No direct variable interpolation in SQL"
}

# Test 5: Check identifier validation
test_identifier_validation() {
    echo -e "\nTest 5: Checking identifier validation..."
    
    local file="$SKILL_DIR/parameterized-queries.sh"
    
    # Check validation function exists
    assert "grep -q 'validate_sql_identifier()' '$file'" "Identifier validation function exists"
    
    # Check regex pattern for validation
    assert "grep -q '\^\[a-zA-Z_\]\[a-zA-Z0-9_\]*' '$file'" "Proper identifier validation regex"
    
    # Check table name validation
    assert "grep -q 'validate_table_name' '$file'" "Table name validation exists"
    
    # Check column name validation
    assert "grep -q 'validate_column_name' '$file'" "Column name validation exists"
}

# Test 6: Check required functions
test_required_functions() {
    echo -e "\nTest 6: Checking required functions..."
    
    local file="$SKILL_DIR/parameterized-queries.sh"
    
    local functions=(
        "execute_select_one"
        "execute_select_many"
        "execute_insert"
        "execute_update"
        "execute_delete"
        "execute_exists"
        "get_by_id"
        "count_records"
        "begin_transaction"
        "commit_transaction"
        "rollback_transaction"
    )
    
    for func in "${functions[@]}"; do
        assert "grep -q '^$func()' '$file'" "Function $func exists"
    done
}

# Test 7: Check error handling
test_error_handling() {
    echo -e "\nTest 7: Checking error handling..."
    
    local file="$SKILL_DIR/parameterized-queries.sh"
    
    # Check for set -euo pipefail
    assert "grep -q 'set -euo pipefail' '$file'" "Uses strict error handling"
    
    # Check for database file existence check
    assert "grep -q '\[\[ ! -f.*db_path' '$file'" "Checks database file existence"
    
    # Check for error messages to stderr
    assert "grep -q '>&2' '$file'" "Sends errors to stderr"
}

# Test 8: Check documentation quality
test_documentation() {
    echo -e "\nTest 8: Checking documentation..."
    
    local doc_file="$SKILL_DIR/SKILL.md"
    
    # Check if documentation exists
    assert "[[ -f '$doc_file' ]]" "Documentation file exists"
    
    # Check for security section
    assert "grep -q '## Security' '$doc_file'" "Has security section"
    
    # Check for API reference
    assert "grep -q '## API Reference' '$doc_file'" "Has API reference"
    
    # Check for usage examples
    assert "grep -q '## Usage Examples' '$doc_file'" "Has usage examples"
}

# Test 9: Run actual functionality test
test_functionality() {
    echo -e "\nTest 9: Testing basic functionality..."
    
    # Create test database
    local test_db="/tmp/test-sql-$$.sqlite"
    trap "rm -f '$test_db'" EXIT
    
    # Create table
    sqlite3 "$test_db" "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);"
    
    # Source the skill
    source "$SKILL_DIR/parameterized-queries.sh"
    
    # Test insert
    execute_insert "$test_db" "test" --columns "name" --values "Test Name" > /dev/null
    assert "[[ $? -eq 0 ]]" "Insert operation works"
    
    # Test select
    local result
    result=$(execute_select_one "$test_db" "SELECT name FROM test WHERE id = ?;" "1")
    assert "[[ '$result' == 'Test Name' ]]" "Select operation works"
    
    # Test update
    execute_update "$test_db" "test" "name" "Updated Name" "id" "1"
    assert "[[ $? -eq 0 ]]" "Update operation works"
    
    # Test delete
    execute_delete "$test_db" "test" "id" "1"
    assert "[[ $? -eq 0 ]]" "Delete operation works"
    
    # Clean up
    rm -f "$test_db"
    trap - EXIT
}

# Run all tests
main() {
    echo "Running implementation tests for cfn-parameterized-queries skill..."
    echo "============================================================"
    
    test_implementation_exists
    test_file_permissions
    test_no_sql_injection
    test_parameter_binding
    test_identifier_validation
    test_required_functions
    test_error_handling
    test_documentation
    test_functionality
    
    echo -e "\n============================================================"
    echo -e "Test Results: ${GREEN}$PASSED${NC} passed, ${RED}$FAILED${NC} failed"
    
    if [[ $FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}✓ All tests passed!${NC}"
        echo -e "${GREEN}✓ Skill is production ready${NC}"
        exit 0
    else
        echo -e "\n${RED}✗ Some tests failed${NC}"
        echo -e "${RED}✗ Skill needs fixes before production use${NC}"
        exit 1
    fi
}

# Execute if run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi