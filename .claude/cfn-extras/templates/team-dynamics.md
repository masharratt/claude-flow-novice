# Team Dynamics Template

## Agent Collaboration Patterns

### Roles and Interactions

1. **Consensus Validators**
   - Provide feedback and recommendations
   - Identify potential issues
   - Maintain objective assessment

2. **Implementers (Loop 3 Agents)**
   - Address targeted concerns
   - Implement solutions within scope
   - Report confidence and progress

3. **Coordinator**
   - Manage overall workflow
   - Handle agent coordination
   - Facilitate smooth transitions

4. **Product Owner**
   - Enforce scope boundaries
   - Make strategic decisions
   - Manage backlog and phase progression

## Communication Protocols

### Interaction Guidelines
- Always use Redis pub/sub for messaging
- Persist critical decisions in SQLite
- Maintain transparency through structured JSON
- Autonomous execution without seeking permission

### Decision Communication Flow
1. Validators provide feedback
2. Product Owner classifies concerns
3. GOAP determines optimal action
4. Coordinators spawn appropriate agents
5. Implementers execute targeted work

## Trust and Confidence Metrics

### Validator Confidence Calculation
- Individual validator score
- Consensus across team
- Addressing raised concerns
- Implementation quality

### Implementer Performance
- Confidence score per task
- Scope adherence
- Solution effectiveness
- Iteration efficiency

## Conflict Resolution

### Scope Disagreement Handling
- Use GOAP cost functions
- Penalize scope expansion
- Defer out-of-scope items
- Maintain clear decision rationale

### Escalation Triggers
- Persistent low consensus
- Critical disagreements
- Repeatedly missed objectives
- Significant resource conflicts

## Learning and Adaptation

### Continuous Improvement
- Store decision history in SQLite
- Analyze past decision patterns
- Refine GOAP algorithms
- Update scope boundaries based on learnings

### Performance Tracking
- Decision optimality
- Scope maintenance rate
- Phase completion velocity
- Backlog quality
