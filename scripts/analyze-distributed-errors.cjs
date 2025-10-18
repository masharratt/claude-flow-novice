#!/usr/bin/env node
/**
 * Analyze TypeScript Errors vs. Distribution Status
 *
 * Cross-references TypeScript errors with:
 * - Files actually distributed (not in .npmignore)
 * - Files imported/used by distributed code
 * - Deprecated/legacy code
 *
 * Usage:
 *   node scripts/analyze-distributed-errors.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
};

/**
 * Parse .npmignore to find excluded paths
 */
function parseNpmIgnore() {
  const npmignorePath = path.join(process.cwd(), '.npmignore');
  if (!fs.existsSync(npmignorePath)) {
    return [];
  }

  const content = fs.readFileSync(npmignorePath, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(pattern => {
      // Convert glob pattern to regex
      let regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      // Handle directory patterns
      if (pattern.endsWith('/')) {
        regex = `^${regex}`;
      } else if (!pattern.includes('*')) {
        regex = `(^${regex}$|^${regex}/)`;
      }

      return new RegExp(regex);
    });
}

/**
 * Check if file is distributed (not in .npmignore)
 */
function isDistributed(filePath, npmIgnorePatterns) {
  // Normalize path
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Check against .npmignore patterns
  for (const pattern of npmIgnorePatterns) {
    if (pattern.test(normalizedPath)) {
      return false;
    }
  }

  return true;
}

/**
 * Find all imports/requires in a file
 */
function findImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const imports = new Set();

    // Match ES6 imports
    const importRegex = /import\s+(?:{[^}]*}|[\w*]+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    // Match CommonJS requires
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    // Match dynamic imports
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }

    return Array.from(imports);
  } catch (error) {
    return [];
  }
}

/**
 * Resolve relative import to absolute path
 */
function resolveImport(fromFile, importPath) {
  // Skip node_modules
  if (!importPath.startsWith('.')) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.resolve(fromDir, importPath);

  // Try different extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  // Check if it's a file
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) {
      return withExt.replace(/\\/g, '/');
    }
  }

  // Check if it's a directory with index file
  for (const ext of extensions) {
    const indexPath = path.join(resolved, `index${ext}`);
    if (fs.existsSync(indexPath)) {
      return indexPath.replace(/\\/g, '/');
    }
  }

  return null;
}

/**
 * Build dependency graph from entry points
 */
function buildDependencyGraph(entryPoints) {
  const used = new Set();
  const queue = [...entryPoints];
  const processed = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (processed.has(current)) {
      continue;
    }

    processed.add(current);
    used.add(current);

    // Find imports in this file
    const imports = findImports(current);

    for (const importPath of imports) {
      const resolved = resolveImport(current, importPath);
      if (resolved && !processed.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return used;
}

/**
 * Find entry points from package.json
 */
function findEntryPoints() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const entryPoints = [];

  // Main entry
  if (packageJson.main) {
    const mainPath = path.resolve(packageJson.main);
    if (fs.existsSync(mainPath)) {
      entryPoints.push(mainPath.replace(/\\/g, '/'));
    }
  }

  // Binary entries
  if (packageJson.bin) {
    const binEntries = typeof packageJson.bin === 'string'
      ? [packageJson.bin]
      : Object.values(packageJson.bin);

    for (const binPath of binEntries) {
      const resolved = path.resolve(binPath);
      if (fs.existsSync(resolved)) {
        entryPoints.push(resolved.replace(/\\/g, '/'));
      }
    }
  }

  // Exports
  if (packageJson.exports) {
    const processExports = (exp) => {
      if (typeof exp === 'string') {
        const resolved = path.resolve(exp);
        if (fs.existsSync(resolved)) {
          entryPoints.push(resolved.replace(/\\/g, '/'));
        }
      } else if (typeof exp === 'object') {
        Object.values(exp).forEach(processExports);
      }
    };
    processExports(packageJson.exports);
  }

  return entryPoints;
}

/**
 * Identify deprecated paths from MCP deprecation
 */
function getDeprecatedPaths() {
  return [
    /^src\/mcp\//,
    /^src\/swarm\//,  // MCP swarm (deprecated)
    // Add other known deprecated paths
  ];
}

/**
 * Check if file is in deprecated path
 */
function isDeprecated(filePath, deprecatedPatterns) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return deprecatedPatterns.some(pattern => pattern.test(normalizedPath));
}

