# Coordinator Communication Requirements

## Executive Summary

This document defines explicit instructions coordinators need to communicate effectively during CFN Loop epic execution, based on analysis of the parallel CFN loop epic and hello-world coordination tests.

**Date**: 2025-10-11
**Status**: Production Ready
**Test Reference**: `tests/hello-world/hello-world-mesh-coordination-test.md`

---

## Issue Identified

During parallel CFN loop epic execution (Sprints 0-6), coordinators:
- ❌ **Did NOT** actively communicate via Redis pub/sub
- ❌ **Did NOT** use claim/confirmation protocols
- ❌ **Did NOT** coordinate dependency waiting
- ✅ **Did** spawn Loop 2 validators and achieve consensus
- ✅ **Did** store final results in Redis

**Root Cause**: Coordinator spawn prompts lacked explicit Redis pub/sub communication instructions.

---

## Required Communication Patterns

### 1. Redis Pub/Sub Channels (MANDATORY)

All coordinator communication MUST use Redis pub/sub. File-based coordination is PROHIBITED.

**Required Channels:**

```bash
# Sprint lifecycle events
sprint:coordination

# Agent lifecycle tracking
agent:lifecycle

# Dependency readiness signals
interface:ready

# Claim/confirmation protocol
coordination:claims:channel

# Test execution coordination
test:coordination

# Conflict detection
conflict:detected
```

**Example Pub/Sub Flow:**

```typescript
// Coordinator A publishes sprint start
await redis.publish('sprint:coordination', JSON.stringify({
  type: 'sprint:start',
  sprintId: 'sprint-1',
  coordinatorId: 'coordinator-A',
  dependencies: [],
  timestamp: Date.now()
}));

// Coordinator B subscribes to coordination events
await redis.subscribe('sprint:coordination', (message) => {
  const event = JSON.parse(message);
  if (event.type === 'sprint:complete') {
    // Check if my dependencies are satisfied
    checkDependencies(event.sprintId);
  }
});
```

---

### 2. Claim/Confirmation Protocol

For parallel work distribution, coordinators MUST use claim protocol to prevent overlap.

**Protocol Steps:**

```bash
# Step 1: Coordinator A attempts claim
PUBLISH coordination:claims:channel '{
  "coordinator": "Coordinator-A",
  "combo": "JavaScript:English",
  "action": "claim",
  "timestamp": 1760180000000
}'

# Step 2: Wait 100ms for conflicts
sleep 0.1

# Step 3: If no conflict, confirm claim
PUBLISH coordination:claims:channel '{
  "coordinator": "Coordinator-A",
  "combo": "JavaScript:English",
  "action": "confirmed",
  "timestamp": 1760180100000
}'

# Step 4: Store confirmed claim
SET coordination:claims:confirmed:JavaScript:English "Coordinator-A"
```

**Conflict Resolution:**
- If both coordinators claim within 100ms → Earlier timestamp wins
- Loser re-claims different work item
- All conflicts logged to `coordination:conflicts:log`

---

### 3. Dependency Waiting Pattern

When Sprint 4 depends on Sprints 1-3, Coordinator 4 MUST:

**Subscribe to dependency completion:**

```typescript
// Coordinator 4 subscribes before starting
await redis.subscribe('sprint:coordination', async (message) => {
  const event = JSON.parse(message);

  if (event.type === 'interface:published' &&
      ['sprint-1', 'sprint-2', 'sprint-3'].includes(event.sprintId)) {

    // Record dependency satisfaction
    await redis.set(`cfn:dependency:sprint-4:${event.sprintId}`, 'satisfied');

    // Check if all dependencies satisfied
    const deps = await Promise.all([
      redis.get('cfn:dependency:sprint-4:sprint-1'),
      redis.get('cfn:dependency:sprint-4:sprint-2'),
      redis.get('cfn:dependency:sprint-4:sprint-3')
    ]);

    if (deps.every(d => d === 'satisfied')) {
      // All dependencies ready - start Sprint 4
      await startSprint4();
    }
  }
});

// Productive waiting - work on independent tasks
while (!allDependenciesSatisfied) {
  await workOnIndependentTasks();
  await sleep(5000);
}
```

**Sprints 1-3 must publish when ready:**

```typescript
// Sprint 1 Coordinator publishes interface on completion
await redis.publish('sprint:coordination', JSON.stringify({
  type: 'interface:published',
  sprintId: 'sprint-1',
  interface: {
    exports: ['DependencyAnalyzer', 'DependencyGraph'],
    redisKeys: ['cfn:dependency:graph:*']
  },
  timestamp: Date.now()
}));
```

---

### 4. Agent Lifecycle Events

Coordinators MUST publish agent lifecycle events for monitoring and cleanup.

**Required Events:**

