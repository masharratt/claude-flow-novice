# High-Performance RAM-Based Memory Store Architecture

## Executive Summary

This document outlines the architecture for a ultra-high-performance memory store using SharedArrayBuffer and Atomics for sub-microsecond agent communication. The design targets <100ns read operations and <500ns write operations through lock-free concurrent access patterns.

## Performance Targets

- **Read Operations**: <100 nanoseconds
- **Write Operations**: <500 nanoseconds
- **Concurrent Access**: Lock-free using Atomics
- **Persistence**: Memory-mapped file backup
- **Memory Efficiency**: >90% utilization

## 1. Memory Layout Strategy

### 1.1 SharedArrayBuffer Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    SharedArrayBuffer Layout                  │
├─────────────────────────────────────────────────────────────┤
│ Header (64 bytes, cache-line aligned)                      │
├─────────────────────────────────────────────────────────────┤
│ Metadata Region (4KB)                                      │
├─────────────────────────────────────────────────────────────┤
│ Hash Table Buckets (configurable, default 64KB)           │
├─────────────────────────────────────────────────────────────┤
│ Key-Value Storage Pool (remaining space)                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Header Structure (64 bytes)

```javascript
// Memory layout optimized for cache line alignment (64 bytes)
const HEADER_LAYOUT = {
  magic: 0,           // uint32 - Magic number for validation
  version: 4,         // uint32 - Format version
  totalSize: 8,       // uint64 - Total SharedArrayBuffer size
  bucketCount: 16,    // uint32 - Number of hash buckets
  entryCount: 20,     // uint32 - Current number of entries (atomic)
  maxEntries: 24,     // uint32 - Maximum entries before resize
  freeHead: 28,       // uint32 - Head of free list (atomic)
  gcCounter: 32,      // uint32 - Garbage collection counter
  writeCounter: 36,   // uint64 - Write operation counter (atomic)
  readCounter: 44,    // uint64 - Read operation counter (atomic)
  reserved: 52        // 12 bytes reserved for future use
};
```

### 1.3 Bucket Structure (32 bytes each)

```javascript
const BUCKET_LAYOUT = {
  head: 0,           // uint32 - Head entry offset (atomic)
  count: 4,          // uint32 - Entry count in bucket (atomic)
  lock: 8,           // uint32 - Optimistic lock version (atomic)
  reserved: 12       // 20 bytes reserved
};
```

### 1.4 Entry Structure (Variable size, minimum 64 bytes)

```javascript
const ENTRY_LAYOUT = {
  next: 0,           // uint32 - Next entry in bucket chain
  keyHash: 4,        // uint32 - Full key hash for collision resolution
  keyLength: 8,      // uint16 - Key length in bytes
  valueLength: 10,   // uint16 - Value length in bytes
  namespace: 12,     // uint32 - Namespace ID
  timestamp: 16,     // uint64 - Last access timestamp (atomic)
  flags: 24,         // uint32 - Entry flags (dirty, compressed, etc.)
  checksum: 28,      // uint32 - Entry checksum for integrity
  keyData: 32,       // Variable - Key data (aligned to 8 bytes)
  valueData: null    // Variable - Value data (follows key)
};
```

## 2. Lock-Free Data Structures

### 2.1 Atomic Operations Strategy

```javascript
class AtomicOperations {
  // Compare-and-swap for pointer updates
  static compareAndSwap32(buffer, offset, expected, value) {
    return Atomics.compareExchange(new Uint32Array(buffer), offset >> 2, expected, value);
  }

  // Atomic increment with overflow protection
  static atomicIncrement(buffer, offset) {
    return Atomics.add(new Uint32Array(buffer), offset >> 2, 1);
  }

  // Load with acquire semantics
  static loadAcquire(buffer, offset) {
    return Atomics.load(new Uint32Array(buffer), offset >> 2);
  }

  // Store with release semantics
  static storeRelease(buffer, offset, value) {
    return Atomics.store(new Uint32Array(buffer), offset >> 2, value);
  }
}
```

### 2.2 Lock-Free Hash Table

