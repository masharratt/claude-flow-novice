# Pre-Publish Checklist

Before publishing to npm, ensure all of the following checks pass:

## Build Validation
- [ ] `npm run build` succeeds without errors
- [ ] No TypeScript errors (or fallback type generation succeeds)
- [ ] All tests passing (`npm run test:ci`)
- [ ] Build artifacts generated in `.claude-flow-novice/dist/`

## CLI Runtime Validation
- [ ] `npm run test:cli` passes
- [ ] CLI entry point exists at `.claude-flow-novice/dist/src/cli/main.js`
- [ ] `node .claude-flow-novice/dist/src/cli/main.js --version` works
- [ ] `node .claude-flow-novice/dist/src/cli/main.js --help` works
- [ ] No ERR_UNSUPPORTED_DIR_IMPORT errors
- [ ] No ERR_MODULE_NOT_FOUND errors
- [ ] CLI executes on all platforms (Windows, macOS, Linux)

## Package Structure
- [ ] No package.json files in subdirectories (causes ESM issues)
- [ ] All imports use explicit .js extensions
- [ ] dist/ directory structure matches expected layout
- [ ] package.json "files" array includes all necessary files
- [ ] package.json "bin" entries point to correct files
- [ ] No build artifacts in source directories

## Security & Quality
- [ ] `npm run security:check` passes
- [ ] `npm run lint` passes with no errors
- [ ] No hardcoded credentials or secrets
- [ ] Dependencies updated and audited
- [ ] No critical vulnerabilities

## Documentation
- [ ] CHANGELOG.md updated with version changes
- [ ] README.md version bumped (if applicable)
- [ ] Migration guide updated (if breaking changes)
- [ ] All documentation links work
- [ ] Examples tested and working

## Version Management
- [ ] Version number follows semantic versioning
- [ ] Git tags created for release
- [ ] All changes committed
- [ ] No uncommitted changes in working directory

## Manual Verification
1. **Local Installation Test**:
   ```bash
   npm pack
   mkdir test-install && cd test-install
   npm init -y
   npm install ../claude-flow-novice-*.tgz
   npx claude-flow-novice --version
   npx claude-flow-novice --help
   npx claude-flow-novice status
   ```

2. **Cross-Platform Validation**:
   - Test on Ubuntu/Linux
   - Test on macOS
   - Test on Windows (WSL and native)

3. **Runtime Error Detection**:
   ```bash
   # Run CLI and check for errors
   node .claude-flow-novice/dist/src/cli/main.js --version 2>&1 | grep -i "error"

   # Should return nothing if successful
   ```

## CI/CD Validation
- [ ] All GitHub Actions workflows passing
- [ ] Cross-platform compatibility tests passing
- [ ] Security scans completed
- [ ] Coverage reports generated
- [ ] No failing jobs in CI pipeline

## Post-Publish Verification
After publishing, verify:
- [ ] Package available on npm: `npm view claude-flow-novice`
- [ ] Installation works: `npm install -g claude-flow-novice`
- [ ] Global CLI works: `claude-flow-novice --version`
- [ ] npx execution works: `npx claude-flow-novice@latest --version`

## Rollback Plan
If issues are discovered after publish:
1. Unpublish the version (if within 72 hours): `npm unpublish claude-flow-novice@x.x.x`
2. Or deprecate the version: `npm deprecate claude-flow-novice@x.x.x "reason"`
3. Publish a patch fix immediately
4. Update documentation with known issues

## Critical Lessons from Sprint 7.4
- ✅ **Don't trust syntax validation alone** - Always run actual CLI commands
- ✅ **Test runtime, not just compilation** - ERR_UNSUPPORTED_DIR_IMPORT only appears at runtime
- ✅ **Automate in CI/CD** - Manual validation catches issues, automation prevents recurrence
- ✅ **Cross-platform testing is mandatory** - Test on all supported platforms

## Quick Test Commands
```bash
# Full validation sequence
npm run build
npm run test:cli
npm run test:ci
npm run lint
npm run security:check

# Package and test install
npm pack
tar -tzf claude-flow-novice-*.tgz | head -20
mkdir test-install && cd test-install
npm init -y
npm install ../claude-flow-novice-*.tgz
npx claude-flow-novice --version
```
