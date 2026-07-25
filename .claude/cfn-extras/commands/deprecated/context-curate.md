---
description: Run ACE curator to merge reflection deltas into adaptive context with deduplication
tags: [context, ace, curation, merge, deduplication]
---

# Context Curation Command

Spawn a `context-curator` agent to merge reflection deltas into the `adaptive_context` table using deterministic rules, semantic deduplication, and version control.

**Usage:**
```bash
/context-curate [--reflection-id=<id>] [--auto-merge] [--similarity-threshold=0.85]
```

**What This Does:**
1. Spawns `context-curator` agent (specialized for ACE curation)
2. Fetches pending reflections from `context_reflections` table
3. For each extracted lesson:
   - **Check for duplicates** using semantic similarity (embeddings)
   - **Merge similar bullets** if similarity > threshold
   - **Add new bullets** if novel insight
   - **Increment counters** for reinforced lessons
   - **Version bullets** for significant edits
4. Updates `adaptive_context` table with deterministic merge logic
5. Records curation decisions in `context_merge_log` (audit trail)
6. Updates bullet confidence scores based on reinforcement

**Arguments:**
- `--reflection-id=<id>`: Curate specific reflection (default: all pending)
- `--auto-merge`: Skip human review, auto-merge with high confidence (≥0.8)
- `--similarity-threshold=<0.0-1.0>`: Semantic similarity for merging (default: 0.85)
- `--require-validation`: Flag merged bullets for human/PO validation
- `--dry-run`: Preview merge actions without applying
- `--category=<type>`: Filter by bullet category
- `--min-confidence=<0.0-1.0>`: Only merge bullets above confidence threshold (default: 0.5)
- `--output=<path>`: Save curation report to file

**Merge Logic (Deterministic):**

1. **New Bullet (No Similar Match):**
   ```sql
   INSERT INTO adaptive_context (bullet_id, category, content, confidence_score, ...)
   VALUES ('STRAT-042', 'strategy', 'Use Redis pub/sub...', 0.85, ...);

   INSERT INTO context_merge_log (merge_type, bullet_id, new_content, curator_reasoning)
   VALUES ('new_bullet', 'STRAT-042', 'Use Redis pub/sub...', 'Novel strategy, no similar bullets found');
   ```

2. **Similar Bullet Found (Similarity > Threshold):**
   ```sql
   -- Increment helpful counter
   UPDATE adaptive_context
   SET helpful_count = helpful_count + 1,
       confidence_score = MIN(1.0, confidence_score + 0.05),
       usage_count = usage_count + 1,
       last_used_at = CURRENT_TIMESTAMP
   WHERE bullet_id = 'STRAT-001';

   INSERT INTO context_merge_log (merge_type, bullet_id, similarity_score, curator_reasoning)
   VALUES ('increment_helpful', 'STRAT-001', 0.92, 'Reinforced by new reflection');
   ```

3. **Merge Semantically Overlapping Bullets:**
   ```sql
   -- Create new version merging STRAT-001 + STRAT-042
   INSERT INTO adaptive_context (bullet_id, category, content, version, parent_bullet_id, helpful_count, ...)
   VALUES ('STRAT-001-v2', 'strategy', 'Merged content...', 2, 'STRAT-001', 15, ...);

   -- Archive old bullets
   UPDATE adaptive_context SET is_active = 0, archived_at = CURRENT_TIMESTAMP
   WHERE bullet_id IN ('STRAT-001', 'STRAT-042');

   INSERT INTO context_merge_log (merge_type, merged_from_bullet_ids, new_content)
   VALUES ('merge_similar', '["STRAT-001", "STRAT-042"]', 'Merged content...');
   ```

4. **Archive Harmful Bullets:**
   ```sql
   -- Auto-archived by trigger when harmful_count >= 5 AND helpful_count < 2
   UPDATE adaptive_context
   SET is_active = 0, archived_at = CURRENT_TIMESTAMP
   WHERE bullet_id = 'ANTI-013';

   INSERT INTO context_merge_log (merge_type, bullet_id, curator_reasoning)
   VALUES ('archive', 'ANTI-013', 'Harmful pattern confirmed by multiple tasks');
   ```

