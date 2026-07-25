# Playbook-Driven Architecture: Ephemeral Agents with Eternal Knowledge

**Concept:** Short-lived agents + Persistent playbooks = Organizational consistency

---

## Core Principle

**Agents are ephemeral (spawn per task), but knowledge is eternal (survives in playbooks).**

### Traditional Persistent Agent Problem

```
┌─────────────────────────────────────────────────┐
│ Persistent Agent (runs 24/7)                   │
├─────────────────────────────────────────────────┤
│ Task 1: Create email campaign                  │
│   - Learns: Mailchimp uses X-API-Key header    │
│   - Stores in: Process memory                  │
│                                                 │
│ Task 2: Create social post                     │
│   - Context pollution: Email knowledge affects │
│     social task (confusion)                     │
│                                                 │
│ Task 3: Analyze data                           │
│   - Memory leak: Process consumes 2GB RAM      │
│                                                 │
│ [Agent crashes]                                 │
│   - Knowledge LOST (process memory gone)       │
│   - Next agent starts from zero                 │
└─────────────────────────────────────────────────┘

Cost: Agent runs 24/7 = $480/month
Knowledge persistence: 0% (lost on crash)
Consistency: Low (context pollution between tasks)
```

### Our Playbook-Driven Solution

```
┌──────────────────────────────────────────┐
│ ACE Playbook (PostgreSQL)                │
│ - Scope: team:marketing                  │
│ - 100+ lessons accumulated               │
│ - Confidence-scored, tagged              │
└──────────────────────────────────────────┘
           ↑ store lessons    ↓ load playbook
           │                  │
┌──────────┴──────────────────┴──────────┐
│ Ephemeral Agent Lifecycle              │
├─────────────────────────────────────────┤
│ Task 1: Create email campaign           │
│   1. Spawn agent (fresh process)        │
│   2. Load playbook (100 lessons)        │
│   3. Execute task (informed by lessons) │
│   4. Store new lesson: "Mailchimp..."   │
│   5. Exit (process terminates)          │
│                                          │
│ Task 2: Create social post              │
│   1. Spawn NEW agent (clean state)      │
│   2. Load playbook (101 lessons now)    │
│   3. Execute task (sees Task 1 lesson)  │
│   4. Store new lesson: "Meta API..."    │
│   5. Exit                                │
│                                          │
│ Task 3: Analyze data                    │
│   1. Spawn NEW agent                    │
│   2. Load playbook (102 lessons)        │
│   3. Execute task                        │
│   4. Store new lesson                    │
│   5. Exit                                │
└──────────────────────────────────────────┘

Cost: Pay only for task execution = $50/month
Knowledge persistence: 100% (survives crashes)
Consistency: High (shared playbook, no pollution)
```

---

## Agent Lifecycle in Detail

### Step 1: Coordinator Receives Task

```bash
# Main Chat sends task to Marketing Coordinator
redis-cli LPUSH "team:marketing:coordinator:inbox" '{
  "task_id": "task-123",
  "type": "create_email_campaign",
  "description": "Create product launch email for Widget 2.0",
  "priority": "high"
}'
```

### Step 2: Coordinator Spawns Ephemeral Agent

```bash
# Marketing Coordinator (running in Docker container)
# Receives task from Redis inbox

# Automatically invoke context injection (pre-spawn hook)
./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
  --task-id "task-123" \
  --agent-type "email-campaigns" \
  --tags "email,product-launch,mailchimp" \
  --scope "team:marketing" \
  --output "/tmp/context-task-123.json"

# Context injection output:
{
  "lessons": [
    {
      "content": "Mailchimp API uses X-API-Key header for authentication",
      "confidence": 0.95,
      "success_count": 52,
      "total_count": 53,
      "tags": ["email", "mailchimp", "api", "authentication"],
      "scope": "team"
    },
    {
      "content": "Product launch emails perform best on Tuesday 10am EST",
      "confidence": 0.92,
      "success_count": 38,
      "total_count": 40,
      "tags": ["email", "product-launch", "timing"],
      "scope": "team"
    },
    {
      "content": "Use environment variables for API keys (${VAR_NAME})",
      "confidence": 0.98,
      "success_count": 125,
      "total_count": 127,
      "tags": ["security", "api", "best-practice"],
      "scope": "org"
    }
    // ... 97 more lessons
  ],
  "total_lessons": 100,
  "load_time_ms": 342
}

# Spawn ephemeral agent with context
docker exec marketing-coordinator \
  npx claude-flow-novice agent email-campaigns \
  --task-id "task-123" \
  --context-file "/tmp/context-task-123.json" \
  --agent-id "email-campaigns-agent-456"
```

