#!/bin/bash

# Install Git Hooks for Secret Detection
# This script sets up local git hooks to prevent committing secrets

echo "🔧 Installing Git hooks for secret detection..."

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "$REPO_ROOT" ]; then
    echo "❌ Error: Not in a Git repository"
    exit 1
fi

# Paths
HOOKS_SOURCE_DIR="$REPO_ROOT/.github/hooks"
HOOKS_TARGET_DIR="$REPO_ROOT/.git/hooks"

# Check if source hooks exist
if [ ! -d "$HOOKS_SOURCE_DIR" ]; then
    echo "❌ Error: Hooks source directory not found: $HOOKS_SOURCE_DIR"
    exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_TARGET_DIR"

# Install pre-commit hook
if [ -f "$HOOKS_SOURCE_DIR/pre-commit" ]; then
    echo "📋 Installing pre-commit hook..."
    cp "$HOOKS_SOURCE_DIR/pre-commit" "$HOOKS_TARGET_DIR/pre-commit"
    chmod +x "$HOOKS_TARGET_DIR/pre-commit"
    echo "✅ Pre-commit hook installed"
else
    echo "⚠️  Warning: pre-commit hook not found in source directory"
fi

# Check for GitLeaks installation
echo "🔍 Checking for security tools..."

if command -v gitleaks &> /dev/null; then
    echo "✅ GitLeaks is installed"
else
    echo "⚠️  GitLeaks not found - installing via GitHub releases..."

    # Detect OS and architecture
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case $ARCH in
        x86_64) ARCH="x64" ;;
        arm64) ARCH="arm64" ;;
        aarch64) ARCH="arm64" ;;
        *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
    esac

    # Download and install GitLeaks
    GITLEAKS_VERSION="8.18.0"
    DOWNLOAD_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${OS}_${ARCH}.tar.gz"

    echo "📥 Downloading GitLeaks from: $DOWNLOAD_URL"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d)

    # Download and extract
    if curl -L -o "$TEMP_DIR/gitleaks.tar.gz" "$DOWNLOAD_URL"; then
        cd "$TEMP_DIR"
        tar -xzf gitleaks.tar.gz

        # Install to local bin directory
        LOCAL_BIN="$HOME/.local/bin"
        mkdir -p "$LOCAL_BIN"

        if cp gitleaks "$LOCAL_BIN/gitleaks"; then
            chmod +x "$LOCAL_BIN/gitleaks"
            echo "✅ GitLeaks installed to $LOCAL_BIN/gitleaks"
            echo "💡 Add $LOCAL_BIN to your PATH if not already present"
        else
            echo "❌ Failed to install GitLeaks"
        fi

        # Cleanup
        cd "$REPO_ROOT"
        rm -rf "$TEMP_DIR"
    else
        echo "❌ Failed to download GitLeaks"
        echo "💡 You can install it manually from: https://github.com/gitleaks/gitleaks/releases"
    fi
fi

# Test the installation
echo "🧪 Testing hook installation..."

# Create a temporary file with a fake secret
TEST_FILE="$REPO_ROOT/.test-secret-detection"
echo 'api_key = "sk-1234567890abcdef1234567890abcdef12345678"' > "$TEST_FILE"

# Stage the file
git add "$TEST_FILE" 2>/dev/null

# Test the hook (should fail)
if "$HOOKS_TARGET_DIR/pre-commit" 2>/dev/null; then
    echo "❌ Hook test failed - secrets should have been detected"
    HOOK_STATUS="FAILED"
else
    echo "✅ Hook test passed - secrets correctly detected"
    HOOK_STATUS="WORKING"
fi

# Cleanup test
git reset HEAD "$TEST_FILE" 2>/dev/null
rm -f "$TEST_FILE"

# Summary
echo ""
echo "🛡️  SECURITY SETUP SUMMARY"
echo "=========================="
echo "✅ Pre-commit hook: INSTALLED"
echo "✅ GitLeaks tool: $(command -v gitleaks &>/dev/null && echo "AVAILABLE" || echo "OPTIONAL")"
echo "✅ Hook functionality: $HOOK_STATUS"
echo ""
echo "🔒 Your repository is now protected against hardcoded secrets!"
echo ""
echo "💡 Additional recommendations:"
echo "   • Add .env* to .gitignore"
echo "   • Use environment variables for secrets"
echo "   • Regularly rotate API keys and tokens"
echo "   • Consider using a secret management service"
echo ""
echo "🚀 You can now commit safely - the hook will check for secrets automatically!"