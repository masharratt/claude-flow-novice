#!/usr/bin/env node

/**
 * Test Suite for Path Update Automation Script
 *
 * Validates all features of update-paths.js including:
 * - Pattern matching (string and regex)
 * - File type validation (JSON, YAML, JavaScript, Markdown)
 * - Backup creation
 * - Dry-run mode
 * - Error handling
 *
 * @module scripts/migration/test-update-paths
 */

import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  validateJSON,
  validateYAML,
  validateJavaScript,
  validateMarkdown,
  applyPattern,
  processFile
} from './update-paths.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bright: '\x1b[1m'
};

let testsPassed = 0;
let testsFailed = 0;

/**
 * Run a single test case
 */
function test(name, fn) {
  try {
    fn();
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    console.log(`  ${colors.red}${error.message}${colors.reset}`);
    testsFailed++;
  }
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Test JSON validation
 */
function testJSONValidation() {
  console.log(`\n${colors.bright}${colors.blue}JSON Validation Tests${colors.reset}`);

  test('validates correct JSON', () => {
    const result = validateJSON('{"key": "value", "number": 123}');
    assert(result.valid === true, 'Should validate correct JSON');
  });

  test('rejects invalid JSON - missing quote', () => {
    const result = validateJSON('{"key: "value"}');
    assert(result.valid === false, 'Should reject invalid JSON');
    assert(result.error, 'Should provide error message');
  });

  test('rejects invalid JSON - trailing comma', () => {
    const result = validateJSON('{"key": "value",}');
    assert(result.valid === false, 'Should reject JSON with trailing comma');
  });

  test('validates complex nested JSON', () => {
    const complex = JSON.stringify({
      nested: { deeply: { structured: { data: [1, 2, 3] } } }
    });
    const result = validateJSON(complex);
    assert(result.valid === true, 'Should validate complex JSON');
  });
}

/**
 * Test YAML validation
 */
function testYAMLValidation() {
  console.log(`\n${colors.bright}${colors.blue}YAML Validation Tests${colors.reset}`);

  test('validates correct YAML', () => {
    const yaml = 'key: value\nnumber: 123\nlist:\n  - item1\n  - item2';
    const result = validateYAML(yaml);
    assert(result.valid === true, 'Should validate correct YAML');
  });

  test('rejects invalid YAML - bad indentation', () => {
    const yaml = 'key: value\n  bad: indentation';
    const result = validateYAML(yaml);
    assert(result.valid === false, 'Should reject YAML with bad indentation');
  });

  test('validates YAML with comments', () => {
    const yaml = '# Comment\nkey: value # inline comment';
    const result = validateYAML(yaml);
    assert(result.valid === true, 'Should validate YAML with comments');
  });
}

/**
 * Test JavaScript validation
 */
function testJavaScriptValidation() {
  console.log(`\n${colors.bright}${colors.blue}JavaScript Validation Tests${colors.reset}`);

  test('validates correct JavaScript', () => {
    const js = 'const x = 1; function test() { return x; }';
    const result = validateJavaScript(js);
    assert(result.valid === true, 'Should validate correct JavaScript');
  });

  test('rejects unbalanced braces', () => {
    const js = 'function test() { return 1;';
    const result = validateJavaScript(js);
    assert(result.valid === false, 'Should reject unbalanced braces');
  });

  test('rejects unbalanced brackets', () => {
    const js = 'const arr = [1, 2, 3;';
    const result = validateJavaScript(js);
    assert(result.valid === false, 'Should reject unbalanced brackets');
  });

  test('rejects unbalanced parentheses', () => {
    const js = 'function test( { return 1; }';
    const result = validateJavaScript(js);
    assert(result.valid === false, 'Should reject unbalanced parentheses');
  });
}

/**
 * Test Markdown validation
 */
function testMarkdownValidation() {
  console.log(`\n${colors.bright}${colors.blue}Markdown Validation Tests${colors.reset}`);

  test('validates correct Markdown', () => {
    const md = '# Header\n\nSome text with `inline code`\n\n```js\ncode block\n```';
    const result = validateMarkdown(md);
    assert(result.valid === true, 'Should validate correct Markdown');
  });

  test('rejects unbalanced code fences', () => {
    const md = '# Header\n\n```js\ncode block without closing fence';
    const result = validateMarkdown(md);
    assert(result.valid === false, 'Should reject unbalanced code fences');
  });

  test('rejects unbalanced inline code', () => {
    const md = 'Some text with `unclosed inline code';
    const result = validateMarkdown(md);
    assert(result.valid === false, 'Should reject unbalanced inline code');
  });

  test('validates Markdown with multiple code blocks', () => {
    const md = '```js\nblock1\n```\n\nText\n\n```python\nblock2\n```';
    const result = validateMarkdown(md);
    assert(result.valid === true, 'Should validate multiple code blocks');
  });
}

/**
 * Test pattern application
 */
function testPatternApplication() {
  console.log(`\n${colors.bright}${colors.blue}Pattern Application Tests${colors.reset}`);

  test('applies string literal pattern', () => {
    const content = 'node test-runner.js and node test-suite.js';
    const pattern = { pattern: 'node test-', replacement: 'node tests/manual/test-' };
    const result = applyPattern(content, pattern, false);

    assert(result.changed === true, 'Should detect changes');
    assert(result.matchCount === 2, 'Should count 2 matches');
    assert(
      result.content === 'node tests/manual/test-runner.js and node tests/manual/test-suite.js',
      'Should replace both occurrences'
    );
  });

  test('applies regex pattern', () => {
    const content = 'path/to/.claude-flow-novice/dist and another/.claude-flow-novice/dist';
    const pattern = { pattern: '\\.claude-flow-novice/dist', replacement: 'dist/' };
    const result = applyPattern(content, pattern, true);

    assert(result.changed === true, 'Should detect changes');
    assert(result.matchCount === 2, 'Should count 2 matches');
    assert(
      result.content === 'path/to/dist/ and another/dist/',
      'Should replace with regex'
    );
  });

  test('handles no matches', () => {
    const content = 'no matching content here';
    const pattern = { pattern: 'test-', replacement: 'tests/' };
    const result = applyPattern(content, pattern, false);

    assert(result.changed === false, 'Should detect no changes');
    assert(result.matchCount === 0, 'Should count 0 matches');
    assert(result.content === content, 'Content should be unchanged');
  });

  test('handles case-sensitive matching', () => {
    const content = 'node Test-runner.js and node test-runner.js';
    const pattern = { pattern: 'node test-', replacement: 'node tests/' };
    const result = applyPattern(content, pattern, false);

    assert(result.matchCount === 1, 'Should only match lowercase');
  });
}

/**
 * Test file processing
 */
async function testFileProcessing() {
  console.log(`\n${colors.bright}${colors.blue}File Processing Tests${colors.reset}`);

  // Create temporary test files
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'update-paths-test-'));

  try {
    // Test JSON file processing
    const jsonFile = path.join(tempDir, 'test.json');
    await fs.writeFile(
      jsonFile,
      JSON.stringify({ script: 'node test-runner.js' }, null, 2)
    );

    const jsonResult = await processFile(
      jsonFile,
      [{ pattern: 'node test-', replacement: 'node tests/manual/test-' }],
      { dryRun: true }
    );

    test('processes JSON file in dry-run', () => {
      assert(jsonResult.processed === true, 'Should process file');
      assert(jsonResult.changed === true, 'Should detect changes');
      assert(jsonResult.validated === true, 'Should validate JSON');
      assert(jsonResult.dryRun === true, 'Should respect dry-run flag');
    });

    // Test actual file modification
    const jsonResult2 = await processFile(
      jsonFile,
      [{ pattern: 'node test-', replacement: 'node tests/manual/test-' }],
      { dryRun: false, createBackups: false }
    );

    const updatedContent = await fs.readFile(jsonFile, 'utf8');

    test('modifies file when not dry-run', () => {
      assert(jsonResult2.processed === true, 'Should process file');
      assert(jsonResult2.changed === true, 'Should detect changes');
      assert(updatedContent.includes('node tests/manual/test-runner.js'), 'Should update content');
      assert(JSON.parse(updatedContent), 'Should maintain valid JSON');
    });

    // Test validation failure prevention
    const invalidJsonFile = path.join(tempDir, 'invalid.json');
    await fs.writeFile(invalidJsonFile, '{"key": "value"}');

    const invalidResult = await processFile(
      invalidJsonFile,
      [{ pattern: '"value"', replacement: '"value' }], // Will break JSON
      { dryRun: false, createBackups: false }
    );

    test('prevents modification on validation failure', () => {
      assert(invalidResult.processed === false, 'Should not process file');
      assert(invalidResult.validated === false, 'Should fail validation');
      assert(invalidResult.error, 'Should provide error message');
    });

    // Test backup creation
    const backupTestFile = path.join(tempDir, 'backup-test.json');
    await fs.writeFile(
      backupTestFile,
      JSON.stringify({ test: 'node test-file.js' }, null, 2)
    );

    await processFile(
      backupTestFile,
      [{ pattern: 'node test-', replacement: 'node tests/' }],
      { dryRun: false, createBackups: true }
    );

    const backupFiles = (await fs.readdir(tempDir)).filter(f =>
      f.startsWith('backup-test.json.backup-')
    );

    test('creates backup before modification', () => {
      assert(backupFiles.length > 0, 'Should create backup file');
    });

  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log(`${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════╗
║         Path Update Automation - Test Suite             ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);

  testJSONValidation();
  testYAMLValidation();
  testJavaScriptValidation();
  testMarkdownValidation();
  testPatternApplication();
  await testFileProcessing();

  // Summary
  console.log(`\n${colors.bright}${colors.blue}Test Summary${colors.reset}`);
  console.log(`${colors.green}Passed: ${testsPassed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testsFailed}${colors.reset}`);

  if (testsFailed === 0) {
    console.log(`\n${colors.green}${colors.bright}✓ All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bright}✗ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
  });
}
