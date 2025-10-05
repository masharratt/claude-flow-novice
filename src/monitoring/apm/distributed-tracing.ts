/**
 * Distributed Tracing System for Claude Flow Novice
 * Provides end-to-end tracing across microservices and agent swarms
 */

import { Logger } from '../../utils/logger.js';
import { DataDogCollector } from './datadog-collector.js';
import { NewRelicCollector } from './newrelic-collector.js';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage: Record<string, string>;
  samplingDecision?: boolean;
}

export interface SpanOptions {
  operationName: string;
  resource?: string;
  service?: string;
  tags?: Record<string, string>;
  startTime?: number;
}

export interface TraceHeader {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled?: string;
  baggage?: string;
}

export interface DistributedTrace {
  traceId: string;
  spans: TraceSpan[];
  startTime: number;
  endTime?: number;
  duration?: number;
  serviceMap: Map<string, Set<string>>;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string>;
  logs: TraceLog[];
  status: 'ok' | 'error' | 'cancelled';
  serviceName?: string;
  serviceType?: string;
}

export interface TraceLog {
  timestamp: number;
  level: string;
  message: string;
  fields?: Record<string, any>;
}

export class DistributedTracer {
  private logger: Logger;
  private dataDogCollector?: DataDogCollector;
  private newRelicCollector?: NewRelicCollector;
  private activeSpans: Map<string, TraceSpan> = new Map();
  private activeTraces: Map<string, DistributedTrace> = new Map();
  private samplingRate: number = 1.0;

  constructor(
    dataDogCollector?: DataDogCollector,
    newRelicCollector?: NewRelicCollector,
    options: { samplingRate?: number } = {}
  ) {
    this.logger = new Logger('DistributedTracer');
    this.dataDogCollector = dataDogCollector;
    this.newRelicCollector = newRelicCollector;
    this.samplingRate = options.samplingRate || 1.0;
  }

  // Trace Context Management
  public startTrace(operationName: string, tags?: Record<string, string>): TraceContext {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();
    const sampled = Math.random() < this.samplingRate;

    const context: TraceContext = {
      traceId,
      spanId,
      baggage: {},
      samplingDecision: sampled
    };

    if (sampled) {
      this.createSpan(traceId, spanId, undefined, operationName, 'root', tags);
    }

    return context;
  }

  public startSpan(context: TraceContext, operationName: string, spanOptions?: Partial<SpanOptions>): TraceContext {
    if (!context.samplingDecision) {
      return {
        ...context,
        spanId: this.generateSpanId()
      };
    }

    const spanId = this.generateSpanId();
    const parentSpanId = context.spanId;

    this.createSpan(
      context.traceId,
      spanId,
      parentSpanId,
      operationName,
      spanOptions?.service || 'unknown',
      spanOptions?.tags
    );

    return {
      ...context,
      spanId,
      parentSpanId
    };
  }

  public finishSpan(context: TraceContext, tags?: Record<string, string>, error?: Error): void {
    if (!context.samplingDecision || !this.activeSpans.has(context.spanId)) return;

    const span = this.activeSpans.get(context.spanId)!;
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    if (tags) {
      span.tags = { ...span.tags, ...tags };
    }

    if (error) {
      span.status = 'error';
      span.tags['error.type'] = error.constructor.name;
      span.tags['error.message'] = error.message;
      this.addLog(context.spanId, 'error', error.message, { error: error.stack });
    } else {
      span.status = 'ok';
    }

    // Update trace duration if this is the root span
    const trace = this.activeTraces.get(context.traceId);
    if (trace && !span.parentSpanId) {
      trace.endTime = span.endTime;
      trace.duration = trace.endTime - trace.startTime;
    }

    // Send to APM collectors
    this.sendSpanToCollectors(span);

    this.activeSpans.delete(context.spanId);
  }

