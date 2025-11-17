/**
 * Agent Use Case Registry - Intelligent Agent Selection System
 *
 * Purpose: Maps task descriptions to optimal agent types using keyword matching,
 * domain classification, and priority-based scoring.
 *
 * Registry of 85+ specialized agent types with use case mappings.
 *
 * @module agent-use-case-registry
 */

// ============================================================================
// AGENT REGISTRY - 85+ Agent Types with Keywords & Domains
// ============================================================================

const agentRegistry = {
  // ========================================
  // 1. CORE DEVELOPMENT AGENTS
  // ========================================

  'architect': {
    keywords: ['architecture', 'system design', 'component design', 'API design',
               'database schema', 'high-level design', 'component boundaries',
               'technical decisions', 'design patterns', 'architecture decisions'],
    domains: ['architecture', 'design', 'backend', 'api'],
    priority: 9,
    description: 'System design, component architecture, API design'
  },

  'coder': {
    keywords: ['implementation', 'feature development', 'bug fix', 'coding',
               'general development', 'problem solving', 'code implementation',
               'feature completion', 'general purpose'],
    domains: ['development', 'general'],
    priority: 5,
    description: 'General implementation, feature development, bug fixes'
  },

  'backend-dev': {
    keywords: ['backend', 'server', 'API', 'REST', 'GraphQL', 'database',
               'business logic', 'authentication', 'authorization', 'server-side',
               'endpoint', 'service', 'microservice', 'integration'],
    domains: ['backend', 'api', 'database'],
    priority: 8,
    description: 'Server-side development, APIs, database work'
  },

  'react-frontend-engineer': {
    keywords: ['React', 'frontend', 'UI', 'component', 'hooks', 'state management',
               'Redux', 'Context', 'JSX', 'frontend architecture', 'SPA',
               'user interface', 'web application', 'client-side'],
    domains: ['frontend', 'ui', 'web'],
    priority: 8,
    description: 'React applications, UI components, state management'
  },

  'mobile-dev': {
    keywords: ['React Native', 'mobile', 'iOS', 'Android', 'cross-platform',
               'native modules', 'mobile UI', 'mobile UX', 'app development',
               'smartphone', 'tablet', 'mobile app'],
    domains: ['mobile', 'frontend'],
    priority: 10,
    description: 'React Native, iOS/Android development'
  },

  'rust-mvp-developer': {
    keywords: ['Rust', 'MVP', 'prototype', 'rapid prototyping', 'Rust basics',
               'simple implementation', 'proof of concept', 'Rust POC'],
    domains: ['rust', 'development', 'prototyping'],
    priority: 6,
    description: 'Rust prototyping, MVP development'
  },

  'rust-enterprise-developer': {
    keywords: ['Rust', 'enterprise', 'production', 'advanced Rust', 'performance',
               'optimization', 'production patterns', 'Rust production',
               'memory safety', 'concurrency', 'async Rust'],
    domains: ['rust', 'enterprise', 'performance'],
    priority: 9,
    description: 'Production Rust, enterprise features'
  },

  'rust-developer': {
    keywords: ['Rust', 'Rust implementation', 'memory safety', 'Rust performance',
               'Rust development', 'systems programming', 'Rust library'],
    domains: ['rust', 'development'],
    priority: 7,
    description: 'General Rust development'
  },

  // ========================================
  // 2. VALIDATION & QUALITY ASSURANCE
  // ========================================

  'tester': {
    keywords: ['testing', 'test', 'unit test', 'integration test', 'TDD',
               'test-driven development', 'quality assurance', 'QA',
               'test strategy', 'test coverage', 'jest', 'mocha', 'pytest'],
    domains: ['testing', 'quality', 'validation'],
    priority: 8,
    description: 'Test creation, TDD, quality assurance'
  },

  'interaction-tester': {
    keywords: ['UI testing', 'user flow', 'accessibility', 'interaction testing',
               'user experience testing', 'E2E', 'end-to-end', 'accessibility validation',
               'WCAG', 'user interaction', 'usability testing'],
    domains: ['testing', 'ui', 'accessibility'],
    priority: 7,
    description: 'UI testing, user flows, accessibility'
  },

  'playwright-tester': {
    keywords: ['Playwright', 'browser automation', 'end-to-end', 'E2E testing',
               'browser testing', 'web testing', 'automation', 'Selenium',
               'web application testing', 'cross-browser'],
    domains: ['testing', 'automation', 'web'],
    priority: 8,
    description: 'Browser automation, end-to-end testing'
  },

  'production-validator': {
    keywords: ['production', 'deployment', 'production readiness', 'real testing',
               'production validation', 'deployment validation', 'integration testing',
               'real-world testing', 'smoke testing', 'sanity testing'],
    domains: ['testing', 'deployment', 'validation'],
    priority: 9,
    description: 'Production readiness, real integration testing'
  },

  'code-analyzer': {
    keywords: ['code review', 'quality assessment', 'technical debt',
               'code analysis', 'quality metrics', 'code quality',
               'static analysis', 'code standards', 'linting'],
    domains: ['analysis', 'quality', 'validation'],
    priority: 7,
    description: 'Code review, quality assessment, technical debt'
  },

  'code-quality-validator': {
    keywords: ['quality validation', 'architecture compliance', 'code standards',
               'advanced quality', 'deep analysis', 'compliance checking',
               'quality gates', 'code metrics'],
    domains: ['analysis', 'quality', 'compliance'],
    priority: 8,
    description: 'Deep quality analysis, architecture compliance'
  },

  'code-booster': {
    keywords: ['optimization', 'performance', 'refactoring', 'code improvement',
               'performance optimization', 'refactor', 'code enhancement',
               'optimization strategies', 'speed improvement'],
    domains: ['optimization', 'performance', 'refactoring'],
    priority: 7,
    description: 'Performance optimization, refactoring'
  },

  'perf-analyzer': {
    keywords: ['performance analysis', 'bottleneck', 'profiling', 'performance',
               'optimization', 'slow query', 'performance testing',
               'bottleneck detection', 'latency', 'throughput'],
    domains: ['performance', 'analysis', 'optimization'],
    priority: 8,
    description: 'Performance analysis, bottleneck identification'
  },

  // ========================================
  // 3. SECURITY SPECIALISTS
  // ========================================

  'security-specialist': {
    keywords: ['security', 'security audit', 'vulnerability', 'penetration testing',
               'secure coding', 'security assessment', 'vulnerability scanning',
               'OWASP', 'SQL injection', 'XSS', 'CSRF', 'security best practices'],
    domains: ['security', 'audit', 'validation'],
    priority: 10,
    description: 'Security audits, vulnerability assessment, security implementation'
  },

  'security-architect-persona': {
    keywords: ['security architecture', 'Zero Trust', 'threat modeling',
               'security design', 'security patterns', 'defense in depth',
               'security framework', 'security strategy'],
    domains: ['security', 'architecture', 'design'],
    priority: 9,
    description: 'Security architecture design, Zero Trust planning'
  },

  // ========================================
  // 4. ARCHITECTURE & SYSTEM DESIGN
  // ========================================

  'system-architect': {
    keywords: ['enterprise architecture', 'distributed systems', 'scalability',
               'large-scale system', 'system design', 'microservices architecture',
               'cloud architecture', 'system integration', 'scalability planning'],
    domains: ['architecture', 'enterprise', 'scalability'],
    priority: 10,
    description: 'Enterprise architecture, distributed systems'
  },

  'system-architect-persona': {
    keywords: ['technical leadership', 'architecture decisions', 'system evolution',
               'architecture decision making', 'technical strategy',
               'architecture governance', 'technology roadmap'],
    domains: ['architecture', 'leadership', 'strategy'],
    priority: 9,
    description: 'Technical leadership, architecture decisions'
  },

  'state-architect': {
    keywords: ['state management', 'data flow', 'state synchronization',
               'state patterns', 'Redux', 'MobX', 'state architecture',
               'data flow design', 'state machine'],
    domains: ['architecture', 'state', 'frontend'],
    priority: 7,
    description: 'State management, data flow design'
  },

  // ========================================
  // 5. DEVOPS & INFRASTRUCTURE
  // ========================================

  'devops-engineer': {
    keywords: ['CI/CD', 'Docker', 'Kubernetes', 'cloud', 'infrastructure',
               'deployment', 'pipeline', 'containerization', 'orchestration',
               'infrastructure as code', 'Terraform', 'AWS', 'Azure', 'GCP'],
    domains: ['devops', 'infrastructure', 'deployment'],
    priority: 8,
    description: 'CI/CD, Docker, Kubernetes, cloud infrastructure'
  },

  'performance-benchmarker': {
    keywords: ['benchmarking', 'performance testing', 'load testing', 'monitoring',
               'performance measurement', 'stress testing', 'capacity planning',
               'performance monitoring', 'APM'],
    domains: ['performance', 'testing', 'monitoring'],
    priority: 7,
    description: 'Performance testing, benchmarking, monitoring'
  },

  // ========================================
  // 6. COORDINATION & PROJECT MANAGEMENT
  // ========================================

  'coordinator-hybrid': {
    keywords: ['coordination', 'multi-agent', 'task orchestration', 'team coordination',
               'task decomposition', 'agent selection', 'progress monitoring',
               'workflow coordination', 'orchestration'],
    domains: ['coordination', 'orchestration', 'management'],
    priority: 9,
    description: 'Primary multi-agent coordination, task orchestration'
  },

  'task-coordinator': {
    keywords: ['workflow', 'task breakdown', 'complex coordination', 'dependency management',
               'workflow orchestration', 'task management', 'project coordination'],
    domains: ['coordination', 'workflow', 'management'],
    priority: 8,
    description: 'Complex workflow management, task breakdown'
  },

  'adaptive-coordinator': {
    keywords: ['adaptive', 'dynamic team', 'topology switching', 'team formation',
               'adaptive coordination', 'dynamic configuration', 'intelligent selection'],
    domains: ['coordination', 'adaptive', 'management'],
    priority: 8,
    description: 'Dynamic team formation, topology switching'
  },

  'adaptive-coordinator-enhanced': {
    keywords: ['enhanced adaptive', 'advanced coordination', 'team optimization',
               'intelligent coordination', 'enhanced capabilities'],
    domains: ['coordination', 'adaptive', 'optimization'],
    priority: 8,
    description: 'Advanced adaptive coordination with enhanced capabilities'
  },

  'hierarchical-coordinator': {
    keywords: ['hierarchical', 'large team', 'multi-level coordination',
               'hierarchical structure', 'team hierarchy', 'multi-tier'],
    domains: ['coordination', 'hierarchy', 'management'],
    priority: 7,
    description: 'Large team coordination, hierarchical structures'
  },

  'mesh-coordinator': {
    keywords: ['mesh', 'flat team', 'peer-to-peer', 'mesh coordination',
               'decentralized coordination', 'P2P'],
    domains: ['coordination', 'mesh', 'p2p'],
    priority: 7,
    description: 'Flat team coordination, mesh communication'
  },

  'product-owner': {
    keywords: ['product', 'feature decisions', 'scope management', 'prioritization',
               'product decisions', 'backlog', 'feature prioritization',
               'requirements', 'stakeholder management'],
    domains: ['product', 'management', 'planning'],
    priority: 8,
    description: 'Feature decisions, scope management, prioritization'
  },

  'planner': {
    keywords: ['planning', 'task planning', 'project organization', 'milestone planning',
               'project planning', 'task breakdown', 'roadmap', 'timeline'],
    domains: ['planning', 'management', 'organization'],
    priority: 7,
    description: 'Task planning, project organization, milestone planning'
  },

  // ========================================
  // 7. SPECIALIZED DOMAINS
  // ========================================

  'consensus-builder': {
    keywords: ['consensus', 'distributed consensus', 'team agreement',
               'consensus algorithm', 'distributed decision', 'voting'],
    domains: ['distributed', 'consensus', 'coordination'],
    priority: 7,
    description: 'Distributed consensus, team agreement'
  },

  'api-docs': {
    keywords: ['API documentation', 'OpenAPI', 'Swagger', 'API specification',
               'documentation', 'API docs', 'REST documentation', 'GraphQL schema'],
    domains: ['documentation', 'api', 'specification'],
    priority: 6,
    description: 'API documentation, OpenAPI specifications'
  },

  'api-designer-persona': {
    keywords: ['API design', 'REST design', 'GraphQL design', 'API architecture',
               'interface design', 'API principles', 'API patterns'],
    domains: ['api', 'design', 'architecture'],
    priority: 8,
    description: 'API architecture, REST/GraphQL design'
  },

  'ui-designer': {
    keywords: ['UI design', 'user interface', 'component design', 'UX',
               'user experience', 'design system', 'visual design', 'UI components'],
    domains: ['ui', 'design', 'frontend'],
    priority: 7,
    description: 'User interface design, component design'
  },

  'accessibility-advocate-persona': {
    keywords: ['accessibility', 'WCAG', 'inclusive design', 'a11y',
               'accessibility compliance', 'screen reader', 'accessibility testing'],
    domains: ['accessibility', 'ui', 'compliance'],
    priority: 7,
    description: 'Accessibility compliance, inclusive design'
  },

  'power-user-persona': {
    keywords: ['power user', 'advanced workflow', 'efficiency', 'keyboard shortcuts',
               'advanced features', 'workflow optimization', 'productivity'],
    domains: ['ux', 'optimization', 'productivity'],
    priority: 5,
    description: 'Advanced user workflows, efficiency optimization'
  },

  // ========================================
  // 8. CFN LOOP SPECIALISTS
  // ========================================

  'cfn-coordinator-mvp': {
    keywords: ['CFN', 'MVP', 'rapid iteration', 'prototyping', 'fast development',
               'cost optimization', 'quick iteration', 'proof of concept'],
    domains: ['cfn', 'coordination', 'mvp'],
    priority: 7,
    description: 'Fast iteration, prototyping, cost optimization'
  },

  'cfn-coordinator-standard': {
    keywords: ['CFN', 'standard', 'balanced development', 'quality gates',
               'standard quality', 'reliable delivery'],
    domains: ['cfn', 'coordination', 'standard'],
    priority: 7,
    description: 'Balanced development, standard quality gates'
  },

  'cfn-coordinator-enterprise': {
    keywords: ['CFN', 'enterprise', 'compliance', 'enterprise standards',
               'comprehensive quality', 'enterprise-grade'],
    domains: ['cfn', 'coordination', 'enterprise'],
    priority: 8,
    description: 'Enterprise-grade development, full compliance'
  },

  'cfn-coordinator-unified': {
    keywords: ['CFN', 'unified', 'comprehensive coordination', 'full-featured CFN'],
    domains: ['cfn', 'coordination', 'unified'],
    priority: 7,
    description: 'Unified CFN coordination with comprehensive features'
  },

  'goal-planner': {
    keywords: ['goal planning', 'A* search', 'planning optimization', 'adaptive replanning',
               'goal-oriented planning', 'search algorithm', 'planning'],
    domains: ['planning', 'optimization', 'algorithm'],
    priority: 6,
    description: 'Complex planning, A* search optimization'
  },

  'product-owner-agent': {
    keywords: ['product strategy', 'backlog management', 'stakeholder management',
               'product decisions', 'backlog prioritization'],
    domains: ['product', 'management', 'strategy'],
    priority: 7,
    description: 'Product decisions, backlog management'
  },

  // ========================================
  // 9. ANALYSIS & RESEARCH
  // ========================================

  'analyst': {
    keywords: ['analysis', 'investigation', 'assessment', 'problem analysis',
               'investigative work', 'analytical assessment', 'data analysis'],
    domains: ['analysis', 'investigation', 'research'],
    priority: 6,
    description: 'General analysis, investigation, assessment'
  },

  'researcher': {
    keywords: ['research', 'discovery', 'competitive analysis', 'investigation',
               'information gathering', 'research methodology', 'market research'],
    domains: ['research', 'analysis', 'discovery'],
    priority: 7,
    description: 'Research, discovery, competitive analysis'
  },

  'architecture': {
    keywords: ['architecture evaluation', 'architecture analysis', 'design pattern analysis',
               'architecture assessment', 'system evaluation'],
    domains: ['architecture', 'analysis', 'evaluation'],
    priority: 6,
    description: 'Architecture analysis, assessment'
  },

  'analyze-code-quality': {
    keywords: ['code quality analysis', 'improvement recommendations', 'best practices',
               'quality assessment', 'code improvement', 'quality strategy'],
    domains: ['analysis', 'quality', 'improvement'],
    priority: 6,
    description: 'Code quality analysis, improvement recommendations'
  },

  // ========================================
  // 10. SPECIALIZED DEVELOPMENT PATTERNS
  // ========================================

  'base-template-generator': {
    keywords: ['template', 'scaffolding', 'boilerplate', 'code generation',
               'project initialization', 'template creation', 'starter kit'],
    domains: ['generation', 'tooling', 'automation'],
    priority: 5,
    description: 'Template creation, scaffolding, boilerplate'
  },

  'specification': {
    keywords: ['specification', 'requirements', 'technical specification',
               'requirements documentation', 'spec writing'],
    domains: ['documentation', 'specification', 'requirements'],
    priority: 6,
    description: 'Specification writing, requirements analysis'
  },

  'pseudocode': {
    keywords: ['pseudocode', 'algorithm design', 'logic planning', 'algorithm',
               'logic design', 'algorithm development'],
    domains: ['algorithm', 'design', 'planning'],
    priority: 5,
    description: 'Algorithm design, logic planning'
  },

  'refinement': {
    keywords: ['refinement', 'code refinement', 'optimization', 'quality improvement',
               'code enhancement', 'quality enhancement'],
    domains: ['refinement', 'optimization', 'quality'],
    priority: 5,
    description: 'Code refinement, optimization, quality improvement'
  },

  'specification-optimized': {
    keywords: ['optimized specification', 'high-quality spec', 'specification optimization',
               'optimized documentation'],
    domains: ['specification', 'optimization', 'documentation'],
    priority: 6,
    description: 'Optimized specification creation'
  },

  // ========================================
  // 11. TESTING & VALIDATION SPECIALISTS
  // ========================================

  'tdd-london-swarm': {
    keywords: ['London School TDD', 'mock-driven', 'outside-in', 'behavior verification',
               'mock-driven development', 'TDD London', 'mocking'],
    domains: ['testing', 'tdd', 'methodology'],
    priority: 6,
    description: 'London School TDD, mock-driven development'
  },

  // ========================================
  // 12. CONTEXT & MEMORY MANAGEMENT
  // ========================================

  'context-curator': {
    keywords: ['context management', 'context organization', 'consolidation',
               'information organization', 'context consolidation'],
    domains: ['context', 'management', 'organization'],
    priority: 5,
    description: 'Context organization, consolidation'
  },

  'context-reflector': {
    keywords: ['learning extraction', 'pattern recognition', 'lessons learned',
               'reflection', 'knowledge extraction', 'pattern analysis'],
    domains: ['context', 'learning', 'reflection'],
    priority: 5,
    description: 'Learning extraction, pattern recognition'
  },

  // ========================================
  // 13. ADDITIONAL SPECIALIZED AGENTS
  // ========================================

  'coordinator': {
    keywords: ['coordination', 'orchestration', 'task management', 'agent coordination',
               'workflow management', 'team coordination'],
    domains: ['coordination', 'management', 'orchestration'],
    priority: 7,
    description: 'General coordination and orchestration'
  },

  'cli-agent-optimizer': {
    keywords: ['CLI optimization', 'command-line', 'performance optimization',
               'CLI tools', 'command optimization', 'CLI efficiency'],
    domains: ['optimization', 'cli', 'tooling'],
    priority: 6,
    description: 'CLI tool optimization and efficiency'
  },

  'cto-agent': {
    keywords: ['CTO', 'technical leadership', 'technology strategy', 'technical vision',
               'engineering leadership', 'technology roadmap', 'strategic decisions'],
    domains: ['leadership', 'strategy', 'management'],
    priority: 9,
    description: 'Technical leadership and strategy'
  },

  'dev-backend-api': {
    keywords: ['backend API', 'API development', 'REST development', 'API implementation',
               'backend services', 'microservices API'],
    domains: ['backend', 'api', 'development'],
    priority: 8,
    description: 'Backend API development specialist'
  },

  'docs-api-openapi': {
    keywords: ['OpenAPI', 'API documentation', 'Swagger documentation', 'API schema',
               'REST documentation', 'API specification'],
    domains: ['documentation', 'api', 'specification'],
    priority: 7,
    description: 'OpenAPI and Swagger documentation'
  },

  'github-commit-agent': {
    keywords: ['git commit', 'version control', 'commit messages', 'git workflow',
               'commit strategy', 'git best practices'],
    domains: ['git', 'version-control', 'tooling'],
    priority: 5,
    description: 'Git commit and version control management'
  },

  'npm-package-specialist': {
    keywords: ['npm', 'package management', 'dependencies', 'npm packages',
               'package.json', 'node modules', 'package publishing'],
    domains: ['npm', 'tooling', 'dependencies'],
    priority: 6,
    description: 'NPM package management and publishing'
  },

  'playwright-agent': {
    keywords: ['Playwright', 'browser testing', 'E2E automation', 'web testing',
               'browser automation', 'test automation'],
    domains: ['testing', 'automation', 'e2e'],
    priority: 7,
    description: 'Playwright automation and testing'
  },

  'code-reviewer': {
    keywords: ['code review', 'peer review', 'review comments', 'code critique',
               'review feedback', 'code assessment', 'quality validation', 'security review'],
    domains: ['review', 'quality', 'analysis', 'security'],
    priority: 7,
    description: 'Code review, quality validation, and security assessment'
  },

  'test-coordinator': {
    keywords: ['test coordination', 'test orchestration', 'test strategy',
               'test planning', 'testing workflow', 'test management'],
    domains: ['testing', 'coordination', 'strategy'],
    priority: 7,
    description: 'Test coordination and strategy'
  },

  'spec-mobile-react-native': {
    keywords: ['React Native spec', 'mobile specification', 'React Native architecture',
               'mobile app design', 'React Native planning'],
    domains: ['mobile', 'specification', 'react-native'],
    priority: 6,
    description: 'React Native specification and architecture'
  },

  // ========================================
  // 14. DOCUMENTATION & CONTENT
  // ========================================

  'technical-writer': {
    keywords: ['technical writing', 'documentation', 'technical docs', 'user guides',
               'API documentation', 'tutorials', 'technical content'],
    domains: ['documentation', 'content', 'writing'],
    priority: 6,
    description: 'Technical documentation and content creation'
  },

  'markdown-specialist': {
    keywords: ['Markdown', 'documentation format', 'README', 'markdown formatting',
               'markdown documentation', 'markdown authoring'],
    domains: ['documentation', 'markdown', 'content'],
    priority: 5,
    description: 'Markdown documentation specialist'
  },

  // ========================================
  // 15. DATA & DATABASE
  // ========================================

  'database-architect': {
    keywords: ['database design', 'schema design', 'database architecture',
               'data modeling', 'relational database', 'NoSQL', 'database optimization'],
    domains: ['database', 'architecture', 'data'],
    priority: 8,
    description: 'Database architecture and schema design'
  },

  'sql-specialist': {
    keywords: ['SQL', 'query optimization', 'database queries', 'SQL performance',
               'relational database', 'PostgreSQL', 'MySQL'],
    domains: ['database', 'sql', 'optimization'],
    priority: 7,
    description: 'SQL optimization and database queries'
  },

  'data-engineer': {
    keywords: ['data pipeline', 'ETL', 'data processing', 'big data',
               'data transformation', 'data warehouse', 'data integration'],
    domains: ['data', 'engineering', 'pipeline'],
    priority: 7,
    description: 'Data pipeline and ETL engineering'
  },

  // ========================================
  // 16. FRONTEND SPECIALISTS
  // ========================================

  'css-specialist': {
    keywords: ['CSS', 'styling', 'responsive design', 'CSS architecture',
               'Sass', 'LESS', 'CSS-in-JS', 'Tailwind', 'styling framework'],
    domains: ['frontend', 'css', 'ui'],
    priority: 6,
    description: 'CSS and styling specialist'
  },

  'javascript-specialist': {
    keywords: ['JavaScript', 'ES6', 'modern JavaScript', 'JavaScript patterns',
               'async/await', 'promises', 'JavaScript optimization'],
    domains: ['frontend', 'javascript', 'development'],
    priority: 7,
    description: 'JavaScript development specialist'
  },

  'typescript-specialist': {
    keywords: ['TypeScript', 'type safety', 'TypeScript patterns', 'type definitions',
               'TypeScript configuration', 'strict typing'],
    domains: ['frontend', 'typescript', 'development'],
    priority: 7,
    description: 'TypeScript development and type safety'
  },

  // ========================================
  // 17. CLOUD & INFRASTRUCTURE
  // ========================================

  'aws-specialist': {
    keywords: ['AWS', 'Amazon Web Services', 'cloud infrastructure', 'EC2', 'S3',
               'Lambda', 'CloudFormation', 'AWS services'],
    domains: ['cloud', 'aws', 'infrastructure'],
    priority: 8,
    description: 'AWS cloud infrastructure specialist'
  },

  'kubernetes-specialist': {
    keywords: ['Kubernetes', 'K8s', 'container orchestration', 'pods', 'deployments',
               'Helm', 'Kubernetes architecture'],
    domains: ['infrastructure', 'kubernetes', 'orchestration'],
    priority: 8,
    description: 'Kubernetes orchestration specialist'
  },

  'docker-specialist': {
    keywords: ['Docker', 'containerization', 'Dockerfile', 'Docker Compose',
               'container optimization', 'Docker images'],
    domains: ['infrastructure', 'docker', 'containers'],
    priority: 7,
    description: 'Docker containerization specialist'
  },

  // ========================================
  // 18. MONITORING & OBSERVABILITY
  // ========================================

  'monitoring-specialist': {
    keywords: ['monitoring', 'observability', 'metrics', 'logging', 'tracing',
               'Prometheus', 'Grafana', 'monitoring setup'],
    domains: ['monitoring', 'observability', 'devops'],
    priority: 7,
    description: 'Monitoring and observability specialist'
  },

  'logging-specialist': {
    keywords: ['logging', 'log aggregation', 'log analysis', 'ELK stack',
               'log management', 'centralized logging'],
    domains: ['logging', 'observability', 'analysis'],
    priority: 6,
    description: 'Logging and log management specialist'
  },

  // ========================================
  // 19. AI/ML SPECIALISTS
  // ========================================

  'ml-engineer': {
    keywords: ['machine learning', 'ML', 'model training', 'AI', 'neural networks',
               'deep learning', 'ML pipeline', 'model deployment'],
    domains: ['ml', 'ai', 'data'],
    priority: 8,
    description: 'Machine learning and AI engineering'
  },

  'data-scientist': {
    keywords: ['data science', 'data analysis', 'statistical analysis', 'modeling',
               'predictive analytics', 'data visualization'],
    domains: ['data', 'science', 'analysis'],
    priority: 7,
    description: 'Data science and statistical analysis'
  }
};

