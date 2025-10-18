#!/usr/bin/env node
/**
 * Post-Edit Pipeline - TypeScript Validation Hook
 * Validates edited files for TypeScript errors immediately after edit
 *
 * Usage: node config/hooks/post-edit-pipeline.js <file_path> [--memory-key <key>]
 */

import { execSync } from 'child_process';
import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, extname, resolve } from 'path';

// Parse arguments
const args = process.argv.slice(2);
const filePath = args[0];
const memoryKeyIndex = args.indexOf('--memory-key');
const memoryKey = memoryKeyIndex >= 0 ? args[memoryKeyIndex + 1] : null;

if (!filePath) {
  console.error('Error: File path required');
  console.error('Usage: node config/hooks/post-edit-pipeline.js <file_path> [--memory-key <key>]');
  process.exit(1);
}

// Ensure log directory exists
const logDir = '.artifacts/logs';
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const logFile = `${logDir}/post-edit-pipeline.log`;

function log(status, message, metadata = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    file: filePath,
    status,
    message,
    memoryKey,
    ...metadata
  });
  console.log(entry);
  appendFileSync(logFile, entry + '\n');
}

// Skip non-TypeScript files
const ext = extname(filePath);
if (!['.ts', '.tsx'].includes(ext)) {
  log('SKIPPED', 'Non-TypeScript file');
  process.exit(0);
}

// Check if file exists
if (!existsSync(filePath)) {
  log('ERROR', 'File not found', { path: filePath });
  process.exit(1);
}

// Run TypeScript type check on the specific file
try {
  log('VALIDATING', 'Running TypeScript validation');

  // Use tsc to check only this file
  const cmd = `npx tsc --noEmit --skipLibCheck ${filePath}`;
  execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });

  log('SUCCESS', 'TypeScript validation passed');
  process.exit(0);

} catch (error) {
  // Parse TypeScript errors
  const output = error.stdout || error.stderr || '';
  const lines = output.split('\n').filter(line => line.includes('error TS'));

  if (lines.length === 0) {
    log('SUCCESS', 'No TypeScript errors detected');
    process.exit(0);
  }

  // Categorize errors
  const errorTypes = {
    implicitAny: lines.filter(l => l.includes('TS7006') || l.includes('TS7031')).length,
    propertyMissing: lines.filter(l => l.includes('TS2339')).length,
    typeMismatch: lines.filter(l => l.includes('TS2322') || l.includes('TS2345')).length,
    syntaxError: lines.filter(l => l.includes('TS1005') || l.includes('TS1128')).length,
    other: 0
  };
  errorTypes.other = lines.length - Object.values(errorTypes).reduce((a, b) => a + b, 0);

  const severity = errorTypes.syntaxError > 0 ? 'SYNTAX_ERROR' :
                   lines.length > 5 ? 'LINT_ISSUES' : 'TYPE_WARNING';

  log(severity, `TypeScript errors detected: ${lines.length}`, {
    errorCount: lines.length,
    errorTypes,
    errors: lines.slice(0, 5) // First 5 errors
  });

  // Provide actionable feedback
  if (errorTypes.syntaxError > 0) {
    console.error('\n⚠️  SYNTAX ERRORS detected - Fix syntax issues first');
  } else if (errorTypes.implicitAny > 0) {
    console.error('\n⚠️  Add explicit type annotations for parameters');
  } else if (errorTypes.propertyMissing > 0) {
    console.error('\n⚠️  Property access errors - Check interfaces and type definitions');
  }

  process.exit(severity === 'SYNTAX_ERROR' ? 2 : 0); // Non-blocking for type warnings
}
