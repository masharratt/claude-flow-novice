# Coordinator Access to Agent Selection System

**Intelligent Agent Selection for Coordinators**

This guide explains how coordinators can access and use the use case-based agent selection system instead of relying on keyword matching.

---

## 🎯 Quick Access Methods

### 1. **Direct Import (Recommended)**
```javascript
import AgentUseCaseRegistry from './agent-use-cases.js';

// Load the registry
const registry = await AgentUseCaseRegistry.load();

// Get recommendations
const recommendations = registry.recommendAgents("Build authentication system");
```

### 2. **CLI Testing**
```bash
# Test agent recommendations
node src/cli/hybrid-routing/recommend-agents.js "Build authentication system"

# Test different scenarios
node src/cli/hybrid-routing/recommend-agents.js "Security audit"
node src/cli/hybrid-routing/recommend-agents.js "Design architecture"
node src/cli/hybrid-routing/recommend-agents.js "Performance optimization"
```

### 3. **Integrated in spawn-workers.js (Automatic)**
The hybrid routing system automatically uses the use case registry when no explicit agent override is provided:

```bash
# Uses intelligent selection automatically
node src/cli/hybrid-routing/spawn-workers.js "Build authentication system"

# Explicit agent override (bypasses intelligent selection)
node src/cli/hybrid-routing/spawn-workers.js "Build authentication system" \
  --agents=architect,coder,tester
```

---

## 📋 Available Access Methods

### Method 1: Programmatic Access

```javascript
// In your coordinator code
import AgentUseCaseRegistry from './agent-use-cases.js';

class MyCoordinator {
  constructor() {
    this.agentRegistry = null;
  }

  async initialize() {
    this.agentRegistry = await AgentUseCaseRegistry.load();
  }

  async selectAgents(task) {
    const recommendations = this.agentRegistry.recommendAgents(task);

    console.log('Primary agents:', recommendations.primary);
    console.log('Secondary agents:', recommendations.secondary);
    console.log('Reasoning:', recommendations.reasoning);

    return recommendations;
  }
}
```

### Method 2: CLI Integration

```bash
# Direct agent recommendations
node src/cli/hybrid-routing/recommend-agents.js "task description"

# Example output:
# 🚀 Primary Agents: coordinator-hybrid, architect, coder, tester, security-specialist
# 🔧 Secondary Agents: code-analyzer
# 🚀 Spawn command: node spawn-workers.js "task" --agents coordinator-hybrid,architect,coder,tester,security-specialist
```

### Method 3: Hybrid Routing Integration

The system is automatically integrated into the spawn-workers.js:

```bash
# Automatic intelligent selection
node src/cli/hybrid-routing/spawn-workers.js "Build secure API" \
  --max-agents 5

# Shows reasoning:
# 🎯 Intelligent Agent Selection:
# Primary agents: coordinator-hybrid, architect, backend-dev, security-specialist
# Secondary agents: tester, api-docs
# Reasoning: Matched use case: feature-development; Matched domain: security; Complex task requires coordination
```

---

## 🔍 Understanding the Output

### Recommendation Structure
```javascript
{
  primary: ['coordinator-hybrid', 'architect', 'coder'],
  secondary: ['tester', 'security-specialist'],
  reasoning: [
    'Matched use case: feature-development',
    'Matched domain: security',
    'Complex task requires coordination'
  ],
  primaryDetails: [...], // Full agent details
  secondaryDetails: [...] // Full agent details
}
```

### Agent Details
```javascript
{
  name: 'security-specialist',
  whenToUse: 'Security audits, vulnerability assessment, security implementation',
  capabilities: 'Security audits, vulnerability scanning, secure coding practices',
  domain: 'security',
  category: 'security'
}
```

---

## 🎨 Coordinator Selection Patterns

### Pattern 1: Trust Recommendations
```javascript
const recommendations = registry.recommendAgents(task);
const selectedAgents = [...recommendations.primary, ...recommendations.secondary];
```

### Pattern 2: Manual Override
```javascript
const recommendations = registry.recommendAgents(task);
// Use coordinator's judgment to modify selection
const selectedAgents = [
  'coordinator-hybrid', // Always include for complex tasks
  ...recommendations.primary.filter(a => a !== 'coordinator-hybrid'),
  'security-specialist' // Always include for security-sensitive tasks
];
```

### Pattern 3: Domain-Specific Selection
```javascript
// Get all security agents
const securityAgents = registry.getAgentsByDomain('security');

// Get all architecture agents
const architectureAgents = registry.getAgentsByDomain('architecture');
```

### Pattern 4: Progressive Selection
```javascript
const recommendations = registry.recommendAgents(task);

// Start with primary agents
let selectedAgents = [...recommendations.primary];

// Add secondary agents based on task complexity
if (isHighRiskTask(task)) {
  selectedAgents.push('security-specialist');
}

if (isPerformanceCritical(task)) {
  selectedAgents.push('perf-analyzer');
}
```

---

## 📚 Use Case Categories Available

### Development-Focused
- **feature-development**: architect, coder, tester, code-analyzer
- **api-development**: api-designer-persona, backend-dev, api-docs, security-specialist
- **mobile-development**: mobile-dev, react-frontend-engineer, tester

