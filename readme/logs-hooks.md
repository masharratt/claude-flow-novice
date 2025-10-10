# Claude Flow Hooks Documentation

## Overview

Claude Flow implements a sophisticated, multi-layered hooks system that provides automated validation, testing, security, coordination, and workflow management. The system is designed to support agent-based development workflows with extensive customization and integration capabilities.

## System Lifecycle Hooks

### Pre-Commit and Post-Commit Hooks

**Implementation**: `/scripts/security/install-git-hooks.sh`

**Trigger Conditions**:
- Git commit operations (pre-commit)
- Automatic installation via setup script

**Execution Context**:
- Git repository root directory
- Shell environment with access to Git commands

**Configuration Options**:
```bash
# Installation options
HOOKS_SOURCE_DIR="$REPO_ROOT/.github/hooks"
HOOKS_TARGET_DIR="$REPO_ROOT/.git/hooks"

# Security tool configuration
GITLEAKS_VERSION="8.18.0"
OS detection for cross-platform support
```

**Integration Points**:
- GitLeaks integration for secret detection
- Custom pre-commit hook scripts
- Automatic tool installation (GitLeaks)

**Features**:
- Secret detection and prevention
- Cross-platform compatibility
- Automatic security tool installation
- Test verification of hook functionality

### Build and Deployment Hooks

**Implementation**: `/config/hooks/` and various build configuration files

**Trigger Conditions**:
- Pre-build validation
- Post-build processing
- Deployment preparation

**Execution Context**:
- Build environment (CI/CD pipelines)
- Deployment environments
- Docker containerization

**Configuration Options**:
```json
{
  "formatters": {
    "javascript": ["prettier", "--write", "--single-quote"],
    "typescript": ["prettier", "--write", "--single-quote"],
    "rust": ["rustfmt", "--edition", "2021"]
  },
  "linters": {
    "javascript": ["eslint", "--fix", "--format", "compact"],
    "rust": ["cargo", "clippy", "--", "-D", "warnings"]
  }
}
```

**Integration Points**:
- Docker build process
- CI/CD pipeline integration
- Deployment automation

## Development Workflow Hooks

### Testing and Validation Hooks

**Implementation**: `/config/hooks/post-edit-pipeline.js`

**Trigger Conditions**:
- File edits and modifications
- Pre/post validation requirements
- TDD compliance checks

**Execution Context**:
- Development environment
- File-specific validation context
- Multi-language support (JS, TS, Rust, Python, Go, Java, C/C++)

**Configuration Options**:
```javascript
{
  tddMode: boolean,
  minimumCoverage: number (default: 80),
  blockOnTDDViolations: boolean,
  rustStrict: boolean,
  structured: boolean
}
```

**Key Features**:
- **Progressive Validation Tiers**:
  - Syntax checking (0% dependencies)
  - Interface validation (30% dependencies)
  - Integration testing (70% dependencies)
  - Full validation (90% dependencies)

- **Single-File Test Engine**:
  - Framework detection (Jest, Mocha, Pytest, Cargo Test)
  - Coverage analysis with real-time feedback
  - TDD compliance enforcement
  - Language-specific optimizations

- **Rust Quality Enforcement**:
  - `.unwrap()` detection and blocking
  - `panic!()` prevention
  - `todo!()` and `unimplemented!()` validation
  - Error handling pattern enforcement

### Security Validation Hooks

**Implementation**: `/config/hooks/pre-edit-security.js`

**Trigger Conditions**:
- File modification attempts
- Dependency changes
- Security-sensitive file access

**Execution Context**:
- File system operations
- Development environment
- Security validation context

**Configuration Options**:
```javascript
{
  blockedPatterns: [/\.env$/, /secrets?\.(json|yaml|yml)$/i],
  allowedPatterns: [/\.env\.example$/, /\.env\.template$/],
  progressiveValidation: {
    enabled: true,
    completenessThresholds: {
      syntax: 0.0,
      interface: 0.3,
      integration: 0.7,
      full: 0.9
    }
  }
}
```

