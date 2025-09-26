# Common Patterns Library

**Category**: Code Snippets & Utilities
**Complexity**: 🟢 Beginner to 🔴 Advanced
**Usage**: Copy-paste patterns for claude-flow development

A comprehensive collection of reusable code patterns, design templates, and best practices for claude-flow applications.

## 📚 Pattern Categories

### Agent Coordination Patterns
- [Multi-Agent Workflows](#multi-agent-workflows)
- [Error Handling & Recovery](#error-handling--recovery)
- [Memory Management](#memory-management)
- [Task Orchestration](#task-orchestration)

### Development Patterns
- [SPARC Methodology](#sparc-methodology)
- [Test-Driven Development](#test-driven-development)
- [API Design Patterns](#api-design-patterns)
- [Database Patterns](#database-patterns)

### Architecture Patterns
- [Microservices Communication](#microservices-communication)
- [Event-Driven Architecture](#event-driven-architecture)
- [Caching Strategies](#caching-strategies)
- [Security Patterns](#security-patterns)

## 🤖 Multi-Agent Workflows

### Sequential Agent Chain
```javascript
/**
 * Pattern: Sequential processing with dependency chain
 * Use case: When each agent depends on the previous agent's output
 */

// Example: API Development Chain
const sequentialApiDevelopment = async () => {
  // Step 1: Requirements Analysis
  const requirements = await Task(
    \"Requirements Analyst\",
    \"Analyze API requirements and create detailed specification document\",
    \"researcher\"
  );

  // Step 2: Database Design (depends on requirements)
  const dbDesign = await Task(
    \"Database Architect\",
    `Design database schema based on requirements: ${requirements.summary}`,
    \"database-architect\"
  );

  // Step 3: API Implementation (depends on both)
  const apiImplementation = await Task(
    \"Backend Developer\",
    `Implement REST API with schema: ${dbDesign.schema} and requirements: ${requirements.features}`,
    \"backend-dev\"
  );

  // Step 4: Testing (depends on implementation)
  const testResults = await Task(
    \"Test Engineer\",
    `Create comprehensive tests for API endpoints: ${apiImplementation.endpoints}`,
    \"tester\"
  );

  return {
    requirements,
    dbDesign,
    apiImplementation,
    testResults
  };
};
```

### Parallel Agent Execution
```javascript
/**
 * Pattern: Parallel execution for independent tasks
 * Use case: When agents can work simultaneously on different aspects
 */

// Example: Full-Stack Development
const parallelFullStackDevelopment = async (projectSpec) => {
  // All agents start simultaneously
  const [
    frontendResult,
    backendResult,
    databaseResult,
    testResult,
    devopsResult
  ] = await Promise.all([
    Task(
      \"Frontend Developer\",
      `Create React application with features: ${projectSpec.frontend}`,
      \"frontend-dev\"
    ),
    Task(
      \"Backend Developer\",
      `Build Node.js API with requirements: ${projectSpec.backend}`,
      \"backend-dev\"
    ),
    Task(
      \"Database Architect\",
      `Design database for data requirements: ${projectSpec.data}`,
      \"database-architect\"
    ),
    Task(
      \"Test Engineer\",
      `Create testing strategy for: ${projectSpec.testing}`,
      \"tester\"
    ),
    Task(
      \"DevOps Engineer\",
      `Setup deployment pipeline for: ${projectSpec.deployment}`,
      \"cicd-engineer\"
    )
  ]);

  return {
    frontend: frontendResult,
    backend: backendResult,
    database: databaseResult,
    testing: testResult,
    devops: devopsResult
  };
};
```

### Hierarchical Agent Organization
```javascript
/**
 * Pattern: Coordinator agent managing specialized sub-agents
 * Use case: Complex projects requiring oversight and coordination
 */

const hierarchicalDevelopment = async (projectRequirements) => {
  // Initialize coordinator
  await mcp__claude_flow__swarm_init({
    topology: \"hierarchical\",
    maxAgents: 8
  });

  // Coordinator agent manages the workflow
  const coordinator = await Task(
    \"Project Coordinator\",
    `Analyze requirements and create development plan: ${projectRequirements}`,
    \"coordinator\"
  );

  // Coordinator spawns specialized teams
  const developmentPlan = coordinator.plan;

  // Frontend team
  const frontendTeam = await Promise.all([
    Task(
      \"UI Designer\",
      `Create UI mockups for: ${developmentPlan.frontend.ui}`,
      \"frontend-dev\"
    ),
    Task(
      \"React Developer\",
      `Implement React components for: ${developmentPlan.frontend.components}`,
      \"frontend-dev\"
    ),
    Task(
      \"State Manager\",
      `Setup state management for: ${developmentPlan.frontend.state}`,
      \"frontend-dev\"
    )
  ]);

  // Backend team
  const backendTeam = await Promise.all([
    Task(
      \"API Developer\",
      `Create REST endpoints for: ${developmentPlan.backend.apis}`,
      \"backend-dev\"
    ),
    Task(
      \"Database Designer\",
      `Implement data layer for: ${developmentPlan.backend.data}`,
      \"database-architect\"
    ),
    Task(
      \"Security Specialist\",
      `Implement security for: ${developmentPlan.backend.security}`,
      \"security-manager\"
    )
  ]);

  // Coordinator reviews and integrates
  const integration = await Task(
    \"Integration Manager\",
    `Integrate frontend and backend teams' work and resolve conflicts`,
    \"coordinator\"
  );

  return {
    plan: developmentPlan,
    frontend: frontendTeam,
    backend: backendTeam,
    integration
  };
};
```

## 🛡️ Error Handling & Recovery

### Resilient Agent Patterns
```javascript
/**
 * Pattern: Agent error handling with retry and fallback
 * Use case: Production systems requiring high reliability
 */

class ResilientAgentExecutor {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.fallbackStrategy = options.fallbackStrategy || 'manual';
  }

  async executeWithRetry(agentName, task, agentType, context = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Log attempt
        await this.logAttempt(agentName, attempt, task);

        // Execute agent task
        const result = await Task(agentName, task, agentType);

        // Validate result
        if (this.validateResult(result)) {
          await this.logSuccess(agentName, attempt, result);
          return result;
        }

        throw new Error('Result validation failed');

      } catch (error) {
        lastError = error;
        await this.logError(agentName, attempt, error);

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    // All retries failed, try fallback
    return this.handleFallback(agentName, task, agentType, lastError, context);
  }

  async handleFallback(agentName, task, agentType, error, context) {
    switch (this.fallbackStrategy) {
      case 'alternative_agent':
        return this.tryAlternativeAgent(task, agentType, context);

      case 'simplified_task':
        return this.trySimplifiedTask(agentName, task, agentType);

      case 'manual_intervention':
        return this.requestManualIntervention(agentName, task, error);

      default:
        throw new Error(`All attempts failed for ${agentName}: ${error.message}`);
    }
  }

  async tryAlternativeAgent(task, originalType, context) {
    const alternativeTypes = this.getAlternativeAgentTypes(originalType);

    for (const altType of alternativeTypes) {
      try {
        const result = await Task(
          `Alternative ${altType}`,
          `Fallback task: ${task}`,
          altType
        );

        if (this.validateResult(result)) {
          return result;
        }
      } catch (error) {
        continue; // Try next alternative
      }
    }

    throw new Error('All alternative agents failed');
  }

  async trySimplifiedTask(agentName, originalTask, agentType) {
    const simplifiedTask = this.simplifyTask(originalTask);
    return Task(
      `${agentName} (Simplified)`,
      simplifiedTask,
      agentType
    );
  }

  validateResult(result) {
    // Implement validation logic
    return result && result.success !== false;
  }

  getAlternativeAgentTypes(originalType) {
    const alternatives = {
      'backend-dev': ['coder', 'system-architect'],
      'frontend-dev': ['coder', 'ui-designer'],
      'database-architect': ['backend-dev', 'coder'],
      'tester': ['reviewer', 'coder']
    };

    return alternatives[originalType] || ['coder'];
  }

  simplifyTask(task) {
    // Simplify complex tasks by breaking them down
    return `Simplified version: ${task.split('.')[0]}. Focus on core functionality only.`;
  }

  async logAttempt(agentName, attempt, task) {
    console.log(`[${new Date().toISOString()}] Attempt ${attempt}: ${agentName} - ${task.substring(0, 100)}...`);
  }

  async logSuccess(agentName, attempt, result) {
    console.log(`[${new Date().toISOString()}] SUCCESS (attempt ${attempt}): ${agentName}`);
  }

  async logError(agentName, attempt, error) {
    console.error(`[${new Date().toISOString()}] ERROR (attempt ${attempt}): ${agentName} - ${error.message}`);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage example
const resilientExecutor = new ResilientAgentExecutor({
  maxRetries: 3,
  retryDelay: 2000,
  fallbackStrategy: 'alternative_agent'
});

const result = await resilientExecutor.executeWithRetry(
  \"Backend Developer\",
  \"Create REST API with authentication and rate limiting\",
  \"backend-dev\"
);
```

## 💾 Memory Management

### Shared Memory Pattern
```javascript
/**
 * Pattern: Shared memory for agent coordination
 * Use case: Agents need to share state and coordinate work
 */

class AgentMemoryManager {
  constructor() {
    this.memory = new Map();
    this.subscribers = new Map();
  }

  // Store data with automatic serialization
  async store(key, data, metadata = {}) {
    const entry = {
      data,
      timestamp: new Date().toISOString(),
      metadata,
      version: this.getNextVersion(key)
    };

    this.memory.set(key, entry);

    // Notify subscribers
    this.notifySubscribers(key, 'store', entry);

    // Use claude-flow hooks
    await this.syncWithClaudeFlow(key, entry);
  }

  // Retrieve data with version checking
  async retrieve(key, options = {}) {
    const entry = this.memory.get(key);

    if (!entry) {
      return null;
    }

    // Check if data is stale
    if (options.maxAge) {
      const age = Date.now() - new Date(entry.timestamp).getTime();
      if (age > options.maxAge) {
        return null;
      }
    }

    return entry.data;
  }

  // Subscribe to memory changes
  subscribe(key, agentName, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }

    this.subscribers.get(key).add({ agentName, callback });
  }

  // Agent coordination methods
  async coordinateAgents(workflowId, agents) {
    const coordinationKey = `coordination:${workflowId}`;

    // Store workflow state
    await this.store(coordinationKey, {
      agents: agents.map(agent => ({
        name: agent.name,
        type: agent.type,
        status: 'pending',
        dependencies: agent.dependencies || []
      })),
      status: 'initialized'
    });

    // Set up agent status tracking
    for (const agent of agents) {
      this.subscribe(
        `agent:${agent.name}:status`,
        'coordinator',
        async (status) => {
          await this.updateAgentStatus(workflowId, agent.name, status);
        }
      );
    }

    return coordinationKey;
  }

  async updateAgentStatus(workflowId, agentName, status) {
    const coordinationKey = `coordination:${workflowId}`;
    const workflow = await this.retrieve(coordinationKey);

    if (workflow) {
      const agent = workflow.agents.find(a => a.name === agentName);
      if (agent) {
        agent.status = status;
        agent.lastUpdate = new Date().toISOString();

        await this.store(coordinationKey, workflow);

        // Check if workflow is complete
        if (this.isWorkflowComplete(workflow)) {
          await this.store(`${coordinationKey}:complete`, {
            completedAt: new Date().toISOString(),
            summary: this.generateWorkflowSummary(workflow)
          });
        }
      }
    }
  }

  async syncWithClaudeFlow(key, entry) {
    try {
      // Store in claude-flow memory system
      await npx('claude-flow@alpha', [
        'hooks',
        'memory-store',
        '--key', key,
        '--data', JSON.stringify(entry.data),
        '--metadata', JSON.stringify(entry.metadata)
      ]);
    } catch (error) {
      console.warn('Failed to sync with claude-flow memory:', error.message);
    }
  }

  notifySubscribers(key, event, data) {
    const subscribers = this.subscribers.get(key);
    if (subscribers) {
      subscribers.forEach(({ agentName, callback }) => {
        try {
          callback({ event, key, data, agentName });
        } catch (error) {
          console.error(`Subscriber ${agentName} callback failed:`, error);
        }
      });
    }
  }

  getNextVersion(key) {
    const current = this.memory.get(key);
    return current ? current.version + 1 : 1;
  }

  isWorkflowComplete(workflow) {
    return workflow.agents.every(agent =>
      agent.status === 'completed' || agent.status === 'skipped'
    );
  }

  generateWorkflowSummary(workflow) {
    const completed = workflow.agents.filter(a => a.status === 'completed').length;
    const total = workflow.agents.length;

    return {
      totalAgents: total,
      completedAgents: completed,
      successRate: (completed / total) * 100,
      duration: this.calculateWorkflowDuration(workflow)
    };
  }
}

// Usage example
const memoryManager = new AgentMemoryManager();

// Agent coordination example
const agents = [
  { name: 'Requirements Analyst', type: 'researcher' },
  { name: 'Database Designer', type: 'database-architect', dependencies: ['Requirements Analyst'] },
  { name: 'API Developer', type: 'backend-dev', dependencies: ['Database Designer'] },
  { name: 'Frontend Developer', type: 'frontend-dev', dependencies: ['API Developer'] },
  { name: 'Tester', type: 'tester', dependencies: ['Frontend Developer'] }
];

const coordinationKey = await memoryManager.coordinateAgents('api-project-v1', agents);
```

## 🔄 Task Orchestration

### Conditional Workflow Pattern
```javascript
/**
 * Pattern: Conditional agent execution based on results
 * Use case: Complex workflows with branching logic
 */

class ConditionalOrchestrator {
  constructor() {
    this.workflowState = new Map();
    this.conditions = new Map();
  }

  async executeConditionalWorkflow(workflowId, definition) {
    this.workflowState.set(workflowId, {
      currentStep: 0,
      results: {},
      status: 'running'
    });

    try {
      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        const state = this.workflowState.get(workflowId);

        state.currentStep = i;

        // Check if step should be executed
        if (await this.shouldExecuteStep(step, state.results)) {
          const result = await this.executeStep(step, state.results);
          state.results[step.id] = result;

          // Check for early termination conditions
          if (await this.shouldTerminateEarly(step, result, definition)) {
            break;
          }
        } else {
          state.results[step.id] = { skipped: true, reason: 'condition not met' };
        }
      }

      const finalState = this.workflowState.get(workflowId);
      finalState.status = 'completed';

      return finalState.results;

    } catch (error) {
      const state = this.workflowState.get(workflowId);
      state.status = 'failed';
      state.error = error.message;
      throw error;
    }
  }

  async shouldExecuteStep(step, previousResults) {
    if (!step.condition) return true;

    // Evaluate condition function
    if (typeof step.condition === 'function') {
      return step.condition(previousResults);
    }

    // Evaluate condition string
    if (typeof step.condition === 'string') {
      return this.evaluateConditionString(step.condition, previousResults);
    }

    return true;
  }

  async executeStep(step, context) {
    switch (step.type) {
      case 'agent':
        return this.executeAgentStep(step, context);
      case 'parallel':
        return this.executeParallelStep(step, context);
      case 'decision':
        return this.executeDecisionStep(step, context);
      case 'validation':
        return this.executeValidationStep(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  async executeAgentStep(step, context) {
    const enhancedTask = this.enhanceTaskWithContext(step.task, context);

    return Task(
      step.agentName,
      enhancedTask,
      step.agentType
    );
  }

  async executeParallelStep(step, context) {
    const tasks = step.tasks.map(task =>
      this.executeStep(task, context)
    );

    return Promise.all(tasks);
  }

  async executeDecisionStep(step, context) {
    const decision = step.decision(context);

    if (decision.branch && step.branches[decision.branch]) {
      return this.executeStep(step.branches[decision.branch], context);
    }

    return { decision: decision.value };
  }

  async executeValidationStep(step, context) {
    const validationResult = step.validator(context);

    if (!validationResult.valid) {
      throw new Error(`Validation failed: ${validationResult.message}`);
    }

    return validationResult;
  }

  enhanceTaskWithContext(task, context) {
    // Replace placeholders with context values
    return task.replace(/\\{\\{(\\w+)\\}\\}/g, (match, key) => {
      const keys = key.split('.');
      let value = context;

      for (const k of keys) {
        value = value?.[k];
      }

      return value || match;
    });
  }

  evaluateConditionString(condition, context) {
    // Simple condition evaluation (extend as needed)
    const operators = {
      'exists': (path) => this.getValueByPath(context, path) !== undefined,
      'equals': (path, value) => this.getValueByPath(context, path) === value,
      'contains': (path, value) => {
        const data = this.getValueByPath(context, path);
        return Array.isArray(data) ? data.includes(value) : false;
      }
    };

    // Parse and evaluate condition
    // Format: \"operator:path:value\" or \"operator:path\"
    const [operator, path, value] = condition.split(':');

    if (operators[operator]) {
      return operators[operator](path, value);
    }

    return false;
  }

  getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

// Usage example
const orchestrator = new ConditionalOrchestrator();

const workflowDefinition = {
  steps: [
    {
      id: 'requirements',
      type: 'agent',
      agentName: 'Requirements Analyst',
      agentType: 'researcher',
      task: 'Analyze project requirements and determine complexity'
    },
    {
      id: 'architecture_decision',
      type: 'decision',
      decision: (context) => {
        const complexity = context.requirements?.complexity;
        return {
          branch: complexity === 'high' ? 'microservices' : 'monolith',
          value: complexity
        };
      },
      branches: {
        microservices: {
          id: 'microservices_design',
          type: 'agent',
          agentName: 'Microservices Architect',
          agentType: 'system-architect',
          task: 'Design microservices architecture for {{requirements.features}}'
        },
        monolith: {
          id: 'monolith_design',
          type: 'agent',
          agentName: 'Application Architect',
          agentType: 'system-architect',
          task: 'Design monolithic architecture for {{requirements.features}}'
        }
      }
    },
    {
      id: 'implementation',
      type: 'parallel',
      condition: 'exists:requirements',
      tasks: [
        {
          id: 'backend',
          type: 'agent',
          agentName: 'Backend Developer',
          agentType: 'backend-dev',
          task: 'Implement backend based on {{architecture_decision}} architecture'
        },
        {
          id: 'frontend',
          type: 'agent',
          agentName: 'Frontend Developer',
          agentType: 'frontend-dev',
          task: 'Create frontend interface for {{requirements.ui_requirements}}'
        }
      ]
    },
    {
      id: 'testing',
      type: 'agent',
      agentName: 'Test Engineer',
      agentType: 'tester',
      task: 'Create comprehensive tests for {{implementation.backend}} and {{implementation.frontend}}',
      condition: (context) => context.implementation && !context.implementation.failed
    }
  ]
};

const results = await orchestrator.executeConditionalWorkflow('complex-app-v1', workflowDefinition);
```

## 🏗️ SPARC Methodology

### Complete SPARC Implementation
```javascript
/**
 * Pattern: Complete SPARC methodology implementation
 * Use case: Structured development with clear phases
 */

class SPARCOrchestrator {
  constructor(options = {}) {
    this.validateSteps = options.validateSteps !== false;
    this.enableRefinement = options.enableRefinement !== false;
    this.documentation = options.documentation !== false;
  }

  async executeSPARC(projectDescription, options = {}) {
    const projectId = `sparc_${Date.now()}`;

    try {
      // S - Specification
      const specification = await this.executeSpecification(projectDescription, projectId);

      // P - Pseudocode
      const pseudocode = await this.executePseudocode(specification, projectId);

      // A - Architecture
      const architecture = await this.executeArchitecture(specification, pseudocode, projectId);

      // R - Refinement (iterative)
      const refinement = await this.executeRefinement(architecture, options.refinementIterations || 2);

      // C - Completion
      const completion = await this.executeCompletion(refinement, projectId);

      return {
        projectId,
        specification,
        pseudocode,
        architecture,
        refinement,
        completion,
        summary: this.generateProjectSummary({
          specification,
          pseudocode,
          architecture,
          refinement,
          completion
        })
      };

    } catch (error) {
      throw new Error(`SPARC execution failed: ${error.message}`);
    }
  }

  async executeSpecification(description, projectId) {
    const specResult = await Task(
      \"Specification Analyst\",
      `Analyze and create detailed specification for: ${description}. Include functional requirements, non-functional requirements, constraints, and success criteria.`,
      \"researcher\"
    );

    if (this.validateSteps) {
      await this.validateSpecification(specResult);
    }

    // Store specification in memory
    await this.storePhaseResult(projectId, 'specification', specResult);

    return specResult;
  }

  async executePseudocode(specification, projectId) {
    const pseudocodeResult = await Task(
      \"Algorithm Designer\",
      `Create detailed pseudocode and algorithm design for: ${JSON.stringify(specification.requirements)}. Focus on core logic, data flow, and main algorithms.`,
      \"coder\"
    );

    if (this.validateSteps) {
      await this.validatePseudocode(pseudocodeResult, specification);
    }

    await this.storePhaseResult(projectId, 'pseudocode', pseudocodeResult);

    return pseudocodeResult;
  }

  async executeArchitecture(specification, pseudocode, projectId) {
    const architectureResult = await Task(
      \"System Architect\",
      `Design system architecture for specification: ${JSON.stringify(specification.requirements)} and algorithms: ${JSON.stringify(pseudocode.algorithms)}. Include technology stack, system components, data architecture, and deployment strategy.`,
      \"system-architect\"
    );

    if (this.validateSteps) {
      await this.validateArchitecture(architectureResult, specification, pseudocode);
    }

    await this.storePhaseResult(projectId, 'architecture', architectureResult);

    return architectureResult;
  }

  async executeRefinement(architecture, iterations) {
    const refinements = [];

    for (let i = 0; i < iterations; i++) {
      const iterationContext = {
        iteration: i + 1,
        totalIterations: iterations,
        previousRefinements: refinements,
        architecture
      };

      // Parallel refinement by different specialists
      const [
        codeRefinement,
        performanceRefinement,
        securityRefinement,
        testRefinement
      ] = await Promise.all([
        Task(
          \"Code Architect\",
          `Refine implementation approach (iteration ${i + 1}): ${JSON.stringify(architecture.implementation)}. Focus on code quality, maintainability, and best practices.`,
          \"coder\"
        ),
        Task(
          \"Performance Engineer\",
          `Optimize performance aspects (iteration ${i + 1}): ${JSON.stringify(architecture.performance)}. Focus on scalability, efficiency, and resource optimization.`,
          \"performance-optimizer\"
        ),
        Task(
          \"Security Specialist\",
          `Review and enhance security (iteration ${i + 1}): ${JSON.stringify(architecture.security)}. Focus on vulnerabilities, authentication, and data protection.`,
          \"security-manager\"
        ),
        Task(
          \"Test Strategist\",
          `Develop testing strategy (iteration ${i + 1}): ${JSON.stringify(architecture.testing)}. Focus on test coverage, automation, and quality assurance.`,
          \"tester\"
        )
      ]);

      const iterationResult = {
        iteration: i + 1,
        code: codeRefinement,
        performance: performanceRefinement,
        security: securityRefinement,
        testing: testRefinement,
        timestamp: new Date().toISOString()
      };

      refinements.push(iterationResult);

      // Validate refinement quality
      if (this.enableRefinement) {
        const quality = await this.assessRefinementQuality(iterationResult);
        if (quality.score >= 0.85) {
          break; // Early termination if quality is high enough
        }
      }
    }

    return {
      iterations: refinements,
      finalRefinement: this.consolidateRefinements(refinements)
    };
  }

  async executeCompletion(refinement, projectId) {
    const finalImplementation = refinement.finalRefinement;

    // Parallel completion tasks
    const [
      implementationResult,
      testingResult,
      documentationResult,
      deploymentResult
    ] = await Promise.all([
      Task(
        \"Implementation Engineer\",
        `Implement the final solution: ${JSON.stringify(finalImplementation)}. Create production-ready code with all refinements incorporated.`,
        \"coder\"
      ),
      Task(
        \"QA Engineer\",
        `Execute comprehensive testing: ${JSON.stringify(finalImplementation.testing)}. Include unit tests, integration tests, and end-to-end validation.`,
        \"tester\"
      ),
      this.documentation ? Task(
        \"Documentation Writer\",
        `Create comprehensive documentation: ${JSON.stringify(finalImplementation)}. Include API docs, user guides, and technical documentation.`,
        \"api-docs\"
      ) : Promise.resolve(null),
      Task(
        \"Deployment Engineer\",
        `Prepare deployment package: ${JSON.stringify(finalImplementation.deployment)}. Include containerization, CI/CD setup, and production configuration.`,
        \"cicd-engineer\"
      )
    ]);

    const completion = {
      implementation: implementationResult,
      testing: testingResult,
      documentation: documentationResult,
      deployment: deploymentResult,
      quality: await this.assessFinalQuality({
        implementation: implementationResult,
        testing: testingResult
      }),
      completedAt: new Date().toISOString()
    };

    await this.storePhaseResult(projectId, 'completion', completion);

    return completion;
  }

  async validateSpecification(spec) {
    const validator = await Task(
      \"Specification Validator\",
      `Validate specification completeness and clarity: ${JSON.stringify(spec)}. Check for missing requirements, ambiguities, and inconsistencies.`,
      \"reviewer\"
    );

    if (!validator.valid) {
      throw new Error(`Specification validation failed: ${validator.issues.join(', ')}`);
    }
  }

  async validatePseudocode(pseudocode, specification) {
    const validator = await Task(
      \"Pseudocode Validator\",
      `Validate pseudocode against specification: ${JSON.stringify(specification.requirements)}. Check algorithm correctness and completeness.`,
      \"reviewer\"
    );

    if (!validator.valid) {
      throw new Error(`Pseudocode validation failed: ${validator.issues.join(', ')}`);
    }
  }

  async validateArchitecture(architecture, specification, pseudocode) {
    const validator = await Task(
      \"Architecture Validator\",
      `Validate architecture design against requirements and algorithms. Check feasibility, scalability, and technical soundness.`,
      \"system-architect\"
    );

    if (!validator.valid) {
      throw new Error(`Architecture validation failed: ${validator.issues.join(', ')}`);
    }
  }

  async assessRefinementQuality(refinement) {
    // Simple quality assessment - can be enhanced with more sophisticated metrics
    const metrics = {
      codeQuality: refinement.code.qualityScore || 0.7,
      performance: refinement.performance.optimizationScore || 0.7,
      security: refinement.security.securityScore || 0.8,
      testing: refinement.testing.coverageScore || 0.8
    };

    const score = Object.values(metrics).reduce((sum, score) => sum + score, 0) / Object.keys(metrics).length;

    return {
      score,
      metrics,
      recommendation: score >= 0.85 ? 'Ready for completion' : 'Needs further refinement'
    };
  }

  consolidateRefinements(refinements) {
    // Combine all refinements into final implementation plan
    const latest = refinements[refinements.length - 1];

    return {
      implementation: latest.code,
      performance: latest.performance,
      security: latest.security,
      testing: latest.testing,
      refinementHistory: refinements.map(r => ({
        iteration: r.iteration,
        timestamp: r.timestamp,
        improvements: this.extractImprovements(r)
      }))
    };
  }

  async assessFinalQuality(completion) {
    const qualityMetrics = await Task(
      \"Quality Assessor\",
      `Assess final implementation quality: ${JSON.stringify(completion)}. Provide scores for code quality, test coverage, performance, and security.`,
      \"reviewer\"
    );

    return qualityMetrics;
  }

  extractImprovements(refinement) {
    return {
      code: refinement.code.improvements || [],
      performance: refinement.performance.optimizations || [],
      security: refinement.security.enhancements || [],
      testing: refinement.testing.additions || []
    };
  }

  async storePhaseResult(projectId, phase, result) {
    // Store in memory for agent coordination
    const memoryKey = `sparc:${projectId}:${phase}`;
    await this.storeInMemory(memoryKey, result);
  }

  async storeInMemory(key, data) {
    // Use claude-flow memory system
    try {
      await npx('claude-flow@alpha', [
        'hooks',
        'memory-store',
        '--key', key,
        '--data', JSON.stringify(data)
      ]);
    } catch (error) {
      console.warn('Memory storage failed:', error.message);
    }
  }

  generateProjectSummary(results) {
    return {
      phases: Object.keys(results).length,
      complexity: this.assessProjectComplexity(results.specification),
      qualityScore: results.completion?.quality?.overallScore || 0,
      technicalDebt: this.assessTechnicalDebt(results),
      recommendations: this.generateRecommendations(results)
    };
  }

  assessProjectComplexity(specification) {
    // Simple complexity assessment
    const features = specification.requirements?.functional?.length || 0;
    const constraints = specification.requirements?.constraints?.length || 0;

    if (features > 20 || constraints > 10) return 'high';
    if (features > 10 || constraints > 5) return 'medium';
    return 'low';
  }

  assessTechnicalDebt(results) {
    // Assess potential technical debt from the implementation
    const refinementIterations = results.refinement?.iterations?.length || 0;
    const qualityScore = results.completion?.quality?.overallScore || 0;

    if (refinementIterations > 3 || qualityScore < 0.7) return 'high';
    if (refinementIterations > 1 || qualityScore < 0.85) return 'medium';
    return 'low';
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.completion?.quality?.overallScore < 0.8) {
      recommendations.push('Consider additional code review and refactoring');
    }

    if (results.refinement?.iterations?.length > 2) {
      recommendations.push('Monitor for technical debt in future iterations');
    }

    if (!results.completion?.testing?.coverageScore || results.completion.testing.coverageScore < 0.85) {
      recommendations.push('Increase test coverage for better reliability');
    }

    return recommendations;
  }
}

// Usage example
const sparcOrchestrator = new SPARCOrchestrator({
  validateSteps: true,
  enableRefinement: true,
  documentation: true
});

const projectResult = await sparcOrchestrator.executeSPARC(
  \"Build a real-time chat application with user authentication, message history, and file sharing capabilities\",
  {
    refinementIterations: 3
  }
);

console.log('SPARC Project Summary:', projectResult.summary);
```

## 🔗 API Design Patterns

### RESTful API with Agent Coordination
```javascript
/**
 * Pattern: REST API development with coordinated agents
 * Use case: Building scalable, well-documented APIs
 */

const buildRESTAPI = async (apiSpecification) => {
  // Coordinate API development with specialized agents
  const [
    schemaDesign,
    endpointImplementation,
    securityImplementation,
    documentationGeneration,
    testingStrategy
  ] = await Promise.all([
    Task(
      \"API Schema Designer\",
      `Design OpenAPI schema for: ${apiSpecification.description}. Include all endpoints, request/response models, and validation rules.`,
      \"system-architect\"
    ),
    Task(
      \"API Developer\",
      `Implement REST endpoints for: ${apiSpecification.endpoints}. Include proper HTTP methods, status codes, and error handling.`,
      \"backend-dev\"
    ),
    Task(
      \"API Security Specialist\",
      `Implement authentication, authorization, and security measures for API: ${apiSpecification.security}`,
      \"security-manager\"
    ),
    Task(
      \"API Documentation Writer\",
      `Create comprehensive API documentation with examples and usage guides for: ${apiSpecification.description}`,
      \"api-docs\"
    ),
    Task(
      \"API Test Engineer\",
      `Create API testing strategy with unit tests, integration tests, and contract tests for: ${apiSpecification.testing}`,
      \"tester\"
    )
  ]);

  return {
    schema: schemaDesign,
    implementation: endpointImplementation,
    security: securityImplementation,
    documentation: documentationGeneration,
    testing: testingStrategy
  };
};

// Example usage
const chatAPISpec = {
  description: \"Real-time chat API with user management and message handling\",
  endpoints: [\"users\", \"conversations\", \"messages\", \"attachments\"],
  security: \"JWT authentication with role-based access control\",
  testing: \"Contract testing with Pact, load testing with k6\"
};

const chatAPI = await buildRESTAPI(chatAPISpec);
```

## 🧪 Test-Driven Development

### TDD with Agent Coordination
```javascript
/**
 * Pattern: Test-Driven Development with coordinated testing agents
 * Use case: High-quality code with comprehensive test coverage
 */

class TDDOrchestrator {
  async executeTDD(featureDescription, options = {}) {
    const feature = await this.analyzeFeature(featureDescription);
    let iteration = 0;
    const maxIterations = options.maxIterations || 5;

    while (iteration < maxIterations) {
      iteration++;

      // Red: Write failing tests
      const tests = await this.writeFailingTests(feature, iteration);

      // Green: Implement minimal code to pass tests
      const implementation = await this.implementMinimalCode(tests, feature);

      // Refactor: Improve code while keeping tests green
      const refactoring = await this.refactorCode(implementation, tests);

      // Validate TDD cycle
      const validation = await this.validateTDDCycle(tests, refactoring);

      if (validation.complete) {
        return {
          feature,
          iterations: iteration,
          finalTests: tests,
          finalImplementation: refactoring,
          coverage: validation.coverage,
          quality: validation.quality
        };
      }

      // Update feature for next iteration
      feature.remainingRequirements = validation.remainingRequirements;
    }

    throw new Error(`TDD process did not converge after ${maxIterations} iterations`);
  }

  async analyzeFeature(description) {
    return Task(
      \"Feature Analyst\",
      `Analyze feature requirements and break into testable components: ${description}. Identify acceptance criteria, edge cases, and dependencies.`,
      \"researcher\"
    );
  }

  async writeFailingTests(feature, iteration) {
    return Task(
      \"Test Writer\",
      `Write failing tests for iteration ${iteration} of feature: ${JSON.stringify(feature.requirements)}. Focus on ${feature.currentRequirement || 'next untested requirement'}.`,
      \"tester\"
    );
  }

  async implementMinimalCode(tests, feature) {
    return Task(
      \"Minimal Implementer\",
      `Write minimal code to pass these failing tests: ${JSON.stringify(tests.failingTests)}. Do not over-engineer, just make tests pass.`,
      \"coder\"
    );
  }

  async refactorCode(implementation, tests) {
    return Task(
      \"Code Refactorer\",
      `Refactor this implementation while keeping all tests green: ${JSON.stringify(implementation)}. Improve code quality, remove duplication, and enhance readability.`,
      \"reviewer\"
    );
  }

  async validateTDDCycle(tests, implementation) {
    return Task(
      \"TDD Validator\",
      `Validate TDD cycle completion. Tests: ${JSON.stringify(tests)}, Implementation: ${JSON.stringify(implementation)}. Check if feature is complete and assess quality.`,
      \"reviewer\"
    );
  }
}

// Usage example
const tddOrchestrator = new TDDOrchestrator();

const userAuthFeature = await tddOrchestrator.executeTDD(
  \"User authentication system with email/password login, JWT tokens, and password reset functionality\",
  { maxIterations: 3 }
);
```

This comprehensive patterns library provides reusable solutions for common claude-flow development scenarios. Each pattern includes detailed implementation examples, usage guidelines, and best practices for multi-agent coordination.

## 📚 Related Resources

- [Learning Paths](../../learning/README.md) - Structured learning progression
- [Template Library](../../templates/README.md) - Ready-to-use project templates
- [Integration Examples](../../integrations/README.md) - Third-party service integrations
- [Best Practices Guide](../../utilities/best-practices/README.md) - Development guidelines

---

These patterns serve as building blocks for more complex claude-flow applications. Combine and adapt them based on your specific requirements and use cases.