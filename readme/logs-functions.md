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

### 7. ACE System Utilities

#### `invoke-context-reflect.sh`
```bash
invoke-context-reflect.sh --task-id ID --agent-id AGENT --confidence 0.85 \
  --iteration 2 --reflection "lesson learned"
```

**Purpose**: Extract lessons from sprint execution

**Parameters**:
- `--task-id`: Sprint task ID
- `--agent-id`: Agent identifier
- `--confidence`: Final confidence score (0.0-1.0)
- `--iteration`: Iteration count
- `--reflection`: Lesson description

**Classification**: STRAT (≥0.85), PATTERN (0.70-0.85), ANTI (<0.70)

**Storage**: SQLite ace-context.db

**Returns**: Reflection ID

#### `invoke-context-inject.sh`
```bash
invoke-context-inject.sh --task-description "Implement auth" \
  --task-tags "backend,security,jwt" --positive-limit 10 --negative-limit 5
```

**Purpose**: Inject adaptive context into agent prompts

**Parameters**:
- `--task-description`: Task description for relevance matching
- `--task-tags`: Comma-separated tags
- `--positive-limit`: Max positive context bullets (default: 10)
- `--negative-limit`: Max negative context bullets (default: 5)
- `--enable-ace`: Enable/disable ACE context (default: true)

**Processing**: Retrieves contexts, scores relevance, applies adaptive limits, merges positive + negative

**Returns**: Unified context markdown

#### `extract-tags.sh`
```bash
extract-tags.sh --task-description "Build React dashboard with charts"
```

**Purpose**: Automatically extract tags from task descriptions

**Parameters**:
- `--task-description`: Task description text

**Extraction**: Keyword matching, technology detection, action verb analysis

**Returns**: Comma-separated tag list (e.g., "frontend,react,visualization,ui")

#### `classify-task.sh`
```bash
classify-task.sh --task-description "Fix SQL injection vulnerability"
```

**Purpose**: Classify task domain for context filtering

**Parameters**:
- `--task-description`: Task description text

**Domains**: frontend, backend, security, devops, testing, database, documentation

**Returns**: Single domain classification

#### `score-relevance.sh`
```bash
score-relevance.sh --context-tags "backend,api" --task-tags "backend,security" \
  --confidence 0.92 --days-ago 15 --frequency 3
```

**Purpose**: Calculate multi-factor relevance score

**Parameters**:
- `--context-tags`: Tags from stored context
- `--task-tags`: Tags from current task
- `--confidence`: Context confidence score
- `--days-ago`: Days since context created
- `--frequency`: Context usage frequency

**Scoring**: Severity 50%, domain 30%, recency 10%, frequency 10%

**Returns**: Score 0.0-1.0

#### `query-anti-patterns.sh`
```bash
query-anti-patterns.sh --domain security --limit 5
```

**Purpose**: Retrieve anti-patterns with relevance scoring

**Parameters**:
- `--domain`: Filter by domain (optional)
- `--limit`: Max results (default: 10)
- `--format`: json or simple (default: simple)

**Processing**: Deduplicates similar failures, sorts by relevance

**Returns**: JSON array or text list

#### `track-ab-test.sh`
```bash
track-ab-test.sh --task-id ID --agent-id AGENT --ace-enabled true \
  --relevance-score 0.85
```

**Purpose**: Track A/B test metrics in Redis

**Parameters**:
- `--task-id`: Task identifier
- `--agent-id`: Agent identifier
- `--ace-enabled`: true/false (treatment/control group)
- `--relevance-score`: Average relevance score

**Storage**: Redis `ace:ab_test:$TASK_ID:$AGENT_ID` (TTL: 7 days)

**Returns**: Success confirmation

#### `analyze-anti-pattern-effectiveness.sh`
```bash
analyze-anti-pattern-effectiveness.sh --time-frame 30
```

**Purpose**: Calculate iteration reduction and confidence improvement metrics

**Parameters**:
- `--time-frame`: Days to analyze (default: 30)

**Metrics**: Iteration reduction, first-iteration confidence, ABORT prevention, A/B comparison

**Returns**: JSON metrics for dashboard

#### `export-ace-metrics.sh`
```bash
export-ace-metrics.sh --format json --output /path/to/metrics.json
```

**Purpose**: Export dashboard metrics in JSON format

**Parameters**:
- `--format`: json or csv (default: json)
- `--output`: Output file path (optional)

**Metrics**: A/B test results, effectiveness data, performance statistics

**Returns**: JSON formatted metrics

## Version
**Current Functions Version**: 2.4.0
**Last Updated**: 2025-10-30