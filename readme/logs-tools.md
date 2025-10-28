# Claude Flow Tools Documentation

## Overview

Claude Flow provides built-in tools for code analysis, complexity monitoring, and quality assessment.

## Complexity Analysis Tools

### `/tools/simple-complexity.sh`

**Purpose**: Fast cyclomatic complexity analyzer for bash scripts

**Usage:**
```bash
./tools/simple-complexity.sh <script.sh>
```

**Performance**: ~23ms per script

**Analysis Metrics:**
- if/elif statements
- loops (for/while/until)
- case statements
- && and || operators
- function definitions

**Complexity Ratings:**
- **Simple**: <10
- **Moderate**: 10-19
- **Complex**: 20-39 (refactor recommended)
- **Very Complex**: ≥40 (refactor required)

**Example Output:**
```
Cyclomatic Complexity Analysis: orchestrate.sh
==================================================
Decision Points:
  if/elif:        15
  loops:          3
  case:           2
  &&/||:          8
  functions:      5

Total Complexity: 30

Rating: Complex (refactor recommended)
==================================================
```

### `/tools/calculate-complexity.sh`

**Purpose**: Per-function complexity analysis for bash scripts

**Usage:**
```bash
./tools/calculate-complexity.sh <script.sh>
```

**Analysis Type**: Function-level breakdown

**Output Format:**
```
==================================================
Cyclomatic Complexity Analysis: script.sh
==================================================

main()                         Lines 1-50        Complexity: 12  [Moderate]
validate_input()               Lines 51-75       Complexity: 8   [Moderate]
process_data()                 Lines 76-150      Complexity: 25  [Complex (refactor recommended)]

Total File Complexity: 45
==================================================
```

**Thresholds:**
- **Simple**: <6
- **Moderate**: 6-10
- **Complex**: 11-20 (refactor recommended)
- **Very Complex**: ≥21 (refactor required)

### Lizard (Professional Multi-Language Analyzer)

**Purpose**: Industry-standard complexity analysis for multiple languages

**Installation**: Automatic during npm install

**Manual Installation:**
```bash
# Option 1: Auto-install script
./tools/install-lizard.sh

# Option 2: Direct pip install
pip3 install --user lizard
export PATH="$HOME/.local/bin:$PATH"
```

**Supported Languages:**
- JavaScript/TypeScript
- Python
- Java/C/C++
- Go
- Ruby
- PHP
- And 20+ more

**Usage:**
```bash
# Basic analysis
lizard <file>

# With CCN threshold
lizard <file> --CCN 30

# JSON output
lizard <file> --output_file report.json
```

**Integration**: Auto-triggered by post-edit hook when complexity ≥40

**Post-Install Setup:**
```bash
# Add to ~/.bashrc or ~/.zshrc (if installed via pip3)
export PATH="$HOME/.local/bin:$PATH"
```

## Automated Complexity Monitoring

### Post-Edit Hook Integration

**Trigger**: Automatic when editing files via Write/Edit tools

**Conditions:**
- File >200 lines
- Extensions: `.sh`, `.js`, `.ts`, `.py`, `.java`, `.go`, `.rb`, `.php`, `.c`, `.cpp`

**Thresholds:**
- **30-39**: Warning (exit code 8, logged)
- **≥40**: Critical (exit code 7, triggers Lizard analysis)

**Configuration**: `.claude/hooks/post-edit.config.json`

```json
{
  "complexity": {
    "enabled": true,
    "minLines": 200,
    "warnThreshold": 30,
    "criticalThreshold": 40,
    "extensions": [".sh", ".js", ".ts", ".py"]
  }
}
```

**Exit Codes:**
- `0`: Pass (<30)
- `7`: Critical complexity (≥40, requires refactor)
- `8`: Warning complexity (30-39, refactor recommended)

## Cyclomatic Complexity Reducer Agent

**Agent**: `cyclomatic-complexity-reducer`

**Location**: `.claude/agents/cfn-dev-team/quality/`

**Purpose**: Automated refactoring for high-complexity code

**Trigger Scenarios:**
- Complexity ≥40 (critical)
- Complexity 30-39 with upcoming changes
- Code review identifies maintainability issues

**Capabilities:**
- Extract functions from complex blocks
- Simplify conditional logic
- Reduce nesting depth
- Apply strategy pattern for complex switches
- Preserve functionality (no behavior changes)

**Spawning:**
```bash
npx cfn-spawn cyclomatic-complexity-reducer \
  --task-id "refactor-task" \
  --context "complexity-critical"
```

## Tool Selection Guide

**Use `simple-complexity.sh` when:**
- Quick analysis needed (~23ms)
- Analyzing bash scripts only
- CI/CD pipeline integration
- Pre-commit checks

**Use `calculate-complexity.sh` when:**
- Need function-level breakdown
- Identifying specific refactor targets
- Analyzing bash script architecture
- Detailed complexity report required

**Use Lizard when:**
- Multi-language analysis required
- Professional-grade metrics needed
- JSON output for tooling integration
- Comprehensive codebase analysis

## Package Integration

**Included in npm package:**
- `tools/simple-complexity.sh` (distributed)
- `tools/install-lizard.sh` (distributed)

**Auto-installed via postinstall hook:**
- Lizard (Python package)
- PATH configuration instructions provided

**Files Array (package.json):**
```json
{
  "files": [
    "tools/simple-complexity.sh",
    "tools/install-lizard.sh"
  ]
}
```

## Performance Characteristics

| Tool | Language | Speed | Accuracy | Multi-Language |
|------|----------|-------|----------|----------------|
| simple-complexity.sh | Bash | ~23ms | Good | Bash only |
| calculate-complexity.sh | Bash | ~50ms | Good | Bash only |
| Lizard | Python | ~200ms | Professional | 20+ languages |

## Best Practices

**Continuous Monitoring:**
- Enable post-edit complexity checks
- Set appropriate thresholds for project type
- Use Lizard for multi-language projects

**Refactoring Strategy:**
- Address complexity ≥40 immediately
- Plan refactoring for complexity 30-39
- Monitor trend over time

**CI/CD Integration:**
```bash
# Pre-commit hook example
#!/bin/bash
FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.sh$')

for FILE in $FILES; do
  COMPLEXITY=$(./tools/simple-complexity.sh "$FILE" | grep "Total Complexity" | awk '{print $3}')
  if [ $COMPLEXITY -ge 40 ]; then
    echo "❌ Critical complexity in $FILE: $COMPLEXITY"
    exit 1
  fi
done
```

**Team Workflow:**
1. Developer edits code
2. Post-edit hook runs `simple-complexity.sh`
3. If complexity ≥40, spawns `cyclomatic-complexity-reducer` agent
4. Agent refactors code while preserving functionality
5. Tests run to validate no behavior changes

## Troubleshooting

**Lizard not found after install:**
```bash
# Check installation
which lizard

# If not found, add to PATH
export PATH="$HOME/.local/bin:$PATH"

# Verify installation
lizard --version
```

**Permission denied on tools:**
```bash
chmod +x tools/*.sh
```

**False positives on complexity:**
- Review threshold configuration in `post-edit.config.json`
- Some algorithms inherently complex (justified)
- Use comments to document necessity

## Related Documentation

- **Post-Edit Hook**: `readme/logs-hooks.md`
- **Agent Reference**: `.claude/agents/cfn-dev-team/quality/cyclomatic-complexity-reducer.md`
- **Hook Configuration**: `.claude/hooks/post-edit.config.json`
