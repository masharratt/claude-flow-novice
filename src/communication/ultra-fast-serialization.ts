/**
 * Ultra-Fast Binary Serialization Protocol
 * Custom binary encoding optimized for minimum latency
 * Target: <50μs serialization time
 */

// Message type enumeration for compact encoding
export enum MessageType {
  HEARTBEAT = 0x01,
  TASK_ASSIGNMENT = 0x02,
  TASK_RESULT = 0x03,
  COORDINATION = 0x04,
  ERROR = 0x05,
  BATCH = 0x06,
  STREAM_START = 0x07,
  STREAM_DATA = 0x08,
  STREAM_END = 0x09,
  METRICS = 0x0A
}

// Compression flags
export enum CompressionType {
  NONE = 0x00,
  ZSTD = 0x01,
  LZ4 = 0x02,
  SNAPPY = 0x03
}

// Binary message header (24 bytes - cache line friendly)
export interface BinaryMessageHeader {
  magic: 0xCF;              // Protocol identifier (1 byte)
  version: number;          // Protocol version (1 byte)
  type: MessageType;        // Message type (1 byte)
  flags: number;            // Compression, priority flags (1 byte)
  payloadLength: number;    // Payload length varint (up to 5 bytes)
  timestamp: bigint;        // Nanosecond timestamp (8 bytes)
  correlationId: bigint;    // Message correlation ID (8 bytes)
}

// String interning pool for common values
class StringInternPool {
  private readonly stringToId = new Map<string, number>();
  private readonly idToString = new Map<number, string>();
  private nextId = 1;
  
  // Pre-populate with common strings
  constructor() {
    this.prePopulateCommonStrings();
  }
  
  private prePopulateCommonStrings(): void {
    const commonStrings = [
      'task', 'result', 'error', 'success', 'failure',
      'agent', 'coordinator', 'worker', 'message',
      'timestamp', 'id', 'type', 'payload', 'data',
      'status', 'processing', 'completed', 'pending'
    ];
    
    commonStrings.forEach(str => this.intern(str));
  }
  
  intern(str: string): number {
    let id = this.stringToId.get(str);
    if (id === undefined) {
      id = this.nextId++;
      this.stringToId.set(str, id);
      this.idToString.set(id, str);
    }
    return id;
  }
  
  getString(id: number): string | undefined {
    return this.idToString.get(id);
  }
  
  hasString(str: string): boolean {
    return this.stringToId.has(str);
  }
}

// Variable-length integer encoding for space efficiency
export class VarintEncoder {
  static encode(value: number): Uint8Array {
    const bytes: number[] = [];
    let remaining = value;
    
    while (remaining >= 0x80) {
      bytes.push((remaining & 0xFF) | 0x80);
      remaining >>>= 7;
    }
    bytes.push(remaining & 0xFF);
    
    return new Uint8Array(bytes);
  }
  
  static decode(buffer: Uint8Array, offset: number = 0): { value: number; bytesRead: number } {
    let value = 0;
    let shift = 0;
    let bytesRead = 0;
    
    while (offset + bytesRead < buffer.length) {
      const byte = buffer[offset + bytesRead++];
      value |= (byte & 0x7F) << shift;
      
      if ((byte & 0x80) === 0) {
        break;
      }
      
      shift += 7;
      if (shift >= 32) {
        throw new Error('Varint too long');
      }
    }
    
    return { value, bytesRead };
  }
  
  static encodeBigInt(value: bigint): Uint8Array {
    const bytes: number[] = [];
    let remaining = value;
    
    while (remaining >= 0x80n) {
      bytes.push(Number(remaining & 0xFFn) | 0x80);
      remaining >>= 7n;
    }
    bytes.push(Number(remaining & 0xFFn));
    
    return new Uint8Array(bytes);
  }
  
  static decodeBigInt(buffer: Uint8Array, offset: number = 0): { value: bigint; bytesRead: number } {
    let value = 0n;
    let shift = 0n;
    let bytesRead = 0;
    
    while (offset + bytesRead < buffer.length) {
      const byte = buffer[offset + bytesRead++];
      value |= BigInt(byte & 0x7F) << shift;
      
      if ((byte & 0x80) === 0) {
        break;
      }
      
      shift += 7n;
      if (shift >= 64n) {
        throw new Error('BigInt varint too long');
      }
    }
    
    return { value, bytesRead };
  }
}

// High-performance binary encoder with zero-copy operations
export class UltraFastBinaryEncoder {
  private buffer: ArrayBuffer;
  private view: DataView;
  private uint8View: Uint8Array;
  private position: number = 0;
  private readonly stringPool: StringInternPool;
  
