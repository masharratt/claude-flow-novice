/**
 * File Worker Thread
 * Optimized worker for parallel file processing operations
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');

class FileWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.processedBytes = 0;
    this.startTime = Date.now();
  }

  /**
   * Process file chunk with optimized algorithms
   */
  async processChunk(chunk, options = {}) {
    const { operation = 'analyze', position = 0, totalSize = 0 } = options;

    switch (operation) {
      case 'analyze':
        return this.analyzeChunk(chunk, options);
      case 'transform':
        return this.transformChunk(chunk, options);
      case 'compress':
        return this.compressChunk(chunk, options);
      case 'encrypt':
        return this.encryptChunk(chunk, options);
      default:
        return this.analyzeChunk(chunk, options);
    }
  }

  /**
   * Analyze file chunk for metadata and statistics
   */
  analyzeChunk(chunk, options) {
    const startTime = process.hrtime.bigint();

    // Basic analysis
    const analysis = {
      size: chunk.length,
      position: options.position || 0,
      entropy: this.calculateEntropy(chunk),
      zeros: this.countZeros(chunk),
      patterns: this.detectPatterns(chunk),
      checksum: this.calculateChecksum(chunk)
    };

    // Performance timing
    const endTime = process.hrtime.bigint();
    analysis.processingTime = Number(endTime - startTime) / 1000000; // ms

    this.processedBytes += chunk.length;
    return analysis;
  }

  /**
   * Transform file chunk (example: data normalization)
   */
  transformChunk(chunk, options) {
    const startTime = process.hrtime.bigint();

    // Example transformation: normalize line endings
    let transformed;
    if (options.normalization === 'lines') {
      transformed = chunk.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      transformed = Buffer.from(transformed);
    } else {
      transformed = Buffer.from(chunk);
    }

    const endTime = process.hrtime.bigint();
    const processingTime = Number(endTime - startTime) / 1000000;

    this.processedBytes += chunk.length;

    return {
      transformed,
      originalSize: chunk.length,
      transformedSize: transformed.length,
      processingTime,
      workerId: this.workerId
    };
  }

  /**
   * Simple compression simulation (placeholder for real compression)
   */
  compressChunk(chunk, options) {
    const startTime = process.hrtime.bigint();

    // Simulate compression with a simple algorithm
    // In production, you'd use zlib or other compression libraries
    const compressed = this.simulateCompression(chunk);

    const endTime = process.hrtime.bigint();
    const processingTime = Number(endTime - startTime) / 1000000;

    this.processedBytes += chunk.length;

    return {
      compressed,
      originalSize: chunk.length,
      compressedSize: compressed.length,
      compressionRatio: compressed.length / chunk.length,
      processingTime,
      workerId: this.workerId
    };
  }

  /**
   * Simple encryption simulation (placeholder for real encryption)
   */
  encryptChunk(chunk, options) {
    const startTime = process.hrtime.bigint();

    // Simulate encryption with XOR cipher
    const key = options.key || Buffer.from('default-key-12345');
    const encrypted = Buffer.alloc(chunk.length);

    for (let i = 0; i < chunk.length; i++) {
      encrypted[i] = chunk[i] ^ key[i % key.length];
    }

    const endTime = process.hrtime.bigint();
    const processingTime = Number(endTime - startTime) / 1000000;

    this.processedBytes += chunk.length;

    return {
      encrypted,
      originalSize: chunk.length,
      encryptedSize: encrypted.length,
      processingTime,
      workerId: this.workerId
    };
  }

  /**
   * Calculate Shannon entropy of chunk
   */
  calculateEntropy(chunk) {
    const frequency = new Array(256).fill(0);

    // Count byte frequencies
    for (let i = 0; i < chunk.length; i++) {
      frequency[chunk[i]]++;
    }

    // Calculate entropy
    let entropy = 0;
    const length = chunk.length;

    for (let i = 0; i < 256; i++) {
      if (frequency[i] > 0) {
        const probability = frequency[i] / length;
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  /**
   * Count zero bytes in chunk
   */
  countZeros(chunk) {
    let zeros = 0;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === 0) zeros++;
    }
    return zeros;
  }

  /**
   * Detect common patterns in chunk
   */
  detectPatterns(chunk) {
    const patterns = {
      text: 0,
      binary: 0,
      json: false,
      repeated: 0
    };

    // Detect printable ASCII characters
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] >= 32 && chunk[i] <= 126) {
        patterns.text++;
      } else {
        patterns.binary++;
      }
    }

    // Simple JSON detection
    const chunkStr = chunk.toString('utf8', 0, Math.min(chunk.length, 1000));
    patterns.json = chunkStr.trim().startsWith('{') && chunkStr.includes('"');

    // Detect repeated byte sequences
    let maxRepeat = 1;
    let currentRepeat = 1;
    let lastByte = chunk[0];

    for (let i = 1; i < chunk.length; i++) {
      if (chunk[i] === lastByte) {
        currentRepeat++;
        maxRepeat = Math.max(maxRepeat, currentRepeat);
      } else {
        currentRepeat = 1;
        lastByte = chunk[i];
      }
    }

    patterns.repeated = maxRepeat;

    return patterns;
  }

  /**
   * Calculate simple checksum
   */
  calculateChecksum(chunk) {
    let checksum = 0;
    for (let i = 0; i < chunk.length; i++) {
      checksum = ((checksum << 8) ^ chunk[i]) & 0xFFFFFFFF;
    }
    return checksum;
  }

  /**
   * Simulate compression with RLE (Run-Length Encoding)
   */
  simulateCompression(chunk) {
    const compressed = [];
    let currentByte = chunk[0];
    let count = 1;

    for (let i = 1; i < chunk.length; i++) {
      if (chunk[i] === currentByte && count < 255) {
        count++;
      } else {
        compressed.push(currentByte);
        compressed.push(count);
        currentByte = chunk[i];
        count = 1;
      }
    }

    compressed.push(currentByte);
    compressed.push(count);

    return Buffer.from(compressed);
  }

  /**
   * Get worker performance metrics
   */
  getMetrics() {
    const runtime = (Date.now() - this.startTime) / 1000; // seconds
    const throughput = runtime > 0 ? this.processedBytes / runtime / 1024 / 1024 : 0; // MB/s

    return {
      workerId: this.workerId,
      processedBytes: this.processedBytes,
      runtime: runtime,
      throughput: parseFloat(throughput.toFixed(2))
    };
  }
}

// Worker thread message handler
parentPort.on('message', async (task) => {
  const worker = new FileWorker(workerData?.workerId || 'unknown');

  try {
    const result = await worker.processChunk(task.chunk, task.options);

    parentPort.postMessage({
      jobId: task.jobId,
      success: true,
      data: {
        ...result,
        metrics: worker.getMetrics()
      }
    });

  } catch (error) {
    parentPort.postMessage({
      jobId: task.jobId,
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Handle worker shutdown
process.on('SIGTERM', () => {
  console.log(`Worker ${workerData?.workerId || 'unknown'} shutting down`);
  process.exit(0);
});