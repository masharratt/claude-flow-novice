# Docker Playwright Fix - Issue Investigation

**Date:** 2025-11-04
**Status:** Investigation Complete
**Priority:** High

## Problem Statement

Playwright browsers not installed in the `claude-flow-novice:with-playwright` image, causing timeout when trying to install browsers at runtime.

## Current Issues Identified

1. **Browser Installation Failure**: `npx playwright install chromium` times out during execution
2. **Missing Browser Dependencies**: Chromium binary not found at runtime
3. **Volume Mount Issues**: Screenshots not persisting to host filesystem
4. **Docker Layer Caching**: Browser installation not properly cached in Docker layers

## Root Cause Analysis

### Issue 1: Browser Binary Location
- Playwright installs browsers to `/home/root/.cache/ms-playwright` by default
- Docker image may not preserve this location across layers
- Need to install to system-wide location

### Issue 2: Missing System Dependencies
- Playwright requires additional system libraries for headless Chromium
- Current Dockerfile missing some dependencies
- Need to ensure all required libraries are present

### Issue 3: Permissions and Paths
- Browser installation may have permission issues
- Need to set correct PLAYWRIGHT_BROWSERS_PATH
- Ensure proper ownership of browser directories

## Fix Implementation Plan

### Phase 1: Dockerfile Optimization
1. Add missing system dependencies
2. Set PLAYWRIGHT_BROWSERS_PATH environment variable
3. Install browsers during build to system location
4. Verify browser installation in same layer

### Phase 2: Build Process
1. Rebuild Docker image with optimizations
2. Test browser availability at runtime
3. Verify screenshot functionality
4. Test Google.com navigation automation

### Phase 3: Validation
1. Execute test script with fixed image
2. Verify screenshot capture
3. Test search automation for "wrexham"
4. Performance metrics validation

## Dependencies Required

### System Libraries
```bash
# Additional libraries for headless Chromium
libnss3-dev
libatk-bridge2.0-dev
libdrm2
libxcomposite-dev
libxdamage-dev
libxrandr-dev
libgbm-dev
libxss-dev
libasound2-dev
```

### Environment Variables
```bash
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
```

## Success Criteria

1. ✅ Docker image builds successfully with Playwright
2. ✅ Browsers available immediately at container start
3. ✅ Google.com navigation works without timeout
4. ✅ Screenshots saved to mounted volume
5. ✅ Search automation completes successfully
6. ✅ Performance metrics collected

## Risk Mitigation

1. **Build Time**: Browser installation increases build time - mitigate with Docker cache
2. **Image Size**: Chromium adds ~200MB to image size
3. **Network Dependencies**: Build may fail if browser download fails - implement retry logic
4. **Permission Issues**: Ensure proper user permissions for browser directories

## Implementation Status

- [ ] Phase 1: Dockerfile optimization
- [ ] Phase 2: Build and test image
- [ ] Phase 3: Full validation workflow
- [ ] Documentation update
- [ ] Performance baseline established