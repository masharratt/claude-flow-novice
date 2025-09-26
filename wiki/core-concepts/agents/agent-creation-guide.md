# Agent Creation Guide

This guide explains how to create, register, and deploy new agents in the claude-flow system. The validation system now prevents agent spawning gaps by providing automatic fallbacks and legacy support.

## Overview

The claude-flow system uses a file-based agent definition system where agents are defined as Markdown files with YAML frontmatter in the `.claude/agents/` directory. The system provides automatic validation, legacy mapping, and intelligent fallbacks.

## Quick Start

### 1. Create Agent Definition File

Create a new `.md` file in the appropriate category directory under `.claude/agents/`:

```bash
# Example: Create a new data processing agent
mkdir -p .claude/agents/data
touch .claude/agents/data/data-processor.md
```

### 2. Define Agent with YAML Frontmatter

```yaml
---
name: data-processor
type: data
color: green
priority: medium
capabilities:
  - data-analysis
  - csv-processing
  - json-manipulation
  - data-validation
  - statistical-analysis
metadata:
  description: Specialized agent for processing and analyzing various data formats
  category: data
  tags:
    - data
    - analysis
    - processing
hooks:
  pre: "echo 'Initializing data processing environment...'"
  post: "echo 'Data processing completed.'"
---

# Data Processor Agent

Your agent description and capabilities go here...
```

### 3. Test Agent Availability

```bash
# Test that your agent is recognized
npx claude-flow agent list | grep data-processor

# Test validation system
npx claude-flow agent validate data-processor
```

## Agent Definition Structure

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Unique agent identifier | `"data-processor"` |
| `metadata.description` | string | Brief description of agent purpose | `"Processes data files"` |

### Optional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `type` | string | Agent category/type | `name` value |
| `color` | string | UI display color | `"blue"` |
| `priority` | enum | Task priority (`low`, `medium`, `high`, `critical`) | `"medium"` |
| `capabilities` | array | List of agent capabilities | `[]` |
| `metadata.category` | string | Organizational category | `type` value |
| `metadata.tags` | array | Search and filter tags | `[]` |
| `hooks.pre` | string | Command to run before agent starts | `null` |
| `hooks.post` | string | Command to run after agent completes | `null` |

### Full Example

```yaml
---
name: ml-data-scientist
type: specialized
color: purple
priority: high
capabilities:
  - machine-learning
  - python
  - data-science
  - statistical-modeling
  - feature-engineering
  - model-validation
  - scikit-learn
  - pandas
  - numpy
metadata:
  description: Machine learning specialist for data science tasks and model development
  category: ai-ml
  tags:
    - machine-learning
    - data-science
    - python
    - modeling
  author: "System"
  version: "1.0.0"
  created: "2024-01-15"
hooks:
  pre: "conda activate ml-env && echo 'ML environment activated'"
  post: "python -m mlflow ui --backend-store-uri ./mlruns &"
---

# ML Data Scientist Agent

This agent specializes in machine learning and data science workflows...

## Capabilities

### Data Preprocessing
- Feature engineering and selection
- Data cleaning and validation
- Dimensionality reduction
- Handling missing values

### Model Development
- Algorithm selection and tuning
- Cross-validation strategies
- Hyperparameter optimization
- Model ensemble techniques

### Model Evaluation
- Performance metrics calculation
- Statistical significance testing
- Model interpretation and explainability
- Bias and fairness assessment

## Usage Examples

```python
# Example usage in Python
agent = MLDataScientist()
model = agent.train_model(data, target='price', algorithm='random_forest')
predictions = agent.predict(test_data)
metrics = agent.evaluate_model(model, test_data, test_target)
```

## Integration Points

- **Data Sources**: CSV, JSON, SQL databases, APIs
- **ML Libraries**: scikit-learn, pandas, numpy, scipy
- **Visualization**: matplotlib, seaborn, plotly
- **Deployment**: MLflow, Docker containers
```

## Directory Structure

Organize agents by category for better management:

```
.claude/agents/
├── README.md                    # Overview of all agents
├── MIGRATION_SUMMARY.md         # Legacy migration notes
├── analysis/                    # Code analysis agents
│   ├── code-analyzer.md
│   └── code-review/
├── architecture/                # System design agents
│   └── system-design/
├── consensus/                   # Distributed consensus agents
│   ├── byzantine-coordinator.md
│   ├── consensus-builder.md
│   └── raft-manager.md
├── core/                        # Essential agents
│   ├── coder.md
│   ├── researcher.md
│   ├── reviewer.md
│   └── tester.md
├── data/                        # Data processing agents
│   ├── data-processor.md
│   └── ml-data-scientist.md
├── development/                 # Development-focused agents
├── devops/                      # DevOps and deployment agents
├── github/                      # GitHub integration agents
└── specialized/                 # Domain-specific agents
```

## Agent Categories

### Core Development
Essential agents for basic development workflows:
- `coder` - Code implementation
- `reviewer` - Code review and quality
- `tester` - Test creation and validation
- `researcher` - Information gathering

### Specialized Domains
Domain-specific expertise agents:
- `backend-dev` - Backend API development
- `mobile-dev` - Mobile app development
- `ml-developer` - Machine learning development
- `system-architect` - System design

### Coordination & Management
Agents for workflow orchestration:
- `task-orchestrator` - Task distribution
- `hierarchical-coordinator` - Multi-level coordination
- `consensus-builder` - Distributed decision making

### Performance & Analysis
Optimization and monitoring agents:
- `perf-analyzer` - Performance optimization
- `performance-benchmarker` - Metrics and benchmarking
- `code-analyzer` - Static code analysis

## Validation System

The system includes automatic validation and fallback mechanisms:

