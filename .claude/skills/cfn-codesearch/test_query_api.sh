#!/usr/bin/env bash

# Test script for Phase 4 Query API
# This script tests the new query functionality

set -euo pipefail

echo "=== Testing Phase 4 Query API Implementation ==="
echo

# Check if the binary was built
BINARY_PATH="./target/debug/local-codesearch"
if [ ! -f "$BINARY_PATH" ]; then
    echo "❌ Binary not found at $BINARY_PATH"
    echo "Please build the project first with: cargo build"
    exit 1
fi

echo "✅ Binary found at $BINARY_PATH"
echo

# Test 1: Check help for new subcommands
echo "1. Testing help for 'find' subcommand:"
$BINARY_PATH find --help | head -10
echo

echo "2. Testing help for 'refs' subcommand:"
$BINARY_PATH refs --help | head -10
echo

# Test 2: Create a simple test case
echo "3. Creating test data..."
mkdir -p test_code
cat > test_code/sample.rs << 'EOF'
use std::collections::HashMap;

pub struct Album {
    pub id: u32,
    pub title: String,
}

pub fn create_album(id: u32, title: &str) -> Album {
    Album { id, title: title.to_string() }
}

pub fn print_album(album: &Album) {
    println!("Album {}: {}", album.id, album.title);
}

fn main() {
    let album = create_album(1, "Test Album");
    print_album(&album);
}
EOF

echo "✅ Created test_code/sample.rs"
echo

# Test 3: Initialize and index
echo "4. Initializing codesearch..."
$BINARY_PATH init --force
echo

echo "5. Indexing test files..."
$BINARY_PATH index --path test_code --types rs
echo

# Test 4: Test find commands
echo "6. Testing find commands..."

echo "6a. Find functions using type 'Album':"
$BINARY_PATH find --uses-type Album --limit 10
echo

echo "6b. Find callers of function 'create_album':"
$BINARY_PATH find --called-by create_album
echo

echo "6c. Find types from test_code/sample.rs used elsewhere:"
$BINARY_PATH find --types-from test_code/sample.rs
echo

echo "6d. Find public API of test_code module:"
$BINARY_PATH find --public-api test_code --format detailed
echo

# Test 5: Test refs command
echo "7. Testing refs command for 'Album':"
$BINARY_PATH refs Album --format simple
echo

echo "8. Testing refs command with JSON output:"
$BINARY_PATH refs create_album --format json | jq . 2>/dev/null || echo "(jq not available for pretty printing)"
echo

# Cleanup
echo "9. Cleaning up test data..."
rm -rf test_code
$BINARY_PATH reset --confirm 2>/dev/null || true
echo "✅ Cleanup complete"
echo

echo "=== Phase 4 Query API Tests Complete ==="