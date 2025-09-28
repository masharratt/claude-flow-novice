#!/usr/bin/env node

/**
 * Configuration Validation Scripts
 *
 * Validates all optimization configurations before and after activation
 * Ensures system integrity and performance compliance
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { performance } from 'perf_hooks';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * Configuration Validator
 */
class ConfigurationValidator {
  constructor(options = {}) {
    this.options = {
      strict: false,
      verbose: false,
      ...options
    };

    this.validationRules = {
      sqlite: this._getSQLiteValidationRules(),
      performance: this._getPerformanceValidationRules(),
      hardware: this._getHardwareValidationRules(),
      monitoring: this._getMonitoringValidationRules()
    };

    this.validationResults = {
      sqlite: [],
      performance: [],
      hardware: [],
      monitoring: [],
      overall: { passed: 0, failed: 0, warnings: 0 }
    };
  }

  /**
   * Run comprehensive configuration validation
   */
  async validate() {
    const spinner = ora('🔍 Starting Configuration Validation...').start();

    try {
      // Validate SQLite configurations
      await this._validateSQLiteConfig(spinner);

      // Validate performance configurations
      await this._validatePerformanceConfig(spinner);

      // Validate hardware configurations
      await this._validateHardwareConfig(spinner);

      // Validate monitoring configurations
      await this._validateMonitoringConfig(spinner);

      // Generate final report
      const report = this._generateValidationReport();

      spinner.succeed('✅ Configuration validation completed');

      return {
        success: report.overall.failed === 0,
        report,
        recommendations: this._generateRecommendations()
      };

    } catch (error) {
      spinner.fail('❌ Configuration validation failed');
      throw error;
    }
  }

  /**
   * Validate specific configuration type
   */
  async validateType(type) {
    if (!this.validationRules[type]) {
      throw new Error(`Unknown validation type: ${type}`);
    }

    const methodName = `_validate${type.charAt(0).toUpperCase() + type.slice(1)}Config`;
    if (typeof this[methodName] === 'function') {
      await this[methodName]();
      return this.validationResults[type];
    }

    throw new Error(`Validation method not implemented for type: ${type}`);
  }

  // Private validation methods

  async _validateSQLiteConfig(spinner) {
    spinner.text = '💾 Validating SQLite configurations...';

    const rules = this.validationRules.sqlite;
    const results = this.validationResults.sqlite;

    // Find database files
    const dbPaths = this._findDatabaseFiles();

    if (dbPaths.length === 0) {
      results.push({
        type: 'warning',
        rule: 'database-existence',
        message: 'No SQLite database files found',
        impact: 'medium'
      });
      this.validationResults.overall.warnings++;
      return;
    }

    for (const dbPath of dbPaths) {
      try {
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(dbPath, { readonly: true });

        // Validate schema version
        const schemaVersion = this._getSchemaVersion(db);
        if (schemaVersion < rules.minSchemaVersion) {
          results.push({
            type: 'error',
            rule: 'schema-version',
            message: `Database ${dbPath} schema version ${schemaVersion} below minimum ${rules.minSchemaVersion}`,
            impact: 'high',
            fix: 'Run database optimization to upgrade schema'
          });
          this.validationResults.overall.failed++;
        } else {
          results.push({
            type: 'success',
            rule: 'schema-version',
            message: `Database ${dbPath} schema version ${schemaVersion} is current`,
            impact: 'low'
          });
          this.validationResults.overall.passed++;
        }

        // Validate indexes
        const indexes = this._getIndexes(db);
        const requiredIndexes = rules.requiredIndexes;

        for (const requiredIndex of requiredIndexes) {
          const indexExists = indexes.some(idx => idx.name === requiredIndex);
          if (!indexExists) {
            results.push({
              type: 'error',
              rule: 'required-indexes',
              message: `Required index ${requiredIndex} missing from ${dbPath}`,
              impact: 'high',
              fix: 'Run database optimization to create missing indexes'
            });
            this.validationResults.overall.failed++;
          } else {
            results.push({
              type: 'success',
              rule: 'required-indexes',
              message: `Required index ${requiredIndex} exists in ${dbPath}`,
              impact: 'low'
            });
            this.validationResults.overall.passed++;
          }
        }

        // Validate pragma settings
        const pragmaSettings = this._getPragmaSettings(db);
        for (const [pragma, expectedValue] of Object.entries(rules.pragmaSettings)) {
          const actualValue = pragmaSettings[pragma];
          if (actualValue !== expectedValue) {
            results.push({
              type: 'warning',
              rule: 'pragma-settings',
              message: `Pragma ${pragma} is ${actualValue}, expected ${expectedValue} in ${dbPath}`,
              impact: 'medium',
              fix: `Run PRAGMA ${pragma} = ${expectedValue}`
            });
            this.validationResults.overall.warnings++;
          } else {
            results.push({
              type: 'success',
              rule: 'pragma-settings',
              message: `Pragma ${pragma} correctly set to ${expectedValue} in ${dbPath}`,
              impact: 'low'
            });
            this.validationResults.overall.passed++;
          }
        }

        db.close();

      } catch (error) {
        results.push({
          type: 'error',
          rule: 'database-access',
          message: `Cannot access database ${dbPath}: ${error.message}`,
          impact: 'critical',
          fix: 'Check database file permissions and integrity'
        });
        this.validationResults.overall.failed++;
      }
    }
  }

