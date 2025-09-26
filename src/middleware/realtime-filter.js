/**
 * Real-time Filtering Middleware
 * Processes content as it flows through the system with concurrent support
 */

import { FilterIntegrationHooks } from '../hooks/filter-integration.js';
import { PreferenceManager } from '../utils/preference-manager.js';
import { EventEmitter } from 'events';

class RealtimeFilterMiddleware extends EventEmitter {
  constructor(projectRoot = process.cwd()) {
    super();

    this.projectRoot = projectRoot;
    this.filterHooks = new FilterIntegrationHooks(projectRoot);
    this.preferenceManager = new PreferenceManager(projectRoot);

    this.activeStreams = new Map();
    this.processingQueue = [];
    this.batchSize = 10;
    this.processingInterval = 100; // ms
    this.concurrentLimit = 5;

    this.stats = {
      processed: 0,
      filtered: 0,
      modified: 0,
      errors: 0,
      avgProcessingTime: 0,
      throughput: 0,
    };

    this.setupProcessingLoop();
    this.setupStreamHandlers();
  }

  /**
   * Process content through filtering pipeline
   */
  async processContent(content, metadata = {}) {
    const startTime = Date.now();

    try {
      // Get contextual preferences
      const preferences = this.preferenceManager.getContextualPreferences({
        agentType: metadata.agentType,
        projectType: metadata.projectType,
        taskType: metadata.taskType,
      });

      // Apply content filtering
      let result = {
        content,
        metadata,
        allowed: true,
        modified: false,
        suggestions: [],
      };

      // Document generation filtering
      if (metadata.isDocument || this.isDocumentContent(content, metadata)) {
        const docResult = this.filterHooks.interceptDocumentGeneration(
          metadata.filePath || 'unknown.md',
          content,
          metadata,
        );

        result.allowed = docResult.allowed;
        result.content = docResult.content;
        result.filePath = docResult.filePath;
        result.reason = docResult.reason;
        result.suggestions = docResult.modifications || [];
        result.modified = docResult.processed || docResult.filePath !== metadata.filePath;
      }

      // Message tone processing
      if (metadata.isMessage || this.isMessageContent(content, metadata)) {
        const processedMessage = this.filterHooks.processAgentMessage(
          content,
          metadata.agentType,
          metadata,
        );

        if (processedMessage !== content) {
          result.content = processedMessage;
          result.modified = true;
          result.suggestions.push('Tone adjusted for better clarity');
        }
      }

      // Batch processing for multiple items
      if (metadata.isBatch && Array.isArray(content)) {
        result = await this.processBatch(content, metadata);
      }

      // Update statistics
      this.updateStats(startTime, result);

      // Emit events
      this.emit('contentProcessed', result);
      if (!result.allowed) {
        this.emit('contentBlocked', result);
      }
      if (result.modified) {
        this.emit('contentModified', result);
      }

      return result;
    } catch (error) {
      this.stats.errors++;
      this.emit('processingError', { error, content, metadata });

      return {
        content,
        metadata,
        allowed: false,
        modified: false,
        error: error.message,
        suggestions: ['Manual review required due to processing error'],
      };
    }
  }

  /**
   * Create stream processor for continuous filtering
   */
  createStreamProcessor(streamId, options = {}) {
    const stream = {
      id: streamId,
      options,
      buffer: [],
      processing: false,
      stats: { processed: 0, filtered: 0, errors: 0 },
      preferences: this.preferenceManager.getContextualPreferences(options.context || {}),
    };

    this.activeStreams.set(streamId, stream);

    const processor = {
      write: (chunk) => this.writeToStream(streamId, chunk),
      end: () => this.endStream(streamId),
      on: (event, callback) => this.on(`${streamId}:${event}`, callback),
      getStats: () => stream.stats,
    };

    this.emit('streamCreated', { streamId, options });

    return processor;
  }

  /**
   * Write data to stream
   */
  async writeToStream(streamId, chunk) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    stream.buffer.push({
      data: chunk,
      timestamp: Date.now(),
    });

