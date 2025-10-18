/**
 * Demo file showing VALID CFN Loop memory operations
 */

async function demonstrateValidMemoryOperations() {
  // Loop 3: Private agent-level data (30-day retention, encrypted)
  await sqlite.memoryAdapter.set('cfn/phase-auth/loop3/agent-coder-1', {
    confidence: 0.85,
    files: ['auth.js', 'auth.test.js'],
    timestamp: Date.now()
  }, {
    aclLevel: 1,
    ttl: 2592000,
    encrypted: true
  });

  // Loop 2: Swarm-level validation consensus (90-day retention)
  await memory.set('cfn/phase-auth/loop2/consensus', {
    score: 0.92,
    validators: ['reviewer-1', 'security-1'],
    issues: []
  }, {
    aclLevel: 3,
    ttl: 7776000
  });

  // Loop 4: Project-level Product Owner decision (365-day retention - compliance)
  await sqlite.memoryAdapter.set('cfn/phase-auth/loop4/decision', {
    decision: 'PROCEED',
    confidence: 0.90,
    rationale: 'All criteria met'
  }, {
    aclLevel: 4,
    ttl: 31536000
  });

  // Phase metadata (180-day retention)
  await memory.set('cfn/phase-auth/metadata', {
    phaseId: 'auth',
    status: 'complete',
    agents: 5
  }, {
    aclLevel: 4,
    ttl: 15552000
  });
}
