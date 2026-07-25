# Docker .dockerignore CLAUDE.md Inclusion Fix

## Problem

**Issue:** CLAUDE.md was not being included in the Docker image despite having `!CLAUDE.md` in `.dockerignore`.

**Root Cause:** Docker's `.dockerignore` processes patterns sequentially. When negation patterns (`!pattern`) come AFTER broad wildcard exclusions, they don't reliably override the exclusion. The `*.md` wildcard was matching `CLAUDE.md` before the `!CLAUDE.md` negation could take effect.

**Impact:**
- Agents in Docker containers couldn't access project instructions from CLAUDE.md
- Container builds succeeded but runtime behavior was broken
- 76 agent .md files and 72 skill .md files were correctly included (deeper paths)

## Solution

### Pattern Reordering

**Key Principle:** In Docker's `.dockerignore`, **negations must come BEFORE wildcard exclusions**.

**Before (BROKEN):**
```dockerfile
# Documentation
docs/
*.md                    # ❌ Excludes CLAUDE.md first
!README.md              # ❌ Too late - already excluded
!CLAUDE.md              # ❌ Too late - already excluded
!.claude/**/*.md        # ✅ Works (specific paths)
!claude-assets/**/*.md  # ✅ Works (specific paths)
```

**After (FIXED):**
```dockerfile
# Documentation
docs/

# Exclude markdown files EXCEPT essential ones
# NOTE: Negations must come BEFORE wildcard exclusions in Docker
!README.md              # ✅ Negated BEFORE wildcard
!CLAUDE.md              # ✅ Negated BEFORE wildcard
!.claude/**/*.md        # ✅ Negated BEFORE wildcard
!claude-assets/**/*.md  # ✅ Negated BEFORE wildcard
*.md                    # ✅ Wildcard comes LAST
```

### Why Path-Based Negations Worked

The `.claude/**/*.md` and `claude-assets/**/*.md` patterns worked even when placed after `*.md` because:
1. They use **explicit directory paths** (not root-level wildcards)
2. Docker's pattern matching treats path-specific patterns differently
3. The `**` glob operator creates a more specific match than `*.md`

However, **relying on this behavior is fragile**. The fix ensures consistent, predictable behavior by ordering all negations before wildcards.

## Testing

### Quick Test
```bash
bash tests/docker/quick-claude-md-test.sh
```

**Expected output:**
```
Building Docker image...
Testing CLAUDE.md inclusion...
✅ SUCCESS: CLAUDE.md found (45234 bytes)
   First line: # Claude Flow Novice — AI Agent Orchestration
   Agent .md files: 76
   Skill .md files: 72
```

### Comprehensive Test
```bash
bash tests/docker/test-claude-md-inclusion.sh
```

**Tests:**
1. ✅ CLAUDE.md exists at `/app/CLAUDE.md`
2. ✅ CLAUDE.md has valid content (not empty)
3. ✅ Agent markdown files present (76 expected)
4. ✅ Skill markdown files present (72 expected)
5. ✅ README.md included
6. ✅ docs/ directory excluded

### Manual Verification
```bash
# Build image
docker build -t cfn-test -f Dockerfile.agent .

# Test CLAUDE.md presence
docker run --rm cfn-test test -f /app/CLAUDE.md && echo "✅ Found" || echo "❌ Missing"

# Show CLAUDE.md size and first line
docker run --rm cfn-test stat -c "%s bytes" /app/CLAUDE.md
docker run --rm cfn-test head -1 /app/CLAUDE.md

# Count markdown files
docker run --rm cfn-test find /app/.claude/agents -name "*.md" | wc -l  # Should be 76
docker run --rm cfn-test find /app/.claude/skills -name "*.md" | wc -l  # Should be 72

# Verify docs/ excluded
docker run --rm cfn-test test -d /app/docs && echo "❌ Included" || echo "✅ Excluded"

# Cleanup
docker rmi cfn-test
```

## Technical Details

### Docker .dockerignore Pattern Matching

Docker uses **filepath.Match** from Go's filepath library with these behaviors:

1. **Sequential Processing:** Patterns processed top-to-bottom
2. **Last Match Wins:** Later patterns override earlier ones (usually)
3. **Negation Fragility:** `!pattern` after `*` has unreliable override behavior
4. **Path Specificity:** More specific paths (`dir/**/*.ext`) trump wildcards (`*.ext`)

### Best Practices

**DO:**
```dockerfile
# ✅ Negations BEFORE wildcards
!important.md
!config.json
*.md
*.json
```

**DON'T:**
```dockerfile
# ❌ Negations AFTER wildcards (unreliable)
*.md
*.json
!important.md
!config.json
```

### Why This Matters

In containerized agent environments, missing project files like CLAUDE.md means:
- Agents can't access critical instructions
- Runtime behavior differs from expected
- No build-time errors (silent failure)
- Debugging requires container inspection

## Related Files

- `.dockerignore` - Build context exclusion rules
- `Dockerfile.agent` - Container image definition (line 29: `COPY CLAUDE.md ./`)
- `tests/docker/quick-claude-md-test.sh` - Fast validation script
- `tests/docker/test-claude-md-inclusion.sh` - Comprehensive test suite

## References

- Docker .dockerignore documentation: https://docs.docker.com/engine/reference/builder/#dockerignore-file
- Go filepath.Match: https://pkg.go.dev/path/filepath#Match
- Issue discovered: 2025-11-12
- Fix applied: 2025-11-12
