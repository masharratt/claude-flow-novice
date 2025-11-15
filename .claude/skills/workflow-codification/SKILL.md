# Workflow Codification Skill

## Overview

The Workflow Codification skill provides edge case tracking and cost tracking capabilities for CFN skills. It captures execution failures, detects patterns, generates update proposals, and calculates ROI metrics.

## Components

### 1. Edge Case Tracker (`track-edge-case.sh`)
Captures skill execution failures and generates update proposals for recurring issues.

**Actions:**
- `record` - Record new edge case
- `query` - Query recurring edge cases
- `details` - Get edge case details
- `update-status` - Update edge case status

**Usage:**
```bash
./track-edge-case.sh --action record \
  --skill-name "cfn-coordination" \
  --skill-version "1.0.0" \
  --exit-code 1 \
  --input-params "task-id=123 timeout=30" \
  --error-message "Connection timeout"
```

### 2. Cost Tracking Engine (`track-cost-savings.sh`)
Logs skill executions and calculates ROI metrics.

**Actions:**
- `log` - Log skill execution
- `snapshot` - Generate daily ROI snapshot
- `ranking` - Query per-skill ROI ranking
- `projections` - Calculate monthly/annual projections
- `dashboard` - Export dashboard metrics

**Usage:**
```bash
./track-cost-savings.sh --action log \
  --skill-name "cfn-coordination" \
  --skill-version "1.0.0" \
  --execution-time-ms 150 \
  --exit-code 0 \
  --tokens-avoided 3000
```

### 3. Skill Update Generator (`generate-skill-update.sh`)
Generates comprehensive skill update proposals from edge cases.

**Usage:**
```bash
./generate-skill-update.sh \
  --skill-name "cfn-coordination" \
  --edge-case-hash "abc123..." \
  --occurrence-count 5
```

## Database Schema

**Database Location:** `./workflow-codification.db`

### Tables

1. **edge_cases** - Stores edge case records
2. **skill_executions** - Logs skill execution metrics
3. **roi_snapshots** - Daily ROI summaries

## Dependencies

### Required
- `bash` ≥4.0
- `sqlite3` ≥3.0 (command-line tool)
- `coreutils` (date, sha256sum, bc)

### Installation

**Ubuntu/Debian:**
```bash
apt-get install sqlite3 bc coreutils
```

**macOS:**
```bash
brew install sqlite3 bc coreutils
```

**Alpine:**
```bash
apk add sqlite bash bc coreutils
```

## Environment Variables

- `DB_PATH` - Database location (default: `./workflow-codification.db`)
- `PROPOSALS_DIR` - Proposal output directory (default: `./proposals`)
- `RECURRENCE_THRESHOLD` - Edge case threshold (default: 3)
- `AI_COST_PER_MILLION` - AI cost per 1M tokens (default: 0.50)
- `SCRIPT_COST` - Script execution cost (default: 0.0001)

## Documentation

- **Edge Case Tracking:** `EDGE_CASE_TRACKING.md`
- **Cost Tracking:** `COST_TRACKING.md`

## Version

- **Current Version:** 1.0.0
- **Release Date:** 2025-11-15
- **Status:** Production Ready
