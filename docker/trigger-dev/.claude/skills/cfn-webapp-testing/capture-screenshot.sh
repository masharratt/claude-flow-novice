#!/bin/bash
# Webapp Testing Skill - Screenshot Capture
# Purpose: Capture screenshots with Playwright, store metadata in SQLite, coordinate via Redis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.claude/skills/cfn-cfn-.claude/skills/cfn-cfn-.." && pwd)"
cd "$PROJECT_ROOT"

# Default configuration
VARIANT="default"
TIMEOUT=30000
WAIT_FOR=""
SELECTOR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --component) COMPONENT="$2"; shift 2 ;;
    --viewport) VIEWPORT="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    --variant) VARIANT="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --selector) SELECTOR="$2"; shift 2 ;;
    --wait-for) WAIT_FOR="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$PROJECT" ] || [ -z "$COMPONENT" ] || [ -z "$VIEWPORT" ] || [ -z "$STATE" ] || [ -z "$URL" ]; then
  echo "Error: Missing required parameters" >&2
  echo "Usage: $0 --project <project> --component <component> --viewport <viewport> --state <state> --url <url>" >&2
  echo "" >&2
  echo "Required:" >&2
  echo "  --project      Application/feature namespace (e.g., 'auth-system')" >&2
  echo "  --component    UI component or page (e.g., 'login-form')" >&2
  echo "  --viewport     Screen dimensions (e.g., '1920x1080', '375x667')" >&2
  echo "  --state        Interaction state (e.g., 'default', 'hover', 'error')" >&2
  echo "  --url          Page URL (e.g., 'http://localhost:3000/login')" >&2
  echo "" >&2
  echo "Optional:" >&2
  echo "  --variant      Theme/variant (default: 'default')" >&2
  echo "  --task-id      CFN task identifier" >&2
  echo "  --agent-id     Agent identifier" >&2
  echo "  --selector     CSS selector for element capture" >&2
  echo "  --wait-for     CSS selector to wait for before capture" >&2
  echo "  --timeout      Playwright timeout in ms (default: 30000)" >&2
  exit 1
fi

# Generate screenshot key and paths
TIMESTAMP=$(date +%Y%m%d%H%M%S)
SCREENSHOT_KEY="${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}/${VARIANT}"
OUTPUT_DIR=".screenshots/current/${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}"
OUTPUT_FILE="${OUTPUT_DIR}/${VARIANT}_${TIMESTAMP}.png"

mkdir -p "$OUTPUT_DIR"

# Parse viewport dimensions
IFS='x' read -r WIDTH HEIGHT <<< "$VIEWPORT"

# Validate viewport dimensions
if ! [[ "$WIDTH" =~ ^[0-9]+$ ]] || ! [[ "$HEIGHT" =~ ^[0-9]+$ ]]; then
  echo "Error: Invalid viewport format. Expected format: WIDTHxHEIGHT (e.g., 1920x1080)" >&2
  exit 1
fi

# Capture screenshot with Playwright (inline Node.js script)
echo "Capturing screenshot: $SCREENSHOT_KEY" >&2

CAPTURE_RESULT=$(node -e "
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: ${WIDTH}, height: ${HEIGHT} },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  try {
    await page.goto('${URL}', { waitUntil: 'networkidle', timeout: ${TIMEOUT} });

    ${WAIT_FOR:+await page.waitForSelector('${WAIT_FOR}', { timeout: ${TIMEOUT} });}

    // Simulate state if needed
    ${SELECTOR:+const element = await page.locator('${SELECTOR}').first();}
    if ('${STATE}' === 'hover' && '${SELECTOR}') {
      await element.hover();
      await page.waitForTimeout(500);  // Allow hover effects to render
    } else if ('${STATE}' === 'focus' && '${SELECTOR}') {
      await element.focus();
      await page.waitForTimeout(300);
    } else if ('${STATE}' === 'hover' && !'${SELECTOR}') {
      console.error('Warning: hover state requires --selector parameter');
    }

    const screenshotOptions = {
      path: '${OUTPUT_FILE}',
      type: 'png'
    };

    ${SELECTOR:+
    const boundingBox = await element.boundingBox();
    if (boundingBox) {
      screenshotOptions.clip = boundingBox;
    } else {
      console.error('Warning: Selector element not found, capturing full page');
      screenshotOptions.fullPage = true;
    }
    }
    ${SELECTOR:-screenshotOptions.fullPage = true;}

    await page.screenshot(screenshotOptions);

    await browser.close();

    console.log(JSON.stringify({
      screenshot_key: '${SCREENSHOT_KEY}',
      file_path: '${OUTPUT_FILE}',
      viewport_actual: { width: ${WIDTH}, height: ${HEIGHT} },
      captured_at: Math.floor(Date.now() / 1000),
      url: '${URL}',
      state: '${STATE}',
      selector: '${SELECTOR:-null}'
    }));
  } catch (error) {
    await browser.close();
    console.error('Playwright error:', error.message);
    process.exit(1);
  }
})();
" 2>&1)