// ============================================================================
// DOMAIN TAXONOMY - Hierarchical Domain Classification
// ============================================================================

const domainTaxonomy = {
  'development': {
    subcategories: ['frontend', 'backend', 'mobile', 'rust', 'general'],
    weight: 1.0
  },
  'architecture': {
    subcategories: ['design', 'enterprise', 'scalability', 'state'],
    weight: 1.2
  },
  'testing': {
    subcategories: ['unit', 'integration', 'e2e', 'automation', 'validation'],
    weight: 1.0
  },
  'security': {
    subcategories: ['audit', 'cryptography', 'compliance', 'blockchain'],
    weight: 1.3
  },
  'performance': {
    subcategories: ['optimization', 'analysis', 'monitoring', 'benchmarking'],
    weight: 1.1
  },
  'coordination': {
    subcategories: ['orchestration', 'workflow', 'management', 'adaptive'],
    weight: 0.9
  },
  'api': {
    subcategories: ['design', 'documentation', 'rest', 'graphql'],
    weight: 1.0
  },
  'distributed': {
    subcategories: ['consensus', 'p2p', 'synchronization', 'blockchain'],
    weight: 1.1
  },
  'ui': {
    subcategories: ['design', 'accessibility', 'components', 'ux'],
    weight: 1.0
  },
  'analysis': {
    subcategories: ['quality', 'investigation', 'research', 'evaluation'],
    weight: 0.9
  }
};

