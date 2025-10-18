# Troubleshooting Guide

> **Solutions to common issues and problems with Claude Flow CLI**

This guide helps you diagnose and resolve common issues when using Claude Flow. Issues are organized by category with step-by-step solutions.

## 🚨 Quick Diagnostics

### Health Check Command
Start troubleshooting with a comprehensive health check:

```bash
claude-flow-novice status --detailed --format json > health-check.json
claude-flow-novice agents status --all
claude-flow-novice mcp claude-flow-novice health_check --deep
```

### Common Quick Fixes
```bash
# Restart agents that might be stuck
claude-flow-novice agents restart --all-failed

# Clear cache and temporary files
claude-flow-novice system-cleanup --cache --temp-files

# Reset to known good state
claude-flow-novice system-reset --safe

# Update to latest version
npm update -g claude-flow@alpha
```

---

## 🔧 Installation & Setup Issues

### Installation Problems

#### Issue: `npm install -g claude-flow@alpha` fails
**Symptoms:**
- Permission errors
- Network timeouts
- Package not found

**Solutions:**
```bash
# Try with different permissions
sudo npm install -g claude-flow@alpha

# Use different registry
npm install -g claude-flow@alpha --registry https://registry.npmjs.org/

# Clear npm cache first
npm cache clean --force
npm install -g claude-flow@alpha

# Use yarn instead
yarn global add claude-flow@alpha
```

#### Issue: Command not found after installation
**Symptoms:**
- `claude-flow: command not found`
- PATH issues

**Solutions:**
```bash
# Check if installed
npm list -g claude-flow

# Find installation path
npm config get prefix

# Add to PATH (Linux/Mac)
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Add to PATH (Windows)
# Add npm global path to System PATH environment variable
```

#### Issue: Version conflicts
**Symptoms:**
- Unexpected behavior
- Missing features
- Outdated help text

**Solutions:**
```bash
# Check current version
claude-flow-novice --version

# Force reinstall latest
npm uninstall -g claude-flow
npm install -g claude-flow@alpha

# Clear all caches
npm cache clean --force
claude-flow-novice system-cleanup --all
```

### MCP Server Setup Issues

#### Issue: MCP servers not connecting
**Symptoms:**
- MCP commands fail
- Connection timeouts
- Authentication errors

**Solutions:**
```bash
# Check MCP server status
claude mcp list

# Add/re-add servers
claude mcp remove claude-flow
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Test connection
claude mcp test claude-flow

# Debug connection
claude mcp debug claude-flow-novice --verbose
```

#### Issue: Authentication failures
**Symptoms:**
- "Authentication required" errors
- Token expired messages
- Permission denied

**Solutions:**
```bash
# Re-authenticate
claude auth logout
claude auth login --interactive

# Check authentication status
claude auth status

# For Flow Nexus (if using)
npx flow-nexus@latest login --interactive
```

---

## 🚀 Command Execution Issues

### Build Command Problems

#### Issue: `claude-flow-novice build` hangs or times out
**Symptoms:**
- Command never completes
- No agent activity
- Timeout errors

**Solutions:**
```bash
# Check agent status
claude-flow-novice agents status --detailed

# Restart stuck agents
claude-flow-novice agents restart --all

# Try with shorter timeout
claude-flow-novice build "your task" --timeout 300

# Use dry-run to see plan
claude-flow-novice build "your task" --dry-run

# Try simpler task
claude-flow-novice build "create hello world function"
```

#### Issue: Build fails with unclear errors
**Symptoms:**
- Generic error messages
- No specific failure point
- Partial completion

**Solutions:**
```bash
# Enable verbose logging
claude-flow-novice build "your task" --verbose --debug

# Check recent logs
claude-flow-novice logs --recent --errors-only

# Review project status
claude-flow-novice status --detailed

# Try incremental approach
claude-flow-novice build "analyze requirements for [your task]"
claude-flow-novice build "design approach for [your task]"
```

#### Issue: Natural language not understood
**Symptoms:**
- "Could not understand" messages
- Low confidence scores
- Wrong agent selection

