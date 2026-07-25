# Additional Claude Flow Commands (v2)

Specialized commands for advanced development workflows, complex system management, and enterprise-scale operations.

## CFN-* CLI Commands (v2.0.0)

Complete CLI suite for claude-flow-novice operations.

### cfn-spawn - Agent Spawning

**Purpose**: Spawn agents with task context

**Signature**: `cfn-spawn agent <type> [options]`

**Options**:
- `--task-id` - Task identifier
- `--iteration` - Iteration number
- `--context` - Context description
- `--mode` - Execution mode (mvp/standard/enterprise)

**Example**:
```bash
cfn-spawn agent coder --task-id auth-impl --iteration 1
cfn-spawn researcher --context "API performance"
```

### cfn-loop - CFN Loop Orchestration

**Purpose**: Execute CFN Loop workflows

**Subcommands**: single, epic, sprints

**Examples**:
```bash
cfn-loop single "Implement JWT authentication" --mode=standard
cfn-loop epic "Build complete auth system"
cfn-loop sprints "Phase 1: Core implementation" --phase=phase-1
```

### cfn-swarm - Swarm Coordination

**Purpose**: Initialize and manage agent swarms

**Subcommands**: init, status, shutdown

**Examples**:
```bash
cfn-swarm init mesh --max-agents 5 --strategy balanced
cfn-swarm status
cfn-swarm shutdown --task-id task-123
```

### cfn-portal - Web Portal Management

**Purpose**: Manage web portal for swarm visibility

**Subcommands**: start, stop, status, agents, metrics, events

**Examples**:
```bash
cfn-portal start --port 3000
cfn-portal agents --status active
cfn-portal events --limit 100
```

### cfn-context - ACE Context Operations

**Purpose**: Adaptive Context Engine operations

**Subcommands**: reflect, curate, inject, query, stats

**Examples**:
```bash
cfn-context query "redis coordination" --category technical
cfn-context stats
cfn-context inject --phase implementation
```

### cfn-metrics - Monitoring and Analytics

**Purpose**: Monitor agent and system performance

**Subcommands**: agent, consensus, fleet

**Examples**:
```bash
cfn-metrics agent --agent-id coder-1 --period 1h
cfn-metrics consensus --task-id task-123
cfn-metrics fleet
```

### cfn-redis - Redis Coordination Helpers

**Purpose**: Redis coordination patterns and waiting mode

**Subcommands**: pattern, waiting-mode, event

**Examples**:
```bash
cfn-redis pattern mesh-hybrid --task-id task-123
cfn-redis waiting-mode --task-id task-123 --agent-id coder-1 --action enter
cfn-redis event
```

## Skills-First Coordination Commands

### `/swarm`
**Purpose**: Spawn and coordinate multi-agent workflows with Redis integration

**Parameters:**
- `--skills`: Redis coordination skills to activate
- `--strategy`: Agent coordination strategy
- `--mode`: Swarm execution mode

**Example:**
```bash
npx claude-flow-novice swarm "Implement authentication" \
  --skills=redis-coordination,agent-spawning \
  --strategy development
```

### `/sparc`
**Purpose**: Execute systematic specification, architecture, refinement, and completion workflows

**Phases:**
- `analysis`
- `design`
- `refine`
- `complete`

**Example:**
```bash
# SPARC workflow for database performance
/sparc analysis "Database performance issues"
/sparc design "Microservices architecture"
/sparc refine "API optimization"
```

## Cost-Optimized Agent Spawning

### Hybrid Routing Modes

1. **Automatic Selection**
```bash
# Keyword-based agent matching
node src/cli/hybrid-routing/spawn-workers.js "Build auth system" --max-agents=3
```

2. **Coordinator Override**
```bash
# Manual agent type specification
node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \
  --agents=architect,coder,reviewer
```

3. **Full Override**
```bash
# Complete agent and subtask control
node src/cli/hybrid-routing/spawn-workers.js "OAuth2 security" \
  --agents=coder,security-specialist \
  --subtasks="Implement OAuth2,Audit token security"
```

## n8n Workflow Deployment

Deploy n8n workflows as MCP servers for platform integrations.

### Workflow Structure

**Webhook Trigger Node**:
- HTTP POST endpoint
- Authentication: X-N8N-API-KEY header
- JSON request body

**Platform Integration Nodes**:
- API authentication (OAuth, API keys)
- Data transformation
- Error handling (4xx, 5xx responses)

**Response Node**:
- JSON success response
- HTTP status codes (200, 400, 401, 404, 429, 500)

### CFN Skill Integration

