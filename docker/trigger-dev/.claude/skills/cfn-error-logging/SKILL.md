# CFN Error Logging Skill

## Metadata
- **Skill ID:** cfn-error-logging
- **Version:** 1.0.0
- **Category:** Error Management & Debugging
- **Dependencies:** redis-coordination, system-diagnostics
- **Maturity:** Production
- **Last Updated:** 2025-11-10

## Purpose
Comprehensive error logging and diagnostic capture for CFN Loop failures. Creates detailed error reports that users can send for debugging when CFN loops fail in CLI or Docker modes.

## Responsibilities
1. **Error Detection**: Monitor CFN Loop execution for failures and exceptions
2. **Diagnostic Capture**: Collect system state, logs, and configuration data
3. **Report Generation**: Create user-friendly error reports with actionable information
4. **Log Management**: Store, organize, and clean up error logs
5. **Integration**: Hook into CLI and Docker CFN Loop failure points

## Interface

### Main Entry Point
```bash
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action <capture|report|cleanup|list> \
  --task-id <unique-id> \
  [--error-type <orchestrator|agent-spawn|timeout|consensus|resource>] \
  [--error-message <description>] \
  [--exit-code <number>] \
  [--context <json>]
```

### Parameters
- `action`: Operation to perform (capture, report, cleanup, list)
- `task-id`: Unique CFN Loop task identifier
- `error-type`: Type of error that occurred
- `error-message`: Human-readable error description
- `exit-code`: Process exit code (if available)
- `context`: Additional context data (JSON format)

### Available Actions

#### **capture** - Capture Error Data
```bash
# Automatic capture on CFN Loop failure
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action capture \
  --task-id "cfn-cli-1731234567" \
  --error-type "orchestrator" \
  --error-message "Agent spawning failed" \
  --exit-code 1
```

#### **report** - Generate User Report
```bash
# Generate user-friendly error report
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action report \
  --task-id "cfn-cli-1731234567" \
  --format "markdown"
```

#### **cleanup** - Manage Error Logs
```bash
# Clean old error logs (older than 7 days)
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action cleanup \
  --retention-days 7
```

#### **list** - List Error Logs
```bash
# List all error logs
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action list \
  --format "table"
```

## Data Captured

### System Diagnostics
- **Hardware**: CPU, memory, disk space usage
- **Software**: OS version, Node.js version, npx version
- **Dependencies**: Redis connectivity, Docker status
- **Network**: Connection status, latency

### CFN Loop State
- **Configuration**: Task ID, mode, agent lists, thresholds
- **Execution**: Current iteration, agent PIDs, timeouts
- **Redis Data**: Task context, agent states, confidence scores
- **Checkpoints**: Last successful iteration, saved state

### Error Context
- **Error Details**: Type, message, exit code, timestamp
- **Stack Traces**: Process logs, error messages, debug output
- **Environment**: Working directory, environment variables
- **Process Tree**: Parent/child process relationships

## Integration Points

### CLI Loop Integration
```bash
# Add to orchestrate.sh error handling
if [ $EXIT_CODE -ne 0 ]; then
  ./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
    --action capture \
    --task-id "$TASK_ID" \
    --error-type "orchestrator" \
    --error-message "CFN Loop failed at iteration $ITERATION" \
    --exit-code $EXIT_CODE
fi
```

### Docker Loop Integration
```bash
# Add to cfn-docker-loop-orchestration error handling
if [ $CONTAINER_EXIT_CODE -ne 0 ]; then
  ./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
    --action capture \
    --task-id "$TASK_ID" \
    --error-type "docker" \
    --error-message "Container failed: $CONTAINER_NAME" \
    --exit-code $CONTAINER_EXIT_CODE
fi
```

### Agent Spawning Integration
```bash
# Add to agent spawning error handling
if ! $SPAWN_COMMAND; then
  ./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
    --action capture \
    --task-id "$TASK_ID" \
    --error-type "agent-spawn" \
    --error-message "Failed to spawn agent: $AGENT_TYPE" \
    --exit-code $?
fi
```

## Error Report Format

### Markdown Report (User-Friendly)
```markdown
# CFN Loop Error Report

## 🚨 Error Summary
- **Task ID**: cfn-cli-1731234567
- **Error Type**: orchestrator
- **Message**: Agent spawning failed
- **Timestamp**: 2025-11-10 04:30:15 UTC
- **Exit Code**: 1

## 📋 Quick Diagnosis
**Most Likely Cause**: npx not found or Redis connection failed
**Recommended Action**: Check dependencies with pre-flight validation

## 🔧 Troubleshooting Steps
1. ✅ Check Node.js installation: `node --version`
2. ✅ Check npx availability: `npx --version`
3. ❌ Check Redis connection: `redis-cli ping`
4. ✅ Check available memory: `free -h`

## 📊 System State
- **Memory Usage**: 65% (2.6GB/4GB)
- **Disk Space**: 45GB available
- **CPU Load**: 0.8
- **Concurrent CFN Loops**: 3

## 📝 Send This Report
**To**: Your Claude assistant
**Include**:
- Complete error details above
- Any recent changes to your setup
- Steps you were trying to perform
```

