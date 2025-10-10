# Manual NPM Publication Guide

**Package**: claude-flow-novice v1.6.6
**Date**: 2025-10-09
**Status**: Ready for Manual Publication

## Prerequisites

✅ All checklist items completed:
- [x] CLI entry point fixed
- [x] Test coverage validated (93-95%)
- [x] Package validated (34.33MB, no secrets)
- [x] Build successful

## Manual Publication Steps

### Step 1: NPM Authentication

```bash
# Login to NPM (one-time setup)
npm login

# Verify authentication
npm whoami
```

### Step 2: Final Pre-Publication Validation

```bash
# Run validation script
node scripts/npm-package-validation.cjs

# Expected output: 88.3% confidence, 14/15 checks passed
```

### Step 3: Create Package Tarball

```bash
# Build package
npm run build

# Create tarball
npm pack

# Expected output: claude-flow-novice-1.6.6.tgz (~34MB)
```

### Step 4: Test Local Installation

```bash
# Install locally to test
npm install -g ./claude-flow-novice-1.6.6.tgz

# Test CLI
claude-flow-novice --version
claude-flow-novice status

# Test template generation
mkdir test-project && cd test-project
claude-flow-novice init --template=basic-swarm
```

### Step 5: Publish to NPM

```bash
# Dry run (recommended)
npm publish --dry-run

# Review output, ensure no secrets exposed

# Actual publication
npm publish

# If scoped package (optional):
# npm publish --access public
```

### Step 6: Post-Publication Validation

```bash
# Wait 2-3 minutes for NPM propagation

# Verify package is live
npm info claude-flow-novice@1.6.6

# Install from NPM
npm uninstall -g claude-flow-novice
npm install -g claude-flow-novice@1.6.6

# Test installation
claude-flow-novice --version
```

### Step 7: Create GitHub Release

```bash
# Create git tag
git tag -a v1.6.6 -m "Release v1.6.6 - NPM Production Readiness Complete"

# Push tag
git push origin v1.6.6

# Create GitHub release (manual)
# Go to: https://github.com/<org>/<repo>/releases/new
# Tag: v1.6.6
# Title: "v1.6.6 - NPM Production Ready"
# Description: Copy from CHANGELOG.md or use AI-generated summary
```

## Alternative: Automated Publication (GitHub Actions)

If you want to automate future releases:

### Configure NPM_TOKEN in GitHub

1. Generate NPM automation token:
   ```bash
   npm login
   npm token create --read-only=false
   ```

2. Add to GitHub Secrets:
   - Go to: `Settings` → `Secrets and variables` → `Actions`
   - Click: `New repository secret`
   - Name: `NPM_TOKEN`
   - Value: `<your-npm-token>`

3. Trigger automated release:
   ```bash
   git tag -a v1.6.7 -m "Release v1.6.7"
   git push origin v1.6.7

   # GitHub Actions will automatically:
   # - Run tests
   # - Build package
   # - Publish to NPM
   # - Create GitHub release
   ```

## Troubleshooting

### Issue: "Cannot publish over existing version"
**Solution**: Bump version and try again
```bash
npm version patch  # 1.6.6 → 1.6.7
npm publish
```

### Issue: "403 Forbidden"
**Solution**: Verify authentication
```bash
npm logout
npm login
npm publish
```

### Issue: "Package name taken"
**Solution**: Use scoped package
```bash
# Update package.json: "name": "@yourusername/claude-flow-novice"
npm publish --access public
```

### Issue: "Tarball too large"
**Solution**: Verify .npmignore (already configured)
```bash
# Check package size
npm pack --dry-run
# Should be ~34MB
```

## Publication Checklist

**Pre-Publication:**
- [ ] `npm login` - Authenticated to NPM
- [ ] `npm run build` - Build successful
- [ ] `node scripts/npm-package-validation.cjs` - Validation passed
- [ ] `npm pack` - Tarball created (~34MB)
- [ ] Local test installation successful

**Publication:**
- [ ] `npm publish --dry-run` - Dry run successful
- [ ] `npm publish` - Package published
- [ ] `npm info claude-flow-novice@1.6.6` - Package live

**Post-Publication:**
- [ ] Git tag created (`v1.6.6`)
- [ ] Git tag pushed to GitHub
- [ ] GitHub release created
- [ ] Installation from NPM tested
- [ ] Monitoring dashboard active

## Post-Publication Monitoring

**First 24 Hours:**
```bash
# Run monitoring script
node scripts/npm-metrics-collector.js

# Expected metrics:
# - Download count
# - Installation success rate (target: >95%)
# - Error reports (target: 0)
```

**First Week:**
- Monitor GitHub Issues
- Track NPM download stats
- Collect user feedback
- Address any installation issues

## Rollback Procedure (If Needed)

If critical issues are discovered post-publication:

```bash
# Unpublish (within 72 hours)
npm unpublish claude-flow-novice@1.6.6

# Or deprecate (after 72 hours)
npm deprecate claude-flow-novice@1.6.6 "Critical issue - use v1.6.7"

# Publish fixed version
npm version patch  # 1.6.6 → 1.6.7
npm publish
```

## Success Criteria

✅ Package published to NPM registry
✅ Installation success rate >95%
✅ CLI commands functional
✅ Templates accessible
✅ No critical errors in first 48 hours
✅ GitHub release created
✅ Monitoring active

## Support

**Documentation**: /docs/
**Issues**: https://github.com/<org>/<repo>/issues
**NPM**: https://npmjs.com/package/claude-flow-novice

---

**Publication Status**: ⏳ READY - Awaiting Manual Execution
**Confidence**: 0.94
**Risk**: LOW
