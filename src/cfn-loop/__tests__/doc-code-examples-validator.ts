/**
 * Documentation Code Examples Validator
 * Sprint 4.1 - Validates code examples from technical documentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import * as acorn from 'acorn';

interface CodeExample {
  file: string;
  language: string;
  code: string;
  lineStart: number;
  lineEnd: number;
  context: string;
}

interface ValidationResult {
  file: string;
  example: number;
  lineStart: number;
  lineEnd: number;
  language: string;
  syntaxValid: boolean;
  executable: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Extract code blocks from markdown file
 */
function extractCodeBlocks(filePath: string): CodeExample[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const examples: CodeExample[] = [];

  let inCodeBlock = false;
  let currentLanguage = '';
  let currentCode: string[] = [];
  let blockStart = 0;
  let context = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract context (heading before code block)
    if (line.startsWith('#')) {
      context = line.replace(/^#+\s*/, '');
    }

    // Start of code block
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        currentLanguage = line.substring(3).trim() || 'text';
        currentCode = [];
        blockStart = i + 1;
      } else {
        // End of code block
        inCodeBlock = false;
        examples.push({
          file: path.basename(filePath),
          language: currentLanguage,
          code: currentCode.join('\n'),
          lineStart: blockStart,
          lineEnd: i,
          context,
        });
      }
    } else if (inCodeBlock) {
      currentCode.push(line);
    }
  }

  return examples;
}

/**
 * Validate TypeScript syntax
 */
function validateTypeScript(code: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  try {
    parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'asyncGenerators', 'dynamicImport'],
      errorRecovery: false,
    });
    return { valid: true, issues: [] };
  } catch (error: any) {
    issues.push(`Syntax error: ${error.message}`);
    return { valid: false, issues };
  }
}

/**
 * Validate JavaScript syntax
 */
function validateJavaScript(code: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  try {
    acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
    });
    return { valid: true, issues: [] };
  } catch (error: any) {
    issues.push(`Syntax error: ${error.message}`);
    return { valid: false, issues };
  }
}

/**
 * Check if code is executable (not pseudo-code)
 */
function isExecutable(code: string, language: string): boolean {
  // Pseudo-code indicators
  const pseudoCodePatterns = [
    /\/\/ \.\.\./,              // Comments with ellipsis
    /\{[^}]*\.\.\.[^}]*\}/,    // Object/interface with ellipsis
    /\[[^\]]*\.\.\.[^\]]*\]/,  // Array with ellipsis
    /\bTODO\b/i,               // TODO markers
    /\bFIXME\b/i,              // FIXME markers
    /\bExample\b.*:/i,         // "Example:" labels
  ];

  return !pseudoCodePatterns.some(pattern => pattern.test(code));
}

/**
 * Check for common issues in code examples
 */
function checkCodeIssues(code: string, language: string): {
  warnings: string[];
  issues: string[];
} {
  const warnings: string[] = [];
  const issues: string[] = [];

  // Check for missing imports
  if (language === 'typescript' || language === 'ts') {
    if (code.includes('BlockingCoordinationManager') && !code.includes('import')) {
      warnings.push('Missing import for BlockingCoordinationManager');
    }
    if (code.includes('CoordinatorTimeoutHandler') && !code.includes('import')) {
      warnings.push('Missing import for CoordinatorTimeoutHandler');
    }
    if (code.includes('createClient') && !code.includes('import') && !code.includes('require')) {
      warnings.push('Missing import for redis createClient');
    }
    if (code.includes('BlockingCoordinationSignals') && !code.includes('import')) {
      warnings.push('Missing import for BlockingCoordinationSignals');
    }
  }

  // Check for deprecated API usage
  if (code.includes('redis.keys(')) {
    issues.push('Uses deprecated redis.keys() - should use SCAN instead');
  }

  // Check for missing error handling
  if (code.includes('await') && !code.includes('try') && !code.includes('catch')) {
    warnings.push('Async operations without try/catch error handling');
  }

  // Check for missing cleanup
  if (code.includes('createClient') && !code.includes('.quit()') && !code.includes('.disconnect()')) {
    warnings.push('Redis client created but not explicitly disconnected');
  }

  // Check for HMAC secret usage
  if (code.includes('BlockingCoordinationManager') && !code.includes('BLOCKING_COORDINATION_SECRET')) {
    warnings.push('Missing HMAC secret configuration');
  }

  // Check for timing-safe comparison
  if (code.includes('signature') && code.includes('===') && !code.includes('timingSafeEqual')) {
    issues.push('String comparison for signatures - should use timingSafeEqual');
  }

  return { warnings, issues };
}

/**
 * Validate a single code example
 */
