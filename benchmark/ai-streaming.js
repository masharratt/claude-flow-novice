#!/usr/bin/env node

/**
 * Test 4: AI SDK Streaming Performance
 *
 * Tests whether Rust offers any advantage for processing streaming AI responses.
 * Measures token processing throughput, memory usage, and latency characteristics.
 *
 * This test helps determine if the AI layer should be in Rust or Node.js.
 *
 * Usage:
 *   node ai-streaming.js [--concurrent 10] [--iterations 5]
 *   node ai-streaming.js --mock  # Use mock responses (no API key required)
 *
 * Requires: ANTHROPIC_API_KEY environment variable (unless --mock is used)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONCURRENT_STREAMS = parseInt(process.argv.find((arg, i) => process.argv[i - 1] === '--concurrent') || '10');
const ITERATIONS = parseInt(process.argv.find((arg, i) => process.argv[i - 1] === '--iterations') || '5');
const USE_MOCK = process.argv.includes('--mock');
const RESULTS_DIR = path.join(__dirname, 'results');

// Statistics
const stats = {
  totalTokens: 0,
  totalRequests: 0,
  totalDuration: 0,
  latencies: [],
  tokenProcessingTimes: [],
  memorySnapshots: [],
  errors: 0
};

console.log('========================================');
console.log('Test 4: AI SDK Streaming Performance');
console.log('========================================');
console.log(`Concurrent Streams: ${CONCURRENT_STREAMS}`);
console.log(`Iterations: ${ITERATIONS}`);
console.log(`Mode: ${USE_MOCK ? 'MOCK' : 'LIVE API'}`);
console.log('========================================\n');

/**
 * Mock streaming response (simulates Anthropic API)
 */
async function* mockStreamResponse() {
  const mockText = "This is a simulated streaming response from Claude. ".repeat(20);
  const words = mockText.split(' ');

  for (const word of words) {
    yield {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: word + ' ' }
    };

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10 + 5));
  }

  yield { type: 'message_stop' };
}

/**
 * Live streaming response (actual Anthropic API)
 */
async function* liveStreamResponse() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable required for live mode');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const stream = await client.messages.create({
    model: 'claude-sonnet-4.5',
    max_tokens: 1024,
    stream: true,
    messages: [{
      role: 'user',
      content: 'Count from 1 to 50 and explain each number briefly.'
    }]
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * Process a streaming response and collect metrics
 */
async function processStream(streamId, iteration) {
  const startTime = Date.now();
  const startMem = process.memoryUsage();

  let tokens = 0;
  let fullText = '';
  const tokenTimes = [];

  try {
    const streamGenerator = USE_MOCK ? mockStreamResponse() : liveStreamResponse();

    for await (const chunk of streamGenerator) {
      const tokenStartTime = Date.now();

      // Process chunk (simulate real work)
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        tokens++;
        fullText += chunk.delta.text;

        // Simulate token processing (parsing, validation, storage)
        const processed = {
          text: chunk.delta.text,
          timestamp: Date.now(),
          streamId,
          iteration,
          tokenIndex: tokens
        };

        // Simulate some CPU work
        JSON.stringify(processed);
      } else if (chunk.type === 'message_stop') {
        break;
      }

      const tokenEndTime = Date.now();
      tokenTimes.push(tokenEndTime - tokenStartTime);
    }

    const endTime = Date.now();
    const endMem = process.memoryUsage();
    const duration = endTime - startTime;

    // Collect statistics
    stats.totalTokens += tokens;
    stats.totalRequests++;
    stats.totalDuration += duration;
    stats.latencies.push(duration);
    stats.tokenProcessingTimes.push(...tokenTimes);
    stats.memorySnapshots.push({
      heapUsed: endMem.heapUsed - startMem.heapUsed,
      external: endMem.external - startMem.external,
      rss: endMem.rss - startMem.rss
    });

    return {
      streamId,
      iteration,
      tokens,
      duration,
      tokensPerSecond: tokens / (duration / 1000),
      avgTokenProcessingTime: tokenTimes.reduce((a, b) => a + b, 0) / tokenTimes.length,
      textLength: fullText.length
    };
  } catch (error) {
    stats.errors++;
    console.error(`Stream ${streamId}-${iteration} error:`, error.message);
    return null;
  }
}

/**
 * Run concurrent streaming requests
 */
