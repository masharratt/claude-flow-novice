/**
 * Phase 4 Environment Configuration
 * Manages environment-specific feature flag settings
 */

export interface Phase4EnvironmentConfig {
  // Truth-based validation settings
  TRUTH_VALIDATION_ENABLED: boolean;
  TRUTH_ROLLOUT_PERCENTAGE: number;
  TRUTH_VALIDATION_THRESHOLD: number;

  // Byzantine consensus settings
  BYZANTINE_CONSENSUS_ENABLED: boolean;
  BYZANTINE_ROLLOUT_PERCENTAGE: number;
  MAX_CONSENSUS_AGENTS: number;
  CONSENSUS_THRESHOLD: number;

  // Hook interception settings
  HOOK_INTERCEPTION_ENABLED: boolean;
  HOOK_ROLLOUT_PERCENTAGE: number;
  AUTO_RELAUNCH_ENABLED: boolean;
  MAX_RELAUNCH_ATTEMPTS: number;

  // Monitoring settings
  MONITORING_ENABLED: boolean;
  MONITORING_INTERVAL_MS: number;
  ALERT_WEBHOOK_URL?: string;
  DASHBOARD_PORT: number;

  // Rollout settings
  ROLLOUT_AUTO_PROGRESS: boolean;
  ROLLOUT_ERROR_THRESHOLD: number;
  ROLLOUT_SUCCESS_THRESHOLD: number;
  EMERGENCY_DISABLE_THRESHOLD: number;

  // Performance settings
  PERFORMANCE_MONITORING: boolean;
  MEMORY_THRESHOLD_MB: number;
  CPU_THRESHOLD_PERCENT: number;
  RESPONSE_TIME_THRESHOLD_MS: number;

  // Security settings
  VALIDATION_SIGNATURE_REQUIRED: boolean;
  CONSENSUS_CRYPTO_ENABLED: boolean;
  AUDIT_LOGGING_ENABLED: boolean;
}

export const DEFAULT_PHASE4_CONFIG: Phase4EnvironmentConfig = {
  // Truth-based validation
  TRUTH_VALIDATION_ENABLED: false,
  TRUTH_ROLLOUT_PERCENTAGE: 10,
  TRUTH_VALIDATION_THRESHOLD: 0.7,

  // Byzantine consensus
  BYZANTINE_CONSENSUS_ENABLED: false,
  BYZANTINE_ROLLOUT_PERCENTAGE: 10,
  MAX_CONSENSUS_AGENTS: 5,
  CONSENSUS_THRESHOLD: 0.6,

  // Hook interception
  HOOK_INTERCEPTION_ENABLED: false,
  HOOK_ROLLOUT_PERCENTAGE: 10,
  AUTO_RELAUNCH_ENABLED: true,
  MAX_RELAUNCH_ATTEMPTS: 3,

  // Monitoring
  MONITORING_ENABLED: true,
  MONITORING_INTERVAL_MS: 30000,
  DASHBOARD_PORT: 3001,

  // Rollout
  ROLLOUT_AUTO_PROGRESS: true,
  ROLLOUT_ERROR_THRESHOLD: 0.01,
  ROLLOUT_SUCCESS_THRESHOLD: 0.95,
  EMERGENCY_DISABLE_THRESHOLD: 0.05,

  // Performance
  PERFORMANCE_MONITORING: true,
  MEMORY_THRESHOLD_MB: 512,
  CPU_THRESHOLD_PERCENT: 80,
  RESPONSE_TIME_THRESHOLD_MS: 1000,

  // Security
  VALIDATION_SIGNATURE_REQUIRED: true,
  CONSENSUS_CRYPTO_ENABLED: true,
  AUDIT_LOGGING_ENABLED: true
};

export class Phase4Environment {
  private config: Phase4EnvironmentConfig;
  private environment: string;

