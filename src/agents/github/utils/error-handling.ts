/**
 * Comprehensive Error Handling and Validation
 * Enhanced error management for GitHub agents
 */

import { GitHubError, Repository, HookContext } from '../types';

export interface ValidationRule {
  name: string;
  validator: (data: any) => ValidationResult;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
  code?: string;
  data?: any;
}

export interface ErrorContext {
  operation: string;
  agent_id: string;
  repository?: Repository;
  timestamp: string;
  context: any;
  stack?: string;
}

export class GitHubErrorHandler {
  private validationRules: Map<string, ValidationRule[]> = new Map();
  private errorHandlers: Map<string, Function[]> = new Map();
  private retryConfig: Map<string, { maxRetries: number; backoff: number }> = new Map();

  constructor() {
    this.setupDefaultValidations();
    this.setupDefaultErrorHandlers();
    this.setupRetryConfiguration();
  }

  // =============================================================================
  // VALIDATION SYSTEM
  // =============================================================================

  /**
   * Register validation rule for an operation
   */
  registerValidationRule(operation: string, rule: ValidationRule): void {
    if (!this.validationRules.has(operation)) {
      this.validationRules.set(operation, []);
    }

    this.validationRules.get(operation)!.push(rule);
  }

  /**
   * Validate data before operation
   */
  async validateOperation(operation: string, data: any): Promise<ValidationResult[]> {
    const rules = this.validationRules.get(operation) || [];
    const results: ValidationResult[] = [];

    for (const rule of rules) {
      try {
        const result = rule.validator(data);
        results.push({
          ...result,
          name: rule.name,
          severity: rule.severity,
        } as any);
      } catch (error) {
        results.push({
          valid: false,
          name: rule.name,
          message: `Validation rule failed: ${error.message}`,
          code: 'VALIDATION_ERROR',
          severity: 'error',
        } as any);
      }
    }

    return results;
  }

  /**
   * Check if validation results contain errors
   */
  hasValidationErrors(results: ValidationResult[]): boolean {
    return results.some((r) => !r.valid && (r as any).severity === 'error');
  }

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  /**
   * Handle and transform errors
   */
  handleError(
    error: any,
    operation: string,
    agentId: string,
    repository?: Repository,
    context?: any,
  ): GitHubError {
    const errorContext: ErrorContext = {
      operation,
      agent_id: agentId,
      repository,
      timestamp: new Date().toISOString(),
      context: context || {},
      stack: error.stack,
    };

    // Transform error to standardized format
    const gitHubError = this.transformError(error, errorContext);

    // Execute error handlers
    this.executeErrorHandlers(gitHubError, errorContext);

    // Log error
    this.logError(gitHubError, errorContext);

    return gitHubError;
  }

  /**
   * Register custom error handler
   */
  registerErrorHandler(errorType: string, handler: Function): void {
    if (!this.errorHandlers.has(errorType)) {
      this.errorHandlers.set(errorType, []);
    }

    this.errorHandlers.get(errorType)!.push(handler);
  }

