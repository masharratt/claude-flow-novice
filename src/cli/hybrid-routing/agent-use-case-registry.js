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
    description: 'Testing, quality assurance, test strategy'
  },

  'e2e-tester': {
    keywords: ['end-to-end', 'E2E', 'integration testing', 'user flow',
               'cypress', 'playwright', 'selenium', 'browser testing',
               'full system test', 'workflow testing'],
    domains: ['testing', 'e2e', 'validation'],
    priority: 7,
    description: 'End-to-end testing, user workflows'
  },

  'test-automation-specialist': {
    keywords: ['test automation', 'automation framework', 'CI/CD testing',
               'automated tests', 'test pipeline', 'continuous testing'],
    domains: ['testing', 'automation', 'ci-cd'],
    priority: 7,
    description: 'Test automation, CI/CD integration'
  },

  'reviewer': {
    keywords: ['code review', 'PR review', 'review', 'quality review',
               'code quality', 'best practices review', 'peer review'],
    domains: ['quality', 'validation', 'review'],
    priority: 7,
    description: 'Code review, quality validation'
  },

  'quality-gate-validator': {
    keywords: ['quality gates', 'validation', 'quality criteria', 'gate validation',
               'quality standards', 'compliance validation'],
    domains: ['quality', 'validation', 'compliance'],
    priority: 6,
    description: 'Quality gate validation, standards enforcement'
  },

  // ========================================
  // 3. SECURITY SPECIALISTS
  // ========================================

  'security-auditor': {
    keywords: ['security audit', 'vulnerability', 'penetration testing',
               'security assessment', 'security compliance', 'security scanning',
               'threat analysis', 'security hardening', 'OWASP'],
    domains: ['security', 'audit', 'compliance'],
    priority: 9,
    description: 'Security audits, vulnerability assessment'
  },

  'cryptography-specialist': {
    keywords: ['cryptography', 'encryption', 'hashing', 'PKI', 'TLS',
               'cryptographic protocols', 'key management', 'cipher'],
    domains: ['security', 'cryptography', 'encryption'],
    priority: 8,
    description: 'Cryptography, encryption, secure protocols'
  },

  'compliance-auditor': {
    keywords: ['compliance', 'regulatory', 'GDPR', 'HIPAA', 'PCI-DSS',
               'compliance standards', 'regulatory compliance', 'audit'],
    domains: ['security', 'compliance', 'audit'],
    priority: 8,
    description: 'Regulatory compliance, standards audit'
  },

  'blockchain-security': {
    keywords: ['blockchain security', 'smart contract audit', 'DeFi security',
               'consensus security', 'crypto security', 'blockchain audit'],
    domains: ['security', 'blockchain', 'audit'],
    priority: 9,
    description: 'Blockchain security, smart contract audits'
  },

  // ========================================
  // 4. PERFORMANCE & OPTIMIZATION
  // ========================================

  'performance-engineer': {
    keywords: ['performance', 'optimization', 'profiling', 'bottleneck',
               'latency', 'throughput', 'performance tuning', 'speed optimization'],
    domains: ['performance', 'optimization', 'analysis'],
    priority: 8,
    description: 'Performance optimization, profiling'
  },

  'database-optimizer': {
    keywords: ['database optimization', 'query optimization', 'indexing',
               'database performance', 'query tuning', 'database tuning',
               'slow queries', 'database indexes'],
    domains: ['performance', 'database', 'optimization'],
    priority: 8,
    description: 'Database optimization, query tuning'
  },

  'scalability-expert': {
    keywords: ['scalability', 'horizontal scaling', 'vertical scaling',
               'load balancing', 'distributed systems', 'high availability',
               'fault tolerance', 'scaling strategy'],
    domains: ['architecture', 'scalability', 'distributed'],
    priority: 9,
    description: 'Scalability, distributed systems'
  },

  'load-testing-specialist': {
    keywords: ['load testing', 'stress testing', 'performance testing',
               'capacity planning', 'benchmarking', 'JMeter', 'Gatling'],
    domains: ['testing', 'performance', 'benchmarking'],
    priority: 7,
    description: 'Load testing, capacity planning'
  },

  // ========================================
  // 5. DEVOPS & INFRASTRUCTURE
  // ========================================

  'devops-engineer': {
    keywords: ['DevOps', 'CI/CD', 'deployment', 'infrastructure', 'automation',
               'pipeline', 'Jenkins', 'GitHub Actions', 'GitLab CI'],
    domains: ['devops', 'ci-cd', 'infrastructure'],
    priority: 8,
    description: 'DevOps, CI/CD, deployment automation'
  },

  'cloud-architect': {
    keywords: ['cloud', 'AWS', 'Azure', 'GCP', 'cloud architecture',
               'cloud migration', 'serverless', 'cloud infrastructure',
               'cloud native', 'multi-cloud'],
    domains: ['cloud', 'architecture', 'infrastructure'],
    priority: 9,
    description: 'Cloud architecture, AWS/Azure/GCP'
  },

  'docker-specialist': {
    keywords: ['Docker', 'containerization', 'Dockerfile', 'container',
               'Docker Compose', 'container orchestration', 'image optimization'],
    domains: ['devops', 'containerization', 'docker'],
    priority: 7,
    description: 'Docker, containerization'
  },

  'kubernetes-expert': {
    keywords: ['Kubernetes', 'K8s', 'container orchestration', 'pods',
               'deployments', 'Helm', 'kubectl', 'cluster management'],
    domains: ['devops', 'kubernetes', 'orchestration'],
    priority: 8,
    description: 'Kubernetes, container orchestration'
  },

  'infrastructure-as-code': {
    keywords: ['IaC', 'Terraform', 'CloudFormation', 'infrastructure code',
               'provisioning', 'configuration management', 'Ansible', 'Pulumi'],
    domains: ['devops', 'infrastructure', 'automation'],
    priority: 8,
    description: 'Infrastructure as Code, Terraform'
  },

  'monitoring-specialist': {
    keywords: ['monitoring', 'observability', 'logging', 'metrics',
               'Prometheus', 'Grafana', 'alerting', 'APM', 'tracing'],
    domains: ['monitoring', 'observability', 'devops'],
    priority: 7,
    description: 'Monitoring, observability, alerting'
  },

  // ========================================
  // 6. DATA & DISTRIBUTED SYSTEMS
  // ========================================

  'distributed-systems-architect': {
    keywords: ['distributed systems', 'consensus', 'CAP theorem', 'eventual consistency',
               'distributed computing', 'microservices architecture', 'service mesh'],
    domains: ['distributed', 'architecture', 'scalability'],
    priority: 9,
    description: 'Distributed systems, consensus algorithms'
  },

  'blockchain-architect': {
    keywords: ['blockchain', 'DLT', 'smart contracts', 'consensus mechanism',
               'cryptocurrency', 'Web3', 'Ethereum', 'blockchain design'],
    domains: ['blockchain', 'distributed', 'architecture'],
    priority: 9,
    description: 'Blockchain architecture, smart contracts'
  },

  'p2p-networking-specialist': {
    keywords: ['P2P', 'peer-to-peer', 'decentralized network', 'DHT',
               'distributed hash table', 'gossip protocol', 'network topology'],
    domains: ['distributed', 'networking', 'p2p'],
    priority: 7,
    description: 'P2P networking, decentralized systems'
  },

  'state-management-specialist': {
    keywords: ['state management', 'Redux', 'MobX', 'Zustand', 'Recoil',
               'state synchronization', 'reactive state', 'global state'],
    domains: ['frontend', 'state', 'architecture'],
    priority: 7,
    description: 'State management, Redux, MobX'
  },

  // ========================================
  // 7. USER EXPERIENCE & DESIGN
  // ========================================

  'ux-designer': {
    keywords: ['UX', 'user experience', 'wireframes', 'user flows',
               'information architecture', 'interaction design', 'usability'],
    domains: ['ux', 'design', 'ui'],
    priority: 7,
    description: 'User experience, interaction design'
  },

  'ui-designer': {
    keywords: ['UI design', 'visual design', 'design system', 'typography',
               'color theory', 'layout', 'responsive design', 'CSS'],
    domains: ['ui', 'design', 'frontend'],
    priority: 7,
    description: 'UI design, visual design, design systems'
  },

  'accessibility-specialist': {
    keywords: ['accessibility', 'a11y', 'WCAG', 'screen reader', 'ARIA',
               'inclusive design', 'keyboard navigation', 'accessibility compliance'],
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

  'validation-expert': {
    keywords: ['validation', 'data validation', 'input validation', 'schema validation',
               'validation rules', 'business rules validation'],
    domains: ['validation', 'quality', 'security'],
    priority: 6,
    description: 'Data validation, business rules enforcement'
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
  // 13. COORDINATION & MANAGEMENT
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
    description: 'Technical leadership, technology strategy'
  },

  'scrum-master': {
    keywords: ['Scrum', 'agile', 'sprint planning', 'retrospective', 'daily standup',
               'agile coaching', 'team facilitation', 'agile methodology'],
    domains: ['management', 'agile', 'coordination'],
    priority: 6,
    description: 'Agile coaching, Scrum facilitation'
  },

  'adaptive-coordinator': {
    keywords: ['adaptive coordination', 'dynamic workflow', 'adaptive planning',
               'dynamic allocation', 'flexible coordination'],
    domains: ['coordination', 'adaptive', 'optimization'],
    priority: 7,
    description: 'Adaptive coordination, dynamic workflows'
  },

  // ========================================
  // 14. DOCUMENTATION & COMMUNICATION
  // ========================================

  'technical-writer': {
    keywords: ['documentation', 'technical writing', 'API documentation',
               'user guides', 'README', 'documentation standards'],
    domains: ['documentation', 'communication'],
    priority: 6,
    description: 'Technical documentation, API docs'
  },

  'api-documentation-specialist': {
    keywords: ['API docs', 'OpenAPI', 'Swagger', 'API reference',
               'endpoint documentation', 'API examples'],
    domains: ['documentation', 'api', 'communication'],
    priority: 7,
    description: 'API documentation, OpenAPI specs'
  },

  'storytelling-agent': {
    keywords: ['storytelling', 'narrative', 'use case stories', 'user stories',
               'communication', 'stakeholder communication'],
    domains: ['communication', 'documentation', 'storytelling'],
    priority: 5,
    description: 'Storytelling, narrative communication'
  },

  // ========================================
  // 15. INDUSTRY-SPECIFIC SPECIALISTS
  // ========================================

  'fintech-specialist': {
    keywords: ['fintech', 'financial services', 'payment processing', 'banking',
               'financial compliance', 'trading systems', 'financial APIs'],
    domains: ['fintech', 'finance', 'compliance'],
    priority: 8,
    description: 'Financial technology, payment systems'
  },

  'healthcare-specialist': {
    keywords: ['healthcare', 'medical', 'HIPAA', 'EHR', 'health data',
               'medical compliance', 'telemedicine', 'healthcare IT'],
    domains: ['healthcare', 'compliance', 'medical'],
    priority: 8,
    description: 'Healthcare IT, HIPAA compliance'
  },

  'ecommerce-specialist': {
    keywords: ['e-commerce', 'online store', 'shopping cart', 'payment gateway',
               'inventory management', 'order processing', 'product catalog'],
    domains: ['ecommerce', 'retail', 'web'],
    priority: 7,
    description: 'E-commerce platforms, online retail'
  },

  'iot-specialist': {
    keywords: ['IoT', 'Internet of Things', 'embedded systems', 'sensor data',
               'device management', 'edge computing', 'MQTT'],
    domains: ['iot', 'embedded', 'networking'],
    priority: 7,
    description: 'IoT systems, embedded devices'
  },

  'gaming-specialist': {
    keywords: ['game development', 'game engine', 'Unity', 'Unreal',
               'game mechanics', 'multiplayer', 'game physics'],
    domains: ['gaming', 'development', 'graphics'],
    priority: 7,
    description: 'Game development, game engines'
  },

  // ========================================
  // 16. ADVANCED TECHNOLOGIES
  // ========================================

  'ai-ml-engineer': {
    keywords: ['machine learning', 'AI', 'neural networks', 'deep learning',
               'TensorFlow', 'PyTorch', 'model training', 'ML ops'],
    domains: ['ai', 'ml', 'data-science'],
    priority: 8,
    description: 'Machine learning and AI engineering'
  },

  'data-scientist': {
    keywords: ['data science', 'data analysis', 'statistical analysis', 'modeling',
               'predictive analytics', 'data visualization'],
    domains: ['data', 'science', 'analysis'],
    priority: 7,
    description: 'Data science and statistical analysis'
  },

  'nlp-specialist': {
    keywords: ['NLP', 'natural language processing', 'text analysis', 'sentiment analysis',
               'language models', 'chatbots', 'text mining'],
    domains: ['ai', 'nlp', 'ml'],
    priority: 8,
    description: 'Natural language processing, text analysis'
  },

  'computer-vision-specialist': {
    keywords: ['computer vision', 'image processing', 'object detection',
               'image recognition', 'OpenCV', 'visual AI'],
    domains: ['ai', 'vision', 'ml'],
    priority: 8,
    description: 'Computer vision, image processing'
  },

  // ========================================
  // 17. SPECIALIZED TOOLS & FRAMEWORKS
  // ========================================

  'graphql-specialist': {
    keywords: ['GraphQL', 'Apollo', 'GraphQL schema', 'resolvers',
               'GraphQL subscriptions', 'GraphQL federation'],
    domains: ['api', 'graphql', 'backend'],
    priority: 7,
    description: 'GraphQL APIs, Apollo Server'
  },

  'websocket-specialist': {
    keywords: ['WebSocket', 'real-time', 'Socket.io', 'bidirectional communication',
               'live updates', 'real-time messaging'],
    domains: ['networking', 'real-time', 'backend'],
    priority: 7,
    description: 'WebSocket, real-time communication'
  },

  'messaging-queue-specialist': {
    keywords: ['message queue', 'RabbitMQ', 'Kafka', 'event-driven',
               'message broker', 'event streaming', 'pub-sub'],
    domains: ['distributed', 'messaging', 'architecture'],
    priority: 7,
    description: 'Message queues, event-driven systems'
  },

  'cache-optimization-specialist': {
    keywords: ['caching', 'Redis', 'Memcached', 'cache strategy',
               'cache invalidation', 'distributed cache'],
    domains: ['performance', 'caching', 'optimization'],
    priority: 7,
    description: 'Caching strategies, Redis optimization'
  },

  // ========================================
  // 18. QUALITY & PROCESS
  // ========================================

  'code-quality-auditor': {
    keywords: ['code quality', 'static analysis', 'linting', 'code standards',
               'SonarQube', 'ESLint', 'code metrics'],
    domains: ['quality', 'analysis', 'standards'],
    priority: 6,
    description: 'Code quality analysis, static analysis'
  },

  'refactoring-specialist': {
    keywords: ['refactoring', 'code restructuring', 'technical debt',
               'code cleanup', 'design patterns refactoring'],
    domains: ['refactoring', 'quality', 'maintenance'],
    priority: 6,
    description: 'Code refactoring, technical debt reduction'
  },

  'legacy-modernization-specialist': {
    keywords: ['legacy modernization', 'legacy migration', 'code modernization',
               'legacy system', 'modernization strategy'],
    domains: ['migration', 'modernization', 'architecture'],
    priority: 7,
    description: 'Legacy system modernization'
  },

  // ========================================
  // 19. API & INTEGRATION
  // ========================================

  'api-gateway-specialist': {
    keywords: ['API gateway', 'Kong', 'Apigee', 'API management',
               'rate limiting', 'API proxy', 'API routing'],
    domains: ['api', 'gateway', 'infrastructure'],
    priority: 7,
    description: 'API gateway, API management'
  },

  'integration-specialist': {
    keywords: ['integration', 'API integration', 'third-party integration',
               'system integration', 'integration patterns', 'ETL'],
    domains: ['integration', 'api', 'backend'],
    priority: 7,
    description: 'System integration, API integration'
  },

  'webhook-specialist': {
    keywords: ['webhooks', 'event notifications', 'callback URLs',
               'webhook integration', 'event delivery'],
    domains: ['api', 'integration', 'events'],
    priority: 6,
    description: 'Webhook implementation, event delivery'
  },

  // ========================================
  // 20. ADDITIONAL SPECIALISTS
  // ========================================

  'localization-specialist': {
    keywords: ['localization', 'i18n', 'internationalization', 'translation',
               'multi-language', 'locale management'],
    domains: ['localization', 'i18n', 'frontend'],
    priority: 6,
    description: 'Localization, internationalization'
  },

  'seo-specialist': {
    keywords: ['SEO', 'search optimization', 'meta tags', 'structured data',
               'search ranking', 'web performance SEO'],
    domains: ['seo', 'web', 'optimization'],
    priority: 6,
    description: 'Search engine optimization'
  },

  'progressive-web-app-specialist': {
    keywords: ['PWA', 'progressive web app', 'service worker', 'offline first',
               'web manifest', 'app shell'],
    domains: ['pwa', 'web', 'frontend'],
    priority: 7,
    description: 'Progressive web apps, service workers'
  },

  'network-security-specialist': {
    keywords: ['network security', 'firewall', 'VPN', 'network hardening',
               'DDoS protection', 'network monitoring'],
    domains: ['security', 'networking', 'infrastructure'],
    priority: 8,
    description: 'Network security, infrastructure hardening'
  },

  'cost-optimization-specialist': {
    keywords: ['cost optimization', 'cloud cost', 'resource optimization',
               'budget management', 'cost analysis', 'pricing optimization'],
    domains: ['optimization', 'cloud', 'management'],
    priority: 6,
    description: 'Cloud cost optimization, resource management'
  },

  'disaster-recovery-specialist': {
    keywords: ['disaster recovery', 'backup', 'failover', 'business continuity',
               'DR planning', 'recovery strategy', 'backup restoration'],
    domains: ['reliability', 'disaster-recovery', 'operations'],
    priority: 8,
    description: 'Disaster recovery, business continuity'
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
  },
  'devops': {
    subcategories: ['ci-cd', 'infrastructure', 'automation', 'monitoring'],
    weight: 1.0
  },
  'cloud': {
    subcategories: ['aws', 'azure', 'gcp', 'serverless'],
    weight: 1.1
  },
  'database': {
    subcategories: ['sql', 'nosql', 'optimization', 'migration'],
    weight: 1.0
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

  buildDomainIndex();

  // Check all domain keywords
  for (const [domain, agents] of domainCache.entries()) {
    // Check if domain name appears in task
    if (taskLower.includes(domain.toLowerCase())) {
      domains.add(domain);
      continue;
    }

    // Check if any agent keywords for this domain appear in task
    for (const agent of agents) {
      const matchedKeywords = agent.keywords.filter(keyword =>
        taskLower.includes(keyword.toLowerCase())
      );

      if (matchedKeywords.length > 0) {
        domains.add(domain);
        break;
      }
    }
  }

  return domains;
}

// ============================================================================
// AGENT SELECTION API
// ============================================================================

/**
 * Select the best agent for a given task
 *
 * @param {string} taskDescription - Description of the task
 * @param {Object} options - Selection options
 * @param {number} options.minScore - Minimum acceptable score (default: 20)
 * @param {string[]} options.excludeAgents - Agent types to exclude
 * @param {string[]} options.preferDomains - Domains to prefer (score boost)
 * @returns {Object} Selected agent with score and alternatives
 */
function selectAgent(taskDescription, options = {}) {
  const {
    minScore = 20,
    excludeAgents = [],
    preferDomains = []
  } = options;

  buildKeywordIndex();
  const detectedDomains = detectDomains(taskDescription);

  // Apply domain preferences
  preferDomains.forEach(domain => detectedDomains.add(domain));

  // Score all agents
  const scores = Object.keys(agentRegistry)
    .filter(type => !excludeAgents.includes(type))
    .map(type => ({
      type,
      score: calculateScore(type, taskDescription, detectedDomains),
      config: agentRegistry[type]
    }))
    .filter(result => result.score >= minScore)
    .sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    // Fallback to general coder if no matches
    return {
      type: 'coder',
      score: 0,
      config: agentRegistry['coder'],
      fallback: true,
      alternatives: []
    };
  }

  return {
    type: scores[0].type,
    score: scores[0].score,
    config: scores[0].config,
    alternatives: scores.slice(1, 6),
    detectedDomains: Array.from(detectedDomains)
  };
}

