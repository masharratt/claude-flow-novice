/**
 * Context Helper System
 * Provides situation-specific assistance and intelligent agent suggestions
 */

const path = require('path');
const fs = require('fs').promises;

class ContextHelper {
  constructor(adaptiveGuide) {
    this.adaptiveGuide = adaptiveGuide;
    this.knowledgeBase = new Map();
    this.commonPatterns = new Map();
    this.agentCapabilities = new Map();

    this.initializeKnowledgeBase();
    this.initializeAgentCapabilities();
  }

  /**
   * Initialize knowledge base with common patterns and solutions
   */
  initializeKnowledgeBase() {
    // Task type to knowledge mapping
    this.knowledgeBase.set('web-development', {
      description: 'Full-stack web application development',
      recommendedAgents: ['coder', 'reviewer', 'tester', 'backend-dev'],
      commonCommands: ['sparc tdd', 'agent-spawn coder', 'task-orchestrate'],
      pitfalls: [
        'Not setting up proper testing early',
        'Ignoring security considerations',
        'Poor API design planning',
      ],
      bestPractices: [
        'Start with API design and documentation',
        'Use TDD methodology for better quality',
        'Implement authentication and authorization early',
        'Set up CI/CD pipeline from the beginning',
      ],
      resources: [
        { type: 'tutorial', title: 'API-First Development', url: '/docs/api-development' },
        { type: 'pattern', title: 'Authentication Patterns', url: '/docs/auth-patterns' },
        { type: 'example', title: 'Full-Stack Example', url: '/examples/fullstack' },
      ],
    });

    this.knowledgeBase.set('api-development', {
      description: 'RESTful API and microservices development',
      recommendedAgents: ['backend-dev', 'api-docs', 'tester', 'reviewer'],
      commonCommands: ['sparc run architect', 'agent-spawn backend-dev'],
      pitfalls: [
        'Inconsistent API versioning',
        'Poor error handling',
        'Missing rate limiting',
        'Inadequate documentation',
      ],
      bestPractices: [
        'Follow REST principles consistently',
        'Implement comprehensive error handling',
        'Use OpenAPI specifications',
        'Add proper validation and sanitization',
      ],
      resources: [
        { type: 'guide', title: 'REST API Design Guide', url: '/docs/rest-design' },
        { type: 'template', title: 'API Template', url: '/templates/api' },
      ],
    });

    this.knowledgeBase.set('debugging', {
      description: 'Code debugging and issue resolution',
      recommendedAgents: ['reviewer', 'code-analyzer', 'tester'],
      commonCommands: ['agent-spawn reviewer', 'sparc run debugger'],
      pitfalls: [
        'Not reproducing the bug consistently',
        'Making changes without understanding root cause',
        'Not writing tests to prevent regression',
      ],
      bestPractices: [
        'Create minimal reproduction cases',
        'Use systematic debugging approaches',
        'Add logging and monitoring',
        'Write regression tests',
      ],
      resources: [
        { type: 'guide', title: 'Debugging Strategies', url: '/docs/debugging' },
        { type: 'tool', title: 'Debug Tools Setup', url: '/docs/debug-tools' },
      ],
    });

    this.knowledgeBase.set('performance-optimization', {
      description: 'System and code performance improvement',
      recommendedAgents: ['perf-analyzer', 'code-analyzer', 'reviewer'],
      commonCommands: ['agent-spawn perf-analyzer', 'benchmark-run'],
      pitfalls: [
        'Premature optimization',
        'Not measuring before optimizing',
        'Optimizing the wrong bottlenecks',
      ],
      bestPractices: [
        'Profile before optimizing',
        'Focus on actual bottlenecks',
        'Measure impact of changes',
        'Consider algorithmic improvements first',
      ],
      resources: [
        { type: 'guide', title: 'Performance Optimization', url: '/docs/performance' },
        { type: 'tool', title: 'Profiling Tools', url: '/docs/profiling' },
      ],
    });

    this.knowledgeBase.set('testing', {
      description: 'Comprehensive testing strategy implementation',
      recommendedAgents: ['tester', 'tdd-london-swarm', 'production-validator'],
      commonCommands: ['sparc tdd', 'agent-spawn tester'],
      pitfalls: [
        'Testing implementation details instead of behavior',
        'Poor test organization',
        'Flaky tests',
        'Insufficient test coverage',
      ],
      bestPractices: [
        'Write tests that describe behavior',
        'Use the testing pyramid approach',
        'Keep tests independent and deterministic',
        'Aim for meaningful coverage, not just high percentages',
      ],
      resources: [
        { type: 'guide', title: 'Testing Best Practices', url: '/docs/testing' },
        { type: 'example', title: 'TDD Examples', url: '/examples/tdd' },
      ],
    });

    this.knowledgeBase.set('deployment', {
      description: 'Application deployment and DevOps',
      recommendedAgents: ['cicd-engineer', 'system-architect', 'reviewer'],
      commonCommands: ['agent-spawn cicd-engineer', 'sparc run deployment'],
      pitfalls: [
        'Manual deployment processes',
        'No rollback strategy',
        'Insufficient monitoring',
        'Configuration management issues',
      ],
      bestPractices: [
        'Automate deployment pipelines',
        'Implement blue-green or canary deployments',
        'Set up comprehensive monitoring',
        'Use infrastructure as code',
      ],
      resources: [
        { type: 'guide', title: 'Deployment Strategies', url: '/docs/deployment' },
        { type: 'template', title: 'CI/CD Templates', url: '/templates/cicd' },
      ],
    });
  }

