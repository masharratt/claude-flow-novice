// src/cfn-loop/cfn-compliance-monitor.ts
import { createClient, RedisClientType } from 'redis';
import { validateCFNDecision } from './validate-cfn-decision.js';
import { publishCorrection } from './correction-publisher.js';
import { Decision, CFNContext, Violation } from './validation-rules.js';

export interface MonitorConfig {
  redisUrl?: string;
  logPath?: string;
  autoCorrect?: boolean;
  maxViolationHistory?: number;
}

export class CFNComplianceMonitor {
  private redis: RedisClientType;
  private subscriber: RedisClientType;
  private violationLog: Violation[] = [];

  constructor(private config: MonitorConfig = {}) {
    const defaultConfig = {
      redisUrl: 'redis://localhost:6379',
      logPath: '.artifacts/cfn-loop-violations.log',
      autoCorrect: true,
      maxViolationHistory: 100
    };
    this.config = { ...defaultConfig, ...config };

    this.redis = createClient({ url: this.config.redisUrl });
    this.subscriber = createClient({ url: this.config.redisUrl });
  }

  async start(): Promise<void> {
    await this.redis.connect();
    await this.subscriber.connect();

    // Subscribe to coordinator decision channels
    const channels = [
      'cfn:coordinator:*:decisions',
      'cfn:phase:*:decisions'
    ];

    await this.subscriber.pSubscribe(
      channels.join(','),
      async (message, channel) => {
        try {
          const decision = JSON.parse(message) as Decision;
          const context = decision.context as CFNContext;
          await this.handleDecision(decision, context, channel);
        } catch (error) {
          console.error('Error processing decision:', error);
        }
      }
    );

    console.log('CFN Compliance Monitor started');
  }

  private async handleDecision(
    decision: Decision,
    context: CFNContext,
    channel: string
  ): Promise<void> {
    const coordinatorId = this.extractCoordinatorId(channel);

    const validation = await validateCFNDecision(decision, context);

    if (!validation.valid) {
      const violation: Violation = {
        rule: validation.violations[0]?.rule || 'Unknown Violation',
        description: validation.violations[0]?.description || 'Unspecified violation',
        coordinatorId,
        timestamp: Date.now(),
        priority: 'critical'
      };

      // Log violation
      this.logViolation(violation);

      // Auto-correct if enabled
      if (this.config.autoCorrect) {
        await publishCorrection(coordinatorId, {
          originalDecision: decision,
          violations: validation.violations,
          correctedDecision: validation.decision,
          timestamp: Date.now()
        });
      }
    }
  }

  private extractCoordinatorId(channel: string): string {
    const match = channel.match(/coordinator:([^:]+)/);
    return match ? match[1] : 'unknown';
  }

  private logViolation(violation: Violation): void {
    if (this.violationLog.length >= (this.config.maxViolationHistory || 100)) {
      this.violationLog.shift(); // Remove oldest violation
    }

    this.violationLog.push(violation);

    // Optional: Persist to file/database if needed
    // This can be expanded to use SQLite memory system
    console.warn('CFN Violation Detected:', violation);
  }

  async getViolations(coordinatorId?: string): Promise<Violation[]> {
    if (coordinatorId) {
      return this.violationLog.filter(v => v.coordinatorId === coordinatorId);
    }
    return this.violationLog;
  }

  async stop(): Promise<void> {
    await this.subscriber.quit();
    await this.redis.quit();
  }
}