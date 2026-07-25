# Webapp Testing Skill

**Version:** 1.0.0
**Purpose:** Visual regression testing with screenshot capture, comparison, and baseline management
**Integration:** Playwright + SQLite + Redis coordination

---

## Overview

This skill provides comprehensive web application testing with visual regression detection, screenshot management, and CFN Loop integration. Adapted from Anthropic's webapp-testing skill for Claude Flow Novice's distributed architecture.

### Key Features

- 📸 **Screenshot Capture** - Multi-viewport, multi-state capture with Playwright
- 🔍 **Visual Comparison** - Pixel-level diff detection with similarity scoring
- 📦 **Baseline Management** - Version-controlled reference images with audit trail
- 🔄 **CFN Loop Integration** - Automatic validation in Loop 2, Product Owner review
- 🗄️ **SQLite Storage** - Metadata persistence with efficient querying
- ⚡ **Redis Coordination** - Zero-token agent synchronization
- 🎯 **Naming Convention** - Hierarchical organization for discoverability

---

## Architecture

### Components

```
webapp-testing/
├── SKILL.md                         # This file
├── SCREENSHOT_NAMING_CONVENTION.md  # Naming and storage strategy
├── capture-screenshot.sh            # Playwright screenshot capture
├── compare-screenshots.sh           # Visual diff generation
├── set-baseline.sh                  # Baseline management
├── update-baseline.sh               # Baseline updates with audit
├── init-storage.sh                  # SQLite schema initialization
├── query-screenshots.sh             # Screenshot search/retrieval
├── cleanup-ephemeral.sh             # Remove temporary files
└── test-webapp-testing.sh           # Skill validation tests
```

### Data Flow

```
1. Agent requests screenshot capture
   ↓
2. capture-screenshot.sh
   - Launch Playwright
   - Capture viewport/state
   - Save to .screenshots/current/
   - Store metadata in SQLite
   - Push Redis notification
   ↓
3. compare-screenshots.sh (if baseline exists)
   - Retrieve baseline from SQLite
   - Calculate pixel diff
   - Generate diff image (.screenshots/diffs/)
   - Store comparison result in Redis (TTL: 1h)
   ↓
4. CFN Loop 2 Validator
   - Retrieve comparison results from Redis
   - Review visual diffs
   - Report consensus (approve/iterate)
   ↓
5. Product Owner Decision
   - If changes approved: update-baseline.sh
   - If changes rejected: iterate Loop 3
```

---

## Usage

### 1. Initialize Storage

```bash
# Create SQLite schema and directory structure
./.claude/skills/webapp-testing/init-storage.sh
```

**Output:**
- SQLite table: `webapp_screenshots`
- Directories: `.screenshots/{baselines,current,diffs,archive}/`
- Redis keys initialized

### 2. Capture Screenshot

```bash
./.claude/skills/webapp-testing/capture-screenshot.sh \
  --project "auth-system" \
  --component "login-form" \
  --viewport "1920x1080" \
  --state "default" \
  --variant "light-mode" \
  --url "http://localhost:3000/login" \
  --task-id "cfn-task-123" \
  --agent-id "playwright-tester-456"
```

**Parameters:**

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `--project` | Yes | Application/feature namespace | `auth-system` |
| `--component` | Yes | UI component or page | `login-form` |
| `--viewport` | Yes | Screen dimensions | `1920x1080`, `375x667` |
| `--state` | Yes | Interaction state | `default`, `hover`, `error` |
| `--variant` | No | Theme/A-B variant (default: `default`) | `light-mode`, `dark-mode` |
| `--url` | Yes | Page URL | `http://localhost:3000/login` |
| `--task-id` | No | CFN task ID | `cfn-task-123` |
| `--agent-id` | No | Agent identifier | `playwright-tester-456` |
| `--selector` | No | Specific element to capture | `.login-form` |
| `--wait-for` | No | Selector to wait for before capture | `.submit-button` |
| `--timeout` | No | Playwright timeout (ms, default: 30000) | `60000` |

