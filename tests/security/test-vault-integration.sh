#!/usr/bin/env bash
# tests/security/test-vault-integration.sh
# Phase 6.3 :: Vault Integration Test Suite (IMPL-001)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
VAULT_ADDR="http://localhost:8200"
VAULT_ROOT_TOKEN="test-root-token-$(date +%s)"
TEST_OUTPUT_DIR="$PROJECT_ROOT/.artifacts/test-results/vault"
mkdir -p "$TEST_OUTPUT_DIR"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

cleanup() {
    log_step "CLEANUP: Stopping Vault test instance"

    # Stop Vault container
    docker stop cfn-vault-test 2>/dev/null || true
    docker rm cfn-vault-test 2>/dev/null || true

    # Remove test tokens
    rm -f "$PROJECT_ROOT/.vault-token-test"* 2>/dev/null || true

    # Clean up volumes
    docker volume rm cfn-vault-test-data 2>/dev/null || true
}

trap cleanup EXIT

setup_vault() {
    log_step "SETUP: Starting Vault test instance"

    # Start Vault in dev mode
    docker run -d \
        --name cfn-vault-test \
        -p 8200:8200 \
        -e VAULT_DEV_ROOT_TOKEN_ID="$VAULT_ROOT_TOKEN" \
        -e VAULT_ADDR="http://0.0.0.0:8200" \
        hashicorp/vault:1.15 server -dev \
        -dev-root-token-id="$VAULT_ROOT_TOKEN" \
        -dev-listen-address="0.0.0.0:8200"

    # Wait for Vault to be ready
    local retries=0
    while [ $retries -lt 30 ]; do
        if docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault status &>/dev/null; then
            log_info "Vault is ready"
            break
        fi
        retries=$((retries + 1))
        sleep 1
    done

    if [ $retries -eq 30 ]; then
        log_error "Vault failed to start"
        return 1
    fi

    # Export credentials
    export VAULT_ADDR
    export VAULT_TOKEN="$VAULT_ROOT_TOKEN"

    log_success "Vault test instance started"
}

run_test() {
    local test_name="$1"
    local test_func="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_step "TEST $TESTS_RUN: $test_name"

    if $test_func; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        log_success "✓ PASSED: $test_name"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        log_error "✗ FAILED: $test_name"
        return 1
    fi
}

# Test 1: Vault initialization
test_vault_initialization() {
    log_info "Testing Vault initialization..."

    # Check Vault status
    local status
    status=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault status -format=json 2>/dev/null)

    local initialized=$(echo "$status" | jq -r '.initialized')
    local sealed=$(echo "$status" | jq -r '.sealed')

    assert_equals "true" "$initialized" "Vault should be initialized"
    assert_equals "false" "$sealed" "Vault should be unsealed"
}

# Test 2: KV v2 secrets engine
test_kv_engine_setup() {
    log_info "Testing KV v2 secrets engine..."

    # Enable KV v2 engine
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" \
        cfn-vault-test vault secrets enable -version=2 -path=secret kv

    # Verify engine is enabled
    local engines
    engines=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" \
        cfn-vault-test vault secrets list -format=json)

    assert_contains "$engines" "secret/" "KV engine should be enabled"
}

# Test 3: Transit secrets engine
test_transit_engine_setup() {
    log_info "Testing Transit secrets engine..."

    # Enable Transit engine
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault secrets enable transit

    # Create encryption key
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -f transit/keys/test-key type=aes256-gcm96

    # Verify key exists
    local keys
    keys=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault list transit/keys)

    assert_contains "$keys" "test-key" "Transit key should exist"
}

# Test 4: Create and read secrets
test_secret_creation() {
    log_info "Testing secret creation and retrieval..."

    # Create secret
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/test-key \
        api_key="test-key-value" \
        provider="test" \
        rotation_days=90

    # Read secret
    local secret
    secret=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -format=json secret/test-key)

    local api_key=$(echo "$secret" | jq -r '.data.data.api_key')
    assert_equals "test-key-value" "$api_key" "Secret value should match"
}

# Test 5: Secret versioning
test_secret_versioning() {
    log_info "Testing secret versioning..."

    # Create initial version
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/versioned-key value="v1"

    # Create second version
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/versioned-key value="v2"

    # Read latest version
    local latest
    latest=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -format=json secret/versioned-key)
    local latest_value=$(echo "$latest" | jq -r '.data.data.value')

    assert_equals "v2" "$latest_value" "Latest version should be v2"

    # Read version 1
    local v1
    v1=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -version=1 -format=json secret/versioned-key)
    local v1_value=$(echo "$v1" | jq -r '.data.data.value')

    assert_equals "v1" "$v1_value" "Version 1 should be v1"
}

