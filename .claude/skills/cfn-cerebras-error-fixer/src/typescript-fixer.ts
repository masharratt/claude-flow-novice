#!/usr/bin/env npx tsx
/**
 * TypeScript Parallel Error Fixer
 *
 * Parses tsc --noEmit output and fixes errors in parallel using Cerebras.
 * Uses diff mode for token efficiency.
 *
 * Usage: npx tsx typescript-fixer.ts <project-dir> [max-files]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { callCerebras } from "./cerebras-client.js";
import { applyFixes, parseFixes, type FixInstruction } from "./diff-applier.js";

interface TSError {
  code: string;
  line: number;
  column: number;
  message: string;
  filePath: string;
}

interface FileErrors {
  filePath: string;
  errors: TSError[];
  content: string;
}

// Configuration
const CONFIG = {
  maxErrorsPerFile: 5,
  contextLines: 10,
  maxTokens: 4000,
};

/**
 * Parse TypeScript errors from tsc output
 */
function parseTypeScriptErrors(projectDir: string): Map<string, TSError[]> {
  let output: string;
  try {
    execSync(`cd "${projectDir}" && npx tsc --noEmit 2>&1`, { encoding: "utf-8" });
    return new Map(); // No errors
  } catch (error: any) {
    output = error.stdout || error.message;
  }

  const errorsByFile = new Map<string, TSError[]>();
  const errorRegex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g;

  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const [, filePath, line, column, code, message] = match;
    const normalizedPath = filePath.replace(/\\/g, "/");

    if (!errorsByFile.has(normalizedPath)) {
      errorsByFile.set(normalizedPath, []);
    }

    errorsByFile.get(normalizedPath)!.push({
      code,
      message,
      filePath: normalizedPath,
      line: parseInt(line),
      column: parseInt(column),
    });
  }

  return errorsByFile;
}

/**
 * Extract context around errors (not full file)
 */
function extractErrorContext(content: string, errors: TSError[]): string {
  const lines = content.split("\n");
  const chunks: string[] = [];
  const includedRanges: Array<{ start: number; end: number }> = [];

  const sortedErrors = [...errors].sort((a, b) => a.line - b.line);

  for (const error of sortedErrors) {
    const start = Math.max(0, error.line - 1 - CONFIG.contextLines);
    const end = Math.min(lines.length, error.line + CONFIG.contextLines);

    const lastRange = includedRanges[includedRanges.length - 1];
    if (lastRange && start <= lastRange.end + 2) {
      lastRange.end = Math.max(lastRange.end, end);
    } else {
      includedRanges.push({ start, end });
    }
  }

  for (const range of includedRanges) {
    const relevantErrors = sortedErrors.filter(
      (e) => e.line > range.start && e.line <= range.end
    );

    chunks.push(
      `// Lines ${range.start + 1}-${range.end} (errors: ${relevantErrors
        .map((e) => `L${e.line}:${e.code}`)
        .join(", ")})`
    );

    for (let i = range.start; i < range.end; i++) {
      const lineNum = i + 1;
      const isErrorLine = relevantErrors.some((e) => e.line === lineNum);
      const prefix = isErrorLine ? ">>> " : "    ";
      chunks.push(`${prefix}${lineNum}: ${lines[i]}`);
    }
    chunks.push("");
  }

  return chunks.join("\n");
}

/**
 * Build prompt for Cerebras
 */
