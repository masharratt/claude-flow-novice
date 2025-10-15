#!/usr/bin/env node

/**
 * Context Curate Slash Command
 *
 * Curate and manage project context data
 */

export class ContextCurateCommand {
  constructor() {
    this.name = 'context-curate';
    this.description = 'Curate and manage project context data';
    this.usage = '/context-curate <action> [options]';
  }

  /**
   * Execute the context curate command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Action required. Use: clean, archive, backup, restore, validate'
      };
    }

    const action = args[0];
    const options = this.parseArgs(args.slice(1));

    try {
      // Import dynamically to avoid circular dependencies
      const { SQLiteMemorySystem } = await import('../memory/sqlite-memory-system.js');
      const memory = new SQLiteMemorySystem({
        swarmId: context.swarmId || 'default',
        agentId: context.agentId || 'context-curate',
        dbPath: context.dbPath || './swarm-memory.db'
      });
      await memory.initialize();

      let result;

      switch (action) {
        case 'clean':
          result = await this.cleanContext(memory, options);
          break;
        case 'archive':
          result = await this.archiveContext(memory, options);
          break;
        case 'backup':
          result = await this.backupContext(memory, options);
          break;
        case 'restore':
          result = await this.restoreContext(memory, options);
          break;
        case 'validate':
          result = await this.validateContext(memory, options);
          break;
        case 'stats':
          result = await this.getContextStats(memory, options);
          break;
        default:
          result = {
            success: false,
            error: `Unknown action: ${action}. Use: clean, archive, backup, restore, validate, stats`
          };
      }

      return {
        success: result.success,
        action: action,
        options: options,
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Context curation failed: ${error.message}`,
        action: action,
        options: options
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      pattern: null,
      olderThan: null,
      level: null,
      dryRun: false,
      force: false,
      backupPath: null
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'pattern') {
          options.pattern = value;
        } else if (key === 'older-than') {
          options.olderThan = this.parseDuration(value);
        } else if (key === 'level') {
          options.level = value;
        } else if (key === 'dry-run') {
          options.dryRun = true;
        } else if (key === 'force') {
          options.force = true;
        } else if (key === 'backup') {
          options.backupPath = value || `./backup-${Date.now()}.json`;
        }
      }
    }

    return options;
  }

  /**
   * Parse duration string to milliseconds
   * @param {string} duration - Duration string (e.g., "7d", "24h", "30m")
   */
  parseDuration(duration) {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const [, amount, unit] = match;
    const multipliers = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    return parseInt(amount) * multipliers[unit];
  }

  /**
   * Clean old context data
   * @param {SQLiteMemorySystem} memory - Memory system
   * @param {Object} options - Cleaning options
   */
  async cleanContext(memory, options) {
    const pattern = options.pattern || 'cfn/phase-*/loop*/*';
    const cutoffTime = options.olderThan ? Date.now() - options.olderThan : null;

    // Get matching keys
    const data = await memory.memoryAdapter.getPattern(pattern, {
      agentId: options.level || 'context-curate',
      aclLevel: this.getAclLevel(options.level) || 4
    });

    const keysToDelete = [];
    const now = Date.now();

    for (const item of data) {
      let shouldDelete = false;

      if (cutoffTime) {
        // Check timestamp if available
        const timestamp = item.value?.timestamp || item.timestamp;
        if (timestamp && timestamp < cutoffTime) {
          shouldDelete = true;
        }
      } else {
        // Default: delete very old entries (>30 days)
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        const timestamp = item.value?.timestamp || item.timestamp;
        if (timestamp && (now - timestamp) > thirtyDays) {
          shouldDelete = true;
        }
      }

      if (shouldDelete) {
        keysToDelete.push(item.key);
      }
    }

    if (options.dryRun) {
      return {
        success: true,
        dryRun: true,
        wouldDelete: keysToDelete.length,
        keys: keysToDelete.slice(0, 10), // Show first 10
        message: `Dry run: Would delete ${keysToDelete.length} keys`
      };
    }

    // Create backup if requested
    if (options.backupPath) {
      const backupData = {};
      for (const key of keysToDelete) {
        backupData[key] = await memory.memoryAdapter.get(key, {
          agentId: 'context-curate',
          aclLevel: 4
        });
      }
      await this.writeBackup(backupData, options.backupPath);
    }

    // Delete keys
    let deletedCount = 0;
    for (const key of keysToDelete) {
      try {
        await memory.memoryAdapter.delete(key, {
          agentId: 'context-curate',
          aclLevel: 4
        });
        deletedCount++;
      } catch (error) {
        console.warn(`Failed to delete key ${key}: ${error.message}`);
      }
    }

    return {
      success: true,
      deleted: deletedCount,
      attempted: keysToDelete.length,
      backup: options.backupPath || null,
      message: `Deleted ${deletedCount} context entries`
    };
  }

