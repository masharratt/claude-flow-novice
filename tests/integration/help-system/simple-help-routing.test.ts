/**
 * Simple integration test for help request routing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MessageBroker } from '../../../src/coordination/v2/core/message-broker.js';
import { HelpCoordinator } from '../../../src/coordination/v2/help-system/help-coordinator.js';
import {
  HelpRequestHandler
} from '../../../src/coordination/v2/help-system/help-request-handler.js';
import { HelpRequestPriority } from '../../../src/coordination/v2/help-system/help-request.js';
import { AgentProfile } from '../../../src/coordination/v2/help-system/help-matcher.js';
import { AgentState } from '../../../src/coordination/v2/core/agent-state.js';

describe('Simple Help Routing Test', () => {
  let broker: MessageBroker;
  let coordinator: HelpCoordinator;
  let handler: HelpRequestHandler;

  beforeEach(async () => {
    broker = new MessageBroker();
    coordinator = new HelpCoordinator({ messageBroker: broker });
    handler = new HelpRequestHandler({ broker, coordinator });

    // Register a test agent
    const profile: AgentProfile = {
      agentId: 'test-helper',
      state: AgentState.IDLE,
      capabilities: [
        { name: 'testing', proficiency: 0.9 }
      ],
      workload: 0.1,
      lastActive: new Date()
    };

    handler.registerAgent(profile);
    await handler.start();
  });

  afterEach(async () => {
    await handler.stop();
    await broker.shutdown(1000);
  });

  it('should route a simple help request', async () => {
    const requestPayload = {
      requesterId: 'test-requester',
      description: 'Need testing help',
      capabilities: [
        { capability: 'testing', required: true }
      ],
      priority: HelpRequestPriority.HIGH
    };

    console.log('[TEST] Sending request...');

    try {
      const reply = await broker.request(
        'help.request.HIGH',
        requestPayload,
        { timeout: 10000 }
      );

      console.log('[TEST] Received reply:', JSON.stringify(reply, null, 2));

      expect(reply).toBeDefined();
      expect(reply.success).toBe(true);
      expect(reply.payload).toBeDefined();
      expect(reply.payload.requestId).toBeDefined();
    } catch (error) {
      console.error('[TEST] Request failed:', error);
      throw error;
    }
  }, 15000);

  it('should handle multiple concurrent requests', async () => {
    const requests = [];

    for (let i = 0; i < 3; i++) {
      const request = broker.request(
        'help.request.NORMAL',
        {
          requesterId: `requester-${i}`,
          description: `Test request ${i}`,
          capabilities: [{ capability: 'testing', required: true }],
          priority: HelpRequestPriority.NORMAL
        },
        { timeout: 10000 }
      );
      requests.push(request);
    }

    const replies = await Promise.all(requests);

    replies.forEach((reply, i) => {
      console.log(`[TEST] Reply ${i}:`, reply?.success);
      expect(reply).toBeDefined();
      expect(reply.success).toBe(true);
    });
  }, 20000);
});