function buildPrompt(file: FileErrors): string {
  const sections: string[] = [];

  sections.push("You are an expert TypeScript developer fixing compilation errors.");
  sections.push("Return ONLY a JSON object with fix instructions.");
  sections.push("");

  sections.push(`## File: \`${file.filePath}\``);
  sections.push("");

  sections.push("## Errors to Fix");
  for (const error of file.errors.slice(0, CONFIG.maxErrorsPerFile)) {
    sections.push(`- **Line ${error.line}** [${error.code}]: ${error.message}`);
  }
  sections.push("");

  sections.push("## Code Context");
  sections.push("```typescript");
  sections.push(extractErrorContext(file.content, file.errors));
  sections.push("```");
  sections.push("");

  sections.push("## Output Format");
  sections.push("Return JSON with fix instructions:");
  sections.push("```json");
  sections.push(
    JSON.stringify(
      {
        fixes: [
          { line: 45, action: "replace", content: "const x: number = 1;" },
          { line: 12, action: "insert_before", content: "import { Type } from './types';" },
        ],
      },
      null,
      2
    )
  );
  sections.push("```");
  sections.push("");

  sections.push("## TypeScript Fix Hints");
  sections.push("- TS2304 (cannot find name): Add import");
  sections.push("- TS2339 (property doesn't exist): Add to interface or use `as Type`");
  sections.push("- TS2345 (argument type): Add type assertion");
  sections.push("- TS2322 (type not assignable): Fix type or add assertion");
  sections.push("- TS18046/18048 (unknown/undefined): Add `as Type` or optional chaining");
  sections.push("");

  sections.push("IMPORTANT: Return ONLY the JSON object. No explanation text.");

  return sections.join("\n");
}

/**
 * Fix a single file
 */
async function fixFile(
  file: FileErrors,
  apiKey: string
): Promise<{ success: boolean; fixed: number; failed: number }> {
  try {
    const prompt = buildPrompt(file);
    const response = await callCerebras(prompt, {
      apiKey,
      maxTokens: CONFIG.maxTokens,
    });

    const fixes = parseFixes(response.content);
    if (fixes.length === 0) {
      console.log(`  ⚠ No valid fixes for ${file.filePath}`);
      return { success: false, fixed: 0, failed: file.errors.length };
    }

    const result = applyFixes(file.content, fixes, "typescript");

    if (!result.syntaxValid) {
      console.log(`  ⚠ Syntax error after fixes, skipping ${file.filePath}`);
      return { success: false, fixed: 0, failed: file.errors.length };
    }

    if (result.fixesApplied > 0) {
      writeFileSync(file.filePath, result.content);
      console.log(
        `  ✓ ${file.filePath}: ${result.fixesApplied} fixes applied`
      );
    }

    return {
      success: result.success,
      fixed: result.fixesApplied,
      failed: result.fixesFailed.length,
    };
  } catch (error) {
    console.error(`  ✗ ${file.filePath}: ${(error as Error).message}`);
    return { success: false, fixed: 0, failed: file.errors.length };
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const projectDir = args[0] || ".";
  const maxFiles = parseInt(args[1]) || Infinity;

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    console.error("Error: CEREBRAS_API_KEY environment variable required");
    process.exit(1);
  }

  console.log(`🔍 Parsing TypeScript errors in ${projectDir}...`);
  const errorsByFile = parseTypeScriptErrors(projectDir);

  if (errorsByFile.size === 0) {
    console.log("✨ No TypeScript errors found!");
    return;
  }

  const totalErrors = Array.from(errorsByFile.values()).reduce(
    (sum, errs) => sum + errs.length,
    0
  );
  console.log(`Found ${totalErrors} errors in ${errorsByFile.size} files\n`);

  // Prepare file data
  const files: FileErrors[] = [];
  for (const [filePath, errors] of errorsByFile) {
    if (files.length >= maxFiles) break;
    if (!existsSync(filePath)) continue;

    files.push({
      filePath,
      errors,
      content: readFileSync(filePath, "utf-8"),
    });
  }

  console.log(`🚀 Fixing ${files.length} files in parallel...\n`);

  // Process all files in parallel
  const startTime = Date.now();
  const results = await Promise.all(files.map((file) => fixFile(file, apiKey)));

  const totalFixed = results.reduce((sum, r) => sum + r.fixed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Complete in ${duration}s`);
  console.log(`   Fixed: ${totalFixed}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`\nRun again to fix cascading errors.`);
}

main().catch(console.error);
