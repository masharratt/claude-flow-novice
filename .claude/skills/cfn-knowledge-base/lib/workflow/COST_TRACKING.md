# Cost Tracking and ROI Engine

## Overview

The Cost Tracking Engine measures the economic value of skill automation by comparing script execution costs versus equivalent AI agent invocations. It provides ROI metrics, savings projections, and skill performance rankings.

## Architecture

```
Skill Execution
    ├─ Record execution metadata
    ├─ Calculate tokens avoided
    ├─ Compute cost savings (AI - Script)
    └─ Store in skill_executions table
         ├─ Daily ROI snapshot generation
         ├─ Per-skill ranking analysis
         └─ Monthly/Annual projections
```

## Database Schema

### skill_executions Table

```sql
CREATE TABLE skill_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    exit_code INTEGER NOT NULL,
    tokens_avoided INTEGER NOT NULL,
    cost_avoided_usd REAL NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    agent_type TEXT,
    task_description TEXT,
    metadata TEXT
);
```

### roi_snapshots Table

```sql
CREATE TABLE roi_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT DEFAULT (date('now')),
    total_executions INTEGER NOT NULL,
    total_cost_avoided_usd REAL NOT NULL,
    total_tokens_avoided INTEGER NOT NULL,
    avg_execution_time_ms REAL NOT NULL,
    top_skill_name TEXT,
    top_skill_savings_usd REAL,
    metadata TEXT
);
```

### Indexes

- `idx_executions_skill`: (skill_name)
- `idx_executions_timestamp`: (timestamp)
- `idx_executions_exit_code`: (exit_code)
- `idx_roi_snapshots_date`: (snapshot_date)

## Cost Calculation Formulas

### AI Agent Cost

```
ai_cost = ((input_tokens + output_tokens) × $0.50) ÷ 1,000,000
```

**Default Token Estimates:**
- Input tokens: 2000 (skill-equivalent task description)
- Output tokens: 1000 (implementation + response)
- Total tokens: 3000

**Example:**
```
ai_cost = (3000 × $0.50) ÷ 1,000,000 = $0.0015
```

### Script Execution Cost

```
script_cost = $0.0001 (negligible infrastructure cost)
```

### Cost Savings

```
savings = ai_cost - script_cost
savings = $0.0015 - $0.0001 = $0.0014 per execution
```

### Monthly Projection

```
monthly_savings = executions_per_month × savings_per_execution

# Example: 1000 executions/month
monthly_savings = 1000 × $0.0014 = $1.40
```

### Annual Projection

```
annual_savings = executions_per_year × savings_per_execution

# Example: 12,000 executions/year
annual_savings = 12000 × $0.0014 = $16.80
```

## Usage

### 1. Log Skill Execution

```bash
track-cost-savings.sh --action log \
  --skill-name "cfn-coordination" \
  --skill-version "1.0.0" \
  --execution-time-ms 150 \
  --exit-code 0 \
  --tokens-avoided 3000 \
  --agent-type "cfn-v3-coordinator" \
  --task-description "Coordinate Loop 3 agents"
```

**Output:**
```
Logged execution: cfn-coordination (saved $0.0014)
```

### 2. Generate ROI Snapshot

```bash
track-cost-savings.sh --action snapshot
```

**Output:**
```
Generated ROI snapshot for 2025-11-15
Total executions: 156
Total cost avoided: $0.2184
Top skill: cfn-coordination ($0.0896)
```

### 3. Query Skill ROI Ranking

```bash
track-cost-savings.sh --action ranking --period 30
```

**Output:**
```
skill_name              executions  total_savings_usd  avg_savings_per_execution  avg_execution_time_ms  total_tokens_avoided
----------------------  ----------  -----------------  -------------------------  ---------------------  --------------------
cfn-coordination        64          0.0896             0.0014                     145.3                  192000
cfn-agent-spawning      42          0.0588             0.0014                     89.7                   126000
cfn-loop-validation     28          0.0392             0.0014                     203.1                  84000
cfn-deliverable-valid   22          0.0308             0.0014                     67.4                   66000
```

### 4. Calculate Projections

```bash
track-cost-savings.sh --action projections --period 30
```

**Output:**
```
Cost Savings Projections (based on last 30 days):
---------------------------------------------------------
Daily Average:
  - Executions: 5.20
  - Savings: $0.00728

Monthly Projection:
  - Executions: 156
  - Savings: $0.22

Annual Projection:
  - Savings: $2.66
```

