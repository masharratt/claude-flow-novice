# Centralized RuVector for Cross-Project Learning

## Overview

Create a centralized RuVector instance that stores and shares successful patterns across all projects, accelerating learning and reuse.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Project A      │    │   Project B      │    │   Project C      │
│  (User Auth)      │    │   (E-commerce)   │    │   (Analytics)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ Query Patterns      │ Query Patterns      │ Query Patterns
          │ Store Successes      │ Store Successes      │ Store Successes
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CENTRALIZED RUVECTOR INSTANCE                  │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ Pattern Store   │  │    Index        │  │   Analytics     │   │
│  │                 │  │                 │  │                 │   │
│  • Successes       │  • Semantic Search │  • Usage Stats    │   │
│  • Failures        │  • Vector DB      │  • Success Rates  │   │
│  • Context         │  • Metadata       │  • Trends        │   │
│  • Agent IDs       │  • Relationships  │  • Predictions    │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                   API & Sync Layer                         │ │
│  │                                                               │ │
│  • REST API for queries                                            │ │
│  • GraphQL for complex relationships                               │ │
│  • Sync with local RuVector instances                              │ │
│  • Webhook notifications for pattern updates                        │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    LEARNING AGGREGATOR                        │
│                                                               │
│  • Analyzes patterns across projects                            │
│  • Identifies high-value patterns                               │
│  • Generates insights and recommendations                        │
│  • Updates pattern scores based on success                        │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Design

### 1. Centralized RuVector Server

```yaml
# docker-compose.yml
version: '3.8'

services:
  ruvector-central:
    image: ruvector/central:latest
    container_name: ruvector-central
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/ruvector
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=info
    ports:
      - "8080:8080"
    volumes:
      - ruvector_data:/data
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=ruvector
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  ruvector_data:
  postgres_data:
  redis_data:
```

### 2. Database Schema

```sql
-- Patterns Table
CREATE TABLE patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,  -- 'success', 'failure', 'fix', 'test'
    content TEXT NOT NULL,       -- The actual pattern (code, test, etc.)
    metadata JSONB,             -- Additional metadata
    project_id UUID,            -- Source project
    agent_id VARCHAR(100),       -- Agent that created/used it
    file_type VARCHAR(20),      -- rs, ts, py, etc.
    confidence_score FLOAT,     -- Success rate (0-1)
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_patterns_type ON patterns(type);
CREATE INDEX idx_patterns_file_type ON patterns(file_type);
CREATE INDEX idx_patterns_confidence ON patterns(confidence_score DESC);

-- Pattern Relationships
CREATE TABLE pattern_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_pattern_id UUID REFERENCES patterns(id),
    target_pattern_id UUID REFERENCES patterns(id),
    relationship_type VARCHAR(50),  -- 'follows', 'improves', 'fixes'
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Project Context
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tech_stack JSONB,           -- Languages, frameworks
    repository_url VARCHAR(500),
    last_sync TIMESTAMP
);
```

### 3. API Endpoints

```typescript
// Centralized RuVector API

interface Pattern {
  id: string;
  type: 'success' | 'failure' | 'fix' | 'test';
  content: string;
  metadata: {
    file_type: string;
    agent_id: string;
    project_id?: string;
    success_rate?: number;
    complexity?: 'low' | 'medium' | 'high';
    category?: string;
  };
  confidence_score: number;
  usage_count: number;
}

class RuVectorCentral {
  private apiClient: APIClient;

  constructor(baseURL: string, apiKey: string) {
    this.apiClient = new APIClient(baseURL, apiKey);
  }

  // Query patterns across all projects
  async queryPatterns(query: {
    text?: string;
    file_type?: string;
    agent_id?: string;
    min_confidence?: number;
    type?: string;
    limit?: number;
  }): Promise<Pattern[]> {
    return this.apiClient.get('/patterns', { params: query });
  }

  // Store a new pattern
  async storePattern(pattern: Omit<Pattern, 'id' | 'usage_count'>): Promise<Pattern> {
    return this.apiClient.post('/patterns', pattern);
  }

  // Update pattern usage/success
  async updatePatternUsage(
    patternId: string,
    usage: { success?: boolean; feedback?: string }
  ): Promise<void> {
    return this.apiClient.post(`/patterns/${patternId}/usage`, usage);
  }

  // Get recommendations for a specific context
  async getRecommendations(context: {
    file_type: string;
    agent_id: string;
    project_tech_stack: string[];
    error?: string;
  }): Promise<Pattern[]> {
    return this.apiClient.post('/recommendations', context);
  }
}
```