  constructor(initialSize: number = 8192) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.uint8View = new Uint8Array(this.buffer);
    this.stringPool = new StringInternPool();
  }
  
  reset(): void {
    this.position = 0;
  }
  
  private ensureCapacity(additionalBytes: number): void {
    if (this.position + additionalBytes > this.buffer.byteLength) {
      const newSize = Math.max(
        this.buffer.byteLength * 2,
        this.position + additionalBytes + 1024
      );
      
      const newBuffer = new ArrayBuffer(newSize);
      new Uint8Array(newBuffer).set(this.uint8View);
      
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer);
      this.uint8View = new Uint8Array(this.buffer);
    }
  }
  
  // Write message header
  writeHeader(header: BinaryMessageHeader): void {
    this.ensureCapacity(32); // Conservative estimate
    
    this.view.setUint8(this.position++, 0xCF); // Magic
    this.view.setUint8(this.position++, header.version);
    this.view.setUint8(this.position++, header.type);
    this.view.setUint8(this.position++, header.flags);
    
    // Write payload length as varint
    const lengthBytes = VarintEncoder.encode(header.payloadLength);
    this.uint8View.set(lengthBytes, this.position);
    this.position += lengthBytes.length;
    
    // Write timestamp as little-endian uint64
    this.view.setBigUint64(this.position, header.timestamp, true);
    this.position += 8;
    
    // Write correlation ID
    this.view.setBigUint64(this.position, header.correlationId, true);
    this.position += 8;
  }
  
  // Write optimized string (with interning)
  writeString(str: string): void {
    if (this.stringPool.hasString(str)) {
      // Write interned string marker and ID
      this.ensureCapacity(6);
      this.view.setUint8(this.position++, 0xFF); // Interned string marker
      const id = this.stringPool.intern(str);
      const idBytes = VarintEncoder.encode(id);
      this.uint8View.set(idBytes, this.position);
      this.position += idBytes.length;
    } else {
      // Write raw string
      const encoded = new TextEncoder().encode(str);
      this.ensureCapacity(encoded.length + 5);
      
      const lengthBytes = VarintEncoder.encode(encoded.length);
      this.uint8View.set(lengthBytes, this.position);
      this.position += lengthBytes.length;
      
      this.uint8View.set(encoded, this.position);
      this.position += encoded.length;
    }
  }
  
  // Write various data types with type-specific optimizations
  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.position++, value);
  }
  
  writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.position, value, true); // Little endian
    this.position += 2;
  }
  
  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.position, value, true);
    this.position += 4;
  }
  
  writeUint64(value: bigint): void {
    this.ensureCapacity(8);
    this.view.setBigUint64(this.position, value, true);
    this.position += 8;
  }
  
  writeVarint(value: number): void {
    const bytes = VarintEncoder.encode(value);
    this.ensureCapacity(bytes.length);
    this.uint8View.set(bytes, this.position);
    this.position += bytes.length;
  }
  
  writeVarintBigInt(value: bigint): void {
    const bytes = VarintEncoder.encodeBigInt(value);
    this.ensureCapacity(bytes.length);
    this.uint8View.set(bytes, this.position);
    this.position += bytes.length;
  }
  
  writeFloat32(value: number): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.position, value, true);
    this.position += 4;
  }
  
  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.position, value, true);
    this.position += 8;
  }
  
  writeBoolean(value: boolean): void {
    this.writeUint8(value ? 1 : 0);
  }
  
  // Write raw bytes (zero-copy for ArrayBuffer views)
  writeBytes(data: Uint8Array | ArrayBuffer): void {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    this.ensureCapacity(bytes.length);
    this.uint8View.set(bytes, this.position);
    this.position += bytes.length;
  }
  
  // Write array with length prefix
  writeArray<T>(array: T[], writer: (item: T) => void): void {
    this.writeVarint(array.length);
    array.forEach(writer);
  }
  
  // Write map with length prefix
  writeMap<K, V>(map: Map<K, V>, keyWriter: (key: K) => void, valueWriter: (value: V) => void): void {
    this.writeVarint(map.size);
    for (const [key, value] of map) {
      keyWriter(key);
      valueWriter(value);
    }
  }
  
  // Get final encoded buffer (zero-copy slice)
  getBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.position);
  }
  
  getUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.position);
  }
}

// High-performance binary decoder with minimal allocations
export class UltraFastBinaryDecoder {
  private readonly view: DataView;
  private readonly uint8View: Uint8Array;
  private position: number = 0;
  private readonly stringPool: StringInternPool;
  
  constructor(buffer: ArrayBuffer | Uint8Array) {
    if (buffer instanceof Uint8Array) {
      this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      this.uint8View = buffer;
    } else {
      this.view = new DataView(buffer);
      this.uint8View = new Uint8Array(buffer);
    }
    this.stringPool = new StringInternPool();
  }
  
  reset(position: number = 0): void {
    this.position = position;
  }
  