### Step 3: Agent Loads Playbook and Executes

```
Agent Process:
1. Read context file: /tmp/context-task-123.json
2. Parse 100 lessons into working memory
3. Execute task with playbook knowledge:
   - Knows: Mailchimp uses X-API-Key (lesson 1)
   - Knows: Best send time is Tuesday 10am (lesson 2)
   - Knows: Use env vars for API keys (lesson 3)
4. Create email campaign:
   - Auth: X-API-Key header (from lesson 1) ✓
   - Schedule: Tuesday 10am EST (from lesson 2) ✓
   - API key: ${MAILCHIMP_API_KEY} (from lesson 3) ✓
5. Discover new lesson:
   - "Product launch subject lines <40 chars get 3x open rate"
6. Report confidence: 0.93
```

### Step 4: Agent Stores New Lessons

```bash
# Automatically invoke context reflection (post-completion hook)
./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
  --task-id "task-123" \
  --agent-id "email-campaigns-agent-456" \
  --auto-extract  # Extract lessons from agent output

# Auto-extracted lesson:
{
  "content": "Product launch subject lines <40 chars get 3x open rate",
  "scope": "team",
  "team_id": "marketing",
  "tags": ["email", "product-launch", "subject-lines", "optimization"],
  "confidence": 0.85,
  "success_count": 1,
  "total_count": 1,
  "created_at": "2025-10-30T10:45:00Z"
}

# Stored to PostgreSQL
INSERT INTO context_reflections (
  content, scope, team_id, tags, confidence, success_count, total_count
) VALUES (
  'Product launch subject lines <40 chars get 3x open rate',
  'team',
  'marketing',
  ARRAY['email', 'product-launch', 'subject-lines', 'optimization'],
  0.85,
  1,
  1
);
```

### Step 5: Agent Exits

```bash
# Agent reports completion
redis-cli LPUSH "team:marketing:coordinator:inbox" '{
  "task_id": "task-123",
  "agent_id": "email-campaigns-agent-456",
  "status": "complete",
  "confidence": 0.93,
  "deliverables": ["email-campaign-widget-2.0.json"],
  "execution_time_ms": 45320
}'

# Agent process terminates
exit 0

# Process no longer exists
# But knowledge persists in PostgreSQL!
```

---

## Playbook Accumulation Over Time

### Week 1 (Marketing Epic Sprint 1.1)

**Agent 1: Email Campaigns Developer**
```
Load playbook: 0 lessons (empty - first agent)
Execute: Create email campaigns skill
Discover: "Mailchimp uses X-API-Key header"
Store lesson: Confidence 0.75 (first attempt)
Exit

Playbook size: 1 lesson
```

**Agent 2: Email Campaigns Validator**
```
Load playbook: 1 lesson
Execute: Validate email skill
Apply: Use X-API-Key header (from Agent 1)
Discover: "Test emails should go to +test@ alias"
Update existing: "Mailchimp..." confidence 0.80 → 0.85 (2/2 success)
Store new lesson: "Test emails..."
Exit

Playbook size: 2 lessons
```

### Week 2 (Sprint 1.2)

**Agent 3: Social Publishing Developer**
```
Load playbook: 2 lessons (email-specific)
Execute: Create social publishing skill
Discover: "Meta API uses Bearer token, not API key"
Store lesson: Confidence 0.80
Exit

Playbook size: 3 lessons
```

### Week 18 (Sprint 5.3 - 57th Agent)

**Agent 57: Media Monitoring Developer**
```
Load playbook: 142 lessons
- 52 email-related
- 38 social-related
- 24 API authentication patterns
- 18 rate limiting strategies
- 10 error handling best practices

Execute: Create media monitoring skill
Apply: 12 relevant lessons from playbook
  - API authentication pattern (lesson 24)
  - Rate limiting strategy (lesson 78)
  - Error retry logic (lesson 103)
Discover: "Meltwater API requires IP whitelisting"
Store lesson: Confidence 0.88
Exit

Playbook size: 143 lessons
```

**Impact:** Agent 57 executes perfectly on first try (no trial-and-error) because it learned from 56 previous agents.

---

## Scope Hierarchy: Personal, Team, Org

### Agent Context Loading (Multi-Scope)

