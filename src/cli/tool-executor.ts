/**
 * Tool Executor for CLI-Spawned Agents
 *
 * Executes tools requested by agents via Anthropic API tool_use blocks.
 * Implements Read, Write, Edit, Bash, TodoWrite, Glob, Grep.
 */

import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';

const execAsync = promisify(exec);

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Execute a single tool and return result
 */
export async function executeTool(toolUse: ToolUse): Promise<ToolResult> {
  console.log(`[tool-executor] Executing tool: ${toolUse.name}`);
  console.log(`[tool-executor] Tool use ID: ${toolUse.id}`);

  try {
    let result: string;

    switch (toolUse.name) {
      case 'Read':
        result = await executeRead(toolUse.input);
        break;

      case 'Write':
        result = await executeWrite(toolUse.input);
        break;

      case 'Edit':
        result = await executeEdit(toolUse.input);
        break;

      case 'Bash':
        result = await executeBash(toolUse.input);
        break;

      case 'TodoWrite':
        result = await executeTodoWrite(toolUse.input);
        break;

      case 'Glob':
        result = await executeGlob(toolUse.input);
        break;

      case 'Grep':
        result = await executeGrep(toolUse.input);
        break;

      default:
        throw new Error(`Unknown tool: ${toolUse.name}`);
    }

    console.log(`[tool-executor] ✓ Tool executed successfully`);

    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: result
    };
  } catch (error) {
    console.error(`[tool-executor] ✗ Tool execution failed:`, error);

    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: error instanceof Error ? error.message : String(error),
      is_error: true
    };
  }
}

/**
 * Execute Read tool
 */
async function executeRead(input: Record<string, any>): Promise<string> {
  const { file_path, offset, limit } = input;

  if (!file_path) {
    throw new Error('file_path parameter is required');
  }

  const content = await fs.readFile(file_path, 'utf-8');
  const lines = content.split('\n');

  // Apply offset and limit if provided
  const startLine = offset ? Number(offset) - 1 : 0;
  const endLine = limit ? startLine + Number(limit) : lines.length;
  const selectedLines = lines.slice(startLine, endLine);

  // Format with line numbers (cat -n style)
  const formatted = selectedLines
    .map((line, idx) => `${String(startLine + idx + 1).padStart(6)}→${line}`)
    .join('\n');

  return formatted;
}

/**
 * Execute Write tool
 */
async function executeWrite(input: Record<string, any>): Promise<string> {
  const { file_path, content } = input;

  if (!file_path) {
    throw new Error('file_path parameter is required');
  }

  if (content === undefined) {
    throw new Error('content parameter is required');
  }

  await fs.writeFile(file_path, content, 'utf-8');

  return `File written successfully: ${file_path}`;
}

/**
 * Execute Edit tool
 */
async function executeEdit(input: Record<string, any>): Promise<string> {
  const { file_path, old_string, new_string, replace_all } = input;

  if (!file_path) {
    throw new Error('file_path parameter is required');
  }

  if (!old_string) {
    throw new Error('old_string parameter is required');
  }

  if (new_string === undefined) {
    throw new Error('new_string parameter is required');
  }

  // Read file
  const content = await fs.readFile(file_path, 'utf-8');

  // Perform replacement
  let newContent: string;
  if (replace_all) {
    // Replace all occurrences
    newContent = content.split(old_string).join(new_string);
  } else {
    // Replace first occurrence only (must be unique)
    const occurrences = content.split(old_string).length - 1;
    if (occurrences === 0) {
      throw new Error('old_string not found in file');
    }
    if (occurrences > 1) {
      throw new Error(`old_string appears ${occurrences} times. Must be unique or use replace_all: true`);
    }
    newContent = content.replace(old_string, new_string);
  }

  // Write back
  await fs.writeFile(file_path, newContent, 'utf-8');

  return `File edited successfully: ${file_path}`;
}

/**
 * Execute Bash tool
 */
async function executeBash(input: Record<string, any>): Promise<string> {
  const { command, timeout, run_in_background } = input;

  if (!command) {
    throw new Error('command parameter is required');
  }

  // DEBUG: Log bash command execution details
  console.log(`[tool-executor] Bash command: ${command}`);
  console.log(`[tool-executor] Timeout: ${timeout || 120000}ms`);
  console.log(`[tool-executor] Background: ${run_in_background || false}`);

  const timeoutMs = timeout ? Number(timeout) : 120000; // 2 minutes default

  if (run_in_background) {
    // Start background process and return immediately
    exec(command);
    return `Command started in background: ${command}`;
  }

  // Execute synchronously with timeout
  const { stdout, stderr } = await execAsync(command, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  });

  return stdout + stderr;
}

/**
 * Execute TodoWrite tool
 */
async function executeTodoWrite(input: Record<string, any>): Promise<string> {
  const { todos } = input;

  if (!Array.isArray(todos)) {
    throw new Error('todos parameter must be an array');
  }

  // Validate todo structure
  for (const todo of todos) {
    if (!todo.content || !todo.status || !todo.activeForm) {
      throw new Error('Each todo must have content, status, and activeForm');
    }
    if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
      throw new Error('Invalid status. Must be pending, in_progress, or completed');
    }
  }

  // Format todos for display
  const formatted = todos
    .map((todo, idx) => {
      const status = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '⚡' : '○';
      return `${idx + 1}. [${status}] ${todo.content}`;
    })
    .join('\n');

  return `Todo list updated:\n${formatted}`;
}

/**
 * Execute Glob tool
 */
async function executeGlob(input: Record<string, any>): Promise<string> {
  const { pattern, path } = input;

  if (!pattern) {
    throw new Error('pattern parameter is required');
  }

  const cwd = path || process.cwd();
  const files = await glob(pattern, { cwd, nodir: true });

  if (files.length === 0) {
    return 'No files found';
  }

  return files.join('\n');
}

/**
 * Execute Grep tool
 */
async function executeGrep(input: Record<string, any>): Promise<string> {
  const { pattern, path, output_mode, glob: globPattern, type } = input;

  if (!pattern) {
    throw new Error('pattern parameter is required');
  }

  // Build ripgrep command
  const args: string[] = ['rg'];

  // Output mode
  if (output_mode === 'files_with_matches' || !output_mode) {
    args.push('-l'); // List files with matches
  } else if (output_mode === 'count') {
    args.push('-c'); // Count matches per file
  }
  // Default is content (no flag)

  // Optional flags
  if (input['-i']) args.push('-i'); // Case insensitive
  if (input['-n']) args.push('-n'); // Line numbers
  if (input['-A']) args.push(`-A${input['-A']}`); // After context
  if (input['-B']) args.push(`-B${input['-B']}`); // Before context
  if (input['-C']) args.push(`-C${input['-C']}`); // Context

  // File filtering
  if (globPattern) args.push('--glob', globPattern);
  if (type) args.push('--type', type);

  // Pattern and path
  args.push(pattern);
  if (path) args.push(path);

  const command = args.join(' ');

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return stdout || 'No matches found';
  } catch (error: any) {
    // ripgrep exits with code 1 if no matches found
    if (error.code === 1) {
      return 'No matches found';
    }
    throw error;
  }
}

/**
 * Execute multiple tools in sequence
 */
export async function executeTools(toolUses: ToolUse[]): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const toolUse of toolUses) {
    const result = await executeTool(toolUse);
    results.push(result);
  }

  return results;
}