  async _validatePerformanceConfig(spinner) {
    spinner.text = '⚡ Validating performance configurations...';

    const rules = this.validationRules.performance;
    const results = this.validationResults.performance;

    // Check for performance configuration files
    const perfConfigPath = join(PROJECT_ROOT, '.claude-flow', 'performance-config.json');
    if (!existsSync(perfConfigPath)) {
      results.push({
        type: 'warning',
        rule: 'config-file-existence',
        message: 'Performance configuration file not found',
        impact: 'medium',
        fix: 'Run optimization activation to create performance configuration'
      });
      this.validationResults.overall.warnings++;
    } else {
      try {
        const config = JSON.parse(readFileSync(perfConfigPath, 'utf8'));

        // Validate performance targets
        if (config.performanceTarget > rules.maxExecutionTime) {
          results.push({
            type: 'warning',
            rule: 'performance-target',
            message: `Performance target ${config.performanceTarget}ms exceeds recommended ${rules.maxExecutionTime}ms`,
            impact: 'medium'
          });
          this.validationResults.overall.warnings++;
        } else {
          results.push({
            type: 'success',
            rule: 'performance-target',
            message: `Performance target ${config.performanceTarget}ms within recommended limits`,
            impact: 'low'
          });
          this.validationResults.overall.passed++;
        }

        // Validate compatibility target
        if (config.compatibilityTarget < rules.minCompatibilityRate) {
          results.push({
            type: 'error',
            rule: 'compatibility-target',
            message: `Compatibility target ${config.compatibilityTarget} below minimum ${rules.minCompatibilityRate}`,
            impact: 'high'
          });
          this.validationResults.overall.failed++;
        } else {
          results.push({
            type: 'success',
            rule: 'compatibility-target',
            message: `Compatibility target ${config.compatibilityTarget} meets minimum requirements`,
            impact: 'low'
          });
          this.validationResults.overall.passed++;
        }

      } catch (error) {
        results.push({
          type: 'error',
          rule: 'config-file-parsing',
          message: `Cannot parse performance configuration: ${error.message}`,
          impact: 'high'
        });
        this.validationResults.overall.failed++;
      }
    }

    // Check Node.js optimization flags
    const nodeOptions = process.env.NODE_OPTIONS || '';
    for (const requiredFlag of rules.requiredNodeFlags) {
      if (!nodeOptions.includes(requiredFlag)) {
        results.push({
          type: 'warning',
          rule: 'node-flags',
          message: `Required Node.js flag ${requiredFlag} not set`,
          impact: 'medium',
          fix: `Add ${requiredFlag} to NODE_OPTIONS environment variable`
        });
        this.validationResults.overall.warnings++;
      } else {
        results.push({
          type: 'success',
          rule: 'node-flags',
          message: `Required Node.js flag ${requiredFlag} is set`,
          impact: 'low'
        });
        this.validationResults.overall.passed++;
      }
    }
  }