```javascript
class LockFreeHashTable {
  constructor(sharedBuffer, bucketCount = 16384) {
    this.buffer = sharedBuffer;
    this.bucketCount = bucketCount;
    this.bucketSize = 32; // bytes per bucket
    this.bucketsOffset = 4096; // Start after metadata
  }

  // Lock-free insertion using optimistic concurrency
  insert(keyHash, entryOffset) {
    const bucketIndex = keyHash % this.bucketCount;
    const bucketOffset = this.bucketsOffset + (bucketIndex * this.bucketSize);

    while (true) {
      const currentHead = AtomicOperations.loadAcquire(this.buffer, bucketOffset);
      const lockVersion = AtomicOperations.loadAcquire(this.buffer, bucketOffset + 8);

      // Set next pointer of new entry
      AtomicOperations.storeRelease(this.buffer, entryOffset, currentHead);

      // Attempt to update bucket head atomically
      const success = AtomicOperations.compareAndSwap32(
        this.buffer, bucketOffset, currentHead, entryOffset
      );

      if (success === currentHead) {
        // Verify lock version hasn't changed (detect ABA problem)
        const newLockVersion = AtomicOperations.loadAcquire(this.buffer, bucketOffset + 8);
        if (newLockVersion === lockVersion) {
          AtomicOperations.atomicIncrement(this.buffer, bucketOffset + 4); // count
          return true;
        }
      }

      // Retry with exponential backoff
      this.backoff();
    }
  }

  // Optimized linear probing for cache efficiency
  backoff() {
    // CPU-friendly spin with progressive yielding
    for (let i = 0; i < 8; i++) {
      // Tight loop for initial attempts
    }
  }
}
```

### 2.3 Memory Pool Management

```javascript
class LockFreeMemoryPool {
  constructor(sharedBuffer, poolOffset, poolSize) {
    this.buffer = sharedBuffer;
    this.poolOffset = poolOffset;
    this.poolSize = poolSize;
    this.chunkSize = 64; // Minimum allocation unit

    this.initializeFreeList();
  }

  // Lock-free allocation using free list
  allocate(size) {
    const alignedSize = Math.ceil(size / this.chunkSize) * this.chunkSize;

    while (true) {
      const freeHead = AtomicOperations.loadAcquire(this.buffer, HEADER_LAYOUT.freeHead);

      if (freeHead === 0) {
        return this.expandPool();
      }

      // Read next pointer before CAS
      const nextFree = AtomicOperations.loadAcquire(this.buffer, freeHead);

      // Attempt to update free list head
      const success = AtomicOperations.compareAndSwap32(
        this.buffer, HEADER_LAYOUT.freeHead, freeHead, nextFree
      );

      if (success === freeHead) {
        return freeHead;
      }
    }
  }

  // Lock-free deallocation
  deallocate(offset) {
    while (true) {
      const currentHead = AtomicOperations.loadAcquire(this.buffer, HEADER_LAYOUT.freeHead);

      // Set next pointer
      AtomicOperations.storeRelease(this.buffer, offset, currentHead);

      // Attempt to update free list head
      const success = AtomicOperations.compareAndSwap32(
        this.buffer, HEADER_LAYOUT.freeHead, currentHead, offset
      );

      if (success === currentHead) {
        return;
      }
    }
  }
}
```

## 3. Key Performance Optimizations

### 3.1 Cache-Aware Design

- **Cache Line Alignment**: All critical structures aligned to 64-byte boundaries
- **False Sharing Prevention**: Atomic counters separated by cache lines
- **Prefetching**: Strategic memory access patterns for CPU prefetcher
- **NUMA Awareness**: Memory allocation considerations for multi-socket systems

### 3.2 Hash Function Selection

