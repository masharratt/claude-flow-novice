/**
 * MDAP Local Orchestrator
 *
 * Simple Promise.all-based orchestrator that replaces complex Trigger.dev coordination.
 * Uses parallel decomposition and implementation with configurable mode thresholds.
 * Supports iteration loop with gate checks for validation.
 *
 * Extracted and simplified from cfn-orchestrator-v2.ts (1017 lines → ~200 lines)
 *
 * @module orchestrator
 * @version 1.0.1
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  decomposeArchitecture,
  decomposeTesting,
  decomposePerformance,
  decomposeSecurity,
} from './decomposers/index.js';
import {
  implement,
  type ImplementerPayload,
  type ImplementerResult,
} from './implementer.js';
import {
  type MDAPResult,
  type CompilerError,
} from './types.js';

// =============================================
// Type Definitions
// =============================================

export interface OrchestratorPayload {
  /** Description of the task to be implemented */
  taskDescription: string;
  /** Working directory for implementation */
  workDir: string;
  /** Execution mode: mvp (fast), standard (production), enterprise (compliance) */
  mode: 'mvp' | 'standard' | 'enterprise';
  /** Override max iterations (default from mode config) */
  maxIterations?: number;
  /** Test command to execute (default: "npm test") */
  testCommand?: string;
  /** Target files to create/modify (optional - auto-detected if not provided) */
  targetFiles?: string[];
}

export interface OrchestratorResult extends MDAPResult {
  /** Number of iterations completed */
  iterations: number;
  /** Final gate check pass rate */
  passRate?: number;
  /** Total files processed */
  filesProcessed: number;
  /** Implementation results from each decomposer */
  implementationResults: ImplementerResult[];
}

interface ModeConfig {
  /** Pass rate threshold for gate check */
  gateThreshold: number;
  /** Maximum iterations before abort */
  maxIterations: number;
}

// =============================================
// Security: Input Validation
// =============================================

/**
 * Allowed test commands (whitelist for security)
 */
const ALLOWED_TEST_COMMANDS = [
  'npm test',
  'npm run test',
  'npm run test:unit',
  'npm run test:integration',
  'npm run test:e2e',
  'yarn test',
  'yarn test:unit',
  'yarn test:integration',
  'yarn test:e2e',
  'pytest',
  'go test',
  'cargo test',
  'make test',
];

/**
 * Sanitize and validate work directory path
 */
function validateWorkDir(workDir: string): string {
  // Resolve absolute path
  const resolved = path.resolve(workDir);
  
  // Basic path validation
  if (!resolved || resolved.length < 2) {
    throw new Error('Invalid work directory path');
  }
  
  // Prevent directory traversal
  if (resolved.includes('..')) {
    throw new Error('Directory traversal not allowed in work directory');
  }
  
  // Ensure path doesn't contain shell metacharacters
  if (/[;&|`$(){}[\]]/.test(resolved)) {
    throw new Error('Invalid characters in work directory path');
  }
  
  return resolved;
}

/**
 * Validate and sanitize task description
 */
function validateTaskDescription(description: string): string {
  if (!description || typeof description !== 'string') {
    throw new Error('Task description is required and must be a string');
  }
  
  // Trim whitespace
  const cleaned = description.trim();
  
  // Check reasonable length
  if (cleaned.length < 10 || cleaned.length > 10000) {
    throw new Error('Task description must be between 10 and 10000 characters');
  }
  
  // Remove potential shell metacharacters
  const sanitized = cleaned.replace(/[;&|`$(){}[\]<>"'\\]/g, '');
  
  if (sanitized.length === 0) {
    throw new Error('Task description contains only invalid characters');
  }
  
  return sanitized;
}

/**
 * Validate test command against whitelist
 */
function validateTestCommand(command: string): string {
  if (!command || typeof command !== 'string') {
    return 'npm test'; // Default safe command
  }
  
  const trimmed = command.trim();
  
  // Check against whitelist
  if (!ALLOWED_TEST_COMMANDS.includes(trimmed)) {
    console.warn(`Test command "${trimmed}" not in whitelist, using default "npm test"`);
    return 'npm test';
  }
  
  return trimmed;
}

/**
 * Safely execute a command without shell injection
 */
async function executeCommandSafely(command: string, workDir: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Split command into parts (simple, no pipes or redirects)
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    
    // Validate command is in whitelist
    const fullCommand = parts.join(' ');
    if (!ALLOWED_TEST_COMMANDS.includes(fullCommand)) {
      resolve({
        stdout: '',
        stderr: 'Command not in whitelist',
        exitCode: 1
      });
      return;
    }
    
    const child = spawn(cmd, args, {
      cwd: workDir,
      stdio: 'pipe',
      shell: false, // Critical: Don't use shell to prevent injection
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0
      });
    });
    
    child.on('error', (error) => {
      resolve({
        stdout: '',
        stderr: error.message,
        exitCode: 1
      });
    });
  });
}

// =============================================
// Mode Configuration
// =============================================

