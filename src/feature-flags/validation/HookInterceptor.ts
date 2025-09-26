/**
 * Phase 4 Hook Interception with Auto-Relaunch
 * Intercepts hook executions and provides auto-relaunch capability
 */

import { FeatureFlagManager } from '../core/FeatureFlagManager.js';
import { TruthBasedValidator, ValidationResult, CompletionTask } from './TruthBasedValidator.js';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';

export interface HookExecution {
  hookType: 'pre-task' | 'post-task' | 'post-edit' | 'session-end' | 'notify';
  command: string;
  args: string[];
  timestamp: string;
  userId?: string;
  sessionId?: string;
}

export interface InterceptedResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  validationResult?: ValidationResult;
  relaunchAttempts: number;
}

export class HookInterceptor extends EventEmitter {
  private flagManager: FeatureFlagManager;
  private validator: TruthBasedValidator;
  private interceptedHooks: Map<string, HookExecution[]> = new Map();
  private runningProcesses: Map<string, ChildProcess> = new Map();

  constructor(flagManager: FeatureFlagManager, validator: TruthBasedValidator) {
    super();
    this.flagManager = flagManager;
    this.validator = validator;
  }

  /**
   * Intercept and execute hook with validation and auto-relaunch
   */
  async interceptHook(execution: HookExecution): Promise<InterceptedResult> {
    const isEnabled = await this.flagManager.isEnabled('hook-interception', execution.userId);

    if (!isEnabled) {
      return this.executeDirectly(execution);
    }

    const executionId = `${execution.hookType}-${Date.now()}`;
    this.recordExecution(executionId, execution);

    try {
      let result = await this.executeWithValidation(execution, executionId);

      // Auto-relaunch logic
      if (!result.success && this.shouldAutoRelaunch(execution)) {
        result = await this.attemptAutoRelaunch(execution, executionId, result);
      }

      this.emit('hook_intercepted', {
        executionId,
        execution,
        result,
      });

      return result;
    } catch (error) {
      this.emit('hook_error', {
        executionId,
        execution,
        error: error.message,
      });

      return {
        success: false,
        output: '',
        error: error.message,
        exitCode: 1,
        duration: 0,
        relaunchAttempts: 0,
      };
    }
  }

