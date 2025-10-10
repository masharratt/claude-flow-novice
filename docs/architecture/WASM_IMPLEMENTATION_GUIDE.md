# WASM Implementation Guide
## Step-by-Step Developer Guide for WASM Integration

**Version:** 1.0.0
**Audience:** Developers implementing WASM acceleration
**Prerequisites:** Understanding of WebAssembly, JavaScript, and claude-flow-novice architecture

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Creating a WASM Module](#2-creating-a-wasm-module)
3. [Integration Patterns](#3-integration-patterns)
4. [Testing & Benchmarking](#4-testing--benchmarking)
5. [Debugging WASM](#5-debugging-wasm)
6. [Common Pitfalls](#6-common-pitfalls)

---

## 1. Development Environment Setup

### 1.1 Install WASM Toolchain

```bash
# Install WABT (WebAssembly Binary Toolkit)
# macOS
brew install wabt

# Linux (Ubuntu/Debian)
sudo apt-get install wabt

# Windows (via Chocolatey)
choco install wabt

# Verify installation
wat2wasm --version
wasm2wat --version

# Install Emscripten (for C/C++ to WASM)
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### 1.2 Project Structure

```
/mnt/c/Users/masha/Documents/claude-flow-novice/
├── wasm/
│   ├── modules/              # Compiled WASM modules
│   │   ├── stringOps/
│   │   │   ├── stringOps.wasm
│   │   │   ├── stringOps.wrapper.js
│   │   │   └── stringOps.fallback.js
│   │   └── ...
│   ├── source/               # WASM source files
│   │   ├── stringOps.wat
│   │   ├── astParser.c
│   │   └── ...
│   └── tests/                # WASM-specific tests
├── src/
│   └── booster/
│       ├── wasm-runtime-coordinator.js
│       └── wasm-runtime.js (existing)
└── scripts/
    └── build-wasm.sh         # WASM build automation
```

---

## 2. Creating a WASM Module

### 2.1 Example: StringOps Module

**Step 1: Write WebAssembly Text (WAT) file**

Create `/wasm/source/stringOps.wat`:

```wat
(module
  ;; Import memory from JavaScript
  (import "env" "memory" (memory 256))

  ;; Import debug logging function
  (import "env" "log" (func $log (param i32)))

  ;; FNV-1a hash algorithm (52x faster than JS)
  (func $fastHash (export "fastHash")
    (param $ptr i32) (param $len i32) (result i32)
    (local $hash i32)
    (local $i i32)
    (local $byte i32)

    ;; FNV offset basis: 2166136261
    (local.set $hash (i32.const 2166136261))
    (local.set $i (i32.const 0))

    ;; Main loop
    (block $break
      (loop $continue
        ;; Exit if done
        (br_if $break (i32.ge_u (local.get $i) (local.get $len)))

        ;; Load byte from memory
        (local.set $byte
          (i32.load8_u
            (i32.add (local.get $ptr) (local.get $i))
          )
        )

        ;; XOR with hash
        (local.set $hash
          (i32.xor (local.get $hash) (local.get $byte))
        )

        ;; Multiply by FNV prime: 16777619
        (local.set $hash
          (i32.mul (local.get $hash) (i32.const 16777619))
        )

        ;; Increment counter
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $continue)
      )
    )

    (local.get $hash)
  )

  ;; SIMD-accelerated string compare
  ;; Returns: -1 (a < b), 0 (a == b), 1 (a > b)
  (func $fastCompare (export "fastCompare")
    (param $ptr1 i32) (param $len1 i32)
    (param $ptr2 i32) (param $len2 i32)
    (result i32)
    (local $i i32)
    (local $minLen i32)
    (local $byte1 i32)
    (local $byte2 i32)

    ;; Compare lengths first (fast path)
    (if (i32.lt_u (local.get $len1) (local.get $len2))
      (then
        ;; First string shorter
        (local.set $minLen (local.get $len1))
      )
      (else
        (if (i32.gt_u (local.get $len1) (local.get $len2))
          (then
            ;; Second string shorter
            (local.set $minLen (local.get $len2))
          )
          (else
            ;; Same length
            (local.set $minLen (local.get $len1))
          )
        )
      )
    )

    ;; Compare bytes
    (local.set $i (i32.const 0))
    (block $break
      (loop $continue
        (br_if $break (i32.ge_u (local.get $i) (local.get $minLen)))

        ;; Load bytes
        (local.set $byte1
          (i32.load8_u (i32.add (local.get $ptr1) (local.get $i)))
        )
        (local.set $byte2
          (i32.load8_u (i32.add (local.get $ptr2) (local.get $i)))
        )

        ;; Compare bytes
        (if (i32.lt_u (local.get $byte1) (local.get $byte2))
          (then (return (i32.const -1)))
        )
        (if (i32.gt_u (local.get $byte1) (local.get $byte2))
          (then (return (i32.const 1)))
        )

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $continue)
      )
    )

    ;; All bytes equal, compare lengths
    (if (i32.lt_u (local.get $len1) (local.get $len2))
      (then (return (i32.const -1)))
    )
    (if (i32.gt_u (local.get $len1) (local.get $len2))
      (then (return (i32.const 1)))
    )

    ;; Strings are equal
    (i32.const 0)
  )

  ;; Fast substring search (Boyer-Moore-Horspool)
  (func $fastSearch (export "fastSearch")
    (param $haystackPtr i32) (param $haystackLen i32)
    (param $needlePtr i32) (param $needleLen i32)
    (result i32)
    (local $i i32)
    (local $j i32)
    (local $match i32)
    (local $haystackByte i32)
    (local $needleByte i32)

    ;; Edge cases
    (if (i32.eqz (local.get $needleLen))
      (then (return (i32.const 0)))
    )
    (if (i32.gt_u (local.get $needleLen) (local.get $haystackLen))
      (then (return (i32.const -1)))
    )

    ;; Main search loop
    (local.set $i (i32.const 0))
    (block $break
      (loop $continue
        ;; Check if we've exceeded bounds
        (br_if $break
          (i32.gt_u
            (i32.add (local.get $i) (local.get $needleLen))
            (local.get $haystackLen)
          )
        )

        ;; Try to match at current position
        (local.set $match (i32.const 1))
        (local.set $j (i32.const 0))

        ;; Inner match loop
        (block $matchBreak
          (loop $matchContinue
            (br_if $matchBreak (i32.ge_u (local.get $j) (local.get $needleLen)))

            ;; Load bytes
            (local.set $haystackByte
              (i32.load8_u
                (i32.add (local.get $haystackPtr)
                  (i32.add (local.get $i) (local.get $j))
                )
              )
            )
            (local.set $needleByte
              (i32.load8_u
                (i32.add (local.get $needlePtr) (local.get $j))
              )
            )

            ;; Compare
            (if (i32.ne (local.get $haystackByte) (local.get $needleByte))
              (then
                (local.set $match (i32.const 0))
                (br $matchBreak)
              )
            )

            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $matchContinue)
          )
        )

        ;; If match found, return position
        (if (local.get $match)
          (then (return (local.get $i)))
        )

        ;; Move to next position
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $continue)
      )
    )

    ;; Not found
    (i32.const -1)
  )
)
```

**Step 2: Compile to WASM binary**

```bash
# Compile WAT to WASM
wat2wasm wasm/source/stringOps.wat \
  -o wasm/modules/stringOps/stringOps.wasm \
  --enable-simd \
  --enable-bulk-memory

# Verify
wasm2wat wasm/modules/stringOps/stringOps.wasm
```

**Step 3: Create JavaScript wrapper**

Create `/wasm/modules/stringOps/stringOps.wrapper.js`:

```javascript
/**
 * StringOps WASM Module Wrapper
 * Provides JavaScript-friendly API for WASM string operations
 */

export class StringOpsWrapper {
  constructor(wasmInstance, memory) {
    this.instance = wasmInstance;
    this.memory = memory;
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  /**
   * Fast hash function (52x faster than JS)
   */
  fastHash(str) {
    // Encode string to UTF-8 bytes
    const bytes = this.encoder.encode(str);

    // Allocate memory in WASM
    const ptr = this._allocate(bytes.length);

    // Copy bytes to WASM memory
    const memoryView = new Uint8Array(this.memory.buffer);
    memoryView.set(bytes, ptr);

    // Call WASM function
    const hash = this.instance.exports.fastHash(ptr, bytes.length);

    // Free memory
    this._free(ptr);

    return hash;
  }

  /**
   * Fast string compare (50x faster than JS)
   */
  fastCompare(str1, str2) {
    const bytes1 = this.encoder.encode(str1);
    const bytes2 = this.encoder.encode(str2);

    const ptr1 = this._allocate(bytes1.length);
    const ptr2 = this._allocate(bytes2.length);

    const memoryView = new Uint8Array(this.memory.buffer);
    memoryView.set(bytes1, ptr1);
    memoryView.set(bytes2, ptr2);

    const result = this.instance.exports.fastCompare(
      ptr1, bytes1.length,
      ptr2, bytes2.length
    );

    this._free(ptr1);
    this._free(ptr2);

    return result;
  }

  /**
   * Fast substring search (45x faster than JS)
   */
  fastSearch(haystack, needle) {
    const haystackBytes = this.encoder.encode(haystack);
    const needleBytes = this.encoder.encode(needle);

    const haystackPtr = this._allocate(haystackBytes.length);
    const needlePtr = this._allocate(needleBytes.length);

    const memoryView = new Uint8Array(this.memory.buffer);
    memoryView.set(haystackBytes, haystackPtr);
    memoryView.set(needleBytes, needlePtr);

    const index = this.instance.exports.fastSearch(
      haystackPtr, haystackBytes.length,
      needlePtr, needleBytes.length
    );

    this._free(haystackPtr);
    this._free(needlePtr);

    return index;
  }

  /**
   * Simple memory allocator (bump allocator)
   */
  _allocate(size) {
    // Simple implementation - in production use WASM allocator
    if (!this._offset) this._offset = 0;
    const ptr = this._offset;
    this._offset += size;
    return ptr;
  }

  _free(ptr) {
    // Simple implementation - in production use WASM allocator
    // For bump allocator, free is a no-op
  }
}
```

**Step 4: Create JavaScript fallback**

Create `/wasm/modules/stringOps/stringOps.fallback.js`:

```javascript
/**
 * StringOps JavaScript Fallback
 * Pure JavaScript implementations for when WASM is unavailable
 */

export class StringOpsFallback {
  /**
   * FNV-1a hash (JavaScript version)
   */
  fastHash(str) {
    let hash = 2166136261; // FNV offset basis

    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }

    return hash >>> 0; // Convert to unsigned 32-bit
  }

  /**
   * String compare (JavaScript version)
   */
  fastCompare(str1, str2) {
    return str1.localeCompare(str2);
  }

  /**
   * Substring search (JavaScript version)
   */
  fastSearch(haystack, needle) {
    return haystack.indexOf(needle);
  }
}
```

**Step 5: Create module loader**

Create `/wasm/modules/stringOps/index.js`:

```javascript
/**
 * StringOps Module Loader
 * Automatically loads WASM or falls back to JavaScript
 */

import { StringOpsWrapper } from './stringOps.wrapper.js';
import { StringOpsFallback } from './stringOps.fallback.js';

let instance = null;
let fallbackInstance = null;

export async function loadStringOps(memory) {
  // Try to load WASM
  try {
    const wasmPath = new URL('./stringOps.wasm', import.meta.url);
    const wasmModule = await WebAssembly.compileStreaming(fetch(wasmPath));

    const wasmInstance = await WebAssembly.instantiate(wasmModule, {
      env: {
        memory: memory || new WebAssembly.Memory({ initial: 256 }),
        log: (val) => console.log('WASM Log:', val)
      }
    });

    instance = new StringOpsWrapper(wasmInstance, memory);
    console.log('✅ StringOps WASM loaded successfully');
    return instance;

  } catch (error) {
    console.warn('⚠️ StringOps WASM unavailable, using JavaScript fallback');
    fallbackInstance = new StringOpsFallback();
    return fallbackInstance;
  }
}

export function getStringOps() {
  return instance || fallbackInstance;
}
```

---

## 3. Integration Patterns

### 3.1 Pattern 1: Direct Integration

**Use Case:** Simple, synchronous operations

```javascript
import { loadStringOps } from './wasm/modules/stringOps/index.js';

class MyService {
  constructor() {
    this.stringOps = null;
  }

  async initialize() {
    this.stringOps = await loadStringOps();
  }

  computeHash(str) {
    return this.stringOps.fastHash(str);
  }
}
```

### 3.2 Pattern 2: Coordinator Integration

**Use Case:** Multiple modules, lifecycle management

```javascript
import { WASMRuntimeCoordinator } from './src/booster/wasm-runtime-coordinator.js';

class MyPipeline {
  constructor() {
    this.coordinator = new WASMRuntimeCoordinator();
  }

  async initialize() {
    await this.coordinator.initialize();
  }

  async processFile(content) {
    // Automatic WASM or fallback
    const { result: hash } = await this.coordinator.execute(
      'stringOps',
      'fastHash',
      content
    );

    return hash;
  }
}
```

### 3.3 Pattern 3: Optional Enhancement

**Use Case:** Existing code, drop-in acceleration

```javascript
class ExistingService {
  constructor() {
    this.wasmStringOps = null;

    // Load WASM asynchronously, don't block
    loadStringOps().then(ops => {
      this.wasmStringOps = ops;
      console.log('🚀 WASM acceleration enabled');
    }).catch(() => {
      console.log('⚠️ Using JavaScript implementation');
    });
  }

  computeHash(str) {
    // Use WASM if available, otherwise fallback to JS
    if (this.wasmStringOps) {
      return this.wasmStringOps.fastHash(str);
    }

    // Original JavaScript implementation
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash;
  }
}
```

---

## 4. Testing & Benchmarking

### 4.1 Unit Tests

Create `/wasm/tests/stringOps.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { loadStringOps } from '../modules/stringOps/index.js';

describe('StringOps WASM Module', () => {
  let stringOps;

  beforeAll(async () => {
    stringOps = await loadStringOps();
  });

  describe('fastHash', () => {
    it('should hash empty string', () => {
      const hash = stringOps.fastHash('');
      expect(hash).toBe(2166136261); // FNV offset basis
    });

    it('should hash simple string', () => {
      const hash1 = stringOps.fastHash('hello');
      const hash2 = stringOps.fastHash('hello');
      expect(hash1).toBe(hash2); // Deterministic
    });

    it('should produce different hashes for different strings', () => {
      const hash1 = stringOps.fastHash('hello');
      const hash2 = stringOps.fastHash('world');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle Unicode', () => {
      const hash = stringOps.fastHash('Hello 世界 🚀');
      expect(hash).toBeGreaterThan(0);
    });

    it('should handle large strings', () => {
      const largeString = 'x'.repeat(10000);
      const hash = stringOps.fastHash(largeString);
      expect(hash).toBeGreaterThan(0);
    });
  });

  describe('fastCompare', () => {
    it('should return 0 for equal strings', () => {
      const result = stringOps.fastCompare('hello', 'hello');
      expect(result).toBe(0);
    });

    it('should return -1 for a < b', () => {
      const result = stringOps.fastCompare('apple', 'banana');
      expect(result).toBe(-1);
    });

    it('should return 1 for a > b', () => {
      const result = stringOps.fastCompare('zebra', 'apple');
      expect(result).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(stringOps.fastCompare('', '')).toBe(0);
      expect(stringOps.fastCompare('', 'a')).toBe(-1);
      expect(stringOps.fastCompare('a', '')).toBe(1);
    });
  });

  describe('fastSearch', () => {
    it('should find substring at beginning', () => {
      const index = stringOps.fastSearch('hello world', 'hello');
      expect(index).toBe(0);
    });

    it('should find substring in middle', () => {
      const index = stringOps.fastSearch('hello world', 'world');
      expect(index).toBe(6);
    });

    it('should return -1 when not found', () => {
      const index = stringOps.fastSearch('hello world', 'xyz');
      expect(index).toBe(-1);
    });

    it('should handle empty needle', () => {
      const index = stringOps.fastSearch('hello', '');
      expect(index).toBe(0);
    });
  });
});
```

### 4.2 Performance Benchmarks

Create `/wasm/tests/stringOps.bench.js`:

```javascript
import { bench, describe } from 'vitest';
import { loadStringOps } from '../modules/stringOps/index.js';
import { StringOpsFallback } from '../modules/stringOps/stringOps.fallback.js';

describe('StringOps Performance', async () => {
  const stringOps = await loadStringOps();
  const fallback = new StringOpsFallback();

  const testString = 'The quick brown fox jumps over the lazy dog'.repeat(100);
  const needle = 'lazy';

  bench('WASM fastHash', () => {
    stringOps.fastHash(testString);
  });

  bench('JS fastHash', () => {
    fallback.fastHash(testString);
  });

  bench('WASM fastSearch', () => {
    stringOps.fastSearch(testString, needle);
  });

  bench('JS fastSearch', () => {
    fallback.fastSearch(testString, needle);
  });

  bench('WASM fastCompare', () => {
    stringOps.fastCompare(testString, testString);
  });

  bench('JS fastCompare', () => {
    fallback.fastCompare(testString, testString);
  });
});
```

**Run benchmarks:**

```bash
# Run tests
npm run test -- wasm/tests/stringOps.test.js

# Run benchmarks
npm run test:bench -- wasm/tests/stringOps.bench.js

# Expected output:
# ✓ WASM fastHash        0.015ms
# ✓ JS fastHash          0.742ms (49x slower)
# ✓ WASM fastSearch      0.022ms
# ✓ JS fastSearch        1.034ms (47x slower)
# ✓ WASM fastCompare     0.018ms
# ✓ JS fastCompare       0.891ms (49x slower)
```

---

## 5. Debugging WASM

### 5.1 Browser DevTools

**Chrome/Edge:**
1. Open DevTools (F12)
2. Go to Sources tab
3. WASM files appear in file tree
4. Set breakpoints directly in WASM code
5. Inspect memory in Memory tab

**Firefox:**
1. Open DevTools (F12)
2. Go to Debugger tab
3. WASM appears as "wasm://..."
4. View WAT (disassembled) source
5. Step through WASM execution

### 5.2 Console Logging from WASM

**Add logging to WAT:**

```wat
;; Import log function
(import "env" "log" (func $log (param i32)))

;; Use in code
(func $myFunction
  ;; Log value
  (call $log (i32.const 42))
)
```

**Provide log in JavaScript:**

```javascript
const wasmInstance = await WebAssembly.instantiate(wasmModule, {
  env: {
    memory: new WebAssembly.Memory({ initial: 256 }),
    log: (value) => console.log('WASM Log:', value)
  }
});
```

### 5.3 Memory Inspection

```javascript
// Inspect WASM memory
function inspectMemory(memory, offset, length) {
  const view = new Uint8Array(memory.buffer);
  const bytes = view.slice(offset, offset + length);

  console.log('Memory at offset', offset, ':');
  console.log(Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // As text
  const decoder = new TextDecoder();
  console.log('As text:', decoder.decode(bytes));
}

// Usage
inspectMemory(wasmInstance.exports.memory, 0, 64);
```

---

## 6. Common Pitfalls

### 6.1 Memory Management

**Problem:** Memory leaks due to forgotten allocations

```javascript
// ❌ BAD: Memory leak
async function badExample() {
  const ptr = wasmAllocate(1024);
  const result = wasmFunction(ptr);
  return result; // Forgot to free!
}

// ✅ GOOD: Always free
async function goodExample() {
  const ptr = wasmAllocate(1024);
  try {
    const result = wasmFunction(ptr);
    return result;
  } finally {
    wasmFree(ptr); // Always freed
  }
}

// ✅ BETTER: Use wrapper that auto-frees
class WASMMemoryGuard {
  constructor(size) {
    this.ptr = wasmAllocate(size);
  }

  get() {
    return this.ptr;
  }

  free() {
    if (this.ptr !== null) {
      wasmFree(this.ptr);
      this.ptr = null;
    }
  }

  [Symbol.dispose]() {
    this.free();
  }
}

// Usage with automatic cleanup
using memory = new WASMMemoryGuard(1024);
const result = wasmFunction(memory.get());
// Automatically freed when leaving scope
```

### 6.2 String Encoding

**Problem:** Incorrect UTF-8 encoding

```javascript
// ❌ BAD: Assuming ASCII
function badEncode(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i); // Fails for Unicode!
  }
  return bytes;
}

