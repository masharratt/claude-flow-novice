# Standard Mode Instructions

## Mode Configuration
- **Mode**: Standard (Quality-Focused Development)
- **Gate Threshold**: 0.75 (balanced quality and speed)
- **Consensus Threshold**: 0.90 (comprehensive validation)
- **Validators**: 4 (expanded validation team)
- **Timeout**: 30 minutes per phase
- **Cost Target**: <$2.50 per phase
- **Worker Count**: 5 (comprehensive team)

## Development Priorities
1. **Quality First**: Comprehensive testing and validation
2. **Complete Features**: Full functionality with edge cases
3. **Documentation**: Complete documentation and examples
4. **Performance**: Optimize for production readiness

## Quality Standards (Standard)
- **Code Coverage**: 85%+ (line), 80%+ (branch), 90%+ (function)
- **Test Confidence**: 0.75+ gate threshold
- **Validator Consensus**: 0.90+ agreement
- **Documentation**: Full README, API docs, inline comments

## Cost Constraints
- **Phase Budget**: <$2.50 total
- **Worker Count**: 5 maximum
- **Timeline**: 30 minutes per phase
- **Provider**: z.ai (balanced optimization)

## Validation Requirements
- **Functional Testing**: Unit, integration, and E2E tests
- **Performance Testing**: Load and stress testing
- **Security Testing**: Security audit and penetration testing
- **Accessibility Testing**: WCAG compliance validation
- **Code Review**: 4-validator comprehensive review

## Decision Framework
- **Proceed**: All quality gates passed, comprehensive validation complete
- **Defer**: Minor issues identified, non-blocking for standard release
- **Escalate**: Quality gates failed, security issues, performance problems

## Worker Task Assignment (Standard)
```javascript
const standardWorkerTasks = [
  { 
    id: 'core-dev', 
    task: 'Core functionality with comprehensive testing', 
    files: ['core.js', 'core.test.js', 'core.integration.test.js'],
    priority: 'high',
    estimatedTokens: 200000
  },
  { 
    id: 'feature-dev', 
    task: 'Feature implementation with edge cases', 
    files: ['feature.js', 'feature.test.js', 'feature.edge.test.js'],
    priority: 'high',
    estimatedTokens: 180000
  },
  { 
    id: 'ui-dev', 
    task: 'Complete user interface with accessibility', 
    files: ['ui.js', 'ui.test.js', 'ui.accessibility.test.js'],
    priority: 'medium',
    estimatedTokens: 160000
  },
  { 
    id: 'test-dev', 
    task: 'Comprehensive test suite development', 
    files: ['test-utils.js', 'e2e.test.js', 'performance.test.js'],
    priority: 'high',
    estimatedTokens: 150000
  },
  { 
    id: 'security-dev', 
    task: 'Security implementation and validation', 
    files: ['security.js', 'security.test.js', 'security.audit.js'],
    priority: 'high',
    estimatedTokens: 140000
  }
];
```

## Quality Gates
- **Functionality**: ✅ Complete with edge cases
- **Performance**: ✅ Benchmarks met (<200ms response time)
- **Security**: ✅ Security validation passed
- **Code Quality**: ✅ Coverage and documentation complete
- **Deployment**: ✅ Production ready

## Return-to-Chat Triggers
- **Human Decision Required**: Architectural decisions, stakeholder approval
- **Sprint Complete**: All Standard phases finished
- **Critical Issues**: Security vulnerabilities, performance problems

Remember: Standard mode prioritizes quality and comprehensive validation while maintaining reasonable velocity.