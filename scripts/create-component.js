#!/usr/bin/env node

/**
 * Component Template Generator
 * Creates TypeScript components with proper type declarations and tests
 *
 * Usage:
 *   node scripts/create-component.js <ComponentName> <directory>
 *
 * Example:
 *   node scripts/create-component.js SwarmCoordinator src/coordination
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [, , componentName, componentDir] = process.argv;

if (!componentName || !componentDir) {
  console.log(`
🔧 Component Template Generator

Usage: node scripts/create-component.js <ComponentName> <directory>

Arguments:
  ComponentName    Name of the component (PascalCase)
  directory        Target directory (e.g., src/coordination)

Examples:
  node scripts/create-component.js SwarmCoordinator src/coordination
  node scripts/create-component.js TaskValidator src/validation
  node scripts/create-component.js RedisClient src/services

Generated files:
  ✅ <directory>/<ComponentName>.ts        - Main implementation
  ✅ <directory>/<ComponentName>.test.ts   - Test file with basic setup
  ✅ <directory>/types.ts                  - Type definitions (if doesn't exist)
  `);
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');

// Validate component name (PascalCase)
if (!/^[A-Z][a-zA-Z0-9]*$/.test(componentName)) {
  console.error(`❌ Error: Component name must be PascalCase (e.g., SwarmCoordinator, not swarm-coordinator)`);
  process.exit(1);
}

// Create directory if it doesn't exist
const targetDir = path.join(projectRoot, componentDir);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`📁 Created directory: ${componentDir}/`);
}

// Component file template
const componentTemplate = `/**
 * ${componentName}
 *
 * TODO: Add component description
 */

export interface ${componentName}Options {
  // TODO: Define configuration options
}

export class ${componentName} {
  private options: ${componentName}Options;

  constructor(options: ${componentName}Options) {
    this.options = options;
  }

  // TODO: Implement methods
  async initialize(): Promise<void> {
    // Initialization logic
  }

  async execute(): Promise<void> {
    // Main execution logic
  }

  async cleanup(): Promise<void> {
    // Cleanup logic
  }
}
`;

// Test file template
const testTemplate = `import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ${componentName} } from './${componentName}';

describe('${componentName}', () => {
  let component: ${componentName};

  beforeEach(() => {
    component = new ${componentName}({
      // TODO: Add test configuration
    });
  });

  afterEach(async () => {
    await component.cleanup();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await component.initialize();
      // TODO: Add assertions
      expect(component).toBeDefined();
    });
  });

  describe('execution', () => {
    it('should execute successfully', async () => {
      await component.initialize();
      await component.execute();
      // TODO: Add assertions
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      // TODO: Test error scenarios
    });
  });
});
`;

// Types file template (only create if doesn't exist)
const typesTemplate = `/**
 * Type definitions for ${componentDir}
 */

export interface BaseOptions {
  enabled?: boolean;
  debug?: boolean;
}

// Add shared types here
`;

// Write component file
const componentPath = path.join(targetDir, `${componentName}.ts`);
if (fs.existsSync(componentPath)) {
  console.error(`❌ Error: Component file already exists: ${componentPath}`);
  process.exit(1);
}
fs.writeFileSync(componentPath, componentTemplate);
console.log(`✅ Created: ${path.relative(projectRoot, componentPath)}`);

// Write test file
const testPath = path.join(targetDir, `${componentName}.test.ts`);
if (fs.existsSync(testPath)) {
  console.warn(`⚠️  Warning: Test file already exists: ${testPath} (skipping)`);
} else {
  fs.writeFileSync(testPath, testTemplate);
  console.log(`✅ Created: ${path.relative(projectRoot, testPath)}`);
}

// Create types file if doesn't exist
const typesPath = path.join(targetDir, 'types.ts');
if (!fs.existsSync(typesPath)) {
  fs.writeFileSync(typesPath, typesTemplate);
  console.log(`✅ Created: ${path.relative(projectRoot, typesPath)}`);
} else {
  console.log(`ℹ️  Types file exists: ${path.relative(projectRoot, typesPath)} (not modified)`);
}

// Create index.ts barrel export if doesn't exist
const indexPath = path.join(targetDir, 'index.ts');
const exportLine = `export * from './${componentName}';\n`;

if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf8');
  if (!content.includes(`from './${componentName}'`)) {
    fs.appendFileSync(indexPath, exportLine);
    console.log(`✅ Added export to: ${path.relative(projectRoot, indexPath)}`);
  } else {
    console.log(`ℹ️  Export already exists in: ${path.relative(projectRoot, indexPath)}`);
  }
} else {
  fs.writeFileSync(indexPath, `export * from './types';\n${exportLine}`);
  console.log(`✅ Created: ${path.relative(projectRoot, indexPath)}`);
}

console.log(`
✨ Component generated successfully!

Next steps:
  1. Implement ${componentName} logic in ${componentPath}
  2. Write tests in ${testPath}
  3. Run tests: npm test -- ${componentName}
  4. Run type check: npm run typecheck
`);