  /**
   * Initialize agent capabilities mapping
   */
  initializeAgentCapabilities() {
    this.agentCapabilities.set('coder', {
      primarySkills: ['implementation', 'coding', 'feature-development'],
      secondarySkills: ['debugging', 'refactoring'],
      bestFor: ['feature implementation', 'bug fixes', 'code generation'],
      complexity: 'medium',
      timeEstimate: 'medium',
    });

    this.agentCapabilities.set('reviewer', {
      primarySkills: ['code-review', 'quality-assurance', 'security-analysis'],
      secondarySkills: ['mentoring', 'standards-enforcement'],
      bestFor: ['code quality checks', 'security reviews', 'best practices'],
      complexity: 'high',
      timeEstimate: 'low',
    });

    this.agentCapabilities.set('tester', {
      primarySkills: ['test-writing', 'quality-assurance', 'automation'],
      secondarySkills: ['bug-finding', 'coverage-analysis'],
      bestFor: ['test development', 'quality validation', 'test automation'],
      complexity: 'medium',
      timeEstimate: 'medium',
    });

    this.agentCapabilities.set('researcher', {
      primarySkills: ['analysis', 'documentation', 'requirements-gathering'],
      secondarySkills: ['technology-evaluation', 'feasibility-analysis'],
      bestFor: ['requirement analysis', 'technology research', 'documentation'],
      complexity: 'low',
      timeEstimate: 'high',
    });

    this.agentCapabilities.set('planner', {
      primarySkills: ['project-planning', 'task-breakdown', 'coordination'],
      secondarySkills: ['risk-assessment', 'timeline-estimation'],
      bestFor: ['project planning', 'task organization', 'milestone tracking'],
      complexity: 'medium',
      timeEstimate: 'low',
    });

    this.agentCapabilities.set('backend-dev', {
      primarySkills: ['api-development', 'database-design', 'server-architecture'],
      secondarySkills: ['security', 'performance-optimization'],
      bestFor: ['API development', 'database work', 'backend services'],
      complexity: 'high',
      timeEstimate: 'high',
    });

    this.agentCapabilities.set('perf-analyzer', {
      primarySkills: ['performance-analysis', 'bottleneck-identification', 'optimization'],
      secondarySkills: ['monitoring', 'profiling'],
      bestFor: ['performance issues', 'optimization tasks', 'system analysis'],
      complexity: 'high',
      timeEstimate: 'medium',
    });
  }

