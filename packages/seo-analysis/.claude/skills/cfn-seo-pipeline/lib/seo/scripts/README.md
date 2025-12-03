# RuVector SEO Maintenance Scripts

## ruvector-maintenance.sh

Automated maintenance script for RuVector-indexed SEO intelligence collections.

### Features

1. **Weekly Freshness Updates**: Recalculates freshness scores for all SEO collections
2. **Monthly Pruning**: Archives/deletes low-freshness entries to maintain data quality
3. **Size Monitoring**: Alerts when collections exceed configured thresholds
4. **Structured Logging**: Timestamped logs with rotation (keeps last 10 runs)
5. **JSON Summary**: Machine-readable summary for monitoring integrations

### Usage

```bash
# Weekly maintenance (freshness updates only)
./ruvector-maintenance.sh weekly

# Monthly maintenance (freshness + pruning)
./ruvector-maintenance.sh monthly

# Full maintenance (freshness + pruning + size alerts)
./ruvector-maintenance.sh full

# Dry run mode (test without executing)
DRY_RUN=true ./ruvector-maintenance.sh weekly

# Custom log directory
CFN_LOG_DIR=/path/to/logs ./ruvector-maintenance.sh weekly
```

### Cron Setup

```bash
# Edit crontab
crontab -e

# Add these lines:

# Weekly freshness updates (Sunday 2am)
0 2 * * 0 /path/to/ruvector-maintenance.sh weekly

# Monthly pruning (1st of month, 3am)
0 3 1 * * /path/to/ruvector-maintenance.sh monthly

# Full maintenance with monitoring (1st Sunday, 4am)
0 4 1-7 * 0 /path/to/ruvector-maintenance.sh full
```

### Exit Codes

- `0` - Success
- `1` - Size threshold exceeded (collections too large)
- `2` - Freshness update or pruning errors
- `3` - Database connection or environment errors

### Configuration

Edit the script to modify:

- **Collection thresholds**: `SIZE_THRESHOLDS` associative array
- **Freshness thresholds**: `ARCHIVE_THRESHOLD` (default: 0.1), `DELETE_THRESHOLD` (default: 0.0)
- **Protection limits**: `MIN_ENTRIES_PROTECTION` (default: 100)
- **Log retention**: `MAX_LOG_RUNS` (default: 10)

### Collections Maintained

- `expert_sources` (threshold: 10,000 entries)
- `statistics` (threshold: 50,000 entries)
- `keyword_research` (threshold: 100,000 entries)
- `competitor_intelligence` (threshold: 20,000 entries)
- `serp_patterns` (threshold: 50,000 entries)
- `content_patterns` (threshold: 25,000 entries)

### Output Files

#### Log File
Location: `${CFN_LOG_DIR}/ruvector-maintenance.log` (default: `/var/log/cfn-seo/`)

Format:
```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [ACTION] message
```

Levels: `INFO`, `WARN`, `ERROR`, `ACTION`

#### Summary JSON
Location: `${CFN_LOG_DIR}/ruvector-maintenance-summary.json`

Structure:
```json
{
  "timestamp": "2025-12-03T04:04:20-08:00",
  "mode": "weekly",
  "duration_seconds": 8,
  "stats": {
    "updated_entries": 1234,
    "archived_entries": 56,
    "deleted_entries": 12,
    "total_size": 45678,
    "errors": 0
  }
}
```

### Monitoring Integration

Use the summary JSON for monitoring dashboards:

```bash
# Check last run success
jq '.stats.errors' /var/log/cfn-seo/ruvector-maintenance-summary.json

# Get total collection size
jq '.stats.total_size' /var/log/cfn-seo/ruvector-maintenance-summary.json

# Alert if errors > 0
errors=$(jq '.stats.errors' /var/log/cfn-seo/ruvector-maintenance-summary.json)
if [ "$errors" -gt 0 ]; then
  echo "ALERT: Maintenance errors detected: $errors"
fi
```

### Troubleshooting

**Permission denied on log directory:**
```bash
# Use custom log directory
mkdir -p ~/logs/cfn-seo
CFN_LOG_DIR=~/logs/cfn-seo ./ruvector-maintenance.sh weekly
```

**TypeScript files not found:**
```bash
# Ensure you're running from the correct directory
cd /path/to/packages/seo-analysis
./.claude/skills/cfn-seo-pipeline/lib/seo/scripts/ruvector-maintenance.sh weekly
```

**RuVector connection failed:**
- Check that RuVector is running
- Verify environment variables (RUVECTOR_URL, API keys)
- Connection test failures are logged as warnings (non-fatal)

**Dry run for debugging:**
```bash
# See what would be executed without making changes
DRY_RUN=true DEBUG=true ./ruvector-maintenance.sh full 2>&1 | tee debug.log
```
