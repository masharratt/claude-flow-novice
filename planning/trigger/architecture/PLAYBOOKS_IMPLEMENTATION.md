# Playbooks System - Implementation Documentation

**Status:** Design Phase (Not Yet Implemented)
**Target Release:** Post-CFN v3.1
**Complexity:** Medium (Requires SQLite/PostgreSQL, trigger.dev integration, semantic search)
**Owner:** System Architect

---

## 1. Overview

### What Are Playbooks?

Playbooks are **reusable learned patterns** extracted from successful task completions. They represent the collective experience of agents solving problems, similar to how organizations document institutional knowledge or best practices.

**Key Characteristics:**
- **Source-agnostic**: Learned from any successful CFN Loop completion (PROCEED decisions)
- **Pattern-based**: Generalized from specific executions (e.g., "Create TypeScript endpoint" abstracts variable names)
- **Experience-driven**: Success rate improves with repeated use and validation
- **Time-aware**: Newer patterns may supersede older approaches
- **Confidence-graduated**: Patterns require minimum success threshold before general recommendation

### Playbooks vs. Skills

| Aspect | Skills | Playbooks |
|--------|--------|-----------|
| **Definition** | Tool/capability an agent possesses | Learned pattern from successful execution |
| **Lifecycle** | Created once, static | Evolve through usage and feedback |
| **Learning** | Built by developers | Learned from CFN Loop outcomes |
| **Specificity** | General purpose | Contextual and domain-specific |
| **Storage** | `.claude/skills/` directory | Database (SQLite/PostgreSQL) |
| **Versioning** | Git-tracked | Automatic via creation date and usage stats |
| **Usage Model** | Explicitly chosen by agents | Automatically retrieved based on task context |
| **Example** | "Docker build skill" | "TypeScript endpoint creation pattern learned from 47 successful implementations" |

### Value Proposition

**For Agents:**
- Faster task completion: Pre-learned step sequences reduce iteration cycles
- Lower error rates: Patterns encode decisions made by previous agents
- Confidence improvement: Success-rated playbooks provide validation
- Knowledge retention: Institutional memory survives agent rotation

**For System:**
- Continuous improvement: Each PROCEED decision contributes to pattern refinement
- Reduced iterations: Loop 3 agents follow proven paths
- Cost reduction: Fewer iterations = fewer API calls
- Adaptive specialization: Playbooks enable agents to specialize based on domain patterns

**Quantified Benefits (Expected):**
- 20-30% reduction in average iterations per task
- 15-25% faster completion times (first attempt success rates improve)
- 5-10% cost savings from reduced agent spawning
- Knowledge capture: 80%+ of recurring patterns documented within 3 months

---

## 2. Data Model

### Playbook Schema

```typescript
interface Playbook {
  // Identity
  id: string;                           // UUID v4
  name: string;                         // User-friendly name ("TypeScript API Endpoint")
  description?: string;                 // Narrative description

  // Triggering
  trigger_patterns: TriggerPattern[];   // Multiple patterns for matching

  // Execution
  steps: PlaybookStep[];                // Ordered sequence of steps
  estimated_duration_minutes: number;   // For planning
  difficulty_level: "beginner" | "intermediate" | "advanced";

  // Learning & Confidence
  success_count: number;                // Times this playbook led to PROCEED
  failure_count: number;                // Times it led to ITERATE/ABORT
  success_rate: number;                 // success_count / (success_count + failure_count)
  min_confidence_threshold: number;     // Minimum success_rate before auto-recommendation (default: 0.80)

  // Metadata
  created_at: string;                   // ISO 8601
  updated_at: string;                   // Last modified (updated step, stats refresh)
  source_task_id: string;               // Original CFN Loop task ID where learned
  source_agent_type: string;            // Type of agent that created it ("backend-developer", etc.)

  // Lineage
  variant_of?: string;                  // Parent playbook ID if this is a variant
  variants: string[];                   // Child playbook IDs

  // Tags for categorization
  tags: string[];                       // ["typescript", "api", "rest", "database"]
  domain: string;                       // "backend" | "frontend" | "devops" | "security" | etc.

  // Quality metadata
  last_used_at?: string;                // For recency ranking
  usage_count: number;                  // Total times injected into tasks
  effectiveness_score?: number;         // Weighted score (see Retrieval System section)
}

// Minimal playbook: 160 bytes base, 60 bytes per step, 40 bytes per pattern
// Typical playbook (6 steps, 3 patterns): ~500 bytes
```

### PlaybookStep Schema

```typescript
interface PlaybookStep {
  id: string;                           // UUID v4
  sequence: number;                     // Order of execution (1, 2, 3...)
  action: string;                       // Imperative action description
  action_type: "code" | "command" | "review" | "manual" | "verify";

  // Step details
  expected_outcome: string;              // What should happen after this step
  success_indicators: string[];          // Patterns indicating success (regex or keywords)

  // Fallback & Recovery
  fallback_action?: string;              // Alternative if step fails
  rollback_instruction?: string;         // How to undo if needed

  // Learning metadata
  learned_from_iteration?: number;      // Which Loop 3 iteration this step appeared in
  common_mistakes?: string[];            // Anti-patterns seen during learning
  tips?: string[];                       // Optional guidance

  // Validation
  requires_review: boolean;              // Needs human verification before proceeding
  estimated_duration_minutes: number;    // For planning
}

// Average step: ~300 bytes
```

### TriggerPattern Schema