async function runConcurrentStreams(iteration) {
  console.log(`\nIteration ${iteration + 1}/${ITERATIONS}:`);
  console.log('Starting concurrent streams...');

  const promises = [];
  for (let i = 0; i < CONCURRENT_STREAMS; i++) {
    promises.push(processStream(i, iteration));
  }

  const results = await Promise.all(promises);
  const successful = results.filter(r => r !== null);

  console.log(`✓ Completed ${successful.length}/${CONCURRENT_STREAMS} streams`);

  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    const avgTokens = successful.reduce((sum, r) => sum + r.tokens, 0) / successful.length;
    const avgTPS = successful.reduce((sum, r) => sum + r.tokensPerSecond, 0) / successful.length;

    console.log(`  Avg Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`  Avg Tokens: ${avgTokens.toFixed(0)}`);
    console.log(`  Avg Throughput: ${avgTPS.toFixed(1)} tokens/sec`);
  }

  // Memory check
  const currentMem = process.memoryUsage();
  console.log(`  Memory: ${(currentMem.heapUsed / 1024 / 1024).toFixed(1)}MB heap`);

  return results;
}

/**
 * Calculate percentile
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}

/**
 * Main test execution
 */
async function main() {
  // Ensure results directory exists
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const testStartTime = Date.now();
  const allResults = [];

  // Run iterations
  for (let i = 0; i < ITERATIONS; i++) {
    const results = await runConcurrentStreams(i);
    allResults.push(...results.filter(r => r !== null));

    // Brief pause between iterations
    if (i < ITERATIONS - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const testEndTime = Date.now();
  const totalTestDuration = testEndTime - testStartTime;

  // Calculate final statistics
  console.log('\n========================================');
  console.log('Final Results');
  console.log('========================================');

  const avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
  const avgTokenProcessing = stats.tokenProcessingTimes.reduce((a, b) => a + b, 0) / stats.tokenProcessingTimes.length;
  const totalTPS = stats.totalTokens / (stats.totalDuration / 1000);

  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Total Tokens Processed: ${stats.totalTokens}`);
  console.log(`Total Errors: ${stats.errors}`);
  console.log(`Total Test Duration: ${(totalTestDuration / 1000).toFixed(1)}s`);
  console.log('');
  console.log('Latency:');
  console.log(`  Average: ${avgLatency.toFixed(0)}ms`);
  console.log(`  P50: ${percentile(stats.latencies, 50).toFixed(0)}ms`);
  console.log(`  P95: ${percentile(stats.latencies, 95).toFixed(0)}ms`);
  console.log(`  P99: ${percentile(stats.latencies, 99).toFixed(0)}ms`);
  console.log('');
  console.log('Token Processing:');
  console.log(`  Avg per token: ${avgTokenProcessing.toFixed(2)}ms`);
  console.log(`  Overall throughput: ${totalTPS.toFixed(1)} tokens/sec`);
  console.log('');
  console.log('Memory:');
  const avgHeapDelta = stats.memorySnapshots.reduce((sum, m) => sum + m.heapUsed, 0) / stats.memorySnapshots.length;
  console.log(`  Avg heap delta per stream: ${(avgHeapDelta / 1024 / 1024).toFixed(2)}MB`);

  // Save detailed results
  const resultsFile = path.join(RESULTS_DIR, 'ai-streaming.json');
  const resultsData = {
    config: {
      concurrent_streams: CONCURRENT_STREAMS,
      iterations: ITERATIONS,
      mode: USE_MOCK ? 'mock' : 'live',
      timestamp: new Date().toISOString()
    },
    summary: {
      total_requests: stats.totalRequests,
      total_tokens: stats.totalTokens,
      total_errors: stats.errors,
      total_duration_ms: totalTestDuration,
      avg_latency_ms: avgLatency,
      latency_p50_ms: percentile(stats.latencies, 50),
      latency_p95_ms: percentile(stats.latencies, 95),
      latency_p99_ms: percentile(stats.latencies, 99),
      avg_token_processing_ms: avgTokenProcessing,
      overall_throughput_tps: totalTPS,
      avg_heap_delta_mb: avgHeapDelta / 1024 / 1024
    },
    individual_results: allResults
  };

  fs.writeFileSync(resultsFile, JSON.stringify(resultsData, null, 2));

  console.log('');
  console.log(`Results saved to: ${resultsFile}`);

  // Interpretation
  console.log('\n========================================');
  console.log('Interpretation');
  console.log('========================================');

  if (avgTokenProcessing < 1) {
    console.log('✓ Token processing is CPU-efficient (<1ms per token)');
    console.log('  → Rust unlikely to provide significant benefit');
  } else if (avgTokenProcessing < 5) {
    console.log('○ Token processing is moderate (1-5ms per token)');
    console.log('  → Rust could provide 2-3x speedup');
  } else {
    console.log('! Token processing is slow (>5ms per token)');
    console.log('  → Consider Rust for token processing layer');
  }

  const p95Latency = percentile(stats.latencies, 95);
  if (p95Latency > 5000) {
    console.log('\n! Network latency dominates (P95 > 5s)');
    console.log('  → Rust provides no benefit (network-bound)');
  } else {
    console.log('\n✓ Low network latency (P95 < 5s)');
    console.log('  → CPU optimizations could help');
  }

  console.log('\n========================================\n');
}

// Run the test
main().catch(console.error);