const MODE_CONFIGS: Record<string, ModeConfig> = {
  mvp: {
    gateThreshold: 0.70,
    maxIterations: 5,
  },
  standard: {
    gateThreshold: 0.95,
    maxIterations: 10,
  },
  enterprise: {
    gateThreshold: 0.98,
    maxIterations: 15,
  },
};

// =============================================
// Gate Check Implementation (Secure)
// =============================================

/**
 * Run gate check by safely executing test command
 *
 * @param testCommand - Command to execute for validation
 * @param workDir - Working directory for command execution
 * @returns Pass rate (0.0 to 1.0)
 */
async function runGateCheck(testCommand: string, workDir: string): Promise<number> {
  try {
    // Validate inputs
    const safeCommand = validateTestCommand(testCommand);
    const safeWorkDir = validateWorkDir(workDir);
    
    // Execute command safely
    const result = await executeCommandSafely(safeCommand, safeWorkDir);
    
    // Parse test output to calculate pass rate
    const output = result.stdout + result.stderr;
    
    // Look for patterns like "X passing, Y failing" or "✓ X, ✗ Y"
    const passingMatch = output.match(/(\d+)\s+passing|✓\s*(\d+)/);
    const failingMatch = output.match(/(\d+)\s+failing|✗\s*(\d+)/);
    
    const passing = passingMatch ? parseInt(passingMatch[1] || passingMatch[2]) : 0;
    const failing = failingMatch ? parseInt(failingMatch[1] || failingMatch[2]) : 0;
    const total = passing + failing;
    
    if (total === 0) {
      // No test results found - assume success if command didn't fail
      return result.exitCode === 0 ? 1.0 : 0.0;
    }
    
    return passing / total;
  } catch (error: any) {
    // Command failed - check if it's test failure or error
    console.error(`Gate check command failed: ${error.message}`);
    return 0.0;
  }
}

// =============================================
// Orchestrator Core
// =============================================

/**
 * Auto-detect target files based on task description and work directory
 *
 * @param taskDescription - Task description to analyze
 * @param workDir - Working directory to scan
 * @returns Array of target file paths
 */
