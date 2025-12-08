Usage Guides and Patterns

Consolidated usage patterns, procedures, and best practices from docs/guides/.

Quick Start

Installation and basic setup:
npm install claude-flow-novice
npm run init:database -- --name primary
npm run start:services

Verify services:
curl http://localhost:8000/health  # Coordination Manager
curl http://localhost:8001/health  # Database Service

Essential Patterns

1. Database Operations
// Register schema
await databaseService.registerSchema({
  schema_id: "users-v1",
  fields: [
    {name: "id", type: "string", required: true},
    {name: "email", type: "string", required: true},
    {name: "status", type: "enum", enum_values: ["active", "inactive"]}
  ]
});

// Query with caching
const response = await databaseService.query({
  correlation_key: `query-${Date.now()}`,
  operation: "select",
  table: "users",
  filters: {status: "active"},
  options: {cache_ttl_seconds: 300}
});

2. Agent Coordination
// Wait for signal
await coordinationManager.wait({
  agent_id: "agent-1",
  topic: "task:ready",
  timeout_seconds: 60
});

// Broadcast signal
await coordinationManager.broadcastSignal({
  topic: "task:complete",
  message: {status: "done", timestamp: new Date().toISOString()}
});

3. Artifact Storage
// Store artifact
await artifactStorage.storeArtifact({
  artifact_name: "report",
  content: "# Analysis\nResults...",
  format: "markdown",
  metadata: {tags: ["important"]}
});

// Retrieve artifact
const artifact = await artifactStorage.retrieveArtifact({
  artifact_name: "report",
  version: "latest"
});

4. Transaction Management
const txn = await transactionManager.beginTransaction({
  transaction_type: "write",
  databases: ["primary"]
});

try {
  await txn.query({operation: "update", table: "users", ...});
  await txn.query({operation: "insert", table: "audit", ...});
  await txn.commit();
} catch (error) {
  await txn.rollback();
}

CFN Loop Execution

CLI Mode (Production)
/cfn-loop-cli "Implement user authentication" --mode=standard --provider=kimi

Task Mode (Debugging)
/cfn-loop-task "Fix login bug" --mode=standard

Agent Types

Type           Purpose                Example Tasks
backend-developer  Server-side code    REST APIs, database schemas
frontend-developer UI/UX code          React components, CSS
tester             Test creation       Unit tests, integration tests
validator          Code review         Quality assessment
product-owner      Decisions           Accept/reject work
devops-specialist  Infrastructure      Docker, CI/CD
security-specialist Security           Vulnerability scanning

Provider Routing

Configure providers:
export CFN_CUSTOM_ROUTING=true
/cfn-loop-cli "Task" --provider=kimi  # Balanced quality/cost
/cfn-loop-cli "Task" --provider=zai   # Cost optimized
/cfn-loop-cli "Task" --provider=max   # Premium quality

Error Handling Patterns

Database Issues
try {
  const response = await databaseService.query({...});
  if (response.status !== "success") {
    console.error("Query failed:", response.errors);
  }
} catch (error) {
  console.error("System error:", error);
}

Coordination Timeouts
- Check Redis: redis-cli ping
- Monitor pub/sub: redis-cli SUBSCRIBE "task:*"
- Increase timeout if agents are slow

Common Commands

Task                    Command
Start services          npm run start:services
List schemas            npm run list:schemas
Health check            curl http://localhost:8000/health
View logs               tail -f /var/log/cfn/error.log
Run tests               npm test

Skill Development

Create skill file:
#!/bin/bash
# SKILL_NAME: "analyze-data"
# OUTPUT_FORMAT: "json"
set -euo pipefail

# Process data
LINE_COUNT=$(wc -l < "$DATA_PATH")

# Return JSON
cat <<EOF
{
  "status": "success",
  "result": {"lines": $LINE_COUNT}
}
EOF

Execute skill:
const response = await skillDeployment.executeSkill({
  skill_name: "analyze-data",
  environment: {DATA_PATH: "/data/file.txt"},
  timeout_seconds: 30
});

Troubleshooting Checklist

- Services running? Check ports 8000/8001
- Redis accessible? redis-cli ping
- Database file exists? ls -la /data/
- Schema registered? Check schema list
- Agent timeouts? Verify network connectivity