# Test 6: Transit encryption/decryption
test_transit_encryption() {
    log_info "Testing transit encryption..."

    # Encrypt data
    local plaintext="sensitive-data"
    local encoded=$(echo -n "$plaintext" | base64 -w 0)

    local ciphertext
    ciphertext=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -field=ciphertext \
        transit/encrypt/test-key plaintext="$encoded")

    assert_not_equals "" "$ciphertext" "Ciphertext should not be empty"
    assert_contains "$ciphertext" "vault:v1:" "Ciphertext should have vault prefix"

    # Decrypt data
    local decrypted_encoded
    decrypted_encoded=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -field=plaintext \
        transit/decrypt/test-key ciphertext="$ciphertext")

    local decrypted=$(echo "$decrypted_encoded" | base64 -d)

    assert_equals "$plaintext" "$decrypted" "Decrypted data should match plaintext"
}

# Test 7: Policy creation
test_policy_creation() {
    log_info "Testing policy creation..."

    # Create policy
    cat > /tmp/test-policy.hcl <<'EOF'
path "secret/data/test/*" {
  capabilities = ["read"]
}
EOF

    docker exec -i -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault policy write test-policy - < /tmp/test-policy.hcl

    # Verify policy exists
    local policies
    policies=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault policy list)

    assert_contains "$policies" "test-policy" "Policy should exist"

    rm /tmp/test-policy.hcl
}

# Test 8: Token with policy
test_token_with_policy() {
    log_info "Testing token with policy..."

    # Create secret that should be accessible
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/test/allowed key="value"

    # Create secret that should not be accessible
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/forbidden key="value"

    # Create token with policy
    local token
    token=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault token create \
        -policy=test-policy \
        -format=json | jq -r '.auth.client_token')

    # Test allowed access
    local allowed_result
    allowed_result=$(docker exec -e VAULT_TOKEN="$token" cfn-vault-test \
        vault kv get -format=json secret/test/allowed 2>&1 || echo "FAILED")

    assert_not_contains "$allowed_result" "permission denied" "Should allow access to test/*"

    # Test forbidden access
    local forbidden_result
    forbidden_result=$(docker exec -e VAULT_TOKEN="$token" cfn-vault-test \
        vault kv get secret/forbidden 2>&1 || echo "EXPECTED_FAILURE")

    assert_contains "$forbidden_result" "permission denied" "Should deny access to forbidden path"
}

# Test 9: Token TTL and renewal
test_token_ttl() {
    log_info "Testing token TTL and renewal..."

    # Create token with 10s TTL
    local token_json
    token_json=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault token create \
        -ttl=10s -renewable -format=json)

    local token=$(echo "$token_json" | jq -r '.auth.client_token')
    local ttl=$(echo "$token_json" | jq -r '.auth.lease_duration')

    assert_equals "10" "$ttl" "Token TTL should be 10 seconds"

    # Renew token
    local renewed
    renewed=$(docker exec -e VAULT_TOKEN="$token" cfn-vault-test \
        vault token renew -format=json)

    local new_ttl=$(echo "$renewed" | jq -r '.auth.lease_duration')

    # New TTL should be close to 10s (within 2s tolerance)
    if [ "$new_ttl" -ge 8 ] && [ "$new_ttl" -le 10 ]; then
        return 0
    else
        log_error "New TTL ($new_ttl) not in expected range"
        return 1
    fi
}

# Test 10: Secret metadata
test_secret_metadata() {
    log_info "Testing secret metadata..."

    # Create secret
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/with-metadata \
        key="value" \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Set metadata
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test \
        vault kv metadata put -max-versions=5 secret/with-metadata

    # Get metadata
    local metadata
    metadata=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv metadata get -format=json secret/with-metadata)

    local max_versions=$(echo "$metadata" | jq -r '.data.max_versions')

    assert_equals "5" "$max_versions" "Max versions should be 5"
}

# Test 11: Secret deletion and recovery
test_secret_deletion() {
    log_info "Testing secret deletion and recovery..."

    # Create secret
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/deletable key="value"

    # Delete latest version
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv delete secret/deletable

    # Verify deleted (check for deletion indicators)
    local deleted_result
    deleted_result=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get secret/deletable 2>&1 || echo "EXPECTED_FAILURE")

    # Check for any deletion indicator
    if echo "$deleted_result" | grep -q "No value found\|EXPECTED_FAILURE\|deletion_time"; then
        log_info "Secret deletion verified"
    else
        log_error "Secret not deleted properly: $deleted_result"
        return 1
    fi

    # Undelete
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv undelete -versions=1 secret/deletable

    # Verify recovered
    local recovered
    recovered=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -format=json secret/deletable)

    local value=$(echo "$recovered" | jq -r '.data.data.key')
    assert_equals "value" "$value" "Secret should be recovered"
}