### 5. Export Dashboard Metrics

```bash
track-cost-savings.sh --action dashboard --format json
```

**Output (JSON):**
```json
{
  "total_executions": 156,
  "total_cost_avoided_usd": 0.2184,
  "total_tokens_avoided": 468000,
  "avg_execution_time_ms": 134.2,
  "success_rate": 0.9615384615384616,
  "last_30_days": {
    "executions": 156,
    "cost_avoided_usd": 0.2184
  }
}
```

**Table Format:**
```bash
track-cost-savings.sh --action dashboard --format table
```

**Output:**
```
period         executions  cost_avoided_usd  avg_time_ms
-------------  ----------  ----------------  -----------
All Time       156         0.2184            134.2
Last 30 Days   156         0.2184            134.2
Last 7 Days    38          0.0532            128.5
```

## Integration Patterns

### Pattern 1: Skill Wrapper with Timing

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="cfn-coordination"
SKILL_VERSION="1.0.0"
TOKENS_AVOIDED=3000

# Execute skill with timing
START_TIME=$(date +%s%3N)
output=$(./cfn-coordination.sh "$@" 2>&1) || exit_code=$?
END_TIME=$(date +%s%3N)

EXECUTION_TIME=$((END_TIME - START_TIME))

# Track cost savings
/path/to/track-cost-savings.sh --action log \
    --skill-name "$SKILL_NAME" \
    --skill-version "$SKILL_VERSION" \
    --execution-time-ms "$EXECUTION_TIME" \
    --exit-code "${exit_code:-0}" \
    --tokens-avoided "$TOKENS_AVOIDED" \
    --task-description "$*"

exit ${exit_code:-0}
```

### Pattern 2: Post-Execution Hook

```bash
# .claude/hooks/cfn-cost-tracking.sh
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="$1"
SKILL_VERSION="$2"
EXECUTION_TIME_MS="$3"
EXIT_CODE="$4"
TOKENS_AVOIDED="${5:-3000}"

/path/to/track-cost-savings.sh --action log \
    --skill-name "$SKILL_NAME" \
    --skill-version "$SKILL_VERSION" \
    --execution-time-ms "$EXECUTION_TIME_MS" \
    --exit-code "$EXIT_CODE" \
    --tokens-avoided "$TOKENS_AVOIDED"
```

### Pattern 3: Agent Integration with Dynamic Token Calculation

```bash
# Within agent execution
track_skill_execution() {
    local skill_name="$1"
    local skill_version="$2"
    local execution_time_ms="$3"
    local exit_code="$4"
    local task_complexity="${5:-medium}"  # low, medium, high

    # Dynamic token estimation based on task complexity
    local tokens_avoided
    case "$task_complexity" in
        low)    tokens_avoided=1500 ;;
        medium) tokens_avoided=3000 ;;
        high)   tokens_avoided=6000 ;;
        *)      tokens_avoided=3000 ;;
    esac

    track-cost-savings.sh --action log \
        --skill-name "$skill_name" \
        --skill-version "$skill_version" \
        --execution-time-ms "$execution_time_ms" \
        --exit-code "$exit_code" \
        --tokens-avoided "$tokens_avoided" \
        --agent-type "$AGENT_TYPE" \
        --metadata "{\"task_complexity\": \"$task_complexity\"}"
}
```

### Pattern 4: Batch Execution Tracking

```bash
# Track multiple skill executions in a workflow
track_workflow_execution() {
    local workflow_name="$1"
    shift
    local skills=("$@")

    local total_time=0
    local total_tokens=0
    local exit_code=0

    for skill in "${skills[@]}"; do
        START=$(date +%s%3N)
        execute_skill "$skill" || exit_code=$?
        END=$(date +%s%3N)

        EXEC_TIME=$((END - START))
        total_time=$((total_time + EXEC_TIME))
        total_tokens=$((total_tokens + 3000))

        track-cost-savings.sh --action log \
            --skill-name "$skill" \
            --skill-version "1.0.0" \
            --execution-time-ms "$EXEC_TIME" \
            --exit-code "$exit_code" \
            --tokens-avoided 3000
    done

    echo "Workflow: $workflow_name"
    echo "Total time: ${total_time}ms"
    echo "Total tokens avoided: $total_tokens"
    echo "Total cost saved: \$$(echo "scale=6; ($total_tokens * 0.50) / 1000000" | bc)"
}
```

## ROI Analysis

### Per-Skill Performance

```bash
# Top 10 skills by total savings
sqlite3 workflow-codification.db "
SELECT
    skill_name,
    COUNT(*) as executions,
    SUM(cost_avoided_usd) as total_savings,
    AVG(execution_time_ms) as avg_time_ms
