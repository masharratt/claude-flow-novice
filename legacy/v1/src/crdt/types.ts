/**
 * CRDT Types and Implementations for Verification System
 * Handles conflict-free replicated data types for distributed consensus
 */

export interface CRDTState {
  nodeId: string;
  timestamp: number;
  vectorClock: Map<string, number>;
}

export interface VerificationReport {
  id: string;
  agentId: string;
  nodeId: string;
  timestamp: number;
  status: 'passed' | 'failed' | 'partial';
  metrics: Map<string, number>;
  conflicts: string[];
  metadata: Record<string, any>;
}

/**
 * G-Counter CRDT for monotonic verification metrics
 */
export class GCounter implements CRDTState {
  public readonly nodeId: string;
  public readonly timestamp: number;
  public readonly vectorClock: Map<string, number>;
  private readonly payload: Map<string, number>;
  private readonly replicationGroup: Set<string>;

  constructor(nodeId: string, replicationGroup: string[], initialState?: Map<string, number>) {
    this.nodeId = nodeId;
    this.timestamp = Date.now();
    this.vectorClock = new Map([[nodeId, 0]]);
    this.payload = new Map();
    this.replicationGroup = new Set(replicationGroup);

    // Initialize counters for all nodes
    for (const node of replicationGroup) {
      this.payload.set(node, 0);
    }

    if (initialState) {
      this.merge({ payload: initialState } as any);
    }
  }

  /**
   * Increment counter (only by owner node)
   */
  increment(amount: number = 1): number {
    if (amount < 0) {
      throw new Error('G-Counter only supports positive increments');
    }

    const oldValue = this.payload.get(this.nodeId) || 0;
    const newValue = oldValue + amount;
    this.payload.set(this.nodeId, newValue);

    // Update vector clock
    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);

    return newValue;
  }

  /**
   * Get current counter value (sum of all node counters)
   */
  value(): number {
    return Array.from(this.payload.values()).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Merge with another G-Counter
   */
  merge(other: { payload: Map<string, number>; vectorClock?: Map<string, number> }): boolean {
    let changed = false;

    for (const [node, otherValue] of other.payload) {
      const currentValue = this.payload.get(node) || 0;
      if (otherValue > currentValue) {
        this.payload.set(node, otherValue);
        changed = true;
      }
    }

    // Merge vector clocks if available
    if (other.vectorClock) {
      for (const [node, clock] of other.vectorClock) {
        const currentClock = this.vectorClock.get(node) || 0;
        if (clock > currentClock) {
          this.vectorClock.set(node, clock);
        }
      }
    }

    return changed;
  }

  /**
   * Compare states for causal ordering
   */
  compare(other: GCounter): 'EQUAL' | 'LESS_THAN' | 'GREATER_THAN' | 'CONCURRENT' {
    let lessCount = 0;
    let greaterCount = 0;

    for (const [node, otherValue] of other.payload) {
      const currentValue = this.payload.get(node) || 0;
      if (currentValue < otherValue) lessCount++;
      else if (currentValue > otherValue) greaterCount++;
    }

    if (lessCount === 0 && greaterCount === 0) return 'EQUAL';
    if (lessCount > 0 && greaterCount === 0) return 'LESS_THAN';
    if (lessCount === 0 && greaterCount > 0) return 'GREATER_THAN';
    return 'CONCURRENT';
  }

  serialize(): any {
    return {
      nodeId: this.nodeId,
      timestamp: this.timestamp,
      vectorClock: Array.from(this.vectorClock.entries()),
      payload: Array.from(this.payload.entries()),
      replicationGroup: Array.from(this.replicationGroup),
    };
  }

  static deserialize(data: any): GCounter {
    const counter = new GCounter(data.nodeId, data.replicationGroup);
    counter.payload.clear();
    for (const [key, value] of data.payload) {
      counter.payload.set(key, value);
    }
    counter.vectorClock.clear();
    for (const [key, value] of data.vectorClock) {
      counter.vectorClock.set(key, value);
    }
    return counter;
  }
}