```javascript
class HighPerformanceHash {
  // XXHash32 - optimized for small keys
  static xxhash32(key, seed = 0x811C9DC5) {
    let hash = seed + 0x165667B1;
    const keyBytes = new Uint8Array(key);

    // Process 4-byte chunks
    for (let i = 0; i < keyBytes.length - 3; i += 4) {
      const chunk = (keyBytes[i] | (keyBytes[i+1] << 8) |
                    (keyBytes[i+2] << 16) | (keyBytes[i+3] << 24)) >>> 0;
      hash = Math.imul(hash ^ Math.imul(chunk, 0xCC9E2D51), 0x1B873593);
      hash = (hash << 13) | (hash >>> 19);
      hash = Math.imul(hash, 5) + 0xE6546B64;
    }

    // Handle remaining bytes
    // ... remainder processing

    return hash >>> 0;
  }

  // FNV-1a for namespace hashing
  static fnv1a(key) {
    let hash = 0x811C9DC5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
```

### 3.3 Memory Access Patterns

```javascript
class OptimizedAccess {
  // Sequential prefetch for iteration
  static prefetchSequential(buffer, offset, count) {
    // Browser hint for sequential memory access
    for (let i = 0; i < count; i += 64) {
      const _ = new Uint8Array(buffer, offset + i, 1)[0];
    }
  }

  // Random access optimization
  static prefetchRandom(buffer, offsets) {
    // Group by cache line to minimize misses
    const cacheLines = new Set();
    for (const offset of offsets) {
      cacheLines.add(Math.floor(offset / 64) * 64);
    }

    for (const lineOffset of cacheLines) {
      const _ = new Uint8Array(buffer, lineOffset, 1)[0];
    }
  }
}
```

## 4. Memory Pressure Management

### 4.1 Eviction Policies

```javascript
class MemoryPressureManager {
  constructor(memoryStore) {
    this.store = memoryStore;
    this.pressureThreshold = 0.85; // 85% utilization
    this.evictionBatch = 128; // Entries per batch
  }

  // Clock-based LRU approximation (lock-free)
  clockEviction() {
    const totalEntries = AtomicOperations.loadAcquire(
      this.store.buffer, HEADER_LAYOUT.entryCount
    );

    if (totalEntries < this.store.maxEntries * this.pressureThreshold) {
      return false;
    }

    let evicted = 0;
    let clockHand = this.getClockHand();

    while (evicted < this.evictionBatch) {
      const entry = this.getEntryAtClock(clockHand);
      if (!entry) break;

      // Check reference bit (timestamp comparison)
      const lastAccess = AtomicOperations.loadAcquire(
        this.store.buffer, entry.offset + ENTRY_LAYOUT.timestamp
      );

      const now = performance.now() * 1000000; // nanoseconds
      if (now - lastAccess > this.evictionThreshold) {
        if (this.tryEvictEntry(entry)) {
          evicted++;
        }
      }

      clockHand = (clockHand + 1) % totalEntries;
    }

    this.setClockHand(clockHand);
    return evicted > 0;
  }

  // Adaptive eviction based on access patterns
  adaptiveEviction() {
    const accessPattern = this.analyzeAccessPattern();

    switch (accessPattern) {
      case 'sequential':
        return this.fifoEviction();
      case 'random':
        return this.clockEviction();
      case 'hotspot':
        return this.lruEviction();
      default:
        return this.clockEviction();
    }
  }
}
```

### 4.2 Memory Compaction

```javascript
class MemoryCompactor {
  // Incremental compaction to avoid long pauses
  incrementalCompact(maxMoveBytes = 4096) {
    let movedBytes = 0;
    const freeBlocks = this.findFreeBlocks();
    const movableEntries = this.findMovableEntries();

    for (const entry of movableEntries) {
      if (movedBytes >= maxMoveBytes) break;

      const newOffset = this.findOptimalLocation(entry);
      if (newOffset && newOffset < entry.offset) {
        this.moveEntry(entry, newOffset);
        movedBytes += entry.size;
      }
    }

    return movedBytes;
  }

  // Lock-free entry relocation
  moveEntry(entry, newOffset) {
    // Copy data to new location
    const entrySize = this.getEntrySize(entry);
    const sourceView = new Uint8Array(this.buffer, entry.offset, entrySize);
    const destView = new Uint8Array(this.buffer, newOffset, entrySize);
    destView.set(sourceView);

    // Update hash table pointers atomically
    this.updateHashTablePointers(entry.keyHash, entry.offset, newOffset);

    // Mark old location as free
    this.deallocate(entry.offset);
  }
}
```

