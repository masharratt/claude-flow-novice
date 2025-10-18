# CFN Coordinator Profiles

This directory contains three specialized CFN coordinator profiles for different development scenarios and quality requirements.

## Available Coordinators

### 1. MVP Coordinator (`cfn-coordinator-mvp.md`)
**Purpose**: Rapid development for prototypes and early-stage projects
- **Gate Threshold**: 0.70 (lowered for speed)
- **Consensus Threshold**: 0.80 (simplified validation)
- **Validators**: 2 (minimal but effective)
- **Max Workers**: 3
- **Max Iterations**: 5
- **Focus**: Speed > Completeness
- **Cost**: ~$0.30/phase (97% savings)

**Use Cases**:
- Proof of concepts
- MVP development
- Rapid prototyping
- Early-stage projects
- Startup development

### 2. Standard Coordinator (`cfn-coordinator-standard.md`)
**Purpose**: Balanced approach for production-ready applications
- **Gate Threshold**: 0.75 (standard quality)
- **Consensus Threshold**: 0.90 (strong validation)
- **Validators**: 4 (comprehensive review)
- **Max Workers**: 5
- **Max Iterations**: 10
- **Focus**: Quality + Speed Balance
- **Cost**: ~$0.50/phase (97% savings)

**Use Cases**:
- Production applications
- Established projects
- Team collaboration
- Standard software development
- Quality-focused delivery

### 3. Enterprise Coordinator (`cfn-coordinator-enterprise.md`)
**Purpose**: Mission-critical applications with maximum quality and compliance
- **Gate Threshold**: 0.75 (high quality)
- **Consensus Threshold**: 0.95 (near-unanimous agreement)
- **Validators**: 4 + 4-person board (comprehensive governance)
- **Max Workers**: 6
- **Max Iterations**: 15
- **Focus**: Maximum Quality & Compliance
- **Cost**: ~$0.80/phase (97% savings)

**Use Cases**:
- Enterprise applications
- Regulated industries (finance, healthcare)
- Mission-critical systems
- High-stakes projects
- Compliance-required development

## Common Features

All coordinators include:

### Full Loop 1 Orchestration
- **Loop 3**: Implementation with CLI spawning via `spawn-workers.js`
- **Loop 2**: Validation with mode-specific validator counts
- **Loop 4**: Product Owner decision with auto-proceed logic
- **Repeating Pattern**: Loop 3→2→4 per phase until complete

### CLI Spawning Integration
```bash
# MVP
node src/cli/hybrid-routing/spawn-workers.js \
  "MVP: [task description]" \
  --max-agents 3 --provider zai --redis-channel swarm:mvp-{phase}

# Standard  
node src/cli/hybrid-routing/spawn-workers.js \
  "Standard: [task description]" \
  --max-agents 5 --provider zai --redis-channel swarm:standard-{phase}

# Enterprise
node src/cli/hybrid-routing/spawn-workers.js \
  "Enterprise: [task description]" \
  --max-agents 6 --provider zai --redis-channel swarm:enterprise-{phase}
```

### Auto-Inject Mode Instructions
After each Loop 4 PROCEED decision, coordinators automatically inject mode-specific instructions for the next phase, maintaining consistency throughout the project.

### Return-to-Chat Triggers
All coordinators return to chat when:
- Human decision is requested
- Sprint is complete
- Critical issues require escalation

### Telemetry Templates
Each coordinator includes comprehensive telemetry templates for:
- Phase performance metrics
- Quality scores and validation results
- Cost analysis and savings calculations
- Sprint summaries and velocity tracking

### SQLite Integration
All coordinators persist coordination state with ACL Level 3:
- Phase configurations and results
- Telemetry and quality metrics
- Sprint summaries and governance records
- Audit trails for compliance

## Cost Optimization

All coordinators achieve 97% cost savings through:
- **Coordinator**: $0 (Claude Max subscription)
- **Workers**: $0.50/1M tokens (z.ai provider)
- **Typical Phase**: $0.30-$0.80 (vs $15-30 pure Claude)

## Quality Progression

| Metric | MVP | Standard | Enterprise |
|--------|-----|----------|------------|
| Gate Threshold | 0.70 | 0.75 | 0.75 |
| Consensus | 0.80 | 0.90 | 0.95 |
| Validators | 2 | 4 | 4 + Board |
| Test Coverage | 60-70% | 80-90% | 95%+ |
| Documentation | Inline only | Comprehensive | Complete |
| Security | Basic | Thorough | Zero-trust |
| Compliance | Minimal | Standard | Full certification |

## Usage Instructions

1. **Select the appropriate coordinator** based on your project requirements
2. **Copy the coordinator profile** to your agents directory
3. **Configure your environment** with the coordinator settings
4. **Use the provided CLI commands** for worker spawning
5. **Monitor progress** through Redis events and telemetry
6. **Review auto-injected instructions** after each phase completion

## Enterprise Spawner

For enterprise-grade worker coordination, use the enhanced `spawn-workers-enterprise.js`:
- Supports up to 6 workers
- Extended 45-minute timeout
- Comprehensive logging and telemetry
- Enterprise monitoring and alerting
- Enhanced error handling and recovery

## Integration Examples

Each coordinator includes complete workflow examples showing:
- Task decomposition patterns
- Worker assignment strategies
- Validation criteria and processes
- Decision logic and triggers
- Return-to-chat scenarios
- Telemetry and reporting formats

## Success Metrics

- **MVP**: >85% phase completion, <2 days to demo
- **Standard**: >95% phase completion, 1-2 weeks to production
- **Enterprise**: >98% phase completion, 2-4 weeks to production

All modes maintain 97% cost savings while delivering appropriate quality levels for their target use cases.