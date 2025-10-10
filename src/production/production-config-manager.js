/**
 * Production Configuration Management
 *
 * Manages environment-specific configurations for production deployments
 * with Redis-backed state management and secure configuration handling
 */

import Redis from "ioredis";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

class ProductionConfigManager {
  constructor(options = {}) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });

    this.swarmId = 'phase-6-production-deployment';
    this.configChannel = 'swarm:phase-6:config';

    this.environments = {
      development: {
        databaseUrl: process.env.DEV_DATABASE_URL || 'mongodb://localhost:27017/claude-flow-dev',
        redisUrl: process.env.DEV_REDIS_URL || 'redis://localhost:6379',
        logLevel: 'debug',
        apiPort: 3000,
        maxConnections: 100,
        sslEnabled: false
      },
      staging: {
        databaseUrl: process.env.STAGING_DATABASE_URL,
        redisUrl: process.env.STAGING_REDIS_URL,
        logLevel: 'info',
        apiPort: 3000,
        maxConnections: 500,
        sslEnabled: true
      },
      production: {
        databaseUrl: process.env.PROD_DATABASE_URL,
        redisUrl: process.env.PROD_REDIS_URL,
        logLevel: 'warn',
        apiPort: 443,
        maxConnections: 1000,
        sslEnabled: true
      }
    };

    this.configVersion = '1.0.0';
    this.encryptionKey = process.env.CONFIG_ENCRYPTION_KEY || this.generateEncryptionKey();
    this.currentEnvironment = options.environment || 'production';
  }

  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  encryptValue(value) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.encryptionKey, 'hex').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    cipher.setAAD(Buffer.from('production-config'));

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decryptValue(encryptedData) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.encryptionKey, 'hex').slice(0, 32);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAAD(Buffer.from('production-config'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async publishConfigEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      swarmId: this.swarmId,
      environment: this.currentEnvironment,
      data: data
    };

    await this.redis.publish(this.configChannel, JSON.stringify(event));
    await this.redis.setex(
      `swarm:${this.swarmId}:config:${eventType}`,
      3600,
      JSON.stringify(event)
    );
  }

  async loadConfiguration(environment = this.currentEnvironment) {
    await this.publishConfigEvent('config_load_started', { environment });

    try {
      // Load base configuration
      const baseConfig = this.environments[environment];
      if (!baseConfig) {
        throw new Error(`Environment ${environment} not found`);
      }

      // Load environment-specific overrides
      const overrides = await this.loadEnvironmentOverrides(environment);

      // Load secrets from secure storage
      const secrets = await this.loadSecrets(environment);

      // Merge configurations
      const mergedConfig = this.mergeConfigurations(baseConfig, overrides, secrets);

      // Validate configuration
      const validation = await this.validateConfiguration(mergedConfig, environment);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      // Store configuration in Redis with versioning
      const configVersion = await this.storeConfigurationVersion(mergedConfig, environment);

      const result = {
        environment,
        version: configVersion,
        configuration: mergedConfig,
        validation,
        loadedAt: new Date().toISOString()
      };

      await this.publishConfigEvent('config_loaded', result);
      return result;

    } catch (error) {
      await this.publishConfigEvent('config_load_failed', {
        environment,
        error: error.message
      });
      throw error;
    }
  }

  async loadEnvironmentOverrides(environment) {
    const overrideFile = `config/overrides/${environment}.json`;

    try {
      const overrideData = await fs.readFile(overrideFile, 'utf8');
      const overrides = JSON.parse(overrideData);

      await this.publishConfigEvent('overrides_loaded', {
        environment,
        file: overrideFile,
        overridesCount: Object.keys(overrides).length
      });

      return overrides;
    } catch (error) {
      // No overrides file found, return empty object
      await this.publishConfigEvent('overrides_not_found', { environment, file: overrideFile });
      return {};
    }
  }

  async loadSecrets(environment) {
    // Load secrets from environment variables or secure storage
    const secrets = {
      databasePassword: process.env[`${environment.toUpperCase()}_DB_PASSWORD`],
      redisPassword: process.env[`${environment.toUpperCase()}_REDIS_PASSWORD`],
      jwtSecret: process.env[`${environment.toUpperCase()}_JWT_SECRET`],
      apiKeys: await this.loadApiKeys(environment),
      certificates: await this.loadCertificates(environment)
    };

    // Encrypt sensitive values
    const encryptedSecrets = {};
    for (const [key, value] of Object.entries(secrets)) {
      if (value && typeof value === 'string') {
        encryptedSecrets[key] = this.encryptValue(value);
      } else if (value && typeof value === 'object') {
        encryptedSecrets[key] = value;
      }
    }

    await this.publishConfigEvent('secrets_loaded', {
      environment,
      secretsCount: Object.keys(secrets).length,
      encryptedCount: Object.keys(encryptedSecrets).length
    });

    return encryptedSecrets;
  }

  async loadApiKeys(environment) {
    // Load API keys from secure storage or environment
    const apiKeys = {
      openai: process.env[`${environment.toUpperCase()}_OPENAI_API_KEY`],
      aws: process.env[`${environment.toUpperCase()}_AWS_ACCESS_KEY`],
      monitoring: process.env[`${environment.toUpperCase()}_MONITORING_API_KEY`]
    };

    // Filter out undefined values
    return Object.fromEntries(
      Object.entries(apiKeys).filter(([_, value]) => value !== undefined)
    );
  }

  async loadCertificates(environment) {
    // Load SSL certificates for production environments
    if (environment !== 'production') {
      return {};
    }

    const certificates = {
      sslCert: await this.loadCertificateFile('ssl/cert.pem'),
      sslKey: await this.loadCertificateFile('ssl/key.pem'),
      sslChain: await this.loadCertificateFile('ssl/chain.pem')
    };

    // Filter out undefined values
    return Object.fromEntries(
      Object.entries(certificates).filter(([_, value]) => value !== undefined)
    );
  }

  async loadCertificateFile(filePath) {
    try {
      const certData = await fs.readFile(filePath, 'utf8');
      return certData;
    } catch (error) {
      return undefined;
    }
  }

  mergeConfigurations(baseConfig, overrides, secrets) {
    const merged = {
      ...baseConfig,
      ...overrides,
      secrets: secrets,
      metadata: {
        version: this.configVersion,
        environment: this.currentEnvironment,
        mergedAt: new Date().toISOString(),
        components: ['base', 'overrides', 'secrets']
      }
    };

    return merged;
  }

  async validateConfiguration(config, environment) {
    const errors = [];
    const warnings = [];

    // Required configuration fields
    const requiredFields = [
      'databaseUrl',
      'redisUrl',
      'logLevel',
      'apiPort'
    ];

    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Environment-specific validations
    if (environment === 'production') {
      if (!config.sslEnabled) {
        errors.push('SSL must be enabled in production');
      }
      if (!config.secrets || !config.secrets.jwtSecret) {
        errors.push('JWT secret is required in production');
      }
      if (config.logLevel === 'debug') {
        warnings.push('Debug logging should not be used in production');
      }
    }

    // Configuration format validations
    if (config.apiPort && (config.apiPort < 1 || config.apiPort > 65535)) {
      errors.push('Invalid API port number');
    }

    if (config.maxConnections && (config.maxConnections < 1 || config.maxConnections > 10000)) {
      warnings.push('Max connections value is outside recommended range');
    }

    // URL format validations
    const urlFields = ['databaseUrl', 'redisUrl'];
    for (const field of urlFields) {
      if (config[field] && !this.isValidUrl(config[field])) {
        errors.push(`Invalid URL format for ${field}`);
      }
    }

    const validation = {
      valid: errors.length === 0,
      errors,
      warnings,
      environment,
      validatedAt: new Date().toISOString()
    };

    await this.publishConfigEvent('config_validated', validation);
    return validation;
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  async storeConfigurationVersion(config, environment) {
    const version = this.configVersion;
    const configKey = `swarm:${this.swarmId}:config:${environment}:${version}`;

    await this.redis.setex(configKey, 86400, JSON.stringify(config));

    // Also store as latest
    const latestKey = `swarm:${this.swarmId}:config:${environment}:latest`;
    await this.redis.setex(latestKey, 86400, JSON.stringify({
      version,
      config,
      storedAt: new Date().toISOString()
    }));

    await this.publishConfigEvent('config_stored', {
      environment,
      version,
      configKey
    });

    return version;
  }

  async getConfiguration(environment = this.currentEnvironment, version = 'latest') {
    const configKey = `swarm:${this.swarmId}:config:${environment}:${version}`;

    try {
      const configData = await this.redis.get(configKey);

      if (!configData) {
        throw new Error(`Configuration not found for ${environment}:${version}`);
      }

      const config = JSON.parse(configData);

      await this.publishConfigEvent('config_retrieved', {
        environment,
        version,
        configSize: JSON.stringify(config).length
      });

      return config;
    } catch (error) {
      await this.publishConfigEvent('config_retrieval_failed', {
        environment,
        version,
        error: error.message
      });
      throw error;
    }
  }

  async updateConfiguration(updates, environment = this.currentEnvironment) {
    await this.publishConfigEvent('config_update_started', {
      environment,
      updates: Object.keys(updates)
    });

    try {
      // Load current configuration
      const current = await this.getConfiguration(environment);

      // Apply updates
      const updated = {
        ...current,
        ...updates,
        metadata: {
          ...current.metadata,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'production-deployment'
        }
      };

      // Validate updated configuration
      const validation = await this.validateConfiguration(updated, environment);
      if (!validation.valid) {
        throw new Error(`Configuration update validation failed: ${validation.errors.join(', ')}`);
      }

      // Store new version
      const newVersion = await this.storeConfigurationVersion(updated, environment);

      const result = {
        environment,
        previousVersion: current.metadata.version,
        newVersion,
        updates,
        validation,
        updatedAt: new Date().toISOString()
      };

      await this.publishConfigEvent('config_updated', result);
      return result;

    } catch (error) {
      await this.publishConfigEvent('config_update_failed', {
        environment,
        error: error.message
      });
      throw error;
    }
  }

  async rollbackConfiguration(environment = this.currentEnvironment, targetVersion) {
    await this.publishConfigEvent('config_rollback_started', {
      environment,
      targetVersion
    });

    try {
      // Load target version
      const targetConfig = await this.getConfiguration(environment, targetVersion);

      // Get current version for reference
      const current = await this.getConfiguration(environment);

      // Store rollback as new version
      const rollbackConfig = {
        ...targetConfig,
        metadata: {
          ...targetConfig.metadata,
          rolledBackFrom: current.metadata.version,
          rolledBackAt: new Date().toISOString(),
          rolledBackBy: 'production-deployment'
        }
      };

      const rollbackVersion = await this.storeConfigurationVersion(rollbackConfig, environment);

      const result = {
        environment,
        previousVersion: current.metadata.version,
        targetVersion,
        rollbackVersion,
        rolledBackAt: new Date().toISOString()
      };

      await this.publishConfigEvent('config_rollback_completed', result);
      return result;

    } catch (error) {
      await this.publishConfigEvent('config_rollback_failed', {
        environment,
        targetVersion,
        error: error.message
      });
      throw error;
    }
  }

  async exportConfiguration(environment = this.currentEnvironment, outputPath) {
    try {
      const config = await this.getConfiguration(environment);

      // Create export with sanitized secrets
      const exportData = {
        ...config,
        secrets: this.sanitizeSecretsForExport(config.secrets),
        exportedAt: new Date().toISOString(),
        exportedBy: 'production-deployment'
      };

      await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));

      await this.publishConfigEvent('config_exported', {
        environment,
        outputPath,
        fileSize: JSON.stringify(exportData).length
      });

      return exportData;
    } catch (error) {
      await this.publishConfigEvent('config_export_failed', {
        environment,
        outputPath,
        error: error.message
      });
      throw error;
    }
  }

  sanitizeSecretsForExport(secrets) {
    const sanitized = {};

    for (const [key, value] of Object.entries(secrets)) {
      if (value && typeof value === 'object' && value.encrypted) {
        sanitized[key] = '[ENCRYPTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  async cleanup() {
    await this.redis.quit();
  }
}

export default ProductionConfigManager;