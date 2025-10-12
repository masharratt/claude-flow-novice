/**
 * E2E Test Helpers - Initialize stores with fixture data before tests
 */

import { Page } from '@playwright/test';
import { mockEventsLarge } from '../fixtures/events-fixtures';
import { mockCFNPhasesBasic, mockCFNLoopMetricsStandard } from '../fixtures/cfn-loop-fixtures';

/**
 * Initialize all Zustand stores with fixture data
 * Call this AFTER page loads to directly inject data into stores
 *
 * This uses the stores exposed on window object for E2E testing
 */
export async function initializeStores(page: Page) {
  await page.evaluate(({ phases, metrics }) => {
    // Generate mock agents
    const mockAgents = Array.from({ length: 20 }, (_, i) => ({
      id: `agent-${String(i).padStart(3, '0')}`,
      name: `Agent ${i}`,
      type: ['coder', 'tester', 'reviewer', 'security'][i % 4],
      status: ['idle', 'active', 'paused', 'completed'][i % 4] as 'idle' | 'active' | 'paused' | 'completed',
      createdAt: Date.now() - i * 60000,
      updatedAt: Date.now(),
      metrics: {
        tasksCompleted: i + 1,
        confidence: 0.7 + (i * 0.01),
        errorRate: 0.05,
      },
      metadata: {
        swarmId: `swarm-${String(Math.floor(i / 5) + 1).padStart(3, '0')}`,
      },
    }));

    // Directly call store setState methods (stores are exposed on window for E2E)
    const cfnLoopStore = (window as any).__cfnLoopStore;
    if (cfnLoopStore) {
      const state = cfnLoopStore.getState();

      // Set all CFN Loop data at once
      cfnLoopStore.setState({
        currentLoopNumber: 3,
        currentPhaseName: 'Sprint 3.3',
        validators: 4,
        phases,
        metrics,
        validatorResults: [],
        loop3Progress: 0.85, // Above gate threshold (0.75)
        loop2Progress: 0.92, // Above consensus threshold (0.90)
        loading: false,
        error: null,
      });

      console.log('[E2E Test Helper] CFN Loop store updated:', {
        phases: phases.length,
        loop3Progress: 0.85,
        loop2Progress: 0.92,
      });
    } else {
      console.error('[E2E Test Helper] CFN Loop store not found on window');
    }

    const agentStore = (window as any).__agentStore;
    if (agentStore) {
      agentStore.setState({
        agents: mockAgents,
        selectedAgentId: null,
        hierarchy: null,
        loading: false,
        error: null,
      });

      console.log('[E2E Test Helper] Agent store updated:', {
        agents: mockAgents.length,
      });
    } else {
      console.error('[E2E Test Helper] Agent store not found on window');
    }
  }, {
    phases: mockCFNPhasesBasic,
    metrics: mockCFNLoopMetricsStandard,
  });
}

/**
 * Initialize Events Store specifically (no persistence, uses direct store injection)
 */
export async function initializeEventsStore(page: Page) {
  await page.evaluate((events) => {
    const eventsStore = (window as any).__eventsStore;
    if (eventsStore) {
      // Clear existing events and add fixture data
      eventsStore.getState().reset();
      eventsStore.getState().addEvents(events);

      console.log('[E2E Test Helper] Events store updated:', {
        events: events.length,
      });
    } else {
      console.error('[E2E Test Helper] Events store not found on window');

      // Fallback: Store events in sessionStorage (component reads this)
      sessionStorage.setItem('e2e-test-events', JSON.stringify(events));
      console.log('[E2E Test Helper] Events stored in sessionStorage (fallback):', events.length);
    }
  }, mockEventsLarge);
}

/**
 * Wait for store hydration to complete
 */
export async function waitForStoreHydration(page: Page) {
  await page.waitForFunction(() => {
    const agentStore = localStorage.getItem('agent-store');
    const cfnLoopStore = localStorage.getItem('cfn-loop-store');
    return agentStore !== null && cfnLoopStore !== null;
  });
}