  /**
   * Analyze context and provide intelligent assistance
   */
  async analyzeContext(context) {
    const {
      taskDescription,
      currentFiles,
      errorMessages,
      userInput,
      projectType,
      timeConstraints,
    } = context;

    // Determine task type and complexity
    const taskType = this.identifyTaskType(taskDescription, currentFiles, errorMessages);
    const complexity = this.assessComplexity(taskDescription, currentFiles);
    const urgency = this.assessUrgency(timeConstraints, errorMessages);

    // Get relevant knowledge
    const knowledge = this.knowledgeBase.get(taskType) || {};

    // Generate contextual assistance
    const assistance = {
      taskType,
      complexity,
      urgency,
      recommendedAgents: this.recommendAgents(taskType, complexity, urgency),
      suggestedWorkflow: this.suggestWorkflow(taskType, complexity, urgency),
      potentialPitfalls: knowledge.pitfalls || [],
      bestPractices: knowledge.bestPractices || [],
      relevantResources: knowledge.resources || [],
      customGuidance: await this.generateCustomGuidance(context, taskType),
    };

    return assistance;
  }

  /**
   * Identify task type from context clues
   */
  identifyTaskType(description, files = [], errors = []) {
    const text = (description + ' ' + files.join(' ')).toLowerCase();

    // Priority-based identification
    if (
      errors.length > 0 ||
      text.includes('bug') ||
      text.includes('fix') ||
      text.includes('error')
    ) {
      return 'debugging';
    }

    if (
      text.includes('api') ||
      text.includes('endpoint') ||
      text.includes('rest') ||
      text.includes('microservice')
    ) {
      return 'api-development';
    }

    if (
      text.includes('test') ||
      text.includes('spec') ||
      text.includes('tdd') ||
      text.includes('coverage')
    ) {
      return 'testing';
    }

    if (
      text.includes('deploy') ||
      text.includes('ci') ||
      text.includes('cd') ||
      text.includes('pipeline')
    ) {
      return 'deployment';
    }

    if (
      text.includes('performance') ||
      text.includes('optimize') ||
      text.includes('slow') ||
      text.includes('bottleneck')
    ) {
      return 'performance-optimization';
    }

    if (
      text.includes('web') ||
      text.includes('frontend') ||
      text.includes('react') ||
      text.includes('vue') ||
      text.includes('angular')
    ) {
      return 'web-development';
    }

    // Default fallback
    return 'general-development';
  }

  /**
   * Assess task complexity
   */
  assessComplexity(description, files = []) {
    let complexity = 0;

    // Text-based indicators
    const text = description.toLowerCase();
    const complexKeywords = [
      'architecture',
      'distributed',
      'microservice',
      'optimization',
      'security',
      'performance',
    ];
    const simpleKeywords = ['fix', 'update', 'change', 'simple', 'basic'];

    complexity += complexKeywords.filter((keyword) => text.includes(keyword)).length * 2;
    complexity -= simpleKeywords.filter((keyword) => text.includes(keyword)).length;

    // File-based indicators
    complexity += Math.min(files.length / 5, 3); // More files = more complexity

    // Determine complexity level
    if (complexity <= 1) return 'low';
    if (complexity <= 4) return 'medium';
    return 'high';
  }

  /**
   * Assess task urgency
   */
  assessUrgency(timeConstraints, errors = []) {
    if (errors.length > 0) return 'high'; // Bugs are urgent
    if (timeConstraints && timeConstraints.includes('urgent')) return 'high';
    if (timeConstraints && timeConstraints.includes('asap')) return 'high';
    if (
      timeConstraints &&
      (timeConstraints.includes('today') || timeConstraints.includes('deadline'))
    )
      return 'medium';
    return 'low';
  }

  /**
   * Recommend agents based on context
   */
  recommendAgents(taskType, complexity, urgency) {
    const baseRecommendations = this.knowledgeBase.get(taskType)?.recommendedAgents || [
      'coder',
      'reviewer',
    ];
    const recommendations = [...baseRecommendations];

    // Add agents based on complexity
    if (complexity === 'high') {
      recommendations.push('planner', 'system-architect');
    }

    // Add agents based on urgency
    if (urgency === 'high') {
      // For urgent tasks, prioritize fewer, more focused agents
      return recommendations.slice(0, 2);
    }

    // Remove duplicates and return
    return [...new Set(recommendations)];
  }