**Solutions:**
```bash
# Be more specific
# Instead of: "make it better"
# Try: "improve page loading speed by optimizing images"

# Use technical terms
# Instead of: "fix the broken thing"
# Try: "fix authentication token validation error"

# Break down complex requests
# Instead of: "build entire e-commerce site"
# Try: "create user authentication system"

# Use examples
claude-flow-novice help build --examples
```

### Agent Management Issues

#### Issue: Agents not spawning
**Symptoms:**
- Agent spawn commands fail
- No agents in status
- Resource allocation errors

**Solutions:**
```bash
# Check available resources
claude-flow-novice system-status --resources

# Try spawning with lower resource limits
claude-flow-novice agents spawn coder --memory 256mb

# Clear agent cache
claude-flow-novice agents cleanup --inactive

# Reset agent system
claude-flow-novice agents reset --confirm
```

#### Issue: Agents performing poorly
**Symptoms:**
- Slow task completion
- Poor quality results
- High resource usage

**Solutions:**
```bash
# Check agent metrics
claude-flow-novice agents metrics --detailed

# Optimize agent allocation
claude-flow-novice agents optimize --performance

# Restart underperforming agents
claude-flow-novice agents restart --performance-issues

# Update agent models
claude-flow-novice agents update --all
```

### Testing Issues

#### Issue: Test generation fails
**Symptoms:**
- No tests created
- Invalid test files
- Framework detection errors

**Solutions:**
```bash
# Check project structure
claude-flow-novice status --project-info

# Specify test framework explicitly
claude-flow-novice test unit --framework jest --generate

# Start with simple tests
claude-flow-novice test unit --pattern "utils/**" --generate

# Check test configuration
claude-flow-novice config test --show
```

#### Issue: Tests fail to run
**Symptoms:**
- Test runner errors
- Missing dependencies
- Configuration issues

**Solutions:**
```bash
# Install missing dependencies
claude-flow-novice build "install and configure testing dependencies"

# Fix test configuration
claude-flow-novice test --fix-config

# Run specific test file
claude-flow-novice test unit --file "specific.test.js"

# Check test environment
claude-flow-novice test --check-environment
```

---

## 🚢 Deployment Issues

### Deployment Failures

#### Issue: Deployment hangs or fails
**Symptoms:**
- Deployment timeouts
- Infrastructure errors
- Build failures

**Solutions:**
```bash
# Check deployment status
claude-flow-novice deploy status --environment staging

# Try dry run first
claude-flow-novice deploy staging --dry-run

# Use safe deployment mode
claude-flow-novice deploy staging --safe-mode --rollback-on-failure

# Check deployment logs
claude-flow-novice deploy logs --environment staging --tail 100
```

#### Issue: Environment configuration errors
**Symptoms:**
- Missing environment variables
- Configuration validation fails
- Service connection errors

**Solutions:**
```bash
# Validate environment configuration
claude-flow-novice deploy validate-config --environment staging

# Check environment variables
claude-flow-novice config env --show --environment staging

# Fix configuration
claude-flow-novice build "fix environment configuration for staging deployment"

# Test configuration
claude-flow-novice deploy test-config --environment staging
```

### Rollback Issues

#### Issue: Rollback fails
**Symptoms:**
- Cannot revert to previous version
- Data migration issues
- Service unavailable

**Solutions:**
```bash
# Check available versions
claude-flow-novice deploy versions --environment production

# Force rollback to specific version
claude-flow-novice deploy rollback --version v1.2.2 --force

# Manual rollback if needed
claude-flow-novice deploy manual-rollback --emergency

# Check rollback status
claude-flow-novice deploy rollback-status --detailed
```

---

## 💾 Memory & Performance Issues

### Memory Problems

#### Issue: Out of memory errors
**Symptoms:**
- "Out of memory" messages
- System crashes
- Slow performance

**Solutions:**
```bash
# Check memory usage
claude-flow-novice mcp claude-flow-novice memory_usage --detailed

# Clean up memory
claude-flow-novice mcp claude-flow-novice memory_compress --all-namespaces

# Restart with more memory
claude-flow-novice agents restart --memory-limit 1024mb

# Optimize memory usage
claude-flow-novice optimize memory --aggressive
```

#### Issue: Memory leaks
**Symptoms:**
- Increasing memory usage over time
- System slowdown
- Agent instability

