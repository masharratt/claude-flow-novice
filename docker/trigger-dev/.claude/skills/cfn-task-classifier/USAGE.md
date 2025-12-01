# Task Classifier Usage Guide

## Overview

Enhanced task classifier with domain detection and complexity assessment for ACE System Phase 2.4.

## Basic Usage

### Simple Format (Backward Compatible)
```bash
./classify-task.sh "Implement JWT authentication"
# Output: software-development
```

### JSON Format (New in Phase 2.4)
```bash
./classify-task.sh "Implement JWT authentication" --format=json
```

**Output:**
```json
{
  "task_type": "software-development",
  "domains": ["backend", "security"],
  "complexity": "low",
  "keyword_counts": {
    "frontend": 0,
    "backend": 1,
    "security": 3,
    "devops": 0,
    "testing": 0,
    "database": 0,
    "documentation": 0
  },
  "task_type_counts": {
    "software": 2,
    "content": 0,
    "research": 0,
    "design": 0,
    "infrastructure": 0,
    "data": 0
  }
}
```

## Task Types

1. **software-development** - Coding, API development, bug fixes
2. **content-creation** - Documentation, articles, marketing copy
3. **research** - Analysis, investigation, studies
4. **design** - UI/UX, mockups, prototypes
5. **infrastructure** - DevOps, deployment, cloud resources
6. **data-engineering** - ETL pipelines, data warehouses

## Domain Categories

1. **frontend** - React, Vue, Angular, UI/UX, CSS, HTML
2. **backend** - API, server, Node.js, Python, Java
3. **security** - Authentication, JWT, OAuth, encryption
4. **devops** - Docker, Kubernetes, CI/CD, cloud providers
5. **testing** - Unit tests, integration tests, E2E
6. **database** - SQL, NoSQL, PostgreSQL, MongoDB, Redis
7. **documentation** - README, guides, API docs
8. **general** - Default when no specific domain detected

## Complexity Levels

- **low** - Simple, single-domain tasks (< 10 words)
- **medium** - Standard tasks (10-30 words, 1-2 domains)
- **high** - Complex, multi-domain tasks (> 30 words, ≥ 3 domains, or > 2 technical terms)

## Examples

### Single Domain Tasks

**Frontend:**
```bash
./classify-task.sh "Design responsive UI components" --format=json
# domains: ["frontend"], complexity: "low"
```

**Backend:**
```bash
./classify-task.sh "Create REST API endpoints for user management" --format=json
# domains: ["backend"], complexity: "low"
```

**Database:**
```bash
./classify-task.sh "Migrate PostgreSQL schema and optimize queries" --format=json
# domains: ["backend", "database"], complexity: "low"
```

### Multi-Domain Tasks

**Full-Stack:**
```bash
./classify-task.sh "Build React frontend with Node.js backend API" --format=json
# domains: ["frontend", "backend"], complexity: "medium"
```

**Complete System:**
```bash
./classify-task.sh "Architect microservices with Docker, Kubernetes, JWT auth, PostgreSQL, testing suite, and API docs" --format=json
# domains: ["frontend", "backend", "security", "devops", "testing", "database", "documentation"]
# complexity: "high"
```

## Integration with ACE System

### Phase 2.5: Context Retrieval

The domain field enables context retrieval from ACE System indexes:

```bash
# 1. Classify task
CLASSIFICATION=$(./classify-task.sh "$TASK_DESC" --format=json)

# 2. Extract domains
DOMAINS=$(echo "$CLASSIFICATION" | jq -r '.domains[]')

# 3. Query ACE indexes for each domain
for domain in $DOMAINS; do
  query_ace_index "$domain" "$TASK_DESC"
done
```

### CFN Loop Integration

Pass domain information to coordinators for agent specialization:

```bash
DOMAINS=$(./classify-task.sh "$TASK" --format=json | jq -r '.domains[]')

if echo "$DOMAINS" | grep -q "security"; then
  # Include security specialist in Loop 2
  VALIDATORS="$VALIDATORS security-specialist"
fi
```

## API Reference

### Command Line Interface

```
Usage: classify-task.sh "task description" [--format=FORMAT]

Options:
  --format=json    Output detailed JSON with domains and complexity
  --format=simple  Output task type only (default, backward compatible)

Exit Codes:
  0  Success
  1  Invalid usage (missing task description)
```

### JSON Output Schema

```json
{
  "task_type": "string",           // One of 6 task types
  "domains": ["string"],           // Array of 1+ domain categories
  "complexity": "string",          // low | medium | high
  "keyword_counts": {              // Domain-specific keyword matches
    "frontend": number,
    "backend": number,
    "security": number,
    "devops": number,
    "testing": number,
    "database": number,
    "documentation": number
  },
  "task_type_counts": {            // Task type keyword matches
    "software": number,
    "content": number,
    "research": number,
    "design": number,
    "infrastructure": number,
    "data": number
  }
}
```

## Customization

### Adjust Domain Threshold

Edit `classify-task.sh` line 185:
```bash
DOMAIN_THRESHOLD=1  # Increase to require more keyword matches
```

### Add Custom Keywords

Add keywords to relevant arrays (lines 76-116):
```bash
FRONTEND_KEYWORDS+=(
  "svelte" "nextjs" "nuxt"  # Add new frontend frameworks
)
```

### Modify Complexity Heuristics

Edit complexity logic (lines 221-249):
```bash
# Example: Consider tasks with "migrate" keyword as high complexity
if echo "$TASK_LOWER" | grep -q "migrate"; then
  COMPLEXITY="high"
fi
```

## Testing

Run comprehensive test suite:
```bash
bash tests/ace-integration/test-domain-classifier.sh
```

Or test manually:
```bash
./classify-task.sh "Your task description here" --format=json
```

## Performance

- Average execution time: < 50ms
- Memory usage: < 5MB
- No external dependencies (pure bash)

## Troubleshooting

### Issue: Incorrect domain detection

**Solution:** Check keyword arrays for missing terms relevant to your task

### Issue: Complexity always "low"

**Solution:** Verify word count and technical terms in task description

### Issue: JSON parsing errors

**Solution:** Ensure `--format=json` flag is used and output is valid JSON

## See Also

- `docs/PHASE_2_4_DOMAIN_CLASSIFIER.md` - Implementation details
- `.claude/skills/cfn-ace-system/extract-tags.sh` - Tag extraction (Phase 2.1)
- `.claude/skills/cfn-ace-system/score-relevance.sh` - Relevance scoring (Phase 2.2)