/**
 * Get TypeScript errors from previous report
 */
function getTypeScriptErrors() {
  const { parseErrors } = require('./list-typescript-errors.cjs');

  try {
    const output = execSync('npm run build:types 2>&1', {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    });
    return parseErrors(output);
  } catch (error) {
    return parseErrors(error.stdout || '');
  }
}

/**
 * Main analysis
 */
function main() {
  console.log(`${colors.cyan}Analyzing TypeScript errors vs. distribution status...${colors.reset}\n`);

  // Get TypeScript errors
  console.log('📊 Parsing TypeScript errors...');
  const { fileErrors } = getTypeScriptErrors();

  // Get npm ignore patterns
  console.log('📦 Parsing .npmignore...');
  const npmIgnorePatterns = parseNpmIgnore();

  // Get deprecated patterns
  const deprecatedPatterns = getDeprecatedPaths();

  // Find entry points
  console.log('🔍 Finding entry points...');
  const entryPoints = findEntryPoints();
  console.log(`   Found ${entryPoints.length} entry points`);

  // Build dependency graph
  console.log('📈 Building dependency graph...');
  const usedFiles = buildDependencyGraph(entryPoints);
  console.log(`   Found ${usedFiles.size} used files`);

  // Categorize files with errors
  const categories = {
    distributed_and_used: [],
    distributed_but_unused: [],
    not_distributed: [],
    deprecated: []
  };

  for (const [filePath, errors] of fileErrors.entries()) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const absolutePath = path.resolve(normalizedPath);

    const distributed = isDistributed(normalizedPath, npmIgnorePatterns);
    const used = usedFiles.has(absolutePath);
    const deprecated = isDeprecated(normalizedPath, deprecatedPatterns);

    const item = {
      file: normalizedPath,
      errors: errors.length,
      errorCodes: [...new Set(errors.map(e => e.code))]
    };

    if (deprecated) {
      categories.deprecated.push(item);
    } else if (distributed && used) {
      categories.distributed_and_used.push(item);
    } else if (distributed && !used) {
      categories.distributed_but_unused.push(item);
    } else {
      categories.not_distributed.push(item);
    }
  }

  // Sort by error count
  for (const category of Object.values(categories)) {
    category.sort((a, b) => b.errors - a.errors);
  }

  // Print report
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.cyan}TYPESCRIPT ERROR DISTRIBUTION ANALYSIS${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`${colors.green}✅ DISTRIBUTED & ACTIVELY USED${colors.reset} (${categories.distributed_and_used.length} files)`);
  console.log(`   ${colors.yellow}These errors matter most - they affect users!${colors.reset}\n`);

  const totalUsedErrors = categories.distributed_and_used.reduce((sum, f) => sum + f.errors, 0);
  console.log(`   Total errors: ${colors.red}${totalUsedErrors}${colors.reset}\n`);

  if (categories.distributed_and_used.length > 0) {
    console.log('   Top 10 files:');
    categories.distributed_and_used.slice(0, 10).forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.file} ${colors.red}(${item.errors} errors)${colors.reset}`);
    });
  }

  console.log(`\n${colors.yellow}⚠️  DISTRIBUTED BUT UNUSED${colors.reset} (${categories.distributed_but_unused.length} files)`);
  console.log(`   ${colors.gray}These ship to npm but aren't imported by entry points${colors.reset}\n`);

  const totalUnusedErrors = categories.distributed_but_unused.reduce((sum, f) => sum + f.errors, 0);
  console.log(`   Total errors: ${colors.red}${totalUnusedErrors}${colors.reset}\n`);

  if (categories.distributed_but_unused.length > 0) {
    console.log('   Top 10 files:');
    categories.distributed_but_unused.slice(0, 10).forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.file} ${colors.red}(${item.errors} errors)${colors.reset}`);
    });
  }

  console.log(`\n${colors.gray}🚫 NOT DISTRIBUTED${colors.reset} (${categories.not_distributed.length} files)`);
  console.log(`   ${colors.gray}Excluded by .npmignore - won't affect users${colors.reset}\n`);

  const totalNotDistErrors = categories.not_distributed.reduce((sum, f) => sum + f.errors, 0);
  console.log(`   Total errors: ${totalNotDistErrors}\n`);

  console.log(`${colors.magenta}🗑️  DEPRECATED CODE${colors.reset} (${categories.deprecated.length} files)`);
  console.log(`   ${colors.gray}MCP and old swarm code - consider removing${colors.reset}\n`);

  const totalDeprecatedErrors = categories.deprecated.reduce((sum, f) => sum + f.errors, 0);
  console.log(`   Total errors: ${totalDeprecatedErrors}\n`);

  if (categories.deprecated.length > 0) {
    console.log('   Files:');
    categories.deprecated.slice(0, 15).forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.file} ${colors.red}(${item.errors} errors)${colors.reset}`);
    });
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.cyan}PRIORITY SUMMARY${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);

  const totalErrors = fileErrors.size;
  const usedPct = ((categories.distributed_and_used.length / totalErrors) * 100).toFixed(1);
  const unusedPct = ((categories.distributed_but_unused.length / totalErrors) * 100).toFixed(1);
  const notDistPct = ((categories.not_distributed.length / totalErrors) * 100).toFixed(1);
  const deprecatedPct = ((categories.deprecated.length / totalErrors) * 100).toFixed(1);

  console.log(`${colors.green}HIGH PRIORITY${colors.reset} (fix first):`);
  console.log(`  Distributed & Used: ${categories.distributed_and_used.length} files (${usedPct}%) - ${colors.red}${totalUsedErrors} errors${colors.reset}`);

  console.log(`\n${colors.yellow}MEDIUM PRIORITY${colors.reset} (consider fixing):`);
  console.log(`  Distributed but Unused: ${categories.distributed_but_unused.length} files (${unusedPct}%) - ${totalUnusedErrors} errors`);

  console.log(`\n${colors.gray}LOW PRIORITY${colors.reset} (can ignore):`);
  console.log(`  Not Distributed: ${categories.not_distributed.length} files (${notDistPct}%) - ${totalNotDistErrors} errors`);
  console.log(`  Deprecated: ${categories.deprecated.length} files (${deprecatedPct}%) - ${totalDeprecatedErrors} errors`);

  // Write detailed JSON report
  const report = {
    summary: {
      total_files_with_errors: fileErrors.size,
      total_errors: Array.from(fileErrors.values()).reduce((sum, e) => sum + e.length, 0),
      distributed_and_used: {
        files: categories.distributed_and_used.length,
        errors: totalUsedErrors
      },
      distributed_but_unused: {
        files: categories.distributed_but_unused.length,
        errors: totalUnusedErrors
      },
      not_distributed: {
        files: categories.not_distributed.length,
        errors: totalNotDistErrors
      },
      deprecated: {
        files: categories.deprecated.length,
        errors: totalDeprecatedErrors
      }
    },
    categories,
    entry_points: entryPoints,
    npm_ignore_patterns: npmIgnorePatterns.map(p => p.source)
  };

  fs.writeFileSync('typescript-errors-distribution.json', JSON.stringify(report, null, 2));
  console.log(`\n${colors.green}✅ Detailed report written to: typescript-errors-distribution.json${colors.reset}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseNpmIgnore,
  isDistributed,
  findImports,
  buildDependencyGraph,
  getDeprecatedPaths
};
