/**
 * Agents View Unit Tests
 *
 * Tests agent list/grid display, search, filters, spawn modal, terminate dialog,
 * and real-time WebSocket updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../utils/test-utils';
import { server, addHandler } from '../mocks/api';
import { App } from '../../client/App';
import {
  mockAgentsList,
  mockAgentTypes,
  mockAgentStatuses,
  mockCapabilities,
  mockAgentSpawnResponse,
  mockWebSocketAgentUpdate,
} from '../fixtures/agents-fixtures';

describe('Agents View', () => {
  beforeEach(() => {
    localStorage.clear();
    addHandler(
      http.get('/api/agents', () => {
        return HttpResponse.json({
          success: true,
          data: mockAgentsList,
          total: mockAgentsList.length,
        });
      })
    );
  });

  describe('Agent List Rendering', () => {
    it('should render agent list in default list view', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/agents/i)).toBeInTheDocument();
      });

      // Verify agents are rendered
      expect(screen.getByText('Primary Coder')).toBeInTheDocument();
      expect(screen.getByText('Security Specialist')).toBeInTheDocument();
      expect(screen.getByText('Test Engineer')).toBeInTheDocument();
    });

    it('should display agent status badges correctly', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/active/i)).toBeInTheDocument();
      });

      // Check all status types are displayed
      expect(screen.getAllByText(/active/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/in_progress|in progress/i)).toBeInTheDocument();
      expect(screen.getByText(/idle/i)).toBeInTheDocument();
    });

    it('should display agent metadata (tasks completed, confidence)', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Check metadata is visible
      expect(screen.getByText(/12/)).toBeInTheDocument(); // tasks_completed
      expect(screen.getByText(/0.92|92%/i)).toBeInTheDocument(); // confidence
    });

    it('should display agent capabilities as chips/tags', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/coding/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/testing/i)).toBeInTheDocument();
      expect(screen.getByText(/security/i)).toBeInTheDocument();
    });

    it('should show current task for in-progress agents', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Writing unit tests/i)).toBeInTheDocument();
      });
    });
  });

  describe('List/Grid Toggle', () => {
    it('should toggle between list and grid view', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Find view toggle button
      const gridButton = screen.getByLabelText(/grid view|view as grid/i);
      await user.click(gridButton);

      // Verify grid layout is applied (check for grid container class/attribute)
      const agentContainer = screen.getByTestId('agents-container');
      expect(agentContainer).toHaveAttribute('data-view', 'grid');
    });

    it('should persist view mode preference', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Toggle to grid
      const gridButton = screen.getByLabelText(/grid view/i);
      await user.click(gridButton);

      // Verify localStorage is updated
      expect(localStorage.getItem('agents-view-mode')).toBe('grid');
    });

    it('should display agents in grid cards with images/icons', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Toggle to grid
      const gridButton = screen.getByLabelText(/grid view/i);
      await user.click(gridButton);

      // Check for agent cards
      const cards = screen.getAllByTestId(/agent-card/i);
      expect(cards.length).toBe(mockAgentsList.length);
    });
  });

  describe('Search Functionality', () => {
    it('should filter agents by name search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'Security');

      // Should show only Security Specialist
      await waitFor(() => {
        expect(screen.getByText('Security Specialist')).toBeInTheDocument();
        expect(screen.queryByText('Primary Coder')).not.toBeInTheDocument();
      });
    });

    it('should filter agents by type search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'tester');

      await waitFor(() => {
        expect(screen.getByText('Test Engineer')).toBeInTheDocument();
        expect(screen.queryByText('Security Specialist')).not.toBeInTheDocument();
      });
    });

    it('should filter agents by capability search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'e2e-testing');

      await waitFor(() => {
        expect(screen.getByText('Test Engineer')).toBeInTheDocument();
      });
    });

    it('should show no results message for invalid search', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'NonexistentAgent123');

      await waitFor(() => {
        expect(screen.getByText(/no agents found/i)).toBeInTheDocument();
      });
    });

    it('should clear search on clear button click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search agents/i);
      await user.type(searchInput, 'Security');

      const clearButton = screen.getByLabelText(/clear search/i);
      await user.click(clearButton);

      expect(searchInput).toHaveValue('');
      expect(screen.getByText('Primary Coder')).toBeInTheDocument();
    });
  });

  describe('Filter Controls', () => {
    it('should filter agents by status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Open status filter
      const statusFilter = screen.getByLabelText(/filter by status/i);
      await user.click(statusFilter);

      // Select "idle"
      const idleOption = screen.getByRole('option', { name: /idle/i });
      await user.click(idleOption);

      await waitFor(() => {
        expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
        expect(screen.queryByText('Primary Coder')).not.toBeInTheDocument();
      });
    });

    it('should filter agents by type', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const typeFilter = screen.getByLabelText(/filter by type/i);
      await user.click(typeFilter);

      const testerOption = screen.getByRole('option', { name: /tester/i });
      await user.click(testerOption);

      await waitFor(() => {
        expect(screen.getByText('Test Engineer')).toBeInTheDocument();
        expect(screen.queryByText('Security Specialist')).not.toBeInTheDocument();
      });
    });

    it('should filter agents by multiple capabilities', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const capabilitiesFilter = screen.getByLabelText(/filter by capabilities/i);
      await user.click(capabilitiesFilter);

      // Select multiple capabilities
      const codingCheckbox = screen.getByRole('checkbox', { name: /coding/i });
      const testingCheckbox = screen.getByRole('checkbox', { name: /testing/i });

      await user.click(codingCheckbox);
      await user.click(testingCheckbox);

      await waitFor(() => {
        // Should show agents with either coding OR testing
        expect(screen.getByText('Primary Coder')).toBeInTheDocument();
        expect(screen.getByText('Test Engineer')).toBeInTheDocument();
      });
    });

    it('should reset all filters', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Apply filters
      const statusFilter = screen.getByLabelText(/filter by status/i);
      await user.click(statusFilter);
      const activeOption = screen.getByRole('option', { name: /^active$/i });
      await user.click(activeOption);

      // Reset filters
      const resetButton = screen.getByLabelText(/reset filters|clear all/i);
      await user.click(resetButton);

      await waitFor(() => {
        // All agents should be visible
        expect(screen.getByText('Primary Coder')).toBeInTheDocument();
        expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
        expect(screen.getByText('Backend Developer')).toBeInTheDocument();
      });
    });

    it('should show filter count badge', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText(/filter by status/i);
      await user.click(statusFilter);
      const activeOption = screen.getByRole('option', { name: /^active$/i });
      await user.click(activeOption);

      // Check filter badge
      const filterBadge = screen.getByTestId('filter-count');
      expect(filterBadge).toHaveTextContent('1');
    });
  });

  describe('Spawn Agent Modal', () => {
    it('should open spawn agent modal on button click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const spawnButton = screen.getByRole('button', { name: /spawn agent|new agent/i });
      await user.click(spawnButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/spawn new agent/i)).toBeInTheDocument();
      });
    });

    it('should validate agent type selection', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const spawnButton = screen.getByRole('button', { name: /spawn agent/i });
      await user.click(spawnButton);

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /spawn|create/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/agent type is required/i)).toBeInTheDocument();
      });
    });

    it('should validate agent name input', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const spawnButton = screen.getByRole('button', { name: /spawn agent/i });
      await user.click(spawnButton);

      const nameInput = screen.getByLabelText(/agent name/i);
      await user.type(nameInput, 'ab'); // Too short

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /spawn/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/name must be at least 3 characters/i)).toBeInTheDocument();
      });
    });

    it('should allow selecting multiple capabilities', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const spawnButton = screen.getByRole('button', { name: /spawn agent/i });
      await user.click(spawnButton);

      const capabilitiesSelect = screen.getByLabelText(/capabilities/i);
      await user.click(capabilitiesSelect);

      const codingCheckbox = screen.getByRole('checkbox', { name: /coding/i });
      const testingCheckbox = screen.getByRole('checkbox', { name: /testing/i });

      await user.click(codingCheckbox);
      await user.click(testingCheckbox);

      expect(codingCheckbox).toBeChecked();
      expect(testingCheckbox).toBeChecked();
    });

    it('should submit spawn request successfully', async () => {
      const user = userEvent.setup();

      addHandler(
        http.post('/api/agents', async ({ request }) => {
          const body = await request.json() as any;
          return HttpResponse.json({
            success: true,
            data: { ...mockAgentSpawnResponse, ...body },
          }, { status: 201 });
        })
      );

      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const spawnButton = screen.getByRole('button', { name: /spawn agent/i });
      await user.click(spawnButton);

      const typeSelect = screen.getByLabelText(/agent type/i);
      await user.click(typeSelect);
      const coderOption = screen.getByRole('option', { name: /coder/i });
      await user.click(coderOption);

      const nameInput = screen.getByLabelText(/agent name/i);
      await user.type(nameInput, 'New Test Agent');

      const submitButton = within(screen.getByRole('dialog')).getByRole('button', { name: /spawn/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/agent spawned successfully/i)).toBeInTheDocument();
      });
    });

    it('should close modal on cancel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const spawnButton = screen.getByRole('button', { name: /spawn agent/i });
      await user.click(spawnButton);

      const cancelButton = within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Terminate Agent Dialog', () => {
    it('should open terminate confirmation dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const terminateButton = screen.getAllByLabelText(/terminate agent|delete agent/i)[0];
      await user.click(terminateButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/terminate agent|confirm termination/i)).toBeInTheDocument();
      });
    });

    it('should display agent details in confirmation dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const terminateButton = screen.getAllByLabelText(/terminate agent/i)[0];
      await user.click(terminateButton);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/Primary Coder/i)).toBeInTheDocument();
        expect(within(dialog).getByText(/agent-001/i)).toBeInTheDocument();
      });
    });

    it('should require termination reason', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const terminateButton = screen.getAllByLabelText(/terminate agent/i)[0];
      await user.click(terminateButton);

      const confirmButton = within(screen.getByRole('dialog')).getByRole('button', { name: /terminate|confirm/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/reason is required/i)).toBeInTheDocument();
      });
    });

    it('should terminate agent successfully', async () => {
      const user = userEvent.setup();

      addHandler(
        http.delete('/api/agents/:id', ({ params }) => {
          return HttpResponse.json({
            success: true,
            data: { id: params.id, status: 'terminated' },
          });
        })
      );

      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const terminateButton = screen.getAllByLabelText(/terminate agent/i)[0];
      await user.click(terminateButton);

      const reasonInput = screen.getByLabelText(/reason/i);
      await user.type(reasonInput, 'Task completed');

      const confirmButton = within(screen.getByRole('dialog')).getByRole('button', { name: /terminate/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/agent terminated successfully/i)).toBeInTheDocument();
      });
    });

    it('should cancel termination', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const terminateButton = screen.getAllByLabelText(/terminate agent/i)[0];
      await user.click(terminateButton);

      const cancelButton = within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Primary Coder')).toBeInTheDocument();
      });
    });
  });

  describe('Real-Time WebSocket Updates', () => {
    it('should update agent status via WebSocket', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Test Engineer/i)).toBeInTheDocument();
        expect(screen.getByText(/in_progress/i)).toBeInTheDocument();
      });

      // Simulate WebSocket event
      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketAgentUpdate),
        })
      );

      await waitFor(() => {
        expect(screen.getByText(/Running integration tests/i)).toBeInTheDocument();
        expect(screen.getByText(/0.82|82%/i)).toBeInTheDocument();
      });
    });

    it('should add newly spawned agent to list', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const initialCount = mockAgentsList.length;

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'agent:spawned',
            data: mockAgentSpawnResponse,
          }),
        })
      );

      await waitFor(() => {
        expect(screen.getByText('New Test Agent')).toBeInTheDocument();
      });
    });

    it('should remove terminated agent from list', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'agent:terminated',
            data: { agent_id: 'agent-001' },
          }),
        })
      );

      await waitFor(() => {
        expect(screen.queryByText('Primary Coder')).not.toBeInTheDocument();
      });
    });

    it('should handle WebSocket connection errors gracefully', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      // Simulate WebSocket disconnect
      window.dispatchEvent(new Event('close'));

      await waitFor(() => {
        expect(screen.getByText(/disconnected|connection lost/i)).toBeInTheDocument();
      });
    });
  });
});
