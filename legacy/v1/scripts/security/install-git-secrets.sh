#!/bin/bash

# Install and configure git-secrets for the repository
# This prevents committing secrets to version control

set -e

echo "🔐 Installing git-secrets for Claude Flow Novice"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if git-secrets is already installed
if command -v git-secrets &> /dev/null; then
    echo -e "${GREEN}✅ git-secrets is already installed${NC}"
    GIT_SECRETS_INSTALLED=true
else
    echo -e "${YELLOW}⚠️  git-secrets is not installed${NC}"
    GIT_SECRETS_INSTALLED=false
fi

# Install git-secrets if not present
if [ "$GIT_SECRETS_INSTALLED" = false ]; then
    echo -e "${BLUE}📦 Installing git-secrets...${NC}"

    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux (Debian/Ubuntu)
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y git-secrets
        # Linux (RedHat/CentOS)
        elif command -v yum &> /dev/null; then
            sudo yum install -y git-secrets
        # Linux (Arch)
        elif command -v pacman &> /dev/null; then
            sudo pacman -S git-secrets
        else
            # Build from source
            echo -e "${YELLOW}📦 Building git-secrets from source...${NC}"
            cd /tmp
            git clone https://github.com/awslabs/git-secrets.git
            cd git-secrets
            sudo make install
            cd ..
            rm -rf git-secrets
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install git-secrets
        else
            echo -e "${RED}❌ Homebrew not found. Install from: https://brew.sh${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows
        echo -e "${YELLOW}⚠️  For Windows, install git-secrets manually:${NC}"
        echo "   1. Download from: https://github.com/awslabs/git-secrets/releases"
        echo "   2. Add to PATH"
        echo "   3. Re-run this script"
        exit 1
    fi

    echo -e "${GREEN}✅ git-secrets installed successfully${NC}"
fi

# Get repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo ""
echo -e "${BLUE}🔧 Configuring git-secrets for this repository...${NC}"

# Install git-secrets hooks
git secrets --install -f

# Add AWS patterns (default)
git secrets --register-aws || true

# Add custom patterns for Claude Flow Novice
echo -e "${BLUE}📝 Adding custom secret patterns...${NC}"

# Anthropic API Keys
git secrets --add 'sk-ant-api03-[a-zA-Z0-9\-_]{95}'

# Z.ai API Keys
git secrets --add '[a-f0-9]{32}\.[a-zA-Z0-9]{16}'

# NPM Tokens
git secrets --add 'npm_[a-zA-Z0-9]{36}'

# Generic API Keys
git secrets --add '[aA][pP][iI][-_]?[kK][eE][yY]\s*[:=]\s*["\']?[a-zA-Z0-9\-_]{20,}["\']?'

# Generic Secrets
git secrets --add '[sS][eE][cC][rR][eE][tT][-_]?[kK][eE][yY]\s*[:=]\s*["\']?[a-zA-Z0-9\-_]{20,}["\']?'

# Generic Passwords
git secrets --add '[pP][aA][sS][sS][wW][oO][rR][dD]\s*[:=]\s*["\']?[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?]{8,}["\']?'

# Access Tokens
git secrets --add '[aA][cC][cC][eE][sS][sS][-_]?[tT][oO][kK][eE][nN]\s*[:=]\s*["\']?[a-zA-Z0-9\-_]{20,}["\']?'

# Private Keys
git secrets --add -- '-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----'

# Redis Passwords
git secrets --add '[rR][eE][dD][iI][sS][-_]?[pP][aA][sS][sS][wW][oO][rR][dD]\s*[:=]\s*["\']?[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?]{8,}["\']?'

# Database URLs
git secrets --add '(postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^\/]+'

# Add file patterns to scan
git secrets --add --allowed '.env.example'
git secrets --add --allowed '.env.template'
git secrets --add --allowed '.env.sample'
git secrets --add --allowed 'README.md'
git secrets --add --allowed 'docs/'

echo -e "${GREEN}✅ Custom patterns added${NC}"

