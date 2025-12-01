# ACE System Skill

## Version
**Version:** 1.0.0
**Status:** OPERATIONAL

## Overview
The ACE (Adaptive Context Extension) System skill provides agents with access to advanced context management capabilities including reflection, curation, generation, and injection. This skill wraps the core ACE implementation from `src/ace/` and exposes it through simple shell command interfaces.

## Features
- Context Reflection (Cognitive complexity analysis)
- Context Curation (Merge and prioritize contexts)
- Context Generation (Adaptive context creation)
- Context Injection (Dynamic context augmentation)
- Context Statistics (Query and analyze stored contexts)

## Core Components

### 1. ACE Reflector
Performs cognitive reflection on context data, calculating complexity and generating insights.

**Methods:**
- `reflect()` - Analyze context and generate reflection
- `retrieveReflection()` - Query stored reflections

### 2. ACE Curator
Manages context merging and prioritization for multi-agent scenarios.

**Methods:**
- `mergeContexts()` - Merge multiple contexts with conflict resolution
- `prioritizeReflections()` - Rank reflections by relevance

### 3. ACE Generator
Generates adaptive context based on task requirements and historical data.

**Methods:**
- `generateContext()` - Create new context from specifications

### 4. Context Injector
Dynamically injects context into execution environments.

**Methods:**
- `injectContext()` - Augment execution with additional context
- `executeWithContext()` - Run operations with injected context

## Agent Integration Examples

### 1. Context Reflection

#### Reflect on Current Context
```bash
# Agent analyzes current task context
./.claude/skills/ace-system/invoke-context-reflect.sh \
  --context '{"task": "feature-implementation", "complexity": "high"}' \
  --output /tmp/reflection.json
```

**Returns:** Cognitive reflection with insights and complexity metrics

### 2. Context Statistics

#### Query Context Database
```bash
# Retrieve reflection statistics
./.claude/skills/ace-system/invoke-context-stats.sh \
  --query "reflections" \
  --filter '{"complexity": {"$gt": 0.7}}' \
  --limit 10
```

**Returns:** JSON array of matching reflections

### 3. Context Query

#### Search Similar Contexts
```bash
# Find similar past contexts
./.claude/skills/ace-system/invoke-context-query.sh \
  --keywords "authentication,security" \
  --similarity-threshold 0.8 \
  --max-results 5
```

**Returns:** Ranked list of similar contexts

### 4. Context Injection

#### Inject Context into Execution
```bash
# Augment current execution with historical context
./.claude/skills/ace-system/invoke-context-inject.sh \
  --context-file /tmp/reflection.json \
  --target-task "implement-auth" \
  --merge-strategy "deep"
```

**Returns:** Execution context augmented with injected data

### 5. Context Curation

#### Merge Multiple Contexts
```bash
# Curator merges contexts from multiple agents
./.claude/skills/ace-system/invoke-context-curate.sh \
  --contexts "agent1-context.json,agent2-context.json,agent3-context.json" \
  --strategy "priority-weighted" \
  --output curated-context.json
```

**Returns:** Single merged context with conflict resolution

## Integration with CFN Loop

### Loop 3 Integration (Primary Swarm)
Agents in Loop 3 use ACE for context generation and reflection:

```bash
# Agent completes implementation and reflects
./.claude/skills/ace-system/invoke-context-reflect.sh \
  --context '{"phase": "implementation", "changes": [...]}' \
  --output /tmp/loop3-reflection.json

# Report confidence based on reflection complexity
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Loop 2 Integration (Consensus Validation)
Validators use ACE curator to merge perspectives:

```bash
# Collect reflections from Loop 3 agents
./.claude/skills/ace-system/invoke-context-curate.sh \
  --contexts "loop3-agent1.json,loop3-agent2.json,loop3-agent3.json" \
  --strategy "consensus-weighted" \
  --output /tmp/loop2-merged.json

# Validate merged context
./.claude/skills/ace-system/invoke-context-stats.sh \
  --query "validation" \
  --input /tmp/loop2-merged.json
```

### Product Owner Integration
Product Owner uses ACE for final context injection:

```bash
# Inject business context into technical implementation
./.claude/skills/ace-system/invoke-context-inject.sh \
  --context-file /tmp/loop2-merged.json \
  --business-rules /config/product-requirements.json \
  --output /tmp/final-context.json
```

## Configuration

### Memory Path
ACE uses SQLite for persistence. Default path: `./.artifacts/database/swarm-memory.db`

Override with environment variable:
```bash
export ACE_MEMORY_PATH="/custom/path/swarm-memory.db"
```

### Complexity Thresholds

| Threshold | Value | Description |
|-----------|-------|-------------|
| Low | < 0.3 | Simple, straightforward contexts |
| Medium | 0.3-0.7 | Moderate complexity |
| High | > 0.7 | High complexity requiring deep reflection |

### Merge Strategies

| Strategy | Use Case |
|----------|----------|
| `simple` | Basic context merge, last-write-wins |
| `deep` | Recursive merge with nested conflict resolution |
| `priority-weighted` | Merge based on agent priority levels |
| `consensus-weighted` | Weight by consensus confidence scores |

## Command Reference

### invoke-context-reflect.sh
**Purpose:** Generate cognitive reflection on context

**Arguments:**
- `--context` - JSON context object
- `--complexity` - Override complexity calculation (optional)
- `--output` - Output file path (optional)

**Example:**
```bash
./.claude/skills/ace-system/invoke-context-reflect.sh \
  --context '{"task": "deploy"}' \
  --output reflection.json
