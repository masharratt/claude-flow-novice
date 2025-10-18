import { createClient, RedisClientType } from 'redis';
import { Decision, CFNContext, Violation } from './validation-rules.js';

export interface Correction {
  coordinatorId: string;
  originalDecision: Decision;
  violations: Violation[];
  correctedDecision: Decision;
  timestamp: number;
  source?: string;
}

export class CorrectionPublisher {
  private redis: RedisClientType;
  private connected: boolean = false;

  constructor(private redisUrl: string = 'redis://localhost:6379') {
    this.redis = createClient({ url: this.redisUrl });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.redis.connect();
      this.connected = true;
    }
  }

  async publishCorrection(correction: Correction): Promise<void> {
    await this.connect();

    const channel = `cfn:coordinator:${correction.coordinatorId}:corrections`;

    const enrichedCorrection: Correction = {
      ...correction,
      source: 'CFNComplianceMonitor',
      severity: this.calculateSeverity(correction.violations)
    };

    await this.redis.publish(channel, JSON.stringify(enrichedCorrection));

    // Publish to global corrections channel for monitoring
    await this.redis.publish(
      'cfn:all:corrections',
      JSON.stringify({
        ...enrichedCorrection,
        coordinatorId: correction.coordinatorId
      })
    );

    console.log('Correction Published:', {
      coordinatorId: correction.coordinatorId,
      violations: correction.violations.length,
      severity: enrichedCorrection.severity
    });
  }

  private calculateSeverity(
    violations: Violation[]
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (violations.some((v) => v.priority === 'critical')) {
      return 'critical';
    }
    if (violations.some((v) => v.priority === 'high')) {
      return 'high';
    }
    if (violations.some((v) => v.priority === 'medium')) {
      return 'medium';
    }
    return 'low';
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.quit();
      this.connected = false;
    }
  }
}

// Utility function for direct corrections without instantiation
export async function publishCorrection(
  coordinatorId: string,
  correction: Correction,
  redisUrl: string = 'redis://localhost:6379'
): Promise<void> {
  const publisher = new CorrectionPublisher(redisUrl);
  await publisher.connect();
  try {
    await publisher.publishCorrection({
      ...correction,
      coordinatorId
    });
  } finally {
    await publisher.disconnect();
  }
}