function validateCodeExample(example: CodeExample, index: number): ValidationResult {
  const result: ValidationResult = {
    file: example.file,
    example: index + 1,
    lineStart: example.lineStart,
    lineEnd: example.lineEnd,
    language: example.language,
    syntaxValid: false,
    executable: false,
    issues: [],
    warnings: [],
  };

  // Skip non-code languages
  if (!['typescript', 'ts', 'javascript', 'js'].includes(example.language)) {
    result.syntaxValid = true;
    result.executable = false;
    return result;
  }

  // Check if executable
  result.executable = isExecutable(example.code, example.language);

  // Validate syntax
  let syntaxResult;
  if (example.language === 'typescript' || example.language === 'ts') {
    syntaxResult = validateTypeScript(example.code);
  } else {
    syntaxResult = validateJavaScript(example.code);
  }

  result.syntaxValid = syntaxResult.valid;
  result.issues.push(...syntaxResult.issues);

  // Check for common issues
  const codeIssues = checkCodeIssues(example.code, example.language);
  result.warnings.push(...codeIssues.warnings);
  result.issues.push(...codeIssues.issues);

  return result;
}

/**
 * Main validation function
 */
export function validateDocumentationExamples(docFiles: string[]): {
  results: ValidationResult[];
  summary: {
    totalExamples: number;
    executableExamples: number;
    pseudoCodeExamples: number;
    syntaxValid: number;
    syntaxInvalid: number;
    totalIssues: number;
    totalWarnings: number;
  };
} {
  const allResults: ValidationResult[] = [];

  for (const docFile of docFiles) {
    const examples = extractCodeBlocks(docFile);

    for (let i = 0; i < examples.length; i++) {
      const result = validateCodeExample(examples[i], i);
      allResults.push(result);
    }
  }

  // Calculate summary
  const summary = {
    totalExamples: allResults.length,
    executableExamples: allResults.filter(r => r.executable).length,
    pseudoCodeExamples: allResults.filter(r => !r.executable).length,
    syntaxValid: allResults.filter(r => r.syntaxValid).length,
    syntaxInvalid: allResults.filter(r => !r.syntaxValid).length,
    totalIssues: allResults.reduce((sum, r) => sum + r.issues.length, 0),
    totalWarnings: allResults.reduce((sum, r) => sum + r.warnings.length, 0),
  };

  return { results: allResults, summary };
}

/**
 * Format validation results as JSON report
 */
export function formatReport(
  results: ValidationResult[],
  summary: any
): string {
  const report = {
    agent: 'tester',
    confidence: calculateConfidence(summary),
    test_results: {
      total_examples: summary.totalExamples,
      executable_examples: summary.executableExamples,
      pseudo_code_examples: summary.pseudoCodeExamples,
      syntax_valid: summary.syntaxValid,
      examples_tested: summary.executableExamples,
      examples_passed: summary.syntaxValid - summary.syntaxInvalid,
      examples_failed: summary.syntaxInvalid,
      failures: results.filter(r => !r.syntaxValid || r.issues.length > 0).map(r => ({
        file: r.file,
        example: r.example,
        lines: `${r.lineStart}-${r.lineEnd}`,
        language: r.language,
        issues: r.issues,
        warnings: r.warnings,
      })),
    },
    blockers: results
      .filter(r => !r.syntaxValid)
      .map(r => `${r.file}:${r.lineStart}-${r.lineEnd}: Syntax error`),
    recommendations: generateRecommendations(results),
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Calculate confidence score
 */
function calculateConfidence(summary: any): number {
  const syntaxScore = summary.syntaxValid / Math.max(summary.totalExamples, 1);
  const issueScore = 1 - (summary.totalIssues / Math.max(summary.totalExamples * 2, 1));
  const confidence = (syntaxScore * 0.7 + issueScore * 0.3);
  return Math.round(confidence * 100) / 100;
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(results: ValidationResult[]): string[] {
  const recommendations: string[] = [];
  const issueTypes = new Map<string, number>();

  for (const result of results) {
    for (const issue of result.issues) {
      issueTypes.set(issue, (issueTypes.get(issue) || 0) + 1);
    }
    for (const warning of result.warnings) {
      issueTypes.set(warning, (issueTypes.get(warning) || 0) + 1);
    }
  }

  // Sort by frequency
  const sortedIssues = Array.from(issueTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [issue, count] of sortedIssues) {
    recommendations.push(`Fix ${count} occurrence(s): ${issue}`);
  }

  if (results.some(r => r.issues.includes('Uses deprecated redis.keys()'))) {
    recommendations.push('Replace all redis.keys() calls with SCAN implementation');
  }

  if (results.some(r => r.issues.includes('String comparison for signatures'))) {
    recommendations.push('Replace string comparison with crypto.timingSafeEqual()');
  }

  return recommendations;
}

// CLI execution
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url.endsWith(process.argv[1]);

if (isMainModule) {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const docsDir = path.join(__dirname, '../../../docs');
  const docFiles = [
    path.join(docsDir, 'patterns/blocking-coordination-pattern.md'),
    path.join(docsDir, 'integration/cfn-loop-examples.md'),
    path.join(docsDir, 'api/blocking-coordination-api.md'),
  ];

  console.log('Validating documentation code examples...\n');

  const { results, summary } = validateDocumentationExamples(docFiles);
  const report = formatReport(results, summary);

  console.log(report);

  // Save report to file
  const reportPath = path.join(__dirname, 'doc-validation-report.json');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
}
