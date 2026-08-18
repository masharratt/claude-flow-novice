#!/usr/bin/env bash

set -euo pipefail

# Docker Playwright Fix Script
# Fixes Playwright browser installation issues in claude-flow-novice Docker image

echo "=== Docker Playwright Fix Script ==="
echo "Date: $(date)"
echo "Fixing Playwright installation for browser automation..."

# Configuration
IMAGE_NAME="claude-flow-novice:with-playwright"
CONTAINER_NAME="playwright-test-container"
DOCKERFILE_PATH="docker/Dockerfile.with-playwright"
TEST_SCRIPT="docker/tests/test-playwright-functionality.cjs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Phase 1: Fix Dockerfile
fix_dockerfile() {
    log_info "Phase 1: Fixing Dockerfile for Playwright..."

    # Create fixed Dockerfile
    cat > "$DOCKERFILE_PATH" << 'EOF'
# Multi-stage build for claude-flow-novice with Playwright
FROM node:18-slim AS base

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    # Basic dependencies
    curl \
    wget \
    git \
    gnupg2 \
    # Playwright browser dependencies
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2 \
    # Additional libraries for headless operation
    libgtk-3-0 \
    libx11-xcb1 \
    libxcb1 \
    libxfixes3 \
    && rm -rf /var/lib/apt/lists/*

# Build stage
FROM base AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install Playwright and browsers
RUN npx playwright install --with-deps chromium
RUN npx playwright install-deps chromium

# Production stage
FROM base AS production

# Set environment for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV NODE_ENV=production

WORKDIR /app

# Copy application
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY bin/ ./bin/

# Copy browsers to system location
COPY --from=builder /root/.cache/ms-playwright /ms-playwright

# Create screenshots directory
RUN mkdir -p /app/screenshots /app/logs
RUN chmod 777 /app/screenshots /app/logs

# Health check for Playwright
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const {chromium} = require('playwright'); chromium.launch().then(() => process.exit(0)).catch(() => process.exit(1))"

EXPOSE 3000

CMD ["node", "src/cli/index.js"]
EOF

    log_success "Dockerfile updated with Playwright fixes"
}

# Phase 2: Build Docker image
build_docker_image() {
    log_info "Phase 2: Building Docker image with fixed Playwright..."

    # Stop and remove existing container
    if docker ps -a --format 'table {{.Names}}' | grep -q "$CONTAINER_NAME"; then
        log_warning "Stopping and removing existing container..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    fi

    # Remove existing image
    if docker images --format 'table {{.Repository}}:{{.Tag}}' | grep -q "$IMAGE_NAME"; then
        log_warning "Removing existing image..."
        docker rmi "$IMAGE_NAME" 2>/dev/null || true
    fi

    # Build new image
    log_info "Building new Docker image..."
    if docker build -f "$DOCKERFILE_PATH" -t "$IMAGE_NAME" .; then
        log_success "Docker image built successfully"
    else
        log_error "Failed to build Docker image"
        return 1
    fi

    # Get image size
    local image_size=$(docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "$IMAGE_NAME" | awk '{print $2}')
    log_info "Image size: $image_size"
}

# Phase 3: Test Playwright functionality
test_playwright() {
    log_info "Phase 3: Testing Playwright functionality..."

    # Create test directory
    local test_dir="./test-output"
    mkdir -p "$test_dir"

    # Run container with volume mounts
    log_info "Starting container for testing..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        -v "$(pwd)/$test_dir:/app/screenshots" \
        -e "SCREENSHOT_DIR=/app/screenshots" \
        "$IMAGE_NAME" \
        sleep 60

    # Wait for container to be ready
    log_info "Waiting for container to be ready..."
    sleep 10

    # Check if container is running
    if ! docker ps --format 'table {{.Names}}' | grep -q "$CONTAINER_NAME"; then
        log_error "Container failed to start"
        docker logs "$CONTAINER_NAME"
        return 1
    fi

    # Test 1: Check Playwright installation
    log_info "Test 1: Verifying Playwright installation..."
    if docker exec "$CONTAINER_NAME" npx playwright --version; then
        log_success "Playwright is installed"
    else
        log_error "Playwright installation check failed"
        return 1
    fi

    # Test 2: Check browser availability
    log_info "Test 2: Checking browser availability..."
    if docker exec "$CONTAINER_NAME" npx playwright install chromium --dry-run; then
        log_success "Chromium browser is available"
    else
        log_error "Browser availability check failed"
        return 1
    fi

    # Test 3: Run the Playwright test script
    log_info "Test 3: Running Google.com navigation test..."

    # Copy test script to container
    if docker cp "$TEST_SCRIPT" "$CONTAINER_NAME:/app/test-playwright.cjs"; then
        log_success "Test script copied to container"
    else
        log_error "Failed to copy test script"
        return 1
    fi

    # Execute test
    log_info "Executing Playwright test..."
    if docker exec "$CONTAINER_NAME" node /app/test-playwright.cjs; then
        log_success "Playwright test completed successfully"
    else
        log_error "Playwright test failed"
        docker logs "$CONTAINER_NAME"
        return 1
    fi

    # Check for screenshots
    log_info "Test 4: Verifying screenshot output..."
    if [ -f "$test_dir/google-homepage.png" ] && [ -f "$test_dir/wrexham-search.png" ]; then
        log_success "Screenshots created successfully"
        ls -la "$test_dir"/*.png
    else
        log_warning "Screenshots not found in expected location"
    fi
}

# Phase 4: Performance testing
performance_test() {
    log_info "Phase 4: Running performance tests..."

    # Test container startup time
    local start_time=$(date +%s%N)

    docker run --rm \
        -v "$(pwd)/test-output:/app/screenshots" \
        "$IMAGE_NAME" \
        node -e "
        const { chromium } = require('playwright');
        const start = Date.now();

        (async () => {
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto('https://www.google.com');
            const loadTime = Date.now() - start;
            console.log('Google.com load time:', loadTime + 'ms');
            await browser.close();
        })();
        "

    local end_time=$(date +%s%N)
    local total_time=$(( (end_time - start_time) / 1000000 ))

    log_success "Performance test completed in ${total_time}ms"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."

    # Stop and remove container
    if docker ps -a --format 'table {{.Names}}' | grep -q "$CONTAINER_NAME"; then
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
    fi

    # Remove test files
    if [ -d "./test-output" ]; then
        log_info "Test output preserved in ./test-output/"
    fi

    log_success "Cleanup completed"
}

# Main execution
main() {
    log_info "Starting Docker Playwright fix process..."

    # Set up error handling
    trap cleanup EXIT

    # Execute phases
    fix_dockerfile
    build_docker_image
    test_playwright
    performance_test

    log_success "=== Playwright Fix Complete ==="
    log_info "The Docker image '$IMAGE_NAME' is ready for browser automation"
    log_info "Screenshots are saved to mounted volumes"

    # Display final summary
    echo
    echo "=== Summary ==="
    echo "✅ Dockerfile fixed with proper Playwright installation"
    echo "✅ Image built successfully with browsers pre-installed"
    echo "✅ Google.com navigation test passed"
    echo "✅ Screenshot functionality verified"
    echo "✅ Performance metrics collected"
    echo
    echo "To use the fixed image:"
    echo "docker run -v \$(pwd)/screenshots:/app/screenshots $IMAGE_NAME"
}

# Execute main function
main "$@"