```typescript
interface TriggerPattern {
  id: string;                           // UUID v4
  pattern_type: "regex" | "semantic" | "keyword";
  pattern: string;                      // Regex: "add.*endpoint|create.*api.*route"
                                        // Semantic: "Add REST API endpoint"
                                        // Keyword: ["endpoint", "api", "route"]

  match_confidence: number;              // 0.0-1.0 confidence of match
  examples: string[];                   // Sample task descriptions that matched
  false_positive_rate?: number;          // % of non-matching contexts
}

// Pattern: ~150 bytes + 50 bytes per example
```

### PlaybookStats Schema

```typescript
interface PlaybookStats {
  total_playbooks: number;
  by_domain: Record<string, number>;    // {"backend": 45, "frontend": 23, ...}
  by_success_rate: {
    excellent: number;                  // 0.95-1.0
    good: number;                       // 0.80-0.94
    fair: number;                       // 0.60-0.79
    poor: number;                       // <0.60
  };
  most_used: Array<{id: string, name: string, usage_count: number}>;
  learning_trend: Array<{date: string, new_playbooks: number}>;
  cost_savings_estimated: number;       // (Iterations saved) * (avg cost per iteration)
}
```

### Database Schema (SQL)

```sql
-- Playbooks table
CREATE TABLE playbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  estimated_duration_minutes INTEGER DEFAULT 30,
  difficulty_level TEXT CHECK(difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0,
  min_confidence_threshold REAL DEFAULT 0.8,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  source_task_id TEXT,
  source_agent_type TEXT,
  variant_of TEXT REFERENCES playbooks(id),
  tags TEXT,                    -- JSON array: ["typescript", "api"]
  domain TEXT NOT NULL,
  last_used_at TEXT,
  usage_count INTEGER DEFAULT 0,
  effectiveness_score REAL,
  created_by_agent_id TEXT,
  UNIQUE(name, domain)           -- Prevent duplicate playbook names per domain
);

-- Playbook steps table
CREATE TABLE playbook_steps (
  id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  action TEXT NOT NULL,
  action_type TEXT CHECK(action_type IN ('code', 'command', 'review', 'manual', 'verify')),
  expected_outcome TEXT,
  success_indicators TEXT,      -- JSON array of regex patterns
  fallback_action TEXT,
  rollback_instruction TEXT,
  learned_from_iteration INTEGER,
  common_mistakes TEXT,         -- JSON array
  tips TEXT,                    -- JSON array
  requires_review BOOLEAN DEFAULT FALSE,
  estimated_duration_minutes INTEGER DEFAULT 5,
  UNIQUE(playbook_id, sequence) -- One step per sequence number
);

-- Trigger patterns table
CREATE TABLE trigger_patterns (
  id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  pattern_type TEXT CHECK(pattern_type IN ('regex', 'semantic', 'keyword')),
  pattern TEXT NOT NULL,
  match_confidence REAL NOT NULL,
  examples TEXT,                -- JSON array of example task descriptions
  false_positive_rate REAL DEFAULT 0.0,
  learned_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Playbook usage tracking (for analytics)
CREATE TABLE playbook_usage (
  id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id),
  task_id TEXT NOT NULL,
  injected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  outcome TEXT CHECK(outcome IN ('proceeded', 'iterated', 'aborted', 'abandoned')),
  iteration_reduction INTEGER,  -- How many iterations were saved
  feedback_score REAL,          -- Agent's rating (1-5)
  notes TEXT
);

-- Vector embeddings for semantic search (requires pgvector extension)
CREATE TABLE playbook_embeddings (
  id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  embedding_type TEXT,         -- "description" or "steps"
  embedding VECTOR(1536),       -- OpenAI embedding dimension
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(playbook_id, embedding_type)
);

-- Indexes for performance
CREATE INDEX idx_playbooks_domain ON playbooks(domain);
CREATE INDEX idx_playbooks_success_rate ON playbooks(success_rate DESC);
CREATE INDEX idx_playbooks_created_at ON playbooks(created_at DESC);
CREATE INDEX idx_trigger_patterns_playbook_id ON trigger_patterns(playbook_id);
CREATE INDEX idx_playbook_steps_playbook_id ON playbook_steps(playbook_id);
CREATE INDEX idx_playbook_usage_task_id ON playbook_usage(task_id);
```

---

## 3. Integration with trigger.dev

### Architecture Pattern

```
CFN Loop Task Completion
        ↓
  Extract Playbook Pattern
        ↓
  Store in Playbooks DB
        ↓
  Update Statistics
        ↓
────────────────────────────────────
  Subsequent Task Execution
        ↓
  Retrieve Relevant Playbooks
        ↓
  Inject into Agent Context
        ↓
  Log Usage & Outcome
        ↓
  Update Playbook Stats
```

### Playbook Injection Pattern

**When:** Before spawning Loop 3 agents
**Where:** In orchestrator context injection (enhanced v3.0)
**How:** Query playbooks DB for relevant patterns

```bash
#!/bin/bash
# .claude/skills/playbook-injection/inject-playbooks.sh
# Inject learned playbooks into agent context before execution

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
PLAYBOOKS_DB="${PROJECT_ROOT}/.artifacts/playbooks/playbooks.db"
TASK_DESCRIPTION="$1"
TASK_ID="$2"
MAX_PLAYBOOKS="${3:-5}"  # Prevent overload

if [ ! -f "$PLAYBOOKS_DB" ]; then
  echo "No playbooks database found at $PLAYBOOKS_DB"
  exit 0  # Non-fatal: system functions without playbooks
fi

# Query relevant playbooks
PLAYBOOKS=$(sqlite3 "$PLAYBOOKS_DB" <<EOF
SELECT
  json_object(
    'id', id,
    'name', name,
    'description', description,
    'steps', (
      SELECT json_group_array(
        json_object(
          'sequence', sequence,
          'action', action,
          'expected_outcome', expected_outcome
        )
      )
      FROM playbook_steps
      WHERE playbook_id = playbooks.id
      ORDER BY sequence
    ),
    'success_rate', success_rate,
    'usage_count', usage_count
  ) as playbook
FROM playbooks
WHERE domain = (
  -- Infer domain from task description (heuristic)
  CASE
    WHEN task_description LIKE '%docker%' OR task_description LIKE '%container%' THEN 'devops'
    WHEN task_description LIKE '%typescript%' OR task_description LIKE '%api%' THEN 'backend'
    WHEN task_description LIKE '%react%' OR task_description LIKE '%ui%' THEN 'frontend'
    ELSE 'general'
  END
)
AND success_rate >= min_confidence_threshold
ORDER BY (success_rate * usage_count * recency_score) DESC
LIMIT $MAX_PLAYBOOKS;
EOF
)

# Export for injection into agent context
echo "$PLAYBOOKS"
```