// ============================================================================
// KEYWORD CACHE - Performance Optimization
// ============================================================================

let keywordCache = null;
let domainCache = null;

/**
 * Build keyword index for fast lookups
 * Creates inverted index: keyword -> [agent1, agent2, ...]
 */
function buildKeywordIndex() {
  if (keywordCache) return keywordCache;

  const index = new Map();

  for (const [agentType, config] of Object.entries(agentRegistry)) {
    config.keywords.forEach(keyword => {
      const normalizedKeyword = keyword.toLowerCase();
      if (!index.has(normalizedKeyword)) {
        index.set(normalizedKeyword, []);
      }
      index.get(normalizedKeyword).push({
        type: agentType,
        priority: config.priority,
        domains: config.domains
      });
    });
  }

  keywordCache = index;
  return index;
}

/**
 * Build domain index for fast domain-based lookups
 * Creates inverted index: domain -> [agent1, agent2, ...]
 */
function buildDomainIndex() {
  if (domainCache) return domainCache;

  const index = new Map();

  for (const [agentType, config] of Object.entries(agentRegistry)) {
    config.domains.forEach(domain => {
      if (!index.has(domain)) {
        index.set(domain, []);
      }
      index.get(domain).push({
        type: agentType,
        priority: config.priority,
        keywords: config.keywords
      });
    });
  }

  domainCache = index;
  return index;
}

