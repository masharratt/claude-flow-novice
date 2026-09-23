#!/usr/bin/env node
/**
 * CFN Dependency Ingestion - TypeScript Implementation
 * Dynamically discovers and ingests CFN Loop CLI dependency files
 *
 * Features:
 * - Dynamic file discovery from dependency diagram
 * - Content injection mode (--inject-content) for atomic context loading
 * - Token estimation with 25k safety limit
 * - Priority filtering (P0, P1, P2)
 * - Type filtering (TS, SH)
 * - File existence validation
 *
 * Usage:
 *   node ingest-dependencies.js [--inject-content] [--priority P0,P1] [--type TS,SH]
 *
 * Version: 2.0.0 (Enhancement #5: Content Injection Mode)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Types
type DiagramType = 'cli' | 'docker';

interface Options {
  injectContent: boolean;
  priorityFilter: string;
  typeFilter: string;
  includeDeprecated: boolean;
  skipValidation: boolean;
  diagram: DiagramType;
}

interface FileInfo {
  path: string;
  priority?: 'P0' | 'P1' | 'P2';
  type?: 'TS' | 'SH' | 'MD';
}

interface IngestionResult {
  files: string[];
  totalTokens: number;
  content?: string;
  exceeded25kLimit: boolean;
}

// Constants
const PROJECT_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
const DIAGRAMS: Record<DiagramType, string> = {
  cli: path.join(PROJECT_ROOT, 'readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt'),
  docker: path.join(PROJECT_ROOT, 'readme/CFN_LOOP_DOCKER_DEPENDENCY_DIAGRAM.txt'),
};
const TOKEN_LIMIT = 25000; // 25k token safety limit (for single-file mode)
const CHUNK_SIZE = 20000; // 20k tokens per chunk for multi-file mode
const CHARS_PER_TOKEN = 4; // Rough estimation
const TEMP_DIR = '/tmp/cfn-dependency-chunks'; // Temp directory for chunk files

// Global state for current diagram (set during parseArgs)
let DIAGRAM_PATH = DIAGRAMS.cli;

// Parse command-line arguments
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    injectContent: false,
    priorityFilter: '',
    typeFilter: '',
    includeDeprecated: false,
    skipValidation: false,
    diagram: 'cli',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--inject-content':
        options.injectContent = true;
        break;
      case '--priority':
        options.priorityFilter = args[++i] || '';
        break;
      case '--type':
        options.typeFilter = args[++i] || '';
        break;
      case '--include-deprecated':
        options.includeDeprecated = true;
        break;
      case '--skip-validation':
        options.skipValidation = true;
        break;
      case '--diagram':
        const diagramArg = args[++i] || 'cli';
        if (diagramArg !== 'cli' && diagramArg !== 'docker') {
          console.error(`Invalid diagram type: ${diagramArg}. Use 'cli' or 'docker'`);
          process.exit(1);
        }
        options.diagram = diagramArg as DiagramType;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  // Set global diagram path based on option
  DIAGRAM_PATH = DIAGRAMS[options.diagram];

  return options;
}

function printHelp(): void {
  console.log(`
CFN Dependency Ingestion - TypeScript Implementation

Usage:
  node ingest-dependencies.js [options]

Options:
  --diagram cli|docker     Select dependency diagram (default: cli)
  --inject-content         Inject file contents directly (default: output Read commands)
  --priority P0,P1,P2     Filter by priority levels (comma-separated)
  --type TS,SH            Filter by file type (TS=TypeScript, SH=Shell)
  --include-deprecated    Include deprecated files
  --skip-validation       Skip file existence validation
  --help, -h             Show this help message

Diagrams:
  cli    - CFN_LOOP_DEPENDENCY_DIAGRAM.txt (CLI mode execution flow)
  docker - CFN_LOOP_DOCKER_DEPENDENCY_DIAGRAM.txt (Docker mode execution flow)

Examples:
  # CLI mode dependencies (default)
  node ingest-dependencies.js --inject-content

  # Docker mode dependencies
  node ingest-dependencies.js --diagram docker --inject-content

  # P0 files only with content injection
  node ingest-dependencies.js --inject-content --priority P0

  # TypeScript files only
  node ingest-dependencies.js --type TS
`);
}

// Extract all file paths from the dependency diagram
function extractAllFiles(): string[] {
  const diagramContent = fs.readFileSync(DIAGRAM_PATH, 'utf-8');
  const filePattern = /\.(claude|src|tests)\/[^ ,)]+\.(md|ts|sh|js|cjs)/g;
  const matches = diagramContent.match(filePattern) || [];

  // Deduplicate and filter wildcards
  const uniqueFiles = [...new Set(matches)]
    .filter(file => !file.includes('*') && !file.includes('<'));

  return uniqueFiles;
}

// Validate file existence
function validateFileExistence(files: string[], skipValidation: boolean): string[] {
  if (skipValidation) {
    return files;
  }

  const validFiles: string[] = [];
  let missingCount = 0;

  for (const file of files) {
    // Handle both absolute and relative paths
    const fullPath = path.isAbsolute(file)
      ? file
      : path.join(PROJECT_ROOT, file);

    if (fs.existsSync(fullPath)) {
      validFiles.push(file);
    } else {
      console.error(`WARNING: File not found: ${file}`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    console.error(`WARNING: ${missingCount} file(s) not found (use --skip-validation to disable checks)`);
  }

  return validFiles;
}

// Filter by priority markers
function filterByPriority(files: string[], priorityFilter: string): string[] {
  if (!priorityFilter) {
    return files;
  }

  const diagramContent = fs.readFileSync(DIAGRAM_PATH, 'utf-8');
  const priorities = priorityFilter.split(',');

  return files.filter(file => {
    const filename = path.basename(file);
    return priorities.some(priority => {
      const pattern = new RegExp(`\\[${priority}\\].*${filename}`);
      return pattern.test(diagramContent);
    });
  });
}

// Filter by file type
function filterByType(files: string[], typeFilter: string): string[] {
  if (!typeFilter) {
    return files;
  }

  return files.filter(file => {
    const types = typeFilter.split(',');

    return types.some(type => {
      if (type === 'TS') {
        return /\.(ts|js|cjs)$/.test(file);
      } else if (type === 'SH') {
        return /\.sh$/.test(file);
      }
      return false;
    });
  });
}

// Filter deprecated files
function filterDeprecated(files: string[], includeDeprecated: boolean): string[] {
  if (includeDeprecated) {
    return files;
  }

  const diagramContent = fs.readFileSync(DIAGRAM_PATH, 'utf-8');

  return files.filter(file => {
    const filename = path.basename(file);
    const deprecatedPattern = new RegExp(`\\[DEPRECATED\\].*${filename}`);

    // Exclude if marked DEPRECATED
    if (deprecatedPattern.test(diagramContent)) {
      return false;
    }

    // Exclude helpers unless marked with priority
    if (file.includes('/helpers/')) {
      const priorityPattern = new RegExp(`\\[(P0|P1|P2)\\].*${filename}`);
      return priorityPattern.test(diagramContent);
    }

    return true;
  });
}

// Categorize files by priority
function categorizeByPriority(files: string[], diagramType: DiagramType): Record<string, string[]> {
  const diagramContent = fs.readFileSync(DIAGRAM_PATH, 'utf-8');
  const diagramFile = diagramType === 'docker'
    ? 'readme/CFN_LOOP_DOCKER_DEPENDENCY_DIAGRAM.txt'
    : 'readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt';

  const categories: Record<string, string[]> = {
    diagram: [diagramFile],
    P0: [],
    P1: [],
    P2: [],
    coordination: [],
    agents: [],
    commands: [],
  };

  for (const file of files) {
    const filename = path.basename(file);

    if (/\[P0\]/.test(diagramContent) && new RegExp(`\\[P0\\].*${filename}`).test(diagramContent)) {
      categories.P0.push(file);
    } else if (/\[P1\]/.test(diagramContent) && new RegExp(`\\[P1\\].*${filename}`).test(diagramContent)) {
      categories.P1.push(file);
    } else if (/\[P2\]/.test(diagramContent) && new RegExp(`\\[P2\\].*${filename}`).test(diagramContent)) {
      categories.P2.push(file);
    } else if (/coordination-wait|report-completion|orchestrate|cfn-redis/.test(file)) {
      categories.coordination.push(file);
    } else if (file.includes('.claude/agents/cfn-dev-team')) {
      categories.agents.push(file);
    } else if (file.includes('.claude/commands')) {
      categories.commands.push(file);
    }
  }

  return categories;
}

// Estimate token count
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Read file content with error handling
function readFileContent(filePath: string): string {
  try {
    // Handle both absolute and relative paths
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(PROJECT_ROOT, filePath);
    return fs.readFileSync(fullPath, 'utf-8');
  } catch (error) {
    return `[ERROR: Could not read file: ${error}]`;
  }
}

// Split content into chunks for parallel reading
function splitIntoChunks(files: string[]): { chunkFiles: string[], totalTokens: number } {
  // Ensure temp directory exists
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Clean old chunks
  const oldChunks = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith('chunk-'));
  oldChunks.forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));

  let currentChunk = '';
  let currentChunkTokens = 0;
  let chunkIndex = 1;
  const chunkFiles: string[] = [];
  let totalTokens = 0;

  for (const file of files) {
    const content = readFileContent(file);
    const fileBlock = `
${'='.repeat(80)}
FILE: ${file}
${'='.repeat(80)}

${content}

`;

    const blockTokens = estimateTokens(fileBlock);

    // If adding this file exceeds chunk size, write current chunk
    if (currentChunkTokens + blockTokens > CHUNK_SIZE && currentChunk.length > 0) {
      const chunkPath = path.join(TEMP_DIR, `chunk-${chunkIndex}.txt`);
      fs.writeFileSync(chunkPath, currentChunk, 'utf-8');
      chunkFiles.push(chunkPath);

      currentChunk = '';
      currentChunkTokens = 0;
      chunkIndex++;
    }

    currentChunk += fileBlock;
    currentChunkTokens += blockTokens;
    totalTokens += blockTokens;
  }

  // Write final chunk if any content remains
  if (currentChunk.length > 0) {
    const chunkPath = path.join(TEMP_DIR, `chunk-${chunkIndex}.txt`);
    fs.writeFileSync(chunkPath, currentChunk, 'utf-8');
    chunkFiles.push(chunkPath);
  }

  return { chunkFiles, totalTokens };
}

// Inject content mode - read all files and concatenate
function injectContent(files: string[]): IngestionResult {
  let totalContent = '';
  let totalChars = 0;
  const processedFiles: string[] = [];

  // Build content with file markers
  for (const file of files) {
    const content = readFileContent(file);
    const fileBlock = `
${'='.repeat(80)}
FILE: ${file}
${'='.repeat(80)}

${content}

`;

    totalContent += fileBlock;
    totalChars += fileBlock.length;
    processedFiles.push(file);
  }

  const totalTokens = estimateTokens(totalContent);
  const exceeded25kLimit = totalTokens > TOKEN_LIMIT;

  if (exceeded25kLimit) {
    console.error(`WARNING: Content exceeds 25k token limit (${totalTokens} tokens)`);
    console.error('Splitting into 20k token chunks for parallel reading...');

    const { chunkFiles, totalTokens: chunkedTokens } = splitIntoChunks(files);

    console.log('');
    console.log('# CFN Loop CLI Dependency Context (Chunked)');
    console.log(`# Total tokens: ${chunkedTokens.toLocaleString()}`);
    console.log(`# Chunks: ${chunkFiles.length} files (20k tokens each)`);
    console.log(`# Location: ${TEMP_DIR}/`);
    console.log('');
    console.log('# For Task tool agents: Read these files in parallel');
    chunkFiles.forEach((chunkFile, idx) => {
      console.log(`Read: ${chunkFile}`);
    });
    console.log('');
    console.log('# Cleanup after reading: rm -rf /tmp/cfn-dependency-chunks/');

    return {
      files: processedFiles,
      totalTokens: chunkedTokens,
      exceeded25kLimit: true,
    };
  }

  return {
    files: processedFiles,
    totalTokens,
    content: totalContent,
    exceeded25kLimit: false,
  };
}

// Output Read commands (traditional mode)
function outputReadCommands(categories: Record<string, string[]>, diagramType: DiagramType): void {
  const seenFiles = new Set<string>();
  const modeName = diagramType === 'docker' ? 'Docker' : 'CLI';
  const diagramFile = categories.diagram[0];

  const outputFile = (file: string) => {
    if (!seenFiles.has(file)) {
      seenFiles.add(file);
      console.log(`Read: ${file}`);
    }
  };

  console.log(`# CFN Loop ${modeName} Dependency Ingestion`);
  console.log(`# Generated from: ${diagramFile}`);
  console.log('');

  console.log('# Step 1: Read the dependency diagram');
  categories.diagram.forEach(outputFile);
  console.log('');

  console.log('# Step 2: Read P0 critical path files (required for 5-iteration e2e)');
  if (categories.P0.length > 0) {
    categories.P0.forEach(outputFile);
  } else {
    console.log('# No P0 files found matching filters');
  }
  console.log('');

  console.log('# Step 3: Read P1 files (post-validation features)');
  if (categories.P1.length > 0) {
    categories.P1.forEach(outputFile);
  } else {
    console.log('# No P1 files found matching filters');
  }
  console.log('');

  console.log('# Step 4: Read P2 files (deferred features)');
  if (categories.P2.length > 0) {
    categories.P2.forEach(outputFile);
  } else {
    console.log('# No P2 files found matching filters');
  }
  console.log('');

  console.log('# Step 5: Read coordination layer (Redis/Shell scripts)');
  if (categories.coordination.length > 0) {
    categories.coordination.forEach(outputFile);
  } else {
    console.log('# No coordination files found matching filters');
  }
  console.log('');

  console.log('# Step 6: Read agent profiles (coordinators and workers)');
  if (categories.agents.length > 0) {
    categories.agents.forEach(outputFile);
  } else {
    console.log('# No agent profile files found');
  }
  console.log('');

  console.log('# Step 7: Read slash commands');
  if (categories.commands.length > 0) {
    categories.commands.forEach(outputFile);
  } else {
    console.log('# No command files found');
  }
  console.log('');

  console.log('# Ingestion complete');
  console.log(`# Total files: ${seenFiles.size}`);
}

// Main execution
function main(): void {
  const options = parseArgs();

  // Validate diagram exists
  if (!fs.existsSync(DIAGRAM_PATH)) {
    console.error(`ERROR: Dependency diagram not found: ${DIAGRAM_PATH}`);
    process.exit(1);
  }

  const modeName = options.diagram === 'docker' ? 'Docker' : 'CLI';
  const diagramFile = options.diagram === 'docker'
    ? 'readme/CFN_LOOP_DOCKER_DEPENDENCY_DIAGRAM.txt'
    : 'readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt';

  // Extract and filter files
  let files = extractAllFiles();
  files = validateFileExistence(files, options.skipValidation);
  files = filterByPriority(files, options.priorityFilter);
  files = filterByType(files, options.typeFilter);
  files = filterDeprecated(files, options.includeDeprecated);

  // Add diagram to file list
  const allFiles = [diagramFile, ...files];

  if (options.injectContent) {
    // Content injection mode
    const result = injectContent(allFiles);

    if (result.exceeded25kLimit) {
      // Fallback to Read commands
      const categories = categorizeByPriority(files, options.diagram);
      outputReadCommands(categories, options.diagram);
    } else {
      // Output injected content
      console.log(`# CFN Loop ${modeName} Dependency Context`);
      console.log(`# Files: ${result.files.length}`);
      console.log(`# Estimated tokens: ${result.totalTokens.toLocaleString()}`);
      console.log(`# Token limit: ${TOKEN_LIMIT.toLocaleString()}`);
      console.log('');
      console.log(result.content);
    }
  } else {
    // Traditional Read command mode
    const categories = categorizeByPriority(files, options.diagram);
    outputReadCommands(categories, options.diagram);
  }
}

// Execute if run directly (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  main();
}

export { extractAllFiles, filterByPriority, filterByType, injectContent, estimateTokens };
