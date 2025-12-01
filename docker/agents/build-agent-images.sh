#!/bin/bash
set -euo pipefail

################################################################################
# Agent Image Build Script
#
# Builds all CFN agent-specific Docker images using Linux-native storage for
# optimal WSL2 performance (96% faster: 755s → <20s per image).
#
# Usage:
#   ./build-agent-images.sh [OPTIONS]
#
# Options:
#   --parallel              Build images concurrently (default: sequential)
#   --push                  Push images to registry after build
#   --tag-prefix PREFIX     Add registry prefix (e.g., ghcr.io/org/)
#   --continue-on-error     Don't exit on first build failure
#   --no-cache              Build without Docker cache
#   --images IMAGE1,IMAGE2  Build only specific images (comma-separated)
#   --help                  Show this help message
#
# Examples:
#   ./build-agent-images.sh
#   ./build-agent-images.sh --parallel --push
#   ./build-agent-images.sh --tag-prefix ghcr.io/myorg/ --push
#   ./build-agent-images.sh --images typescript,backend
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="/tmp/cfn-build"

# Default configuration
IMAGES=(typescript backend frontend rust docker python)
PARALLEL=false
PUSH=false
TAG_PREFIX=""
CONTINUE_ON_ERROR=false
NO_CACHE=""
SELECTED_IMAGES=()

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Logging Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

################################################################################
# Helper Functions
################################################################################

