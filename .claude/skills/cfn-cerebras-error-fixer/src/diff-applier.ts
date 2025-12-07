/**
 * Diff Applier
 *
 * Deterministic function to apply fix instructions to file content.
 * No LLM involved - pure code transformation with validation.
 */

export interface FixInstruction {
  line: number;
  action: "replace" | "insert_before" | "insert_after" | "delete";
  content?: string;
  endLine?: number;
}

export interface ApplyResult {
  success: boolean;
  content: string;
  fixesApplied: number;
  fixesFailed: Array<{ fix: FixInstruction; reason: string }>;
  syntaxValid: boolean;
}

/**
 * Validate bracket/brace/paren balance
 */
function validateSyntax(content: string, language: "typescript" | "rust"): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const opens = new Set(Object.keys(pairs));
  const closes = new Set(Object.values(pairs));

  // Simple state tracking to skip strings/comments
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    const prev = content[i - 1];

    // Handle newlines
    if (char === "\n") {
      inLineComment = false;
      continue;
    }

    // Skip line comments
    if (!inString && !inBlockComment && char === "/" && next === "/") {
      inLineComment = true;
      continue;
    }
    if (inLineComment) continue;

    // Skip block comments
    if (!inString && char === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (inBlockComment && char === "*" && next === "/") {
      inBlockComment = false;
      i++;
      continue;
    }
    if (inBlockComment) continue;

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prev !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inString) continue;

    // Track brackets
    if (opens.has(char)) {
      stack.push(pairs[char]);
    } else if (closes.has(char)) {
      if (stack.length === 0 || stack.pop() !== char) {
        return false;
      }
    }
  }

  return stack.length === 0;
}

/**
 * Apply fix instructions to content
 */
export function applyFixes(
  content: string,
  fixes: FixInstruction[],
  language: "typescript" | "rust" = "typescript"
): ApplyResult {
  const lines = content.split("\n");
  const failedFixes: Array<{ fix: FixInstruction; reason: string }> = [];
  let fixesApplied = 0;

  // Sort fixes in reverse line order to preserve indices
  const sortedFixes = [...fixes].sort((a, b) => {
    if (b.line !== a.line) return b.line - a.line;
    const priority = { delete: 3, replace: 2, insert_after: 1, insert_before: 0 };
    return priority[b.action] - priority[a.action];
  });

  for (const fix of sortedFixes) {
    const lineIndex = fix.line - 1;

    // Validate line number
    if (lineIndex < 0 || lineIndex >= lines.length) {
      failedFixes.push({
        fix,
        reason: `Line ${fix.line} out of range (file has ${lines.length} lines)`,
      });
      continue;
    }

    try {
      switch (fix.action) {
        case "replace": {
          if (fix.content === undefined) {
            failedFixes.push({ fix, reason: "Replace requires content" });
            continue;
          }
          const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
          const deleteCount = endLine - lineIndex + 1;
          const newLines = fix.content.split("\n");
          lines.splice(lineIndex, deleteCount, ...newLines);
          fixesApplied++;
          break;
        }

        case "insert_before": {
          if (fix.content === undefined) {
            failedFixes.push({ fix, reason: "Insert requires content" });
            continue;
          }
          const newLines = fix.content.split("\n");
          lines.splice(lineIndex, 0, ...newLines);
          fixesApplied++;
          break;
        }

        case "insert_after": {
          if (fix.content === undefined) {
            failedFixes.push({ fix, reason: "Insert requires content" });
            continue;
          }
          const newLines = fix.content.split("\n");
          lines.splice(lineIndex + 1, 0, ...newLines);
          fixesApplied++;
          break;
        }

        case "delete": {
          const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
          const deleteCount = endLine - lineIndex + 1;
          lines.splice(lineIndex, deleteCount);
          fixesApplied++;
          break;
        }

        default:
          failedFixes.push({ fix, reason: `Unknown action: ${fix.action}` });
      }
    } catch (err) {
      failedFixes.push({ fix, reason: `Exception: ${(err as Error).message}` });
    }
  }

  const newContent = lines.join("\n");
  const syntaxValid = validateSyntax(newContent, language);

  return {
    success: failedFixes.length === 0 && syntaxValid,
    content: newContent,
    fixesApplied,
    fixesFailed: failedFixes,
    syntaxValid,
  };
}

/**
 * Parse fix instructions from LLM JSON response
 */
export function parseFixes(jsonContent: string): FixInstruction[] {
  try {
    // Handle wrapped JSON
    let content = jsonContent.trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(content);

    // Handle { fixes: [...] } or direct array
    const fixes = Array.isArray(parsed) ? parsed : parsed.fixes;

    if (!Array.isArray(fixes)) {
      console.error("No fixes array found in response");
      return [];
    }

    // Validate and filter
    return fixes.filter((fix: any) => {
      if (typeof fix.line !== "number" || fix.line < 1) return false;
      if (!["replace", "insert_before", "insert_after", "delete"].includes(fix.action)) return false;
      if (fix.action !== "delete" && fix.content === undefined) return false;
      return true;
    });
  } catch (err) {
    console.error("Failed to parse fixes JSON:", (err as Error).message);
    return [];
  }
}