  /**
   * Suggest workflow based on context
   */
  suggestWorkflow(taskType, complexity, urgency) {
    const workflows = {
      'api-development': {
        high: ['plan', 'design-api', 'implement', 'test', 'document', 'review'],
        medium: ['design-api', 'implement', 'test', 'review'],
        low: ['implement', 'test'],
      },
      debugging: {
        high: ['analyze', 'reproduce', 'debug', 'fix', 'test', 'review'],
        medium: ['reproduce', 'debug', 'fix', 'test'],
        low: ['debug', 'fix'],
      },
      testing: {
        high: ['plan-tests', 'unit-tests', 'integration-tests', 'e2e-tests', 'review'],
        medium: ['unit-tests', 'integration-tests', 'review'],
        low: ['unit-tests'],
      },
      'web-development': {
        high: [
          'requirements',
          'architecture',
          'frontend',
          'backend',
          'integrate',
          'test',
          'deploy',
        ],
        medium: ['frontend', 'backend', 'integrate', 'test'],
        low: ['implement', 'test'],
      },
    };

    const taskWorkflows = workflows[taskType] || workflows['api-development'];
    const complexityWorkflow = taskWorkflows[complexity] || taskWorkflows.medium;

    // Adjust for urgency
    if (urgency === 'high') {
      // For urgent tasks, reduce workflow steps
      return complexityWorkflow.slice(0, Math.ceil(complexityWorkflow.length / 2));
    }

    return complexityWorkflow;
  }

  /**
   * Generate custom guidance based on context
   */
  async generateCustomGuidance(context, taskType) {
    const guidance = [];
    const experienceLevel = this.adaptiveGuide.getExperienceLevel();

    // Experience-based guidance
    if (experienceLevel === 'novice') {
      guidance.push({
        type: 'learning',
        message: `For ${taskType} tasks, start by understanding the requirements clearly`,
        priority: 'high',
      });
    }

    // Task-specific guidance
    if (taskType === 'debugging' && context.errorMessages?.length > 0) {
      guidance.push({
        type: 'strategy',
        message: 'Start by reproducing the error consistently before making changes',
        priority: 'high',
      });
    }

    if (taskType === 'api-development') {
      guidance.push({
        type: 'architecture',
        message: 'Consider API design principles: consistency, versioning, and error handling',
        priority: 'medium',
      });
    }

    // File-based guidance
    if (context.currentFiles?.some((file) => file.includes('.test.'))) {
      guidance.push({
        type: 'quality',
        message: 'Great! Tests are present. Consider running them before making changes',
        priority: 'low',
      });
    }

    return guidance;
  }

  /**
   * Get agent-specific guidance
   */
  getAgentGuidance(agentType, context) {
    const capabilities = this.agentCapabilities.get(agentType);
    if (!capabilities) {
      return null;
    }

    return {
      agent: agentType,
      capabilities: capabilities.primarySkills,
      suitability: this.assessAgentSuitability(agentType, context),
      estimatedTime: capabilities.timeEstimate,
      tips: this.generateAgentTips(agentType, context),
    };
  }

  /**
   * Assess how suitable an agent is for the current context
   */
  assessAgentSuitability(agentType, context) {
    const capabilities = this.agentCapabilities.get(agentType);
    const taskType = this.identifyTaskType(context.taskDescription || '', context.currentFiles);

    const knowledge = this.knowledgeBase.get(taskType);
    if (!knowledge || !capabilities) {
      return 'unknown';
    }

    if (knowledge.recommendedAgents.includes(agentType)) {
      return 'excellent';
    }

    // Check if agent skills match task requirements
    const taskKeywords = (context.taskDescription || '').toLowerCase();
    const matchingSkills = capabilities.primarySkills.filter((skill) =>
      taskKeywords.includes(skill.replace('-', ' ')),
    );

    if (matchingSkills.length >= 2) return 'good';
    if (matchingSkills.length >= 1) return 'fair';
    return 'poor';
  }