```typescript
// Agent spawned
await redis.publish('agent:lifecycle', JSON.stringify({
  type: 'agent:spawned',
  agentId: 'coder-1',
  coordinatorId: 'sprint-1-coordinator',
  sprintId: 'sprint-1',
  role: 'backend-dev',
  timestamp: Date.now()
}));

// Agent completed
await redis.publish('agent:lifecycle', JSON.stringify({
  type: 'agent:completed',
  agentId: 'coder-1',
  confidence: 0.85,
  deliverables: ['src/dependency-analyzer.ts'],
  timestamp: Date.now()
}));

// Agent failed
await redis.publish('agent:lifecycle', JSON.stringify({
  type: 'agent:failed',
  agentId: 'coder-1',
  error: 'Compilation error in dependency-analyzer.ts',
  timestamp: Date.now()
}));
```

---

### 5. Test Coordination Lock

When multiple sprints need to run tests, they MUST coordinate via test lock.

**Test Lock Protocol:**

```typescript
// Acquire test lock before running tests
const lockAcquired = await redis.set(
  'cfn:test:execution:lock',
  JSON.stringify({
    coordinatorId: 'sprint-2-coordinator',
    timestamp: Date.now(),
    pid: process.pid
  }),
  'NX',  // Only set if not exists
  'PX',  // Expiry in milliseconds
  900000 // 15 minutes TTL
);

if (lockAcquired) {
  // Run tests
  await runTests();

  // Release lock
  await redis.del('cfn:test:execution:lock');

  // Publish completion
  await redis.publish('test:coordination', JSON.stringify({
    type: 'test:complete',
    sprintId: 'sprint-2',
    results: { passed: 45, failed: 0 }
  }));
} else {
  // Join queue
  await redis.zadd('cfn:test:queue', Date.now(), 'sprint-2-coordinator');

  // Wait for lock
  await waitForTestLock();
}
```

---

## Coordinator Spawn Template

When spawning coordinators for CFN Loop epics, use this template:

```typescript
Task('coordinator', `Execute Sprint ${sprintId}: ${sprintName}

**Redis Pub/Sub Communication (MANDATORY)**:

1. **Subscribe to coordination channel on startup**:
   \`\`\`bash
   redis-cli SUBSCRIBE sprint:coordination
   redis-cli SUBSCRIBE agent:lifecycle
   redis-cli SUBSCRIBE interface:ready
   \`\`\`

2. **Publish sprint start event**:
   \`\`\`bash
   redis-cli PUBLISH sprint:coordination '{
     "type": "sprint:start",
     "sprintId": "${sprintId}",
     "coordinatorId": "coordinator-${sprintId}",
     "dependencies": ${JSON.stringify(dependencies)},
     "timestamp": '$(date +%s)000'
   }'
   \`\`\`

3. **For dependent sprints - Wait for dependencies**:
   ${dependencies.length > 0 ? `
   Subscribe to dependency completion events:
   \`\`\`typescript
   const unsatisfiedDeps = new Set(${JSON.stringify(dependencies)});

   redis.subscribe('sprint:coordination', (message) => {
     const event = JSON.parse(message);
     if (event.type === 'interface:published' &&
         unsatisfiedDeps.has(event.sprintId)) {
       unsatisfiedDeps.delete(event.sprintId);

       if (unsatisfiedDeps.size === 0) {
         // All dependencies satisfied - start work
         startImplementation();
       }
     }
   });
   \`\`\`

   While waiting, work on independent tasks:
   - Create mocks for dependency interfaces
   - Write tests that will use real implementations later
   - Setup infrastructure and configuration
   ` : 'No dependencies - start immediately'}