**Output:**

```json
{
  "screenshot_key": "auth-system/login-form/1920x1080/default/light-mode",
  "file_path": ".screenshots/current/auth-system/login-form/1920x1080/default/light-mode_20251024143022.png",
  "file_hash": "sha256:abc123...",
  "viewport_actual": { "width": 1920, "height": 1080 },
  "captured_at": 1729781422,
  "baseline_exists": false
}
```

### 3. Compare to Baseline

```bash
./.claude/skills/webapp-testing/compare-screenshots.sh \
  --screenshot-key "auth-system/login-form/1920x1080/default/light-mode" \
  --task-id "cfn-task-123"
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--screenshot-key` | Yes | Screenshot identifier (from capture output) |
| `--task-id` | Yes | CFN task ID |
| `--threshold` | No | Similarity threshold 0-1 (default: 0.95) |
| `--ignore-regions` | No | JSON array of regions to ignore |

**Output:**

```json
{
  "screenshot_key": "auth-system/login-form/1920x1080/default/light-mode",
  "similarity_score": 0.987,
  "diff_pixels": 1234,
  "total_pixels": 2073600,
  "diff_percentage": 0.06,
  "status": "passed",
  "diff_path": ".screenshots/diffs/cfn-task-123/auth-system_login-form_1920x1080_default_light-mode_diff.png",
  "baseline_path": ".screenshots/baselines/auth-system/login-form/1920x1080/default/light-mode.png",
  "current_path": ".screenshots/current/auth-system/login-form/1920x1080/default/light-mode_20251024143022.png"
}
```

**Status Values:**
- `passed` - Similarity ≥ threshold
- `failed` - Similarity < threshold
- `no-baseline` - No baseline exists for comparison

### 4. Set Baseline

```bash
./.claude/skills/webapp-testing/set-baseline.sh \
  --screenshot-key "auth-system/login-form/1920x1080/default/light-mode" \
  --reason "Initial baseline for login form component"
```

**Effect:**
1. Copy from `current/` to `baselines/` (remove timestamp)
2. Update SQLite: `baseline = 1`
3. Update Redis cache
4. Archive any previous baseline

### 5. Update Baseline

```bash
./.claude/skills/webapp-testing/update-baseline.sh \
  --screenshot-key "auth-system/login-form/1920x1080/default/light-mode" \
  --new-file ".screenshots/current/auth-system/login-form/1920x1080/default/light-mode_20251024150000.png" \
  --reason "Updated button style per design review (PR #456)" \
  --approved-by "product-owner-agent-789"
```

**Effect:**
1. Archive old baseline to `.screenshots/archive/{YYYY-MM}/`
2. Copy new file to `baselines/`
3. Update SQLite record
4. Clear Redis cache
5. Log to audit trail

---

## CFN Loop Integration

### Loop 3: Implementation

**Frontend developer agent:**

```bash
# Capture screenshots during development
for STATE in default hover error; do
  ./.claude/skills/webapp-testing/capture-screenshot.sh \
    --project "auth-system" \
    --component "login-form" \
    --viewport "1920x1080" \
    --state "$STATE" \
    --variant "light-mode" \
    --url "http://localhost:3000/login" \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID"
done

# Report confidence
CONFIDENCE=0.85
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence "$CONFIDENCE" \
  --iteration 1
```

### Loop 2: Validation

**Reviewer agent:**

