# TDD Coordinator Comparison

This directory contains two TDD coordinators with different approaches:

## 1. Original TDD Coordinator (`tdd-coordinator.sh`)
**Purpose**: Fast, simple TDD cycle for basic features

**Workflow**:
1. Generate tests
2. Generate implementation
3. Run tests once
4. Log to CodeSearch

**Best For**:
- Simple, well-understood features
- Prototyping
- When you expect first-pass success
- Cost-sensitive workloads

**Limitations**:
- No error recovery
- Single iteration only
- Cannot fix failing tests
- Less context-aware

**Performance**: 30-60 seconds, ~2000 tokens

## 2. Conversation Coordinator (`tdd-conversation-coordinator.sh`)
**Purpose**: Iterative TDD with intelligent error recovery

**Workflow**:
1. Gather context (CodeSearch + files)
2. Generate tests (RED phase)
3. Verify tests fail
4. Generate implementation (GREEN phase)
5. Run tests
6. **IF FAIL**: Enter fix loop with full conversation history
7. Iterate until pass or max attempts
8. Log successful patterns

**Best For**:
- Complex features with edge cases
- Security-critical code
- When requirements are nuanced
- Learning from failures

**Advantages**:
- Full conversation memory
- Context-aware fixes
- Analyzes previous attempts
- Learns from errors
- Comprehensive logging

**Performance**: 60-300 seconds, 2000-20000 tokens (depends on iterations)

## Feature Comparison

| Feature | Original | Conversation |
|---------|----------|--------------|
| Iterations | 1 | 1-N (configurable) |
| Context gathering | Basic | CodeSearch + files |
| Error recovery | None | Full conversation history |
| Red phase validation | No | Yes |
| Fix analysis | No | Yes (with history) |
| Cost (simple) | $0.02 | $0.02-0.05 |
| Cost (complex) | N/A (fails) | $0.10-0.25 |
| Conversation logs | No | Yes |
| Pattern learning | Basic | Comprehensive |

## When to Use Which

### Use Original TDD Coordinator When:
- Feature is straightforward (simple validator, formatter)
- You have clear examples to reference
- Cost is primary concern
- Fast prototyping is goal
- Willing to manually fix failures

### Use Conversation Coordinator When:
- Feature has edge cases or security implications
- Previous attempts have failed
- You need guaranteed test coverage
- Learning from the process is valuable
- Implementation must be correct first time
- Cost is acceptable for quality

## Example Scenarios

### Scenario 1: Email Validator (Simple)
**Recommendation**: Original coordinator
- Well-understood pattern
- Standard regex solution
- Low complexity
- Cost: ~$0.02

```bash
./tdd-coordinator.sh \
  --agent-id email-001 \
  --feature "Email validation" \
  --file ./src/validators/email.ts \
  --test-command "npm test email.test.ts"
```

### Scenario 2: JWT Token Validator (Complex)
**Recommendation**: Conversation coordinator
- Security-critical
- Multiple validation steps
- Edge cases (expired, invalid signature, wrong issuer)
- Cost: ~$0.15

```bash
./tdd-conversation-coordinator.sh \
  --agent-id jwt-001 \
  --feature "JWT validator with signature, expiration, issuer checks" \
  --file ./src/auth/jwt.ts \
  --test-command "npm test jwt.test.ts" \
  --context "./src/auth/types.ts,./src/crypto.ts" \
  --max-iterations 5 \
  --verbose
```

### Scenario 3: Rate Limiter (Moderate)
**Recommendation**: Conversation coordinator with low iterations
- Concurrency concerns
- Algorithm complexity (token bucket)
- Edge cases (distributed systems)
- Cost: ~$0.10

```bash
./tdd-conversation-coordinator.sh \
  --agent-id limiter-001 \
  --feature "Rate limiter with token bucket algorithm" \
  --file ./src/middleware/rate-limiter.ts \
  --test-command "npm test rate-limiter.test.ts" \
  --context "./src/types.ts" \
  --max-iterations 3
```

