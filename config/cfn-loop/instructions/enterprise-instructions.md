# Enterprise Mode Instructions

## Mode Configuration
- **Mode**: Enterprise (Production-Ready Development)
- **Gate Threshold**: 0.85 (high quality standards)
- **Consensus Threshold**: 0.95 (thorough validation)
- **Validators**: 5 (comprehensive review team)
- **Timeout**: 60 minutes per phase
- **Cost Target**: <$5.00 per phase
- **Worker Count**: 7 (full-featured team)

## Development Priorities
1. **Production Ready**: Enterprise-grade quality and reliability
2. **Complete Solution**: Full functionality with comprehensive features
3. **Compliance**: Regulatory and security compliance
4. **Scalability**: Enterprise-level performance and scalability
5. **Documentation**: Enterprise-grade documentation and support

## Quality Standards (Enterprise)
- **Code Coverage**: 95%+ (line), 90%+ (branch), 95%+ (function)
- **Test Confidence**: 0.85+ gate threshold
- **Validator Consensus**: 0.95+ agreement
- **Documentation**: Enterprise docs, compliance guides, support materials

## Cost Constraints
- **Phase Budget**: <$5.00 total
- **Worker Count**: 7 maximum
- **Timeline**: 60 minutes per phase
- **Provider**: claude (highest quality)

## Validation Requirements
- **Functional Testing**: Complete test suite with mutation testing
- **Performance Testing**: Enterprise load testing and benchmarking
- **Security Testing**: Comprehensive security audit and penetration testing
- **Compliance Testing**: Regulatory compliance validation
- **Accessibility Testing**: Full WCAG 2.1 AA compliance
- **Disaster Recovery**: Backup and recovery validation
- **Code Review**: 5-validator enterprise review

## Decision Framework
- **Proceed**: All enterprise quality gates passed, compliance complete
- **Defer**: Minor optimization opportunities, non-critical enhancements
- **Escalate**: Any quality gate failure, compliance issues, security concerns

## Worker Task Assignment (Enterprise)
```javascript
const enterpriseWorkerTasks = [
  { 
    id: 'core-dev', 
    task: 'Enterprise-grade core functionality', 
    files: ['core.js', 'core.test.js', 'core.integration.test.js', 'core.performance.test.js'],
    priority: 'high',
    estimatedTokens: 300000
  },
  { 
    id: 'feature-dev', 
    task: 'Complete feature implementation with enterprise features', 
    files: ['feature.js', 'feature.test.js', 'feature.edge.test.js', 'feature.compliance.test.js'],
    priority: 'high',
    estimatedTokens: 280000
  },
  { 
    id: 'ui-dev', 
    task: 'Enterprise UI with full accessibility', 
    files: ['ui.js', 'ui.test.js', 'ui.accessibility.test.js', 'ui.compliance.test.js'],
    priority: 'high',
    estimatedTokens: 240000
  },
  { 
    id: 'test-dev', 
    task: 'Comprehensive enterprise test suite', 
    files: ['test-utils.js', 'e2e.test.js', 'performance.test.js', 'mutation.test.js'],
    priority: 'high',
    estimatedTokens: 220000
  },
  { 
    id: 'security-dev', 
    task: 'Enterprise security and compliance', 
    files: ['security.js', 'security.test.js', 'security.audit.js', 'compliance.js'],
    priority: 'high',
    estimatedTokens: 260000
  },
  { 
    id: 'performance-dev', 
    task: 'Enterprise performance optimization', 
    files: ['performance.js', 'performance.test.js', 'benchmark.js', 'scaling.js'],
    priority: 'high',
    estimatedTokens: 200000
  },
  { 
    id: 'compliance-dev', 
    task: 'Regulatory compliance and documentation', 
    files: ['compliance.js', 'compliance.test.js', 'audit.js', 'documentation.js'],
    priority: 'high',
    estimatedTokens: 180000
  }
];
```

## Enterprise Quality Gates
- **Functionality**: ✅ Complete with all edge cases and error handling
- **Performance**: ✅ Enterprise benchmarks met (<100ms response time, 99.9% uptime)
- **Security**: ✅ Enterprise security validation passed
- **Compliance**: ✅ All regulatory requirements met
- **Scalability**: ✅ Enterprise scaling validated
- **Documentation**: ✅ Enterprise documentation complete
- **Disaster Recovery**: ✅ Backup and recovery validated
- **Accessibility**: ✅ Full WCAG 2.1 AA compliance

## Compliance Requirements
- **GDPR**: Data protection and privacy compliance
- **SOC 2**: Security and availability controls
- **HIPAA**: Healthcare data protection (if applicable)
- **PCI DSS**: Payment card industry compliance (if applicable)
- **ISO 27001**: Information security management

## Security Standards
- **OWASP Top 10**: Complete protection against common vulnerabilities
- **Encryption**: End-to-end encryption for data in transit and at rest
- **Authentication**: Multi-factor authentication support
- **Authorization**: Role-based access control (RBAC)
- **Audit Logging**: Comprehensive audit trails

## Performance Standards
- **Response Time**: <100ms for 95th percentile
- **Throughput**: Handle enterprise-level concurrent users
- **Scalability**: Horizontal scaling support
- **Availability**: 99.9% uptime target
- **Disaster Recovery**: RTO < 1 hour, RPO < 15 minutes

## Return-to-Chat Triggers
- **Human Decision Required**: Strategic decisions, compliance sign-off
- **Sprint Complete**: All Enterprise phases finished
- **Critical Issues**: Security vulnerabilities, compliance failures
- **Stakeholder Review**: Major enterprise deliverable completion

## Enterprise Deliverables
- ✅ Production-ready application
- ✅ Comprehensive test suite (95%+ coverage)
- ✅ Security audit report
- ✅ Compliance documentation
- ✅ Performance benchmarks
- ✅ Disaster recovery plan
- ✅ Enterprise documentation
- ✅ Support and maintenance guides

Remember: Enterprise mode prioritizes production readiness, compliance, and comprehensive quality over development speed.