### Legacy Support
Common legacy agent types are automatically mapped:
```typescript
const legacyMappings = {
  'analyst': 'code-analyzer',
  'coordinator': 'task-orchestrator',
  'optimizer': 'perf-analyzer',
  'monitor': 'performance-benchmarker',
  'documenter': 'api-docs',
  'specialist': 'system-architect',
  'architect': 'system-architect'
};
```

### Intelligent Fallbacks
1. **Direct Validation**: Check if agent exists
2. **Legacy Mapping**: Try known legacy mappings
3. **Capability Matching**: Find agents with similar capabilities
4. **Fuzzy Matching**: Find agents with similar names
5. **Default Fallback**: Use `researcher` as ultimate fallback

### Using Validation in Code

```typescript
import { validateAgentType, prepareAgentSpawn } from './src/agents/agent-validator.js';

// Validate single agent type
const result = await validateAgentType('analyst');
console.log(result.resolvedType); // 'code-analyzer'
console.log(result.warnings);     // ['Agent type analyst mapped to code-analyzer']

// Prepare agent spawn for Task tool
const request = {
  type: 'consensus-builder',
  description: 'Build consensus mechanisms',
  prompt: 'Create distributed consensus protocols'
};

const prepared = await prepareAgentSpawn(request);
console.log(prepared.spawnCommand); // Task(...) command with validated type
```

## Best Practices

### Naming Conventions
- Use kebab-case for agent names: `ml-data-scientist`
- Be descriptive but concise: `backend-dev` not `backend-developer-agent`
- Avoid abbreviations unless widely understood: `cicd-engineer` is OK

### Capability Definition
- List specific technologies: `python`, `typescript`, `react`
- Include domains: `machine-learning`, `web-development`, `devops`
- Add tools and frameworks: `docker`, `kubernetes`, `jest`

### Documentation
- Provide clear, comprehensive descriptions
- Include usage examples and code snippets
- Document integration points with other agents
- Specify input/output formats

### Hooks and Integration
- Use `pre` hooks for environment setup
- Use `post` hooks for cleanup or result processing
- Keep hooks simple and focused
- Test hooks thoroughly

## Testing New Agents

### 1. Validation Testing
```bash
# Test agent is recognized
npx claude-flow agent validate your-agent-name

# List all available agents
npx claude-flow agent list

# Test agent spawning
npx claude-flow agent spawn your-agent-name "test task"
```

### 2. Integration Testing
```typescript
// Test in code
import { prepareAgentSpawn } from './src/agents/task-agent-integration.js';

const result = await prepareAgentSpawn({
  type: 'your-agent-name',
  description: 'Test task',
  prompt: 'Test the new agent'
});

expect(result.success).toBe(true);
expect(result.finalType).toBe('your-agent-name');
```

### 3. Claude Code Task Tool Testing
```javascript
// In Claude Code, agents are automatically validated
Task("Test new agent", "Test the agent functionality", "your-agent-name")
```

## Common Issues and Solutions

### Agent Not Found
**Problem**: Agent spawning fails with "agent not found"
**Solution**:
1. Check file exists in `.claude/agents/`
2. Verify YAML frontmatter is valid
3. Ensure `name` field matches filename
4. Check agent loader cache with `npx claude-flow agent refresh`

### Legacy Agent Mapping
**Problem**: Old agent names stop working
**Solution**:
1. Add mapping to `LEGACY_AGENT_MAPPING` in `agent-loader.ts`
2. Update documentation to show preferred names
3. Use validation system to provide warnings

### Capability Conflicts
**Problem**: Multiple agents claim same capabilities
**Solution**:
1. Make capabilities more specific
2. Use agent descriptions to differentiate
3. Implement priority-based selection

### Performance Issues
**Problem**: Agent loading is slow
**Solution**:
1. Check cache expiry settings
2. Reduce number of agent files
3. Optimize YAML parsing

## Migration from Legacy Systems

### Step 1: Identify Legacy Agents
```bash
# Find references to old agent types
grep -r "analyst\|coordinator\|optimizer" your-codebase/
```

### Step 2: Update Agent Definitions
Create proper `.md` files for any missing agents

### Step 3: Update Code References
Replace direct agent type strings with validated calls:
```typescript
// Old way
const agent = spawnAgent('analyst');

// New way
const validated = await validateAgentType('analyst');
const agent = spawnAgent(validated.resolvedType);
```

### Step 4: Test Migration
Run validation tests to ensure all agent types resolve correctly

## Advanced Features

### Dynamic Agent Creation
```typescript
import { agentLoader } from './src/agents/agent-loader.js';

// Create agent definition programmatically
const agentDef = {
  name: 'dynamic-agent',
  description: 'Dynamically created agent',
  capabilities: ['custom-capability']
};

await agentLoader.registerDynamicAgent(agentDef);
```

### Agent Composition
```yaml
---
name: fullstack-developer
type: composite
capabilities:
  - frontend-development
  - backend-development
  - database-design
composed_of:
  - frontend-dev
  - backend-dev
  - database-architect
metadata:
  description: Composite agent combining multiple development specialties
---
```

### Custom Validation Rules
```typescript
import { agentValidator } from './src/agents/agent-validator.js';

// Add custom validation logic
agentValidator.addCustomRule('security-agent', (type, context) => {
  if (context.requiresSecurity && !type.includes('security')) {
    return { valid: false, reason: 'Security context requires security agent' };
  }
  return { valid: true };
});
```

## Conclusion

The agent system provides a flexible, validated approach to extending claude-flow capabilities. With automatic fallbacks and legacy support, the system prevents coordination gaps while allowing seamless migration to new agent architectures.

For questions or issues, refer to the troubleshooting section or check the system logs for validation warnings and errors.