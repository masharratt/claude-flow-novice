#!/bin/bash
# Linux Native Docker Build Script
# Optimized sync-and-build pattern for WSL2 performance
#
# Solves: Windows mount I/O bottleneck (755s context transfer → <2min total)
# Pattern: Windows (source of truth) → Linux native sync → Docker build
#
# Usage:
#   ./scripts/docker/build-from-linux.sh [OPTIONS]
#
# Options:
#   --no-cache       Build without cache
#   --quiet          Suppress verbose output
#   --sync-only      Only sync files, don't build
#   --build-only     Only build (skip sync)
#   --clean          Remove Linux build directory after build
#   -h, --help       Show this help message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/linux-build.config"

# Load configuration
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo -e "${RED}Error: Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

source "$CONFIG_FILE"

# Parse command line arguments
SYNC_ONLY=false
BUILD_ONLY=false
CLEAN_AFTER_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            BUILD_NO_CACHE=true
            shift
            ;;
        --quiet)
            BUILD_QUIET=true
            BUILD_PROGRESS="plain"
            shift
            ;;
        --sync-only)
            SYNC_ONLY=true
            shift
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --clean)
            CLEAN_AFTER_BUILD=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-cache       Build without cache"
            echo "  --quiet          Suppress verbose output"
            echo "  --sync-only      Only sync files, don't build"
            echo "  --build-only     Only build (skip sync)"
            echo "  --clean          Remove Linux build directory after build"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Timing function
timer_start() {
    TIMER_START=$(date +%s)
}

timer_end() {
    local TIMER_END=$(date +%s)
    local DURATION=$((TIMER_END - TIMER_START))
    echo "$DURATION"
}

# Validate paths
validate_paths() {
    if [[ ! -d "$WINDOWS_PATH" ]]; then
        log_error "Windows source path does not exist: $WINDOWS_PATH"
        exit 1
    fi

    if [[ ! -f "$WINDOWS_PATH/$DOCKERFILE" ]]; then
        log_error "Dockerfile not found: $WINDOWS_PATH/$DOCKERFILE"
        exit 1
    fi
}

# Sync Windows → Linux
sync_to_linux() {
    log_info "Syncing files: Windows → Linux native storage"
    log_info "  Source: $WINDOWS_PATH"
    log_info "  Target: $LINUX_PATH"

    # Build rsync exclude arguments
    local RSYNC_ARGS=("-a" "--delete" "--info=progress2")

    if [[ "$BUILD_QUIET" == "true" ]]; then
        RSYNC_ARGS+=("--quiet")
    fi

    for exclude in "${RSYNC_EXCLUDES[@]}"; do
        RSYNC_ARGS+=("--exclude=$exclude")
    done

    # Create target directory
    mkdir -p "$LINUX_PATH"

    # Start sync timer
    timer_start

    # Execute rsync
    if ! rsync "${RSYNC_ARGS[@]}" "$WINDOWS_PATH/" "$LINUX_PATH/"; then
        log_error "Rsync failed"
        exit 1
    fi

    local SYNC_DURATION=$(timer_end)
    log_success "Sync completed in ${SYNC_DURATION}s"

    # Show sync statistics
    local SYNC_SIZE=$(du -sh "$LINUX_PATH" 2>/dev/null | awk '{print $1}')
    log_info "  Build context size: $SYNC_SIZE"
}

# Build Docker image
build_docker_image() {
    log_info "Building Docker image from Linux native storage"
    log_info "  Build context: $LINUX_PATH"
    log_info "  Dockerfile: $DOCKERFILE"
    log_info "  Image: $IMAGE_NAME:$IMAGE_TAG"

    # Enable BuildKit
    export DOCKER_BUILDKIT="$DOCKER_BUILDKIT"

    # Build docker build arguments
    local BUILD_ARGS=("-f" "$LINUX_PATH/$DOCKERFILE" "-t" "$IMAGE_NAME:$IMAGE_TAG")

    if [[ "$BUILD_NO_CACHE" == "true" ]]; then
        BUILD_ARGS+=("--no-cache")
    fi

    BUILD_ARGS+=("--progress=$BUILD_PROGRESS")
    BUILD_ARGS+=("$LINUX_PATH")

    # Start build timer
    timer_start

    # Execute docker build
    if [[ "$BUILD_QUIET" == "true" ]]; then
        if ! docker build "${BUILD_ARGS[@]}" > /dev/null; then
            log_error "Docker build failed"
            exit 1
        fi
    else
        if ! docker build "${BUILD_ARGS[@]}"; then
            log_error "Docker build failed"
            exit 1
        fi
    fi

    local BUILD_DURATION=$(timer_end)
    log_success "Build completed in ${BUILD_DURATION}s"

    # Show image size
    local IMAGE_SIZE=$(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.Size}}")
    log_info "  Image size: $IMAGE_SIZE"
}

# Cleanup Linux build directory
cleanup_linux_path() {
    if [[ -d "$LINUX_PATH" ]]; then
        log_info "Cleaning up Linux build directory: $LINUX_PATH"
        rm -rf "$LINUX_PATH"
        log_success "Cleanup completed"
    fi
}

# Main execution
main() {
    echo ""
    log_info "=== Linux Native Docker Build ==="
    echo ""

    # Start total timer
    timer_start

    # Validate
    validate_paths

    # Execute workflow
    if [[ "$BUILD_ONLY" == "false" ]]; then
        sync_to_linux
    fi

    if [[ "$SYNC_ONLY" == "false" ]]; then
        echo ""
        build_docker_image
    fi

    # Calculate total time
    local TOTAL_DURATION=$(timer_end)

    echo ""
    log_success "=== Build Workflow Complete ==="
    log_info "  Total time: ${TOTAL_DURATION}s"

    # Performance comparison
    if [[ "$SYNC_ONLY" == "false" && "$BUILD_ONLY" == "false" ]]; then
        echo ""
        log_info "Performance Comparison:"
        log_info "  Old method (Windows mount): ~755s context transfer + build time"
        log_info "  New method (Linux native):  ${TOTAL_DURATION}s total"

        if [[ $TOTAL_DURATION -lt 755 ]]; then
            local IMPROVEMENT=$((755 - TOTAL_DURATION))
            local PERCENT=$(awk "BEGIN {printf \"%.0f\", ($IMPROVEMENT / 755) * 100}")
            log_success "  Performance improvement: ${IMPROVEMENT}s faster (${PERCENT}% reduction)"
        fi
    fi

    # Cleanup if requested
    if [[ "$CLEAN_AFTER_BUILD" == "true" ]]; then
        echo ""
        cleanup_linux_path
    fi

    echo ""
}

# Handle cleanup on exit
trap 'if [[ "$CLEAN_AFTER_BUILD" == "true" ]]; then cleanup_linux_path; fi' EXIT

# Run main
main
