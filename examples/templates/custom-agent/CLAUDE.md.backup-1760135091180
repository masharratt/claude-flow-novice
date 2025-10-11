# Claude Flow Novice — Custom Agent Template

---

## Custom Agent Development

This template helps you create **custom specialized agents** with unique capabilities.

### Agent Structure

```
.claude/agents/
├── my-custom-agent.md        # Agent definition
├── my-custom-agent-tools.js  # Custom tools
└── my-custom-agent-config.json  # Configuration
```

### Creating a Custom Agent

#### 1. Define Agent Behavior

Create `.claude/agents/my-custom-agent.md`:

```markdown
# Custom Agent Name

## Role
Specialized agent for [specific purpose]

## Capabilities
- Capability 1
- Capability 2
- Capability 3

## Tools
- tool1: Description
- tool2: Description

## Workflow
1. Step 1
2. Step 2
3. Step 3

## Output Format
Expected output structure
```

#### 2. Implement Custom Tools

Create `.claude/agents/my-custom-agent-tools.js`:

```javascript
export async function customTool1(params) {
  // Implementation
  return result;
}

export async function customTool2(params) {
  // Implementation
  return result;
}
```

#### 3. Configure Agent

Create `.claude/agents/my-custom-agent-config.json`:

```json
{
  "name": "my-custom-agent",
  "role": "specialist",
  "capabilities": ["cap1", "cap2"],
  "tools": ["tool1", "tool2"],
  "priority": 5,
  "confidence_threshold": 0.75
}
```

---

## Using Custom Agents in Swarms

### Spawn Custom Agent

```bash
# In swarm configuration
executeSwarm({
  swarmId: "custom-agent-swarm",
  objective: "Task requiring custom capabilities",
  agents: [
    { role: "my-custom-agent", count: 1 },
    { role: "coder", count: 2 }
  ],
  strategy: "development",
  mode: "mesh"
})
```

### Agent Communication

Custom agents use **Redis pub/sub** for coordination:

```javascript
// Publish message
await redis.publish('agent:my-custom-agent:message', JSON.stringify({
  type: 'task-update',
  data: { progress: 50 }
}));

// Subscribe to messages
await redis.subscribe('agent:my-custom-agent:*', (message) => {
  handleMessage(JSON.parse(message));
});
```

---

## Agent Templates

### Data Processing Agent

```markdown
# Data Processing Agent

## Role
Process and transform large datasets

## Capabilities
- Parse CSV/JSON/XML
- Transform data structures
- Validate data quality
- Generate reports

## Tools
- parseData(format, data)
- transformData(rules, data)
- validateData(schema, data)
- generateReport(data)
```

### API Integration Agent

```markdown
# API Integration Agent

## Role
Integrate with external APIs

## Capabilities
- HTTP requests (REST/GraphQL)
- Authentication handling
- Rate limiting
- Error recovery

## Tools
- makeRequest(endpoint, options)
- handleAuth(credentials)
- retryWithBackoff(fn, options)
```

### Security Audit Agent

```markdown
# Security Audit Agent

## Role
Security analysis and vulnerability detection

## Capabilities
- Code security scanning
- Dependency auditing
- Configuration validation
- Compliance checking

## Tools
- scanCode(files)
- auditDependencies(packageJson)
- validateConfig(config)
- checkCompliance(standards)
```

---

## Agent Lifecycle

### 1. Initialization

```javascript
async function initializeAgent(config) {
  // Load tools
  const tools = await loadTools(config.tools);

  // Setup memory
  await setupMemory(config.name);

  // Register with coordinator
  await registerAgent(config);
}
```

### 2. Task Execution

```javascript
async function executeTask(task) {
  // Validate task
  if (!validateTask(task)) {
    return { success: false, error: 'Invalid task' };
  }

  // Execute with tools
  const result = await runWithTools(task);

  // Report confidence
  return {
    success: true,
    result,
    confidence: calculateConfidence(result)
  };
}
```

### 3. Cleanup

```javascript
async function cleanupAgent() {
  // Save state
  await saveState();

  // Unregister
  await unregisterAgent();

  // Clear memory
  await clearMemory();
}
```

---

## Best Practices

1. **Clear Purpose**: Each agent should have one well-defined role
2. **Self-Contained**: Include all necessary tools and dependencies
3. **Confidence Reporting**: Always report confidence scores (0.0-1.0)
4. **Error Handling**: Implement robust error recovery
5. **Memory Management**: Use SQLite/Redis for persistence
6. **Communication**: Use Redis pub/sub for coordination
7. **Testing**: Create unit tests for custom tools

---

## Testing Custom Agents

```bash
# Test agent in isolation
node test-custom-agent.js --agent my-custom-agent --task test-task.json

# Test in swarm
node test-swarm-direct.js "Test custom agent capabilities" --executor --agents my-custom-agent,coder
```

---

## Example: Machine Learning Agent

```markdown
# ML Training Agent

## Role
Train and evaluate machine learning models

## Capabilities
- Data preprocessing
- Model training
- Hyperparameter tuning
- Evaluation and metrics

## Tools
- preprocessData(data, config)
- trainModel(data, params)
- tuneHyperparameters(model, space)
- evaluateModel(model, testData)

## Output Format
{
  "model_id": "string",
  "metrics": {
    "accuracy": 0.95,
    "f1_score": 0.93
  },
  "confidence": 0.88
}
```

---

For more information, see:
- `.claude/agents/` directory for existing agents
- Main CLAUDE.md in project root
- `/swarm --help` for swarm orchestration
