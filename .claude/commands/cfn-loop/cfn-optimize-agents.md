---
name: cfn-optimize-agents
description: |
  Optimize agent profiles for CFN loops, CLI commands, and swarm coordination using cli-agent-optimizer agents.
  Launches multiple cli-agent-optimizer agents in parallel to review and optimize existing agent profiles.
  Triggers CFN coordinators for autonomous optimization execution.

parameters:
  - name: scope
    type: string
    default: all
    description: Optimization scope (all, core, specialized)
    required: false
  - name: agents
    type: string
    description: Specific agent types to optimize (comma-separated)
    required: false
  - name: parallel
    type: number
    default: 3
    description: Number of parallel optimizer agents to run
    required: false

examples:
  - /cfn-optimize-agents
  - /cfn-optimize-agents --scope=all
  - /cfn-optimize-agents --scope=core --parallel=3
  - /cfn-optimize-agents --agents=coder,architect,tester --parallel=5
  - /cfn-optimize-agents --scope=specialized --parallel=5

category: cfn-loop
subcategory: optimization
---

# CFN Optimize Agents

Optimize agent profiles for CFN loops, CLI commands, and swarm coordination using multiple cli-agent-optimizer agents.

## Usage

```bash
/cfn-optimize-agents [options]
```

## Options

- `--scope=<scope>` - Optimization scope (all, core, specialized) [default: all]
- `--agents=<types>` - Specific agent types to optimize (comma-separated)
- `--parallel=<count>` - Number of parallel optimizer agents [default: 3]

## Examples

Basic optimization:
```bash
/cfn-optimize-agents
```

Core agents only with 5 parallel optimizers:
```bash
/cfn-optimize-agents --scope=core --parallel=5
```

Specific agents with more parallel workers:
```bash
/cfn-optimize-agents --agents=coder,architect,tester --parallel=5
```

## What It Does

1. **Launches** a coordinator agent via Task tool to manage the optimization process
2. **Discovers** all agent profiles in .claude/agents/cfn-dev-team/ directory structure
3. **Distributes** profiles evenly among parallel optimizers (zero overlap)
4. **Coordinates** parallel work via Redis pub/sub messaging
5. **Spawns** multiple cli-agent-optimizer agents via CLI with specific assignments
6. **Monitors** progress and ensures complete coverage of all profiles
7. **Aggregates** results and validates all optimizations are completed

## Coordinator-Managed Integration

This command triggers autonomous optimization execution with:
- **Coordinator Agent**: Manages distribution, monitoring, and aggregation via Task tool
- **Profile Distribution**: Intelligent assignment to prevent overlap (15-20 profiles per optimizer)
- **Parallel Optimization**: 1-10 cli-agent-optimizer agents with non-overlapping work
- **Redis Coordination**: Real-time progress tracking via pub/sub channels
- **Quality Assurance**: Verification of complete coverage and confidence scores
- **Overlap Prevention**: Ensures zero duplication across optimizer assignments

## Output

- Optimized agent profiles with improved structure
- Enhanced CLI commands with better error handling
- Improved Redis coordination patterns
- Performance metrics and improvement measurements
- Optimization recommendations and best practices

## Coordinator Pattern Benefits

- **Zero Overlap**: Intelligent distribution prevents duplicate work across optimizers
- **Complete Coverage**: Coordinator ensures all discovered profiles are assigned and optimized
- **Real-time Monitoring**: Redis pub/sub coordination provides live progress tracking
- **Quality Assurance**: Confidence score monitoring and validation of all optimizations
- **Scalable**: Supports 1-10 parallel optimizers with automatic workload balancing
- **Fault Tolerant**: Coordinator handles failed assignments and redistributes work