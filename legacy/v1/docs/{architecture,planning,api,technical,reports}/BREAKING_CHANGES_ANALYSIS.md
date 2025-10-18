# Breaking Changes Analysis for Root Directory Cleanup

## 🚨 Critical Breaking Changes Overview

This document identifies all breaking changes that will occur during the root directory cleanup migration and provides specific code updates required.

## 1. Database Connection Changes (High Impact)

### Files Requiring Updates
- Any application code connecting to SQLite databases
- Configuration files with database paths
- Test files using test databases
- Scripts with database operations

### Current Database Connections
```javascript
// Files that likely need updates:
// - src/**/*.ts files with database connections
// - scripts/**/*.js files with SQLite operations
// - test files with database setup

// BEFORE (examples)
const db = new SQLite('./coordinator-registry.db');
const devDb = new SQLite('./claude-flow.db');
const testDb = new SQLite('./test-memory-acl.db');

// AFTER (required updates)
const db = new SQLite('./database/production/coordinator-registry.db');
const devDb = new SQLite('./database/development/claude-flow.db');
const testDb = new SQLite('./database/development/test-memory-acl.db');
```

### Environment-Specific Database Configuration
```javascript
// Recommended approach for database path management
const getDatabasePath = (filename, environment = process.env.NODE_ENV || 'development') => {
    const basePath = './database';
    return `${basePath}/${environment}/${filename}`;
};

// Usage examples
const productionDb = new SQLite(getDatabasePath('coordinator-registry.db', 'production'));
const developmentDb = new SQLite(getDatabasePath('claude-flow.db', 'development'));
const testDb = new SQLite(getDatabasePath('test-memory-acl.db', 'test'));
```

## 2. Import Path Updates (Medium Impact)

### Script Import Changes
```javascript
// BEFORE - Current imports that will break
import { spawnWorkers } from './spawn-workers.cjs';
import { testRunner } from './test-runner.cjs';
import { validateCFN } from './validate-cfn-section4.mjs';
import { middlewareExamples } from './middleware-examples.js';

// AFTER - Required new import paths
import { spawnWorkers } from './scripts/utilities/spawn-workers.cjs';
import { testRunner } from './scripts/testing/test-runner.cjs';
import { validateCFN } from './scripts/testing/validate-cfn-section4.mjs';
import { middlewareExamples } from './scripts/utilities/middleware-examples.js';
```

### Test File Import Changes
```javascript
// BEFORE - Test file imports
import { advancedTest } from './advanced.test.js';
import { mathTest } from './math.test.js';
import { quickToolTest } from './test_quick_tool.test.js';

// AFTER - New test file import paths
import { advancedTest } from './tests/unit/advanced.test.js';
import { mathTest } from './tests/unit/math.test.js';
import { quickToolTest } from './tests/unit/test_quick_tool.test.js';
```

### Configuration Import Changes
```javascript
// BEFORE - Configuration imports
import config from './claude-flow.config.json';
import packageScripts from './package-scripts.json';

// AFTER - New configuration import paths
import config from './config/development/claude-flow.config.json';
import packageScripts from './config/build/package-scripts.json';
```

## 3. Package.json Script Updates (Medium Impact)

### Current Scripts Requiring Updates
```json
{
  "scripts": {
    "spawn:workers": "node spawn-workers.cjs",
    "spawn:enterprise": "node spawn-workers-enterprise.js",
    "test:runner": "node test-runner.cjs",
    "validate:cfn": "node validate-cfn-section4.mjs",
    "quick:test": "node quick-test.js",
    "example:usage": "node example-usage.js"
  }
}
```

### Updated Package.json Scripts
```json
{
  "scripts": {
    "spawn:workers": "node scripts/utilities/spawn-workers.cjs",
    "spawn:enterprise": "node scripts/utilities/spawn-workers-enterprise.js",
    "test:runner": "node scripts/testing/test-runner.cjs",
    "validate:cfn": "node scripts/testing/validate-cfn-section4.mjs",
    "quick:test": "node scripts/utilities/quick-test.js",
    "example:usage": "node scripts/utilities/example-usage.js",
    "test:comprehensive": "node scripts/testing/test-comprehensive.js",
    "performance:test": "node scripts/testing/performance-test-runner.js"
  }
}
```

