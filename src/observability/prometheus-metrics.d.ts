/**
 * Type definitions for Prometheus metrics module
 */

import { Histogram } from 'prom-client';

export const blockingDurationSeconds: Histogram<'swarm_id' | 'coordinator_id' | 'status'>;
export const signalDeliveryLatencySeconds: Histogram<'sender_id' | 'receiver_id' | 'signal_type'>;
export const heartbeatFailuresTotal: any;
export const timeoutEventsTotal: any;

export class PrometheusMetrics {
  constructor(config: { redis?: any; logger?: any });
  collectMetrics(): Promise<void>;
  recordBlockingDuration(swarmId: string, coordinatorId: string, durationMs: number, status: string): void;
  recordSignalLatency(senderId: string, receiverId: string, signalType: string, latencyMs: number): void;
  incrementHeartbeatFailure(coordinatorId: string, failureType: string): void;
  incrementTimeoutEvent(coordinatorId: string, timeoutType: string): void;
  getMetrics(): Promise<string>;
  resetMetrics(): void;
}
