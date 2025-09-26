#!/usr/bin/env node

/**
 * Simple ES module test file fixer
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function findTestFiles() {
  const testFiles = [];

  async function walkDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, dist, bin directories
        if (!['node_modules', 'dist', 'bin', '.git'].includes(entry.name)) {
          await walkDir(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js'))) {
        testFiles.push(fullPath);
      }
    }
  }

  await walkDir(projectRoot);
  return testFiles;
}

function fixImportExtensions(content) {
  const changes = [];

  // Fix relative imports without .js extension
  let newContent = content.replace(
    /import\s+(.+?)\s+from\s+['"`](\.\/.+?)['"`];?/g,
    (match, imported, modulePath) => {
      if (!modulePath.endsWith('.js') && !modulePath.endsWith('.ts') && !modulePath.includes('node_modules')) {
        // Check if it's a relative import
        if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
          const correctedPath = modulePath + '.js';
          changes.push('Add .js extension to relative import');
          return `import ${imported} from '${correctedPath}';`;
        }
      }
      return match;
    }
  );

  return { content: newContent, changes };
}

function fixJestImports(content) {
  const changes = [];

  // Add Jest globals import if test functions are used but not imported
  const hasJestFunctions = /\b(describe|test|it|expect|beforeEach|afterEach|beforeAll|afterAll)\b/.test(content);
  const hasJestImport = /import.*@jest\/globals/.test(content);

  if (hasJestFunctions && !hasJestImport) {
    // Check which Jest functions are used
    const jestFunctions = ['describe', 'test', 'it', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'];
    const usedFunctions = jestFunctions.filter(fn => new RegExp(`\\b${fn}\\b`).test(content));

    if (usedFunctions.length > 0) {
      const jestImport = `import { ${usedFunctions.join(', ')} } from '@jest/globals';\n`;
      content = jestImport + content;
      changes.push('Add Jest globals import');
    }
  }

  return { content, changes };
}

function fixDirnameFilename(content) {
  const changes = [];

  const hasDirname = /__dirname/.test(content);
  const hasFilename = /__filename/.test(content);

  if (hasDirname || hasFilename) {
    // Add ES module equivalents at the top
    const imports = [];
    if (!content.includes('import { fileURLToPath }')) {
      imports.push("import { fileURLToPath } from 'url';");
      imports.push("import { dirname } from 'path';");
    }

    if (hasDirname && !content.includes('const __dirname')) {
      imports.push("const __filename = fileURLToPath(import.meta.url);");
      imports.push("const __dirname = dirname(__filename);");
    } else if (hasFilename && !content.includes('const __filename')) {
      imports.push("const __filename = fileURLToPath(import.meta.url);");
    }

    if (imports.length > 0) {
      content = imports.join('\n') + '\n' + content;
      changes.push('Add ES module __dirname/__filename equivalents');
    }
  }

  return { content, changes };
}

async function fixTestFile(filePath) {
  const result = {
    file: filePath,
    changes: [],
    success: false
  };

  try {
    const originalContent = await fs.readFile(filePath, 'utf8');
    let content = originalContent;

    // Apply fixes
    const importFixes = fixImportExtensions(content);
    content = importFixes.content;
    result.changes.push(...importFixes.changes);

    const jestFixes = fixJestImports(content);
    content = jestFixes.content;
    result.changes.push(...jestFixes.changes);

    const dirnameFixes = fixDirnameFilename(content);
    content = dirnameFixes.content;
    result.changes.push(...dirnameFixes.changes);

    // Only write if changes were made
    if (content !== originalContent) {
      await fs.writeFile(filePath, content, 'utf8');
      result.success = true;
    } else {
      result.success = true; // No changes needed
    }

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log('🚀 Starting ES module test file migration...\n');
  console.log(`Project root: ${projectRoot}`);

  try {
    const testFiles = await findTestFiles();
    console.log(`Found ${testFiles.length} test files to process...`);

    const results = [];
    for (const file of testFiles) {
      const result = await fixTestFile(file);
      results.push(result);

      if (result.success && result.changes.length > 0) {
        console.log(`✅ Fixed ${path.relative(projectRoot, file)}: ${result.changes.join(', ')}`);
      } else if (!result.success) {
        console.log(`❌ Failed to fix ${path.relative(projectRoot, file)}: ${result.error}`);
      }
    }

    // Summary
    const fixedFiles = results.filter(r => r.success && r.changes.length > 0);
    const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0);

    console.log('\n📊 Migration Summary:');
    console.log(`- Total files processed: ${results.length}`);
    console.log(`- Files with fixes: ${fixedFiles.length}`);
    console.log(`- Total changes applied: ${totalChanges}`);

    console.log('\n✅ ES module test file migration completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();