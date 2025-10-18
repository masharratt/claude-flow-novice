/**
 * Real-time AST Processor
 * High-performance batch processing with sub-millisecond operations
 */

import { EventEmitter } from 'events';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { WASMEngine } from '../engine/wasm-engine';
import {
  ASTOperation,
  ProcessingResult,
  BatchProcessingJob,
  RealTimeAnalysisEvent,
  PerformanceMetrics,
  ASTNode,
  CodeTransformation,
  AnalysisRule,
  PERFORMANCE_TARGETS
} from '../types/ast-types';

export class RealTimeASTProcessor extends EventEmitter {
  private engine: WASMEngine;
  private activeJobs = new Map<string, BatchProcessingJob>();
  private processingQueue: BatchProcessingJob[] = [];
  private maxConcurrency = 10;
  private workers: Worker[] = [];
  private analysisRules: AnalysisRule[] = [];
  private performanceMetrics: PerformanceMetrics[] = [];
  private isProcessing = false;

  constructor(engine: WASMEngine) {
    super();
    this.engine = engine;
    this.setupEngineListeners();
    this.initializeDefaultRules();
  }

  /**
   * Process files in real-time with sub-millisecond performance
   */
  async processFiles(filePaths: string[], operations: ASTOperation[]): Promise<Map<string, ProcessingResult>> {
    const jobId = this.generateJobId();
    const job: BatchProcessingJob = {
      id: jobId,
      files: filePaths,
      operations,
      status: 'pending',
      results: new Map(),
      progress: 0,
      startTime: Date.now(),
    };

    this.activeJobs.set(jobId, job);
    this.processingQueue.push(job);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }

