---
description: Run ACE reflector to extract lessons from recent task execution and store in SQLite
tags: [context, ace, reflection, learning]
---

# Context Reflection Command

Spawn a `context-reflector` agent to analyze recent task execution traces and extract structured lessons (bullets) for the adaptive context system.

**Usage:**
```bash
/context-reflect [--task-id=<id>] [--agent-id=<id>] [--auto-curate]
```

**What This Does:**
1. Spawns `context-reflector` agent (specialized for ACE reflection)
2. Fetches execution traces from recent tasks (or specific task if --task-id provided)
3. Analyzes:
   - Successful patterns and strategies
   - Failed approaches and blockers
   - Edge cases discovered
   - Performance optimizations
   - Security lessons
4. Generates structured reflection with proposed bullets:
   ```json
   {
     "reflection_type": "success|failure|optimization|edge_case|pattern",
     "extracted_lessons": [
       {
         "bullet_id": "STRAT-042",
         "category": "strategy",
         "content": "When implementing CFN Loop coordination, use Redis pub/sub for ephemeral state and SQLite for persistent audit trails",
         "confidence": 0.85,
         "tags": ["cfn-loop", "coordination", "persistence"]
       }
     ]
   }
   ```
5. Stores reflection in `context_reflections` table (ACL Level 3)
6. If `--auto-curate`: Automatically triggers `/context-curate` to merge bullets

**Arguments:**
- `--task-id=<id>`: Reflect on specific task (default: last completed task)
- `--agent-id=<id>`: Reflect on specific agent's work
- `--swarm-id=<id>`: Reflect on entire swarm execution
- `--phase=<name>`: Reflect on specific CFN Loop phase
- `--auto-curate`: Automatically merge extracted lessons into adaptive_context table
- `--feedback-file=<path>`: Provide additional feedback signals (test results, metrics, errors)
- `--reflection-type=<type>`: Filter reflection focus (success/failure/optimization/edge_case/pattern)
- `--output=<path>`: Save reflection JSON to file

**Examples:**

```bash
# Reflect on last completed task
/context-reflect

# Reflect on specific task with auto-curation
/context-reflect --task-id=task-auth-123 --auto-curate

# Reflect on entire CFN Loop phase
/context-reflect --phase=phase-0-foundation --swarm-id=swarm-xyz

# Reflect with external feedback (test results)
/context-reflect --task-id=task-api-456 --feedback-file=./test-results.json --auto-curate

# Reflect on optimization opportunities
/context-reflect --reflection-type=optimization --swarm-id=swarm-perf
```

**Implementation:**

Spawn the `context-reflector` agent with task context:

```javascript
Task("context-reflector", `
You are a Context Reflector for the ACE system.

**Your Mission:**
Analyze recent task execution and extract 3-7 high-quality lessons. For each lesson:

1. **Identify the pattern/insight**: What worked? What failed? What was unexpected?
2. **Classify the lesson**:
   - **Strategy**: High-level approach or methodology
   - **Pattern**: Reusable code/architecture pattern
   - **Edge Case**: Unexpected condition or corner case
   - **Domain Insight**: Domain-specific knowledge or constraint
   - **Anti-Pattern**: Approach to avoid
   - **Optimization**: Performance/efficiency improvement

3. **Write the bullet**:
   - Start with action verb (Use/Avoid/Ensure/Consider/Implement)
   - Be specific and actionable
   - Include context/conditions ("When X, do Y")
   - 1-3 sentences max

4. Assess confidence (0.0-1.0)
5. Add 2-5 relevant tags

**Steps:**
1. Read recent task execution logs/context
2. Identify patterns, successes, failures, edge cases
3. For each lesson, use store-reflection.sh:

   \`\`\`bash
   # Create lessons file
   cat > /tmp/lessons.json << 'EOF'
   [
     {
       "bullet_id": "STRAT-XXX",
       "category": "strategy",
       "content": "Lesson content here",
       "confidence": 0.85,
       "tags": ["tag1", "tag2"]
     }
   ]
   EOF

   # Store reflection
   ./.claude/skills/ace-system/store-reflection.sh \\
     --reflection-type success \\
     --task-id \${TASK_ID} \\
     --agent-id \${AGENT_ID} \\
     --lessons-file /tmp/lessons.json
   \`\`\`

4. Report reflection ID and summary
`, "context-reflector");
```

**Post-Reflection:**
1. If `--auto-curate` enabled: Trigger `/context-curate --reflection-id=<id>`
2. Otherwise: Reflection queued for manual curation
3. Print summary:
   ```
   ✅ Reflection Complete: reflection-abc123
   📊 Extracted 5 lessons:
      - STRAT-042: CFN Loop coordination strategy (confidence: 0.85)
      - PATTERN-043: Redis pub/sub + SQLite pattern (confidence: 0.90)
      - EDGE-044: ACL permission boundary case (confidence: 0.75)
      ...

   💡 Helpful bullets: STRAT-001, PATTERN-017
   ⚠️  Harmful bullets: (none)

   Next: Run /context-curate --reflection-id=reflection-abc123 to merge
   ```

**Integration with CFN Loop:**
- **Loop 3 completion**: Auto-reflect on each agent's work
- **Loop 2 validation**: Reflect on validation insights
- **Loop 4 decision**: Reflect on PO decision reasoning
- **Phase completion**: Comprehensive phase reflection

**ACL & Security:**
- Reflections inherit ACL from source task
- Minimum ACL Level 3 (Swarm) - prevents private leakage
- Sensitive data (API keys, credentials) automatically redacted
- Audit trail in `audit_log` table

**See Also:**
- `/context-curate` - Merge reflections into adaptive context
- `/context-query` - Search relevant bullets
- `/context-stats` - View bullet statistics
- `/context-inject` - Add bullets to CLAUDE.md