  constructor(environment: string = process.env.NODE_ENV || 'development') {
    this.environment = environment;
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): Phase4EnvironmentConfig {
    const config = { ...DEFAULT_PHASE4_CONFIG };

    // Override with environment variables
    Object.keys(config).forEach(key => {
      const envValue = process.env[key];
      if (envValue !== undefined) {
        const configKey = key as keyof Phase4EnvironmentConfig;

        if (typeof config[configKey] === 'boolean') {
          (config as any)[configKey] = envValue.toLowerCase() === 'true';
        } else if (typeof config[configKey] === 'number') {
          const parsed = parseFloat(envValue);
          if (!isNaN(parsed)) {
            (config as any)[configKey] = parsed;
          }
        } else {
          (config as any)[configKey] = envValue;
        }
      }
    });

    // Environment-specific overrides
    this.applyEnvironmentOverrides(config);

    return config;
  }

  private applyEnvironmentOverrides(config: Phase4EnvironmentConfig): void {
    switch (this.environment) {
      case 'development':
        // More permissive thresholds for development
        config.ROLLOUT_ERROR_THRESHOLD = 0.05;
        config.ROLLOUT_SUCCESS_THRESHOLD = 0.8;
        config.MONITORING_INTERVAL_MS = 10000; // 10 seconds
        break;

      case 'staging':
        // Closer to production settings
        config.ROLLOUT_ERROR_THRESHOLD = 0.02;
        config.ROLLOUT_SUCCESS_THRESHOLD = 0.9;
        config.MONITORING_INTERVAL_MS = 15000; // 15 seconds
        break;

      case 'production':
        // Strict production settings
        config.ROLLOUT_ERROR_THRESHOLD = 0.01;
        config.ROLLOUT_SUCCESS_THRESHOLD = 0.95;
        config.EMERGENCY_DISABLE_THRESHOLD = 0.02;
        config.ROLLOUT_AUTO_PROGRESS = false; // Manual approval in production
        break;

      case 'test':
        // Fast settings for testing
        config.MONITORING_INTERVAL_MS = 1000; // 1 second
        config.ROLLOUT_ERROR_THRESHOLD = 0.1;
        config.ROLLOUT_SUCCESS_THRESHOLD = 0.5;
        break;
    }
  }

  get(key: keyof Phase4EnvironmentConfig): any {
    return this.config[key];
  }

  getAll(): Phase4EnvironmentConfig {
    return { ...this.config };
  }

  isEnabled(feature: 'validation' | 'consensus' | 'hooks' | 'monitoring'): boolean {
    switch (feature) {
      case 'validation':
        return this.config.TRUTH_VALIDATION_ENABLED;
      case 'consensus':
        return this.config.BYZANTINE_CONSENSUS_ENABLED;
      case 'hooks':
        return this.config.HOOK_INTERCEPTION_ENABLED;
      case 'monitoring':
        return this.config.MONITORING_ENABLED;
      default:
        return false;
    }
  }

  getRolloutPercentage(feature: 'validation' | 'consensus' | 'hooks'): number {
    switch (feature) {
      case 'validation':
        return this.config.TRUTH_ROLLOUT_PERCENTAGE;
      case 'consensus':
        return this.config.BYZANTINE_ROLLOUT_PERCENTAGE;
      case 'hooks':
        return this.config.HOOK_ROLLOUT_PERCENTAGE;
      default:
        return 0;
    }
  }