  async _validateHardwareConfig(spinner) {
    spinner.text = '🖥️  Validating hardware configurations...';

    const rules = this.validationRules.hardware;
    const results = this.validationResults.hardware;

    // Check system memory
    const totalMemory = require('os').totalmem();
    const totalMemoryGB = totalMemory / (1024 * 1024 * 1024);

    if (totalMemoryGB < rules.minMemoryGB) {
      results.push({
        type: 'error',
        rule: 'system-memory',
        message: `System memory ${totalMemoryGB.toFixed(1)}GB below minimum ${rules.minMemoryGB}GB`,
        impact: 'critical'
      });
      this.validationResults.overall.failed++;
    } else if (totalMemoryGB >= rules.optimalMemoryGB) {
      results.push({
        type: 'success',
        rule: 'system-memory',
        message: `System memory ${totalMemoryGB.toFixed(1)}GB meets optimal requirements`,
        impact: 'low'
      });
      this.validationResults.overall.passed++;
    } else {
      results.push({
        type: 'warning',
        rule: 'system-memory',
        message: `System memory ${totalMemoryGB.toFixed(1)}GB below optimal ${rules.optimalMemoryGB}GB`,
        impact: 'medium'
      });
      this.validationResults.overall.warnings++;
    }

    // Check CPU cores
    const cpuCores = require('os').cpus().length;
    if (cpuCores < rules.minCPUCores) {
      results.push({
        type: 'warning',
        rule: 'cpu-cores',
        message: `CPU cores ${cpuCores} below recommended ${rules.minCPUCores}`,
        impact: 'medium'
      });
      this.validationResults.overall.warnings++;
    } else {
      results.push({
        type: 'success',
        rule: 'cpu-cores',
        message: `CPU cores ${cpuCores} meets requirements`,
        impact: 'low'
      });
      this.validationResults.overall.passed++;
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < rules.minNodeVersion) {
      results.push({
        type: 'error',
        rule: 'node-version',
        message: `Node.js version ${nodeVersion} below minimum ${rules.minNodeVersion}`,
        impact: 'critical',
        fix: `Upgrade Node.js to version ${rules.minNodeVersion} or higher`
      });
      this.validationResults.overall.failed++;
    } else {
      results.push({
        type: 'success',
        rule: 'node-version',
        message: `Node.js version ${nodeVersion} meets requirements`,
        impact: 'low'
      });
      this.validationResults.overall.passed++;
    }
  }

