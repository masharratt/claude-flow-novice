// Stub: log shipper
// Created to satisfy test imports

export interface LogShipperConfig {
  destination: string;
  batchSize?: number;
  flushInterval?: number;
}

export interface LogEntry {
  level: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export class LogShipper {
  private config: LogShipperConfig;
  private buffer: LogEntry[] = [];

  constructor(config: LogShipperConfig) {
    this.config = config;
  }

  ship(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length >= (this.config.batchSize || 100)) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    // Stub implementation
    this.buffer = [];
  }

  async start(): Promise<void> {
    // Stub implementation
  }

  async stop(): Promise<void> {
    await this.flush();
  }
}
