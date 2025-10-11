# CFN Loop Slash Command

The `/cfn-loop` command implements the 3-loop self-correcting CFN (Claude Flow Novice) workflow with confidence gating, consensus validation, and memory persistence.

## Command Signature

```bash
/cfn-loop <task description> [--phase=name] [--max-loop2=5] [--max-loop3=10]
```

## Aliases

- `/cfn` - Short alias for `/cfn-loop`
- `/loop` - Alternative alias

## Parameters

### Required

- **task description** - A clear description of the task to execute

### Optional

- `--phase=name` - Phase name for memory organization (default: "default")
- `--max-loop2=N` - Maximum consensus validation iterations (default: 5)
- `--max-loop3=N` - Maximum primary swarm iterations (default: 10)

## Usage Examples

### Basic Usage

```bash
/cfn-loop "Implement JWT authentication"
```

### With Custom Phase

```bash
/cfn-loop "Fix security vulnerabilities" --phase=security-audit
```

### With Custom Loop Limits

```bash
/cfn-loop "Refactor API layer" --max-loop2=3 --max-loop3=15
```

### Complete Example

```bash
/cfn-loop "Add test coverage for auth module" --phase=testing --max-loop2=5 --max-loop3=10
```

### Using Aliases

```bash
# Short form
/cfn "Build REST API"

# Alternative alias
/loop "Optimize database queries"
```

## How It Works

The CFN Loop implements a 3-tier validation structure:

### Loop 3: Primary Swarm Execution

1. **Swarm Initialization** - Automatically initializes swarm with appropriate topology
2. **Agent Spawning** - Spawns agents based on task complexity (3-15 agents)
3. **Self-Validation** - Each agent validates own work with confidence scores
4. **Gate Check** - Requires ≥75% confidence from all agents to proceed

**Complexity-based Agent Allocation:**
- **Simple tasks** (3 agents, mesh): Bug fixes, small updates
- **Medium tasks** (6 agents, mesh): Feature implementation, refactoring
- **Complex tasks** (10 agents, hierarchical): Architecture changes, security audits
- **Enterprise tasks** (15 agents, hierarchical): Large-scale systems, migrations

### Loop 2: Consensus Validation

1. **Validator Spawning** - Spawns 2-4 consensus validators
2. **Multi-dimensional Checks** - Quality, security, performance, tests, docs
3. **Byzantine Voting** - Requires ≥90% approval rate
4. **Feedback Injection** - Returns to Loop 3 with feedback if consensus fails

### Loop 1: Phase Completion

1. **Success Path** - Stores results, provides next steps
2. **Failure Path** - Escalates with detailed guidance after max iterations

## Memory Integration

The command stores data in SwarmMemory with namespace pattern:

```
cfn-loop/{phase-name}/{iteration-number}
```

**Memory Keys:**
- `cfn-loop/{phase}/confidence` - Agent confidence scores
- `cfn-loop/{phase}/validator-feedback` - Consensus validation feedback
- `cfn-loop/{phase}/loop3-iterations` - Primary swarm iteration count
- `cfn-loop/{phase}/loop2-iterations` - Consensus iteration count
- `cfn-loop/{phase}/final-result` - Complete results on success

## Output Structure

The command returns a comprehensive prompt containing:

1. **Task Configuration**
   - Task description
   - Phase name
   - Complexity assessment
   - Agent count and topology
   - Loop iteration limits

2. **Loop 3 Instructions**
   - Swarm initialization code
   - Agent spawn commands
   - Confidence scoring protocol
   - Self-assessment gate logic

3. **Loop 2 Instructions**
   - Validator spawn commands
   - Multi-dimensional validation criteria
   - Byzantine consensus voting
   - Feedback collection

4. **Loop 1 Instructions**
   - Success path with results storage
   - Failure path with escalation guidance
   - Next steps recommendations

5. **Execution Checklist**
   - Pre-execution validation
   - Loop 3 checkpoints
   - Loop 2 checkpoints
   - Loop 1 checkpoints

## Mandatory Post-Edit Hooks

After EVERY file edit, agents MUST run:

```bash
npx enhanced-hooks post-edit "[FILE_PATH]" --memory-key "cfn-loop/{phase}/agent-{id}" --structured
```

This ensures:
- TDD compliance
- Code quality validation
- Security scanning
- Test coverage tracking
- Memory coordination

## Real-World Examples

### Example 1: Implement Feature

```bash
/cfn-loop "Implement OAuth2 login flow" --phase=authentication
```

