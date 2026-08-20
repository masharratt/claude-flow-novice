# TypeScript Compilation Error Fixer

A local CFN skill that automatically fixes TypeScript compilation errors through a two-phase architecture combining Cerebras LLM bulk processing with dedicated CFN agent validation.

## Prerequisites

- Node.js 16+ and npm
- Cerebras API key
- TypeScript project with tsconfig.json

## Installation

```bash
# Navigate to the fixer directory
cd $HOME/.claude/skills/cfn-compilation-error-fixer/lib/fixer

# Install dependencies
npm install
```

## Configuration

Set the following environment variables:

```bash
# Required: Your Cerebras API key
export CEREBRAS_API_KEY="your-api-key"

# Required: Path to your TypeScript project root
export TS_PROJECT_PATH="/path/to/your/typescript/project"

# Optional: Additional configuration
export TS_MAX_FILES=50              # Max files to process (default: 50)
export TS_DRY_RUN=false            # Preview mode only (default: false)
export TS_VERBOSE=false             # Debug output (default: false)
```

## Usage

### Basic Usage
```bash
# Fix all TypeScript errors in the project
npx tsx typescript-gated-fixer-v2.ts
```

### Preview Mode (Dry Run)
```bash
# See what changes would be made without applying them
npx tsx typescript-gated-fixer-v2.ts --dry-run
```

### Verbose Mode
```bash
# Run with detailed logging for debugging
npx tsx typescript-gated-fixer-v2.ts --verbose
```

### Combined Options
```bash
# Preview with verbose output
npx tsx typescript-gated-fixer-v2.ts --dry-run --verbose
```

## Configuration Options

Edit these values in `typescript-gated-fixer-v2.ts`:

```typescript
// Project settings
const projectPath = process.env.TS_PROJECT_PATH || ".";
const maxFilesToProcess = parseInt(process.env.TS_MAX_FILES || "50");
const maxIterations = 3;
const parallelLLMCalls = 10;

// Gate thresholds
const maxLineCountDelta = 50;      // Max lines added/removed
const maxFunctionChanges = 5;      // Max function modifications
```

## Supported Error Types

- **TS2307**: Cannot find module
- **TS2322**: Type mismatch
- **TS2304**: Cannot find name
- **TS2339**: Property does not exist
- **TS7006**: Implicit any type
- **TS2688**: Cannot find type definition file
- Module resolution errors
- Import/Export issues
- Type annotation problems

## Example Project Structure

```
my-typescript-project/
├── src/
│   ├── components/
│   │   └── Button.ts
│   ├── utils/
│   │   └── helpers.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Execution Model

This is a **local/standalone CFN skill** that:
- Runs entirely on your local machine
- Does not use Trigger.dev or distributed execution
- Processes files directly in your project
- Makes changes via controlled file operations
- Maintains full control over your codebase

## Troubleshooting

### Common Issues

1. **API Key Errors**
   ```bash
   # Verify your API key is set
   echo $CEREBRAS_API_KEY
   ```

2. **Path Resolution**
   ```bash
   # Use absolute paths for TS_PROJECT_PATH
   export TS_PROJECT_PATH="$(pwd)/path/to/project"
   ```

3. **Permission Errors**
   ```bash
   # Ensure write permissions on project files
   chmod -R u+w ./src
   ```

4. **TypeScript Configuration**
   - Ensure `tsconfig.json` exists and is valid
   - Check that `include` paths cover all source files

### Debug Mode

```bash
# Enable all debugging information
export TS_VERBOSE=true
export DEBUG=cfn:*
npx tsx typescript-gated-fixer-v2.ts
```

## Safety Features

- **Atomic Operations**: Changes are applied atomically per file
- **Backup Creation**: Original files backed up before modification
- **Validation Gates**: Multiple checks prevent invalid changes
- **Rollback Support**: Easy rollback with `--rollback` flag
- **Dry Run Mode**: Preview all changes before applying

## Next Steps

1. Run in dry-run mode first to preview changes
2. Commit your code before running for easy rollback
3. Review changes after each run
4. Use verbose mode for complex errors
5. Configure gate thresholds for your project needs