```bash
# Compare all screenshots to baselines
COMPARISONS=$(redis-cli keys "screenshot:queue:${TASK_ID}:*" | while read KEY; do
  SCREENSHOT_KEY=$(redis-cli get "$KEY")
  ./.claude/skills/webapp-testing/compare-screenshots.sh \
    --screenshot-key "$SCREENSHOT_KEY" \
    --task-id "$TASK_ID" \
    --threshold 0.95
done)

# Calculate consensus
FAILED_COUNT=$(echo "$COMPARISONS" | jq -r 'select(.status == "failed") | .screenshot_key' | wc -l)
TOTAL_COUNT=$(echo "$COMPARISONS" | jq -s 'length')

if [ "$FAILED_COUNT" -eq 0 ]; then
  CONFIDENCE=0.95
  FEEDBACK="All visual regression tests passed"
else
  CONFIDENCE=0.70
  FEEDBACK="Visual regressions detected in $FAILED_COUNT/$TOTAL_COUNT screenshots. Review diffs in .screenshots/diffs/${TASK_ID}/"
fi

# Report consensus
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence "$CONFIDENCE" \
  --iteration 1
```

### Product Owner Decision

**After Loop 2 consensus ≥ 0.90:**

```bash
# Product Owner reviews visual diffs
DIFF_PATHS=$(redis-cli keys "screenshot:diff:${TASK_ID}:*" | while read KEY; do
  redis-cli get "$KEY" | jq -r '.diff_path'
done)

# Decision logic
if [[ $(echo "$DIFF_PATHS" | wc -l) -eq 0 ]]; then
  # No diffs, proceed
  DECISION="PROCEED"
else
  # Review diffs (Product Owner logic here)
  # For now: if diffs exist, require approval
  echo "Visual changes detected. Review diffs:"
  echo "$DIFF_PATHS"

  # Simulate approval (in production, this would be manual review)
  DECISION="ITERATE"  # or "PROCEED" after approval
fi

# If approved, update baselines
if [ "$DECISION" = "PROCEED" ]; then
  redis-cli keys "screenshot:diff:${TASK_ID}:*" | while read KEY; do
    SCREENSHOT_KEY=$(echo "$KEY" | sed 's/screenshot:diff:[^:]*://')
    CURRENT_FILE=$(redis-cli get "$KEY" | jq -r '.current_path')

    ./.claude/skills/webapp-testing/update-baseline.sh \
      --screenshot-key "$SCREENSHOT_KEY" \
      --new-file "$CURRENT_FILE" \
      --reason "Approved visual changes from task $TASK_ID" \
      --approved-by "product-owner"
  done
fi
```

---

## Redis Coordination

### Keys and Patterns

**Screenshot Capture Queue:**

```bash
# Add screenshot to capture queue
redis-cli lpush "screenshot:queue:${TASK_ID}" \
  "auth-system/login-form/1920x1080/default/light-mode"

# Wait for captures to complete (orchestrator)
redis-cli blpop "screenshot:queue:${TASK_ID}:done" 0
```

**Comparison Results (TTL: 1 hour):**

```bash
# Store comparison result
redis-cli setex "screenshot:diff:${TASK_ID}:${SCREENSHOT_KEY}" 3600 \
  '{"similarity_score": 0.987, "status": "passed", "diff_path": "..."}'

# Retrieve all comparisons for task
redis-cli keys "screenshot:diff:${TASK_ID}:*" | while read KEY; do
  redis-cli get "$KEY"
done | jq -s '.'
```

**Baseline Cache (TTL: 24 hours):**

```bash
# Cache baseline file hash
redis-cli setex "screenshot:baseline:${SCREENSHOT_KEY}" 86400 \
  "sha256:abc123..."

# Retrieve cached hash
CACHED_HASH=$(redis-cli get "screenshot:baseline:${SCREENSHOT_KEY}")
```

**Agent Coordination:**

```bash
# Signal screenshot capture complete
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:screenshot-complete" "1"

# Wait for all agents to complete captures
redis-cli blpop "swarm:${TASK_ID}:all-screenshots-complete" 0
```

---

## SQLite Schema

### Table: `webapp_screenshots`

