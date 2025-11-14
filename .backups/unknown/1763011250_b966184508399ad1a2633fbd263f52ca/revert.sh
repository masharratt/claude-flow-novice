#!/bin/bash
# Revert script for src/cli/cfn-context.ts
set -euo pipefail

echo "Reverting file: src/cli/cfn-context.ts"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763011250_b966184508399ad1a2633fbd263f52ca/original" "src/cli/cfn-context.ts"
echo "✅ File reverted successfully"
