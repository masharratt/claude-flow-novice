# LRU Garbage Collection for Sprint Results

## Overview

The PhaseOrchestrator now implements LRU (Least Recently Used) cache-based garbage collection for sprint results to prevent unbounded memory growth during long-running multi-phase executions.

## Implementation Details

### LRU Cache Configuration

```typescript
private globalSprintResults: LRUCache<string, any>;

// Initialization
this.globalSprintResults = new LRUCache<string, any>({
  max: 500,                     // Max 500 sprint results in memory
  ttl: 1000 * 60 * 60,         // 1 hour TTL
  updateAgeOnGet: true,        // Refresh TTL on access
  dispose: (value, key) => {   // Auto-archive on eviction
    this.archiveSprintResult(key, value);
  }
});
```

### Key Features

1. **Automatic Eviction**: Oldest entries are automatically removed when cache size exceeds 500
2. **TTL-Based Expiration**: Entries older than 1 hour are automatically evicted
3. **Access-Based Refresh**: Accessing an entry refreshes its TTL
4. **Archiving**: Evicted entries are archived to persistent storage (if enabled)
5. **Manual Cleanup**: Completed phases can trigger immediate cleanup

### Memory Archiving

When memory manager is enabled, evicted sprint results are automatically archived:

```typescript
private async archiveSprintResult(key: string, result: any): Promise<void> {
  if (this.memoryManager) {
    await this.memoryManager.store(`archived/${key}`, JSON.stringify(result));
  }
}
```

### Manual Cleanup API

```typescript
// Cleanup all sprint results for a completed phase
await orchestrator.cleanupCompletedPhase('phase-1');

// This removes entries like:
// - phase-1/sprint-1.1
// - phase-1/sprint-1.2
// - phase-1/sprint-1.3
// ...and archives them before deletion
```

### Monitoring API

```typescript
// Get current memory statistics
const memStats = orchestrator.getMemoryStats();

console.log(memStats);
// {
//   size: 150,              // Current number of entries
//   maxSize: 500,           // Maximum allowed entries
//   ttl: 3600000,          // TTL in milliseconds (1 hour)
//   evictions: 42          // Number of evictions that occurred
// }

// Memory stats are also included in orchestrator statistics
const stats = orchestrator.getStatistics();
console.log(stats.memoryStats);
// {
//   sprintCacheSize: 150,
//   sprintCacheMaxSize: 500,
//   sprintCacheTTL: 3600000,
//   sprintCacheEvictions: 42
// }
```

## Usage Patterns

### Automatic Phase Cleanup

Phase cleanup is automatically triggered after successful phase completion:

```typescript
private async executePhaseWithRetry(phase: Phase, initialTask: string) {
  // ... execute phase ...

  if (validationPassed) {
    // Cleanup sprint results for completed phase
    await this.cleanupCompletedPhase(phase.id);

    // Log memory stats after cleanup
    const memStats = this.getMemoryStats();
    this.logger.info('Memory stats after phase cleanup', {
      phaseId: phase.id,
      cacheSize: memStats.size,
      maxSize: memStats.maxSize,
    });
  }
}
```

### Manual Cleanup Strategy

For long-running epics, you can implement custom cleanup strategies:

```typescript
// Cleanup after every 3 phases
if (completedPhases.size % 3 === 0) {
  for (const phaseId of completedPhases) {
    await orchestrator.cleanupCompletedPhase(phaseId);
  }
}

// Or cleanup based on memory pressure
const memStats = orchestrator.getMemoryStats();
if (memStats.size > memStats.maxSize * 0.8) {
  // Cleanup oldest completed phases
  await cleanupOldestPhases();
}
```

## Memory Impact

### Before (Unbounded Map)

```typescript
private globalSprintResults = new Map<string, any>();

// Memory usage grows indefinitely:
// 100 phases × 10 sprints/phase × 50KB/sprint = 50MB+
// No automatic cleanup, no TTL, no eviction
```

### After (LRU Cache)

```typescript
private globalSprintResults = new LRUCache<string, any>({ max: 500, ttl: 3600000 });

// Memory usage capped:
// Max 500 entries × ~50KB/entry = ~25MB max
// Automatic eviction, TTL-based cleanup, archiving support
```

## Configuration Options

### Customizing Cache Size

```typescript
const orchestrator = new PhaseOrchestrator({
  phases: [...],
  // Custom cache configuration would go in future version
  sprintCacheSize: 1000,     // Increase to 1000 entries (future enhancement)
  sprintCacheTTL: 7200000,   // 2 hours TTL (future enhancement)
});
```

### Disabling Memory Persistence

```typescript
const orchestrator = new PhaseOrchestrator({
  phases: [...],
  enableMemoryPersistence: false,  // Disable archiving
});
```

## Testing

Comprehensive tests validate:

1. ✅ LRU cache initialization with correct configuration
2. ✅ Sprint result storage and retrieval
3. ✅ Phase cleanup removes all related sprint results
4. ✅ Max size limit enforced (automatic eviction)
5. ✅ TTL refresh on access
6. ✅ Memory stats integration
7. ✅ Graceful handling of non-existent phases
8. ✅ Multiple sprints cleanup for same phase
9. ✅ Archiving without memory manager
10. ✅ Eviction tracking

Run tests:

```bash
node tests/unit/cfn-loop/lru-gc-manual-test.js
```

## Performance Benefits

### Memory Footprint

- **Before**: Unbounded growth (50MB+ for large epics)
- **After**: Capped at ~25MB (500 entries × 50KB)
- **Reduction**: 50%+ memory savings for long-running epics

### Cleanup Performance

- **Automatic Eviction**: O(1) amortized per operation
- **Manual Cleanup**: O(n) where n = sprints per phase (~10)
- **Archiving**: Async, non-blocking

### Access Performance

- **Get**: O(1) average case
- **Set**: O(1) average case
- **TTL Refresh**: O(1) per access

## Integration with CFN Loop

The LRU garbage collection integrates seamlessly with the CFN Loop structure:

```
Epic (Loop 0)
└── Phase (Loop 1)
    └── Sprint (Loop 2)
        └── CFN Loop (Loop 3)
            ├── Primary Swarm
            ├── Self-Assessment Gate
            └── Consensus Swarm
```

After each phase completes:
1. Sprint results stored in LRU cache
2. Phase validation passes
3. **Automatic cleanup triggered**
4. Sprint results archived
5. Memory freed for next phase

## Future Enhancements

1. **Configurable Cache Size**: Allow custom max size per orchestrator instance
2. **Adaptive TTL**: Adjust TTL based on epic complexity
3. **Compression**: Compress archived results to reduce storage
4. **Tiered Storage**: Hot cache (LRU) + cold storage (disk)
5. **Metrics Dashboard**: Real-time memory usage visualization

## Related Files

- `src/cfn-loop/phase-orchestrator.ts` - Main implementation
- `tests/unit/cfn-loop/lru-garbage-collection.test.ts` - Jest tests
- `tests/unit/cfn-loop/lru-gc-manual-test.js` - Manual Node.js test

## Dependencies

- `lru-cache` v11.2.2+ - LRU cache implementation with TTL support