  async _validateMonitoringConfig(spinner) {
    spinner.text = '📊 Validating monitoring configurations...';

    const rules = this.validationRules.monitoring;
    const results = this.validationResults.monitoring;

    // Check monitoring configuration file
    const monitoringConfigPath = join(PROJECT_ROOT, '.claude-flow', 'monitoring-config.json');
    if (!existsSync(monitoringConfigPath)) {
      results.push({
        type: 'error',
        rule: 'config-file-existence',
        message: 'Monitoring configuration file not found',
        impact: 'high',
        fix: 'Run optimization activation to create monitoring configuration'
      });
      this.validationResults.overall.failed++;
      return;
    }

    try {
      const config = JSON.parse(readFileSync(monitoringConfigPath, 'utf8'));

      // Validate required sections
      for (const requiredSection of rules.requiredSections) {
        if (!config[requiredSection]) {
          results.push({
            type: 'error',
            rule: 'required-sections',
            message: `Required monitoring section ${requiredSection} missing`,
            impact: 'high'
          });
          this.validationResults.overall.failed++;
        } else {
          results.push({
            type: 'success',
            rule: 'required-sections',
            message: `Required monitoring section ${requiredSection} present`,
            impact: 'low'
          });
          this.validationResults.overall.passed++;
        }
      }

      // Validate performance thresholds
      if (config.performanceThresholds) {
        const thresholds = config.performanceThresholds;

        if (thresholds.hookExecutionTime > rules.maxHookExecutionTime) {
          results.push({
            type: 'warning',
            rule: 'performance-thresholds',
            message: `Hook execution time threshold ${thresholds.hookExecutionTime}ms too high`,
            impact: 'medium'
          });
          this.validationResults.overall.warnings++;
        } else {
          results.push({
            type: 'success',
            rule: 'performance-thresholds',
            message: `Hook execution time threshold ${thresholds.hookExecutionTime}ms is appropriate`,
            impact: 'low'
          });
          this.validationResults.overall.passed++;
        }
      }

    } catch (error) {
      results.push({
        type: 'error',
        rule: 'config-file-parsing',
        message: `Cannot parse monitoring configuration: ${error.message}`,
        impact: 'high'
      });
      this.validationResults.overall.failed++;
    }

    // Check monitoring service files
    const servicesDir = join(PROJECT_ROOT, '.claude-flow', 'services');
    if (!existsSync(servicesDir)) {
      results.push({
        type: 'warning',
        rule: 'service-files',
        message: 'Monitoring services directory not found',
        impact: 'medium',
        fix: 'Run optimization activation to start monitoring services'
      });
      this.validationResults.overall.warnings++;
    } else {
      const serviceFiles = require('fs').readdirSync(servicesDir);
      const requiredServices = rules.requiredServices;

      for (const service of requiredServices) {
        const serviceFile = `${service}.pid`;
        if (!serviceFiles.includes(serviceFile)) {
          results.push({
            type: 'warning',
            rule: 'service-files',
            message: `Monitoring service ${service} not running`,
            impact: 'medium',
            fix: `Start monitoring service: ${service}`
          });
          this.validationResults.overall.warnings++;
        } else {
          results.push({
            type: 'success',
            rule: 'service-files',
            message: `Monitoring service ${service} is running`,
            impact: 'low'
          });
          this.validationResults.overall.passed++;
        }
      }
    }
  }

  // Validation rule definitions

  _getSQLiteValidationRules() {
    return {
      minSchemaVersion: 1.5,
      requiredIndexes: [
        'idx_agents_swarm',
        'idx_agents_status',
        'idx_tasks_swarm',
        'idx_tasks_status',
        'idx_memory_namespace'
      ],
      pragmaSettings: {
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        cache_size: 524288,
        temp_store: 'memory'
      }
    };
  }

  _getPerformanceValidationRules() {
    return {
      maxExecutionTime: 100, // ms
      minCompatibilityRate: 0.95,
      requiredNodeFlags: [
        'max-old-space-size',
        'uv-threadpool-size'
      ]
    };
  }

  _getHardwareValidationRules() {
    return {
      minMemoryGB: 16,
      optimalMemoryGB: 96,
      minCPUCores: 8,
      minNodeVersion: 20
    };
  }

  _getMonitoringValidationRules() {
    return {
      requiredSections: [
        'performanceThresholds',
        'alerting',
        'metrics'
      ],
      maxHookExecutionTime: 100,
      requiredServices: [
        'performance',
        'system',
        'database'
      ]
    };
  }

  // Helper methods

  _findDatabaseFiles() {
    const dbPaths = [];
    const searchPaths = [
      join(PROJECT_ROOT, 'data'),
      join(PROJECT_ROOT, '.swarm'),
      join(PROJECT_ROOT, 'memory'),
      join(PROJECT_ROOT, '.claude-flow')
    ];

    for (const searchPath of searchPaths) {
      if (existsSync(searchPath)) {
        try {
          const files = require('fs').readdirSync(searchPath, { recursive: true });
          const dbFiles = files
            .filter(file => file.endsWith('.db') || file.endsWith('.sqlite'))
            .map(file => join(searchPath, file))
            .filter(file => existsSync(file));
          dbPaths.push(...dbFiles);
        } catch (error) {
          // Ignore errors reading directories
        }
      }
    }

    return [...new Set(dbPaths)]; // Remove duplicates
  }

  _getSchemaVersion(db) {
    try {
      const result = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
      return result ? result.version : 1.0;
    } catch (error) {
      return 1.0;
    }
  }

  _getIndexes(db) {
    try {
      return db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    } catch (error) {
      return [];
    }
  }

