#!/usr/bin/env bash
# Initialize hybrid logging: Text files + SQLite database
# Provides both human-readable logs and powerful SQL querying

set -euo pipefail

TASK_ID=${1:-}

if [[ -z "$TASK_ID" ]]; then
    echo "Usage: $0 <task_id>"
    echo ""
    echo "Initializes hybrid logging for Docker mode CFN Loop execution:"
    echo "  - Text files: Human-readable logs (backward compatible)"
    echo "  - SQLite: Powerful querying and analytics"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create log directory structure
LOG_DIR="logs/docker-mode/${TASK_ID}"
mkdir -p "$LOG_DIR"
mkdir -p "$LOG_DIR/queries"

# Database path
DB_PATH="$LOG_DIR/logs.db"

# Source helpers
source "$SCRIPT_DIR/sqlite-helpers.sh"

# Initialize database
echo "Initializing logging database: $DB_PATH"
init_logging_db "$DB_PATH"

# Copy query scripts to log directory for easy access
echo "Installing query scripts to $LOG_DIR/queries/"
cp "$SCRIPT_DIR/queries/"*.sh "$LOG_DIR/queries/"
chmod +x "$LOG_DIR/queries/"*.sh

# Create README in log directory
cat > "$LOG_DIR/README.md" <<'EOF'
# CFN Docker Logging - Hybrid System

This directory contains both **text files** (human-readable) and **SQLite database** (powerful queries).

## Quick Start

### Text File Queries (Human Readable)
```bash
# View agent stdout
cat <agent-id>-stdout.log

# View agent stderr
cat <agent-id>-stderr.log

# View combined logs
cat <agent-id>-combined.log

# Search for errors
grep -i error *-combined.log

# View summary
cat <agent-id>-summary.txt
```

### SQLite Queries (Powerful Analysis)
```bash
# All queries use: queries/<script-name>.sh logs.db [task_id]

# Find failed containers
./queries/query-failed-containers.sh logs.db TASK_ID

# View agent timeline
./queries/query-agent-timeline.sh logs.db AGENT_ID

# Gate check results
./queries/query-gate-checks.sh logs.db TASK_ID

# Validator consensus history
./queries/query-consensus-history.sh logs.db TASK_ID

# Full analytics summary
./queries/analytics-summary.sh logs.db TASK_ID

# Coordination timeline
./queries/query-coordination-timeline.sh logs.db TASK_ID
```

## Database Schema

### Tables
- `container_logs`: Individual log lines (stdout/stderr)
- `container_events`: Lifecycle (spawn, exit, OOM)
- `coordination_events`: Redis coordination activity
- `gate_checks`: Loop 3 gate results
- `validator_consensus`: Loop 2 validator scores
- `product_owner_decisions`: Final decisions
- `performance_metrics`: Custom metrics

### Custom Queries
```bash
# Direct SQLite access
sqlite3 logs.db

# Example: Find slowest agents
sqlite3 logs.db "SELECT agent_id, duration_seconds FROM container_events WHERE event_type='exit' ORDER BY duration_seconds DESC LIMIT 10;"

# Example: Count errors in logs
sqlite3 logs.db "SELECT COUNT(*) FROM container_logs WHERE log_line LIKE '%error%' COLLATE NOCASE;"

# Example: Agent success rate
sqlite3 logs.db "SELECT agent_id, AVG(CASE WHEN exit_code=0 THEN 1.0 ELSE 0.0 END) as success_rate FROM container_events WHERE event_type='exit' GROUP BY agent_id;"
```

## File Structure
```
logs/docker-mode/TASK_ID/
├── logs.db                          # SQLite database
├── README.md                        # This file
├── queries/                         # Query scripts
│   ├── query-failed-containers.sh
│   ├── query-agent-timeline.sh
│   ├── query-gate-checks.sh
│   ├── query-consensus-history.sh
│   ├── analytics-summary.sh
│   └── query-coordination-timeline.sh
├── <agent-id>-stdout.log           # Agent stdout (text)
├── <agent-id>-stderr.log           # Agent stderr (text)
├── <agent-id>-combined.log         # Combined output (text)
└── <agent-id>-summary.txt          # Execution summary (text)
```

## Benefits

### Text Files
- ✅ Human-readable
- ✅ Standard Unix tools (grep, less, tail)
- ✅ Backward compatible
- ✅ Easy debugging

### SQLite
- ✅ Complex queries (joins, aggregations)
- ✅ Time-series analysis
- ✅ Performance metrics
- ✅ Cross-agent correlation
- ✅ Scalable (handles millions of rows)

## Examples

### Scenario 1: Find why agent failed
```bash
# 1. Check exit code
./queries/query-failed-containers.sh logs.db TASK_ID

# 2. View full timeline
./queries/query-agent-timeline.sh logs.db AGENT_ID

# 3. Read stderr
cat AGENT_ID-stderr.log
```

### Scenario 2: Analyze gate check trends
```bash
# View all gate checks
./queries/query-gate-checks.sh logs.db TASK_ID

# Get pass rate statistics
sqlite3 logs.db "SELECT AVG(pass_rate), MIN(pass_rate), MAX(pass_rate) FROM gate_checks WHERE task_id='TASK_ID';"
```

### Scenario 3: Validator consensus analysis
```bash
# View consensus history
./queries/query-consensus-history.sh logs.db TASK_ID

# Find disagreements (high score variance)
sqlite3 logs.db "SELECT iteration, MAX(score) - MIN(score) as variance FROM validator_consensus WHERE task_id='TASK_ID' GROUP BY iteration HAVING variance > 0.3;"
```

### Scenario 4: Performance optimization
```bash
# Full analytics
./queries/analytics-summary.sh logs.db TASK_ID

# Find bottleneck agents
sqlite3 logs.db "SELECT agent_id, duration_seconds FROM container_events WHERE event_type='exit' AND task_id='TASK_ID' ORDER BY duration_seconds DESC LIMIT 5;"
```
EOF

echo ""
echo "=== Hybrid Logging Initialized ==="
echo "Task ID: $TASK_ID"
echo "Log Directory: $LOG_DIR"
echo "SQLite Database: $DB_PATH"
echo ""
echo "Text Files:"
echo "  - <agent-id>-stdout.log"
echo "  - <agent-id>-stderr.log"
echo "  - <agent-id>-combined.log"
echo "  - <agent-id>-summary.txt"
echo ""
echo "SQLite Queries:"
echo "  - cd $LOG_DIR && ./queries/query-failed-containers.sh logs.db $TASK_ID"
echo "  - cd $LOG_DIR && ./queries/query-agent-timeline.sh logs.db <agent-id>"
echo "  - cd $LOG_DIR && ./queries/query-gate-checks.sh logs.db $TASK_ID"
echo "  - cd $LOG_DIR && ./queries/query-consensus-history.sh logs.db $TASK_ID"
echo "  - cd $LOG_DIR && ./queries/analytics-summary.sh logs.db $TASK_ID"
echo ""
echo "See: $LOG_DIR/README.md for complete guide"