  /**
   * Generate agent-specific tips
   */
  generateAgentTips(agentType, context) {
    const tips = {
      coder: [
        'Focus on writing clean, maintainable code',
        'Consider edge cases and error handling',
        'Write meaningful variable and function names',
      ],
      reviewer: [
        'Look for security vulnerabilities',
        'Check adherence to coding standards',
        'Suggest performance improvements',
      ],
      tester: [
        'Write tests that describe behavior, not implementation',
        'Ensure tests are independent and repeatable',
        'Cover both happy path and edge cases',
      ],
      researcher: [
        'Gather comprehensive requirements',
        'Research existing solutions and best practices',
        'Document findings clearly',
      ],
    };

    return tips[agentType] || ['Focus on your core competencies'];
  }

  /**
   * Get learning resources for a specific topic
   */
  getLearningResources(topic) {
    const knowledge = this.knowledgeBase.get(topic);
    if (!knowledge) {
      return [];
    }

    return knowledge.resources || [];
  }

  /**
   * Get common patterns for a task type
   */
  getCommonPatterns(taskType) {
    const patterns = new Map();

    patterns.set('api-development', [
      {
        name: 'RESTful Resource Design',
        description: 'Standard REST endpoint patterns',
        example: 'GET /api/users, POST /api/users, PUT /api/users/:id',
      },
      {
        name: 'Error Response Format',
        description: 'Consistent error response structure',
        example: '{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }',
      },
    ]);

    patterns.set('testing', [
      {
        name: 'AAA Pattern',
        description: 'Arrange, Act, Assert test structure',
        example:
          '// Arrange\nconst user = {...}\n// Act\nconst result = createUser(user)\n// Assert\nexpect(result).toBe(...)',
      },
    ]);

    return patterns.get(taskType) || [];
  }

  /**
   * Provide just-in-time help for current situation
   */
  async provideJustInTimeHelp(currentCommand, context) {
    const help = {
      command: currentCommand,
      context: await this.analyzeContext(context),
      quickTips: [],
      commonMistakes: [],
      nextSteps: [],
    };

    // Command-specific help
    if (currentCommand === 'swarm-init') {
      help.quickTips.push('Choose topology based on your task complexity');
      help.commonMistakes.push('Starting with too many agents');
      help.nextSteps.push('Spawn 2-3 specialized agents for your task');
    }

    if (currentCommand === 'agent-spawn') {
      help.quickTips.push('Match agent type to your specific needs');
      help.commonMistakes.push('Spawning generic agents instead of specialized ones');
      help.nextSteps.push('Use task-orchestrate to coordinate agent work');
    }

    return help;
  }

  /**
   * Update knowledge base with new patterns
   */
  async updateKnowledgeBase(taskType, newPattern) {
    const existing = this.knowledgeBase.get(taskType) || {};
    existing.patterns = existing.patterns || [];
    existing.patterns.push(newPattern);
    this.knowledgeBase.set(taskType, existing);

    // Persist to storage if needed
    await this.persistKnowledgeBase();
  }

  /**
   * Persist knowledge base to storage
   */
  async persistKnowledgeBase() {
    try {
      const configDir = this.adaptiveGuide?.configDir || path.join(process.cwd(), '.claude-flow');
      const knowledgePath = path.join(configDir, 'guidance', 'knowledge-base.json');

      const data = Object.fromEntries(this.knowledgeBase);
      await fs.writeFile(knowledgePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to persist knowledge base:', error.message);
    }
  }

  /**
   * Load knowledge base from storage
   */
  async loadKnowledgeBase() {
    try {
      const configDir = this.adaptiveGuide?.configDir || path.join(process.cwd(), '.claude-flow');
      const knowledgePath = path.join(configDir, 'guidance', 'knowledge-base.json');

      const data = await fs.readFile(knowledgePath, 'utf8');
      const knowledge = JSON.parse(data);

      for (const [key, value] of Object.entries(knowledge)) {
        this.knowledgeBase.set(key, value);
      }
    } catch (error) {
      // Use default knowledge base if file doesn't exist
    }
  }
}

module.exports = ContextHelper;