### 4. Local Sync Integration

```bash
# .claude/skills/cfn-ruvector-central/sync.sh
#!/bin/bash

# Sync local patterns with centralized instance

CENTRAL_URL="${RUVECTOR_CENTRAL_URL:-http://localhost:8080}"
API_KEY="${RUVECTOR_API_KEY:-}"
PROJECT_ID=$(git remote get-url origin | grep -o '[^/]*\.git$' | sed 's/.git$//')

# Upload successful patterns
upload_patterns() {
  local pattern_type="$1"
  local file="$2"

  jq -c '.' /tmp/patterns.json | while read -r pattern; do
    curl -s -X POST "$CENTRAL_URL/api/patterns" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"type\": \"$pattern_type\",
        \"content\": $pattern,
        \"project_id\": \"$PROJECT_ID\",
        \"agent_id\": \"$AGENT_ID\"
      }"
  done
}

# Query patterns from central
query_patterns() {
  local query="$1"

  curl -s "$CENTRAL_URL/api/patterns?text=$query&limit=10" \
    -H "Authorization: Bearer $API_KEY" | \
    jq '.[]'
}

# Sync successful patterns from local to central
sync_successes() {
  echo "Uploading successful patterns to central..."

  # Get local successes
  sqlite3 $COORDINATION_DB_PATH \
    "SELECT prompt, metadata FROM generations WHERE success = 1" \
    | while read -r prompt metadata; do
      curl -s -X POST "$CENTRAL_URL/api/patterns" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
          \"type\": \"success\",
          \"content\": \"$prompt\",
          \"project_id\": \"$PROJECT_ID\",
          \"agent_id\": \"$AGENT_ID\",
          \"metadata\": $metadata
        }"
    done
}

# Download popular patterns
download_patterns() {
  local file_type="${1:-rs}"

  curl -s "$CENTRAL_URL/api/patterns?type=success&file_type=$file_type&limit=20&min_confidence=0.8" \
    -H "Authorization: Bearer $API_KEY" | \
    jq '.[]' > /tmp/central_patterns.json

  echo "Downloaded $(jq length /tmp/central_patterns.json) patterns for $file_type"
}
```

### 5. Enhanced Query Logic

```python
# centralized_ruvector/query_engine.py

class QueryEngine:
    def __init__(self, db, vector_store):
        self.db = db
        self.vector_store = vector_store

    async def search_patterns(self, query: Query) -> List[Pattern]:
        # 1. Vector similarity search
        vector_results = await self.vector_store.similarity_search(
            query.text,
            filters={
                'file_type': query.file_type,
                'type': query.type
            }
        )

        # 2. Metadata filtering
        filtered_results = []
        for result in vector_results:
            pattern = await self.db.get_pattern(result.id)

            # Apply filters
            if pattern.confidence_score >= query.min_confidence:
                if not query.agent_id or pattern.agent_id == query.agent_id:
                    filtered_results.append(pattern)

        # 3. Rank by composite score
        ranked_results = self._rank_patterns(filtered_results, query)

        # 4. Apply project weighting
        final_results = self._apply_project_weighting(ranked_results, query)

        return final_results[:query.limit]

    def _rank_patterns(self, patterns: List[Pattern], query: Query) -> List[Pattern]:
        """Rank patterns by composite score"""
        for pattern in patterns:
            # Composite score = confidence * (1 + usage_weight) * freshness
            usage_weight = min(pattern.usage_count / 100, 0.3)
            freshness = self._calculate_freshness(pattern.updated_at)

            pattern.score = (
                pattern.confidence_score *
                (1 + usage_weight) *
                freshness
            )

        return sorted(patterns, key=lambda p: p.score, reverse=True)

    def _apply_project_weighting(self, patterns: List[Pattern], query: Query) -> List[Pattern]:
        """Boost patterns from similar projects"""
        similar_projects = self._find_similar_projects(query.project_tech_stack)

        for pattern in patterns:
            pattern.score *= 1.5 if pattern.project_id in similar_projects else 1.0

        return patterns
```

### 6. Learning Analytics