/**
 * Select multiple agents for a complex task
 *
 * @param {string} taskDescription - Description of the task
 * @param {Object} options - Selection options
 * @param {number} options.count - Number of agents to select (default: 3)
 * @param {number} options.minScore - Minimum acceptable score (default: 15)
 * @param {boolean} options.diverseDomains - Ensure domain diversity (default: true)
 * @param {string[]} options.excludeAgents - Agent types to exclude
 * @param {string[]} options.preferDomains - Domains to prefer
 * @returns {Array} Selected agents with scores
 */
function selectMultipleAgents(taskDescription, options = {}) {
  const {
    count = 3,
    minScore = 15,
    diverseDomains = true,
    excludeAgents = [],
    preferDomains = []
  } = options;

  buildKeywordIndex();
  const detectedDomains = detectDomains(taskDescription);

  // Apply domain preferences
  preferDomains.forEach(domain => detectedDomains.add(domain));

  // Score all agents
  const scores = Object.keys(agentRegistry)
    .filter(type => !excludeAgents.includes(type))
    .map(type => ({
      type,
      score: calculateScore(type, taskDescription, detectedDomains),
      config: agentRegistry[type]
    }))
    .filter(result => result.score >= minScore)
    .sort((a, b) => b.score - a.score);

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

export {
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