**Semantic Similarity (Optional):**
If embeddings available in `embedding_vector` column:
```javascript
// Cosine similarity between bullet embeddings
const similarity = cosineSimilarity(embedding1, embedding2);

if (similarity > threshold) {
  // Merge or increment counter
} else {
  // Add as new bullet
}
```

**Curation Prompt Template:**
```
You are a Context Curator for the ACE (Adaptive Context Extension) system.

**Pending Reflection:**
{reflection_data}

**Existing Bullets (Semantic Neighbors):**
{similar_bullets}

**Your Mission:**
For each extracted lesson in the reflection:

1. **Check for semantic similarity**:
   - Compare with existing bullets
   - Use similarity threshold: {threshold}

2. **Apply merge logic**:
   - **Similarity > {threshold}**: Increment helpful_count, boost confidence
   - **Similarity 0.6-{threshold}**: Consider merging bullets (create new version)
   - **Similarity < 0.6**: Add as new bullet

3. **Validate quality**:
   - Is the bullet actionable?
   - Is it specific enough?
   - Does it have clear conditions/context?
   - Would it help future agents?

4. **Assign priority** (1-10):
   - High (8-10): Critical strategies, common patterns, safety rules
   - Medium (5-7): Optimization tips, domain insights
   - Low (1-4): Edge cases, situational patterns

5. **Update counters**:
   - Identify helpful_existing_bullets → increment their helpful_count
   - Identify harmful_existing_bullets → increment their harmful_count

**Output Format (JSON):**
{
  "curation_actions": [
    {
      "action": "new_bullet|increment_helpful|increment_harmful|merge_similar|archive",
      "bullet_id": "STRAT-042",
      "target_bullet_id": "STRAT-001",  // For increment/merge actions
      "similarity_score": 0.92,
      "reasoning": "Why this action is appropriate",
      "merged_content": "New merged content (if merge action)"
    }
  ],
  "validation_required": ["STRAT-042"],  // Bullets needing human review
  "summary": "Curated 5 lessons: 2 new, 3 reinforced existing"
}
```

**Post-Curation:**
1. Update `context_reflections.curator_status = 'merged'`
2. Record all actions in `context_merge_log`
3. Emit metrics to `metrics` table
4. Print summary:
   ```
   ✅ Curation Complete: reflection-abc123

   📊 Merge Actions:
      - STRAT-042: New bullet added (confidence: 0.85)
      - STRAT-001: Helpful count +1 (now 16 helpful, 0 harmful)
      - PATTERN-017: Helpful count +1 (now 10 helpful, 0 harmful)

   📈 Context Stats:
      - Total active bullets: 127
      - Avg confidence: 0.78
      - Bullets needing validation: 3

   💡 Next: Run /context-inject --category=strategy to add top bullets to CLAUDE.md
   ```

**Periodic Maintenance:**
Run curation with `--maintenance` flag to:
- Deduplicate similar bullets (similarity > 0.90)
- Archive bullets with harmful_count ≥ 5
- Prune bullets unused for >90 days (if helpful_count < 3)
- Merge semantically overlapping bullets
- Rebalance priority scores

**Integration with CFN Loop:**
- **Loop 3 completion**: Auto-curate agent reflections
- **Loop 4 approval**: PO reviews high-priority bullets
- **Phase completion**: Periodic maintenance curation
- **Epic completion**: Comprehensive deduplication pass

**ACL & Security:**
- Curation actions require ACL Level 4 (Project)
- Merge log audit trail at ACL Level 5 (System)
- Sensitive bullets flagged for validation
- Human review required for confidence < 0.6

**See Also:**
- `/context-reflect` - Extract lessons from execution
- `/context-query` - Search bullets by category/tags
- `/context-inject` - Add bullets to CLAUDE.md
- `/context-stats` - View bullet statistics and health
