---
description: "Compact conversation history to reduce token usage and maintain context efficiency"
argument-hint: "[--focus=<topic>] [--threshold=<percentage>]"
allowed-tools: ["Read", "Write", "Bash", "TodoWrite"]
---

# Auto-Compact - Programmatic Context Compression

Summarize and compress conversation history while preserving key facts, decisions, and context.

**Task**: $ARGUMENTS

## Command Options

```bash
/auto-compact
/auto-compact --focus="security decisions and API changes"
/auto-compact --threshold=70
/auto-compact --focus="CFN Loop implementation" --threshold=75
```

**Options:**
- `--focus=<topic>`: Focus summarization on specific topics (optional)
- `--threshold=<percentage>`: Token usage threshold to trigger compact (default: 70)

## Current Session Analysis

**Token Usage**: Check current context usage and determine if compaction is needed.

## Compaction Strategy

### What to Preserve
- Key architectural decisions
- Active task progress and todos
- Critical bug fixes and security changes
- Recent consensus validations
- Current phase/sprint context

### What to Compress
- Verbose implementation details
- Exploratory discussions
- Resolved issues and completed tasks
- Historical context from earlier phases
- Redundant explanations

## Execution Steps

1. **Analyze Current Context**: Review token usage and conversation flow
2. **Extract Key Facts**: Identify critical decisions, active work, and essential context
3. **Generate Summary**: Create concise summary preserving:
   - Active tasks and blockers
   - Recent decisions (last 10-20% of conversation)
   - Phase/sprint progress
   - Technical debt items
   - Next steps
4. **Recommend Action**: Suggest when user should run `/compact` with optimal focus

## Output Format

```
📊 **Context Analysis**
- Current tokens: X/200k (Y%)
- Recommendation: [COMPACT NOW | DEFER | MONITOR]

🎯 **Suggested Compact Focus**
[Generated focus string based on conversation]

💡 **Summary Preview**
[Key facts to preserve in compact]

✅ **Action Required**
Run: /compact focus: "[generated focus]"
```

## Notes

- This command **analyzes** and **recommends** compaction
- User must manually run `/compact` (built-in command)
- Threshold default: 70% (140k/200k tokens)
- Auto-triggered at 95% by Claude Code built-in
