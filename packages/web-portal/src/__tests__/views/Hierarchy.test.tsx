/**
 * Hierarchy View Unit Tests
 *
 * Tests tree rendering, node expansion/collapse, details drawer, export functionality,
 * and real-time hierarchy updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../utils/test-utils';
import { server, addHandler } from '../mocks/api';
import { App } from '../../client/App';
import {
  mockHierarchyTree,
  mockHierarchyResponse,
  mockFlatHierarchy,
  mockHierarchyCSV,
  mockWebSocketHierarchyUpdate,
} from '../fixtures/hierarchy-fixtures';

describe('Hierarchy View', () => {
  beforeEach(() => {
    localStorage.clear();
    addHandler(
      http.get('/agents/hierarchy', () => {
        return HttpResponse.json({
          success: true,
          data: mockHierarchyResponse,
        });
      })
    );
  });

  describe('Tree Rendering', () => {
    it('should render hierarchy tree structure', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/hierarchy/i)).toBeInTheDocument();
      });

      // Check root nodes are visible
      expect(screen.getByText('Main Coordinator')).toBeInTheDocument();
      expect(screen.getByText('Backend Developer')).toBeInTheDocument();
    });

    it('should display agent count and topology info', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/6 agents/i)).toBeInTheDocument();
        expect(screen.getByText(/hierarchical/i)).toBeInTheDocument();
      });
    });

    it('should render parent-child connections with lines', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      // Check for tree connection elements
      const treeLines = screen.getAllByTestId(/tree-line|connection-line/i);
      expect(treeLines.length).toBeGreaterThan(0);
    });

    it('should display depth indicators for nested nodes', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      // Check indentation/depth levels
      const agent002 = screen.getByText('Security Specialist').closest('[data-depth]');
      expect(agent002).toHaveAttribute('data-depth', '2');
    });

    it('should show expand/collapse icons for nodes with children', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const expandIcons = screen.getAllByLabelText(/expand|collapse/i);
      expect(expandIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Node Expansion/Collapse', () => {
    it('should expand node to show children on click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      // Initially children might be collapsed
      const expandButton = screen.getAllByLabelText(/expand/i)[0];
      await user.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('Primary Coder')).toBeInTheDocument();
      });
    });

    it('should collapse node to hide children', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const collapseButton = screen.getByLabelText(/collapse.*coordinator/i);
      await user.click(collapseButton);

      await waitFor(() => {
        expect(screen.queryByText('Primary Coder')).not.toBeInTheDocument();
      });
    });

    it('should expand all nodes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const expandAllButton = screen.getByRole('button', { name: /expand all/i });
      await user.click(expandAllButton);

      await waitFor(() => {
        expect(screen.getByText('Security Specialist')).toBeInTheDocument();
        expect(screen.getByText('Test Engineer')).toBeInTheDocument();
      });
    });

    it('should collapse all nodes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Security Specialist/i)).toBeInTheDocument();
      });

      const collapseAllButton = screen.getByRole('button', { name: /collapse all/i });
      await user.click(collapseAllButton);

      await waitFor(() => {
        expect(screen.queryByText('Primary Coder')).not.toBeInTheDocument();
      });
    });

    it('should persist expand/collapse state', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const collapseButton = screen.getByLabelText(/collapse.*coordinator/i);
      await user.click(collapseButton);

      // Verify state is saved
      expect(localStorage.getItem('hierarchy-expanded-nodes')).toBeTruthy();
    });
  });

  describe('Node Selection and Details', () => {
    it('should open details drawer on node click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const node = screen.getByText('Primary Coder');
      await user.click(node);

      await waitFor(() => {
        const drawer = screen.getByRole('complementary');
        expect(drawer).toBeInTheDocument();
        expect(within(drawer).getByText(/agent details/i)).toBeInTheDocument();
      });
    });

    it('should display agent info in details panel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const node = screen.getByText('Primary Coder');
      await user.click(node);

      await waitFor(() => {
        const drawer = screen.getByRole('complementary');
        expect(within(drawer).getByText('agent-001')).toBeInTheDocument();
        expect(within(drawer).getByText(/coder/i)).toBeInTheDocument();
        expect(within(drawer).getByText(/active/i)).toBeInTheDocument();
      });
    });

    it('should show children list in details panel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const node = screen.getByText('Primary Coder');
      await user.click(node);

      await waitFor(() => {
        const drawer = screen.getByRole('complementary');
        expect(within(drawer).getByText(/children.*2/i)).toBeInTheDocument();
        expect(within(drawer).getByText('Security Specialist')).toBeInTheDocument();
        expect(within(drawer).getByText('Test Engineer')).toBeInTheDocument();
      });
    });

    it('should show parent link in details panel', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Security Specialist/i)).toBeInTheDocument();
      });

      const node = screen.getByText('Security Specialist');
      await user.click(node);

      await waitFor(() => {
        const drawer = screen.getByRole('complementary');
        expect(within(drawer).getByText(/parent/i)).toBeInTheDocument();
        expect(within(drawer).getByText('Primary Coder')).toBeInTheDocument();
      });
    });

    it('should navigate to parent on parent link click', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Security Specialist/i)).toBeInTheDocument();
      });

      const node = screen.getByText('Security Specialist');
      await user.click(node);

      await waitFor(() => {
        const drawer = screen.getByRole('complementary');
        const parentLink = within(drawer).getByRole('link', { name: /Primary Coder/i });
        await user.click(parentLink);
      });

      await waitFor(() => {
        const drawer = screen.getByRole('complementary');
        expect(within(drawer).getByText('agent-001')).toBeInTheDocument();
      });
    });

    it('should close details drawer', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Primary Coder/i)).toBeInTheDocument();
      });

      const node = screen.getByText('Primary Coder');
      await user.click(node);

      await waitFor(() => {
        const closeButton = screen.getByLabelText(/close|dismiss/i);
        await user.click(closeButton);
      });

      await waitFor(() => {
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      });
    });
  });

  describe('Export Functionality', () => {
    it('should export hierarchy as JSON', async () => {
      const user = userEvent.setup();
      const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      const jsonOption = screen.getByRole('menuitem', { name: /json/i });
      await user.click(jsonOption);

      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalled();
      });

      downloadSpy.mockRestore();
    });

    it('should export hierarchy as CSV', async () => {
      const user = userEvent.setup();
      const downloadSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      const csvOption = screen.getByRole('menuitem', { name: /csv/i });
      await user.click(csvOption);

      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalled();
      });

      downloadSpy.mockRestore();
    });

    it('should include all agent fields in CSV export', async () => {
      const user = userEvent.setup();
      let csvContent = '';

      const createObjectURL = vi.fn((blob: Blob) => {
        blob.text().then((text) => {
          csvContent = text;
        });
        return 'blob:mock';
      });
      global.URL.createObjectURL = createObjectURL;

      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      const csvOption = screen.getByRole('menuitem', { name: /csv/i });
      await user.click(csvOption);

      await waitFor(() => {
        expect(csvContent).toContain('ID,Name,Type,Status,Depth,Parent ID');
      });
    });

    it('should show export success notification', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      const jsonOption = screen.getByRole('menuitem', { name: /json/i });
      await user.click(jsonOption);

      await waitFor(() => {
        expect(screen.getByText(/exported successfully/i)).toBeInTheDocument();
      });
    });
  });

  describe('Filters and Search', () => {
    it('should filter hierarchy by agent status', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const statusFilter = screen.getByLabelText(/filter by status/i);
      await user.click(statusFilter);

      const activeOption = screen.getByRole('option', { name: /^active$/i });
      await user.click(activeOption);

      await waitFor(() => {
        expect(screen.getByText('Main Coordinator')).toBeInTheDocument();
        expect(screen.queryByText('Backend Developer')).not.toBeInTheDocument();
      });
    });

    it('should filter hierarchy by agent type', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const typeFilter = screen.getByLabelText(/filter by type/i);
      await user.click(typeFilter);

      const coderOption = screen.getByRole('option', { name: /coder/i });
      await user.click(coderOption);

      await waitFor(() => {
        expect(screen.getByText('Primary Coder')).toBeInTheDocument();
        expect(screen.queryByText('Main Coordinator')).not.toBeInTheDocument();
      });
    });

    it('should search hierarchy by agent name', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Security');

      await waitFor(() => {
        expect(screen.getByText('Security Specialist')).toBeInTheDocument();
        expect(screen.queryByText('Code Reviewer')).not.toBeInTheDocument();
      });
    });
  });

  describe('Real-Time Updates', () => {
    it('should add new agent to hierarchy via WebSocket', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify(mockWebSocketHierarchyUpdate),
        })
      );

      await waitFor(() => {
        expect(screen.getByText('New Agent')).toBeInTheDocument();
      });
    });

    it('should update agent status in hierarchy', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Test Engineer/i)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'hierarchy:change',
            data: {
              action: 'agent_updated',
              agent: {
                id: 'agent-003',
                status: 'completed',
              },
            },
          }),
        })
      );

      await waitFor(() => {
        const testEngineerNode = screen.getByText('Test Engineer').closest('[data-status]');
        expect(testEngineerNode).toHaveAttribute('data-status', 'completed');
      });
    });

    it('should remove terminated agent from hierarchy', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Backend Developer/i)).toBeInTheDocument();
      });

      window.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'hierarchy:change',
            data: {
              action: 'agent_terminated',
              agent_id: 'agent-005',
            },
          }),
        })
      );

      await waitFor(() => {
        expect(screen.queryByText('Backend Developer')).not.toBeInTheDocument();
      });
    });

    it('should handle WebSocket connection errors', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/Main Coordinator/i)).toBeInTheDocument();
      });

      window.dispatchEvent(new Event('close'));

      await waitFor(() => {
        expect(screen.getByText(/disconnected|connection lost/i)).toBeInTheDocument();
      });
    });
  });
});
