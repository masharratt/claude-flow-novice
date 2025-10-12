# CFN Loop Modes Reference

## Overview

CFN Loop supports three operational modes optimized for different project needs. Each mode adapts quality gates, team structures, and iteration limits to balance speed vs quality.

## Mode Comparison

| Feature | MVP | Standard | Enterprise |
|---------|-----|----------|------------|
| **Best For** | Prototypes, MVPs, hackathons | General features, bug fixes | Production systems, compliance |
| **Gate Threshold** | ≥0.70 | ≥0.75 | ≥0.75 |
| **Consensus Threshold** | ≥0.80 | ≥0.90 | ≥0.95 |
| **Max Iterations (Loop 3)** | 5 | 10 | 15 |
| **Max Iterations (Loop 2)** | 5 | 10 | 15 |
| **Validators** | 2 (reviewer, security) | 4 (all validations) | 4 (all validations) |
| **Product Owner** | Single agent | Single agent | 4-person board |
| **Loop 0.5 Planning** | No | No | Yes (≥0.85 consensus) |
| **A11y Validation** | Skipped | Included | Included |
| **Performance Testing** | Skipped | Included | Included |
| **Security Depth** | Basic | Standard | Deep |

## MVP Mode

### Purpose

Ship fast for prototypes, MVPs, and proof-of-concepts where speed matters more than production quality.

### Configuration

```typescript
{
  gateThreshold: 0.70,
  consensusThreshold: 0.80,
  maxLoop3Iterations: 5,
  maxLoop2Iterations: 5,
  validatorCount: 2,
  validatorTypes: ['reviewer', 'security-specialist'],
  productOwnerType: 'single',
  planningConsensus: false,
  skipValidations: ['accessibility', 'performance']
}
```

### Usage

```bash
# Explicit MVP mode
/cfn-loop "Build authentication MVP" --mode=mvp

# Auto-detect from filename
/parse-epic ./auth-mvp.json --cfn-mode=auto
```

### Validator Team

- **Reviewer**: Code quality, basic testing
- **Security Specialist**: Critical security vulnerabilities only

### Decision Criteria

Stored in `/mnt/c/Users/masha/Documents/claude-flow-novice/config/cfn-loop/mvp-criteria.json`:

```json
{
  "gateThreshold": 0.70,
  "consensusThreshold": 0.80,
  "validations": {
    "security": "critical-only",
    "performance": "skip",
    "accessibility": "skip",
    "testing": "basic"
  },
  "decisionWeights": {
    "speed": 0.60,
    "quality": 0.40
  }
}
```

### When to Use

✅ Prototyping new features
✅ Hackathons and time-boxed projects
✅ Internal tools with limited users
✅ MVP validation before full build
✅ Research and experimentation

❌ Production systems
❌ Public-facing applications
❌ Compliance-regulated features
❌ Security-critical components

## Standard Mode

### Purpose

Balanced quality and speed for general feature development. Default mode for most projects.

### Configuration

```typescript
{
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  maxLoop3Iterations: 10,
  maxLoop2Iterations: 10,
  validatorCount: 4,
  validatorTypes: ['reviewer', 'tester', 'security-specialist', 'accessibility-specialist'],
  productOwnerType: 'single',
  planningConsensus: false,
  skipValidations: []
}
```

### Usage

```bash
# Explicit standard mode (default)
/cfn-loop "Implement user profile feature"

# Standard mode is default
/cfn-loop "Add payment processing" --mode=standard
```

### Validator Team

- **Reviewer**: Code quality, architecture
- **Tester**: Test coverage, E2E testing
- **Security Specialist**: Security vulnerabilities
- **Accessibility Specialist**: WCAG compliance

### Decision Criteria

Default CFN Loop behavior with balanced quality gates.

### When to Use

✅ General feature development
✅ Bug fixes and enhancements
✅ Refactoring and optimization
✅ API development
✅ Most production work

## Enterprise Mode

### Purpose

Maximum quality for production systems, compliance requirements, and mission-critical features. Includes Loop 0.5 planning consensus and 4-person product owner board.

### Configuration

```typescript
{
  gateThreshold: 0.75,
  consensusThreshold: 0.95,
  maxLoop3Iterations: 15,
  maxLoop2Iterations: 15,
  validatorCount: 4,
  validatorTypes: ['reviewer', 'tester', 'security-specialist', 'accessibility-specialist'],
  productOwnerType: 'board',
  planningConsensus: true,
  planningThreshold: 0.85,
  skipValidations: []
}
```

### Usage

```bash
# Explicit enterprise mode
/cfn-loop "Production API with compliance" --mode=enterprise

# Auto-detect from filename
/parse-epic ./platform-enterprise.json --cfn-mode=auto
```

### Loop 0.5 Planning Consensus

**When**: Runs BEFORE Loop 3 implementation

**Who**: 3 architects vote on design
- System Architect (33.3% weight)
- Security Architect (33.3% weight)
- API Designer (33.3% weight)