```sql
CREATE TABLE IF NOT EXISTS webapp_screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_key TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL,
  component TEXT NOT NULL,
  viewport TEXT NOT NULL,
  state TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'default',
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  baseline BOOLEAN DEFAULT 0,
  captured_at INTEGER NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  metadata TEXT,  -- JSON
  UNIQUE(project, component, viewport, state, variant, baseline)
);

CREATE INDEX idx_baseline ON webapp_screenshots(project, component, viewport, state, variant, baseline);
CREATE INDEX idx_task ON webapp_screenshots(task_id);
CREATE INDEX idx_component ON webapp_screenshots(project, component);
CREATE INDEX idx_captured ON webapp_screenshots(captured_at DESC);
```

### Table: `screenshot_audit_log`

```sql
CREATE TABLE IF NOT EXISTS screenshot_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_key TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'created', 'updated', 'archived', 'deleted'
  reason TEXT,
  old_file_hash TEXT,
  new_file_hash TEXT,
  approved_by TEXT,
  created_at INTEGER NOT NULL,
  task_id TEXT,
  metadata TEXT  -- JSON
);

CREATE INDEX idx_audit_screenshot ON screenshot_audit_log(screenshot_key);
CREATE INDEX idx_audit_created ON screenshot_audit_log(created_at DESC);
CREATE INDEX idx_audit_task ON screenshot_audit_log(task_id);
```

---

## Skill Scripts

### `capture-screenshot.sh`

**Purpose:** Capture screenshot with Playwright

**Implementation:**

```bash
#!/bin/bash
set -e

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --component) COMPONENT="$2"; shift 2 ;;
    --viewport) VIEWPORT="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    --variant) VARIANT="${2:-default}"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --selector) SELECTOR="$2"; shift 2 ;;
    --wait-for) WAIT_FOR="$2"; shift 2 ;;
    --timeout) TIMEOUT="${2:-30000}"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$PROJECT" ] || [ -z "$COMPONENT" ] || [ -z "$VIEWPORT" ] || [ -z "$STATE" ] || [ -z "$URL" ]; then
  echo "Error: Missing required parameters"
  echo "Usage: $0 --project <project> --component <component> --viewport <viewport> --state <state> --url <url>"
  exit 1
fi

# Generate screenshot key and paths
VARIANT="${VARIANT:-default}"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
SCREENSHOT_KEY="${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}/${VARIANT}"
OUTPUT_DIR=".screenshots/current/${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}"
OUTPUT_FILE="${OUTPUT_DIR}/${VARIANT}_${TIMESTAMP}.png"

mkdir -p "$OUTPUT_DIR"

# Parse viewport dimensions
IFS='x' read -r WIDTH HEIGHT <<< "$VIEWPORT"

# Capture screenshot with Playwright (inline Node.js script)
node -e "
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: ${WIDTH}, height: ${HEIGHT} }
  });
  const page = await context.newPage();

  await page.goto('${URL}', { waitUntil: 'networkidle', timeout: ${TIMEOUT:-30000} });

  ${WAIT_FOR:+await page.waitForSelector('${WAIT_FOR}', { timeout: ${TIMEOUT:-30000} });}

  // Simulate state if needed
  ${SELECTOR:+const element = await page.locator('${SELECTOR}');}
  if ('${STATE}' === 'hover') {
    await ${SELECTOR:+element}${SELECTOR:-.locator('body')}.hover();
  } else if ('${STATE}' === 'focus') {
    await ${SELECTOR:+element}${SELECTOR:-.locator('input').first()}.focus();
  }

  await page.screenshot({
    path: '${OUTPUT_FILE}',
    ${SELECTOR:+clip: await ${SELECTOR:+element}.boundingBox(),}
    fullPage: ${SELECTOR:+false}${SELECTOR:-true}
  });

  await browser.close();

  console.log(JSON.stringify({
    screenshot_key: '${SCREENSHOT_KEY}',
    file_path: '${OUTPUT_FILE}',
    viewport_actual: { width: ${WIDTH}, height: ${HEIGHT} },
    captured_at: Math.floor(Date.now() / 1000)
  }));
})();
"

# Calculate file hash
FILE_HASH=$(sha256sum "$OUTPUT_FILE" | awk '{print $1}')

# Check if baseline exists
BASELINE_EXISTS=$(sqlite3 ~/.claude/memory/adaptive-context.db \
  "SELECT COUNT(*) FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 1")

# Store metadata in SQLite
METADATA=$(cat <<EOF
{
  "browser": "chromium",
  "viewport_actual": { "width": ${WIDTH}, "height": ${HEIGHT} },
  "url": "${URL}",
  "task_id": "${TASK_ID}",
  "agent_id": "${AGENT_ID}",
  "git_commit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF
)

sqlite3 ~/.claude/memory/adaptive-context.db <<EOF
INSERT INTO webapp_screenshots (
  screenshot_key, project, component, viewport, state, variant,
  file_path, file_hash, baseline, captured_at, task_id, agent_id, metadata
) VALUES (
  '${SCREENSHOT_KEY}', '${PROJECT}', '${COMPONENT}', '${VIEWPORT}', '${STATE}', '${VARIANT}',
  '${OUTPUT_FILE}', 'sha256:${FILE_HASH}', 0, $(date +%s), '${TASK_ID}', '${AGENT_ID}', '${METADATA}'
);
EOF

# Push to Redis queue (for orchestrator tracking)
if [ -n "$TASK_ID" ]; then
  redis-cli lpush "screenshot:queue:${TASK_ID}" "$SCREENSHOT_KEY" > /dev/null
fi

# Output result
cat <<EOF
{
  "screenshot_key": "${SCREENSHOT_KEY}",
  "file_path": "${OUTPUT_FILE}",
  "file_hash": "sha256:${FILE_HASH}",
  "viewport_actual": { "width": ${WIDTH}, "height": ${HEIGHT} },
  "captured_at": $(date +%s),
  "baseline_exists": $([[ "$BASELINE_EXISTS" -eq 1 ]] && echo "true" || echo "false")
}
EOF
```