  /**
   * Archive context data
   * @param {SQLiteMemorySystem} memory - Memory system
   * @param {Object} options - Archive options
   */
  async archiveContext(memory, options) {
    const pattern = options.pattern || 'cfn/phase-*/loop*/*';
    const archivePath = options.backupPath || `./archive-${Date.now()}.json`;

    const data = await memory.memoryAdapter.getPattern(pattern, {
      agentId: 'context-curate',
      aclLevel: this.getAclLevel(options.level) || 4
    });

    const archiveData = {
      metadata: {
        archivedAt: new Date().toISOString(),
        count: data.length,
        pattern: pattern,
        swarmId: memory.swarmId
      },
      data: data
    };

    await this.writeBackup(archiveData, archivePath);

    if (!options.dryRun) {
      // Optionally delete after archiving
      if (options.force) {
        const keysToDelete = data.map(item => item.key);
        let deletedCount = 0;
        for (const key of keysToDelete) {
          try {
            await memory.memoryAdapter.delete(key, {
              agentId: 'context-curate',
              aclLevel: 4
            });
            deletedCount++;
          } catch (error) {
            console.warn(`Failed to delete key ${key}: ${error.message}`);
          }
        }
        return {
          success: true,
          archived: data.length,
          deleted: deletedCount,
          archivePath: archivePath,
          message: `Archived ${data.length} entries to ${archivePath}`
        };
      }
    }

    return {
      success: true,
      archived: data.length,
      archivePath: archivePath,
      message: `Archived ${data.length} entries to ${archivePath}`
    };
  }

  /**
   * Backup context data
   * @param {SQLiteMemorySystem} memory - Memory system
   * @param {Object} options - Backup options
   */
  async backupContext(memory, options) {
    const pattern = options.pattern || '*';
    const backupPath = options.backupPath || `./backup-${Date.now()}.json`;

    const data = await memory.memoryAdapter.getPattern(pattern, {
      agentId: 'context-curate',
      aclLevel: this.getAclLevel(options.level) || 4
    });

    const backupData = {
      metadata: {
        backedUpAt: new Date().toISOString(),
        count: data.length,
        pattern: pattern,
        swarmId: memory.swarmId
      },
      data: data
    };

    await this.writeBackup(backupData, backupPath);

    return {
      success: true,
      backedUp: data.length,
      backupPath: backupPath,
      message: `Backed up ${data.length} entries to ${backupPath}`
    };
  }

