# Request Flow Diagram - Organizational Architecture

**Scenario:** User requests "Create email campaign for product launch"

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER / MAIN CHAT                                  │
│                                                                             │
│  Request: "Create email campaign for Widget 2.0 product launch"            │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (1) Task submission via Redis
                              │     redis-cli LPUSH "team:marketing:coordinator:inbox"
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MARKETING COORDINATOR AGENT                             │
│                     (Persistent - Docker Container)                         │
│                                                                             │
│  while true; do                                                             │
│    task=$(redis-cli BLPOP "team:marketing:coordinator:inbox" 0)            │
│    route_task_to_specialist "$task"                                        │
│  done                                                                       │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (2) Coordinator determines specialist
                              │     Task type: "email campaign" → email-campaigns agent
                              │
                              ↓
                    ┌─────────────────────┐
                    │  AUTOMATIC CONTEXT  │
                    │  INJECTION (HOOK)   │
                    └─────────┬───────────┘
                              │
                              │ (3) Pre-spawn: Load playbook from ACE system
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      POSTGRESQL (ACE SYSTEM)                                │
│                                                                             │
│  SELECT content, confidence, tags                                           │
│  FROM context_reflections                                                   │
│  WHERE (scope='agent' AND owner_id='email-campaigns')                       │
│     OR (scope='team' AND team_id='marketing')                               │
│     OR (scope='org')                                                        │
│  ORDER BY scope, confidence DESC;                                           │
│                                                                             │
│  Results: 100 lessons                                                       │
│    - "Mailchimp uses X-API-Key header" (team, 0.95 confidence)             │
│    - "Product launches: Tuesday 10am EST" (team, 0.92 confidence)           │
│    - "Use env vars for API keys" (org, 0.98 confidence)                     │
│    - ... 97 more lessons                                                    │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (4) Playbook saved to temp file
                              │     /tmp/context-task-456.json (100 lessons)
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│              SPAWN EPHEMERAL EMAIL-CAMPAIGNS AGENT                          │
│              (Docker exec inside coordinator container)                     │
│                                                                             │
│  docker exec marketing-coordinator \                                        │
│    npx claude-flow-novice agent email-campaigns \                           │
│    --task-id task-456 \                                                     │
│    --context-file /tmp/context-task-456.json \                              │
│    --agent-id email-campaigns-agent-789                                     │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (5) Agent process starts (ephemeral)
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EMAIL-CAMPAIGNS AGENT EXECUTION                          │
│                    (Ephemeral Process - Exits When Done)                    │
│                                                                             │
│  Step 1: Load playbook from /tmp/context-task-456.json                      │
│          Parse 100 lessons into working memory                              │
│                                                                             │
│  Step 2: Execute task (informed by playbook)                                │
│    ├─ Check lesson: "Mailchimp uses X-API-Key header"                       │
│    ├─ Apply: Use X-API-Key for authentication ✓                             │
│    ├─ Check lesson: "Product launches: Tuesday 10am"                        │
│    ├─ Apply: Schedule for Tuesday 10am EST ✓                                │
│    ├─ Check lesson: "Use env vars for API keys"                             │
│    ├─ Apply: API key = ${MAILCHIMP_API_KEY} ✓                               │
│    └─ Create skill: .claude/skills/cfn-marketing-email-campaigns/          │
│                                                                             │
│  Step 3: Discover NEW lessons during execution                              │
│    └─ "Subject lines <40 chars get 3x open rate"                            │
│                                                                             │
│  Step 4: Report completion                                                  │
│    └─ Confidence: 0.93                                                      │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (6) Agent writes result to Redis
                              │     redis-cli LPUSH "team:marketing:coordinator:inbox"
                              │
                              ↓
                    ┌─────────────────────┐
                    │  AUTOMATIC CONTEXT  │
                    │  REFLECTION (HOOK)  │
                    └─────────┬───────────┘
                              │
                              │ (7) Post-completion: Extract lessons from agent output
                              │     Parse for patterns: "Learned:", "Best practice:", etc.
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      POSTGRESQL (ACE SYSTEM)                                │
│                                                                             │
│  INSERT INTO context_reflections (                                          │
│    content,                                                                 │
│    scope,                                                                   │
│    team_id,                                                                 │
│    tags,                                                                    │
│    confidence,                                                              │
│    success_count,                                                           │
│    total_count                                                              │
│  ) VALUES (                                                                 │
│    'Subject lines <40 chars get 3x open rate',                              │
│    'team',                                                                  │
│    'marketing',                                                             │
│    ARRAY['email', 'subject-lines', 'optimization'],                         │
│    0.85,                                                                    │
│    1,                                                                       │
│    1                                                                        │
│  );                                                                         │
│                                                                             │
│  Playbook now: 101 lessons (was 100)                                        │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (8) Agent exits (process terminates)
                              │     Knowledge persists in PostgreSQL
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MARKETING COORDINATOR AGENT                             │
│                                                                             │
│  Receives result from Redis inbox                                           │
│  Validates deliverables                                                     │
│  Reports back to Main Chat                                                  │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                              │ (9) Coordinator reports result
                              │     redis-cli LPUSH "main-chat:inbox"
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAIN CHAT / USER                                  │
│                                                                             │
│  Result: "Email campaign skill created successfully"                        │
│  Deliverables:                                                              │
│    - .claude/skills/cfn-marketing-email-campaigns/                          │
│    - Scheduled for Tuesday 10am EST                                         │
│  Confidence: 0.93                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step Flow