**Bash Script Pattern** (`.claude/skills/*/operations/*.sh`):
```bash
#!/bin/bash
set -euo pipefail

# Environment validation
if [[ -z "${N8N_BASE_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
  echo '{"error": "Missing N8N environment variables"}' >&2
  exit 2
fi

# Build payload with jq
PAYLOAD=$(jq -n \
  --arg field "$VALUE" \
  '{field: $field}')

# Call webhook
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$N8N_BASE_URL/webhook/endpoint" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# Handle response
case "$HTTP_CODE" in
  200|201) echo "$BODY"; exit 0 ;;
  401) echo '{"error": "Authentication failed"}' >&2; exit 2 ;;
  429) echo '{"error": "Rate limit exceeded"}' >&2; exit 2 ;;
  000) echo '{"error": "Network error"}' >&2; exit 2 ;;
  *) echo '{"error": "API error"}' >&2; exit 2 ;;
esac
```

### Compliance Validation

**Exit Code 3 Pattern** (validation failures):
```bash
# Example: TCPA opt-in check
if [[ "$OPT_IN_STATUS" != "confirmed" ]]; then
  echo '{"error": "TCPA violation - no opt-in"}' >&2
  exit 3
fi

# Example: Budget threshold check
if (( $(echo "$AMOUNT > $BUDGET_LIMIT" | bc -l) )); then
  echo '{"error": "Budget exceeded"}' >&2
  exit 3
fi
```

**Exit Code Semantics**:
- `0`: Success
- `1`: Parameter/input errors
- `2`: API/network errors
- `3`: Validation/compliance failures

### Deployment Checklist

1. Create n8n workflow with webhook trigger
2. Configure platform authentication (OAuth, API keys)
3. Test webhook endpoint: `curl -X POST $N8N_BASE_URL/webhook/test`
4. Create CFN skill directory: `.claude/skills/cfn-{domain}-{function}/`
5. Write operation scripts following exit code pattern
6. Document in SKILL.md with operation descriptions
7. Add environment variable requirements to README

### Example Deployment

**Email Campaign Skill**:
- Workflow: `.claude/workflows/marketing-email-campaigns.json`
- Skill: `.claude/skills/cfn-marketing-email-campaigns/`
- Operations: `create-campaign.sh`, `send-email.sh`, `get-metrics.sh`, `manage-list.sh`
- Platforms: Mailchimp, SendGrid, HubSpot
- Webhooks: 4 endpoints (/webhook/email-*)

**Reference Implementation**: Phase 1-5 marketing infrastructure (12 workflows, 12 skills, 65 operations)

## Performance and Optimization

### WASM Performance Commands

```bash
# 40x Performance Optimization
/wasm initialize --memory-size 1GB --target 40x
/wasm optimize --code "./src/app.js"
/wasm benchmark --tests standard

# Validate performance improvements
claude-flow-novice validate:wasm-performance --target 40x
```

## Enterprise Coordination

### Fleet Management

```bash
# Initialize enterprise fleet
/fleet init --max-agents 1500 \
  --regions us-east-1,eu-west-1 \
  --efficiency-target 0.40

# Scale fleet dynamically
/fleet scale --fleet-id fleet-123 \
  --target-size 2000 \
  --strategy predictive
```

### Event Bus (10,000+ events/sec)

```bash
# High-throughput event management
/eventbus init --throughput-target 10000
/eventbus publish --type agent.lifecycle
/eventbus subscribe --pattern "agent.*"
```

## Compliance and Security

### Regulatory Validation

```bash
# Validate compliance standards
/compliance validate --standard GDPR \
  --scope data-privacy,user-rights \
  --detailed

# Generate audit reports
/compliance audit --period quarterly \
  --format pdf \
  --include-recommendations
```

## Monitoring and Diagnostics

### System Health

```bash
# Comprehensive system status
claude-flow-novice status --verbose

# Health check and validation
claude-flow-novice test:health
claude-flow-novice validate:phase-completion
```

### Debugging Tools

```bash
# Agent and hook debugging
claude-flow-novice debug agent_123 --verbose
claude-flow-novice debug:hooks --trace
```

## Testing and Quality Assurance

```bash
# Comprehensive test suite
claude-flow-novice test:comprehensive
claude-flow-novice test:coverage
claude-flow-novice validate:agents
```

## SDK and Integration

```bash
# SDK lifecycle management
claude-flow-novice sdk:enable
claude-flow-novice sdk:validate
claude-flow-novice sdk:test
```

## Best Practices

1. Use skills-first coordination
2. Leverage cost-optimized agent spawning
3. Monitor system performance
4. Validate compliance and security
5. Maintain comprehensive test coverage

Note: Always refer to the latest documentation for most up-to-date command syntax and capabilities.