**Process**:
1. Spawn 3 architects from `.claude/agents/planning-team/`
2. Design debate via Redis pub/sub (10-15 min)
3. Vote on ADRs and system diagrams
4. Require ≥0.85 consensus to proceed
5. Store design spec in SQLite at `cfn/phase-{id}/loop0.5/design`
6. Loop 3 implementers follow approved design

**Benefit**: Reduces Loop 3 rework by 30-40%

**Memory Pattern**:
```bash
# Architects store planning results
/sqlite-memory store --key "cfn/phase-auth/loop0.5/design" --level project --data '{
  "adr": "ADR-001: Use OAuth 2.0 with PKCE",
  "diagram": "https://...",
  "consensus": 0.87,
  "votes": [0.85, 0.90, 0.85]
}'

# Loop 3 implementers read planning results
/sqlite-memory retrieve --key "cfn/phase-auth/loop0.5/design" --level project
```

### Validator Team

Same as Standard mode (all 4 validators), but with stricter consensus threshold (0.95).

### 4-Person Product Owner Board

**When**: Runs in Loop 4 after consensus validation

**Who**: 4 personas with weighted voting
- CTO Agent (30% weight)
- Product Owner Agent (30% weight)
- Power User Persona (20% weight)
- Accessibility Advocate Persona (20% weight)

**Decision Algorithm**:
```typescript
const finalDecision =
  (ctoVote * 0.30) +
  (poVote * 0.30) +
  (powerUserVote * 0.20) +
  (a11yVote * 0.20);

if (maxVote - minVote > 0.15) {
  spawnFacilitator(); // Negotiate compromise
}
```

**Output**: PROCEED/DEFER/ESCALATE with dissenting opinions documented

**Personas**:
- `.claude/agents/product-owner-team/cto-agent.md`
- `.claude/agents/product-owner-team/product-owner-agent.md`
- `.claude/agents/product-owner-team/power-user-persona.md`
- `.claude/agents/product-owner-team/accessibility-advocate-persona.md`

### Decision Criteria

Stored in `/mnt/c/Users/masha/Documents/claude-flow-novice/config/cfn-loop/enterprise-criteria.json`:

```json
{
  "gateThreshold": 0.75,
  "consensusThreshold": 0.95,
  "planningThreshold": 0.85,
  "validations": {
    "security": "deep-scan",
    "performance": "load-testing",
    "accessibility": "wcag-2.1-aa",
    "testing": "comprehensive"
  },
  "decisionWeights": {
    "quality": 0.60,
    "speed": 0.20,
    "compliance": 0.20
  }
}
```

### When to Use

✅ Production systems
✅ Public-facing applications
✅ Compliance-regulated features (GDPR, SOC2, HIPAA)
✅ Security-critical components
✅ Financial transactions
✅ Healthcare data processing
✅ Mission-critical infrastructure

## Mode Selection Strategies

### Explicit Selection

Use `--mode` flag to explicitly choose mode:

```bash
/cfn-loop "Task" --mode=mvp
/cfn-loop "Task" --mode=standard
/cfn-loop "Task" --mode=enterprise
```

### Auto-Detection

Use `--cfn-mode=auto` with `/parse-epic` to infer from filename:

```bash
# Detects MVP mode
/parse-epic ./feature-mvp.json --cfn-mode=auto

# Detects Enterprise mode
/parse-epic ./platform-enterprise.json --cfn-mode=auto

# Defaults to Standard mode
/parse-epic ./feature.json --cfn-mode=auto
```

**Detection Rules**:
- Filename ends with `-mvp` → MVP mode
- Filename ends with `-enterprise` → Enterprise mode
- Otherwise → Standard mode

### Environment-Based Selection

Configure default mode in project config:

```json
{
  "cfn": {
    "defaultMode": "enterprise",
    "allowModeOverride": true
  }
}
```

## Mode Switching

### Mid-Project Mode Changes

NOT recommended. Mode changes require re-running validation:

```bash
# Phase 1 with MVP mode
/cfn-loop "Build prototype" --mode=mvp

# Phase 2 upgrade to Enterprise mode (re-validates Phase 1)
/cfn-loop "Production hardening" --mode=enterprise --validate-previous
```

### Progressive Quality Gates

Recommended: Start with MVP, graduate to Enterprise:

```bash
# Sprint 1: MVP validation
/cfn-loop-sprints "MVP validation" --mode=mvp

# Sprint 2: Production hardening
/cfn-loop-sprints "Production build" --mode=enterprise
```

## Performance Impact

### Execution Time Estimates

| Mode | Loop 3 Time | Loop 2 Time | Loop 0.5 Time | Total Time |
|------|-------------|-------------|---------------|------------|
| **MVP** | 5-10 min | 3-5 min | N/A | 8-15 min |
| **Standard** | 10-20 min | 5-10 min | N/A | 15-30 min |
| **Enterprise** | 15-30 min | 10-15 min | 10-15 min | 35-60 min |

