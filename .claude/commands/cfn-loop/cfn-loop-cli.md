---
description: "Execute CFN Loop using local MDAP orchestration (no external dependencies)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--workdir=<path>] [--testcmd=<command>]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "SlashCommand"]
---

# CFN Loop CLI Mode - Local MDAP Orchestration

🚨 **v3.0 ARCHITECTURE:** Direct orchestration using local MDAP (no Trigger.dev or Redis required)

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```bash
# Extract task description (remove flags)
TASK_DESCRIPTION="$ARGUMENTS"
TASK_DESCRIPTION=$(echo "$TASK_DESCRIPTION" | sed 's/--mode[[:space:]]*[a-zA-Z]*//' | sed 's/--workdir[[:space:]]*[^[:space:]]*//' | sed 's/--testcmd[[:space:]]*"[^"]*"//' | sed 's/--testcmd[[:space:]]*[^[:space:]]*//' | xargs)

# Parse optional flags
MODE="standard"
WORKDIR="$(pwd)"
TESTCMD="npm test"

for arg in $ARGUMENTS; do
  case $arg in
    --mode=*)
      MODE="${arg#*=}"
      ;;
    --mode)
      shift
      MODE="$1"
      ;;
    --workdir=*)
      WORKDIR="${arg#*=}"
      ;;
    --workdir)
      shift
      WORKDIR="$1"
      ;;
    --testcmd=*)
      TESTCMD="${arg#*=}"
      ;;
    --testcmd)
      shift
      TESTCMD="$1"
      ;;
  esac
done

# Validate mode
if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
  echo "❌ ERROR: Invalid mode '$MODE'. Must be one of: mvp, standard, enterprise"
  exit 1
fi

# Validate workdir exists
if [ ! -d "$WORKDIR" ]; then
  echo "❌ ERROR: Working directory does not exist: $WORKDIR"
  exit 1
fi
```

**Step 2: Generate Task ID and Set Environment**
```bash
# Generate unique task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"

echo "📋 Task ID: $TASK_ID"
echo "🎯 Mode: $MODE"
echo "📁 Work Dir: $WORKDIR"
echo "🧪 Test Cmd: $TESTCMD"
echo "📝 Task: ${TASK_DESCRIPTION:0:100}..."
echo ""

# Set environment for any subprocesses
export CFN_TASK_ID="$TASK_ID"
export CFN_MODE="$MODE"
export CFN_WORKDIR="$WORKDIR"
```

**Step 3: Execute Local MDAP Orchestration**
```bash
# Create a temporary Node.js script to run the orchestrator
ORCHESTRATOR_SCRIPT="/tmp/cfn-orchestrate-${TASK_ID}.js"

cat > "$ORCHESTRATOR_SCRIPT" << 'EOF'
// CFN Loop CLI Orchestrator Script
// This script uses dynamic import to load the orchestrator

async function runOrchestration() {
  try {
    // Import the orchestrator using dynamic import
    const { orchestrate } = await import('./lib/mdap/orchestrator.js');

    // Get configuration from environment
    const payload = {
      taskDescription: process.env.CFN_TASK_DESCRIPTION || '',
      workDir: process.env.CFN_WORKDIR || process.cwd(),
      mode: process.env.CFN_MODE || 'standard',
      testCommand: process.env.CFN_TESTCMD || 'npm test'
    };

    // Execute orchestration
    const result = await orchestrate(payload);

    console.log('\n=== ORCHESTRATION RESULT ===');
    console.log(`Success: ${result.success}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Files Processed: ${result.filesProcessed}`);
    console.log(`Duration: ${result.durationMs}ms`);
    console.log(`Confidence: ${result.confidence}`);

    if (result.passRate !== undefined) {
      console.log(`Final Pass Rate: ${(result.passRate * 100).toFixed(1)}%`);
    }

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ ORCHESTRATION FAILED:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the orchestration
runOrchestration();
EOF

# Execute orchestration
echo "🚀 Starting local MDAP orchestration..."
echo ""

# Run the orchestration script
export CFN_TASK_DESCRIPTION="$TASK_DESCRIPTION"
export CFN_TESTCMD="$TESTCMD"

cd "$(dirname "$0")/../.."  # Navigate to project root
node "$ORCHESTRATOR_SCRIPT"
ORCHESTRATION_EXIT_CODE=$?

# Cleanup
rm -f "$ORCHESTRATOR_SCRIPT"

# Report final status
if [ $ORCHESTRATION_EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ CFN Loop CLI task completed successfully"
else
  echo ""
  echo "❌ CFN Loop CLI task failed"
fi

exit $ORCHESTRATION_EXIT_CODE
```

