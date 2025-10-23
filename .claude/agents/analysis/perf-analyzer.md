---
name: perf-analyzer
description: |
  MUST BE USED when analyzing application performance, identifying bottlenecks, profiling code.
  Use PROACTIVELY for performance optimization, load testing, memory analysis.
  Keywords - performance analysis, bottleneck detection, profiling, optimization
keywords: [performance-profiling, bottleneck-detection, resource-optimization, system-analysis, load-testing, memory-analysis, cpu-profiling]
tools: [Read, Write, Edit, Bash, Glob, Grep, TodoWrite]
model: haiku
color: cyan
type: specialist
capabilities:
  - performance-analysis
  - bottleneck-detection
  - profiling
  - memory-analysis
  - optimization

validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator

lifecycle:
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'perf-analyzer', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
acl_level: 1  # Private agent-scoped data
---

[Rest of the file remains the same]