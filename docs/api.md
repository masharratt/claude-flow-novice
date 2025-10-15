# Claude Flow Novice API Reference

This document provides comprehensive API documentation for Claude Flow Novice.

## Core Classes

### ClaudeFlowNovice

The main class for initializing and managing the Claude Flow Novice system.

#### Constructor

```javascript
const flow = new ClaudeFlowNovice(options?)
```

**Parameters:**
- `options` (Object, optional): Configuration options
  - `logLevel` (string): Logging level ('error', 'warn', 'info', 'debug')
  - `maxAgents` (number): Maximum number of agents (default: 10)
  - `timeout` (number): Default agent timeout in milliseconds (default: 30000)
  - `database` (Object): Database configuration
  - `monitoring` (Object): Monitoring configuration

**Example:**
```javascript
const flow = new ClaudeFlowNovice({
  logLevel: 'debug',
  maxAgents: 20,
  timeout: 60000
});
```

#### Methods

##### createAgent(config)

Creates a new agent with the specified configuration.

**Parameters:**
- `config` (Object): Agent configuration
  - `name` (string): Unique agent name (required)
  - `description` (string): Agent description (optional)
  - `handler` (Function): Agent handler function (required)
  - `initialState` (any): Initial agent state (optional)
  - `timeout` (number): Agent-specific timeout (optional)
  - `onError` (Function): Error handler (optional)

**Returns:** Agent instance

**Example:**
```javascript
const agent = flow.createAgent({
  name: 'my-agent',
  description: 'Processes user input',
  handler: async (input, state) => {
    return { processed: true, data: input };
  },
  initialState: { count: 0 },
  timeout: 5000
});
```

##### createWorkflow()

Creates a new workflow for orchestrating multiple agents.

**Returns:** Workflow instance

**Example:**
```javascript
const workflow = flow.createWorkflow()
  .addAgent(agent1)
  .addAgent(agent2);
```

##### createPipeline()

Creates a new pipeline for sequential agent execution.

**Returns:** Pipeline instance

**Example:**
```javascript
const pipeline = flow.createPipeline()
  .addAgent(step1)
  .addAgent(step2)
  .addAgent(step3);
```

##### getAgent(name)

Retrieves an agent by name.

**Parameters:**
- `name` (string): Agent name

**Returns:** Agent instance or null

##### listAgents()

Returns a list of all registered agents.

**Returns:** Array of agent objects

##### shutdown()

Gracefully shuts down the Claude Flow Novice system.

**Example:**
```javascript
await flow.shutdown();
```

## Agent Class

Represents an individual agent that can process input and produce output.

### Properties

- `name` (string): Agent name
- `description` (string): Agent description
- `state` (any): Current agent state
- `status` (string): Current agent status

### Methods

#### execute(input, options?)

Executes the agent with the given input.

**Parameters:**
- `input` (any): Input data for the agent
- `options` (Object, optional): Execution options
  - `timeout` (number): Override default timeout
  - `priority` (string): Execution priority

**Returns:** Promise that resolves with the agent output

**Example:**
```javascript
const result = await agent.execute(
  { text: 'Hello world' },
  { timeout: 10000, priority: 'high' }
);
```

#### updateState(newState)

Updates the agent's internal state.

**Parameters:**
- `newState` (any): New state data

**Example:**
```javascript
agent.updateState({ count: agent.state.count + 1 });
```

#### reset()

Resets the agent to its initial state.

**Example:**
```javascript
agent.reset();
```

## Workflow Class

Manages the execution flow of multiple agents.

### Methods

#### addAgent(agent, condition?)

Adds an agent to the workflow.

**Parameters:**
- `agent` (Agent): Agent to add
- `condition` (Function, optional): Conditional execution function

**Returns:** Workflow instance (for chaining)

**Example:**
```javascript
workflow.addAgent(agent1)
        .addAgent(agent2, (result) => result.success);
```

#### branch(condition, trueAgent, falseAgent?)

Adds conditional branching to the workflow.

**Parameters:**
- `condition` (Function): Condition function
- `trueAgent` (Agent): Agent to execute if condition is true
- `falseAgent` (Agent, optional): Agent to execute if condition is false

**Returns:** Workflow instance

**Example:**
```javascript
workflow.branch(
  (result) => result.priority === 'high',
  urgentAgent,
  normalAgent
);
```

#### parallel(agents)

Adds parallel execution of multiple agents.

**Parameters:**
- `agents` (Array<Agent>): Agents to execute in parallel

**Returns:** Workflow instance

**Example:**
```javascript
workflow.parallel([agent1, agent2, agent3]);
```

#### execute(input, options?)

Executes the workflow with the given input.

**Parameters:**
- `input` (any): Input data
- `options` (Object, optional): Execution options

**Returns:** Promise that resolves with workflow results

**Example:**
```javascript
const results = await workflow.execute(
  { data: 'test' },
  { timeout: 30000 }
);
```

## Pipeline Class

Manages sequential execution of agents.

### Methods

#### addAgent(agent)

Adds an agent to the pipeline sequence.

**Parameters:**
- `agent` (Agent): Agent to add

**Returns:** Pipeline instance

**Example:**
```javascript
const pipeline = flow.createPipeline()
  .addAgent(extractor)
  .addAgent(processor)
  .addAgent(outputFormatter);
```

#### execute(input, options?)

Executes the pipeline with the given input.

**Parameters:**
- `input` (any): Input data
- `options` (Object, optional): Execution options

**Returns:** Promise that resolves with final pipeline output

