# Docker Build Skill

## Metadata
- **Skill ID:** docker-build
- **Version:** 1.0.0
- **Category:** Build & Infrastructure
- **Dependencies:** None
- **Maturity:** Production
- **Last Updated:** 2025-11-12

## Purpose
Fast Docker image building using Linux native storage to avoid WSL2 performance bottlenecks. Syncs project from Windows to Linux storage, builds image, then provides ready-to-use image.

## Performance Benefits
- **Build Time**: 755s → <20s (96% faster)
- **Context Transfer**: 0.1s vs 755s on Windows mounts
- **Method**: rsync to Linux native storage, build from there

## Responsibilities
1. Sync project files from Windows to Linux native storage
2. Build Docker images using Linux filesystem
3. Tag images appropriately for use
4. Clean up old build artifacts

## Interface

### Main Entry Point
```bash
./.claude/skills/docker-build/build.sh \
  [--dockerfile <path>] \
  [--tag <name>] \
  [--no-cache]
```

### Quick Use (Default)
```bash
# Build agent image (most common)
./.claude/skills/docker-build/build.sh

# Build with specific tag
./.claude/skills/docker-build/build.sh --tag my-custom-tag

# Force rebuild without cache
./.claude/skills/docker-build/build.sh --no-cache
```

### Parameters
- `dockerfile`: Path to Dockerfile (default: `Dockerfile.agent`)
- `tag`: Image tag (default: `claude-flow-novice:agent`)
- `no-cache`: Force rebuild without cache

### Output
- Docker image tagged and ready to use
- Build time and performance stats
- Success/failure status

## Implementation Details

### File Structure
```
.claude/skills/docker-build/
├── SKILL.md           # This file
└── build.sh           # Main build script (wrapper for scripts/docker/build-from-linux.sh)
```

### Build Process
1. **Sync Phase**
   - Rsync from Windows project directory to `/tmp/cfn-build`
   - Excludes: node_modules, .git, legacy directories
   - Time: ~0.1s

2. **Build Phase**
   - Docker build from Linux native storage
   - Uses BuildKit for optimization
   - Time: ~15-20s

3. **Tag Phase**
   - Tags image with requested name
   - Default: `claude-flow-novice:agent`

## Usage Examples

### Example 1: Standard Agent Build
```bash
# Build with modified agent templates
./.claude/skills/docker-build/build.sh

# Wait for completion
# Image ready: claude-flow-novice:agent
```

### Example 2: Custom Build
```bash
# Build with custom Dockerfile and tag
./.claude/skills/docker-build/build.sh \
  --dockerfile Dockerfile.custom \
  --tag my-project:latest
```

### Example 3: Force Rebuild
```bash
# Rebuild everything from scratch
./.claude/skills/docker-build/build.sh --no-cache
```

## Integration Points

### Used By
- B10 TypeScript fix tests
- Docker agent testing
- CFN Loop container execution
- Development workflows

### Depends On
- `scripts/docker/build-from-linux.sh` (core build logic)
- `scripts/docker/linux-build.config` (configuration)
- Linux native filesystem at `/tmp/cfn-build`

## Error Handling

### Common Issues

**Issue**: Rsync fails
- **Cause**: Permission issues or disk space
- **Solution**: Check `/tmp` permissions and disk space

**Issue**: Docker build fails
- **Cause**: Syntax errors in Dockerfile or missing files
- **Solution**: Check Dockerfile and .dockerignore patterns

**Issue**: Image not tagged correctly
- **Cause**: Build failed but not caught
- **Solution**: Check build logs for errors

## Performance Monitoring

### Metrics Tracked
- Sync time (should be <1s)
- Build time (should be <30s)
- Total time
- Image size

### Expected Performance
```
Sync time: 0.1s
Build time: 15-20s
Total time: <25s
Image size: ~443MB
```

## Maintenance

### When to Update
- Agent definitions change
- Source code changes
- Dependencies update
- Dockerfile modifications

### Cleanup
```bash
# Remove old build directory
rm -rf /tmp/cfn-build

# Remove old images
docker image prune -f
```

## Success Criteria
- ✅ Build completes in <30s
- ✅ Image tagged correctly
- ✅ Image size reasonable (<500MB)
- ✅ No build errors or warnings

## Skill Invocation from Main Chat

### Quick Commands
```bash
# Rebuild Docker image after agent changes
Skill: docker-build

# Rebuild with no cache
Skill: docker-build --no-cache

# Custom build
Skill: docker-build --tag my-image:v1
```

### When to Use This Skill
- After modifying agent templates (`.claude/agents/`)
- After changing source code
- After updating dependencies
- Before running Docker-based tests
- When WSL2 build is too slow

## Related Skills
- `cfn-loop-orchestration`: Uses Docker images for agent execution
- `cfn-coordination`: Coordinates Docker container agents

## Notes
- **WSL2 Performance**: Direct Docker builds from Windows mounts are 96% slower
- **Linux Native**: Building from `/tmp/cfn-build` is near-instant
- **Automatic Sync**: Script handles sync automatically
- **Safe**: Original Windows files never modified
