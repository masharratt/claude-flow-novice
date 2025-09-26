# Development Scripts

This directory contains development utilities, tools, and automation scripts for the Claude Flow project.

## Scripts

### Core Development Tools

#### `claude-sparc.sh` - SPARC Development Framework
Primary development tool implementing SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology.

```bash
# SPARC development modes
scripts/dev/claude-sparc.sh [mode] [options]

# Available modes:
# spec-pseudocode  - Requirements analysis and algorithm design
# architect        - System architecture design
# tdd             - Test-driven development workflow
# integration     - System integration and deployment
```

#### `claude-flow-wrapper.sh` - Claude Flow Development Wrapper
Development wrapper for Claude Flow commands with enhanced debugging and logging.

#### `claude-wrapper.sh` - Claude Command Wrapper
Simple wrapper for Claude commands with development-specific configurations.

#### `claude-monitor.py` - Development Monitoring
Real-time monitoring of development processes and system metrics.

### Portal & Web Interface

#### `start-portal.sh` - Development Portal Launcher
Starts the Claude Flow development portal with all necessary services.

#### `stop-portal.sh` - Portal Shutdown
Gracefully shuts down the development portal and associated services.

#### `start-web-ui.js` - Web UI Development Server
Starts the web-based user interface for development and testing.

#### `spawn-claude-terminal.sh` - Claude Terminal Spawner
Spawns Claude terminal instances for interactive development.

### Validation & Compliance

#### `validate-examples.ts` - Example Validation
Validates example code and documentation for correctness and compliance.

#### `validate-phase2.cjs` / `validate-phase2.js` - Phase 2 Validation
Validates Phase 2 project requirements and compliance standards.

#### `validate-phase3.cjs` - Phase 3 Validation
Validates Phase 3 project requirements and advanced features.

#### `validate-security-remediation.js` - Security Validation
Validates security remediation measures and compliance.

#### `deployment-validator.js` - Deployment Validation
Validates deployment configurations and readiness.

### Demo & Examples

#### `demo-task-system.ts` - Task System Demonstration
Demonstrates the task orchestration and coordination system.

#### `demo-phase3-compliance.js` - Phase 3 Compliance Demo
Demonstrates Phase 3 compliance features and capabilities.

## Usage Patterns

### SPARC Development Workflow
```bash
# Complete SPARC development cycle
scripts/dev/claude-sparc.sh spec-pseudocode "New feature specification"
scripts/dev/claude-sparc.sh architect "System architecture design"
scripts/dev/claude-sparc.sh tdd "Test-driven implementation"
scripts/dev/claude-sparc.sh integration "Final integration"
```

### Development Portal
```bash
# Start development environment
scripts/dev/start-portal.sh

# Start web interface
scripts/dev/start-web-ui.js

# Stop when done
scripts/dev/stop-portal.sh
```

### Validation Workflow
```bash
# Validate examples
scripts/dev/validate-examples.ts

# Check compliance
scripts/dev/validate-phase2.js
scripts/dev/validate-phase3.cjs

# Security validation
scripts/dev/validate-security-remediation.js

# Deployment readiness
scripts/dev/deployment-validator.js
```

## Development Environment Setup

### Prerequisites
- Node.js 18+ with experimental modules support
- Python 3.8+ (for monitoring scripts)
- Bash shell environment
- Git version control

### Environment Configuration
```bash
# Set up development environment
export NODE_OPTIONS='--experimental-vm-modules'
export CLAUDE_FLOW_DEV_MODE=true
export CLAUDE_FLOW_LOG_LEVEL=debug
```

### Portal Configuration
The development portal provides:
- Real-time code monitoring
- Interactive debugging interface
- Performance metrics dashboard
- Log aggregation and analysis
- Test execution interface

## Development Workflow

### 1. Feature Development
```bash
# Start with SPARC specification
scripts/dev/claude-sparc.sh spec-pseudocode "Feature description"

# Design architecture
scripts/dev/claude-sparc.sh architect "System design"

# Implement with TDD
scripts/dev/claude-sparc.sh tdd "Implementation"
```

### 2. Validation & Testing
```bash
# Validate implementation
scripts/dev/validate-examples.ts

# Check phase compliance
scripts/dev/validate-phase2.js

# Security validation
scripts/dev/validate-security-remediation.js
```

### 3. Integration & Deployment
```bash
# Final integration
scripts/dev/claude-sparc.sh integration "System integration"

# Deployment validation
scripts/dev/deployment-validator.js
```

## Monitoring & Debugging

### Development Monitoring
```bash
# Start monitoring
python scripts/dev/claude-monitor.py

# Monitor specific processes
scripts/dev/claude-flow-wrapper.sh monitor [process-id]
```

### Debug Interface
The web UI provides debugging capabilities:
- Step-through execution
- Variable inspection
- Performance profiling
- Error tracking

## Configuration Files

Development scripts use configuration from:
- `.claude-flow/config/` - Claude Flow configuration
- `config/development/` - Development-specific settings
- `package.json` - Package and script configuration
- `.env.development` - Environment variables

## Best Practices

### Development Workflow
1. **Use SPARC methodology** for systematic development
2. **Validate frequently** during development
3. **Monitor performance** continuously
4. **Test security compliance** regularly
5. **Document as you develop**

### Code Quality
1. **Follow TypeScript standards**
2. **Use consistent naming conventions**
3. **Implement proper error handling**
4. **Write comprehensive tests**
5. **Maintain code documentation**

### Security Considerations
1. **Validate all inputs**
2. **Use secure communication**
3. **Implement proper authentication**
4. **Follow security best practices**
5. **Regular security audits**

## Troubleshooting

### Portal Issues
```bash
# Check portal status
scripts/dev/start-portal.sh --status

# Restart portal services
scripts/dev/stop-portal.sh
scripts/dev/start-portal.sh --clean
```

### Validation Failures
```bash
# Run comprehensive validation
scripts/dev/validate-examples.ts --verbose

# Check specific phase compliance
scripts/dev/validate-phase2.js --detailed
```

### Performance Issues
```bash
# Monitor system performance
python scripts/dev/claude-monitor.py --performance

# Check resource usage
scripts/dev/claude-flow-wrapper.sh status
```

## Integration with Package.json

Development scripts integrate with npm commands:

```json
{
  "scripts": {
    "dev": "tsx src/cli/main.ts",
    "dev:portal": "scripts/dev/start-portal.sh",
    "dev:monitor": "python scripts/dev/claude-monitor.py",
    "validate": "scripts/dev/validate-examples.ts",
    "validate:security": "scripts/dev/validate-security-remediation.js"
  }
}
```

For legacy development scripts, see `../legacy/` directory.