**Key Features**:
- **Security Protection**:
  - Environment file blocking
  - Secret detection
  - Hardcoded credential prevention

- **Dependency Analysis**:
  - Import/require extraction
  - Missing dependency detection
  - Circular dependency analysis
  - Agent spawning for missing dependencies

## Agent Coordination Hooks

### MCP Server Hooks

**Implementation**: `/src/services/agentic-flow-hooks/` directory

**Trigger Conditions**:
- Model Context Protocol operations
- Agent coordination events
- Memory storage/retrieval operations

**Execution Context**:
- MCP server environment
- Agent coordination context
- Memory management system

**Configuration Options**:
```typescript
interface AgenticHookContext {
  sessionId: string;
  correlationId: string;
  metadata: Record<string, any>;
  memory: MemoryInterface;
  neural: NeuralInterface;
}
```

**Key Features**:
- **Workflow Hooks**:
  - Workflow start/complete/step/error handling
  - Provider selection optimization
  - Decision confidence adjustment
  - Learning and improvement suggestions

- **Memory Hooks**:
  - Session management
  - Context storage
  - Learning pattern storage

- **Neural Hooks**:
  - Pattern training
  - Model optimization
  - Prediction generation

### Swarm Coordination Hooks

**Implementation**: `/src/services/agentic-flow-hooks/hook-manager.ts`

**Trigger Conditions**:
- Agent spawning/termination
- Inter-agent communication
- Swarm coordination events

**Execution Context**:
- Multi-agent environment
- Swarm topology management
- Agent state synchronization

**Configuration Options**:
```typescript
interface HookRegistration {
  id: string;
  type: AgenticHookType;
  priority: number;
  handler: HookHandler;
  filter?: HookFilter;
  options?: HookOptions;
}
```

**Integration Points**:
- Agent lifecycle management
- Swarm coordination protocols
- Memory sharing between agents

## Monitoring and Observability Hooks

### Performance Monitoring Hooks

**Implementation**: `/src/verification/hooks.ts`

**Trigger Conditions**:
- Performance metric collection
- Error threshold breaches
- System health checks

**Execution Context**:
- Monitoring infrastructure
- Alerting systems
- Telemetry collection

**Configuration Options**:
```typescript
interface VerificationConfig {
  preTask: {
    enabled: boolean;
    checkers: PreTaskChecker[];
    failureStrategy: 'abort' | 'warn' | 'continue';
  };
  telemetry: {
    enabled: boolean;
    truthValidators: TruthValidator[];
    reportingInterval: number;
  };
}
```

**Key Features**:
- **Pre-Task Verification**:
  - Environment validation
  - Resource availability checks
  - Dependency verification

- **Post-Task Validation**:
  - Accuracy measurement
  - Completion validation
  - Performance assessment

- **Truth Telemetry**:
  - Data consistency validation
  - Accuracy measurement
  - Confidence scoring

- **Rollback System**:
  - Automatic snapshot creation
  - Error-triggered rollbacks
  - Recovery strategy execution

### Real-time Monitoring Hooks

**Implementation**: Transparency dashboard integration

**Trigger Conditions**:
- Agent status changes
- Performance metric updates
- System health events

**Execution Context**:
- Real-time monitoring infrastructure
- WebSocket connections
- Event streaming systems

**Key Features**:
- **Agent Transparency**:
  - Decision reasoning capture
  - Performance metrics tracking
  - Inter-agent communication logging

- **System Health Monitoring**:
  - Resource usage tracking
  - Error rate monitoring
  - Performance bottleneck detection

## Application Lifecycle Hooks

### CFN Loop Hooks

**Implementation**: `/src/cfn-loop/hooks/`

**Trigger Conditions**:
- Loop phase transitions
- Consensus validation events
- Product Owner decisions

**Execution Context**:
- CFN Loop orchestration system
- Multi-agent coordination
- Quality validation pipelines

**Key Features**:
- **Loop 0 (Epic/Sprint) Hooks**:
  - Epic initialization
  - Sprint planning validation
  - Cross-phase dependency management

