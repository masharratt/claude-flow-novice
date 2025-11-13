# Concurrent Docker Agent MVP Test

## Overview

This test validates the core MVP workflow with 6-7 agents running in parallel:

1. **Agent Spawning**: Multiple agents spawned in Docker containers concurrently
2. **Task Execution**: Each agent performs real file operations in shared workspaces
3. **Result Collection**: Coordinator collects results from agent workspaces
4. **Cleanup Verification**: Automatic container and workspace cleanup verification

## What It Tests

### ✅ **MVP Core Features**
- **Concurrent Execution**: 6-7 agents running in parallel
- **Real File Operations**: Agents create/edit files in container workspaces
- **Result Coordination**: Results collected from shared workspaces (no MCP needed)
- **Container Cleanup**: Automatic cleanup of containers and workspaces
- **Resource Management**: Memory limits and resource isolation

### ❌ **What It Doesn't Test**
- MCP tool integration (not needed for MVP)
- Complex coordination patterns
- Advanced error handling
- Network communication between containers

## Agent Types Tested

1. **react-frontend-engineer** - Creates React component files
2. **backend-developer** - Creates API endpoint files
3. **database-architect** - Creates database schema files
4. **security-specialist** - Creates security analysis files
5. **tester** - Creates test specification files
6. **documentation-writer** - Creates documentation files
7. **code-reviewer** - Creates code review files

## Usage

### Quick Start

```bash
# Run the concurrent test
./tests/hello-world-docker/run-concurrent-test.sh

# Run with verbose logging
./tests/hello-world-docker/run-concurrent-test.sh --verbose

# Run without cleanup (for debugging)
./tests/hello-world-docker/run-concurrent-test.sh --skip-cleanup
```

### Prerequisites

- Docker daemon running
- Redis server running
- Docker image `claude-flow-novice:agent` built
- Node.js available

## Test Workflow

### 1. Agent Spawning (Parallel)
- Creates 6-7 agent containers concurrently
- Each container gets isolated workspace directory
- Memory limits enforced (512m per container)

### 2. Task Execution (Concurrent)
- Each agent receives task instructions via JSON file
- Agents perform file operations in their workspace:
  - Create task result files
  - Create workspace verification files
  - Create completion log files

### 3. Result Collection
- Coordinator reads results from workspace directories
- Validates expected files were created
- Checks file content and metadata

### 4. Cleanup Verification
- Verifies containers are stopped and removed
- Verifies workspace directories are cleaned up
- Reports any orphaned resources

## Success Criteria

Test passes if **all** criteria met:
- ✅ ≥80% agents complete tasks successfully
- ✅ ≥60% expected files created
- ✅ All containers cleaned up properly
- ✅ All workspace directories cleaned up
- ✅ Parallel execution with >1 agent

## Expected Output

### Success Example
```
🚀 CONCURRENT DOCKER AGENT MVP TEST RESULTS
============================================================

👥 Agent Performance:
   Total Agents: 7
   Completed: 6 (85.7%)
   Partial: 1
   Failed: 0

📁 File Creation:
   Files Created: 18
   Expected Files: 21
   Success Rate: 85.7%)

🧹 Cleanup Results:
   Containers Cleaned: 7/7
   Workspaces Cleaned: 7/7
   Cleanup Success: ✅

✅ Success Criteria:
   ✅ sufficientAgentCompletion: PASSED
   ✅ sufficientFileCreation: PASSED
   ✅ cleanupSuccessful: PASSED
   ✅ parallelExecutionSucceeded: PASSED

🎯 Test Result:
   Status: ✅ PASSED
   Overall: Concurrent agent execution successful
```

## Troubleshooting

### Common Issues

**Docker image not found**
```bash
# Build the agent image
docker build -t claude-flow-novice:agent .
```

**Redis not running**
```bash
# Start Redis server
redis-server
```

**Orphaned containers after test**
```bash
# Clean up manually
docker stop $(docker ps -a -q --filter 'name=agent-')
docker rm $(docker ps -a -q --filter 'name=agent-')
```

**Workspace directories not cleaned**
```bash
# Clean up workspaces
rm -rf /tmp/agent-workspace-*
rm -rf /tmp/concurrent-test-workspace
```

### Debug Mode

Run with `--verbose` flag for detailed logging:
```bash
./tests/hello-world-docker/run-concurrent-test.sh --verbose
```

Run with `--skip-cleanup` to inspect resources after test:
```bash
./tests/hello-world-docker/run-concurrent-test.sh --skip-cleanup
```

## Files Created

During execution, each agent creates 3 files:
- `{agent-type}-task-result.txt` - Main task output
- `{agent-type}-workspace-check.txt` - Workspace verification
- `{agent-type}-completion-log.txt` - Execution log

All files are saved in `/tmp/concurrent-test-workspace/{agent-type}/` and automatically cleaned up after the test.

## Integration with CI/CD

This test can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run Concurrent Agent Test
  run: |
    ./tests/hello-world-docker/run-concurrent-test.sh --verbose
  if: success()
```

The test exits with code 0 on success, non-zero on failure, making it easy to integrate with automated testing systems.

## 📬 Context Passing Test

In addition to concurrent execution, there's a separate **Context Passing Test** that validates coordinator-to-agent communication patterns:

### Usage
```bash
# Run context passing test
./tests/hello-world-docker/run-context-test.sh

# With verbose logging
./tests/hello-world-docker/run-context-test.sh --verbose
```

### Communication Methods Tested

1. **File-based Instruction Passing** (Last Resort)
   - Coordinator writes JSON instructions to file
   - Agent reads file and executes task
   - MVP pattern: Coordinator → File → Agent → Output

2. **Environment Variable Context**
   - Context passed via environment variables
   - Agent reads env vars for task context
   - Useful for simple configuration data

3. **Volume-mounted Configuration**
   - Configuration files mounted as volumes
   - Agent reads from /app/workspace/config/
   - Supports multi-file configuration

4. **Dynamic Task Assignment**
   - JSON assignment with status tracking
   - Agent updates assignment status during execution
   - Includes dependencies and priority information

### Success Criteria
- Context delivered successfully (files copied/created)
- Agent reads and understands context
- Task executed based on context
- Status tracking works (for dynamic assignment)

### Integration with Concurrent Test

The context passing test complements the concurrent test:
- **Concurrent Test**: Validates parallel execution and cleanup
- **Context Test**: Validates communication patterns

Run both tests for complete MVP validation:
```bash
./tests/hello-world-docker/run-concurrent-test.sh && ./tests/hello-world-docker/run-context-test.sh
```