  /**
   * Execute retry logic for operations
   */
  async executeWithRetry<T>(operation: string, fn: () => Promise<T>, context?: any): Promise<T> {
    const retryConfig = this.retryConfig.get(operation) || { maxRetries: 3, backoff: 1000 };
    let lastError: any;

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry on certain error types
        if (this.shouldNotRetry(error)) {
          throw error;
        }

        if (attempt <= retryConfig.maxRetries) {
          const delay = retryConfig.backoff * Math.pow(2, attempt - 1);
          console.warn(
            `[GitHubErrorHandler] Attempt ${attempt} failed for ${operation}, retrying in ${delay}ms:`,
            error.message,
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw this.handleError(lastError, operation, 'retry-handler', undefined, context);
  }

  // =============================================================================
  // ERROR RECOVERY
  // =============================================================================

  /**
   * Attempt to recover from specific error types
   */
  async attemptRecovery(error: GitHubError, context: ErrorContext): Promise<any> {
    switch (error.code) {
      case 'RATE_LIMIT_EXCEEDED':
        return await this.recoverFromRateLimit(error, context);

      case 'NETWORK_ERROR':
        return await this.recoverFromNetworkError(error, context);

      case 'AUTHENTICATION_ERROR':
        return await this.recoverFromAuthError(error, context);

      case 'NOT_FOUND':
        return await this.recoverFromNotFound(error, context);

      default:
        throw error;
    }
  }

  /**
   * Graceful degradation for operations
   */
  async executeWithGracefulDegradation<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
    operation: string,
    context?: any,
  ): Promise<T> {
    try {
      return await primaryFn();
    } catch (error) {
      console.warn(
        `[GitHubErrorHandler] Primary execution failed for ${operation}, attempting fallback:`,
        error.message,
      );

      try {
        return await fallbackFn();
      } catch (fallbackError) {
        // Both primary and fallback failed
        throw this.handleError(
          new Error(
            `Both primary and fallback execution failed: ${error.message} | ${fallbackError.message}`,
          ),
          operation,
          'graceful-degradation',
          undefined,
          { primary_error: error, fallback_error: fallbackError, ...context },
        );
      }
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private setupDefaultValidations(): void {
    // Repository validation
    this.registerValidationRule('*', {
      name: 'repository_structure',
      validator: (data: any) => {
        if (data.repository) {
          const repo = data.repository;
          if (!repo.owner || !repo.repo) {
            return {
              valid: false,
              message: 'Repository must have owner and repo properties',
              code: 'INVALID_REPOSITORY',
            };
          }
        }
        return { valid: true };
      },
      severity: 'error',
    });

    // Token validation
    this.registerValidationRule('*', {
      name: 'github_token',
      validator: (data: any) => {
        // This would check if GitHub token is present and valid
        // For now, just a placeholder
        return { valid: true };
      },
      severity: 'error',
    });

    // Pull request validation
    this.registerValidationRule('create_pull_request', {
      name: 'pr_parameters',
      validator: (data: any) => {
        const { title, head, base } = data;
        if (!title || !head || !base) {
          return {
            valid: false,
            message: 'Pull request requires title, head, and base parameters',
            code: 'INVALID_PR_PARAMETERS',
          };
        }

        if (head === base) {
          return {
            valid: false,
            message: 'Head and base branches cannot be the same',
            code: 'INVALID_BRANCH_CONFIGURATION',
          };
        }

        return { valid: true };
      },
      severity: 'error',
    });

    // Release validation
    this.registerValidationRule('create_release', {
      name: 'release_parameters',
      validator: (data: any) => {
        const { tagName } = data;
        if (!tagName) {
          return {
            valid: false,
            message: 'Release requires tag name',
            code: 'INVALID_RELEASE_PARAMETERS',
          };
        }

        // Basic semantic versioning check
        const semverRegex = /^v?\d+\.\d+\.\d+/;
        if (!semverRegex.test(tagName)) {
          return {
            valid: false,
            message: 'Tag name should follow semantic versioning (e.g., v1.0.0)',
            code: 'INVALID_TAG_FORMAT',
            severity: 'warning',
          };
        }

        return { valid: true };
      },
      severity: 'warning',
    });

    // Multi-repo operation validation
    this.registerValidationRule('coordinate_multi_repo_release', {
      name: 'multi_repo_coordination',
      validator: (data: any) => {
        const { repositories, dependencies } = data;
        if (!repositories || !Array.isArray(repositories)) {
          return {
            valid: false,
            message: 'Multi-repo operation requires repositories array',
            code: 'INVALID_MULTI_REPO_CONFIG',
          };
        }

        if (repositories.length === 0) {
          return {
            valid: false,
            message: 'At least one repository required for multi-repo operation',
            code: 'EMPTY_REPOSITORY_LIST',
          };
        }

        // Check for circular dependencies
        if (dependencies) {
          const hasCircularDeps = this.checkCircularDependencies(repositories, dependencies);
          if (hasCircularDeps) {
            return {
              valid: false,
              message: 'Circular dependencies detected in repository configuration',
              code: 'CIRCULAR_DEPENDENCIES',
            };
          }
        }

        return { valid: true };
      },
      severity: 'error',
    });
  }

  private setupDefaultErrorHandlers(): void {
    // Rate limit error handler
    this.registerErrorHandler(
      'RATE_LIMIT_EXCEEDED',
      (error: GitHubError, context: ErrorContext) => {
        console.warn(
          `[GitHubErrorHandler] Rate limit exceeded for ${context.operation}. Consider implementing backoff strategy.`,
        );
      },
    );

    // Network error handler
    this.registerErrorHandler('NETWORK_ERROR', (error: GitHubError, context: ErrorContext) => {
      console.warn(
        `[GitHubErrorHandler] Network error in ${context.operation}. Will retry with exponential backoff.`,
      );
    });

    // Authentication error handler
    this.registerErrorHandler(
      'AUTHENTICATION_ERROR',
      (error: GitHubError, context: ErrorContext) => {
        console.error(
          `[GitHubErrorHandler] Authentication failed for ${context.operation}. Check GitHub token validity.`,
        );
      },
    );
  }

  private setupRetryConfiguration(): void {
    // Configure retry settings for different operations
    this.retryConfig.set('get_*', { maxRetries: 3, backoff: 1000 });
    this.retryConfig.set('create_*', { maxRetries: 2, backoff: 2000 });
    this.retryConfig.set('update_*', { maxRetries: 2, backoff: 1500 });
    this.retryConfig.set('delete_*', { maxRetries: 1, backoff: 3000 });
    this.retryConfig.set('merge_pull_request', { maxRetries: 1, backoff: 5000 });
    this.retryConfig.set('trigger_workflow', { maxRetries: 2, backoff: 2000 });
  }

  private transformError(error: any, context: ErrorContext): GitHubError {
    // Transform various error types to standardized GitHubError format
    if (error.status) {
      // HTTP errors
      switch (error.status) {
        case 401:
          return {
            code: 'AUTHENTICATION_ERROR',
            message: 'GitHub authentication failed. Check your access token.',
            status: error.status,
            repository: context.repository,
            context: context.context,
          };
        case 403:
          return {
            code: 'PERMISSION_DENIED',
            message: 'Insufficient permissions for this operation.',
            status: error.status,
            repository: context.repository,
            context: context.context,
          };
        case 404:
          return {
            code: 'NOT_FOUND',
            message: `Resource not found: ${error.message || 'Unknown resource'}`,
            status: error.status,
            repository: context.repository,
            context: context.context,
          };
        case 422:
          return {
            code: 'VALIDATION_ERROR',
            message: `GitHub validation failed: ${error.message || 'Invalid request'}`,
            status: error.status,
            repository: context.repository,
            context: context.context,
          };
        case 429:
          return {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'GitHub API rate limit exceeded. Please wait before retrying.',
            status: error.status,
            repository: context.repository,
            context: context.context,
          };
        default:
          return {
            code: `HTTP_${error.status}`,
            message: error.message || `HTTP error ${error.status}`,
            status: error.status,
            repository: context.repository,
            context: context.context,
          };
      }
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return {
        code: 'NETWORK_ERROR',
        message: `Network error: ${error.message}`,
        repository: context.repository,
        context: { ...context.context, network_error_code: error.code },
      };
    }

    // Generic error transformation
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
      repository: context.repository,
      context: context.context,
    };
  }

  private executeErrorHandlers(error: GitHubError, context: ErrorContext): void {
    const handlers = this.errorHandlers.get(error.code) || [];
    const globalHandlers = this.errorHandlers.get('*') || [];

    [...handlers, ...globalHandlers].forEach((handler) => {
      try {
        handler(error, context);
      } catch (handlerError) {
        console.error('[GitHubErrorHandler] Error in error handler:', handlerError);
      }
    });
  }

  private logError(error: GitHubError, context: ErrorContext): void {
    const logEntry = {
      timestamp: context.timestamp,
      agent_id: context.agent_id,
      operation: context.operation,
      error_code: error.code,
      error_message: error.message,
      repository: context.repository?.full_name,
      status: error.status,
      context: context.context,
    };

    // In production, this would integrate with proper logging system
    console.error('[GitHubErrorHandler] Error logged:', JSON.stringify(logEntry, null, 2));
  }

  private shouldNotRetry(error: any): boolean {
    // Don't retry on certain error types
    const nonRetryableCodes = [
      'AUTHENTICATION_ERROR',
      'PERMISSION_DENIED',
      'VALIDATION_ERROR',
      'NOT_FOUND',
    ];

    const nonRetryableStatuses = [401, 403, 404, 422];

    return nonRetryableCodes.includes(error.code) || nonRetryableStatuses.includes(error.status);
  }

  private async recoverFromRateLimit(error: GitHubError, context: ErrorContext): Promise<any> {
    // Wait for rate limit reset
    const resetTime = context.context?.rate_limit_reset;
    if (resetTime) {
      const waitTime = resetTime * 1000 - Date.now();
      if (waitTime > 0 && waitTime < 300000) {
        // Max 5 minutes
        console.log(`[GitHubErrorHandler] Waiting ${waitTime}ms for rate limit reset`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return { recovered: true };
      }
    }

    // Default fallback: wait 60 seconds
    await new Promise((resolve) => setTimeout(resolve, 60000));
    return { recovered: true };
  }

  private async recoverFromNetworkError(error: GitHubError, context: ErrorContext): Promise<any> {
    // Simple network recovery: wait and retry
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return { recovered: true };
  }

  private async recoverFromAuthError(error: GitHubError, context: ErrorContext): Promise<any> {
    // Cannot automatically recover from auth errors
    throw new Error('Authentication error requires manual intervention');
  }

  private async recoverFromNotFound(error: GitHubError, context: ErrorContext): Promise<any> {
    // Check if resource might have been created/moved
    console.warn(
      `[GitHubErrorHandler] Resource not found in ${context.operation}. This may require manual verification.`,
    );
    throw error; // Cannot automatically recover
  }

  private checkCircularDependencies(repositories: any[], dependencies: any): boolean {
    // Simple cycle detection using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (repo: string): boolean => {
      if (recursionStack.has(repo)) return true;
      if (visited.has(repo)) return false;

      visited.add(repo);
      recursionStack.add(repo);

      const deps = dependencies[repo] || [];
      for (const dep of deps) {
        if (hasCycle(dep)) return true;
      }

      recursionStack.delete(repo);
      return false;
    };

    for (const repo of repositories) {
      const repoName = repo.full_name || `${repo.owner}/${repo.repo}`;
      if (hasCycle(repoName)) return true;
    }

    return false;
  }
}

// Global error handler instance
export const githubErrorHandler = new GitHubErrorHandler();