# Check if capture succeeded
if [ $? -ne 0 ]; then
  echo "Error: Screenshot capture failed" >&2
  echo "$CAPTURE_RESULT" >&2
  exit 1
fi

# Extract JSON from output (ignore stderr warnings)
CAPTURE_JSON=$(echo "$CAPTURE_RESULT" | grep -E '^\{.*\}$' | tail -n 1)

if [ -z "$CAPTURE_JSON" ]; then
  echo "Error: Failed to parse capture result" >&2
  echo "Output: $CAPTURE_RESULT" >&2
  exit 1
fi

# Calculate file hash
if [ ! -f "$OUTPUT_FILE" ]; then
  echo "Error: Screenshot file not created: $OUTPUT_FILE" >&2
  exit 1
fi

FILE_HASH=$(sha256sum "$OUTPUT_FILE" | awk '{print $1}')

# Check if baseline exists
DB_PATH="${HOME}/.claude/memory/adaptive-context.db"
BASELINE_EXISTS=$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 1" 2>/dev/null || echo "0")

# Get git metadata
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')

# Prepare metadata JSON (escape single quotes)
METADATA=$(cat <<EOF | tr '\n' ' ' | sed "s/'/\"/g"
{
  "browser": "chromium",
  "viewport_actual": { "width": ${WIDTH}, "height": ${HEIGHT} },
  "url": "${URL}",
  "state": "${STATE}",
  "selector": "${SELECTOR:-null}",
  "task_id": "${TASK_ID:-null}",
  "agent_id": "${AGENT_ID:-null}",
  "git_commit": "${GIT_COMMIT}",
  "git_branch": "${GIT_BRANCH}",
  "captured_by": "webapp-testing-skill"
}
EOF
)

# Store metadata in SQLite
sqlite3 "$DB_PATH" <<EOF
INSERT INTO webapp_screenshots (
  screenshot_key, project, component, viewport, state, variant,
  file_path, file_hash, baseline, captured_at, task_id, agent_id, metadata
) VALUES (
  '${SCREENSHOT_KEY}',
  '${PROJECT}',
  '${COMPONENT}',
  '${VIEWPORT}',
  '${STATE}',
  '${VARIANT}',
  '${OUTPUT_FILE}',
  'sha256:${FILE_HASH}',
  0,
  $(date +%s),
  '${TASK_ID:-null}',
  '${AGENT_ID:-null}',
  '${METADATA}'
);
EOF

if [ $? -ne 0 ]; then
  echo "Warning: Failed to store metadata in SQLite" >&2
fi

# Push to Redis queue (for orchestrator tracking)
if [ -n "$TASK_ID" ]; then
  redis-cli lpush "screenshot:queue:${TASK_ID}" "$SCREENSHOT_KEY" > /dev/null 2>&1 || echo "Warning: Failed to push to Redis queue" >&2
fi

# Output result (JSON)
cat <<EOF
{
  "screenshot_key": "${SCREENSHOT_KEY}",
  "file_path": "${OUTPUT_FILE}",
  "file_hash": "sha256:${FILE_HASH}",
  "viewport_actual": { "width": ${WIDTH}, "height": ${HEIGHT} },
  "captured_at": $(date +%s),
  "baseline_exists": $([[ "$BASELINE_EXISTS" -eq 1 ]] && echo "true" || echo "false"),
  "url": "${URL}",
  "state": "${STATE}",
  "variant": "${VARIANT}",
  "task_id": "${TASK_ID:-null}",
  "agent_id": "${AGENT_ID:-null}"
}
EOF
