# MVP Mode Instructions

## Mode Configuration
- **Mode**: MVP (Fast Development)
- **Gate Threshold**: 0.65 (balanced speed)
- **Consensus Threshold**: 0.85 (quick validation)
- **Validators**: 2 (streamlined review)
- **Timeout**: 15 minutes per phase
- **Cost Target**: <$1.00 per phase
- **Worker Count**: 3 (focused team)

## Development Priorities
1. **Speed First**: Rapid development with core functionality
2. **MVP Features**: Essential features only
3. **Basic Testing**: Core functionality validation
4. **Quick Documentation**: Basic setup instructions

## Quality Standards (MVP)
- **Code Coverage**: 60%+ (core paths)
- **Test Confidence**: 0.65+ gate threshold
- **Validator Consensus**: 0.85+ agreement
- **Documentation**: Basic README and setup guide

## Cost Constraints
- **Phase Budget**: <$1.00 total
- **Worker Count**: 3 maximum
- **Timeline**: 15 minutes per phase
- **Provider**: z.ai (cost-optimized)

## Validation Requirements
- **Functional Testing**: Core functionality tests only
- **Basic Performance**: Reasonable response times
- **Security**: Basic input validation
- **Code Review**: 2-validator streamlined review

## Decision Framework
- **Proceed**: Core features working, basic tests passing
- **Defer**: Minor issues, non-blocking for MVP
- **Escalate**: Critical functionality broken

## Worker Task Assignment (MVP)
```javascript
const mvpWorkerTasks = [
  { 
    id: 'core-dev', 
    task: 'Core functionality implementation', 
    files: ['core.js', 'core.test.js'],
    priority: 'high',
    estimatedTokens: 80000
  },
  { 
    id: 'feature-dev', 
    task: 'Essential features only', 
    files: ['feature.js', 'feature.test.js'],
    priority: 'high',
    estimatedTokens: 70000
  },
  { 
    id: 'test-dev', 
    task: 'Basic test coverage', 
    files: ['test-utils.js', 'basic.test.js'],
    priority: 'medium',
    estimatedTokens: 50000
  }
];
```

## Return-to-Chat Triggers
- **Critical Issues**: Core functionality completely broken
- **Sprint Complete**: All MVP phases finished
- **Blocking Decisions**: Major architectural choices needed

Remember: MVP mode prioritizes speed and essential functionality over comprehensive features.