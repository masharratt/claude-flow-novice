/**
 * SecretsManager ES Module Wrapper
 * Bridges CommonJS SecretsManager with TypeScript ES modules
 */

interface SecretsManagerConfig {
  providers?: {
    dotenv?: {
      enabled: boolean;
      path: string;
      vaultPath: string;
      keyPath: string;
    };
    aws?: {
      enabled: boolean;
      region: string;
      secretName: string;
    };
  };
  security?: {
    minPasswordLength: number;
    requireEncryption: boolean;
    rotationIntervalDays: number;
    filePermissions: number;
  };
  validation?: {
    patterns?: {
      apiKey: RegExp;
      npmToken: RegExp;
      anthropicKey: RegExp;
      zaiKey: RegExp;
    };
    required?: string[];
  };
}

interface RotationRecord {
  key: string;
  timestamp: string;
  rotatedBy: string;
}

interface SecurityAudit {
  timestamp: string;
  secrets: {
    total: number;
    required: number;
    missing: string[];
  };
  filePermissions: Record<string, string>;
  rotation: {
    needRotation: string[];
  };
  recommendations: Array<{
    severity: string;
    message: string;
  }>;
}

/**
 * SecretsManager interface
 */
export interface ISecretsManager {
  initialize(): Promise<void>;
  getSecret(key: string, defaultValue?: string | null): string | null;
  setSecret(key: string, value: string): void;
  saveSecret(key: string, value: string): Promise<void>;
  validateApiKey(key: string, value: string): boolean;
  validateRequiredSecrets(): void;
  validateFilePermissions(): Promise<void>;
  rotateApiKey(key: string, newValue: string): Promise<boolean>;
  checkRotationRequired(): Promise<string[]>;
  generateRedisPassword(): string;
  initializeRedisAuth(): Promise<string>;
  generateSecurityAudit(): Promise<SecurityAudit>;
}

/**
 * Lazy-loaded SecretsManager singleton
 */
let secretsManagerInstance: ISecretsManager | null = null;

/**
 * Get or create SecretsManager instance
 */
export async function getSecretsManager(): Promise<ISecretsManager> {
  if (!secretsManagerInstance) {
    // Dynamic import of CommonJS module
    const { getSecretsManager: getManagerCJS } = await import('../security/SecretsManager.cjs');
    secretsManagerInstance = getManagerCJS();
  }
  return secretsManagerInstance;
}

/**
 * Validate API key format
 */
export async function validateApiKey(key: string, value: string): Promise<{
  valid: boolean;
  message: string;
}> {
  const manager = await getSecretsManager();

  try {
    const valid = manager.validateApiKey(key, value);

    if (!valid) {
      const messages: Record<string, string> = {
        NPM_API_KEY: 'NPM token must be in format: npm_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (36 chars)',
        ANTHROPIC_API_KEY: 'Anthropic key must be in format: sk-ant-api03-XXXXX... (95 chars after prefix)',
        Z_AI_API_KEY: 'Z.AI key must be in format: 32 hex chars + dot + 16 alphanumeric chars',
        ZAI_API_KEY: 'Z.AI key must be in format: 32 hex chars + dot + 16 alphanumeric chars',
      };

      return {
        valid: false,
        message: messages[key] || 'API key format is invalid',
      };
    }

    return {
      valid: true,
      message: 'API key format is valid',
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Validation error',
    };
  }
}

/**
 * Initialize SecretsManager and validate required secrets
 */
export async function initializeSecretsManager(): Promise<{
  initialized: boolean;
  missing: string[];
  warnings: string[];
}> {
  try {
    const manager = await getSecretsManager();
    await manager.initialize();

    const audit = await manager.generateSecurityAudit();

    return {
      initialized: true,
      missing: audit.secrets.missing,
      warnings: audit.recommendations
        .filter(r => r.severity === 'HIGH' || r.severity === 'MEDIUM')
        .map(r => r.message),
    };
  } catch (error) {
    return {
      initialized: false,
      missing: [],
      warnings: [error instanceof Error ? error.message : 'Initialization failed'],
    };
  }
}

/**
 * Check if API keys need rotation
 */
export async function checkKeyRotation(): Promise<{
  needRotation: string[];
  rotationIntervalDays: number;
}> {
  const manager = await getSecretsManager();
  const needRotation = await manager.checkRotationRequired();

  return {
    needRotation,
    rotationIntervalDays: 90, // From SECRETS_CONFIG
  };
}

/**
 * Get security audit report
 */
export async function getSecurityAudit(): Promise<SecurityAudit> {
  const manager = await getSecretsManager();
  return await manager.generateSecurityAudit();
}

/**
 * Save API key securely
 */
export async function saveApiKey(key: string, value: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const validation = await validateApiKey(key, value);

    if (!validation.valid) {
      return {
        success: false,
        message: validation.message,
      };
    }

    const manager = await getSecretsManager();
    await manager.saveSecret(key, value);

    return {
      success: true,
      message: `${key} saved securely`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Save failed',
    };
  }
}

/**
 * Export types
 */
export type {
  SecretsManagerConfig,
  RotationRecord,
  SecurityAudit,
};
