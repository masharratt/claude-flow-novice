/**
 * Implementation Coordinator
 *
 * Dormant coordinator that generates files and requests reviews.
 * Used for both Coordinator-A (files 1-35) and Coordinator-B (files 36-70).
 *
 * Flow:
 * 1. Receive generate request → transition to active
 * 2. Spawn SwarmCoordinator to generate N files
 * 3. Wait for files to complete
 * 4. Send review request to ReviewCoordinator
 * 5. Transition to paused while waiting
 * 6. Receive review response → transition to active
 * 7. Fix errors if needed (respawn SwarmCoordinator)
 * 8. Report completion → transition to dormant
 */

import { DormantCoordinatorBase } from '../lib/dormant-coordinator-base.js';
import { SwarmCoordinator } from '../../../.claude-flow-novice/dist/src/coordination/swarm-coordinator.js';
import { ConfigManager } from '../../../.claude-flow-novice/dist/src/config/config-manager.js';
import { Logger } from '../../../.claude-flow-novice/dist/src/core/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ImplCoordinator extends DormantCoordinatorBase {
  constructor(id, redisUrl, fileRange, outputDir) {
    super(id, redisUrl);

    this.fileRange = fileRange; // { start: 1, end: 35 } or { start: 36, end: 70 }
    this.outputDir = outputDir;
    this.swarmCoordinator = null;
    this.generatedFiles = [];
    this.errorFiles = [];
    this.retryCount = 0;
    this.maxRetries = 5;

    // Override message handlers
    this.setupImplHandlers();
  }

  /**
   * Setup implementation-specific message handlers
   * Extends base handlers instead of replacing them
   */
  setupImplHandlers() {
    console.log(`[${this.id}] [DEBUG] Setting up impl-specific handlers`);
    console.log(`[${this.id}] [DEBUG] Base handlers before:`, Array.from(this.messageHandlers.keys()));

    // Add custom task handlers (extend, don't replace base handlers)
    this.messageHandlers.set('generate', this.handleGenerateRequest.bind(this));
    this.messageHandlers.set('review_response', this.handleReviewResponse.bind(this));

    console.log(`[${this.id}] [DEBUG] All handlers after:`, Array.from(this.messageHandlers.keys()));
  }

  /**
   * Initialize swarm coordinator
   */
  async initializeSwarm() {
    console.log(`[${this.id}] Initializing SwarmCoordinator...`);

    // Load environment
    const apiKey = process.env.Z_AI_API_KEY;
    if (!apiKey) {
      throw new Error('Z_AI_API_KEY not found in environment');
    }

    // Initialize ConfigManager
    const configManager = ConfigManager.getInstance();
    await configManager.init();

    // Create logger
    const logger = new Logger(
      { level: 'info', format: 'text', destination: 'console' },
      { component: this.id }
    );

    // Create provider config
    const providerConfig = {
      providers: {
        zai: {
          apiKey,
          model: 'glm-4.6',
          maxTokens: 8192,
          temperature: 0.7,
          enableCaching: false,
        },
      },
      defaultProvider: 'zai',
      tieredRouting: {
        enabled: false,
      },
      monitoring: {
        enabled: false,
      },
    };

    // Create SwarmCoordinator with OPTIMIZED CONCURRENCY
    this.swarmCoordinator = new SwarmCoordinator(
      {
        id: `${this.id}-swarm`,
        objective: `Generate files ${this.fileRange.start}-${this.fileRange.end}`,
        topology: 'mesh',
        providerConfig,
        configManager,
        redisUrl: this.redisUrl,
        enableMonitoring: false,
        enableSQLiteMemory: false,
        // **PERFORMANCE OPTIMIZATION**: Increase concurrent task execution
        maxConcurrentTasks: 20, // Up from default 5 (4x parallelism)
        maxAgents: 20, // Up from default 10
        backgroundTaskInterval: 1000, // Check every 1s (down from 5s)
      },
      logger
    );

    await this.swarmCoordinator.start();

    // **PERFORMANCE OPTIMIZATION**: Register multiple coder agents for parallel execution
    const agentCount = 10; // 10 parallel agents
    const agentRegistrations = [];

    for (let i = 0; i < agentCount; i++) {
      agentRegistrations.push(
        this.swarmCoordinator.registerAgent(
          `${this.id}-agent-${i}`,
          'coder',
          ['file-operations', 'code-generation']
        )
      );
    }

    await Promise.all(agentRegistrations);
    console.log(`[${this.id}] SwarmCoordinator initialized with ${agentCount} agents`);
  }

  /**
   * Handle generate request
   */
  async handleGenerateRequest(message) {
    console.log(`[${this.id}] [DEBUG] handleGenerateRequest called`);
    console.log(`[${this.id}] [DEBUG] Message details:`, {
      id: message.id,
      type: message.type,
      task: message.task,
      correlationId: message.correlationId,
      from: message.from,
      hasData: !!message.data,
      fileCount: message.data?.fileCount
    });

    console.log(`[${this.id}] Generate request received: ${message.data.fileCount} files`);

    const request = {
      id: message.id,
      type: 'generate',
      task: 'generate',
      correlationId: message.correlationId,
      from: message.from,
      data: message.data
    };

    console.log(`[${this.id}] [DEBUG] Adding to request queue:`, {
      queueSizeBefore: this.requestQueue.length,
      request: request
    });

    this.requestQueue.push(request);

    console.log(`[${this.id}] [DEBUG] Request queued:`, {
      queueSizeAfter: this.requestQueue.length,
      totalQueued: this.requestQueue.length
    });
  }

  /**
   * Handle review response
   */
  async handleReviewResponse(message) {
    console.log(`[${this.id}] [DEBUG] Review response received`);
    console.log(`[${this.id}] [DEBUG] Message details:`, {
      correlationId: message.correlationId,
      from: message.from,
      hasData: !!message.data
    });

    // Delegate to base response handler
    const responseHandler = this.messageHandlers.get('response');
    if (responseHandler) {
      await responseHandler(message);
    } else {
      console.error(`[${this.id}] [DEBUG] ERROR: No 'response' handler found!`);
      console.error(`[${this.id}] [DEBUG] Available handlers:`, Array.from(this.messageHandlers.keys()));
    }
  }

  /**
   * Process a generate request
   */
  async processRequest(request) {
    console.log(`[${this.id}] [DEBUG] processRequest called:`, {
      requestId: request.id,
      task: request.task,
      correlationId: request.correlationId,
      from: request.from,
      currentState: this.state
    });

    if (request.task !== 'generate') {
      console.log(`[${this.id}] [DEBUG] Skipping non-generate request: ${request.task}`);
      return;
    }

    console.log(`[${this.id}] Processing generate request: ${request.id}`);
    console.log(`[${this.id}] [DEBUG] Starting file generation process...`);

    try {
      // Initialize swarm if needed
      if (!this.swarmCoordinator) {
        await this.initializeSwarm();
      }

      // Generate files
      await this.generateFiles();

      console.log(`[${this.id}] [DEBUG] Files generated, preparing review request...`);

      // Submit for review
      console.log(`[${this.id}] [DEBUG] Sending review request to Review coordinator...`);
      const correlationId = await this.sendRequest('Review', 'review', {
        coordinator: this.id,
        files: this.generatedFiles,
        fileCount: this.generatedFiles.length
      });

      console.log(`[${this.id}] [DEBUG] Review request sent:`, {
        correlationId,
        targetCoordinator: 'Review',
        fileCount: this.generatedFiles.length
      });

      // Pause and wait for review response
      console.log(`[${this.id}] Waiting for review response...`);
      console.log(`[${this.id}] [DEBUG] Entering pauseAndWait:`, {
        correlationId,
        timeout: 120000,
        currentState: this.state
      });

      const reviewResponse = await this.pauseAndWait(correlationId, 120000);

      console.log(`[${this.id}] [DEBUG] Review response received:`, {
        hasErrors: reviewResponse.hasErrors,
        errorFileCount: reviewResponse.errorFiles?.length || 0
      });

      // Process review results
      if (reviewResponse.hasErrors) {
        console.log(`[${this.id}] Review found errors in ${reviewResponse.errorFiles.length} files`);
        this.errorFiles = reviewResponse.errorFiles;

        // Fix errors if under retry limit
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          console.log(`[${this.id}] Fixing errors (retry ${this.retryCount}/${this.maxRetries})`);
          await this.fixErrors();
        } else {
          console.error(`[${this.id}] Max retries reached, errors not fixed`);
        }
      } else {
        console.log(`[${this.id}] Review passed, all files successful`);
      }

      // Mark request as completed
      this.stats.requestsCompleted++;
      this.completedRequests.add(request.id);

      // Send completion response
      if (request.from) {
        await this.sendResponse(request.from, request.correlationId, {
          success: true,
          filesGenerated: this.generatedFiles.length,
          errors: this.errorFiles.length
        });
      }

      console.log(`[${this.id}] Request processing complete`);
    } catch (error) {
      console.error(`[${this.id}] Error processing request:`, error);

      // Send error response
      if (request.from) {
        await this.sendResponse(request.from, request.correlationId, {
          success: false,
          error: error.message
        }, false);
      }
    }
  }

  /**
   * Generate files using SwarmCoordinator
   */
  async generateFiles() {
    console.log(`[${this.id}] Generating files ${this.fileRange.start}-${this.fileRange.end}...`);

    this.generatedFiles = [];

    // Create tasks for each file
    for (let i = this.fileRange.start; i <= this.fileRange.end; i++) {
      const fileName = `file-${String(i).padStart(3, '0')}.txt`;
      const filePath = path.join(this.outputDir, fileName);

      const task = {
        id: `task-${this.id}-${i}`,
        description: `Create file: ${fileName}

Content should be:
- Line 1: Hello World from ${this.id}
- Line 2: File number: ${i}
- Line 3: Generated by: ${this.id}
- Line 4: Timestamp: [current timestamp]

Save to: ${filePath}

After creating, verify the file exists using bash: ls -la ${filePath}`,
        priority: 1,
        dependencies: [],
        metadata: {
          fileName,
          fileNumber: i,
          coordinator: this.id
        }
      };

      await this.swarmCoordinator.addTask(task);
    }

    console.log(`[${this.id}] Added ${this.fileRange.end - this.fileRange.start + 1} tasks to swarm`);

    // Wait for all tasks to complete
    const expectedTasks = this.fileRange.end - this.fileRange.start + 1;
    const timeout = 30 * 60 * 1000; // 30 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = this.swarmCoordinator.getStatus();

      if (status.completedTasks >= expectedTasks) {
        console.log(`[${this.id}] All ${expectedTasks} tasks completed`);
        break;
      }

      console.log(`[${this.id}] Progress: ${status.completedTasks}/${expectedTasks} tasks completed`);
      await this.sleep(5000);
    }

    // Verify files were created
    for (let i = this.fileRange.start; i <= this.fileRange.end; i++) {
      const fileName = `file-${String(i).padStart(3, '0')}.txt`;
      const filePath = path.join(this.outputDir, fileName);

      try {
        await fs.access(filePath);
        this.generatedFiles.push({
          fileName,
          filePath,
          fileNumber: i
        });
      } catch (error) {
        console.error(`[${this.id}] File not created: ${fileName}`);
      }
    }

    console.log(`[${this.id}] Generated ${this.generatedFiles.length} files`);
  }

  /**
   * Fix errors in failed files
   */
  async fixErrors() {
    console.log(`[${this.id}] Fixing ${this.errorFiles.length} files with errors...`);

    // Create tasks to regenerate error files
    for (const errorFile of this.errorFiles) {
      const fileName = errorFile.fileName;
      const fileNumber = errorFile.fileNumber;
      const filePath = path.join(this.outputDir, fileName);

      const task = {
        id: `task-${this.id}-retry-${fileNumber}-${this.retryCount}`,
        description: `Fix file: ${fileName}

This is a retry (attempt ${this.retryCount}). Previous error: ${errorFile.error}

Content should be:
- Line 1: Hello World from ${this.id}
- Line 2: File number: ${fileNumber}
- Line 3: Generated by: ${this.id}
- Line 4: Timestamp: [current timestamp]
- Line 5: Retry attempt: ${this.retryCount}

Save to: ${filePath}

After creating, verify the file exists using bash: ls -la ${filePath}`,
        priority: 1,
        dependencies: [],
        metadata: {
          fileName,
          fileNumber,
          coordinator: this.id,
          retry: this.retryCount
        }
      };

      await this.swarmCoordinator.addTask(task);
    }

    console.log(`[${this.id}] Added ${this.errorFiles.length} retry tasks to swarm`);

    // Wait for retry tasks to complete
    const timeout = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    const startCompletedCount = this.swarmCoordinator.getStatus().completedTasks;

    while (Date.now() - startTime < timeout) {
      const status = this.swarmCoordinator.getStatus();

      if (status.completedTasks >= startCompletedCount + this.errorFiles.length) {
        console.log(`[${this.id}] All ${this.errorFiles.length} retry tasks completed`);
        break;
      }

      await this.sleep(5000);
    }

    // Clear error files list
    this.errorFiles = [];
  }

  /**
   * Cleanup
   */
  async shutdown() {
    console.log(`[${this.id}] Shutting down implementation coordinator...`);

    if (this.swarmCoordinator) {
      await this.swarmCoordinator.stop();
    }

    await super.shutdown();
  }
}
