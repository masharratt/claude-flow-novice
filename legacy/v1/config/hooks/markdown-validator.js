#!/usr/bin/env node

/**
 * Standalone Markdown Validator with WASM 52x Acceleration
 *
 * Best used in:
 * - Pre-commit hooks (validate before committing)
 * - CI/CD pipelines (PR validation)
 * - Documentation builds (pre-process before publishing)
 * - CFN Loop documentation agents (quality check generated docs)
 *
 * Usage:
 *   node markdown-validator.js README.md                    # Single file
 *   node markdown-validator.js docs/**/*.md                 # Glob pattern
 *   node markdown-validator.js --all                        # All .md files in project
 *   node markdown-validator.js --ci                         # CI mode (exit 1 on errors)
 *   VALIDATE_MARKDOWN=true npm run pre-commit              # Environment variable
 */

import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the post-edit pipeline for markdown processing
import { UnifiedPostEditPipeline } from './post-edit-pipeline.js';

class MarkdownValidator {
    constructor(options = {}) {
        this.ciMode = options.ciMode || false;
        this.verbose = options.verbose || false;
        this.results = [];
    }

    async validateFiles(files) {
        console.log(`\n📝 Markdown Validator (WASM 52x Accelerated)`);
        console.log(`📊 Validating ${files.length} file(s)...\n`);

        const pipeline = new UnifiedPostEditPipeline({
            wasmEnabled: true, // Always enable WASM for batch processing
            validateMarkdown: true
        });

        let totalErrors = 0;
        let totalWarnings = 0;
        let totalBrokenLinks = 0;

        for (const file of files) {
            const result = await pipeline.run(file, { validateMarkdown: true });
            this.results.push(result);

            if (result.markdown) {
                totalBrokenLinks += result.markdown.brokenLinks?.length || 0;
            }

            totalErrors += result.summary.errors.length;
            totalWarnings += result.summary.warnings.length;

            // Print results
            const status = result.summary.errors.length > 0 ? '❌' : '✅';
            console.log(`${status} ${path.basename(file)}`);

            if (this.verbose || result.summary.errors.length > 0) {
                if (result.markdown?.brokenLinks?.length > 0) {
                    result.markdown.brokenLinks.forEach(link => {
                        console.log(`   ❌ Broken link at line ${link.line}: ${link.link}`);
                    });
                }

                if (result.summary.suggestions.length > 0) {
                    result.summary.suggestions.forEach(suggestion => {
                        console.log(`   💡 ${suggestion}`);
                    });
                }
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MARKDOWN VALIDATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`Files validated: ${files.length}`);
        console.log(`Broken links: ${totalBrokenLinks}`);
        console.log(`Errors: ${totalErrors}`);
        console.log(`Warnings: ${totalWarnings}`);

        if (totalErrors === 0 && totalBrokenLinks === 0) {
            console.log('✅ All markdown files valid!');
        } else {
            console.log('❌ Validation failed. Fix issues above.');
        }

        console.log('='.repeat(60));

        // Exit with error in CI mode if there are issues
        if (this.ciMode && (totalErrors > 0 || totalBrokenLinks > 0)) {
            process.exit(1);
        }

        return {
            filesValidated: files.length,
            brokenLinks: totalBrokenLinks,
            errors: totalErrors,
            warnings: totalWarnings,
            success: totalErrors === 0 && totalBrokenLinks === 0
        };
    }

    async findMarkdownFiles() {
        // Find all .md files in project, excluding node_modules and .git
        const files = await glob('**/*.md', {
            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.claude-flow-novice/**'],
            cwd: process.cwd()
        });

        return files.map(file => path.join(process.cwd(), file));
    }
}

// CLI execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
📝 Markdown Validator (WASM 52x Accelerated)

Usage:
  node markdown-validator.js <file>               Validate single file
  node markdown-validator.js <pattern>            Validate glob pattern
  node markdown-validator.js --all                Validate all .md files
  node markdown-validator.js --ci                 CI mode (exit 1 on errors)

Options:
  --ci                    CI mode: Exit with code 1 if validation fails
  --verbose               Show all suggestions and details
  --help                  Show this help message

Examples:
  node markdown-validator.js README.md
  node markdown-validator.js docs/**/*.md
  node markdown-validator.js --all --ci
  node markdown-validator.js --all --verbose

Pre-commit Hook:
  # .git/hooks/pre-commit
  #!/bin/bash
  node config/hooks/markdown-validator.js --all --ci

CI/CD:
  # .github/workflows/docs.yml
  - name: Validate Documentation
    run: node config/hooks/markdown-validator.js --all --ci
`);
        return;
    }

    const validator = new MarkdownValidator({
        ciMode: args.includes('--ci'),
        verbose: args.includes('--verbose')
    });

    let files = [];

    if (args.includes('--all')) {
        files = await validator.findMarkdownFiles();
    } else {
        // Get file patterns from args (excluding flags)
        const patterns = args.filter(arg => !arg.startsWith('--'));

        for (const pattern of patterns) {
            if (pattern.includes('*')) {
                // Glob pattern
                const matched = await glob(pattern, { cwd: process.cwd() });
                files.push(...matched.map(f => path.join(process.cwd(), f)));
            } else {
                // Single file
                files.push(path.resolve(pattern));
            }
        }
    }

    if (files.length === 0) {
        console.error('❌ No markdown files found to validate');
        process.exit(1);
    }

    await validator.validateFiles(files);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ Validation error:', error.message);
        process.exit(1);
    });
}

export { MarkdownValidator };