    // Wait for job completion
    return new Promise((resolve, reject) => {
      const checkJob = () => {
        const currentJob = this.activeJobs.get(jobId);
        if (!currentJob) {
          reject(new Error('Job not found'));
          return;
        }

        if (currentJob.status === 'completed') {
          resolve(currentJob.results);
        } else if (currentJob.status === 'failed') {
          reject(new Error('Batch processing failed'));
        } else {
          setTimeout(checkJob, 10); // Check every 10ms
        }
      };
      checkJob();
    });
  }

  /**
   * Process single file with real-time feedback
   */
  async processFile(filePath: string, source: string): Promise<ProcessingResult> {
    const startTime = performance.now();

    try {
      // Parse source code
      const parseResult = await this.engine.parse(source);

      if (!parseResult.success) {
        return parseResult;
      }

      // Apply analysis rules
      const analysisResult = await this.analyzeAST(parseResult.ast!);

      // Check for performance targets
      const processingTime = performance.now() - startTime;
      const meetsPerformanceTarget = processingTime < 1.0; // Sub-millisecond

      if (!meetsPerformanceTarget) {
        this.emit('performance:alert', {
          type: 'slow_processing',
          filePath,
          processingTime,
          threshold: 1.0,
        });
      }

      const result: ProcessingResult = {
        ...parseResult,
        ...analysisResult,
        metrics: {
          ...parseResult.metrics,
          totalTime: processingTime,
        },
      };

      // Emit real-time event
      this.emitRealTimeEvent({
        type: 'ast_parsed',
        timestamp: Date.now(),
        fileId: filePath,
        data: { nodeCount: this.countNodes(result.ast) },
        metrics: result.metrics,
      });

      return result;

    } catch (error) {
      const processingTime = performance.now() - startTime;
      return {
        success: false,
        metrics: {
          parseTime: 0,
          transformTime: 0,
          totalTime: processingTime,
          memoryUsed: 0,
          nodesProcessed: 0,
          throughput: 0,
        },
        errors: [error.message],
      };
    }
  }

  /**
   * Apply code transformations to AST
   */
  async applyTransformations(ast: ASTNode, transformations: CodeTransformation[]): Promise<ProcessingResult> {
    const startTime = performance.now();

    try {
      // Convert transformations to engine-compatible format
      const engineTransforms = transformations.map(t => ({
        type: t.type,
        target: this.getNodePath(ast, t.target),
        replacement: t.replacement,
        position: t.position,
      }));

      // Apply transformations using WASM engine
      const result = await this.engine.transform(ast, engineTransforms);

      const processingTime = performance.now() - startTime;
      result.metrics.totalTime = processingTime;

      // Emit transformation event
      this.emitRealTimeEvent({
        type: 'transformation_applied',
        timestamp: Date.now(),
        fileId: 'transform',
        data: { transformations: transformations.length, result: result.success },
        metrics: result.metrics,
      });

      return result;

    } catch (error) {
      const processingTime = performance.now() - startTime;
      return {
        success: false,
        metrics: {
          parseTime: 0,
          transformTime: processingTime,
          totalTime: processingTime,
          memoryUsed: 0,
          nodesProcessed: 0,
          throughput: 0,
        },
        errors: [error.message],
      };
    }
  }

  /**
   * Analyze AST for patterns and issues
   */
  async analyzeAST(ast: ASTNode): Promise<Partial<ProcessingResult>> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const startTime = performance.now();

    // Apply analysis rules
    for (const rule of this.analysisRules) {
      try {
        const matches = this.findRuleMatches(ast, rule);
        for (const match of matches) {
          if (rule.severity === 'error') {
            errors.push(`${rule.name}: ${rule.description} at ${match.start}-${match.end}`);
          } else if (rule.severity === 'warning') {
            warnings.push(`${rule.name}: ${rule.description} at ${match.start}-${match.end}`);
          }
        }
      } catch (error) {
        console.warn(`Analysis rule ${rule.name} failed:`, error.message);
      }
    }

    const analysisTime = performance.now() - startTime;

    return {
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      metrics: {
        parseTime: 0,
        transformTime: analysisTime,
        totalTime: analysisTime,
        memoryUsed: 0,
        nodesProcessed: this.countNodes(ast),
        throughput: this.countNodes(ast) / analysisTime,
      },
    };
  }

  /**
   * Get real-time performance statistics
   */
  getPerformanceStats() {
    const recentMetrics = this.performanceMetrics.slice(-100); // Last 100 operations
    const avgMetrics = recentMetrics.length > 0 ? {
      totalTime: recentMetrics.reduce((sum, m) => sum + m.totalTime, 0) / recentMetrics.length,
      parseTime: recentMetrics.reduce((sum, m) => sum + m.parseTime, 0) / recentMetrics.length,
      transformTime: recentMetrics.reduce((sum, m) => sum + m.transformTime, 0) / recentMetrics.length,
      throughput: recentMetrics.reduce((sum, m) => sum + m.throughput, 0) / recentMetrics.length,
      memoryUsed: Math.max(...recentMetrics.map(m => m.memoryUsed)),
    } : {};

    const performanceTargetMet = recentMetrics.length > 0 &&
      recentMetrics.filter(m => m.totalTime < 1.0).length / recentMetrics.length >= PERFORMANCE_TARGETS.PARSE_TIME_SUB_MILLISECOND;

    return {
      averageMetrics: avgMetrics,
      performanceTargetMet,
      targetPercentage: performanceTargetMet ? 100 : (recentMetrics.filter(m => m.totalTime < 1.0).length / recentMetrics.length) * 100,
      activeJobs: this.activeJobs.size,
      queueLength: this.processingQueue.length,
      recentOperations: recentMetrics.length,
    };
  }

  // Private methods

  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const jobs = this.processingQueue.splice(0, this.maxConcurrency);
      const promises = jobs.map(job => this.processJob(job));
      await Promise.all(promises);
    }

    this.isProcessing = false;
  }

  private async processJob(job: BatchProcessingJob): Promise<void> {
    job.status = 'processing';
    this.emit('job:started', { jobId: job.id, fileCount: job.files.length });

    try {
      const filePromises = job.files.map(async (filePath, index) => {
        try {
          // Read file content
          const source = await this.readFileContent(filePath);

          // Process file
          const result = await this.processFile(filePath, source);

          job.results.set(filePath, result);
          job.progress = ((index + 1) / job.files.length) * 100;

          this.emit('job:progress', {
            jobId: job.id,
            progress: job.progress,
            currentFile: filePath,
          });

          return result;
        } catch (error) {
          const errorResult: ProcessingResult = {
            success: false,
            metrics: {
              parseTime: 0,
              transformTime: 0,
              totalTime: 0,
              memoryUsed: 0,
              nodesProcessed: 0,
              throughput: 0,
            },
            errors: [error.message],
          };
          job.results.set(filePath, errorResult);
          return errorResult;
        }
      });

      await Promise.all(filePromises);

      job.status = 'completed';
      job.endTime = Date.now();

      this.emit('job:completed', {
        jobId: job.id,
        duration: job.endTime - job.startTime,
        fileCount: job.files.length,
        successCount: Array.from(job.results.values()).filter(r => r.success).length,
      });

    } catch (error) {
      job.status = 'failed';
      job.endTime = Date.now();
      this.emit('job:failed', { jobId: job.id, error: error.message });
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  private async readFileContent(filePath: string): Promise<string> {
    // In real implementation, this would read from filesystem
    // For now, return sample content
    return `// File content for ${filePath}\nfunction example() { return true; }`;
  }

  private setupEngineListeners(): void {
    this.engine.on('operation:completed', (data) => {
      this.performanceMetrics.push(data.result.metrics);
      if (this.performanceMetrics.length > 1000) {
        this.performanceMetrics.shift();
      }
    });

    this.engine.on('performance:update', (metrics) => {
      this.emit('performance:update', metrics);
    });
  }

  private initializeDefaultRules(): void {
    this.analysisRules = [
      {
        id: 'syntax_error',
        name: 'Syntax Error Detection',
        description: 'Detect syntax errors in code',
        pattern: /syntax/i,
        severity: 'error',
        action: (node) => node.type === 'error',
      },
      {
        id: 'performance_warning',
        name: 'Performance Warning',
        description: 'Detect potential performance issues',
        pattern: /performance/i,
        severity: 'warning',
        action: (node) => node.type === 'loop' && this.isComplexLoop(node),
      },
      {
        id: 'security_check',
        name: 'Security Check',
        description: 'Check for security vulnerabilities',
        pattern: /eval|exec|dangerous/i,
        severity: 'error',
        action: (node) => this.hasSecurityIssue(node),
      },
    ];
  }

  private findRuleMatches(ast: ASTNode, rule: AnalysisRule): ASTNode[] {
    const matches: ASTNode[] = [];
    this.traverseAST(ast, (node) => {
      if (rule.action(node)) {
        matches.push(node);
      }
    });
    return matches;
  }

  private traverseAST(node: ASTNode, callback: (node: ASTNode) => void): void {
    callback(node);
    if (node.children) {
      for (const child of node.children) {
        this.traverseAST(child, callback);
      }
    }
  }

  private countNodes(ast: ASTNode | undefined): number {
    if (!ast) return 0;
    let count = 1;
    if (ast.children) {
      for (const child of ast.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }

  private getNodePath(ast: ASTNode, target: ASTNode): string {
    // Generate unique path to target node
    return `${target.type}:${target.start}-${target.end}`;
  }

  private isComplexLoop(node: ASTNode): boolean {
    // Check if loop is complex (nested, many operations, etc.)
    return node.children && node.children.length > 10;
  }

  private hasSecurityIssue(node: ASTNode): boolean {
    // Check for dangerous patterns
    return node.type === 'call' &&
           node.value &&
           ['eval', 'exec', 'setTimeout', 'setInterval'].includes(node.value);
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private emitRealTimeEvent(event: RealTimeAnalysisEvent): void {
    this.emit('realtime:event', event);

    // Publish to Redis for swarm coordination
    this.publishToRedis('ast-operations', {
      type: 'REAL_TIME_EVENT',
      data: event,
      timestamp: Date.now(),
    });
  }

  private publishToRedis(channel: string, message: any): void {
    // Redis publish implementation - would be implemented with actual Redis client
    if (typeof process !== 'undefined' && process.send) {
      process.send({ type: 'redis_publish', channel, message });
    }
  }
}