/**
 * Content Filtering System
 * Prevents unnecessary documentation generation and root directory clutter
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

class ContentFilters {
  constructor(config = {}) {
    this.config = {
      maxMdFiles: config.maxMdFiles || 10,
      allowedDocTypes: config.allowedDocTypes || ['API', 'README', 'CHANGELOG'],
      blockedPatterns: config.blockedPatterns || [
        /IMPLEMENTATION_REPORT/i,
        /COMPLETION_SUMMARY/i,
        /AGENT_REPORT/i,
        /PERFORMANCE_ANALYSIS/i,
        /^TEMP_/i,
        /^WORKING_/i
      ],
      rootDirectoryProtection: config.rootDirectoryProtection !== false,
      allowedRootFiles: config.allowedRootFiles || ['README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md'],
      preferredDirectories: config.preferredDirectories || {
        docs: ['documentation', 'guides', 'api-docs'],
        reports: ['reports', 'analysis', 'summaries'],
        temp: ['temp', 'working', 'draft'],
        tests: ['test-reports', 'coverage', 'benchmarks']
      }
    };

    this.contentAudit = [];
    this.filteredCount = 0;
  }

  /**
   * Filter document generation requests
   */
  filterDocumentRequest(filePath, content, metadata = {}) {
    const filterResult = {
      allowed: true,
      reason: '',
      suggestedPath: filePath,
      modifications: []
    };

    // Check root directory protection
    if (this.config.rootDirectoryProtection && this.isRootFile(filePath)) {
      if (!this.isAllowedRootFile(filePath)) {
        filterResult.allowed = false;
        filterResult.reason = 'Root directory protection - file should be in subdirectory';
        filterResult.suggestedPath = this.suggestAlternativePath(filePath);
        this.logFilterAction('ROOT_PROTECTION', filePath, filterResult.suggestedPath);
        return filterResult;
      }
    }

    // Check .md file limits
    if (this.isMdFile(filePath) && !this.withinMdFileLimit()) {
      filterResult.allowed = false;
      filterResult.reason = `Exceeded maximum .md file limit (${this.config.maxMdFiles})`;
      filterResult.suggestedPath = this.suggestConsolidation(filePath);
      this.logFilterAction('MD_LIMIT', filePath);
      return filterResult;
    }

    // Check blocked patterns
    const blockedPattern = this.findBlockedPattern(filePath);
    if (blockedPattern) {
      filterResult.allowed = false;
      filterResult.reason = `Filename matches blocked pattern: ${blockedPattern.source}`;
      this.logFilterAction('BLOCKED_PATTERN', filePath, blockedPattern.source);
      return filterResult;
    }

    // Check document type allowlist
    if (this.isMdFile(filePath) && !this.isAllowedDocType(filePath)) {
      filterResult.allowed = false;
      filterResult.reason = 'Document type not in allowlist';
      filterResult.suggestedPath = this.suggestDocTypeAlternative(filePath);
      this.logFilterAction('DOC_TYPE', filePath);
      return filterResult;
    }

    // Content-based filtering
    const contentFilters = this.analyzeContent(content);
    if (contentFilters.block) {
      filterResult.allowed = false;
      filterResult.reason = contentFilters.reason;
      filterResult.modifications = contentFilters.modifications;
      this.logFilterAction('CONTENT_FILTER', filePath, contentFilters.reason);
      return filterResult;
    }

    // Suggest path improvements
    const betterPath = this.optimizeFilePath(filePath);
    if (betterPath !== filePath) {
      filterResult.suggestedPath = betterPath;
      filterResult.modifications.push(`Suggested better path: ${betterPath}`);
    }

    this.logFilterAction('ALLOWED', filePath);
    return filterResult;
  }

  /**
   * Selective document type filtering
   */
  filterByDocumentType(filePath, documentType) {
    if (!documentType) {
      documentType = this.inferDocumentType(filePath);
    }

    const typeConfig = this.config.documentTypeFilters?.[documentType] || {};

    return {
      allowed: this.config.allowedDocTypes.includes(documentType),
      documentType,
      restrictions: typeConfig.restrictions || [],
      maxSize: typeConfig.maxSize || null,
      requiredSections: typeConfig.requiredSections || []
    };
  }

  /**
   * Configurable limits management
   */
  updateLimits(newLimits) {
    this.config = { ...this.config, ...newLimits };
    this.logFilterAction('CONFIG_UPDATE', null, newLimits);
  }

  /**
   * Get current filter statistics
   */
  getFilterStats() {
    return {
      totalFiltered: this.filteredCount,
      currentMdCount: this.getCurrentMdCount(),
      maxMdFiles: this.config.maxMdFiles,
      recentActions: this.contentAudit.slice(-10),
      topBlockedPatterns: this.getTopBlockedPatterns()
    };
  }

  // Private helper methods

  isRootFile(filePath) {
    const dir = dirname(filePath);
    return dir === '.' || dir === '/' || dir.endsWith('claude-flow-novice');
  }

  isAllowedRootFile(filePath) {
    const fileName = filePath.split('/').pop();
    return this.config.allowedRootFiles.includes(fileName);
  }

  isMdFile(filePath) {
    return filePath.toLowerCase().endsWith('.md');
  }

  withinMdFileLimit() {
    return this.getCurrentMdCount() < this.config.maxMdFiles;
  }

  getCurrentMdCount() {
    // This would scan the project for .md files in real implementation
    // For now, return a mock count
    return 5;
  }

  findBlockedPattern(filePath) {
    const fileName = filePath.split('/').pop();
    return this.config.blockedPatterns.find(pattern => pattern.test(fileName));
  }

  isAllowedDocType(filePath) {
    const docType = this.inferDocumentType(filePath);
    return this.config.allowedDocTypes.includes(docType);
  }

  inferDocumentType(filePath) {
    const fileName = filePath.split('/').pop().toUpperCase();

    if (fileName.includes('README')) return 'README';
    if (fileName.includes('API') || fileName.includes('DOCS')) return 'API';
    if (fileName.includes('CHANGELOG') || fileName.includes('HISTORY')) return 'CHANGELOG';
    if (fileName.includes('TEST') || fileName.includes('SPEC')) return 'TEST';
    if (fileName.includes('REPORT') || fileName.includes('ANALYSIS')) return 'REPORT';
    if (fileName.includes('GUIDE') || fileName.includes('TUTORIAL')) return 'GUIDE';

    return 'OTHER';
  }

  analyzeContent(content) {
    if (!content) return { block: false };

    const result = {
      block: false,
      reason: '',
      modifications: []
    };

    // Check for self-congratulatory content
    const selfCongratulatory = [
      /successfully implemented/gi,
      /perfectly executed/gi,
      /flawlessly completed/gi,
      /amazing results/gi,
      /outstanding performance/gi
    ];

    const hasSelfCongratulatory = selfCongratulatory.some(pattern => pattern.test(content));
    if (hasSelfCongratulatory) {
      result.modifications.push('Remove self-congratulatory language');
    }

    // Check for excessive technical jargon
    const jargonDensity = this.calculateJargonDensity(content);
    if (jargonDensity > 0.3) {
      result.modifications.push('Simplify technical jargon');
    }

    // Check for redundant status updates
    const statusUpdates = content.match(/status:|completed:|finished:|done:/gi);
    if (statusUpdates && statusUpdates.length > 5) {
      result.block = true;
      result.reason = 'Excessive status updates - consider consolidation';
    }

    // Check minimum value content
    if (content.length < 100 && this.isMdFile('dummy.md')) {
      result.block = true;
      result.reason = 'Content too short to warrant separate document';
    }

    return result;
  }

  calculateJargonDensity(content) {
    const jargonTerms = [
      'orchestration', 'microservices', 'containerization', 'kubernetes',
      'distributed systems', 'event-driven', 'asynchronous', 'paradigm',
      'infrastructure', 'scalability', 'optimization', 'refactoring'
    ];

    const words = content.toLowerCase().split(/\s+/);
    const jargonCount = words.filter(word =>
      jargonTerms.some(term => term.includes(word) || word.includes(term))
    ).length;

    return jargonCount / words.length;
  }

  suggestAlternativePath(filePath) {
    const fileName = filePath.split('/').pop();
    const docType = this.inferDocumentType(fileName);

    const dirMap = {
      'REPORT': 'reports',
      'API': 'docs',
      'GUIDE': 'docs',
      'TEST': 'tests',
      'OTHER': 'docs'
    };

    const suggestedDir = dirMap[docType] || 'docs';
    return `${suggestedDir}/${fileName}`;
  }

  suggestConsolidation(filePath) {
    const docType = this.inferDocumentType(filePath);
    return `docs/consolidated-${docType.toLowerCase()}.md`;
  }

  suggestDocTypeAlternative(filePath) {
    return `docs/misc/${filePath.split('/').pop()}`;
  }

  optimizeFilePath(filePath) {
    // Suggest better organization
    const fileName = filePath.split('/').pop();
    const docType = this.inferDocumentType(fileName);

    if (!filePath.includes('/') && this.isMdFile(filePath)) {
      return this.suggestAlternativePath(filePath);
    }

    return filePath;
  }

  logFilterAction(action, filePath, details = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      filePath,
      details,
      id: this.contentAudit.length + 1
    };

    this.contentAudit.push(logEntry);

    if (action !== 'ALLOWED') {
      this.filteredCount++;
    }

    // Keep audit log manageable
    if (this.contentAudit.length > 1000) {
      this.contentAudit = this.contentAudit.slice(-500);
    }
  }

  getTopBlockedPatterns() {
    const patternCounts = {};

    this.contentAudit
      .filter(entry => entry.action === 'BLOCKED_PATTERN')
      .forEach(entry => {
        patternCounts[entry.details] = (patternCounts[entry.details] || 0) + 1;
      });

    return Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));
  }

  /**
   * Export filter configuration
   */
  exportConfig() {
    return {
      ...this.config,
      stats: this.getFilterStats()
    };
  }

  /**
   * Reset filters and audit log
   */
  reset() {
    this.contentAudit = [];
    this.filteredCount = 0;
  }
}

export default ContentFilters;
export { ContentFilters };