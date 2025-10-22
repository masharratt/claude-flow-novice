# Claude Flow Novice - Utility Functions (v2)

[... Previous content remains the same ...]

### 6. Feedback Management

#### `accumulate_feedback`
```bash
accumulate_feedback <task_id> <iteration> <source> <feedback_message>
```

**Purpose**: Store iteration feedback for learning.

**Parameters**:
- `task_id`: CFN Loop task ID
- `iteration`: Current iteration
- `source`: Feedback origin
- `feedback_message`: Feedback details

**Storage**: Redis `swarm:${task_id}:feedback:history`

**Returns**: Success confirmation

#### `extract_validator_feedback`
```bash
extract_validator_feedback <task_id> <iteration> <validator_output>
```

**Purpose**: Parse structured validator JSON feedback.

**Parameters**:
- `task_id`: CFN Loop task ID
- `iteration`: Current iteration
- `validator_output`: Raw validator JSON

**Extraction**: JSON with severity/issue/suggestion

**Storage**: Redis `swarm:${task_id}:validator:history`

**Returns**: Extracted feedback count

## Version
**Current Functions Version**: 2.3.0
**Last Updated**: 2025-10-21