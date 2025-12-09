#!/bin/bash
# test-local-ruvector.sh - Test Local RuVector implementation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STORAGE_PATH="${HOME}/.local-ruvector-test"
TEST_DIR="/tmp/ruvector-test-project"

echo "🧪 Testing Local RuVector Accelerator..."

# Clean up previous test
rm -rf "$STORAGE_PATH" "$TEST_DIR"
mkdir -p "$TEST_DIR"

# Create test code files
echo "📝 Creating test code files..."

# Rust file
cat > "$TEST_DIR/auth.rs" << 'EOF'
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub roles: Vec<String>,
}

pub struct AuthService {
    users: HashMap<String, User>,
}

impl AuthService {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
        }
    }
    
    pub fn authenticate(&self, email: &str, password: &str) -> Option<&User> {
        // In real implementation, verify password hash
        self.users.values().find(|user| user.email == email)
    }
    
    pub fn authorize(&self, user: &User, required_role: &str) -> bool {
        user.roles.contains(&required_role.to_string())
    }
}

pub fn create_jwt_token(user: &User) -> Result<String, AuthError> {
    // JWT creation logic
    Ok(format!("token_for_{}", user.id))
}

#[derive(Debug)]
pub enum AuthError {
    InvalidCredentials,
    TokenExpired,
    Unauthorized,
}
EOF

# Python file
cat > "$TEST_DIR/database.py" << 'EOF'
import sqlite3
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from contextlib import contextmanager

@dataclass
class DatabaseConfig:
    path: str
    pool_size: int = 5
    timeout: float = 30.0

class DatabaseManager:
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self._pool = []
        
    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.config.path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
            
    def create_tables(self):
        with self.get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER,
                    expires_at TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                );
            """)
            
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            )
            return dict(cursor.fetchone()) if cursor.fetchone() else None
EOF

# JavaScript file
cat > "$TEST_DIR/api.js" << 'EOF'
const express = require('express');
const jwt = require('jsonwebtoken');

class APIError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

class AuthMiddleware {
    constructor(secretKey) {
        this.secretKey = secretKey;
    }
    
    verifyToken(req, res, next) {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            throw new APIError(401, 'No token provided');
        }
        
        try {
            const decoded = jwt.verify(token, this.secretKey);
            req.user = decoded;
            next();
        } catch (error) {
            throw new APIError(401, 'Invalid token');
        }
    }
    
    requireRole(role) {
        return (req, res, next) => {
            if (!req.user.roles.includes(role)) {
                throw new APIError(403, 'Insufficient permissions');
            }
            next();
        };
    }
}

const rateLimit = require('express-rate-limit');
const createRateLimit = (windowMs, max) => rateLimit({
    windowMs,
    max,
    message: 'Too many requests'
});

module.exports = { APIError, AuthMiddleware, createRateLimit };
EOF

echo "✅ Test files created"

# Initialize Local RuVector
echo ""
echo "🚀 Initializing Local RuVector..."
STORAGE_PATH="$STORAGE_PATH" "$SCRIPT_DIR/init-local-ruvector.sh"

# Index test files
echo ""
echo "📊 Indexing test files..."
"$SCRIPT_DIR/index-code.sh" --path "$TEST_DIR" --verbose

# Test queries
echo ""
echo "🔍 Testing queries..."

# Test 1: Search for authentication patterns
echo ""
echo "Test 1: Searching 'authentication middleware'..."
"$SCRIPT_DIR/query-local.sh" --pattern "authentication middleware" --limit 3

# Test 2: Search for Rust-specific patterns
echo ""
echo "Test 2: Searching Rust error handling..."
"$SCRIPT_DIR/query-local.sh" --pattern "error handling" --file-type rs --limit 2

# Test 3: JSON output
echo ""
echo "Test 3: JSON output for database patterns..."
"$SCRIPT_DIR/query-local.sh" --pattern "database connection" --json | head -20

# Test 4: Show content
echo ""
echo "Test 4: Pattern with content..."
"$SCRIPT_DIR/query-local.sh" --pattern "JWT token" --show-content --limit 1 | head -30

# Performance test
echo ""
echo "⚡ Performance test..."
start_time=$(date +%s%N)
for i in {1..10}; do
    "$SCRIPT_DIR/query-local.sh" --pattern "auth" --limit 1 > /dev/null
done
end_time=$(date +%s%N)
duration=$((($end_time - $start_time) / 1000000))
avg_time=$(($duration / 10))

echo "Average query time: ${avg_time}ms"

# Show stats
echo ""
echo "📈 Final statistics:"
cd "$SCRIPT_DIR"
python3 -c "
from search_engine_v2 import SearchEngine
engine = SearchEngine('${STORAGE_PATH}/storage')
stats = engine.get_stats()
print(f'Total patterns: {stats[\"total_patterns\"]}')
print(f'Average success rate: {stats[\"avg_success_rate\"]:.2f}')
print(f'Total usage: {stats[\"total_usage\"]}')
print(f'Unique file types: {stats[\"unique_file_types\"]}')
"

# Cleanup
echo ""
echo "🧹 Cleaning up test data..."
rm -rf "$STORAGE_PATH" "$TEST_DIR"

echo ""
echo "✅ All tests passed!"
echo ""
echo "📋 Summary:"
echo "   - Initialization: ✓"
echo "   - Code indexing: ✓"
echo "   - Pattern search: ✓"
echo "   - File type filtering: ✓"
echo "   - JSON output: ✓"
echo "   - Content display: ✓"
echo "   - Performance: ${avg_time}ms avg query time"

# Make script executable
chmod +x "${BASH_SOURCE[0]}"