/**
 * OR-Set CRDT for verification results and conflict tracking
 */
export class ORSet<T> implements CRDTState {
  public readonly nodeId: string;
  public readonly timestamp: number;
  public readonly vectorClock: Map<string, number>;
  private readonly elements: Map<T, Set<string>>;
  private readonly tombstones: Set<string>;
  private tagCounter: number;

  constructor(nodeId: string, initialElements?: T[]) {
    this.nodeId = nodeId;
    this.timestamp = Date.now();
    this.vectorClock = new Map([[nodeId, 0]]);
    this.elements = new Map();
    this.tombstones = new Set();
    this.tagCounter = 0;

    if (initialElements) {
      for (const element of initialElements) {
        this.add(element);
      }
    }
  }

  /**
   * Add element to set
   */
  add(element: T): string {
    const tag = this.generateUniqueTag();

    if (!this.elements.has(element)) {
      this.elements.set(element, new Set());
    }

    this.elements.get(element)!.add(tag);
    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);

    return tag;
  }

  /**
   * Remove element from set
   */
  remove(element: T): boolean {
    if (!this.elements.has(element)) {
      return false;
    }

    const tags = this.elements.get(element)!;
    for (const tag of tags) {
      this.tombstones.add(tag);
    }

    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);
    return true;
  }

  /**
   * Check if element exists in set
   */
  has(element: T): boolean {
    if (!this.elements.has(element)) {
      return false;
    }

    const tags = this.elements.get(element)!;
    for (const tag of tags) {
      if (!this.tombstones.has(tag)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all elements in set
   */
  values(): Set<T> {
    const result = new Set<T>();

    for (const [element, tags] of this.elements) {
      for (const tag of tags) {
        if (!this.tombstones.has(tag)) {
          result.add(element);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Merge with another OR-Set
   */
  merge(other: ORSet<T>): boolean {
    let changed = false;

    // Merge elements and tags
    for (const [element, otherTags] of other.elements) {
      if (!this.elements.has(element)) {
        this.elements.set(element, new Set());
      }

      const currentTags = this.elements.get(element)!;
      for (const tag of otherTags) {
        if (!currentTags.has(tag)) {
          currentTags.add(tag);
          changed = true;
        }
      }
    }

    // Merge tombstones
    for (const tombstone of other.tombstones) {
      if (!this.tombstones.has(tombstone)) {
        this.tombstones.add(tombstone);
        changed = true;
      }
    }

    // Merge vector clocks
    for (const [node, clock] of other.vectorClock) {
      const currentClock = this.vectorClock.get(node) || 0;
      if (clock > currentClock) {
        this.vectorClock.set(node, clock);
        changed = true;
      }
    }

    return changed;
  }

  private generateUniqueTag(): string {
    return `${this.nodeId}-${Date.now()}-${++this.tagCounter}`;
  }

  serialize(): any {
    return {
      nodeId: this.nodeId,
      timestamp: this.timestamp,
      vectorClock: Array.from(this.vectorClock.entries()),
      elements: Array.from(this.elements.entries()).map(([key, value]) => [key, Array.from(value)]),
      tombstones: Array.from(this.tombstones),
      tagCounter: this.tagCounter,
    };
  }

  static deserialize<T>(data: any): ORSet<T> {
    const orSet = new ORSet<T>(data.nodeId);
    orSet.elements.clear();
    for (const [key, value] of data.elements) {
      orSet.elements.set(key, new Set(value));
    }
    orSet.tombstones.clear();
    for (const tombstone of data.tombstones) {
      orSet.tombstones.add(tombstone);
    }
    orSet.vectorClock.clear();
    for (const [key, value] of data.vectorClock) {
      orSet.vectorClock.set(key, value);
    }
    (orSet as any).tagCounter = data.tagCounter;
    return orSet;
  }
}

/**
 * LWW-Register for last-writer-wins semantics
 */
export class LWWRegister<T> implements CRDTState {
  public readonly nodeId: string;
  public timestamp: number;
  public readonly vectorClock: Map<string, number>;
  private value: T | null;
  private lastWriteTime: number;
  private lastWriter: string;

  constructor(nodeId: string, initialValue?: T) {
    this.nodeId = nodeId;
    this.timestamp = Date.now();
    this.vectorClock = new Map([[nodeId, 0]]);
    this.value = initialValue || null;
    this.lastWriteTime = initialValue ? this.timestamp : 0;
    this.lastWriter = nodeId;
  }

  /**
   * Set new value with timestamp
   */
  set(newValue: T, timestamp?: number): void {
    const writeTime = timestamp || Date.now();

    if (
      writeTime > this.lastWriteTime ||
      (writeTime === this.lastWriteTime && this.nodeId > this.lastWriter)
    ) {
      this.value = newValue;
      this.lastWriteTime = writeTime;
      this.lastWriter = this.nodeId;
      this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);
    }
  }

  /**
   * Get current value
   */
  get(): T | null {
    return this.value;
  }

  /**
   * Merge with another LWW-Register
   */
  merge(other: LWWRegister<T>): boolean {
    if (
      other.lastWriteTime > this.lastWriteTime ||
      (other.lastWriteTime === this.lastWriteTime && other.lastWriter > this.lastWriter)
    ) {
      this.value = other.value;
      this.lastWriteTime = other.lastWriteTime;
      this.lastWriter = other.lastWriter;

      // Merge vector clocks
      for (const [node, clock] of other.vectorClock) {
        const currentClock = this.vectorClock.get(node) || 0;
        if (clock > currentClock) {
          this.vectorClock.set(node, clock);
        }
      }

      return true;
    }

    return false;
  }

  serialize(): any {
    return {
      nodeId: this.nodeId,
      timestamp: this.timestamp,
      vectorClock: Array.from(this.vectorClock.entries()),
      value: this.value,
      lastWriteTime: this.lastWriteTime,
      lastWriter: this.lastWriter,
    };
  }

  static deserialize<T>(data: any): LWWRegister<T> {
    const register = new LWWRegister<T>(data.nodeId);
    (register as any).value = data.value;
    (register as any).lastWriteTime = data.lastWriteTime;
    (register as any).lastWriter = data.lastWriter;
    register.vectorClock.clear();
    for (const [key, value] of data.vectorClock) {
      register.vectorClock.set(key, value);
    }
    return register;
  }
}

/**
 * Composite CRDT for complex verification reports
 */
export class VerificationCRDT implements CRDTState {
  public readonly nodeId: string;
  public readonly timestamp: number;
  public readonly vectorClock: Map<string, number>;

  private readonly status: LWWRegister<'passed' | 'failed' | 'partial'>;
  private readonly metrics: Map<string, GCounter>;
  private readonly conflicts: ORSet<string>;
  private readonly metadata: Map<string, LWWRegister<any>>;

  constructor(nodeId: string, report?: Partial<VerificationReport>) {
    this.nodeId = nodeId;
    this.timestamp = Date.now();
    this.vectorClock = new Map([[nodeId, 0]]);

    this.status = new LWWRegister<'passed' | 'failed' | 'partial'>(nodeId, report?.status);
    this.metrics = new Map();
    this.conflicts = new ORSet<string>(nodeId, report?.conflicts);
    this.metadata = new Map();

    if (report?.metrics) {
      for (const [key, value] of report.metrics) {
        const counter = new GCounter(nodeId, [nodeId]);
        counter.increment(value);
        this.metrics.set(key, counter);
      }
    }

    if (report?.metadata) {
      for (const [key, value] of Object.entries(report.metadata)) {
        this.metadata.set(key, new LWWRegister(nodeId, value));
      }
    }
  }

  /**
   * Update verification status
   */
  updateStatus(status: 'passed' | 'failed' | 'partial'): void {
    this.status.set(status);
    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);
  }

  /**
   * Add or update metric
   */
  updateMetric(key: string, value: number, replicationGroup: string[]): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new GCounter(this.nodeId, replicationGroup));
    }
    this.metrics.get(key)!.increment(value);
    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);
  }

  /**
   * Add conflict
   */
  addConflict(conflict: string): void {
    this.conflicts.add(conflict);
    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);
  }

  /**
   * Update metadata
   */
  updateMetadata(key: string, value: any): void {
    if (!this.metadata.has(key)) {
      this.metadata.set(key, new LWWRegister(this.nodeId));
    }
    this.metadata.get(key)!.set(value);
    this.vectorClock.set(this.nodeId, (this.vectorClock.get(this.nodeId) || 0) + 1);
  }

  /**
   * Merge with another VerificationCRDT
   */
  merge(other: VerificationCRDT): boolean {
    let changed = false;

    // Merge status
    if (this.status.merge(other.status)) {
      changed = true;
    }

    // Merge metrics
    for (const [key, otherMetric] of other.metrics) {
      if (!this.metrics.has(key)) {
        this.metrics.set(key, new GCounter(this.nodeId, [this.nodeId]));
      }
      if (this.metrics.get(key)!.merge(otherMetric)) {
        changed = true;
      }
    }

    // Merge conflicts
    if (this.conflicts.merge(other.conflicts)) {
      changed = true;
    }

    // Merge metadata
    for (const [key, otherMeta] of other.metadata) {
      if (!this.metadata.has(key)) {
        this.metadata.set(key, new LWWRegister(this.nodeId));
      }
      if (this.metadata.get(key)!.merge(otherMeta)) {
        changed = true;
      }
    }

    // Merge vector clocks
    for (const [node, clock] of other.vectorClock) {
      const currentClock = this.vectorClock.get(node) || 0;
      if (clock > currentClock) {
        this.vectorClock.set(node, clock);
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Get current verification report
   */
  toReport(): VerificationReport {
    const metricsMap = new Map<string, number>();
    for (const [key, counter] of this.metrics) {
      metricsMap.set(key, counter.value());
    }

    const metadataObj: Record<string, any> = {};
    for (const [key, register] of this.metadata) {
      metadataObj[key] = register.get();
    }

    return {
      id: `${this.nodeId}-${this.timestamp}`,
      agentId: this.nodeId,
      nodeId: this.nodeId,
      timestamp: this.timestamp,
      status: this.status.get() || 'partial',
      metrics: metricsMap,
      conflicts: Array.from(this.conflicts.values()),
      metadata: metadataObj,
    };
  }

  serialize(): any {
    return {
      nodeId: this.nodeId,
      timestamp: this.timestamp,
      vectorClock: Array.from(this.vectorClock.entries()),
      status: this.status.serialize(),
      metrics: Array.from(this.metrics.entries()).map(([key, value]) => [key, value.serialize()]),
      conflicts: this.conflicts.serialize(),
      metadata: Array.from(this.metadata.entries()).map(([key, value]) => [key, value.serialize()]),
    };
  }

  static deserialize(data: any): VerificationCRDT {
    const crdt = new VerificationCRDT(data.nodeId);

    // Deserialize status
    (crdt as any).status = LWWRegister.deserialize(data.status);

    // Deserialize metrics
    crdt.metrics.clear();
    for (const [key, value] of data.metrics) {
      crdt.metrics.set(key, GCounter.deserialize(value));
    }

    // Deserialize conflicts
    (crdt as any).conflicts = ORSet.deserialize(data.conflicts);

    // Deserialize metadata
    crdt.metadata.clear();
    for (const [key, value] of data.metadata) {
      crdt.metadata.set(key, LWWRegister.deserialize(value));
    }

    // Restore vector clock
    crdt.vectorClock.clear();
    for (const [key, value] of data.vectorClock) {
      crdt.vectorClock.set(key, value);
    }

    return crdt;
  }
}