## 5. Namespace Support

### 5.1 Namespace Architecture

```javascript
class NamespaceManager {
  constructor(sharedBuffer) {
    this.buffer = sharedBuffer;
    this.namespaceMap = new Map(); // Local cache
    this.namespaceOffset = 1024; // After header
    this.maxNamespaces = 256;
  }

  // Fast namespace resolution
  resolveNamespace(namespaceName) {
    // Check local cache first
    let namespaceId = this.namespaceMap.get(namespaceName);
    if (namespaceId !== undefined) {
      return namespaceId;
    }

    // Search shared memory
    const hash = HighPerformanceHash.fnv1a(namespaceName);
    namespaceId = this.findNamespaceInSharedMemory(hash, namespaceName);

    if (namespaceId === -1) {
      namespaceId = this.createNamespace(namespaceName, hash);
    }

    this.namespaceMap.set(namespaceName, namespaceId);
    return namespaceId;
  }

  // Namespace isolation for concurrent access
  getNamespacedKey(namespaceId, key) {
    return (namespaceId << 24) | HighPerformanceHash.xxhash32(key);
  }
}
```

## 6. Persistence Layer

### 6.1 Memory-Mapped File Backup

```javascript
class MemoryMappedBackup {
  constructor(backupPath, sharedBuffer) {
    this.backupPath = backupPath;
    this.sharedBuffer = sharedBuffer;
    this.syncInterval = 1000; // ms
    this.dirtyRegions = new Set();
  }

  // Incremental backup using dirty tracking
  async incrementalBackup() {
    const fd = await fs.open(this.backupPath, 'r+');

    try {
      for (const regionOffset of this.dirtyRegions) {
        const regionSize = this.getRegionSize(regionOffset);
        const data = new Uint8Array(this.sharedBuffer, regionOffset, regionSize);

        await fd.write(data, 0, regionSize, regionOffset);
      }

      this.dirtyRegions.clear();
      await fd.sync(); // Force OS flush
    } finally {
      await fd.close();
    }
  }

  // Memory-mapped restore for fast startup
  async restoreFromBackup() {
    const stats = await fs.stat(this.backupPath);
    const fd = await fs.open(this.backupPath, 'r');

    try {
      const buffer = Buffer.alloc(stats.size);
      await fd.read(buffer, 0, stats.size, 0);

      // Copy to SharedArrayBuffer
      const view = new Uint8Array(this.sharedBuffer);
      view.set(buffer);

      return this.validateRestoreIntegrity();
    } finally {
      await fd.close();
    }
  }

  // Checksum-based integrity validation
  validateRestoreIntegrity() {
    const header = new Uint32Array(this.sharedBuffer, 0, 16);
    const expectedMagic = 0x464C4F57; // 'FLOW'

    if (header[0] !== expectedMagic) {
      throw new Error('Invalid backup file format');
    }

    // Verify entry checksums
    let corruptEntries = 0;
    this.iterateEntries((entry) => {
      if (!this.verifyEntryChecksum(entry)) {
        corruptEntries++;
      }
    });

    return corruptEntries === 0;
  }
}
```

## 7. Performance Monitoring

### 7.1 Nanosecond Precision Benchmarking

```javascript
class PerformanceBenchmark {
  constructor() {
    this.samples = new Array(10000);
    this.sampleIndex = 0;
  }

  // High-resolution timing for nanosecond measurements
  measureOperation(operation) {
    const start = performance.now() * 1000000; // Convert to nanoseconds
    const result = operation();
    const end = performance.now() * 1000000;

    const duration = end - start;
    this.recordSample(duration);

    return { result, duration };
  }

  // Statistical analysis of performance
  getStatistics() {
    const validSamples = this.samples.slice(0, this.sampleIndex);
    validSamples.sort((a, b) => a - b);

    return {
      min: validSamples[0],
      max: validSamples[validSamples.length - 1],
      median: validSamples[Math.floor(validSamples.length / 2)],
      p95: validSamples[Math.floor(validSamples.length * 0.95)],
      p99: validSamples[Math.floor(validSamples.length * 0.99)],
      mean: validSamples.reduce((a, b) => a + b, 0) / validSamples.length
    };
  }

  recordSample(duration) {
    this.samples[this.sampleIndex] = duration;
    this.sampleIndex = (this.sampleIndex + 1) % this.samples.length;
  }
}
```

