/**
 * Content Audit and Logging System
 * Tracks filtered content, provides insights, and maintains audit trails
 */

import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

class ContentAuditSystem {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.auditDir = join(projectRoot, '.claude', 'audit');
    this.logFile = join(this.auditDir, 'filter-audit.jsonl');
    this.summaryFile = join(this.auditDir, 'audit-summary.json');
    this.metricsFile = join(this.auditDir, 'audit-metrics.json');

    this.auditLog = [];
    this.metrics = {
      totalEntries: 0,
      filteredCount: 0,
      modifiedCount: 0,
      blockedReasons: {},
      agentActivity: {},
      fileTypeStats: {},
      hourlyActivity: Array(24).fill(0),
      dailyActivity: {}
    };

    this.sessionId = this.generateSessionId();
    this.bufferSize = 100;
    this.flushInterval = 30000; // 30 seconds

    this.ensureAuditDirectory();
    this.loadExistingMetrics();
    this.setupAutoFlush();
  }

  /**
   * Log content filtering action
   */
  logFilterAction(action, details) {
    const entry = {
      id: this.generateEntryId(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      action,
      details: this.sanitizeDetails(details),
      hash: this.generateContentHash(details.content || ''),
      size: this.calculateContentSize(details.content || ''),
      context: this.extractContext(details)
    };

    this.auditLog.push(entry);
    this.updateMetrics(entry);

    // Flush if buffer is full
    if (this.auditLog.length >= this.bufferSize) {
      this.flushToFile();
    }

    return entry.id;
  }

  /**
   * Log document generation attempt
   */
  logDocumentGeneration(filePath, content, result) {
    return this.logFilterAction('DOCUMENT_GENERATION', {
      filePath,
      content: this.truncateContent(content),
      allowed: result.allowed,
      reason: result.reason,
      suggestedPath: result.suggestedPath,
      modifications: result.modifications,
      originalLength: content?.length || 0,
      processedLength: result.content?.length || 0
    });
  }

  /**
   * Log agent message processing
   */
  logAgentMessage(agentType, message, processedMessage, context = {}) {
    const modified = message !== processedMessage;

    return this.logFilterAction('AGENT_MESSAGE', {
      agentType,
      originalMessage: this.truncateContent(message),
      processedMessage: modified ? this.truncateContent(processedMessage) : null,
      modified,
      context,
      originalLength: message?.length || 0,
      processedLength: processedMessage?.length || 0,
      toneChanges: this.detectToneChanges(message, processedMessage)
    });
  }

  /**
   * Log batch processing results
   */
  logBatchProcessing(batchId, results) {
    return this.logFilterAction('BATCH_PROCESSING', {
      batchId,
      summary: results.summary,
      blockedItems: results.blocked.length,
      modifiedItems: results.modified.length,
      errorItems: results.errors.length,
      processingTime: results.processingTime,
      throughput: results.summary.total / (results.processingTime / 1000)
    });
  }

  /**
   * Log configuration changes
   */
  logConfigChange(section, changes, user = 'system') {
    return this.logFilterAction('CONFIG_CHANGE', {
      section,
      changes: this.sanitizeConfigChanges(changes),
      user,
      previousConfig: this.getPreviousConfig(section),
      impact: this.assessConfigImpact(section, changes)
    });
  }

  /**
   * Log performance metrics
   */
  logPerformanceMetrics(metrics) {
    return this.logFilterAction('PERFORMANCE_METRICS', {
      ...metrics,
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage?.() || {},
      cpuUsage: process.cpuUsage?.() || {}
    });
  }

  /**
   * Generate comprehensive audit report
   */
  generateAuditReport(timeframe = '24h') {
    const cutoffTime = this.getTimeframeCutoff(timeframe);
    const relevantEntries = this.auditLog.filter(entry =>
      new Date(entry.timestamp) >= cutoffTime
    );

    const report = {
      generatedAt: new Date().toISOString(),
      timeframe,
      sessionId: this.sessionId,
      summary: this.generateSummary(relevantEntries),
      blockingAnalysis: this.analyzeBlockingPatterns(relevantEntries),
      agentAnalysis: this.analyzeAgentActivity(relevantEntries),
      contentAnalysis: this.analyzeContentPatterns(relevantEntries),
      performanceAnalysis: this.analyzePerformance(relevantEntries),
      recommendations: this.generateRecommendations(relevantEntries),
      trends: this.analyzeTrends(relevantEntries)
    };

    this.saveReport(report, timeframe);
    return report;
  }

  /**
   * Analyze filtering effectiveness
   */
  analyzeFilterEffectiveness() {
    const analysis = {
      totalProcessed: this.metrics.totalEntries,
      filterRate: this.metrics.filteredCount / Math.max(1, this.metrics.totalEntries),
      modificationRate: this.metrics.modifiedCount / Math.max(1, this.metrics.totalEntries),
      topBlockingReasons: this.getTopBlockingReasons(10),
      agentEffectiveness: this.analyzeAgentFilterEffectiveness(),
      timeBasedEffectiveness: this.analyzeTimeBasedEffectiveness(),
      contentTypeEffectiveness: this.analyzeContentTypeEffectiveness(),
      falsePositiveRate: this.estimateFalsePositiveRate(),
      improvementSuggestions: this.generateImprovementSuggestions()
    };

    this.logFilterAction('EFFECTIVENESS_ANALYSIS', analysis);
    return analysis;
  }

  /**
   * Search audit log with filters
   */
  searchAuditLog(query = {}) {
    let results = [...this.auditLog];

    // Apply filters
    if (query.action) {
      results = results.filter(entry => entry.action === query.action);
    }

    if (query.agentType) {
      results = results.filter(entry =>
        entry.details.agentType === query.agentType
      );
    }

    if (query.timeframe) {
      const cutoff = this.getTimeframeCutoff(query.timeframe);
      results = results.filter(entry =>
        new Date(entry.timestamp) >= cutoff
      );
    }

    if (query.blocked !== undefined) {
      results = results.filter(entry =>
        (entry.details.allowed === false) === query.blocked
      );
    }

    if (query.modified !== undefined) {
      results = results.filter(entry =>
        entry.details.modified === query.modified
      );
    }

    if (query.contentType) {
      results = results.filter(entry =>
        this.detectContentType(entry) === query.contentType
      );
    }

    if (query.textSearch) {
      const searchTerm = query.textSearch.toLowerCase();
      results = results.filter(entry =>
        JSON.stringify(entry.details).toLowerCase().includes(searchTerm)
      );
    }

    // Sort results
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';

    results.sort((a, b) => {
      let aVal = a[sortBy] || a.details[sortBy];
      let bVal = b[sortBy] || b.details[sortBy];

      if (sortBy === 'timestamp') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Limit results
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return {
      total: this.auditLog.length,
      filtered: results.length,
      results,
      query
    };
  }

  /**
   * Export audit data in various formats
   */
  exportAuditData(format = 'json', options = {}) {
    const data = {
      exportedAt: new Date().toISOString(),
      sessionId: this.sessionId,
      metrics: this.metrics,
      auditLog: options.includeFullLog ? this.auditLog : this.auditLog.slice(-1000),
      summary: this.generateSummary(this.auditLog)
    };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'csv':
        return this.convertToCSV(data.auditLog);

      case 'markdown':
        return this.convertToMarkdown(data);

      case 'html':
        return this.convertToHTML(data);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Import audit data from backup
   */
  importAuditData(data, merge = false) {
    try {
      const importedData = typeof data === 'string' ? JSON.parse(data) : data;

      if (merge) {
        // Merge with existing data
        this.auditLog = [...this.auditLog, ...importedData.auditLog];
        this.mergeMetrics(importedData.metrics);
      } else {
        // Replace existing data
        this.auditLog = importedData.auditLog || [];
        this.metrics = importedData.metrics || this.resetMetrics();
      }

      this.flushToFile();
      return { imported: true, entries: this.auditLog.length };

    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * Get audit statistics dashboard data
   */
  getDashboardData() {
    const last24h = this.getRecentEntries('24h');
    const last7d = this.getRecentEntries('7d');

    return {
      overview: {
        totalEntries: this.metrics.totalEntries,
        filteredToday: last24h.filter(e => !e.details.allowed).length,
        modifiedToday: last24h.filter(e => e.details.modified).length,
        errorRate: this.calculateErrorRate(last24h)
      },
      trends: {
        hourlyActivity: this.metrics.hourlyActivity,
        dailyActivity: this.getDailyActivityTrend(7),
        weeklyComparison: this.getWeeklyComparison()
      },
      topStats: {
        blockingReasons: this.getTopBlockingReasons(5),
        activeAgents: this.getTopActiveAgents(5),
        contentTypes: this.getTopContentTypes(5)
      },
      performance: {
        avgProcessingTime: this.calculateAvgProcessingTime(last24h),
        throughput: this.calculateThroughput(last24h),
        efficiency: this.calculateFilterEfficiency(last24h)
      },
      alerts: this.generateAlerts()
    };
  }

  // Private helper methods

  ensureAuditDirectory() {
    const auditDir = dirname(this.logFile);
    if (!existsSync(auditDir)) {
      require('fs').mkdirSync(auditDir, { recursive: true });
    }
  }

  loadExistingMetrics() {
    try {
      if (existsSync(this.metricsFile)) {
        const metricsData = readFileSync(this.metricsFile, 'utf8');
        this.metrics = { ...this.metrics, ...JSON.parse(metricsData) };
      }
    } catch (error) {
      console.warn('Error loading existing metrics:', error.message);
    }
  }

  flushToFile() {
    try {
      // Append new entries to JSONL file
      const newEntries = this.auditLog.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      appendFileSync(this.logFile, newEntries);

      // Update metrics file
      writeFileSync(this.metricsFile, JSON.stringify(this.metrics, null, 2));

      // Clear buffer
      this.auditLog = [];

    } catch (error) {
      console.error('Error flushing audit data:', error.message);
    }
  }

  setupAutoFlush() {
    setInterval(() => {
      if (this.auditLog.length > 0) {
        this.flushToFile();
      }
    }, this.flushInterval);

    // Flush on process exit
    process.on('beforeExit', () => {
      this.flushToFile();
    });
  }

  updateMetrics(entry) {
    this.metrics.totalEntries++;

    if (!entry.details.allowed) {
      this.metrics.filteredCount++;

      const reason = entry.details.reason || 'Unknown';
      this.metrics.blockedReasons[reason] = (this.metrics.blockedReasons[reason] || 0) + 1;
    }

    if (entry.details.modified) {
      this.metrics.modifiedCount++;
    }

    // Agent activity
    const agentType = entry.details.agentType || 'Unknown';
    if (!this.metrics.agentActivity[agentType]) {
      this.metrics.agentActivity[agentType] = { total: 0, blocked: 0, modified: 0 };
    }
    this.metrics.agentActivity[agentType].total++;
    if (!entry.details.allowed) this.metrics.agentActivity[agentType].blocked++;
    if (entry.details.modified) this.metrics.agentActivity[agentType].modified++;

    // File type stats
    const fileType = this.extractFileType(entry.details.filePath);
    this.metrics.fileTypeStats[fileType] = (this.metrics.fileTypeStats[fileType] || 0) + 1;

    // Time-based activity
    const hour = new Date(entry.timestamp).getHours();
    this.metrics.hourlyActivity[hour]++;

    const day = new Date(entry.timestamp).toDateString();
    this.metrics.dailyActivity[day] = (this.metrics.dailyActivity[day] || 0) + 1;
  }

  sanitizeDetails(details) {
    // Remove sensitive information and truncate large content
    const sanitized = { ...details };

    if (sanitized.content) {
      sanitized.content = this.truncateContent(sanitized.content);
    }

    if (sanitized.originalMessage) {
      sanitized.originalMessage = this.truncateContent(sanitized.originalMessage);
    }

    if (sanitized.processedMessage) {
      sanitized.processedMessage = this.truncateContent(sanitized.processedMessage);
    }

    // Remove potential secrets
    ['password', 'token', 'key', 'secret'].forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  truncateContent(content, maxLength = 500) {
    if (!content) return content;
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '... [truncated]';
  }

  generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `session_${timestamp}_${random}`;
  }

  generateEntryId() {
    return `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  generateContentHash(content) {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  calculateContentSize(content) {
    return Buffer.byteLength(content, 'utf8');
  }

  extractContext(details) {
    return {
      agentType: details.agentType,
      projectType: details.projectType,
      taskType: details.taskType,
      fileExtension: this.extractFileType(details.filePath),
      contentLength: details.content?.length || 0
    };
  }

  extractFileType(filePath) {
    if (!filePath) return 'unknown';
    const parts = filePath.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'none';
  }

  detectToneChanges(original, processed) {
    if (!original || !processed || original === processed) {
      return [];
    }

    const changes = [];

    // Detect exclamation mark changes
    const originalExclamations = (original.match(/!/g) || []).length;
    const processedExclamations = (processed.match(/!/g) || []).length;
    if (originalExclamations !== processedExclamations) {
      changes.push('exclamation-adjustment');
    }

    // Detect formality changes
    const formalityChange = this.detectFormalityChange(original, processed);
    if (formalityChange) {
      changes.push(formalityChange);
    }

    return changes;
  }

  detectFormalityChange(original, processed) {
    const contractions = ["can't", "won't", "don't", "isn't", "let's"];
    const expansions = ["cannot", "will not", "do not", "is not", "let us"];

    const originalContractions = contractions.reduce((count, word) =>
      count + (original.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0);
    const processedContractions = contractions.reduce((count, word) =>
      count + (processed.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0);

    if (originalContractions > processedContractions) {
      return 'formalization';
    } else if (originalContractions < processedContractions) {
      return 'casualization';
    }

    return null;
  }

  getTimeframeCutoff(timeframe) {
    const now = new Date();
    switch (timeframe) {
      case '1h': return new Date(now - 1 * 60 * 60 * 1000);
      case '24h': return new Date(now - 24 * 60 * 60 * 1000);
      case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000);
      default: return new Date(now - 24 * 60 * 60 * 1000);
    }
  }

  generateSummary(entries) {
    const total = entries.length;
    const blocked = entries.filter(e => !e.details.allowed).length;
    const modified = entries.filter(e => e.details.modified).length;

    return {
      total,
      blocked,
      modified,
      allowed: total - blocked,
      blockingRate: total > 0 ? (blocked / total) * 100 : 0,
      modificationRate: total > 0 ? (modified / total) * 100 : 0
    };
  }

  getTopBlockingReasons(limit = 5) {
    return Object.entries(this.metrics.blockedReasons)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([reason, count]) => ({ reason, count }));
  }

  saveReport(report, timeframe) {
    const reportFile = join(this.auditDir, `audit-report-${timeframe}-${Date.now()}.json`);
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
  }

  resetMetrics() {
    return {
      totalEntries: 0,
      filteredCount: 0,
      modifiedCount: 0,
      blockedReasons: {},
      agentActivity: {},
      fileTypeStats: {},
      hourlyActivity: Array(24).fill(0),
      dailyActivity: {}
    };
  }

  /**
   * Cleanup old audit files
   */
  cleanup(retentionDays = 30) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Clean up old daily activity data
    Object.keys(this.metrics.dailyActivity).forEach(day => {
      if (new Date(day) < cutoff) {
        delete this.metrics.dailyActivity[day];
      }
    });

    this.flushToFile();
  }
}

export default ContentAuditSystem;
export { ContentAuditSystem };