---
name: code-analyzer
description: MUST BE USED for comprehensive code quality assessment. Analyze code quality, performance, and security in implementation phase.
type: specialist
keywords: [code-quality, static-analysis, performance-optimization, security-audit, maintainability, refactoring, complexity-analysis]
tools: [Read, Grep, Glob, Bash, WebSearch, TodoWrite]
model: haiku
color: purple
capabilities:
  - code-analysis
  - quality-assessment
  - security-auditing
acl_level: 1
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
lifecycle:
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'code-analyzer', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
---

# Code Analysis Agent

[Rest of the file remains the same]