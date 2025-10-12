/**
 * Playwright Global Setup - Initialize Zustand stores and mock WebSocket
 * This runs ONCE before all E2E tests to populate stores and disable WebSocket
 */

import { chromium, FullConfig } from '@playwright/test';
import { mockEventsLarge } from '../fixtures/events-fixtures';
import { mockCFNPhasesBasic, mockCFNLoopMetricsStandard, mockLoop3ProgressAboveGate, mockLoop2ProgressAboveConsensus } from '../fixtures/cfn-loop-fixtures';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to base URL
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3001';

  // Mock WebSocket BEFORE page loads to prevent connection attempts
  await page.route('**/socket.io/**', route => route.abort());

  await page.goto(baseURL);

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // Initialize stores via browser console with fixture data
  await page.evaluate(({ events, phases, metrics, loop3Progress, loop2Progress }) => {
    // Initialize Events Store
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

    // Set agents in localStorage with proper TTL format
    const agentStoreData = {
      state: {
        agents: mockAgents,
        selectedAgentId: null,
      },
      timestamp: Date.now(),
    };
    localStorage.setItem('agent-store', JSON.stringify(agentStoreData));

    // Set events directly (no persistence for events store - live data only)
    // Events will be added via component initialization

    // Set CFN Loop store data
    const cfnLoopStoreData = {
      state: {
        currentLoopNumber: 3,
        currentPhaseName: 'Sprint 3.3',
        phases,
        metrics,
      },
      timestamp: Date.now(),
    };
    localStorage.setItem('cfn-loop-store', JSON.stringify(cfnLoopStoreData));

    console.log('[E2E Setup] Stores initialized with fixture data');
  }, {
    events: mockEventsLarge,
    phases: mockCFNPhasesBasic,
    metrics: mockCFNLoopMetricsStandard,
    loop3Progress: mockLoop3ProgressAboveGate,
    loop2Progress: mockLoop2ProgressAboveConsensus,
  });

  await browser.close();
}

export default globalSetup;
