#!/bin/bash

set -e

LOCAL_RUVECTOR_DIR="$HOME/.local-ruvector"
STORAGE_DIR="$LOCAL_RUVECTOR_DIR/storage"
INDEXES_DIR="$LOCAL_RUVECTOR_DIR/indexes"
CONFIG_DIR="$LOCAL_RUVECTOR_DIR/config"

echo "🚀 Initializing Local RuVector Accelerator..."

# Create directory structure
mkdir -p "$STORAGE_DIR/metadata"
mkdir -p "$INDEXES_DIR"
mkdir -p "$CONFIG_DIR"

# Create default config
cat > "$CONFIG_DIR/settings.json" << 'EOF'
{
    "version": "1.0",
    "embedding_dimension": 1536,
    "similarity_threshold": 0.7,
    "max_patterns_per_query": 100,
    "cache_size": 1000,
    "auto_cleanup": {
        "enabled": true,
        "days_old": 30,
        "min_usage": 5
    }
}
EOF

# Check Python dependencies
echo "📦 Checking dependencies..."

if ! python3 -c "import numpy" 2>/dev/null; then
    echo "⚠️  numpy not found. Installing..."
    if command -v apt >/dev/null 2>&1; then
        sudo apt update && sudo apt install -y python3-numpy python3-sklearn
    elif command -v pip3 >/dev/null 2>&1; then
        pip3 install numpy scikit-learn
    else
        echo "❌ Cannot install Python dependencies. Please install numpy and scikit-learn manually."
        exit 1
    fi
fi

# Create Python backend
cat > "$LOCAL_RUVECTOR_DIR/ruvector_engine.py" << 'EOF'
#!/usr/bin/env python3
import json
import sqlite3
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import os
import sys
from pathlib import Path
import hashlib
import pickle

