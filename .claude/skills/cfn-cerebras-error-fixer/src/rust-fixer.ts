#!/usr/bin/env npx tsx
/**
 * Rust Parallel Error Fixer
 *
 * Parses cargo check output and fixes errors in parallel using Cerebras.
 * Uses diff mode for token efficiency.
 *
 * Usage: npx tsx rust-fixer.ts <project-dir> [max-files]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { callCerebras } from "./cerebras-client.js";
import { applyFixes, parseFixes, type FixInstruction } from "./diff-applier.js";

interface RustError {
  code: string;
  line: number;
  column: number;
  message: string;
  filePath: string;
  suggestion?: string;
}

interface FileErrors {
  filePath: string;
  errors: RustError[];
  content: string;
}

// Configuration
const CONFIG = {
  maxErrorsPerFile: 3, // Rust errors are more complex
  contextLines: 15,    // More context for Rust
  maxTokens: 4096,
};

/**
 * Parse Rust errors from cargo check output
 */
function parseRustErrors(projectDir: string): Map<string, RustError[]> {
  let output: string;
  try {
    // Use SQLX_OFFLINE=true to avoid DB connection issues
    execSync(`cd "${projectDir}" && SQLX_OFFLINE=true cargo check 2>&1`, {
      encoding: "utf-8",
    });
    return new Map(); // No errors
  } catch (error: any) {
    output = error.stdout || error.stderr || error.message;
  }

  const errorsByFile = new Map<string, RustError[]>();

  // Parse error lines: error[E0599]: no method named `foo` found
  // --> src/file.rs:45:10
  const errorRegex =
    /error\[(\w+)\]: (.+?)(?:\n.*?)?--> (.+?):(\d+):(\d+)/gs;

  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const [, code, message, filePath, line, column] = match;
    const normalizedPath = filePath.replace(/\\/g, "/");

    // Skip errors outside project
    if (normalizedPath.includes("/rustc/") || normalizedPath.includes(".cargo/")) {
      continue;
    }

    if (!errorsByFile.has(normalizedPath)) {
      errorsByFile.set(normalizedPath, []);
    }

    // Extract suggestion if present
    const suggestionMatch = output.slice(match.index).match(/help: (.+?)(?:\n|$)/);

    errorsByFile.get(normalizedPath)!.push({
      code,
      message: message.trim(),
      filePath: normalizedPath,
      line: parseInt(line),
      column: parseInt(column),
      suggestion: suggestionMatch ? suggestionMatch[1] : undefined,
    });
  }

  return errorsByFile;
}

/**
 * Extract context around errors
 */
function extractErrorContext(content: string, errors: RustError[]): string {
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

  sections.push("You are an expert Rust developer fixing compilation errors.");
  sections.push("Return ONLY a JSON object with fix instructions.");
  sections.push("");

  sections.push(`## File: \`${file.filePath}\``);
  sections.push("");

  sections.push("## Errors to Fix");
  for (const error of file.errors.slice(0, CONFIG.maxErrorsPerFile)) {
    sections.push(`- **Line ${error.line}** [${error.code}]: ${error.message}`);
    if (error.suggestion) {
      sections.push(`  Suggestion: ${error.suggestion}`);
    }
  }
  sections.push("");

  sections.push("## Code Context");
  sections.push("```rust");
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
          { line: 45, action: "replace", content: "    let x: i32 = 1;" },
          { line: 12, action: "insert_before", content: "use std::collections::HashMap;" },
        ],
      },
      null,
      2
    )
  );
  sections.push("```");
  sections.push("");

  sections.push("## Rust Fix Hints");
  sections.push("- E0599 (method not found): Add impl block or use correct trait method");
  sections.push("- E0560 (struct field missing): Add the missing field to struct");
  sections.push("- E0308 (type mismatch): Fix type or add conversion (.into(), as Type)");
  sections.push("- E0277 (trait not implemented): Add impl block or derive macro");
  sections.push("- E0382 (moved value): Use .clone(), &reference, or restructure");
  sections.push("- E0425 (not found): Add use statement or fix typo");
  sections.push("");

  sections.push("IMPORTANT: Return ONLY the JSON object. No explanation text.");
  sections.push("Preserve exact indentation from the original code.");

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

    const result = applyFixes(file.content, fixes, "rust");

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

  console.log(`🔍 Parsing Rust errors in ${projectDir}...`);
  const errorsByFile = parseRustErrors(projectDir);

  if (errorsByFile.size === 0) {
    console.log("✨ No Rust errors found!");
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
