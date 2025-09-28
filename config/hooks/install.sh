#!/bin/bash

# Claude Code DevOps Hooks Installation Script
# Installs and configures the comprehensive hook system

set -e

echo "🚀 Installing Claude Code DevOps Hooks System..."
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "config/hooks/hook-manager.js" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_info "Checking system requirements..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is required but not installed"
    exit 1
else
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    print_warning "npm not found - some features may not work"
else
    print_success "npm found"
fi

# Optional tool checks
print_info "Checking optional tools..."

# JavaScript/TypeScript tools
if command -v prettier &> /dev/null; then
    print_success "Prettier found"
else
    print_warning "Prettier not found - install with: npm install -g prettier"
fi

if command -v eslint &> /dev/null; then
    print_success "ESLint found"
else
    print_warning "ESLint not found - install with: npm install -g eslint"
fi

# Python tools
if command -v python &> /dev/null || command -v python3 &> /dev/null; then
    print_success "Python found"

    if command -v black &> /dev/null; then
        print_success "Black formatter found"
    else
        print_warning "Black not found - install with: pip install black"
    fi

    if command -v flake8 &> /dev/null; then
        print_success "Flake8 linter found"
    else
        print_warning "Flake8 not found - install with: pip install flake8"
    fi

    if command -v mypy &> /dev/null; then
        print_success "MyPy type checker found"
    else
        print_warning "MyPy not found - install with: pip install mypy"
    fi
else
    print_warning "Python not found - Python hooks will be disabled"
fi

# Rust tools
if command -v cargo &> /dev/null; then
    print_success "Cargo found"

    if command -v rustfmt &> /dev/null; then
        print_success "rustfmt found"
    else
        print_warning "rustfmt not found - install with: cargo install rustfmt"
    fi

    # Check for clippy
    if cargo clippy --version &> /dev/null; then
        print_success "Clippy found"
    else
        print_warning "Clippy not found - install with: rustup component add clippy"
    fi
else
    print_warning "Rust/Cargo not found - Rust hooks will be disabled"
fi

# Create necessary directories
print_info "Creating necessary directories..."

# Ensure hooks directory exists
mkdir -p config/hooks

# Create docs directory if it doesn't exist
if [ ! -d "docs" ]; then
    mkdir -p docs
    print_success "Created docs directory"
fi

# Create database directory for communication
mkdir -p database/instances/hooks
print_success "Created database directories"

# Make hook scripts executable
print_info "Making hook scripts executable..."
chmod +x config/hooks/*.js
print_success "Hook scripts are now executable"

# Test the hook system
print_info "Testing hook system installation..."

# Test hook manager
if node config/hooks/hook-manager.js status > /dev/null 2>&1; then
    print_success "Hook manager is working"
else
    print_error "Hook manager test failed"
    exit 1
fi

# Run hook tests
print_info "Running hook validation tests..."
if node config/hooks/hook-test-framework.js > hook-test-results.log 2>&1; then
    print_success "Hook tests passed"
    rm -f hook-test-results.log
else
    print_warning "Some hook tests failed - check hook-test-results.log for details"
fi

# Create sample Claude Code configuration
print_info "Creating sample Claude Code configuration..."

cat > claude-code-hooks-config.json << 'EOF'
{
  "hooks": {
    "pre-edit": "node config/hooks/hook-manager.js execute pre-edit",
    "post-edit": "node config/hooks/hook-manager.js execute post-edit",
    "user-prompt-submit": "npx claude-flow@alpha hooks session-restore --session-id hooks",
    "tool-result": "npx claude-flow@alpha hooks post-edit"
  },
  "hookSettings": {
    "timeout": 30000,
    "logLevel": "info",
    "concurrent": true
  }
}
EOF

print_success "Sample configuration created: claude-code-hooks-config.json"

# Show available commands
echo ""
echo "🎉 Installation complete!"
echo "========================"
echo ""
echo "Available commands:"
echo "  node config/hooks/hook-manager.js status     - Check hook system status"
echo "  node config/hooks/hook-manager.js list       - List all available hooks"
echo "  node config/hooks/hook-manager.js execute post-edit <file>  - Test hooks on a file"
echo "  node config/hooks/hook-test-framework.js     - Run comprehensive tests"
echo ""
echo "Configuration:"
echo "  • Hook configuration: config/hooks/hook-config.json"
echo "  • Claude Code sample: claude-code-hooks-config.json"
echo "  • Documentation: config/hooks/README.md"
echo ""

# Check if Claude Code is available
if command -v claude &> /dev/null; then
    print_info "Claude Code detected - you can now configure hooks"
    echo "  Add the hooks from claude-code-hooks-config.json to your Claude Code settings"
else
    print_info "To use with Claude Code, add the hooks configuration to your Claude Code settings"
fi

echo ""
print_success "Hook system is ready for use!"

# Optional: Show quick test
echo ""
read -p "Would you like to run a quick test? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Running quick test..."

    # Create a test file
    echo "console.log('Hello, hooks!');" > test-file.js

    # Test the hooks
    if node config/hooks/hook-manager.js execute post-edit test-file.js; then
        print_success "Quick test passed!"
    else
        print_warning "Quick test had some issues - check the output above"
    fi

    # Clean up
    rm -f test-file.js
fi

echo ""
echo "🚀 Happy coding with Claude Code hooks!"