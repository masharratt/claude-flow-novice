#!/bin/bash
set -euo pipefail

# Docker MCP Build Script
# Builds all MCP server images and enhanced agent image with MCP clients

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "  Docker MCP Build Script"
echo "========================================="
echo ""

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success")
            echo -e "${GREEN}✓${NC} $message"
            ;;
        "error")
            echo -e "${RED}✗${NC} $message"
            ;;
        "info")
            echo -e "${YELLOW}→${NC} $message"
            ;;
    esac
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    print_status "error" "Docker is not installed or not in PATH"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_status "error" "docker-compose is not installed or not in PATH"
    exit 1
fi

# Navigate to project root
cd "$PROJECT_ROOT"

# Validate MCP configuration exists
if [ ! -f "config/mcp-servers.json" ]; then
    print_status "error" "MCP configuration not found: config/mcp-servers.json"
    exit 1
fi

print_status "success" "Found MCP configuration"

# Build enhanced production Dockerfile with MCP clients
print_status "info" "Building enhanced agent image with MCP clients..."
if docker build -f Dockerfile.production \
    --target production \
    --tag cfn-agent-mcp:latest \
    --tag cfn-agent-mcp:$(date +%Y%m%d) \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --build-arg VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
    --build-arg VERSION="4.1.0-mcp" \
    . 2>&1 | tee /tmp/docker-build-agent.log; then
    print_status "success" "Agent image built successfully"
else
    print_status "error" "Failed to build agent image"
    exit 1
fi

# Build MCP server images from docker-compose
print_status "info" "Building MCP server containers..."
if docker-compose -f docker-compose.production.yml build \
    mcp-playwright \
    mcp-redis-tools \
    mcp-n8n \
    mcp-security-scanner 2>&1 | tee /tmp/docker-build-mcp.log; then
    print_status "success" "MCP server images built successfully"
else
    print_status "error" "Failed to build MCP server images"
    exit 1
fi

# Pull base images that we reference directly
print_status "info" "Pulling base MCP images..."
docker pull mcr.microsoft.com/playwright:v1.40.0-jammy
docker pull redis:7-alpine
docker pull n8nio/n8n:latest
docker pull aquasec/trivy:latest
print_status "success" "Base images pulled"

# Run security scans if Trivy is available
if command -v trivy &> /dev/null; then
    print_status "info" "Running security scans with Trivy..."

    # Scan agent image
    print_status "info" "Scanning cfn-agent-mcp:latest..."
    if trivy image --severity HIGH,CRITICAL \
        --exit-code 0 \
        --no-progress \
        cfn-agent-mcp:latest > /tmp/trivy-scan-agent.txt 2>&1; then
        print_status "success" "Agent image scan complete"
    else
        print_status "error" "Agent image has vulnerabilities (see /tmp/trivy-scan-agent.txt)"
    fi

    # Scan MCP server images
    for image in mcr.microsoft.com/playwright:v1.40.0-jammy \
                 redis:7-alpine \
                 n8nio/n8n:latest \
                 aquasec/trivy:latest; do
        print_status "info" "Scanning $image..."
        trivy image --severity HIGH,CRITICAL \
            --exit-code 0 \
            --no-progress \
            "$image" > /tmp/trivy-scan-$(echo $image | sed 's/[^a-zA-Z0-9]/-/g').txt 2>&1 || true
    done

    print_status "success" "Security scans complete (results in /tmp/trivy-scan-*.txt)"
else
    print_status "info" "Trivy not found - skipping security scans"
fi

# Summary
echo ""
echo "========================================="
echo "  Build Summary"
echo "========================================="
echo ""

docker images | grep -E "(cfn-agent-mcp|mcp-playwright|mcp-redis-tools|mcp-n8n|mcp-security|playwright|n8n|trivy)" | head -20

echo ""
print_status "success" "Build complete!"
echo ""
echo "Tagged images:"
echo "  - cfn-agent-mcp:latest"
echo "  - cfn-agent-mcp:$(date +%Y%m%d)"
echo ""
echo "MCP Server images ready:"
echo "  - mcp-playwright (mcr.microsoft.com/playwright:v1.40.0-jammy)"
echo "  - mcp-redis-tools (redis:7-alpine)"
echo "  - mcp-n8n (n8nio/n8n:latest)"
echo "  - mcp-security-scanner (aquasec/trivy:latest)"
echo ""
echo "Next steps:"
echo "  1. Run tests: ./scripts/docker-test-mcp.sh"
echo "  2. Deploy: docker-compose -f docker-compose.production.yml up -d"
echo ""
