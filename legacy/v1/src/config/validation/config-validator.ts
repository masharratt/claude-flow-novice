/**
 * Comprehensive Configuration Validation System
 * Provides extensive validation with detailed error reporting
 */

import { Config, ExperienceLevel, FeatureFlags } from '../config-manager.js';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  performanceScore: number; // 0-100
}

export interface ValidationError {
  field: string;
  value: any;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestion?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  impact: 'performance' | 'security' | 'usability' | 'compatibility';
}

/**
 * Advanced configuration validator with performance scoring
 */
export class ConfigValidator {
  private static readonly PERFORMANCE_WEIGHTS = {
    caching: 25,
    concurrency: 20,
    memory: 20,
    networking: 15,
    storage: 10,
    misc: 10,
  };

  /**
   * Comprehensive configuration validation
   */
  static validate(config: Config): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      performanceScore: 0,
    };

    // Basic structure validation
    ConfigValidator.validateStructure(config, result);

    // Field-specific validation
    ConfigValidator.validateOrchestrator(config.orchestrator, result);
    ConfigValidator.validateTerminal(config.terminal, result);
    ConfigValidator.validateMemory(config.memory, result);
    ConfigValidator.validateCoordination(config.coordination, result);
    ConfigValidator.validateMCP(config.mcp, result);
    ConfigValidator.validateLogging(config.logging, result);
    ConfigValidator.validateRuvSwarm(config.ruvSwarm, result);
    ConfigValidator.validateClaude(config.claude, result);
    ConfigValidator.validatePerformance(config.performance, result);
    ConfigValidator.validateAutoDetection(config.autoDetection, result);

    // Experience level validation
    ConfigValidator.validateExperienceLevel(config, result);

    // Cross-field validation
    ConfigValidator.validateCrossFields(config, result);

    // Security validation
    ConfigValidator.validateSecurity(config, result);

    // Performance scoring
    result.performanceScore = ConfigValidator.calculatePerformanceScore(config);

    // Generate suggestions
    ConfigValidator.generateSuggestions(config, result);

    // Set overall validity
    result.isValid =
      result.errors.filter((e) => e.severity === 'critical' || e.severity === 'high').length === 0;

    return result;
  }

  private static validateStructure(config: Config, result: ValidationResult): void {
    const requiredFields = [
      'orchestrator',
      'terminal',
      'memory',
      'coordination',
      'mcp',
      'logging',
      'ruvSwarm',
      'experienceLevel',
      'featureFlags',
    ];

    for (const field of requiredFields) {
      if (!config[field as keyof Config]) {
        result.errors.push({
          field,
          value: undefined,
          message: `Required field '${field}' is missing`,
          severity: 'critical',
        });
      }
    }
  }

  private static validateOrchestrator(
    orchestrator: Config['orchestrator'],
    result: ValidationResult,
  ): void {
    if (!orchestrator) return;

    if (orchestrator.maxConcurrentAgents < 1 || orchestrator.maxConcurrentAgents > 100) {
      result.errors.push({
        field: 'orchestrator.maxConcurrentAgents',
        value: orchestrator.maxConcurrentAgents,
        message: 'Must be between 1 and 100',
        severity: 'high',
        suggestion: 'Use 8-16 for most projects, up to 32 for complex systems',
      });
    }

    if (orchestrator.taskQueueSize < 10) {
      result.warnings.push({
        field: 'orchestrator.taskQueueSize',
        message: 'Very small queue size may cause bottlenecks',
        impact: 'performance',
      });
    } else if (orchestrator.taskQueueSize > 5000) {
      result.warnings.push({
        field: 'orchestrator.taskQueueSize',
        message: 'Large queue size may consume excessive memory',
        impact: 'performance',
      });
    }

    if (orchestrator.healthCheckInterval < 5000) {
      result.warnings.push({
        field: 'orchestrator.healthCheckInterval',
        message: 'Very frequent health checks may impact performance',
        impact: 'performance',
      });
    }
  }

  private static validateTerminal(terminal: Config['terminal'], result: ValidationResult): void {
    if (!terminal) return;

    const validTypes = ['auto', 'vscode', 'native'];
    if (!validTypes.includes(terminal.type)) {
      result.errors.push({
        field: 'terminal.type',
        value: terminal.type,
        message: `Must be one of: ${validTypes.join(', ')}`,
        severity: 'high',
      });
    }

    if (terminal.poolSize > 20) {
      result.warnings.push({
        field: 'terminal.poolSize',
        message: 'Large terminal pool may consume system resources',
        impact: 'performance',
      });
    }

    if (terminal.commandTimeout < 10000) {
      result.warnings.push({
        field: 'terminal.commandTimeout',
        message: 'Short timeout may interrupt long-running operations',
        impact: 'usability',
      });
    }
  }

  private static validateMemory(memory: Config['memory'], result: ValidationResult): void {
    if (!memory) return;

    const validBackends = ['sqlite', 'markdown', 'hybrid'];
    if (!validBackends.includes(memory.backend)) {
      result.errors.push({
        field: 'memory.backend',
        value: memory.backend,
        message: `Must be one of: ${validBackends.join(', ')}`,
        severity: 'high',
      });
    }

    if (memory.cacheSizeMB > 1000) {
      result.warnings.push({
        field: 'memory.cacheSizeMB',
        message: 'Large cache size may consume system memory',
        impact: 'performance',
      });
    }

    if (memory.syncInterval < 1000) {
      result.warnings.push({
        field: 'memory.syncInterval',
        message: 'Very frequent sync may impact performance',
        impact: 'performance',
      });
    }
  }

  private static validateCoordination(
    coordination: Config['coordination'],
    result: ValidationResult,
  ): void {
    if (!coordination) return;

    if (coordination.maxRetries > 10) {
      result.warnings.push({
        field: 'coordination.maxRetries',
        message: 'High retry count may cause long delays',
        impact: 'usability',
      });
    }

    if (coordination.retryDelay > 10000) {
      result.warnings.push({
        field: 'coordination.retryDelay',
        message: 'Long retry delay may slow error recovery',
        impact: 'performance',
      });
    }
  }

  private static validateMCP(mcp: Config['mcp'], result: ValidationResult): void {
    if (!mcp) return;

    const validTransports = ['stdio', 'http', 'websocket'];
    if (!validTransports.includes(mcp.transport)) {
      result.errors.push({
        field: 'mcp.transport',
        value: mcp.transport,
        message: `Must be one of: ${validTransports.join(', ')}`,
        severity: 'high',
      });
    }

    if (mcp.port < 1024 && mcp.transport !== 'stdio') {
      result.warnings.push({
        field: 'mcp.port',
        message: 'Port below 1024 requires elevated privileges',
        impact: 'security',
      });
    }

    if (mcp.transport === 'http' && !mcp.tlsEnabled) {
      result.warnings.push({
        field: 'mcp.tlsEnabled',
        message: 'HTTP transport without TLS is insecure',
        impact: 'security',
      });
    }
  }

  private static validateLogging(logging: Config['logging'], result: ValidationResult): void {
    if (!logging) return;

    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(logging.level)) {
      result.errors.push({
        field: 'logging.level',
        value: logging.level,
        message: `Must be one of: ${validLevels.join(', ')}`,
        severity: 'medium',
      });
    }

    if (logging.level === 'debug') {
      result.warnings.push({
        field: 'logging.level',
        message: 'Debug logging may impact performance and expose sensitive data',
        impact: 'performance',
      });
    }
  }

  private static validateRuvSwarm(ruvSwarm: Config['ruvSwarm'], result: ValidationResult): void {
    if (!ruvSwarm) return;

    const validTopologies = ['mesh', 'hierarchical', 'ring', 'star'];
    if (!validTopologies.includes(ruvSwarm.defaultTopology)) {
      result.errors.push({
        field: 'ruvSwarm.defaultTopology',
        value: ruvSwarm.defaultTopology,
        message: `Must be one of: ${validTopologies.join(', ')}`,
        severity: 'high',
      });
    }

    if (ruvSwarm.maxAgents > 50) {
      result.warnings.push({
        field: 'ruvSwarm.maxAgents',
        message: 'High agent count may overwhelm system resources',
        impact: 'performance',
      });
    }
  }

  private static validateClaude(claude: Config['claude'], result: ValidationResult): void {
    if (!claude) return;

    if (claude.temperature !== undefined && (claude.temperature < 0 || claude.temperature > 1)) {
      result.errors.push({
        field: 'claude.temperature',
        value: claude.temperature,
        message: 'Must be between 0 and 1',
        severity: 'medium',
      });
    }

    if (claude.maxTokens !== undefined && claude.maxTokens > 100000) {
      result.warnings.push({
        field: 'claude.maxTokens',
        message: 'Very high token limit may be expensive',
        impact: 'usability',
      });
    }

    if (claude.timeout !== undefined && claude.timeout < 30000) {
      result.warnings.push({
        field: 'claude.timeout',
        message: 'Short timeout may interrupt complex requests',
        impact: 'usability',
      });
    }
  }

  private static validatePerformance(
    performance: Config['performance'],
    result: ValidationResult,
  ): void {
    if (!performance) return;

    if (!performance.enableCaching) {
      result.suggestions.push('Enable caching for better performance');
    }

    if (performance.cacheSize > 200) {
      result.warnings.push({
        field: 'performance.cacheSize',
        message: 'Large cache size may consume excessive memory',
        impact: 'performance',
      });
    }
  }

  private static validateAutoDetection(
    autoDetection: Config['autoDetection'],
    result: ValidationResult,
  ): void {
    if (!autoDetection) return;

    if (autoDetection.confidenceThreshold > 0.9) {
      result.warnings.push({
        field: 'autoDetection.confidenceThreshold',
        message: 'High confidence threshold may reject valid detections',
        impact: 'usability',
      });
    }
  }

  private static validateExperienceLevel(config: Config, result: ValidationResult): void {
    const validLevels: ExperienceLevel[] = ['novice', 'intermediate', 'advanced', 'enterprise'];
    if (!validLevels.includes(config.experienceLevel)) {
      result.errors.push({
        field: 'experienceLevel',
        value: config.experienceLevel,
        message: `Must be one of: ${validLevels.join(', ')}`,
        severity: 'high',
      });
    }

    // Validate feature flags consistency
    if (config.experienceLevel === 'novice' && config.featureFlags?.neuralNetworks) {
      result.warnings.push({
        field: 'featureFlags.neuralNetworks',
        message: 'Neural networks enabled for novice user - may be overwhelming',
        impact: 'usability',
      });
    }
  }

  private static validateCrossFields(config: Config, result: ValidationResult): void {
    // Memory and performance consistency
    if (config.performance?.enableCaching && config.memory?.cacheSizeMB < 10) {
      result.warnings.push({
        field: 'memory.cacheSizeMB',
        message: 'Cache enabled but cache size very small',
        impact: 'performance',
      });
    }

    // Agent count consistency
    const maxAgents = config.orchestrator?.maxConcurrentAgents || 0;
    const ruvSwarmMaxAgents = config.ruvSwarm?.maxAgents || 0;
    if (maxAgents > ruvSwarmMaxAgents * 2) {
      result.warnings.push({
        field: 'orchestrator.maxConcurrentAgents',
        message: 'Orchestrator agents exceed ruv-swarm capacity significantly',
        impact: 'performance',
      });
    }
  }

  private static validateSecurity(config: Config, result: ValidationResult): void {
    // Check for potential security issues
    if (config.mcp?.transport === 'http' && !config.mcp.tlsEnabled) {
      result.warnings.push({
        field: 'mcp',
        message: 'Insecure MCP transport configuration',
        impact: 'security',
      });
    }

    if (config.logging?.level === 'debug') {
      result.warnings.push({
        field: 'logging.level',
        message: 'Debug logging may expose sensitive information',
        impact: 'security',
      });
    }
  }

  private static calculatePerformanceScore(config: Config): number {
    let score = 0;
    const weights = ConfigValidator.PERFORMANCE_WEIGHTS;

    // Caching score
    if (config.performance?.enableCaching) score += weights.caching * 0.8;
    if (config.performance?.lazyLoading) score += weights.caching * 0.2;

    // Concurrency score
    const maxAgents = config.orchestrator?.maxConcurrentAgents || 0;
    if (maxAgents >= 8 && maxAgents <= 16) score += weights.concurrency;
    else if (maxAgents >= 4 && maxAgents < 8) score += weights.concurrency * 0.7;
    else if (maxAgents > 16 && maxAgents <= 32) score += weights.concurrency * 0.8;

    // Memory score
    const cacheSize = config.memory?.cacheSizeMB || 0;
    if (cacheSize >= 50 && cacheSize <= 200) score += weights.memory;
    else if (cacheSize >= 20 && cacheSize < 50) score += weights.memory * 0.7;

    // Add other scoring logic...

    return Math.min(100, Math.max(0, score));
  }

  private static generateSuggestions(config: Config, result: ValidationResult): void {
    // Performance suggestions
    if (!config.performance?.enableCaching) {
      result.suggestions.push('Enable caching to improve performance by up to 80%');
    }

    if (config.experienceLevel === 'novice' && result.performanceScore > 80) {
      result.suggestions.push(
        'Your configuration is optimized - consider upgrading to intermediate level',
      );
    }

    if (config.ruvSwarm?.maxAgents < 8 && config.orchestrator?.maxConcurrentAgents > 8) {
      result.suggestions.push('Increase ruv-swarm max agents to match orchestrator capacity');
    }

    // Security suggestions
    if (config.mcp?.transport !== 'stdio') {
      result.suggestions.push('Consider enabling TLS for enhanced security');
    }

    // Usability suggestions
    if (config.experienceLevel === 'enterprise' && !config.featureFlags?.enterpriseIntegrations) {
      result.suggestions.push('Enable enterprise integrations for your experience level');
    }
  }

  /**
   * Quick validation for specific fields
   */
  static validateField(fieldPath: string, value: any, config?: Config): ValidationError[] {
    const errors: ValidationError[] = [];

    // Field-specific validation logic
    switch (fieldPath) {
      case 'orchestrator.maxConcurrentAgents':
        if (typeof value !== 'number' || value < 1 || value > 100) {
          errors.push({
            field: fieldPath,
            value,
            message: 'Must be a number between 1 and 100',
            severity: 'high',
          });
        }
        break;

      case 'experienceLevel':
        if (!['novice', 'intermediate', 'advanced', 'enterprise'].includes(value)) {
          errors.push({
            field: fieldPath,
            value,
            message: 'Must be one of: novice, intermediate, advanced, enterprise',
            severity: 'high',
          });
        }
        break;

      // Add more field validations as needed
    }

    return errors;
  }
}

/**
 * Convenience functions
 */
export function validateConfig(config: Config): ValidationResult {
  return ConfigValidator.validate(config);
}

export function isConfigValid(config: Config): boolean {
  const result = ConfigValidator.validate(config);
  return result.isValid;
}

export function getConfigSuggestions(config: Config): string[] {
  const result = ConfigValidator.validate(config);
  return result.suggestions;
}

export function getPerformanceScore(config: Config): number {
  const result = ConfigValidator.validate(config);
  return result.performanceScore;
}