### Step 1: User Request → Coordinator

```yaml
User: "Create email campaign for Widget 2.0 product launch"
  ↓
Main Chat: Identifies this is marketing task
  ↓
Redis: LPUSH "team:marketing:coordinator:inbox" '{
  "task_id": "task-456",
  "type": "email_campaign",
  "description": "Create email campaign for Widget 2.0 product launch",
  "priority": "high",
  "deadline": "2025-11-05T10:00:00Z"
}'
```

**Communication:** Redis pub/sub (LPUSH/BLPOP)
**Latency:** <10ms (Redis is in-memory)

---

### Step 2: Coordinator Routes to Specialist

```yaml
Marketing Coordinator (persistent agent, always running):
  ↓
BLPOP "team:marketing:coordinator:inbox" 0  # Blocks until message arrives
  ↓
Receives: task-456
  ↓
Analyzes task type: "email_campaign"
  ↓
Routes to: email-campaigns specialist
```

**Decision Logic:**
```javascript
function routeTask(task) {
  if (task.type === 'email_campaign') return 'email-campaigns';
  if (task.type === 'social_post') return 'social-publishing';
  if (task.type === 'analytics') return 'analytics-data';
  // ... etc
}
```

---

### Step 3: Automatic Context Injection (Pre-Spawn Hook)

```bash
# orchestrate.sh (runs inside coordinator)
./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
  --task-id "task-456" \
  --agent-type "email-campaigns" \
  --tags "email,product-launch,campaign" \
  --scope "team:marketing" \
  --output "/tmp/context-task-456.json"
```

**PostgreSQL Query (executed by invoke-context-inject.sh):**
```sql
SELECT
  content,
  scope,
  confidence,
  success_count,
  total_count,
  tags
FROM context_reflections
WHERE
  (scope = 'agent' AND owner_id = 'email-campaigns')
  OR (scope = 'team' AND team_id = 'marketing')
  OR (scope = 'org')
ORDER BY
  CASE scope
    WHEN 'agent' THEN 1
    WHEN 'team' THEN 2
    WHEN 'org' THEN 3
  END,
  confidence DESC
LIMIT 100;
```

**Output File (/tmp/context-task-456.json):**
```json
{
  "task_id": "task-456",
  "agent_type": "email-campaigns",
  "lessons": [
    {
      "content": "Mailchimp API uses X-API-Key header for authentication",
      "scope": "team",
      "confidence": 0.95,
      "success_count": 52,
      "total_count": 53,
      "tags": ["email", "mailchimp", "api", "authentication"]
    },
    {
      "content": "Product launch emails perform best on Tuesday 10am EST",
      "scope": "team",
      "confidence": 0.92,
      "success_count": 38,
      "total_count": 40,
      "tags": ["email", "product-launch", "timing"]
    }
    // ... 98 more lessons
  ],
  "total_lessons": 100,
  "load_time_ms": 342
}
```