  public extractTraceContext(headers: Record<string, string>): TraceContext | null {
    // Try to extract from various trace header formats
    const traceHeaders = [
      'x-trace-id',
      'traceparent',
      'x-b3-traceid',
      'uber-trace-id'
    ];

    const spanHeaders = [
      'x-span-id',
      'x-b3-spanid'
    ];

    const parentHeaders = [
      'x-parent-span-id',
      'x-b3-parentspanid'
    ];

    const sampledHeaders = [
      'x-sampled',
      'x-b3-sampled'
    ];

    for (const header of traceHeaders) {
      if (headers[header]) {
        return {
          traceId: headers[header],
          spanId: headers[spanHeaders.find(h => headers[h]) || this.generateSpanId(),
          parentSpanId: parentHeaders.find(h => headers[h]) ? headers[parentHeaders.find(h => headers[h])!] : undefined,
          baggage: this.extractBaggage(headers),
          samplingDecision: headers[sampledHeaders.find(h => headers[h]] || 'x-sampled'] === '1'
        };
      }
    }

    return null;
  }

  public injectTraceContext(context: TraceContext, headers: Record<string, string>): void {
    if (!context.samplingDecision) return;

    // Inject into multiple header formats for compatibility
    headers['x-trace-id'] = context.traceId;
    headers['x-span-id'] = context.spanId;
    headers['x-sampled'] = context.samplingDecision ? '1' : '0';

    if (context.parentSpanId) {
      headers['x-parent-span-id'] = context.parentSpanId;
    }

    // Inject baggage
    this.injectBaggage(context.baggage, headers);
  }

  // Agent-Specific Tracing
  public traceAgentOperation(
    agentType: string,
    operation: string,
    traceContext?: TraceContext,
    tags?: Record<string, string>
  ): TraceContext {
    const context = traceContext || this.startTrace('agent_operation');
    const spanContext = this.startSpan(context, `agent.${operation}`, {
      service: `agent.${agentType}`,
      tags: {
        'agent.type': agentType,
        'agent.operation': operation,
        ...tags
      }
    });

    return spanContext;
  }

  public traceSwarmOperation(
    swarmId: string,
    operation: string,
    topology: string,
    traceContext?: TraceContext,
    tags?: Record<string, string>
  ): TraceContext {
    const context = traceContext || this.startTrace('swarm_operation');
    const spanContext = this.startSpan(context, `swarm.${operation}`, {
      service: 'swarm.coordinator',
      tags: {
        'swarm.id': swarmId,
        'swarm.topology': topology,
        'swarm.operation': operation,
        ...tags
      }
    });

    return spanContext;
  }

  public traceWebSocketOperation(
    operation: string,
    socketId: string,
    traceContext?: TraceContext,
    tags?: Record<string, string>
  ): TraceContext {
    const context = traceContext || this.startTrace('websocket_operation');
    const spanContext = this.startSpan(context, `websocket.${operation}`, {
      service: 'websocket.manager',
      tags: {
        'websocket.operation': operation,
        'websocket.socket_id': socketId,
        ...tags
      }
    });

    return spanContext;
  }

  public traceAPIOperation(
    method: string,
    route: string,
    traceContext?: TraceContext,
    tags?: Record<string, string>
  ): TraceContext {
    const context = traceContext || this.startTrace('api_operation');
    const spanContext = this.startSpan(context, `api.${method.toLowerCase()}`, {
      service: 'api.gateway',
      tags: {
        'http.method': method,
        'http.route': route,
        ...tags
      }
    });

    return spanContext;
  }

  // Cross-Service Tracing
  public createCrossServiceTrace(
    serviceName: string,
    operation: string,
    targetService: string,
    traceContext?: TraceContext
  ): { context: TraceContext; headers: Record<string, string> } {
    const context = traceContext || this.startTrace('cross_service_call');
    const spanContext = this.startSpan(context, `call.${targetService}`, {
      service: serviceName,
      tags: {
        'target.service': targetService,
        'call.operation': operation
      }
    });

    const headers: Record<string, string> = {};
    this.injectTraceContext(spanContext, headers);

    return { context: spanContext, headers };
  }

  // Trace Analysis
  public getActiveTraces(): DistributedTrace[] {
    return Array.from(this.activeTraces.values());
  }

  public getTrace(traceId: string): DistributedTrace | undefined {
    return this.activeTraces.get(traceId);
  }

  public getServiceDependencies(): Map<string, Set<string>> {
    const dependencies = new Map<string, Set<string>>();

    for (const trace of this.activeTraces.values()) {
      for (const [service, deps] of trace.serviceMap) {
        if (!dependencies.has(service)) {
          dependencies.set(service, new Set());
        }
        for (const dep of deps) {
          dependencies.get(service)!.add(dep);
        }
      }
    }

    return dependencies;
  }

  public getTraceStatistics(): {
    totalTraces: number;
    activeSpans: number;
    averageTraceDuration: number;
    errorRate: number;
  } {
    const traces = Array.from(this.activeTraces.values());
    const completedTraces = traces.filter(t => t.endTime);
    const totalSpans = traces.reduce((sum, t) => sum + t.spans.length, 0);
    const errorSpans = traces.reduce((sum, t) =>
      sum + t.spans.filter(s => s.status === 'error').length, 0);

    return {
      totalTraces: traces.length,
      activeSpans: this.activeSpans.size,
      averageTraceDuration: completedTraces.length > 0
        ? completedTraces.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTraces.length
        : 0,
      errorRate: totalSpans > 0 ? errorSpans / totalSpans : 0
    };
  }

  // Private Methods
  private createSpan(
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    operationName: string,
    serviceName: string,
    tags?: Record<string, string>
  ): void {
    const span: TraceSpan = {
      spanId,
      parentSpanId,
      operationName,
      serviceName,
      startTime: Date.now(),
      tags: tags || {},
      logs: [],
      status: 'ok'
    };

    this.activeSpans.set(spanId, span);

    // Add to trace
    if (!this.activeTraces.has(traceId)) {
      this.activeTraces.set(traceId, {
        traceId,
        spans: [],
        startTime: Date.now(),
        serviceMap: new Map()
      });
    }

    const trace = this.activeTraces.get(traceId)!;
    trace.spans.push(span);

    // Update service map
    if (!trace.serviceMap.has(serviceName)) {
      trace.serviceMap.set(serviceName, new Set());
    }

    if (parentSpanId) {
      const parentSpan = this.activeSpans.get(parentSpanId);
      if (parentSpan && parentSpan.serviceName !== serviceName) {
        trace.serviceMap.get(parentSpan.serviceName)!.add(serviceName);
      }
    }
  }

  private addLog(spanId: string, level: string, message: string, fields?: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        level,
        message,
        fields
      });
    }
  }

  private sendSpanToCollectors(span: TraceSpan): void {
    // Send to DataDog
    if (this.dataDogCollector) {
      const dataDogSpanId = this.dataDogCollector.startSpan(
        span.operationName,
        span.parentSpanId,
        span.tags
      );

      setTimeout(() => {
        this.dataDogCollector!.finishSpan(dataDogSpanId, span.tags);
      }, 0);
    }

    // Send to New Relic
    if (this.newRelicCollector) {
      // New Relic integration would go here
      this.logger.debug('Would send span to New Relic', {
        spanId: span.spanId,
        operation: span.operationName,
        duration: span.duration
      });
    }
  }

  private extractBaggage(headers: Record<string, string>): Record<string, string> {
    const baggage: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (key.startsWith('baggage-')) {
        baggage[key.substring(8)] = value;
      }
    }

    return baggage;
  }

  private injectBaggage(baggage: Record<string, string>, headers: Record<string, string>): void {
    for (const [key, value] of Object.entries(baggage)) {
      headers[`baggage-${key}`] = value;
    }
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private generateSpanId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Cleanup
  public cleanup(): void {
    // Finish any orphaned spans
    for (const [spanId, span] of this.activeSpans) {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.status = 'cancelled';
      span.tags['cleanup.reason'] = 'orphaned_span';

      this.sendSpanToCollectors(span);
    }

    this.activeSpans.clear();
    this.activeTraces.clear();
  }

  // Health Check
  public healthCheck(): { status: string; details: any } {
    const stats = this.getTraceStatistics();

    return {
      status: 'healthy',
      details: {
        activeTraces: stats.totalTraces,
        activeSpans: stats.activeSpans,
        averageDuration: stats.averageTraceDuration,
        errorRate: stats.errorRate,
        samplingRate: this.samplingRate,
        collectors: {
          dataDog: !!this.dataDogCollector,
          newRelic: !!this.newRelicCollector
        }
      }
    };
  }
}

export function createDistributedTracer(
  dataDogCollector?: DataDogCollector,
  newRelicCollector?: NewRelicCollector,
  options?: { samplingRate?: number }
): DistributedTracer {
  return new DistributedTracer(dataDogCollector, newRelicCollector, options);
}