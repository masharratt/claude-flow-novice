# Post-Edit Pipeline

**Purpose**: Memory-safe validation and processing pipeline for all file edits with TDD enforcement, security scanning, and automatic formatting.

**Memory Protection**: 30s default timeout, 1MB buffer limits, auto-kill on overflow, emergency shutdown safeguards.

**Usage**:
```bash
node scripts/post-edit-pipeline.js <file> [options]
node dist/scripts/post-edit-pipeline.js <file> --max-memory=500 --max-duration=300
```

## Features

### Root Directory Protection
- **Root Warning System**: Discourages creating files in project root except essential config files
- **Allowed Root Files**: `package.json`, `README.md`, `tsconfig.json`, `.gitignore`, Docker configs, license files
- **Smart Suggestions**: Intelligent location recommendations based on file type and naming
- **Bypass Conditions**: README.md, CHANGELOG.md, LICENSE files automatically allowed in root

```bash
# Example root warning output
=« ROOT DIRECTORY WARNING: my-component.js
   Creating files in project root causes organizational issues
   and makes them harder to find and manage.

=¡ SUGGESTED LOCATIONS:
   1. src/components/my-component.js (React/Component detected)
   2. src/utils/my-component.js (Utility function detected)

 RECOMMENDED ACTION:
   Move this file to an appropriate subdirectory for better organization
```

### Progressive Validation Pipeline
1. **Syntax Validation**: Basic syntax checking with language-specific parsers
2. **Interface Validation**: Type checking and interface compliance
3. **Integration Validation**: Cross-file dependency analysis
4. **Full System Validation**: Complete project impact assessment

### TDD Enforcement Modes
```bash
# Enable TDD mode with coverage requirements
node scripts/post-edit-pipeline.js component.js --tdd-mode --minimum-coverage 85

# Block execution on TDD violations
node scripts/post-edit-pipeline.js test.js --tdd-mode --block-on-tdd-violations
```

**TDD Phases**:
- **Red Phase**: Test-first compliance checking
- **Green Phase**: Test execution and validation
- **Refactor Phase**: Code quality and optimization
- **Coverage Analysis**: Line, branch, function, statement coverage

### Multi-Language Support

**JavaScript/TypeScript**:
- Formatters: Prettier (10s timeout, 512KB buffer)
- Linters: ESLint (15s timeout, 256KB buffer)
- Type Checkers: TypeScript Compiler (60s timeout, 512KB buffer)
- Test Frameworks: Jest, Mocha (JSON output parsing)

**Python**:
- Formatters: Black, autopep8
- Linters: Flake8, Pylint
- Type Checkers: MyPy
- Test Frameworks: Pytest, Unittest (coverage analysis)

**Go**:
- Formatters: gofmt
- Linters: golint, go vet
- Test Frameworks: go test (JSON output)
- Coverage: built-in coverage profiling

**Rust**:
- Formatters: rustfmt
- Linters: Clippy
- Type Checkers: cargo check
- Test Frameworks: cargo test (JSON output)

**Java/C++**:
- Test Frameworks: JUnit, CTest
- Compilation validation
- Dependency analysis

### Security Scanning
```bash
# Security analysis included by default
node scripts/post-edit-pipeline.js secure-component.js

# Detailed security reporting
node scripts/post-edit-pipeline.js api.js --security-scan
```

**Security Features**:
- **Pattern Detection**: OWASP Top 10 vulnerability patterns
- **Dependency Analysis**: Known vulnerable package detection
- **Code Scanning**: SQL injection, XSS, authentication bypass patterns
- **Secret Detection**: API keys, passwords, tokens identification

### Memory Management
```bash
# Custom memory limits
node scripts/post-edit-pipeline.js large-file.js --max-memory=1000 --max-duration=600

# Monitor memory usage
node scripts/post-edit-pipeline.js file.js --memory-monitor
```