**Example:**
```javascript
const result = await pipeline.execute(rawData);
```

## Monitoring

### SystemMonitor

Provides monitoring capabilities for the Claude Flow Novice system.

#### Methods

##### getMetrics()

Returns current system metrics.

**Returns:** Object with system metrics
- `agentCount` (number): Number of active agents
- `workflowCount` (number): Number of active workflows
- `memoryUsage` (Object): Memory usage statistics
- `uptime` (number): System uptime in milliseconds

##### getAgentMetrics(agentName)

Returns metrics for a specific agent.

**Parameters:**
- `agentName` (string): Name of the agent

**Returns:** Object with agent metrics
- `executionCount` (number): Total executions
- `averageExecutionTime` (number): Average execution time
- `errorCount` (number): Number of errors
- `lastExecution` (Date): Last execution timestamp

## Database Integration

### DatabaseManager

Handles database operations for persistent storage.

#### Methods

##### saveAgentState(agentName, state)

Saves agent state to database.

**Parameters:**
- `agentName` (string): Agent name
- `state` (any): State data to save

**Returns:** Promise that resolves when saved

##### loadAgentState(agentName)

Loads agent state from database.

**Parameters:**
- `agentName` (string): Agent name

**Returns:** Promise that resolves with saved state

##### saveWorkflowResults(workflowId, results)

Saves workflow execution results.

**Parameters:**
- `workflowId` (string): Workflow identifier
- `results` (any): Results to save

**Returns:** Promise that resolves when saved

## Error Handling

### ClaudeFlowError

Base error class for Claude Flow Novice errors.

#### Properties

- `name` (string): Error name
- `message` (string): Error message
- `code` (string): Error code
- `details` (Object): Additional error details

### Error Types

- `AgentNotFoundError`: Agent not found
- `AgentTimeoutError`: Agent execution timeout
- `WorkflowError`: Workflow execution error
- `ValidationError`: Input validation error
- `ConfigurationError`: System configuration error

## Utility Functions

### validateInput(input, schema)

Validates input data against a schema.

**Parameters:**
- `input` (any): Input data to validate
- `schema` (Object): Validation schema

**Returns:** Validation result
- `valid` (boolean): Whether input is valid
- `errors` (Array): Array of validation errors

### formatOutput(data, format)

Formats output data in specified format.

**Parameters:**
- `data` (any): Data to format
- `format` (string): Output format ('json', 'xml', 'csv', 'text')

**Returns:** Formatted string

### createLogger(config)

Creates a logger instance.

**Parameters:**
- `config` (Object): Logger configuration
  - `level` (string): Log level
  - `format` (string): Log format
  - `output` (string): Output destination

**Returns:** Logger instance

## Configuration Options

### System Configuration

```javascript
const config = {
  // Logging
  logLevel: 'info', // 'error', 'warn', 'info', 'debug'
  
  // Performance
  maxAgents: 10,
  maxWorkflows: 5,
  timeout: 30000,
  
  // Database
  database: {
    type: 'sqlite',
    path: './data/claude-flow.db',
    backup: true
  },
  
  // Monitoring
  monitoring: {
    enabled: true,
    metricsInterval: 5000,
    retentionPeriod: 86400000 // 24 hours
  },
  
  // Security
  security: {
    enableAuth: false,
    apiKey: null,
    allowedOrigins: ['*']
  }
};
```

### Agent Configuration

```javascript
const agentConfig = {
  name: 'my-agent',
  description: 'Agent description',
  
  // Handler function
  handler: async (input, state) => {
    // Agent logic
    return result;
  },
  
  // State management
  initialState: {},
  persistState: true,
  
  // Execution
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  
  // Error handling
  onError: async (error, input) => {
    // Error handling logic
  },
  
  // Validation
  inputSchema: {
    type: 'object',
    required: ['data'],
    properties: {
      data: { type: 'string' }
    }
  },
  
  // Monitoring
  metrics: true,
  logging: true
};
```

## Events

Claude Flow Novice emits various events that you can listen to:

### System Events

- `system:ready`: System is ready
- `system:shutdown`: System is shutting down
- `system:error`: System error occurred

### Agent Events

- `agent:created`: Agent was created
- `agent:executed`: Agent execution completed
- `agent:error`: Agent execution failed
- `agent:timeout`: Agent execution timed out

### Workflow Events

- `workflow:started`: Workflow execution started
- `workflow:completed`: Workflow execution completed
- `workflow:failed`: Workflow execution failed

### Event Handling

```javascript
flow.on('agent:executed', (data) => {
  console.log(`Agent ${data.agentName} executed in ${data.duration}ms`);
});

flow.on('workflow:completed', (data) => {
  console.log(`Workflow ${data.workflowId} completed successfully`);
});
```

## Examples

### Basic Agent

```javascript
const agent = flow.createAgent({
  name: 'echo',
  handler: async (input) => {
    return { echo: input };
  }
});

const result = await agent.execute('Hello World');
```

### Workflow with Conditions

```javascript
const workflow = flow.createWorkflow()
  .addAgent(validateInput)
  .branch(
    (result) => result.isValid,
    processValidInput,
    handleInvalidInput
  )
  .addAgent(formatOutput);

const results = await workflow.execute(userData);
```

### Parallel Processing

```javascript
const workflow = flow.createWorkflow()
  .parallel([fetchUserData, fetchUserPreferences, fetchUserHistory])
  .addAgent(combineUserData);

const userProfile = await workflow.execute({ userId: 123 });
```

For more examples, see the `examples/` directory in the project.