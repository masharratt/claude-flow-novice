/**
 * Configuration Switcher for Dev/Prod Environments
 * Provides easy switching between development and production configurations
 */

import { developmentConfig, productionConfig, isDevelopment, isProduction } from '../../config/development-server.js';
import { DevelopmentMode } from './development-mode.js';
import { WebSocketDebugger } from '../websocket/websocket-debugger.js';
import { ConnectionStatusManager } from './connection-status.js';
import { RealTimeTestingSuite } from './testing-utils.js';

export class ConfigurationSwitcher {
  constructor(app, server, options = {}) {
    this.app = app;
    this.server = server;
    this.options = {
      configFile: options.configFile || './config/current-env.json',
      autoDetect: options.autoDetect ?? true,
      allowHotSwap: options.allowHotSwap ?? true,
      ...options
    };

    this.currentEnvironment = 'development';
    this.currentConfig = developmentConfig;
    this.configHistory = [];
    this.developmentMode = null;
    this.components = {
      webSocketDebugger: null,
      connectionStatusManager: null,
      testingSuite: null
    };

    this.initialize();
  }

  /**
   * Initialize the configuration switcher
   */
  async initialize() {
    // Auto-detect environment if enabled
    if (this.options.autoDetect) {
      this.autoDetectEnvironment();
    }

    // Load saved configuration if exists
    await this.loadSavedConfiguration();

    // Apply current configuration
    await this.applyConfiguration(this.currentEnvironment);

    // Setup configuration management routes
    this.setupConfigurationRoutes();

    console.log(`🔧 Configuration switcher initialized - Environment: ${this.currentEnvironment}`);
  }

  /**
   * Auto-detect current environment
   */
  autoDetectEnvironment() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const devMode = process.env.DEV_MODE || process.env.DEVELOPMENT;