// ============================================================================
// SCORING ALGORITHM
// ============================================================================

/**
 * Calculate match score for an agent given a task description
 *
 * Scoring factors:
 * - Keyword matches (exact and partial)
 * - Domain relevance
 * - Agent priority
 * - Keyword density
 *
 * @param {string} agentType - Agent type identifier
 * @param {string} taskDescription - Task description to match
 * @param {Set<string>} detectedDomains - Domains detected in task
 * @returns {number} Score (0-100)
 */
function calculateScore(agentType, taskDescription, detectedDomains) {
  const config = agentRegistry[agentType];
  if (!config) return 0;

  const taskLower = taskDescription.toLowerCase();
  const taskWords = taskLower.split(/\s+/);

  let score = 0;

  // 1. Keyword matching (40 points max)
  let keywordMatches = 0;
  let exactMatches = 0;

  config.keywords.forEach(keyword => {
    const keywordLower = keyword.toLowerCase();

    // Exact match (full keyword found)
    if (taskLower.includes(keywordLower)) {
      exactMatches++;
      keywordMatches += 2; // Double weight for exact matches
    }

    // Partial match (keyword words found)
    const keywordWords = keywordLower.split(/\s+/);
    const matchedWords = keywordWords.filter(word =>
      taskWords.some(taskWord => taskWord.includes(word) || word.includes(taskWord))
    );

    if (matchedWords.length > 0) {
      keywordMatches += matchedWords.length / keywordWords.length;
    }
  });

  // Normalize keyword score (0-40)
  const maxKeywords = config.keywords.length * 2;
  score += Math.min(40, (keywordMatches / maxKeywords) * 40);

  // 2. Domain relevance (30 points max)
  let domainScore = 0;
  config.domains.forEach(domain => {
    if (detectedDomains.has(domain)) {
      const domainWeight = domainTaxonomy[domain]?.weight || 1.0;
      domainScore += 10 * domainWeight;
    }
  });
  score += Math.min(30, domainScore);

  // 3. Agent priority (20 points max)
  score += (config.priority / 10) * 20;

  // 4. Keyword density bonus (10 points max)
  const keywordDensity = exactMatches / Math.max(1, taskWords.length);
  score += Math.min(10, keywordDensity * 100);

  return Math.min(100, score);
}

