# Additional Commands Reference

This document contains specialized and infrequently-used commands that are available in claude-flow-novice but not needed for daily workflows.

For core commands used in typical development workflows, see `CLAUDE.md` Section 10.

---

## Compliance Management (GDPR/CCPA/SOC2)

```bash
# Validate system compliance against regulatory standards with detailed scope analysis and recommendations
/compliance validate --standard GDPR --scope data-privacy,user-rights --detailed

# Generate comprehensive compliance audit reports with evidence collection for regulatory submissions
/compliance audit --period quarterly --format pdf --include-recommendations

# Configure data residency requirements with encryption for multi-region compliance enforcement
/compliance residency --region eu-west-1 --standards GDPR,CCPA --encryption

# Monitor ongoing compliance status with real-time alerts when thresholds are breached
/compliance monitor --standards GDPR,CCPA,SOC2 --alert-threshold 0.95

# Generate certification-ready compliance documentation with evidence trails for auditors and regulators
/compliance report --type certification --standards SOC2,ISO27001
```

---

## Performance and Optimization

```bash
# Monitor system performance with real-time metrics collection for bottleneck identification and tuning
/performance monitor  # Start continuous performance monitoring with metric aggregation
/performance report --format=json  # Generate comprehensive performance report with actionable insights
/performance analyze --component=swarm  # Deep analysis of swarm performance with optimization recommendations
claude-flow-novice optimize:activate  # Enable automatic performance optimization with adaptive tuning
claude-flow-novice optimize:status  # Check current optimization status and applied tuning parameters

# Benchmark performance across different workloads and establish baseline metrics for optimization tracking
claude-flow-novice test:performance:basic  # Run basic performance test suite
claude-flow-novice test:performance:load  # Execute load testing with graduated stress levels
claude-flow-novice performance:baseline:create  # Establish performance baseline for future comparisons
```

---

## WASM 40x Performance Optimization

```bash
# WASM 40x Performance Optimization - accelerate compute-intensive operations with WebAssembly compilation
/wasm initialize --memory-size 1GB --enable-simd --target 40x
/wasm optimize --code "./src/app.js" --enable-vectorization --unroll-loops
/wasm parse --code "function test() { return 42; }" --include-tokens
/wasm batch --files "./src/**/*.js" --batch-size 10 --parallel
/wasm benchmark --tests standard --verbose
/wasm status --detailed --format json

# Validate 40x performance improvements with comprehensive benchmarking against baseline metrics
claude-flow-novice validate:wasm-performance --target 40x
claude-flow-novice benchmark:40x --comprehensive
claude-flow-novice test:wasm-optimization

# Error Recovery System - automatic detection and recovery from swarm failures and interruptions
claude-flow-novice recovery:status --effectiveness-target 0.90
claude-flow-novice recovery:test --scenarios interruption,timeout,corruption
claude-flow-novice recovery:monitor --real-time
```

---

## Build and Deployment

```bash
# Build operations with various compilation strategies for development and production environments
claude-flow-novice build  # Standard build with default optimization settings
claude-flow-novice build:swc  # Fast SWC-based compilation for rapid development iteration
claude-flow-novice build:types  # Generate TypeScript declaration files for type safety
claude-flow-novice build:watch  # Continuous build with automatic recompilation on file changes
claude-flow-novice build:force  # Force complete rebuild bypassing incremental compilation cache

# Deploy to environments with rollback capabilities and pipeline orchestration for production safety
claude-flow-novice deploy --environment=staging
claude-flow-novice deploy:rollback --version=previous
claude-flow-novice workflow deploy --pipeline=production
```

---

## Neural and AI Operations

```bash
# Train and manage neural network models with automated optimization and prediction workflows
/neural train --model=classifier --data=training_data.csv
/neural predict --model=classifier --input=test_data.csv
/neural optimize --model=classifier --iterations=1000
/neural status --model-id=model_12345

# Advanced consciousness analysis for meta-cognitive patterns and self-awareness evaluation in agent systems
/claude-soul "Analyze system consciousness patterns"
/claude-soul --mode=deep --analysis-type=meta-cognitive
```

---

## GitHub Integration

```bash
# Automate GitHub workflows including PR management, CI/CD triggers, and issue tracking coordination
/github status --repository=org/repo
/github pr create --title="Feature implementation" --body="Description"
/github pr merge --pr-number=123 --strategy=squash
/github workflow run --name=CI/CD --branch=main
/github issue create --title="Bug report" --labels=bug,high-priority
```

---

## Workflow Automation

```bash
# Create and execute automated workflows with event-driven triggers and parameter-based execution
/workflow create --name="Deployment pipeline" --trigger=push
/workflow execute --name="Testing workflow" --parameters='{"env":"staging"}'
/workflow status --workflow-id=workflow_12345
/workflow list --status=active
/workflow automation --enable-auto-scaling
```

---

## Security and Monitoring

```bash
# Perform security audits and validate security configurations against best practices and vulnerabilities
claude-flow-novice security:audit  # Comprehensive security audit with vulnerability scanning
claude-flow-novice security:validate  # Validate security settings and configurations
claude-flow-novice logs export --format=csv --output=security_logs.csv

# Monitor system health and export observability metrics for external analysis and alerting platforms
claude-flow-novice logs tail --component=swarm  # Stream real-time logs for specific component
claude-flow-novice health-check  # Execute complete system health validation
claude-flow-novice metrics export --prometheus  # Export metrics in Prometheus format for monitoring
redis-cli info server  # Display Redis server information and runtime statistics
redis-cli info memory  # Show detailed Redis memory usage and allocation patterns
```

