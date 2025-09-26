/**
 * Filter Integration Hooks
 * Intercepts document generation and applies filtering during agent operations
 */

import { ContentFilters } from '../filters/content-filters.js';
import { ToneProcessors } from '../filters/tone-processors.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

class FilterIntegrationHooks {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.settingsPath = join(projectRoot, '.claude', 'settings.json');

    this.loadSettings();

    this.contentFilters = new ContentFilters(this.settings.contentFilters || {});
    this.toneProcessors = new ToneProcessors(this.settings.toneProcessors || {});

    this.interceptCount = 0;
    this.actionLog = [];

    this.setupHooks();
  }

  /**
   * Load settings from .claude/settings.json
   */
  loadSettings() {
    try {
      if (existsSync(this.settingsPath)) {
        const settingsData = readFileSync(this.settingsPath, 'utf8');
        this.settings = JSON.parse(settingsData);
      } else {
        this.settings = this.getDefaultSettings();
        this.saveSettings();
      }
    } catch (error) {
      console.warn('Error loading settings, using defaults:', error.message);
      this.settings = this.getDefaultSettings();
    }
  }

  /**
   * Get default filter settings
   */
  getDefaultSettings() {
    return {
      contentFilters: {
        enabled: true,
        maxMdFiles: 15,
        allowedDocTypes: ['API', 'README', 'CHANGELOG', 'GUIDE'],
        rootDirectoryProtection: true,
        allowedRootFiles: ['README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md'],
        blockedPatterns: [
          'IMPLEMENTATION_REPORT',
          'COMPLETION_SUMMARY',
          'AGENT_REPORT',
          'PERFORMANCE_ANALYSIS',
          '^TEMP_',
          '^WORKING_',
          'STATUS_UPDATE',
          'PROGRESS_REPORT',
        ],
      },
      toneProcessors: {
        enabled: true,
        defaultPreset: 'professional',
        removeSelfCongratulatory: true,
        simplifyJargon: false,
        focusOnActionable: true,
        customPatterns: {
          'we have successfully': 'we have',
          'perfectly implemented': 'implemented',
          'flawless execution': 'execution',
          'amazing results': 'good results',
        },
      },
      hooks: {
        preDocumentGeneration: true,
        postAgentMessage: true,
        preFileWrite: true,
        realTimeFiltering: true,
      },
      userPreferences: {
        tonePreset: 'professional',
        maxDocumentLength: 5000,
        allowReports: false,
        consolidateDocuments: true,
      },
    };
  }

  /**
   * Save settings to .claude/settings.json
   */
  saveSettings() {
    try {
      const settingsDir = dirname(this.settingsPath);
      if (!existsSync(settingsDir)) {
        require('fs').mkdirSync(settingsDir, { recursive: true });
      }

      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Error saving settings:', error.message);
    }
  }

  /**
   * Setup integration hooks
   */
  setupHooks() {
    // Hook into global process if available
    if (typeof process !== 'undefined' && process.on) {
      process.on('documentGeneration', (event) => this.handleDocumentGeneration(event));
      process.on('agentMessage', (event) => this.handleAgentMessage(event));
      process.on('fileWrite', (event) => this.handleFileWrite(event));
    }

    // Register CLI hooks
    this.registerCliHooks();
  }

  /**
   * Register CLI command hooks
   */
  registerCliHooks() {
    const hookCommands = [
      'pre-document-generation',
      'post-agent-message',
      'pre-file-write',
      'filter-check',
    ];

    // This would integrate with the existing hook system
    hookCommands.forEach((command) => {
      this.registerHook(command);
    });
  }

  /**
   * Register individual hook
   */
  registerHook(hookName) {
    const hookPath = join(this.projectRoot, '.claude', 'hooks', `${hookName}.js`);

    try {
      if (existsSync(hookPath)) {
        const hookModule = require(hookPath);
        hookModule.addPreProcessor = (processor) => {
          this.addCustomProcessor(hookName, processor);
        };
      }
    } catch (error) {
      // Hook file doesn't exist or has errors, continue silently
    }
  }

  /**
   * Intercept document generation requests
   */
  interceptDocumentGeneration(filePath, content, metadata = {}) {
    if (!this.settings.contentFilters.enabled) {
      return { allowed: true, content, filePath };
    }

    this.interceptCount++;

    const filterResult = this.contentFilters.filterDocumentRequest(filePath, content, metadata);

    let processedContent = content;

    // Apply tone processing if document is allowed
    if (filterResult.allowed && this.settings.toneProcessors.enabled) {
      const toneResult = this.toneProcessors.processMessage(
        content,
        this.settings.userPreferences.tonePreset,
        this.settings.userPreferences,
      );
      processedContent = toneResult.processed;

      // Log tone processing
      if (toneResult.changes.length > 0) {
        this.logAction('TONE_PROCESSED', filePath, {
          changes: toneResult.changes,
          metrics: toneResult.metrics,
        });
      }
    }

    const result = {
      allowed: filterResult.allowed,
      content: processedContent,
      filePath: filterResult.suggestedPath,
      reason: filterResult.reason,
      modifications: filterResult.modifications,
      originalPath: filePath,
      processed: content !== processedContent,
    };

    this.logAction('DOCUMENT_INTERCEPT', filePath, result);

    return result;
  }

  /**
   * Handle document generation events
   */
  handleDocumentGeneration(event) {
    const { filePath, content, metadata } = event;
    const result = this.interceptDocumentGeneration(filePath, content, metadata);

    if (!result.allowed) {
      event.preventDefault();
      event.result = result;
    } else if (result.processed || result.filePath !== result.originalPath) {
      event.content = result.content;
      event.filePath = result.filePath;
    }
  }

  /**
   * Process agent messages through tone filters
   */
  processAgentMessage(message, agentType = 'generic', context = {}) {
    if (!this.settings.toneProcessors.enabled) {
      return message;
    }

    // Determine appropriate tone based on agent type and context
    const tonePreset = this.determineTonePreset(agentType, context);

    const result = this.toneProcessors.processMessage(
      message,
      tonePreset,
      this.settings.userPreferences,
    );

    this.logAction('MESSAGE_PROCESSED', agentType, {
      originalLength: message.length,
      processedLength: result.processed.length,
      changes: result.changes,
      tone: tonePreset,
    });

    return result.processed;
  }

  /**
   * Handle agent message events
   */
  handleAgentMessage(event) {
    const { message, agentType, context } = event;
    const processedMessage = this.processAgentMessage(message, agentType, context);

    if (processedMessage !== message) {
      event.message = processedMessage;
    }
  }

  /**
   * Handle file write events
   */
  handleFileWrite(event) {
    const { filePath, content } = event;

    if (filePath.endsWith('.md') || this.isDocumentationFile(filePath)) {
      const result = this.interceptDocumentGeneration(filePath, content);

      if (!result.allowed) {
        event.preventDefault();
        event.result = result;

        // Suggest alternative action
        if (result.suggestedPath) {
          console.warn(`Document generation blocked: ${result.reason}`);
          console.log(`Suggested alternative: ${result.suggestedPath}`);
        }
      } else {
        event.content = result.content;
        event.filePath = result.filePath;
      }
    }
  }

  /**
   * Real-time filtering middleware
   */
  createFilterMiddleware() {
    return (request, response, next) => {
      // Intercept write operations
      if (request.operation === 'write' && request.filePath) {
        const result = this.interceptDocumentGeneration(
          request.filePath,
          request.content,
          request.metadata,
        );

        if (!result.allowed) {
          response.status(403).json({
            error: 'Document generation blocked',
            reason: result.reason,
            suggestedPath: result.suggestedPath,
            modifications: result.modifications,
          });
          return;
        }

        // Update request with processed content
        request.content = result.content;
        request.filePath = result.filePath;
      }

      next();
    };
  }

  /**
   * Process multiple documents in batch
   */
  batchProcessDocuments(documents) {
    return documents.map((doc) => ({
      ...doc,
      ...this.interceptDocumentGeneration(doc.filePath, doc.content, doc.metadata),
    }));
  }

  /**
   * Apply filters to agent task output
   */
  filterTaskOutput(taskId, output, agentType) {
    const processedOutput = {
      messages: [],
      files: [],
      blocked: [],
      modified: [],
    };

    // Process messages
    if (output.messages) {
      output.messages.forEach((message) => {
        const processed = this.processAgentMessage(message.content, agentType, { taskId });
        processedOutput.messages.push({
          ...message,
          content: processed,
          modified: processed !== message.content,
        });
      });
    }

    // Process file operations
    if (output.files) {
      output.files.forEach((file) => {
        const result = this.interceptDocumentGeneration(file.path, file.content, {
          taskId,
          agentType,
        });

        if (result.allowed) {
          processedOutput.files.push({
            ...file,
            path: result.filePath,
            content: result.content,
            modified: result.processed || result.filePath !== file.path,
          });
        } else {
          processedOutput.blocked.push({
            ...file,
            reason: result.reason,
            suggestedPath: result.suggestedPath,
          });
        }
      });
    }

    this.logAction('TASK_OUTPUT_FILTERED', taskId, {
      agentType,
      messagesProcessed: processedOutput.messages.length,
      filesAllowed: processedOutput.files.length,
      filesBlocked: processedOutput.blocked.length,
    });

    return processedOutput;
  }

  // Helper methods

  determineTonePreset(agentType, context = {}) {
    const agentToneMap = {
      researcher: 'technical',
      coder: 'concise',
      reviewer: 'professional',
      tester: 'professional',
      planner: 'professional',
      'backend-dev': 'technical',
      'frontend-dev': 'friendly',
      devops: 'concise',
      generic: this.settings.userPreferences.tonePreset,
    };

    return agentToneMap[agentType] || this.settings.userPreferences.tonePreset;
  }

  isDocumentationFile(filePath) {
    const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
    const docPaths = ['/docs/', '/documentation/', '/guides/', '/README'];

    return (
      docExtensions.some((ext) => filePath.endsWith(ext)) ||
      docPaths.some((path) => filePath.includes(path))
    );
  }

  logAction(action, target, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      target,
      details,
      id: this.actionLog.length + 1,
    };

    this.actionLog.push(logEntry);

    // Keep log manageable
    if (this.actionLog.length > 1000) {
      this.actionLog = this.actionLog.slice(-500);
    }
  }

  /**
   * Add custom processor
   */
  addCustomProcessor(hookName, processor) {
    if (!this.customProcessors) {
      this.customProcessors = {};
    }

    if (!this.customProcessors[hookName]) {
      this.customProcessors[hookName] = [];
    }

    this.customProcessors[hookName].push(processor);
  }

  /**
   * Get comprehensive statistics
   */
  getFilterStats() {
    return {
      interceptCount: this.interceptCount,
      contentFilters: this.contentFilters.getFilterStats(),
      toneProcessors: this.toneProcessors.getProcessingStats(),
      recentActions: this.actionLog.slice(-20),
      settings: this.settings,
      topBlockedReasons: this.getTopBlockedReasons(),
    };
  }

  getTopBlockedReasons() {
    const reasonCounts = {};

    this.actionLog
      .filter((entry) => entry.action === 'DOCUMENT_INTERCEPT' && !entry.details.allowed)
      .forEach((entry) => {
        const reason = entry.details.reason;
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });

    return Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
  }

  /**
   * Update user preferences
   */
  updatePreferences(preferences) {
    this.settings.userPreferences = { ...this.settings.userPreferences, ...preferences };
    this.saveSettings();

    // Update processor configurations
    this.contentFilters.updateLimits(this.settings.contentFilters);
    this.toneProcessors.updateConfig(this.settings.toneProcessors);
  }

  /**
   * Export filter configuration for auditing
   */
  exportConfiguration() {
    return {
      settings: this.settings,
      stats: this.getFilterStats(),
      contentFiltersConfig: this.contentFilters.exportConfig(),
      toneProcessorsConfig: this.toneProcessors.exportConfig(),
    };
  }

  /**
   * Reset all filters and logs
   */
  reset() {
    this.contentFilters.reset();
    this.toneProcessors.reset();
    this.actionLog = [];
    this.interceptCount = 0;
  }

  /**
   * CLI command handlers for integration
   */
  static createCliHandlers(hooks) {
    return {
      'filter-check': (filePath, content) => {
        return hooks.interceptDocumentGeneration(filePath, content);
      },

      'filter-stats': () => {
        return hooks.getFilterStats();
      },

      'filter-config': (newConfig) => {
        if (newConfig) {
          hooks.updatePreferences(newConfig);
          return { updated: true, config: hooks.settings };
        }
        return hooks.settings;
      },

      'filter-reset': () => {
        hooks.reset();
        return { reset: true };
      },
    };
  }
}

export default FilterIntegrationHooks;
export { FilterIntegrationHooks };