/**
 * Detect domains from task description
 *
 * @param {string} taskDescription - Task description
 * @returns {Set<string>} Set of detected domains
 */
function detectDomains(taskDescription) {
  const domains = new Set();
  const taskLower = taskDescription.toLowerCase();

  // Check domain keywords
  const domainKeywords = {
    'frontend': ['frontend', 'ui', 'react', 'component', 'web', 'client-side'],
    'backend': ['backend', 'server', 'api', 'database', 'service', 'server-side'],
    'mobile': ['mobile', 'ios', 'android', 'react native', 'app'],
    'security': ['security', 'vulnerability', 'authentication', 'authorization', 'encryption'],
    'testing': ['test', 'testing', 'qa', 'validation', 'e2e', 'unit test'],
    'performance': ['performance', 'optimization', 'slow', 'bottleneck', 'speed'],
    'architecture': ['architecture', 'design', 'system design', 'scalability'],
    'devops': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'infrastructure'],
    'api': ['api', 'rest', 'graphql', 'endpoint', 'interface'],
    'distributed': ['distributed', 'consensus', 'blockchain', 'p2p']
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(keyword => taskLower.includes(keyword))) {
      domains.add(domain);
    }
  }

  return domains;
}

// ============================================================================
// AGENT SELECTION API
// ============================================================================

