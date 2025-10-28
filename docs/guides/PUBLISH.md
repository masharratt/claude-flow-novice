# Quick Publish Reference

## ✅ Pre-Publish Checklist

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` with release notes
- [ ] Run `npm run build` - verify successful compilation
- [ ] Run `npm run typecheck` - ensure no type errors
- [ ] Run `npm run verify-package` - check package contents
- [ ] Update repository URL in `package.json` (currently placeholder)
- [ ] Test locally: `npm pack && npm install -g ./claude-flow-novice-*.tgz`
- [ ] Verify CLI works: `claude-flow-novice --help`
- [ ] Clean up: `npm uninstall -g claude-flow-novice && rm *.tgz`

## 🚀 Publish Commands

```bash
# 1. Login to NPM (one-time)
npm login

# 2. Dry run (verify what will be published)
npm publish --dry-run

# 3. Publish to NPM registry
npm publish

# 4. Verify publication
npm info claude-flow-novice

# 5. Test installation from registry
npm install -g claude-flow-novice@latest
claude-flow-novice --help
```

## 📦 What Gets Published

**Included (1,401 files, ~15.3 MB unpacked):**
- `dist/` - Compiled JavaScript (83 files)
- `.claude/` - All agents, skills, commands (1,200+ files)
- `agents/` - Agent configuration
- `config/` - Runtime configuration
- `scripts/` - Essential scripts (excluding tests)
- `README.md`, `CLAUDE.md`, `LICENSE`

**Excluded:**
- `src/` - TypeScript source
- `tests/`, `examples/`, `docs/`, `legacy/`
- `packages/web-portal/` (separate package)
- Development configs, test scripts

## 🔄 Version Bumping

```bash
# Patch (2.0.0 -> 2.0.1) - Bug fixes
npm version patch

# Minor (2.0.0 -> 2.1.0) - New features
npm version minor

# Major (2.0.0 -> 3.0.0) - Breaking changes
npm version major
```

## ⚠️ Before First Publish

1. **Update repository URL** in `package.json`:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/YOUR_USERNAME/claude-flow-novice.git"
   }
   ```

2. **Choose npm package scope** (optional):
   - Unscoped: `claude-flow-novice`
   - Scoped: `@your-org/claude-flow-novice`

3. **Verify package name availability**:
   ```bash
   npm search claude-flow-novice
   ```

## 📊 Post-Publish

```bash
# View package on npm
open https://www.npmjs.com/package/claude-flow-novice

# Create git tag
git tag v2.0.0
git push --tags

# Monitor downloads
npm info claude-flow-novice
```

## 🌐 Web Portal (Separate Package)

The web portal is **NOT included** in the main package. Publish separately:

```bash
cd packages/web-portal
npm version patch
npm publish
```

## 📚 Resources

- Full guide: `NPM_DISTRIBUTION_GUIDE.md`
- Package contents: `npm pack --dry-run`
- NPM docs: https://docs.npmjs.com/cli/v8/commands/npm-publish
