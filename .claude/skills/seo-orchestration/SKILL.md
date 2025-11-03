# SEO Orchestration Skill

## Metadata
- **Skill ID:** seo-orchestration
- **Version:** 1.0.0
- **Category:** SEO Workflow Orchestration
- **Dependencies:** redis-coordination, agent-output-processing
- **Maturity:** Production
- **Last Updated:** 2025-10-25

## Purpose
Orchestrates SEO optimization workflows through multi-agent coordination:
- SEO Strategy & Analysis
- Content Implementation
- Technical SEO Validation
- Performance Consensus Building

## Responsibilities
1. Coordinate multi-agent SEO workflow execution
2. Manage SEO-specific validation checkpoints
3. Handle iteration cycles with SEO feedback injection
4. Interface with Redis Coordination for agent synchronization
5. Execute SEO consensus validation for quality assurance
6. Enforce SEO workflow dependencies (analysis → implementation → validation)

## Interface

### Main Entry Point
```bash
./.claude/skills/seo-orchestration/orchestrate-seo.sh \
  --task-id <unique-id> \
  --mode <mvp|standard|enterprise> \
  --seo-agents <agent1,agent2,...> \
  --validator-agents <agent1,agent2,...> \
  [--max-iterations <n>] \
  [--min-quorum-seo <n|n%|0.n>] \
  [--min-consensus <0.0-1.0>] \
  [--seo-context <json>] \
  [--target-pages <urls>] \
  [--success-criteria <json>] \
  [--expected-deliverables <file1,file2,...>]
```

### Parameters
- `task-id`: Unique identifier for this SEO orchestration
- `mode`: Workflow mode (mvp, standard, enterprise) - determines thresholds
- `seo-agents`: Comma-separated list of SEO specialist agent IDs
- `validator-agents`: Comma-separated list of SEO validator agent IDs
- `max-iterations`: Maximum iteration cycles (default: 10)
- `min-quorum-seo`: Minimum SEO agents required (default: 0.66)
- `min-consensus`: Minimum consensus threshold (default: 0.80)
- `seo-context`: JSON string with SEO analysis context (keywords, competition, etc.)
- `target-pages`: Comma-separated list of target URLs for optimization
- `success-criteria`: JSON string with SEO success metrics
- `expected-deliverables`: Comma-separated list of expected SEO deliverable files

### Return Values
- Exit Code 0: SEO orchestration completed successfully
- Exit Code 1: SEO orchestration failed (max iterations or consensus failure)
- Exit Code 130: User interrupt (graceful shutdown)

### Output Format (JSON)
```json
{
  "status": "success|failed|aborted",
  "iterations_completed": 2,
  "final_consensus": 0.92,
  "seo_confidence": 0.94,
  "deliverables_verified": true,
  "pages_optimized": 5,
  "seo_improvements": ["meta-optimization", "content-enhancement", "technical-fixes"],
  "execution_time_seconds": 1847
}
```

## Helper Scripts

### 1. validate-consensus.sh
Validates SEO consensus against thresholds.

**Usage:**
```bash
./.claude/skills/seo-orchestration/validate-consensus.sh \
  --task-id <id> \
  --agents <agent1,agent2,...> \
  --threshold <0.0-1.0> \
  --min-quorum <n|n%|0.n>
```

**Returns:**
- Exit 0: Consensus validated successfully
- Exit 1: Consensus validation failed

### 2. calculate-consensus.sh
Calculates consensus scores from SEO agent feedback.

**Usage:**
```bash
./.claude/skills/seo-orchestration/calculate-consensus.sh \
  --task-id <id> \
  --agents <agent1,agent2,...> \
  [--weights <agent1:weight1,agent2:weight2,...>]
```

**Returns:**
- Exit 0: Consensus calculated successfully
- STDOUT: JSON with consensus score and breakdown

### 3. aggregate-feedback.sh
Aggregates and processes SEO agent feedback.

**Usage:**
```bash
./.claude/skills/seo-orchestration/aggregate-feedback.sh \
  --task-id <id> \
  --agents <agent1,agent2,...> \
  --output-format <json|summary>
```

**Returns:**
- Exit 0: Feedback aggregated successfully
- STDOUT: Aggregated feedback in specified format

## SEO Orchestration Flow