## JSON Report (Machine-Readable)
```json
{
  "task_id": "cfn-cli-1731234567",
  "error_type": "orchestrator",
  "error_message": "Agent spawning failed",
  "timestamp": "2025-11-10T04:30:15Z",
  "exit_code": 1,
  "system_diagnostics": {...},
  "cfn_state": {...},
  "troubleshooting_steps": [...]
}
```

## Storage and Management

### Log Location
- **Base Directory**: `/tmp/cfn_error_logs/`
- **Individual Logs**: `/tmp/cfn_error_logs/cfn-error-<task-id>-<timestamp>.json`
- **Reports**: `/tmp/cfn_error_logs/reports/cfn-report-<task-id>-<timestamp>.md`

### Log Rotation
- **Retention**: 7 days by default
- **Cleanup**: Automatic cleanup on skill invocation
- **Compression**: Compress logs older than 1 day
- **Size Limit**: Maximum 100MB of error logs total

### Privacy Considerations
- **No Code**: Never captures source code content
- **No Credentials**: Strips sensitive environment variables
- **Local Storage**: All logs stored locally, user-controlled
- **User Consent**: Error capture only on explicit failures

## Usage Examples

### Capture Error on CLI Loop Failure
```bash
# In cfn-loop-cli command
if ! npx claude-flow-novice agent cfn-v3-coordinator ...; then
  ./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
    --action capture \
    --task-id "$TASK_ID" \
    --error-type "cli-coordinator" \
    --error-message "CLI coordinator failed to start"
fi
```

### Generate Debug Report
```bash
# After CFN Loop failure
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action report \
  --task-id "cfn-cli-1731234567" \
  --format markdown > /tmp/cfn_error_report.md

echo "📋 Error report saved to: /tmp/cfn_error_report.md"
echo "📤 Send this file to your Claude assistant for debugging help"
```

### List Recent Errors
```bash
# List all recent errors
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action list \
  --format table

# List errors from last 24 hours
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action list \
  --since "24h" \
  --format json
```

## Error Categories

### Orchestrator Errors
- Configuration validation failures
- Parameter parsing errors
- Mode threshold mismatches
- Resource allocation failures

### Agent Spawning Errors
- npx command failures
- Node.js environment issues
- Agent binary not found
- Container runtime errors

### Coordination Errors
- Redis connection failures
- Key conflicts and race conditions
- Timeout errors
- Consensus calculation failures

### Resource Errors
- Memory exhaustion
- Disk space shortage
- Process limit exceeded
- Network connectivity issues

### System Errors
- Permission denied
- File system errors
- Signal termination
- Unexpected crashes

## Troubleshooting Guide

### Common Error Patterns
1. **"npx not found"**: Install Node.js and npx globally
2. **"Redis connection failed"**: Start Redis server or check configuration
3. **"Memory exhaustion"**: Close other applications or increase system memory
4. **"Permission denied"**: Check file permissions and user access

### Diagnostic Commands
```bash
# System health check
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action diagnostics

# Dependency validation
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action validate-dependencies

# Resource monitoring
./.claude/skills/cfn-error-logging/invoke-error-logging.sh \
  --action monitor-resources
```

## Best Practices

### For Users
1. **Send Complete Reports**: Include the full error report when asking for help
2. **Provide Context**: Describe what you were trying to accomplish
3. **Check Dependencies**: Run pre-flight validation before complex tasks
4. **Monitor Resources**: Watch memory and disk usage during long-running tasks

### For Developers
1. **Integration Points**: Add error logging to all CFN Loop failure points
2. **Error Categories**: Use appropriate error types for better classification
3. **Context Capture**: Include relevant state information for debugging
4. **Privacy**: Never capture sensitive data or code content

### For System Administrators
1. **Log Management**: Regular cleanup of old error logs
2. **Monitoring**: Track error frequency and patterns
3. **Resource Planning**: Ensure adequate memory and disk space
4. **Dependency Management**: Keep Node.js, Redis, and Docker updated

## Troubleshooting

### Skill Failures
If the error logging skill itself fails:
1. **Check Permissions**: Ensure write access to `/tmp/`
2. **Disk Space**: Verify available space for log files
3. **Dependencies**: Check for required system tools (jq, bc, etc.)
4. **Fallback**: Use manual error reporting with basic system diagnostics

### Common Issues
- **Permission Denied**: Fix directory permissions
- **Disk Full**: Clean up old error logs
- **Missing Tools**: Install required dependencies
- **Timezone Issues**: Use UTC timestamps consistently