```typescript
// Learning Analytics Dashboard

interface Analytics {
  success_rates_by_agent: Record<string, number>;
  popular_patterns: Array<{
    pattern: Pattern;
    usage: number;
    projects: string[];
  }>;
  cross_project_insights: Array<{
    pattern_type: string;
    file_type: string;
    success_rate: number;
    projects_using: number;
  }>;
  trend_analysis: {
    weekly_growth: number;
    emerging_patterns: Pattern[];
  };
}

class LearningAnalytics {
  generateWeeklyReport(): Analytics {
    // Analyze patterns used across projects
    const insights = this.db.query(`
      SELECT
        type,
        file_type,
        AVG(confidence_score) as success_rate,
        COUNT(DISTINCT project_id) as projects_using,
        COUNT(*) as usage
      FROM patterns
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY type, file_type
    `);

    return {
      success_rates_by_agent: this.getAgentSuccessRates(),
      popular_patterns: this.getPopularPatterns(),
      cross_project_insights: insights,
      trend_analysis: this.analyzeTrends()
    };
  }

  identifyHighValuePatterns(): Pattern[] {
    // Patterns that:
    // 1. Have high success rate (>0.9)
    // 2. Used across multiple projects (>3)
    // 3. High agent satisfaction score
    // 4. Solve complex problems

    return this.db.query(`
      SELECT * FROM patterns
      WHERE confidence_score > 0.9
      AND id IN (
        SELECT pattern_id FROM pattern_usage
        WHERE success = true
        GROUP BY pattern_id
        HAVING COUNT(DISTINCT project_id) > 3
      )
      ORDER BY usage_count DESC
    `);
  }
}
```

## Integration with Existing Workflow

### 1. Update coordinator to use central RuVector

```bash
# In coordinate-generation.sh
# Query centralized patterns first
CENTRAL_PATTERNS=$(curl -s "$RUVECTOR_CENTRAL_URL/api/patterns" \
  -H "Authorization: Bearer $RUVECTOR_API_KEY" \
  -G "d" \
  "type=success&file_type=$FILE_TYPE&limit=3")

if [[ -n "$CENTRAL_PATTERNS" ]]; then
    ENHANCED_PROMPT="$ENHANCED_PROMPT

# Centralized Patterns (Global Success):
$CENTRAL_PATTERNS"
fi
```

### 2. Agent Usage

```bash
# Agent queries across all projects
./query-patterns.sh \
  --global true \
  --file-type "rs" \
  --pattern "authentication middleware" \
  --min-confidence 0.85

# Returns patterns from:
# - User Management Systems (95% success)
# - E-commerce Projects (92% success)
# - Analytics Platforms (89% success)
```

### 3. Automated Learning

```bash
# After each successful generation
if [[ "$SUCCESS" == "true" ]]; then
  # Upload to central
  curl -X POST "$RUVECTOR_CENTRAL_URL/api/patterns" \
    -H "Authorization: Bearer $RUVECTOR_API_KEY" \
    -d "{
      \"type\": \"success\",
      \"content\": \"$PROMPT\",
      \"result\": \"$GENERATED_CODE\",
      \"project_id\": \"$PROJECT_ID\",
      \"agent_id\": \"$AGENT_ID\"
    }"

  # Update confidence score
  curl -X POST "$RUVECTOR_CENTRAL_URL/api/patterns/$PATTERN_ID/usage" \
    -H "Authorization: Bearer $RUVECTOR_API_KEY" \
    -d '{ "success": true }'
fi
```

## Benefits

1. **Accelerated Learning**: Patterns discovered in one project benefit all others
2. **Quality Improvement**: Only high-quality patterns (high success rate) are shared
3. **Cross-Domain Insights**: Learn from different domains (e-commerce, analytics, etc.)
4. **Trend Analysis**: Identify emerging patterns and declining approaches
5. **Agent Specialization**: Track which agents excel at which types of patterns

## Migration Strategy

1. **Phase 1**: Deploy central RuVector server
2. **Phase 2**: Add sync functionality to existing skills
3. **Phase 3**: Update coordinators to query central patterns first
4. **Phase 4**: Implement automated learning and analytics
5. **Phase 5**: Optimize based on usage patterns

This creates a knowledge graph of successful development patterns that grows with every project, making each new project start with the collective wisdom of all previous projects.