### Playbook Metadata in trigger.dev Jobs

```typescript
// src/types/job-payload.ts
interface JobPayload {
  taskId: string;
  taskDescription: string;
  agentType: string;

  // NEW: Playbooks injection
  suggestedPlaybooks?: {
    id: string;
    name: string;
    relevance_score: number;  // 0.0-1.0
    steps: Array<{
      sequence: number;
      action: string;
      expected_outcome: string;
    }>;
    success_rate: number;
  }[];

  // Metadata for playbook learning
  recordPlaybookUsage?: {
    injected_playbook_ids: string[];
    outcome: 'proceeded' | 'iterated' | 'aborted';
    iteration_reduction?: number;
  };
}
```

### Playbook Recording After CFN Loop Completion

```typescript
// src/services/playbook-service.ts
class PlaybookService {
  async recordTaskCompletion(
    taskId: string,
    outcome: 'proceeded' | 'iterated' | 'aborted',
    loop3Steps: AgentStep[],
    injectedPlaybookIds?: string[]
  ): Promise<void> {
    // Update stats for injected playbooks
    if (injectedPlaybookIds?.length) {
      for (const playbookId of injectedPlaybookIds) {
        const stat = outcome === 'proceeded' ? 'success_count' : 'failure_count';
        await db.run(
          `UPDATE playbooks SET ${stat} = ${stat} + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [playbookId]
        );

        // Record usage event
        await db.run(
          `INSERT INTO playbook_usage (id, playbook_id, task_id, outcome)
           VALUES (?, ?, ?, ?)`,
          [generateId(), playbookId, taskId, outcome]
        );
      }
    }

    // If PROCEED: learn new playbook from successful steps
    if (outcome === 'proceeded') {
      await this.learnPlaybookFromSteps(taskId, loop3Steps);
    }
  }
}
```

---

## 4. Learning Pipeline

### Extraction Phase

**Trigger:** When orchestrator receives PROCEED decision from Product Owner

**Process:**
1. Collect all Loop 3 agent steps from task execution
2. Extract step sequence (filter out retry/fallback steps)
3. Identify common patterns (abstraction)
4. Generate trigger patterns from task description

```typescript
// src/services/playbook-learning.ts
async function extractPlaybookFromSteps(
  taskId: string,
  taskDescription: string,
  steps: ExecutedStep[]
): Promise<PlaybookCandidate> {
  // Step 1: Filter to main execution path (remove fallbacks)
  const mainPath = steps.filter(s => !s.is_fallback && !s.is_retry);

  // Step 2: Generalize variable values
  const generalizedSteps = mainPath.map(step => ({
    action: generalizeAction(step.action),
    expected_outcome: step.result,
    action_type: classifyAction(step.action)
  }));

  // Step 3: Identify domain
  const domain = inferDomain(taskDescription);

  // Step 4: Generate trigger patterns
  const triggers = generateTriggerPatterns(taskDescription);

  return {
    name: generatePlaybookName(generalizedSteps),
    description: generateDescription(taskDescription, generalizedSteps),
    trigger_patterns: triggers,
    steps: generalizedSteps,
    domain,
    source_task_id: taskId,
    difficulty_level: estimateDifficulty(generalizedSteps.length)
  };
}

