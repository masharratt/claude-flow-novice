/**
 * TypeScript-specific validation gates for error fixing
 * Adapted from Rust gates with TypeScript-specific logic
 */

export interface GateResult {
  passed: boolean;
  reason?: string;
  riskLevel: 1 | 2 | 3 | 4 | 5;
}

/**
 * Security validation gate for file paths
 * Ensures all file operations stay within project boundaries
 */
export function gateFilePathSecurity(filePath: string, projectRoot: string): GateResult {
  // Normalize paths
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const normalizedRoot = projectRoot.replace(/\\/g, '/');

  // Check for path traversal attempts
  if (normalizedFilePath.includes('../') && !normalizedFilePath.startsWith(normalizedRoot)) {
    return {
      passed: false,
      reason: 'Path traversal detected',
      riskLevel: 5
    };
  }

  // Check for absolute paths that don't match project root
  if (filePath.startsWith('/') && !filePath.startsWith(normalizedRoot)) {
    return {
      passed: false,
      reason: 'Absolute path outside project directory',
      riskLevel: 5
    };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Security validation gate for import statements
 * Prevents loading code from suspicious locations
 */
export function gateImportSecurity(content: string): GateResult {
  // Check for imports from suspicious protocols
  const suspiciousImports = [
    /import\s+.*from\s+['"]https?:\/\//,
    /import\s+.*from\s+['"]ftp:\/\//,
    /import\s+.*from\s+['"]file:\/\/\//,
    /import\s+.*from\s+['"]javascript:/,
    /import\s+.*from\s+['"]data:/
  ];

  for (const pattern of suspiciousImports) {
    if (pattern.test(content)) {
      return {
        passed: false,
        reason: 'Suspicious import protocol detected',
        riskLevel: 5
      };
    }
  }

  // Check for dynamic require calls with suspicious content
  const dangerousRequire = /require\s*\(\s*[^'"]\w+/;
  if (dangerousRequire.test(content)) {
    return {
      passed: false,
      reason: 'Dynamic require with variable detected',
      riskLevel: 4
    };
  }

  // Check for eval usage
  if (/\beval\s*\(/.test(content)) {
    return {
      passed: false,
      reason: 'eval() usage detected',
      riskLevel: 5
    };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate A: Line Count Delta Check
 * Rejects fixes that change too many lines for the error type
 */
export function gateLineCountDelta(before: string, after: string, errorCode: string): GateResult {
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  const delta = Math.abs(afterLines - beforeLines);

  // Different error types have different expected fix sizes
  const expectedDeltas: Record<string, number> = {
    'TS2307': 1,      // Cannot find module
    'TS2304': 1,      // Cannot find name
    'TS2339': 1,      // Property does not exist
    'TS2322': 2,      // Type mismatch
    'TS7005': 2,      // Type mismatch (variable)
    'TS2769': 2,      // No overload matches
    'TS2554': 2,      // Expected arguments
    'TS2416': 1,      // Property in type incompatible
    'TS2345': 1,      // Argument of type X is not assignable
  };

  const maxDelta = expectedDeltas[errorCode] || 3;

  if (delta > maxDelta) {
    return {
      passed: false,
      reason: `Line count changed by ${delta} lines (max: ${maxDelta}) for ${errorCode}`,
      riskLevel: 4
    };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate B: Method/Function Signature Check
 * Validates that function signatures aren't destructively changed
 */
export function gateMethodSignature(before: string, after: string): GateResult {
  // Extract function/method declarations
  const funcRegex = /(?:function\s+(\w+)|(\w+)\s*(?:\(|:)|const\s+(\w+)\s*=\s*(?:\(|async|function))/g;

  const beforeFuncs: Array<{name: string, sig: string}> = [];
  const afterFuncs: Array<{name: string, sig: string}> = [];

  let match;
  while ((match = funcRegex.exec(before)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name) {
      const funcStart = match.index;
      const funcEnd = before.indexOf('{', funcStart);
      if (funcEnd !== -1) {
        beforeFuncs.push({
          name,
          sig: before.substring(funcStart, funcEnd).trim()
        });
      }
    }
  }

  funcRegex.lastIndex = 0;
  while ((match = funcRegex.exec(after)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name) {
      const funcStart = match.index;
      const funcEnd = after.indexOf('{', funcStart);
      if (funcEnd !== -1) {
        afterFuncs.push({
          name,
          sig: after.substring(funcStart, funcEnd).trim()
        });
      }
    }
  }

  // Check for signature changes
  for (const beforeFunc of beforeFuncs) {
    const afterFunc = afterFuncs.find(f => f.name === beforeFunc.name);
    if (afterFunc) {
      // Check for parameter count changes
      const beforeParams = (beforeFunc.sig.match(/\(/g) || []).length;
      const afterParams = (afterFunc.sig.match(/\(/g) || []).length;

      if (Math.abs(beforeParams - afterParams) > 1) {
        return {
          passed: false,
          reason: `Function ${beforeFunc.name} signature changed significantly`,
          riskLevel: 5
        };
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate C: Import Duplicate Check
 * Prevents duplicate imports
 */
export function gateImportDuplicate(content: string): GateResult {
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"][^'"]+['"]/g;
  const imports: string[] = [];
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const normalized = match[0].replace(/\s+/g, ' ').trim();
    if (imports.includes(normalized)) {
      return {
        passed: false,
        reason: `Duplicate import: ${normalized}`,
        riskLevel: 3
      };
    }
    imports.push(normalized);
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate D: Brace Balance Check
 * Ensures braces remain balanced
 */
export function gateBraceBalance(content: string): GateResult {
  let balance = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    // Handle string literals
    if ((char === '"' || char === "'" || char === '`') && !inString) {
      inString = true;
      stringChar = char;
    } else if (char === stringChar && inString && content[i-1] !== '\\') {
      inString = false;
      stringChar = '';
    }

    if (!inString) {
      if (char === '{') balance++;
      else if (char === '}') balance--;

      if (balance < 0) {
        return {
          passed: false,
          reason: 'Unbalanced braces: too many closing braces',
          riskLevel: 5
        };
      }
    }
  }

  if (balance !== 0) {
    return {
      passed: false,
      reason: `Unbalanced braces: ${balance} unclosed opening braces`,
      riskLevel: 5
    };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate E: Semantic Difference Check
 * Prevents changing variable names, types, or logic
 */
export function gateSemanticDiff(before: string, after: string): GateResult {
  // Extract variable declarations
  const varRegex = /\b(?:const|let|var)\s+(\w+)/g;
  const beforeVars = new Set<string>();
  const afterVars = new Set<string>();

  let match;
  while ((match = varRegex.exec(before)) !== null) {
    beforeVars.add(match[1]);
  }

  varRegex.lastIndex = 0;
  while ((match = varRegex.exec(after)) !== null) {
    afterVars.add(match[1]);
  }

  // Check for removed variables (high risk)
  for (const varName of Array.from(beforeVars)) {
    if (!afterVars.has(varName) && !/^[A-Z_]+$/.test(varName)) {
      return {
        passed: false,
        reason: `Variable ${varName} was removed`,
        riskLevel: 4
      };
    }
  }

  // Check for async/await changes
  const beforeAsync = (before.match(/\basync\s+/g) || []).length;
  const afterAsync = (after.match(/\basync\s+/g) || []).length;

  if (Math.abs(beforeAsync - afterAsync) > 2) {
    return {
      passed: false,
      reason: 'Too many async/await changes',
      riskLevel: 3
    };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate F: Orphaned Code Check
 * Detects dangling statements without proper context
 */
export function gateOrphanedCode(content: string): GateResult {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('*')) continue;

    // Check for statements that should be in blocks
    if (/^(if|for|while|function|class|interface|type|enum)\b/.test(line)) {
      // Should have opening brace or be on one line
      const nextLine = lines[i + 1]?.trim() || '';
      if (!line.includes('{') && !nextLine.startsWith('{') && !line.includes(';')) {
        return {
          passed: false,
          reason: `Orphaned control statement: ${line.substring(0, 30)}...`,
          riskLevel: 3
        };
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * TypeScript-specific Gate G: Import Path Validator
 * Ensures import paths are valid and consistent
 */
export function gateImportPathValidator(content: string): GateResult {
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Check for obviously invalid paths
    if (importPath.startsWith('//') || importPath.startsWith('http')) {
      return {
        passed: false,
        reason: `Invalid import path: ${importPath}`,
        riskLevel: 5
      };
    }

    // Check for relative path issues
    if (importPath.startsWith('../')) {
      const depth = (importPath.match(/\.\.\//g) || []).length;
      if (depth > 5) {
        return {
          passed: false,
          reason: `Import path too deep: ${importPath}`,
          riskLevel: 3
        };
      }
    }

    // Check for mixed slashes
    if (importPath.includes('\\') && importPath.includes('/')) {
      return {
        passed: false,
        reason: `Mixed path separators in: ${importPath}`,
        riskLevel: 2
      };
    }

    // Check for suspicious file extensions
    const suspiciousExts = ['.exe', '.bat', '.cmd', '.sh', '.js', '.mjs'];
    const ext = importPath.split('.').pop()?.toLowerCase();
    if (ext && suspiciousExts.includes(`.${ext}`)) {
      return {
        passed: false,
        reason: `Suspicious file extension in import: ${importPath}`,
        riskLevel: 4
      };
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * TypeScript-specific Gate H: Type Annotation Validator
 * Ensures type annotations are syntactically valid
 */
export function gateTypeAnnotationValidator(content: string): GateResult {
  // Find all type annotations
  const typeRegex = /:\s*([^=;)\n]+)(?=\s*[=;)\n])/g;
  let match;

  while ((match = typeRegex.exec(content)) !== null) {
    const typeAnnotation = match[1].trim();

    // Basic syntax checks
    if (typeAnnotation.includes('...') && !typeAnnotation.includes('[]')) {
      return {
        passed: false,
        reason: `Invalid type annotation: ${typeAnnotation}`,
        riskLevel: 4
      };
    }

    // Check for unclosed generics
    const openAngle = (typeAnnotation.match(/</g) || []).length;
    const closeAngle = (typeAnnotation.match(/>/g) || []).length;

    if (openAngle !== closeAngle) {
      return {
        passed: false,
        reason: `Unbalanced generic types in: ${typeAnnotation}`,
        riskLevel: 5
      };
    }

    // Check for invalid union/intersection without parentheses
    if (typeAnnotation.includes('|') || typeAnnotation.includes('&')) {
      const parts = typeAnnotation.split(/([|&])/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && trimmed !== '|' && trimmed !== '&' &&
            !/^[A-Za-z0-9_<>\[\]{}|&$,?.]+$/.test(trimmed)) {
          return {
            passed: false,
            reason: `Invalid type in union/intersection: ${trimmed}`,
            riskLevel: 4
          };
        }
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * TypeScript-specific Gate I: JSX Integrity Check
 * Validates JSX syntax and structure
 */
export function gateJSXIntegrity(content: string): GateResult {
  // Skip if no JSX
  if (!content.includes('<') || !content.includes('/>')) {
    return { passed: true, riskLevel: 1 };
  }

  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    // Handle JSX expressions
    if (char === '{' && content[i-1] === '<' && content[i-2] !== '/') {
      // This is a prop expression
      let exprDepth = 1;
      let j = i + 1;
      while (j < content.length && exprDepth > 0) {
        if (content[j] === '{') exprDepth++;
        else if (content[j] === '}') exprDepth--;
        j++;
      }
      i = j - 1;
      continue;
    }

    // Handle string literals
    if ((char === '"' || char === "'") && !inString) {
      inString = true;
      stringChar = char;
    } else if (char === stringChar && inString && content[i-1] !== '\\') {
      inString = false;
      stringChar = '';
      continue;
    }

    if (!inString) {
      if (content.startsWith('<', i) && !content.startsWith('<!--', i) && !content.startsWith('</', i)) {
        // Opening tag
        if (content[i + 1] !== '/' && content[i + 1] !== '!' && content[i + 1] !== '?') {
          depth++;
        }
      } else if (content.startsWith('</', i) || content.startsWith('/>', i)) {
        // Closing tag
        depth--;
      }

      if (depth < 0) {
        return {
          passed: false,
          reason: 'Unbalanced JSX tags',
          riskLevel: 5
        };
      }
    }
  }

  if (depth !== 0) {
    return {
      passed: false,
      reason: `Unclosed JSX tags (${depth} unclosed)`,
      riskLevel: 5
    };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate J: Pattern Duplicate Check
 * Prevents duplicate object patterns or type definitions
 */
export function gatePatternDuplicate(content: string): GateResult {
  // Check for duplicate interface definitions
  const interfaceRegex = /interface\s+(\w+)/g;
  const interfaces = new Set<string>();
  let match;

  while ((match = interfaceRegex.exec(content)) !== null) {
    const name = match[1];
    if (interfaces.has(name)) {
      return {
        passed: false,
        reason: `Duplicate interface definition: ${name}`,
        riskLevel: 4
      };
    }
    interfaces.add(name);
  }

  // Check for duplicate type definitions
  const typeRegex = /type\s+(\w+)\s*=/g;
  const types = new Set<string>();

  while ((match = typeRegex.exec(content)) !== null) {
    const name = match[1];
    if (types.has(name)) {
      return {
        passed: false,
        reason: `Duplicate type definition: ${name}`,
        riskLevel: 4
      };
    }
    types.add(name);
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate K: Import Location Check
 * Ensures imports are at the top of the file
 */
export function gateImportLocation(content: string): GateResult {
  const lines = content.split('\n');
  let foundNonImport = false;
  let nonImportLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      continue;
    }

    // Check if this is an import or other top-level statement
    if (!line.startsWith('import ') && !line.startsWith('export ') &&
        !line.startsWith('declare ') && !line.startsWith('namespace ')) {
      if (!foundNonImport) {
        foundNonImport = true;
        nonImportLine = i;
      }
    } else if (foundNonImport && (line.startsWith('import ') || line.startsWith('export '))) {
      // Found import after non-import statement
      return {
        passed: false,
        reason: `Import statement at line ${i + 1} appears after code at line ${nonImportLine + 1}`,
        riskLevel: 2
      };
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate L: Type Cast Check
 * Validates type casts (as assertions)
 */
export function gateTypeCast(before: string, after: string): GateResult {
  // Count type assertions
  const beforeAs = (before.match(/\bas\s+/g) || []).length;
  const afterAs = (after.match(/\bas\s+/g) || []).length;

  const delta = afterAs - beforeAs;

  // Too many new type assertions might be risky
  if (delta > 5) {
    return {
      passed: false,
      reason: `Added ${delta} type assertions (may indicate incorrect types)`,
      riskLevel: 3
    };
  }

  // Check for dangerous type assertions
  const dangerousPattern = /\bas\s+(any|unknown)\s*(?:\(|$)/;
  if (dangerousPattern.test(after) && !dangerousPattern.test(before)) {
    return {
      passed: false,
      reason: 'Added dangerous type assertion (any/unknown)',
      riskLevel: 4
    };
  }

  // Check for non-null assertions
  const beforeNonNull = (before.match(/!/g) || []).length;
  const afterNonNull = (after.match(/!/g) || []).length;

  if (afterNonNull - beforeNonNull > 3) {
    return {
      passed: false,
      reason: `Added ${afterNonNull - beforeNonNull} non-null assertions`,
      riskLevel: 3
    };
  }

  return { passed: true, riskLevel: 1 };
}

// Regression seed patterns for TypeScript
export const TYPESCRIPT_REGRESSION_SEEDS = [
  {
    pattern: /import\s+.*\s+from\s+['"]react['"];/,
    antiPattern: /import\s+React\s+from\s+['"]react['"];/,
    name: 'React import default vs named',
    description: 'Changed between default and named React import'
  },
  {
    pattern: /\.map\(/,
    antiPattern: /forEach\(.*\.map\(/,
    name: 'map in forEach',
    description: 'Using map inside forEach without using result'
  },
  {
    pattern: /async\s+\w+\([^)]*\)\s*:\s*\w+/,
    antiPattern: /async\s+\w+\([^)]*\)\s*(?!:)/,
    name: 'async function missing return type',
    description: 'Removed return type annotation from async function'
  },
  {
    pattern: /interface\s+\w+\s+extends\s+\w+/,
    antiPattern: /type\s+\w+\s*=\s*\w+&/,
    name: 'interface vs type with extends',
    description: 'Changed interface extends to type intersection'
  },
  {
    pattern: /<(\w+.*?)>/,
    antiPattern: /React\.createElement/,
    name: 'JSX vs createElement',
    description: 'Changed JSX syntax to createElement calls'
  }
];

/**
 * Gate M: Regression Seed Check
 * Validates that the fix doesn't introduce known-bad patterns
 */
export function gateRegressionSeeds(before: string, after: string): GateResult {
  for (const seed of TYPESCRIPT_REGRESSION_SEEDS) {
    const beforeHas = seed.pattern.test(before);
    const afterHas = seed.pattern.test(after);

    // Pattern introduced by fix
    if (!beforeHas && afterHas) {
      return {
        passed: false,
        reason: `Regression: ${seed.name} - ${seed.description}`,
        riskLevel: 5
      };
    }

    // Check anti-pattern
    if (seed.antiPattern) {
      const beforeAnti = seed.antiPattern.test(before);
      const afterAnti = seed.antiPattern.test(after);

      if (beforeAnti && !afterAnti && afterHas) {
        return {
          passed: false,
          reason: `Regression: ${seed.name} - swapped pattern`,
          riskLevel: 5
        };
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}