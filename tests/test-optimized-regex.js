/**
 * Test script for optimized regex engine
 */

import WASMRuntime from './src/booster/wasm-runtime.js';

async function testOptimizedRegex() {
  console.log('🧪 Testing Optimized Regex Engine\n');
  
  const runtime = new WASMRuntime();
  await runtime.initialize();
  
  // Test content (realistic size)
  const testContent = `
    function authenticate(password) {
      eval(userInput);  // Security issue
      const api_key = "sk-1234567890";  // Secret leak
      const token = localStorage.getItem("token");
      console.log("Debug info");
      // TODO: Fix this later
    }
  `.repeat(50);
  
  console.log('📝 Test Content Size:', testContent.length, 'bytes\n');
  
  // Security patterns
  const securityPatterns = [
    /eval\s*\(/gi,
    /exec\s*\(/gi,
    /password\s*=/gi,
    /api[_-]?key/gi,
    /token/gi,
    /console\./gi
  ];
  
  // Test 1: First run (cache miss)
  console.log('🔍 Test 1: First Run (Cache Miss)');
  const start1 = performance.now();
  const result1 = await runtime.acceleratedRegexMatch(testContent, securityPatterns);
  const time1 = performance.now() - start1;
  
  console.log('  ⏱️  Time:', time1.toFixed(3), 'ms');
  console.log('  🎯 Matches:', result1.totalMatches);
  console.log('  📦 From Cache:', result1.fromCache);
  console.log('  🚀 Speedup:', result1.speedup.toFixed(2), 'x\n');
  
  // Test 2: Second run (cache hit)
  console.log('🔍 Test 2: Second Run (Cache Hit)');
  const start2 = performance.now();
  const result2 = await runtime.acceleratedRegexMatch(testContent, securityPatterns);
  const time2 = performance.now() - start2;
  
  console.log('  ⏱️  Time:', time2.toFixed(3), 'ms');
  console.log('  🎯 Matches:', result2.totalMatches);
  console.log('  📦 From Cache:', result2.fromCache);
  console.log('  🚀 Cache Speedup:', (time1 / time2).toFixed(2), 'x faster than first run\n');
  
  // Test 3: Different content (cache miss)
  const differentContent = testContent + ' extra content to change hash';
  console.log('🔍 Test 3: Different Content (Cache Miss)');
  const start3 = performance.now();
  const result3 = await runtime.acceleratedRegexMatch(differentContent, securityPatterns);
  const time3 = performance.now() - start3;
  
  console.log('  ⏱️  Time:', time3.toFixed(3), 'ms');
  console.log('  🎯 Matches:', result3.totalMatches);
  console.log('  📦 From Cache:', result3.fromCache, '\n');
  
  // Metrics
  console.log('📊 Final Metrics:');
  const metrics = runtime.getMetrics();
  console.log('  Engine:', metrics.engine);
  console.log('  Total Executions:', metrics.totalExecutions);
  console.log('  Cache Hit Rate:', metrics.cacheHitRate);
  console.log('  Patterns Cached:', metrics.patternsCached);
  console.log('  Performance Multiplier:', metrics.performanceMultiplier);
  console.log('  Average Execution Time:', metrics.averageExecutionTime, '\n');
  
  // Validate performance
  const SUCCESS_THRESHOLD_MS = 50; // Should be sub-50ms for this workload
  const success = time1 < SUCCESS_THRESHOLD_MS && time2 < time1 * 0.5;
  
  console.log('✅ Performance Validation:', success ? 'PASSED' : 'FAILED');
  console.log('   First run:', time1.toFixed(3), 'ms (target: <', SUCCESS_THRESHOLD_MS, 'ms)');
  console.log('   Cache speedup:', (time1 / time2).toFixed(2), 'x (target: >2x)\n');
  
  return success;
}

// Run test
testOptimizedRegex()
  .then(success => {
    console.log('🏁 Test Complete:', success ? 'SUCCESS ✅' : 'FAILURE ❌');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test Error:', error);
    process.exit(1);
  });