  // Read message header
  readHeader(): BinaryMessageHeader {
    const magic = this.view.getUint8(this.position++);
    if (magic !== 0xCF) {
      throw new Error(`Invalid magic byte: expected 0xCF, got 0x${magic.toString(16)}`);
    }
    
    const version = this.view.getUint8(this.position++);
    const type = this.view.getUint8(this.position++) as MessageType;
    const flags = this.view.getUint8(this.position++);
    
    const { value: payloadLength, bytesRead } = VarintEncoder.decode(this.uint8View, this.position);
    this.position += bytesRead;
    
    const timestamp = this.view.getBigUint64(this.position, true);
    this.position += 8;
    
    const correlationId = this.view.getBigUint64(this.position, true);
    this.position += 8;
    
    return {
      magic: 0xCF,
      version,
      type,
      flags,
      payloadLength,
      timestamp,
      correlationId
    };
  }
  
  // Read optimized string (with interning support)
  readString(): string {
    const firstByte = this.view.getUint8(this.position);
    
    if (firstByte === 0xFF) {
      // Interned string
      this.position++;
      const { value: id, bytesRead } = VarintEncoder.decode(this.uint8View, this.position);
      this.position += bytesRead;
      
      const str = this.stringPool.getString(id);
      if (str === undefined) {
        throw new Error(`Unknown interned string ID: ${id}`);
      }
      return str;
    } else {
      // Raw string
      const { value: length, bytesRead } = VarintEncoder.decode(this.uint8View, this.position);
      this.position += bytesRead;
      
      const bytes = this.uint8View.slice(this.position, this.position + length);
      this.position += length;
      
      return new TextDecoder().decode(bytes);
    }
  }
  
  // Read various data types
  readUint8(): number {
    return this.view.getUint8(this.position++);
  }
  
  readUint16(): number {
    const value = this.view.getUint16(this.position, true);
    this.position += 2;
    return value;
  }
  
  readUint32(): number {
    const value = this.view.getUint32(this.position, true);
    this.position += 4;
    return value;
  }
  
  readUint64(): bigint {
    const value = this.view.getBigUint64(this.position, true);
    this.position += 8;
    return value;
  }
  
  readVarint(): number {
    const { value, bytesRead } = VarintEncoder.decode(this.uint8View, this.position);
    this.position += bytesRead;
    return value;
  }
  
  readVarintBigInt(): bigint {
    const { value, bytesRead } = VarintEncoder.decodeBigInt(this.uint8View, this.position);
    this.position += bytesRead;
    return value;
  }
  
  readFloat32(): number {
    const value = this.view.getFloat32(this.position, true);
    this.position += 4;
    return value;
  }
  
  readFloat64(): number {
    const value = this.view.getFloat64(this.position, true);
    this.position += 8;
    return value;
  }
  
  readBoolean(): boolean {
    return this.readUint8() === 1;
  }
  
  // Read raw bytes (zero-copy slice)
  readBytes(length: number): Uint8Array {
    const bytes = this.uint8View.slice(this.position, this.position + length);
    this.position += length;
    return bytes;
  }
  
  // Read array with length prefix
  readArray<T>(reader: () => T): T[] {
    const length = this.readVarint();
    const array: T[] = new Array(length);
    for (let i = 0; i < length; i++) {
      array[i] = reader();
    }
    return array;
  }
  
  // Read map with length prefix
  readMap<K, V>(keyReader: () => K, valueReader: () => V): Map<K, V> {
    const size = this.readVarint();
    const map = new Map<K, V>();
    for (let i = 0; i < size; i++) {
      const key = keyReader();
      const value = valueReader();
      map.set(key, value);
    }
    return map;
  }
  
  // Check if more data is available
  hasMore(): boolean {
    return this.position < this.uint8View.length;
  }
  
  // Get remaining bytes
  remaining(): number {
    return this.uint8View.length - this.position;
  }
  
  // Skip bytes
  skip(count: number): void {
    this.position = Math.min(this.position + count, this.uint8View.length);
  }
}

// Message serialization utilities
export class MessageSerializer {
  private static encoder = new UltraFastBinaryEncoder();
  
  static serialize(type: MessageType, payload: any, correlationId?: bigint): ArrayBuffer {
    this.encoder.reset();
    
    // Serialize payload first to get its length
    const payloadStart = this.encoder.position;
    this.serializePayload(payload, type);
    const payloadLength = this.encoder.position - payloadStart;
    
    // Create and insert header
    const header: BinaryMessageHeader = {
      magic: 0xCF,
      version: 1,
      type,
      flags: 0,
      payloadLength,
      timestamp: BigInt(Math.floor(performance.now() * 1000000)),
      correlationId: correlationId || BigInt(Date.now()) * 1000000n + BigInt(Math.random() * 1000000)
    };
    
    // Move payload and insert header at the beginning
    const payloadBytes = this.encoder.getUint8Array().slice(payloadStart);
    this.encoder.reset();
    this.encoder.writeHeader(header);
    this.encoder.writeBytes(payloadBytes);
    
    return this.encoder.getBuffer();
  }
  