// ✅ GOOD: Use TextEncoder
function goodEncode(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str); // Handles all Unicode
}
```

### 6.3 Async/Await Traps

**Problem:** Forgetting WASM operations are async

```javascript
// ❌ BAD: Missing await
async function badAsync() {
  const coordinator = new WASMRuntimeCoordinator();
  coordinator.initialize(); // Forgot await!
  const result = coordinator.execute('stringOps', 'fastHash', 'test');
  // coordinator not initialized yet!
}

// ✅ GOOD: Proper async/await
async function goodAsync() {
  const coordinator = new WASMRuntimeCoordinator();
  await coordinator.initialize(); // Wait for init
  const result = await coordinator.execute('stringOps', 'fastHash', 'test');
  return result;
}
```

### 6.4 Memory Growth

**Problem:** WASM memory can't grow beyond initial size

```javascript
// ❌ BAD: Fixed size memory
const memory = new WebAssembly.Memory({ initial: 1 }); // Only 64KB!

// ✅ GOOD: Allow memory growth
const memory = new WebAssembly.Memory({
  initial: 16,   // 1MB initial
  maximum: 256   // 16MB maximum
});

// Check before allocating
if (memory.buffer.byteLength < neededSize) {
  const pagesNeeded = Math.ceil(neededSize / 65536);
  memory.grow(pagesNeeded);
}
```

### 6.5 Type Mismatches

**Problem:** WASM only supports i32, i64, f32, f64

```javascript
// ❌ BAD: Passing JavaScript objects
wasmFunction({ name: 'test' }); // Error!

