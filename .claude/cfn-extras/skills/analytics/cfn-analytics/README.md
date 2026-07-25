# Skill Invocation Logging Infrastructure

## Overview
This infrastructure captures and analyzes skill invocation metrics for AI agent performance tracking.

## Components
1. `skill-invocations.sql`: SQLite schema for logging skill invocations
2. `log-skill-invocation.js`: Script to log individual skill invocations
3. `skill-analytics-dashboard.js`: Generate performance analytics reports
4. `test-data-generator.js`: Create sample test data for analysis
5. `skill-invocation-hook.sh`: Bash wrapper for logging skill invocations

## Usage

### Logging a Skill Invocation
```bash
node log-skill-invocation.js \
    "skill_name" \
    "user_prompt" \
    "outcome" \
    input_tokens \
    output_tokens \
    confidence_score \
    context_reduction_percentage
```

### Generate Analytics Report
```bash
node skill-analytics-dashboard.js
```

### Generate Test Data
```bash
node test-data-generator.js
```

## Key Metrics Tracked
- Skill invocation success rate
- Average confidence score
- Context reduction percentage
- Token usage

## Redis Notifications
Publishes to `swarm:analytics:skill-invoked` with:
- Skill name
- Outcome
- Timestamp

## Recommended Workflow
1. Invoke skill with logging
2. Publish Redis notification
3. Periodically run analytics dashboard
4. Use report for skill refinement

## Performance Considerations
- WAL journal mode for SQLite
- Asynchronous logging
- Hashed user prompts for privacy