**Step 4: Query Agent Status (Optional - Interactive)**
```bash
# Not applicable for local orchestration - all status is shown in real-time
```

**Step 5: Inform User**
Report completion status, iterations completed, files processed, and test results.

---

## Background Information (DO NOT show this to user unless they ask)

**Task**: $ARGUMENTS

## What is CLI Mode?

**v3.0 CLI Mode Architecture (Local MDAP):**
- **Direct orchestration** using local MDAP orchestrator
- **No external dependencies** - no Redis, no Trigger.dev
- **Parallel decomposition** - runs architecture, testing, performance, and security analysis in parallel
- **Iterative implementation** - continues until gate check passes or max iterations reached
- **Built-in validation** - runs tests after each iteration to ensure quality

## New Features (v3.0)

### Local MDAP Integration
- Uses `lib/mdap/orchestrator.js` for all coordination
- Parallel decomposition of tasks from multiple perspectives
- Automatic implementation with security validation
- Gate checks using configurable test commands

### Mode-Based Execution
- **MVP**: Fast prototyping with 70% gate threshold
- **Standard**: Production quality with 95% gate threshold
- **Enterprise**: Compliance grade with 98% gate threshold

### Flexible Configuration
- Custom working directory support
- Configurable test commands
- Auto-detection of target files
- Language detection from task description

## Command Options

**Usage Examples:**
```
# Standard mode with default settings
/cfn-loop-cli "Implement JWT authentication"

# MVP mode for fast prototyping
/cfn-loop-cli "Build feature prototype" --mode=mvp

# Enterprise mode for critical systems
/cfn-loop-cli "Security audit" --mode=enterprise

# Custom working directory and test command
/cfn-loop-cli "Fix failing tests" --workdir ./src --testcmd "npm run test:unit"
```

**Options:**
- `--mode=<mvp|standard|enterprise>`: Quality mode (default: standard)
- `--workdir=<path>`: Working directory for implementation (default: current directory)
- `--testcmd=<command>`: Test command for gate checks (default: "npm test")

## Mode Comparison

| Mode | Gate Threshold | Max Iterations | Use Case |
|------|----------------|----------------|----------|
| MVP | 70% | 5 | Prototypes, quick experiments |
| Standard | 95% | 10 | Production features |
| Enterprise | 98% | 15 | Security, compliance |

## How Local MDAP Works

1. **Parse** command arguments and validate inputs
2. **Decompose** task from 4 perspectives in parallel:
   - Architecture analysis
   - Testing requirements
   - Performance considerations
   - Security implications
3. **Implement** generated microtasks in parallel
4. **Validate** implementation with test command (gate check)
5. **Iterate** if gate check fails (up to max iterations)
6. **Report** final results with confidence score

## Security Features

- Input validation for all parameters
- Whitelisted test commands to prevent injection
- Path traversal protection
- Shell metacharacter sanitization
- Secure command execution without shell

## Output Format

The orchestrator returns structured results:
```json
{
  "success": true,
  "iterations": 3,
  "passRate": 0.96,
  "filesProcessed": 5,
  "implementationResults": [...],
  "durationMs": 15420,
  "confidence": 0.9
}
```

This simplified architecture provides:
- ✅ **Zero external dependencies** - runs anywhere Node.js is available
- ✅ **Fast execution** - parallel decomposition and implementation
- ✅ **Quality assurance** - iterative testing with configurable thresholds
- ✅ **Security** - input validation and safe command execution
- ✅ **Flexibility** - configurable modes, directories, and test commands