# Configuration Updates Required After Root Cleanup

## Package.json Updates Required

### Current package.json Analysis
```json
{
  "main": "quick-test.js",
  "bin": {
    "quick-test": "./quick-test.js"
  },
  "scripts": {
    "test": "node quick-test.js",
    "test:watch": "node -e \"require('fs').watchFile('quick-test.js', () => { console.log('\\n🔄 Running tests...'); require('./quick-test.js'); })\""
  }
}
```

### Required Changes if `quick-test.js` was moved to `tests/`

**Option 1: Update package.json to reference new location**
```json
{
  "main": "tests/quick-test.js",
  "bin": {
    "quick-test": "./tests/quick-test.js"
  },
  "scripts": {
    "test": "node tests/quick-test.js",
    "test:watch": "node -e \"require('fs').watchFile('tests/quick-test.js', () => { console.log('\\n🔄 Running tests...'); require('./tests/quick-test.js'); })\""
  }
}
```

**Option 2: Create root entry point (Recommended)**
Create a new `quick-test.js` in root that references the moved file:

```javascript
// Root quick-test.js - Entry point
module.exports = require('./tests/quick-test.js');
```

Keep package.json unchanged.

## tsconfig.json Path Updates

### Current Path References to Check
- `"outDir": ".claude-flow-novice/dist"`
- `"rootDir": "src"`
- `"exclude"` array contains specific paths

### Potential Issues
1. **Base Configuration**: `tsconfig.base.json` is now in `config/`
   - Update `"extends"` reference if used
2. **Test Exclusions**: Test files moved to `tests/`
   - Update exclude paths accordingly

### Updated tsconfig.json (if needed)
```json
{
  "extends": "./config/tsconfig.base.json",
  "compilerOptions": {
    // ... existing options
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    ".claude-flow-novice/dist",
    "dist",
    "examples/**/*",
    "tests/**/*",
    "config/**/*",
    "scripts/**/*",
    "data/**/*",
    "temp/**/*",
    "workspace/**/*"
  ]
}
```

## vitest.config.ts Updates

### Current Potential Issues
- May reference test files in root directory
- Configuration may need updating for new test directory

### Example Updates Required
```typescript
// If referencing specific test files
export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'config', 'data', 'temp'],
    // ... other config
  }
});
```

## jest.config.cjs Updates (Moved to config/)

### Location Change
- File moved from root to `config/jest.config.cjs`
- May need to update package.json to reference new location

### Path Updates Required
```javascript
module.exports = {
  // Update test directory
  testMatch: ['**/tests/**/*.test.js'],
  // Update coverage directory
  coverageDirectory: 'coverage',
  // Update collectFrom
  collectCoverageFrom: [
    'src/**/*.js',
    'scripts/**/*.js',
    '!config/**',
    '!data/**',
    '!temp/**'
  ]
};
```

## Database Connection Updates

### Files That May Need Updates
1. **Source Code Files**: Check for hardcoded `.db` paths
2. **Configuration Files**: Environment files in `config/`
3. **Test Files**: May reference test databases

### Example Updates
```javascript
// Before
const dbPath = './claude-flow.db';

// After
const dbPath = './data/claude-flow.db';
```

## Environment File Updates

### Files Moved to config/
- `.env` → `config/.env`
- `.env.keys` → `config/.env.keys`
- `.env.secure.template` → `config/.env.secure.template`

### Required Updates
1. **Docker**: Update `.dockerignore` references
2. **Scripts**: Update any script that references `.env` files
3. **Documentation**: Update setup instructions

## Docker Configuration Updates

### docker-compose.yml Updates
May need to update:
- Volume mounts for environment files
- Database file paths
- Configuration file paths

### Example Updates
```yaml
services:
  app:
    env_file:
      - ./config/.env
    volumes:
      - ./data:/app/data
      - ./config:/app/config
```

## Script Path Updates

### Scripts Moved to `scripts/`
- `spawn-workers-enterprise.js`
- `spawn-workers.cjs`
- `coordinator-runner.cjs`
- `validate-cfn-section4.mjs`
- `claude-flow.bat`
- `claude-flow.ps1`

### Updates Required
1. **Package.json scripts**: Update script paths
2. **Documentation**: Update script usage examples
3. **CI/CD**: Update pipeline script references

## VS Code Workspace Updates

### File: `workspace/claude-flow-novice.code-workspace`
May need to update:
- File references in workspace settings
- Debug configurations
- Task configurations

## Testing Checklist

### Build Verification
```bash
# Check if build process works
npm run build  # if available

# Check TypeScript compilation
npx tsc --noEmit

# Check if package.json main works
node .  # or node quick-test.js
```

### Test Verification
```bash
# Run tests
npm test

# Run tests with new configuration
npx vitest  # if using vitest

# Check specific test files
node tests/test-runner.js
```

### Development Verification
```bash
# Start development server (if available)
npm run dev

# Check database connections
node -e "require('./src/database').connect()"  # example
```

## Rollback Plan

### If Issues Occur
1. **Git Reset**: `git reset --hard HEAD~1` (before committing)
2. **Manual Restore**: Move files back to root manually
3. **Configuration Restore**: Restore original configuration files

### Quick Rollback Script
```bash
#!/bin/bash
# Quick rollback - move files back to root
for dir in config docs tests examples scripts data temp workspace; do
    if [ -d "$dir" ]; then
        find "$dir" -maxdepth 1 -type f -exec git mv {} . \;
    fi
done
```

## Final Verification

### Commands to Run After Cleanup
```bash
# 1. Check git status
git status

# 2. Verify all essential files are in root
ls -la package.json package-lock.json README.md CLAUDE.md LICENSE .gitignore tsconfig.json vitest.config.ts docker-compose.yml

# 3. Test package.json main
node -e "console.log('Main entry works:', require('./package.json').main)"

# 4. Run tests
npm test

# 5. Check if project builds/starts
npm start  # or npm run dev
```

## Support Files Created

### Files Generated by Cleanup Analysis
1. `ROOT_CLEANUP_ANALYSIS.md` - Complete analysis and categorization
2. `cleanup_plan.sh` - Executable cleanup script
3. `config_update_instructions.md` - This file with update instructions

### Next Steps
1. Review the analysis in `ROOT_CLEANUP_ANALYSIS.md`
2. Run the cleanup script: `./cleanup_plan.sh`
3. Follow the configuration updates in this file
4. Test thoroughly before committing
5. Commit changes with descriptive message

---

**Remember**: This is a significant structural change. Test thoroughly and consider creating a backup branch before proceeding.