/**
 * Demo file showing INVALID CFN Loop memory operations
 * (for testing validator detection)
 */

async function demonstrateInvalidMemoryOperations() {
  // VIOLATION 1: Loop 3 with wrong ACL level
  await sqlite.memoryAdapter.set('cfn/phase-auth/loop3/agent-coder-1', {
    confidence: 0.85
  }, {
    aclLevel: 3, // WRONG! Should be 1 (Private)
    ttl: 2592000,
    encrypted: true
  });

  // VIOLATION 2: Loop 4 with non-compliant TTL
  await memory.set('cfn/phase-auth/loop4/decision', {
    decision: 'PROCEED'
  }, {
    aclLevel: 4,
    ttl: 2592000 // WRONG! Compliance requires 31536000 (365 days)
  });

  // VIOLATION 3: Loop 3 without encryption
  await sqlite.memoryAdapter.set('cfn/phase-auth/loop3/sensitive-data', {
    data: 'sensitive'
  }, {
    aclLevel: 1,
    ttl: 2592000,
    encrypted: false // WRONG! Loop 3 requires encryption
  });

  // VIOLATION 4: Invalid key format
  await memory.set('cfn/invalid/key/format', {
    data: 'test'
  }, {
    aclLevel: 1,
    ttl: 2592000
  });

  // VIOLATION 5: Loop 2 with wrong TTL
  await sqlite.memoryAdapter.set('cfn/phase-auth/loop2/consensus', {
    score: 0.92
  }, {
    aclLevel: 3,
    ttl: 2592000 // WRONG! Should be 7776000 (90 days)
  });
}