# Test the configuration
echo ""
echo -e "${BLUE}🧪 Testing git-secrets configuration...${NC}"

# Create a test file with a fake secret
TEST_FILE=".git-secrets-test.txt"
echo "ANTHROPIC_API_KEY=sk-ant-api03-test123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890" > "$TEST_FILE"

if git secrets --scan "$TEST_FILE" 2>&1 | grep -q "ANTHROPIC_API_KEY"; then
    echo -e "${GREEN}✅ git-secrets is working correctly${NC}"
    rm -f "$TEST_FILE"
else
    echo -e "${RED}❌ git-secrets test failed${NC}"
    rm -f "$TEST_FILE"
    exit 1
fi

# Scan existing repository
echo ""
echo -e "${BLUE}🔍 Scanning existing repository for secrets...${NC}"
if git secrets --scan-history; then
    echo -e "${GREEN}✅ No secrets found in repository history${NC}"
else
    echo -e "${RED}❌ SECRETS DETECTED IN REPOSITORY HISTORY!${NC}"
    echo -e "${YELLOW}⚠️  You should remove these secrets immediately:${NC}"
    echo "   1. Use BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/"
    echo "   2. Or git filter-branch to rewrite history"
    echo "   3. Rotate all exposed API keys"
    echo ""
fi

# Create documentation
echo ""
echo -e "${BLUE}📚 Creating documentation...${NC}"

cat > "$REPO_ROOT/docs/security/GIT_SECRETS_SETUP.md" << 'EOF'
# Git Secrets Setup

This repository uses [git-secrets](https://github.com/awslabs/git-secrets) to prevent committing secrets.

## Installation

Run the installation script:

```bash
bash scripts/security/install-git-secrets.sh
```

## Manual Installation

### macOS
```bash
brew install git-secrets
```

### Linux
```bash
# Debian/Ubuntu
sudo apt-get install git-secrets

# RedHat/CentOS
sudo yum install git-secrets

# Build from source
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
sudo make install
```

### Windows
Download from: https://github.com/awslabs/git-secrets/releases

## Configuration

After installation, configure for this repository:

```bash
cd /path/to/claude-flow-novice
git secrets --install
git secrets --register-aws
```

## Custom Patterns

This repository includes custom patterns for:

- Anthropic API Keys
- Z.ai API Keys
- NPM Tokens
- Redis Passwords
- Generic API Keys and Secrets

## Testing

Test the configuration:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-api03-test" > test.txt
git secrets --scan test.txt
rm test.txt
```

## Scanning History

Scan entire repository history:

```bash
git secrets --scan-history
```

## Bypassing (Emergency Only)

To bypass git-secrets (NOT recommended):

```bash
git commit --no-verify
```

## Removing Secrets from History

If secrets are found in history:

1. Use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)
2. Or use git filter-branch
3. Rotate all exposed API keys immediately

## Pre-commit Hook

Git-secrets installs a pre-commit hook automatically that:

1. Scans all staged files for secrets
2. Blocks commits containing secrets
3. Shows which patterns were detected

## Support

For issues with git-secrets:

- GitHub: https://github.com/awslabs/git-secrets
- Claude Flow Novice Issues: https://github.com/ruvnet/claude-flow-novice/issues
EOF

mkdir -p "$REPO_ROOT/docs/security"

echo -e "${GREEN}✅ Documentation created at docs/security/GIT_SECRETS_SETUP.md${NC}"

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ git-secrets installation complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}What was installed:${NC}"
echo "   ✅ git-secrets pre-commit hook"
echo "   ✅ AWS secret patterns"
echo "   ✅ Custom Claude Flow Novice patterns"
echo "   ✅ Documentation"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "   1. Review .env file and ensure no secrets are committed"
echo "   2. Set .env file permissions: chmod 600 .env"
echo "   3. Rotate any API keys that may have been exposed"
echo "   4. Read docs/security/GIT_SECRETS_SETUP.md"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: All team members must install git-secrets!${NC}"
echo ""

exit 0