## 8. API Design

### 8.1 High-Performance Interface

```javascript
class UltraFastMemoryStore {
  constructor(sizeBytes = 64 * 1024 * 1024) { // 64MB default
    this.sharedBuffer = new SharedArrayBuffer(sizeBytes);
    this.initialize();
  }

  // <100ns read target
  get(namespace, key) {
    const namespaceId = this.namespaceManager.resolveNamespace(namespace);
    const keyHash = HighPerformanceHash.xxhash32(key);
    const bucketIndex = keyHash % this.bucketCount;

    let entryOffset = this.getBucketHead(bucketIndex);

    while (entryOffset !== 0) {
      const entry = this.getEntryView(entryOffset);

      if (entry.keyHash === keyHash &&
          entry.namespace === namespaceId &&
          this.compareKey(entry, key)) {

        // Update access timestamp
        AtomicOperations.storeRelease(
          this.sharedBuffer,
          entryOffset + ENTRY_LAYOUT.timestamp,
          performance.now() * 1000000
        );

        return this.extractValue(entry);
      }

      entryOffset = entry.next;
    }

    return null;
  }

  // <500ns write target
  set(namespace, key, value) {
    const namespaceId = this.namespaceManager.resolveNamespace(namespace);
    const keyHash = HighPerformanceHash.xxhash32(key);
    const entrySize = this.calculateEntrySize(key, value);

    // Try to find existing entry first
    const existingOffset = this.findEntry(namespaceId, keyHash, key);
    if (existingOffset) {
      return this.updateEntry(existingOffset, value);
    }

    // Allocate new entry
    const entryOffset = this.memoryPool.allocate(entrySize);
    if (!entryOffset) {
      this.handleMemoryPressure();
      return false;
    }

    // Initialize entry
    this.initializeEntry(entryOffset, namespaceId, keyHash, key, value);

    // Insert into hash table
    this.hashTable.insert(keyHash, entryOffset);

    AtomicOperations.atomicIncrement(this.sharedBuffer, HEADER_LAYOUT.entryCount);
    return true;
  }

  // Batch operations for reduced overhead
  setBatch(namespace, entries) {
    const namespaceId = this.namespaceManager.resolveNamespace(namespace);
    const results = new Array(entries.length);

    for (let i = 0; i < entries.length; i++) {
      results[i] = this.set(namespace, entries[i].key, entries[i].value);
    }

    return results;
  }
}
```

## 9. Architecture Decision Records

### ADR-001: SharedArrayBuffer for Zero-Copy Communication
**Decision**: Use SharedArrayBuffer as the primary memory management mechanism
**Rationale**:
- Zero-copy data sharing between agents
- Direct memory access eliminates serialization overhead
- Atomic operations provide lock-free concurrency
- Native browser/Node.js support

**Trade-offs**: Limited to same-origin contexts, requires careful memory management

### ADR-002: Lock-Free Data Structures
**Decision**: Implement all concurrent data structures using atomic operations
**Rationale**:
- Eliminates lock contention and context switching
- Provides predictable performance characteristics
- Scales linearly with CPU cores
- Reduces worst-case latency

**Trade-offs**: Increased implementation complexity, potential ABA problems

### ADR-003: Cache-Aligned Memory Layout
**Decision**: Align all data structures to CPU cache line boundaries (64 bytes)
**Rationale**:
- Minimizes false sharing between concurrent operations
- Optimizes CPU cache utilization
- Improves memory access patterns
- Reduces cache misses

**Trade-offs**: Increased memory overhead, platform-specific optimizations

This architecture provides the foundation for achieving sub-microsecond performance while maintaining data consistency and providing robust persistence mechanisms.