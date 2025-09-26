/**
 * Test File ES Module Migration Fixer
 *
 * Fixes ES module compatibility issues in test files by:
 * 1. Ensuring proper import/export syntax
 * 2. Adding .js extensions to relative imports
 * 3. Converting require() to import statements
 * 4. Fixing module.exports to export statements
 */

import { promises as fs } from 'fs';
import path from 'path';
// Using dynamic import for glob to avoid TypeScript compilation issues
// import { Glob } from 'glob';

export interface TestFileFix {
  file: string;
  changes: string[];
  success: boolean;
  error?: string;
}

export class TestMigrationFixer {
  private fixedFiles: Map<string, TestFileFix> = new Map();

  constructor(private projectRoot: string) {}

  /**
   * Fix all test files in the project
   */
  async fixAllTestFiles(): Promise<TestFileFix[]> {
    const testFiles = await this.findTestFiles();
    const results: TestFileFix[] = [];

    console.log(`Found ${testFiles.length} test files to process...`);

    for (const file of testFiles) {
      try {
        const result = await this.fixTestFile(file);
        results.push(result);

        if (result.success && result.changes.length > 0) {
          console.log(`✅ Fixed ${file}: ${result.changes.join(', ')}`);
        } else if (!result.success) {
          console.log(`❌ Failed to fix ${file}: ${result.error}`);
        }
      } catch (error) {
        console.error(`Error processing ${file}:`, error);
        results.push({
          file,
          changes: [],
          success: false,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Fix a single test file
   */
  async fixTestFile(filePath: string): Promise<TestFileFix> {
    const result: TestFileFix = {
      file: filePath,
      changes: [],
      success: false
    };

    try {
      const originalContent = await fs.readFile(filePath, 'utf8');
      let content = originalContent;

      // Fix 1: Convert require() to import statements
      const requireFixes = this.fixRequireStatements(content);
      content = requireFixes.content;
      result.changes.push(...requireFixes.changes);

      // Fix 2: Convert module.exports to export statements
      const exportFixes = this.fixModuleExports(content);
      content = exportFixes.content;
      result.changes.push(...exportFixes.changes);

      // Fix 3: Add .js extensions to relative imports
      const importFixes = this.fixImportExtensions(content, filePath);
      content = importFixes.content;
      result.changes.push(...importFixes.changes);

      // Fix 4: Fix Jest import for ES modules
      const jestFixes = this.fixJestImports(content);
      content = jestFixes.content;
      result.changes.push(...jestFixes.changes);

      // Fix 5: Fix __dirname and __filename for ES modules
      const dirnameFixes = this.fixDirnameFilename(content);
      content = dirnameFixes.content;
      result.changes.push(...dirnameFixes.changes);

      // Fix 6: Fix dynamic imports
      const dynamicImportFixes = this.fixDynamicImports(content);
      content = dynamicImportFixes.content;
      result.changes.push(...dynamicImportFixes.changes);

      // Only write if changes were made
      if (content !== originalContent) {
        await fs.writeFile(filePath, content, 'utf8');
        result.success = true;
      } else {
        result.success = true; // No changes needed
      }

    } catch (error) {
      result.error = (error as Error).message;
    }

    return result;
  }

  /**
   * Find all test files in the project
   */
  private async findTestFiles(): Promise<string[]> {
    const { glob } = await import('glob');

    const files = await glob(['**/*.test.js', '**/*.spec.js'], {
      cwd: this.projectRoot,
      ignore: ['node_modules/**', 'dist/**', 'bin/**']
    });

    return files.map(file => path.join(this.projectRoot, file));
  }

  /**
   * Fix require() statements
   */
  private fixRequireStatements(content: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let newContent = content;

    // Convert const { ... } = require(...) to import { ... } from ...
    const destructuringRequireRegex = /const\s+\{\s*([^}]+)\s*\}\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\);?/g;
    newContent = newContent.replace(destructuringRequireRegex, (match, destructured, moduleName) => {
      changes.push('Convert destructuring require to import');
      return `import { ${destructured} } from '${this.addJsExtensionIfNeeded(moduleName)}';`;
    });

    // Convert const ... = require(...) to import ... from ...
    const basicRequireRegex = /const\s+(\w+)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\);?/g;
    newContent = newContent.replace(basicRequireRegex, (match, varName, moduleName) => {
      changes.push('Convert require to import');
      return `import ${varName} from '${this.addJsExtensionIfNeeded(moduleName)}';`;
    });

    // Convert require(...) to import (for dynamic requires, convert to dynamic import)
    const dynamicRequireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    newContent = newContent.replace(dynamicRequireRegex, (match, moduleName) => {
      changes.push('Convert dynamic require to import()');
      return `import('${this.addJsExtensionIfNeeded(moduleName)}')`;
    });

    return { content: newContent, changes };
  }

  /**
   * Fix module.exports statements
   */
  private fixModuleExports(content: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let newContent = content;

    // Convert module.exports = ... to export default ...
    const moduleExportsRegex = /module\.exports\s*=\s*(.+);?/g;
    newContent = newContent.replace(moduleExportsRegex, (match, exported) => {
      changes.push('Convert module.exports to export default');
      return `export default ${exported};`;
    });

    // Convert exports.something = ... to export const something = ...
    const namedExportsRegex = /exports\.(\w+)\s*=\s*(.+);?/g;
    newContent = newContent.replace(namedExportsRegex, (match, name, value) => {
      changes.push('Convert exports to export const');
      return `export const ${name} = ${value};`;
    });

    return { content: newContent, changes };
  }

  /**
   * Fix import extensions
   */
  private fixImportExtensions(content: string, filePath: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let newContent = content;

    // Fix relative imports without .js extension
    const importRegex = /import\s+(.+?)\s+from\s+['"`](\.\/.+?)['"`];?/g;
    newContent = newContent.replace(importRegex, (match, imported, modulePath) => {
      if (!modulePath.endsWith('.js') && !modulePath.endsWith('.ts') && !modulePath.includes('node_modules')) {
        // Check if it's a relative import
        if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
          const correctedPath = this.addJsExtensionIfNeeded(modulePath);
          if (correctedPath !== modulePath) {
            changes.push('Add .js extension to relative import');
            return `import ${imported} from '${correctedPath}';`;
          }
        }
      }
      return match;
    });

    return { content: newContent, changes };
  }

  /**
   * Fix Jest imports for ES modules
   */
  private fixJestImports(content: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let newContent = content;

    // Add Jest globals import if test functions are used but not imported
    const hasJestFunctions = /\b(describe|test|it|expect|beforeEach|afterEach|beforeAll|afterAll)\b/.test(content);
    const hasJestImport = /import.*@jest\/globals/.test(content);

    if (hasJestFunctions && !hasJestImport) {
      // Check which Jest functions are used
      const jestFunctions = ['describe', 'test', 'it', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'];
      const usedFunctions = jestFunctions.filter(fn => new RegExp(`\\b${fn}\\b`).test(content));

      if (usedFunctions.length > 0) {
        const jestImport = `import { ${usedFunctions.join(', ')} } from '@jest/globals';\n`;
        newContent = jestImport + newContent;
        changes.push('Add Jest globals import');
      }
    }

    return { content: newContent, changes };
  }

  /**
   * Fix __dirname and __filename for ES modules
   */
  private fixDirnameFilename(content: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let newContent = content;

    const hasDirname = /__dirname/.test(content);
    const hasFilename = /__filename/.test(content);

    if (hasDirname || hasFilename) {
      // Add ES module equivalents at the top
      const imports = [];
      if (!newContent.includes('import { fileURLToPath }')) {
        imports.push("import { fileURLToPath } from 'url';");
        imports.push("import { dirname } from 'path';");
      }

      if (hasDirname && !newContent.includes('const __dirname')) {
        imports.push("const __filename = fileURLToPath(import.meta.url);");
        imports.push("const __dirname = dirname(__filename);");
      } else if (hasFilename && !newContent.includes('const __filename')) {
        imports.push("const __filename = fileURLToPath(import.meta.url);");
      }

      if (imports.length > 0) {
        newContent = imports.join('\n') + '\n' + newContent;
        changes.push('Add ES module __dirname/__filename equivalents');
      }
    }

    return { content: newContent, changes };
  }

  /**
   * Fix dynamic imports
   */
  private fixDynamicImports(content: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let newContent = content;

    // Fix await import() calls that might need .js extension
    const dynamicImportRegex = /await\s+import\s*\(\s*['"`](\.\/.+?)['"`]\s*\)/g;
    newContent = newContent.replace(dynamicImportRegex, (match, modulePath) => {
      const correctedPath = this.addJsExtensionIfNeeded(modulePath);
      if (correctedPath !== modulePath) {
        changes.push('Add .js extension to dynamic import');
        return match.replace(modulePath, correctedPath);
      }
      return match;
    });

    return { content: newContent, changes };
  }

  /**
   * Add .js extension if needed for relative imports
   */
  private addJsExtensionIfNeeded(modulePath: string): string {
    // Don't modify node_modules imports or paths that already have extensions
    if (!modulePath.startsWith('./') && !modulePath.startsWith('../')) {
      return modulePath;
    }

    if (modulePath.endsWith('.js') || modulePath.endsWith('.ts') || modulePath.endsWith('.json')) {
      return modulePath;
    }

    // For TypeScript files being imported, use .js (the compiled output)
    return modulePath + '.js';
  }

  /**
   * Get summary of fixes applied
   */
  getSummary(): {
    totalFiles: number;
    fixedFiles: number;
    totalChanges: number;
    changesByType: Record<string, number>;
  } {
    const fixes = Array.from(this.fixedFiles.values());
    const changesByType: Record<string, number> = {};

    let totalChanges = 0;
    for (const fix of fixes) {
      totalChanges += fix.changes.length;
      for (const change of fix.changes) {
        changesByType[change] = (changesByType[change] || 0) + 1;
      }
    }

    return {
      totalFiles: fixes.length,
      fixedFiles: fixes.filter(f => f.success && f.changes.length > 0).length,
      totalChanges,
      changesByType
    };
  }
}

/**
 * CLI function to run the fixer
 */
export async function runTestMigrationFixer(projectRoot?: string): Promise<void> {
  const root = projectRoot || process.cwd();
  const fixer = new TestMigrationFixer(root);

  console.log('🔧 Starting ES module test file migration...');
  console.log(`Project root: ${root}`);

  try {
    const results = await fixer.fixAllTestFiles();
    const summary = fixer.getSummary();

    console.log('\n📊 Migration Summary:');
    console.log(`- Total files processed: ${summary.totalFiles}`);
    console.log(`- Files with fixes: ${summary.fixedFiles}`);
    console.log(`- Total changes applied: ${summary.totalChanges}`);

    if (Object.keys(summary.changesByType).length > 0) {
      console.log('\n🔄 Changes by type:');
      for (const [change, count] of Object.entries(summary.changesByType)) {
        console.log(`  - ${change}: ${count}`);
      }
    }

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.log('\n⚠️ Failed files:');
      for (const failure of failures) {
        console.log(`  - ${failure.file}: ${failure.error}`);
      }
    }

    console.log('\n✅ ES module test file migration completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}