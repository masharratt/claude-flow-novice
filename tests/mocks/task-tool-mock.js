/**
 * Mock Task Tool for Agent Spawning
 *
 * Provides mock implementation of Claude Code's Task tool
 * for testing CFN Loop agent spawning and coordination.
 *
 * @module mocks/task-tool-mock
 */

/**
 * Mock Task function that simulates agent spawning
 * 
 * @param {string} role - Agent role (coder, tester, reviewer, security-specialist, etc.)
 * @param {string} prompt - Task prompt/instructions for the agent
 * @param {string} type - Agent type/category
 * @returns {Promise<Object>} Mock agent response
 */
export async function Task(role, prompt, type) {
  // Simulate agent execution delay
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  
  // Generate realistic mock responses based on role
  const mockResponse = generateMockResponse(role, prompt, type);
  
  return {
    agentId: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role,
    type,
    status: 'completed',
    output: JSON.stringify(mockResponse),
    executionTime: 100 + Math.random() * 200,
    timestamp: Date.now()
  };
}

/**
 * Generate realistic mock responses based on agent role
 */
function generateMockResponse(role, prompt, type) {
  const baseConfidence = 0.75 + Math.random() * 0.20; // 0.75-0.95
  
  switch (role) {
    case 'coder':
    case 'developer':
      return {
        agent: role,
        confidence: Math.round(baseConfidence * 100) / 100,
        vote: baseConfidence >= 0.8 ? 'APPROVE' : 'REJECT',
        reasoning: `Implementation quality: ${baseConfidence >= 0.9 ? 'Excellent' : baseConfidence >= 0.8 ? 'Good' : 'Needs improvement'}. Code follows best practices and includes proper error handling.`,
        deliverables: {
          files: ['auth-service.js', 'auth-middleware.js', 'jwt-utils.js'],
          tests: ['auth.test.js', 'middleware.test.js'],
          documentation: ['API.md', 'README.md']
        },
        issues_found: baseConfidence < 0.8 ? [
          'Missing input validation in some endpoints',
          'Error messages could be more descriptive'
        ] : [],
        recommendations: [
          'Add comprehensive input validation',
          'Implement rate limiting',
          'Add integration tests for edge cases'
        ],
        metrics: {
          linesOfCode: 500 + Math.floor(Math.random() * 200),
          testCoverage: Math.round((baseConfidence * 100)),
          complexityScore: 'medium'
        }
      };
      
    case 'tester':
    case 'qa':
      return {
        agent: role,
        confidence: Math.round(baseConfidence * 100) / 100,
        vote: baseConfidence >= 0.75 ? 'APPROVE' : 'REJECT',
        reasoning: `Test coverage analysis: ${baseConfidence >= 0.85 ? 'Excellent (90%+)' : baseConfidence >= 0.75 ? 'Good (75-90%)' : 'Insufficient (<75%)'}. Critical paths are well tested.`,
        deliverables: {
          testSuites: ['unit-tests', 'integration-tests', 'e2e-tests'],
          coverage: Math.round(baseConfidence * 100),
          testResults: {
            passed: 45 + Math.floor(Math.random() * 10),
            failed: baseConfidence < 0.8 ? Math.floor(Math.random() * 3) : 0,
            skipped: Math.floor(Math.random() * 2)
          }
        },
        issues_found: baseConfidence < 0.75 ? [
          'Missing tests for error scenarios',
          'Edge case coverage incomplete'
        ] : [],
        recommendations: [
          'Add tests for timeout scenarios',
          'Increase coverage to 90%+',
          'Add property-based testing'
        ]
      };
      
    case 'reviewer':
    case 'code-reviewer':
      return {
        agent: role,
        confidence: Math.round(baseConfidence * 100) / 100,
        vote: baseConfidence >= 0.8 ? 'APPROVE' : 'REJECT',
        reasoning: `Code review assessment: ${baseConfidence >= 0.9 ? 'Excellent' : baseConfidence >= 0.8 ? 'Good' : 'Needs improvement'}. Architecture follows SOLID principles with clear separation of concerns.`,
        deliverables: {
          reviewComments: Math.floor(5 + Math.random() * 10),
          issuesIdentified: baseConfidence < 0.8 ? Math.floor(Math.random() * 3) : 0,
          suggestions: Math.floor(3 + Math.random() * 5)
        },
        issues_found: baseConfidence < 0.8 ? [
          'Some functions could be refactored for better readability',
          'Missing inline documentation in complex methods'
        ] : [],
        recommendations: [
          'Extract complex validation logic to separate modules',
          'Add JSDoc comments to public methods',
          'Consider using more descriptive variable names'
        ],
        qualityMetrics: {
          maintainabilityIndex: Math.round(baseConfidence * 100),
          technicalDebt: baseConfidence >= 0.9 ? 'low' : baseConfidence >= 0.8 ? 'medium' : 'high',
          codeSmells: baseConfidence < 0.8 ? Math.floor(Math.random() * 3) : 0
        }
      };
      
    case 'security-specialist':
    case 'security':
      return {
        agent: role,
        confidence: Math.round(baseConfidence * 100) / 100,
        vote: baseConfidence >= 0.85 ? 'APPROVE' : 'REJECT',
        reasoning: `Security audit ${baseConfidence >= 0.85 ? 'passed' : 'identified concerns'}. ${baseConfidence >= 0.85 ? 'No critical vulnerabilities detected' : 'Security issues require attention'}.`,
        deliverables: {
          securityScore: Math.round(baseConfidence * 100),
          vulnerabilitiesFound: baseConfidence < 0.85 ? Math.floor(Math.random() * 3) : 0,
          complianceStatus: baseConfidence >= 0.9 ? 'compliant' : 'minor-issues'
        },
        issues_found: baseConfidence < 0.85 ? [
          'Missing rate limiting on authentication endpoints',
          'JWT tokens lack proper expiration validation',
          'Input sanitization needs improvement'
        ] : [],
        recommendations: [
          'Implement rate limiting middleware',
          'Add JWT token refresh mechanism',
          'Enhance input validation and sanitization',
          'Add security headers middleware'
        ],
        securityMetrics: {
          owaspCompliance: Math.round(baseConfidence * 100),
          criticalVulnerabilities: 0,
          mediumVulnerabilities: baseConfidence < 0.85 ? Math.floor(Math.random() * 2) : 0
        }
      };
      
    case 'analyst':
    case 'quality-analyst':
      return {
        agent: role,
        confidence: Math.round(baseConfidence * 100) / 100,
        vote: baseConfidence >= 0.8 ? 'APPROVE' : 'REJECT',
        reasoning: `Overall quality analysis: ${baseConfidence >= 0.9 ? 'Excellent' : baseConfidence >= 0.8 ? 'Good' : 'Needs improvement'}. Performance benchmarks ${baseConfidence >= 0.8 ? 'met' : 'below target'}.`,
        deliverables: {
          qualityScore: Math.round(baseConfidence * 100),
          performanceMetrics: {
            responseTime: baseConfidence >= 0.8 ? '<200ms' : '200-500ms',
            throughput: baseConfidence >= 0.8 ? '>1000 req/s' : '500-1000 req/s',
            memoryUsage: baseConfidence >= 0.8 ? '<100MB' : '100-200MB'
          },
          productionReadiness: baseConfidence >= 0.85 ? 'ready' : 'needs-improvement'
        },
        issues_found: baseConfidence < 0.8 ? [
          'Memory usage spikes under load',
          'Response time degradation in high concurrency',
          'Missing monitoring and alerting'
        ] : [],
        recommendations: [
          'Implement performance monitoring',
          'Add caching layer for frequently accessed data',
          'Profile and optimize memory allocation',
          'Add comprehensive logging'
        ]
      };
      
    case 'product-owner':
    case 'po':
      // Product Owner decision logic
      const consensusScore = baseConfidence;
      const criticalIssues = Math.random() < 0.2; // 20% chance of critical issues
      const minorIssues = Math.random() < 0.4;   // 40% chance of minor issues
      
      let decision, reasoning, backlogItems, blockers;
      
      if (consensusScore >= 0.90 && !criticalIssues) {
        if (minorIssues) {
          decision = 'DEFER';
          reasoning = 'Consensus validation passed with high confidence. Minor improvements identified for future iterations. Approving current work and creating backlog items for enhancements.';
          backlogItems = [
            'Add additional error handling for edge cases',
            'Improve test coverage to 95%',
            'Refactor complex validation logic for maintainability',
            'Add performance monitoring dashboard'
          ];
          blockers = [];
        } else {
          decision = 'PROCEED';
          reasoning = 'Consensus validation passed with excellent confidence. All acceptance criteria met. No critical issues identified. Ready to proceed to next phase.';
          backlogItems = [];
          blockers = [];
        }
      } else if (criticalIssues || consensusScore < 0.85) {
        decision = 'ESCALATE';
        reasoning = 'Critical issues detected requiring human review. Consensus score below acceptable threshold or critical blockers identified. Technical decisions needed.';
        backlogItems = [];
        blockers = [
          'Security vulnerabilities identified in authentication flow',
          'Performance degradation under load exceeds SLA',
          'Ambiguity in requirements for edge case handling'
        ];
      } else {
        decision = 'DEFER';
        reasoning = 'Consensus validation passed. Some minor issues identified for future work. Approving current implementation.';
        backlogItems = [
          'Enhance documentation',
          'Add integration tests for async workflows',
          'Improve error messaging'
        ];
        blockers = [];
      }
      
      return {
        agent: role,
        decision,
        confidence: Math.round(consensusScore * 100) / 100,
        reasoning,
        backlogItems,
        blockers,
        recommendations: decision === 'ESCALATE' ? [
          'Schedule stakeholder review meeting',
          'Conduct security audit with specialists',
          'Clarify requirements with product team',
          'Consider architectural alternatives'
        ] : [
          'Continue to next phase',
          'Monitor performance metrics in production',
          'Schedule follow-up for backlog items'
        ],
        decisionCriteria: {
          consensusScore,
          threshold: 0.85,
          criticalIssues,
          minorIssues,
          blockersCount: blockers.length
        }
      };
      
    default:
      // Generic agent response
      return {
        agent: role,
        confidence: Math.round(baseConfidence * 100) / 100,
        vote: baseConfidence >= 0.75 ? 'APPROVE' : 'REJECT',
        reasoning: `${role} assessment: ${baseConfidence >= 0.8 ? 'Positive' : 'Needs improvement'}. Task completed according to specifications.`,
        deliverables: {
          output: `Mock ${role} deliverable`,
          artifacts: [`${role}-output-${Date.now()}.json`]
        },
        issues_found: baseConfidence < 0.75 ? ['Generic issue identified'] : [],
        recommendations: ['Standard recommendation for improvement']
      };
  }
}

/**
 * Mock batch Task execution for multiple agents
 */
export async function BatchTask(tasks) {
  const results = await Promise.all(
    tasks.map(task => Task(task.role, task.prompt, task.type))
  );
  
  return {
    batchId: `batch-${Date.now()}`,
    results,
    totalExecutionTime: results.reduce((sum, r) => sum + r.executionTime, 0),
    timestamp: Date.now()
  };
}

/**
 * Mock Task with delay for testing timeouts
 */
export async function TaskWithDelay(role, prompt, type, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  return Task(role, prompt, type);
}

export default {
  Task,
  BatchTask,
  TaskWithDelay
};