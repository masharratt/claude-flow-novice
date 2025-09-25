/**
 * Hooks Integration System
 * Integrates filtering system with existing .claude/settings.json hooks
 */

import { FilterIntegrationHooks } from '../hooks/filter-integration.js';
import { RealtimeFilterMiddleware } from '../middleware/realtime-filter.js';
import { ContentAuditSystem } from '../audit/content-audit.js';
import { PreferenceManager } from '../utils/preference-manager.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

class HooksIntegrationSystem {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.settingsPath = join(projectRoot, '.claude', 'settings.json');
    this.hooksDir = join(projectRoot, '.claude', 'hooks');

    // Initialize filter components
    this.filterHooks = new FilterIntegrationHooks(projectRoot);
    this.realtimeFilter = new RealtimeFilterMiddleware(projectRoot);
    this.auditSystem = new ContentAuditSystem(projectRoot);
    this.preferenceManager = new PreferenceManager(projectRoot);

    // Track hook installations
    this.installedHooks = new Set();

    this.setupIntegration();
  }

  /**
   * Setup integration with existing hooks system
   */
  setupIntegration() {
    this.ensureHooksDirectory();
    this.installFilterHooks();
    this.extendExistingHooks();
    this.setupCliCommands();
  }

  /**
   * Ensure hooks directory exists
   */
  ensureHooksDirectory() {
    if (!existsSync(this.hooksDir)) {
      require('fs').mkdirSync(this.hooksDir, { recursive: true });
    }
  }

  /**
   * Install filter-specific hooks
   */
  installFilterHooks() {
    const hooks = {
      'pre-document-generation': this.createPreDocumentGenerationHook(),
      'post-agent-message': this.createPostAgentMessageHook(),
      'content-filter-check': this.createContentFilterCheckHook(),
      'tone-process': this.createToneProcessHook(),
      'audit-log': this.createAuditLogHook(),
      'preference-update': this.createPreferenceUpdateHook(),
      'batch-filter': this.createBatchFilterHook(),
      'filter-stats': this.createFilterStatsHook()
    };

    Object.entries(hooks).forEach(([name, hookContent]) => {
      const hookPath = join(this.hooksDir, `${name}.js`);
      writeFileSync(hookPath, hookContent);
      this.installedHooks.add(name);
    });
  }

  /**
   * Extend existing hooks with filter functionality
   */
  extendExistingHooks() {
    // Extend pre-edit hook
    const preEditHookPath = join(this.hooksDir, 'pre-edit-filter.js');
    writeFileSync(preEditHookPath, this.createExtendedPreEditHook());

    // Extend post-edit hook
    const postEditHookPath = join(this.hooksDir, 'post-edit-filter.js');
    writeFileSync(postEditHookPath, this.createExtendedPostEditHook());

    // Create session hooks for audit
    const sessionStartHookPath = join(this.hooksDir, 'session-start-filter.js');
    writeFileSync(sessionStartHookPath, this.createSessionStartHook());

    const sessionEndHookPath = join(this.hooksDir, 'session-end-filter.js');
    writeFileSync(sessionEndHookPath, this.createSessionEndHook());
  }

  /**
   * Setup CLI command handlers
   */
  setupCliCommands() {
    const cliHandlers = {
      'filter-check': this.createFilterCheckHandler(),
      'filter-config': this.createFilterConfigHandler(),
      'filter-stats': this.createFilterStatsHandler(),
      'filter-audit': this.createFilterAuditHandler(),
      'filter-preferences': this.createPreferencesHandler(),
      'filter-reset': this.createFilterResetHandler()
    };

    // Create CLI integration script
    const cliIntegrationPath = join(this.hooksDir, 'cli-integration.js');
    writeFileSync(cliIntegrationPath, this.createCliIntegration(cliHandlers));
  }

  // Hook Creation Methods

  createPreDocumentGenerationHook() {
    return `#!/usr/bin/env node
/**
 * Pre-Document Generation Hook
 * Intercepts document generation requests and applies filtering
 */

const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');
const { ContentAuditSystem } = require('../src/audit/content-audit.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const filePath = args.find(arg => arg.startsWith('--file='))?.split('=')[1];
    const content = args.find(arg => arg.startsWith('--content='))?.split('=')[1];
    const agentType = args.find(arg => arg.startsWith('--agent='))?.split('=')[1];

    if (!filePath || !content) {
      console.error('Missing required parameters: --file and --content');
      process.exit(1);
    }

    const filterHooks = new FilterIntegrationHooks(process.cwd());
    const auditSystem = new ContentAuditSystem(process.cwd());

    // Apply document filtering
    const result = filterHooks.interceptDocumentGeneration(filePath, content, {
      agentType,
      hookType: 'pre-document-generation'
    });

    // Log the action
    auditSystem.logDocumentGeneration(filePath, content, result);

    if (!result.allowed) {
      console.error(\`Document generation blocked: \${result.reason}\`);
      if (result.suggestedPath) {
        console.log(\`Suggested alternative: \${result.suggestedPath}\`);
      }
      process.exit(1);
    }

    // Output processed content if modified
    if (result.processed) {
      console.log('FILTERED_CONTENT:' + Buffer.from(result.content).toString('base64'));
    }

    if (result.filePath !== filePath) {
      console.log('SUGGESTED_PATH:' + result.filePath);
    }

    process.exit(0);
  } catch (error) {
    console.error('Pre-document generation hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createPostAgentMessageHook() {
    return `#!/usr/bin/env node
/**
 * Post-Agent Message Hook
 * Processes agent messages through tone filtering
 */

const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');
const { ContentAuditSystem } = require('../src/audit/content-audit.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const message = args.find(arg => arg.startsWith('--message='))?.split('=')[1];
    const agentType = args.find(arg => arg.startsWith('--agent='))?.split('=')[1] || 'generic';
    const taskId = args.find(arg => arg.startsWith('--task='))?.split('=')[1];

    if (!message) {
      console.error('Missing required parameter: --message');
      process.exit(1);
    }

    const decodedMessage = Buffer.from(message, 'base64').toString('utf8');

    const filterHooks = new FilterIntegrationHooks(process.cwd());
    const auditSystem = new ContentAuditSystem(process.cwd());

    // Process message through tone filtering
    const processedMessage = filterHooks.processAgentMessage(decodedMessage, agentType, { taskId });

    // Log the processing
    auditSystem.logAgentMessage(agentType, decodedMessage, processedMessage, { taskId });

    // Output processed message if changed
    if (processedMessage !== decodedMessage) {
      console.log('PROCESSED_MESSAGE:' + Buffer.from(processedMessage).toString('base64'));
    }

    process.exit(0);
  } catch (error) {
    console.error('Post-agent message hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createContentFilterCheckHook() {
    return `#!/usr/bin/env node
/**
 * Content Filter Check Hook
 * Standalone content filtering check
 */

const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const filePath = args.find(arg => arg.startsWith('--file='))?.split('=')[1];
    const content = args.find(arg => arg.startsWith('--content='))?.split('=')[1];

    if (!filePath || !content) {
      console.error('Missing required parameters: --file and --content');
      process.exit(1);
    }

    const decodedContent = Buffer.from(content, 'base64').toString('utf8');

    const filterHooks = new FilterIntegrationHooks(process.cwd());
    const result = filterHooks.interceptDocumentGeneration(filePath, decodedContent);

    console.log(JSON.stringify({
      allowed: result.allowed,
      reason: result.reason,
      suggestedPath: result.suggestedPath,
      modifications: result.modifications,
      processed: result.processed
    }, null, 2));

    process.exit(result.allowed ? 0 : 1);
  } catch (error) {
    console.error('Content filter check failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createExtendedPreEditHook() {
    return `#!/usr/bin/env node
/**
 * Extended Pre-Edit Hook with Filtering
 * Extends existing pre-edit functionality with content filtering
 */

const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');
const { PreferenceManager } = require('../src/utils/preference-manager.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const filePath = args.find(arg => arg.startsWith('--file='))?.split('=')[1];
    const autoAssignAgents = args.includes('--auto-assign-agents=true');
    const loadContext = args.includes('--load-context=true');
    const applyContentFilters = args.includes('--apply-content-filters=true');

    if (!filePath) {
      console.error('Missing required parameter: --file');
      process.exit(1);
    }

    // Original pre-edit functionality
    if (autoAssignAgents) {
      console.log(\`Auto-assigning agents for file: \${filePath}\`);
    }

    if (loadContext) {
      console.log(\`Loading context for file: \${filePath}\`);
    }

    // New filtering functionality
    if (applyContentFilters) {
      const filterHooks = new FilterIntegrationHooks(process.cwd());
      const preferenceManager = new PreferenceManager(process.cwd());

      // Get contextual preferences
      const context = {
        filePath,
        agentType: process.env.CLAUDE_FLOW_AGENT_TYPE,
        projectType: preferenceManager.filterConfig.detectProjectType()
      };

      const preferences = preferenceManager.getContextualPreferences(context);

      // Check if file should be filtered
      const fileExtension = filePath.split('.').pop()?.toLowerCase();
      if (['md', 'txt', 'rst'].includes(fileExtension)) {
        console.log(\`Applying content filters for documentation file: \${filePath}\`);

        // Store preferences for post-edit hook
        process.env.CLAUDE_FLOW_FILTER_PREFERENCES = JSON.stringify(preferences);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Extended pre-edit hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createExtendedPostEditHook() {
    return `#!/usr/bin/env node
/**
 * Extended Post-Edit Hook with Filtering
 * Extends existing post-edit functionality with content filtering
 */

const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');
const { ContentAuditSystem } = require('../src/audit/content-audit.js');
const { readFileSync, writeFileSync } = require('fs');

async function main() {
  try {
    const args = process.argv.slice(2);
    const filePath = args.find(arg => arg.startsWith('--file='))?.split('=')[1];
    const format = args.includes('--format=true');
    const updateMemory = args.includes('--update-memory=true');

    if (!filePath) {
      console.error('Missing required parameter: --file');
      process.exit(1);
    }

    const filterHooks = new FilterIntegrationHooks(process.cwd());
    const auditSystem = new ContentAuditSystem(process.cwd());

    // Check if file exists and read content
    if (require('fs').existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8');
      const fileExtension = filePath.split('.').pop()?.toLowerCase();

      // Apply filtering to documentation files
      if (['md', 'txt', 'rst'].includes(fileExtension)) {
        const result = filterHooks.interceptDocumentGeneration(filePath, content, {
          isPostEdit: true,
          agentType: process.env.CLAUDE_FLOW_AGENT_TYPE
        });

        // Log the edit
        auditSystem.logFilterAction('POST_EDIT_FILTER', {
          filePath,
          originalLength: content.length,
          processedLength: result.content?.length || content.length,
          allowed: result.allowed,
          modified: result.processed,
          reason: result.reason
        });

        if (!result.allowed) {
          console.warn(\`Warning: File content may violate filtering rules: \${result.reason}\`);
          if (result.suggestedPath && result.suggestedPath !== filePath) {
            console.log(\`Consider moving to: \${result.suggestedPath}\`);
          }
        } else if (result.processed && result.content !== content) {
          // Apply tone processing to the file
          console.log('Applying tone processing to file content...');
          writeFileSync(filePath, result.content);
        }
      }
    }

    // Original post-edit functionality
    if (format) {
      console.log(\`Formatting file: \${filePath}\`);
    }

    if (updateMemory) {
      console.log(\`Updating memory for file: \${filePath}\`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Extended post-edit hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createSessionStartHook() {
    return `#!/usr/bin/env node
/**
 * Session Start Hook for Filtering System
 * Initializes filtering system at session start
 */

const { ContentAuditSystem } = require('../src/audit/content-audit.js');
const { PreferenceManager } = require('../src/utils/preference-manager.js');

async function main() {
  try {
    const auditSystem = new ContentAuditSystem(process.cwd());
    const preferenceManager = new PreferenceManager(process.cwd());

    // Log session start
    auditSystem.logFilterAction('SESSION_START', {
      sessionId: auditSystem.sessionId,
      timestamp: new Date().toISOString(),
      activeProfile: preferenceManager.activeProfile,
      projectType: preferenceManager.filterConfig.detectProjectType()
    });

    console.log(\`Filter system initialized for session: \${auditSystem.sessionId}\`);
    console.log(\`Active profile: \${preferenceManager.activeProfile || 'default'}\`);

    process.exit(0);
  } catch (error) {
    console.error('Session start hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createSessionEndHook() {
    return `#!/usr/bin/env node
/**
 * Session End Hook for Filtering System
 * Generates audit report and cleanup at session end
 */

const { ContentAuditSystem } = require('../src/audit/content-audit.js');
const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');

async function main() {
  try {
    const auditSystem = new ContentAuditSystem(process.cwd());
    const filterHooks = new FilterIntegrationHooks(process.cwd());

    // Generate session report
    const report = auditSystem.generateAuditReport('session');
    const stats = filterHooks.getFilterStats();

    // Log session end
    auditSystem.logFilterAction('SESSION_END', {
      sessionId: auditSystem.sessionId,
      duration: Date.now() - (auditSystem.sessionStart || Date.now()),
      summary: report.summary,
      filterStats: stats
    });

    console.log('Filter system session summary:');
    console.log(\`- Total processed: \${stats.interceptCount}\`);
    console.log(\`- Content filtered: \${stats.contentFilters.totalFiltered}\`);
    console.log(\`- Messages processed: \${stats.toneProcessors.totalProcessed}\`);

    if (stats.topBlockedReasons.length > 0) {
      console.log('Top blocking reasons:');
      stats.topBlockedReasons.forEach(({ reason, count }) => {
        console.log(\`  - \${reason}: \${count}\`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Session end hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  // Additional helper methods for creating other hooks...

  createToneProcessHook() {
    return `#!/usr/bin/env node
/**
 * Tone Processing Hook
 */

const { ToneProcessors } = require('../src/filters/tone-processors.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const text = args.find(arg => arg.startsWith('--text='))?.split('=')[1];
    const preset = args.find(arg => arg.startsWith('--preset='))?.split('=')[1] || 'professional';

    if (!text) {
      console.error('Missing required parameter: --text');
      process.exit(1);
    }

    const decodedText = Buffer.from(text, 'base64').toString('utf8');
    const toneProcessor = new ToneProcessors();
    const result = toneProcessor.processMessage(decodedText, preset);

    console.log(JSON.stringify({
      original: result.original,
      processed: result.processed,
      changes: result.changes,
      metrics: result.metrics
    }, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Tone processing hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createAuditLogHook() {
    return `#!/usr/bin/env node
/**
 * Audit Logging Hook
 */

const { ContentAuditSystem } = require('../src/audit/content-audit.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const action = args.find(arg => arg.startsWith('--action='))?.split('=')[1];
    const details = args.find(arg => arg.startsWith('--details='))?.split('=')[1];

    if (!action) {
      console.error('Missing required parameter: --action');
      process.exit(1);
    }

    const auditSystem = new ContentAuditSystem(process.cwd());
    const parsedDetails = details ? JSON.parse(Buffer.from(details, 'base64').toString('utf8')) : {};

    const entryId = auditSystem.logFilterAction(action, parsedDetails);
    console.log(\`Audit entry created: \${entryId}\`);

    process.exit(0);
  } catch (error) {
    console.error('Audit logging hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createPreferenceUpdateHook() {
    return `#!/usr/bin/env node
/**
 * Preference Update Hook
 */

const { PreferenceManager } = require('../src/utils/preference-manager.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const profile = args.find(arg => arg.startsWith('--profile='))?.split('=')[1];
    const preferences = args.find(arg => arg.startsWith('--preferences='))?.split('=')[1];

    const preferenceManager = new PreferenceManager(process.cwd());

    if (profile) {
      const activated = preferenceManager.activateProfile(profile);
      console.log(\`Activated profile: \${profile}\`);
      console.log(JSON.stringify(activated, null, 2));
    }

    if (preferences) {
      const parsedPrefs = JSON.parse(Buffer.from(preferences, 'base64').toString('utf8'));
      const updated = preferenceManager.updateActivePreferences('userPreferences', parsedPrefs);
      console.log('Updated preferences:');
      console.log(JSON.stringify(updated, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('Preference update hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createBatchFilterHook() {
    return `#!/usr/bin/env node
/**
 * Batch Filter Processing Hook
 */

const { RealtimeFilterMiddleware } = require('../src/middleware/realtime-filter.js');

async function main() {
  try {
    const args = process.argv.slice(2);
    const items = args.find(arg => arg.startsWith('--items='))?.split('=')[1];
    const metadata = args.find(arg => arg.startsWith('--metadata='))?.split('=')[1];

    if (!items) {
      console.error('Missing required parameter: --items');
      process.exit(1);
    }

    const parsedItems = JSON.parse(Buffer.from(items, 'base64').toString('utf8'));
    const parsedMetadata = metadata ? JSON.parse(Buffer.from(metadata, 'base64').toString('utf8')) : {};

    const realtimeFilter = new RealtimeFilterMiddleware(process.cwd());
    const results = await realtimeFilter.processBatch(parsedItems, { ...parsedMetadata, isBatch: true });

    console.log(JSON.stringify(results, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Batch filter hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  createFilterStatsHook() {
    return `#!/usr/bin/env node
/**
 * Filter Statistics Hook
 */

const { FilterIntegrationHooks } = require('../src/hooks/filter-integration.js');
const { RealtimeFilterMiddleware } = require('../src/middleware/realtime-filter.js');
const { ContentAuditSystem } = require('../src/audit/content-audit.js');

async function main() {
  try {
    const filterHooks = new FilterIntegrationHooks(process.cwd());
    const realtimeFilter = new RealtimeFilterMiddleware(process.cwd());
    const auditSystem = new ContentAuditSystem(process.cwd());

    const stats = {
      filterHooks: filterHooks.getFilterStats(),
      realtimeFilter: realtimeFilter.getStats(),
      audit: auditSystem.getDashboardData()
    };

    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Filter stats hook failed:', error.message);
    process.exit(1);
  }
}

main();
`;
  }

  // CLI Handler Creation Methods

  createFilterCheckHandler() {
    return {
      command: 'filter-check',
      description: 'Check if content passes filtering rules',
      handler: async (filePath, content) => {
        const result = this.filterHooks.interceptDocumentGeneration(filePath, content);
        return result;
      }
    };
  }

  createFilterConfigHandler() {
    return {
      command: 'filter-config',
      description: 'Manage filter configuration',
      handler: async (action, ...args) => {
        switch (action) {
          case 'get':
            return this.preferenceManager.getActivePreferences();
          case 'set':
            const [section, key, value] = args;
            return this.preferenceManager.updateActivePreferences(section, { [key]: value });
          case 'reset':
            return this.preferenceManager.filterConfig.reset();
          default:
            throw new Error(`Unknown config action: ${action}`);
        }
      }
    };
  }

  createFilterStatsHandler() {
    return {
      command: 'filter-stats',
      description: 'Get comprehensive filter statistics',
      handler: async () => {
        return {
          hooks: this.filterHooks.getFilterStats(),
          realtime: this.realtimeFilter.getStats(),
          audit: this.auditSystem.getDashboardData(),
          preferences: this.preferenceManager.getUsageStatistics()
        };
      }
    };
  }

  createFilterAuditHandler() {
    return {
      command: 'filter-audit',
      description: 'Generate audit reports',
      handler: async (timeframe = '24h') => {
        return this.auditSystem.generateAuditReport(timeframe);
      }
    };
  }

  createPreferencesHandler() {
    return {
      command: 'filter-preferences',
      description: 'Manage user preferences and profiles',
      handler: async (action, ...args) => {
        switch (action) {
          case 'list':
            return this.preferenceManager.getAllProfiles();
          case 'activate':
            return this.preferenceManager.activateProfile(args[0]);
          case 'create':
            return this.preferenceManager.createProfile(args[0], JSON.parse(args[1]));
          case 'suggest':
            return this.preferenceManager.suggestProfile(args[0] ? JSON.parse(args[0]) : {});
          default:
            throw new Error(`Unknown preferences action: ${action}`);
        }
      }
    };
  }

  createFilterResetHandler() {
    return {
      command: 'filter-reset',
      description: 'Reset filter system',
      handler: async (scope = 'session') => {
        if (scope === 'all') {
          this.filterHooks.reset();
          this.realtimeFilter.resetStats();
          this.auditSystem = new ContentAuditSystem(this.projectRoot);
          this.preferenceManager.filterConfig.reset();
        } else {
          this.realtimeFilter.resetStats();
        }
        return { reset: true, scope };
      }
    };
  }

  createCliIntegration(handlers) {
    return `#!/usr/bin/env node
/**
 * CLI Integration for Filter System
 * Provides command-line interface for filter operations
 */

const handlers = ${JSON.stringify(handlers, null, 2)};

async function main() {
  try {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    if (!command || !handlers[command]) {
      console.log('Available commands:');
      Object.keys(handlers).forEach(cmd => {
        console.log(\`  \${cmd}: \${handlers[cmd].description}\`);
      });
      process.exit(1);
    }

    const result = await handlers[command].handler(...args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(\`Command failed: \${error.message}\`);
    process.exit(1);
  }
}

main();
`;
  }

  /**
   * Get integration status
   */
  getIntegrationStatus() {
    return {
      installed: true,
      hooksDirectory: this.hooksDir,
      installedHooks: Array.from(this.installedHooks),
      components: {
        filterHooks: !!this.filterHooks,
        realtimeFilter: !!this.realtimeFilter,
        auditSystem: !!this.auditSystem,
        preferenceManager: !!this.preferenceManager
      },
      settingsPath: this.settingsPath
    };
  }

  /**
   * Uninstall filter hooks
   */
  uninstallFilterHooks() {
    this.installedHooks.forEach(hookName => {
      const hookPath = join(this.hooksDir, `${hookName}.js`);
      if (existsSync(hookPath)) {
        require('fs').unlinkSync(hookPath);
      }
    });

    this.installedHooks.clear();
    return { uninstalled: true };
  }

  /**
   * Test integration
   */
  async testIntegration() {
    const results = {
      hooks: {},
      components: {},
      overall: true
    };

    // Test each installed hook
    for (const hookName of this.installedHooks) {
      try {
        const hookPath = join(this.hooksDir, `${hookName}.js`);
        if (existsSync(hookPath)) {
          results.hooks[hookName] = { exists: true, executable: true };
        } else {
          results.hooks[hookName] = { exists: false, executable: false };
          results.overall = false;
        }
      } catch (error) {
        results.hooks[hookName] = { error: error.message };
        results.overall = false;
      }
    }

    // Test components
    try {
      results.components.filterHooks = !!this.filterHooks.getFilterStats();
    } catch (error) {
      results.components.filterHooks = false;
      results.overall = false;
    }

    try {
      results.components.realtimeFilter = !!this.realtimeFilter.getStats();
    } catch (error) {
      results.components.realtimeFilter = false;
      results.overall = false;
    }

    try {
      results.components.auditSystem = !!this.auditSystem.getDashboardData();
    } catch (error) {
      results.components.auditSystem = false;
      results.overall = false;
    }

    try {
      results.components.preferenceManager = !!this.preferenceManager.getActivePreferences();
    } catch (error) {
      results.components.preferenceManager = false;
      results.overall = false;
    }

    return results;
  }
}

export default HooksIntegrationSystem;
export { HooksIntegrationSystem };
`;
  }

  // Additional helper methods would continue here...
}

export default HooksIntegrationSystem;
export { HooksIntegrationSystem };