- **Loop 2 (Consensus) Hooks**:
  - Validator coordination
  - Consensus score calculation
  - Quality gate enforcement

- **Loop 3 (Primary Swarm) Hooks**:
  - Agent spawning coordination
  - Task distribution optimization
  - Confidence score collection

- **Loop 4 (Product Owner) Hooks**:
  - GOAP decision triggers
  - Escalation handling
  - Autonomous progression logic

### Session Management Hooks

**Implementation**: `/src/services/session-hooks.ts`

**Trigger Conditions**:
- Session start/end
- Agent state changes
- Memory persistence events

**Execution Context**:
- Session management system
- State persistence layer
- Cross-session coordination

## Integration Hooks

### Framework Integration Hooks

**Supported Frameworks**:
- Express.js middleware
- Fastify plugin
- Koa middleware
- Native Node.js

**Example**:
```javascript
// Express.js middleware
app.use((req, res, next) => {
  const requestLogger = logger.child({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  requestLogger.info('Request started');
  next();
});
```

### Database Integration Hooks

**Implementation**: Query performance and security hooks

**Trigger Conditions**:
- Database query execution
- Connection events
- Transaction completion

**Key Features**:
- **Query Performance Monitoring**:
  - Slow query detection
  - Connection pool monitoring
  - Query pattern analysis

- **Security Validation**:
  - SQL injection prevention
  - Access control validation
  - Audit logging

## Error Handling and Recovery Hooks

### Error Processing Hooks

**Implementation**: `/src/hooks/error-handlers.ts`

**Trigger Conditions**:
- Error occurrence in any system component
- Exception handling events
- Failure recovery attempts

**Execution Context**:
- Error handling infrastructure
- Recovery systems
- Alerting mechanisms

**Key Features**:
- **Error Classification**:
  - Severity assessment
  - Category assignment
  - Impact analysis

- **Recovery Coordination**:
  - Automatic retry logic
  - Fallback system activation
  - Escalation procedures

- **Learning Integration**:
  - Error pattern recognition
  - Prevention strategy updates
  - System improvement suggestions

## Hook Configuration and Management

### Hook Registration System

**Implementation**: `/config/hooks/hook-manager.cjs`

**Trigger Conditions**:
- Hook registration/deregistration
- Configuration changes
- System initialization

**Execution Context**:
- Hook management system
- Configuration environment
- Administrative operations

**Configuration Options**:
```javascript
{
  globalSettings: {
    enabled: boolean,
    concurrent: boolean,
    timeout: number,
    logLevel: string,
    preserveExistingHooks: boolean
  },
  languageSettings: {
    javascript: { timeout: 3000 },
    rust: { timeout: 5000 },
    typescript: { timeout: 4000 }
  },
  communication: {
    sqlite: { enabled: boolean, dbPath: string },
    agentCoordination: { enabled: boolean, namespace: string }
  }
}
```

**Management Features**:
- **Hook Registration System**:
  - Dynamic hook registration/deregistration
  - Priority-based execution ordering
  - Conditional hook execution
  - Timeout and retry management

- **Execution Pipeline**:
  - Sequential and parallel execution
  - Error handling strategies
  - Result aggregation
  - Side effect processing

- **Agent Integration**:
  - Structured feedback to agents
  - Dependency analysis with action items
  - Template generation for missing components
  - Self-execution capabilities

## Security and Compliance Hooks

### Compliance Validation Hooks

**Trigger Conditions**:
- Code commits
- Deployment events
- Configuration changes

**Key Features**:
- **Policy Enforcement**:
  - Coding standards validation
  - Security policy compliance
  - Regulatory requirement checks

- **Audit Trail Generation**:
  - Comprehensive activity logging
  - Change tracking
  - Compliance reporting

### Access Control Hooks

**Implementation**: Authentication and authorization hooks

**Trigger Conditions**:
- User authentication attempts
- Resource access requests
- Permission changes

**Key Features**:
- **Identity Verification**:
  - Multi-factor authentication
  - Token validation
  - Session management

- **Permission Enforcement**:
  - Role-based access control
  - Resource-level permissions
  - Dynamic permission updates