**Performance:** <500ms (target), 342ms (actual in example)

---

### Step 4: Spawn Ephemeral Agent

```bash
# Coordinator spawns agent (Docker exec)
docker exec marketing-coordinator \
  npx claude-flow-novice agent email-campaigns \
  --task-id task-456 \
  --context-file /tmp/context-task-456.json \
  --agent-id email-campaigns-agent-789
```

**Process Lifecycle:**
```
0ms:    Process starts (new bash/node process)
50ms:   Load context file (read /tmp/context-task-456.json)
100ms:  Parse 100 lessons into memory
150ms:  Ready to execute task
```

**Memory Footprint:**
- Process: ~50MB (Node.js runtime)
- Context: ~2MB (100 lessons in JSON)
- Working memory: ~10MB (task execution)
- Total: ~62MB per agent

---

### Step 5: Agent Executes Task (Informed by Playbook)

```
Agent Process (email-campaigns-agent-789):

├─ Load playbook (100 lessons in memory)
│
├─ Execute task: "Create email campaign for Widget 2.0"
│  │
│  ├─ Query playbook: "How to authenticate with Mailchimp?"
│  │  └─ Found: "Mailchimp uses X-API-Key header" (0.95 confidence)
│  │  └─ Apply: Set header X-API-Key: ${MAILCHIMP_API_KEY}
│  │
│  ├─ Query playbook: "When to send product launch emails?"
│  │  └─ Found: "Product launches: Tuesday 10am EST" (0.92 confidence)
│  │  └─ Apply: Schedule for 2025-11-05 10:00 EST
│  │
│  ├─ Query playbook: "How to store API credentials?"
│  │  └─ Found: "Use env vars for API keys" (0.98 confidence)
│  │  └─ Apply: API key = ${MAILCHIMP_API_KEY} (not hardcoded)
│  │
│  └─ Create deliverable: .claude/skills/cfn-marketing-email-campaigns/
│     ├─ SKILL.md (documentation)
│     ├─ create-campaign.sh (implementation)
│     └─ n8n-workflow.json (Mailchimp workflow)
│
├─ Discover NEW lessons during execution
│  └─ "Subject lines <40 chars get 3x open rate"
│     (Analyzed A/B test results from previous campaigns)
│
└─ Report completion
   ├─ Confidence: 0.93 (high confidence - used 12 playbook lessons)
   ├─ Execution time: 45 seconds
   └─ Deliverables: 3 files created
```

**Playbook Usage Statistics (logged):**
```json
{
  "lessons_loaded": 100,
  "lessons_applied": 12,
  "lessons_discovered": 1,
  "confidence_boost": 0.15,
  "execution_time_saved": "~30 minutes"
}
```

---

### Step 6: Agent Reports Result to Coordinator

```bash
# Agent writes result to Redis
redis-cli LPUSH "team:marketing:coordinator:inbox" '{
  "task_id": "task-456",
  "agent_id": "email-campaigns-agent-789",
  "status": "complete",
  "confidence": 0.93,
  "deliverables": [
    ".claude/skills/cfn-marketing-email-campaigns/SKILL.md",
    ".claude/skills/cfn-marketing-email-campaigns/create-campaign.sh",
    ".claude/skills/cfn-marketing-email-campaigns/n8n-workflow.json"
  ],
  "lessons_discovered": [
    "Subject lines <40 chars get 3x open rate"
  ],
  "execution_time_ms": 45320,
  "lessons_applied": 12
}'
```

---

### Step 7: Automatic Context Reflection (Post-Completion Hook)

```bash
# orchestrate.sh (after agent completes)
./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
  --task-id "task-456" \
  --agent-id "email-campaigns-agent-789" \
  --auto-extract
```

**Lesson Extraction (auto-extract logic):**
```bash
# Read agent output from Redis
agent_output=$(redis-cli GET "cfn_loop:task:task-456:agent:email-campaigns-agent-789:output")

# Extract lessons using regex patterns
grep -oP 'Learned: \K.*' <<< "$agent_output"
# Result: "Subject lines <40 chars get 3x open rate"

grep -oP 'Best practice: \K.*' <<< "$agent_output"
# Result: (none found)

grep -oP 'Anti-pattern: \K.*' <<< "$agent_output"
# Result: (none found)
```

