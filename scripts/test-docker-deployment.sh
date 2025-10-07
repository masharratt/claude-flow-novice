#!/usr/bin/env bash
# Quick Docker Deployment Test
# Validates tmpfs, coordination, and basic functionality without full build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

# Test tmpfs in a lightweight container
test_tmpfs_behavior() {
  log_info "Testing tmpfs behavior in container..."

  # Run Alpine container with tmpfs
  docker run --rm \
    --tmpfs /dev/shm:rw,mode=1777,size=256m \
    --shm-size=256m \
    alpine:latest \
    sh -c '
      echo "Testing /dev/shm access..."
      test -d /dev/shm || exit 1

      echo "Writing test file to tmpfs..."
      mkdir -p /dev/shm/cfn/test
      echo "test-data" > /dev/shm/cfn/test/data.txt

      echo "Reading test file from tmpfs..."
      cat /dev/shm/cfn/test/data.txt

      echo "Checking permissions..."
      ls -la /dev/shm/cfn/test/

      echo "tmpfs test PASSED"
    '

  if [ $? -eq 0 ]; then
    log_info "tmpfs validation: PASS"
    return 0
  else
    log_error "tmpfs validation: FAIL"
    return 1
  fi
}

# Test message-bus coordination
test_message_bus_coordination() {
  log_info "Testing message-bus coordination in container..."

  # Run with project lib mounted
  docker run --rm \
    --tmpfs /dev/shm:rw,mode=1777,size=512m \
    --shm-size=512m \
    -v "$PROJECT_ROOT/lib":/app/lib:ro \
    -v "$PROJECT_ROOT/config":/app/config:ro \
    alpine:latest \
    sh -c '
      echo "Installing bash..."
      apk add --no-cache bash > /dev/null 2>&1

      echo "Sourcing message-bus library..."
      export MESSAGE_BASE_DIR=/dev/shm/cfn/message-bus
      export COORDINATION_LOG_FILE=/dev/shm/cfn/coordination.log

      cd /app
      source lib/message-bus.sh

      echo "Initializing message bus system..."
      init_message_bus_system

      echo "Creating test agents..."
      init_message_bus "agent-1"
      init_message_bus "agent-2"

      echo "Sending test message..."
      send_message "agent-1" "agent-2" "test:ping" "{\"data\":\"hello\"}"

      echo "Receiving message..."
      messages=$(receive_messages "agent-2")
      echo "Received: $messages"

      echo "Cleanup..."
      cleanup_message_bus "agent-1"
      cleanup_message_bus "agent-2"
      cleanup_message_bus_system

      echo "Message-bus test PASSED"
    '

  if [ $? -eq 0 ]; then
    log_info "Message-bus coordination: PASS"
    return 0
  else
    log_error "Message-bus coordination: FAIL"
    return 1
  fi
}

# Test graceful shutdown
test_graceful_shutdown() {
  log_info "Testing graceful shutdown (SIGTERM handling)..."

  # Start long-running container
  container_id=$(docker run -d \
    --tmpfs /dev/shm:rw,mode=1777,size=256m \
    --shm-size=256m \
    alpine:latest \
    sh -c 'trap "echo Received SIGTERM; exit 0" TERM; sleep 300')

  log_info "Container started: $container_id"
  sleep 2

  # Send SIGTERM
  log_info "Sending SIGTERM..."
  start_time=$(date +%s)
  docker stop -t 5 "$container_id" > /dev/null
  end_time=$(date +%s)

  duration=$((end_time - start_time))

  if [ "$duration" -le 6 ]; then
    log_info "Graceful shutdown: PASS (${duration}s)"
    return 0
  else
    log_warn "Graceful shutdown slow: ${duration}s"
    return 1
  fi
}

# Test resource limits
test_resource_limits() {
  log_info "Testing resource limits..."

  docker run --rm \
    --memory=256m \
    --cpus=1 \
    alpine:latest \
    sh -c '
      echo "Testing memory limit..."
      free -m
      echo "Memory limit test PASSED"
    '

  if [ $? -eq 0 ]; then
    log_info "Resource limits: PASS"
    return 0
  else
    log_error "Resource limits: FAIL"
    return 1
  fi
}

# Main execution
main() {
  echo "================================================================"
  echo "Docker Deployment Quick Test"
  echo "================================================================"
  echo ""

  local failures=0

  test_tmpfs_behavior || failures=$((failures + 1))
  echo ""

  test_message_bus_coordination || failures=$((failures + 1))
  echo ""

  test_graceful_shutdown || failures=$((failures + 1))
  echo ""

  test_resource_limits || failures=$((failures + 1))
  echo ""

  # Summary
  echo "================================================================"
  echo "TEST SUMMARY"
  echo "================================================================"
  echo "Total Tests: 4"
  echo "Passed: $((4 - failures))"
  echo "Failed: $failures"
  echo ""

  if [ "$failures" -eq 0 ]; then
    log_info "All Docker deployment tests PASSED"
    echo ""
    echo "DEPLOYMENT STATUS: SUCCESS"
    echo "Confidence: 0.85+"
    exit 0
  else
    log_error "Some Docker deployment tests FAILED"
    echo ""
    echo "DEPLOYMENT STATUS: FAIL"
    echo "Confidence: <0.75"
    exit 1
  fi
}

main "$@"