### `compare-screenshots.sh`

**Purpose:** Compare captured screenshot to baseline

**Implementation:**

```bash
#!/bin/bash
set -e

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --screenshot-key) SCREENSHOT_KEY="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --threshold) THRESHOLD="${2:-0.95}"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Validate
if [ -z "$SCREENSHOT_KEY" ] || [ -z "$TASK_ID" ]; then
  echo "Error: Missing required parameters"
  exit 1
fi

# Get baseline and current paths from SQLite
BASELINE_PATH=$(sqlite3 ~/.claude/memory/adaptive-context.db \
  "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 1")

CURRENT_PATH=$(sqlite3 ~/.claude/memory/adaptive-context.db \
  "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 0 ORDER BY captured_at DESC LIMIT 1")

if [ -z "$BASELINE_PATH" ]; then
  # No baseline exists
  echo '{"status": "no-baseline", "screenshot_key": "'$SCREENSHOT_KEY'"}'
  exit 0
fi

if [ -z "$CURRENT_PATH" ]; then
  echo "Error: No current screenshot found for key: $SCREENSHOT_KEY"
  exit 1
fi

# Generate diff path
DIFF_DIR=".screenshots/diffs/${TASK_ID}"
mkdir -p "$DIFF_DIR"
SCREENSHOT_KEY_FLAT=$(echo "$SCREENSHOT_KEY" | tr '/' '_')
DIFF_PATH="${DIFF_DIR}/${SCREENSHOT_KEY_FLAT}_diff.png"

# Compare using pixelmatch (Node.js)
COMPARISON=$(node -e "
const fs = require('fs');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');

const baseline = PNG.sync.read(fs.readFileSync('${BASELINE_PATH}'));
const current = PNG.sync.read(fs.readFileSync('${CURRENT_PATH}'));
const { width, height } = baseline;
const diff = new PNG({ width, height });

const numDiffPixels = pixelmatch(
  baseline.data, current.data, diff.data, width, height,
  { threshold: 0.1 }
);

fs.writeFileSync('${DIFF_PATH}', PNG.sync.write(diff));

const totalPixels = width * height;
const diffPercentage = (numDiffPixels / totalPixels) * 100;
const similarityScore = 1 - (numDiffPixels / totalPixels);
const status = similarityScore >= ${THRESHOLD} ? 'passed' : 'failed';

console.log(JSON.stringify({
  screenshot_key: '${SCREENSHOT_KEY}',
  similarity_score: similarityScore.toFixed(4),
  diff_pixels: numDiffPixels,
  total_pixels: totalPixels,
  diff_percentage: diffPercentage.toFixed(2),
  status: status,
  diff_path: '${DIFF_PATH}',
  baseline_path: '${BASELINE_PATH}',
  current_path: '${CURRENT_PATH}'
}));
")

# Store in Redis (TTL: 1 hour)
redis-cli setex "screenshot:diff:${TASK_ID}:${SCREENSHOT_KEY}" 3600 "$COMPARISON" > /dev/null

# Output result
echo "$COMPARISON"
```