**PostgreSQL Insert (store new lesson):**
```sql
INSERT INTO context_reflections (
  content,
  scope,
  team_id,
  owner_id,
  tags,
  confidence,
  success_count,
  total_count,
  created_at
) VALUES (
  'Subject lines <40 chars get 3x open rate',
  'team',
  'marketing',
  'email-campaigns-agent-789',
  ARRAY['email', 'subject-lines', 'optimization', 'product-launch'],
  0.85,
  1,
  1,
  NOW()
);
```

**Performance:** <200ms (target), 156ms (actual in example)

---

### Step 8: Agent Exits (Process Terminates)

```bash
# Agent process terminates
exit 0

# Process no longer exists
ps aux | grep email-campaigns-agent-789
# (no results - process terminated)

# But knowledge persists!
psql -c "SELECT content FROM context_reflections WHERE owner_id = 'email-campaigns-agent-789';"
# Result: "Subject lines <40 chars get 3x open rate"
```

**Resource Cleanup:**
- Process memory: Released (62MB freed)
- Temp files: Cleaned (/tmp/context-task-456.json deleted)
- Docker container: NOT created (agent ran via exec, no new container)
- Knowledge: PERSISTS in PostgreSQL

---

### Step 9: Coordinator Reports to Main Chat

```bash
# Coordinator validates deliverables
coordinator_process:
  ├─ Check files exist:
  │  ✓ .claude/skills/cfn-marketing-email-campaigns/SKILL.md
  │  ✓ create-campaign.sh
  │  ✓ n8n-workflow.json
  │
  ├─ Validate confidence: 0.93 (≥0.75 threshold) ✓
  │
  └─ Report to Main Chat

redis-cli LPUSH "main-chat:inbox" '{
  "task_id": "task-456",
  "status": "complete",
  "team": "marketing",
  "coordinator": "marketing-coordinator",
  "agent": "email-campaigns-agent-789",
  "confidence": 0.93,
  "deliverables": [
    ".claude/skills/cfn-marketing-email-campaigns/"
  ],
  "summary": "Email campaign skill created successfully. Scheduled for Tuesday 10am EST per playbook best practice. Applied 12 lessons from team playbook. Discovered 1 new lesson (subject line optimization).",
  "playbook_growth": "100 → 101 lessons"
}'
```

---

## Cross-Team Request Flow (Advanced)

**Scenario:** Marketing needs Engineering help with API integration

```
┌──────────────────────────────────────────────────────────────────┐
│  USER: "Marketing team needs help integrating Mailchimp API"    │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ↓
                 ┌─────────────────────┐
                 │ MARKETING COORDINATOR│
                 └──────────┬───────────┘
                            │
                            │ (1) Recognizes need for cross-team help
                            │
                            ↓
                 ┌─────────────────────┐
                 │ REDIS: coordinators  │
                 │ :peer-channel        │
                 └──────────┬───────────┘
                            │
                            │ (2) Publishes request
                            │     "Need API integration help"
                            │
                            ↓
        ┌───────────────────────────────────────┐
        │                                       │
        ↓                                       ↓
┌──────────────────┐                  ┌──────────────────┐
│ ENGINEERING      │                  │ SALES COORDINATOR│
│ COORDINATOR      │                  │ (ignores)        │
└────────┬─────────┘                  └──────────────────┘
         │
         │ (3) Accepts request
         │     "I can assign backend-dev agent"
         │
         ↓
┌────────────────────────────────────────────────────┐
│  ENGINEERING spawns backend-dev agent              │
│  Agent loads ENGINEERING playbook (not marketing)  │
│  Executes: Create Mailchimp API integration        │
│  Stores lesson to ENGINEERING playbook             │
│  Reports to ENGINEERING coordinator                │
└────────┬───────────────────────────────────────────┘
         │
         │ (4) Engineering reports result to Marketing
         │
         ↓
┌────────────────────────────────────────┐
│  MARKETING COORDINATOR                 │
│  Receives: Mailchimp API integration   │
│  Updates marketing playbook:           │
│    "Use engineering/mailchimp-api skill│
│     for API integration"               │
└────────┬───────────────────────────────┘
         │
         │ (5) Reports to Main Chat
         │
         ↓
┌────────────────────────────────────────┐
│  USER: "Integration complete"          │
└────────────────────────────────────────┘
```