async function detectTargetFiles(taskDescription: string, workDir: string): Promise<string[]> {
  const files: string[] = [];
  
  // Validate inputs
  const safeWorkDir = validateWorkDir(workDir);
  
  // Simple heuristic - look for common file patterns
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
  
  try {
    const entries = await fs.readdir(safeWorkDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          // Check if file relates to task description
          const filePath = path.join(safeWorkDir, entry.name);
          const content = await fs.readFile(filePath, 'utf8');
          
          // Simple keyword matching
          const keywords = taskDescription.toLowerCase().split(/\s+/);
          const matchedKeywords = keywords.filter(keyword =>
            keyword.length > 3 && content.toLowerCase().includes(keyword)
          );
          
          if (matchedKeywords.length > 0) {
            files.push(filePath);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Could not scan directory for target files:', error);
  }
  
  // If no files detected, create a default based on task description
  if (files.length === 0) {
    const defaultFile = 'implementation.ts';
    files.push(path.join(safeWorkDir, defaultFile));
  }
  
  return files;
}

/**
 * Main orchestrator function
 *
 * @param payload - Orchestrator configuration
 * @returns Orchestrator execution result
 */
export async function orchestrate(payload: OrchestratorPayload): Promise<OrchestratorResult> {
  const startTime = Date.now();
  
  // Validate all inputs
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: must be an object');
  }
  
  const safeTaskDescription = validateTaskDescription(payload.taskDescription);
  const safeWorkDir = validateWorkDir(payload.workDir);
  const safeTestCommand = validateTestCommand(payload.testCommand || 'npm test');
  
  const modeConfig = MODE_CONFIGS[payload.mode];
  if (!modeConfig) {
    throw new Error(`Invalid mode: ${payload.mode}. Must be one of: ${Object.keys(MODE_CONFIGS).join(', ')}`);
  }
  
  const maxIterations = payload.maxIterations ?? modeConfig.maxIterations;
  
  console.log(`Starting MDAP orchestration in ${payload.mode} mode`);
  console.log(`Task: ${safeTaskDescription.substring(0, 100)}...`);
  console.log(`Work Dir: ${safeWorkDir}`);
  console.log(`Max Iterations: ${maxIterations}`);
  console.log(`Gate Threshold: ${(modeConfig.gateThreshold * 100).toFixed(0)}%`);
  
  // Auto-detect target files if not provided
  const targetFiles = payload.targetFiles ??
    await detectTargetFiles(safeTaskDescription, safeWorkDir);
  
  console.log(`Target Files: ${targetFiles.join(', ')}`);
  
  let iterations = 0;
  let passRate = 0.0;
  let implementationResults: ImplementerResult[] = [];
  
  // =============================================
  // Iteration Loop
  // =============================================
  
  for (iterations = 1; iterations <= maxIterations; iterations++) {
    console.log(`\n=== Iteration ${iterations}/${maxIterations} ===`);
    
    try {
      // Step 1: Parallel Decomposition
      console.log('Step 1: Running parallel decomposition...');
      const decompositionResults = await Promise.all([
        decomposeArchitecture({
          taskId: `${payload.mode}-${iterations}-architecture`,
          taskDescription: safeTaskDescription,
          workDir: safeWorkDir,
        }),
        decomposeTesting({
          taskId: `${payload.mode}-${iterations}-testing`,
          taskDescription: safeTaskDescription,
          workDir: safeWorkDir,
        }),
        decomposePerformance({
          taskId: `${payload.mode}-${iterations}-performance`,
          taskDescription: safeTaskDescription,
          workDir: safeWorkDir,
        }),
        decomposeSecurity({
          taskId: `${payload.mode}-${iterations}-security`,
          taskDescription: safeTaskDescription,
          workDir: safeWorkDir,
        }),
      ]);
      
      console.log(`Decomposition complete: ${decompositionResults.length} perspectives`);
      
      // Step 2: Create implementation payloads
      const implementationPayloads: ImplementerPayload[] = [];
      
      for (const analysis of decompositionResults) {
        // Use microTasks from the analysis
        const microTasks = (analysis as any).microTasks || [];
        for (const task of microTasks) {
          const implPayload: ImplementerPayload = {
            taskId: `${payload.mode}-${iterations}-${task.id}`,
            taskDescription: task.description || safeTaskDescription,
            targetFile: targetFiles[0], // Use first target file for all microtasks
            workDir: safeWorkDir,
            contextHints: [analysis.perspective, task.title || 'component'],
            language: detectLanguage(safeTaskDescription),
          };
          
          implementationPayloads.push(implPayload);
        }
      }
      
      // Ensure we have at least one payload
      if (implementationPayloads.length === 0) {
        implementationPayloads.push({
          taskId: `${payload.mode}-${iterations}-default`,
          taskDescription: safeTaskDescription,
          targetFile: targetFiles[0],
          workDir: safeWorkDir,
          language: detectLanguage(safeTaskDescription),
        });
      }
      
      // Step 3: Parallel Implementation
      console.log(`Step 2: Implementing ${implementationPayloads.length} components...`);
      const iterationResults = await Promise.all(
        implementationPayloads.map(p => implement(p))
      );
      
      implementationResults.push(...iterationResults);
      
      const successfulImplementations = iterationResults.filter(r => r.success);
      console.log(`Implementation complete: ${successfulImplementations.length}/${iterationResults.length} successful`);
      
      // Step 4: Gate Check (now async)
      console.log('Step 3: Running gate check...');
      passRate = await runGateCheck(safeTestCommand, safeWorkDir);
      console.log(`Gate check result: ${(passRate * 100).toFixed(1)}% pass rate`);
      
      // Step 5: Check Threshold
      if (passRate >= modeConfig.gateThreshold) {
        console.log(`✅ Gate passed! ${(passRate * 100).toFixed(1)}% >= ${(modeConfig.gateThreshold * 100).toFixed(0)}%`);
        break;
      } else {
        console.log(`⚠️  Gate failed. ${(passRate * 100).toFixed(1)}% < ${(modeConfig.gateThreshold * 100).toFixed(0)}%`);
        if (iterations === maxIterations) {
          console.log(`Reached max iterations (${maxIterations}) - stopping`);
        }
      }
    } catch (error) {
      console.error(`Iteration ${iterations} failed:`, error);
      passRate = 0.0;
    }
  }
  
  // =============================================
  // Final Result
  // =============================================
  
  const duration = Date.now() - startTime;
  const success = passRate >= modeConfig.gateThreshold;
  const filesProcessed = implementationResults.filter(r => r.success).length;
  
  console.log(`\n=== Orchestration Complete ===`);
  console.log(`Success: ${success}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Final Pass Rate: ${(passRate * 100).toFixed(1)}%`);
  console.log(`Files Processed: ${filesProcessed}`);
  console.log(`Duration: ${duration}ms`);
  
  return {
    success,
    iterations,
    passRate,
    filesProcessed,
    implementationResults,
    durationMs: duration,
    confidence: passRate >= modeConfig.gateThreshold ? 0.9 : 0.3,
  };
}

// =============================================
// Utility Functions
// =============================================

/**
 * Detect programming language from task description
 *
 * @param taskDescription - Task description to analyze
 * @returns Language string
 */
function detectLanguage(taskDescription: string): string {
  const description = taskDescription.toLowerCase();
  
  if (description.includes('typescript') || description.includes('react')) {
    return 'typescript';
  } else if (description.includes('python')) {
    return 'python';
  } else if (description.includes('rust')) {
    return 'rust';
  } else if (description.includes('go')) {
    return 'go';
  } else if (description.includes('java')) {
    return 'java';
  } else if (description.includes('javascript') || description.includes('js')) {
    return 'javascript';
  }
  
  return 'typescript'; // Default
}
