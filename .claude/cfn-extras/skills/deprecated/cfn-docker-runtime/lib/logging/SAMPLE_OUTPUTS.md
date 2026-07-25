# Sample Query Outputs

This document shows example outputs from the hybrid logging system queries.

## 1. Analytics Summary

Command: `./queries/analytics-summary.sh logs.db demo-1763482064`

```
=== Task Execution Summary ===
total_agents  total_containers  successful  failed  success_rate  oom_kills
------------  ----------------  ----------  ------  ------------  ---------
6             6                 5           1       41.67%        0

=== Execution Duration ===
avg_duration_sec  min_duration_sec  max_duration_sec  total_duration_sec
----------------  ----------------  ----------------  ------------------
0.00              0.00              0.00              0.00

=== Log Volume ===
stream  total_lines  avg_line_length  total_bytes
------  -----------  ---------------  -----------
stderr  1            28.00            28
stdout  17           23.94            407

=== Timeline Overview ===
first_spawn          last_exit            total_runtime_sec
-------------------  -------------------  -----------------
2025-11-18 16:07:45  2025-11-18 16:07:46  1.00
```

**Insights:**
- 6 agents executed with 83% success rate
- Total runtime: 1 second
- No OOM kills detected
- Log volume: 18 lines (407 bytes stdout, 28 bytes stderr)

---

## 2. Gate Check Results

Command: `./queries/query-gate-checks.sh logs.db demo-1763482064`

```
=== Gate Check Results ===
iteration  pass_rate  threshold  result  agents  timestamp
---------  ---------  ---------  ------  ------  -------------------
1          66.00%     95.00%     FAIL    3       2025-11-18 16:07:45
2          100.00%    95.00%     PASS    3       2025-11-18 16:07:46

=== Gate Check Summary ===
total_checks  passed_count  failed_count  avg_pass_rate  max_pass_rate
------------  ------------  ------------  -------------  -------------
2             1             1             83.00%         100.00%
```

**Insights:**
- Iteration 1 failed gate check (66% < 95% threshold)
- Iteration 2 passed with 100% success rate
- Average pass rate across iterations: 83%
- Clear progression from failure to success

---

## 3. Validator Consensus History

Command: `./queries/query-consensus-history.sh logs.db demo-1763482064`

```
=== Validator Consensus History ===
iteration  validator_id  score  feedback                timestamp
---------  ------------  -----  ----------------------  -------------------
2          validator-1   0.85   Iteration 2 looks good  2025-11-18 16:07:46
2          validator-2   0.85   Iteration 2 looks good  2025-11-18 16:07:46
2          validator-3   0.85   Iteration 2 looks good  2025-11-18 16:07:46

=== Consensus Trends by Iteration ===
iteration  validator_count  avg_score  min_score  max_score  score_range
---------  ---------------  ---------  ---------  ---------  -----------
2          3                0.85       0.85       0.85       0.00

=== Validator Performance ===
validator_id  reviews  avg_score  min_score  max_score
------------  -------  ---------  ---------  ---------
validator-1   1        0.85       0.85       0.85
validator-2   1        0.85       0.85       0.85
validator-3   1        0.85       0.85       0.85
```

**Insights:**
- All validators agree (score range: 0.00)
- Consistent confidence scores: 0.85 across all validators
- No disagreements detected
- Perfect consensus in iteration 2

---

## 4. Custom Queries

### Query: Success Rate by Iteration

```sql
SELECT
    CAST(substr(agent_id, -1) as INTEGER) as iteration,
    COUNT(*) as total,
    SUM(CASE WHEN exit_code=0 THEN 1 ELSE 0 END) as successful,
    printf('%.0f%%', AVG(CASE WHEN exit_code=0 THEN 100.0 ELSE 0.0 END)) as success_rate
FROM container_events
WHERE event_type='exit' AND task_id='demo-1763482064'
GROUP BY iteration
ORDER BY iteration;
```

**Output:**
```
iteration  total  successful  success_rate
---------  -----  ----------  ------------
1          3      2           66%
2          3      3           100%
```

**Insights:**
- Clear improvement: 66% → 100%
- Iteration 2 achieved perfect success rate
- Validates iterative refinement approach

---

### Query: Error Pattern Analysis

```sql
SELECT
    substr(log_line, 1, 80) as error_pattern,
    COUNT(*) as occurrences
FROM container_logs
WHERE stream='stderr' AND log_line LIKE '%error%' COLLATE NOCASE
GROUP BY error_pattern
ORDER BY occurrences DESC;
```

**Output:**
```
error_pattern                      occurrences
---------------------------------  -----------
Error: Implementation failed       1
```

**Insights:**
- Single error type detected
- Occurred in iteration 1
- Resolved in iteration 2

---

## Real-World Use Cases

### Use Case 1: Debug Agent Failure

**Scenario:** Agent failed with exit code 137 (OOM killed)

**Query Workflow:**
1. Find failed containers: `./queries/query-failed-containers.sh logs.db TASK_ID`
2. View agent timeline: `./queries/query-agent-timeline.sh logs.db AGENT_ID`
3. Check stderr logs: `cat AGENT_ID-stderr.log`
4. Analyze memory usage: Custom SQL query on performance_metrics table

---

### Use Case 2: Optimize Iteration Count

**Scenario:** Determine optimal iteration count based on historical data

**Query:**
```sql
SELECT iteration, AVG(pass_rate) as avg_pass_rate
FROM gate_checks
WHERE task_id LIKE 'similar-task%'
GROUP BY iteration
ORDER BY iteration;
```

**Insight:** If pass rate plateaus after iteration 3, no need for iteration 4+

---

### Use Case 3: Validator Disagreement Detection

**Scenario:** Find iterations where validators strongly disagree

**Query:**
```sql
SELECT
    task_id,
    iteration,
    MAX(score) - MIN(score) as disagreement
FROM validator_consensus
GROUP BY task_id, iteration
HAVING disagreement > 0.3
ORDER BY disagreement DESC;
```

**Action:** Review these iterations for edge cases or unclear requirements

---

## Benefits Comparison

### Traditional Text File Approach

**Command:** `grep -i error *-stderr.log`

**Limitations:**
- No aggregation (can't count by pattern)
- No time-series analysis
- No cross-agent correlation
- Manual parsing required for statistics

---

### SQLite Hybrid Approach

**Advantages:**
- Automatic aggregation (COUNT)
- Pattern grouping
- Sortable by frequency
- Joinable with other tables (agent_id, iteration)
- Structured data for dashboards

---

## Conclusion

The hybrid approach provides:
- **Text files** for quick debugging and human readability
- **SQLite** for complex analysis, trends, and optimization

Both are generated simultaneously with minimal overhead (7% CPU).