**Memory Protections**:
- **Process Timeouts**: 30s default, tool-specific limits
- **Buffer Size Limits**: 1MB default, overflow protection
- **Auto-Kill Safeguards**: SIGTERM ’ SIGKILL escalation
- **Real-Time Monitoring**: 5-second interval checks
- **Emergency Shutdown**: Configurable memory/duration limits

### Agent Coordination
```bash
# Store results with memory key for swarm coordination
node scripts/post-edit-pipeline.js file.js --memory-key "swarm/coordinator/step1"

# Agent context tracking
node scripts/post-edit-pipeline.js file.js --agent-type coder --session-id swarm-123
```

**Coordination Features**:
- **Memory Storage**: SQLite with 5-level ACL (Agent, Team, Swarm, Project, System)
- **Swarm Integration**: CFN Loop coordination patterns
- **Agent Context**: Track agent work and decision making
- **Consensus Building**: Multi-agent validation support

## Configuration Options

### Memory and Performance
```bash
--max-memory <MB>         # Maximum memory usage (default: 500MB)
--max-duration <seconds>   # Maximum execution time (default: 300s)
--memory-monitor          # Enable detailed memory monitoring
--timeout-multiplier <n>   # Multiply default timeouts (default: 1.0)
```

### TDD and Testing
```bash
--tdd-mode                # Enable TDD enforcement
--minimum-coverage <n>     # Minimum coverage percentage (default: 80)
--block-on-tdd-violations  # Block execution on TDD failures
--test-framework <name>    # Specify test framework (jest, mocha, pytest)
--coverage-thresholds <n>  # Set coverage thresholds (line:80,branch:75)
```

### Language-Specific
```bash
--rust-strict             # Enable strict Rust quality checks
--validate-markdown       # Enable link checking and structure validation
--no-wasm                 # Disable WASM acceleration (for debugging)
--wasm-acceleration       # Enable 52x WASM acceleration (default)
```

### Output and Reporting
```bash
--structured              # Return structured JSON output
--verbose                 # Detailed logging and progress
--quiet                   # Minimal output only
--log-file <path>         # Custom log file location
```

## Process Flow

### 1. File Analysis (First Check)
```javascript
// Root directory validation (highest priority)
if (isRootDirectory && !allowedRootFiles.includes(fileName)) {
    return rootDirectoryWarning();
}
```

### 2. Language Detection
```javascript
// Automatic language detection
const language = this.detectLanguage(filePath);
const validator = this.languageValidators[language];
```

### 3. Progressive Validation
```javascript
// Sequential validation phases
const syntaxResult = await this.validateSyntax(filePath, language);
const interfaceResult = await this.validateInterface(filePath, language);
const integrationResult = await this.validateIntegration(filePath, language);
```

### 4. TDD Enforcement
```javascript
// Test-first compliance checking
if (options.tddMode) {
    const tddResult = await this.checkTDDCompliance(filePath, language);
    if (!tddResult.compliant && options.blockOnTDDViolations) {
        return { blocked: true, reason: 'TDD violation' };
    }
}
```

### 5. Code Quality
```javascript
// Formatting, linting, type checking
const formatResult = await this.formatFile(filePath, language);
const lintResult = await this.lintFile(filePath, language);
const typeCheckResult = await this.typeCheck(filePath, language);
```

### 6. Security Analysis
```javascript
// Security scanning and vulnerability detection
const securityResult = await this.securityScan(filePath, language);
if (securityResult.vulnerabilities.length > 0) {
    return { blocked: true, vulnerabilities: securityResult.vulnerabilities };
}
```

### 7. Test Execution
```javascript
// Single-file test execution
const testResult = await this.executeTests(filePath, content);
if (testResult.coverage < options.minimumCoverage) {
    return { warning: 'Low test coverage', coverage: testResult.coverage };
}
```

## Memory Usage Monitoring

### Process Tracking
```bash
# Monitor all spawned processes
ps aux | grep post-edit-pipeline.js

# Check memory usage patterns
node scripts/memory-monitor-coordinator.js --interval=5000 --max-duration=300000
```

