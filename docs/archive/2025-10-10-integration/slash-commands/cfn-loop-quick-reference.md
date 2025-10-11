# CFN Loop - Quick Reference

## Command

```bash
/cfn-loop <task> [--phase=name] [--max-loop2=5] [--max-loop3=10]
```

**Aliases:** `/cfn`, `/loop`

## Quick Examples

```bash
# Basic usage
/cfn-loop "Implement JWT authentication"

# With phase
/cfn "Fix security issues" --phase=security-audit

# With custom limits
/loop "Refactor API" --max-loop2=3 --max-loop3=15
```

## The 3 Loops

| Loop | Purpose | Gate | Max Iterations |
|------|---------|------|----------------|
| **Loop 3** | Primary swarm execution | ≥75% confidence | Default: 10 |
| **Loop 2** | Consensus validation | ≥90% approval | Default: 5 |
| **Loop 1** | Phase completion | Success/Escalate | 1 |

## Complexity Assessment

| Complexity | Agents | Topology | Example Tasks |
|------------|--------|----------|---------------|
| **Simple** | 3 | mesh | Bug fixes, small updates |
| **Medium** | 6 | mesh | Features, refactoring |
| **Complex** | 10 | hierarchical | Architecture, security audits |
| **Enterprise** | 15 | hierarchical | Large systems, migrations |

## Agent Types by Complexity

**Simple:** coder, tester, reviewer

**Medium:** researcher, coder, tester, reviewer, api-docs, security-specialist

**Complex:** researcher, system-architect, backend-dev, coder, tester, security-specialist, reviewer, api-docs, perf-analyzer, devops-engineer

**Enterprise:** All above + mobile-dev, cicd-engineer, planner, coordinator

## Memory Namespaces

```
cfn-loop/{phase}/confidence           # Agent confidence scores
cfn-loop/{phase}/validator-feedback   # Consensus feedback
cfn-loop/{phase}/loop3-iterations     # Loop 3 count
cfn-loop/{phase}/loop2-iterations     # Loop 2 count
cfn-loop/{phase}/final-result         # Success results
```

## Mandatory Hook Execution

After EVERY file edit:

```bash
npx enhanced-hooks post-edit "[FILE]" --memory-key "cfn-loop/{phase}/agent-{id}" --structured
```

## Validation Criteria

### Loop 3 (Self-Assessment)
- Minimum confidence: 75%
- All agents must pass
- Post-edit hooks required

### Loop 2 (Consensus)
- Approval rate: ≥90%
- Average confidence: ≥85%
- Multi-dimensional checks:
  - Quality
  - Security
  - Performance
  - Tests (≥80% coverage)
  - Documentation

## Next Steps by Phase

**implementation** → Integration tests, security audit, performance optimization

**testing** → Coverage review, edge cases, load testing, CI/CD setup

**security-audit** → Fix implementation, policies, penetration testing

**refactoring** → Validation, dependent updates, regression tests

**default** → Review, comprehensive tests, documentation

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Stuck in Loop 3 | Increase `--max-loop3` or split task |
| Consensus fails | Review validator feedback, adjust approach |
| Wrong complexity | Use specific keywords in task description |
| Memory conflicts | Use unique `--phase` names |

## Success Flow

```
1. Parse task → Assess complexity → Configure swarm
2. Loop 3: Spawn agents → Execute → Self-validate → Gate check
3. Loop 2: Spawn validators → Multi-dim check → Byzantine vote
4. Loop 1: Store results → Provide next steps → Complete
```

## Failure Flow

```
Loop 3 FAIL → Retry with feedback (max 10)
Loop 2 FAIL → Inject feedback to Loop 3 (max 5)
Max iterations → Escalate with guidance
```

## Command Help

```bash
/help cfn-loop    # Full documentation
/help cfn         # Same (alias)
/help loop        # Same (alias)
```