    // Process buffer if it reaches batch size
    if (stream.buffer.length >= this.batchSize && !stream.processing) {
      await this.processStreamBuffer(streamId);
    }
  }

  /**
   * Process stream buffer
   */
  async processStreamBuffer(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream || stream.processing) return;

    stream.processing = true;

    try {
      const batch = stream.buffer.splice(0, this.batchSize);
      const results = await Promise.all(
        batch.map(({ data, timestamp }) =>
          this.processContent(data, {
            ...stream.options.context,
            streamId,
            timestamp,
            isStreaming: true,
          }),
        ),
      );

      results.forEach((result, index) => {
        stream.stats.processed++;
        if (!result.allowed) stream.stats.filtered++;
        if (result.error) stream.stats.errors++;

        this.emit(`${streamId}:data`, result);
      });

      this.emit(`${streamId}:batch`, { results, streamId });
    } catch (error) {
      stream.stats.errors++;
      this.emit(`${streamId}:error`, error);
    } finally {
      stream.processing = false;

      // Process remaining buffer if exists
      if (stream.buffer.length > 0) {
        setTimeout(() => this.processStreamBuffer(streamId), this.processingInterval);
      }
    }
  }

  /**
   * End stream processing
   */
  async endStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    // Process remaining buffer
    if (stream.buffer.length > 0) {
      await this.processStreamBuffer(streamId);
    }

    this.emit(`${streamId}:end`, { stats: stream.stats });
    this.activeStreams.delete(streamId);
  }

  /**
   * Process batch of content items
   */
  async processBatch(items, metadata = {}) {
    const batchResults = {
      processed: [],
      blocked: [],
      modified: [],
      errors: [],
      summary: {
        total: items.length,
        allowed: 0,
        blocked: 0,
        modified: 0,
        errors: 0,
      },
    };

    // Process in chunks to respect concurrent limits
    const chunks = this.chunkArray(items, this.concurrentLimit);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (item, index) => {
        try {
          const itemMetadata = {
            ...metadata,
            batchIndex: index,
            isBatch: false,
          };

          return await this.processContent(item, itemMetadata);
        } catch (error) {
          return {
            content: item,
            metadata: itemMetadata,
            allowed: false,
            modified: false,
            error: error.message,
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);

      chunkResults.forEach((result) => {
        if (result.error) {
          batchResults.errors.push(result);
          batchResults.summary.errors++;
        } else if (!result.allowed) {
          batchResults.blocked.push(result);
          batchResults.summary.blocked++;
        } else {
          batchResults.processed.push(result);
          batchResults.summary.allowed++;

          if (result.modified) {
            batchResults.modified.push(result);
            batchResults.summary.modified++;
          }
        }
      });
    }

    this.emit('batchProcessed', batchResults);

    return batchResults;
  }

  /**
   * Setup automatic processing loop
   */
  setupProcessingLoop() {
    setInterval(() => {
      // Process queued items
      if (this.processingQueue.length > 0) {
        this.processQueueBatch();
      }

      // Update throughput metrics
      this.updateThroughputMetrics();

      // Cleanup stale streams
      this.cleanupStaleStreams();
    }, this.processingInterval);
  }

  /**
   * Process queued items
   */
  async processQueueBatch() {
    if (this.processingQueue.length === 0) return;

    const batch = this.processingQueue.splice(0, this.batchSize);
    const results = await this.processBatch(
      batch.map((item) => item.content),
      {
        queueProcessing: true,
      },
    );

    batch.forEach((item, index) => {
      const result = results.processed[index] || results.blocked[index] || results.errors[index];
      if (item.callback) {
        item.callback(result);
      }
    });
  }

  /**
   * Queue content for processing
   */
  queueContent(content, metadata = {}, callback = null) {
    this.processingQueue.push({
      content,
      metadata: { ...metadata, queued: true },
      callback,
      timestamp: Date.now(),
    });
  }

  /**
   * Setup stream event handlers
   */
  setupStreamHandlers() {
    this.on('contentProcessed', (result) => {
      // Log successful processing
      if (result.metadata.streamId) {
        this.updateStreamStats(result.metadata.streamId, 'processed');
      }
    });

    this.on('contentBlocked', (result) => {
      // Handle blocked content
      if (result.metadata.agentType) {
        console.warn(`Content blocked for ${result.metadata.agentType}: ${result.reason}`);
      }
    });

    this.on('processingError', ({ error, metadata }) => {
      // Log processing errors
      console.error(`Processing error for ${metadata.agentType || 'unknown'}:`, error);
    });
  }

  /**
   * Create Express.js middleware
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      // Skip non-document requests
      if (!this.shouldProcessRequest(req)) {
        return next();
      }

      const originalSend = res.send;
      const originalJson = res.json;

      // Intercept response content
      res.send = (content) => {
        this.processContent(content, {
          method: req.method,
          path: req.path,
          isResponse: true,
        })
          .then((result) => {
            if (result.allowed) {
              originalSend.call(res, result.content);
            } else {
              res.status(403).json({
                error: 'Content filtered',
                reason: result.reason,
                suggestions: result.suggestions,
              });
            }
          })
          .catch((error) => {
            console.error('Middleware processing error:', error);
            originalSend.call(res, content);
          });
      };

      res.json = (obj) => {
        this.processContent(JSON.stringify(obj), {
          method: req.method,
          path: req.path,
          isResponse: true,
          isJson: true,
        })
          .then((result) => {
            if (result.allowed) {
              try {
                const processedObj = JSON.parse(result.content);
                originalJson.call(res, processedObj);
              } catch (e) {
                originalJson.call(res, obj);
              }
            } else {
              res.status(403).json({
                error: 'Content filtered',
                reason: result.reason,
                suggestions: result.suggestions,
              });
            }
          })
          .catch((error) => {
            console.error('Middleware JSON processing error:', error);
            originalJson.call(res, obj);
          });
      };

      next();
    };
  }

  /**
   * Create WebSocket handler
   */
  createWebSocketHandler(ws, metadata = {}) {
    const streamId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const processor = this.createStreamProcessor(streamId, {
      context: { ...metadata, isWebSocket: true },
    });

    ws.on('message', async (message) => {
      try {
        const messageStr = message.toString();
        const result = await this.processContent(messageStr, {
          ...metadata,
          streamId,
          isWebSocket: true,
          messageType: 'incoming',
        });

        if (result.allowed) {
          // Process the message normally
          ws.emit('processedMessage', result);
        } else {
          // Send filter notification
          ws.send(
            JSON.stringify({
              type: 'filterNotification',
              reason: result.reason,
              suggestions: result.suggestions,
            }),
          );
        }
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Message processing failed',
          }),
        );
      }
    });

    ws.on('close', () => {
      this.endStream(streamId);
    });

    return processor;
  }

  // Helper methods

  isDocumentContent(content, metadata) {
    if (metadata.filePath) {
      return metadata.filePath.endsWith('.md') || metadata.filePath.endsWith('.txt');
    }

    // Heuristic: check if content looks like documentation
    return (
      content.length > 200 &&
      (content.includes('# ') ||
        content.includes('## ') ||
        content.includes('```') ||
        content.includes('documentation'))
    );
  }

  isMessageContent(content, metadata) {
    return metadata.isMessage || (!metadata.filePath && content.length < 1000);
  }

  shouldProcessRequest(req) {
    const processablePaths = ['/api/documents', '/api/generate', '/api/content'];
    return processablePaths.some((path) => req.path.startsWith(path));
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  updateStats(startTime, result) {
    const processingTime = Date.now() - startTime;

    this.stats.processed++;
    if (!result.allowed) this.stats.filtered++;
    if (result.modified) this.stats.modified++;

    // Update average processing time
    this.stats.avgProcessingTime =
      (this.stats.avgProcessingTime * (this.stats.processed - 1) + processingTime) /
      this.stats.processed;
  }

  updateStreamStats(streamId, statType) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.stats[statType]++;
    }
  }

  updateThroughputMetrics() {
    const now = Date.now();
    if (!this.lastThroughputUpdate) {
      this.lastThroughputUpdate = now;
      this.lastProcessedCount = this.stats.processed;
      return;
    }

    const timeDiff = now - this.lastThroughputUpdate;
    if (timeDiff >= 1000) {
      // Update every second
      const processedDiff = this.stats.processed - this.lastProcessedCount;
      this.stats.throughput = (processedDiff / timeDiff) * 1000; // per second

      this.lastThroughputUpdate = now;
      this.lastProcessedCount = this.stats.processed;
    }
  }

  cleanupStaleStreams() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [streamId, stream] of this.activeStreams.entries()) {
      const lastActivity = Math.max(
        ...stream.buffer.map((item) => item.timestamp),
        now - staleThreshold,
      );

      if (now - lastActivity > staleThreshold && stream.buffer.length === 0) {
        this.endStream(streamId);
      }
    }
  }

  /**
   * Get current processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeStreams: this.activeStreams.size,
      queueLength: this.processingQueue.length,
      uptime: Date.now() - (this.startTime || Date.now()),
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      processed: 0,
      filtered: 0,
      modified: 0,
      errors: 0,
      avgProcessingTime: 0,
      throughput: 0,
    };
    this.startTime = Date.now();
  }

  /**
   * Shutdown middleware gracefully
   */
  async shutdown() {
    // Process remaining queue
    if (this.processingQueue.length > 0) {
      await this.processQueueBatch();
    }

    // End all active streams
    for (const streamId of this.activeStreams.keys()) {
      await this.endStream(streamId);
    }

    this.emit('shutdown');
  }
}

export default RealtimeFilterMiddleware;
export { RealtimeFilterMiddleware };