// Generalization: Replace specific values with placeholders
function generalizeAction(action: string): string {
  // "Create file src/routes/user-endpoint.ts" →
  // "Create file in src/routes/ directory"

  // "Add import from typescript package" →
  // "Add import from external package"

  return action
    .replace(/['"]?[a-z0-9-_./]+\.(ts|tsx|js|jsx)['"]?/gi, '<FILE>')
    .replace(/['\"][^'\"]+['\"]/g, '<VALUE>')
    .replace(/\d+/g, '<NUMBER>');
}

function inferDomain(taskDescription: string): string {
  const keywords = {
    backend: ['api', 'endpoint', 'database', 'server', 'typescript'],
    frontend: ['ui', 'component', 'react', 'css', 'button'],
    devops: ['docker', 'deploy', 'kubernetes', 'cicd', 'container'],
    security: ['auth', 'encryption', 'jwt', 'permission', 'token']
  };

  for (const [domain, words] of Object.entries(keywords)) {
    if (words.some(w => taskDescription.toLowerCase().includes(w))) {
      return domain;
    }
  }
  return 'general';
}

function generateTriggerPatterns(taskDescription: string): TriggerPattern[] {
  return [
    {
      pattern_type: 'semantic',
      pattern: taskDescription,
      match_confidence: 1.0,
      examples: [taskDescription]
    },
    {
      pattern_type: 'regex',
      pattern: extractKeywords(taskDescription).join('|'),
      match_confidence: 0.7,
      examples: [taskDescription]
    }
  ];
}
```

### Deduplication & Conflict Resolution

```typescript
async function checkForDuplicateOrVariant(
  candidate: PlaybookCandidate
): Promise<{isDuplicate: boolean, variantOf?: string}> {
  // Check semantic similarity to existing playbooks
  const existing = await findPlaybooksByDomain(candidate.domain);

  for (const playbook of existing) {
    // Exact match: Same steps in same order
    if (stepsMatch(candidate.steps, playbook.steps)) {
      return {isDuplicate: true};
    }

    // Variant: Similar intent, different details
    const similarity = calculateSemanticSimilarity(
      candidate.description,
      playbook.description
    );

    if (similarity > 0.85) {
      return {
        isDuplicate: false,
        variantOf: playbook.id  // Mark as child variant
      };
    }
  }

  return {isDuplicate: false};
}

// Prevent obsolescence: Archive old playbook if new one is better
async function handleVariantConflict(
  oldPlaybookId: string,
  newPlaybook: PlaybookCandidate
): Promise<void> {
  const old = await db.get('SELECT * FROM playbooks WHERE id = ?', [oldPlaybookId]);

  // Compare: same domain, similar trigger patterns, higher success rate
  if (calculatePlaybookScore(newPlaybook) > calculatePlaybookScore(old)) {
    // Archive old playbook
    await db.run(
      'UPDATE playbooks SET archived_at = CURRENT_TIMESTAMP WHERE id = ?',
      [oldPlaybookId]
    );

    // Link new as successor
    await db.run(
      'UPDATE playbooks SET successor_id = ? WHERE id = ?',
      [newPlaybook.id, oldPlaybookId]
    );
  }
}
```

### Confidence Scoring

```typescript
function calculatePlaybookScore(playbook: Playbook): number {
  // Weighted score based on:
  // - Success rate (40%)
  // - Usage count (30%)
  // - Recency (20%)
  // - Complexity (10%)

  const recencyScore = Math.exp(
    -(Date.now() - new Date(playbook.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000)
  ); // Decay over 30 days

  const usageNormalized = Math.min(playbook.usage_count / 100, 1.0);
  const complexityPenalty = 1.0 - (playbook.steps.length / 20);

  return (
    (playbook.success_rate * 0.4) +
    (usageNormalized * 0.3) +
    (recencyScore * 0.2) +
    (complexityPenalty * 0.1)
  );
}

// Minimum confidence threshold before auto-recommendation
// Can be overridden per playbook
const MIN_CONFIDENCE = 0.80;  // 80% success rate required
```

---

## 5. Retrieval System

### Semantic Search

**Approach:** Vector embeddings for task description matching

```typescript
// src/services/playbook-retrieval.ts
class PlaybookRetriever {
  async findRelevant(
    taskDescription: string,
    limit: number = 5,
    minConfidence: number = 0.75
  ): Promise<Playbook[]> {
    // Step 1: Generate embedding for task description
    const embedding = await this.generateEmbedding(taskDescription);

    // Step 2: Vector similarity search
    const vectorMatches = await db.all(
      `SELECT
        playbooks.*,
        1 - (embedding <-> ?) as similarity_score
      FROM playbook_embeddings
      JOIN playbooks ON playbook_embeddings.playbook_id = playbooks.id
      WHERE embedding_type = 'description'
      AND playbooks.success_rate >= ?
      ORDER BY similarity_score DESC
      LIMIT ?`,
      [embedding, minConfidence, limit * 2]  // Get 2x for filtering
    );

    // Step 3: Keyword-based fallback (for cold start)
    const keywordMatches = await this.keywordSearch(taskDescription);

    // Step 4: Merge and rank by effectiveness
    const combined = this.mergeAndRank([
      ...vectorMatches.map(p => ({...p, rank_source: 'vector'})),
      ...keywordMatches.map(p => ({...p, rank_source: 'keyword'}))
    ]);

    // Step 5: Apply deduplication and limit
    return this.deduplicateAndLimit(combined, limit);
  }

  private mergeAndRank(candidates: any[]): Playbook[] {
    // Effectiveness score = success_rate * log(usage_count + 1) * recency_multiplier
    return candidates
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i) // Deduplicate
      .sort((a, b) => {
        const scoreA = this.calculateEffectivenessScore(a);
        const scoreB = this.calculateEffectivenessScore(b);
        return scoreB - scoreA;
      });
  }

  private calculateEffectivenessScore(playbook: Playbook): number {
    const recencyDays = (Date.now() - new Date(playbook.updated_at).getTime()) /
                        (24 * 60 * 60 * 1000);
    const recencyMultiplier = Math.exp(-recencyDays / 30); // Decay over 30 days

    return (
      playbook.success_rate *
      Math.log(playbook.usage_count + 1) *
      recencyMultiplier
    );
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Use OpenAI embeddings (same as vector DB)
    // NOTE: Requires OpenAI API key and rate limiting
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'  // 1536 dimensions, faster
      })
    });

    const data = await response.json();
    return data.data[0].embedding;
  }
}
```

### Keyword Search (Fallback / Cold Start)

```typescript
async function keywordSearch(taskDescription: string): Promise<Playbook[]> {
  // Parse keywords from task description
  const keywords = extractKeywords(taskDescription);

  // Search trigger patterns
  const matches = await db.all(
    `SELECT DISTINCT playbooks.*
     FROM playbooks
     JOIN trigger_patterns ON playbooks.id = trigger_patterns.playbook_id
     WHERE trigger_patterns.pattern_type = 'keyword'
     AND (${keywords.map(() => "trigger_patterns.pattern LIKE ?").join(' OR ')})
     AND playbooks.success_rate >= 0.75
     ORDER BY playbooks.success_rate DESC, playbooks.usage_count DESC`,
    keywords.map(k => `%${k}%`)
  );

  return matches;
}