*Times vary based on task complexity and agent count*

### Resource Usage

| Mode | Avg Agents | Peak Agents | Redis Memory | SQLite Size |
|------|-----------|-------------|--------------|-------------|
| **MVP** | 5-8 | 10 | 50-100 MB | 10-20 MB |
| **Standard** | 8-12 | 15 | 100-200 MB | 20-50 MB |
| **Enterprise** | 12-20 | 25 | 200-400 MB | 50-100 MB |

## Redis Coordination

### Mode Storage

Mode stored in Redis for swarm coordination:

```bash
# Store mode
redis-cli setex "cfn:mode:phase-auth" 3600 "enterprise"

# Retrieve mode
redis-cli get "cfn:mode:phase-auth"
# Output: "enterprise"
```

### Agent Access

Agents read mode to adapt behavior:

```typescript
const mode = await redis.get(`cfn:mode:${phaseId}`);

if (mode === 'mvp') {
  skipPerformanceTesting();
  useBasicSecurityScan();
} else if (mode === 'enterprise') {
  enableLoop0_5Planning();
  useMultiStakeholderBoard();
}
```

## SQLite Memory Patterns

### Loop 0.5 Planning Results

```bash
# Store planning consensus (Enterprise only)
/sqlite-memory store \
  --key "cfn/phase-auth/loop0.5/design" \
  --level project \
  --data '{"adr":"ADR-001","consensus":0.87}'
```

### Product Owner Board Decisions

```bash
# Store board decision (Enterprise only)
/sqlite-memory store \
  --key "cfn/phase-auth/loop4/decision" \
  --level project \
  --data '{
    "decision": "DEFER",
    "votes": [0.92, 0.88, 0.85, 0.90],
    "dissent": "A11y advocate requested contrast improvements"
  }'
```

## Troubleshooting

### Mode Not Applied

**Symptom**: Mode flag ignored, defaults to Standard

**Solution**:
1. Check Redis connection: `redis-cli ping`
2. Verify mode key: `redis-cli get "cfn:mode:{phaseId}"`
3. Check CLI version: `npx claude-flow-novice --version`

### Loop 0.5 Not Running

**Symptom**: Enterprise mode but no planning consensus

**Solution**:
1. Verify mode: `redis-cli get "cfn:mode:{phaseId}"` should be "enterprise"
2. Check personas exist: `ls .claude/agents/planning-team/`
3. Check SQLite ACL: `/sqlite-memory retrieve --key "cfn/phase-{id}/loop0.5/*"`

### Board Decision Timeout

**Symptom**: 4-person board takes >30 minutes

**Solution**:
1. Check facilitator spawn: Disagreement >0.15 requires facilitator
2. Verify board personas: `ls .claude/agents/product-owner-team/`
3. Increase timeout: `--timeout 1800` (30 min)

## Migration Guide

### Upgrading from Legacy CFN Loop

**Before** (pre-modes):
```bash
/cfn-loop "Task" --threshold 0.85 --max-iterations 5
```

**After** (with modes):
```bash
/cfn-loop "Task" --mode=mvp  # Automatically sets threshold and iterations
```

### Converting Existing Epics

**Step 1**: Audit epic complexity
```bash
# High complexity → Enterprise
# Medium complexity → Standard
# Low complexity → MVP
```

**Step 2**: Rename files for auto-detection
```bash
mv auth.json auth-enterprise.json  # Production system
mv prototype.json prototype-mvp.json  # MVP
```

**Step 3**: Re-run with mode
```bash
/parse-epic ./auth-enterprise.json --cfn-mode=auto
```

## Best Practices

### Mode Selection Guidelines

1. **Start with MVP** for new features (validate concept)
2. **Graduate to Standard** for production implementation
3. **Use Enterprise** for security/compliance requirements

### When to Override Defaults

```bash
# Lower consensus for experimental features
/cfn-loop "Experimental feature" --mode=enterprise --threshold 0.85

# Increase iterations for complex refactors
/cfn-loop "Database migration" --mode=standard --max-iterations 15
```

### Monitoring Mode Effectiveness

Track metrics to optimize mode selection:

```bash
# CFN Loop completion rates by mode
/dashboard insights --metric completion-rate --group-by mode

# Average iteration counts by mode
/dashboard insights --metric avg-iterations --group-by mode
```

## Related Documentation

- [CFN Loop Overview](../CLAUDE.md#4-cfn-loop-single-section)
- [Slash Commands](./logs-slash-commands.md#cfn-loop-commands)
- [Features](./logs-features.md#cfn-loop-modes)
- [Product Owner Team Personas](../.claude/agents/product-owner-team/)
- [Planning Team Personas](../.claude/agents/planning-team/)
- [SQLite Memory Management](./logs-features.md#sqlite-memory-management)