/**
 * Select best-matching agent for a given task description
 *
 * @param {string} taskDescription - Task description to match
 * @param {Object} options - Selection options
 * @param {number} options.minScore - Minimum score threshold (default: 20)
 * @param {string[]} options.excludeAgents - Agents to exclude
 * @param {string[]} options.preferDomains - Domains to prefer
 * @returns {Object} Selected agent info
 */
function selectAgent(taskDescription, options = {}) {
  const {
    minScore = 20,
    excludeAgents = [],
    preferDomains = []
  } = options;

  // Build indexes if not cached
  buildKeywordIndex();
  buildDomainIndex();

  // Detect domains
  const detectedDomains = detectDomains(taskDescription);
  preferDomains.forEach(domain => detectedDomains.add(domain));

  // Score all agents
  const scores = [];

  for (const agentType of Object.keys(agentRegistry)) {
    if (excludeAgents.includes(agentType)) continue;

    const score = calculateScore(agentType, taskDescription, detectedDomains);

    if (score >= minScore) {
      scores.push({
        type: agentType,
        score,
        config: agentRegistry[agentType]
      });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return best match or fallback
  if (scores.length === 0) {
    return {
      type: 'coder',
      score: 0,
      config: agentRegistry['coder'],
      fallback: true,
      reason: 'No agents met minimum score threshold'
    };
  }

  return {
    type: scores[0].type,
    score: scores[0].score,
    config: scores[0].config,
    fallback: false,
    alternatives: scores.slice(1, 5) // Top 4 alternatives
  };
}

/**
 * Select multiple agents for a complex task
 *
 * @param {string} taskDescription - Task description
 * @param {Object} options - Selection options
 * @param {number} options.count - Number of agents to select (default: 3)
 * @param {number} options.minScore - Minimum score threshold (default: 30)
 * @param {boolean} options.diverseDomains - Ensure domain diversity (default: true)
 * @returns {Array} Selected agents
 */
function selectMultipleAgents(taskDescription, options = {}) {
  const {
    count = 3,
    minScore = 30,
    diverseDomains = true
  } = options;

  // Build indexes
  buildKeywordIndex();
  buildDomainIndex();

  // Detect domains
  const detectedDomains = detectDomains(taskDescription);

  // Score all agents
  const scores = [];

  for (const agentType of Object.keys(agentRegistry)) {
    const score = calculateScore(agentType, taskDescription, detectedDomains);

    if (score >= minScore) {
      scores.push({
        type: agentType,
        score,
        config: agentRegistry[agentType]
      });
    }
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score);

  if (!diverseDomains) {
    return scores.slice(0, count);
  }

  // Ensure domain diversity
  const selected = [];
  const usedDomains = new Set();

  for (const agent of scores) {
    if (selected.length >= count) break;

    // Check if agent adds new domain coverage
    const newDomains = agent.config.domains.filter(d => !usedDomains.has(d));

    if (newDomains.length > 0 || selected.length === 0) {
      selected.push(agent);
      agent.config.domains.forEach(d => usedDomains.add(d));
    }
  }

  // Fill remaining slots if needed
  if (selected.length < count) {
    for (const agent of scores) {
      if (selected.length >= count) break;
      if (!selected.find(a => a.type === agent.type)) {
        selected.push(agent);
      }
    }
  }

  return selected;
}

/**
 * Get agents by domain
 *
 * @param {string} domain - Domain identifier
 * @param {Object} options - Filter options
 * @param {number} options.minPriority - Minimum priority (default: 5)
 * @returns {Array} Matching agents
 */
function getAgentsByDomain(domain, options = {}) {
  const { minPriority = 5 } = options;

  buildDomainIndex();

  const agents = domainCache.get(domain) || [];

  return agents
    .filter(agent => agent.priority >= minPriority)
    .sort((a, b) => b.priority - a.priority)
    .map(agent => ({
      type: agent.type,
      priority: agent.priority,
      config: agentRegistry[agent.type]
    }));
}

/**
 * Get registry statistics
 *
 * @returns {Object} Registry statistics
 */
function getRegistryStats() {
  const totalAgents = Object.keys(agentRegistry).length;
  const domainCount = new Set();
  const keywordCount = new Set();

  Object.values(agentRegistry).forEach(config => {
    config.domains.forEach(d => domainCount.add(d));
    config.keywords.forEach(k => keywordCount.add(k.toLowerCase()));
  });

  return {
    totalAgents,
    totalDomains: domainCount.size,
    totalKeywords: keywordCount.size,
    averageKeywordsPerAgent: (keywordCount.size / totalAgents).toFixed(2),
    averageDomainsPerAgent: (domainCount.size / totalAgents).toFixed(2)
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  agentRegistry,
  domainTaxonomy,
  selectAgent,
  selectMultipleAgents,
  getAgentsByDomain,
  buildKeywordIndex,
  buildDomainIndex,
  detectDomains,
  calculateScore,
  getRegistryStats
};