function extractKeywords(text: string): string[] {
  // Remove stop words, extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being'
  ]);

  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 10);  // Limit to top 10 keywords
}
```

### Ranking & Filtering

```typescript
interface PlaybookRankingConfig {
  success_rate_weight: number;      // 0.4 (40%)
  usage_count_weight: number;        // 0.3 (30%)
  recency_weight: number;            // 0.2 (20%)
  relevance_weight: number;          // 0.1 (10%)
}

function rankPlaybooks(
  candidates: Playbook[],
  config: PlaybookRankingConfig = {
    success_rate_weight: 0.4,
    usage_count_weight: 0.3,
    recency_weight: 0.2,
    relevance_weight: 0.1
  }
): Playbook[] {
  // Normalize metrics to 0-1 range
  const maxUsage = Math.max(...candidates.map(p => p.usage_count), 1);

  const scored = candidates.map(p => ({
    playbook: p,
    score: (
      (p.success_rate * config.success_rate_weight) +
      ((p.usage_count / maxUsage) * config.usage_count_weight) +
      (calculateRecencyScore(p.created_at) * config.recency_weight) +
      (p.effectiveness_score || 0.5) * config.relevance_weight
    )
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.playbook);
}

function calculateRecencyScore(createdAt: string): number {
  const daysSinceCreation = (Date.now() - new Date(createdAt).getTime()) /
                            (24 * 60 * 60 * 1000);
  // Decay from 1.0 over 90 days to 0.2
  return Math.max(0.2, 1.0 - (daysSinceCreation / 90));
}
```

---

## 6. API Design

```typescript
// src/services/playbook-service.ts

interface PlaybookService {
  // Retrieval
  findRelevant(
    taskDescription: string,
    options?: {
      limit?: number;
      minConfidence?: number;
      domain?: string;
    }
  ): Promise<Playbook[]>;

  // Learning
  recordSuccess(
    taskId: string,
    steps: ExecutedStep[],
    taskDescription: string
  ): Promise<Playbook>;

  // Feedback
  recordFailure(
    playbookId: string,
    taskId: string,
    failureReason: string
  ): Promise<void>;

  recordUsage(
    playbookId: string,
    taskId: string,
    outcome: 'proceeded' | 'iterated' | 'aborted',
    feedbackScore?: number
  ): Promise<void>;

  // Management
  getPlaybook(playbookId: string): Promise<Playbook | null>;
  listPlaybooks(options?: {
    domain?: string;
    minSuccessRate?: number;
    limit?: number;
  }): Promise<Playbook[]>;

  archivePlaybook(playbookId: string): Promise<void>;
  mergePlaybooks(
    primaryId: string,
    secondaryId: string
  ): Promise<Playbook>;

  // Analytics
  getStats(options?: {
    domain?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PlaybookStats>;

  // Vector operations
  rebuildEmbeddings(): Promise<void>;  // Rebuild semantic search index
}

// Example usage in orchestrator
async function injectPlaybooksIntoContext(
  taskDescription: string,
  taskId: string
): Promise<ContextInjection> {
  const playbookService = new PlaybookService();

  // Find relevant playbooks
  const playbooks = await playbookService.findRelevant(taskDescription, {
    limit: 5,
    minConfidence: 0.80
  });

  // Return context injection
  return {
    injectedPlaybookIds: playbooks.map(p => p.id),
    playbookContext: `
## Suggested Playbooks (from ${playbooks.length} candidates)

${playbooks.map((p, i) => `
### ${i + 1}. ${p.name} (Success Rate: ${(p.success_rate * 100).toFixed(0)}%)
${p.description}

**Steps:**
${p.steps.map(s => `- ${s.action}`).join('\n')}

**Confidence:** ${p.success_rate > 0.95 ? 'Very High' : p.success_rate > 0.80 ? 'High' : 'Moderate'}
**Used ${p.usage_count} times**
`).join('\n')}
    `
  };
}
```

---

## 7. Storage Options

### Option A: SQLite (Recommended for MVP)

**Pros:**
- ✅ Zero infrastructure: File-based, no server needed
- ✅ Fast for small-medium datasets (<10k playbooks)
- ✅ Built-in full-text search (FTS5)
- ✅ Transactions and ACID compliance
- ✅ Perfect for local development and single-server deployments

**Cons:**
- ❌ Vector search requires `sqlite-vec` extension (not standard)
- ❌ Limited semantic search capabilities
- ❌ Single-writer concurrency limitation (not critical for playbooks)
- ❌ Scales to ~100k playbooks before performance degrades

**Implementation:**
```bash
# Location: .artifacts/playbooks/playbooks.db
# Initialize: Run schema creation on first boot
sqlite3 .artifacts/playbooks/playbooks.db < schema.sql

# Usage: Connection pooling with sqlite3 module
```

### Option B: PostgreSQL (Recommended for Production)

**Pros:**
- ✅ Excellent for scale (tested to millions of playbooks)
- ✅ pgvector extension for true semantic search
- ✅ Built-in full-text search (tsquery)
- ✅ JSONB for flexible schema evolution
- ✅ Replication and high availability
- ✅ Can co-locate with trigger.dev database

**Cons:**
- ❌ Requires infrastructure (Docker container or managed service)
- ❌ Slightly higher operational overhead
- ⚠️ OpenAI embeddings API calls (cost: ~$0.02/1k playbooks initially)

**Implementation:**
```typescript
// src/db/postgres-connection.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'playbooks',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20
});

// Create pgvector extension
await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);

// Vector similarity query
const result = await pool.query(`
  SELECT id, name, 1 - (embedding <=> $1) as similarity
  FROM playbook_embeddings
  WHERE embedding <=> $1 < 0.3  -- Cosine distance threshold
  ORDER BY embedding <=> $1
  LIMIT 5
`, [embedding]);
```

### Option C: Hybrid Approach

**In Development:** SQLite (zero overhead)
**In Production:** PostgreSQL (for scale + vector search)
**Integration Pattern:**

```typescript
class PlaybookServiceFactory {
  static create(): PlaybookService {
    if (process.env.NODE_ENV === 'production') {
      return new PostgresPlaybookService();
    }
    return new SqlitePlaybookService();
  }
}
```

---

## 8. Example Playbooks

### Playbook #1: TypeScript REST API Endpoint

```yaml
Name: "REST API Endpoint - TypeScript Express"
ID: "pb-rest-api-typescript-001"
Domain: "backend"
Difficulty: "intermediate"
Created: "2024-11-21"
Source Task ID: "task-auth-endpoints-001"

Trigger Patterns:
  - Type: regex
    Pattern: "add.*endpoint|create.*api.*route|implement.*rest"
    Confidence: 0.92
    Examples:
      - "Add GET /users endpoint"
      - "Create new API route for authentication"
      - "Implement REST API for products"

  - Type: semantic
    Pattern: "Create a new HTTP endpoint that handles requests"
    Confidence: 0.88
    Examples:
      - "Add a REST endpoint for user profile"

Statistics:
  Success Rate: 0.89 (44/49)
  Failure Count: 5
  Usage Count: 49
  Last Used: 2024-11-21T14:32:00Z
  Effectiveness Score: 0.78

Steps:
  1. Create route file
     Action: "Create new file in src/routes/ directory with handler function"
     Action Type: "code"
     Expected Outcome: "File created with HTTP method handler (GET/POST/PUT/DELETE)"
     Success Indicators:
       - "File contains express route handler"
       - "Exports router object"
     Estimated Duration: 3 minutes
     Tips:
       - "Use consistent naming: src/routes/{resource}.ts"
       - "Export as default or named export depending on convention"

  2. Define request/response types
     Action: "Add TypeScript interfaces for request and response bodies"
     Action Type: "code"
     Expected Outcome: "Request and response types defined in src/types/"
     Success Indicators:
       - "Interfaces extend from base types"
       - "Include JSDoc comments"
     Estimated Duration: 2 minutes
     Common Mistakes:
       - "Forgetting optional fields (use '?' for optional)"
       - "Not importing types in route file"

  3. Implement route handler
     Action: "Write handler logic with validation and error handling"
     Action Type: "code"
     Expected Outcome: "Handler processes request, validates input, calls service layer"
     Success Indicators:
       - "Uses Express request/response objects"
       - "Includes try-catch or error middleware"
       - "Returns proper HTTP status codes"
     Estimated Duration: 4 minutes
     Tips:
       - "Delegate business logic to service layer (src/services/)"
       - "Let middleware handle cross-cutting concerns (auth, logging)"

  4. Register route in application
     Action: "Add route to main application file or router aggregator"
     Action Type: "code"
     Expected Outcome: "Route is registered and accessible via HTTP"
     Success Indicators:
       - "Route appears in server startup logs"
       - "Endpoint responds to requests"
     Estimated Duration: 2 minutes

  5. Write integration test
     Action: "Create test file in tests/integration/ with endpoint test"
     Action Type: "code"
     Expected Outcome: "Test file covers happy path and error cases"
     Success Indicators:
       - "Test uses supertest or similar HTTP testing library"
       - "Covers 2-3 scenarios (success, bad request, unauthorized)"
     Estimated Duration: 5 minutes
     Tips:
       - "Set up test database or mocks before running tests"
       - "Clean up test data in afterEach hook"

  6. Update API documentation
     Action: "Add endpoint to OpenAPI spec (swagger.yaml)"
     Action Type: "manual"
     Expected Outcome: "Endpoint documented with all parameters and responses"
     Success Indicators:
       - "OpenAPI spec validates without errors"
       - "Documentation includes examples"
     Requires Review: false
     Estimated Duration: 3 minutes

Total Estimated Duration: 19 minutes
Difficulty Assessment: "Intermediate - requires knowledge of Express routing, TypeScript, and testing"
```

### Playbook #2: Docker Image Build & Push

```yaml
Name: "Docker Image Build and Push to Registry"
ID: "pb-docker-build-push-001"
Domain: "devops"
Difficulty: "beginner"
Created: "2024-11-20"

Trigger Patterns:
  - Type: keyword
    Pattern: ["docker", "build", "push", "image", "container", "registry"]
    Confidence: 0.85

  - Type: semantic
    Pattern: "Create and publish a Docker container image"
    Confidence: 0.82

Statistics:
  Success Rate: 0.94 (30/32)
  Failure Count: 2
  Usage Count: 32
  Effectiveness Score: 0.83

Steps:
  1. Create Dockerfile
     Action: "Create or review Dockerfile in project root"
     Expected Outcome: "Valid multi-stage Dockerfile present"
     Success Indicators:
       - "File named 'Dockerfile' (case-sensitive)"
       - "Contains FROM, RUN, COPY, or CMD instructions"

  2. Build Docker image locally
     Action: "Run docker build to create image and verify it builds"
     Action Type: "command"
     Expected Outcome: "Docker image built successfully with no errors"
     Success Indicators:
       - "Docker output shows 'Successfully tagged <image:tag>'"
       - "Image appears in 'docker images' output"
     Fallback Action: "Check Dockerfile syntax, verify base image availability"
     Tips:
       - "Use .dockerignore to exclude unnecessary files (25-40% faster builds)"

  3. Test image locally
     Action: "Run container locally and verify it works"
     Action Type: "verify"
     Expected Outcome: "Container starts, processes requests, exits cleanly"
     Success Indicators:
       - "Container runs without immediate crashes"
       - "Application health check passes"
     Estimated Duration: 3 minutes

  4. Push to registry
     Action: "Push image to Docker Hub, ECR, or other registry"
     Action Type: "command"
     Expected Outcome: "Image available in registry for deployment"
     Success Indicators:
       - "Registry API returns 200 OK"
       - "Image tag searchable in registry"
     Estimated Duration: 2 minutes

Total Estimated Duration: 12 minutes
```

### Playbook #3: Bug Investigation and Fix (High-Complexity Example)

```yaml
Name: "TypeScript Type Error Investigation and Resolution"
ID: "pb-ts-type-error-fix-001"
Domain: "backend"
Difficulty: "intermediate"
Created: "2024-11-15"

Trigger Patterns:
  - Pattern: "fix.*typescript.*error|resolve.*type.*error|cannot find"
    Type: "regex"
    Confidence: 0.91

Steps:
  1. Locate error source
     Action: "Find compilation error in TypeScript build output"
     Expected Outcome: "Error location and message identified"
     Common Mistakes:
       - "Ignoring all errors in tsconfig.json instead of fixing root cause"

  2. Understand type mismatch
     Action: "Analyze type definitions and trace value assignments"
     Expected Outcome: "Root cause identified (missing type, wrong interface, etc.)"

  3. Apply minimal fix
     Action: "Fix with smallest change required (prefer type assertion over refactoring)"
     Expected Outcome: "Compilation succeeds"
     Tips:
       - "If unsure between fix approaches, choose strictest interpretation"

  4. Verify fix doesn't break other code
     Action: "Run full TypeScript compiler and test suite"
     Expected Outcome: "No new errors introduced"

Total Estimated Duration: 8 minutes
Success Rate: 0.87
```

---

## 9. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

- [ ] **Database**: Create SQLite schema with migrations
- [ ] **Core Service**: Implement PlaybookService (CRUD, basic search)
- [ ] **Learning**: Extract patterns from successful CFN Loop completions
- [ ] **Integration**: Hook into orchestrator for playbook recording
- [ ] **Tests**: Unit tests for extraction and search logic
- **Status Check:** Playbooks extracting and storing successfully

### Phase 2: Retrieval & Injection (Weeks 3-4)

- [ ] **Search**: Implement keyword search (fallback)
- [ ] **Injection**: Add playbook suggestions to agent context
- [ ] **Metrics**: Track playbook usage and outcomes
- [ ] **Tests**: End-to-end retrieval and ranking tests
- **Status Check:** Agents receive playbooks, usage metrics tracked

### Phase 3: Semantic Search (Weeks 5-6)

- [ ] **Embeddings**: Generate OpenAI embeddings for playbook descriptions
- [ ] **Vector DB**: Migrate to PostgreSQL + pgvector for production
- [ ] **Similarity**: Implement vector similarity search
- [ ] **Tests**: Semantic search quality tests
- **Status Check:** Vector search outperforming keyword search

### Phase 4: Advanced Features (Weeks 7-8)

- [ ] **Variants**: Track playbook lineage and variants
- [ ] **Feedback Loop**: Agent feedback on playbook helpfulness
- [ ] **Archive**: Automatic archival of obsolete patterns
- [ ] **Analytics Dashboard**: Playbook stats and trends
- **Status Check:** System identifies and removes outdated playbooks

---

## 10. Monitoring & Metrics

### Key Performance Indicators

```yaml
Extraction Metrics:
  - Playbooks learned per week: Target 5-10 new patterns
  - Average success rate: Target >0.80
  - Coverage: % of task descriptions matching playbooks

Retrieval Metrics:
  - Precision@5: % of top 5 recommendations relevant to task
  - Recall: % of applicable playbooks successfully found
  - Ranking quality: Correlation of effectiveness_score to actual outcomes

Impact Metrics:
  - Iteration reduction: Avg iterations with playbooks vs without
  - Confidence improvement: % agents following playbook complete in 1 iteration
  - Cost savings: Reduced API calls from fewer iterations
  - Time savings: Avg task completion time delta

Health Metrics:
  - Playbook staleness: % of playbooks unused in 30+ days
  - Duplicate detection: Variance when learning similar patterns
  - False positive rate: % of injected playbooks marked unhelpful by agents
```

### Instrumentation Checklist

- [ ] Log all playbook retrievals with relevance scores
- [ ] Track playbook injection into agent context
- [ ] Record success/failure outcomes with iteration counts
- [ ] Monitor query performance (semantic search latency)
- [ ] Alert on embedding API failures (fallback to keyword search)
- [ ] Dashboard: Playbook stats by domain, trending patterns

---

## 11. Runtime Validation Requirements

### Items Needing Testing Before Release

**High Priority:**
- [ ] Semantic similarity scoring matches human intuition (manual validation)
- [ ] Duplicate playbooks properly detected (false positive < 5%)
- [ ] Vector search latency acceptable (<500ms for top-5 retrieval)
- [ ] Playbook injection improves iteration rates (A/B test with 50 tasks)
- [ ] Learning pipeline doesn't create broken/invalid playbooks (schema validation)

**Medium Priority:**
- [ ] Archive mechanism doesn't remove still-useful playbooks (review archived playbooks)
- [ ] Success rate calculations correct after edge cases (failure injection tests)
- [ ] Variant lineage tracking prevents duplicate variants
- [ ] Performance with 1000+ playbooks (load testing)

**Lower Priority:**
- [ ] Dashboard query performance with historical data
- [ ] Embedding generation costs within budget
- [ ] Long-term trend analysis accuracy

---

## 12. Security & Privacy Considerations

### Data Classification

```yaml
Playbooks Table:
  Classification: "Internal"
  Sensitivity: "Low" (Patterns learned from task descriptions, not credentials)
  Retention: Indefinite (Institutional knowledge)
  Access: All CFN Loop agents
  Risk: Exposure could leak business patterns

Playbook Usage Table:
  Classification: "Internal"
  Sensitivity: "Medium" (Tracks task success/failure)
  Retention: 90 days (For trend analysis)
  Access: Orchestrators and analytics
  Risk: Success/failure patterns could inform attackers

Embeddings Table:
  Classification: "Internal"
  Sensitivity: "Low" (Vector representations, not raw data)
  Retention: 30 days (Rebuild periodically)
  Access: Orchestrators (retrieval only)
  Risk: Minimal (vectors are non-reversible)
```

### Implementation Guidelines

- **No Secrets**: Playbooks MUST NOT contain API keys, passwords, or credentials
- **Validation**: Strip sensitive patterns during extraction (regex on action field)
- **Audit**: Log all playbook access with agent ID and timestamp
- **Encryption**: Encrypt connection strings in deployment (env vars)
- **Access Control**: Agents can only read playbooks, not create/modify
- **Review**: Manual spot-check of first 10 learned playbooks for privacy

```typescript
// Validation: Reject playbooks containing sensitive patterns
function validatePlaybookSafety(playbook: PlaybookCandidate): boolean {
  const sensitivePatterns = [
    /password|pwd|secret|token|key|credential/i,
    /api[-_]?key|bearer|authorization/i,
    /\$\{[^}]*\}/,  // Variable substitutions that might hide secrets
  ];

  const allText = [
    playbook.name,
    playbook.description,
    ...playbook.steps.map(s => s.action + s.expected_outcome)
  ].join(' ');

  for (const pattern of sensitivePatterns) {
    if (pattern.test(allText)) {
      console.warn(`Playbook rejected: Contains sensitive pattern`);
      return false;
    }
  }

  return true;
}
```

---

## 13. Future Enhancements

### Post-MVP Roadmap

1. **Playbook Versioning**
   - Track playbook evolution over time
   - A/B test different versions automatically
   - Rollback to previous version if success rate drops

2. **Human Validation**
   - Allow domain experts to rate/improve playbooks
   - Crowdsource playbook refinement
   - Mark playbooks as "verified" by expert review

3. **Multi-Modal Playbooks**
   - Video tutorials for complex playbooks
   - Interactive checklists for manual steps
   - Code examples embedded in steps

4. **Automatic Optimization**
   - Reorder steps to minimize dependencies
   - Identify and eliminate redundant steps
   - Merge similar playbooks with variants

5. **Agent Specialization**
   - Track which agent types perform best with each playbook
   - Route playbooks to agents with best track record
   - Learn agent-specific playbook variations

---

## 14. Configuration & Deployment

### Environment Variables

```bash
# .env.playbooks
PLAYBOOKS_ENABLED=true
PLAYBOOKS_DB_PATH=.artifacts/playbooks/playbooks.db
PLAYBOOKS_MAX_PER_TASK=5
PLAYBOOKS_MIN_CONFIDENCE=0.80