FROM skill_executions
GROUP BY skill_name
ORDER BY total_savings DESC
LIMIT 10;
"
```

### Daily Trend Analysis

```bash
# Cost savings trend over last 30 days
sqlite3 workflow-codification.db "
SELECT
    date(timestamp) as date,
    COUNT(*) as executions,
    SUM(cost_avoided_usd) as daily_savings,
    AVG(execution_time_ms) as avg_time_ms
FROM skill_executions
WHERE timestamp >= datetime('now', '-30 days')
GROUP BY date(timestamp)
ORDER BY date;
"
```

### Success Rate Analysis

```bash
# Success rate by skill
sqlite3 workflow-codification.db "
SELECT
    skill_name,
    COUNT(*) as total_executions,
    SUM(CASE WHEN exit_code = 0 THEN 1 ELSE 0 END) as successful,
    CAST(SUM(CASE WHEN exit_code = 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as success_rate
FROM skill_executions
GROUP BY skill_name
ORDER BY success_rate DESC;
"
```

### Time-to-Value Calculation

```bash
# Average execution time by skill
sqlite3 workflow-codification.db "
SELECT
    skill_name,
    AVG(execution_time_ms) as avg_time_ms,
    MIN(execution_time_ms) as min_time_ms,
    MAX(execution_time_ms) as max_time_ms,
    COUNT(*) as sample_size
FROM skill_executions
WHERE exit_code = 0
GROUP BY skill_name
ORDER BY avg_time_ms ASC;
"
```

## Cost Comparison by Provider

### Z.ai (glm-4.6) - Default

```
Input: $0.50 / 1M tokens
Output: $0.50 / 1M tokens
Average cost per skill execution: $0.0015
```

### Anthropic (Claude Sonnet 4.5)

```
Input: $3.00 / 1M tokens
Output: $15.00 / 1M tokens
Average cost per skill execution: $0.021
Savings vs script: $0.0209 per execution
```

### OpenRouter (Various Models)

```
Varies by model selection
Typical range: $0.002 - $0.030 per execution
```

## Dashboard Metrics

### Key Performance Indicators

1. **Total Executions** - Cumulative skill usage
2. **Total Cost Avoided** - Aggregate savings (USD)
3. **Average Execution Time** - Performance metric (ms)
4. **Success Rate** - Reliability metric (0-1)
5. **Top Performing Skills** - Highest ROI contributors

### Visualization Recommendations

#### Time Series Chart
- X-axis: Date
- Y-axis: Daily cost savings (USD)
- Line chart showing 30-day trend

#### Bar Chart - Top Skills
- X-axis: Skill name
- Y-axis: Total savings (USD)
- Top 10 skills by ROI

#### Pie Chart - Execution Distribution
- Segments: Skill categories
- Values: Execution count percentage

#### Gauge - Monthly Savings
- Current: Month-to-date savings
- Target: Projected monthly savings
- Max: Theoretical maximum (if all tasks automated)

## Automated Reporting

### Daily Snapshot Cron Job

```bash
# Add to crontab: Daily at 11:59 PM
59 23 * * * /path/to/track-cost-savings.sh --action snapshot >> /var/log/roi-snapshots.log 2>&1
```

### Weekly Report Email

```bash
#!/usr/bin/env bash
# weekly-roi-report.sh

REPORT=$(cat <<REPORT
CFN Skills - Weekly ROI Report
==============================
Period: $(date -d '7 days ago' +%Y-%m-%d) to $(date +%Y-%m-%d)

$(track-cost-savings.sh --action ranking --period 7)

---

$(track-cost-savings.sh --action projections --period 7)

---

Dashboard: $(track-cost-savings.sh --action dashboard --format json)
REPORT
)

echo "$REPORT" | mail -s "CFN Skills Weekly ROI Report" team@example.com
```

### Monthly Executive Summary

```bash
#!/usr/bin/env bash
# monthly-executive-summary.sh

MONTH=$(date +%Y-%m)

cat <<SUMMARY
Executive Summary - CFN Skills ROI
Month: $MONTH
===================================

Total Savings: \$$(sqlite3 workflow-codification.db "SELECT SUM(cost_avoided_usd) FROM skill_executions WHERE strftime('%Y-%m', timestamp) = '$MONTH';")

Total Executions: $(sqlite3 workflow-codification.db "SELECT COUNT(*) FROM skill_executions WHERE strftime('%Y-%m', timestamp) = '$MONTH';")

Top 5 Skills:
$(sqlite3 -header workflow-codification.db "SELECT skill_name, SUM(cost_avoided_usd) as savings FROM skill_executions WHERE strftime('%Y-%m', timestamp) = '$MONTH' GROUP BY skill_name ORDER BY savings DESC LIMIT 5;")

Annual Projection: \$$(track-cost-savings.sh --action projections --period 30 | grep "Annual Projection" -A1 | tail -1 | awk '{print $3}')
SUMMARY
```

## Token Estimation Strategies

### Static Estimation (Default)

```bash
tokens_avoided=3000  # Fixed value
```

**Pros:** Simple, consistent
**Cons:** May not reflect actual complexity

### Dynamic Estimation by Task Type

```bash
case "$task_type" in
    coordination)  tokens_avoided=2000 ;;
    implementation) tokens_avoided=5000 ;;
    validation)    tokens_avoided=1500 ;;
    documentation) tokens_avoided=4000 ;;