**Solutions:**
```bash
# Analyze memory patterns
claude-flow-novice optimize memory --analyze --detailed

# Fix detected leaks
claude-flow-novice optimize memory --fix --safe-only

# Monitor memory usage
claude-flow-novice status --watch --memory-tracking

# Restart agents periodically
claude-flow-novice agents schedule-restart --interval 4h
```

### Performance Issues

#### Issue: Slow command execution
**Symptoms:**
- Commands take too long
- Timeouts occur frequently
- Poor responsiveness

**Solutions:**
```bash
# Analyze performance bottlenecks
claude-flow-novice mcp claude-flow-novice bottleneck_analyze --all

# Optimize system performance
claude-flow-novice optimize --all-targets --apply

# Use parallel execution
claude-flow-novice build "your task" --parallel

# Check system resources
claude-flow-novice system-status --performance
```

#### Issue: High CPU usage
**Symptoms:**
- System runs hot
- Fan noise
- Sluggish performance

**Solutions:**
```bash
# Check CPU usage by component
claude-flow-novice system-status --cpu-breakdown

# Optimize CPU usage
claude-flow-novice optimize cpu --limit-processes

# Reduce parallel operations
claude-flow-novice config set parallel-limit 4

# Use efficiency mode
claude-flow-novice config set efficiency-mode true
```

---

## 🔐 Security & Permission Issues

### Permission Errors

#### Issue: Access denied errors
**Symptoms:**
- "Permission denied" messages
- Cannot write files
- Cannot access directories

**Solutions:**
```bash
# Check file permissions
ls -la $(pwd)

# Fix directory permissions
chmod 755 $(pwd)
chmod -R 644 $(pwd)/*

# Run with appropriate permissions
sudo claude-flow-novice init --skip-git

# Use different directory
mkdir ~/claude-flow-projects
cd ~/claude-flow-projects
claude-flow-novice init
```

#### Issue: Authentication failures
**Symptoms:**
- API authentication errors
- Token validation failures
- Access token expired

**Solutions:**
```bash
# Re-authenticate
claude auth logout
claude auth login

# Check authentication status
claude auth status --detailed

# Refresh tokens
claude auth refresh

# Use different authentication method
claude auth login --method interactive
```

### Security Warnings

#### Issue: Security scan failures
**Symptoms:**
- Vulnerability warnings
- Insecure dependencies
- Code security issues

**Solutions:**
```bash
# Run comprehensive security scan
claude-flow-novice review security --detailed

# Fix automatically
claude-flow-novice review security --fix --safe-only

# Update dependencies
claude-flow-novice build "update dependencies to secure versions"

# Check security status
claude-flow-novice security-status --detailed
```

---

## 🌐 Network & Connectivity Issues

### Connection Problems

#### Issue: Network timeouts
**Symptoms:**
- Connection timeout errors
- Slow downloads
- MCP server unreachable

**Solutions:**
```bash
# Check network connectivity
ping api.anthropic.com

# Use different network configuration
claude-flow-novice config network --retry-count 5 --timeout 60

# Configure proxy if needed
claude-flow-novice config proxy --url http://proxy.company.com:8080

# Test with different DNS
claude-flow-novice config dns --server 8.8.8.8
```

#### Issue: Firewall blocking connections
**Symptoms:**
- Connection refused errors
- Port blocking messages
- Corporate network issues

**Solutions:**
```bash
# Check required ports
claude-flow-novice network-test --ports

# Configure firewall exceptions
# Allow outbound HTTPS (443)
# Allow WebSocket connections

# Use alternative endpoints
claude-flow-novice config endpoint --alternative

# Contact IT for allowlist
claude-flow-novice config network-requirements --export
```

---

## 🔄 Configuration Issues

### Configuration Problems

#### Issue: Invalid configuration
**Symptoms:**
- Configuration validation errors
- Unexpected behavior
- Settings not applied

**Solutions:**
```bash
# Validate configuration
claude-flow-novice config validate --detailed

# Reset to defaults
claude-flow-novice config reset --confirm

# Fix specific issues
claude-flow-novice config fix --auto

# Show current configuration
claude-flow-novice config show --all
```

#### Issue: Environment variable conflicts
**Symptoms:**
- Conflicting settings
- Unexpected values
- Environment detection issues