```
1. Initialize SEO Context (Redis)
   ↓
2. Spawn SEO Specialist Agents (CLI)
   ↓
3. SEO Agents Analyze & Implement
   ↓
4. Collect SEO Agent Confidence Scores
   ↓
5. Validate SEO Consensus (validate-consensus.sh)
   ├─ PASS → Signal successful completion
   └─ FAIL → Inject feedback, iterate SEO agents (goto step 2)
   ↓
6. SEO Validator Agents Review Results
   ↓
7. Collect Validator Consensus (calculate-consensus.sh)
   ↓
8. Aggregate SEO Feedback (aggregate-feedback.sh)
   ↓
9. Final SEO Quality Check
   ├─ PASS → Exit success
   └─ FAIL → Wake all agents (goto step 2)
```

## Redis Coordination Interface

This skill consumes the following Redis Coordination primitives:

### Context Storage
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence <0.0-1.0> \
  --iteration <n>
```

### Agent Waiting/Waking
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --reason <seo-feedback|iteration> \
  --iteration <n> \
  --feedback <seo-feedback-string>
```

### Result Collection
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "$TASK_ID" \
  --agent-ids <comma-separated>
```

## Mode-Specific Thresholds

| Mode | SEO Confidence Threshold | Consensus Threshold | Max Iterations | SEO Specialists |
|------|-------------------------|---------------------|----------------|-----------------|
| MVP | 0.70 | 0.75 | 5 | 2 |
| Standard | 0.75 | 0.80 | 10 | 3-4 |
| Enterprise | 0.80 | 0.85 | 15 | 5+ |

## SEO Context Structure

### Input Context Example
```json
{
  "keywords": ["rust development", "systems programming", "memory safety"],
  "target_audience": "developers and technical teams",
  "competition_level": "high",
  "pages_to_optimize": [
    "https://example.com/rust-services",
    "https://example.com/performance"
  ],
  "current_seo_score": 65,
  "target_seo_score": 85,
  "technical_requirements": {
    "page_speed": "< 2s",
    "mobile_friendly": true,
    "schema_markup": "required"
  }
}
```

### Success Criteria Example
```json
{
  "seo_metrics": {
    "meta_optimization": "complete",
    "content_quality": "enhanced",
    "technical_seo": "validated",
    "performance_improvement": "measured"
  },
  "quality_gates": {
    "min_seo_score": 80,
    "page_speed_improvement": "20%",
    "mobile_compliance": "100%"
  }
}
```

## Error Handling

### Critical Failures
- Redis unavailable: Exit immediately with error
- SEO agent spawn failure: Retry with exponential backoff
- SEO validation timeout: Log state, attempt graceful shutdown

### Recoverable Failures
- SEO consensus failure: Iterate SEO agents with enhanced feedback
- Missing SEO deliverables: Force iteration with explicit requirements
- Performance threshold failure: Iterate with optimization focus

## Configuration

### Environment Variables
- `REDIS_HOST`: Redis server host (default: localhost)
- `REDIS_PORT`: Redis server port (default: 6379)
- `SEO_DEBUG`: Enable debug logging (default: 0)
- `SEO_TIMEOUT`: SEO operation timeout in seconds (default: 3600)

### Redis Keys Used
- `swarm:{task-id}:seo-context`: SEO analysis context
- `swarm:{task-id}:success-criteria`: SEO success criteria
- `swarm:{task-id}:agent:{agent-id}:confidence`: Agent confidence score
- `swarm:{task-id}:agent:{agent-id}:seo-feedback`: Agent-specific SEO feedback
- `swarm:{task-id}:seo-consensus`: SEO consensus score
- `swarm:{task-id}:{agent-id}:done`: Agent completion signal

## Testing

Run comprehensive test suite:
```bash
./.claude/skills/seo-orchestration/test-seo-orchestration.sh
```

Test scenarios:
1. SEO analysis → Implementation → Validation → Success
2. SEO consensus failure → Iteration with feedback
3. Missing SEO deliverables → Forced iteration
4. Performance threshold failure → Optimization iteration
5. Max iterations → Graceful failure
6. User interrupt → Graceful shutdown

## Performance Characteristics

- Average execution time: 30-90 minutes (project complexity dependent)
- Zero-token waiting between iterations (Redis BLPOP)
- SEO agent spawn time: 10-30 seconds per agent
- Context storage/retrieval: <100ms per operation
- SEO validation time: 2-10 minutes per page

## Success Criteria

This skill is considered successful when:
1. All SEO workflow agents complete their specialized tasks
2. SEO consensus meets or exceeds threshold requirements
3. SEO deliverables are created and validated
4. Performance metrics meet defined success criteria
5. Test suite achieves 100% pass rate

## Confidence Score: 0.91

- Architecture: 0.95 (clear SEO workflow separation)
- Implementation Risk: 0.85 (SEO validation complexity)
- Testing Coverage: 0.92 (comprehensive SEO scenarios)
- Agent Coordination: 0.92 (proven Redis patterns)