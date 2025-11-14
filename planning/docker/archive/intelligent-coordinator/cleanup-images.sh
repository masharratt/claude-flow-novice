#!/bin/bash

# Docker Image Cleanup Script - Intelligent Coordinator Images
# Purpose: Remove deprecated cfn-intelligent-coordinator Docker images
#
# MANUAL OPERATION REQUIRED:
# This script is intentionally NOT auto-executed. Review before running.
#
# Image cleanup must be done manually to prevent accidental deletion of
# images that may still be referenced in running containers or CI/CD pipelines.

set -euo pipefail

echo "Intelligent Coordinator Docker Image Cleanup"
echo "============================================="
echo ""
echo "WARNING: This will remove Docker images tagged cfn-intelligent-coordinator:*"
echo ""
echo "Step 1: List all intelligent coordinator images"
echo "-----"

docker images | grep -E "cfn-intelligent-coordinator|intelligent-coordinator" || {
  echo "No intelligent coordinator images found."
  echo "No cleanup needed."
  exit 0
}

echo ""
echo "Step 2: Stop and remove containers (if running)"
echo "-----"

RUNNING_CONTAINERS=$(docker ps --filter "name=cfn-coordinator" -q 2>/dev/null || true)
if [ -n "$RUNNING_CONTAINERS" ]; then
  echo "Found running containers: $RUNNING_CONTAINERS"
  echo "Stopping containers..."
  docker stop $RUNNING_CONTAINERS || true
  echo "Removing containers..."
  docker rm $RUNNING_CONTAINERS || true
else
  echo "No running intelligent coordinator containers found."
fi

echo ""
echo "Step 3: MANUAL: Review and remove images"
echo "-----"
echo ""
echo "To remove intelligent coordinator images, run:"
echo ""
echo "  # Remove all cfn-intelligent-coordinator images"
echo "  docker rmi \$(docker images -q -f 'reference=cfn-intelligent-coordinator:*') || true"
echo ""
echo "  # Or remove specific image by tag"
echo "  docker rmi cfn-intelligent-coordinator:latest"
echo ""
echo "Step 4: Verify cleanup"
echo "-----"
echo ""
echo "After running removal commands above, verify:"
echo ""
echo "  docker images | grep intelligent-coordinator"
echo ""
echo "IMPORTANT:"
echo "- Do NOT auto-execute image removal without manual verification"
echo "- Check that no running containers depend on these images"
echo "- Review Docker Compose files and CI/CD configs for references"
echo "- Keep images for 24-48 hours in case of rollback needs"
echo ""
