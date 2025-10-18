#!/bin/bash

# Docker Performance Test Runner
# Validates 100-agent CLI coordination in production-like environment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "========================================="
echo "Docker CLI Coordination Validation"
echo "========================================="
echo ""

# Step 1: Build Docker image
echo "Step 1: Building Docker image..."
cd "$PROJECT_ROOT"
docker build -f tests/environment-validation/Dockerfile -t cli-coordination-test:latest .

if [ $? -ne 0 ]; then
  echo "ERROR: Docker build failed"
  exit 1
fi

echo ""
echo "Step 2: Running environment validation..."
docker run --rm --shm-size=1g cli-coordination-test:latest bash -c "
  cd /app/tests/environment-validation && \
  bash validate-environment-simple.sh
"

if [ $? -ne 0 ]; then
  echo "ERROR: Environment validation failed"
  exit 1
fi

echo ""
echo "Step 3: Running 100-agent coordination test..."
docker run --rm --shm-size=1g cli-coordination-test:latest bash -c "
  cd /app/tests/environment-validation && \
  bash test-100-agents.sh
"

if [ $? -eq 0 ]; then
  echo ""
  echo "========================================="
  echo "SUCCESS: All tests passed!"
  echo "Recommendation: GO to Phase 1"
  echo "========================================="
  exit 0
else
  echo ""
  echo "========================================="
  echo "FAILURE: Some tests failed"
  echo "Recommendation: Review results and pivot"
  echo "========================================="
  exit 1
fi