## Migration Path

If original coordinator fails, migrate to conversation coordinator:

```bash
# Original fails
./tdd-coordinator.sh --agent-id test-001 --feature "..." --file ... --test-command "..."

# Tests fail, no recovery mechanism

# Upgrade to conversation coordinator
./tdd-conversation-coordinator.sh \
  --agent-id test-001-retry \
  --feature "..." \
  --file ... \
  --test-command "..." \
  --max-iterations 3
```

## Cost Optimization

### Strategy 1: Try Original First
```bash
# Attempt 1: Original (fast, cheap)
./tdd-coordinator.sh "$@" || {
  # Attempt 2: Conversation (slower, more expensive, but recovers)
  ./tdd-conversation-coordinator.sh "$@" --max-iterations 3
}
```

### Strategy 2: Complexity-Based Routing
```bash
if [[ "$FEATURE" =~ "simple|basic|format|parse" ]]; then
  # Low complexity -> original
  ./tdd-coordinator.sh "$@"
else
  # Higher complexity -> conversation
  ./tdd-conversation-coordinator.sh "$@"
fi
```

### Strategy 3: Cost Caps
```bash
# Start with lower iteration limit
./tdd-conversation-coordinator.sh "$@" --max-iterations 2

# If still failing, increase only if justified
./tdd-conversation-coordinator.sh "$@" --max-iterations 5
```

## Monitoring and Analytics

### Track Success Rates
```bash
# Original coordinator
grep -r "success" conversations-original/ | wc -l

# Conversation coordinator
find conversations/ -name "*.json" \
  -exec jq -r 'select(.metadata.phase == "success") | .metadata.iterations' {} \; \
  | awk '{sum+=$1; count++} END {print "Avg iterations:", sum/count}'
```

### Cost Analysis
```bash
# Compare costs by complexity
find conversations/ -name "*.json" \
  -exec jq -r '{feature: .metadata.feature, iterations: .metadata.iterations}' {} \;
```

### Pattern Learning
```bash
# Query successful patterns by iterations
find conversations/ -name "*.json" \
  -exec jq -r 'select(.metadata.iterations <= 2) | .metadata.feature' {} \;

# These patterns could use original coordinator
```

## Future Enhancements

### Planned
- Auto-routing based on complexity heuristics
- Cost prediction before execution
- Shared conversation memory across sessions
- Multi-agent collaboration (separate tester and implementer)

### Experimental
- Reinforcement learning for prompt optimization
- Automated context file discovery
- Incremental test addition (add tests, don't regenerate)
- Refactor phase (true Red-Green-Refactor)

## References

- [Original TDD Coordinator](./tdd-coordinator.sh)
- [Conversation TDD Coordinator](./tdd-conversation-coordinator.sh)
- [Complete Usage Guide](./README.md)
- [Interactive Examples](./example-usage.sh)
- [Test Suite](./test-tdd-coordinator.sh)

## Quick Start

### Installation
```bash
# Ensure dependencies
which curl jq || echo "Install curl and jq"

# Set API key
export ZAI_API_KEY="your-key"

# Test coordinators
./test-tdd-coordinator.sh
```

### First Feature (Simple)
```bash
./tdd-coordinator.sh \
  --agent-id quickstart \
  --feature "String trimmer" \
  --file ./src/trim.ts \
  --test-command "npm test trim.test.ts"
```

### First Feature (Complex)
```bash
./tdd-conversation-coordinator.sh \
  --agent-id quickstart-complex \
  --feature "Password validator with strength checking" \
  --file ./src/password.ts \
  --test-command "npm test password.test.ts" \
  --max-iterations 3 \
  --verbose
```

## Support

For issues or questions:
1. Check [README.md](./README.md) for detailed documentation
2. Run test suite to validate setup
3. Review example conversations in `conversations/`
4. Enable `--verbose` for detailed logging

---

**Recommendation**: Start with original coordinator for simple features. Upgrade to conversation coordinator when you need error recovery or are implementing complex/critical code.
