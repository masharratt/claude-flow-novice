#!/usr/bin/env node
/**
 * File Metadata Parser for RuVector Codebase Index
 *
 * Extracts structured metadata from code files using AST parsing:
 * - File purpose (from comments/docstrings)
 * - Exports (functions, classes, types, variables)
 * - Imports/dependencies
 * - Code metrics (lines, complexity estimate)
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Parse TypeScript/JavaScript file
 * @param {string} filePath - Path to file
 * @param {string} content - File content
 * @returns {object} - Parsed metadata
 */
function parseTypeScript(filePath, content) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const metadata = {
    exports: [],
    dependencies: [],
    purpose: extractPurpose(content),
    lines: content.split('\n').length,
    complexity: estimateComplexity(content),
  };

  // Extract exports
  ts.forEachChild(sourceFile, node => {
    if (ts.isExportDeclaration(node)) {
      // export { foo, bar }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach(element => {
          metadata.exports.push(element.name.text);
        });
      }
    } else if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      // export function foo() {}
      // export class Bar {}
      // export const baz = ...
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
        if (node.name) {
          metadata.exports.push(node.name.text);
        }
      } else if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name)) {
            metadata.exports.push(decl.name.text);
          }
        });
      }
    }
  });

  // Extract imports
  ts.forEachChild(sourceFile, node => {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        metadata.dependencies.push(moduleSpecifier.text);
      }
    }
  });

  return metadata;
}

/**
 * Parse Python file (basic regex-based extraction)
 * @param {string} content - File content
 * @returns {object} - Parsed metadata
 */
function parsePython(content) {
  const metadata = {
    exports: [],
    dependencies: [],
    purpose: extractPurpose(content),
    lines: content.split('\n').length,
    complexity: estimateComplexity(content),
  };

  // Extract function/class definitions
  const defRegex = /^(?:def|class)\s+(\w+)/gm;
  let match;
  while ((match = defRegex.exec(content)) !== null) {
    metadata.exports.push(match[1]);
  }

  // Extract imports
  const importRegex = /^(?:import|from)\s+([\w.]+)/gm;
  while ((match = importRegex.exec(content)) !== null) {
    metadata.dependencies.push(match[1]);
  }

  return metadata;
}

/**
 * Parse generic file (fallback for unknown types)
 * @param {string} content - File content
 * @returns {object} - Basic metadata
 */
function parseGeneric(content) {
  return {
    exports: [],
    dependencies: [],
    purpose: extractPurpose(content),
    lines: content.split('\n').length,
    complexity: 0,
  };
}

/**
 * Extract file purpose from leading comments/docstrings
 * @param {string} content - File content
 * @returns {string} - Extracted purpose or empty string
 */
function extractPurpose(content) {
  // Match block comments at start of file
  const blockCommentMatch = content.match(/^\/\*\*?\s*([\s\S]*?)\*\//);
  if (blockCommentMatch) {
    return blockCommentMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .join(' ')
      .slice(0, 200); // Limit to 200 chars
  }

  // Match line comments at start of file
  const lineCommentMatch = content.match(/^\/\/\s*(.+)/);
  if (lineCommentMatch) {
    return lineCommentMatch[1].trim().slice(0, 200);
  }

  // Match Python docstrings
  const docstringMatch = content.match(/^"""([\s\S]*?)"""/);
  if (docstringMatch) {
    return docstringMatch[1].trim().slice(0, 200);
  }

  return '';
}

/**
 * Estimate cyclomatic complexity (rough approximation)
 * @param {string} content - File content
 * @returns {number} - Complexity estimate
 */
function estimateComplexity(content) {
  const patterns = [
    /\bif\b/g,
    /\belse\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
  ];

  let complexity = 1; // Base complexity
  patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  });

  return complexity;
}

/**
 * Parse file and return metadata
 * @param {string} filePath - Path to file
 * @returns {object} - File metadata
 */
export function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);

  let metadata;
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    metadata = parseTypeScript(filePath, content);
  } else if (ext === '.py') {
    metadata = parsePython(content);
  } else {
    metadata = parseGeneric(content);
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    fileType: ext,
    ...metadata,
    createdAt: Date.now(),
    lastModified: fs.statSync(filePath).mtimeMs,
  };
}

/**
 * Create text representation for embedding
 * Combines file content with metadata for semantic search
 * @param {string} filePath - Path to file
 * @param {object} metadata - Parsed metadata
 * @returns {string} - Combined text for embedding
 */
export function createEmbeddingText(filePath, metadata) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Truncate content to prevent embedding size issues
  const truncatedContent = content.slice(0, 8000);

  return `${truncatedContent}\n\nPurpose: ${metadata.purpose}\n\nExports: ${metadata.exports.join(', ')}`;
}

/**
 * CLI interface
 */
async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: parser.js <file-path>');
    process.exit(1);
  }

  const metadata = parseFile(filePath);
  console.log(JSON.stringify(metadata, null, 2));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
