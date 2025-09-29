// Bulletproof MCP Configuration Manager
// Handles Claude Code MCP configuration with comprehensive error handling
// Automatically detects and fixes broken configurations with rollback capability
// Provides enhanced user experience and backwards compatibility

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { printSuccess, printWarning, printError } from '../cli/utils.js';

export class McpConfigurationManager {
  constructor(options = {}) {
    this.localConfigPath = this.findClaudeConfigPath();
    this.projectConfigPath = path.join(process.cwd(), '.mcp.json');
    this.verbose = options.verbose || false;
    this.autoFix = options.autoFix !== false; // Default to true for bulletproof operation
    this.dryRun = options.dryRun || false;
    this.backupPaths = new Map();
    this.operationLog = [];
    this.errorRecovery = [];
    this.rollbackStack = [];
  }

  /**
   * Find Claude Code configuration path with comprehensive search
   */
  findClaudeConfigPath() {
    const homeDir = os.homedir();
    const primaryPath = path.join(homeDir, '.claude.json');

    if (existsSync(primaryPath)) {
      return primaryPath;
    }

    // Search alternative locations
    const alternativePaths = [
      path.join(homeDir, '.config', 'claude.json'),
      path.join(homeDir, '.claude', 'config.json'),
      path.join(homeDir, 'AppData', 'Local', 'Claude', 'config.json'), // Windows
      path.join(homeDir, 'Library', 'Application Support', 'Claude', 'config.json'), // macOS
    ];

    for (const altPath of alternativePaths) {
      if (existsSync(altPath)) {
        this.log(`📍 Found Claude config at alternative location: ${altPath}`);
        return altPath;
      }
    }

    // Return primary path even if it doesn't exist (for creation)
    return primaryPath;
  }

