#!/bin/bash
# init-local-ruvector.sh - One-command setup for local RuVector

set -e

STORAGE_PATH="${HOME}/.local-ruvector"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Initializing Local RuVector Accelerator..."

# Create storage directory structure
echo "📁 Creating storage structure at ${STORAGE_PATH}..."
mkdir -p "${STORAGE_PATH}/storage"
mkdir -p "${STORAGE_PATH}/indexes"
mkdir -p "${STORAGE_PATH}/config"

# Create default config
echo "⚙️ Creating default configuration..."
cat > "${STORAGE_PATH}/config/settings.json" << EOF
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

# Initialize Python environment
echo "🐍 Setting up Python environment..."
if command -v python3 &> /dev/null; then
    PYTHON="python3"
elif command -v python &> /dev/null; then
    PYTHON="python"
else
    echo "❌ Error: Python not found. Please install Python 3.7+"
    exit 1
fi

# Install required Python packages
echo "📦 Installing required packages..."
${PYTHON} -m pip install --quiet numpy scikit-learn sqlite3 2>/dev/null || {
    echo "⚠️ Installing required packages system-wide..."
    ${PYTHON} -m pip install numpy scikit-learn
}

# Test imports
echo "🧪 Testing dependencies..."
${PYTHON} -c "
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import sqlite3
print('✅ All dependencies imported successfully')
" || {
    echo "❌ Error: Failed to import required dependencies"
    exit 1
}

# Create CLI links
echo "🔗 Creating CLI commands..."
chmod +x "${SCRIPT_DIR}/index-code.sh"
chmod +x "${SCRIPT_DIR}/query-local.sh"

# Create convenience symlinks
BIN_DIR="${HOME}/.local/bin"
mkdir -p "${BIN_DIR}"

# Remove old symlinks if they exist
rm -f "${BIN_DIR}/index-code" "${BIN_DIR}/query-local"

# Create new symlinks
ln -s "${SCRIPT_DIR}/index-code.sh" "${BIN_DIR}/index-code"
ln -s "${SCRIPT_DIR}/query-local.sh" "${BIN_DIR}/query-local"

# Check if BIN_DIR is in PATH
if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
    echo ""
    echo "⚠️  Add ${BIN_DIR} to your PATH:"
    echo "   export PATH=\"\$PATH:${BIN_DIR}\""
    echo "   echo 'export PATH=\"\$PATH:${BIN_DIR}\"' >> ~/.bashrc"
fi

# Initialize the database
echo "🗄️ Initializing database..."
${PYTHON} -c "
import sys
sys.path.append('${SCRIPT_DIR}')
from search_engine_v2 import SearchEngine
engine = SearchEngine('${STORAGE_PATH}/storage')
print('✅ Database initialized')
"

echo ""
echo "🎉 Local RuVector Accelerator initialized successfully!"
echo ""
echo "📍 Storage location: ${STORAGE_PATH}"
echo "📖 Quick start:"
echo "   index-code --path /path/to/project"
echo "   query-local --pattern 'authentication middleware'"
echo ""
echo "💡 For help:"
echo "   index-code --help"
echo "   query-local --help"
EOF

# Make script executable
chmod +x "${BASH_SOURCE[0]}"