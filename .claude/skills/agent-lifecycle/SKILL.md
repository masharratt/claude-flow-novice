# Agent Lifecycle Management Skill

**Purpose:** Enable agents to execute SQLite lifecycle hooks for auditing purposes

**Description:** This skill provides agents with the ability to register their lifecycle events (spawn, confidence updates, completion) in a SQLite database for audit trail and cross-session recovery.

## Usage

### Agent Spawn Registration
```bash
# Register agent when starting work
./.claude/skills/agent-lifecycle/execute-lifecycle-hook.sh spawn \
  --agent-id "${AGENT_ID}" \
  --agent-type "${AGENT_TYPE}" \
  --acl-level 1 \
  --name "${AGENT_NAME}"
```

### Confidence Updates
```bash
# Update confidence during work
./.claude/skills/agent-lifecycle/execute-lifecycle-hook.sh update \
  --agent-id "${AGENT_ID}" \
  --confidence 0.85 \
  --reasoning "Implementation complete, all tests passing"
```

### Agent Completion
```bash
# Mark agent as completed
./.claude/skills/agent-lifecycle/execute-lifecycle-hook.sh complete \
  --agent-id "${AGENT_ID}" \
  --confidence 0.90 \
  --output "Successfully implemented feature with 95% test coverage"
```

## Integration in Agent Profiles

Add to agent completion protocol:

```markdown
## Lifecycle Management
- Execute spawn registration at start
- Update confidence during implementation
- Log completion with confidence score
- Maintain audit trail in SQLite database
```

## Database Schema

The SQLite database contains:
- `agents` table: Agent information and status
- `lifecycle_events` table: Complete audit trail

## Security

- ACL levels enforced (1-6)
- Input validation for all parameters
- Sanitized error messages
- Atomic operations to prevent race conditions