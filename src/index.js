/**
 * Content Filtering System - Main Entry Point
 * Comprehensive solution for .md file overload and tone processing
 */

// Core Filtering Components
export { ContentFilters } from './filters/content-filters.js';
export { ToneProcessors } from './filters/tone-processors.js';

// Integration and Hooks
export { FilterIntegrationHooks } from './hooks/filter-integration.js';
export { HooksIntegrationSystem } from './integration/hooks-integration.js';

// Configuration and Preferences
export { FilterConfiguration } from './config/filter-config.js';
export { PreferenceManager } from './utils/preference-manager.js';

// Real-time Processing
export { RealtimeFilterMiddleware } from './middleware/realtime-filter.js';

// Concurrent Processing
export { ConcurrentFilterPipeline } from './concurrent/filter-pipeline.js';

// Audit and Logging
export { ContentAuditSystem } from './audit/content-audit.js';

/**
 * Main FilteringSystem class that orchestrates all components
 */
class FilteringSystem {
  constructor(projectRoot = process.cwd(), options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      enableRealtime: true,
      enableConcurrency: true,
      enableAudit: true,
      enableHooksIntegration: true,
      ...options
    };

    this.initialized = false;
    this.startTime = Date.now();
  }

  /**
   * Initialize all system components
   */
  async initializeComponents() {
    // Core components
    const { ContentFilters } = await import('./filters/content-filters.js');
    const { ToneProcessors } = await import('./filters/tone-processors.js');

    this.contentFilters = new ContentFilters();
    this.toneProcessors = new ToneProcessors();

    // Configuration
    const { FilterConfiguration } = await import('./config/filter-config.js');
    const { PreferenceManager } = await import('./utils/preference-manager.js');

    this.filterConfig = new FilterConfiguration(this.projectRoot);
    this.preferenceManager = new PreferenceManager(this.projectRoot);

    // Integration
    if (this.options.enableHooksIntegration) {
      const { HooksIntegrationSystem } = await import('./integration/hooks-integration.js');
      this.hooksIntegration = new HooksIntegrationSystem(this.projectRoot);
    }

    // Real-time processing
    if (this.options.enableRealtime) {
      const { RealtimeFilterMiddleware } = await import('./middleware/realtime-filter.js');
      this.realtimeFilter = new RealtimeFilterMiddleware(this.projectRoot);
    }

    // Concurrent processing
    if (this.options.enableConcurrency) {
      const { ConcurrentFilterPipeline } = await import('./concurrent/filter-pipeline.js');
      this.concurrentPipeline = new ConcurrentFilterPipeline(this.options.concurrent);
    }

    // Audit system
    if (this.options.enableAudit) {
      const { ContentAuditSystem } = await import('./audit/content-audit.js');
      this.auditSystem = new ContentAuditSystem(this.projectRoot);
    }

    // Setup event listeners
    this.setupEventHandlers();

    this.initialized = true;
  }

  /**
   * Setup event handlers between components
   */
  setupEventHandlers() {
    if (this.realtimeFilter && this.auditSystem) {
      this.realtimeFilter.on('contentProcessed', (result) => {
        this.auditSystem.logFilterAction('REALTIME_PROCESSED', result);
      });

      this.realtimeFilter.on('contentBlocked', (result) => {
        this.auditSystem.logFilterAction('REALTIME_BLOCKED', result);
      });
    }

    if (this.concurrentPipeline && this.auditSystem) {
      this.concurrentPipeline.on('jobCompleted', (job) => {
        this.auditSystem.logFilterAction('CONCURRENT_JOB_COMPLETED', job);
      });
    }
  }

  /**
   * Process single document
   */
  async processDocument(filePath, content, metadata = {}) {
    await this.ensureInitialized();

    const preferences = this.preferenceManager.getContextualPreferences(metadata);

    // Apply content filtering
    const filterResult = this.contentFilters.filterDocumentRequest(filePath, content, metadata);

    if (!filterResult.allowed) {
      return filterResult;
    }

    // Apply tone processing
    const toneResult = this.toneProcessors.processMessage(
      filterResult.content,
      preferences.userPreferences.tonePreset,
      preferences.userPreferences
    );

    return {
      ...filterResult,
      content: toneResult.processed,
      toneChanges: toneResult.changes,
      processed: toneResult.processed !== content
    };
  }

  /**
   * Process multiple documents concurrently
   */
  async processDocumentsConcurrently(documents, metadata = {}) {
    await this.ensureInitialized();

    if (!this.concurrentPipeline) {
      throw new Error('Concurrent processing not enabled');
    }

    return this.concurrentPipeline.processParallel(documents, metadata);
  }

  /**
   * Create real-time processing stream
   */
  createProcessingStream(options = {}) {
    if (!this.realtimeFilter) {
      throw new Error('Real-time processing not enabled');
    }

    return this.realtimeFilter.createStreamingProcessor(options);
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    const status = {
      initialized: this.initialized,
      uptime: Date.now() - this.startTime,
      components: {}
    };

    if (this.contentFilters) {
      status.components.contentFilters = this.contentFilters.getFilterStats();
    }

    if (this.toneProcessors) {
      status.components.toneProcessors = this.toneProcessors.getProcessingStats();
    }

    if (this.realtimeFilter) {
      status.components.realtimeFilter = this.realtimeFilter.getStats();
    }

    if (this.concurrentPipeline) {
      status.components.concurrentPipeline = this.concurrentPipeline.getStats();
    }

    if (this.auditSystem) {
      status.components.auditSystem = this.auditSystem.getDashboardData();
    }

    if (this.preferenceManager) {
      status.components.preferences = this.preferenceManager.getUsageStatistics();
    }

    return status;
  }

  /**
   * Generate comprehensive report
   */
  async generateSystemReport(timeframe = '24h') {
    await this.ensureInitialized();

    const report = {
      timestamp: new Date().toISOString(),
      timeframe,
      systemStatus: this.getSystemStatus(),
      auditReport: this.auditSystem?.generateAuditReport(timeframe),
      preferences: this.preferenceManager?.exportPreferences(),
      configuration: this.filterConfig?.exportConfig(),
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  /**
   * Generate system recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.auditSystem) {
      const stats = this.auditSystem.getDashboardData();

      if (stats.overview.filteredToday > 50) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: 'High filtering activity detected. Consider adjusting filter rules to reduce false positives.',
          action: 'review_filter_rules'
        });
      }

      if (stats.overview.errorRate > 0.1) {
        recommendations.push({
          type: 'reliability',
          priority: 'medium',
          message: 'Error rate is elevated. Check system logs for recurring issues.',
          action: 'check_error_logs'
        });
      }
    }

    if (this.concurrentPipeline) {
      const stats = this.concurrentPipeline.getStats();

      if (stats.workerUtilization > 90) {
        recommendations.push({
          type: 'scalability',
          priority: 'medium',
          message: 'High worker utilization. Consider scaling up worker pool.',
          action: 'scale_workers'
        });
      }
    }

    return recommendations;
  }

  /**
   * Update system configuration
   */
  async updateConfiguration(section, updates) {
    await this.ensureInitialized();

    switch (section) {
      case 'contentFilters':
        this.contentFilters.updateLimits(updates);
        break;
      case 'toneProcessors':
        this.toneProcessors.updateConfig(updates);
        break;
      case 'preferences':
        this.preferenceManager.updateActivePreferences('userPreferences', updates);
        break;
      case 'global':
        this.filterConfig.updateConfig(section, updates);
        break;
      default:
        throw new Error(`Unknown configuration section: ${section}`);
    }

    return this.filterConfig.exportConfig();
  }

  /**
   * Ensure system is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializeComponents();
    }
  }

  /**
   * Graceful system shutdown
   */
  async shutdown() {
    if (this.realtimeFilter) {
      await this.realtimeFilter.shutdown();
    }

    if (this.concurrentPipeline) {
      await this.concurrentPipeline.shutdown();
    }

    if (this.auditSystem) {
      // Flush any pending audit data
      this.auditSystem.logFilterAction('SYSTEM_SHUTDOWN', {
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime
      });
    }

    this.initialized = false;
  }
}

export { FilteringSystem };
export default FilteringSystem;

/**
 * Quick setup function for common use cases
 */
export function createFilteringSystem(options = {}) {
  return new FilteringSystem(process.cwd(), options);
}

/**
 * Express.js middleware factory
 */
export function createExpressMiddleware(options = {}) {
  const system = new FilteringSystem(process.cwd(), options);

  return async (req, res, next) => {
    await system.ensureInitialized();

    if (system.realtimeFilter) {
      const middleware = system.realtimeFilter.createExpressMiddleware();
      return middleware(req, res, next);
    }

    next();
  };
}

/**
 * CLI command factory
 */
export function createCliCommands(system) {
  return {
    async processFile(filePath, content, options = {}) {
      return system.processDocument(filePath, content, options);
    },

    async batchProcess(documents, options = {}) {
      return system.processDocumentsConcurrently(documents, options);
    },

    async getStatus() {
      return system.getSystemStatus();
    },

    async generateReport(timeframe = '24h') {
      return system.generateSystemReport(timeframe);
    },

    async updateConfig(section, updates) {
      return system.updateConfiguration(section, updates);
    },

    async shutdown() {
      return system.shutdown();
    }
  };
}