#!/bin/bash
set -eu

# CFN Compilation Error Fixer Installation Script

echo "🔧 Installing CFN Compilation Error Fixer..."
echo "============================================"

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js >= 18.0.0 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
    # Fallback check if semver not available
    if [[ "$NODE_VERSION" < "18.0.0" ]]; then
        echo "❌ Error: Node.js version $NODE_VERSION is too old"
        echo "Please upgrade to Node.js >= 18.0.0"
        exit 1
    fi
fi

echo "✅ Node.js version: $NODE_VERSION"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Make scripts executable
echo ""
echo "🔐 Setting permissions..."
chmod +x bin/fix-errors.sh

# Check optional dependencies
echo ""
echo "🔍 Checking optional dependencies..."

if npm list @cerebras/cerebras_cloud_sdk &> /dev/null; then
    echo "✅ Cerebras SDK installed - LLM processing enabled"
else
    echo "⚠️  Cerebras SDK not installed - fallback mode active"
    echo "   To enable LLM fixes: npm install @cerebras/cerebras_cloud_sdk"
fi

# Installation complete
echo ""
echo "✅ Installation complete!"
echo ""
echo "Quick start:"
echo "  npm run fix:rust          # Fix Rust errors"
echo "  npm run fix:ts            # Fix TypeScript errors"
echo "  npm run fix:rust --dry-run # Preview fixes"
echo ""
echo "For more information, see README.md"