**Solutions:**
```bash
# Check environment variables
claude-flow-novice config env --show

# Clear conflicting variables
unset CLAUDE_FLOW_DEBUG
unset CLAUDE_FLOW_VERBOSE

# Set correct environment
export CLAUDE_FLOW_ENV=development

# Check effective configuration
claude-flow-novice config effective --show
```

---

## 🐛 Advanced Debugging

### Debug Mode

#### Enable comprehensive debugging
```bash
# Maximum verbosity
claude-flow-novice --debug --verbose command

# Log to file
claude-flow-novice command --log-file debug.log --log-level trace

# Interactive debugging
claude-flow-novice debug --interactive command
```

#### Analyze debug information
```bash
# View recent logs
claude-flow-novice logs --recent --level debug

# Analyze error patterns
claude-flow-novice logs --analyze --errors

# Export debug information
claude-flow-novice debug-export --include-logs --include-config
```

### System Diagnostics

#### Comprehensive system check
```bash
# Full system diagnostic
claude-flow-novice diagnostic --comprehensive

# Check all components
claude-flow-novice mcp claude-flow-novice health_check --components all

# Performance analysis
claude-flow-novice benchmark --system --detailed

# Generate diagnostic report
claude-flow-novice diagnostic-report --format html --include-recommendations
```

---

## 📞 Getting Help

### Self-Help Resources

```bash
# Interactive troubleshooting
claude-flow-novice help --troubleshoot --interactive

# Search help for specific issues
claude-flow-novice help --search "memory error"

# Get contextual help
claude-flow-novice help command --troubleshoot

# Show recent known issues
claude-flow-novice help --known-issues --recent
```

### Community & Support

#### Documentation
- [Official Documentation](https://github.com/ruvnet/claude-flow/docs)
- [Community Wiki](https://github.com/ruvnet/claude-flow/wiki)
- [Troubleshooting Guide](https://docs.claude-flow.com/troubleshooting)

#### Community Support
- [GitHub Issues](https://github.com/ruvnet/claude-flow/issues)
- [Discord Community](https://discord.gg/claude-flow)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/claude-flow)

#### Bug Reporting

```bash
# Generate bug report
claude-flow-novice bug-report --auto-collect

# Include system information
claude-flow-novice bug-report --include-system --include-logs

# Upload diagnostic data
claude-flow-novice bug-report --upload --consent
```

---

## 🔧 Emergency Recovery

### System Recovery

#### Safe mode startup
```bash
# Start in safe mode
claude-flow-novice --safe-mode status

# Reset to factory defaults
claude-flow-novice system-reset --factory-defaults --confirm

# Recover from backup
claude-flow-novice system-restore --backup-id latest
```

#### Data recovery
```bash
# Backup current state
claude-flow-novice backup-create --emergency

# Recover lost work
claude-flow-novice recover --session-id last --include-partial

# Restore from automatic backup
claude-flow-novice restore --auto-backup --latest
```

### Emergency Contacts

For critical issues:
- Email: support@claude-flow.com
- Emergency: priority-support@claude-flow.com
- Security: security@claude-flow.com

---

## 📋 Troubleshooting Checklist

### Before Reporting Issues

- [ ] Check Claude Flow version: `claude-flow-novice --version`
- [ ] Run health check: `claude-flow-novice status --detailed`
- [ ] Check recent logs: `claude-flow-novice logs --recent --errors`
- [ ] Try with different command: `claude-flow-novice help`
- [ ] Clear cache: `claude-flow-novice system-cleanup --cache`
- [ ] Restart agents: `claude-flow-novice agents restart --all`
- [ ] Check network connectivity: `ping api.anthropic.com`
- [ ] Verify authentication: `claude auth status`
- [ ] Check disk space: `df -h`
- [ ] Check memory usage: `free -m` (Linux) or Activity Monitor (Mac)

### Information to Include in Bug Reports

- Claude Flow version
- Operating system and version
- Node.js version
- Command that failed (with sanitized inputs)
- Complete error message
- Steps to reproduce
- Expected vs actual behavior
- System resource status
- Recent logs (sanitized)

This troubleshooting guide should help resolve most common issues. For problems not covered here, use the interactive help system or community resources.