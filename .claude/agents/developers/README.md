# Developers

Implementation agents focused on building features and components.

## Active Agents (7)

**Backend Development:**
- `backend-dev.md` - Backend services, APIs, server-side logic
- `dev-backend-api.md` - Specialized REST/GraphQL API development

**Frontend Development:**
- `react-frontend-engineer.md` - React component development
- `ui-designer.md` - UI/UX implementation
- `state-architect.md` - State management architecture

**General Development:**
- `coder.md` - General-purpose code implementation
- `interaction-tester.md` - Interactive component testing

## Purpose

Developers participate in CFN Loop 3 (implementation layer):
- Implement features from specifications
- Write tests alongside code (TDD)
- Create documentation
- Handle error cases
- Optimize for performance

## Implementation Standards

All developers follow:
- Test-driven development (TDD)
- Clean code principles
- Proper error handling
- Security best practices
- Performance optimization
- Documentation requirements

## Usage Pattern

**In CFN Loop:**
Automatically spawned by orchestrator in Loop 3:
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --loop3-agents "backend-dev,react-frontend-engineer"
```

**Standalone Implementation:**
```bash
npx claude-flow-novice agent-spawn backend-dev --task-id "$TASK_ID"
```

## Deliverables

Developers create:
- Production code with tests
- Unit and integration tests
- API documentation
- Implementation notes
- Confidence scores (gate: 0.75+)

## Post-Edit Validation

Developers MUST run after every file edit:
```bash
./.claude/hooks/invoke-post-edit.sh "$EDITED_FILE" --agent-id "$AGENT_ID"
```

This ensures code quality, test coverage, and security validation.
