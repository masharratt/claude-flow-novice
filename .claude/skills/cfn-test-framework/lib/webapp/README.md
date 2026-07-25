# Webapp Testing Skill

Visual regression testing with screenshot capture, comparison, and CFN Loop integration.

## Quick Start

### 1. Install Dependencies

```bash
# Install Playwright browsers
npx playwright install chromium

# Install Node.js dependencies
npm install playwright pngjs pixelmatch
```

### 2. Initialize Storage

```bash
./.claude/skills/webapp-testing/init-storage.sh
```

### 3. Run Tests

```bash
./.claude/skills/webapp-testing/test-webapp-testing.sh
```

## Usage Examples

### Capture Screenshot

```bash
./.claude/skills/webapp-testing/capture-screenshot.sh \
  --project "auth-system" \
  --component "login-form" \
  --viewport "1920x1080" \
  --state "default" \
  --variant "light-mode" \
  --url "http://localhost:3000/login" \
  --task-id "cfn-task-123" \
  --agent-id "frontend-dev-456"
```

### Set Baseline

```bash
./.claude/skills/webapp-testing/set-baseline.sh \
  --screenshot-key "auth-system/login-form/1920x1080/default/light-mode" \
  --reason "Initial baseline for login form"
```

### Compare to Baseline

```bash
./.claude/skills/webapp-testing/compare-screenshots.sh \
  --screenshot-key "auth-system/login-form/1920x1080/default/light-mode" \
  --task-id "cfn-task-123" \
  --threshold 0.95
```

## CFN Loop Integration

### Loop 3 (Implementation)

```bash
# Frontend agent captures screenshots during development
source ./.claude/skills/webapp-testing/cfn-loop-integration.sh

capture_component_screenshots \
  "auth-system" \
  "login-form" \
  "http://localhost:3000/login" \
  "$TASK_ID" \
  "$AGENT_ID" \
  "1920x1080" "375x667"
```

### Loop 2 (Validation)

```bash
# Reviewer compares screenshots and calculates consensus
source ./.claude/skills/webapp-testing/cfn-loop-integration.sh

compare_all_screenshots "$TASK_ID" 0.95
CONSENSUS=$(calculate_validation_consensus "$TASK_ID")
CONFIDENCE=$(echo "$CONSENSUS" | jq -r '.confidence')

echo "Validation confidence: $CONFIDENCE"
```

### Product Owner Decision

```bash
# If approved, update baselines
source ./.claude/skills/webapp-testing/cfn-loop-integration.sh

update_all_baselines \
  "$TASK_ID" \
  "Approved visual changes from PR #123" \
  "product-owner-agent"
```

## Documentation

- **[SKILL.md](./SKILL.md)** - Complete skill specification
- **[SCREENSHOT_NAMING_CONVENTION.md](./SCREENSHOT_NAMING_CONVENTION.md)** - Naming and storage strategy
- **[test-webapp-testing.sh](./test-webapp-testing.sh)** - Validation test suite

## Directory Structure

```
.screenshots/
├── baselines/    # Version controlled reference images
├── current/      # Ephemeral test captures
├── diffs/        # Comparison outputs
└── archive/      # Historical captures (90 day TTL)
```

## Dependencies

- **Playwright** - Browser automation
- **pngjs** - PNG image parsing
- **pixelmatch** - Pixel-level diff detection
- **SQLite** - Metadata storage
- **Redis** - Agent coordination

## Features

✅ Multi-viewport, multi-state capture
✅ Pixel-level visual comparison
✅ Baseline management with audit trail
✅ CFN Loop integration
✅ Redis coordination for zero-token waiting
✅ Hierarchical screenshot naming
✅ SQLite metadata persistence

## Status

**Version:** 1.0.0
**Status:** Ready for Testing
**Last Updated:** 2025-10-24