## Performance Optimization Hooks

### WASM 40x Performance Hooks

**Implementation**: `/src/booster/wasm-hooks.js`

**Trigger Conditions**:
- WASM runtime initialization
- Code optimization requests
- Performance benchmark execution
- Memory pool allocation events

**Execution Context**:
- WebAssembly runtime environment
- Performance monitoring system
- Memory management infrastructure

**Configuration Options**:
```javascript
{
  performanceTarget: 40.0,           // 40x performance multiplier
  memoryPoolSize: 1024 * 1024 * 1024, // 1GB memory pool
  enableSIMD: true,                 // Enable SIMD vectorization
  monitoringInterval: 100,         // 100ms monitoring intervals
  optimizationThreshold: 35.0       // Auto-optimization trigger
}
```

**Key Features**:
- **Pre-Optimization Hooks**:
  - Code analysis and pattern detection
  - Optimization strategy selection
  - Memory segment allocation
  - Performance prediction

- **Post-Optimization Hooks**:
  - Performance validation
  - Metrics collection and reporting
  - Cache warming strategies
  - Auto-optimization triggers

- **Real-time Monitoring Hooks**:
  - Performance metrics collection
  - Bottleneck detection and alerting
  - Dynamic optimization adjustment
  - Memory usage monitoring

- **Benchmark Execution Hooks**:
  - Automated test suite execution
  - Performance regression detection
  - Success rate validation
  - Target achievement verification

**Integration Points**:
- WASM runtime initialization
- Code optimization pipeline
- Performance monitoring dashboard
- Error recovery system

### Error Recovery Hooks

**Implementation**: `/src/recovery/recovery-hooks.js`

**Trigger Conditions**:
- Performance threshold breaches
- WASM compilation failures
- Memory allocation errors
- System degradation events

**Execution Context**:
- Error detection infrastructure
- Recovery coordination system
- Performance monitoring

**Configuration Options**:
```javascript
{
  recoveryEffectivenessTarget: 0.90,  // 90% recovery effectiveness
  maxRetryAttempts: 3,
  recoveryTimeout: 5000,
  enableCircuitBreaker: true,
  alertThresholds: {
    performance: 0.80,    // 80% performance threshold
    errorRate: 0.05,      // 5% error rate threshold
    memoryUsage: 0.85     // 85% memory usage threshold
  }
}
```

**Key Features**:
- **Automated Detection Hooks**:
  - Real-time error identification
  - Performance degradation detection
  - Memory leak detection
  - System health assessment

- **Recovery Coordination Hooks**:
  - Automated recovery workflow execution
  - Circuit breaker activation
  - Fallback system engagement
  - Escalation procedures

- **Resilience Architecture Hooks**:
  - Failover mechanism activation
  - Load balancing adjustments
  - Resource reallocation
  - Service restoration

### Resource Management Hooks

**Trigger Conditions**:
- Resource allocation requests
- Performance threshold breaches
- Scaling events

**Key Features**:
- **Dynamic Resource Allocation**:
  - CPU and memory optimization
  - Network bandwidth management
  - Storage optimization

- **Auto-scaling Coordination**:
  - Load-based scaling triggers
  - Predictive scaling
  - Cost optimization

## Best Practices and Guidelines

### Hook Development Guidelines

1. **Performance**: Keep hooks lightweight and non-blocking
2. **Error Handling**: Implement robust error handling and recovery
3. **Logging**: Provide comprehensive logging for debugging
4. **Testing**: Write comprehensive tests for all hook logic
5. **Documentation**: Maintain clear documentation of hook behavior

### Hook Usage Patterns

1. **Validation Hooks**: Use for input validation and quality checks
2. **Transformation Hooks**: Use for data transformation and enrichment
3. **Notification Hooks**: Use for alerts and notifications
4. **Integration Hooks**: Use for external system integrations

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Features](./logs-features.md) - Available logging features
- [Functions](./logs-functions.md) - Utility functions
- [MCP](./logs-mcp.md) - Model Context Protocol
- [Slash Commands](./logs-slash-commands.md) - CLI operations