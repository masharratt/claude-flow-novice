# Agent Performance Guidelines - WSL Windows Paths

## 🚨 CRITICAL: Avoid `find` on Windows Paths

**Problem:** Running `find` on `/mnt/c/` paths is extremely slow in WSL (2-10 seconds per command)

**Impact:**
- 3 agents running `find` concurrently = 6-30 seconds
- Memory accumulation from buffered output
- Agents stuck in "Waiting..." state

## ✅ Use These Instead

### ❌ DON'T USE
```bash
find /mnt/c/Users/masha/Documents/claude-flow-novice -type f -name "*.test.*"
```

### ✅ USE CLAUDE CODE GLOB TOOL
```javascript
Glob("**/*.test.*")           // Fast, uses native file system
Glob("**/*.spec.*")
Glob("**/Dockerfile")
Glob("**/*.{yml,yaml}")
```

### ✅ OR USE `fd` (if installed)
```bash
fd -e test.js                 // 10x faster than find
fd -e spec.ts
fd Dockerfile
```

### ✅ OR USE `git ls-files` (for tracked files)
```bash
git ls-files '*.test.*'       // Instant (uses git index)
git ls-files '*.spec.*'
```

## Performance Comparison

| Tool | Time | Memory | Use Case |
|------|------|--------|----------|
| `find /mnt/c/...` | 2-10s | High | ❌ Avoid on WSL |
| `Glob("**/*")` | <100ms | Low | ✅ Best for agents |
| `fd -e test.js` | 200ms | Low | ✅ Good alternative |
| `git ls-files` | <50ms | Low | ✅ For tracked files only |

## Agent Best Practices

1. **Use Glob tool** for file discovery (not Bash find)
2. **Batch operations** in single message (not sequential)
3. **Read with limits** (`Read(file, {limit: 100})`) for large files
4. **Avoid recursive operations** when possible

## Example: Security Audit Pattern

### ❌ Slow (causes memory leak)
```bash
find /mnt/c/.../claude-flow-novice -type f -name "*.test.*" -o -name "*.spec.*" | grep security
find /mnt/c/.../claude-flow-novice -type f -name "Dockerfile"
```

### ✅ Fast (proper approach)
```javascript
[Single Message]:
  Glob("**/*.{test,spec}.*")      // Get test files
  Glob("**/Dockerfile")            // Get Dockerfiles
  Read(files[0], {limit: 100})     // Read with limits
```

## Memory Leak Prevention

- **Limit to 2-3 agents** per batch (not 6+)
- **Use Glob instead of find** (100x faster)
- **Read files with limits** (not full files)
- **Kill stuck processes**: `pkill -f "find /mnt/c"`

---

**If agents are stuck in "Waiting...":**
```bash
# Check for stuck find processes
ps aux | grep "find /mnt/c" | grep -v grep

# Kill them
pkill -f "find /mnt/c"
```
