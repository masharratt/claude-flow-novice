#!/usr/bin/env npx tsx
/**
 * Single File Error Fixer
 *
 * Fix compilation errors in a single file.
 * Can be integrated with MCP tools or CLI.
 *
 * Usage: npx tsx single-file-fixer.ts <file-path> [error-json]
 *
 * Error JSON format:
 * '[{"code":"E0599","line":45,"message":"method not found"}]'
 */

import { readFileSync, writeFileSync } from "fs";
import { callCerebras } from "./cerebras-client.js";
import { applyFixes, parseFixes } from "./diff-applier.js";

interface CompilerError {
  code: string;
  line: number;
  message: string;
  suggestion?: string;
}

const CONFIG = {
  contextLines: 15,
  maxTokens: 4096,
};

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): "typescript" | "rust" {
  if (filePath.endsWith(".rs")) return "rust";
  return "typescript";
}

/**
 * Extract context around errors
 */
function extractErrorContext(content: string, errors: CompilerError[]): string {
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
 * Build prompt for single file
 */
function buildPrompt(
  filePath: string,
  content: string,
  errors: CompilerError[],
  language: "typescript" | "rust"
): string {
  const sections: string[] = [];

  sections.push(
    `You are an expert ${language === "rust" ? "Rust" : "TypeScript"} developer fixing compilation errors.`
  );
  sections.push("Return ONLY a JSON object with fix instructions.");
  sections.push("");

  sections.push(`## File: \`${filePath}\``);
  sections.push("");

  sections.push("## Errors to Fix");
  for (const error of errors) {
    sections.push(`- **Line ${error.line}** [${error.code}]: ${error.message}`);
    if (error.suggestion) {
      sections.push(`  Suggestion: ${error.suggestion}`);
    }
  }
  sections.push("");

  sections.push("## Code Context");
  sections.push("```" + language);
  sections.push(extractErrorContext(content, errors));
  sections.push("```");
  sections.push("");

  sections.push("## Output Format");
  sections.push("Return JSON with fix instructions:");
  sections.push("```json");
  sections.push(
    JSON.stringify(
      {
        fixes: [
          { line: 45, action: "replace", content: "fixed line content" },
          { line: 12, action: "insert_before", content: "import statement" },
        ],
      },
      null,
      2
    )
  );
  sections.push("```");
  sections.push("");

  sections.push("IMPORTANT: Return ONLY the JSON object. No explanation text.");
  sections.push("Preserve exact indentation from the original code.");

  return sections.join("\n");
}

/**
 * Fix a single file
 */
export async function fixSingleFile(
  filePath: string,
  errors: CompilerError[],
  apiKey: string
): Promise<{
  success: boolean;
  content: string;
  fixesApplied: number;
  error?: string;
}> {
  const language = detectLanguage(filePath);
  const content = readFileSync(filePath, "utf-8");

  try {
    const prompt = buildPrompt(filePath, content, errors, language);
    const response = await callCerebras(prompt, {
      apiKey,
      maxTokens: CONFIG.maxTokens,
    });

    const fixes = parseFixes(response.content);
    if (fixes.length === 0) {
      return {
        success: false,
        content,
        fixesApplied: 0,
        error: "No valid fixes in LLM response",
      };
    }

    const result = applyFixes(content, fixes, language);

    if (!result.syntaxValid) {
      return {
        success: false,
        content,
        fixesApplied: 0,
        error: "Syntax validation failed after applying fixes",
      };
    }

    return {
      success: true,
      content: result.content,
      fixesApplied: result.fixesApplied,
    };
  } catch (error) {
    return {
      success: false,
      content,
      fixesApplied: 0,
      error: (error as Error).message,
    };
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: npx tsx single-file-fixer.ts <file-path> [error-json]");
    console.log("");
    console.log("Examples:");
    console.log('  npx tsx single-file-fixer.ts src/foo.ts \'[{"code":"TS2304","line":10,"message":"Cannot find name"}]\'');
    console.log('  npx tsx single-file-fixer.ts src/bar.rs \'[{"code":"E0599","line":45,"message":"method not found"}]\'');
    process.exit(1);
  }

  const filePath = args[0];
  let errors: CompilerError[];

  if (args[1]) {
    try {
      errors = JSON.parse(args[1]);
    } catch {
      console.error("Invalid error JSON");
      process.exit(1);
    }
  } else {
    // If no errors provided, prompt for them
    console.log("No errors provided. Please provide error JSON as second argument.");
    process.exit(1);
  }

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    console.error("Error: CEREBRAS_API_KEY environment variable required");
    process.exit(1);
  }

  console.log(`🔧 Fixing ${filePath} (${errors.length} errors)...`);

  const result = await fixSingleFile(filePath, errors, apiKey);

  if (result.success) {
    writeFileSync(filePath, result.content);
    console.log(`✓ Fixed: ${result.fixesApplied} changes applied`);
  } else {
    console.error(`✗ Failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch(console.error);