## 4. Configuration File Path Changes (Medium Impact)

### Environment Configuration Updates
```javascript
// BEFORE - Current config loading
const loadConfig = () => {
    const configFile = fs.readFileSync('./claude-flow.config.json', 'utf8');
    return JSON.parse(configFile);
};

// AFTER - Updated config loading
const loadConfig = (environment = 'development') => {
    const configPath = `./config/${environment}/claude-flow.config.json`;
    const configFile = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configFile);
};
```

### Build Configuration Updates
```javascript
// BEFORE - TypeScript config references
// tsconfig.json extends: "./tsconfig.base.json"

// AFTER - Updated TypeScript config references
// tsconfig.json extends: "./config/build/tsconfig.base.json"
```

## 5. Symlink Updates (High Impact)

### Current Symlink Structure
```bash
# Current symlinks in root
swarm-memory.db -> database/swarm-memory.db
swarm-memory.db-shm -> database/swarm-memory.db-shm  
swarm-memory.db-wal -> database/swarm-memory.db-wal
```

### Updated Symlink Structure
```bash
# Updated symlinks after migration
swarm-memory.db -> database/production/swarm-memory.db
swarm-memory.db-shm -> database/production/swarm-memory.db-shm
swarm-memory.db-wal -> database/production/swarm-memory.db-wal
```

### Symlink Update Script
```bash
#!/bin/bash
# update-symlinks.sh

# Remove old symlinks
rm -f swarm-memory.db swarm-memory.db-shm swarm-memory.db-wal

# Create new symlinks
ln -s database/production/swarm-memory.db swarm-memory.db
ln -s database/production/swarm-memory.db-shm swarm-memory.db-shm
ln -s database/production/swarm-memory.db-wal swarm-memory.db-wal

echo "Symlinks updated successfully"
```

## 6. Test Configuration Updates (Medium Impact)

### Jest Configuration Updates
```javascript
// BEFORE - jest.config.cjs
module.exports = {
  testMatch: [
    '**/*.test.js',
    '**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts'
  ]
};

// AFTER - Updated jest.config.cjs
module.exports = {
  testMatch: [
    'tests/**/*.test.{js,ts}',
    'src/**/*.test.{js,ts}'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    'scripts/**/*.{js,cjs,mjs}'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/temp/'
  ]
};
```

### Vitest Configuration Updates
```typescript
// BEFORE - vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.js'],
    exclude: ['node_modules']
  }
});

// AFTER - Updated vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,js}', 'src/**/*.test.{ts,js}'],
    exclude: ['node_modules', 'dist', 'temp']
  }
});
```

## 7. Docker Configuration Updates (Low Impact)

### Dockerfile Updates
```dockerfile
# BEFORE - Potential hardcoded paths
COPY . .
RUN npm run build

# AFTER - Consider new directory structure
COPY . .
RUN npm run build
# Ensure database directories exist
RUN mkdir -p database/production database/development database/test
```

### Docker Compose Updates
```yaml
# BEFORE - docker-compose.yml
volumes:
  - ./coordinator-registry.db:/app/coordinator-registry.db

# AFTER - Updated volume mounts
volumes:
  - ./database/production:/app/database/production
  - ./database/development:/app/database/development
```

## 8. Documentation Link Updates (Low Impact)

### Internal Documentation Links
```markdown
<!-- BEFORE -->
See [API Documentation](./api-documentation.md) for details.
Refer to [Test Results](./test-results.json) for outcomes.

<!-- AFTER -->
See [API Documentation](./docs/api/api-documentation.md) for details.
Refer to [Test Results](./tests/results/test-results.json) for outcomes.
```

## 9. Environment Variable Updates (Low Impact)