---

## Escalation Flow (Agent → Coordinator → C-Suite)

**Scenario:** Agent encounters blocker requiring executive decision

```
┌─────────────────────────────────────────────────────┐
│  AGENT: "Need budget increase to complete task"     │
│  (email-campaigns agent needs $500 for Mailchimp)   │
└───────────────────────┬─────────────────────────────┘
                        │
                        │ (1) Agent reports blocker
                        │
                        ↓
            ┌───────────────────────┐
            │ MARKETING COORDINATOR │
            └──────────┬────────────┘
                       │
                       │ (2) Checks budget authority
                       │     $500 > $100 threshold
                       │     → Escalate to C-Suite
                       │
                       ↓
            ┌───────────────────────┐
            │ REDIS: coordinators   │
            │ :to-csuite            │
            └──────────┬────────────┘
                       │
                       │ (3) Publishes escalation
                       │
                       ↓
        ┌──────────────────────────────┐
        │  C-SUITE (COO or CFO)        │
        └──────────┬───────────────────┘
                   │
                   │ (4) Reviews request
                   │     Checks org budget
                   │     Approves: Yes ($500 within quarterly budget)
                   │
                   ↓
        ┌──────────────────────────────┐
        │  MARKETING COORDINATOR        │
        └──────────┬───────────────────┘
                   │
                   │ (5) Receives approval
                   │     Updates team budget
                   │     Notifies agent to proceed
                   │
                   ↓
        ┌──────────────────────────────┐
        │  AGENT: Resumes task          │
        │  (now has budget approval)    │
        └───────────────────────────────┘
```

---

## Performance Metrics (End-to-End)

```
Total Time Breakdown (Simple Task):

Step 1: User → Coordinator           <10ms  (Redis LPUSH)
Step 2: Coordinator routing           <50ms  (task analysis)
Step 3: Context injection             342ms  (PostgreSQL query + file write)
Step 4: Agent spawn                   150ms  (process start + context load)
Step 5: Agent execution             45,320ms (actual work - 45 seconds)
Step 6: Result reporting              <10ms  (Redis LPUSH)
Step 7: Context reflection            156ms  (PostgreSQL INSERT)
Step 8: Agent exit                    <10ms  (process cleanup)
Step 9: Coordinator → User            <50ms  (validation + Redis)

Total: ~46 seconds (45s actual work + 1s overhead)

Overhead: 1 second / 46 seconds = 2.2% (negligible)
```

**Comparison (Without Playbook):**
```
Agent trial-and-error: 15-30 minutes (testing authentication methods)
With playbook: 45 seconds (knows correct method immediately)
Time saved: 14-29 minutes (95%+ reduction)
```

---

## Next Agent (Agent 2) - Cumulative Learning

```
┌─────────────────────────────────────────────────────┐
│  USER: "Create another email campaign (different    │
│         product)"                                    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ↓
            (Same flow as Agent 1)
                        │
                        ↓
        Step 3: Context injection queries PostgreSQL
                ↓
        Results: 101 lessons (was 100)
          - 100 original lessons
          - 1 NEW: "Subject lines <40 chars get 3x open rate"
            (from Agent 1)
                ↓
        Agent 2 spawns with 101 lessons
                ↓
        Agent 2 sees Agent 1's discovery immediately
                ↓
        Agent 2 applies: Subject line = 38 chars ✓
                ↓
        Agent 2 discovers: "Include product image increases CTR 40%"
                ↓
        Playbook grows: 101 → 102 lessons
                ↓
        Agent 3 will see BOTH discoveries
```

**Cumulative Learning:**
- Agent 1: 100 lessons → discovers 1 → 101 lessons
- Agent 2: 101 lessons → discovers 1 → 102 lessons
- Agent 3: 102 lessons → discovers 1 → 103 lessons
- ...
- Agent 57: 142 lessons → highly optimized from day 1

**Result:** Zero repeated mistakes, perfect consistency, continuous improvement.
