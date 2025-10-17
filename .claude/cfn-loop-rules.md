## Loop Structure (Updated DEFER vs LOOP Logic)

Loop 0: Epic/Sprint orchestration (multi-phase) → no iteration limit
Loop 0.5: Planning consensus (Enterprise only) → architects vote on design; ≥0.85 consensus
Loop 1: Phase execution (sequential phases) → no limit
Loop 2: Consensus validation (2-4 validators) → max 5-15/phase; exit at ≥0.80-0.95
Loop 3: Primary swarm implementation → max 5-15/subtask; exit when all ≥0.70-0.75
Loop 4: Product Owner decision gate (Enhanced Decision Framework)

### Decision Framework

1. **PROCEED** - Consensus ≥ threshold, criteria met → advance to next sprint/phase
   - Criteria: All quality gates passed
   - Action: Move directly to next phase
   - Confidence: >0.90 across all validators

2. **LOOP** - Consensus < threshold, fixable issues → relaunch Loop 3 with targeted fixes
   - Criteria: Specific, actionable improvements identified
   - Action: Relaunch previous loop with focused agent assignments
   - Max Iterations: 
     - MVP: 5 iterations
     - Standard: 10 iterations
     - Enterprise: 15 iterations
   - Requires specific, in-scope improvement recommendations

3. **DEFER** - Out-of-scope, lower priority → backlog management without blocking progress
   - Criteria: 
     - Items are genuinely out-of-scope
     - Do not block current phase completion
     - Maintain clear backlog visibility
   - Action: 
     - Add to backlog.json with priority and context
     - Proceed with current phase
     - Ensure TodoWrite tracks deferred items
   - Create comprehensive backlog entry with:
     - Title
     - Description
     - Priority (critical/high/medium/low)
     - Estimated cost
     - Target phase/iteration
     - Rationale for deferral

4. **ESCALATE** - Blocked, ambiguous, critical conflict → require human decision
   - Criteria:
     - Unresolvable conflicts
     - Critical architectural changes
     - Potential compliance or security risks
     - Requires stakeholder input
   - Action: 
     - Generate comprehensive escalation report
     - Halt current phase progression
     - Request explicit human review and decision

### Iteration and Escalation Rules

**Iteration Limits**:
- MVP Mode: Max 5 iterations per loop
- Standard Mode: Max 10 iterations per loop
- Enterprise Mode: Max 15 iterations per loop

**Escalation Triggers**:
- Iteration limit reached
- Critical security vulnerabilities
- Compliance risks
- Major architectural changes
- Budget/timeline significant deviation
- Stakeholder approval required

**Backlog Management**:
- ALWAYS use TodoWrite to track deferred items
- Persist backlog items to SQLite with 365-day retention
- Include full context and deferral rationale
- Prioritize and tag for future phases