### Quality & Security
- **security-audit**: security-specialist, code-analyzer, tester, production-validator
- **performance-optimization**: perf-analyzer, code-booster, tester
- **quality-assurance**: tester, code-analyzer, code-quality-validator

### Architecture & Infrastructure
- **system-architecture**: system-architect, architect, devops-engineer
- **infrastructure-setup**: devops-engineer, system-architect, security-specialist

### Coordination & Management
- **multi-agent-coordination**: coordinator-hybrid, task-coordinator
- **cfn-loop-mvp/standard/enterprise**: respective CFN coordinators

---

## 🛠️ Integration Examples

### Example 1: Custom Coordinator
```javascript
import AgentUseCaseRegistry from './agent-use-cases.js';

class CustomCoordinator {
  async orchestrateTask(task) {
    const registry = await AgentUseCaseRegistry.load();
    const recommendations = registry.recommendAgents(task);

    // Custom logic for agent selection
    const selectedAgents = this.customizeSelection(recommendations, task);

    // Spawn workers with selected agents
    const spawner = new HybridWorkerSpawner({
      task,
      agentOverride: selectedAgents,
      maxAgents: selectedAgents.length
    });

    return await spawner.spawn();
  }

  customizeSelection(recommendations, task) {
    // Add security agent for any task involving data
    if (task.includes('data') || task.includes('user')) {
      if (!recommendations.primary.includes('security-specialist')) {
        recommendations.primary.push('security-specialist');
      }
    }

    return [...recommendations.primary, ...recommendations.secondary];
  }
}
```

### Example 2: CFN Loop Integration
```javascript
// In CFN Loop coordinators
async selectPhaseAgents(phase, task) {
  const registry = await AgentUseCaseRegistry.load();

  // Mode-specific selection
  const modeMapping = {
    'mvp': 'cfn-loop-mvp',
    'standard': 'cfn-loop-standard',
    'enterprise': 'cfn-loop-enterprise'
  };

  const useCase = modeMapping[this.mode];
  const recommendations = registry.recommendAgents(task);

  // Ensure mode-appropriate coordinator is included
  if (!recommendations.primary.includes(useCase)) {
    recommendations.primary.unshift(useCase);
  }

  return recommendations;
}
```

### Example 3: Interactive Selection
```javascript
// Interactive agent selection for human coordinators
async interactiveAgentSelection(task) {
  const registry = await AgentUseCaseRegistry.load();
  const recommendations = registry.recommendAgents(task);

  console.log(`\n🎯 Task: ${task}`);
  registry.printRecommendations(task, recommendations);

  // Get user input for customization
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question('Modify agent selection? (y/n): ', resolve);
  });

  if (answer === 'y') {
    const customAgents = await new Promise(resolve => {
      rl.question('Enter comma-separated agent types: ', resolve);
    });

    return customAgents.split(',').map(a => a.trim());
  }

  return [...recommendations.primary, ...recommendations.secondary];
}
```

---

## 📊 System Benefits

### For Coordinators:
- ✅ **Intelligent Selection**: Based on use cases, not keywords
- ✅ **Transparent Reasoning**: See why agents were selected
- ✅ **Flexible Override**: Can customize selections as needed
- ✅ **Domain Knowledge**: Built-in expertise for common scenarios
- ✅ **Fallback Support**: Graceful degradation to basic mappings

### For the System:
- ✅ **Consistency**: Standardized agent selection patterns
- ✅ **Maintainability**: Centralized use case definitions
- ✅ **Extensibility**: Easy to add new use cases and domains
- ✅ **Performance**: Cached registry for fast access

---

## 🔧 Troubleshooting

### Issue: Registry falls back to basic mappings
**Solution**: Ensure `AVAILABLE-AGENTS.md` exists and is properly formatted
```bash
# Check if documentation exists
ls -la src/cli/hybrid-routing/AVAILABLE-AGENTS.md

# Regenerate if needed
/list-agents-rebuild
```

### Issue: Agent not found in loaded agents
**Solution**: Check agent name spelling and availability
```javascript
const allAgents = registry.getAllAgents();
console.log('Available agents:', Object.keys(allAgents));
```

### Issue: Poor recommendations for specific task
**Solution**: The system can be extended with new use cases
```javascript
// Add custom use case mapping
registry.useCaseMappings['my-custom-use-case'] = {
  primary: ['agent1', 'agent2'],
  secondary: ['agent3'],
  domain: 'custom'
};
```

---

## 🚀 Getting Started

1. **Import the registry**:
   ```javascript
   import AgentUseCaseRegistry from './agent-use-cases.js';
   ```

2. **Load and use**:
   ```javascript
   const registry = await AgentUseCaseRegistry.load();
   const recommendations = registry.recommendAgents("your task");
   ```

3. **Integrate with your coordinator**:
   ```javascript
   // Use recommendations in your spawning logic
   const spawner = new HybridWorkerSpawner({
     task: "your task",
     agentOverride: recommendations.primary
   });
   ```

4. **Test with CLI**:
   ```bash
   node src/cli/hybrid-routing/recommend-agents.js "your task"
   ```

The system is now ready for coordinators to make intelligent agent selection decisions based on use cases rather than brittle keyword matching!