  /**
   * Restore context data from backup
   * @param {SQLiteMemorySystem} memory - Memory system
   * @param {Object} options - Restore options
   */
  async restoreContext(memory, options) {
    if (!options.backupPath) {
      return {
        success: false,
        error: 'Backup path required for restore operation'
      };
    }

    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const backupContent = await fs.readFile(path.resolve(options.backupPath), 'utf8');
      const backupData = JSON.parse(backupContent);

      if (!backupData.data || !Array.isArray(backupData.data)) {
        return {
          success: false,
          error: 'Invalid backup file format'
        };
      }

      let restoredCount = 0;
      for (const item of backupData.data) {
        try {
          await memory.memoryAdapter.set(item.key, item.value, {
            agentId: 'context-curate',
            aclLevel: this.getAclLevel(options.level) || 4,
            namespace: item.namespace
          });
          restoredCount++;
        } catch (error) {
          console.warn(`Failed to restore key ${item.key}: ${error.message}`);
        }
      }

      return {
        success: true,
        restored: restoredCount,
        attempted: backupData.data.length,
        backupPath: options.backupPath,
        metadata: backupData.metadata,
        message: `Restored ${restoredCount} entries from ${options.backupPath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to restore backup: ${error.message}`
      };
    }
  }

  /**
   * Validate context data integrity
   * @param {SQLiteMemorySystem} memory - Memory system
   * @param {Object} options - Validation options
   */
  async validateContext(memory, options) {
    const pattern = options.pattern || 'cfn/phase-*/loop*/*';
    const data = await memory.memoryAdapter.getPattern(pattern, {
      agentId: 'context-curate',
      aclLevel: this.getAclLevel(options.level) || 4
    });

    const issues = [];
    let validCount = 0;

    for (const item of data) {
      const validation = this.validateEntry(item);
      if (validation.valid) {
        validCount++;
      } else {
        issues.push({
          key: item.key,
          issues: validation.issues
        });
      }
    }

    return {
      success: true,
      total: data.length,
      valid: validCount,
      issues: issues.length,
      issueDetails: issues.slice(0, 10), // Show first 10 issues
      message: `Validation complete: ${validCount}/${data.length} entries valid`
    };
  }

  /**
   * Get context statistics
   * @param {SQLiteMemorySystem} memory - Memory system
   * @param {Object} options - Stats options
   */
  async getContextStats(memory, options) {
    const pattern = options.pattern || '*';
    const data = await memory.memoryAdapter.getPattern(pattern, {
      agentId: 'context-curate',
      aclLevel: this.getAclLevel(options.level) || 4
    });

    const stats = {
      totalEntries: data.length,
      phases: new Set(),
      loops: new Set(),
      agents: new Set(),
      confidenceScores: [],
      timestamps: [],
      sizeEstimate: 0
    };

    for (const item of data) {
      // Extract pattern information
      const phaseMatch = item.key.match(/phase-([^\/]+)/);
      const loopMatch = item.key.match(/loop(\d+)/);
      const agentMatch = item.key.match(/\/([^\/]+)\/[^\/]*$/);

      if (phaseMatch) stats.phases.add(phaseMatch[1]);
      if (loopMatch) stats.loops.add(loopMatch[1]);
      if (agentMatch) stats.agents.add(agentMatch[1]);

      // Extract metrics
      if (item.value && typeof item.value === 'object') {
        if (item.value.confidence) {
          stats.confidenceScores.push(item.value.confidence);
        }
        if (item.value.timestamp) {
          stats.timestamps.push(item.value.timestamp);
        }
      }

      // Estimate size
      stats.sizeEstimate += JSON.stringify(item).length;
    }

    // Convert sets to counts
    stats.phases = stats.phases.size;
    stats.loops = stats.loops.size;
    stats.agents = stats.agents.size;

    // Calculate averages
    if (stats.confidenceScores.length > 0) {
      stats.avgConfidence = stats.confidenceScores.reduce((a, b) => a + b, 0) / stats.confidenceScores.length;
      stats.minConfidence = Math.min(...stats.confidenceScores);
      stats.maxConfidence = Math.max(...stats.confidenceScores);
    }

    if (stats.timestamps.length > 0) {
      stats.oldestEntry = new Date(Math.min(...stats.timestamps)).toISOString();
      stats.newestEntry = new Date(Math.max(...stats.timestamps)).toISOString();
    }

    // Convert bytes to human readable
    stats.sizeEstimate = this.formatBytes(stats.sizeEstimate);

    return {
      success: true,
      stats: stats,
      message: `Statistics for ${stats.totalEntries} entries`
    };
  }

  /**
   * Validate a single context entry
   * @param {Object} entry - Context entry
   */
  validateEntry(entry) {
    const issues = [];

    if (!entry.key) {
      issues.push('Missing key');
    }

    if (!entry.value) {
      issues.push('Missing value');
    }

    if (entry.key && typeof entry.key !== 'string') {
      issues.push('Key must be string');
    }

    // Check confidence if present
    if (entry.value && typeof entry.value === 'object' && 'confidence' in entry.value) {
      if (typeof entry.value.confidence !== 'number' || entry.value.confidence < 0 || entry.value.confidence > 1) {
        issues.push('Invalid confidence value (must be 0-1)');
      }
    }

    // Check timestamp if present
    if (entry.value && typeof entry.value === 'object' && 'timestamp' in entry.value) {
      if (typeof entry.value.timestamp !== 'number' || entry.value.timestamp < 0) {
        issues.push('Invalid timestamp (must be positive number)');
      }
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }

  /**
   * Write backup data to file
   * @param {Object} data - Backup data
   * @param {string} filePath - File path
   */
  async writeBackup(data, filePath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    await fs.writeFile(path.resolve(filePath), JSON.stringify(data, null, 2));
  }

  /**
   * Convert level string to ACL level number
   * @param {string} level - Level string
   */
  getAclLevel(level) {
    const levels = {
      'agent': 1,
      'team': 2,
      'swarm': 3,
      'project': 4,
      'system': 5
    };
    return levels[level] || 4;
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/context-curate stats',
        '/context-curate clean --older-than=7d --dry-run',
        '/context-curate archive --pattern="cfn/phase-auth/*" --backup=auth-archive.json',
        '/context-curate backup --backup=daily-backup.json',
        '/context-curate restore --backup=daily-backup.json',
        '/context-curate validate --pattern="cfn/phase-*/loop3/*"'
      ],
      actions: [
        {
          name: 'clean',
          description: 'Remove old context data'
        },
        {
          name: 'archive',
          description: 'Archive context data to file'
        },
        {
          name: 'backup',
          description: 'Backup context data to file'
        },
        {
          name: 'restore',
          description: 'Restore context data from backup'
        },
        {
          name: 'validate',
          description: 'Validate context data integrity'
        },
        {
          name: 'stats',
          description: 'Show context statistics'
        }
      ],
      options: [
        {
          name: '--pattern',
          description: 'Pattern for matching keys (default: cfn/phase-*/loop*/*)'
        },
        {
          name: '--older-than',
          description: 'Delete entries older than duration (e.g., 7d, 24h, 30m)'
        },
        {
          name: '--level',
          description: 'ACL level: agent, team, swarm, project, system'
        },
        {
          name: '--dry-run',
          description: 'Show what would be done without executing'
        },
        {
          name: '--force',
          description: 'Force deletion after archiving'
        },
        {
          name: '--backup',
          description: 'Path for backup file'
        }
      ]
    };
  }
}

export default ContextCurateCommand;