# Test 12: Audit logging
test_audit_logging() {
    log_info "Testing audit logging..."

    # Enable file audit backend
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault audit enable file file_path=/tmp/audit.log

    # Perform operation
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/audited key="value"

    # Check audit log
    local audit_log
    audit_log=$(docker exec cfn-vault-test cat /tmp/audit.log)

    assert_not_equals "" "$audit_log" "Audit log should not be empty"
    assert_contains "$audit_log" '"type":"request"' "Audit log should contain request"
    assert_contains "$audit_log" '"type":"response"' "Audit log should contain response"
}

# Test 13: Transit key rotation
test_transit_key_rotation() {
    log_info "Testing transit key rotation..."

    # Get initial version
    local before
    before=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault read -format=json transit/keys/test-key)
    local version_before=$(echo "$before" | jq -r '.data.latest_version')

    # Rotate key
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -f transit/keys/test-key/rotate

    # Get new version
    local after
    after=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault read -format=json transit/keys/test-key)
    local version_after=$(echo "$after" | jq -r '.data.latest_version')

    # Version should increment
    assert_not_equals "$version_before" "$version_after" "Key version should change"

    local expected_version=$((version_before + 1))
    assert_equals "$expected_version" "$version_after" "Key version should increment by 1"
}

# Test 14: Multi-version decryption
test_multi_version_decryption() {
    log_info "Testing decryption across key versions..."

    # Encrypt with version 1
    local plaintext="data-v1"
    local encoded=$(echo -n "$plaintext" | base64 -w 0)

    local ciphertext_v1
    ciphertext_v1=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -field=ciphertext \
        transit/encrypt/test-key plaintext="$encoded")

    # Rotate key
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -f transit/keys/test-key/rotate

    # Encrypt with version 2
    local plaintext2="data-v2"
    local encoded2=$(echo -n "$plaintext2" | base64 -w 0)

    local ciphertext_v2
    ciphertext_v2=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -field=ciphertext \
        transit/encrypt/test-key plaintext="$encoded2")

    # Decrypt both (should work with different key versions)
    local decrypted1
    decrypted1=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -field=plaintext \
        transit/decrypt/test-key ciphertext="$ciphertext_v1" | base64 -d)

    local decrypted2
    decrypted2=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault write -field=plaintext \
        transit/decrypt/test-key ciphertext="$ciphertext_v2" | base64 -d)

    assert_equals "$plaintext" "$decrypted1" "V1 decryption should work"
    assert_equals "$plaintext2" "$decrypted2" "V2 decryption should work"
}

# Test 15: Batch operations
test_batch_operations() {
    log_info "Testing batch secret operations..."

    # Create multiple secrets
    for i in {1..5}; do
        docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put "secret/batch/key-$i" value="value-$i"
    done

    # List secrets
    local list
    list=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv list secret/batch)

    for i in {1..5}; do
        assert_contains "$list" "key-$i" "Batch key-$i should exist"
    done

    # Delete all
    for i in {1..5}; do
        docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv delete "secret/batch/key-$i"
    done

    # Verify all deleted by checking metadata for deletion_time
    for i in {1..5}; do
        local metadata
        metadata=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test \
            vault kv metadata get -format=json "secret/batch/key-$i" 2>/dev/null)

        local deletion_time=$(echo "$metadata" | jq -r '.data.versions."1".deletion_time // empty')

        if [ -n "$deletion_time" ] && [ "$deletion_time" != "n/a" ]; then
            log_info "Batch key-$i confirmed deleted (deletion_time: $deletion_time)"
        else
            log_error "Batch key-$i not deleted (no deletion_time)"
            return 1
        fi
    done
}