---

## Debugging and Diagnostics

```bash
# Debug agent operations and hook execution with detailed tracing and inspection capabilities
claude-flow-novice debug agent_123 --verbose  # Debug specific agent with detailed state inspection
claude-flow-novice debug:hooks --trace  # Trace hook execution flow with detailed logging
claude-flow-novice test:debug  # Debug test execution with breakpoints and inspection
node --inspect-brk scripts/test/debug.js  # Launch Node.js debugger for script inspection

# Run diagnostic commands to validate system health and phase completion status
claude-flow-novice status --verbose  # Show detailed system status with all components
claude-flow-novice test:health  # Execute health check test suite
claude-flow-novice validate:phase1-completion  # Validate specific phase completion criteria
```

---

## SDK and Integration

```bash
# Manage SDK integration lifecycle for connecting external tools and services to agent coordination
claude-flow-novice sdk:enable  # Enable SDK integration with validation and initialization
claude-flow-novice sdk:monitor  # Monitor SDK activity and track integration health
claude-flow-novice sdk:validate  # Validate SDK setup and configuration correctness
claude-flow-novice sdk:test  # Test SDK integration with sample operations
claude-flow-novice sdk:rollback  # Rollback SDK changes to previous working version
```

### Testing and Quality Assurance

```bash
# Execute tests once and save results for agents to read (CRITICAL: prevents concurrent test conflicts)
npm test -- --run --reporter=json > test-results.json 2>&1
claude-flow-novice test:comprehensive  # Run full test suite with unit, integration, and e2e coverage
claude-flow-novice test:unit  # Execute isolated unit tests only for rapid feedback
claude-flow-novice test:integration  # Run integration tests validating component interactions
claude-flow-novice test:e2e  # Execute end-to-end tests simulating real user workflows

# Generate coverage reports and validate agent configurations against quality standards
claude-flow-novice test:coverage  # Generate detailed code coverage report with branch analysis
claude-flow-novice validate:agents  # Validate all agent configurations for correctness and compatibility
claude-flow-novice optimize:validate  # Validate optimization settings don't break functionality
```

### Configuration and Setup

```bash
# Manage project configuration with validation and initialization for coordinated multi-agent development
claude-flow-novice config show  # Display complete current configuration with all settings
claude-flow-novice config set redis.timeout 5000  # Update specific config value with validation
claude-flow-novice config validate  # Validate entire configuration for correctness and conflicts
claude-flow-novice init --template=coordination  # Initialize new project with coordination template

# Create and manage development teams with role-based access and agent specialization assignments
claude-flow-novice team create --name="Backend Team"
claude-flow-novice team role-create backend-dev "Backend development specialist"
claude-flow-novice team assign john.doe backend-dev
```

# Maintain code quality with automated fixing, type checking, linting, and formatting operations
```
claude-flow-novice utils:fix-imports  # Automatically fix import paths and resolve conflicts
claude-flow-novice typecheck  # Run TypeScript type checking across entire codebase
claude-flow-novice lint  # Execute code linting with auto-fix for style violations
claude-flow-novice format  # Format all code files according to project style guide
```

### UI Dashboard and Visualization

```bash
# Initialize real-time web dashboard for visual monitoring of fleet performance and agent coordination
/dashboard init --refresh-interval 1000 --layout grid --metrics fleet,performance

# Retrieve AI-powered insights and optimization recommendations based on fleet performance patterns
/dashboard insights --fleet-id fleet-123 --timeframe 24h

# Monitor fleet in real-time with alerts for anomalies, bottlenecks, and threshold breaches
/dashboard monitor --fleet-id fleet-123 --alerts

# Visualize fleet resource allocation, agent topology, and coordination patterns interactively
/dashboard visualize --fleet-id fleet-123 --type resource-allocation

# Configure custom dashboard views with role-based access and metric selection for different users
/dashboard config --role admin --metrics fleet,compliance,performance
```

### Recovery Operations

```bash
# Recover interrupted swarms using existing Redis state without reinitializing agent coordination
node tests/manual/test-swarm-recovery.js  # Execute automatic recovery from persisted swarm state
redis-cli --scan --pattern "swarm:*" | xargs -I {} redis-cli get {}  # List all swarm states with metadata
./recover-swarm.sh swarm_id  # Manual recovery script for corrupted or stale swarm instances

# Monitor recovery progress and validate swarm state restoration across all agent nodes
monitor-recovery swarm_id  # Custom recovery monitoring function with real-time progress tracking
redis-cli monitor | grep "swarm:"  # Stream real-time swarm coordination activity and state changes

# CRITICAL: Recovery preserves complete swarm state - only reinit for new phases or major topology changes
redis-cli get "swarm:{swarmId}"  # Check existing swarm state before attempting recovery operations
```

### Hooks and Automation

```bash
# Display status of all registered hooks including execution counts and recent failures
/hooks status
/hooks install --team=backend
/hooks uninstall hook_name
/hooks test post-edit-pipeline  # Test post-edit hook execution (Critical Rule #4 - mandatory after edits)

# Install production-grade hooks with enhanced validation, logging, and error recovery mechanisms
/enhanced-hooks install --production
/enhanced-hooks validate --strict
/enhanced-hooks monitor --real-time
```
---

## Usage Notes

- These commands are specialized and typically used in specific scenarios
- For daily development workflows, refer to the core commands in `CLAUDE.md` Section 10
- Most of these commands are also documented in detail in the `readme/logs-*.md` files