  /**
   * Enhanced logging with operation tracking
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message };
    this.operationLog.push(logEntry);

    if (this.verbose || level === 'error' || level === 'warn') {
      const prefix = {
        info: '  ℹ️',
        warn: '  ⚠️',
        error: '  ❌',
        success: '  ✅',
        debug: '  🔍'
      }[level] || '  ·';

      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Add operation to rollback stack
   */
  addRollbackOperation(operation) {
    this.rollbackStack.push({
      ...operation,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if Claude Code CLI is available
   */
  isClaudeCodeInstalled() {
    try {
      execSync('which claude', { stdio: 'ignore' });
      return true;
    } catch {
      try {
        execSync('claude --version', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Create backup with enhanced error handling
   */
  async createConfigBackup(configPath, label = 'auto') {
    if (!existsSync(configPath)) {
      this.log(`No config file to backup at: ${configPath}`, 'debug');
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${configPath}.backup-${label}-${timestamp}`;

      if (!this.dryRun) {
        await fs.copyFile(configPath, backupPath);
      }

      this.backupPaths.set(configPath, backupPath);
      this.addRollbackOperation({
        type: 'restore-backup',
        source: backupPath,
        target: configPath,
        action: async () => {
          if (existsSync(backupPath)) {
            await fs.copyFile(backupPath, configPath);
            this.log(`🔄 Restored ${configPath} from backup`, 'success');
          }
        }
      });

      this.log(`💾 Created backup: ${backupPath}`, 'success');
      return backupPath;
    } catch (error) {
      this.log(`⚠️ Could not create backup: ${error.message}`, 'warn');
      return null;
    }
  }

  /**
   * Enhanced configuration state detection with comprehensive analysis
   */
  async detectConfigurationState() {
    const state = {
      hasLocalConfig: false,
      hasProjectConfig: false,
      localServers: [],
      projectServers: [],
      conflictingServers: [],
      brokenPaths: [],
      recommendations: [],
      claudeCodeInstalled: this.isClaudeCodeInstalled(),
      configPaths: {
        local: this.localConfigPath,
        project: this.projectConfigPath
      },
      healthScore: 100,
      criticalIssues: [],
      warnings: []
    };

    try {
      this.log('🔍 Analyzing MCP configuration state...', 'info');

      // Check local configuration with enhanced validation
      if (await this.fileExists(this.localConfigPath)) {
        state.hasLocalConfig = true;
        const localConfig = await this.readLocalConfig();
        if (localConfig) {
          state.localServers = this.extractMcpServers(localConfig);
          this.log(`📋 Found ${state.localServers.length} local MCP servers`, 'info');
        } else {
          state.warnings.push('Local config file exists but is invalid/corrupted');
          state.healthScore -= 20;
        }
      }

      // Check project configuration
      if (await this.fileExists(this.projectConfigPath)) {
        state.hasProjectConfig = true;
        const projectConfig = await this.readProjectConfig();
        if (projectConfig) {
          state.projectServers = this.extractMcpServers(projectConfig);
          this.log(`📋 Found ${state.projectServers.length} project MCP servers`, 'info');
        } else {
          state.warnings.push('Project config file exists but is invalid/corrupted');
          state.healthScore -= 10;
        }
      }

      // Enhanced analysis
      state.conflictingServers = this.findConflictingServers(state.localServers, state.projectServers);
      state.brokenPaths = await this.findBrokenServerPaths([...state.localServers, ...state.projectServers]);
      state.recommendations = this.generateRecommendations(state);

      // Calculate health score
      if (state.conflictingServers.length > 0) {
        state.healthScore -= (state.conflictingServers.length * 15);
        state.warnings.push(`${state.conflictingServers.length} conflicting server configurations`);
      }

      if (state.brokenPaths.length > 0) {
        state.healthScore -= (state.brokenPaths.length * 25);
        state.criticalIssues.push(`${state.brokenPaths.length} broken server paths detected`);
      }

      if (!state.claudeCodeInstalled) {
        state.healthScore -= 30;
        state.warnings.push('Claude Code CLI not installed');
      }

      this.log(`📊 Configuration health score: ${state.healthScore}/100`,
                state.healthScore >= 80 ? 'success' : state.healthScore >= 60 ? 'warn' : 'error');

      return state;
    } catch (error) {
      this.log(`❌ Failed to detect configuration state: ${error.message}`, 'error');
      throw new Error(`Failed to detect configuration state: ${error.message}`);
    }
  }

  /**
   * Perform pre-initialization audit
   */
  async performPreInitAudit() {
    const state = await this.detectConfigurationState();
    const audit = {
      hasIssues: false,
      autoFixable: [],
      requiresConfirmation: [],
      blocking: [],
      warnings: []
    };

    // Check for broken local servers
    for (const brokenServer of state.brokenPaths) {
      if (brokenServer.serverName === 'claude-flow-novice') {
        audit.hasIssues = true;
        audit.autoFixable.push({
          type: 'remove-broken-local-server',
          description: `Remove broken local MCP server: ${brokenServer.serverName}`,
          serverName: brokenServer.serverName,
          reason: brokenServer.reason,
          action: () => this.removeLocalServer(brokenServer.serverName)
        });
      }
    }

    // Check for conflicting servers
    for (const conflict of state.conflictingServers) {
      if (conflict.serverName === 'claude-flow-novice') {
        audit.hasIssues = true;
        audit.requiresConfirmation.push({
          type: 'conflicting-server',
          description: `Server '${conflict.serverName}' exists in both local and project configs`,
          recommendation: 'Remove from local config to use project configuration',
          action: () => this.removeLocalServer(conflict.serverName)
        });
      }
    }

    // Check if local config takes precedence over project config
    if (state.hasLocalConfig && state.hasProjectConfig) {
      const claudeFlowInLocal = state.localServers.some(s => s.name === 'claude-flow-novice');
      const claudeFlowInProject = state.projectServers.some(s => s.name === 'claude-flow-novice');

      if (claudeFlowInLocal && claudeFlowInProject) {
        audit.warnings.push({
          type: 'precedence-warning',
          description: 'Local MCP config will override project config',
          recommendation: 'Consider removing from local config for project-specific setup'
        });
      }
    }

    return audit;
  }

  /**
   * Bulletproof MCP setup with comprehensive error handling and rollback
   */
  async executeBulletproofSetup(serverConfig, ux = null) {
    this.log('🔧 Executing bulletproof MCP setup...', 'info');
    const startTime = Date.now();

    try {
      // Phase 1: System validation and pre-audit
      this.log('🔍 Phase 1: System validation and pre-audit...', 'info');
      if (ux) ux.displaySetupProgress('pre-audit');

      if (!this.isClaudeCodeInstalled()) {
        const error = new Error('Claude Code CLI not installed');
        error.recovery = [
          'Install Claude Code: npm install -g @anthropic-ai/claude-code',
          'Verify installation: claude --version',
          'Re-run setup after installation'
        ];
        throw error;
      }

      const audit = await this.performPreInitAudit();
      const state = await this.detectConfigurationState();

      // Display comprehensive analysis
      if (ux && this.verbose) {
        ux.displayConfigurationAnalysis({ ...state, hasIssues: audit.hasIssues });
      }

      // Phase 2: Create safety backups
      this.log('💾 Phase 2: Creating safety backups...', 'info');
      if (ux) ux.displaySetupProgress('backup');

      if (state.hasLocalConfig) {
        await this.createConfigBackup(this.localConfigPath, 'pre-bulletproof');
      }
      if (state.hasProjectConfig) {
        await this.createConfigBackup(this.projectConfigPath, 'pre-bulletproof');
      }

      // Phase 3: Issue remediation
      if (audit.hasIssues || state.brokenPaths.length > 0) {
        this.log('🔧 Phase 3: Remediating configuration issues...', 'info');
        if (ux) ux.displaySetupProgress('cleanup');

        const remediationResult = await this.performAutomatedRemediation(audit, state, ux);
        if (!remediationResult.success) {
          throw new Error(`Remediation failed: ${remediationResult.error}`);
        }
      } else {
        this.log('✅ No configuration issues detected', 'success');
      }

      // Phase 4: Ensure optimal project configuration
      this.log('⚙️ Phase 4: Ensuring optimal project configuration...', 'info');
      if (ux) ux.displaySetupProgress('project-config');
      await this.ensureProjectConfiguration(serverConfig);

      // Phase 5: Comprehensive verification
      this.log('✅ Phase 5: Comprehensive verification...', 'info');
      if (ux) ux.displaySetupProgress('verification');
      const verificationResult = await this.performComprehensiveVerification();

      if (!verificationResult.success) {
        this.log('⚠️ Verification failed, attempting rollback...', 'warn');
        await this.performRollback();
        throw new Error(`Setup verification failed: ${verificationResult.error}`);
      }

      // Phase 6: Success and cleanup
      const duration = Date.now() - startTime;
      this.log(`🎉 Bulletproof MCP setup completed successfully in ${duration}ms`, 'success');
      if (ux) ux.displaySetupProgress('complete');

      return {
        success: true,
        duration,
        details: {
          issuesFixed: audit.autoFixable.length + audit.requiresConfirmation.length,
          backupsCreated: this.backupPaths.size,
          healthScore: state.healthScore,
          verificationPassed: verificationResult.success,
          operationsPerformed: this.operationLog.length
        },
        summary: this.generateSetupSummary()
      };

    } catch (error) {
      this.log(`❌ Bulletproof setup failed: ${error.message}`, 'error');

      // Enhanced error recovery
      const recoveryResult = await this.handleSetupFailure(error, ux);

      return {
        success: false,
        error: error.message,
        recovery: recoveryResult,
        logs: this.operationLog,
        rollbackAvailable: this.rollbackStack.length > 0
      };
    }
  }

  /**
   * Ensure project configuration is correct
   */
  async ensureProjectConfiguration(serverConfig) {
    const defaultConfig = {
      mcpServers: {
        'claude-flow-novice': {
          command: 'npx',
          args: ['claude-flow-novice', 'mcp', 'start'],
          env: {
            NODE_ENV: 'production',
            CLAUDE_FLOW_NOVICE_MODE: 'novice'
          }
        }
      }
    };

    const configToUse = serverConfig || defaultConfig;

    if (!this.dryRun) {
      await fs.writeFile(
        this.projectConfigPath,
        JSON.stringify(configToUse, null, 2)
      );
      this.log('✅ Created/updated .mcp.json configuration');
    } else {
      this.log('[DRY RUN] Would create/update .mcp.json configuration');
    }
  }

  /**
   * Remove a server from local configuration
   */
  async removeLocalServer(serverName) {
    try {
      // Use Claude CLI to remove server cleanly
      execSync(`claude mcp remove ${serverName} -s local`, {
        stdio: this.verbose ? 'inherit' : 'pipe'
      });
      this.log(`✅ Removed ${serverName} from local configuration`);
    } catch (error) {
      // Fallback: manual removal
      await this.manuallyRemoveFromLocalConfig(serverName);
    }
  }

  /**
   * Manually remove server from local config (fallback)
   */
  async manuallyRemoveFromLocalConfig(serverName) {
    try {
      const localConfig = await this.readLocalConfig();
      if (localConfig?.mcpServers?.[serverName]) {
        delete localConfig.mcpServers[serverName];

        // Create backup
        await this.createConfigBackup(this.localConfigPath);

        // Write updated config
        await fs.writeFile(
          this.localConfigPath,
          JSON.stringify(localConfig, null, 2)
        );

        this.log(`✅ Manually removed ${serverName} from local configuration`);
      }
    } catch (error) {
      throw new Error(`Failed to manually remove server: ${error.message}`);
    }
  }

  /**
   * Verify the setup is working
   */
  async verifySetup() {
    try {
      // Check if Claude CLI can list servers
      const output = execSync('claude mcp list', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      // Check if our server is properly configured
      if (output.includes('claude-flow-novice')) {
        this.log('✅ MCP server verification successful');
      } else {
        this.log('⚠️  MCP server not visible in claude mcp list');
      }
    } catch (error) {
      this.log('⚠️  Could not verify MCP setup (Claude CLI may not be installed)');
    }
  }

  /**
   * Create configuration backup
   */
  async createConfigBackup(configPath) {
    const backupPath = `${configPath}.backup-${Date.now()}`;
    try {
      await fs.copyFile(configPath, backupPath);
      this.log(`💾 Created backup: ${backupPath}`);
    } catch (error) {
      this.log(`⚠️  Could not create backup: ${error.message}`);
    }
  }

  /**
   * Helper methods
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readLocalConfig() {
    try {
      const content = await fs.readFile(this.localConfigPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async readProjectConfig() {
    try {
      const content = await fs.readFile(this.projectConfigPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  extractMcpServers(config) {
    if (!config?.mcpServers) return [];

    return Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
      name,
      ...serverConfig
    }));
  }

  findConflictingServers(localServers, projectServers) {
    const conflicts = [];
    const localNames = new Set(localServers.map(s => s.name));

    for (const projectServer of projectServers) {
      if (localNames.has(projectServer.name)) {
        conflicts.push({
          serverName: projectServer.name,
          localConfig: localServers.find(s => s.name === projectServer.name),
          projectConfig: projectServer
        });
      }
    }

    return conflicts;
  }

  /**
   * Enhanced broken path detection with comprehensive validation
   */
  async findBrokenServerPaths(servers) {
    const broken = [];
    this.log(`🔍 Checking ${servers.length} servers for broken paths...`, 'debug');

    for (const server of servers) {
      const issues = await this.checkServerPath(server);
      if (issues.length > 0) {
        broken.push({
          serverName: server.name,
          command: server.command,
          args: server.args,
          issues,
          severity: this.calculateIssueSeverity(issues)
        });
        this.log(`🔍 Found issues with '${server.name}': ${issues.join(', ')}`, 'warn');
      }
    }

    return broken;
  }

  /**
   * Comprehensive server path validation
   */
  async checkServerPath(server) {
    const issues = [];

    // Check for .claude-flow-novice directory references (common broken pattern)
    if (server.command && server.command.includes('.claude-flow-novice')) {
      issues.push('Command points to non-existent .claude-flow-novice directory');
    }

    if (server.args && server.args.some(arg => arg.includes('.claude-flow-novice'))) {
      issues.push('Arguments reference non-existent .claude-flow-novice directory');
    }

    // Check if command executable exists (when not using npx)
    if (server.command && server.command !== 'npx' && server.command !== 'node') {
      try {
        execSync(`which ${server.command}`, { stdio: 'ignore' });
      } catch {
        issues.push(`Command '${server.command}' not found in PATH`);
      }
    }

    // Check if node script files exist
    if (server.command === 'node' && server.args && server.args[0]) {
      const scriptPath = path.resolve(server.args[0]);
      if (!existsSync(scriptPath)) {
        issues.push(`Script file '${server.args[0]}' does not exist`);
      }
    }

    // Check for invalid configuration patterns
    if (!server.command) {
      issues.push('Missing command field');
    }

    if (server.command === 'node' && (!server.args || server.args.length === 0)) {
      issues.push('Node command specified but no script path provided');
    }

    // Check for outdated patterns
    if (server.name === 'claude-flow-novice' && server.command === 'node') {
      issues.push('Using outdated node-based configuration (should use npx)');
    }

    return issues;
  }

  /**
   * Calculate issue severity for prioritization
   */
  calculateIssueSeverity(issues) {
    let severity = 'low';

    for (const issue of issues) {
      if (issue.includes('not found') || issue.includes('does not exist')) {
        severity = 'critical';
        break;
      } else if (issue.includes('.claude-flow-novice') || issue.includes('outdated')) {
        severity = 'high';
      } else if (severity === 'low') {
        severity = 'medium';
      }
    }

    return severity;
  }

  generateRecommendations(state) {
    const recommendations = [];

    if (state.brokenPaths.length > 0) {
      recommendations.push({
        type: 'fix-broken-paths',
        priority: 'high',
        description: 'Remove broken MCP server configurations',
        action: 'Run with --auto-fix to automatically clean up'
      });
    }

    if (state.conflictingServers.length > 0) {
      recommendations.push({
        type: 'resolve-conflicts',
        priority: 'medium',
        description: 'Resolve configuration conflicts between local and project scopes',
        action: 'Remove from local config to use project-specific settings'
      });
    }

    return recommendations;
  }

  /**
   * Perform automated remediation of issues
   */
  async performAutomatedRemediation(audit, state, ux) {
    const remediationResults = [];

    try {
      // Fix critical issues first (broken paths)
      for (const brokenServer of state.brokenPaths) {
        if (brokenServer.severity === 'critical') {
          const result = await this.fixBrokenServer(brokenServer);
          remediationResults.push(result);
        }
      }

      // Auto-fix identified issues
      for (const fix of audit.autoFixable) {
        try {
          if (!this.dryRun) {
            await fix.action();
            remediationResults.push({ success: true, description: fix.description });
            this.log(`✅ Fixed: ${fix.description}`, 'success');
          } else {
            this.log(`[DRY RUN] Would fix: ${fix.description}`, 'info');
          }
        } catch (error) {
          const failureResult = { success: false, description: fix.description, error: error.message };
          remediationResults.push(failureResult);
          this.log(`❌ Failed to fix: ${fix.description} - ${error.message}`, 'error');
        }
      }

      // Handle issues requiring confirmation
      for (const fix of audit.requiresConfirmation) {
        if (this.autoFix) {
          try {
            if (!this.dryRun) {
              await fix.action();
              remediationResults.push({ success: true, description: fix.description });
              this.log(`✅ Auto-fixed: ${fix.description}`, 'success');
            }
          } catch (error) {
            remediationResults.push({ success: false, description: fix.description, error: error.message });
            this.log(`❌ Failed to auto-fix: ${fix.description} - ${error.message}`, 'error');
          }
        } else if (ux) {
          const confirmed = await ux.promptForConfirmation(fix.description, true);
          if (confirmed && !this.dryRun) {
            await fix.action();
            remediationResults.push({ success: true, description: fix.description });
            this.log(`✅ User-confirmed fix: ${fix.description}`, 'success');
          }
        }
      }

      const successCount = remediationResults.filter(r => r.success).length;
      const failureCount = remediationResults.filter(r => !r.success).length;

      return {
        success: failureCount === 0,
        successCount,
        failureCount,
        results: remediationResults
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        results: remediationResults
      };
    }
  }

  /**
   * Fix broken server configuration
   */
  async fixBrokenServer(brokenServer) {
    const { serverName, issues, severity } = brokenServer;

    try {
      if (serverName === 'claude-flow-novice') {
        // Remove broken local configuration
        await this.removeLocalServer(serverName);
        return {
          success: true,
          description: `Removed broken claude-flow-novice configuration`,
          action: 'removed-broken-local'
        };
      } else {
        // For other servers, just remove if critically broken
        if (severity === 'critical') {
          await this.removeLocalServer(serverName);
          return {
            success: true,
            description: `Removed critically broken server: ${serverName}`,
            action: 'removed-broken-server'
          };
        }
      }

      return { success: true, description: `Server ${serverName} issues noted but not critical` };
    } catch (error) {
      return {
        success: false,
        description: `Failed to fix server ${serverName}`,
        error: error.message
      };
    }
  }

  /**
   * Comprehensive verification with detailed testing
   */
  async performComprehensiveVerification() {
    const verificationResults = {
      success: true,
      tests: [],
      warnings: [],
      errors: []
    };

    try {
      this.log('🧪 Running comprehensive verification tests...', 'info');

      // Test 1: Claude CLI availability
      const cliTest = await this.testClaudeCli();
      verificationResults.tests.push(cliTest);
      if (!cliTest.passed) {
        verificationResults.success = false;
        verificationResults.errors.push('Claude CLI not available');
      }

      // Test 2: MCP server listing
      if (cliTest.passed) {
        const listTest = await this.testMcpListing();
        verificationResults.tests.push(listTest);
        if (!listTest.passed) {
          verificationResults.warnings.push('MCP server listing issues detected');
        }
      }

      // Test 3: Project configuration validation
      const configTest = await this.testProjectConfiguration();
      verificationResults.tests.push(configTest);
      if (!configTest.passed) {
        verificationResults.success = false;
        verificationResults.errors.push('Project configuration invalid');
      }

      // Test 4: Connection test (if possible)
      if (cliTest.passed && !this.dryRun) {
        const connectionTest = await this.testMcpConnection();
        verificationResults.tests.push(connectionTest);
        if (!connectionTest.passed) {
          verificationResults.warnings.push('MCP connection test failed');
        }
      }

      // Test 5: File permissions and accessibility
      const permissionTest = await this.testFilePermissions();
      verificationResults.tests.push(permissionTest);
      if (!permissionTest.passed) {
        verificationResults.warnings.push('File permission issues detected');
      }

      const passedTests = verificationResults.tests.filter(t => t.passed).length;
      const totalTests = verificationResults.tests.length;

      this.log(`📊 Verification complete: ${passedTests}/${totalTests} tests passed`,
                passedTests === totalTests ? 'success' : 'warn');

      return verificationResults;

    } catch (error) {
      verificationResults.success = false;
      verificationResults.errors.push(`Verification failed: ${error.message}`);
      this.log(`❌ Verification failed: ${error.message}`, 'error');
      return verificationResults;
    }
  }

  async testClaudeCli() {
    try {
      const output = execSync('claude --version', { encoding: 'utf8', stdio: 'pipe' });
      return {
        name: 'Claude CLI Availability',
        passed: true,
        details: `Version: ${output.trim()}`
      };
    } catch (error) {
      return {
        name: 'Claude CLI Availability',
        passed: false,
        details: `Not available: ${error.message}`
      };
    }
  }

  async testMcpListing() {
    try {
      const output = execSync('claude mcp list', { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
      const hasClaudeFlowNovice = output.includes('claude-flow-novice');
      return {
        name: 'MCP Server Listing',
        passed: hasClaudeFlowNovice,
        details: hasClaudeFlowNovice ? 'claude-flow-novice found in listing' : 'claude-flow-novice not in listing'
      };
    } catch (error) {
      return {
        name: 'MCP Server Listing',
        passed: false,
        details: `Failed to list servers: ${error.message}`
      };
    }
  }

  async testProjectConfiguration() {
    try {
      if (!existsSync(this.projectConfigPath)) {
        return {
          name: 'Project Configuration',
          passed: false,
          details: 'Project .mcp.json file does not exist'
        };
      }

      const config = await this.readProjectConfig();
      if (!config || !config.mcpServers || !config.mcpServers['claude-flow-novice']) {
        return {
          name: 'Project Configuration',
          passed: false,
          details: 'claude-flow-novice not properly configured in project config'
        };
      }

      return {
        name: 'Project Configuration',
        passed: true,
        details: 'Project configuration valid'
      };
    } catch (error) {
      return {
        name: 'Project Configuration',
        passed: false,
        details: `Configuration test failed: ${error.message}`
      };
    }
  }

  async testMcpConnection() {
    try {
      const result = await this.runCommandWithTimeout('claude', ['mcp', 'list'], 5000);
      const connected = result.success && result.stdout.includes('✓ Connected');
      return {
        name: 'MCP Connection Test',
        passed: connected,
        details: connected ? 'Connection successful' : 'Connection test inconclusive'
      };
    } catch (error) {
      return {
        name: 'MCP Connection Test',
        passed: false,
        details: `Connection test failed: ${error.message}`
      };
    }
  }

  async testFilePermissions() {
    const tests = [];

    // Test local config permissions
    try {
      if (existsSync(this.localConfigPath)) {
        await fs.access(this.localConfigPath, fs.constants.R_OK | fs.constants.W_OK);
        tests.push({ file: 'local config', accessible: true });
      }
    } catch {
      tests.push({ file: 'local config', accessible: false });
    }

    // Test project config permissions
    try {
      if (existsSync(this.projectConfigPath)) {
        await fs.access(this.projectConfigPath, fs.constants.R_OK | fs.constants.W_OK);
        tests.push({ file: 'project config', accessible: true });
      }
    } catch {
      tests.push({ file: 'project config', accessible: false });
    }

    const allAccessible = tests.every(t => t.accessible);
    return {
      name: 'File Permissions',
      passed: allAccessible,
      details: `${tests.filter(t => t.accessible).length}/${tests.length} files accessible`
    };
  }

  /**
   * Run command with timeout
   */
  runCommandWithTimeout(command, args, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Perform complete rollback of all operations
   */
  async performRollback() {
    this.log('🔄 Performing rollback of all operations...', 'warn');
    let rollbackCount = 0;

    // Execute rollback operations in reverse order
    for (let i = this.rollbackStack.length - 1; i >= 0; i--) {
      const operation = this.rollbackStack[i];
      try {
        if (!this.dryRun) {
          await operation.action();
        }
        rollbackCount++;
        this.log(`🔄 Rolled back: ${operation.type}`, 'info');
      } catch (error) {
        this.log(`❌ Rollback failed for ${operation.type}: ${error.message}`, 'error');
      }
    }

    this.log(`🔄 Rollback completed: ${rollbackCount} operations reversed`, 'info');
    return { success: rollbackCount > 0, operationsRolledBack: rollbackCount };
  }

  /**
   * Handle setup failure with comprehensive recovery
   */
  async handleSetupFailure(error, ux) {
    this.log(`❌ Setup failed: ${error.message}`, 'error');

    const recovery = {
      rollbackPerformed: false,
      backupsAvailable: this.backupPaths.size > 0,
      errorAnalysis: this.analyzeError(error),
      recommendedActions: []
    };

    // Attempt automatic rollback if we have operations to roll back
    if (this.rollbackStack.length > 0) {
      try {
        const rollbackResult = await this.performRollback();
        recovery.rollbackPerformed = rollbackResult.success;
        recovery.operationsRolledBack = rollbackResult.operationsRolledBack;
      } catch (rollbackError) {
        this.log(`❌ Rollback also failed: ${rollbackError.message}`, 'error');
        recovery.rollbackError = rollbackError.message;
      }
    }

    // Generate recovery recommendations
    recovery.recommendedActions = this.generateRecoveryActions(error, recovery);

    // Display recovery information if UX is available
    if (ux) {
      ux.displayErrorRecovery(error, recovery);
    } else {
      this.displayBasicRecovery(error, recovery);
    }

    return recovery;
  }

  /**
   * Analyze error for better recovery recommendations
   */
  analyzeError(error) {
    const analysis = {
      type: 'unknown',
      severity: 'medium',
      recoverable: true,
      category: 'general'
    };

    const message = error.message.toLowerCase();

    if (message.includes('permission denied') || message.includes('eacces')) {
      analysis.type = 'permission';
      analysis.severity = 'high';
      analysis.category = 'filesystem';
    } else if (message.includes('not found') || message.includes('enoent')) {
      analysis.type = 'missing-file';
      analysis.severity = 'high';
      analysis.category = 'filesystem';
    } else if (message.includes('claude') && message.includes('not installed')) {
      analysis.type = 'missing-dependency';
      analysis.severity = 'critical';
      analysis.category = 'environment';
      analysis.recoverable = false;
    } else if (message.includes('timeout') || message.includes('timed out')) {
      analysis.type = 'timeout';
      analysis.severity = 'medium';
      analysis.category = 'network';
    } else if (message.includes('json') || message.includes('parse')) {
      analysis.type = 'config-corruption';
      analysis.severity = 'high';
      analysis.category = 'configuration';
    }

    return analysis;
  }

  /**
   * Generate specific recovery actions based on error analysis
   */
  generateRecoveryActions(error, recovery) {
    const actions = [];
    const analysis = recovery.errorAnalysis;

    switch (analysis.type) {
      case 'permission':
        actions.push('Check file permissions on configuration files');
        actions.push('Run with appropriate user privileges');
        actions.push('Ensure home directory is accessible');
        break;

      case 'missing-file':
        actions.push('Verify Claude Code installation');
        actions.push('Check if configuration files exist');
        actions.push('Re-run initialization if needed');
        break;

      case 'missing-dependency':
        actions.push('Install Claude Code: npm install -g @anthropic-ai/claude-code');
        actions.push('Verify installation: claude --version');
        actions.push('Re-run setup after installation');
        break;

      case 'timeout':
        actions.push('Check network connectivity');
        actions.push('Retry with increased timeout');
        actions.push('Check if Claude Code service is running');
        break;

      case 'config-corruption':
        if (recovery.backupsAvailable) {
          actions.push('Restore from automatic backup');
          actions.push('Validate configuration file syntax');
        }
        actions.push('Remove corrupted configuration and reinitialize');
        break;

      default:
        actions.push('Check the error log for specific details');
        actions.push('Try running with --verbose for more information');
        if (recovery.backupsAvailable) {
          actions.push('Restore from backup if needed');
        }
        actions.push('Contact support if the issue persists');
    }

    return actions;
  }

  /**
   * Display basic recovery information when UX module isn't available
   */
  displayBasicRecovery(error, recovery) {
    console.log('\n❌ Setup Failed - Recovery Information:');
    console.log(`   Error: ${error.message}`);
    console.log(`   Type: ${recovery.errorAnalysis.type}`);
    console.log(`   Severity: ${recovery.errorAnalysis.severity}`);

    if (recovery.rollbackPerformed) {
      console.log(`\n🔄 Automatic rollback completed (${recovery.operationsRolledBack} operations)`);
    }

    if (recovery.backupsAvailable) {
      console.log(`\n💾 Backups available for manual recovery`);
    }

    console.log('\n🛠️ Recommended actions:');
    recovery.recommendedActions.forEach((action, i) => {
      console.log(`   ${i + 1}. ${action}`);
    });
  }

  /**
   * Generate comprehensive setup summary
   */
  generateSetupSummary() {
    return {
      operationsPerformed: this.operationLog.length,
      backupsCreated: this.backupPaths.size,
      rollbackOperationsAvailable: this.rollbackStack.length,
      configurationPaths: {
        local: this.localConfigPath,
        project: this.projectConfigPath
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Enhanced MCP initialization with bulletproof error handling and recovery
 */
export async function enhancedMcpInit(options = {}) {
  const manager = new McpConfigurationManager({
    verbose: options.verbose || false,
    autoFix: options.autoFix !== false, // Default to true for bulletproof operation
    dryRun: options.dryRun || false
  });

  console.log('🔍 Starting enhanced MCP initialization...', options.dryRun ? ' (DRY RUN)' : '');

  try {
    // Initialize UX module if available and requested
    let ux = null;
    if (options.enhancedUx !== false) {
      try {
        const { McpUserExperience } = await import('../cli/mcp-user-experience.js');
        ux = new McpUserExperience({
          verbose: options.verbose,
          interactive: options.interactive !== false
        });

        // Show educational content for first-time users
        if (options.showEducation) {
          ux.displayMcpEducation();
        }
      } catch (uxError) {
        manager.log(`⚠️ UX module not available, using basic output: ${uxError.message}`, 'warn');
      }
    }

    // Comprehensive state detection
    const state = await manager.detectConfigurationState();

    // Display state information
    if (options.verbose || state.healthScore < 80) {
      console.log('\n📋 MCP Configuration Analysis:');
      console.log(`  Health Score: ${state.healthScore}/100 ${state.healthScore >= 80 ? '✅' : state.healthScore >= 60 ? '⚠️' : '❌'}`);
      console.log(`  Claude Code: ${state.claudeCodeInstalled ? '✅ Installed' : '❌ Not installed'}`);
      console.log(`  Local config: ${state.hasLocalConfig ? '✅ Found' : '❌ Not found'}`);
      console.log(`  Project config: ${state.hasProjectConfig ? '✅ Found' : '❌ Not found'}`);
      console.log(`  Servers: ${state.localServers.length} local, ${state.projectServers.length} project`);
      console.log(`  Issues: ${state.conflictingServers.length} conflicts, ${state.brokenPaths.length} broken paths`);

      if (state.criticalIssues.length > 0) {
        console.log('\n❌ Critical Issues:');
        state.criticalIssues.forEach(issue => console.log(`    • ${issue}`));
      }

      if (state.warnings.length > 0) {
        console.log('\n⚠️ Warnings:');
        state.warnings.forEach(warning => console.log(`    • ${warning}`));
      }
    }

    // Execute bulletproof setup
    const result = await manager.executeBulletproofSetup(options.serverConfig, ux);

    // Enhanced success reporting
    if (result.success) {
      console.log('\n🎉 Enhanced MCP initialization completed successfully!');
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Issues Fixed: ${result.details.issuesFixed}`);
      console.log(`   Health Score: ${result.details.healthScore}/100`);
      console.log(`   Operations: ${result.details.operationsPerformed}`);

      if (result.details.backupsCreated > 0) {
        console.log(`   Backups Created: ${result.details.backupsCreated}`);
      }

      // Show success summary if UX is available
      if (ux) {
        ux.displaySuccessSummary(result.details);
      }
    } else {
      console.log('\n❌ Enhanced MCP initialization failed');
      if (result.rollbackAvailable) {
        console.log('   🔄 Rollback operations are available');
      }
    }

    return result;

  } catch (error) {
    console.log(`\n❌ Enhanced MCP init failed: ${error.message}`);

    // Provide error context
    if (error.recovery) {
      console.log('\n🛠️ Recovery suggestions:');
      error.recovery.forEach((suggestion, i) => {
        console.log(`   ${i + 1}. ${suggestion}`);
      });
    }

    return {
      success: false,
      error: error.message,
      recovery: error.recovery || [],
      logs: manager.operationLog
    };
  }
}

/**
 * Quick MCP health check for troubleshooting
 */
export async function quickMcpHealthCheck(options = {}) {
  const manager = new McpConfigurationManager({
    verbose: options.verbose || false,
    dryRun: true // Health check is always read-only
  });

  console.log('🏥 Quick MCP health check...');

  try {
    const state = await manager.detectConfigurationState();
    const verification = await manager.performComprehensiveVerification();

    console.log('\n📊 Health Report:');
    console.log(`  Overall Health: ${state.healthScore}/100 ${state.healthScore >= 80 ? '✅' : state.healthScore >= 60 ? '⚠️' : '❌'}`);
    console.log(`  Claude Code: ${state.claudeCodeInstalled ? '✅' : '❌'}`);
    console.log(`  Configuration: ${state.hasLocalConfig || state.hasProjectConfig ? '✅' : '❌'}`);
    console.log(`  Verification: ${verification.tests.filter(t => t.passed).length}/${verification.tests.length} tests passed`);

    if (state.brokenPaths.length > 0) {
      console.log('\n❌ Broken Configurations:');
      state.brokenPaths.forEach(broken => {
        console.log(`    • ${broken.serverName}: ${broken.issues.join(', ')}`);
      });
    }

    if (state.conflictingServers.length > 0) {
      console.log('\n⚠️ Configuration Conflicts:');
      state.conflictingServers.forEach(conflict => {
        console.log(`    • ${conflict.serverName}: Local vs Project configuration`);
      });
    }

    console.log('\n🛠️ Recommendations:');
    if (state.recommendations.length > 0) {
      state.recommendations.forEach(rec => {
        console.log(`    • ${rec.description}`);
      });
    } else {
      console.log('    • No immediate action required');
    }

    return {
      healthy: state.healthScore >= 80 && verification.success,
      healthScore: state.healthScore,
      state,
      verification,
      needsAttention: state.healthScore < 80 || state.brokenPaths.length > 0
    };

  } catch (error) {
    console.log(`\n❌ Health check failed: ${error.message}`);
    return {
      healthy: false,
      error: error.message,
      needsAttention: true
    };
  }
}

export default McpConfigurationManager;