# Test 16: Integration test - Full workflow
test_full_workflow() {
    log_info "Testing full secrets management workflow..."

    # 1. Create API key secret
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/workflow/api-key \
        key="initial-key" \
        provider="test-provider" \
        tier="production" \
        rotation_days=90 \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # 2. Read secret
    local secret
    secret=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -format=json secret/workflow/api-key)
    local key=$(echo "$secret" | jq -r '.data.data.key')
    assert_equals "initial-key" "$key" "Initial key should match"

    # 3. Update secret (rotation)
    docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put secret/workflow/api-key \
        key="rotated-key" \
        provider="test-provider" \
        tier="production" \
        rotation_days=90 \
        rotated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # 4. Verify new version
    local rotated
    rotated=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -format=json secret/workflow/api-key)
    local new_key=$(echo "$rotated" | jq -r '.data.data.key')
    assert_equals "rotated-key" "$new_key" "Rotated key should match"

    # 5. Verify version history
    local metadata
    metadata=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv metadata get -format=json secret/workflow/api-key)
    local versions=$(echo "$metadata" | jq -r '.data.versions | length')
    assert_equals "2" "$versions" "Should have 2 versions"

    # 6. Rollback to previous version
    local previous
    previous=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get -version=1 -format=json secret/workflow/api-key)
    local prev_key=$(echo "$previous" | jq -r '.data.data.key')
    assert_equals "initial-key" "$prev_key" "Previous version should be accessible"
}

# Test 17: Performance test - Concurrent operations
test_concurrent_operations() {
    log_info "Testing concurrent secret operations..."

    # Create 10 secrets concurrently
    local pids=()
    for i in {1..10}; do
        (docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv put "secret/concurrent/key-$i" value="value-$i") &
        pids+=($!)
    done

    # Wait for all to complete
    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    # Verify all created
    local list
    list=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv list secret/concurrent)

    local count=0
    for i in {1..10}; do
        if echo "$list" | grep -q "key-$i"; then
            count=$((count + 1))
        fi
    done

    assert_equals "10" "$count" "All 10 concurrent secrets should exist"
}

# Test 18: Error handling - Invalid paths
test_error_handling() {
    log_info "Testing error handling..."

    # Non-existent secret
    local result
    result=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault kv get secret/does-not-exist 2>&1 || echo "EXPECTED_FAILURE")
    assert_contains "$result" "No value found" "Should handle non-existent secret"

    # Invalid policy
    result=$(docker exec -e VAULT_TOKEN="$VAULT_ROOT_TOKEN" -e VAULT_ADDR="$VAULT_ADDR" cfn-vault-test vault policy read non-existent-policy 2>&1 || echo "EXPECTED_FAILURE")
    assert_contains "$result" "No policy named" "Should handle non-existent policy"

    # Invalid token
    result=$(docker exec -e VAULT_TOKEN="invalid-token" cfn-vault-test vault kv get secret/test-key 2>&1 || echo "EXPECTED_FAILURE")
    assert_contains "$result" "permission denied" "Should handle invalid token"
}

# Main execution
main() {
    log_info "Starting Vault Integration Test Suite"
    log_info "======================================="

    # Setup
    setup_vault

    # Run tests
    run_test "Vault Initialization" test_vault_initialization
    run_test "KV v2 Engine Setup" test_kv_engine_setup
    run_test "Transit Engine Setup" test_transit_engine_setup
    run_test "Secret Creation" test_secret_creation
    run_test "Secret Versioning" test_secret_versioning
    run_test "Transit Encryption" test_transit_encryption
    run_test "Policy Creation" test_policy_creation
    run_test "Token with Policy" test_token_with_policy
    run_test "Token TTL" test_token_ttl
    run_test "Secret Metadata" test_secret_metadata
    run_test "Secret Deletion" test_secret_deletion
    run_test "Audit Logging" test_audit_logging
    run_test "Transit Key Rotation" test_transit_key_rotation
    run_test "Multi-Version Decryption" test_multi_version_decryption
    run_test "Batch Operations" test_batch_operations
    run_test "Full Workflow" test_full_workflow
    run_test "Concurrent Operations" test_concurrent_operations
    run_test "Error Handling" test_error_handling

    # Summary
    log_info ""
    log_info "Test Results Summary"
    log_info "===================="
    log_info "Total Tests: $TESTS_RUN"
    log_success "Passed: $TESTS_PASSED"
    if [ $TESTS_FAILED -gt 0 ]; then
        log_error "Failed: $TESTS_FAILED"
    else
        log_info "Failed: $TESTS_FAILED"
    fi

    local pass_rate=$(awk "BEGIN {printf \"%.2f\", ($TESTS_PASSED / $TESTS_RUN) * 100}")
    log_info "Pass Rate: $pass_rate%"

    # Write results to file
    cat > "$TEST_OUTPUT_DIR/vault-integration-results.json" <<EOF
{
  "suite": "vault-integration",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "total": $TESTS_RUN,
  "passed": $TESTS_PASSED,
  "failed": $TESTS_FAILED,
  "pass_rate": $pass_rate
}
EOF

    log_success "Results saved to: $TEST_OUTPUT_DIR/vault-integration-results.json"

    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All tests passed!"
        exit 0
    else
        log_error "Some tests failed"
        exit 1
    fi
}

main "$@"
