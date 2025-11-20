#!/usr/bin/env bash

##############################################################################
# Consensus Checker (TypeScript Wrapper)
# Collects and validates Loop 2 consensus scores
#
# Usage:
#   consensus-ts.sh --scores <score1,score2,...> \
#                   --threshold <0.0-1.0> \
#                   --mode <mvp|standard|enterprise>
#
# Returns:
#   Exit 0: Consensus reached
#   Exit 1: Consensus failed
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$SCRIPT_DIR/../src/helpers"

# Parameters
SCORES=""
THRESHOLD=""
MODE="standard"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --scores) SCORES="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Validation
if [ -z "$SCORES" ]; then
  echo "Error: Missing required parameter --scores" >&2
  exit 1
fi

# Convert comma-separated scores to JSON array
IFS=',' read -ra SCORE_ARRAY <<< "$SCORES"
SCORES_JSON="["
for i in "${!SCORE_ARRAY[@]}"; do
  if [ $i -gt 0 ]; then
    SCORES_JSON+=","
  fi
  SCORES_JSON+="${SCORE_ARRAY[$i]}"
done
SCORES_JSON+="]"

# Build TypeScript invocation
TS_CODE="
import { collectConsensus, validateConsensus } from './consensus';

const scores = $SCORES_JSON;
const mode = '$MODE';
const threshold = ${THRESHOLD:-null};

try {
  const consensus = collectConsensus(scores);
  console.log(\`Consensus Statistics:\`);
  console.log(\`  Count: \${consensus.count}\`);
  console.log(\`  Average: \${consensus.average.toFixed(3)}\`);
  console.log(\`  Min: \${consensus.min.toFixed(3)}\`);
  console.log(\`  Max: \${consensus.max.toFixed(3)}\`);
  console.log();

  const validationParams: any = {
    average: consensus.average,
    mode
  };
  if (threshold !== null) {
    validationParams.threshold = threshold;
  }
  const validation = validateConsensus(validationParams);

  console.log(\`Consensus Validation:\`);
  console.log(\`  Mode: \${validation.mode}\`);
  console.log(\`  Threshold: \${validation.threshold.toFixed(2)}\`);
  console.log(\`  Average: \${validation.average.toFixed(3)}\`);
  console.log(\`  Gap: \${validation.gap >= 0 ? '+' : ''}\${validation.gap.toFixed(3)}\`);
  console.log(\`  Passed: \${validation.passed}\`);
  console.log();

  if (validation.passed) {
    console.log('✅ Consensus REACHED - Loop 2 validation successful');
    process.exit(0);
  } else {
    console.log('❌ Consensus FAILED - Iteration required');
    process.exit(1);
  }
} catch (error: any) {
  console.error('Error:', error.message);
  process.exit(2);
}
"

# Execute TypeScript code
cd "$HELPERS_DIR"
ts-node -e "$TS_CODE"
