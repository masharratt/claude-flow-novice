#!/usr/bin/env bash
##############################################################################
# Epic Context Injection - Example Usage
#
# This script demonstrates how to use epic context injection for CLI agents
# in a CFN Loop workflow.
##############################################################################

set -euo pipefail

# Generate unique task ID
TASK_ID="epic-example-$(date +%s)"

echo "=== Epic Context Injection Example ==="
echo "Task ID: $TASK_ID"
echo ""

# Define epic context as JSON
EPIC_CONTEXT=$(cat <<'EOF'
{
  "epicName": "Authentication System",
  "epicGoal": "Implement secure JWT-based authentication with role-based access control",
  "currentPhase": "Phase 1 - Core Authentication",
  "inScope": [
    "JWT token generation and validation",
    "User login/logout endpoints",
    "Password hashing with bcrypt",
    "Token refresh mechanism"
  ],
  "outOfScope": [
    "OAuth integration",
    "Two-factor authentication",
    "Password reset emails",
    "User registration workflow"
  ],
  "references": [
    "docs/authentication-spec.md",
    "planning/auth-implementation.md"
  ]
}
EOF
)

# Define phase context
PHASE_CONTEXT=$(cat <<'EOF'
{
  "phaseName": "Phase 1 - Core Authentication",
  "phaseNumber": 1,
  "deliverables": [
    "POST /auth/login endpoint",
    "POST /auth/logout endpoint",
    "POST /auth/refresh endpoint",
    "JWT utility functions (sign, verify)",
    "Password hashing utilities",
    "Integration tests for all endpoints"
  ],
  "dependencies": [
    "Express.js server (existing)",
    "Redis for token storage (existing)",
    "PostgreSQL for user data (existing)"
  ]
}
EOF
)

# Define success criteria
SUCCESS_CRITERIA=$(cat <<'EOF'
{
  "acceptanceCriteria": [
    "All authentication endpoints implemented and tested",
    "JWT tokens properly signed and validated",
    "Passwords hashed using bcrypt with proper salt rounds",
    "Token refresh mechanism working correctly",
    "All tests passing with >80% coverage"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90,
  "qualityGates": {
    "testCoverage": 80,
    "securityScore": 0.95
  },
  "definitionOfDone": [
    "Code reviewed and approved",
    "Security scan passed",
    "All tests passing",
    "Documentation updated"
  ]
}
EOF
)

echo "Step 1: Storing epic context in Redis..."
echo ""

# Store epic context (orchestrator will do this automatically if you pass --epic-context)
# This is just for demonstration
redis-cli setex "swarm:${TASK_ID}:epic-context" 604800 "$EPIC_CONTEXT" >/dev/null
echo "✅ Epic context stored"

redis-cli setex "swarm:${TASK_ID}:phase-context" 604800 "$PHASE_CONTEXT" >/dev/null
echo "✅ Phase context stored"

redis-cli setex "swarm:${TASK_ID}:success-criteria" 604800 "$SUCCESS_CRITERIA" >/dev/null
echo "✅ Success criteria stored"

echo ""
echo "Step 2: Verify context stored correctly..."
echo ""

echo "Epic context preview:"
redis-cli get "swarm:${TASK_ID}:epic-context" | jq -r '.epicName, .epicGoal' | head -2
echo ""

echo "Step 3: Invoke orchestrator with context..."
echo ""

# NOTE: In production, you would pass context directly to orchestrator:
#
# ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
#   --task-id "$TASK_ID" \
#   --mode standard \
#   --loop3-agents "backend-dev,security-specialist" \
#   --loop2-agents "reviewer,tester" \
#   --product-owner "product-owner" \
#   --epic-context "$EPIC_CONTEXT" \
#   --phase-context "$PHASE_CONTEXT" \
#   --success-criteria "$SUCCESS_CRITERIA"

echo "Orchestrator command (not executed in this example):"
echo ""
echo "./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \\"
echo "  --task-id \"$TASK_ID\" \\"
echo "  --mode standard \\"
echo "  --loop3-agents \"backend-dev,security-specialist\" \\"
echo "  --loop2-agents \"reviewer,tester\" \\"
echo "  --product-owner \"product-owner\" \\"
echo "  --epic-context \"\$EPIC_CONTEXT\" \\"
echo "  --phase-context \"\$PHASE_CONTEXT\" \\"
echo "  --success-criteria \"\$SUCCESS_CRITERIA\""
echo ""

echo "Step 4: Manual agent spawn example (for testing)..."
echo ""

# For testing, you can manually spawn a single agent
# The agent will automatically load context from Redis
echo "Manual spawn command (not executed):"
echo "npx cfn-spawn agent backend-dev --task-id \"$TASK_ID\" --iteration 1"
echo ""

echo "=== What Agents Will Receive ==="
echo ""
echo "Agents spawned with task-id '$TASK_ID' will receive:"
echo ""
echo "1. CLAUDE.md (project rules)"
echo "2. Agent-specific markdown template"
echo "3. Epic Context:"
echo "   - Epic: Authentication System"
echo "   - Goal: Implement secure JWT-based authentication"
echo "   - In Scope: JWT tokens, login/logout, password hashing"
echo "   - Out of Scope: OAuth, 2FA, password reset"
echo ""
echo "4. Phase Context:"
echo "   - Phase: Phase 1 - Core Authentication"
echo "   - Deliverables: 3 endpoints, JWT utils, tests"
echo ""
echo "5. Success Criteria:"
echo "   - Gate threshold: 75%"
echo "   - Consensus threshold: 90%"
echo "   - Test coverage: 80%"
echo "   - Security score: 95%"
echo ""

echo "=== Cleanup ==="
echo ""
echo "To clean up test context:"
echo "redis-cli del \"swarm:${TASK_ID}:epic-context\" \"swarm:${TASK_ID}:phase-context\" \"swarm:${TASK_ID}:success-criteria\""
echo ""

echo "Example complete!"
