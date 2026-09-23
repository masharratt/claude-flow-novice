# Multi-Coordinator Planning Skill

**Purpose:** Systematic planning and validation for parallel multi-coordinator execution workflows, designed to prevent Zone B-style execution failures.

## Overview

This skill provides comprehensive pre-flight planning for multi-coordinator execution, addressing the critical failures identified in the Zone B analysis:
- Redis namespace collision (Echo zone)
- Protocol compliance breakdown (Alpha/Charlie zones)
- Orchestration gaps (Delta zone)
- Consensus on vapor anti-patterns (Bravo zone)

## Quick Start

```bash
# Create zone configuration
cat > zone-config.json << 'EOF'
{
  "zones": [
    {
      "name": "zone-alpha",
      "task_description": "Implement React authentication component with TypeScript interfaces",
      "deliverables": [
        "src/components/AuthForm.tsx",
        "src/types/auth.ts",
        "src/hooks/useAuth.ts",
        "tests/auth.test.ts"
      ],
      "agent_types": ["react-frontend-engineer", "reviewer", "tester"],
      "acceptance_criteria": [
        "Form validates user input",
        "Authentication state managed globally",
        "Component tested with >80% coverage"
      ],
      "in_scope": ["React components", "TypeScript interfaces"],
      "out_of_scope": ["Backend authentication"],
      "directory": "src/auth"
    }
  ]
}
EOF

# Execute planning
$HOME/.claude/skills/cfn-planning/lib/coordinator/plan-multi-coordinator-work.sh zone-config.json
```

## Components

### 1. Main Planning Script
- **`plan-multi-coordinator-work.sh`** - Orchestrates all planning phases

### 2. Planning Phase Scripts
- **`validate-task-planning.sh`** - Task configuration validation
- **`plan-coordinator-resources.sh`** - Resource allocation and namespace planning
- **`map-dependencies-conflicts.sh`** - Dependency analysis and conflict resolution
- **`plan-risk-rollout.sh`** - Risk-based rollout strategy

### 3. Testing
- **`test-multi-coordinator-planning.sh`** - Comprehensive test suite

## Configuration Format

### Zone Configuration Structure
```json
{
  "zones": [
    {
      "name": "zone-identifier",
      "task_description": "Specific implementation task with clear deliverables",
      "deliverables": [
        "file/path/to/deliverable.ext"
      ],
      "agent_types": ["required-agent-types"],
      "acceptance_criteria": [
        "Measurable acceptance criteria"
      ],
      "in_scope": ["items in scope"],
      "out_of_scope": ["items out of scope"],
      "directory": "working/directory",
      "risk_factors": ["optional-risk-factors"]
    }
  ]
}
```

### Validation Requirements
- **Minimum 3 deliverables** for software tasks
- **Minimum 2 agent types** (prevents single-agent anti-patterns)
- **Specific task descriptions** (no generic "implementation" tasks)
- **Acceptance criteria** required
- **In-scope/out-of-scope boundaries** required

## Usage Examples

### Basic Planning
```bash
./plan-multi-coordinator-work.sh zone-config.json
```

### Advanced Planning with Custom Parameters
```bash
./plan-multi-coordinator-work.sh zone-config.json \
  --max-zones-per-phase 3 \
  --output-dir ./plans \
  --dry-run
```

### Skip Validation (Not Recommended)
```bash
./plan-multi-coordinator-work.sh zone-config.json --skip-validation
```

## Planning Phases

### Phase 1: Task Validation
- Deliverable specificity verification
- Agent type diversity requirements
- Context completeness scoring
- Anti-pattern detection

### Phase 2: Resource Allocation
- Redis namespace reservation and isolation
- Memory/CPU capacity planning
- Coordinator limit calculations
- Working directory allocation

### Phase 3: Dependency Analysis
- Cross-zone dependency identification
- Shared resource conflict detection
- Completion pathway validation
- Resolution strategy creation

### Phase 4: Risk-Based Rollout
- Zone complexity ranking
- Graduated phase rollout
- Success gate definition
- Rollback trigger configuration

## Output Files

### Generated Plans
- `coordinator-resource-plan-*.json` - Resource allocation mapping
- `dependency-conflict-analysis-*.json` - Dependencies and conflicts analysis
- `rollout-plan-*.json` - Risk-based rollout strategy
- `multi-coordinator-planning-summary-*.json` - Execution summary

### Structure
```json
{
  "timestamp": 1699123456,
  "zone_count": 2,
  "system_resources": {...},
  "resource_plans": [...],
  "phases": [...],
  "success_criteria": [...],
  "rollback_triggers": [...]
}
```

## Risk Mitigation

### Prevents Zone B Failures
1. **Namespace Collision Prevention** - Redis DB allocation per zone
2. **Protocol Compliance** - Agent completion pathway validation
3. **Orchestration Gaps** - Coordinator lifecycle management
4. **Anti-Pattern Detection** - Consensus on vapor prevention

### Rollback Strategies
- Immediate rollback on critical failures
- Phase-specific rollback triggers
- Context preservation and recovery
- Emergency stop and cleanup procedures

## Testing

```bash
# Run comprehensive test suite
./test-multi-coordinator-planning.sh

# Test individual components
./validate-task-planning.sh test-config.json
./plan-coordinator-resources.sh test-config.json
./map-dependencies-conflicts.sh test-config.json
./plan-risk-rollout.sh test-config.json
```

## Integration with CFN Loop

This skill integrates with the existing CFN Loop ecosystem:

### Pre-Flight Validation
- Use before `/cfn-loop-cli` multi-coordinator execution
- Validates coordinator readiness and resource availability
- Prevents execution failures through comprehensive planning

### CLI Spawning Support
- Generates CLI-compatible coordinator configurations
- Supports the recommendation to spawn coordinators via CLI
- Enables Main Chat monitoring and interjection capabilities

### Redis Coordination
- Uses existing Redis coordination patterns
- Maintains namespace isolation standards

## Best Practices

### Planning Phase
1. **Always validate configurations** before execution
2. **Use graduated rollout** for complex multi-zone scenarios
3. **Monitor resource utilization** during planning
4. **Test rollback procedures** before production execution

### Configuration
1. **Be specific** about deliverables and acceptance criteria
2. **Include risk factors** for accurate complexity assessment
3. **Define clear scope boundaries** to prevent scope creep
4. **Use appropriate agent types** for task complexity

### Execution
1. **Follow the rollout sequence** generated by the planner
2. **Monitor each phase** before proceeding to the next
3. **Be prepared to rollback** on trigger activation
4. **Document lessons learned** for future planning

## Troubleshooting

### Common Issues
- **Redis connection failures** - Check Redis service status
- **Resource exhaustion** - Reduce concurrent zones or increase resources
- **Validation failures** - Review configuration against requirements
- **Namespace conflicts** - Ensure unique zone names and task IDs

### Debug Mode
```bash
# Enable verbose output
set -x
./plan-multi-coordinator-work.sh zone-config.json
set +x
```

## Dependencies

- **jq** - JSON processing
- **redis-cli** - Redis connectivity and namespace planning
- **bc** - Mathematical calculations
- **Redis server** - Namespace reservation and coordination

## Maintenance

- Regular testing of all planning phases
- Update validation rules based on new failure patterns
- Enhance resource planning algorithms
- Extend rollback trigger configurations

---