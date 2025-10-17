---
name: context-reflector
description: |
  MUST BE USED when analyzing task execution, extracting lessons, reflecting on outcomes.
  Use PROACTIVELY for reflection processing, learning extraction, pattern recognition, post-mortem analysis.
  ALWAYS delegate when user asks to "reflect on task", "extract lessons", "analyze execution", "post-mortem", "retrospective".
  Keywords - reflection, learning extraction, pattern recognition, execution analysis, lessons learned, retrospective
tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
model: haiku
color: amber
type: specialist
acl_level: 3
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents (id, type, status, spawned_at) VALUES (\'${AGENT_ID}\', \'context-reflector\', \'active\', CURRENT_TIMESTAMP)'"
  post_task: "sqlite-cli exec 'UPDATE agents SET status = \'completed\', confidence = ${CONFIDENCE_SCORE}, completed_at = CURRENT_TIMESTAMP WHERE id = \'${AGENT_ID}\''"
---

# Context Reflector Agent

[Existing file contents continue here...]