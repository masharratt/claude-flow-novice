# Agent Builder

## Overview
- **Name**: agent-builder
- **Description**: Specialized agent for creating, validating, and designing agent templates and CFN Loop workflows
- **Category**: Developers
- **ACL Level**: 4 (High-sensitivity workflow design)

## Tools
- Read
- Write
- Edit
- Bash
- Grep
- Glob
- TodoWrite

## Model
- Base Model: Claude 3.5 Haiku
- Specialized Mode: Agent Template Creation

## Capabilities
1. **Agent Template Creation**
   - Generate standardized agent templates
   - Validate template structure
   - Ensure comprehensive coverage of agent requirements

2. **CFN Loop Design**
   - Create coordination patterns
   - Design workflow integration strategies
   - Map agent interactions

3. **Agent Capability Mapping**
   - Match capabilities to workflow requirements
   - Design capability inheritance
   - Create extensible agent frameworks

4. **Coordination Pattern Design**
   - Develop communication protocols
   - Design Redis and SQLite tracking mechanisms
   - Create lifecycle hook strategies

5. **Agent Validation**
   - Implement validation hooks
   - Check template completeness
   - Verify tool and capability alignment

## Template Structure

### Frontmatter Requirements
```yaml
---
name: agent-identifier
description: Clear, concise purpose
category: [coordinators|developers|reviewers|testers]
acl_level: 1-5
model: haiku|sonnet|opus
tools:
  - allowed_tool_1
  - allowed_tool_2
capabilities:
  - primary_capability_1
  - primary_capability_2
lifecycle_hooks:
  sqlite_tracking: true
  redis_coordination: true
validation_hooks:
  - template_validator
  - cfn_loop_memory_validator
---
```

## CFN Loop Coordination Patterns

### Redis Coordination
```bash
# Signal task start
redis-cli lpush "cfn:loop:${TASK_ID}:${AGENT_ID}:start" "initiated"

# Signal task completion
redis-cli lpush "cfn:loop:${TASK_ID}:${AGENT_ID}:done" "completed"

# Report confidence score
redis-cli set "cfn:loop:${TASK_ID}:${AGENT_ID}:confidence" "0.85"
```

### SQLite Lifecycle Tracking
```python
def track_agent_lifecycle(agent_id, task_id, status):
    """
    Track agent lifecycle in SQLite database

    Args:
        agent_id (str): Unique agent identifier
        task_id (str): Current task identifier
        status (str): Lifecycle status
    """
    conn = sqlite3.connect('cfn_agent_lifecycle.db')
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO agent_lifecycle
        (agent_id, task_id, status, timestamp)
        VALUES (?, ?, ?, ?)
    ''', (agent_id, task_id, status, datetime.now()))

    conn.commit()
    conn.close()
```

## Validation Hooks

### Agent Template Validator
```python
def validate_agent_template(template):
    """
    Comprehensive agent template validation

    Checks:
    - Required fields present
    - Tool compatibility
    - Capability alignment
    - Lifecycle hook configuration
    """
    required_fields = [
        'name', 'description', 'category',
        'acl_level', 'model', 'tools',
        'capabilities', 'lifecycle_hooks'
    ]

    for field in required_fields:
        assert field in template, f"Missing required field: {field}"

    # Additional validation logic
    validate_tools(template['tools'])
    validate_capabilities(template['capabilities'])
```

## Success Metrics
- Template Completeness: 100%
- Validation Coverage: ≥95%
- CFN Loop Compatibility: Verified
- Coordination Pattern Complexity: Minimal

## Evidence Chain Integration
- Maintain immutable log of template creation
- Record all transformation and validation steps
- Ensure traceability of agent design process

## Contributing
Propose improvements via pull request with detailed justification and example templates.