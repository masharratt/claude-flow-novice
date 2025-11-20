#!/usr/bin/env bash

##############################################################################
# Deliverable Verifier (TypeScript Wrapper)
# Verifies expected deliverables exist (prevents "consensus on vapor")
#
# Usage:
#   deliverable-verifier-ts.sh --files <file1,file2,...> \
#                              [--expected-types <.ext1,.ext2,...>] \
#                              [--task-type <description>] \
#                              [--require-git-changes]
#
# Returns:
#   Exit 0: Deliverables verified
#   Exit 1: Missing deliverables or validation failed
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$SCRIPT_DIR/../src/helpers"

# Parameters
FILES=""
EXPECTED_TYPES=""
TASK_TYPE=""
REQUIRE_GIT_CHANGES="false"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --files) FILES="$2"; shift 2 ;;
    --expected-types) EXPECTED_TYPES="$2"; shift 2 ;;
    --task-type) TASK_TYPE="$2"; shift 2 ;;
    --require-git-changes) REQUIRE_GIT_CHANGES="true"; shift 1 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Convert comma-separated files to JSON array
if [ -n "$FILES" ]; then
  IFS=',' read -ra FILE_ARRAY <<< "$FILES"
  FILES_JSON="["
  for i in "${!FILE_ARRAY[@]}"; do
    if [ $i -gt 0 ]; then
      FILES_JSON+=","
    fi
    FILES_JSON+="\"${FILE_ARRAY[$i]}\""
  done
  FILES_JSON+="]"
else
  FILES_JSON="[]"
fi

# Convert comma-separated types to JSON array
if [ -n "$EXPECTED_TYPES" ]; then
  IFS=',' read -ra TYPE_ARRAY <<< "$EXPECTED_TYPES"
  TYPES_JSON="["
  for i in "${!TYPE_ARRAY[@]}"; do
    if [ $i -gt 0 ]; then
      TYPES_JSON+=","
    fi
    TYPES_JSON+="\"${TYPE_ARRAY[$i]}\""
  done
  TYPES_JSON+="]"
else
  TYPES_JSON="undefined"
fi

# Build TypeScript invocation
TS_CODE="
import { verifyDeliverables } from './deliverable-verifier';

const result = verifyDeliverables({
  files: $FILES_JSON,
  ${EXPECTED_TYPES:+expectedTypes: $TYPES_JSON,}
  ${TASK_TYPE:+taskType: '$TASK_TYPE',}
  requireGitChanges: $REQUIRE_GIT_CHANGES
});

console.log('Deliverable Verification:');
console.log(\`  Files checked: \${result.files.length}\`);
console.log(\`  Found: \${result.found.length}\`);
console.log(\`  Missing: \${result.missing.length}\`);
if (result.gitChanges !== undefined) {
  console.log(\`  Git changes: \${result.gitChanges}\`);
}
console.log();

if (result.found.length > 0) {
  console.log('Found files:');
  result.found.forEach(file => console.log(\`  ✅ \${file}\`));
  console.log();
}

if (result.missing.length > 0) {
  console.log('Missing files:');
  result.missing.forEach(file => console.log(\`  ❌ \${file}\`));
  console.log();
}

if (result.typeErrors && result.typeErrors.length > 0) {
  console.log('Type errors:');
  result.typeErrors.forEach(file => console.log(\`  ⚠️  \${file}\`));
  console.log();
}

if (result.verified) {
  console.log('✅ Deliverable verification PASSED');
  process.exit(0);
} else {
  console.log('❌ Deliverable verification FAILED');
  if (result.reason) {
    console.log(\`   Reason: \${result.reason}\`);
  }
  process.exit(1);
}
"

# Execute TypeScript code
cd "$HELPERS_DIR"
ts-node -e "$TS_CODE"