```sql
-- Query when email-campaigns agent spawns
SELECT content, scope, confidence, success_count, total_count
FROM context_reflections
WHERE
  -- Personal lessons (highest priority)
  (scope = 'agent' AND owner_id = 'email-campaigns-agent-456')
  OR
  -- Team lessons (medium priority)
  (scope = 'team' AND team_id = 'marketing')
  OR
  -- Org lessons (lowest priority)
  (scope = 'org')
ORDER BY
  CASE scope
    WHEN 'agent' THEN 1
    WHEN 'team' THEN 2
    WHEN 'org' THEN 3
  END,
  confidence DESC;

Results (100 lessons):
1. [AGENT] "I prefer detailed error messages" - 1.00 confidence (personal)
2. [TEAM]  "Marketing emails: Tuesday 10am" - 0.92 confidence
3. [TEAM]  "Mailchimp uses X-API-Key header" - 0.95 confidence
4. [ORG]   "Use env vars for API keys" - 0.98 confidence
5. [ORG]   "Retry failed API calls 3 times" - 0.93 confidence
...
100. [ORG] "Log all API errors to ELK" - 0.88 confidence
```

### Conflict Resolution Example

```
Scenario: Authentication best practice

Agent lessons (scope=agent):
- "Use API key in URL params for speed" - 0.60 confidence (failed 2/5 times)

Team lessons (scope=team):
- "Mailchimp: Use X-API-Key header" - 0.95 confidence (worked 52/53 times)

Org lessons (scope=org):
- "Never put API keys in URL (logged in server)" - 0.98 confidence

Resolution:
Agent loads all 3 lessons.
Priority: org > team > agent
Winner: "Never put API keys in URL" (org-level, highest confidence)

Agent applies: X-API-Key header (team-specific implementation of org principle)
Agent ignores: URL params approach (personal lesson, low confidence)
```

---

## Automatic Context Injection/Reflection

### Pre-Spawn Hook (Automatic Playbook Loading)

```bash
# orchestrate.sh (CFN Loop orchestrator)
spawn_agent() {
  local agent_type=$1
  local task_id=$2
  local task_description=$3

  # 1. Extract tags from task description (NLP-lite)
  local tags=$(extract_tags "$task_description")
  # "Create email campaign for product launch"
  # → tags: email,campaign,product,launch

  # 2. Automatically invoke context injection
  ./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
    --task-id "$task_id" \
    --agent-type "$agent_type" \
    --tags "$tags" \
    --scope "team:marketing" \
    --output "/tmp/context-$task_id.json"

  # 3. Spawn agent with context file
  npx cfn agent "$agent_type" \
    --task-id "$task_id" \
    --context-file "/tmp/context-$task_id.json" \
    --agent-id "$agent_type-$RANDOM"
}
```

### Post-Completion Hook (Automatic Lesson Storage)

```bash
# orchestrate.sh (after agent completes)
collect_lessons() {
  local task_id=$1
  local agent_id=$2

  # 1. Read agent output from Redis
  local output=$(redis-cli GET "cfn_loop:task:$task_id:agent:$agent_id:output")

  # 2. Automatically extract lessons using regex patterns
  ./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
    --task-id "$task_id" \
    --agent-id "$agent_id" \
    --auto-extract \
    --agent-output "$output"
}

# invoke-context-reflect.sh (auto-extract logic)
extract_lessons_from_output() {
  local output=$1

  # Regex patterns for lesson detection
  grep -oP 'Learned: \K.*' "$output"
  grep -oP 'Best practice: \K.*' "$output"
  grep -oP 'Anti-pattern: \K.*' "$output"
  grep -oP 'Key insight: \K.*' "$output"

  # Each match becomes a lesson
  # Confidence score based on context (0.80 default for new lessons)
}
```

**Agent Output Example:**

```
Task: Create email campaign skill

[Agent execution log]
Creating .claude/skills/cfn-marketing-email-campaigns/

Learned: Mailchimp API uses X-API-Key header for authentication
Best practice: Test emails should use +test@ alias to avoid spam filters
Anti-pattern: Don't hardcode API keys in workflow JSON (use env vars)

Skill created successfully.
Confidence: 0.93
```

**Auto-Extracted Lessons (3):**

```json
[
  {
    "content": "Mailchimp API uses X-API-Key header for authentication",
    "type": "learned",
    "confidence": 0.85,
    "tags": ["mailchimp", "api", "authentication"]
  },
  {
    "content": "Test emails should use +test@ alias to avoid spam filters",
    "type": "best_practice",
    "confidence": 0.80,
    "tags": ["email", "testing", "spam-filters"]
  },
  {
    "content": "Don't hardcode API keys in workflow JSON (use env vars)",
    "type": "anti_pattern",
    "confidence": 0.90,
    "tags": ["security", "api-keys", "environment-variables"]
  }
]
```