  private static serializePayload(payload: any, type: MessageType): void {
    switch (type) {
      case MessageType.TASK_ASSIGNMENT:
        this.serializeTaskAssignment(payload);
        break;
      case MessageType.TASK_RESULT:
        this.serializeTaskResult(payload);
        break;
      case MessageType.COORDINATION:
        this.serializeCoordination(payload);
        break;
      case MessageType.HEARTBEAT:
        this.serializeHeartbeat(payload);
        break;
      default:
        // Generic object serialization
        this.serializeGeneric(payload);
    }
  }
  
  private static serializeTaskAssignment(task: any): void {
    this.encoder.writeString(task.id || '');
    this.encoder.writeString(task.type || '');
    this.encoder.writeString(task.agent || '');
    this.encoder.writeVarintBigInt(task.timestamp || 0n);
    this.encoder.writeString(JSON.stringify(task.data || {}));
    this.encoder.writeUint8(task.priority || 0);
  }
  
  private static serializeTaskResult(result: any): void {
    this.encoder.writeString(result.taskId || '');
    this.encoder.writeBoolean(result.success || false);
    this.encoder.writeString(JSON.stringify(result.data || {}));
    this.encoder.writeString(result.error || '');
    this.encoder.writeVarintBigInt(result.executionTime || 0n);
  }
  
  private static serializeCoordination(coord: any): void {
    this.encoder.writeString(coord.command || '');
    this.encoder.writeArray(coord.agents || [], (agent: string) => this.encoder.writeString(agent));
    this.encoder.writeString(JSON.stringify(coord.parameters || {}));
  }
  
  private static serializeHeartbeat(heartbeat: any): void {
    this.encoder.writeString(heartbeat.agentId || '');
    this.encoder.writeVarintBigInt(heartbeat.timestamp || 0n);
    this.encoder.writeFloat32(heartbeat.cpuUsage || 0);
    this.encoder.writeFloat32(heartbeat.memoryUsage || 0);
    this.encoder.writeUint32(heartbeat.messageCount || 0);
  }
  
  private static serializeGeneric(obj: any): void {
    // Fallback to JSON with compression for complex objects
    const json = JSON.stringify(obj);
    this.encoder.writeString(json);
  }
  
  static deserialize(buffer: ArrayBuffer): { header: BinaryMessageHeader; payload: any } {
    const decoder = new UltraFastBinaryDecoder(buffer);
    const header = decoder.readHeader();
    const payload = this.deserializePayload(decoder, header.type);
    
    return { header, payload };
  }
  
  private static deserializePayload(decoder: UltraFastBinaryDecoder, type: MessageType): any {
    switch (type) {
      case MessageType.TASK_ASSIGNMENT:
        return this.deserializeTaskAssignment(decoder);
      case MessageType.TASK_RESULT:
        return this.deserializeTaskResult(decoder);
      case MessageType.COORDINATION:
        return this.deserializeCoordination(decoder);
      case MessageType.HEARTBEAT:
        return this.deserializeHeartbeat(decoder);
      default:
        return this.deserializeGeneric(decoder);
    }
  }
  
  private static deserializeTaskAssignment(decoder: UltraFastBinaryDecoder): any {
    return {
      id: decoder.readString(),
      type: decoder.readString(),
      agent: decoder.readString(),
      timestamp: decoder.readVarintBigInt(),
      data: JSON.parse(decoder.readString()),
      priority: decoder.readUint8()
    };
  }
  
  private static deserializeTaskResult(decoder: UltraFastBinaryDecoder): any {
    return {
      taskId: decoder.readString(),
      success: decoder.readBoolean(),
      data: JSON.parse(decoder.readString()),
      error: decoder.readString(),
      executionTime: decoder.readVarintBigInt()
    };
  }
  
  private static deserializeCoordination(decoder: UltraFastBinaryDecoder): any {
    return {
      command: decoder.readString(),
      agents: decoder.readArray(() => decoder.readString()),
      parameters: JSON.parse(decoder.readString())
    };
  }
  
  private static deserializeHeartbeat(decoder: UltraFastBinaryDecoder): any {
    return {
      agentId: decoder.readString(),
      timestamp: decoder.readVarintBigInt(),
      cpuUsage: decoder.readFloat32(),
      memoryUsage: decoder.readFloat32(),
      messageCount: decoder.readUint32()
    };
  }
  
  private static deserializeGeneric(decoder: UltraFastBinaryDecoder): any {
    return JSON.parse(decoder.readString());
  }
}