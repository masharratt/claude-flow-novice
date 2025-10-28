# Cyclomatic Complexity Analysis Overhead

## Benchmark Results (simple-complexity.sh)

**Test Environment:** WSL2, Claude Flow Novice Project

### Performance Metrics

| Test Case | Files | Time (real) | Per-File Avg |
|-----------|-------|-------------|--------------|
| Single large file (840 lines) | 1 | 0.021s | 21ms |
| Small files | 10 | 0.255s | 25.5ms |
| Medium batch | 100 | 2.199s | 22ms |
| All project files | 364 | 8.580s | 23.6ms |

**Average per-file:** ~23ms (0.023 seconds)

---

## Post-Edit Pipeline Overhead

### Current Post-Edit Hook

`.claude/hooks/cfn-invoke-post-edit.sh` currently runs:
1. File validation
2. Syntax checking (shellcheck, eslint, etc.)
3. Formatting (prettier, shfmt)
4. Security scanning (optional)

**Estimated current overhead:** 100-500ms per file

### Adding Complexity Analysis

**Per-file overhead:** +23ms

**Impact by scenario:**

#### Scenario 1: Single File Edit (Typical)
```
Current:    ~200ms
+ Lizard:   +23ms
New Total:  ~223ms
Impact:     +11.5% (negligible)
```

#### Scenario 2: Multi-File Edit (5 files)
```
Current:    ~1000ms (1s)
+ Lizard:   +115ms
New Total:  ~1115ms
Impact:     +11.5% (acceptable)
```

#### Scenario 3: Large Refactor (20 files)
```
Current:    ~4000ms (4s)
+ Lizard:   +460ms
New Total:  ~4460ms
Impact:     +11.5% (acceptable)
```

#### Scenario 4: Bulk Operation (100 files)
```
Current:    ~20s
+ Lizard:   +2.2s
New Total:  ~22.2s
Impact:     +11% (acceptable)
```

---

## Lizard vs simple-complexity.sh Performance

**Estimated Lizard overhead:**

| Tool | Single File | 10 Files | 100 Files | 364 Files |
|------|-------------|----------|-----------|-----------|
| simple-complexity.sh | 21ms | 255ms | 2.2s | 8.6s |
| Lizard (estimated) | 50-100ms | 500ms-1s | 5-10s | 18-36s |

**Lizard is ~2-4x slower** (Python startup + AST parsing)

---

## Recommendations

### Option 1: Always Run (Low Overhead)
```bash
# Add to post-edit hook
if [[ "$file" =~ \.sh$ ]] || [[ "$file" =~ \.(js|ts)$ ]]; then
    complexity=$(tools/simple-complexity.sh "$file" | grep "Total:" | awk '{print $3}')
    if [ "$complexity" -gt 40 ]; then
        echo "⚠️  High complexity: $complexity (consider refactoring)"
    fi
fi
```

**Overhead:** +23ms per file (11% increase)
**Benefit:** Catch complexity regressions immediately

### Option 2: Threshold-Based (Conditional)
```bash
# Only run on large files (>200 lines)
lines=$(wc -l < "$file")
if [ "$lines" -gt 200 ]; then
    tools/simple-complexity.sh "$file"
fi
```

**Overhead:** ~5ms (minimal - only large files)
**Benefit:** Focus on files that matter

### Option 3: Async Background Check
```bash
# Run in background, don't block edit
(tools/simple-complexity.sh "$file" > /tmp/complexity-$$.log) &
```

**Overhead:** 0ms (non-blocking)
**Benefit:** Zero impact on edit speed

### Option 4: On-Demand Only
```bash
# Manual trigger
/cfn:analyze-complexity <file>
```

**Overhead:** 0ms (no automatic checking)
**Benefit:** Developer controls when to check

---

## Recommended Strategy

**For CFN Loop:**

1. **Automatic for shell scripts >200 lines:** 23ms overhead
2. **Skip for small files (<200 lines):** 0ms overhead
3. **Report only if complexity >40:** Non-blocking warning
4. **Background mode for bulk operations:** Async, 0ms blocking

**Implementation:**

```bash
# In post-edit hook
FILE="$1"
LINES=$(wc -l < "$FILE")
COMPLEXITY_THRESHOLD=40
SIZE_THRESHOLD=200

if [[ "$FILE" =~ \.sh$ ]] && [ "$LINES" -gt "$SIZE_THRESHOLD" ]; then
    COMPLEXITY=$(tools/simple-complexity.sh "$FILE" | grep "Total:" | awk '{print $3}')

    if [ "$COMPLEXITY" -gt "$COMPLEXITY_THRESHOLD" ]; then
        echo "⚠️  Complexity Warning: $FILE has complexity $COMPLEXITY (threshold: $COMPLEXITY_THRESHOLD)"
        echo "   Consider refactoring. Run 'tools/simple-complexity.sh $FILE' for details."
    fi
fi
```

**Effective overhead:**
- Small files (<200 lines): 0ms
- Large, simple files: 23ms (11% increase, acceptable)
- Large, complex files: 23ms + warning message (developer needs to know)

---

## Cost-Benefit Analysis

### Benefits
- ✅ Early detection of complexity regressions
- ✅ Forces complexity awareness during development
- ✅ Prevents "orchestrate.sh" situations (complexity 74)
- ✅ Measurable quality improvement
- ✅ Minimal overhead (<25ms per file)

### Costs
- ❌ 11% slower post-edit hook (negligible)
- ❌ Potential alert fatigue (mitigated by threshold)
- ❌ Maintenance of complexity tool

### Verdict

**Recommended:** Yes, with thresholds

**Rationale:**
- 23ms overhead is negligible compared to edit operation itself
- Early detection prevents technical debt accumulation
- orchestrate.sh reached 74 complexity because no automated checks
- Post-edit hook is non-blocking anyway (runs after save)

---

## Alternative: CI/CD Integration

**Instead of post-edit hook, run in CI:**

```yaml
# .github/workflows/complexity.yml
name: Complexity Check
on: [pull_request]
jobs:
  complexity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check complexity
        run: |
          for file in $(git diff --name-only origin/main); do
            if [[ "$file" =~ \.sh$ ]]; then
              complexity=$(tools/simple-complexity.sh "$file" | grep "Total:" | awk '{print $3}')
              if [ "$complexity" -gt 40 ]; then
                echo "::warning file=$file::High complexity: $complexity"
              fi
            fi
          done
```

**Overhead:** 0ms (runs on PR, not on edit)
**Benefit:** No local impact, catches issues before merge

---

## Conclusion

**Post-edit pipeline overhead for complexity analysis:**
- **Per-file:** 23ms
- **Impact:** +11% (negligible)
- **Recommendation:** Enable with thresholds (>200 lines, >40 complexity)
- **Alternative:** CI/CD check (zero local overhead)

**For CFN Loop, recommend:**
- Automatic for bash scripts >200 lines
- Warning if complexity >40
- Use simple-complexity.sh (not Lizard) for speed
- Consider CI/CD integration for zero local overhead
