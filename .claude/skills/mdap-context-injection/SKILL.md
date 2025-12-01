# MDAP Context Injection Skill

## Purpose

Injects full MDAP/Trigger workflow code context for troubleshooting. This skill reads and outputs the complete source files needed to understand and debug the MDAP (Massively Decomposed Agentic Processes) and non-MDAP Trigger.dev execution flows.

## Usage

```bash
# Inject all MDAP-related context
bash .claude/skills/mdap-context-injection/inject.sh --all

# Inject only coordinator flow
bash .claude/skills/mdap-context-injection/inject.sh --coordinator

# Inject only MDAP implementer
bash .claude/skills/mdap-context-injection/inject.sh --mdap

# Inject only CLI sprint implementer
bash .claude/skills/mdap-context-injection/inject.sh --cli

# Inject only configuration
bash .claude/skills/mdap-context-injection/inject.sh --config

# Inject only decomposers
bash .claude/skills/mdap-context-injection/inject.sh --decomposers

# Inject specific file by path
bash .claude/skills/mdap-context-injection/inject.sh --file docker/trigger-dev/src/trigger/cfn-coordinator.ts
```

## Included Files

### Core Flow (--all or --coordinator)
- `docker/trigger-dev/src/trigger/cfn-coordinator.ts` - Main 5-phase orchestration

### MDAP Mode (--all or --mdap)
- `docker/trigger-dev/src/trigger/cfn-mdap-implementer.ts` - Cerebras code generation
- `docker/trigger-dev/src/lib/mdap-config.ts` - Tier configuration
- `docker/trigger-dev/src/lib/mdap-atomicity.ts` - Atomicity analysis

### Non-MDAP Mode (--all or --cli)
- `docker/trigger-dev/src/trigger/cfn-cli-sprint-implementer.ts` - Claude CLI execution
- `docker/trigger-dev/src/lib/sprint-aggregator.ts` - Sprint grouping

### Configuration (--all or --config)
- `docker/trigger-dev/src/lib/mdap-config.ts` - Tier definitions
- `docker/trigger-dev/src/lib/sla-enforcement.ts` - SLA targets
- `docker/trigger-dev/src/lib/health-check.ts` - Health monitoring

### Decomposers (--all or --decomposers)
- `docker/trigger-dev/src/trigger/cfn-architecture-decomposer.ts`
- `docker/trigger-dev/src/trigger/cfn-security-decomposer.ts`
- `docker/trigger-dev/src/trigger/cfn-performance-decomposer.ts`
- `docker/trigger-dev/src/trigger/cfn-testing-decomposer.ts`

### Validators (--all or --validators)
- `docker/trigger-dev/src/trigger/cfn-async-validator-orchestrator.ts`
- `docker/trigger-dev/src/trigger/cfn-async-security-validator.ts`
- `docker/trigger-dev/src/trigger/cfn-async-performance-validator.ts`

## Output Format

Each file is output with clear delimiters:

```
=== FILE: docker/trigger-dev/src/trigger/cfn-coordinator.ts ===
[file contents]
=== END FILE ===
```

## Size Estimates

| Component | ~Lines | ~Tokens |
|-----------|--------|---------|
| cfn-coordinator.ts | 1095 | ~22K |
| cfn-mdap-implementer.ts | 431 | ~9K |
| cfn-cli-sprint-implementer.ts | 484 | ~10K |
| mdap-config.ts | 428 | ~9K |
| mdap-atomicity.ts | ~600 | ~12K |
| sprint-aggregator.ts | ~250 | ~5K |
| All decomposers | ~1000 | ~20K |
| **Total (--all)** | **~4300** | **~87K** |

## Integration with Agent

The `mdap-trigger-specialist` agent uses this skill on spawn:

```yaml
skills: [mdap-context-injection]
```

On spawn instructions in agent profile:
```markdown
**Step 1:** Ingest MDAP context for full codebase visibility:

\`\`\`bash
bash .claude/skills/mdap-context-injection/inject.sh --all
\`\`\`
```

## Troubleshooting

### Script Not Found
```bash
# Ensure skill directory exists
ls -la .claude/skills/mdap-context-injection/

# Make script executable
chmod +x .claude/skills/mdap-context-injection/inject.sh
```

### File Not Found
```bash
# Check if trigger-dev directory exists
ls docker/trigger-dev/src/trigger/

# Verify specific file
cat docker/trigger-dev/src/trigger/cfn-coordinator.ts | head -20
```

### Output Too Large
Use selective injection instead of `--all`:
```bash
# Just coordinator flow
bash .claude/skills/mdap-context-injection/inject.sh --coordinator --mdap
```

## Version History

- **1.0.0** (2025-11-30): Initial creation
  - Core MDAP workflow file injection
  - Selective injection flags
  - Size estimates for context budgeting
