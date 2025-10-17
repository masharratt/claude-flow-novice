# Memory Profiling Guide for Claude Flow Novice

## Introduction
This guide provides comprehensive instructions for detecting and mitigating memory leaks in event-driven, real-time communication systems.

## Prerequisites
- Node.js v18+ with `--inspect` flag support
- Chrome DevTools or Chrome Browser
- VSCode with Node.js debugging extension

## Memory Profiling Techniques

### 1. Node.js Heap Snapshot
```bash
# Start application with inspector
node --inspect-brk src/web/dashboard/realtime/server.js

# Capture heap snapshots
chrome://inspect
# Or use Chrome DevTools Memory tab
```

### 2. Chrome DevTools Profiling
1. Open Chrome DevTools (F12)
2. Go to Memory Tab
3. Select profiling type:
   - Heap snapshot
   - Allocation timeline
   - Allocation sampling

### 3. Node.js Memory Diagnostics
```javascript
// Diagnostic code for memory tracking
const v8 = require('v8');

function logMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    console.log('Memory Usage:', {
        rss: `${memoryUsage.rss / 1024 / 1024} MB`,
        heapTotal: `${memoryUsage.heapTotal / 1024 / 1024} MB`,
        heapUsed: `${memoryUsage.heapUsed / 1024 / 1024} MB`,
        external: `${memoryUsage.external / 1024 / 1024} MB`
    });

    // Optional: Heap statistics
    const heapStats = v8.getHeapStatistics();
    console.log('V8 Heap Statistics:', {
        total_heap_size: `${heapStats.total_heap_size / 1024 / 1024} MB`,
        used_heap_size: `${heapStats.used_heap_size / 1024 / 1024} MB`
    });
}

// Log every minute
setInterval(logMemoryUsage, 60000);
```

## Memory Leak Detection Patterns

### Common Anti-Patterns
1. Unbounded Event Listener Growth
2. Accumulating Large Arrays
3. Closure-based Memory Retention
4. Uncleared Intervals/Timeouts
5. WebSocket Connection Leaks

### Leak Detection Checklist
- [ ] Review all `setInterval()` calls
- [ ] Check WebSocket connection management
- [ ] Validate event listener cleanup
- [ ] Monitor state array growth
- [ ] Implement max connection limits

## Recommended Practices
1. Use `useCallback` with proper dependencies
2. Implement bounded collections
3. Always remove event listeners
4. Use weak references when possible
5. Leverage React's cleanup mechanisms

## Performance Monitoring Tools
- Chrome DevTools Memory
- Node.js `--prof` flag
- `heapdump` npm package
- `clinic.js` performance toolkit

## Debugging Command
```bash
# Comprehensive memory profiling
node --inspect-brk --trace-gc src/web/dashboard/realtime/server.js
```

## Emergency Memory Mitigation
```typescript
// Implement circuit breaker for memory protection
class MemoryCircuitBreaker {
    private static MAX_MEMORY_THRESHOLD = 1024 * 1024 * 500; // 500 MB

    static check() {
        const memoryUsage = process.memoryUsage().rss;
        if (memoryUsage > this.MAX_MEMORY_THRESHOLD) {
            console.error('CRITICAL: Memory threshold exceeded. Initiating emergency cleanup.');
            this.emergencyCleanup();
        }
    }

    private static emergencyCleanup() {
        // Aggressive cleanup strategies
        global.gc?.(); // Force garbage collection
        process.exit(1); // Restart process
    }
}

// Use in application startup
setInterval(MemoryCircuitBreaker.check, 60000);
```

## Learning Resources
- [V8 Memory Management](https://v8.dev/blog/trash-talk)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [Chrome DevTools Memory Analysis](https://developers.google.com/web/tools/chrome-devtools/memory-problems)