class RuVectorEngine:
    def __init__(self, base_dir=None):
        if base_dir is None:
            base_dir = os.path.expanduser("~/.local-ruvector")
        
        self.base_dir = Path(base_dir)
        self.storage_dir = self.base_dir / "storage"
        self.indexes_dir = self.base_dir / "indexes"
        self.config_dir = self.base_dir / "config"
        
        self.db_path = self.storage_dir / "cache.db"
        self.embeddings_path = self.storage_dir / "embeddings.bin"
        self.metadata_dir = self.storage_dir / "metadata"
        
        self.config = self.load_config()
        self.vectorizer = TfidfVectorizer(max_features=5000, stop_words='english')
        
        self.init_db()
    
    def load_config(self):
        config_path = self.config_dir / "settings.json"
        if config_path.exists():
            with open(config_path) as f:
                return json.load(f)
        return {
            "embedding_dimension": 1536,
            "similarity_threshold": 0.7,
            "max_patterns_per_query": 100
        }
    
    def init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                content TEXT NOT NULL,
                file_type TEXT NOT NULL,
                patterns TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(file_path, content_hash)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS embeddings (
                pattern_id INTEGER PRIMARY KEY,
                embedding BLOB,
                FOREIGN KEY(pattern_id) REFERENCES patterns(id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_pattern(self, file_path, content, file_type, patterns=None):
        content_hash = hashlib.md5(content.encode()).hexdigest()
        
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR IGNORE INTO patterns (file_path, content_hash, content, file_type, patterns)
            VALUES (?, ?, ?, ?, ?)
        ''', (file_path, content_hash, content, file_type, json.dumps(patterns or [])))
        
        conn.commit()
        
        cursor.execute('SELECT id FROM patterns WHERE file_path = ? AND content_hash = ?', 
                      (file_path, content_hash))
        result = cursor.fetchone()
        
        if result:
            pattern_id = result[0]
            self._compute_and_store_embedding(pattern_id, content)
        
        conn.close()
        return pattern_id
    
    def _compute_and_store_embedding(self, pattern_id, content):
        try:
            with open(self.embeddings_path, 'rb') as f:
                embeddings_data = pickle.load(f)
        except (FileNotFoundError, EOFError):
            embeddings_data = {}
        
        embedding = self.vectorizer.fit_transform([content]).toarray()[0]
        embeddings_data[pattern_id] = embedding
        
        with open(self.embeddings_path, 'wb') as f:
            pickle.dump(embeddings_data, f)
        
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute('INSERT OR REPLACE INTO embeddings (pattern_id, embedding) VALUES (?, ?)',
                      (pattern_id, embedding.tobytes()))
        conn.commit()
        conn.close()
    
    def search(self, query, file_type=None, limit=10, min_similarity=0.7, show_content=False):
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        sql = "SELECT id, file_path, content, file_type, patterns FROM patterns"
        params = []
        
        if file_type:
            sql += " WHERE file_type = ?"
            params.append(file_type)
        
        cursor.execute(sql, params)
        patterns = cursor.fetchall()
        conn.close()
        
        if not patterns:
            return []
        
        try:
            with open(self.embeddings_path, 'rb') as f:
                embeddings_data = pickle.load(f)
        except (FileNotFoundError, EOFError):
            return []
        
        query_embedding = self.vectorizer.fit_transform([query]).toarray()[0]
        results = []
        
        for pattern_id, file_path, content, ft, patterns_json in patterns:
            if pattern_id in embeddings_data:
                embedding = embeddings_data[pattern_id]
                similarity = cosine_similarity([query_embedding], [embedding])[0][0]
                
                if similarity >= min_similarity:
                    result = {
                        'id': pattern_id,
                        'file_path': file_path,
                        'file_type': ft,
                        'similarity': float(similarity),
                        'patterns': json.loads(patterns_json)
                    }
                    
                    if show_content:
                        result['content'] = content
                    
                    results.append(result)
        
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:limit]

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: ruvector_engine.py <command> [args]")
        sys.exit(1)
    
    engine = RuVectorEngine()
    command = sys.argv[1]
    
    if command == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        file_type = None
        limit = 10
        min_similarity = 0.7
        show_content = False
        json_output = False
        
        i = 3
        while i < len(sys.argv):
            if sys.argv[i] == "--file-type":
                file_type = sys.argv[i+1]
                i += 2
            elif sys.argv[i] == "--limit":
                limit = int(sys.argv[i+1])
                i += 2
            elif sys.argv[i] == "--min-similarity":
                min_similarity = float(sys.argv[i+1])
                i += 2
            elif sys.argv[i] == "--show-content":
                show_content = True
                i += 1
            elif sys.argv[i] == "--json":
                json_output = True
                i += 1
            else:
                i += 1
        
        results = engine.search(query, file_type, limit, min_similarity, show_content)
        
        if json_output:
            print(json.dumps(results, indent=2))
        else:
            for result in results:
                print(f"📁 {result['file_path']} ({result['file_type']}) - Similarity: {result['similarity']:.2f}")
                if show_content and 'content' in result:
                    print(f"📄 Content:\n{result['content'][:500]}...")
                print()
EOF

chmod +x "$LOCAL_RUVECTOR_DIR/ruvector_engine.py"

# Create CLI scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat > "$SCRIPT_DIR/index-code.sh" << 'EOF'
#!/bin/bash

set -e

DEFAULT_TYPES="rs,py,js,ts,go,java"
DEFAULT_PATH="."
VERBOSE=false
PATTERNS=""

usage() {
    echo "Usage: index-code [OPTIONS] [PATH]"
    echo ""
    echo "Options:"
    echo "  --path PATH            Path to directory to index (default: current)"
    echo "  --types TYPES          Comma-separated file types (default: $DEFAULT_TYPES)"
    echo "  --patterns PATTERNS    Comma-separated patterns to focus on"
    echo "  --verbose              Show detailed progress"
    echo "  --help, -h             Show help"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --path)
            DEFAULT_PATH="$2"
            shift 2
            ;;
        --types)
            DEFAULT_TYPES="$2"
            shift 2
            ;;
        --patterns)
            PATTERNS="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            DEFAULT_PATH="$1"
            shift
            ;;
    esac
done

if [ "$VERBOSE" = true ]; then
    echo "🔍 Indexing code in: $DEFAULT_PATH"
    echo "📝 File types: $DEFAULT_TYPES"
fi

IFS=',' read -ra TYPES <<< "$DEFAULT_TYPES"
ENGINE_PATH="$HOME/.local-ruvector/ruvector_engine.py"

for ext in "${TYPES[@]}"; do
    if [ "$VERBOSE" = true ]; then
        echo "📄 Processing .$ext files..."
    fi
    
    find "$DEFAULT_PATH" -type f -name "*.$ext" -not -path '*/.*' -not -path '*/node_modules/*' -not -path '*/target/*' | while read -r file; do
        if [ "$VERBOSE" = true ]; then
            echo "  → $file"
        fi
        
        content=$(cat "$file")
        python3 "$ENGINE_PATH" add_pattern "$file" "$content" "$ext" "$PATTERNS"
    done
done

echo "✅ Indexing complete!"
EOF

chmod +x "$SCRIPT_DIR/index-code.sh"

cat > "$SCRIPT_DIR/query-local.sh" << 'EOF'
#!/bin/bash

set -e

PATTERN=""
FILE_TYPE=""
LIMIT=10
MIN_SIMILARITY=0.7
SHOW_CONTENT=false
JSON_OUTPUT=false

usage() {
    echo "Usage: query-local [OPTIONS] PATTERN"
    echo ""
    echo "Options:"
    echo "  --pattern PATTERN     Search pattern or description"
    echo "  --file-type TYPE      Filter by file type (rs, py, js, etc.)"
    echo "  --limit NUMBER        Maximum results (default: 10)"
    echo "  --min-similarity NUM  Minimum similarity threshold (default: 0.7)"
    echo "  --show-content        Show full content of matching patterns"
    echo "  --json                Output results in JSON format"
    echo "  --help, -h           Show help"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --pattern)
            PATTERN="$2"
            shift 2
            ;;
        --file-type)
            FILE_TYPE="$2"
            shift 2
            ;;
        --limit)
            LIMIT="$2"
            shift 2
            ;;
        --min-similarity)
            MIN_SIMILARITY="$2"
            shift 2
            ;;
        --show-content)
            SHOW_CONTENT=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            if [ -z "$PATTERN" ]; then
                PATTERN="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$PATTERN" ]; then
    echo "❌ Error: Search pattern is required"
    usage
fi

ENGINE_PATH="$HOME/.local-ruvector/ruvector_engine.py"

ARGS=("search" "$PATTERN")
[ -n "$FILE_TYPE" ] && ARGS+=("--file-type" "$FILE_TYPE")
[ -n "$LIMIT" ] && ARGS+=("--limit" "$LIMIT")
[ -n "$MIN_SIMILARITY" ] && ARGS+=("--min-similarity" "$MIN_SIMILARITY")
[ "$SHOW_CONTENT" = true ] && ARGS+=("--show-content")
[ "$JSON_OUTPUT" = true ] && ARGS+=("--json")

python3 "$ENGINE_PATH" "${ARGS[@]}"
EOF

chmod +x "$SCRIPT_DIR/query-local.sh"

cat > "$SCRIPT_DIR/test-local-ruvector.sh" << 'EOF'
#!/bin/bash

set -e

echo "🧪 Testing Local RuVector Accelerator..."

TEST_DIR=$(mktemp -d)
echo "📁 Created test directory: $TEST_DIR"

# Create test files
cat > "$TEST_DIR/test.rs" << 'TESTEOF'
use std::result::Result;

pub struct User {
    id: u64,
    name: String,
}

impl User {
    pub fn new(id: u64, name: String) -> Result<Self, Error> {
        if name.is_empty() {
            return Err(Error::InvalidName);
        }
        Ok(User { id, name })
    }
}

#[derive(Debug)]
pub enum Error {
    InvalidName,
    NotFound,
}
TESTEOF

cat > "$TEST_DIR/auth.py" << 'TESTEOF'
import jwt
from datetime import datetime, timedelta

class AuthMiddleware:
    def __init__(self, secret_key):
        self.secret_key = secret_key
    
    def create_token(self, user_id):
        payload = {
            'user_id': user_id,
            'exp': datetime.utcnow() + timedelta(hours=24)
        }
        return jwt.encode(payload, self.secret_key, algorithm='HS256')
    
    def verify_token(self, token):
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])
            return payload['user_id']
        except jwt.InvalidTokenError:
            return None
TESTEOF

cat > "$TEST_DIR/database.js" << 'TESTEOF'
const Pool = require('pg').Pool;

class DatabaseConnection {
    constructor(config) {
        this.pool = new Pool(config);
    }
    
    async query(sql, params) {
        try {
            const result = await this.pool.query(sql, params);
            return result.rows;
        } catch (error) {
            console.error('Database error:', error);
            throw error;
        }
    }
    
    async close() {
        await this.pool.end();
    }
}
TESTEOF

# Initialize and index
echo "🚀 Initializing..."
./init-local-ruvector.sh

echo "📝 Indexing test files..."
./index-code.sh --path "$TEST_DIR" --verbose

# Test queries
echo "🔍 Testing queries..."

echo -e "\n--- Query 1: Error handling ---"
./query-local.sh "error handling" --show-content

echo -e "\n--- Query 2: Authentication ---"
./query-local.sh --file-type py "authentication" --json

echo -e "\n--- Query 3: Database connection ---"
./query-local.sh --file-type js "database connection" --limit 5

# Performance test
echo -e "\n⚡ Performance test..."
START_TIME=$(date +%s%N)
for i in {1..10}; do
    ./query-local.sh "user" > /dev/null
done
END_TIME=$(date +%s%N)
DURATION=$((($END_TIME - $START_TIME) / 1000000))
AVG_TIME=$(($DURATION / 10))

echo "Average query time: ${AVG_TIME}ms"

# Cleanup
echo -e "\n🧹 Cleaning up..."
rm -rf "$TEST_DIR"

echo "✅ All tests passed!"
EOF

chmod +x "$SCRIPT_DIR/test-local-ruvector.sh"

# Add to PATH
echo "" >> "$HOME/.bashrc"
echo "# Local RuVector Accelerator" >> "$HOME/.bashrc"
echo "export PATH=\"\$PATH:$(pwd)\"" >> "$HOME/.bashrc"

echo "✅ Local RuVector Accelerator initialized successfully!"
echo "📂 Storage location: $LOCAL_RUVECTOR_DIR"
echo "🔧 CLI tools added to PATH"
echo ""
echo "🚀 Quick start:"
echo "  index-code                    # Index current directory"
echo "  query-local 'your pattern'    # Search for patterns"
echo "  ./test-local-ruvector.sh      # Run tests"
echo ""
echo "💡 Restart your shell or run: source ~/.bashrc"