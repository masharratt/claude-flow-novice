#!/bin/bash
# Webapp Testing Skill - Screenshot Comparison
# Purpose: Compare captured screenshot to baseline using pixelmatch, store results in Redis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"
cd "$PROJECT_ROOT"

# Default configuration
THRESHOLD=0.95
IGNORE_REGIONS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --screenshot-key) SCREENSHOT_KEY="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --ignore-regions) IGNORE_REGIONS="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$SCREENSHOT_KEY" ] || [ -z "$TASK_ID" ]; then
  echo "Error: Missing required parameters" >&2
  echo "Usage: $0 --screenshot-key <key> --task-id <task-id>" >&2
  echo "" >&2
  echo "Required:" >&2
  echo "  --screenshot-key   Screenshot identifier (e.g., 'auth-system/login-form/1920x1080/default/light-mode')" >&2
  echo "  --task-id          CFN task identifier" >&2
  echo "" >&2
  echo "Optional:" >&2
  echo "  --threshold        Similarity threshold 0.0-1.0 (default: 0.95)" >&2
  echo "  --ignore-regions   JSON array of regions to ignore (e.g., '[{\"x\":0,\"y\":0,\"width\":100,\"height\":50}]')" >&2
  exit 1
fi

DB_PATH="${HOME}/.claude/memory/adaptive-context.db"

# Get baseline path from SQLite
BASELINE_PATH=$(sqlite3 "$DB_PATH" \
  "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 1" 2>/dev/null)

if [ -z "$BASELINE_PATH" ]; then
  # No baseline exists
  echo '{"status": "no-baseline", "screenshot_key": "'"$SCREENSHOT_KEY"'", "message": "No baseline found for comparison. Use set-baseline.sh to create one."}' | jq '.'
  exit 0
fi

# Get current screenshot path from SQLite (most recent non-baseline)
CURRENT_PATH=$(sqlite3 "$DB_PATH" \
  "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 0 ORDER BY captured_at DESC LIMIT 1" 2>/dev/null)

if [ -z "$CURRENT_PATH" ]; then
  echo "Error: No current screenshot found for key: $SCREENSHOT_KEY" >&2
  echo "Hint: Run capture-screenshot.sh first to create a capture" >&2
  exit 1
fi

# Verify files exist
if [ ! -f "$BASELINE_PATH" ]; then
  echo "Error: Baseline file not found: $BASELINE_PATH" >&2
  exit 1
fi

if [ ! -f "$CURRENT_PATH" ]; then
  echo "Error: Current screenshot file not found: $CURRENT_PATH" >&2
  exit 1
fi

# Generate diff path
DIFF_DIR=".screenshots/diffs/${TASK_ID}"
mkdir -p "$DIFF_DIR"
SCREENSHOT_KEY_FLAT=$(echo "$SCREENSHOT_KEY" | tr '/' '_')
DIFF_PATH="${DIFF_DIR}/${SCREENSHOT_KEY_FLAT}_diff.png"

echo "Comparing screenshots:" >&2
echo "  Baseline: $BASELINE_PATH" >&2
echo "  Current:  $CURRENT_PATH" >&2
echo "  Diff:     $DIFF_PATH" >&2

# Compare using pixelmatch (Node.js)
COMPARISON=$(node -e "
const fs = require('fs');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');

try {
  const baseline = PNG.sync.read(fs.readFileSync('${BASELINE_PATH}'));
  const current = PNG.sync.read(fs.readFileSync('${CURRENT_PATH}'));

  // Validate dimensions match
  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.error(JSON.stringify({
      status: 'error',
      message: 'Screenshot dimensions do not match',
      baseline_dimensions: { width: baseline.width, height: baseline.height },
      current_dimensions: { width: current.width, height: current.height }
    }));
    process.exit(1);
  }

  const { width, height } = baseline;
  const diff = new PNG({ width, height });

  // Configure pixelmatch options
  const options = {
    threshold: 0.1,  // Sensitivity (0 = strict, 1 = lenient)
    includeAA: true,  // Include anti-aliasing
    alpha: 0.1,
    aaColor: [255, 255, 0],
    diffColor: [255, 0, 0]
  };

  ${IGNORE_REGIONS:+
  // Apply ignore regions (mask pixels)
  const ignoreRegions = ${IGNORE_REGIONS};
  ignoreRegions.forEach(region => {
    for (let y = region.y; y < region.y + region.height && y < height; y++) {
      for (let x = region.x; x < region.x + region.width && x < width; x++) {
        const idx = (width * y + x) * 4;
        baseline.data[idx] = current.data[idx];
        baseline.data[idx + 1] = current.data[idx + 1];
        baseline.data[idx + 2] = current.data[idx + 2];
      }
    }
  });
  }

  const numDiffPixels = pixelmatch(
    baseline.data, current.data, diff.data, width, height, options
  );

  fs.writeFileSync('${DIFF_PATH}', PNG.sync.write(diff));

  const totalPixels = width * height;
  const diffPercentage = (numDiffPixels / totalPixels) * 100;
  const similarityScore = 1 - (numDiffPixels / totalPixels);
  const status = similarityScore >= ${THRESHOLD} ? 'passed' : 'failed';

  console.log(JSON.stringify({
    screenshot_key: '${SCREENSHOT_KEY}',
    similarity_score: parseFloat(similarityScore.toFixed(4)),
    diff_pixels: numDiffPixels,
    total_pixels: totalPixels,
    diff_percentage: parseFloat(diffPercentage.toFixed(2)),
    threshold: ${THRESHOLD},
    status: status,
    diff_path: '${DIFF_PATH}',
    baseline_path: '${BASELINE_PATH}',
    current_path: '${CURRENT_PATH}',
    compared_at: Math.floor(Date.now() / 1000)
  }));
} catch (error) {
  console.error(JSON.stringify({
    status: 'error',
    message: error.message,
    screenshot_key: '${SCREENSHOT_KEY}'
  }));
  process.exit(1);
}
" 2>&1)

# Check if comparison succeeded
if [ $? -ne 0 ]; then
  echo "Error: Screenshot comparison failed" >&2
  echo "$COMPARISON" >&2
  exit 1
fi

# Extract JSON from output
COMPARISON_JSON=$(echo "$COMPARISON" | grep -E '^\{.*\}$' | tail -n 1)

if [ -z "$COMPARISON_JSON" ]; then
  echo "Error: Failed to parse comparison result" >&2
  echo "Output: $COMPARISON" >&2
  exit 1
fi

# Store in Redis (TTL: 1 hour = 3600 seconds)
redis-cli setex "screenshot:diff:${TASK_ID}:${SCREENSHOT_KEY}" 3600 "$COMPARISON_JSON" > /dev/null 2>&1 || \
  echo "Warning: Failed to store comparison result in Redis" >&2

# Output result (formatted JSON)
echo "$COMPARISON_JSON" | jq '.'

# Return appropriate exit code based on status
STATUS=$(echo "$COMPARISON_JSON" | jq -r '.status')
if [ "$STATUS" = "passed" ]; then
  exit 0
elif [ "$STATUS" = "failed" ]; then
  echo "Visual regression detected: $(echo "$COMPARISON_JSON" | jq -r '.diff_percentage')% difference" >&2
  exit 2  # Non-zero but distinct from error
else
  exit 1
fi