# PostgreSQL (production only)
PLAYBOOKS_DB_TYPE=postgres
DB_HOST=postgres
DB_PORT=5432
DB_NAME=playbooks
DB_USER=postgres
DB_PASSWORD=[REDACTED]

# Embeddings (semantic search)
PLAYBOOKS_EMBEDDINGS_ENABLED=true
OPENAI_API_KEY=[REDACTED]
EMBEDDINGS_MODEL=text-embedding-3-small

# Analytics
PLAYBOOKS_ANALYTICS_ENABLED=true
PLAYBOOKS_STATS_RETENTION_DAYS=90
```

### Docker Integration

```dockerfile
# Add to orchestrator Dockerfile
RUN mkdir -p /app/.artifacts/playbooks
RUN chmod 777 /app/.artifacts/playbooks

# Volume for persistent playbooks
VOLUME ["/app/.artifacts/playbooks"]

# Health check: ensure playbooks DB is accessible
HEALTHCHECK --interval=30s --timeout=5s \
  CMD sqlite3 /app/.artifacts/playbooks/playbooks.db "SELECT COUNT(*) FROM playbooks" || exit 1
```

---

## 15. References & Related Systems

**Dependencies:**
- CFN Loop orchestrator (v3.0+) - for task completion hooks
- trigger.dev - for job payload injection
- PostgreSQL (optional) - for production scale
- OpenAI Embeddings API - for semantic search (optional for MVP)

**Related Documentation:**
- `.claude/skills/cfn-loop-validation/SKILL.md` - Orchestration patterns
- `docs/CFN_LOOP_ARCHITECTURE.md` - Loop completion lifecycle
- `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md` - Test-driven validation

**Reference Implementations:**
- Anthropic: "Build systems that learn from experience" (internal research)
- Codeium: Codeium Copilot uses pattern learning from accepted completions
- GitHub: GitHub Copilot uses similar training patterns from open source

---

## Summary

The Playbooks system transforms CFN Loop from a one-shot task executor into a **continuous learning platform**. By capturing successful patterns and reusing them intelligently:

- **Agents complete tasks faster** (20-30% fewer iterations expected)
- **System improves over time** (each PROCEED decision teaches something new)
- **Knowledge becomes reusable** (patterns transfer across similar tasks)
- **Costs decrease** (fewer iterations = fewer API calls)

The implementation prioritizes **simplicity first** (SQLite MVP) with a clear path to **production scale** (PostgreSQL + pgvector) when needed.

---

**Document Version:** 1.0
**Last Updated:** 2024-11-21
**Next Review:** When Phase 1 implementation begins
