#!/usr/bin/env node

/**
 * CFN Compilation Error Fixer - Main Entry Point
 *
 * This module provides a Node.js entry point for the compilation error fixer.
 * It delegates to the appropriate TypeScript implementation based on the error type.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const errorType = args[0] || 'rust';

// Map error types to fixer files
const fixerMap = {
    'rust': 'cerebras-gated-fixer-v2.ts',
    'typescript': 'typescript-gated-fixer-v2.ts',
    'ts': 'typescript-gated-fixer-v2.ts'
};

// Validate error type
if (!fixerMap[errorType]) {
    console.error(`❌ Invalid error type: ${errorType}`);
    console.error('Valid types: rust, typescript (or ts)');
    process.exit(1);
}

// Show help
if (errorType === '--help' || errorType === '-h') {
    console.log('CFN Compilation Error Fixer');
    console.log('');
    console.log('Usage:');
    console.log('  node index.js [rust|typescript] [options]');
    console.log('  npm run fix [rust|typescript] [options]');
    console.log('');
    console.log('Examples:');
    console.log('  node index.js rust                    # Fix Rust errors');
    console.log('  node index.js rust --dry-run         # Dry run for Rust');
    console.log('  node index.js typescript             # Fix TypeScript errors');
    console.log('  node index.js ts --verbose           # Verbose TypeScript fixing');
    process.exit(0);
}

// Prepare to run the fixer
const fixerFile = join(__dirname, 'lib', 'fixer', fixerMap[errorType]);
const fixerArgs = args.slice(1); // Skip the error type argument

// Set environment for optional SDK
process.env.CFN_ALLOW_FALLBACK = 'true';

// Run the fixer with tsx
console.log(`🔧 Running CFN Compilation Error Fixer for ${errorType}...`);
console.log(`   File: ${fixerFile}`);
console.log(`   Options: ${fixerArgs.join(' ') || 'none'}`);
console.log('');

const child = spawn('npx', ['tsx', fixerFile, ...fixerArgs], {
    stdio: 'inherit',
    cwd: __dirname
});

// Handle exit
child.on('exit', (code) => {
    process.exit(code || 0);
});

child.on('error', (err) => {
    console.error('❌ Error running fixer:', err.message);
    console.error('\nPossible solutions:');
    console.error('1. Run: npm install');
    console.error('2. Ensure tsx is installed: npm install -g tsx');
    console.error('3. Try using the shell script: ./bin/fix-errors.sh');
    process.exit(1);
});