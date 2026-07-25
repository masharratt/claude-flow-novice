# Deprecated CFN Loop Commands

**⚠️ DEPRECATED (Removed 2025-10-31)**

These commands are no longer maintained and have been replaced by the simplified CFN Loop v3.0 command structure.

## Migration Path

### Old Commands → New Commands

| Deprecated Command | Replacement | Use Case |
|-------------------|-------------|----------|
| `/cfn-loop` | `/cfn-loop-cli` or `/cfn-loop-task` | General CFN Loop execution |
| `/cfn-loop-single` | `/cfn-loop-cli --mode=mvp` | Single focused task |
| `/cfn-loop-epic` | Multiple `/cfn-loop-cli` calls | Multi-phase epic development |
| `/cfn-loop-sprints` | Multiple `/cfn-loop-cli` calls | Sprint-based development |

## Current Commands (v3.0)

- `/cfn-loop-cli` - Production CLI mode with background execution
- `/cfn-loop-task` - Task mode for debugging with full visibility
- `/cfn-loop-frontend` - Frontend development with visual validation
- `/cfn-loop-document` - Automated documentation generation

## Key Changes

1. **Simplified Architecture**: 4 current commands instead of 8
2. **Dual Execution Modes**: CLI (production) vs Task (debugging)
3. **Background Execution**: CLI mode supports `--background=true`
4. **Enhanced Monitoring**: Real-time progress tracking via Redis
5. **Cleaner Separation**: Clear distinction between production and debugging workflows

## Why Deprecated?

- **Command Overload**: Too many similar commands caused confusion
- **Inconsistent Patterns**: Different parameter structures across commands
- **Maintenance Complexity**: Supporting multiple execution patterns
- **User Experience**: Simplified command structure improves adoption

## Documentation

See current command documentation:
- [`../cfn-loop-cli.md`](../cfn-loop-cli.md)
- [`../cfn-loop-task.md`](../cfn-loop-task.md)
- [`../cfn-loop-frontend.md`](../cfn-loop-frontend.md)
- [`../cfn-loop-document.md`](../cfn-loop-document.md)

## Historical Reference

These files are preserved for:
- Migration guidance for existing users
- Historical reference for development decisions
- Understanding the evolution of CFN Loop architecture

**Note**: These commands will be removed completely in a future major version.