### Path-Based Environment Variables
```bash
# BEFORE - Current environment variables
DATABASE_PATH=./coordinator-registry.db
CONFIG_PATH=./claude-flow.config.json

# AFTER - Updated environment variables
DATABASE_PATH=./database/production/coordinator-registry.db
CONFIG_PATH=./config/development/claude-flow.config.json
```

## 10. Automated Update Scripts

### Import Path Update Script
```javascript
// update-imports.js
const fs = require('fs');
const path = require('path');

const importUpdates = [
  {
    from: /from ['"]\.\/spawn-workers\.cjs['"]/g,
    to: "from './scripts/utilities/spawn-workers.cjs'"
  },
  {
    from: /from ['"]\.\/test-runner\.cjs['"]/g,
    to: "from './scripts/testing/test-runner.cjs'"
  },
  {
    from: /from ['"]\.\/middleware-examples\.js['"]/g,
    to: "from './scripts/utilities/middleware-examples.js'"
  }
];

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  
  importUpdates.forEach(update => {
    if (update.from.test(content)) {
      content = content.replace(update.from, update.to);
      updated = true;
    }
  });
  
  if (updated) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated imports in ${filePath}`);
  }
}

// Recursively update all TypeScript and JavaScript files
function updateDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      updateDirectory(filePath);
    } else if (stat.isFile() && /\.(ts|js|cjs|mjs)$/.test(file)) {
      updateFile(filePath);
    }
  });
}

updateDirectory('./src');
updateDirectory('./scripts');
updateDirectory('./tests');
```

### Database Path Update Script
```javascript
// update-database-paths.js
const fs = require('fs');
const path = require('path');

const databasePathUpdates = [
  {
    from: /new SQLite\(['"]\.\/coordinator-registry\.db['"]\)/g,
    to: "new SQLite('./database/production/coordinator-registry.db')"
  },
  {
    from: /new SQLite\(['"]\.\/claude-flow\.db['"]\)/g,
    to: "new SQLite('./database/development/claude-flow.db')"
  },
  {
    from: /new SQLite\(['"]\.\/test-memory-acl\.db['"]\)/g,
    to: "new SQLite('./database/development/test-memory-acl.db')"
  }
];

// Similar update logic as import script
function updateDatabasePaths(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      updateDatabasePaths(filePath);
    } else if (stat.isFile() && /\.(ts|js|cjs|mjs)$/.test(file)) {
      updateFileWithDatabasePaths(filePath);
    }
  });
}

function updateFileWithDatabasePaths(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  
  databasePathUpdates.forEach(update => {
    if (update.from.test(content)) {
      content = content.replace(update.from, update.to);
      updated = true;
    }
  });
  
  if (updated) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated database paths in ${filePath}`);
  }
}

updateDatabasePaths('./src');
updateDatabasePaths('./scripts');
```

## 11. Validation Checklist

### Pre-Migration Validation
- [ ] Full application backup created
- [ ] All tests passing in current state
- [ ] Database backups created
- [ ] Dependency map generated

### Post-Migration Validation
- [ ] All import statements resolve correctly
- [ ] Database connections work properly
- [ ] Package.json scripts execute successfully
- [ ] Test suite passes with 100% success
- [ ] Application starts without errors
- [ ] Build process completes successfully
- [ ] Docker containers run properly
- [ ] Symlinks function correctly
- [ ] Environment variables loaded properly

### Rollback Validation
- [ ] Rollback script tested
- [ ] Database restoration verified
- [ ] Configuration restoration confirmed
- [ ] All functionality restored to pre-migration state

## 12. Risk Mitigation Strategies

### High-Risk Items
1. **Database Migration**: Perform during maintenance window
2. **Import Updates**: Use automated scripts with verification
3. **Symlink Updates**: Test thoroughly before production

### Medium-Risk Items
1. **Configuration Updates**: Validate with environment testing
2. **Script Updates**: Test each script individually
3. **Test Updates**: Run comprehensive test suite

### Low-Risk Items
1. **Documentation Updates**: Review for broken links
2. **Environment Variables**: Test with different configurations

This comprehensive breaking changes analysis ensures systematic identification and resolution of all potential issues during the root directory cleanup migration.