  _getPragmaSettings(db) {
    const settings = {};
    const pragmas = ['journal_mode', 'synchronous', 'cache_size', 'temp_store'];

    for (const pragma of pragmas) {
      try {
        const result = db.prepare(`PRAGMA ${pragma}`).get();
        settings[pragma] = result[pragma];
      } catch (error) {
        settings[pragma] = 'unknown';
      }
    }

    return settings;
  }

  _generateValidationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      overall: this.validationResults.overall,
      summary: {
        total: this.validationResults.overall.passed +
               this.validationResults.overall.failed +
               this.validationResults.overall.warnings,
        passRate: this.validationResults.overall.passed /
                 (this.validationResults.overall.passed + this.validationResults.overall.failed + this.validationResults.overall.warnings),
        compliance: this.validationResults.overall.failed === 0 ? 'compliant' : 'non-compliant'
      },
      details: this.validationResults
    };

    return report;
  }

  _generateRecommendations() {
    const recommendations = [];

    // Analyze errors and warnings to generate recommendations
    const allResults = [
      ...this.validationResults.sqlite,
      ...this.validationResults.performance,
      ...this.validationResults.hardware,
      ...this.validationResults.monitoring
    ];

    const errors = allResults.filter(r => r.type === 'error');
    const warnings = allResults.filter(r => r.type === 'warning');

    if (errors.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Fix Configuration Errors',
        description: `${errors.length} critical configuration errors must be resolved`,
        fixes: errors.filter(e => e.fix).map(e => e.fix)
      });
    }

    if (warnings.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Address Configuration Warnings',
        description: `${warnings.length} configuration warnings should be addressed for optimal performance`,
        fixes: warnings.filter(w => w.fix).map(w => w.fix)
      });
    }

    if (errors.length === 0 && warnings.length === 0) {
      recommendations.push({
        priority: 'INFO',
        action: 'Configuration Validated',
        description: 'All configurations are valid and optimized',
        fixes: ['Continue monitoring system performance']
      });
    }

    return recommendations;
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'validate';
  const type = args[1];

  const validator = new ConfigurationValidator({
    strict: args.includes('--strict'),
    verbose: args.includes('--verbose')
  });

  try {
    let result;

    switch (command) {
      case 'validate':
        if (type && ['sqlite', 'performance', 'hardware', 'monitoring'].includes(type)) {
          console.log(chalk.blue(`🔍 Validating ${type} configuration...`));
          const typeResults = await validator.validateType(type);
          console.log(JSON.stringify(typeResults, null, 2));
        } else {
          console.log(chalk.blue('🔍 Running comprehensive configuration validation...'));
          result = await validator.validate();

          if (result.success) {
            console.log(chalk.green('\n✅ All configurations validated successfully!'));
          } else {
            console.log(chalk.red('\n❌ Configuration validation failed'));
          }

          console.log(chalk.blue('\n📊 Validation Summary:'));
          console.log(`  Passed: ${result.report.overall.passed}`);
          console.log(`  Failed: ${result.report.overall.failed}`);
          console.log(`  Warnings: ${result.report.overall.warnings}`);
          console.log(`  Pass Rate: ${(result.report.summary.passRate * 100).toFixed(1)}%`);

          if (result.recommendations.length > 0) {
            console.log(chalk.yellow('\n📋 Recommendations:'));
            result.recommendations.forEach(rec => {
              console.log(chalk.yellow(`  ${rec.priority}: ${rec.action}`));
              console.log(`    ${rec.description}`);
            });
          }
        }
        break;

      default:
        console.log(chalk.yellow('Usage:'));
        console.log('  node config-validator.js validate [type]  - Validate configurations');
        console.log('');
        console.log('Types:');
        console.log('  sqlite       - Validate SQLite database configurations');
        console.log('  performance  - Validate performance system configurations');
        console.log('  hardware     - Validate hardware configurations');
        console.log('  monitoring   - Validate monitoring configurations');
        console.log('');
        console.log('Options:');
        console.log('  --strict     - Use strict validation rules');
        console.log('  --verbose    - Show detailed validation output');
    }

  } catch (error) {
    console.error(chalk.red('❌ Validation failed:'), error.message);
    process.exit(1);
  }
}

// Export for programmatic use
export { ConfigurationValidator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}