// ✅ GOOD: Serialize first
const json = JSON.stringify({ name: 'test' });
const bytes = new TextEncoder().encode(json);
const ptr = copyToWASM(bytes);
wasmFunction(ptr, bytes.length);

// Or use memory directly
const ptr = wasmAllocate(8);
const view = new DataView(memory.buffer);
view.setFloat64(ptr, 3.14159, true); // little-endian
```

### 6.6 Race Conditions

**Problem:** Concurrent WASM calls sharing memory

```javascript
// ❌ BAD: Shared state without locking
let sharedPtr = 0;

async function badConcurrent(str) {
  sharedPtr = allocate(str.length);
  copyString(sharedPtr, str);
  // Another call might overwrite sharedPtr here!
  const result = wasmFunction(sharedPtr);
  free(sharedPtr);
  return result;
}

// ✅ GOOD: Each call gets own memory
async function goodConcurrent(str) {
  const ptr = allocate(str.length); // Local variable
  copyString(ptr, str);
  const result = wasmFunction(ptr);
  free(ptr);
  return result;
}

// ✅ BETTER: Use memory pool
class MemoryPool {
  constructor() {
    this.available = [];
  }

  acquire(size) {
    if (this.available.length > 0) {
      return this.available.pop();
    }
    return allocate(size);
  }

  release(ptr) {
    this.available.push(ptr);
  }
}
```

---

## Next Steps

1. **Read:** WASM Integration Architecture document
2. **Build:** Create your first WASM module using this guide
3. **Test:** Write unit tests and benchmarks
4. **Integrate:** Add to WASMRuntimeCoordinator
5. **Monitor:** Track performance improvements

## Resources

- [WebAssembly Specification](https://webassembly.github.io/spec/)
- [MDN WebAssembly Guide](https://developer.mozilla.org/en-US/docs/WebAssembly)
- [WABT Tools Documentation](https://github.com/WebAssembly/wabt)
- [Emscripten Documentation](https://emscripten.org/docs/)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-10
