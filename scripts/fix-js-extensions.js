#!/usr/bin/env node
/**
 * Post-build script to fix .js extensions in ES module imports
 *
 * SWC strips .js extensions from imports during compilation,
 * which breaks ES modules that require explicit extensions.
 *
 * This script adds .js extensions to relative imports in the compiled output.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, '..', '.claude-flow-novice', 'dist');

// Patterns to match and fix relative imports without .js extension
const IMPORT_PATTERNS = [
  // import { x } from './module' or from "./module" (also handles directory imports like './commands')
  {
    pattern: /from\s+(['"])(\.\.[\/\\][^'"\s]+|\.\/[^'"\s]+)(['"])/g,
    type: 'from',
  },
  // import './module' or import "./module"
  {
    pattern: /import\s+(['"])(\.\.[\/\\][^'"\s]+|\.\/[^'"\s]+)(['"])/g,
    type: 'import',
  },
  // export { x } from './module' or from "./module"
  {
    pattern: /export\s+{[^}]*}\s+from\s+(['"])(\.\.[\/\\][^'"\s]+|\.\/[^'"\s]+)(['"])/g,
    type: 'export-from',
  },
  // export * from './module' or from "./module"
  {
    pattern: /export\s+\*\s+from\s+(['"])(\.\.[\/\\][^'"\s]+|\.\/[^'"\s]+)(['"])/g,
    type: 'export-star',
  },
];

async function fixFileExtensions(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let modified = false;

    for (const { pattern, type } of IMPORT_PATTERNS) {
      content = content.replace(pattern, (match, quote1, modulePath, quote2) => {
        // Skip if already has .js extension
        if (modulePath.endsWith('.js')) {
          return match;
        }

        // Skip if it's a JSON or other file type
        if (modulePath.match(/\.(json|css|svg|png|jpg|jpeg|gif|wasm)$/)) {
          return match;
        }

        // For directory imports like './commands', add '/index.js'
        // For file imports like './module', add '.js'
        let fixedModulePath;

        // Check if this looks like a directory import (no file extension and no dots in last segment)
        const lastSegment = modulePath.split('/').pop();
        const looksLikeDirectory = !lastSegment.includes('.');

        if (looksLikeDirectory && !modulePath.endsWith('/index')) {
          // Directory import: './commands' → './commands/index.js'
          fixedModulePath = modulePath + '/index.js';
        } else {
          // File import: './module' → './module.js'
          fixedModulePath = modulePath + '.js';
        }

        const fixed = match.replace(modulePath, fixedModulePath);
        modified = true;
        return fixed;
      });
    }

    if (modified) {
      await fs.writeFile(filePath, content, 'utf8');
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function processDirectory(dir) {
  let fixedCount = 0;
  let totalFiles = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip node_modules directories
      if (entry.isDirectory() && entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        const result = await processDirectory(fullPath);
        fixedCount += result.fixedCount;
        totalFiles += result.totalFiles;
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        totalFiles++;
        const wasFixed = await fixFileExtensions(fullPath);
        if (wasFixed) {
          fixedCount++;
          console.log(`✓ Fixed: ${path.relative(DIST_DIR, fullPath)}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error.message);
  }

  return { fixedCount, totalFiles };
}

async function main() {
  console.log('🔧 Fixing .js extensions in compiled output...\n');

  try {
    // Check if dist directory exists
    await fs.access(DIST_DIR);
  } catch {
    console.error(`❌ Distribution directory not found: ${DIST_DIR}`);
    process.exit(1);
  }

  const { fixedCount, totalFiles } = await processDirectory(DIST_DIR);

  console.log(`\n📊 Summary:`);
  console.log(`   Total files processed: ${totalFiles}`);
  console.log(`   Files fixed: ${fixedCount}`);
  console.log(`   Files unchanged: ${totalFiles - fixedCount}`);

  if (fixedCount > 0) {
    console.log(`\n✅ Successfully fixed ${fixedCount} file(s)`);
  } else {
    console.log('\n✅ All files already have correct extensions');
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