  /**
   * Generate environment configuration for display/debugging
   */
  generateConfigSummary(): any {
    return {
      environment: this.environment,
      features: {
        truthValidation: {
          enabled: this.config.TRUTH_VALIDATION_ENABLED,
          rollout: this.config.TRUTH_ROLLOUT_PERCENTAGE + '%',
          threshold: this.config.TRUTH_VALIDATION_THRESHOLD
        },
        byzantineConsensus: {
          enabled: this.config.BYZANTINE_CONSENSUS_ENABLED,
          rollout: this.config.BYZANTINE_ROLLOUT_PERCENTAGE + '%',
          maxAgents: this.config.MAX_CONSENSUS_AGENTS,
          threshold: this.config.CONSENSUS_THRESHOLD
        },
        hookInterception: {
          enabled: this.config.HOOK_INTERCEPTION_ENABLED,
          rollout: this.config.HOOK_ROLLOUT_PERCENTAGE + '%',
          autoRelaunch: this.config.AUTO_RELAUNCH_ENABLED,
          maxAttempts: this.config.MAX_RELAUNCH_ATTEMPTS
        }
      },
      monitoring: {
        enabled: this.config.MONITORING_ENABLED,
        interval: this.config.MONITORING_INTERVAL_MS + 'ms',
        dashboardPort: this.config.DASHBOARD_PORT
      },
      rollout: {
        autoProgress: this.config.ROLLOUT_AUTO_PROGRESS,
        errorThreshold: (this.config.ROLLOUT_ERROR_THRESHOLD * 100) + '%',
        successThreshold: (this.config.ROLLOUT_SUCCESS_THRESHOLD * 100) + '%'
      },
      security: {
        signatureRequired: this.config.VALIDATION_SIGNATURE_REQUIRED,
        cryptoEnabled: this.config.CONSENSUS_CRYPTO_ENABLED,
        auditLogging: this.config.AUDIT_LOGGING_ENABLED
      }
    };
  }

  /**
   * Validate configuration for potential issues
   */
  validateConfiguration(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check rollout percentages
    if (this.config.TRUTH_ROLLOUT_PERCENTAGE > 25) {
      issues.push('Truth validation rollout exceeds Phase 4 limit of 25%');
    }

    if (this.config.BYZANTINE_ROLLOUT_PERCENTAGE > 25) {
      issues.push('Byzantine consensus rollout exceeds Phase 4 limit of 25%');
    }

    if (this.config.HOOK_ROLLOUT_PERCENTAGE > 25) {
      issues.push('Hook interception rollout exceeds Phase 4 limit of 25%');
    }

    // Check thresholds
    if (this.config.ROLLOUT_ERROR_THRESHOLD >= this.config.EMERGENCY_DISABLE_THRESHOLD) {
      issues.push('Rollout error threshold should be less than emergency disable threshold');
    }

    if (this.config.ROLLOUT_SUCCESS_THRESHOLD <= 0.5) {
      issues.push('Success threshold is too low and may cause instability');
    }

    // Check monitoring settings
    if (this.config.MONITORING_INTERVAL_MS < 5000 && this.environment === 'production') {
      issues.push('Monitoring interval too frequent for production environment');
    }

    // Check consensus settings
    if (this.config.MAX_CONSENSUS_AGENTS > 10) {
      issues.push('Too many consensus agents may impact performance');
    }

    if (this.config.CONSENSUS_THRESHOLD > 0.9) {
      issues.push('Consensus threshold too high may prevent agreement');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

/**
 * Export environment configuration presets
 */
export const PHASE4_PRESETS = {
  CONSERVATIVE: {
    ...DEFAULT_PHASE4_CONFIG,
    TRUTH_ROLLOUT_PERCENTAGE: 5,
    BYZANTINE_ROLLOUT_PERCENTAGE: 5,
    HOOK_ROLLOUT_PERCENTAGE: 5,
    ROLLOUT_ERROR_THRESHOLD: 0.005,
    ROLLOUT_AUTO_PROGRESS: false
  },

  AGGRESSIVE: {
    ...DEFAULT_PHASE4_CONFIG,
    TRUTH_ROLLOUT_PERCENTAGE: 25,
    BYZANTINE_ROLLOUT_PERCENTAGE: 25,
    HOOK_ROLLOUT_PERCENTAGE: 25,
    ROLLOUT_ERROR_THRESHOLD: 0.02,
    ROLLOUT_AUTO_PROGRESS: true
  },

  TESTING: {
    ...DEFAULT_PHASE4_CONFIG,
    TRUTH_VALIDATION_ENABLED: true,
    BYZANTINE_CONSENSUS_ENABLED: true,
    HOOK_INTERCEPTION_ENABLED: true,
    TRUTH_ROLLOUT_PERCENTAGE: 100,
    BYZANTINE_ROLLOUT_PERCENTAGE: 100,
    HOOK_ROLLOUT_PERCENTAGE: 100,
    MONITORING_INTERVAL_MS: 1000
  }
};