### `set-baseline.sh`

**Purpose:** Set a screenshot as baseline

**Implementation:**

```bash
#!/bin/bash
set -e

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --screenshot-key) SCREENSHOT_KEY="$2"; shift 2 ;;
    --reason) REASON="$2"; shift 2 ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Validate
if [ -z "$SCREENSHOT_KEY" ]; then
  echo "Error: Missing --screenshot-key"
  exit 1
fi

# Parse screenshot key
IFS='/' read -r PROJECT COMPONENT VIEWPORT STATE VARIANT <<< "$SCREENSHOT_KEY"

# Get current screenshot from SQLite
CURRENT_PATH=$(sqlite3 ~/.claude/memory/adaptive-context.db \
  "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 0 ORDER BY captured_at DESC LIMIT 1")

if [ -z "$CURRENT_PATH" ]; then
  echo "Error: No current screenshot found for key: $SCREENSHOT_KEY"
  exit 1
fi

# Create baseline directory
BASELINE_DIR=".screenshots/baselines/${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}"
mkdir -p "$BASELINE_DIR"
BASELINE_PATH="${BASELINE_DIR}/${VARIANT}.png"

# Copy to baselines (remove timestamp from filename)
cp "$CURRENT_PATH" "$BASELINE_PATH"

# Get file hash
FILE_HASH=$(sha256sum "$BASELINE_PATH" | awk '{print $1}')

# Update SQLite (set as baseline)
sqlite3 ~/.claude/memory/adaptive-context.db <<EOF
INSERT OR REPLACE INTO webapp_screenshots (
  screenshot_key, project, component, viewport, state, variant,
  file_path, file_hash, baseline, captured_at, task_id, agent_id, metadata
)
SELECT
  screenshot_key, project, component, viewport, state, variant,
  '${BASELINE_PATH}', 'sha256:${FILE_HASH}', 1, $(date +%s), task_id, agent_id, metadata
FROM webapp_screenshots
WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 0
ORDER BY captured_at DESC LIMIT 1;

-- Audit log
INSERT INTO screenshot_audit_log (
  screenshot_key, action, reason, new_file_hash, created_at
) VALUES (
  '${SCREENSHOT_KEY}', 'created', '${REASON}', 'sha256:${FILE_HASH}', $(date +%s)
);
EOF

# Clear Redis cache
redis-cli del "screenshot:baseline:${SCREENSHOT_KEY}" > /dev/null

echo '{"status": "baseline-set", "screenshot_key": "'$SCREENSHOT_KEY'", "baseline_path": "'$BASELINE_PATH'"}'
```

---

## Configuration