esac
```

### Historical Average

```bash
# Calculate average tokens for similar tasks
tokens_avoided=$(sqlite3 workflow-codification.db "
    SELECT AVG(tokens_avoided)
    FROM skill_executions
    WHERE skill_name = '$SKILL_NAME'
    AND exit_code = 0
    LIMIT 100;
")
```

### Input-Based Estimation

```bash
# Estimate based on input parameter count
param_count=$(echo "$INPUT_PARAMS" | wc -w)
tokens_avoided=$((param_count * 300 + 1500))  # 300 tokens per param + base
```

## Best Practices

### 1. Track All Executions
Log both successful and failed executions for accurate ROI calculation.

### 2. Use Realistic Token Estimates
Calibrate token estimates based on actual AI agent usage patterns.

### 3. Generate Daily Snapshots
Automated daily snapshots enable trend analysis and forecasting.

### 4. Review ROI Rankings Weekly
Identify low-ROI skills for optimization or retirement.

### 5. Include Execution Context
Store agent_type and task_description for detailed analysis.

### 6. Monitor Success Rates
Track exit codes to correlate ROI with reliability.

## Troubleshooting

### Issue: Negative Cost Savings
**Cause:** Script cost exceeds AI cost (rare edge case)
**Solution:** Review token estimates, ensure using correct provider pricing

### Issue: Inconsistent Execution Times
**Cause:** Variable system load or network latency
**Solution:** Calculate median instead of mean for more stable metrics

### Issue: Missing Snapshots
**Cause:** Cron job failure or database lock
**Solution:** Check cron logs, implement retry logic

## Security Considerations

### Sensitive Task Descriptions
- **Risk:** Task descriptions may contain confidential information
- **Mitigation:** Sanitize descriptions before storage

### Database Access Control
- **Risk:** Unauthorized access to cost data
- **Mitigation:** Set file permissions to 600, use encryption at rest

### Data Retention
- **Risk:** Excessive historical data storage
- **Mitigation:** Implement retention policy (e.g., 90 days detail, annual summaries)

## Environment Variables

- `DB_PATH` - Database location (default: `../../../../data/workflow-codification.db`)
- `AI_COST_PER_MILLION` - AI provider cost (default: 0.50)
- `SCRIPT_COST` - Script execution cost (default: 0.0001)
- `AVG_AI_INPUT_TOKENS` - Average input tokens (default: 2000)
- `AVG_AI_OUTPUT_TOKENS` - Average output tokens (default: 1000)

## Dependencies

- `bash` ≥4.0
- `sqlite3` ≥3.0
- `coreutils` (date, bc)

## Version History

- **v1.0.0** (2025-11-15) - Initial implementation
  - Execution logging
  - ROI snapshot generation
  - Per-skill ranking
  - Monthly/annual projections
  - Dashboard metrics export