**Expected Flow:**
1. Assesses as "medium" complexity → 6 agents, mesh topology
2. Spawns: researcher, coder, tester, reviewer, api-docs, security-specialist
3. Each agent executes subtasks with post-edit hooks
4. Confidence gate: all agents ≥75% confident
5. Consensus validators review: quality, security, tests, architecture
6. Byzantine voting: ≥90% approval required
7. Success: Results stored, next steps provided

### Example 2: Security Audit

```bash
/cfn-loop "Complete security audit of payment module" --phase=security --max-loop2=3
```

**Expected Flow:**
1. Assesses as "complex" → 10 agents, hierarchical topology
2. Includes specialized security agents
3. Stricter validation due to security context
4. Max 3 consensus iterations (customized)
5. Detailed security recommendations in next steps

### Example 3: Bug Fix

```bash
/cfn "Fix memory leak in session handler"
```

**Expected Flow:**
1. Assesses as "simple" → 3 agents, mesh topology
2. Spawns: coder, tester, reviewer
3. Focused, efficient execution
4. Quick consensus validation
5. Immediate deployment guidance

## Next Steps Guidance

The command provides phase-specific next steps:

**Implementation Phase:**
1. Run comprehensive integration tests
2. Perform security audit
3. Optimize performance
4. Update API documentation
5. Prepare deployment checklist

**Testing Phase:**
1. Review test coverage metrics
2. Add edge case tests
3. Perform load testing
4. Update test documentation
5. Set up CI/CD pipeline

**Security Audit Phase:**
1. Implement security fixes
2. Update security policies
3. Perform penetration testing
4. Document security measures
5. Train team on secure practices

**Refactoring Phase:**
1. Validate refactored code
2. Update dependent modules
3. Run full regression tests
4. Update architecture docs
5. Performance benchmark comparison

## Error Handling

### No Task Provided

```bash
/cfn-loop
```

**Response:**
```
Error: Task description required
Usage: /cfn-loop <task description> [--phase=name] [--max-loop2=5] [--max-loop3=10]
```

### Confidence Gate Failure

If agents report <75% confidence, Loop 3 retries with feedback up to max iterations.

### Consensus Failure

If validators report <90% approval, Loop 2 injects feedback and retries up to max iterations.

### Max Iterations Reached

Provides detailed escalation guidance:
- Issues identified by validators
- Current confidence/consensus scores
- Recommended actions
- Memory keys for manual review

## Best Practices

1. **Clear Task Descriptions** - Be specific about what needs to be done
2. **Appropriate Phase Names** - Use descriptive phase names for organization
3. **Adjust Loop Limits** - Increase for complex tasks, decrease for simple ones
4. **Monitor Confidence Scores** - Low scores indicate need for task refinement
5. **Review Memory State** - Check stored results and feedback between iterations
6. **Follow Next Steps** - Use provided guidance for logical workflow continuation

## Integration with Other Commands

### Combine with Swarm Management

```bash
# First initialize swarm manually if needed
/swarm init mesh 8

# Then execute CFN loop
/cfn-loop "Build feature"
```

### Combine with Hooks

```bash
# Enable hooks first
/hooks enable

# Execute CFN loop (hooks auto-run)
/cfn-loop "Refactor module"
```

### Combine with Performance Monitoring

```bash
# Start CFN loop
/cfn-loop "Optimize queries"

# Monitor performance during execution
/performance monitor
```

## Troubleshooting

### Issue: Agents stuck in Loop 3

**Solution:** Increase `--max-loop3` or break task into smaller subtasks

### Issue: Consensus never passes

**Solution:** Review validator feedback, adjust implementation approach

### Issue: Wrong complexity assessment

**Solution:** Use more specific keywords in task description

### Issue: Memory namespace conflicts

**Solution:** Use unique `--phase` names for different workflows

## Technical Details

**File Location:** `/src/slash-commands/cfn-loop.js`

**Dependencies:**
- SlashCommand base class
- SwarmMemory integration
- MCP tools (swarm_init, memory_store, etc.)
- Enhanced post-edit hooks

**Registered Aliases:**
- Primary: `cfn-loop`
- Alias 1: `cfn`
- Alias 2: `loop`

**Test Coverage:**
- Unit tests: `tests/unit/slash-commands/cfn-loop.test.js`
- Integration tests: `tests/integration/slash-commands/cfn-loop-integration.test.js`

## Support

For issues or questions:
1. Check command help: `/help cfn-loop`
2. Review test files for usage examples
3. Check memory state for debugging
4. Report issues in project repository
