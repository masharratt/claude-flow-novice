#!/bin/bash
set -eu

echo "🚀 Rust Error Fixer Integration Tests"
echo "===================================="

# Setup
test_dir="/tmp/rust-fixer-integration-test"
mkdir -p "$test_dir"
cd "$test_dir"

# Create a more realistic Rust project with multiple files
echo -e "\n📁 Creating test Rust project..."

# Cargo.toml
cat > Cargo.toml << 'CARGOEOF'
[package]
name = "integration-test"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-rustls"] }
CARGOEOF

# Create src directory and files
mkdir -p src

# main.rs with errors
cat > src/main.rs << 'RUSTEOF'
mod auth;
mod database;
mod models;

use models::User;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // E0277: Trait not implemented
    let user = User {
        id: 1,
        name: "Test User",
    };
    
    // E0599: Method doesn't exist
    user.save_to_database().await?;
    
    // E0425: Cannot find value
    println!("User count: {}", user_count);
    
    Ok(())
}
RUSTEOF

# models.rs
cat > src/models.rs << 'RUSTEOF'
// E0412: Cannot find type in this scope
pub struct User {
    pub id: i32,
    pub name: String,
}

// E0282: Type annotations needed
impl User {
    pub fn new() -> Self {
        Self {
            id: None,  // Type mismatch
            name: "Default".to_string(),
        }
    }
}
RUSTEOF

# auth.rs
cat > src/auth.rs << 'RUSTEOF'
use std::collections::HashMap;

pub struct AuthService {
    tokens: HashMap<String, String>,
}

impl AuthService {
    pub fn new() -> Self {
        Self {
            tokens: HashMap::new(),
        }
    }
    
    pub fn authenticate(&self, token: &str) -> Result<bool, String> {
        // E0308: Type mismatch
        let is_valid = self.tokens.contains_key(token) == "true";
        
        // E0609: No field
        self.tokens.get_or_insert(token.to_string(), || "".to_string());
        
        Ok(is_valid)
    }
}
RUSTEOF

# database.rs
cat > src/database.rs << 'RUSTEOF'
pub struct DatabaseService {
    connection_string: String,
}

impl DatabaseService {
    pub fn new(connection_string: String) -> Self {
        Self {
            connection_string,
        }
    }
    
    pub async fn connect(&self) -> Result<(), sqlx::Error> {
        // E0061: Wrong number of arguments
        sqlx::postgres::PgPoolOptions::new().connect(&self.connection_string).await?;
        Ok(())
    }
    
    // E0046: Function is not defined
    pub async fn migrate(&self) -> Result<(), Box<dyn std::error::Error>> {
        run_migrations().await?;
        Ok(())
    }
}
RUSTEOF

echo "   ✓ Created test project with multiple error types"

# Check initial error count
echo -e "\n🔍 Initial error count:"
initial_errors=$(cargo check 2>&1 | grep -c "^error\[" || echo "0")
echo "   Found $initial_errors compilation errors"

# Run fixer if environment is set up
if [ -n "${CEREBRAS_API_KEY:-}" ]; then
    echo -e "\n🔧 Running Rust error fixer..."
    cd /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-compilation-error-fixer/lib/fixer
    
    # Update project path to test directory
    sed -i.bak "s|projectPath: .*|projectPath: '$test_dir',|" cerebras-gated-fixer-v2.ts
    
    # Run fixer in dry-run mode first
    echo "   Running in dry-run mode..."
    npx tsx cerebras-gated-fixer-v2.ts --dry-run 2>&1 | head -50
    
    # Check final error count (for comparison)
    cd "$test_dir"
    echo -e "\n📊 Final error count:"
    final_errors=$(cargo check 2>&1 | grep -c "^error\[" || echo "0")
    echo "   $final_errors errors after fix attempt"
    
    # Restore backup
    cd /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-compilation-error-fixer/lib/fixer
    mv cerebras-gated-fixer-v2.ts.bak cerebras-gated-fixer-v2.ts
else
    echo -e "\n⚠️  CEREBRAS_API_KEY not set, skipping fixer execution"
    echo "   To test with actual fixing:"
    echo "   export CEREBRAS_API_KEY=your-key"
    echo "   ./test-rust-fixer-integration.sh"
fi

# Cleanup
echo -e "\n🧹 Cleaning up..."
rm -rf "$test_dir"

echo -e "\n✅ Integration test complete!"