```

### invoke-context-stats.sh
**Purpose:** Query reflection database

**Arguments:**
- `--query` - Query type (reflections, insights, summary)
- `--filter` - MongoDB-style filter JSON (optional)
- `--limit` - Maximum results (default: 100)

**Example:**
```bash
./.claude/skills/ace-system/invoke-context-stats.sh \
  --query reflections \
  --filter '{"timestamp": {"$gt": 1697000000}}' \
  --limit 20
```

### invoke-context-query.sh
**Purpose:** Search for similar contexts

**Arguments:**
- `--keywords` - Comma-separated keywords
- `--similarity-threshold` - Minimum similarity (0.0-1.0, default: 0.7)
- `--max-results` - Maximum results (default: 10)

**Example:**
```bash
./.claude/skills/ace-system/invoke-context-query.sh \
  --keywords "authentication,JWT,OAuth" \
  --similarity-threshold 0.8 \
  --max-results 5
```

### invoke-context-inject.sh
**Purpose:** Inject context into execution environment

**Arguments:**
- `--context-file` - Source context JSON file
- `--target-task` - Task ID to inject into
- `--merge-strategy` - Merge strategy (simple, deep, priority-weighted, consensus-weighted)

**Example:**
```bash
./.claude/skills/ace-system/invoke-context-inject.sh \
  --context-file historical-context.json \
  --target-task "sprint-3-auth" \
  --merge-strategy deep
```

### invoke-context-curate.sh
**Purpose:** Merge and curate multiple contexts

**Arguments:**
- `--contexts` - Comma-separated list of context files
- `--strategy` - Curation strategy
- `--output` - Output file path

**Example:**
```bash
./.claude/skills/ace-system/invoke-context-curate.sh \
  --contexts "ctx1.json,ctx2.json,ctx3.json" \
  --strategy consensus-weighted \
  --output merged.json
```

## Use Cases

### 1. Multi-Agent Consensus Building
Use ACE curator to merge insights from multiple agents and reach consensus on complex decisions.

### 2. Historical Context Reuse
Query similar past contexts to inform current task execution and avoid repeating mistakes.

### 3. Complexity-Driven Validation
Use reflection complexity scores to determine appropriate validation depth and gate thresholds.

### 4. Adaptive Resource Allocation
Generate context dynamically based on task requirements to optimize resource usage.

### 5. Cross-Sprint Learning
Inject curated context from previous sprints into new iterations for continuous improvement.

## Dependencies
- Node.js runtime (for TypeScript ACE modules)
- SQLite3 (for persistent context storage)
- Redis (for cross-agent context sharing)
- jq (for JSON processing in shell scripts)

## Error Handling

All ACE skill wrappers follow a consistent error handling pattern:

```bash
if ! result=$(invoke-command.sh --args); then
  echo "ERROR: ACE operation failed"
  exit 1
fi

# Validate JSON output
if ! echo "$result" | jq . > /dev/null 2>&1; then
  echo "ERROR: Invalid JSON response"
  exit 1
fi
```

## Performance Considerations

### Reflection Complexity
High-complexity reflections (> 0.8) may require additional processing time. Consider:
- Batching reflection operations
- Using async reflection for non-blocking execution
- Caching frequently accessed reflections

### Context Curation
Merging large numbers of contexts (> 10) can be resource-intensive:
- Use progressive merging for large agent swarms
- Apply early filtering to reduce context set size
- Leverage Redis for intermediate result caching

### Database Queries
Optimize context queries by:
- Creating appropriate SQLite indexes
- Limiting query result sets
- Using filters to reduce full table scans

## Testing

Test suite location: `.claude/skills/ace-system/test-ace-skill.sh`

**Run tests:**
```bash
./.claude/skills/ace-system/test-ace-skill.sh
```

**Expected output:**
```
[PASS] Context reflection generates valid output
[PASS] Context stats returns filtered results
[PASS] Context query finds similar contexts
[PASS] Context injection merges successfully
[PASS] Context curation handles conflicts
```

## Version History

### v1.0.0 (2025-10-19)
- Initial release
- Wrapper for all 5 ACE slash commands
- Integration with CFN Loop coordination
- Complete test coverage

## Maintenance

**Last Updated:** 2025-10-19
**Next Review:** 2025-11-19
**Owner:** System Architecture Team

## Related Skills
- Redis Coordination (`redis-coordination`)
- SQLite Memory (`sqlite-memory`)
- CFN Loop Validation (`cfn-loop-validation`)

## Support

For issues or questions about the ACE System skill:
1. Check test suite for usage examples
2. Review ACE implementation docs in `src/ace/`
3. Consult Redis Coordination skill for integration patterns