  private async executeWithValidation(
    execution: HookExecution,
    executionId: string,
  ): Promise<InterceptedResult> {
    const startTime = Date.now();

    try {
      const process = spawn(execution.command, execution.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      this.runningProcesses.set(executionId, process);

      const result = await new Promise<InterceptedResult>((resolve) => {
        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', async (code) => {
          const duration = Date.now() - startTime;
          const success = code === 0;

          // Validate the execution if it's a completion-related hook
          let validationResult: ValidationResult | undefined;
          if (this.isCompletionHook(execution)) {
            const task = this.createTaskFromExecution(execution, stdout, stderr);
            validationResult = await this.validator.validateCompletion(task);
          }

          resolve({
            success: success && validationResult?.isValid !== false,
            output: stdout,
            error: stderr,
            exitCode: code || 0,
            duration,
            validationResult,
            relaunchAttempts: 0,
          });
        });

        process.on('error', (error) => {
          resolve({
            success: false,
            output: stdout,
            error: error.message,
            exitCode: 1,
            duration: Date.now() - startTime,
            relaunchAttempts: 0,
          });
        });
      });

      this.runningProcesses.delete(executionId);
      return result;
    } catch (error) {
      this.runningProcesses.delete(executionId);
      throw error;
    }
  }

  private async attemptAutoRelaunch(
    execution: HookExecution,
    executionId: string,
    previousResult: InterceptedResult,
  ): Promise<InterceptedResult> {
    const maxRelaunchAttempts = parseInt(process.env.MAX_RELAUNCH_ATTEMPTS || '3', 10);
    let attempts = 0;
    let lastResult = previousResult;

    while (attempts < maxRelaunchAttempts && !lastResult.success) {
      attempts++;

      this.emit('auto_relaunch_attempt', {
        executionId,
        attempt: attempts,
        maxAttempts: maxRelaunchAttempts,
      });

      // Modify execution slightly for relaunch
      const modifiedExecution = this.modifyForRelaunch(execution, attempts);
      const newExecutionId = `${executionId}-relaunch-${attempts}`;

      lastResult = await this.executeWithValidation(modifiedExecution, newExecutionId);
      lastResult.relaunchAttempts = attempts;

      if (lastResult.success) {
        this.emit('auto_relaunch_success', {
          executionId,
          attempts,
          result: lastResult,
        });
        break;
      }

      // Wait before next attempt
      await this.sleep(1000 * attempts); // Exponential backoff
    }

    if (!lastResult.success) {
      this.emit('auto_relaunch_failed', {
        executionId,
        attempts,
        finalResult: lastResult,
      });
    }

    return lastResult;
  }

  private shouldAutoRelaunch(execution: HookExecution): boolean {
    const autoRelaunchEnabled = process.env.AUTO_RELAUNCH_ENABLED !== 'false';

    // Don't auto-relaunch certain hook types
    const nonRelaunchableHooks = ['session-end', 'notify'];
    if (nonRelaunchableHooks.includes(execution.hookType)) {
      return false;
    }

    return autoRelaunchEnabled;
  }

  private modifyForRelaunch(execution: HookExecution, attempt: number): HookExecution {
    // Add retry indicators to the execution
    const modifiedArgs = [...execution.args];

    // Add retry context if not already present
    if (!modifiedArgs.includes('--retry')) {
      modifiedArgs.push('--retry', attempt.toString());
    }

    // Add exponential backoff delay for certain commands
    if (execution.command.includes('claude-flow')) {
      modifiedArgs.push('--retry-delay', (1000 * attempt).toString());
    }

    return {
      ...execution,
      args: modifiedArgs,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeDirectly(execution: HookExecution): Promise<InterceptedResult> {
    const startTime = Date.now();

    try {
      const process = spawn(execution.command, execution.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      const result = await new Promise<InterceptedResult>((resolve) => {
        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', (code) => {
          resolve({
            success: code === 0,
            output: stdout,
            error: stderr,
            exitCode: code || 0,
            duration: Date.now() - startTime,
            relaunchAttempts: 0,
          });
        });

        process.on('error', (error) => {
          resolve({
            success: false,
            output: stdout,
            error: error.message,
            exitCode: 1,
            duration: Date.now() - startTime,
            relaunchAttempts: 0,
          });
        });
      });

      return result;
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error.message,
        exitCode: 1,
        duration: Date.now() - startTime,
        relaunchAttempts: 0,
      };
    }
  }

  private isCompletionHook(execution: HookExecution): boolean {
    return execution.hookType === 'post-task' || execution.hookType === 'post-edit';
  }

  private createTaskFromExecution(
    execution: HookExecution,
    stdout: string,
    stderr: string,
  ): CompletionTask {
    return {
      id: `hook-${execution.hookType}-${Date.now()}`,
      description: `Hook execution: ${execution.command} ${execution.args.join(' ')}`,
      actualOutput: {
        stdout,
        stderr,
        exitCode: stderr ? 1 : 0,
      },
      context: {
        hookType: execution.hookType,
        timestamp: execution.timestamp,
        sessionId: execution.sessionId,
        userId: execution.userId,
      },
      userId: execution.userId,
    };
  }

  private recordExecution(executionId: string, execution: HookExecution): void {
    const sessionId = execution.sessionId || 'default';
    if (!this.interceptedHooks.has(sessionId)) {
      this.interceptedHooks.set(sessionId, []);
    }
    this.interceptedHooks.get(sessionId)!.push(execution);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Kill running hook process
   */
  async killHook(executionId: string): Promise<boolean> {
    const process = this.runningProcesses.get(executionId);
    if (!process) {
      return false;
    }

    try {
      process.kill('SIGTERM');

      // Give process time to terminate gracefully
      await this.sleep(5000);

      if (!process.killed) {
        process.kill('SIGKILL');
      }

      this.runningProcesses.delete(executionId);
      return true;
    } catch (error) {
      this.emit('kill_error', {
        executionId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get execution history for a session
   */
  getExecutionHistory(sessionId: string): HookExecution[] {
    return this.interceptedHooks.get(sessionId) || [];
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics() {
    const allExecutions = Array.from(this.interceptedHooks.values()).flat();
    const runningProcessCount = this.runningProcesses.size;

    const hookTypeCounts = allExecutions.reduce(
      (acc, exec) => {
        acc[exec.hookType] = (acc[exec.hookType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalExecutions: allExecutions.length,
      runningProcesses: runningProcessCount,
      hookTypeCounts,
      sessionsCount: this.interceptedHooks.size,
      lastExecution:
        allExecutions.length > 0 ? allExecutions[allExecutions.length - 1].timestamp : null,
    };
  }
}