**Result:** Zero manual invoke, 100% playbook coverage.

---

## Consistency in Service

### Without Playbook (Chaos)

```
Agent 1 (Week 1): Discovers Mailchimp uses X-API-Key
                  Stores in process memory
                  [Crashes] → Knowledge lost

Agent 2 (Week 2): Tries Authorization: Bearer
                  FAILS (Mailchimp doesn't support Bearer)
                  Rediscovers X-API-Key
                  Stores in process memory
                  [Exits] → Knowledge lost

Agent 3 (Week 3): Tries Basic auth
                  FAILS
                  Rediscovers X-API-Key AGAIN

Result: 3 weeks, 3 agents, same mistake repeated
        Zero learning, zero consistency
```

### With Playbook (Learning)

```
Agent 1 (Week 1): Discovers Mailchimp uses X-API-Key
                  Stores to playbook (confidence 0.75, 1/1 success)
                  Exits

Agent 2 (Week 2): Loads playbook → sees X-API-Key lesson
                  Applies X-API-Key immediately (no trial-and-error)
                  SUCCESS
                  Updates lesson (confidence 0.85, 2/2 success)
                  Exits

Agent 3 (Week 3): Loads playbook → sees X-API-Key lesson (0.85 confidence)
                  Applies X-API-Key immediately
                  SUCCESS
                  Updates lesson (confidence 0.90, 3/3 success)
                  Exits

Agent 57 (Week 18): Loads playbook → sees X-API-Key lesson (0.95 confidence, 52/53 success)
                    100% confident this works
                    Applies immediately, zero errors

Result: 18 weeks, 57 agents, ZERO repeated mistakes
        Cumulative learning, perfect consistency
```

---

## Benefits Summary

| Aspect | Persistent Agents | Ephemeral + Playbook |
|--------|------------------|---------------------|
| **Cost** | $480/month per agent | $50/month (pay per task) |
| **Idle overhead** | 95% (agents wait for tasks) | 0% (spawn only when needed) |
| **Knowledge persistence** | 0% (lost on crash) | 100% (survives crashes) |
| **Context pollution** | High (memory from task 1 affects task 2) | Zero (clean state per task) |
| **Consistency** | Low (each agent reinvents wheel) | High (shared playbook) |
| **Learning rate** | None (no cross-agent learning) | Cumulative (each agent builds upon previous) |
| **Scalability** | Poor (N agents = N processes running) | Excellent (spawn on-demand) |

---

## Playbook Metrics (After 18 Weeks)

**Marketing Team Playbook:**
```sql
SELECT
  scope,
  COUNT(*) as lesson_count,
  AVG(confidence) as avg_confidence,
  SUM(success_count) as total_successes,
  SUM(total_count) as total_attempts
FROM context_reflections
WHERE team_id = 'marketing'
GROUP BY scope;

Results:
┌───────┬──────────────┬────────────────┬──────────────────┬────────────────┐
│ Scope │ Lesson Count │ Avg Confidence │ Total Successes  │ Total Attempts │
├───────┼──────────────┼────────────────┼──────────────────┼────────────────┤
│ agent │      12      │      0.82      │       45         │      58        │
│ team  │      86      │      0.91      │      1,823       │    1,942       │
│ org   │      44      │      0.94      │      3,456       │    3,521       │
└───────┴──────────────┴────────────────┴──────────────────┴────────────────┘

Total: 142 lessons, 0.90 avg confidence, 93.9% success rate
```

**Top 5 Most Used Lessons:**
```
1. "Use environment variables for API keys" - 0.98 confidence, 127/127 uses
2. "Mailchimp uses X-API-Key header" - 0.95 confidence, 53/53 uses
3. "Retry failed API calls 3 times with exponential backoff" - 0.93 confidence, 89/92 uses
4. "Product launch emails: Tuesday 10am EST" - 0.92 confidence, 40/40 uses
5. "Email subject lines <50 chars get 2.3x open rate" - 0.90 confidence, 38/40 uses
```

---

**This is how professional human organizations work:**
- New employee joins (ephemeral agent spawns)
- Reads company playbook (context injection)
- Executes task (informed by organizational knowledge)
- Updates playbook with lessons (context reflection)
- Leaves company (agent exits)
- Next employee benefits from their lessons (knowledge persists)

**We've built the AI equivalent.**
