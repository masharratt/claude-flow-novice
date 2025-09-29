# workflow-create

Create reusable workflow templates.

## Usage
```bash
npx claude-flow-novice workflow create [options]
```

## Options
- `--name <name>` - Workflow name
- `--from-history` - Create from history
- `--interactive` - Interactive creation

## Examples
```bash
# Create workflow
npx claude-flow-novice workflow create --name "deploy-api"

# From history
npx claude-flow-novice workflow create --name "test-suite" --from-history

# Interactive mode
npx claude-flow-novice workflow create --interactive
```
