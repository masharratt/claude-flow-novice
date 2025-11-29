/**
 * Production Observability Library
 *
 * Structured logging, metrics export, distributed tracing for CFN Loop.
 * Enables production monitoring without external dependencies initially.
 *
 * Phase 6: Production Hardening (Task 6.2)
 *
 * NOTE: This uses console-based structured logging (JSON) initially.
 * Can be upgraded to Winston/Pino later without changing call sites.
 */

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error"
}

export interface LogContext {
  taskId?: string;
  traceId?: string;
  phase?: string;
  agentType?: string;
  iteration?: number;
  [key: string]: unknown;
}

export interface MetricLabels {
  phase?: string;
  status?: string;
  compliant?: string;
  [key: string]: string | undefined;
}

export interface Histogram {
  name: string;
  help: string;
  labels: string[];
  buckets: number[];
  observations: Array<{ labels: Record<string, string>; value: number }>;
}

export interface Counter {
  name: string;
  help: string;
  labels: string[];
  value: number;
  labeledValues: Map<string, number>;
}

/**
 * Structured Logger
 *
 * Logs JSON-formatted messages for easy parsing by ELK, Datadog, etc.
 * Uses console.log/error with structured data.
 */
export class StructuredLogger {
  private service: string;
  private minLevel: LogLevel;

  constructor(service: string, minLevel: LogLevel = LogLevel.INFO) {
    this.service = service;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...context
    };

    const output = JSON.stringify(logEntry);

    if (level === LogLevel.ERROR) {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Create child logger with inherited context
   */
  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger(this.service, this.minLevel);

    // Wrap log method to include inherited context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, childContext: LogContext = {}) => {
      originalLog(level, message, { ...context, ...childContext });
    };

    return childLogger;
  }
}

/**
 * Metrics Registry
 *
 * In-memory metrics collection compatible with Prometheus format.
 * Can be exported via /metrics endpoint.
 */
export class MetricsRegistry {
  private histograms: Map<string, Histogram> = new Map();
  private counters: Map<string, Counter> = new Map();

  /**
   * Register a histogram metric
   */
  registerHistogram(
    name: string,
    help: string,
    labels: string[] = [],
    buckets: number[] = [1000, 2500, 5000, 10000, 30000, 150000]
  ): void {
    if (this.histograms.has(name)) {
      throw new Error(`Histogram ${name} already registered`);
    }

    this.histograms.set(name, {
      name,
      help,
      labels,
      buckets,
      observations: []
    });
  }

  /**
   * Observe a value for a histogram
   */
  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      throw new Error(`Histogram ${name} not registered`);
    }

    const labelValues: Record<string, string> = {};
    histogram.labels.forEach(label => {
      labelValues[label] = labels[label] || "";
    });

    histogram.observations.push({ labels: labelValues, value });
  }

  /**
   * Register a counter metric
   */
  registerCounter(name: string, help: string, labels: string[] = []): void {
    if (this.counters.has(name)) {
      throw new Error(`Counter ${name} already registered`);
    }

    this.counters.set(name, {
      name,
      help,
      labels,
      value: 0,
      labeledValues: new Map()
    });
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels: MetricLabels = {}, amount: number = 1): void {
    const counter = this.counters.get(name);
    if (!counter) {
      throw new Error(`Counter ${name} not registered`);
    }

    counter.value += amount;

    // Track labeled values
    const labelKey = counter.labels.map(l => labels[l] || "").join(":");
    const current = counter.labeledValues.get(labelKey) || 0;
    counter.labeledValues.set(labelKey, current + amount);
  }

  /**
   * Export metrics in Prometheus text format
   */
  export(): string {
    const lines: string[] = [];

    // Export histograms
    this.histograms.forEach(histogram => {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);

      // Group observations by labels
      const grouped = new Map<string, number[]>();
      histogram.observations.forEach(obs => {
        const labelStr = histogram.labels.map(l => `${l}="${obs.labels[l]}"`).join(",");
        const key = labelStr || "{}";
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(obs.value);
      });

      // Calculate buckets
      grouped.forEach((values, labelStr) => {
        const labelPrefix = labelStr === "{}" ? "" : labelStr;
        histogram.buckets.forEach(bucket => {
          const count = values.filter(v => v <= bucket).length;
          lines.push(`${histogram.name}_bucket{${labelPrefix}${labelPrefix ? "," : ""}le="${bucket}"} ${count}`);
        });
        lines.push(`${histogram.name}_bucket{${labelPrefix}${labelPrefix ? "," : ""}le="+Inf"} ${values.length}`);

        const sum = values.reduce((a, b) => a + b, 0);
        lines.push(`${histogram.name}_sum{${labelPrefix}} ${sum}`);
        lines.push(`${histogram.name}_count{${labelPrefix}} ${values.length}`);
      });
    });

    // Export counters
    this.counters.forEach(counter => {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);

      if (counter.labels.length === 0) {
        lines.push(`${counter.name} ${counter.value}`);
      } else {
        counter.labeledValues.forEach((value, labelKey) => {
          const labelParts = labelKey.split(":");
          const labelStr = counter.labels.map((l, i) => `${l}="${labelParts[i] || ""}"`).join(",");
          lines.push(`${counter.name}{${labelStr}} ${value}`);
        });
      }
    });

    return lines.join("\n") + "\n";
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const histogram = this.histograms.get(name);
    if (!histogram || histogram.observations.length === 0) {
      return null;
    }

    const values = histogram.observations.map(o => o.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / count;

    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * count) - 1;
      return values[Math.max(0, index)];
    };

    return {
      count,
      sum,
      avg,
      min: values[0],
      max: values[count - 1],
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99)
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.histograms.forEach(h => h.observations.length = 0);
    this.counters.forEach(c => {
      c.value = 0;
      c.labeledValues.clear();
    });
  }
}

/**
 * Trace Context
 *
 * Manages distributed tracing context (trace ID, span ID).
 * Can be integrated with OpenTelemetry or Jaeger later.
 */
export class TraceContext {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  private startTime: number;

  constructor(traceId?: string, parentSpanId?: string) {
    this.traceId = traceId || this.generateId();
    this.spanId = this.generateId();
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Create child span
   */
  child(): TraceContext {
    return new TraceContext(this.traceId, this.spanId);
  }

  /**
   * Get elapsed time since span started
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Convert to log context
   */
  toLogContext(): LogContext {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId
    };
  }
}

/**
 * Global instances for easy access
 */
export const logger = new StructuredLogger("cfn-coordinator",
  (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO
);

export const metrics = new MetricsRegistry();

// Register default metrics
metrics.registerHistogram(
  "cfn_phase_latency_ms",
  "Phase execution latency in milliseconds",
  ["phase"]
);

metrics.registerCounter(
  "cfn_sla_compliance",
  "SLA compliance (1=met, 0=breached)",
  ["phase", "compliant"]
);

metrics.registerCounter(
  "cfn_errors_total",
  "Total errors by phase",
  ["phase", "error_type"]
);

metrics.registerCounter(
  "cfn_tasks_total",
  "Total tasks processed",
  ["status"]
);

/**
 * Utility: Create trace-aware logger
 */
export function createTracedLogger(trace: TraceContext, service?: string): StructuredLogger {
  const baseLogger = service ? new StructuredLogger(service) : logger;
  return baseLogger.child(trace.toLogContext());
}