    if (nodeEnv === 'production' || isProduction) {
      this.currentEnvironment = 'production';
      this.currentConfig = productionConfig;
    } else if (nodeEnv === 'development' || devMode || isDevelopment) {
      this.currentEnvironment = 'development';
      this.currentConfig = developmentConfig;
    } else {
      this.currentEnvironment = 'development'; // Default to development
      this.currentConfig = developmentConfig;
    }
  }

  /**
   * Load saved configuration from file
   */
  async loadSavedConfiguration() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const configFile = path.resolve(this.options.configFile);
      const configData = await fs.readFile(configFile, 'utf8');
      const savedConfig = JSON.parse(configData);

      if (savedConfig.environment && this.isValidEnvironment(savedConfig.environment)) {
        this.currentEnvironment = savedConfig.environment;
        this.currentConfig = this.getConfigurationForEnvironment(savedConfig.environment);
        console.log(`📁 Loaded saved configuration: ${this.currentEnvironment}`);
      }
    } catch (error) {
      // File doesn't exist or is invalid, use current detection
      console.log('📝 No saved configuration found, using auto-detected environment');
    }
  }

  /**
   * Save current configuration to file
   */
  async saveConfiguration() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const configData = {
        environment: this.currentEnvironment,
        timestamp: new Date().toISOString(),
        config: this.currentConfig,
        history: this.configHistory.slice(-10) // Keep last 10 changes
      };

      const configFile = path.resolve(this.options.configFile);
      await fs.writeFile(configFile, JSON.stringify(configData, null, 2));

      console.log(`💾 Configuration saved: ${this.currentEnvironment}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to save configuration:', error.message);
      return false;
    }
  }

  /**
   * Switch to a different environment
   */
  async switchEnvironment(targetEnvironment, options = {}) {
    if (!this.isValidEnvironment(targetEnvironment)) {
      throw new Error(`Invalid environment: ${targetEnvironment}. Valid environments: ${this.getValidEnvironments().join(', ')}`);
    }

    if (targetEnvironment === this.currentEnvironment && !options.force) {
      console.log(`⚠️  Already in ${targetEnvironment} environment`);
      return false;
    }

    console.log(`🔄 Switching from ${this.currentEnvironment} to ${targetEnvironment}...`);

    const oldEnvironment = this.currentEnvironment;
    const oldConfig = this.currentConfig;

    try {
      // Record the change
      this.configHistory.push({
        from: oldEnvironment,
        to: targetEnvironment,
        timestamp: Date.now(),
        reason: options.reason || 'manual switch',
        options
      });

      // Cleanup current environment components
      await this.cleanupCurrentEnvironment();

      // Switch configuration
      this.currentEnvironment = targetEnvironment;
      this.currentConfig = this.getConfigurationForEnvironment(targetEnvironment);

      // Apply new configuration
      await this.applyConfiguration(targetEnvironment, options);

      // Save the change
      if (options.save !== false) {
        await this.saveConfiguration();
      }

      console.log(`✅ Successfully switched to ${targetEnvironment} environment`);
      this.emit('environment:switched', {
        from: oldEnvironment,
        to: targetEnvironment,
        config: this.currentConfig
      });

      return true;
    } catch (error) {
      console.error(`❌ Failed to switch to ${targetEnvironment}:`, error.message);

      // Rollback on failure
      try {
        this.currentEnvironment = oldEnvironment;
        this.currentConfig = oldConfig;
        await this.applyConfiguration(oldEnvironment, { silent: true });
        console.log(`🔙 Rolled back to ${oldEnvironment} environment`);
      } catch (rollbackError) {
        console.error('❌ Critical: Failed to rollback configuration:', rollbackError.message);
      }

      throw error;
    }
  }

  /**
   * Apply configuration for a specific environment
   */
  async applyConfiguration(environment, options = {}) {
    const config = this.getConfigurationForEnvironment(environment);
    const silent = options.silent || false;

    if (!silent) {
      console.log(`⚙️  Applying ${environment} configuration...`);
    }

    // Update environment variables
    process.env.NODE_ENV = environment;
    process.env.ENVIRONMENT = environment;

    // Apply server configuration
    if (this.server) {
      this.applyServerConfiguration(config);
    }

    // Apply development or production specific components
    if (environment === 'development') {
      await this.applyDevelopmentConfiguration(config);
    } else if (environment === 'production') {
      await this.applyProductionConfiguration(config);
    }

    // Apply common configuration
    this.applyCommonConfiguration(config);

    if (!silent) {
      console.log(`✅ ${environment} configuration applied successfully`);
    }
  }

  /**
   * Apply server-specific configuration
   */
  applyServerConfiguration(config) {
    // Update server settings if possible
    if (this.server && this.server.listening) {
      const currentPort = this.server.address().port;
      const targetPort = config.server.port;

      if (currentPort !== targetPort) {
        console.warn(`⚠️  Port mismatch: current=${currentPort}, target=${targetPort}. Restart required for port change.`);
      }
    }
  }

  /**
   * Apply development configuration
   */
  async applyDevelopmentConfiguration(config) {
    // Initialize development mode
    if (!this.developmentMode) {
      this.developmentMode = new DevelopmentMode(this.app, this.server, {
        enabled: true,
        debugMode: true,
        bypassAuth: true,
        mockData: true,
        autoReload: true,
        enhancedLogging: true
      });
    }

    // Initialize development components
    this.components.webSocketDebugger = new WebSocketDebugger({
      enabled: true,
      logLevel: 'debug',
      maxHistory: 1000
    });

    this.components.connectionStatusManager = new ConnectionStatusManager({
      heartbeatInterval: 5000,
      connectionTimeout: 15000,
      statusUpdateInterval: 1000
    });

    this.components.testingSuite = new RealTimeTestingSuite({
      defaultTimeout: 10000,
      maxConnections: 100,
      messageInterval: 100,
      testDuration: 30000,
      logLevel: 'debug'
    });

    console.log('🛠️  Development components initialized');
  }

  /**
   * Apply production configuration
   */
  async applyProductionConfiguration(config) {
    // Cleanup development components
    if (this.developmentMode) {
      this.developmentMode.stop();
      this.developmentMode = null;
    }

    // Cleanup development-specific components
    Object.values(this.components).forEach(component => {
      if (component && typeof component.stop === 'function') {
        component.stop();
      }
    });

    this.components = {
      webSocketDebugger: null,
      connectionStatusManager: null,
      testingSuite: null
    };

    // Apply production security settings
    this.applyProductionSecurity(config);

    console.log('🏭 Production configuration applied');
  }

  /**
   * Apply production security settings
   */
  applyProductionSecurity(config) {
    // Add production security middleware
    this.app.use((req, res, next) => {
      // Production headers
      res.set('X-Environment', 'production');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('X-Frame-Options', 'DENY');
      res.set('X-XSS-Protection', '1; mode=block');
      res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      // Apply production CSP
      if (config.csp && config.csp.production) {
        const csp = config.csp.production.directives;
        const cspString = Object.entries(csp)
          .map(([key, values]) => `${key} ${values.join(' ')}`)
          .join('; ');
        res.set('Content-Security-Policy', cspString);
      }

      next();
    });
  }

  /**
   * Apply common configuration
   */
  applyCommonConfiguration(config) {
    // Apply common middleware
    this.app.use((req, res, next) => {
      res.set('X-Server-Environment', this.currentEnvironment);
      res.set('X-Server-Timestamp', new Date().toISOString());
      next();
    });

    // Apply CORS settings
    if (config.server && config.server.cors) {
      this.app.use((req, res, next) => {
        const cors = config.server.cors;
        if (cors.origin) {
          res.set('Access-Control-Allow-Origin', Array.isArray(cors.origin) ? cors.origin.join(', ') : cors.origin);
        }
        if (cors.methods) {
          res.set('Access-Control-Allow-Methods', cors.methods.join(', '));
        }
        if (cors.allowedHeaders) {
          res.set('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
        }
        next();
      });
    }
  }

  /**
   * Cleanup current environment components
   */
  async cleanupCurrentEnvironment() {
    if (this.developmentMode) {
      this.developmentMode.stop();
    }

    Object.values(this.components).forEach(component => {
      if (component && typeof component.stop === 'function') {
        component.stop();
      }
    });
  }

  /**
   * Setup configuration management routes
   */
  setupConfigurationRoutes() {
    // Get current configuration
    this.app.get('/api/config/environment', (req, res) => {
      res.json({
        current: this.currentEnvironment,
        config: this.sanitizeConfig(this.currentConfig),
        available: this.getValidEnvironments(),
        history: this.configHistory.slice(-10),
        components: {
          developmentMode: !!this.developmentMode,
          webSocketDebugger: !!this.components.webSocketDebugger,
          connectionStatusManager: !!this.components.connectionStatusManager,
          testingSuite: !!this.components.testingSuite
        },
        timestamp: new Date().toISOString()
      });
    });

    // Switch environment
    this.app.post('/api/config/switch', async (req, res) => {
      try {
        const { environment, options = {} } = req.body;

        if (!environment) {
          return res.status(400).json({ error: 'Environment is required' });
        }

        const success = await this.switchEnvironment(environment, options);
        res.json({
          success,
          current: this.currentEnvironment,
          previous: this.configHistory[this.configHistory.length - 1]?.from,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get environment comparison
    this.app.get('/api/config/compare', (req, res) => {
      const { from = 'development', to = 'production' } = req.query;

      const fromConfig = this.getConfigurationForEnvironment(from);
      const toConfig = this.getConfigurationForEnvironment(to);

      const comparison = this.compareConfigurations(fromConfig, toConfig);

      res.json({
        from,
        to,
        comparison,
        timestamp: new Date().toISOString()
      });
    });

    // Validate configuration
    this.app.post('/api/config/validate', (req, res) => {
      const { config, environment } = req.body;
      const targetConfig = config || this.getConfigurationForEnvironment(environment);

      try {
        const validation = this.validateConfiguration(targetConfig);
        res.json({
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Reset to default
    this.app.post('/api/config/reset', async (req, res) => {
      try {
        const { environment = 'development' } = req.body;
        await this.switchEnvironment(environment, { reason: 'reset to default' });
        res.json({
          success: true,
          current: this.currentEnvironment,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Export configuration
    this.app.get('/api/config/export', (req, res) => {
      const { format = 'json' } = req.query;

      const exportData = {
        environment: this.currentEnvironment,
        config: this.currentConfig,
        history: this.configHistory,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      if (format === 'json') {
        res.json(exportData);
      } else if (format === 'yaml') {
        res.set('Content-Type', 'text/yaml');
        res.send(this.convertToYaml(exportData));
      } else {
        res.status(400).json({ error: 'Invalid format. Use json or yaml' });
      }
    });
  }

  /**
   * Get configuration for environment
   */
  getConfigurationForEnvironment(environment) {
    switch (environment) {
      case 'development':
        return developmentConfig;
      case 'production':
        return productionConfig;
      default:
        return developmentConfig;
    }
  }

  /**
   * Check if environment is valid
   */
  isValidEnvironment(environment) {
    return this.getValidEnvironments().includes(environment);
  }

  /**
   * Get valid environments
   */
  getValidEnvironments() {
    return ['development', 'production'];
  }

  /**
   * Sanitize configuration for API response
   */
  sanitizeConfig(config) {
    const sanitized = { ...config };

    // Remove sensitive information
    if (sanitized.database && sanitized.database.password) {
      sanitized.database.password = '***';
    }

    if (sanitized.redis && sanitized.redis.password) {
      sanitized.redis.password = '***';
    }

    if (sanitized.security && sanitized.security.auth && sanitized.security.auth.secret) {
      sanitized.security.auth.secret = '***';
    }

    return sanitized;
  }

  /**
   * Compare two configurations
   */
  compareConfigurations(config1, config2) {
    const differences = [];
    const keys = new Set([...Object.keys(config1), ...Object.keys(config2)]);

    for (const key of keys) {
      if (JSON.stringify(config1[key]) !== JSON.stringify(config2[key])) {
        differences.push({
          key,
          from: config1[key],
          to: config2[key],
          type: config1[key] === undefined ? 'added' : config2[key] === undefined ? 'removed' : 'changed'
        });
      }
    }

    return {
      totalDifferences: differences.length,
      differences,
      similarity: 1 - (differences.length / keys.length)
    };
  }

  /**
   * Validate configuration
   */
  validateConfiguration(config) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!config.server) {
      errors.push('Server configuration is required');
    }

    if (config.server && !config.server.port) {
      errors.push('Server port is required');
    }

    // Security warnings for development
    if (this.currentEnvironment === 'development') {
      if (config.security && config.security.rateLimit && config.security.rateLimit.max > 1000) {
        warnings.push('High rate limit in development environment');
      }

      if (config.csp && config.csp.directives && config.csp.directives['script-src'] &&
          config.csp.directives['script-src'].includes("'unsafe-eval'")) {
        warnings.push('Unsafe eval enabled in CSP (development only)');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Convert to YAML (simple implementation)
   */
  convertToYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        yaml += this.convertToYaml(value, indent + 1);
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          yaml += `${spaces}  - ${typeof item === 'object' ? JSON.stringify(item) : item}\n`;
        });
      } else {
        yaml += `${spaces}${key}: ${typeof value === 'string' ? `"${value}"` : value}\n`;
      }
    }

    return yaml;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      environment: this.currentEnvironment,
      config: this.sanitizeConfig(this.currentConfig),
      components: {
        developmentMode: !!this.developmentMode,
        webSocketDebugger: !!this.components.webSocketDebugger,
        connectionStatusManager: !!this.components.connectionStatusManager,
        testingSuite: !!this.components.testingSuite
      },
      history: this.configHistory.slice(-5),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get component instance
   */
  getComponent(name) {
    return this.components[name];
  }

  /**
   * Get development mode instance
   */
  getDevelopmentMode() {
    return this.developmentMode;
  }
}

export default ConfigurationSwitcher;