4. **Spawn Loop 3 agents with lifecycle tracking**:
   \`\`\`typescript
   for (const agent of agents) {
     await Task(agent.type, agent.prompt);

     // Publish spawn event
     await redis.publish('agent:lifecycle', JSON.stringify({
       type: 'agent:spawned',
       agentId: agent.id,
       sprintId: '${sprintId}',
       timestamp: Date.now()
     }));
   }
   \`\`\`

5. **Coordinate test execution**:
   \`\`\`typescript
   // Acquire test lock
   const lockKey = 'cfn:test:execution:lock';
   const acquired = await redis.set(lockKey, coordinatorId, 'NX', 'PX', 900000);

   if (!acquired) {
     // Join queue and wait
     await redis.zadd('cfn:test:queue', Date.now(), coordinatorId);
     await waitForTestLock();
   }

   // Run tests
   await runTests();

   // Release lock
   await redis.del(lockKey);
   \`\`\`

6. **Publish interface when deliverables ready**:
   \`\`\`bash
   redis-cli PUBLISH sprint:coordination '{
     "type": "interface:published",
     "sprintId": "${sprintId}",
     "interface": {
       "exports": ["Dependency Analyzer", "DependencyGraph"],
       "redisKeys": ["cfn:dependency:*"]
     },
     "timestamp": '$(date +%s)000'
   }'
   \`\`\`

7. **Spawn Loop 2 validators**:
   \`\`\`typescript
   const validators = [
     Task('reviewer', 'Validate Sprint ${sprintId}...'),
     Task('security-specialist', 'Security audit Sprint ${sprintId}...'),
     Task('system-architect', 'Architecture review Sprint ${sprintId}...')
   ];
   \`\`\`

8. **Publish sprint completion**:
   \`\`\`bash
   redis-cli PUBLISH sprint:coordination '{
     "type": "sprint:complete",
     "sprintId": "${sprintId}",
     "consensus": 0.91,
     "decision": "DEFER",
     "timestamp": '$(date +%s)000'
   }'
   \`\`\`

**Deliverables**: ${deliverables.join(', ')}

**Quality Gates**:
- Loop 3 confidence: ≥0.75 per agent
- Loop 2 consensus: ≥0.90
- All deliverables created

Execute autonomously through all CFN loops.
`, 'coordinator');
```

---

## Post-Edit Hook Integration

Agents MUST run post-edit hooks after file creation:

```typescript
// After creating/editing file
await Bash('node config/hooks/post-edit-pipeline.js "src/dependency-analyzer.ts" --memory-key "swarm/sprint-1/coder-1"');
```

**Note**: Post-edit hook now logs to `.artifacts/logs/post-edit-pipeline.log` (fixed 2025-10-11)

---

## Memory Database Requirements

### Current State
- All `*.db` and `*.sqlite` files are gitignored
- Memory databases exist but aren't committed
- No secret sanitization before storage

### Requirements for Ungitignoring Databases

**1. Secret Detection & Prevention**:

```typescript
// Before storing in SQLite/Redis
function sanitizeForStorage(data: any): any {
  const secrets = [
    /api[_-]?key/i,
    /password/i,
    /secret/i,
    /token/i,
    /auth/i,
    /credential/i
  ];

  const serialized = JSON.stringify(data);

  for (const pattern of secrets) {
    if (pattern.test(serialized)) {
      throw new Error(`Cannot store data containing secrets: ${pattern}`);
    }
  }

  return data;
}

// Example usage
await sqlite.run(
  'INSERT INTO memory_entries (...) VALUES (...)',
  [sanitizeForStorage(content)]
);
```

**2. Allowlist for Database Commits**:

Update `.gitignore`:
```bash
# Block all databases by default
*.db
*.sqlite
*.db-journal

# Allow specific project databases
!.artifacts/database/swarm-memory.db
!.artifacts/database/coordination-state.db
!memory/project-context.db

# Still block user-specific/temporary databases
**/*-temp.db
**/*-cache.db
```

**3. Pre-commit Hook**:

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash

# Scan SQLite databases for secrets before commit
for db in $(git diff --cached --name-only --diff-filter=ACM | grep '\.db$\|\.sqlite$'); do
  echo "Scanning $db for secrets..."

  # Use sqlite3 to dump and scan content
  if sqlite3 "$db" ".dump" | grep -iE 'api[_-]?key|password|secret|token|ZAI_API_KEY'; then
    echo "❌ ERROR: Found potential secrets in $db"
    echo "Please remove secrets before committing database files"
    exit 1
  fi
done

echo "✅ Database secret scan passed"
```

---

## Validation Checklist

### For Epic Execution

- [ ] Coordinators subscribe to `sprint:coordination` on startup
- [ ] Sprint start/complete events published to Redis
- [ ] Agent lifecycle events published (spawn, complete, fail)
- [ ] Test coordination uses lock protocol
- [ ] Dependency waiting with productive work
- [ ] Interface publishing when deliverables ready
- [ ] Claim/confirmation protocol for parallel work distribution
- [ ] Post-edit hooks run after file creation
- [ ] All coordination logged to Redis with timestamps
- [ ] Loop 2 validators spawned and achieve consensus
- [ ] Loop 4 Product Owner makes GOAP decision

### For Memory Databases

- [ ] Secret detection runs before storage
- [ ] Allowlist in .gitignore for project databases
- [ ] Pre-commit hook scans databases for secrets
- [ ] SQLite memory uses ACL levels (private/agent/swarm/project/team/system)
- [ ] Audit trail for all database writes
- [ ] Database file size monitored (<10MB warning, <50MB critical)

---

## Example: Complete Sprint Coordinator Prompt

See `tests/hello-world/hello-world-mesh-coordination-test.md` Lines 82-96 for complete example of coordinator spawn with explicit instructions.

**Key Elements**:
1. Redis pub/sub subscription setup
2. Claim/confirmation protocol
3. Agent spawn with direct assignment (not Redis pre-assignment)
4. Status reporting back to Redis
5. Coordination message logging
6. Timeline tracking

---

## Next Steps

1. **Update coordinator spawn templates** in epic orchestration code
2. **Add Redis pub/sub to all coordinator agents** spawned via `/cfn-loop-epic`
3. **Implement secret detection** in SQLite memory manager
4. **Update .gitignore** with allowlist for project databases
5. **Create pre-commit hook** for database secret scanning
6. **Add coordination validation** to epic completion reports

---

**Document Version**: 1.0
**Last Updated**: 2025-10-11
**Author**: CFN Loop Analysis Team
**Status**: Ready for Implementation