### `.claude/skills/webapp-testing/config.json`

```json
{
  "storage": {
    "baselines_dir": ".screenshots/baselines",
    "current_dir": ".screenshots/current",
    "diffs_dir": ".screenshots/diffs",
    "archive_dir": ".screenshots/archive",
    "db_path": "~/.claude/memory/adaptive-context.db"
  },
  "defaults": {
    "viewport": "1920x1080",
    "threshold": 0.95,
    "timeout": 30000,
    "variant": "default"
  },
  "viewports": {
    "desktop": "1920x1080",
    "laptop": "1366x768",
    "tablet": "768x1024",
    "mobile": "375x667",
    "mobile-large": "390x844"
  },
  "redis": {
    "ttl_comparison": 3600,
    "ttl_baseline_cache": 86400
  },
  "cleanup": {
    "archive_retention_days": 90,
    "current_retention_hours": 24,
    "diff_retention_hours": 48
  }
}
```

---

## Best Practices

### 1. Screenshot Naming

✅ **DO:**
- Use consistent project/component names
- Follow kebab-case convention
- Include all relevant states

❌ **DON'T:**
- Use spaces or special characters
- Mix naming conventions
- Skip variant specification

### 2. Baseline Management

✅ **DO:**
- Review visual changes before updating baselines
- Document baseline change reasons
- Version control baselines directory
- Archive old baselines before updates

❌ **DON'T:**
- Auto-approve baseline changes without review
- Update baselines without audit trail
- Delete old baselines immediately
- Skip Product Owner approval for visual changes

### 3. CFN Loop Integration

✅ **DO:**
- Capture screenshots in Loop 3 (implementation)
- Compare in Loop 2 (validation)
- Require Product Owner approval for baseline updates
- Store comparison results in Redis for validator review

❌ **DON'T:**
- Update baselines in Loop 3 without validation
- Skip visual regression checks in Loop 2
- Proceed with failed visual tests without iteration
- Mix capture and comparison in same loop

### 4. Performance

✅ **DO:**
- Compress screenshots (pngquant, oxipng)
- Set appropriate Redis TTLs
- Clean up ephemeral files regularly
- Use Redis BLPOP for zero-token coordination

❌ **DON'T:**
- Store uncompressed screenshots
- Keep all test runs indefinitely
- Poll Redis for completion
- Duplicate baselines across tasks

---

## Troubleshooting

### Playwright Installation

```bash
# Install Playwright browsers
npx playwright install chromium

# Verify installation
npx playwright --version
```

### SQLite Schema Issues

```bash
# Reinitialize schema
./.claude/skills/webapp-testing/init-storage.sh --force
```

### Missing Screenshots

```bash
# Query for screenshot
sqlite3 ~/.claude/memory/adaptive-context.db \
  "SELECT * FROM webapp_screenshots WHERE screenshot_key = 'your-key-here'"

# Check filesystem
ls -lah .screenshots/current/your-project/your-component/
```

### Comparison Failures

```bash
# Check if baseline exists
sqlite3 ~/.claude/memory/adaptive-context.db \
  "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = 'your-key' AND baseline = 1"

# Manually set baseline
./.claude/skills/webapp-testing/set-baseline.sh \
  --screenshot-key "your-key" \
  --reason "Initial baseline"
```

---

## Future Enhancements

### Phase 2
- [ ] Multi-viewport capture (single command)
- [ ] Animation frame capture (GIF/video)
- [ ] Component isolation (auto-crop)
- [ ] Playwright trace integration

### Phase 3
- [ ] ML-based anomaly detection
- [ ] Smart diff highlighting
- [ ] Figma → screenshot generation
- [ ] Natural language screenshot queries

---

**Status:** Ready for Implementation
**Dependencies:** Playwright, pngjs, pixelmatch, SQLite, Redis
**Documentation:** See `SCREENSHOT_NAMING_CONVENTION.md`