show_help() {
    grep '^#' "$0" | grep -v '#!/bin/bash' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Format seconds to human-readable time
format_time() {
    local seconds=$1
    if [ "$seconds" -lt 60 ]; then
        echo "${seconds}s"
    else
        local mins=$((seconds / 60))
        local secs=$((seconds % 60))
        echo "${mins}m ${secs}s"
    fi
}

# Copy project to Linux-native storage for faster builds
prepare_build_context() {
    log_info "Preparing Linux-native build context at $BUILD_DIR"
    local start_time=$(date +%s)

    # Clean and create build directory
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"

    # Use rsync for efficient copy with exclusions
    rsync -a \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='dist' \
        --exclude='build' \
        --exclude='.turbo' \
        --exclude='coverage' \
        --exclude='.artifacts' \
        --exclude='*.log' \
        "$PROJECT_ROOT/" "$BUILD_DIR/"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_success "Build context prepared in $(format_time $duration)"
}

# Clean up Linux-native build directory
cleanup_build_context() {
    if [ -d "$BUILD_DIR" ]; then
        log_info "Cleaning up build context at $BUILD_DIR"
        rm -rf "$BUILD_DIR"
    fi
}

# Build a single agent image
build_image() {
    local image_name=$1
    local dockerfile="Dockerfile.${image_name}"
    local tag="${TAG_PREFIX}cfn-agent:${image_name}"

    log_info "Building ${tag} from ${dockerfile}"
    local start_time=$(date +%s)

    # Check if Dockerfile exists
    if [ ! -f "${BUILD_DIR}/docker/agents/${dockerfile}" ]; then
        log_error "Dockerfile not found: docker/agents/${dockerfile}"
        return 1
    fi

    # Build from Linux-native storage
    if docker build \
        -f "${BUILD_DIR}/docker/agents/${dockerfile}" \
        -t "$tag" \
        ${NO_CACHE} \
        "$BUILD_DIR" 2>&1 | tee "/tmp/build-${image_name}.log"; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "Built ${tag} in $(format_time $duration)"

        # Push if requested
        if [ "$PUSH" = true ]; then
            log_info "Pushing ${tag}"
            if docker push "$tag"; then
                log_success "Pushed ${tag}"
            else
                log_error "Failed to push ${tag}"
                return 1
            fi
        fi

        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_error "Failed to build ${tag} after $(format_time $duration)"
        log_error "Build log saved to /tmp/build-${image_name}.log"
        return 1
    fi
}

# Build all images sequentially
build_sequential() {
    local failed_images=()
    local successful_images=()

    for image in "${SELECTED_IMAGES[@]}"; do
        if build_image "$image"; then
            successful_images+=("$image")
        else
            failed_images+=("$image")
            if [ "$CONTINUE_ON_ERROR" = false ]; then
                log_error "Build failed for ${image}, exiting (use --continue-on-error to continue)"
                return 1
            fi
        fi
    done

    # Summary
    echo ""
    log_info "Build Summary:"
    log_success "Successful: ${#successful_images[@]} (${successful_images[*]})"
    if [ ${#failed_images[@]} -gt 0 ]; then
        log_error "Failed: ${#failed_images[@]} (${failed_images[*]})"
        return 1
    fi
    return 0
}

# Build all images in parallel
build_parallel() {
    log_info "Building ${#SELECTED_IMAGES[@]} images in parallel"
    local pids=()
    local failed_images=()

    # Start all builds
    for image in "${SELECTED_IMAGES[@]}"; do
        build_image "$image" &
        pids+=($!)
    done

    # Wait for all builds to complete
    local all_success=true
    for i in "${!pids[@]}"; do
        local pid=${pids[$i]}
        local image=${SELECTED_IMAGES[$i]}

        if wait "$pid"; then
            log_success "Parallel build completed: ${image}"
        else
            log_error "Parallel build failed: ${image}"
            failed_images+=("$image")
            all_success=false
        fi
    done

    # Summary
    echo ""
    log_info "Parallel Build Summary:"
    if [ "$all_success" = true ]; then
        log_success "All ${#SELECTED_IMAGES[@]} images built successfully"
        return 0
    else
        log_error "Failed images: ${failed_images[*]}"
        return 1
    fi
}

# Create 'latest' alias (points to typescript as default)
create_latest_alias() {
    local typescript_tag="${TAG_PREFIX}cfn-agent:typescript"
    local latest_tag="${TAG_PREFIX}cfn-agent:latest"

    log_info "Creating latest alias → typescript"
    if docker tag "$typescript_tag" "$latest_tag"; then
        log_success "Tagged ${latest_tag}"

        if [ "$PUSH" = true ]; then
            log_info "Pushing ${latest_tag}"
            if docker push "$latest_tag"; then
                log_success "Pushed ${latest_tag}"
            else
                log_error "Failed to push ${latest_tag}"
                return 1
            fi
        fi
        return 0
    else
        log_error "Failed to create latest alias"
        return 1
    fi
}

################################################################################
# Argument Parsing
################################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --parallel)
                PARALLEL=true
                shift
                ;;
            --push)
                PUSH=true
                shift
                ;;
            --tag-prefix)
                TAG_PREFIX="$2"
                shift 2
                ;;
            --continue-on-error)
                CONTINUE_ON_ERROR=true
                shift
                ;;
            --no-cache)
                NO_CACHE="--no-cache"
                shift
                ;;
            --images)
                IFS=',' read -ra SELECTED_IMAGES <<< "$2"
                shift 2
                ;;
            --help|-h)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    # If no specific images selected, build all
    if [ ${#SELECTED_IMAGES[@]} -eq 0 ]; then
        SELECTED_IMAGES=("${IMAGES[@]}")
    fi

    # Validate selected images
    for image in "${SELECTED_IMAGES[@]}"; do
        local valid=false
        for known_image in "${IMAGES[@]}"; do
            if [ "$image" = "$known_image" ]; then
                valid=true
                break
            fi
        done
        if [ "$valid" = false ]; then
            log_error "Unknown image: $image"
            log_info "Available images: ${IMAGES[*]}"
            exit 1
        fi
    done
}

################################################################################
# Main Execution
################################################################################

main() {
    parse_args "$@"

    local overall_start=$(date +%s)

    echo "======================================================================"
    log_info "CFN Agent Image Builder"
    echo "======================================================================"
    log_info "Images to build: ${SELECTED_IMAGES[*]}"
    log_info "Build mode: $([ "$PARALLEL" = true ] && echo "parallel" || echo "sequential")"
    log_info "Push to registry: $PUSH"
    [ -n "$TAG_PREFIX" ] && log_info "Tag prefix: $TAG_PREFIX"
    [ -n "$NO_CACHE" ] && log_warn "Building without cache"
    echo "======================================================================"
    echo ""

    # Trap to ensure cleanup on exit
    trap cleanup_build_context EXIT

    # Prepare build context
    prepare_build_context

    # Build images
    local build_result=0
    if [ "$PARALLEL" = true ]; then
        build_parallel || build_result=$?
    else
        build_sequential || build_result=$?
    fi

    # Create latest alias if typescript was built successfully
    if [ $build_result -eq 0 ]; then
        if printf '%s\n' "${SELECTED_IMAGES[@]}" | grep -q '^typescript$'; then
            create_latest_alias || build_result=$?
        fi
    fi

    # Final summary
    local overall_end=$(date +%s)
    local overall_duration=$((overall_end - overall_start))

    echo ""
    echo "======================================================================"
    if [ $build_result -eq 0 ]; then
        log_success "All builds completed successfully in $(format_time $overall_duration)"
    else
        log_error "Build process completed with errors in $(format_time $overall_duration)"
    fi
    echo "======================================================================"

    exit $build_result
}

main "$@"