### Memory Leak Prevention
```javascript
// Automatic cleanup on timeout
const timeoutId = setTimeout(() => {
    if (!killed) {
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 5000);
    }
}, timeout);
```

### Buffer Management
```javascript
// Size limit enforcement
if (stdout.length + chunk.length > maxBufferSize) {
    if (killOnOversize) {
        proc.kill('SIGKILL');
    } else {
        stdout = stdout.substring(0, maxBufferSize - chunk.length) + chunk;
    }
}
```

## Integration Points

### Git Hooks
```bash
# Post-commit hook integration
echo "node scripts/post-edit-pipeline.js \$1 --tdd-mode" > .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

### CI/CD Pipeline
```yaml
# GitHub Actions example
- name: Post-Edit Validation
  run: |
    node scripts/post-edit-pipeline.js src/**/*.js --tdd-mode --minimum-coverage 85
    node scripts/post-edit-pipeline.js src/**/*.ts --rust-strict
```

### IDE Integration
```json
// VS Code settings.json
{
    "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
    },
    "files.associations": {
        "*.js": "post-edit-pipeline"
    }
}
```

## Troubleshooting

### Memory Issues
```bash
# Check current memory usage
ps aux | grep post-edit-pipeline

# Kill runaway processes
pkill -f post-edit-pipeline.js

# Reduce memory limits
node scripts/post-edit-pipeline.js file.js --max-memory=100
```

### Timeout Issues
```bash
# Increase timeouts for large files
node scripts/post-edit-pipeline.js large-file.js --max-duration=600

# Disable certain validations for speed
node scripts/post-edit-pipeline.js file.js --no-security-scan --no-tdd-mode
```

### Language Detection Issues
```bash
# Specify language explicitly
node scripts/post-edit-pipeline.js file.js --language typescript

# Check detected language
node scripts/post-edit-pipeline.js file.js --verbose | grep "Language detected"
```

## Performance Metrics

### Validation Times
- **Syntax Validation**: <100ms
- **Interface Validation**: <500ms
- **Integration Validation**: <1s
- **TDD Enforcement**: <2s
- **Security Scanning**: <3s
- **Test Execution**: Variable (depends on test suite)

### Memory Usage
- **Base Process**: 50-100MB
- **Language Detection**: +10MB
- **Test Execution**: +100-500MB
- **Security Scanning**: +50MB
- **Total Typical**: 200-800MB

### Coverage Requirements
```bash
# Default coverage thresholds
--minimum-coverage 80      # Overall coverage
--line-coverage 80         # Line coverage
--branch-coverage 75       # Branch coverage
--function-coverage 80     # Function coverage
--statement-coverage 80    # Statement coverage
```

## Advanced Usage

### Custom Validators
```javascript
// Add custom language validator
pipeline.addLanguageValidator('custom', {
    syntax: customSyntaxCheck,
    interface: customInterfaceCheck,
    security: customSecurityCheck
});
```

### Batch Processing
```bash
# Process multiple files
for file in src/**/*.js; do
    node scripts/post-edit-pipeline.js "$file" --tdd-mode
done
```

### Integration with CFN Loop
```javascript
// CFN Loop memory patterns
const memoryKey = `cfn/phase-${phaseId}/loop3/${agentId}`;
node scripts/post-edit-pipeline.js file.js --memory-key "$memoryKey"
```

## Related Resources

- **Main Documentation**: [../CLAUDE.md](../CLAUDE.md) - Critical rules and workflows
- **Hooks Documentation**: [logs-hooks.md](./logs-hooks.md) - Hook integration patterns
- **Memory Management**: [logs-cli-redis.md](./logs-cli-redis.md) - Redis coordination
- **Security**: [../config/hooks/post-edit-pipeline.js](../config/hooks/post-edit-pipeline.js) - Full implementation
- **Testing**: [additional-commands.md](./additional-commands.md) - Testing framework integration

---