# Docker Build Scripts - Quick Reference

## Fast Linux Native Build (RECOMMENDED)

**Why:** Solves WSL2 performance bottleneck (91% faster than Windows mount builds)

**Performance:**
- Old method: ~815s (755s context transfer + 60s build)
- New method: ~50-70s total (8-12s sync + 40-60s build)
- **91% performance improvement**

### Quick Start

```bash
# Standard build (sync + build + metrics)
./scripts/docker/build-from-linux.sh

# Build without cache (clean build)
./scripts/docker/build-from-linux.sh --no-cache

# Quiet mode (minimal output)
./scripts/docker/build-from-linux.sh --quiet

# Cleanup after build
./scripts/docker/build-from-linux.sh --clean
```

### Advanced Usage

```bash
# Test sync performance only
./scripts/docker/build-from-linux.sh --sync-only

# Build only (skip sync)
./scripts/docker/build-from-linux.sh --build-only

# Combine options
./scripts/docker/build-from-linux.sh --no-cache --quiet --clean
```

## Configuration

**File:** `scripts/docker/linux-build.config`

```bash
# Customize paths
LINUX_PATH="/tmp/cfn-build"        # Change if needed
WINDOWS_PATH="/mnt/c/Users/..."   # Auto-detected

# Customize image
IMAGE_NAME="claude-flow-novice-agent"
IMAGE_TAG="latest"

# Customize exclusions
RSYNC_EXCLUDES+=("your-directory")
```

## Sync Statistics

**Optimized Sync (v1.0):**
- Size: 20MB (down from 378MB - 95% reduction)
- Files: ~1,835 (down from 19,974 files)
- Time: 8-12 seconds
- Excludes: legacy/, planning/, agents/, packages/, docs/, tests/, .backups/

## Troubleshooting

**Sync too slow?**
```bash
# Check what's being synced
./scripts/docker/build-from-linux.sh --sync-only
du -sh /tmp/cfn-build/* | sort -rh | head -10
```

**Old Windows method (SLOW - not recommended)?**
```bash
# Only use for comparison or debugging
cd /mnt/c/Users/masha/Documents/claude-flow-novice
docker build -f Dockerfile.agent -t claude-flow-novice-agent:latest .
```

## Documentation

**Complete Guide:** `docs/DOCKER_LINUX_NATIVE_BUILD.md`

Topics covered:
- Problem statement and root cause analysis
- Architecture and sync-and-build pattern
- Performance metrics and benchmarks
- Configuration reference
- Troubleshooting guide
- Best practices
- CI/CD integration

## Performance Comparison

| Metric | Windows Mount | Linux Native | Improvement |
|--------|--------------|--------------|-------------|
| Context transfer | 755s | 8-12s | 98% faster |
| Build time | ~60s | ~40-60s | Up to 33% faster |
| **Total time** | **~815s** | **~50-70s** | **91% faster** |
| Stability | Timeout prone | Stable | Production ready |

## Version History

**v1.0.0** (2025-01-12)
- Initial release
- 91% performance improvement
- Production ready
- Comprehensive documentation
